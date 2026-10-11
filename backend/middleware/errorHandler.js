// Centralized error handling. Express recognises an error handler by its
// FOUR parameters (err, req, res, next).
//
// Controllers wrap their database code in try/catch and call next(err);
// every error ends up here and becomes a consistent JSON response.

// Runs when no route matched the request -> 404
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

// PostgreSQL error codes we want to explain nicely (they are "the client's fault" -> 400).
// Full list: https://www.postgresql.org/docs/current/errcodes-appendix.html
const CLIENT_DATABASE_ERRORS = {
  '23502': 'A required field is missing', // not_null_violation
  '23505': 'That value already exists', // unique_violation
  '23514': 'The data breaks a database rule (check constraint)', // check_violation
  '22001': 'A value is too long for its column', // string_data_right_truncation
  '22003': 'A number is out of range', // numeric_value_out_of_range
  '22007': 'Invalid date or time value', // invalid_datetime_format
  '22008': 'Invalid date or time value', // datetime_field_overflow
  '22P02': 'A value has the wrong format', // invalid_text_representation
};

// Errors that mean "we cannot talk to the database" (server/database problem -> 500).
const CONNECTION_ERROR_CODES = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'];

function errorHandler(err, req, res, next) {
  // Malformed JSON in the request body -> 400
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Invalid JSON in request body' });
  }

  // Request body too large -> 413
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Request body is too large' });
  }

  // A database rule was broken by the data we sent -> 400
  if (CLIENT_DATABASE_ERRORS[err.code]) {
    return res.status(400).json({ success: false, message: CLIENT_DATABASE_ERRORS[err.code] });
  }

  // Database unreachable / connection problems (code 08xxx = connection exception,
  // 57P01 = server shutting down, 53300 = too many connections) -> 500
  const isConnectionProblem =
    CONNECTION_ERROR_CODES.includes(err.code) ||
    (typeof err.code === 'string' && (err.code.startsWith('08') || err.code === '57P01' || err.code === '53300')) ||
    /timeout exceeded when trying to connect|Connection terminated/i.test(err.message || '');

  // The full error is logged on the SERVER only. The client gets a generic message,
  // so passwords, host names, table names and SQL are never leaked.
  console.error('Error:', err.code || '', err.message);

  if (isConnectionProblem) {
    return res.status(500).json({ success: false, message: 'Database is unavailable. Please try again later.' });
  }

  res.status(500).json({ success: false, message: 'Something went wrong' });
}

module.exports = { notFoundHandler, errorHandler };
