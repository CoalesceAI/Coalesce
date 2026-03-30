/**
 * Drops the public schema (all tables, data, and _migrations) and reapplies
 * every migration from scratch. Destructive — use only on dev/staging or when
 * you intentionally want a clean database.
 *
 * Usage: DATABASE_URL=... npm run db:reset
 * Then:  npm run seed
 */
import "dotenv/config";
import pg from "pg";
import { runMigrations } from "./migrate.js";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const { Pool } = pg;

async function main(): Promise<void> {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    console.log("Dropping public schema (all data in public will be removed)...");
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
  } finally {
    client.release();
  }

  console.log("Re-running migrations...");
  await runMigrations(pool);
  await pool.end();

  console.log("");
  console.log("db:reset complete.");
  console.log("Next: set SEED_CLERK_USER_ID in .env (your Clerk user id, e.g. user_xxx), then run: npm run seed");
}

main().catch((err: unknown) => {
  console.error("db:reset failed:", err);
  process.exit(1);
});
