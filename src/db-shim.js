// D1-compatible shim over node-postgres.
// Replaces env.DB so worker.js call-sites are unchanged.
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => console.error('[db] pool error', err.message));

// D1 uses ? placeholders; PostgreSQL uses $1 $2 ...
function toPositional(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function makeStmt(sql, args = []) {
  const pgSql = toPositional(sql);
  const executor = (client) => client ? client.query(pgSql, args) : pool.query(pgSql, args);
  return {
    async first(opts = {}) {
      const { rows } = await executor(opts._client);
      return rows[0] ?? null;
    },
    async all(opts = {}) {
      const { rows } = await executor(opts._client);
      return { results: rows };
    },
    async run(opts = {}) {
      const result = await executor(opts._client);
      return { meta: { changes: result.rowCount } };
    },
  };
}

export const DB = {
  prepare(sql) {
    return {
      bind(...args) { return makeStmt(sql, args); },
      // no-bind overloads
      first()  { return makeStmt(sql).first(); },
      all()    { return makeStmt(sql).all(); },
      run()    { return makeStmt(sql).run(); },
    };
  },
  // D1 batch: atomic — runs all statements inside a single PostgreSQL transaction.
  // D1 guarantees atomicity; this shim preserves that guarantee.
  async batch(stmts) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const results = [];
      for (const stmt of stmts) {
        // Each stmt is a makeStmt object — call run() via its internal closure
        const result = await stmt.run({ _client: client });
        results.push(result);
      }
      await client.query('COMMIT');
      return results;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};
