# Phase L-2 — Row 2 Header Import System

> **Status:** **L-2A** parser support ✅ · **L-2B** template/UI alignment ✅ · **L-2F** stable verification ✅  
> **Prerequisite:** [Phase L Single Excel Import](phase-l-single-excel-import.md) (**L-1B** ✅ · **L-1F** stable verification ✅).  
> **L-2A delivers:** Row 2 header parsing, validation, `account_id` → internal `customer_id` mapping, format detection, verification script.  
> **Does not deliver (L-2B+):** download template Row 1+2 layout in UI, SendGrid, customer-facing sends, automatic sending, Communication Log creation from import, or database persistence.

---

## 1. Decision summary

The Excel import workbook will move from a **single header row** to a **two-row header structure** on every required sheet (`Accounts`, `Contacts`, `Signals`).

| Row | Purpose | Stability |
|-----|---------|-----------|
| **Row 1** | Human-friendly display labels | **Editable** — operators may rename for readability |
| **Row 2** | App-readable system keys | **Stable** — parser and validator use this row as canonical headers |
| **Row 3+** | Data rows | One account / contact / signal per row (per sheet rules) |

**Canonical rule:** the app reads **Row 2** as the header row. Row 1 is presentation-only and must not be used for parsing or validation logic.

### Why two rows

- **Row 1** lets customer-facing template copy use plain language (e.g. “Account Name”, “Journey Stage”) without breaking the app.
- **Row 2** gives the parser a fixed, machine-readable contract (`account_name`, `journey_stage`, etc.).
- **Row 3+** keeps data separate from headers so label edits on Row 1 never shift data columns.

### Relationship to L-1 (current)

L-1 (**stable**) uses a **single header row** with keys such as `customer_id` on Accounts and Contacts. L-2 introduces:

- Two-row headers on all three sheets
- Renamed / expanded Accounts keys (e.g. `account_id` instead of `customer_id`)
- Additional Contacts columns (`account_name`, `customer_type`, `customer_first_name`)
- Signals keyed by `account_id` (aligned with Accounts)

L-2 is **documentation-first**. Implementation will update parser, template download, validation, and cross-sheet rules in a later phase — not in this document.

### Guiding principle (unchanged from L-1)

> **Account tells us where the person belongs. Email tells us who the journey is for.**

`Contacts.contact_email` remains the **source of truth for people**. Signals reference contacts; they do not create them.

---

## 2. Workbook structure

### 2.1 Sheets (unchanged requirement)

| Sheet | Required | Grain |
|-------|----------|-------|
| `Accounts` | Yes | One row per `account_id` |
| `Contacts` | Yes | One row per unique `contact_email` |
| `Signals` | Yes (sheet present; data rows optional) | One row per communication event |

### 2.2 Header layout (all sheets)

```
Row 1  →  Display labels (human-readable; may change)
Row 2  →  System keys     (stable; parser reads this row)
Row 3  →  First data row
Row 4+ →  Additional data rows
```

- **Row 2 is required.** A sheet without a valid Row 2 system-key header is invalid.
- **Data starts at Row 3.** Empty rows below data may be ignored per implementation rules.
- **Row 1 may be blank or customized** but must not replace Row 2 as the technical header.

### 2.3 Row 1 vs Row 2 examples (illustrative)

| Row 1 (display) | Row 2 (system key) |
|-----------------|-------------------|
| Account ID | `account_id` |
| Account Name | `account_name` |
| Journey Stage | `journey_stage` |
| Contact Email | `contact_email` |
| Do Not Contact | `do_not_contact` |

Operators can change Row 1 text freely. Changing Row 2 keys breaks import unless the app is updated to match.

---

## 3. Required Row 2 system keys

### 3.1 Accounts sheet

Row 2 must include these system keys (order in the sheet may vary; presence is required unless noted in a later implementation spec):

| System key (Row 2) |
|--------------------|
| `account_id` |
| `account_name` |
| `plan` |
| `journey_stage` |
| `segment` |
| `use_case` |
| `primary_icp` |
| `account_owner` |
| `owner_dam_name` |
| `owner_dam_email` |
| `term_start_date` |
| `activation_start_date` |
| `activation_window_end_date` |
| `renewal_date` |
| `seats_purchased` |
| `search_seats_assigned` |
| `graph_browser_seats_assigned` |
| `graph_desktop_seats_assigned` |
| `search_active_users` |
| `graph_browser_active_users` |
| `graph_desktop_active_users` |
| `total_active_seats` |
| `total_sessions` |
| `onboarding_date` |
| `onboarding_age_days` |
| `near_threshold` |
| `onboarding_completed` |
| `active_users_7d` |
| `total_sessions_7d` |
| `active_users_15d` |
| `total_sessions_15d` |
| `active_users_30d` |
| `total_sessions_30d` |
| `active_users_100d` |
| `total_sessions_100d` |
| `invite_status` |
| `invite_sent_date` |
| `invite_accepted_date` |
| `last_email_sent_date` |
| `last_email_sent_type` |
| `emails_sent_count` |
| `notes` |
| `next_recommended_action` |

### 3.2 Contacts sheet

| System key (Row 2) |
|--------------------|
| `contact_email` |
| `contact_role` |
| `contact_name` |
| `do_not_contact` |
| `account_id` |
| `account_name` |
| `customer_type` |
| `customer_first_name` |

