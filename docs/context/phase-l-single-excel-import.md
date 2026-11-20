# Phase L — Single Excel Import System

> **Approved design document** for consolidating Customer Data import into one Excel workbook template.  
> **Status:** **L-0** documentation context ✅ · **L-1A** model audit ✅ · **L-1B** complete ✅ (L-1B.1–L-1B.5) · **L-1F** stable verification ✅ · **L-2A** Row 2 parser ✅ · **L-2B** template/UI alignment ✅ · **L-2F** stable verification ✅ · **L-4F** flat public import stable ✅ · **Phase I** persistence pending · **K-2** SendGrid webhook pending.  
> **Prerequisite:** Phase **C-8** multi-sheet foundation (parser, rollup, cross-sheet validation) · Phase **J** auth/RBAC/audit (J-0–J-6F ✅).  
> **Does not deliver:** customer-facing sends, automatic sending, SendGrid calls, Communication Log creation from import, or durable server-side persistence (Phase **I**).

---

## 1. Feature purpose

Customer Data import should use **one Excel workbook template only**. The workbook becomes the single source file for customer/account, contact, and signal data.

Today the Customer Data page exposes **two** download paths — a legacy account-first CSV and a target multi-sheet XLSX — plus format detection between them. Phase L replaces that split UX with a **unified import experience**: one template, one upload flow, three required sheets.

### Guiding principle

> **Account tells us where the person belongs. Email tells us who the journey is for.**

| Identity | Role |
|----------|------|
| **Primary operational identity** | `Contacts.contact_email` — journeys, cooling, logs, send eligibility, sequence enrollment |
| **Context identity** | `Accounts.customer_id` / `customer_name` — plan, stage, usage, seats, renewal, owner/DAM |

`contact_email` is the **single source of truth for people**. Signals reference contacts; they do not create them.

### What Phase L is not (L-0)

- **Not** implementation — L-0 is documentation only
- **Not** customer-facing or automatic sending
- **Not** SendGrid or any email provider call during import
- **Not** automatic Communication Log creation from Signals
- **Not** durable server-side import or database persistence (Phase **I**)
- **Not** SendGrid webhook tracking (Phase **K-2**)

---

## 2. Product behavior (required)

### 2.1 Single template UX

| Current (to remove) | Target (Phase L) |
|---------------------|------------------|
| Download Current Upload Template (account-first CSV) | **One** visible template |
| Download Target Multi-Sheet Template (XLSX preview) | **Download Excel Import Template** |

Users upload **one Excel workbook** with three sheets:

| Sheet | Required | Grain |
|-------|----------|-------|
| `Accounts` | Yes | One row per `customer_id` |
| `Contacts` | Yes | One row per unique `contact_email` |
| `Signals` | Yes (sheet present; rows optional) | One row per communication event |

### 2.2 Upload and replace semantics

- **Re-uploading the workbook replaces** the current session customer/contact data.
- Re-upload must **not append** duplicate customers or duplicate contacts.
- Apply is **replace**, not merge — the uploaded workbook is the new session truth for accounts and contacts.

### 2.3 Contact email rules

- `contact_email` values are **trimmed** and **normalized to lowercase** on parse/validate.
- **Duplicate `Contacts.contact_email` values are blocking errors** (globally unique across the workbook).
- Empty or invalid `contact_email` → blocker.

### 2.4 Signals rules

- Signals **may reference the same `contact_email` multiple times** — a contact can have many communication events.
- Signals **must not create contacts** — every signal row must reference an existing contact on the Contacts sheet.
- In current MVP scope: if Signals are not persisted into Communication Logs, they are **detected, validated, and previewed only** (see §6).
- Do **not** convert Signals into Communication Logs in L-1 unless explicitly approved later.

### 2.5 Import side effects (explicit non-goals)

| Behavior | L import rule |
|----------|---------------|
| Send email on import | **No** |
| SendGrid / provider call | **No** |
| Customer send route | **No** |
| Automatic sending | **No** |
| Cron / background jobs | **No** |
| Communication Logs from import | **No** |
| Action Queue auto-refresh | **Manual only** unless current behavior already explicitly refreshes |

Existing auth/RBAC/audit safety from Phase **J** must remain intact.

---

## 3. Workbook schema

### 3.1 Sheet: `Accounts`

One row per `customer_id`. Account-level context and Activity Trigger evaluation fields.

