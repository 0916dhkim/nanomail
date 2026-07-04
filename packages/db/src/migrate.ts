import "dotenv/config";
import { drizzle } from "drizzle-orm/cockroach";
import { migrate } from "drizzle-orm/cockroach/migrator";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL!, max: 1 });
const db = drizzle({ client: pool });

await migrate(db, { migrationsFolder: "./drizzle" });
await pool.end();

console.log("Migrations complete.");
