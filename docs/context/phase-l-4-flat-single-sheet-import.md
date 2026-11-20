# Phase L-4 — Flat Single-Sheet Row 2 Import

> Parser adapter for the flat `Journey Import` workbook. **L-4D** makes flat the user-facing download template; L-2 multi-sheet Row 2 import remains supported as fallback.

---

## L-4A audit decision

**Conditionally ready** to implement flat parser (completed in L-4B).

| Topic | Decision |
|-------|----------|
| `segment` | Safe to remove — use `use_case` only |
| `account_owner` | Safe to remove — derive from Admin `contact_name` |
| `owner_dam_*` | Replace with `contact_role=CSM` + `contact_email` per account |
| `last_email_sent_*`, `emails_sent_count` | Risky — deferred to L-4G / Phase I / Communication Logs sync |
| Signals sheet | Removed from flat import — historical sends belong in Communication Logs |
| Repeated `account_id` | Allowed in flat rows — dedupe accounts, one contact per row |
| `contact_email` | Globally unique (blocker unchanged in L-4C) |

---

## Flat import model

| Item | Value |
|------|--------|
| Sheet name | `Journey Import` |
| Optional sheet | `Field Guide` (ignored by parser) |
| Row 1 | Human-readable labels (ignored) |
| Row 2 | System keys (canonical) |
| Row 3+ | Data — **one row = one account + one contact** |
| `account_id` | May repeat across rows |
| `contact_email` | Globally unique |

### Canonical flat keys (Row 2)

Account + contact fields on one row. Uses `use_case` (singular) aligned with the app model.

**Included:** `account_id`, `account_name`, `plan`, `journey_stage`, `use_case`, `primary_icp`, term/activation/renewal dates, seat and usage metrics, onboarding fields, `contact_email`, `contact_name`, `contact_role`, `do_not_contact`, invite fields, `notes`.

**Excluded from flat import:** `segment`, `account_owner`, `owner_dam_name`, `owner_dam_email`, `last_email_sent_date`, `last_email_sent_type`, `emails_sent_count`.

---

## L-4B — Parser adapter (complete)

### Behavior

- Detects `Journey Import` sheet with flat Row 2 keys → `headerMode: flat_row2`
- Emits existing `NormalizedImport` shape:
  - `accounts[]` — deduplicated by `account_id` (first row wins)
  - `contacts[]` — one per data row with `contact_email`
  - `signals[]` — always empty in L-4B
- Field Guide ignored
- No emails sent, no Communication Logs created, no SendGrid calls

### Internal field mappings (flat → existing model)

| Flat key | Internal |
|----------|----------|
| `account_id` | `customer_id` |
| `account_name` | `customer_name` |
| `journey_stage` | `stage` |
| `primary_icp` | `icp` |
| `seats_purchased` | `seats_total` |
| `total_sessions` | `usage_sessions` |
| `total_active_seats` | `active_users` |
| seat assignment columns | summed → `seats_assigned` |
| `activation_start_date` / `onboarding_date` | `onboarding_start_date` |

### Key files

| File | Role |
|------|------|
| `lib/import-flat-row2-schema.ts` | Canonical flat keys + header detection |
| `lib/import-flat-row2-parser.ts` | `parseFlatRow2Workbook()` |
| `lib/import-flat-row2-fixture.ts` | Test workbooks |
| `lib/import-workbook-router.ts` | `parseImportWorkbook()` routes flat vs multi-sheet |
| `lib/import-format-detection.ts` | `Flat Row 2 workbook` label |

### Verification

```bash
npx tsx scripts/verify-flat-row2-import.ts
```

---

## L-4C — Validation + validate/apply wiring (complete)

**Status:** ✅ Complete

### Wired behavior

- `validateTargetMultisheetWorkbook()` now calls `parseImportWorkbook()` (flat + multi-sheet + legacy)
- Flat workbooks validate through the **same path** as the Customer Data UI
- Apply replaces `customers` and `importedContacts` (replace semantics unchanged)
- Re-upload does not double counts

### Flat validation rules

