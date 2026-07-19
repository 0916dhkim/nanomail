import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { loadSecrets } from "@nanomail/secrets";

// Env is scoped repo-wide; load the root .env regardless of cwd.
loadEnv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

/**
 * Deploy-time secret sync for the Cloudflare worker.
 *
 * secret-party is the single source of truth, but the worker shouldn't fetch
 * from it at runtime (that would require shipping the private key to the edge
 * and add latency to every inbound email). Instead this script — run on the
 * developer/CI machine, where Node is available — pulls the worker's secrets
 * from secret-party and pushes them into Cloudflare's native encrypted secret
 * store via `wrangler secret put`. The decrypted values never touch disk.
 *
 * Worker [vars] written into wrangler.toml at deploy time. These are
 * non-secret config values baked into the worker bundle.
 */
const WORKER_VARS = ["INGEST_URL"] as const;

/**
 * Secrets the worker needs in its Cloudflare environment. Add keys here as the
 * worker grows; each must also exist in the secret-party environment.
 */
const WORKER_SECRETS = ["INGEST_SECRET"] as const;

/**
 * Deploy-machine credentials fetched from secret-party and set in
 * `process.env` so `wrangler` can authenticate. These don't go into
 * Cloudflare's secret store — they're used by the deploy tooling itself.
 */
const DEPLOY_CREDENTIALS = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
] as const;

const baseUrl = process.env.SECRETS_BASE_URL;
const environmentId = process.env.SECRETS_ENVIRONMENT_ID;
const privateKeyBase64 = process.env.SECRETS_PRIVATE_KEY;

if (!baseUrl || !environmentId || !privateKeyBase64) {
  // secret-party is the only source of truth — never deploy without it.
  console.error(
    "secret-party is not configured (SECRETS_BASE_URL / SECRETS_ENVIRONMENT_ID / " +
      "SECRETS_PRIVATE_KEY). These are required to deploy the worker.",
  );
  process.exit(1);
}

console.log("[sync-secrets] fetching secrets from secret-party...");
const allSecrets = await loadSecrets({
  baseUrl,
  environmentId,
  privateKeyBase64,
  keys: [...WORKER_VARS, ...WORKER_SECRETS, ...DEPLOY_CREDENTIALS],
});

// Set deploy credentials in process.env so wrangler picks them up.
for (const key of DEPLOY_CREDENTIALS) {
  process.env[key] = allSecrets[key];
  console.log(`[sync-secrets] set ${key} in process.env`);
}

// Write non-secret [vars] into wrangler.toml so they're bundled with the
// worker. Cloudflare's secret store is for sensitive values; plain config
// belongs in [vars].
const wranglerPath = fileURLToPath(
  new URL("../wrangler.toml", import.meta.url),
);
let wrangler = readFileSync(wranglerPath, "utf8");
for (const key of WORKER_VARS) {
  const value = allSecrets[key];
  // Match `KEY = "..."` (with any value) and replace it.
  const pattern = new RegExp(`^${key}\\s*=\\s*".*"$`, "m");
  if (!pattern.test(wrangler)) {
    console.error(
      `[sync-secrets] ${key} has no matching [vars] entry in wrangler.toml; refusing to write.`,
    );
    process.exit(1);
  }
  wrangler = wrangler.replace(pattern, `${key} = "${value}"`);
  console.log(`[sync-secrets] wrote ${key} to wrangler.toml`);
}
writeFileSync(wranglerPath, wrangler);

for (const key of WORKER_SECRETS) {
  console.log(`[sync-secrets] syncing ${key} to Cloudflare...`);
  const result = spawnSync("wrangler", ["secret", "put", key], {
    input: allSecrets[key],
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (result.status !== 0) {
    console.error(
      `[sync-secrets] failed to set ${key} (wrangler exited with ${result.status ?? "unknown"}).`,
    );
    process.exit(result.status ?? 1);
  }
}

// Deploy the worker. This must run in-process so wrangler inherits the
// CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID we set in process.env above
// (a separate `wrangler` invocation from package.json scripts wouldn't).
console.log("[sync-secrets] deploying worker to Cloudflare...");
const deployResult = spawnSync("wrangler", ["deploy"], {
  stdio: "inherit",
});
if (deployResult.status !== 0) {
  console.error(
    `[sync-secrets] wrangler deploy exited with ${deployResult.status ?? "unknown"}.`,
  );
  process.exit(deployResult.status ?? 1);
}

console.log(
  `[sync-secrets] wrote ${WORKER_VARS.length} var(s), synced ${WORKER_SECRETS.length} worker secret(s), set ${DEPLOY_CREDENTIALS.length} deploy credential(s), and deployed the worker.`,
);
