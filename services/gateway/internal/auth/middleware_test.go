package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMiddlewareRejectsMissingKey(t *testing.T) {
	h := Middleware(nil, nil, http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Fatal("called") }))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/v1/models", nil))
	if w.Code != 401 {
		t.Fatalf("status = %d", w.Code)
	}
}
