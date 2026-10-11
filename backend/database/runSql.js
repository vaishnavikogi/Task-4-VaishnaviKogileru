// Optional helper: runs a .sql file against your database using the same DATABASE_URL.
// Handy on Windows when the `psql` command is not installed.
//
//   npm run db:schema      (runs database/schema.sql)
//   npm run db:seed        (runs database/seed.sql)

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { pool, checkConnection } = require('../config/db');

async function run() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node database/runSql.js <path-to-sql-file>');
    process.exit(1);
  }

  const sql = fs.readFileSync(path.resolve(file), 'utf8');
  try {
    await checkConnection();
    await pool.query(sql); // one call can contain several SQL statements
    console.log(`OK: ran ${file}`);
  } catch (err) {
    console.error(`Failed to run ${file}: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
