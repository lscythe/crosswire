package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/lscythe/crosswire/services/gateway/internal/db"
	"github.com/lscythe/crosswire/services/gateway/internal/httpserver"
	"github.com/redis/go-redis/v9"
)

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	config, err := pgx.ParseConfig(os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	conn := stdlib.OpenDB(*config)
	defer conn.Close()
	if err := conn.PingContext(ctx); err != nil {
		log.Fatal(err)
	}
	migrationsDir := os.Getenv("MIGRATIONS_DIR")
	if migrationsDir == "" {
		migrationsDir = "../../db/migrations"
	}
	if err := db.RunMigrations(ctx, conn, os.DirFS(migrationsDir)); err != nil {
		log.Fatal(err)
	}
	options, err := redis.ParseURL(os.Getenv("VALKEY_URL"))
	if err != nil {
		log.Fatal(err)
	}
	cache := redis.NewClient(options)
	defer cache.Close()
	addr := os.Getenv("GATEWAY_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	log.Printf("gateway listening on %s", addr)
	if err := http.ListenAndServe(addr, httpserver.New(conn, cache)); err != nil {
		log.Fatal(err)
	}
}
