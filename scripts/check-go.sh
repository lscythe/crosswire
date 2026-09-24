#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
case "${1:-}" in
  lint)
    unformatted=$(gofmt -l services)
    if [[ -n "$unformatted" ]]; then
      printf 'Run gofmt on:\n%s\n' "$unformatted" >&2
      exit 1
    fi
    for service in gateway worker; do (cd "services/$service" && go vet ./...); done
    ;;
  test)
    for service in gateway worker; do (cd "services/$service" && go test ./...); done
    ;;
  *) echo 'Usage: check-go.sh lint|test' >&2; exit 2 ;;
esac
