# Phase I-3 — Import Persistence Repository Design

> **Status:** ✅ Complete (I-4A foundation implemented)  
> **Prerequisite:** L-4F flat Journey Import stable ✅ · I-1 schema design ✅ · I-2 SQL draft ✅ (not applied)  
> **Next:** I-4B transaction review with live DB · I-5 API wiring after SQL apply

---

## 1. Executive decision

**Phase I-3 is repository/API design only.**

| Item | Decision |
|------|----------|
| Repository TypeScript modules | **Designed, not implemented** |
| API routes | **Not in I-3** (I-4) |
| UI wiring | **Not in I-3** (I-5) |
| Neon apply / DB connection | **Not in scope** |
| Goal | Define server-only repository layer for durable import data using I-2 schema |

The app continues session-only `customers` / `importedContacts` until I-4 wires the service.

---

## 2. Existing DB helper pattern (audit reference)

Audit logging is the only live DB integration today. Import persistence should **mirror these conventions** without modifying audit code.

### 2.1 Connection creation

| File | Role |
|------|------|
| `lib/audit/audit-db.ts` | Lazy Neon client factory |
| `lib/audit/audit-env.ts` | Env flags + workspace id resolution |
| `lib/audit/audit-log.ts` | Write boundary + error handling |

**Pattern:**

```typescript
import "server-only";
import { neon } from "@neondatabase/serverless";

let cachedSql: NeonQueryFunction | null = null;

export function getAuditSql(): NeonQueryFunction | null {
  if (!isAuditEnabled()) return null;
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return null;
  // cache neon(databaseUrl)
  return cachedSql;
}
```

Import persistence will add parallel helpers:

| Planned file | Role |
|--------------|------|
| `lib/import-persistence/import-persistence-db.ts` | `getImportPersistenceSql()` — same lazy cache pattern |
| `lib/import-persistence/import-persistence-env.ts` | `shouldPersistImport()`, `getDefaultWorkspaceId()` re-export or thin wrapper |

**Shared env:**

| Variable | Used by | Notes |
|----------|---------|-------|
| `DATABASE_URL` | Audit + import persistence | Neon connection string; server-only |
| `AUDIT_ENABLED` | Audit only | Default `false`; explicit opt-in |
| `DEFAULT_WORKSPACE_ID` | Audit + import persistence | Server-resolved tenant id; fallback `ws_unconfigured` |
| `IMPORT_PERSISTENCE_ENABLED` | Import persistence (I-4) | **Proposed** — default `false`; mirrors audit opt-in |

### 2.2 Server-only boundaries

- All repository modules import `"server-only"`.
- `getImportPersistenceSql()` never exported to client bundles.
- `workspace_id` resolved via `getDefaultWorkspaceId()` from env — **never from client body**.

### 2.3 Disabled / missing DB config

| Condition | Audit behavior | Import persistence (proposed) |
|-----------|----------------|--------------------------------|
| Feature flag off | `writeAuditLog` no-ops | Service methods return `{ ok: false, reason: "disabled" }` or `null` |
| `DATABASE_URL` missing | `getAuditSql()` → `null`; log stderr; no-op | `getImportPersistenceSql()` → `null`; no writes |
| DB insert failure | Catch, log stderr, **never throw** | Apply path: **throw to caller** for transaction rollback; load path: return `null` + log |

**Important difference:** Audit is fire-and-forget (never throws). Import **apply** must fail atomically and surface a safe error to the API layer (I-4). **Load** should degrade gracefully (fall back to session/demo).

### 2.4 Error handling summary

```
Audit write:     disabled → no-op | missing URL → no-op | SQL error → log, swallow
Import load:     disabled → null  | missing URL → null  | SQL error → log, null
Import apply:    disabled → reject | missing URL → reject | SQL error → ROLLBACK, safe error
```

---

## 3. Repository module layout

All modules live under `lib/import-persistence/` and are **server-only**.

