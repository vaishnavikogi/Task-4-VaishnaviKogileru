// Database connection (PostgreSQL) using a connection POOL.
//
// A pool keeps a few connections open and re-uses them, which is much faster than
// opening a brand-new connection for every request.
//
// The connection details come from the DATABASE_URL environment variable
// (set in the .env file). No username / password / host is written in the code.

const { Pool, types } = require('pg');

// By default pg turns a DATE column into a JavaScript Date object, which then gets
// shifted by the time zone when converted to JSON. Returning the plain text
// "YYYY-MM-DD" instead keeps study_date exactly as stored.
const DATE_TYPE_OID = 1082;
types.setTypeParser(DATE_TYPE_OID, (value) => value);

// Cloud databases (Supabase, Neon, Render ...) require an encrypted (SSL) connection.
// Set DATABASE_SSL=true in .env for those. A local PostgreSQL does not need it.
// (Do not also put ?sslmode=... in DATABASE_URL: it would override this setting.)
const useSsl = process.env.DATABASE_SSL === 'true';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: 10, // at most 10 connections open at the same time
  connectionTimeoutMillis: 5000, // fail after 5s instead of waiting forever
});

// If an idle connection drops (e.g. the database restarts) pg emits an 'error'
// event. Without a listener Node would crash, so we just log it.
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

// Run one SQL query.
//   text   -> the SQL with placeholders: SELECT * FROM tasks WHERE id = $1
//   params -> the values for the placeholders: [id]
// The values are sent to PostgreSQL SEPARATELY from the SQL text (parameterized
// query), so user input can never change the meaning of the SQL.
function query(text, params) {
  return pool.query(text, params);
}

// Startup check: is the database reachable? Throws if not.
async function checkConnection() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  }
  await pool.query('SELECT 1');
}

module.exports = { query, checkConnection, pool };
