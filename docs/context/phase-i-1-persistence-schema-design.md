# Phase I-1 — Persistence Schema Design

> **Status:** ✅ Complete (design only)  
> **Prerequisite:** L-4F flat Journey Import stable ✅ · I-0 persistence audit ✅  
> **Next:** I-4 repository implementation (design in [phase-i-3-import-repository-design.md](phase-i-3-import-repository-design.md))

---

## 1. Executive decision

**Phase I-1 is schema design only.**

| Item | Decision |
|------|----------|
| SQL migrations | **Not written yet** |
| Neon apply | **Not in scope** |
| App code changes | **Not in scope** |
| Goal | Design durable persistence around the **stable L-4F flat Journey Import** path |

The public import format remains:

- Sheet: **Journey Import**
- Row 1 = readable labels (ignored by parser)
- Row 2 = system keys
- Row 3+ = data (one row = one account + one contact)
- `account_id` may repeat; `contact_email` is globally unique per workspace

Session apply today replaces `customers` and `importedContacts` with no DB write. Phase I will add server-side persist on apply while preserving replace semantics and import history.

---

## 2. Entity relationship overview

### ERD (text)

```
┌─────────────┐
│ workspaces  │
│  (optional  │
│   stub)     │
└──────┬──────┘
       │ 1
       │
       │ *
┌──────▼──────────────┐       1        *  ┌─────────────────────────┐
│   import_batches    │──────────────────│ import_validation_results│
│  status, is_active  │                  │  passed, counts, label   │
└──────┬──────────────┘                  └─────────────────────────┘
       │ 1
       │ *
       ├──────────────────────────────────┐
       │                                  │
       │ *                                │ *
┌──────▼──────────────┐          ┌───────▼────────────┐
│  customer_accounts  │          │  import_row_issues │
│  account_id (biz)   │          │  severity, code    │
└──────┬──────────────┘          └────────────────────┘
       │ 1
       │ *  (logical via account_id, not FK enforced in MVP)
┌──────▼──────────────┐
│  customer_contacts  │
│  contact_email (biz)│
└─────────────────────┘

Deferred (not in I-1/I-2):
  communication_logs, communication_summary, workflow_statuses,
  automation_rules, email_templates, email_sequences,
  sequence_enrollments, import_row_snapshots
```

### Required entities (I-1)

| Entity | Role |
|--------|------|
| `workspaces` | Tenant scope (optional stub in first migration) |
| `import_batches` | Import lifecycle + active batch pointer |
| `customer_accounts` | Durable account rows from flat import |
| `customer_contacts` | Durable contact rows (person source of truth) |
| `import_validation_results` | Summary counts per validate/apply attempt |
| `import_row_issues` | Row-level blockers/warnings/info metadata |

---

## 3. Table design: `workspaces`

Minimal future-ready tenant table.

| Column | Type (design) | Notes |
|--------|---------------|-------|
| `id` | TEXT PK | Matches `DEFAULT_WORKSPACE_ID` / future Clerk org id |
| `name` | TEXT NOT NULL | Display name |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

**MVP option:** First migration may **omit** this table and use `workspace_id TEXT` on child tables only, seeded from `DEFAULT_WORKSPACE_ID` env (same pattern as `audit_logs`). Add `workspaces` + FK when Clerk org mapping ships.

**Future:** Clerk organization → `workspaces.id`; membership in separate `workspace_members` (Phase J doc).

---

## 4. Table design: `import_batches`

One row per upload validate/apply cycle.

| Column | Type (design) | Notes |
|--------|---------------|-------|
| `id` | UUID PK | |
| `workspace_id` | TEXT NOT NULL | Server-resolved only |
| `status` | TEXT NOT NULL | `validated` \| `applied` \| `failed` \| `superseded` |
| `header_mode` | TEXT NOT NULL | `flat_row2` \| `row2` \| `legacy_single_row` |
| `source_filename` | TEXT | Sanitized original name; optional |
| `uploaded_by` | TEXT | Clerk `userId`; NULL in demo |
| `validation_passed` | BOOLEAN NOT NULL | |
| `account_count` | INTEGER NOT NULL DEFAULT 0 | |
| `contact_count` | INTEGER NOT NULL DEFAULT 0 | |
| `blocker_count` | INTEGER NOT NULL DEFAULT 0 | |
| `warning_count` | INTEGER NOT NULL DEFAULT 0 | |
| `info_count` | INTEGER NOT NULL DEFAULT 0 | |
| `is_active` | BOOLEAN NOT NULL DEFAULT false | True for current applied batch |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `validated_at` | TIMESTAMPTZ | Set on validate |
| `applied_at` | TIMESTAMPTZ | Set on successful apply |
| `superseded_at` | TIMESTAMPTZ | Set when replaced by newer apply |

