#!/usr/bin/env bash
set -euo pipefail

web_url=${WEB_URL:-http://localhost:3000}
gateway_url=${GATEWAY_URL:-http://localhost:8080}
admin_username=${BOOTSTRAP_ADMIN_USERNAME:-admin}
admin_password=${BOOTSTRAP_ADMIN_PASSWORD:-replace-with-a-long-password}
member_username="foundation-$(date +%s)-$RANDOM"
member_email="$member_username@example.com"
member_password='foundation-member-password'
cookie_file=$(mktemp)
trap 'rm -f "$cookie_file"' EXIT

for attempt in {1..30}; do
  if curl -fsS "$web_url/api/health" >/dev/null && curl -fsS "$gateway_url/ready" >/dev/null; then break; fi
  sleep 1
done

curl -sS -o /dev/null -X POST "$web_url/api/auth/bootstrap" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg username "$admin_username" --arg password "$admin_password" '{username:$username,password:$password}')"

curl -fsS -c "$cookie_file" -X POST "$web_url/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg username "$admin_username" --arg password "$admin_password" '{username:$username,password:$password}')" >/dev/null

created=$(curl -fsS -b "$cookie_file" -X POST "$web_url/api/users" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg username "$member_username" --arg email "$member_email" '{username:$username,email:$email,role:"member"}')")
temporary_password=$(jq -r .temporaryPassword <<<"$created")
curl -fsS -c "$cookie_file" -X POST "$web_url/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg username "$member_username" --arg password "$temporary_password" '{username:$username,password:$password}')" | jq -e '.mustChangePassword == true' >/dev/null
restricted=$(curl -sS -o /dev/null -w '%{http_code}' -b "$cookie_file" "$web_url/api/keys")
test "$restricted" = 401
curl -fsS -b "$cookie_file" -X POST "$web_url/api/auth/change-password" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg password "$member_password" '{password:$password,confirmPassword:$password}')" >/dev/null

curl -fsS -c "$cookie_file" -X POST "$web_url/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg username "$member_username" --arg password "$member_password" '{username:$username,password:$password}')" >/dev/null
curl -fsS -b "$cookie_file" "$web_url/api/auth/me" | jq -e --arg email "$member_email" '.email == $email and .role == "member"' >/dev/null
forbidden=$(curl -sS -o /dev/null -w '%{http_code}' -b "$cookie_file" -X POST "$web_url/api/users" \
  -H 'Content-Type: application/json' -d '{"email":"blocked@example.com"}')
test "$forbidden" = 403
key_result=$(curl -fsS -b "$cookie_file" -X POST "$web_url/api/keys" \
  -H 'Content-Type: application/json' -d '{"name":"foundation check"}')
key=$(jq -r .key <<<"$key_result")
key_id=$(jq -r .id <<<"$key_result")

unauthorized=$(curl -sS -o /dev/null -w '%{http_code}' "$gateway_url/v1/models")
test "$unauthorized" = 401
curl -fsS -H "Authorization: Bearer $key" "$gateway_url/v1/models" | jq -e '.object == "list"' >/dev/null
curl -fsS -b "$cookie_file" -X DELETE "$web_url/api/keys/$key_id" >/dev/null
revoked=$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $key" "$gateway_url/v1/models")
test "$revoked" = 401

echo "foundation flow passed"
