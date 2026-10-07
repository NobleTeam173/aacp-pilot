// One-time D1 → RDS import script. Run once, then delete.
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(path.join(__dirname, '..', 'aacp-pg-import.sql'), 'utf8');

const client = new Client({
  host: 'aacp-postgres.cbegoe4cg002.ca-central-1.rds.amazonaws.com',
  port: 5432,
  database: 'aacp',
  user: 'aacpadmin',
  password: process.env.RDS_PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
  statement_timeout: 120000,
});

async function run() {
  console.log('Connecting to RDS...');
  await client.connect();
  console.log('Connected. Running import...');

  // Strip transaction wrappers — run each statement in autocommit
  const stripped = sql
    .replace(/SET session_replication_role\s*=\s*\w+;/g, '')
    .replace(/BEGIN;/g, '')
    .replace(/COMMIT;/g, '');

  const statements = stripped
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  let ok = 0, skipped = 0;
  for (const stmt of statements) {
    try {
      await client.query(stmt);
      ok++;
    } catch (err) {
      console.warn(`  SKIP: ${err.message.slice(0, 120)}`);
      skipped++;
    }
  }

  console.log(`\nDone. ${ok} statements OK, ${skipped} skipped.`);
  await client.end();
}

run().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
