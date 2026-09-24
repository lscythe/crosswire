package provider

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Route struct{ ConnectionID, ConnectionName, BaseURL, Ciphertext, UpstreamModel string }

func LoadRoutes(ctx context.Context, db *sql.DB, userID, alias string) ([]Route, error) {
	rows, err := db.QueryContext(ctx, `SELECT c.id, c.name, c.base_url, r.upstream_model
		FROM routing_configs cfg JOIN routing_routes r ON r.config_id = cfg.id
		JOIN connections c ON c.id = r.connection_id
		WHERE cfg.owner_user_id = $1 AND (c.owner_user_id = $1 OR c.visibility = 'public') AND cfg.is_default AND r.model_alias = $2 AND c.enabled
		AND NOT EXISTS (SELECT 1 FROM provider_models m WHERE m.provider_id = c.id AND m.upstream_id = r.upstream_model AND NOT m.enabled)
		ORDER BY r.priority`, userID, alias)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var routes []Route
	for rows.Next() {
		var route Route
		if err := rows.Scan(&route.ConnectionID, &route.ConnectionName, &route.BaseURL, &route.UpstreamModel); err != nil {
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

func RecordRequest(ctx context.Context, db *sql.DB, requestID, userID string, route *Route, model string, status int, started time.Time, reason string, attempts ...Attempt) {
	var connectionID any
	if route != nil {
		connectionID = route.ConnectionID
	}
	if attempts == nil {
		attempts = []Attempt{}
	}
	trace, _ := json.Marshal(attempts)
	_, _ = db.ExecContext(ctx, `INSERT INTO request_logs(request_id, user_id, connection_id, model, status, latency_ms, error_reason, attempts) VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, ''), $8)`, requestID, userID, connectionID, model, status, time.Since(started).Milliseconds(), reason, string(trace))
}

var ErrNoRoute = fmt.Errorf("no route")

// Attempt contains only safe routing metadata, never provider bodies or credentials.
type Attempt struct {
	ConnectionID   string `json:"connectionId"`
	ConnectionName string `json:"connectionName"`
	UpstreamModel  string `json:"upstreamModel"`
	Status         int    `json:"status"`
	Reason         string `json:"reason"`
}

// LoadModels uses the same ownership and visibility rules as LoadRoutes.
func LoadModels(ctx context.Context, db *sql.DB, userID string) ([]Model, error) {
	rows, err := db.QueryContext(ctx, `SELECT DISTINCT r.model_alias
 FROM routing_configs cfg JOIN routing_routes r ON r.config_id = cfg.id
 JOIN connections c ON c.id = r.connection_id
 WHERE cfg.owner_user_id = $1 AND cfg.is_default AND c.enabled
 AND (c.owner_user_id = $1 OR c.visibility = 'public')
 AND EXISTS (SELECT 1 FROM provider_keys k WHERE k.provider_id = c.id AND k.enabled AND (c.key_mode = 'round_robin' OR k.id = c.selected_key_id))
 AND NOT EXISTS (SELECT 1 FROM provider_models m WHERE m.provider_id = c.id AND m.upstream_id = r.upstream_model AND NOT m.enabled) ORDER BY r.model_alias`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	models := []Model{}
	for rows.Next() {
		model := Model{Object: "model", OwnedBy: "crosswire"}
		if err := rows.Scan(&model.ID); err != nil {
			return nil, err
		}
		models = append(models, model)
	}
	return models, rows.Err()
}

type Model struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	Created int64  `json:"created"`
	OwnedBy string `json:"owned_by"`
}