### Indexes / constraints

| Name | Definition |
|------|------------|
| `import_batches_workspace_id_idx` | `(workspace_id)` |
| `import_batches_workspace_created_idx` | `(workspace_id, created_at DESC)` |
| `import_batches_workspace_active_idx` | `(workspace_id, is_active)` WHERE `is_active = true` |
| `import_batches_one_active_per_workspace` | **UNIQUE** `(workspace_id)` WHERE `is_active = true AND status = 'applied'` |

### Rules

- **One active applied batch per workspace** (partial unique index above).
- On apply: previous active batch → `status = superseded`, `is_active = false`, `superseded_at = now()`.
- **No raw workbook blob** in MVP.
- Failed validate: batch may remain `failed` with `validation_passed = false`; never becomes active.

---

## 5. Table design: `customer_accounts`

Durable account fields aligned with `FLAT_ROW2_ACCOUNT_KEYS` / flat Journey Import.

| Column | Type (design) | Flat key / app mapping |
|--------|---------------|------------------------|
| `id` | UUID PK | |
| `workspace_id` | TEXT NOT NULL | |
| `import_batch_id` | UUID NOT NULL FK → `import_batches.id` | |
| `account_id` | TEXT NOT NULL | → `Customer.customer_id` |
| `account_name` | TEXT NOT NULL | → `Customer.customer_name` |
| `plan` | TEXT | |
| `journey_stage` | TEXT | → `Customer.stage` |
| `use_case` | TEXT | |
| `primary_icp` | TEXT | → `Customer.icp` |
| `term_start_date` | DATE | |
| `activation_start_date` | DATE | → onboarding_start (rollup) |
| `activation_window_end_date` | DATE | |
| `renewal_date` | DATE | |
| `seats_purchased` | INTEGER | → `Customer.seats_total` |
| `search_seats_assigned` | INTEGER | |
| `graph_browser_seats_assigned` | INTEGER | |
| `graph_desktop_seats_assigned` | INTEGER | → summed into `seats_assigned` |
| `search_active_users` | INTEGER | |
| `graph_browser_active_users` | INTEGER | |
| `graph_desktop_active_users` | INTEGER | |
| `total_active_seats` | INTEGER | → `Customer.active_users` |
| `total_sessions` | INTEGER | → `Customer.usage_sessions` |
| `onboarding_completed` | TEXT | `Yes` / `No` |
| `onboarding_date` | DATE | |
| `onboarding_age_days` | INTEGER | |
| `near_threshold` | TEXT | |
| `active_users_7d` | INTEGER | |
| `total_sessions_7d` | INTEGER | |
| `active_users_15d` | INTEGER | |
| `total_sessions_15d` | INTEGER | |
| `active_users_30d` | INTEGER | |
| `total_sessions_30d` | INTEGER | |
| `active_users_100d` | INTEGER | |
| `total_sessions_100d` | INTEGER | |
| `invite_status` | TEXT | |
| `invite_sent_date` | DATE | |
| `invite_accepted_date` | DATE | |
| `notes` | TEXT | |
| `is_active` | BOOLEAN NOT NULL DEFAULT true | |
| `first_seen_at` | TIMESTAMPTZ | First import that introduced account |
| `last_seen_at` | TIMESTAMPTZ | Latest import that included account |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

### Indexes / constraints

| Name | Definition |
|------|------------|
| `customer_accounts_workspace_account_idx` | `(workspace_id, account_id)` |
| `customer_accounts_workspace_batch_idx` | `(workspace_id, import_batch_id)` |
| `customer_accounts_workspace_active_idx` | `(workspace_id, is_active)` WHERE `is_active = true` |
| `customer_accounts_active_account_unique` | **UNIQUE** `(workspace_id, account_id)` WHERE `is_active = true` |

### Rollup note

Repository layer (I-3+) maps rows → existing `Customer` shape for UI. Fields **not** in flat import (e.g. `last_email_sent_date`, `account_owner`, `admin_email`) remain empty/default on rollup until Communication Logs sync (L-4G / K-2).

**Dedup rule:** Multiple flat rows with same `account_id` → one account row per batch (first data row wins), matching L-4B parser.

---

## 6. Table design: `customer_contacts`

