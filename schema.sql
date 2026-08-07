-- AACP D1 schema — replaces the in-memory Maps in worker.js so accounts,
-- ACIA results, program enrollment, and audit history survive redeploys
-- and cold starts.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  phone TEXT,
  organization_name TEXT,
  job_title TEXT,
  institution_name TEXT,
  region TEXT,
  province TEXT,
  program_area TEXT,
  cohort_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  mfa_enabled INTEGER NOT NULL DEFAULT 0,
  mfa_secret TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  user_id TEXT,
  entity_type TEXT,
  details TEXT,
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

CREATE TABLE IF NOT EXISTS acia_results (
  user_id TEXT PRIMARY KEY,
  user_name TEXT,
  email TEXT,
  top_pathway TEXT NOT NULL,
  alignments TEXT NOT NULL,
  evidence_summary TEXT,
  completed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS program_enrollments (
  user_id TEXT PRIMARY KEY,
  user_name TEXT,
  email TEXT,
  cohort TEXT,
  enrolled_at TEXT NOT NULL,
  completed_at TEXT,
  weekly_progress INTEGER NOT NULL DEFAULT 0,
  validated_competencies TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS competency_scores (
  user_id TEXT PRIMARY KEY,
  pathway TEXT NOT NULL,
  ratings TEXT NOT NULL,
  completed_at TEXT NOT NULL
);