-- Phase I-2: import persistence schema (manual apply — not run by the app).
-- Persistence: Neon / Vercel Postgres
--
-- Conventions:
--   * Manual apply only: psql $DATABASE_URL -f db/migrations/002_create_import_persistence.sql
--   * No raw workbook / blob storage in MVP.
--   * RLS deferred to I-3/I-4 repository layer.
--   * Aligns with docs/context/phase-i-1-persistence-schema-design.md
--
-- Prerequisites: 001_create_audit_logs.sql (pgcrypto extension is idempotent).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- workspaces (minimal MVP stub)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS workspaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE workspaces IS
  'Minimal MVP workspace stub. Aligns with DEFAULT_WORKSPACE_ID env per deployment. '
  'Future Clerk organization mapping can reference workspaces.id.';

COMMENT ON COLUMN workspaces.id IS
  'Tenant identifier — must match server-resolved DEFAULT_WORKSPACE_ID; never client-supplied.';

-- ---------------------------------------------------------------------------
-- import_batches
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS import_batches (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        TEXT NOT NULL REFERENCES workspaces(id),
  status              TEXT NOT NULL,
  header_mode         TEXT NOT NULL,
  source_filename     TEXT,
  uploaded_by         TEXT,
  validation_passed   BOOLEAN NOT NULL DEFAULT false,
  account_count       INTEGER NOT NULL DEFAULT 0,
  contact_count       INTEGER NOT NULL DEFAULT 0,
  blocker_count       INTEGER NOT NULL DEFAULT 0,
  warning_count       INTEGER NOT NULL DEFAULT 0,
  info_count          INTEGER NOT NULL DEFAULT 0,
  is_active           BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  validated_at        TIMESTAMPTZ,
  applied_at          TIMESTAMPTZ,
  superseded_at       TIMESTAMPTZ,

  CONSTRAINT import_batches_status_check
    CHECK (status IN ('validated', 'applied', 'failed', 'superseded')),

  CONSTRAINT import_batches_header_mode_check
    CHECK (header_mode IN ('flat_row2', 'row2', 'legacy_single_row')),

  CONSTRAINT import_batches_account_count_nonneg
    CHECK (account_count >= 0),

  CONSTRAINT import_batches_contact_count_nonneg
    CHECK (contact_count >= 0),

  CONSTRAINT import_batches_blocker_count_nonneg
    CHECK (blocker_count >= 0),

  CONSTRAINT import_batches_warning_count_nonneg
    CHECK (warning_count >= 0),

  CONSTRAINT import_batches_info_count_nonneg
    CHECK (info_count >= 0)
);

COMMENT ON TABLE import_batches IS
  'Import lifecycle for Journey Import workbooks. One active applied batch per workspace. '
  'No raw workbook storage in MVP — counts and metadata only.';

COMMENT ON COLUMN import_batches.is_active IS
  'True for the current applied batch in a workspace. Previous batches are superseded, not deleted.';

CREATE INDEX IF NOT EXISTS idx_import_batches_workspace_id
  ON import_batches (workspace_id);

