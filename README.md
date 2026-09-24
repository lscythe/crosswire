# Crosswire

Self-hosted team AI gateway. Includes username/password login, admin-created users, mandatory first-login password changes, private/shared provider connections, routing, model probes, usage, and personal API keys.

## Local run

Create `.env` from `.env.example`. Change `BOOTSTRAP_ADMIN_PASSWORD`, `AUTH_SECRET`, `ENCRYPTION_KEY`, and `POSTGRES_PASSWORD`; make `DATABASE_URL` use the same PostgreSQL password. Then run:

```bash
docker compose --env-file .env -f infra/compose/docker-compose.yml up -d --build
```

Create the first admin once:

```bash
curl -X POST http://localhost:3000/api/auth/bootstrap \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"your-bootstrap-password"}'
```

Open `http://localhost:3000/login`. Sign in with your username (default bootstrap username: `admin`). `BOOTSTRAP_ADMIN_EMAIL` remains the admin contact email. Existing accounts receive a username derived from the email local part; collisions receive a numeric suffix. Find assigned usernames on the Team page. Run `./scripts/check-foundation.sh` with `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD` set to verify the API flow.

## Browser checks

With the local Compose stack running, start the deterministic test provider in one terminal (it stops after five minutes):

```bash
docker compose --env-file .env.example -f infra/compose/docker-compose.yml exec -T web node < tests/fixtures/provider.cjs
```

Then run in another terminal:

```bash
TEST_PROVIDER_URL=http://web:4100/v1 pnpm test:e2e
```

This checks connection editing, secret preservation, sharing, permission enforcement, persisted probe results, routing fallback, and user isolation without external provider calls. Set the bootstrap admin environment variables when using custom credentials.

## Dokploy

Route `/v1/*` and `/health` to `gateway:8080`; route all other paths to `web:3000` on one domain. Set `PUBLIC_BASE_URL` to that HTTPS domain. Set `DATABASE_URL` to a managed PostgreSQL URL when using an external database. The default Compose file still starts its local PostgreSQL container; remove that service and the PostgreSQL `depends_on` entries in Dokploy when using a managed database.

Set unique production secrets through Dokploy environment variables. Do not deploy `.env.example` values.
