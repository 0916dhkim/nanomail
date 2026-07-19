#!/bin/sh
set -e

# Sync the worker's secrets from secret-party into Cloudflare's encrypted
# secret store, then ship the code. sync-secrets also writes non-secret
# [vars] (e.g. INGEST_URL) into wrangler.toml at deploy time.
pnpm --filter @nanomail/worker run deploy

echo "Worker deployed successfully."
