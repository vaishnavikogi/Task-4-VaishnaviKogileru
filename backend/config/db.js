// Database connection (PostgreSQL).
//
// There are two ways to run, chosen automatically:
//
//   1. DATABASE_URL is set in .env  ->  a real PostgreSQL server (local, Supabase, Neon ...).
//      Connections come from a POOL: a few connections are kept open and re-used, which is
//      much faster than opening a brand-new connection for every request.
//
//   2. DATABASE_URL is empty  ->  "demo mode": an embedded PostgreSQL (PGlite) runs inside
//      Node.js, so the project works right after `npm install && npm start` with nothing to set up.
//      It is still PostgreSQL and uses the same SQL. On the first start it creates the tables
//      (database/schema.sql) and adds the sample data (database/seed.sql). The data is kept in
//      the .data folder, so it survives a server restart.
//
// The rest of the project only calls query(), so it does not care which mode is running.
// No username / password / host is ever written in the code.

const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');

// By default pg turns a DATE column into a JavaScript Date object, which then gets
// shifted by the time zone when converted to JSON. Returning the plain text
// "YYYY-MM-DD" instead keeps study_date exactly as stored.
const DATE_TYPE_OID = 1082;
types.setTypeParser(DATE_TYPE_OID, (value) => value);

const useRealDatabase = Boolean(process.env.DATABASE_URL);
const mode = useRealDatabase ? 'postgresql' : 'embedded';


// ---------------------------------------------------------------------
// Mode 1: a real PostgreSQL server
// ---------------------------------------------------------------------

// Cloud databases (Supabase, Neon, Render ...) require an encrypted (SSL) connection.
// Set DATABASE_SSL=true in .env for those. A local PostgreSQL does not need it.
// (Do not also put ?sslmode=... in DATABASE_URL: it would override this setting.)
const useSsl = process.env.DATABASE_SSL === 'true';

const pool = useRealDatabase
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: useSsl ? { rejectUnauthorized: false } : false,
      max: 10, // at most 10 connections open at the same time
      connectionTimeoutMillis: 5000, // fail after 5s instead of waiting forever
    })
  : null;

// If an idle connection drops (e.g. the database restarts) pg emits an 'error'
// event. Without a listener Node would crash, so we just log it.
if (pool) {
  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err.message);
  });
}


// ---------------------------------------------------------------------
// Mode 2: embedded PostgreSQL (demo mode)
// ---------------------------------------------------------------------
const DATA_DIR = process.env.EMBEDDED_DB_DIR || path.join(__dirname, '..', '.data', 'pglite');
let embeddedPromise = null;

// Starts the embedded database once and re-uses it afterwards.
function getEmbedded() {
  if (!embeddedPromise) {
    embeddedPromise = (async () => {
      const { PGlite } = require('@electric-sql/pglite'); // only loaded in demo mode
      const isFirstRun = !fs.existsSync(DATA_DIR);
      fs.mkdirSync(path.dirname(DATA_DIR), { recursive: true });

      const db = new PGlite(DATA_DIR, { parsers: { [DATE_TYPE_OID]: (value) => value } }); // DATE as plain text, same as above
      await db.waitReady;

      await db.exec(fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8'));
      if (isFirstRun) {
        await db.exec(fs.readFileSync(path.join(__dirname, '..', 'database', 'seed.sql'), 'utf8'));
      }
      return db;
    })();
    embeddedPromise.catch(() => { embeddedPromise = null; }); // allow a retry if starting failed
  }
  return embeddedPromise;
}


// ---------------------------------------------------------------------
// What the rest of the project uses
// ---------------------------------------------------------------------

// Run one SQL query.
//   text   -> the SQL with placeholders: SELECT * FROM tasks WHERE id = $1
//   params -> the values for the placeholders: [id]
// The values are sent to PostgreSQL SEPARATELY from the SQL text (parameterized
// query), so user input can never change the meaning of the SQL.
// Returns { rows, rowCount } in both modes.
async function query(text, params) {
  if (useRealDatabase) return pool.query(text, params);

  const db = await getEmbedded();
  const result = await db.query(text, params);
  return { rows: result.rows, rowCount: result.affectedRows !== undefined ? result.affectedRows : result.rows.length };
}

// Run a whole .sql file (several statements, no parameters). Used by database/runSql.js.
async function runScript(sql) {
  if (useRealDatabase) return pool.query(sql);
  const db = await getEmbedded();
  return db.exec(sql);
}

// Startup check: is the database reachable? Throws if not.
async function checkConnection() {
  await query('SELECT 1');
}

// Close the database cleanly (used when the server or a script stops).
async function close() {
  if (useRealDatabase) return pool.end();
  if (embeddedPromise) {
    const db = await embeddedPromise;
    await db.close();
    embeddedPromise = null;
  }
}

module.exports = { query, runScript, checkConnection, close, mode, dataDir: DATA_DIR };