| Module | File |
|--------|------|
| Env + SQL client | `lib/import-persistence/import-persistence-env.ts`, `lib/import-persistence/import-persistence-db.ts` |
| Batch lifecycle | `lib/import-persistence/import-batch-repository.ts` |
| Account rows | `lib/import-persistence/customer-account-repository.ts` |
| Contact rows | `lib/import-persistence/customer-contact-repository.ts` |
| Validation metadata | `lib/import-persistence/import-validation-repository.ts` |
| Orchestration | `lib/import-persistence/import-persistence-service.ts` |
| Row mappers (pure) | `lib/import-persistence/import-persistence-mappers.ts` (optional helper — keeps repos thin) |

No API routes in I-3. I-4 adds e.g. `POST /api/import/apply` behind `upload_customer_data`.

---

## 4. Repository responsibilities

### 4.1 `ImportBatchRepository`

| Method | Responsibility |
|--------|----------------|
| `createBatch(input)` | Insert row with `status = validated` or `failed` based on `validation_passed` |
| `createAppliedBatch(input)` | Insert row directly as `applied`, `is_active = true` (used inside apply transaction) |
| `markBatchApplied(batchId)` | Set `status = applied`, `is_active = true`, `applied_at = now()` |
| `markPreviousActiveBatchSuperseded(workspaceId)` | Update prior active batch: `is_active = false`, `status = superseded`, `superseded_at = now()` |
| `findActiveBatchForWorkspace(workspaceId)` | Single row WHERE `is_active = true` |
| `listBatchesForWorkspace(workspaceId, options?)` | History list ordered by `created_at DESC` |

### 4.2 `CustomerAccountRepository`

| Method | Responsibility |
|--------|----------------|
| `insertAccountsForBatch(workspaceId, batchId, rows)` | Bulk insert with `is_active = true` |
| `deactivateActiveAccounts(workspaceId)` | `UPDATE … SET is_active = false, updated_at = now()` |
| `loadActiveAccountsForWorkspace(workspaceId)` | All rows WHERE `is_active = true` |
| `mapRowToCustomer(row, contactContext)` | DB row → `Customer` (see §7) |

### 4.3 `CustomerContactRepository`

| Method | Responsibility |
|--------|----------------|
| `insertContactsForBatch(workspaceId, batchId, rows)` | Bulk insert; normalize email before insert |
| `deactivateActiveContacts(workspaceId)` | Soft-deactivate prior active set |
| `loadActiveContactsForWorkspace(workspaceId)` | All rows WHERE `is_active = true` |
| `mapRowToImportedContact(row, accountLookup?)` | DB row → `ImportedContact` |

### 4.4 `ImportValidationRepository`

| Method | Responsibility |
|--------|----------------|
| `saveValidationSummary(input)` | Insert `import_validation_results` row |
| `saveRowIssues(input)` | Bulk insert `import_row_issues` |
| `loadValidationSummaryForBatch(batchId)` | Latest summary for batch |
| `loadRowIssuesForBatch(batchId, filter?)` | Issues list for history UI |

### 4.5 `ImportPersistenceService`

Orchestrates repositories inside a **single transaction** for apply/load.

| Method | Responsibility |
|--------|----------------|
| `applyImportForWorkspace(input)` | Full apply transaction (§6) |
| `loadActiveImportForWorkspace(workspaceId)` | Load active batch + accounts + contacts → client shapes |
| `saveValidationResult(input)` | Validate-only persist (optional I-4 path) |
| `listImportBatches(workspaceId)` | History summaries for I-6 |

Returns existing client payload shapes so I-5 provider can swap data source without UI changes.

---

## 5. Workspace and auth design

### 5.1 Workspace resolution

```typescript
// Server-only — same as audit
const workspaceId = getDefaultWorkspaceId(); // env DEFAULT_WORKSPACE_ID || "ws_unconfigured"
```

| Rule | Detail |
|------|--------|
| MVP | Single workspace per deployment via `DEFAULT_WORKSPACE_ID` |
| Future | Clerk session → organization id → `workspaces.id` |
| Client | Must **not** send trusted `workspace_id` in request body |
| API (I-4) | Resolve workspace server-side; ignore client-supplied tenant id |

### 5.2 Workspace row prerequisite

