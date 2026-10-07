-- AACP Database Schema
-- =====================
-- NOTE: This file is a reference snapshot only.
-- The AUTHORITATIVE schema is defined in runMigrations() inside worker.js (line 158).
-- runMigrations() is fully self-contained, idempotent, and includes all tables,
-- indexes, ALTER TABLE additions, and seed data. It runs on every cold start.
--
-- This file reflects the base tables at initial project creation.
-- For the current full production schema including all added columns, read
-- runMigrations() in worker.js directly.
--
-- Last updated to match runMigrations() as of 2026-10-06.

CREATE TABLE IF NOT EXISTS users (
  id                       TEXT PRIMARY KEY,
  email                    TEXT UNIQUE NOT NULL,
  password_hash            TEXT NOT NULL,
  name                     TEXT NOT NULL,
  role                     TEXT NOT NULL,
  phone                    TEXT,
  organization_name        TEXT,
  job_title                TEXT,
  institution_name         TEXT,
  region                   TEXT,
  province                 TEXT,
  program_area             TEXT,
  cohort_id                TEXT,
  status                   TEXT NOT NULL DEFAULT 'pending',
  mfa_enabled              INTEGER NOT NULL DEFAULT 0,
  mfa_secret               TEXT,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL,
  career_stage             TEXT DEFAULT 'exploring',
  phone_normalized         TEXT,
  email_verified           INTEGER DEFAULT 0,
  password_change_required INTEGER DEFAULT 0,
  pilot_account            INTEGER DEFAULT 0,
  pilot_cohort             TEXT,
  invitation_id            TEXT,
  pilot_status             TEXT DEFAULT 'active',
  last_activity_at         TEXT
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  action      TEXT NOT NULL,
  user_id     TEXT,
  entity_type TEXT,
  details     TEXT,
  timestamp   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS acia_results (
  user_id          TEXT PRIMARY KEY,
  user_name        TEXT,
  email            TEXT,
  top_pathway      TEXT NOT NULL,
  alignments       TEXT NOT NULL,
  evidence_summary TEXT,
  completed_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS competency_scores (
  user_id      TEXT PRIMARY KEY,
  pathway      TEXT NOT NULL,
  ratings      TEXT NOT NULL,
  completed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS program_enrollments (
  user_id                TEXT PRIMARY KEY,
  user_name              TEXT,
  email                  TEXT,
  cohort                 TEXT,
  enrolled_at            TEXT NOT NULL,
  completed_at           TEXT,
  weekly_progress        INTEGER NOT NULL DEFAULT 0,
  validated_competencies TEXT NOT NULL DEFAULT '[]',
  program_version        TEXT NOT NULL DEFAULT '1.0',
  status                 TEXT NOT NULL DEFAULT 'active',
  start_date             TEXT,
  released_week          INTEGER NOT NULL DEFAULT 0
);

-- For the full schema including all runtime-created tables (61 total),
-- see runMigrations() in worker.js starting at line 158.