CREATE INDEX IF NOT EXISTS idx_import_batches_workspace_created_at
  ON import_batches (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_batches_workspace_active
  ON import_batches (workspace_id)
  WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS import_batches_one_active_per_workspace
  ON import_batches (workspace_id)
  WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- customer_accounts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS customer_accounts (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                  TEXT NOT NULL REFERENCES workspaces(id),
  import_batch_id               UUID NOT NULL REFERENCES import_batches(id),
  account_id                    TEXT NOT NULL,
  account_name                  TEXT NOT NULL,
  plan                          TEXT,
  journey_stage                 TEXT,
  use_case                      TEXT,
  primary_icp                   TEXT,
  term_start_date               DATE,
  activation_start_date         DATE,
  activation_window_end_date    DATE,
  renewal_date                  DATE,
  seats_purchased               INTEGER,
  search_seats_assigned         INTEGER,
  graph_browser_seats_assigned  INTEGER,
  graph_desktop_seats_assigned  INTEGER,
  search_active_users           INTEGER,
  graph_browser_active_users    INTEGER,
  graph_desktop_active_users    INTEGER,
  total_active_seats            INTEGER,
  total_sessions                INTEGER,
  onboarding_completed          BOOLEAN,
  onboarding_date               DATE,
  onboarding_age_days           INTEGER,
  near_threshold                BOOLEAN,
  active_users_7d               INTEGER,
  total_sessions_7d             INTEGER,
  active_users_15d              INTEGER,
  total_sessions_15d            INTEGER,
  active_users_30d              INTEGER,
  total_sessions_30d            INTEGER,
  active_users_100d             INTEGER,
  total_sessions_100d           INTEGER,
  invite_status                 TEXT,
  invite_sent_date              DATE,
  invite_accepted_date          DATE,
  notes                         TEXT,
  is_active                     BOOLEAN NOT NULL DEFAULT true,
  first_seen_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT customer_accounts_seats_purchased_nonneg
    CHECK (seats_purchased IS NULL OR seats_purchased >= 0),

  CONSTRAINT customer_accounts_search_seats_assigned_nonneg
    CHECK (search_seats_assigned IS NULL OR search_seats_assigned >= 0),

  CONSTRAINT customer_accounts_graph_browser_seats_assigned_nonneg
    CHECK (graph_browser_seats_assigned IS NULL OR graph_browser_seats_assigned >= 0),

  CONSTRAINT customer_accounts_graph_desktop_seats_assigned_nonneg
    CHECK (graph_desktop_seats_assigned IS NULL OR graph_desktop_seats_assigned >= 0),

  CONSTRAINT customer_accounts_search_active_users_nonneg
    CHECK (search_active_users IS NULL OR search_active_users >= 0),

  CONSTRAINT customer_accounts_graph_browser_active_users_nonneg
    CHECK (graph_browser_active_users IS NULL OR graph_browser_active_users >= 0),

  CONSTRAINT customer_accounts_graph_desktop_active_users_nonneg
    CHECK (graph_desktop_active_users IS NULL OR graph_desktop_active_users >= 0),

  CONSTRAINT customer_accounts_total_active_seats_nonneg
    CHECK (total_active_seats IS NULL OR total_active_seats >= 0),

  CONSTRAINT customer_accounts_total_sessions_nonneg
    CHECK (total_sessions IS NULL OR total_sessions >= 0),

  CONSTRAINT customer_accounts_onboarding_age_days_nonneg
    CHECK (onboarding_age_days IS NULL OR onboarding_age_days >= 0),

  CONSTRAINT customer_accounts_active_users_7d_nonneg
    CHECK (active_users_7d IS NULL OR active_users_7d >= 0),

  CONSTRAINT customer_accounts_total_sessions_7d_nonneg
    CHECK (total_sessions_7d IS NULL OR total_sessions_7d >= 0),

  CONSTRAINT customer_accounts_active_users_15d_nonneg
    CHECK (active_users_15d IS NULL OR active_users_15d >= 0),

  CONSTRAINT customer_accounts_total_sessions_15d_nonneg
    CHECK (total_sessions_15d IS NULL OR total_sessions_15d >= 0),

  CONSTRAINT customer_accounts_active_users_30d_nonneg
    CHECK (active_users_30d IS NULL OR active_users_30d >= 0),

  CONSTRAINT customer_accounts_total_sessions_30d_nonneg
    CHECK (total_sessions_30d IS NULL OR total_sessions_30d >= 0),

  CONSTRAINT customer_accounts_active_users_100d_nonneg
    CHECK (active_users_100d IS NULL OR active_users_100d >= 0),

  CONSTRAINT customer_accounts_total_sessions_100d_nonneg
    CHECK (total_sessions_100d IS NULL OR total_sessions_100d >= 0)
);

COMMENT ON TABLE customer_accounts IS
  'Durable account rows from flat Journey Import. Active set replaced on apply; '
  'superseded rows kept with is_active=false. No send-history columns in MVP.';

COMMENT ON COLUMN customer_accounts.account_id IS
  'Workbook business key. Maps to app Customer.customer_id.';

COMMENT ON COLUMN customer_accounts.account_name IS
  'Maps to app Customer.customer_name.';

CREATE INDEX IF NOT EXISTS idx_customer_accounts_workspace_account_id
  ON customer_accounts (workspace_id, account_id);

CREATE INDEX IF NOT EXISTS idx_customer_accounts_workspace_batch
  ON customer_accounts (workspace_id, import_batch_id);

CREATE INDEX IF NOT EXISTS idx_customer_accounts_workspace_active
  ON customer_accounts (workspace_id)
  WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS customer_accounts_active_account_unique
  ON customer_accounts (workspace_id, account_id)
  WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- customer_contacts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS customer_contacts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      TEXT NOT NULL REFERENCES workspaces(id),
  import_batch_id   UUID NOT NULL REFERENCES import_batches(id),
  account_id        TEXT NOT NULL,
  contact_email     TEXT NOT NULL,
  contact_name      TEXT,
  contact_role      TEXT,
  do_not_contact    BOOLEAN NOT NULL DEFAULT false,
  source            TEXT NOT NULL DEFAULT 'excel_import',
  is_active         BOOLEAN NOT NULL DEFAULT true,
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT customer_contacts_source_check
    CHECK (source IN ('excel_import', 'demo', 'manual')),

  CONSTRAINT customer_contacts_email_normalized
    CHECK (contact_email = lower(trim(contact_email)))
);