I-2 schema FK: `import_batches.workspace_id REFERENCES workspaces(id)`.

Apply transaction step 1 (§6): either:

- **Option A:** Require operator pre-seeds `workspaces` row before first apply, or
- **Option B:** `INSERT INTO workspaces … ON CONFLICT DO NOTHING` inside apply transaction

Open decision — see §12.

### 5.3 RBAC (I-4 API)

| Permission | Gate |
|------------|------|
| `upload_customer_data` | Validate + apply import APIs |

Uses existing `lib/auth/permissions.ts` + `lib/auth/api-auth.ts` pattern. Repository layer assumes caller already authorized.

### 5.4 Actor metadata

| Field | Source |
|-------|--------|
| `uploaded_by` | Clerk `userId` when auth active; `null` in demo |
| Audit side-effect | Existing excel import audit (counts-only) — unchanged in I-3 |

---

## 6. Apply transaction design

Exact steps inside one SQL transaction (`BEGIN` … `COMMIT`):

```
BEGIN;

  1. Ensure workspace row exists
     INSERT INTO workspaces (id, name)
     VALUES ($workspaceId, $workspaceName)
     ON CONFLICT (id) DO NOTHING;
     -- OR: assert row exists; abort if missing (Option A)

  2. Create new import_batches row
     status = 'applied'
     is_active = true
     validation_passed = true
     applied_at = now()
     header_mode, counts, source_filename, uploaded_by from input

  3. Supersede previous active batch
     UPDATE import_batches
     SET is_active = false, status = 'superseded', superseded_at = now()
     WHERE workspace_id = $ws AND is_active = true;

  4. Deactivate previous active accounts
     UPDATE customer_accounts
     SET is_active = false, updated_at = now()
     WHERE workspace_id = $ws AND is_active = true;

  5. Deactivate previous active contacts
     UPDATE customer_contacts
     SET is_active = false, updated_at = now()
     WHERE workspace_id = $ws AND is_active = true;

  6. Insert new customer_accounts (is_active = true, import_batch_id = new batch)

  7. Insert new customer_contacts (is_active = true, normalized contact_email)

  8. Insert import_validation_results summary

  9. Insert import_row_issues (blockers/warnings/info from validation)

COMMIT;
```

### 6.1 Ordering notes

- Step 3 must run **before** step 2’s unique partial index on `(workspace_id) WHERE is_active = true` would conflict — i.e. supersede old batch **before** inserting new active batch, **or** insert new batch with `is_active = false` first then flip flags. **Recommended:** supersede (3–5) then insert new batch as active (2 revised order):

```
BEGIN;
  1. Ensure workspace
  3. Supersede old batch
  4. Deactivate old accounts
  5. Deactivate old contacts
  2. Insert new batch (applied, is_active=true)
  6–9. Insert accounts, contacts, validation, issues
COMMIT;
```

### 6.2 Failure behavior

| Failure | Behavior |
|---------|----------|
| Any INSERT/UPDATE error | `ROLLBACK`; no partial apply |
| Unique constraint violation | Rollback; return `{ ok: false, code: "CONSTRAINT_VIOLATION" }` |
| Missing workspace (Option A) | Rollback; return `{ ok: false, code: "WORKSPACE_NOT_FOUND" }` |
| Persistence disabled | Do not open transaction; return `{ ok: false, code: "PERSISTENCE_DISABLED" }` |

Client session state is **not** updated unless apply succeeds (I-4 responsibility).

### 6.3 Validate-only path (optional I-4)

Separate transaction — no account/contact mutation:

```
BEGIN;
  INSERT import_batches (status=validated|failed, is_active=false, …)
  INSERT import_validation_results
  INSERT import_row_issues
COMMIT;
```

Does not activate batch or replace active data.

---

## 7. DB → app mapping

### 7.1 `customer_accounts` → `Customer`

