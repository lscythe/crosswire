package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"fmt"
	"net/http"
	"strings"

	"github.com/redis/go-redis/v9"
)

func NewRequestID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return fmt.Sprintf("%x", b)
}

func Middleware(conn *sql.DB, _ *redis.Client, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		value := r.Header.Get("Authorization")
		if !strings.HasPrefix(value, "Bearer cw_live_") || strings.ContainsAny(strings.TrimPrefix(value, "Bearer "), " \t\n") {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		key := strings.TrimPrefix(value, "Bearer ")
		hash := sha256.Sum256([]byte(key))
		var id string
		err := conn.QueryRowContext(r.Context(), `SELECT k.id FROM api_keys k JOIN users u ON u.id = k.user_id WHERE k.key_hash = $1 AND k.revoked_at IS NULL AND u.disabled_at IS NULL`, hash[:]).Scan(&id)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		// ponytail: last_used_at stays empty until the usage-event writer lands; no per-request write on the hot path.
		_ = id
		next.ServeHTTP(w, r)
	})
}
