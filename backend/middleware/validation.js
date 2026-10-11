// Validation middleware: runs BEFORE the controller.
// If the input is bad we answer with 400 and the controller (and the database) is never reached.
// The database has its own CHECK constraints too, as a second safety net.

function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}

// If no body was sent, req.body can be undefined or not an object; treat that as {}.
function getBody(req) {
  return req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
}

// ---------- Small check functions: return an error message, or null when the value is fine ----------

function checkTitle(title) {
  if (typeof title !== 'string') return 'Task title must be a string';
  const length = title.trim().length;
  if (length < 3 || length > 100) return 'Task title must be between 3 and 100 characters';
  return null;
}

// description is optional: undefined and null are both fine (null clears it).
function checkDescription(description) {
  if (description === undefined || description === null) return null;
  if (typeof description !== 'string') return 'Description must be a string';
  if (description.length > 1000) return 'Description must not exceed 1000 characters';
  return null;
}

function checkCompleted(completed) {
  if (typeof completed !== 'boolean') return 'completed must be true or false';
  return null;
}

function checkSubject(subject) {
  if (typeof subject !== 'string') return 'Subject must be a string';
  const length = subject.trim().length;
  if (length < 2 || length > 100) return 'Subject must be between 2 and 100 characters';
  return null;
}

function checkDuration(duration) {
  if (typeof duration !== 'number' || !Number.isInteger(duration)) {
    return 'Duration must be a whole number of minutes';
  }
  if (duration <= 0 || duration > 600) return 'Duration must be greater than 0 and at most 600 minutes';
  return null;
}

function checkStudyDate(value) {
  // Format must be YYYY-MM-DD ...
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return 'study_date must be a valid date in YYYY-MM-DD format';
  }
  // ... and it must be a real calendar date (rejects 2026-02-31 and 2026-13-01)
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isReal =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return isReal ? null : 'study_date must be a valid date in YYYY-MM-DD format';
}

// ---------- ID in the URL (/api/tasks/:id) ----------

// Must be a whole number from 1 up to the largest value an INTEGER column can hold.
function validateId(req, res, next) {
  const id = req.params.id;
  if (!/^\d+$/.test(id) || Number(id) < 1 || Number(id) > 2147483647) {
    return badRequest(res, 'ID must be a positive whole number');
  }
  next();
}

// ---------- Tasks ----------

function validateTaskCreate(req, res, next) {
  const { title, description } = getBody(req);

  if (title === undefined) return badRequest(res, 'Task title is required');
  const error = checkTitle(title) || checkDescription(description);
  if (error) return badRequest(res, error);

  next();
}

// PUT: send any of title / description / completed (at least one).
function validateTaskUpdate(req, res, next) {
  const body = getBody(req);
  const provided = ['title', 'description', 'completed'].filter((field) => body[field] !== undefined);

  if (provided.length === 0) {
    return badRequest(res, 'Send at least one of: title, description, completed');
  }

  let error = null;
  if (body.title !== undefined) error = error || checkTitle(body.title);
  if (body.description !== undefined) error = error || checkDescription(body.description);
  if (body.completed !== undefined) error = error || checkCompleted(body.completed);
  if (error) return badRequest(res, error);

  next();
}

// ---------- Study sessions ----------

function validateSessionCreate(req, res, next) {
  const { subject, duration, study_date } = getBody(req);

  if (subject === undefined) return badRequest(res, 'Subject is required');
  if (duration === undefined) return badRequest(res, 'Duration is required');
  if (study_date === undefined) return badRequest(res, 'study_date is required (format: YYYY-MM-DD)');

  const error = checkSubject(subject) || checkDuration(duration) || checkStudyDate(study_date);
  if (error) return badRequest(res, error);

  next();
}

// PUT: send any of subject / duration / study_date (at least one).
function validateSessionUpdate(req, res, next) {
  const body = getBody(req);
  const provided = ['subject', 'duration', 'study_date'].filter((field) => body[field] !== undefined);

  if (provided.length === 0) {
    return badRequest(res, 'Send at least one of: subject, duration, study_date');
  }

  let error = null;
  if (body.subject !== undefined) error = error || checkSubject(body.subject);
  if (body.duration !== undefined) error = error || checkDuration(body.duration);
  if (body.study_date !== undefined) error = error || checkStudyDate(body.study_date);
  if (error) return badRequest(res, error);

  next();
}

module.exports = {
  validateId,
  validateTaskCreate,
  validateTaskUpdate,
  validateSessionCreate,
  validateSessionUpdate,
};
