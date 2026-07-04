# Deployment

A sequenced checklist for deploying nanomail from scratch. Each phase's
prerequisites must be satisfied before starting it.

## Prerequisites

- [ ] Node.js 22+ and pnpm 10+ on the deploy host (and CI, if applicable)
- [ ] A CockroachDB instance (self-hosted or CockroachDB Cloud) with a
      database created and a connection string at hand
- [ ] A self-hosted
      [secret-party](https://github.com/0916dhkim/secret-party) instance,
      reachable from the backend and from your deploy/CI machine
- [ ] A Cloudflare account with Email Routing enabled
- [ ] (Optional) AWS SES v2 credentials in the receiving region, if you intend
      to send outbound mail

## 1. Stand up secret-party

The backend has no plaintext env fallback for its secret values; they all live
in secret-party. Stand it up first.

- [ ] Deploy secret-party per its own docs and note its base URL
      (`SECRETS_BASE_URL`)
- [ ] Create an environment inside it (note the environment ID — this becomes
      `SECRETS_ENVIRONMENT_ID`)
- [ ] Create an API key in that environment; secret-party returns a base64
      PKCS8 private key (this becomes `SECRETS_PRIVATE_KEY`). The private key
      never leaves the backend process.
- [ ] Store each backend secret in the secret-party environment. The
      authoritative list is the `SECRETS` manifest in
      `apps/web/src/secrets.ts`. As of writing:
      - [ ] `DATABASE_URL` — CockroachDB connection string (`postgres://...`)
      - [ ] `INGEST_SECRET` — shared bearer token (≥16 chars) the email worker
            presents to `/api/ingest`

## 2. Configure the repo-root `.env`

The root `.env` holds only the connection config for secret-party — the secret
*values* themselves are fetched from secret-party at runtime. The same three
vars are read by the backend and by the worker's `sync-secrets` step.

- [ ] Copy `.env.example` to `.env` at the repo root
- [ ] Fill in:
      ```ini
      SECRETS_BASE_URL=https://secrets.example.com
      SECRETS_ENVIRONMENT_ID=<environment id from step 1>
      SECRETS_PRIVATE_KEY=<base64 PKCS8 private key from step 1>
      ```

## 3. Apply database migrations

The migrate script (`packages/db/src/migrate.ts`) reads its connection string
from its **own** environment — `DATABASE_URL` directly, not secret-party. It's
a standalone CLI; it does not import the secrets client.

- [ ] Make `DATABASE_URL` available to the migrate command (e.g. export it in
      your shell, or set it inline):
      ```bash
      DATABASE_URL=postgres://... pnpm --filter @nanomail/db migrate
      ```
- [ ] Confirm the migrate log prints `Migrations complete.`
- [ ] (Optional) Sanity-check with `pnpm db:studio`

## 4. Deploy the backend

The backend is a TanStack Start app on Nitro. Build it and run it wherever you
host Node apps (or pick a [Nitro preset](https://nitro.build/deploy) target).
It must be reachable at a public URL so the Cloudflare worker can POST to it.

- [ ] Build:
      ```bash
      pnpm build
      ```
- [ ] Start the server with the repo-root `.env` loaded (the Vite config loads
      it automatically in dev; in production, ensure the same three
      `SECRETS_*` vars are present in the process environment)
- [ ] Visit the public URL in a browser. With an empty `users` table you'll be
      redirected to `/setup` — create the first admin account there (email +
      password, ≥8 chars), then log in at `/login`
- [ ] (Optional, but recommended before going further) Verify the ingest
      endpoint rejects unauthenticated requests:
      ```bash
      curl -i https://your-backend.example.com/api/ingest
      # expect 401
      ```

## 5. Deploy the Cloudflare email worker

The worker forwards inbound mail to the backend's `/api/ingest`. It needs one
non-secret config value (`INGEST_URL`) plus the secrets in the
`WORKER_SECRETS` manifest (`apps/worker/scripts/sync-secrets.ts`). The deploy
script pulls those from secret-party and pushes them into Cloudflare's
encrypted secret store, so secret-party stays the single source of truth
without shipping the private key to the edge.

- [ ] Point the worker at your backend in `apps/worker/wrangler.toml`:
      ```toml
      [vars]
      INGEST_URL = "https://your-backend.example.com/api/ingest"
      ```
- [ ] Ensure `SECRETS_BASE_URL`, `SECRETS_ENVIRONMENT_ID`, and
      `SECRETS_PRIVATE_KEY` are set in your deploy environment (the same values
      as the root `.env`). The deploy aborts if any are missing — there is no
      manual fallback.
- [ ] Deploy. This provisions the worker's secrets and ships the code in one
      step:
      ```bash
      pnpm --filter @nanomail/worker deploy
      ```
- [ ] In the Cloudflare dashboard, wire the worker to an Email Routing rule so
      inbound mail is delivered to it

## 6. Post-deploy verification

- [ ] Send a test email to an address routed by Cloudflare Email Routing
- [ ] Confirm it appears in the inbox UI after refreshing `/`
- [ ] (Optional) If outbound mail is wired up, send a reply and confirm
      delivery

## Rotating secrets

To push a rotated secret value to an existing worker deployment without
shipping code, run the sync on its own:

```bash
pnpm --filter @nanomail/worker sync-secrets
```

Because the worker's secrets are provisioned at deploy time, rotating a value
in secret-party only reaches the worker on its **next deploy** (or an explicit
`sync-secrets`), not immediately. The backend, by contrast, fetches its
secrets at startup and caches them for the process lifetime, so rotating a
backend secret takes effect on its next restart.