| Column | Type (design) | Notes |
|--------|---------------|-------|
| `id` | UUID PK | |
| `workspace_id` | TEXT NOT NULL | |
| `import_batch_id` | UUID NOT NULL FK → `import_batches.id` | |
| `account_id` | TEXT NOT NULL | Links to account context |
| `contact_email` | TEXT NOT NULL | Normalized lowercase at write |
| `contact_name` | TEXT | |
| `contact_role` | TEXT NOT NULL | Admin / User / CSM / other |
| `do_not_contact` | BOOLEAN NOT NULL DEFAULT false | |
| `source` | TEXT NOT NULL DEFAULT `excel_import` | Matches `ImportedContactSource` |
| `is_active` | BOOLEAN NOT NULL DEFAULT true | |
| `first_seen_at` | TIMESTAMPTZ | |
| `last_seen_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

### Indexes / constraints

| Name | Definition |
|------|------------|
| `customer_contacts_workspace_email_idx` | `(workspace_id, contact_email)` |
| `customer_contacts_workspace_account_idx` | `(workspace_id, account_id)` |
| `customer_contacts_workspace_batch_idx` | `(workspace_id, import_batch_id)` |
| `customer_contacts_workspace_active_idx` | `(workspace_id, is_active)` WHERE `is_active = true` |
| `customer_contacts_active_email_unique` | **UNIQUE** `(workspace_id, contact_email)` WHERE `is_active = true` |

### Rules

- `contact_email` is the **person source of truth** (contact-first architecture).
- On re-apply: contacts not in new batch → `is_active = false` (soft inactive, not hard delete).
- One contact row per workbook data row in the active batch.
- L-2/L-1 imports use same tables; `header_mode` on batch records format.

---

## 7. Table design: `import_validation_results`

Summary only — mirrors `ValidationResult.importSummary`.

| Column | Type (design) | Notes |
|--------|---------------|-------|
| `id` | UUID PK | |
| `workspace_id` | TEXT NOT NULL | |
| `import_batch_id` | UUID NOT NULL FK → `import_batches.id` | |
| `passed` | BOOLEAN NOT NULL | |
| `header_mode` | TEXT NOT NULL | |
| `format_label` | TEXT | e.g. `Flat Row 2 workbook` |
| `account_count` | INTEGER NOT NULL DEFAULT 0 | |
| `contact_count` | INTEGER NOT NULL DEFAULT 0 | |
| `signal_count` | INTEGER NOT NULL DEFAULT 0 | Always 0 for flat |
| `blocker_count` | INTEGER NOT NULL DEFAULT 0 | |
| `warning_count` | INTEGER NOT NULL DEFAULT 0 | |
| `info_count` | INTEGER NOT NULL DEFAULT 0 | |
| `duplicate_contact_email_count` | INTEGER NOT NULL DEFAULT 0 | |
| `orphan_contact_count` | INTEGER NOT NULL DEFAULT 0 | |
| `orphan_signal_count` | INTEGER NOT NULL DEFAULT 0 | |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

**Cardinality:** One validation result row per validate attempt on a batch. Re-validate before apply may insert a new result row or replace latest — **prefer latest row per batch** (I-3 implementation detail). Counts-only; no workbook payload.

---

## 8. Table design: `import_row_issues`

Row-level issue metadata from cross-validation.

| Column | Type (design) | Notes |
|--------|---------------|-------|
| `id` | UUID PK | |
| `workspace_id` | TEXT NOT NULL | |
| `import_batch_id` | UUID NOT NULL FK → `import_batches.id` | |
| `severity` | TEXT NOT NULL | `blocker` \| `warning` \| `info` |
| `code` | TEXT NOT NULL | e.g. `CONTACT_DUPLICATE_EMAIL` |
| `message` | TEXT NOT NULL | Truncated if needed (e.g. 500 chars) |
| `sheet_name` | TEXT | `Journey Import` for flat |
| `row_number` | INTEGER | 1-based sheet row (≥ 3 for data) |
| `account_id` | TEXT | Optional context |
| `contact_email` | TEXT | Optional; normalized if present |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

### Rules

- Store **issue metadata only** — not full row cell contents.
- Avoid duplicating large PII in `message`; prefer `code` + row number.
- Future compliance: optional `contact_email_hash` column if raw email in issues is restricted.
- Issues for superseded batches remain for import history.

---

## 9. Deferred tables

| Table | Why deferred | When to add |
|-------|--------------|-------------|
| `communication_logs` | K-1 is session/demo; SendGrid K-2 separate | Phase K persistence / K-2 webhook |
| `communication_summary` | Flat import has no send history; derive later | L-4G + after logs persist |
| `workflow_statuses` | Action Queue review state is session-only by design | Post-I when operators need durable review |
| `automation_rules` | Still `localStorage` | Dedicated config persistence phase |
| `email_templates` | Still `localStorage` | Same |
| `email_sequences` | Still `localStorage` | Same |
| `sequence_enrollments` | Tied to `contact_email`; localStorage | After contacts persist + enrollment UX |
| `import_row_snapshots` | Privacy/storage cost; replay rarely needed | Only if compliance requires full row audit |

---

## 10. Replace / re-upload behavior

### Transaction outline (apply)

```
BEGIN;
  -- 1. Guard: batch.validation_passed = true, status = validated
  -- 2. Supersede prior active batch (if any)
  UPDATE import_batches SET status = 'superseded', is_active = false, superseded_at = now()
    WHERE workspace_id = $ws AND is_active = true AND status = 'applied';
  UPDATE customer_accounts SET is_active = false, updated_at = now()
    WHERE workspace_id = $ws AND is_active = true;
  UPDATE customer_contacts SET is_active = false, updated_at = now()
    WHERE workspace_id = $ws AND is_active = true;

  -- 3. Insert new active accounts + contacts for this batch
  INSERT INTO customer_accounts (...) SELECT ...;
  INSERT INTO customer_contacts (...) SELECT ...;

  -- 4. Activate batch
  UPDATE import_batches SET status = 'applied', is_active = true, applied_at = now()
    WHERE id = $batch_id;
