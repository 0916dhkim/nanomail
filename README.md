# nanomail

A minimal, self-hosted email app. Inbound mail is received at the edge by a
Cloudflare email worker, forwarded to the app backend over HTTP, and stored in
CockroachDB. A small web UI lets users read their inbox.

## Architecture

```
                  ┌─────────────────────┐
  inbound email   │  Cloudflare email   │
  ───────────────▶│  worker (thin relay)│
                  └──────────┬──────────┘
                             │ POST /api/ingest
                             │ Authorization: Bearer <INGEST_SECRET>
                             │ body: raw RFC822
                             ▼
                  ┌─────────────────────┐        ┌──────────────┐
                  │  app backend         │  SQL   │  CockroachDB │
                  │  (TanStack Start /   │───────▶│  (Postgres-  │
                  │   Nitro server)      │        │   wire)      │
                  └──────────┬───────────┘        └──────────────┘
                             │ SSR
                             ▼
                        web inbox UI
```

The Cloudflare worker never touches the database. It simply forwards the raw
message to the backend, which owns **all** database operations (parsing with
`postal-mime` and inserting via Drizzle). This keeps the worker dependency-free
and centralizes data access in one place.

## Tech stack

- **Monorepo:** pnpm workspaces
- **Web/backend:** [TanStack Start](https://tanstack.com/start) (React 19) on
  [Nitro](https://nitro.build)
- **Styling:** `@flow-css` — zero-runtime atomic CSS-in-JS. Inline `css({ ... })`
  calls are statically analyzed and extracted to static CSS at build time by its
  Vite plugin, so no styles are computed in the browser
- **Inbound worker:** Cloudflare [Email Workers](https://developers.cloudflare.com/email-routing/email-workers/)
- **Database:** [CockroachDB](https://www.cockroachlabs.com/) via
  [Drizzle ORM](https://orm.drizzle.team) (`1.0.0-rc`, native `cockroach`
  dialect) and the `pg` (node-postgres) driver
- **Outbound mail:** AWS SES v2 (hand-rolled SigV4 signing, no AWS SDK)

> **Note:** Drizzle is pinned to `1.0.0-rc.4` (a release candidate, not GA).
> Versions are pinned exactly on purpose; bump them once Drizzle 1.0 ships
> stable.

Styling uses `@flow-css`'s `css()` helper, which returns a generated class name:

```tsx
import { css } from "@flow-css/core/css";

<div className={css({ padding: "2rem", maxWidth: "800px", margin: "0 auto" })} />;
```

Enable it by adding the `@flow-css/vite` plugin to `vite.config.ts`.

## Project structure

```
apps/
  web/      TanStack Start app — inbox UI, auth, and the /api/ingest endpoint
    server/api/ingest.post.ts   backend ingest endpoint (DB writes live here)
  worker/   Cloudflare email worker — forwards raw mail to the backend
packages/
  db/       Drizzle schema, migrations, and migrate script
  secrets/  client for secret-party (envelope decryption of tracked secrets)
```

## Prerequisites

- Node.js 22+
- pnpm 10+
- A CockroachDB database (local single-node, self-hosted, or CockroachDB Cloud)
- A Cloudflare account with Email Routing (for receiving mail)

## Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Configure the environment. There is one `.env` for the whole repo, at the
   root — copy the example and fill it in:

   ```bash
   cp .env.example .env
   ```

   `.env` only holds the connection config for secret-party (shared by the
   backend and the worker's deploy sync); the secret values themselves are
   fetched from it at runtime (required — there is no plaintext fallback). See
   [Secrets](#secrets) for setup, and the `SECRETS` manifest in
   `apps/web/src/secrets.ts` for the authoritative list of secrets the backend
   requires.

3. Create the schema. Generate migrations from the Drizzle schema and apply them:

   ```bash
   pnpm db:generate                      # regenerate SQL after schema changes
   pnpm --filter @nanomail/db migrate    # apply migrations (reads SECRETS_*)
   ```

   > Prefer `generate` + `migrate` over `drizzle-kit push` with CockroachDB.

4. Start the server and complete first-run setup:

   ```bash
   pnpm --filter @nanomail/web dev
   ```

   With an empty database the app redirects to `/setup`, where you create the
   first admin account (email + password, ≥8 chars). After setup you're sent to
   `/login` to sign in. The `/setup` route is only reachable while the `users`
   table is empty; once any user exists it redirects away.

## Development

Run the backend (and worker) in watch mode:

```bash
pnpm dev                      # web + worker in parallel
pnpm --filter @nanomail/web dev   # just the backend (http://localhost:3000)
```

The backend loads the repo-root `.env` automatically (via the Vite config).

## Database commands

| Command | Description |
| --- | --- |
| `pnpm db:generate` | Generate SQL migrations from the schema |
| `pnpm --filter @nanomail/db migrate` | Apply pending migrations |
| `pnpm db:studio` | Open Drizzle Studio |

## Secrets

The backend's secret values are tracked in a self-hosted
[secret-party](https://github.com/0916dhkim/secret-party) instance — a minimal
secrets manager that stores values encrypted and serves them over an
authenticated API. The `@nanomail/secrets` package is the client: it fetches
each value, unwraps the per-environment data key with the app's private key, and
decrypts the value locally (AES-256-GCM). The private key never leaves the
backend process.

Which secrets the backend needs is defined once, declaratively, in the `SECRETS`
manifest in `apps/web/src/secrets.ts` — that file is the single source of truth.
Store each of those keys in a secret-party environment, then configure the
backend to read from it:

```ini
SECRETS_BASE_URL=https://secrets.example.com
SECRETS_ENVIRONMENT_ID=<environment id from the secret-party dashboard>
SECRETS_PRIVATE_KEY=<base64 PKCS8 private key from API key creation>
```

All three variables are required — including for local development. Secrets are
fetched and decrypted on first use and cached for the process lifetime; if
secret-party is unreachable or a value fails validation, startup fails rather
than falling back to anything. There is no plaintext-environment fallback.

> The `@nanomail/db` migrate script (`pnpm --filter @nanomail/db migrate`)
> also fetches `DATABASE_URL` from secret-party — the same `SECRETS_*` vars
> apply. In Docker Compose, migrations run automatically as a `migrator`
> sidecar before the backend starts; see [`DEPLOY.md`](./DEPLOY.md).

## Deployment

See [`DEPLOY.md`](./DEPLOY.md) for the full deployment checklist (prerequisites,
secret-party setup, migrations, backend, worker, post-deploy verification).

In short:

- Build the TanStack Start server and run it at a public URL so the Cloudflare
  worker can POST to `/api/ingest`. It fetches its secret values from
  secret-party at startup (see [Secrets](#secrets)).
- Deploy the worker with `pnpm --filter @nanomail/worker run deploy`. This syncs
  its secrets from secret-party and ships the code in one step; then wire the
  worker to an Email Routing rule in the Cloudflare dashboard.
- On first run with an empty database, the app redirects to `/setup` to create
  the first admin account.

## How auth works

- **Users/sessions:** passwords are hashed with `scrypt`; sessions are stored in
  the `sessions` table and delivered as an `HttpOnly` cookie. Admins can create
  accounts at `/admin`.
- **Worker → backend:** a shared bearer token (`INGEST_SECRET`) over HTTPS. The
  ingest endpoint rejects any request without a matching `Authorization` header.
