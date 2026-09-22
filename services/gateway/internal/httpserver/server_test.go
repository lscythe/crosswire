package httpserver

import (
	"net/http/httptest"
	"testing"
)

func TestHealth(t *testing.T) {
	req := httptest.NewRequest("GET", "/health", nil)
	res := httptest.NewRecorder()
	New().ServeHTTP(res, req)
	if res.Code != 200 {
		t.Fatalf("status = %d, want 200", res.Code)
	}
	if got := res.Body.String(); got != "{\"status\":\"ok\"}\n" {
		t.Fatalf("body = %q", got)
	}
}
