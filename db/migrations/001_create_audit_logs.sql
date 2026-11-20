-- Phase J-6B: append-only operator audit log (manual apply — not run by the app).
-- Persistence: Neon / Vercel Postgres
--
-- Conventions:
--   * Application code must INSERT only — no UPDATE/DELETE helpers.
--   * Phase I may add workspaces(id) and FK workspace_id later.
--   * Apply manually: psql $DATABASE_URL -f db/migrations/001_create_audit_logs.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    TEXT NOT NULL,
  actor_user_id   TEXT,
  actor_role      TEXT,
  action          TEXT NOT NULL,
  target_type     TEXT NOT NULL,
  target_id       TEXT,
  result          TEXT NOT NULL,
  metadata_json   JSONB NOT NULL DEFAULT '{}',
  source          TEXT NOT NULL DEFAULT 'api',
  severity        TEXT NOT NULL DEFAULT 'info',
  auth_required   BOOLEAN NOT NULL DEFAULT false,
  permission      TEXT,
  send_mode       TEXT,
  request_id      TEXT,
  ip_hash         TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE audit_logs IS 'Append-only operator audit trail (Phase J). No app UPDATE/DELETE.';
COMMENT ON COLUMN audit_logs.workspace_id IS 'Tenant scope; MVP uses DEFAULT_WORKSPACE_ID env per deployment.';
COMMENT ON COLUMN audit_logs.actor_user_id IS 'Clerk user id when auth active; NULL in demo mode.';
COMMENT ON COLUMN audit_logs.metadata_json IS 'Sanitized JSON; no secrets, bodies, or full uploads.';

CREATE INDEX IF NOT EXISTS audit_logs_workspace_created_idx
  ON audit_logs (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_action_created_idx
  ON audit_logs (action, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_actor_created_idx
  ON audit_logs (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_request_id_idx
  ON audit_logs (request_id);

-- Optional hardening (uncomment after review):
-- CREATE OR REPLACE FUNCTION audit_logs_deny_mutation()
-- RETURNS trigger LANGUAGE plpgsql AS $$
-- BEGIN
--   RAISE EXCEPTION 'audit_logs is append-only';
-- END;
-- $$;
-- CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs
--   FOR EACH ROW EXECUTE FUNCTION audit_logs_deny_mutation();
-- CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs
--   FOR EACH ROW EXECUTE FUNCTION audit_logs_deny_mutation();