| DB column | App field | Notes |
|-----------|-----------|-------|
| `account_id` | `customer_id` | Business key |
| `account_name` | `customer_name` | |
| `journey_stage` | `stage` | |
| `primary_icp` | `icp` | |
| `plan` | `plan` | |
| `use_case` | `use_case` | |
| `term_start_date` | `term_start_date` | ISO date string |
| `renewal_date` | `renewal_date` | |
| `seats_purchased` | `seats_total` | |
| `search_seats_assigned + graph_browser + graph_desktop` | `seats_assigned` | Sum at read time |
| `graph_desktop_seats_assigned` | `graph_desktop_assigned` | |
| `graph_browser_seats_assigned` | `graph_browser_assigned` | |
| `search_seats_assigned` | `search_assigned` | |
| `total_sessions` | `usage_sessions` | |
| `total_active_seats` | `active_users` | |
| `invite_status` | `invite_status` | Cast to `InviteStatus` |
| `invite_sent_date` | `invite_sent_date` | |
| `invite_accepted_date` | `invite_accepted_date` | |
| `notes` | `notes` | |
| `activation_start_date` | (rollup) | Used for `days_since_start` if `term_start_date` empty |

**Derived after load from active contacts:**

| App field | Source |
|-----------|--------|
| `owner` | CSM contact → `contact_email` |
| `account_owner` | Admin contact → `contact_name` (fallback: account_name) |
| `admin_email` | Admin contact → `contact_email` |
| `user_email` | User contact → `contact_email` |

Reuses contact rollup logic from `lib/import-customer-rollup.ts` / `lib/customer-contacts.ts` at **read** boundary.

**Defaults for fields not in flat import / DB:**

| App field | Default on load |
|-----------|-----------------|
| `last_email_sent_date` | `""` |
| `last_email_sent` | `""` |
| `emails_sent_count` | `0` |
| `engagement_model` | `"Tech Touch"` |
| `role` | `"Admin"` |
| `automation_status` | `"None"` |
| `academy_visited` / `webinar_attended` | `"No"` |
| Computed: `days_since_start`, `days_to_renewal`, `seat_assignment_percent`, etc. | Recompute in mapper (same formulas as rollup) |

### 7.2 `customer_contacts` → `ImportedContact`

| DB column | App field |
|-----------|-----------|
| `contact_email` | `contact_email` |
| `contact_name` | `contact_name` |
| `contact_role` | `contact_role` |
| `do_not_contact` | `do_not_contact` |
| `account_id` | `customer_id` |
| `source` | `source` (`excel_import`) |
| (lookup) | `customer_name` from account row |

---

## 8. App → DB insert mapping

Source: `ValidationResult` from `lib/upload-validation.ts` after flat/L-2 parse + validate.

### 8.1 Batch metadata

| Input | DB column |
|-------|-----------|
| `getDefaultWorkspaceId()` | `workspace_id` |
| `result.importSummary.headerMode` | `header_mode` |
| `result.passed` | `validation_passed` |
| `result.importSummary.accountsCount` | `account_count` |
| `result.importSummary.contactsCount` | `contact_count` |
| `result.importSummary.blockerCount` etc. | `blocker_count`, `warning_count`, `info_count` |
| Sanitized filename | `source_filename` |
| Clerk user id | `uploaded_by` |

### 8.2 Accounts

One row per unique `account_id` in `result.customers` (already deduped by L-4B parser — first row wins).

Map `Customer` / parsed account fields → `customer_accounts` columns per I-2 schema. Inverse of §7.1:

| App / flat key | DB column |
|----------------|-----------|
| `customer_id` | `account_id` |
| `customer_name` | `account_name` |
| `stage` | `journey_stage` |
| `icp` | `primary_icp` |
| `seats_total` | `seats_purchased` |
| `usage_sessions` | `total_sessions` |
| `active_users` | `total_active_seats` |
| … | (remaining flat account keys) |

Boolean fields (`onboarding_completed`, `near_threshold`): parse `Yes`/`No` → boolean at insert.

### 8.3 Contacts

From `result.importedContacts`:

| App field | DB column |
|-----------|-----------|
| `customer_id` | `account_id` |
| `normalizeContactEmail(contact_email)` | `contact_email` |
| `contact_name` | `contact_name` |
| `contact_role` | `contact_role` |
| `do_not_contact` | `do_not_contact` |
| `"excel_import"` | `source` |

