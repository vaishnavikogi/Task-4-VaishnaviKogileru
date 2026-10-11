-- =====================================================================
-- FocusFlow sample data.  Run AFTER schema.sql.
-- WARNING: this first empties both tables (and restarts the id numbers at 1),
-- so running it again gives you the same clean sample data instead of duplicates.
-- =====================================================================

TRUNCATE TABLE tasks, study_sessions RESTART IDENTITY;

INSERT INTO tasks (title, description, completed) VALUES
    ('Practice Arrays',              'Solve 5 array problems on LeetCode',        FALSE),
    ('Study DBMS',                   'Revise normalization and SQL joins',        TRUE),
    ('Complete Internship Assignment', 'Finish the final project report',      FALSE),
    ('Solve Aptitude Questions',     NULL,                                        FALSE);

INSERT INTO study_sessions (subject, duration, study_date) VALUES
    ('Data Structures', 60, '2026-10-04'),
    ('DBMS',            45, '2026-10-03'),
    ('Python',          90, '2026-10-02');
