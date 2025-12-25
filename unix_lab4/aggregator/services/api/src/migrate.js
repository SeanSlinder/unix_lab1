const fs = require("node:fs");
const path = require("node:path");

async function ensureMigrationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedIds(pool) {
  const res = await pool.query("SELECT id FROM schema_migrations");
  return new Set(res.rows.map((r) => r.id));
}

async function applyMigration(pool, id, sql) {
  await pool.query("BEGIN");
  try {
    await pool.query(sql);
    await pool.query(
      "INSERT INTO schema_migrations(id) VALUES($1) ON CONFLICT DO NOTHING",
      [id]
    );
    await pool.query("COMMIT");
  } catch (e) {
    await pool.query("ROLLBACK");
    throw e;
  }
}

async function runMigrations(pool, migrationsDir) {
  await ensureMigrationsTable(pool);
  const already = await appliedIds(pool);

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const id = file;
    if (already.has(id)) continue;
    const full = path.join(migrationsDir, file);
    const sql = fs.readFileSync(full, "utf8");
    await applyMigration(pool, id, sql);
  }
}

module.exports = { runMigrations };