Uses `normalizeContactEmail` from `lib/import-contact-email.ts`.

### 8.4 Validation summary

From `result.importSummary` → `import_validation_results`:

| importSummary field | DB column |
|---------------------|-----------|
| `headerMode` | `header_mode` |
| `format` + headerMode | `format_label` (e.g. `"Flat Row 2 workbook"`) |
| counts | `account_count`, `contact_count`, `signal_count`, … |
| `duplicateContactEmailCount` | `duplicate_contact_email_count` |
| `orphanContactCount` | `orphan_contact_count` |
| `orphanSignalCount` | `orphan_signal_count` |
| `result.passed` | `passed` |

### 8.5 Row issues

From `result.importIssues[]` → `import_row_issues`:

| ImportIssue | DB column |
|-------------|-----------|
| `severity` | `severity` |
| `code` | `code` |
| `message` (truncated, max TBD) | `message` |
| `sheet` | `sheet_name` |
| `rowNumber` | `row_number` |
| `customer_id` | `account_id` |
| `normalizeContactEmail(contact_email)` | `contact_email` |

### 8.6 Privacy guards (insert)

- **No raw workbook storage** — no bytes, blobs, or sheet matrices.
- **No** email template HTML or SendGrid payloads.
- **No** Communication Logs rows.
- Issue messages: minimal PII; prefer `code` + `row_number`.

---

## 9. TypeScript API signatures (design only)

Types below are **documentation-only** until I-4 implementation.

```typescript
/** Loaded durable state for I-5 provider hydration. */
export type ActiveImportState = {
  batch: ImportBatchSummary;
  customers: Customer[];
  importedContacts: ImportedContact[];
  validationSummary: ImportValidationSummary | null;
};

export type ImportBatchSummary = {
  id: string;
  workspaceId: string;
  status: "validated" | "applied" | "failed" | "superseded";
  headerMode: "flat_row2" | "row2" | "legacy_single_row";
  sourceFilename: string | null;
  uploadedBy: string | null;
  validationPassed: boolean;
  accountCount: number;
  contactCount: number;
  blockerCount: number;
  warningCount: number;
  infoCount: number;
  isActive: boolean;
  createdAt: string;
  appliedAt: string | null;
  supersededAt: string | null;
};

export type ImportValidationSummary = {
  passed: boolean;
  headerMode: string;
  formatLabel: string | null;
  accountCount: number;
  contactCount: number;
  signalCount: number;
  blockerCount: number;
  warningCount: number;
  infoCount: number;
  duplicateContactEmailCount: number;
  orphanContactCount: number;
  orphanSignalCount: number;
};

export type PersistedImportIssue = {
  severity: "blocker" | "warning" | "info";
  code: string;
  message: string;
  sheetName: string | null;
  rowNumber: number | null;
  accountId: string | null;
  contactEmail: string | null;
};

/** Input to apply path — mirrors post-validate client state. */
export type ApplyImportPersistenceInput = {
  workspaceId: string; // server-resolved; passed by service caller only
  validationResult: ValidationResult;
  sourceFilename?: string;
  uploadedBy?: string | null;
};

export type ApplyImportPersistenceResult =
  | {
      ok: true;
      importBatchId: string;
      customers: Customer[];
      importedContacts: ImportedContact[];
    }
  | {
      ok: false;
      code:
        | "PERSISTENCE_DISABLED"
        | "DATABASE_NOT_CONFIGURED"
        | "WORKSPACE_NOT_FOUND"
        | "VALIDATION_NOT_PASSED"
        | "CONSTRAINT_VIOLATION"
        | "TRANSACTION_FAILED";
      message: string;
    };

export type SaveValidationInput = {
  workspaceId: string;
  validationResult: ValidationResult;
  sourceFilename?: string;
  uploadedBy?: string | null;
};

/** ImportPersistenceService */
declare function loadActiveImportForWorkspace(
  workspaceId: string,
): Promise<ActiveImportState | null>;

declare function applyImportForWorkspace(
  input: ApplyImportPersistenceInput,
): Promise<ApplyImportPersistenceResult>;

declare function saveValidationResult(
  input: SaveValidationInput,
): Promise<{ importBatchId: string }>;

declare function listImportBatches(
  workspaceId: string,
): Promise<ImportBatchSummary[]>;
```

