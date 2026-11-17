-- OSCA 2026 Workshop Schema
-- Run once per environment before starting the workshop server.

CREATE TABLE IF NOT EXISTS workshop_sessions (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'waiting',  -- waiting | active | closed
  current_q   INT  NOT NULL DEFAULT -1,         -- -1 = none active
  presenter_pin TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workshop_responses (
  id              SERIAL PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES workshop_sessions(id) ON DELETE CASCADE,
  question_id     INT  NOT NULL,
  participant_id  TEXT NOT NULL,
  response        JSONB NOT NULL,
  moderated       BOOLEAN NOT NULL DEFAULT TRUE,  -- MCQ/word cloud: auto-approved; open text: needs review
  visible         BOOLEAN NOT NULL DEFAULT TRUE,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, question_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_wr_session_q ON workshop_responses(session_id, question_id);

CREATE TABLE IF NOT EXISTS workshop_contacts (
  id              SERIAL PRIMARY KEY,
  session_id      TEXT NOT NULL,
  name            TEXT NOT NULL,
  organization    TEXT NOT NULL,
  email           TEXT NOT NULL,
  area_of_interest TEXT,
  consent         BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