**Identity rules (carry forward from L-1):**

- `contact_email` — normalized (trim + lowercase); globally unique across the workbook.
- `account_id` — must reference an `account_id` on the Accounts sheet (cross-sheet validation).

### 3.3 Signals sheet

| System key (Row 2) |
|--------------------|
| `contact_email` |
| `account_id` |
| `sent_at` |
| `template_or_type` |
| `channel` |
| `status` |

**Signals rules (carry forward from L-1):**

- Every signal row must reference an existing `contact_email` on Contacts.
- `account_id` must align with the contact’s account context (orphan / mismatch → blocker).
- **Repeated `contact_email` on Signals is allowed** (many events per contact).
- Signals are **preview/validate only** in current scope — not Communication Logs, not contact creation.

---

## 4. Validation direction (L-2)

When implemented, validation should follow these rules:

### 4.1 Header / structure

| Rule | Severity |
|------|----------|
| Row 2 must exist on Accounts, Contacts, and Signals | Blocker |
| Missing required Row 2 system key on a sheet | Blocker |
| Duplicate system key in Row 2 (same key twice) | Blocker |
| Data rows start at Row 3 | Structural requirement |
| Row 1 changes alone must not break parse if Row 2 is intact | Design goal |

### 4.2 Contacts

| Rule | Severity |
|------|----------|
| Duplicate `contact_email` (after normalize) | Blocker |
| Empty / invalid `contact_email` | Blocker |
| Orphan contact (`account_id` not on Accounts) | Blocker |

### 4.3 Signals

| Rule | Severity |
|------|----------|
| Orphan `contact_email` (not on Contacts) | Blocker |
| Orphan / mismatched `account_id` | Blocker |
| Repeated `contact_email` across signal rows | **Allowed** |
| Signals create contacts | **Forbidden** |
| Signals create Communication Logs on import | **Forbidden** |

### 4.4 Import side effects (unchanged)

| Behavior | L-2 rule |
|----------|----------|
| Send email on import | **No** |
| SendGrid / provider call | **No** |
| Customer send route | **No** |
| Automatic Action Queue send | **No** |
| Apply semantics | **Replace** session data (same as L-1) |

---

## 5. Implementation roadmap (future — not L-2 doc scope)

| Phase | Focus |
|-------|--------|
| **L-2** (this doc) | Document Row 2 header decision and system keys |
| **L-2A** (future) | Parser reads Row 2; ignore Row 1 for keys |
| **L-2B** (future) | Template generator with Row 1 labels + Row 2 keys |
| **L-2C** (future) | Validation / cross-sheet rules for new keys (`account_id`, expanded Accounts) |
| **L-2D** (future) | Migration notes from L-1 `customer_id` → L-2 `account_id` mapping |

---

## 6. Open decisions (for implementation phase)

| Topic | L-2 decision |
|-------|-------------|
| L-1 workbook backward compatibility | **L-2A:** legacy single-row headers parse as `legacy_single_row` fallback; primary path is Row 2 |
| `account_id` vs legacy `customer_id` | **L-2A:** workbook uses `account_id`; mapped to internal `customer_id` for session `Customer` model |
| Row 1 required vs optional | Row 2 required; Row 1 display labels ignored by parser/validator |
| Extra columns beyond listed keys | Warn or ignore — define in L-2C |

### L-2B implementation (complete)

- **Download Excel Import Template** generates Row 1 labels + Row 2 system keys + Row 3+ sample data
- Filename remains `excel-import-template.xlsx`
- Optional **Field Guide** sheet documents Row 1/Row 2/Row 3 rules (parser ignores it)
- Customer Data UI copy explains Row 1 / Row 2 / Row 3 layout
- Format detection messages say **Row 2 Excel workbook** or **Legacy single-row workbook** (no Option A/C in UI)
- L-1 legacy single-row headers remain an internal parser fallback only

### L-2A implementation (complete)

- Parser reads **Row 2** system keys on Accounts, Contacts, Signals; **Row 3+** is data; **Row 1** ignored
- `account_id` / `account_name` / `journey_stage` / `primary_icp` / `seats_purchased` / `total_sessions` / `total_active_seats` mapped to internal Customer fields
- Validation blockers: missing Row 2 header, duplicate Row 2 keys, missing required Row 2 keys
- Verification: `npx tsx scripts/verify-row2-header-import.ts`
- Smoke workbook: `row2-system-import-template-20-accounts.xlsx` (20 accounts, 40 contacts)
- No emails, Communication Logs, or SendGrid from import

**Next:** Phase **I** durable persistence (future) · Phase **K-2** SendGrid webhook (future)

### L-2F stable verification (complete)

Run: `npx tsx scripts/verify-l-2f-stable.ts`

Covers end-to-end Row 2 import: template structure, parser mappings, validate/apply payload, re-upload replace, header blockers, duplicate email blocker, orphan signals, contacts/reports/export/audit/safety.

---

## Related documentation

- [Phase L — Single Excel Import System](phase-l-single-excel-import.md) — L-1 stable design (single header row)
- [Phase L-1A model audit](phase-l-1a-model-audit.md) — L-1 implementation audit
- [Product context](product.md) — contact-first architecture
- [Excel import template spec](../EXCEL-IMPORT-TEMPLATE.md) — legacy C-8 column reference
