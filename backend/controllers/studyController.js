// Study session controller: CRUD for the `study_sessions` table.
//
// Same flow as the task controller:
//   Request -> Validation (middleware, already done) -> SQL query -> Database -> Result -> HTTP response
// Every SQL query is parameterized ($1, $2 ...). User input is never added to the SQL text.

const db = require('../config/db');


// ---------------------------------------------------------------------
// CREATE  ->  POST /api/study-sessions   ->  SQL INSERT
// ---------------------------------------------------------------------
async function createStudySession(req, res, next) {
  try {
    const subject = req.body.subject.trim();
    const { duration, study_date } = req.body;

    const result = await db.query(
      `INSERT INTO study_sessions (subject, duration, study_date)
       VALUES ($1, $2, $3)
       RETURNING id, subject, duration, study_date, created_at`,
      [subject, duration, study_date]
    );

    res.status(201).json({
      success: true,
      message: 'Study session created successfully',
      data: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// READ ALL  ->  GET /api/study-sessions   ->  SQL SELECT (newest date first)
// ---------------------------------------------------------------------
async function getStudySessions(req, res, next) {
  try {
    // id DESC is a tie-breaker so sessions on the same day have a stable order
    const result = await db.query(
      `SELECT id, subject, duration, study_date, created_at FROM study_sessions ORDER BY study_date DESC, id DESC`
    );

    res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// READ ONE  ->  GET /api/study-sessions/:id   ->  SQL SELECT ... WHERE id = $1
// ---------------------------------------------------------------------
async function getStudySession(req, res, next) {
  try {
    const id = Number(req.params.id);

    const result = await db.query(`SELECT id, subject, duration, study_date, created_at FROM study_sessions WHERE id = $1`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Study session not found' });
    }

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// UPDATE  ->  PUT /api/study-sessions/:id   ->  SQL UPDATE
// Any of subject / duration / study_date may be sent; the rest keep their value.
// ---------------------------------------------------------------------
async function updateStudySession(req, res, next) {
  try {
    const id = Number(req.params.id);

    // Step A: load the current row
    const current = await db.query('SELECT subject, duration, study_date FROM study_sessions WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Study session not found' });
    }
    const old = current.rows[0];

    // Step B: new value = the one sent, or else the old one
    const subject = req.body.subject !== undefined ? req.body.subject.trim() : old.subject;
    const duration = req.body.duration !== undefined ? req.body.duration : old.duration;
    const studyDate = req.body.study_date !== undefined ? req.body.study_date : old.study_date;

    // Step C: UPDATE
    const result = await db.query(
      `UPDATE study_sessions
       SET subject = $1, duration = $2, study_date = $3
       WHERE id = $4
       RETURNING id, subject, duration, study_date, created_at`,
      [subject, duration, studyDate, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Study session not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Study session updated successfully',
      data: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// DELETE  ->  DELETE /api/study-sessions/:id   ->  SQL DELETE
// ---------------------------------------------------------------------
async function deleteStudySession(req, res, next) {
  try {
    const id = Number(req.params.id);

    const result = await db.query('DELETE FROM study_sessions WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Study session not found' });
    }

    res.status(200).json({ success: true, message: 'Study session deleted successfully' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createStudySession,
  getStudySessions,
  getStudySession,
  updateStudySession,
  deleteStudySession,
};
