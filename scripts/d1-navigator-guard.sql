-- Career Navigator guardrail for D1 (aacp-db).
--
-- Career Navigator and the main AACP site share one D1 database. This guard stops
-- main-AACP maintenance (test-account cleanups, ad-hoc SQL) from deleting Career
-- Navigator accounts or data, which happened on 2026-11-25 (see CLAUDE.md).
--
-- 1. navigator_accounts registers every Career Navigator user. It is filled
--    automatically: a new user with role 'navigator', or any row written to
--    navigator_profiles / navigator_subscriptions / navigator_course_plans /
--    navigator_invite_redemptions, registers that user.
-- 2. Triggers abort (RAISE ABORT) any DELETE of a registered user, any change of
--    a registered user's role, any DELETE from a navigator_* table, and any
--    DELETE from navigator_accounts itself.
-- 3. Intentional deletions (e.g. a user's own erasure request) need a time-limited
--    override, added by the owner by hand:
--      INSERT INTO navigator_guard_override (reason, expires_at)
--      VALUES ('why', strftime('%Y-%m-%dT%H:%M:%fZ','now','+10 minutes'));
--
-- Apply:  npx wrangler d1 execute aacp-db --remote --config wrangler.toml --file scripts/d1-navigator-guard.sql
-- Safe to re-run (IF NOT EXISTS / OR IGNORE everywhere).

CREATE TABLE IF NOT EXISTS navigator_accounts (
  user_id TEXT PRIMARY KEY,
  registered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS navigator_guard_override (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reason TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Backfill: every existing Career Navigator user.
INSERT OR IGNORE INTO navigator_accounts (user_id) SELECT id FROM users WHERE role = 'navigator';
INSERT OR IGNORE INTO navigator_accounts (user_id) SELECT user_id FROM navigator_profiles WHERE user_id IS NOT NULL;
INSERT OR IGNORE INTO navigator_accounts (user_id) SELECT user_id FROM navigator_subscriptions WHERE user_id IS NOT NULL;
INSERT OR IGNORE INTO navigator_accounts (user_id) SELECT user_id FROM navigator_course_plans WHERE user_id IS NOT NULL;
INSERT OR IGNORE INTO navigator_accounts (user_id) SELECT redeemed_by FROM navigator_invite_redemptions WHERE redeemed_by IS NOT NULL;
-- Career Navigator accounts created before the 'navigator' role existed (role 'participant', active).
INSERT OR IGNORE INTO navigator_accounts (user_id) VALUES
  ('ab9430c4-7884-4ca5-93d1-e316dd2cde3a'),
  ('7c4e576b-ab6d-49be-8670-96728c3a5736'),
  ('0c1692f8-a5f3-4eed-80d1-808ad98b052d');

-- Auto-register new Career Navigator users.
CREATE TRIGGER IF NOT EXISTS nav_reg_users AFTER INSERT ON users WHEN NEW.role = 'navigator'
BEGIN INSERT OR IGNORE INTO navigator_accounts (user_id) VALUES (NEW.id); END;
CREATE TRIGGER IF NOT EXISTS nav_reg_profiles AFTER INSERT ON navigator_profiles
BEGIN INSERT OR IGNORE INTO navigator_accounts (user_id) VALUES (NEW.user_id); END;
CREATE TRIGGER IF NOT EXISTS nav_reg_subscriptions AFTER INSERT ON navigator_subscriptions
BEGIN INSERT OR IGNORE INTO navigator_accounts (user_id) VALUES (NEW.user_id); END;
CREATE TRIGGER IF NOT EXISTS nav_reg_course_plans AFTER INSERT ON navigator_course_plans
BEGIN INSERT OR IGNORE INTO navigator_accounts (user_id) VALUES (NEW.user_id); END;
CREATE TRIGGER IF NOT EXISTS nav_reg_redemptions AFTER INSERT ON navigator_invite_redemptions
BEGIN INSERT OR IGNORE INTO navigator_accounts (user_id) VALUES (NEW.redeemed_by); END;

-- Blocks (skipped only while an unexpired override row exists).
CREATE TRIGGER IF NOT EXISTS nav_guard_users_delete BEFORE DELETE ON users
WHEN (OLD.role = 'navigator' OR OLD.id IN (SELECT user_id FROM navigator_accounts))
 AND NOT EXISTS (SELECT 1 FROM navigator_guard_override WHERE expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
BEGIN SELECT RAISE(ABORT, 'navigator_guard: Career Navigator accounts cannot be deleted from main AACP'); END;

CREATE TRIGGER IF NOT EXISTS nav_guard_users_role BEFORE UPDATE OF role ON users
WHEN NEW.role IS NOT OLD.role
 AND (OLD.role = 'navigator' OR OLD.id IN (SELECT user_id FROM navigator_accounts))
 AND NOT EXISTS (SELECT 1 FROM navigator_guard_override WHERE expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
BEGIN SELECT RAISE(ABORT, 'navigator_guard: Career Navigator account roles cannot be changed'); END;

CREATE TRIGGER IF NOT EXISTS nav_guard_accounts_delete BEFORE DELETE ON navigator_accounts
WHEN NOT EXISTS (SELECT 1 FROM navigator_guard_override WHERE expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
BEGIN SELECT RAISE(ABORT, 'navigator_guard: navigator_accounts is protected'); END;

CREATE TRIGGER IF NOT EXISTS nav_guard_profiles_delete BEFORE DELETE ON navigator_profiles
WHEN NOT EXISTS (SELECT 1 FROM navigator_guard_override WHERE expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
BEGIN SELECT RAISE(ABORT, 'navigator_guard: navigator_profiles is protected'); END;

CREATE TRIGGER IF NOT EXISTS nav_guard_subscriptions_delete BEFORE DELETE ON navigator_subscriptions
WHEN NOT EXISTS (SELECT 1 FROM navigator_guard_override WHERE expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
BEGIN SELECT RAISE(ABORT, 'navigator_guard: navigator_subscriptions is protected'); END;

CREATE TRIGGER IF NOT EXISTS nav_guard_course_plans_delete BEFORE DELETE ON navigator_course_plans
WHEN NOT EXISTS (SELECT 1 FROM navigator_guard_override WHERE expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
BEGIN SELECT RAISE(ABORT, 'navigator_guard: navigator_course_plans is protected'); END;

CREATE TRIGGER IF NOT EXISTS nav_guard_redemptions_delete BEFORE DELETE ON navigator_invite_redemptions
WHEN NOT EXISTS (SELECT 1 FROM navigator_guard_override WHERE expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
BEGIN SELECT RAISE(ABORT, 'navigator_guard: navigator_invite_redemptions is protected'); END;

CREATE TRIGGER IF NOT EXISTS nav_guard_pilot_codes_delete BEFORE DELETE ON navigator_pilot_codes
WHEN NOT EXISTS (SELECT 1 FROM navigator_guard_override WHERE expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
BEGIN SELECT RAISE(ABORT, 'navigator_guard: navigator_pilot_codes is protected'); END;

-- Plan sharing (parent / teacher / counsellor view-only access). Same schema the Worker
-- creates lazily (ensureShareTable); revoking is a status change, never a delete.
CREATE TABLE IF NOT EXISTS navigator_plan_shares (
  id              TEXT PRIMARY KEY,
  student_user_id TEXT NOT NULL REFERENCES users(id),
  viewer_user_id  TEXT NOT NULL REFERENCES users(id),
  relationship    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TEXT NOT NULL,
  responded_at    TEXT,
  revoked_at      TEXT,
  revoked_by      TEXT
);
CREATE INDEX IF NOT EXISTS idx_nav_shares_student ON navigator_plan_shares(student_user_id, status);
CREATE INDEX IF NOT EXISTS idx_nav_shares_viewer ON navigator_plan_shares(viewer_user_id, status);

CREATE TRIGGER IF NOT EXISTS nav_guard_plan_shares_delete BEFORE DELETE ON navigator_plan_shares
WHEN NOT EXISTS (SELECT 1 FROM navigator_guard_override WHERE expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
BEGIN SELECT RAISE(ABORT, 'navigator_guard: navigator_plan_shares is protected'); END;

-- AACP™ Student IDs (random display codes; Career Navigator collects no names).
CREATE TABLE IF NOT EXISTS navigator_student_codes (
  user_id    TEXT PRIMARY KEY REFERENCES users(id),
  code       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS nav_reg_student_codes AFTER INSERT ON navigator_student_codes
BEGIN INSERT OR IGNORE INTO navigator_accounts (user_id) VALUES (NEW.user_id); END;
CREATE TRIGGER IF NOT EXISTS nav_guard_student_codes_delete BEFORE DELETE ON navigator_student_codes
WHEN NOT EXISTS (SELECT 1 FROM navigator_guard_override WHERE expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
BEGIN SELECT RAISE(ABORT, 'navigator_guard: navigator_student_codes is protected'); END;

CREATE TRIGGER IF NOT EXISTS nav_guard_invite_codes_delete BEFORE DELETE ON navigator_invite_codes
WHEN NOT EXISTS (SELECT 1 FROM navigator_guard_override WHERE expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
BEGIN SELECT RAISE(ABORT, 'navigator_guard: navigator_invite_codes is protected'); END;