### 9.1 Repository-level signatures (internal)

```typescript
// import-batch-repository.ts
createBatch(params: CreateImportBatchParams): Promise<string>;
markPreviousActiveBatchSuperseded(workspaceId: string, sql: TxClient): Promise<number>;
findActiveBatchForWorkspace(workspaceId: string): Promise<ImportBatchRow | null>;
listBatchesForWorkspace(workspaceId: string, limit?: number): Promise<ImportBatchRow[]>;

// customer-account-repository.ts
insertAccountsForBatch(
  workspaceId: string,
  batchId: string,
  accounts: CustomerAccountInsert[],
  sql: TxClient,
): Promise<void>;
deactivateActiveAccounts(workspaceId: string, sql: TxClient): Promise<number>;
loadActiveAccountsForWorkspace(workspaceId: string): Promise<CustomerAccountRow[]>;
mapRowToCustomer(row: CustomerAccountRow, contacts: ImportedContact[]): Customer;

// customer-contact-repository.ts
insertContactsForBatch(...): Promise<void>;
deactivateActiveContacts(workspaceId: string, sql: TxClient): Promise<number>;
loadActiveContactsForWorkspace(workspaceId: string): Promise<CustomerContactRow[]>;
mapRowToImportedContact(row: CustomerContactRow, accountName?: string): ImportedContact;

// import-validation-repository.ts
saveValidationSummary(input: SaveValidationSummaryParams, sql: TxClient): Promise<string>;
saveRowIssues(issues: PersistedImportIssue[], batchId: string, workspaceId: string, sql: TxClient): Promise<void>;
loadValidationSummaryForBatch(batchId: string): Promise<ImportValidationSummary | null>;
loadRowIssuesForBatch(batchId: string): Promise<PersistedImportIssue[]>;
```

`TxClient` = Neon transaction handle passed from `ImportPersistenceService`.

---

## 10. Config and disabled behavior

### 10.1 Env gates

| Env | Default | Effect |
|-----|---------|--------|
| `DATABASE_URL` | unset | `getImportPersistenceSql()` returns `null` |
| `IMPORT_PERSISTENCE_ENABLED` | `false` (proposed) | When false, all service methods no-op / return disabled |
| `DEFAULT_WORKSPACE_ID` | unset → `ws_unconfigured` | Tenant scope |

```typescript
export function shouldPersistImport(env = process.env): boolean {
  return (
    isEnvFlagEnabled(env.IMPORT_PERSISTENCE_ENABLED) &&
    Boolean(env.DATABASE_URL?.trim())
  );
}
```

### 10.2 Runtime behavior matrix

| Scenario | App behavior |
|----------|--------------|
| Persistence disabled | Session-only import unchanged (current L-4F) |
| Persistence enabled, no active batch | Demo seed or empty per I-1 demo rules |
| Persistence enabled, active batch | I-5 loads from DB on start |
| Demo mode toggle in UI | Client-side only; does not delete DB rows |
| Future API when disabled | HTTP 503 `{ error: "import_persistence_not_configured" }` |

### 10.3 Demo mode safety

- Repository methods check `shouldPersistImport()` before opening SQL.
- I-4 API must not call apply when persistence disabled.
- `"Use Demo Data"` in provider does not invoke repository writes.

---

## 11. Verification plan

| Script | Phase | Purpose |
|--------|-------|---------|
| `verify-i-3-repository-design.ts` | I-3 ✅ | Text checks on this design doc |
| `verify-i-4-import-persistence-service.ts` | I-4 | Unit tests with mocked SQL or approved local DB |
| `verify-i-7-stable.ts` | I-7 | Full DB round-trip after manual SQL apply |

I-3 script: **no DB connection**.

---