| Rule | Severity |
|------|----------|
| Missing / duplicate Row 2 keys on Journey Import | Blocker |
| Empty `account_id`, `account_name`, `contact_email`, `contact_role` | Blocker |
| Invalid / duplicate `contact_email` | Blocker |
| `account_name` conflict for same `account_id` | Blocker |
| `plan`, `journey_stage`, `term_start_date`, `renewal_date` conflict | Warning |
| No CSM contact with valid email per account | Warning (`ACCOUNT_MISSING_CSM_CONTACT`) |
| No Admin contact with valid email per account | Warning (`ACCOUNT_MISSING_ADMIN_CONTACT`) |
| Prior send history not in flat file | Info (`COMMUNICATION_HISTORY_NOT_IMPORTED`) |

### Not required for flat import

- Accounts / Contacts / Signals sheets
- Orphan signal blockers
- Duplicate `account_id` blocker (repeated rows expected)

### Verification

```bash
npx tsx scripts/verify-flat-row2-validation.ts
```

### Key files

| File | Role |
|------|------|
| `lib/import-flat-row2-validation.ts` | Flat-specific cross-validation |
| `lib/import-multisheet-validation.ts` | `parseImportWorkbook()` wiring |
| `lib/import-multisheet-cross-validation.ts` | Dispatches to flat validator |

---

## L-4D — Flat template download + UI copy (complete)

**Status:** ✅ Complete

### Public template (`excel-import-template.xlsx`)

| Item | Value |
|------|--------|
| Sheets | `Journey Import` + `Field Guide` |
| Row 1 | Human-friendly labels (editable) |
| Row 2 | Canonical flat system keys |
| Row 3+ | Sample data — 2+ accounts, Admin + User + CSM rows, unique `contact_email` |
| Removed keys | `segment`, `account_owner`, `owner_dam_*`, `last_email_sent_*`, `emails_sent_count` |

### Customer Data UI

- **Download Excel Import Template** generates the flat workbook (not L-2 multi-sheet)
- Import helper copy explains Journey Import, Row 1/2/3, repeated `account_id`, unique `contact_email`
- Format notice: **Flat Row 2 workbook** (flat) · **Row 2 Excel workbook** (L-2 fallback) · **Legacy single-row workbook** (L-1)
- Flat preview: accounts/contacts counts, blockers/warnings, no Signals-required language

### Key files

| File | Role |
|------|------|
| `lib/import-templates.ts` | `buildFlatImportWorkbook()` + `downloadExcelImportTemplate()` |
| `components/customers/data-upload-panel.tsx` | Flat import copy + format notice |
| `components/customers/multisheet-import-preview.tsx` | Flat vs multi-sheet preview branches |
| `scripts/verify-flat-template-download.ts` | Public template verification |

### Verification

```bash
npx tsx scripts/verify-flat-template-download.ts
```

---

## L-4F — Stable verification (complete)

**Status:** ✅ Complete

Flat single-sheet **Journey Import** is the stable public import format after L-4B (parser), L-4C (validation/apply), and L-4D (template/UI).

### Verified scope

| Area | Result |
|------|--------|
| Public template | `Journey Import` + `Field Guide`; Row 1/2/3; 0 blockers |
| Parse | `flat_row2`; Field Guide ignored |
| Validate/apply | customers + importedContacts; re-upload replace semantics |
| Display/reports/export | importedContacts in upload mode; safe CSV export |
| Fallback | L-2 multi-sheet + L-1 legacy still pass |
| Safety | No SendGrid, no emails, no Communication Logs on import |

### Verification

```bash
npx tsx scripts/verify-l-4f-stable.ts
```

### Next phases

| Phase | Scope |
|-------|--------|
| **Phase I** | Durable persistence (recommended next) |
| **L-4G** | Last-email sync from Communication Logs |
| **K-2** | SendGrid webhook (separate future phase) |

---

## Not changed in L-4F

| Item | Status |
|------|--------|
| Flat parser/validation rules | Unchanged |
| Public template structure | Unchanged from L-4D |
| L-2 / L-1 fallback | Retained |
| Communication Logs / Action Queue / Email Sequences | Unchanged |

---

## L-2 multi-sheet fallback

Accounts + Contacts + Signals + Field Guide Row 2 import remains supported when uploaded (not exposed from the public download button). Covered by **L-2F** stable verification. L-1 legacy single-row fallback remains internal.

---

## Next phases (historical)

| Phase | Scope |
|-------|--------|
| **L-4E** | Rollup refinements for flat rows (optional) |
| **L-4G** | Last-email sync from Communication Logs |

---

## Safety

- Flat import does not send email
- Flat import does not create Communication Logs
- Signals are not imported from flat workbooks
- K-1 simulated ledger unchanged
