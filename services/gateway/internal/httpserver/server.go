package httpserver

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
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
	r.Handle("GET /v1/models", auth.Middleware(conn, cache, http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		models, err := provider.LoadModels(req.Context(), conn, auth.UserID(req.Context()))
		if err != nil {
			http.Error(w, "model discovery unavailable", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(struct {
			Object string           `json:"object"`
			Data   []provider.Model `json:"data"`
		}{"list", models})
	})))
	chat := auth.Middleware(conn, cache, http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		started := time.Now()
		requestID := w.Header().Get("X-Request-ID")
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
			provider.RecordRequest(req.Context(), conn, requestID, auth.UserID(req.Context()), nil, payload.Model, 400, started, "model is required")
			http.Error(w, "model is required", 400)
			return
		}
		routes, err := provider.LoadRoutes(req.Context(), conn, auth.UserID(req.Context()), payload.Model)
		if err != nil {
			provider.RecordRequest(req.Context(), conn, requestID, auth.UserID(req.Context()), nil, payload.Model, 503, started, "routing unavailable")
			http.Error(w, "routing unavailable", 503)
			return
		}
		if len(routes) == 0 {
			provider.RecordRequest(req.Context(), conn, requestID, auth.UserID(req.Context()), nil, payload.Model, 404, started, "no route")
			http.Error(w, "no route", 404)
			return
		}
		var attempts []provider.Attempt
		limitedRetry := 0
		quotaUnavailable := false
		for _, route := range routes {
			attempt := provider.Attempt{ConnectionID: route.ConnectionID, ConnectionName: route.ConnectionName, UpstreamModel: route.UpstreamModel}
			var retryAfter int
			quotaErr := conn.QueryRowContext(req.Context(), "SELECT reserve_connection_requests($1, $2, 1)", route.ConnectionID, auth.UserID(req.Context())).Scan(&retryAfter)
			if quotaErr != nil || retryAfter != 0 {
				switch {
				case quotaErr != nil:
					attempt.Status, attempt.Reason = 503, "quota check unavailable"
					quotaUnavailable = true
				case retryAfter < 0:
					attempt.Status, attempt.Reason = 404, "connection unavailable"
				default:
					attempt.Status, attempt.Reason = 429, "public connection quota exceeded"
					if limitedRetry == 0 || retryAfter < limitedRetry {
						limitedRetry = retryAfter
					}
				}
				attempts = append(attempts, attempt)
				continue
			}
			var raw map[string]any
			if json.Unmarshal(body, &raw) != nil {
				http.Error(w, "invalid request", 400)
				return
			}
			raw["model"] = route.UpstreamModel
			forwardBody, _ := json.Marshal(raw)
			response, forwardErr := provider.Forward(req.Context(), http.DefaultClient, route, forwardBody, payload.Stream)
			if forwardErr != nil {
				attempt.Reason = "transport error"
				attempts = append(attempts, attempt)
				continue
			}
			attempt.Status = response.StatusCode
			provider.RecordUsage(req.Context(), conn, auth.UserID(req.Context()), route, payload.Model, response.StatusCode, started)
			if response.StatusCode >= 500 {
				response.Body.Close()
				attempt.Reason = "upstream server error"
				attempts = append(attempts, attempt)
				continue
			}
			attempt.Reason = "response served"
			reason := ""
			if err := provider.CopyResponse(w, response); err != nil {
				reason = "upstream response interrupted"
				attempt.Reason = reason
			}
			attempts = append(attempts, attempt)
			logCtx, cancel := context.WithTimeout(context.WithoutCancel(req.Context()), 2*time.Second)
			defer cancel()
			provider.RecordRequest(logCtx, conn, requestID, auth.UserID(req.Context()), &route, payload.Model, response.StatusCode, started, reason, attempts...)
			return
		}
		status, reason := 502, "all routes failed"
		if limitedRetry > 0 {
			status, reason = 429, "public connection quota exceeded"
			w.Header().Set("Retry-After", strconv.Itoa(limitedRetry))
		}
		if quotaUnavailable {
			status, reason = 503, "quota check unavailable"
			w.Header().Del("Retry-After")
		}
		provider.RecordRequest(req.Context(), conn, requestID, auth.UserID(req.Context()), nil, payload.Model, status, started, reason, attempts...)
		http.Error(w, reason, status)
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
