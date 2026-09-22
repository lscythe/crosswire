package httpserver

import (
	"encoding/json"
	"net/http"

)

func New() http.Handler {
	r := http.NewServeMux()
	r.HandleFunc("GET /health", health)
	return r
}

func health(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
