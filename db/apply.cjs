// Applies Track A schema migration + school/term seeds using backend .env
// (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD). No psql required.
//
// Usage (from the backend root):
//   npm install --prefix ~/.cache/gradquest-db pg
//   NODE_PATH=~/.cache/gradquest-db/node_modules node db/apply.cjs
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const root = path.join(__dirname, "..");

function loadEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

async function runFile(client, name) {
  const sql = fs.readFileSync(path.join(__dirname, name), "utf8");
  await client.query(sql);
  console.log(`Applied ${name}`);
}

async function main() {
  const env = loadEnv(path.join(root, ".env"));
  const missing = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing in .env: ${missing.join(", ")}`);

  const client = new Client({
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log("Connected.");

  try {
    // Full schema (CREATE IF NOT EXISTS) then additive Track A columns/tables
    await runFile(client, "schema.sql");
    await runFile(client, "migrate_track_a.sql");
    // Replaces catalog with verified 25 programs + term rows
    await runFile(client, "seed_schools.sql");
    await runFile(client, "seed_program_terms.sql");

    const counts = await client.query(`
      SELECT c.relname AS table_name,
             (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', c.relname), false, true, '')))[1]::text::int AS rows
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname`);
    console.table(counts.rows);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
