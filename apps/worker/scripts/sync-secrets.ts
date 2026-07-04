import { spawnSync } from "node:child_process";
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
 * Secrets the worker needs in its Cloudflare environment. Add keys here as the
 * worker grows; each must also exist in the secret-party environment.
 */
const WORKER_SECRETS = ["INGEST_SECRET"] as const;

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

const secrets = await loadSecrets({
  baseUrl,
  environmentId,
  privateKeyBase64,
  keys: WORKER_SECRETS,
});

for (const key of WORKER_SECRETS) {
  console.log(`Syncing ${key} from secret-party to Cloudflare...`);
  const result = spawnSync("wrangler", ["secret", "put", key], {
    input: secrets[key],
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (result.status !== 0) {
    console.error(
      `Failed to set ${key} (wrangler exited with ${result.status ?? "unknown"}).`,
    );
    process.exit(result.status ?? 1);
  }
}

console.log(`Synced ${WORKER_SECRETS.length} secret(s) from secret-party.`);
