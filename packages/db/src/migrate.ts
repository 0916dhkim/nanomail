import "dotenv/config";
import { drizzle } from "drizzle-orm/cockroach";
import { migrate } from "drizzle-orm/cockroach/migrator";
import pg from "pg";
import { loadSecrets } from "@nanomail/secrets";

const baseUrl = process.env.SECRETS_BASE_URL;
const environmentId = process.env.SECRETS_ENVIRONMENT_ID;
const privateKeyBase64 = process.env.SECRETS_PRIVATE_KEY;

let step = "init";
let pool: pg.Pool | null = null;

try {
  step = "resolve-secrets";
  console.log("[migrate] starting — resolving secrets...");
  console.log(
    `[migrate] SECRETS_BASE_URL set: ${!!baseUrl}, ` +
      `SECRETS_ENVIRONMENT_ID set: ${!!environmentId}, ` +
      `SECRETS_PRIVATE_KEY set: ${!!privateKeyBase64} ` +
      `(len=${privateKeyBase64?.length ?? 0})`,
  );

  if (!baseUrl || !environmentId || !privateKeyBase64) {
    throw new Error(
      "secret-party is not configured. Set SECRETS_BASE_URL, " +
        "SECRETS_ENVIRONMENT_ID, and SECRETS_PRIVATE_KEY.",
    );
  }

  step = "fetch-secrets";
  console.log("[migrate] fetching DATABASE_URL from secret-party...");
  const { DATABASE_URL } = await loadSecrets({
    baseUrl,
    environmentId,
    privateKeyBase64,
    keys: ["DATABASE_URL"],
  });
  console.log(
    `[migrate] DATABASE_URL resolved: ${DATABASE_URL.replace(/:[^:@/]+@/, ":***@")}`,
  );

  step = "connect";
  console.log("[migrate] connecting to database...");
  pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
  const db = drizzle({ client: pool });

  step = "migrate";
  console.log("[migrate] applying migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });

  step = "cleanup";
  console.log("[migrate] closing pool...");
  await pool.end();
  pool = null;

  console.log("[migrate] Migrations complete.");
} catch (err) {
  console.error(`[migrate] FAILED at step "${step}":`, err);
  if (pool) {
    try {
      await pool.end();
    } catch {
      // ignore — pool may already be closed
    }
  }
  process.exit(1);
}
