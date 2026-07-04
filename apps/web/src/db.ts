import { drizzle } from "drizzle-orm/cockroach";
import pg from "pg";
import * as schema from "@nanomail/db";
import { getSecrets } from "./secrets";

function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString });
  return drizzle({ client: pool, schema });
}

type Db = ReturnType<typeof createDb>;

let cached: Db | null = null;

/**
 * Lazily create the Drizzle client. The connection string is resolved from
 * secret-party (or the environment) on first use, so the pool is only built
 * once the DATABASE_URL secret is available.
 */
export async function getDb(): Promise<Db> {
  if (!cached) {
    const { DATABASE_URL } = await getSecrets();
    cached = createDb(DATABASE_URL);
  }
  return cached;
}
