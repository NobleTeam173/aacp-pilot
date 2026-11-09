const pg = require('pg');
const fs = require('fs');
const sql = fs.readFileSync(process.argv[2], 'utf8');
const pool = new pg.Pool({ connectionString: process.argv[3], ssl: { rejectUnauthorized: false } });
pool.query(sql)
  .then(() => { console.log('Schema migration complete'); pool.end(); })
  .catch(e => { console.error('Error:', e.message); pool.end(); process.exit(1); });
