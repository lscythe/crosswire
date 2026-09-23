package provider

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Route struct{ ConnectionID, BaseURL, Ciphertext, UpstreamModel string }

func LoadRoutes(ctx context.Context, db *sql.DB, userID, alias string) ([]Route, error) {
	rows, err := db.QueryContext(ctx, `SELECT c.id, c.base_url, c.api_key_ciphertext, r.upstream_model
		FROM routing_configs cfg JOIN routing_routes r ON r.config_id = cfg.id
		JOIN connections c ON c.id = r.connection_id
		WHERE (cfg.owner_user_id = $1 OR c.visibility = 'public') AND cfg.is_default AND r.model_alias = $2 AND c.enabled
		ORDER BY r.priority`, userID, alias)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var routes []Route
	for rows.Next() {
		var route Route
		if err := rows.Scan(&route.ConnectionID, &route.BaseURL, &route.Ciphertext, &route.UpstreamModel); err != nil {
			return nil, err
		}
		routes = append(routes, route)
	}
	return routes, rows.Err()
}

func Forward(ctx context.Context, client *http.Client, route Route, body []byte, stream bool) (*http.Response, error) {
	key, err := decrypt(route.Ciphertext)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(route.BaseURL, "/")+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+key)
	if stream {
		req.Header.Set("Accept", "text/event-stream")
	}
	return client.Do(req)
}

func CopyResponse(dst http.ResponseWriter, src *http.Response) error {
	defer src.Body.Close()
	for key, values := range src.Header {
		for _, value := range values {
			dst.Header().Add(key, value)
		}
	}
	dst.WriteHeader(src.StatusCode)
	_, err := io.Copy(dst, src.Body)
	return err
}

func RecordUsage(ctx context.Context, db *sql.DB, userID string, route Route, model string, status int, started time.Time) {
	_, _ = db.ExecContext(ctx, `INSERT INTO usage_events(user_id, connection_id, model, status, latency_ms) VALUES ($1, $2, $3, $4, $5)`, userID, route.ConnectionID, model, status, time.Since(started).Milliseconds())
}

func RecordRequest(ctx context.Context, db *sql.DB, requestID, userID string, route *Route, model string, status int, started time.Time, reason string) {
	var connectionID any
	if route != nil {
		connectionID = route.ConnectionID
	}
	_, _ = db.ExecContext(ctx, `INSERT INTO request_logs(request_id, user_id, connection_id, model, status, latency_ms, error_reason) VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, ''))`, requestID, userID, connectionID, model, status, time.Since(started).Milliseconds(), reason)
}

var ErrNoRoute = fmt.Errorf("no route")