| Column | Notes |
|--------|-------|
| `customer_id` | Required, unique within workbook |
| `customer_name` | Required |
| `plan` | |
| `stage` | |
| `segment` | |
| `use_case` | |
| `icp` | |
| `account_owner` | |
| `owner_dam_name` | |
| `owner_dam_email` | |
| `onboarding_start_date` | |
| `term_start_date` | |
| `renewal_date` | |
| `invite_status` | `Pending`, `Accepted`, `Expired` |
| `invite_sent_date` | |
| `invite_accepted_date` | |
| `usage_sessions` | |
| `usage_activities` | |
| `active_users` | |
| `last_usage_date` | |
| `usage_threshold` | |
| `usage_threshold_percent` | |
| `seats_total` | |
| `seats_assigned` | |
| `seat_assignment_percent` | |
| `graph_desktop_assigned` | |
| `graph_browser_assigned` | |
| `search_assigned` | |
| `academy_visited` | `Yes`, `No` |
| `webinar_attended` | `Yes`, `No` |
| `last_email_sent_date` | |
| `last_email_sent_type` | |
| `emails_sent_count` | |
| `notes` | |
| `next_recommended_action` | |

### 3.2 Sheet: `Contacts`

One row per **unique** `contact_email`. Primary operational identity.

| Column | Notes |
|--------|-------|
| `contact_email` | Required; trim + lowercase; **globally unique** |
| `contact_role` | `Admin`, `User`, `CSM` |
| `contact_name` | Recommended |
| `do_not_contact` | `Yes`, `No` (default `No`) |
| `customer_id` | Required; must exist on Accounts |

### 3.3 Sheet: `Signals`

One row per communication/signal event. References existing contacts only.

| Column | Notes |
|--------|-------|
| `contact_email` | Required; must exist on Contacts |
| `customer_id` | Required; must exist on Accounts |
| `sent_at` | Datetime |
| `template_or_type` | |
| `channel` | e.g. `email`, `internal_alert` |
| `status` | |

---

## 4. Validation rules

Validate the workbook **before** apply. If any **blocker** exists, disable Apply.

### 4.1 Blockers

| Rule | Detail |
|------|--------|
| Missing `Accounts` sheet | Workbook invalid |
| Missing `Contacts` sheet | Workbook invalid |
| Missing required columns | Per sheet schema |
| Empty `Accounts.customer_id` | Row blocker |
| Duplicate `Accounts.customer_id` | Workbook blocker |
| Empty `Accounts.customer_name` | Row blocker |
| Empty `Contacts.contact_email` | Row blocker |
| Invalid `Contacts.contact_email` | Format blocker |
| Duplicate `Contacts.contact_email` | **Global blocker** (after normalize) |
| Contact references unknown `customer_id` | Orphan contact blocker |
| Signal references unknown `contact_email` | Orphan signal blocker |
| Signal references unknown `customer_id` | Orphan signal blocker |

### 4.2 Warnings (non-blocking)

| Rule | Detail |
|------|--------|
| Account has no contacts | No Contacts rows for `customer_id` |
| Contact missing `contact_name` | Data quality |
| Unknown or unsupported `contact_role` | Enum mismatch |
| Missing `owner_dam_email` | Internal routing hint |
| Missing important dates | e.g. renewal, invite dates |
| Seats/usage/date parsing issues | If non-blocking in current MVP behavior |

Warnings are visible in preview; they do **not** prevent apply unless promoted to blockers in a later phase.

---

## 5. Import / apply behavior

### 5.1 Flow

```
Upload workbook
  → Parse Accounts + Contacts + Signals sheets
  → Normalize contact_email (trim, lowercase)
  → Validate (blockers + warnings)
  → Preview counts and issues
  → [If no blockers] Apply replaces session data
```

### 5.2 Apply rules

| Rule | Behavior |
|------|----------|
| Blockers present | Apply **disabled** |
| No blockers | Apply **replaces** current session data |
| Append semantics | **Forbidden** — no merge with prior upload |
| Duplicate contacts | **Forbidden** — blocked at validation |
| Silent drop of contacts | **Forbidden** — full Contacts sheet rows are stored in session `importedContacts` on apply (**L-1B.3** ✅). Customer rollup may still map first Admin/User per account until **L-1B.4** Contacts tab update. |

### 5.2.1 L-1B.3 session state (implemented)

- **`importedContacts`** — session array of every normalized Contacts sheet row (`ImportedContact` type).
- **Apply** calls `setCustomers` + `setImportedContacts` — **replace**, never append.
- **Signals** — validated and previewed only; no Communication Logs or contact creation.
- **Contacts tab** — uses `importedContacts` when `dataSource === "upload"` (**L-1B.4** ✅); demo mode still uses `deriveAllContacts(customers)`.

