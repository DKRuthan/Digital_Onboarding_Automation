# Excel / CSV Import Template Specification

Digital Customer Journey Control Center — import schema reference.

**Template version:** `2026-06-target-v1`

**Downloadable templates:** Customer Data → **Import Templates**. **Download Current Upload Template** (`current-upload-template.csv`) matches today's 39-column upload validation. **Download Target Multi-Sheet Template** (`target-multisheet-import-template.xlsx`) is upload-supported via **MVP rollup** (Accounts + Contacts → `Customer[]`).

**Format detection (C-8D-1):** Upload detects current account-first vs target multi-sheet workbooks.

**Multi-sheet import (C-8D-2 / C-8D-3):** Target workbooks are parsed, rolled up, validated, and applied through the same Customer Data upload panel. After validation, **Multi-Sheet Import Preview** shows sheet row counts, customers after rollup, cross-sheet blockers/warnings, rollup warnings, and import notes. **Cross-sheet blockers prevent Apply (C-8E-2).** **Signals are not imported yet.** Extra contacts beyond the first Admin/User per account are not persisted.

**Related:** [Product context §5](context/product.md#5-customer-data--excel-source) · Phase C-8A audit · Phase C-8B (this document) · Phase C-8C (downloadable templates)

---

## Overview

| Topic | Current (supported) | Target (production) |
|-------|---------------------|---------------------|
| File types | `.csv`, `.xlsx` | `.xlsx` workbook (CSV fallback for Accounts-only legacy) |
| Sheet model | **First sheet only** | **Multi-sheet:** `Accounts`, `Contacts`, `Signals` (optional) |
| Row grain | One row per **account** | Accounts: one row per account; Contacts: one row per **contact email** |
| Contact identity | Embedded (`admin_email`, `user_email` on account row) | Explicit `Contacts` sheet |
| Parser | `lib/upload-validation.ts` | Planned C-8D / C-8E |

### Product principle

- **`contact_email` is the primary operational identity** — sequences, cooling, Communication Logs, Action Queue review, and send eligibility are contact-first.
- **Account / customer is context** — plan, usage, renewal, seats, and Activity Trigger **evaluation** remain account-level today.

The UI already reflects this split: **Customer Data → Contacts / Emails** derives contacts from flat account rows via `lib/customer-contacts.ts`. The import format is catching up.

---

## Current supported format: Account-first upload (Option A)

This is the **only format accepted by the app today**. Upload on **Customer Data → Upload CSV/XLSX → Validate Data → Apply Uploaded Data**.

### Behavior

- **One row per customer / account** (`customer_id` must be unique in the file).
- **`admin_email` and `user_email`** are columns on the account row (not separate contact rows).
- **Contacts are derived at runtime** — Admin, User (if different email), and CSM (only if `owner` is a valid email).
- **Maximum ~2 customer-facing contacts + optional internal CSM** per account from a single row; arbitrary N contacts are not supported.
- **First worksheet only** — for `.xlsx`, only `SheetNames[0]` is read (`lib/upload-validation.ts` → `parseUploadFile`).
- Headers are normalized: trim, lowercase, spaces → underscores (e.g. `Customer ID` → `customer_id`).

### Required columns (39)

All headers below must be present. Empty cells are allowed only where noted in [Nullable columns](#nullable-columns-option-a).

| # | Column | Type | Nullable | Notes |
|---|--------|------|----------|-------|
| 1 | `customer_id` | string | No | Unique per file |
| 2 | `customer_name` | string | No | |
| 3 | `account_owner` | string | No | Display name; used as Admin contact name hint |
| 4 | `admin_email` | email | No* | Validated if non-empty |
| 5 | `user_email` | email | No* | Validated if non-empty |
| 6 | `role` | string | No | Account-level role label (not validated against enum) |
| 7 | `plan` | string | No | e.g. Enterprise, Professional, Starter |
| 8 | `engagement_model` | string | No | e.g. High Touch, Tech Touch |
| 9 | `stage` | string | No | e.g. Onboarding, Adoption, Renewal |
| 10 | `term_start_date` | date | No | ISO date parseable |
| 11 | `renewal_date` | date | No | |
| 12 | `days_since_start` | number | No | |
| 13 | `days_to_renewal` | number | No | |
| 14 | `invite_sent_date` | date | No | |
| 15 | `invite_accepted_date` | date | **Yes** | May be empty |
| 16 | `invite_status` | enum | No | `Pending`, `Accepted`, `Expired` |
| 17 | `seats_total` | number | No | |
| 18 | `seats_assigned` | number | No | |
| 19 | `seat_assignment_percent` | number | No | 0–100 typical |
| 20 | `graph_desktop_assigned` | number | No | Product seat split |
| 21 | `graph_browser_assigned` | number | No | |
| 22 | `search_assigned` | number | No | |
| 23 | `usage_sessions` | number | No | Activity Trigger input |
| 24 | `usage_activities` | number | No | |
| 25 | `active_users` | number | No | |
| 26 | `last_usage_date` | date | **Yes** | May be empty |
| 27 | `usage_threshold` | number | No | |
| 28 | `usage_threshold_percent` | number | No | Activity Trigger input |
| 29 | `use_case` | string | No | |
| 30 | `icp` | string | No | |
| 31 | `academy_visited` | enum | No | `Yes`, `No` |
| 32 | `webinar_attended` | enum | No | `Yes`, `No` |
| 33 | `last_email_sent` | string | No | Template / message type label |
| 34 | `last_email_sent_date` | date | **Yes** | Cooling input; may be empty |
| 35 | `emails_sent_count` | number | No | |
| 36 | `next_recommended_action` | string | **Yes** | May be empty |
| 37 | `automation_status` | enum | No | `Ready`, `Pending Review`, `Sent`, `Skipped`, `None` |
| 38 | `owner` | string | No | DAM / CSM — name or email (email preferred for internal routing) |
| 39 | `notes` | string | **Yes** | May be empty |

\*Columns are required to exist and are validated as non-empty by upload rules except where listed as nullable; email format is checked when value is present.

### Allowed enum values (Option A)

| Column | Allowed values |
|--------|----------------|
| `invite_status` | `Pending`, `Accepted`, `Expired` |
| `academy_visited` | `Yes`, `No` |
| `webinar_attended` | `Yes`, `No` |
| `automation_status` | `Ready`, `Pending Review`, `Sent`, `Skipped`, `None` |

### Validation notes (Option A — implemented today)

- Missing any required **header** → entire upload fails.
- Duplicate `customer_id` → row error.
- Invalid email on `admin_email` / `user_email` → row error.
- Invalid date on required date fields → row error; optional dates may be blank.
- Invalid number on numeric fields → row error.
- Invalid enum value → row error.
- Output: `Customer[]` replaces session customer data on apply.

### Sample download today

**Customer Data → Download Sample CSV** uses `lib/csv-template.ts` (`REQUIRED_COLUMNS` + five sample account rows). It matches Option A exactly.

---

## Target production format: Multi-sheet workbook (Option C)

**Upload-supported via MVP rollup (C-8D-3B).** Accounts + Contacts sheets are parsed and converted into the existing flat `Customer[]` model. Signals sheet is detected but not imported. Full cross-sheet validation (C-8E) is planned.

### Workbook structure

| Sheet | Grain | Purpose |
|-------|-------|---------|
| **`Accounts`** | One row per account | Context + Activity Trigger evaluation fields |
| **`Contacts`** | One row per contact email | Primary operational identity |
| **`Signals`** | One row per event (optional) | Communication history / cooling inputs (future) |

Legacy **Option A** single-sheet uploads should remain supported until migration is complete.

---

### Sheet A: `Accounts`

One row per `customer_id`. No embedded `admin_email` / `user_email` when using full Option C (contacts live on Contacts sheet). During transition, legacy columns may still be accepted as shortcuts.

| Column | Required | Type | Example |
|--------|----------|------|---------|
| `customer_id` | Yes | string | `CUST-001` |
| `customer_name` | Yes | string | `Demo Customer 001` |
| `plan` | Yes | string | `Enterprise` |
| `stage` | Yes | string | `Onboarding` |
| `segment` | Optional | string | `Enterprise Security` |
| `use_case` | Optional | string | `Security Operations` |
| `icp` | Optional | string | `Enterprise Security` |
| `account_owner` | Recommended | string | `Aster Demo` |
| `owner_dam_name` | Recommended | string | `Ash Demo` |
| `owner_dam_email` | Recommended | email | `ash.demo@team.example.com` |
| `onboarding_start_date` | Optional | date | `2026-01-15` |
| `term_start_date` | Yes | date | `2026-01-15` |
| `renewal_date` | Yes | date | `2027-01-15` |
| `invite_status` | Yes | enum | `Accepted` |
| `invite_sent_date` | Yes | date | `2026-01-10` |
| `invite_accepted_date` | Optional | date | `2026-01-12` |
| `usage_sessions` | Yes | number | `320` |
| `usage_activities` | Optional | number | `1450` |
| `active_users` | Optional | number | `38` |
| `last_usage_date` | Optional | date | `2026-06-17` |
| `usage_threshold` | Optional | number | `100` |
| `usage_threshold_percent` | Yes | number | `76` |
| `seats_total` | Yes | number | `50` |
| `seats_assigned` | Yes | number | `42` |
| `seat_assignment_percent` | Yes | number | `84` |
| `graph_desktop_assigned` | Optional | number | `20` |
| `graph_browser_assigned` | Optional | number | `15` |
| `search_assigned` | Optional | number | `7` |
| `academy_visited` | Yes | enum | `Yes` |
| `webinar_attended` | Yes | enum | `Yes` |
| `last_email_sent_date` | Optional | date | `2026-06-01` |
| `last_email_sent_type` | Optional | string | `Usage Summary` |
| `emails_sent_count` | Optional | number | `8` |
| `notes` | Optional | string | Free text |
| `next_recommended_action` | Optional | string | `Schedule QBR` |

**Notes:**

- `last_email_sent_type` replaces legacy `last_email_sent` naming on the target schema.
- `owner_dam_name` + `owner_dam_email` replace ambiguous single `owner` column.
- `days_since_start` / `days_to_renewal` are **prefer computed in app** from dates (see [Do not import](#do-not-import-these-fields)).

---

### Sheet B: `Contacts`

One row per **`contact_email`**. Primary operational table.

| Column | Required | Type | Allowed values | Example |
|--------|----------|------|----------------|---------|
| `contact_email` | Yes | email | Valid email | `admin@customer-001.example.com` |
| `contact_role` | Yes | enum | `Admin`, `User`, `CSM` | `Admin` |
| `contact_name` | Recommended | string | — | `Aster Demo` |
| `do_not_contact` | Optional | enum | `Yes`, `No` (default `No`) | `No` |
| `customer_id` | Yes | string | Must exist on Accounts | `CUST-001` |

**Derivation rules today (for comparison):** `lib/customer-contacts.ts` builds the same logical rows from Option A `admin_email`, `user_email`, and email-like `owner`.

---

### Sheet C: `Signals` (future optional)

One row per communication or signal event. Not required for MVP import.

| Column | Required | Type | Example |
|--------|----------|------|---------|
| `contact_email` | Yes | email | `it-admin@customer-002.example.com` |
| `customer_id` | Yes | string | `CUST-002` |
| `sent_at` | Yes | datetime | `2026-06-17T14:32:00Z` |
| `template_or_type` | Recommended | string | `invite-reminder` |
| `channel` | Recommended | enum | `email`, `internal_alert` |
| `status` | Recommended | string | `Delivered` |

Session **Communication Logs** remain the runtime source of truth for sends in MVP; Signals sheet is for bulk history import in a later phase.

---

## Column dictionary (target schema)

Full reference for Option C columns. Option A legacy names shown where they differ.

| Column | Sheet | Req | Type | Enum / format | Example | Notes |
|--------|-------|-----|------|---------------|---------|-------|
| `customer_id` | Accounts | Yes | string | Unique | `CUST-001` | FK target for Contacts |
| `customer_name` | Accounts | Yes | string | — | `Demo Customer 001` | Display |
| `plan` | Accounts | Yes | string | — | `Enterprise` | |
| `stage` | Accounts | Yes | string | — | `Onboarding` | Lifecycle |
| `segment` | Accounts | Opt | string | — | `Enterprise` | Market / size |
| `use_case` | Accounts | Opt | string | — | `Security Operations` | |
| `icp` | Accounts | Opt | string | — | `Enterprise Security` | |
| `account_owner` | Accounts | Rec | string | — | `Aster Demo` | Primary admin name |
| `owner_dam_name` | Accounts | Rec | string | — | `Ash Demo` | Replaces legacy `owner` when name |
| `owner_dam_email` | Accounts | Rec | email | — | `ash.demo@team.example.com` | Internal routing |
| `onboarding_start_date` | Accounts | Opt | date | ISO | `2026-01-15` | Journey anchor |
| `term_start_date` | Accounts | Yes | date | ISO | `2026-01-15` | |
| `renewal_date` | Accounts | Yes | date | ISO | `2027-01-15` | |
| `invite_status` | Accounts | Yes | enum | Pending, Accepted, Expired | `Accepted` | |
| `invite_sent_date` | Accounts | Yes | date | ISO | `2026-01-10` | |
| `invite_accepted_date` | Accounts | Opt | date | ISO | `2026-01-12` | |
| `usage_sessions` | Accounts | Yes | number | ≥ 0 | `320` | Trigger: No Usage |
| `usage_activities` | Accounts | Opt | number | ≥ 0 | `1450` | |
| `active_users` | Accounts | Opt | number | ≥ 0 | `38` | |
| `last_usage_date` | Accounts | Opt | date | ISO | `2026-06-17` | |
| `usage_threshold` | Accounts | Opt | number | ≥ 0 | `100` | |
| `usage_threshold_percent` | Accounts | Yes | number | 0–100+ | `76` | Trigger: Low Usage |
| `seats_total` | Accounts | Yes | number | ≥ 0 | `50` | |
| `seats_assigned` | Accounts | Yes | number | ≥ 0 | `42` | |
| `seat_assignment_percent` | Accounts | Yes | number | 0–100 | `84` | Trigger: Seats |
| `graph_desktop_assigned` | Accounts | Opt | number | ≥ 0 | `20` | |
| `graph_browser_assigned` | Accounts | Opt | number | ≥ 0 | `15` | |
| `search_assigned` | Accounts | Opt | number | ≥ 0 | `7` | |
| `academy_visited` | Accounts | Yes | enum | Yes, No | `Yes` | |
| `webinar_attended` | Accounts | Yes | enum | Yes, No | `Yes` | |
| `last_email_sent_date` | Accounts | Opt | date | ISO | `2026-06-01` | Cooling |
| `last_email_sent_type` | Accounts | Opt | string | — | `Usage Summary` | Legacy: `last_email_sent` |
| `emails_sent_count` | Accounts | Opt | number | ≥ 0 | `8` | |
| `notes` | Accounts | Opt | string | — | Free text | |
| `next_recommended_action` | Accounts | Opt | string | — | `Schedule QBR` | |
| `contact_email` | Contacts | Yes | email | — | `admin@customer-001.example.com` | **Primary identity** |
| `contact_role` | Contacts | Yes | enum | Admin, User, CSM | `Admin` | |
| `contact_name` | Contacts | Rec | string | — | `Aster Demo` | |
| `do_not_contact` | Contacts | Opt | enum | Yes, No | `No` | Suppression |
| `customer_id` | Contacts | Yes | string | FK | `CUST-001` | |
| `sent_at` | Signals | Yes | datetime | ISO 8601 | `2026-06-17T14:32:00Z` | Future |
| `template_or_type` | Signals | Rec | string | — | `invite-reminder` | Future |
| `channel` | Signals | Rec | enum | email, internal_alert | `email` | Future |
| `status` | Signals | Rec | string | — | `Delivered` | Future |

### Option A-only columns (legacy, current upload)

| Column | Notes |
|--------|-------|
| `admin_email`, `user_email` | Embedded contacts; map to Contacts sheet in target |
| `role` | Account row label; not same as `contact_role` |
| `engagement_model` | Kept in legacy upload; optional on target Accounts |
| `automation_status` | Legacy workflow hint; prefer app-computed status |
| `owner` | Legacy DAM field; split to `owner_dam_name` / `owner_dam_email` |
| `days_since_start`, `days_to_renewal` | Prefer computed; still required in Option A today |
| `last_email_sent` | Rename to `last_email_sent_type` in target |

---

## Validation rules (C-8E)

**C-8E-1 ✅:** Cross-sheet validation library at `lib/import-multisheet-cross-validation.ts` (`validateNormalizedMultisheetImport`).

**C-8E-2 ✅:** Cross-sheet validation is wired into Option C upload validation. **Blockers prevent Apply.** Warnings are visible but non-blocking. **Signals are still not imported.**

**C-8E-3 ✅:** Contacts Data Quality Preview shows contact-level counts and issue summaries in the Option C upload preview (preview-only; does not change pass/fail).

### Accounts sheet

- `customer_id` required and **unique** within workbook.
- `customer_name` required.
- Required dates (`term_start_date`, `renewal_date`, `invite_sent_date`) must parse as valid dates.
- Numeric fields must parse as finite numbers.
- `academy_visited`, `webinar_attended` must be `Yes` or `No` when present.
- `invite_status` must be `Pending`, `Accepted`, or `Expired`.

### Contacts sheet

- `contact_email` required and valid email format.
- `contact_role` must be `Admin`, `User`, or `CSM`.
- `customer_id` must reference an existing row on **Accounts**.
- `do_not_contact` must be `Yes` or `No` when present (default `No`).
- Each account should have **at least one Admin** contact (recommended policy: warning if missing, blocker for production).
- Same `contact_email` on multiple accounts → **warning** (cross-account duplicate; app already surfaces this in Data Quality Review).
- Duplicate `(customer_id, contact_email, contact_role)` → **blocker**.

### Signals sheet

- `contact_email` should exist on **Contacts** (or Accounts legacy emails during transition).
- `customer_id` must exist on **Accounts**.
- `sent_at` must be a valid date/time.
- `channel` when present: `email` or `internal_alert`.

### Cross-sheet

- Orphan contacts (unknown `customer_id`) → blocker.
- Conflicting account metrics duplicated on contact rows (Option B single-sheet) → blocker or last-row-wins policy TBD in C-8D.

---

## Do not import these fields

Computed inside the app — **do not include in upload templates**.

| Field | Computed by |
|-------|-------------|
| `tags` (account / contact / journey) | `lib/customer-tags.ts` |
| `cooling_active` / cooling status | Send logs + `last_email_sent_date` + cooling policy |
| `sequence_status` | Email sequence enrollments (session) |
| `data_quality_status` | `lib/customer-data-quality.ts` |
| `contact_actions_due_now` | Action Queue schedule engine |
| `workflow_status` | Action Queue approval workflow (session) |
| `in_sequence` | Enrollment lookup by `contact_email` |
| `unresolved_contact_email` | Trigger / CSM resolution when owner is not an email |
| `approval_status` | Workflow state on queue items |
| `send_eligibility` | Approval + due_now + conflict-clear + internal routing guards |
| `days_since_start`, `days_to_renewal` | Prefer derive from dates (required in Option A legacy only) |

Importing these creates stale data and conflicts with session state (enrollments, queue, logs).

---

## Sample rows (target schema)

### Accounts (excerpt)

| customer_id | customer_name | plan | stage | account_owner | owner_dam_name | owner_dam_email | term_start_date | renewal_date | invite_status | invite_sent_date | usage_sessions | usage_threshold_percent | seats_total | seats_assigned | seat_assignment_percent | academy_visited | webinar_attended | last_email_sent_type | emails_sent_count |
|-------------|---------------|------|-------|---------------|----------------|-----------------|-----------------|--------------|---------------|------------------|----------------|-------------------------|-------------|----------------|-------------------------|-----------------|------------------|------------------------|-------------------|
| CUST-001 | Demo Customer 001 | Enterprise | Onboarding | Aster Demo | Ash Demo | ash.demo@team.example.com | 2026-01-15 | 2027-01-15 | Accepted | 2026-01-10 | 320 | 76 | 50 | 42 | 84 | Yes | Yes | Usage Summary | 8 |
| CUST-002 | Demo Customer 002 | Professional | Onboarding | Birch Demo | Reed Demo | reed.demo@team.example.com | 2026-06-01 | 2027-06-01 | Pending | 2026-05-28 | 0 | 0 | 25 | 8 | 32 | No | No | Welcome | 2 |

### Contacts

| contact_email | contact_role | contact_name | do_not_contact | customer_id |
|---------------|--------------|--------------|----------------|-------------|
| admin@customer-001.example.com | Admin | Aster Demo | No | CUST-001 |
| aster.demo@customer-001.example.com | User | Aster Demo | No | CUST-001 |
| it-admin@customer-002.example.com | Admin | Birch Demo | No | CUST-002 |

### Signals (optional example)

| contact_email | customer_id | sent_at | template_or_type | channel | status |
|---------------|-------------|---------|------------------|---------|--------|
| it-admin@customer-002.example.com | CUST-002 | 2026-06-01T10:00:00Z | invite-reminder | email | Delivered |

---

## Implementation roadmap (reference)

| Phase | Deliverable |
|-------|-------------|
| **C-8A** | Schema audit ✅ |
| **C-8B** | This specification ✅ |
| **C-8C** | Downloadable template from Customer Data ✅ (Option A CSV + target multi-sheet XLSX preview) |
| **C-8D-1** | Import format detection in upload UI ✅ (current vs target multi-sheet; apply still Option A only) |
| **C-8D-2** | Multi-sheet parser library ✅ (`parseTargetMultisheetWorkbook`; not wired to upload/apply) |
| **C-8D-3A** | Roll normalized import → `Customer[]` library ✅ (`rollupNormalizedImportToCustomers`; verify script only) |
| **C-8D-3B** | Wire Option C validate/apply in upload UI ✅ (MVP rollup; Signals not imported) |
| **C-8D-4** | Multi-sheet upload preview UI ✅ (sheet counts, rollup output, warnings, notes) |
| **C-8E-1** | Cross-sheet validation library ✅ (`validateNormalizedMultisheetImport`; verify script) |
| **C-8E-2** | Wire cross-sheet validation into Option C upload ✅ (blockers block Apply; warnings/info in preview) |
| **C-8E-3** | Contacts Data Quality Preview ✅ (contact counts and issue summary in Option C upload preview) |
| **Phase D** | Reports (after import schema stable) |

---

## Existing code — what would change (not in C-8B)

| File | Current | Future change |
|------|---------|---------------|
| `lib/upload-validation.ts` | Option A only, first sheet | Multi-sheet reader; Contacts join; cross-sheet validation |
| `lib/csv-template.ts` | Single CSV, `REQUIRED_COLUMNS` | Option A sample retained; add XLSX generator with Accounts + Contacts sheets |
| `lib/types.ts` | `Customer` flat model | Optional `ImportedContact` type; split `owner` → DAM name/email |
| `lib/customer-contacts.ts` | Derive from Customer row | Prefer explicit Contacts sheet when present |
| `components/customers/data-upload-panel.tsx` | Single-file validate/apply | Sheet detection UI; preview per sheet |

**No XLSX workbook file is shipped in C-8B.** C-8C adds downloadable templates via Customer Data. C-8D-3B enables upload/apply for the target multi-sheet template via MVP rollup.

---

## Changelog

| Date | Version | Change |
|------|---------|--------|
| 2026-06 | `2026-06-target-v1` | Initial C-8B specification |
