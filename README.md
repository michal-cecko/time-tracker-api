# Lapse API

NestJS + Bun + Prisma + Postgres backend for **Lapse**, a personal time tracker
designed in `claude.ai/design` (see `time-tracker-app/` for design assets).

Stack:
- **Bun 1.x** runtime + package manager + test runner
- **NestJS 11** on **Fastify**
- **Prisma 6** → **PostgreSQL 17 (alpine)**
- **Socket.IO** (via `@nestjs/websockets`) namespace `/realtime`
- **argon2** + **JWT** (access + rotated refresh)

## Quickstart (local dev)

```bash
cp .env.example .env
docker compose up -d db                # starts Postgres on 127.0.0.1:5433
bun install
bunx prisma migrate dev --name init    # creates tables + applies partial-unique index
bun run seed                           # alex@studio.co / password123
bun run start:dev
```

## Quickstart (full Docker stack)

```bash
docker compose up -d --build           # builds & runs db + api
docker logs -f lapse-api               # watch boot
```

Then (host ports):
- REST → `http://localhost:3010/api/v1/...`
- Swagger → `http://localhost:3010/docs`
- WebSocket → `ws://localhost:3010/realtime` (auth: `{ token: <accessToken> }`)
- Postgres → `127.0.0.1:5433` (host) / `db:5432` (inside the Docker network)

### Seeded data

User: `alex@studio.co` / `password123`. 3 active projects (Finch, Orbit, Merryfield) + 3 archived. Orbit's "Onboarding flow" has nested subtasks 4 levels deep, with a running timer on the deepest active leaf.

## Full Docker stack

```bash
docker compose up -d           # builds api image, starts db + api
docker compose logs -f api
```

The `api` container runs `prisma migrate deploy` on boot, then `bun run dist/main.js`.

## Key endpoints

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/register` | `{email, password, name}` |
| POST | `/auth/login` | `{email, password, staysLoggedIn}` → 90d refresh if `staysLoggedIn` |
| POST | `/auth/refresh` | Rotated refresh; reuse triggers full revocation |
| POST | `/auth/forgot` | 204 always (no enumeration); dev logs the reset token |
| POST | `/auth/reset` | `{token, password}` |
| GET | `/me`, `PATCH /me`, `PATCH /me/settings` | |
| GET | `/projects?archived=true\|false\|all` | computed `trackedSeconds`, `openTaskCount` |
| GET | `/projects/:id/tasks` | nested tree with `totalTime`, `totalEstimate`, billing fields |
| POST | `/tasks`, `PATCH /tasks/:id`, `POST /tasks/:id/status`, `DELETE /tasks/:id` | |
| POST | `/time-entries/start` | atomic; stops any other running entry for this user |
| POST | `/time-entries/stop` | |
| POST | `/time-entries` | manual entry (`startedAt` + `endedAt` OR `durationSeconds`) |
| GET | `/tasks/:id/time-entries?descendants=true` | includes subtask entries |
| GET | `/time-entries?from=&to=` | history |
| GET | `/reports/weekly?from=` | last-7-days bars + per-project |
| POST | `/sync/batch` | idempotent on `items[].id` |
| WS | `/realtime` | `timer.started`, `timer.stopped`, `task.upserted`, `entry.upserted`, `sync.applied`, etc. |

## WebSocket smoke test

```bash
# install once: npm i -g wscat   (or use socket.io-client in a script)
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"alex@studio.co","password":"password123"}' | jq -r .accessToken)

# open two terminals — both subscribe with the same token
wscat -c "ws://localhost:3000/realtime/?EIO=4&transport=websocket&token=$TOKEN"
```

Start a timer in one terminal via `POST /api/v1/time-entries/start` and the other should receive `timer.started`.

## Production deployment (Dokploy on the VPS)

The production compose file is `docker-compose.prod.yml`. It runs two containers:

- `lapse-api` on the external `web` and `database` Traefik networks
- `lapse-db` (Postgres 17-alpine) on the internal `database` network only, with persistent data bind-mounted to `/volumes/lapse-api/pgdata`

Routing (handled by your existing Traefik with `myresolver`):

```
lapse.cecko.dev /api      → lapse-api:3000   (priority 100)
lapse.cecko.dev /realtime → lapse-api:3000   (priority 100)
lapse.cecko.dev /docs     → lapse-api:3000   (priority 100)
lapse.cecko.dev /*        → lapse-web:80     (priority 10 — set in the frontend repo)
```

### One-time host setup

```bash
sudo mkdir -p /volumes/lapse-api/pgdata
docker network create web      || true
docker network create database || true
```

### Dokploy environment

Copy `.env.prod.example` into Dokploy → Environment (do **not** commit a real `.env.prod`). Required keys:

- `POSTGRES_PASSWORD` — strong random string
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — two long random strings (`openssl rand -hex 32`)
- `CORS_ORIGINS=https://lapse.cecko.dev,capacitor://localhost,http://localhost,tauri://localhost`
- `APP_URL=https://lapse.cecko.dev`

### Migrations on deploy

The Dockerfile's `CMD` is `sh -c "bunx prisma migrate deploy && bun run dist/main.js"`, so pending migrations apply on every redeploy automatically.

## Notes

- **Partial unique index** (one running timer per user) lives in `prisma/migrations/00000000000000_partial_unique_running_entry/migration.sql` — apply it after the first `prisma migrate dev`. Prisma doesn't generate partial-unique declaratively yet.
- **Billing XOR** (HOURLY_RATE forbids `taskPriceCents`, TASK_PRICE forbids `hourlyRateCents`) is enforced in `TasksService.validateBilling`.
- **Fallback to Node**: if Bun ever breaks against a Nest peer dependency, swap `oven/bun:1-alpine` for `node:22-alpine` in the Dockerfile and replace `bun run dist/main.js` with `node dist/main.js`. Schema/REST/WS are runtime-agnostic.

## Frontend (pass 2, deferred)

The companion repo `time-tracker-app/` will host the hybrid frontend. Recommended stack (still to confirm with the user):
- **Capacitor 6 + React + Vite** for iOS / Android / Web
- **Tauri 2** desktop shell for macOS reusing the same Vite bundle

The HTML/CSS prototype in `time-tracker-app/` is the visual contract.