### 5.3 Preview counts (required UI)

After validation, show:

| Count | Description |
|-------|-------------|
| `accounts` | Rows on Accounts sheet |
| `contacts` | Unique contact rows after normalize |
| `signals` | Rows on Signals sheet |
| `blockers` | Blocking issue count |
| `warnings` | Warning count |
| `duplicate_contact_email_count` | Duplicate emails detected (should block apply) |
| `orphan_contact_count` | Contacts with unknown `customer_id` |
| `orphan_signal_count` | Signals with unknown `contact_email` or `customer_id` |
| `extra_contacts_not_persisted` | If current MVP rollup still cannot store all contacts — show count, do not hide |

---

## 6. Contacts behavior (post-import UI)

The **Contacts / Emails** tab must reflect the single-workbook model:

| Requirement | Detail |
|-------------|--------|
| Row grain | **One row per unique `contact_email`** |
| Email display | Normalized lowercase, trimmed |
| Account relationship | Show `customer_id` / `customer_name` from Contacts → Accounts join |
| Role | Show `contact_role` when available |
| Suppression | Show `do_not_contact` when available |
| Identity | `contact_email` is the operational identity for journeys, queue, logs |

Legacy derivation from flat `admin_email` / `user_email` on account rows is **replaced** by explicit Contacts sheet data in Phase L.

---

## 7. Signals behavior

| Rule | Detail |
|------|--------|
| Nature | References/events — **not** contact creators |
| Duplication | Multiple signal rows per `contact_email` allowed |
| Persistence (L-1 MVP) | Detected, validated, previewed; **not** written to Communication Logs |
| Future | Converting Signals → Communication Logs requires explicit approval (not L-1 default) |

Session **Communication Logs** remain the runtime source for operator-initiated sends (test, dry run, live internal, simulated K-1). Import does not seed logs from Signals in Phase L.

---

## 8. Safety rules

Non-negotiable for Phase L implementation:

| Rule | Requirement |
|------|-------------|
| No SendGrid on import | No mail API calls |
| No email provider on import | No outbound provider |
| No customer send route | Unchanged |
| No automatic sending | Unchanged |
| No cron / background jobs | Unchanged |
| No Communication Logs from import | Signals preview-only unless later approved |
| Auth / RBAC / audit | Phase J guards remain; new paths use `upload_customer_data` |
| Replace not append | Re-upload replaces session data |
| No silent data loss | Extra contacts preserved in `importedContacts` and Contacts / Emails tab (**L-1B.3–L-1B.4** ✅) |

### 5.2.2 L-1B.5 polish (implemented)

- **`data.excel_import.validate` / `data.excel_import.apply`** — counts-only metadata via `lib/audit/excel-import-audit.ts`
- **Contacts export** — upload mode uses `exportImportedContactsCsv`; demo mode keeps derived export
- **Stale copy removed** — no two-template labels, no “extra contacts not persisted” in user-facing UI
- **`scripts/verify-single-excel-import.ts`** — full L-1B regression checks

---

## 9. Audit direction (implementation) — L-1B.5 ✅

Excel import UI audit events are implemented:

| Action | When |
|--------|------|
| `data.excel_import.validate` | After workbook validation (success or blocker outcome) |
| `data.excel_import.apply` | After successful apply (session replace) |

### Permission

`upload_customer_data` — required for validate/apply API or UI paths when auth is enabled.

### Metadata (counts only)

| Field | Description |
|-------|-------------|
| `account_count` | Accounts sheet row count |
| `contact_count` | Unique contacts after normalize |
| `signal_count` | Signals sheet row count |
| `blocker_count` | Blockers |
| `warning_count` | Warnings |
| `duplicate_contact_email_count` | Duplicate emails found |
| `orphan_contact_count` | Orphan contacts |
| `orphan_signal_count` | Orphan signals |

Legacy `data.upload.validate` / `data.upload.apply` remain for internal legacy single-sheet path only.

### Do not audit

- Raw workbook contents
- Full contact list
- Email bodies
- Template HTML
- Secrets

---

## 10. Relationship to current codebase (C-8)

Phase **C-8** delivered multi-sheet parser, rollup to `Customer[]`, cross-sheet validation, and a two-template UX with Option A CSV + Option C XLSX MVP rollup.

