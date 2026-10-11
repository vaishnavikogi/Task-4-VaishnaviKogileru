// Task controller: CRUD for the `tasks` table.
//
// Every handler follows the same flow:
//   Request -> Validation (middleware, already done) -> SQL query -> Database -> Result -> HTTP response
//
// Every SQL query uses placeholders ($1, $2 ...) and the values are passed separately
// in an array. User input is NEVER glued into the SQL text.
//
// The handlers are async (database calls take time). Express 4 does not catch errors
// thrown inside async functions, so each handler uses try/catch and calls next(err);
// the error handler middleware then sends the JSON error response.

const db = require('../config/db');


// ---------------------------------------------------------------------
// CREATE  ->  POST /api/tasks   ->  SQL INSERT
// ---------------------------------------------------------------------
async function createTask(req, res, next) {
  try {
    // 1. Request: read the data the client sent (already validated by validateTaskCreate)
    const title = req.body.title.trim();
    const description = req.body.description === undefined ? null : req.body.description;

    // 2. SQL query (placeholders $1, $2) + 3. Database
    //    id, completed, created_at and updated_at are filled in by the database defaults.
    //    RETURNING gives us back the row that was just inserted.
    const result = await db.query(
      `INSERT INTO tasks (title, description)
       VALUES ($1, $2)
       RETURNING id, title, description, completed, created_at, updated_at`,
      [title, description]
    );

    // 4. Result: the new row  ->  5. HTTP response: 201 Created
    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      data: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// READ ALL  ->  GET /api/tasks   ->  SQL SELECT
// ---------------------------------------------------------------------
async function getTasks(req, res, next) {
  try {
    // No user input here, so no parameters are needed.
    const result = await db.query(`SELECT id, title, description, completed, created_at, updated_at FROM tasks ORDER BY id`);

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
// READ ONE  ->  GET /api/tasks/:id   ->  SQL SELECT ... WHERE id = $1
// ---------------------------------------------------------------------
async function getTask(req, res, next) {
  try {
    const id = Number(req.params.id); // already validated by validateId

    const result = await db.query(`SELECT id, title, description, completed, created_at, updated_at FROM tasks WHERE id = $1`, [id]);

    // No row came back -> that id does not exist -> 404
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// UPDATE  ->  PUT /api/tasks/:id   ->  SQL UPDATE
// The client may send any of title / description / completed.
// Fields that were not sent keep their current value.
// ---------------------------------------------------------------------
async function updateTask(req, res, next) {
  try {
    const id = Number(req.params.id);

    // Step A: load the current row (so we can keep the fields that were not sent)
    const current = await db.query('SELECT title, description, completed FROM tasks WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    const old = current.rows[0];

    // Step B: choose the new value for each column: the one sent, or else the old one
    const title = req.body.title !== undefined ? req.body.title.trim() : old.title;
    const description = req.body.description !== undefined ? req.body.description : old.description;
    const completed = req.body.completed !== undefined ? req.body.completed : old.completed;

    // Step C: UPDATE the row. updated_at is set to the current time.
    const result = await db.query(
      `UPDATE tasks
       SET title = $1, description = $2, completed = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, title, description, completed, created_at, updated_at`,
      [title, description, completed, id]
    );

    // The row could have been deleted by someone else between step A and step C
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Task updated successfully',
      data: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// DELETE  ->  DELETE /api/tasks/:id   ->  SQL DELETE
// ---------------------------------------------------------------------
async function deleteTask(req, res, next) {
  try {
    const id = Number(req.params.id);

    // rowCount tells us how many rows were deleted (0 = the id did not exist)
    const result = await db.query('DELETE FROM tasks WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    res.status(200).json({ success: true, message: 'Task deleted successfully' });
  } catch (err) {
    next(err);
  }
}

module.exports = { createTask, getTasks, getTask, updateTask, deleteTask };
