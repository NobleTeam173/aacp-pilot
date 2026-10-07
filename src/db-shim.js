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
  return {
    async first() {
      const { rows } = await pool.query(pgSql, args);
      return rows[0] ?? null;
    },
    async all() {
      const { rows } = await pool.query(pgSql, args);
      return { results: rows };
    },
    async run() {
      const result = await pool.query(pgSql, args);
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
  // D1 batch: run multiple prepared statements in sequence
  async batch(stmts) {
    return Promise.all(stmts.map(s => s.run()));
  },
};