## 12. Open decisions

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Workspace seed | Manual seed vs `ON CONFLICT DO NOTHING` on first apply | **Auto-upsert** on first apply (simpler ops) |
| 2 | `import_row_issues.message` max length | 500 / 1000 / TEXT | **500 chars** truncate at insert |
| 3 | RLS timing | I-4 vs post-I-7 | **Defer** — server-side `workspace_id` filter in repos |
| 4 | Save validation without apply | Needed in I-4? | **Optional** — implement `saveValidationResult` but gate behind flag; apply-only MVP acceptable |
| 5 | Import history UI row issues | Full list in I-6? | **Summary + expandable issues** per batch |
| 6 | Persist failed validations | History vs storage cost | **Yes for history** — `status=failed`, `is_active=false` |
| 7 | `IMPORT_PERSISTENCE_ENABLED` flag | Required vs DATABASE_URL only | **Required** — mirrors audit; prevents accidental writes |
| 8 | Shared SQL client cache | Separate vs reuse `getAuditSql()` | **Separate module** — different enable gates |

---

## 13. Out of scope (I-3)

- API route implementation
- UI / provider wiring
- Neon migration apply
- SendGrid / Communication Logs persistence
- Action Queue / workflow_statuses persistence
- RLS policies
- Raw workbook storage

L-2 multi-sheet and L-1 legacy imports use the **same tables**; `header_mode` on batch distinguishes format.

---

## 14. Phase map

| Phase | Scope |
|-------|--------|
| **I-0** | Architecture audit ✅ |
| **I-1** | Schema design ✅ |
| **I-2** | SQL migration draft ✅ |
| **I-3** | Repository design (this doc) ✅ |
| **I-4A** | Repository foundation implemented ✅ — disabled by default, no UI wiring |
| **I-4B** | Atomic transaction + live verification ✅ — see below |
| **I-5** | API/persist-on-apply wiring (after live verification passes) |
| **I-6** | Import history UI |
| **I-7** | Stable verification with DB |

---

## I-4A — Repository foundation (complete)

**Status:** ✅ Complete (server-only modules — **not wired to UI**)

| Item | Value |
|------|--------|
| Env gate | `IMPORT_PERSISTENCE_ENABLED=false` in `.env.example` (default off) |
| Modules | `lib/import-persistence/*` — env, db, types, mappers, repos, service |
| Verify | `npx tsx scripts/verify-i-4a-import-persistence-foundation.ts` |
| SQL apply | **Not applied** — repositories exist but remain uncalled by app |
| UI wiring | **None** — Customer Data apply still session-only |

---

## I-4B — Atomic transaction + live verification (complete)

**Status:** ✅ Complete

| Item | Value |
|------|--------|
| Transaction API | Neon `sql.transaction((txn) => [...])` — **non-interactive** query array (per `@neondatabase/serverless` types) |
| Async callback | **Not supported** — `async (tx) =>` rejected by Neon types |
| Implementation | `lib/import-persistence/import-persistence-transaction.ts` |
| Batch id | Pre-generated `randomUUID()` so child inserts share one HTTP transaction |
| Apply order | workspace → supersede batch → deactivate accounts → deactivate contacts → insert batch → accounts → contacts → validation → issues |
| Live verify | `npx tsx scripts/verify-i-4b-import-persistence-live.ts` |
| Test workspace | `test-import-persistence` only — does not touch `DEFAULT_WORKSPACE_ID` data |
| UI wiring | **None** |

### Live verification behavior

| Condition | Result |
|-----------|--------|
| `IMPORT_PERSISTENCE_ENABLED !== true` | **SKIPPED** exit 0 |
| `DATABASE_URL` missing | **SKIPPED** exit 0 |
| Schema not applied | **BLOCKED** exit 0 with message |
| Enabled + schema applied | Runs apply/replace round-trip test |

---

## Decision

**Ready for I-5 API/UI persistence wiring:** ✅ **YES** (after operator runs live verification with SQL applied)

Conditions before I-5:

1. Manually apply `db/migrations/002_create_import_persistence.sql` to Neon.
2. Set `IMPORT_PERSISTENCE_ENABLED=true` + `DATABASE_URL` in deployment env.
3. Run `verify-i-4b-import-persistence-live.ts` — must pass before wiring Customer Data apply.
