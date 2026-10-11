// Stats controller: productivity statistics calculated by PostgreSQL itself.
//
//   COUNT(*)  -> how many rows
//   SUM(x)    -> add up a column
//   FILTER    -> count only the rows that match a condition
//
// Nothing is hard-coded: every number comes from the data in the tables right now.
// There is no user input in these queries, so no parameters are needed.

const db = require('../config/db');

// GET /api/stats
async function getStats(req, res, next) {
  try {
    // ::int turns PostgreSQL's big numbers (returned by COUNT/SUM as text) into normal integers.
    // COALESCE(SUM(...), 0) gives 0 instead of NULL when there are no study sessions.
    const [tasks, sessions] = await Promise.all([
      db.query(
        `SELECT COUNT(*)::int                                AS total_tasks,
                COUNT(*) FILTER (WHERE completed)::int       AS completed_tasks,
                COUNT(*) FILTER (WHERE NOT completed)::int   AS pending_tasks
         FROM tasks`
      ),
      db.query(
        `SELECT COUNT(*)::int                      AS total_study_sessions,
                COALESCE(SUM(duration), 0)::int    AS total_study_minutes
         FROM study_sessions`
      ),
    ]);

    res.status(200).json({
      success: true,
      message: 'Statistics calculated successfully',
      data: {
        totalTasks: tasks.rows[0].total_tasks,
        completedTasks: tasks.rows[0].completed_tasks,
        pendingTasks: tasks.rows[0].pending_tasks,
        totalStudySessions: sessions.rows[0].total_study_sessions,
        totalStudyMinutes: sessions.rows[0].total_study_minutes,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getStats };
