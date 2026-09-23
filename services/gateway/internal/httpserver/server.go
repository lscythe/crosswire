package httpserver

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/lscythe/crosswire/services/gateway/internal/auth"
	"github.com/lscythe/crosswire/services/gateway/internal/provider"
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
	chat := auth.Middleware(conn, cache, http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		started := time.Now()
		body, err := io.ReadAll(io.LimitReader(req.Body, 8<<20))
		if err != nil {
			http.Error(w, "invalid request", 400)
			return
		}
		var payload struct {
			Model  string `json:"model"`
			Stream bool   `json:"stream"`
		}
		if json.Unmarshal(body, &payload) != nil || payload.Model == "" {
			http.Error(w, "model is required", 400)
			return
		}
		routes, err := provider.LoadRoutes(req.Context(), conn, auth.UserID(req.Context()), payload.Model)
		if err != nil {
			http.Error(w, "routing unavailable", 503)
			return
		}
		if len(routes) == 0 {
			http.Error(w, "no route", 404)
			return
		}
		for _, route := range routes {
			var raw map[string]any
			if json.Unmarshal(body, &raw) != nil {
				http.Error(w, "invalid request", 400)
				return
			}
			raw["model"] = route.UpstreamModel
			forwardBody, _ := json.Marshal(raw)
			response, forwardErr := provider.Forward(req.Context(), http.DefaultClient, route, forwardBody, payload.Stream)
			if forwardErr != nil {
				continue
			}
			provider.RecordUsage(req.Context(), conn, auth.UserID(req.Context()), route, payload.Model, response.StatusCode, started)
			if response.StatusCode >= 500 {
				response.Body.Close()
				continue
			}
			_ = provider.CopyResponse(w, response)
			return
		}
		http.Error(w, "all routes failed", 502)
	}))
	r.Handle("POST /v1/chat/completions", chat)
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