COMMENT ON TABLE customer_contacts IS
  'Durable contact rows — contact_email is the person source of truth. '
  'Soft-deactivate on re-import (is_active=false); no hard delete in MVP.';

COMMENT ON COLUMN customer_contacts.contact_email IS
  'Globally unique per workspace among active rows. Normalized lowercase at DB check; '
  'application write boundary must normalize before insert (Phase I-3+).';

CREATE INDEX IF NOT EXISTS idx_customer_contacts_workspace_email
  ON customer_contacts (workspace_id, contact_email);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_workspace_account
  ON customer_contacts (workspace_id, account_id);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_workspace_batch
  ON customer_contacts (workspace_id, import_batch_id);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_workspace_active
  ON customer_contacts (workspace_id)
  WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS customer_contacts_active_email_unique
  ON customer_contacts (workspace_id, contact_email)
  WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- import_validation_results
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS import_validation_results (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                  TEXT NOT NULL REFERENCES workspaces(id),
  import_batch_id               UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  passed                        BOOLEAN NOT NULL DEFAULT false,
  header_mode                   TEXT NOT NULL,
  format_label                  TEXT,
  account_count                 INTEGER NOT NULL DEFAULT 0,
  contact_count                 INTEGER NOT NULL DEFAULT 0,
  signal_count                  INTEGER NOT NULL DEFAULT 0,
  blocker_count                 INTEGER NOT NULL DEFAULT 0,
  warning_count                 INTEGER NOT NULL DEFAULT 0,
  info_count                    INTEGER NOT NULL DEFAULT 0,
  duplicate_contact_email_count INTEGER NOT NULL DEFAULT 0,
  orphan_contact_count          INTEGER NOT NULL DEFAULT 0,
  orphan_signal_count           INTEGER NOT NULL DEFAULT 0,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT import_validation_results_header_mode_check
    CHECK (header_mode IN ('flat_row2', 'row2', 'legacy_single_row')),

  CONSTRAINT import_validation_results_account_count_nonneg
    CHECK (account_count >= 0),

  CONSTRAINT import_validation_results_contact_count_nonneg
    CHECK (contact_count >= 0),

  CONSTRAINT import_validation_results_signal_count_nonneg
    CHECK (signal_count >= 0),

  CONSTRAINT import_validation_results_blocker_count_nonneg
    CHECK (blocker_count >= 0),

  CONSTRAINT import_validation_results_warning_count_nonneg
    CHECK (warning_count >= 0),

  CONSTRAINT import_validation_results_info_count_nonneg
    CHECK (info_count >= 0),

  CONSTRAINT import_validation_results_duplicate_contact_email_count_nonneg
    CHECK (duplicate_contact_email_count >= 0),

  CONSTRAINT import_validation_results_orphan_contact_count_nonneg
    CHECK (orphan_contact_count >= 0),

  CONSTRAINT import_validation_results_orphan_signal_count_nonneg
    CHECK (orphan_signal_count >= 0)
);

COMMENT ON TABLE import_validation_results IS
  'Validation summary counts per batch — no workbook contents. Counts-only for privacy.';

CREATE INDEX IF NOT EXISTS idx_import_validation_results_workspace_batch
  ON import_validation_results (workspace_id, import_batch_id);

CREATE INDEX IF NOT EXISTS idx_import_validation_results_workspace_created_at
  ON import_validation_results (workspace_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- import_row_issues
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS import_row_issues (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      TEXT NOT NULL REFERENCES workspaces(id),
  import_batch_id   UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  severity          TEXT NOT NULL,
  code              TEXT NOT NULL,
  message           TEXT NOT NULL,
  sheet_name        TEXT,
  row_number        INTEGER,
  account_id        TEXT,
  contact_email     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT import_row_issues_severity_check
    CHECK (severity IN ('blocker', 'warning', 'info')),

  CONSTRAINT import_row_issues_row_number_check
    CHECK (row_number IS NULL OR row_number >= 1)
);

COMMENT ON TABLE import_row_issues IS
  'Row-level validation issue metadata only. Do not store full parsed row contents or raw workbook data.';

COMMENT ON COLUMN import_row_issues.message IS
  'Human-readable issue text; keep minimal PII. Prefer code + row_number for debugging.';

CREATE INDEX IF NOT EXISTS idx_import_row_issues_workspace_batch
  ON import_row_issues (workspace_id, import_batch_id);

CREATE INDEX IF NOT EXISTS idx_import_row_issues_batch_severity
  ON import_row_issues (import_batch_id, severity);

CREATE INDEX IF NOT EXISTS idx_import_row_issues_account_id
  ON import_row_issues (account_id)
  WHERE account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_import_row_issues_contact_email
  ON import_row_issues (contact_email)
  WHERE contact_email IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS: deferred to Phase I-3/I-4 (repository + server-side workspace scoping).
-- ---------------------------------------------------------------------------
