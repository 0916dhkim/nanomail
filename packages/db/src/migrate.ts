import "dotenv/config";
import { drizzle } from "drizzle-orm/cockroach";
import { migrate } from "drizzle-orm/cockroach/migrator";
import pg from "pg";
import { loadSecrets } from "@nanomail/secrets";

const baseUrl = process.env.SECRETS_BASE_URL;
const environmentId = process.env.SECRETS_ENVIRONMENT_ID;
const privateKeyBase64 = process.env.SECRETS_PRIVATE_KEY;

if (!baseUrl || !environmentId || !privateKeyBase64) {
  throw new Error(
    "secret-party is not configured. Set SECRETS_BASE_URL, " +
      "SECRETS_ENVIRONMENT_ID, and SECRETS_PRIVATE_KEY.",
  );
}

const { DATABASE_URL } = await loadSecrets({
  baseUrl,
  environmentId,
  privateKeyBase64,
  keys: ["DATABASE_URL"],
});

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
const db = drizzle({ client: pool });

await migrate(db, { migrationsFolder: "./drizzle" });
await pool.end();

console.log("Migrations complete.");