Phase L **consolidates** toward:

| C-8 today | Phase L target |
|-----------|----------------|
| Two download buttons | One **Download Excel Import Template** |
| Option A CSV + Option C XLSX | **XLSX only** (three sheets) |
| MVP rollup (first Admin/User per account) | Full Contacts sheet as source of truth |
| Signals detected, not imported | Unchanged in L-1 — preview/validate only |
| Format detection (current vs target) | Single format — no legacy CSV path in UI |

Existing libraries to extend in L-1A/L-1B (audit only in L-0 — **no code changes yet**):

- `lib/import-multisheet-parser.ts`
- `lib/import-multisheet-validation.ts`
- `lib/import-multisheet-cross-validation.ts`
- `lib/import-customer-rollup.ts`
- `components/customers/data-upload-panel.tsx`
- `lib/import-templates.ts`

See also: [Excel import template spec](../EXCEL-IMPORT-TEMPLATE.md) for column history and C-8 roadmap.

---

## 11. Implementation roadmap

| Phase | Focus | Status |
|-------|--------|--------|
| **L-0** | Documentation context (this document) | ✅ Complete |
| **L-1A** | Import model audit and exact implementation plan | ✅ Complete — [audit doc](phase-l-1a-model-audit.md) |
| **L-1B.1** | UI / single Excel template download; XLSX-only upload UX | ✅ Complete |
| **L-1B.2** | Parser / validation hardening (duplicate email, signal blockers, required columns) | ✅ Complete |
| **L-1B.3** | Apply / replace semantics + `importedContacts` | ✅ Complete |
| **L-1B.4** | Contacts tab source-of-truth UI | ✅ Complete |
| **L-1B.5** | Audit / export / verification polish | ✅ Complete |
| **L-1B** | Single Excel import implementation | ✅ Complete |
| **L-1F** | Stable verification checkpoint | ✅ Complete |
| **Phase I** | Durable persistence / server-side import | Future |
| **Phase K-2** | SendGrid webhook tracking | Future |

### L-1A deliverables (next)

- Audit current upload panel, templates, parser, rollup, and validation against this spec
- Identify gaps: duplicate-email global blocker, lowercase normalize, single-template UX, CSV removal
- File-level change plan for L-1B
- Verification script plan for L-1F

### L-1B scope (high level)

- One downloadable XLSX template (Accounts + Contacts + Signals)
- Remove two-template UX
- Wire validate/apply to replace session data with blocker gating
- Contacts tab reads explicit contact rows (not legacy admin/user derivation only)
- Preview counts per §5.3
- Audit hooks per §9 (if not already present)

### L-1F scope — stable verification ✅

Verified via:

- `npm run lint` / `npm run build`
- `scripts/verify-single-excel-import.ts` (L-1B.1–L-1B.5)
- `scripts/verify-l-1f-stable.ts` (end-to-end import scenarios)
- Import cross-validation, parser, validate, reports, API security, simulated logs scripts
- Route smoke: `/`, `/customers`, `/email-library`, `/sequences`, `/automations`, `/action-queue`, `/send-logs`, `/reports` (HTTP 200)
- Browser smoke: Customer Data UI, Contacts / Emails derived mode, demo banner

**Next:** Phase **I** (durable persistence) · **K-2** (SendGrid webhook tracking)

---

## 12. Open decisions (for L-1A)

| Topic | L-0 default |
|-------|-------------|
| Legacy CSV upload | Remove from UI; L-1A confirms whether any backward-compat path is needed |
| Signals sheet empty | Sheet required; zero data rows allowed if validation passes |
| Extra contacts beyond MVP storage | Preserved in `importedContacts` session state; account rollup still first Admin/User (**L-1B.3–L-1B.4** ✅) |
| Signals → Communication Logs | **Out of scope** for L-1 unless explicitly approved |
| `days_since_start` / `days_to_renewal` | Prefer app-computed from dates (not imported) |

---

## Related documentation

- [Product context](product.md) — contact-first architecture, Customer Data §5, Phase L summary
- [Excel import template spec](../EXCEL-IMPORT-TEMPLATE.md) — C-8 column reference and legacy Option A
- [Phase J auth architecture](phase-j-auth-architecture.md) — RBAC and audit foundation
- [Phase K Communication Ledger](phase-k-communication-ledger.md) — Communication Logs; separate from import Signals
- [Phase L-1A model audit & plan](phase-l-1a-model-audit.md) — current-state audit and L-1B file plan
