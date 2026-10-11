// Optional helper: runs a .sql file against the database (the same one the server uses).
// Handy on Windows when the `psql` command is not installed.
//
//   npm run db:schema      (runs database/schema.sql)
//   npm run db:seed        (runs database/seed.sql)
//
// With DATABASE_URL set it runs on your real PostgreSQL server; without it, on the embedded demo database.

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const db = require('../config/db');

async function run() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node database/runSql.js <path-to-sql-file>');
    process.exit(1);
  }

  const sql = fs.readFileSync(path.resolve(file), 'utf8');
  try {
    await db.checkConnection();
    await db.runScript(sql); // one call can contain several SQL statements
    console.log(`OK: ran ${file}`);
  } catch (err) {
    console.error(`Failed to run ${file}: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}

run();
