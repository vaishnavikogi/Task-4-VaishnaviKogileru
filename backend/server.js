const path = require('path');

// Load the settings from .env (DATABASE_URL, PORT) into process.env.
// This must happen BEFORE the database config is loaded.
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');

const db = require('./config/db');
const taskRoutes = require('./routes/taskRoutes');
const studyRoutes = require('./routes/studyRoutes');
const statsRoutes = require('./routes/statsRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- CORS ----------
// A browser blocks a page from one origin (e.g. http://localhost:5500) from reading
// responses of another origin (http://localhost:3000) unless the API allows it.
// We allow only the addresses listed in CORS_ORIGINS (comma separated).
// Requests with no Origin header (Postman, curl) are always allowed.
const allowedOrigins = (
  process.env.CORS_ORIGINS ||
  'http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:3000'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(null, false); // no CORS headers -> the browser blocks the response
  },
};

// ---------- Middleware ----------
app.use(cors(corsOptions));
app.use(express.json()); // parses JSON request bodies into req.body

// Simple request logger: METHOD URL STATUS
app.use((req, res, next) => {
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode}`);
  });
  next();
});

// ---------- Routes ----------
app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'FocusFlow API is running' });
});

app.use('/api/tasks', taskRoutes);
app.use('/api/study-sessions', studyRoutes);
app.use('/api/stats', statsRoutes);

// ---------- Error handling (must come last) ----------
app.use(notFoundHandler);
app.use(errorHandler);

// ---------- Start the server ----------
// Startup check: make sure the database is reachable BEFORE accepting requests.
async function start() {
  try {
    await db.checkConnection();
    if (db.mode === 'embedded') {
      console.log('PostgreSQL ready: embedded demo database (no setup needed). Set DATABASE_URL in .env to use your own PostgreSQL server.');
    } else {
      console.log('PostgreSQL connection OK');
    }
  } catch (err) {
    console.error('Could not connect to PostgreSQL:', err.message);
    console.error('Check DATABASE_URL in your .env file and that PostgreSQL is running.');
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`FocusFlow API running at http://localhost:${PORT}`);
  });

  // Ctrl+C: stop accepting requests and close the database cleanly, so no data is lost.
  const shutdown = () => {
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
