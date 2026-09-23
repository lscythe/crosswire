# Crosswire

Self-hosted team AI gateway. The foundation currently provides login, invitations, personal API keys, and a protected `/v1/models` endpoint. Provider connections and routing are next.

## Local run

Create `.env` from `.env.example`. Change `BOOTSTRAP_ADMIN_PASSWORD`, `AUTH_SECRET`, `ENCRYPTION_KEY`, and `POSTGRES_PASSWORD`; make `DATABASE_URL` use the same PostgreSQL password. Then run:

```bash
docker compose --env-file .env -f infra/compose/docker-compose.yml up -d --build
```

Create the first admin once:

```bash
curl -X POST http://localhost:3000/api/auth/bootstrap \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"your-bootstrap-password"}'
```

Open `http://localhost:3000/login`. Run `./scripts/check-foundation.sh` with `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` set to verify the API flow.

## Dokploy

Route `/v1/*` and `/health` to `gateway:8080`; route all other paths to `web:3000` on one domain. Set `PUBLIC_BASE_URL` to that HTTPS domain. Set `DATABASE_URL` to a managed PostgreSQL URL when using an external database. The default Compose file still starts its local PostgreSQL container; remove that service and the PostgreSQL `depends_on` entries in Dokploy when using a managed database.

Set unique production secrets through Dokploy environment variables. Do not deploy `.env.example` values.
