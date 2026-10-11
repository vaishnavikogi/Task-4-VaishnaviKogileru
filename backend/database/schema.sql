-- =====================================================================
-- FocusFlow database schema (PostgreSQL)
-- Run this file first, then seed.sql.   It is safe to run more than once.
-- =====================================================================


-- ---------------------------------------------------------------------
-- tasks: things the student wants to get done
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
    id          SERIAL        PRIMARY KEY,                       -- auto-numbered 1, 2, 3 ...
    title       VARCHAR(100)  NOT NULL,                          -- required, max 100 characters
    description TEXT,                                            -- optional (NULL allowed)
    completed   BOOLEAN       NOT NULL DEFAULT FALSE,            -- new tasks start as not done
    created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- A title made only of spaces (or fewer than 3 real characters) is rejected by the database itself.
    CONSTRAINT tasks_title_min_length CHECK (char_length(trim(title)) >= 3)
);

-- Speeds up counting / filtering completed vs pending tasks (used by /api/stats)
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks (completed);


-- ---------------------------------------------------------------------
-- study_sessions: one row per study session
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS study_sessions (
    id          SERIAL        PRIMARY KEY,
    subject     VARCHAR(100)  NOT NULL,
    duration    INTEGER       NOT NULL,                          -- minutes
    study_date  DATE          NOT NULL,                          -- YYYY-MM-DD
    created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Duration must be a positive number of minutes, at most 10 hours (600).
    CONSTRAINT study_sessions_duration_valid CHECK (duration > 0 AND duration <= 600),
    CONSTRAINT study_sessions_subject_min_length CHECK (char_length(trim(subject)) >= 2)
);

-- The list endpoint sorts by study_date (newest first), so index that column.
CREATE INDEX IF NOT EXISTS idx_study_sessions_study_date ON study_sessions (study_date DESC);


-- ---------------------------------------------------------------------
-- Supabase only (harmless on a normal PostgreSQL):
-- Supabase exposes the public schema through an automatic REST API. Turning on
-- Row Level Security (with no policies) blocks that public API from reading or
-- writing these tables. This backend connects directly as the table owner,
-- which is not affected by RLS.
-- ---------------------------------------------------------------------
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;
