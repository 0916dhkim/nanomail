#!/bin/sh
set -e

# Override the placeholder INGEST_URL in wrangler.toml with the deploy-time
# value. The placeholder is unique enough to avoid false matches.
sed -i "s#https://app.example.com/api/ingest#$INGEST_URL#" wrangler.toml

# Sync the worker's secrets from secret-party into Cloudflare's encrypted
# secret store, then ship the code.
pnpm --filter @nanomail/worker deploy

echo "Worker deployed successfully."
