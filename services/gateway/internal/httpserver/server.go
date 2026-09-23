package httpserver

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/lscythe/crosswire/services/gateway/internal/auth"
	"github.com/redis/go-redis/v9"
)

func New(conn *sql.DB, cache *redis.Client) http.Handler {
	r := http.NewServeMux()
	r.HandleFunc("GET /health", health)
	r.HandleFunc("GET /ready", func(w http.ResponseWriter, req *http.Request) {
		ctx, cancel := context.WithTimeout(req.Context(), 2*time.Second)
		defer cancel()
		if conn.PingContext(ctx) != nil || cache.Ping(ctx).Err() != nil {
			http.Error(w, "unavailable", http.StatusServiceUnavailable)
			return
		}
		health(w, req)
	})
	r.Handle("GET /v1/models", auth.Middleware(conn, cache, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"object":"list","data":[]}`))
	})))
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		requestID := strings.TrimSpace(req.Header.Get("X-Request-ID"))
		if requestID == "" {
			requestID = auth.NewRequestID()
		}
		w.Header().Set("X-Request-ID", requestID)
		r.ServeHTTP(w, req)
	})
}

func health(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
