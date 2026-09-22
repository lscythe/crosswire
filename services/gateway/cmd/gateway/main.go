package main

import (
	"log"
	"net/http"
	"os"

	"github.com/lscythe/crosswire/services/gateway/internal/httpserver"
)

func main() {
	addr := os.Getenv("GATEWAY_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	log.Printf("gateway listening on %s", addr)
	if err := http.ListenAndServe(addr, httpserver.New()); err != nil {
		log.Fatal(err)
	}
}
