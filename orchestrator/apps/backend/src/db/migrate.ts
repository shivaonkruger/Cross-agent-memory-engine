import fs from "fs";
import path from "path";
import { pool } from "./pool";

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

function parseMigrationOrder(filename: string): number {
  const match = filename.match(/^(\d+)_/);
  if (!match || !match[1]) {
    throw new Error(`Migration filename does not start with a number: ${filename}`);
  }
  return parseInt(match[1], 10);
}

async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort((a, b) => parseMigrationOrder(a) - parseMigrationOrder(b));

  for (const filename of files) {
    const alreadyApplied = await pool.query(
      "SELECT 1 FROM schema_migrations WHERE filename = $1",
      [filename]
    );

    if (alreadyApplied.rowCount && alreadyApplied.rowCount > 0) {
      console.log(`[migrate] skipping already-applied ${filename}`);
      continue;
    }

    const client = await pool.connect();
    try {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");
      console.log(`[migrate] applying ${filename}`);
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
      await client.query("COMMIT");
      console.log(`[migrate] applied ${filename}`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`[migrate] failed on ${filename}:`, err);
      throw err;
    } finally {
      client.release();
    }
  }
}

migrate()
  .then(() => {
    console.log("[migrate] all migrations up to date");
    return pool.end();
  })
  .catch((err) => {
    console.error("[migrate] migration run failed:", err);
    pool.end().finally(() => process.exit(1));
  });
