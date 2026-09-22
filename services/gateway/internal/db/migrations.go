package db

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"path/filepath"
	"sort"
	"strings"
)

type migration struct {
	name string
	body string
}

func RunMigrations(ctx context.Context, conn *sql.DB, files fs.FS) error {
	if _, err := conn.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		name text PRIMARY KEY,
		checksum text NOT NULL,
		applied_at timestamptz NOT NULL DEFAULT now()
	)`); err != nil {
		return fmt.Errorf("create migration table: %w", err)
	}

	migrations, err := loadMigrations(files)
	if err != nil {
		return err
	}
	for _, item := range migrations {
		checksum := sha256.Sum256([]byte(item.body))
		checksumText := hex.EncodeToString(checksum[:])
		var appliedChecksum string
		err := conn.QueryRowContext(ctx, "SELECT checksum FROM schema_migrations WHERE name = $1", item.name).Scan(&appliedChecksum)
		switch {
		case errors.Is(err, sql.ErrNoRows):
			tx, beginErr := conn.BeginTx(ctx, nil)
			if beginErr != nil {
				return fmt.Errorf("begin migration %s: %w", item.name, beginErr)
			}
			if _, execErr := tx.ExecContext(ctx, item.body); execErr != nil {
				_ = tx.Rollback()
				return fmt.Errorf("execute migration %s: %w", item.name, execErr)
			}
			if _, execErr := tx.ExecContext(ctx, "INSERT INTO schema_migrations(name, checksum) VALUES ($1, $2)", item.name, checksumText); execErr != nil {
				_ = tx.Rollback()
				return fmt.Errorf("record migration %s: %w", item.name, execErr)
			}
			if commitErr := tx.Commit(); commitErr != nil {
				return fmt.Errorf("commit migration %s: %w", item.name, commitErr)
			}
		case err != nil:
			return fmt.Errorf("check migration %s: %w", item.name, err)
		case appliedChecksum != checksumText:
			return fmt.Errorf("migration %s checksum changed", item.name)
		}
	}
	return nil
}

func loadMigrations(files fs.FS) ([]migration, error) {
	entries, err := fs.ReadDir(files, ".")
	if err != nil {
		return nil, fmt.Errorf("read migrations: %w", err)
	}
	var names []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".sql") {
			names = append(names, entry.Name())
		}
	}
	sort.Strings(names)
	result := make([]migration, 0, len(names))
	for _, name := range names {
		body, readErr := fs.ReadFile(files, filepath.ToSlash(name))
		if readErr != nil {
			return nil, fmt.Errorf("read migration %s: %w", name, readErr)
		}
		result = append(result, migration{name: name, body: string(body)})
	}
	return result, nil
}