COMMIT;
```

### Validate (no apply)

- Create `import_batches` row: `status = validated` or `failed` based on pass/fail.
- Insert `import_validation_results` + `import_row_issues`.
- Do **not** set `is_active` or mutate active accounts/contacts.

### Guarantees

| Behavior | Durable equivalent |
|----------|-------------------|
| Apply replaces customers | Active account set replaced |
| Apply replaces importedContacts | Active contact set replaced |
| Re-upload no duplication | Supersede + inactive old rows |
| Removed contact disappears | Not in new active contact set |
| History preserved | Superseded batches + issues remain queryable |

---

## 11. Demo mode behavior

**Preferred MVP:**

| Condition | UI data source |
|-----------|----------------|
| Active applied batch exists in DB | Load persisted accounts + contacts |
| No active batch | Show demo seed (`mock-data`) |

**Use Demo Data** (current UI): switches client to demo seed **without deleting DB rows** in MVP. Persisted active batch remains until operator applies a new import or an explicit “clear active import” action is added later.

`dataSource` in provider becomes derived: `upload` when active batch loaded; `demo` otherwise.

---

## 12. Action Queue behavior

| Item | Phase I decision |
|------|------------------|
| `actionQueue` | **Derived** from active customers + rules + enrollments — never persisted |
| `workflowStatuses` | **Session-only** (React state); cleared on apply like today |
| Re-import | Clears session workflow statuses; queue recomputed from new active data |
| Future workflow DB | Key by **`action_id` + `contact_email` / `account_id`**, not `import_batch_id` |

Action IDs today: `{customer_id}-{rule_id}` for triggers. Sequence items use enrollment + contact context.

---

## 13. Reports behavior

| Report area | Data source (post-I) |
|-------------|----------------------|
| Executive / Account / Contact Journey | **Active** accounts + contacts only |
| Import Quality | Latest **applied** (or last **validated**) batch + `import_validation_results` + issues |
| Import History (I-6 UI) | Historical `import_batches` — read-only |
| Communication / Sequences | Session/localStorage until those phases persist |
| Reports snapshot | **Never persisted** — computed at request time |

---

## 14. Communication history behavior

Flat Journey Import **does not include**:

- `last_email_sent_date`
- `last_email_sent_type`
- `emails_sent_count`

**Phase I:** Do **not** block account/contact persistence on missing send history. Rollup leaves send fields empty/zero.

**Cooling / duplicate protection:** Unchanged for I — uses `Customer.last_email_sent_date` / `emails_sent_count` when present; Communication Logs when durable (K-2 / L-4G).

**Future:** Derive send history by `contact_email` from `communication_logs` + optional `communication_summary`.

Persist info issue `COMMUNICATION_HISTORY_NOT_IMPORTED` on batch where applicable.

---

## 15. Security / privacy

| Rule | Implementation |
|------|----------------|
| No raw workbook in MVP | No BLOB column on `import_batches` |
| No email bodies / template HTML | Not in import tables |
| No secrets in DB rows | Env keys stay in Vercel |
| `workspace_id` | Server-resolved from env/session — never trust client |
| RBAC | Future persist API requires `upload_customer_data` |
| Audit | Counts-only metadata (existing `EXCEL_IMPORT_AUDIT_COUNT_KEYS`) |
| Row issues | Minimal PII; codes + row numbers |
| Query scope | All reads/writes filter `workspace_id` |
| Retention | Policy for superseded batches TBD (e.g. 90-day archive) — defer to I-6/I-7 |

Align with existing `audit_logs` conventions (`db/migrations/001_create_audit_logs.sql`).

---

## 16. Index and constraint summary

### Unique constraints (partial)

| Table | Constraint |
|-------|------------|
| `import_batches` | ONE `(workspace_id)` WHERE `is_active AND status = 'applied'` |
| `customer_accounts` | ONE `(workspace_id, account_id)` WHERE `is_active` |
| `customer_contacts` | ONE `(workspace_id, contact_email)` WHERE `is_active` |

### Indexes

| Table | Index |
|-------|-------|
| `import_batches` | `(workspace_id)`, `(workspace_id, created_at DESC)`, `(workspace_id, is_active)` partial |
| `customer_accounts` | `(workspace_id, account_id)`, `(workspace_id, import_batch_id)`, `(workspace_id, is_active)` partial |
| `customer_contacts` | `(workspace_id, contact_email)`, `(workspace_id, account_id)`, `(workspace_id, import_batch_id)`, `(workspace_id, is_active)` partial |
| `import_validation_results` | `(import_batch_id)`, `(workspace_id, created_at DESC)` |
| `import_row_issues` | `(import_batch_id)`, `(workspace_id, severity)`, `(import_batch_id, severity)` |

### Foreign keys (I-2)

- `customer_accounts.import_batch_id` → `import_batches.id`
- `customer_contacts.import_batch_id` → `import_batches.id`
- `import_validation_results.import_batch_id` → `import_batches.id`
- `import_row_issues.import_batch_id` → `import_batches.id`
- `workspaces.id` → optional FK on `workspace_id` when stub table exists

---

## 17. Migration readiness checklist

| Item | Status |
|------|--------|
| Table names approved | ✅ Proposed above |
| Status enum values (`validated`, `applied`, `failed`, `superseded`) | ✅ |
| Active-batch strategy (partial unique + soft inactive) | ✅ |
| Raw workbook storage (none in MVP) | ✅ |
| `workspaces` stub (optional in I-2) | ⏳ Open — recommend optional stub row seeded from env |
| `contact_email` uniqueness per workspace (active) | ✅ |
| Retention policy | ⏳ Deferred |
| Demo mode (no active batch → demo) | ✅ |

---

## 18. Recommended I-2 scope

**I-2 = manual SQL migration draft only.**

| In scope | Out of scope |
|----------|--------------|
| `db/migrations/002_create_import_persistence.sql` (draft) | Auto-apply to Neon |
| CREATE TABLE / INDEX / CHECK / COMMENT | App repository code |
| Verify script: file exists, table names match design | DB connection required |

Suggested verify script (I-2): `scripts/verify-i-2-schema-draft.ts` — parse SQL file for expected table names; no live DB.

---

## I-2 — SQL migration draft (complete)

**Status:** ✅ Complete (draft only — **not applied to Neon**)

| Item | Value |
|------|--------|
| File | `db/migrations/002_create_import_persistence.sql` |
| Verify | `npx tsx scripts/verify-i-2-schema-draft.ts` |
| Apply | Manual only when ready: `psql $DATABASE_URL -f db/migrations/002_create_import_persistence.sql` |
| App wiring | **Not started** (I-3+) |
| RLS | Deferred to I-3/I-4 |

Tables: `workspaces`, `import_batches`, `customer_accounts`, `customer_contacts`, `import_validation_results`, `import_row_issues`.

No raw workbook storage. No `communication_logs` or `workflow_statuses` tables in this migration.

---

## Phase map (reference)

| Phase | Scope |
|-------|--------|
| **I-0** | Architecture audit ✅ |
| **I-1** | Schema design (this doc) ✅ |
| **I-2** | SQL migration draft ✅ |
| **I-3** | Repository design ✅ — [phase-i-3-import-repository-design.md](phase-i-3-import-repository-design.md) |
| **I-4A** | Repository foundation ✅ |
| **I-4B** | Atomic transaction + live verification ✅ |
| **I-5** | API/persist-on-apply wiring |
| **I-6** | Import history UI |
| **I-7** | Stable verification |

---

## Decision

**Ready for I-2 SQL migration draft:** ✅ **YES**

Open decisions for I-2 kickoff:

1. Include `workspaces` stub table vs TEXT-only `workspace_id` (recommend: optional stub + seed row).
2. Exact `message` max length on `import_row_issues`.
3. Retention policy timing (can remain documented deferral).
