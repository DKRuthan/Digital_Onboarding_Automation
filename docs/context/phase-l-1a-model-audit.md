# Phase L-1A — Single Excel Import Model Audit & L-1B Implementation Plan

> **Audit + plan document** for consolidating Customer Data import into one Excel workbook.  
> **Status:** **L-1A** complete ✅ · **L-1B** complete ✅ (L-1B.1–L-1B.5) · **L-1F** stable verification ✅ · **Phase I** persistence pending.  
> **Prerequisite:** [Phase L Single Excel Import design](phase-l-single-excel-import.md) (L-0 ✅).

---

## Executive summary

The codebase already has a strong **Option C** foundation: multi-sheet parser, cross-sheet validation, MVP rollup to `Customer[]`, preview UI, and client-generated XLSX template with `Accounts` + `Contacts` + `Signals`. However, the **upload UX still exposes two templates and dual formats** (legacy CSV / account-first XLSX + target multi-sheet XLSX). Phase L gaps are concentrated in:

1. **UX** — two download buttons; CSV still accepted; format-detection split.
2. **Validation** — global duplicate `contact_email` is **not** a blocker; signal orphan refs are **warnings** not blockers; `Signals` sheet is **optional**; missing column headers on multi-sheet are **not** validated.
3. **Data model** — contacts are still **derived** from flat `Customer.admin_email` / `user_email` after rollup; extra contacts are **dropped** (first Admin/User wins).
4. **Normalization** — lowercase trim exists in cross-validation maps but **not** applied to parsed contact rows or rollup output emails consistently.
5. **Audit** — uses `data.upload.validate` / `data.upload.apply`; Phase L specifies `data.excel_import.*` with counts-only metadata.

**L-1B is ready to start** once the file plan below is accepted. No schema migration required for MVP — session `Customer[]` can remain with an added `importedContacts` session array (recommended in L-1B.4).

---

## 1. Current upload UI audit

### Where template buttons render

`components/customers/data-upload-panel.tsx` — **Import Templates** card (lines ~304–330).

### Button labels and downloads

| Button label | Handler | Download |
|--------------|---------|----------|
| **Download Current Upload Template** | `downloadCurrentUploadTemplate()` | `current-upload-template.csv` — 39-column account-first CSV via `lib/csv-template.ts` → `buildSampleCsv()` |
| **Download Target Multi-Sheet Template** | `downloadTargetMultisheetTemplate()` | `target-multisheet-import-template.xlsx` — `Accounts` + `Contacts` + `Signals` via `lib/import-templates.ts` → `buildTargetMultisheetWorkbook()` |

### Upload exposure

| Topic | Current behavior |
|-------|------------------|
| File input `accept` | `.csv,.xlsx` |
| Primary upload button | **Upload CSV/XLSX** |
| CSV upload | **Yes** — any `.csv` is detected as `option_a` (`lib/import-format-detection.ts`) |
| XLSX upload | **Yes** — `option_a` if first sheet has 39 `REQUIRED_COLUMNS`; `option_c` if `Accounts` + `Contacts` sheets present |
| Invalid XLSX | Rejected with warning toast |

### Helper / notice text (two-template / MVP rollup)

| Location | Text |
|----------|------|
| Import Templates intro | *"Both templates are upload-supported. The multi-sheet template uses MVP rollup into the current customer model."* |
| Current template helper | *"Use this account-first template for uploads today. The app currently validates the first sheet only."* |
| Target template helper | *"Accounts + Contacts are converted into the current customer model. Extra contacts beyond the first Admin/User are not stored yet."* |
| `ImportFormatNotice` (option_c) | *"Detected: Target multi-sheet format — supported via MVP rollup."* + extra-contacts note |
| `MultisheetImportPreview` | *"The first Admin and first User contact are used for each account. Extra contacts are not persisted yet."* |
| `ContactsImportQualityPreview` | Extra Admin/User/CSM not persisted counts |
| README §Import | Documents both templates |

### Other upload controls

- **Validate Data** — branches on `importFormat` (`option_a` vs `option_c`)
- **Apply Uploaded Data** — shared `handleApply` → `applyUploadedCustomers(validation.customers)`
- **Refresh Action Queue** — manual; does not gate apply
- Permission gate: `upload_customer_data` via `useCan` + `gateByPermission`

---

## 2. Current parser audit

### CSV (`option_a`)

| Step | Implementation |
|------|----------------|
| Detection | Extension `.csv` → always `option_a` |
| Parse | `parseUploadFile()` in `lib/upload-validation.ts` |
| Sheets | **First sheet only** (`workbook.SheetNames[0]`) |
| Headers | Normalized: trim, lowercase, spaces → `_` |
| Output | `Record<string, string>[]` rows |

### XLSX (`option_a` on first sheet)

Same `parseUploadFile()` — first worksheet only, 39 legacy columns.

### XLSX (`option_c` multi-sheet)

| Step | Implementation |
|------|----------------|
| Detection | `Accounts` + `Contacts` sheet names (case-insensitive) |
| Parse | `parseTargetMultisheetWorkbook()` in `lib/import-multisheet-parser.ts` |
| Required sheets | **Accounts** ✅ required (throws if missing) · **Contacts** ✅ required (throws if missing) |
| Signals sheet | **Optional** — parsed if present; else `signals: []` |
| Row filter | Drops fully empty rows per sheet |
| Header normalize | trim + lowercase + `_` |
| `contact_email` normalize | **Trim only** on cell string — **not** forced lowercase in parser output |
| Business validation | **Not** in parser — delegated to cross-validation + rollup |

### Missing sheet behavior

| Sheet | Behavior |
|-------|----------|
| `Accounts` missing | `MultisheetParserError("Accounts sheet is required.")` → validation fails |
| `Contacts` missing | `MultisheetParserError("Contacts sheet is required.")` → validation fails |
| `Signals` missing | Allowed — `signals: []`; preview shows *"Not present"* |

### Signals today

| Stage | Behavior |
|-------|----------|
| Parsed | Yes, when sheet exists |
| Validated | Yes — orphan refs as **warnings**; `SIGNALS_NOT_IMPORTED` info |
| Previewed | Yes — row count in `MultisheetImportPreview` |
| Applied / persisted | **No** — not written to Communication Logs or session state |
| Creates contacts | **No** |

### Extra contacts

| Stage | Behavior |
|-------|----------|
| Validation | Multiple Admin/User per account → **warnings** (`CONTACT_MULTIPLE_*`) |
| Rollup | `rollupContactsForAccount()` keeps **first Admin**, **first distinct User**, **first CSM email** |
| Preview | `buildContactsImportQualitySummary()` counts `extraAdminNotPersisted`, etc. |
| Persisted | **Dropped** beyond first-per-role — not stored anywhere |

---

## 3. Current validation audit

### Path summary

| Format | Validate entry | Blockers gate Apply |
|--------|----------------|---------------------|
| `option_a` | `validateCustomerRows()` | Row errors, missing columns, duplicate `customer_id` |
| `option_c` | `validateTargetMultisheetFile()` → `validateNormalizedMultisheetImport()` + rollup | Cross-sheet **blockers** only |

### Rule-by-rule (Option C / cross-validation)

| Rule | Current severity | Code(s) |
|------|------------------|---------|
| Duplicate `customer_id` (Accounts) | **Blocker** | `ACCOUNT_DUPLICATE_CUSTOMER_ID` |
| Empty `customer_id` | **Blocker** | `ACCOUNT_MISSING_CUSTOMER_ID` |
| Empty `customer_name` | **Blocker** | `ACCOUNT_MISSING_CUSTOMER_NAME` |
| Duplicate `contact_email` (global) | **Not checked** | — |
| Duplicate `(customer_id, contact_email, contact_role)` | **Blocker** | `CONTACT_DUPLICATE_KEY` |
| Same email across multiple accounts | **Warning** | `CONTACT_EMAIL_MULTI_ACCOUNT` |
| Invalid `contact_email` | **Blocker** | `CONTACT_INVALID_EMAIL` |
| Empty `contact_email` | **Blocker** | `CONTACT_MISSING_EMAIL` |
| Orphan contact (`customer_id` not on Accounts) | **Blocker** | `CONTACT_ORPHAN_CUSTOMER_ID` |
| Orphan signal (`contact_email` / `customer_id`) | **Warning** | `SIGNAL_UNKNOWN_CONTACT_EMAIL`, `SIGNAL_UNKNOWN_CUSTOMER_ID` |
| Duplicate account rows (rollup path) | Cross-val **blocker** on sheet; rollup also **warns** + skips duplicate | `ACCOUNT_DUPLICATE_CUSTOMER_ID` / `duplicate_account` warning |
| Missing required columns (multi-sheet) | **Not validated** | — |
| Unsupported `contact_role` | **Blocker** | `CONTACT_INVALID_ROLE` |
| Account with no Admin contact | **Warning** | `CONTACT_MISSING_ADMIN` |
| Account with no contacts at all | **Warning** (implicit via missing Admin) | `CONTACT_MISSING_ADMIN` per account |
| Missing `owner_dam_email` | **Warning** | `ACCOUNT_MISSING_OWNER_DAM_EMAIL` |

### Duplicate `Contacts.contact_email` — explicit answer

| Phase L requirement | Current state |
|---------------------|---------------|
| Global duplicate `contact_email` = **blocker** | **Not checked globally** |
| Same email, same account, same role | **Blocked** (`CONTACT_DUPLICATE_KEY`) |
| Same email, different accounts | **Warned only** (`CONTACT_EMAIL_MULTI_ACCOUNT`) |
| Same email, same account, different role | **Allowed** (no global email uniqueness) |

### Option A note

Legacy CSV path validates `admin_email` / `user_email` per row but has **no** cross-row contact_email duplicate check.

---

## 4. Current apply behavior

### Replace vs append

| Behavior | Detail |
|----------|--------|
| Apply semantics | **Replace** — `applyUploadedCustomers(uploaded)` calls `setCustomers(uploaded)` |
| Append | **No** — full array swap |
| `dataSource` | Set to `"upload"` |
| Workflow statuses | **Reset** — `setWorkflowStatuses({})` |
| `sendLogs` | **Untouched** on apply |
| Templates / sequences / enrollments | **Untouched** on apply |
| Triggers | **Untouched** (localStorage) |

### Where apply happens

1. `DataUploadPanel.handleApply()` → `applyUploadedCustomers(validation.customers)`
2. `CustomerDataProvider.applyUploadedCustomers` (`components/providers/customer-data-provider.tsx` ~568)

### Derived contacts rebuild

Contacts tab uses `deriveAllContacts(customers)` at render time (`components/customers/contacts-table.tsx`). No separate contact state — **rebuilt from flat `Customer[]` after every apply**.

### Action Queue refresh

| Mechanism | Behavior |
|-----------|----------|
| Reactive | `actionQueue` is `useMemo` over `customers` + rules + enrollments — **auto-recomputes** when customers change |
| Manual | **Refresh Action Queue** calls `runAutomations()` which only **returns count** and shows toast — does not mutate state |
| Apply toast | Says *"Dashboard and queue updated"* — queue updates via reactive `useMemo`, not explicit refresh |

### Communication Logs / sends on import

| Check | Result |
|-------|--------|
| SendGrid | **No** |
| Customer send route | **No** |
| Automatic sending | **No** |
| Communication Logs created | **No** |
| Signals → logs | **No** |

### Audit on apply/validate (current)

| Action | Metadata |
|--------|----------|
| `data.upload.validate` | `import_format`, `row_count`, `valid_rows`, `error_rows` |
| `data.upload.apply` | `customer_count`, `import_format` |

Phase L target: `data.excel_import.validate` / `data.excel_import.apply` with counts-only fields (see §9).

---

## 5. Phase L field mapping table

Legend: **✅** supported end-to-end · **⚠️** partial / rollup-only · **❌** not mapped · **🔧** L-1B change needed

### Accounts sheet → `Customer`

| Phase L field | Current source | Status | L-1B change |
|---------------|----------------|--------|-------------|
| `customer_id` | `ImportedAccountRow` → `Customer.customer_id` | ✅ | — |
| `customer_name` | → `Customer.customer_name` | ✅ | — |
| `plan` | → `Customer.plan` | ✅ | — |
| `stage` | → `Customer.stage` | ✅ | — |
| `segment` | Parsed on account row | ⚠️ | Used as fallback for `use_case` only; **🔧** store or map `segment` if needed on `Customer` |
| `use_case` | → `Customer.use_case` (or `segment` fallback) | ✅ | — |
| `icp` | → `Customer.icp` | ✅ | — |
| `account_owner` | → `Customer.account_owner` | ✅ | — |
| `owner_dam_name` | Parsed; not on `Customer` | ⚠️ | **🔧** keep in import metadata or split `owner` display |
| `owner_dam_email` | → `Customer.owner` (via `resolveOwnerFromAccount`) | ✅ | — |
| `onboarding_start_date` | Used for `days_since_start` fallback | ⚠️ | Not stored on `Customer`; computed days only |
| `term_start_date` | → `Customer.term_start_date` | ✅ | — |
| `renewal_date` | → `Customer.renewal_date` | ✅ | — |
| `invite_status` | → `Customer.invite_status` | ✅ | — |
| `invite_sent_date` | → `Customer.invite_sent_date` | ✅ | — |
| `invite_accepted_date` | → `Customer.invite_accepted_date` | ✅ | — |
| `usage_sessions` | → `Customer.usage_sessions` | ✅ | — |
| `usage_activities` | → `Customer.usage_activities` | ✅ | — |
| `active_users` | → `Customer.active_users` | ✅ | — |
| `last_usage_date` | → `Customer.last_usage_date` | ✅ | — |
| `usage_threshold` | → `Customer.usage_threshold` | ✅ | — |
| `usage_threshold_percent` | → `Customer.usage_threshold_percent` | ✅ | — |
| `seats_total` | → `Customer.seats_total` | ✅ | — |
| `seats_assigned` | → `Customer.seats_assigned` | ✅ | — |
| `seat_assignment_percent` | → `Customer.seat_assignment_percent` | ✅ | — |
| `graph_desktop_assigned` | → `Customer.graph_desktop_assigned` | ✅ | — |
| `graph_browser_assigned` | → `Customer.graph_browser_assigned` | ✅ | — |
| `search_assigned` | → `Customer.search_assigned` | ✅ | — |
| `academy_visited` | → `Customer.academy_visited` | ✅ | — |
| `webinar_attended` | → `Customer.webinar_attended` | ✅ | — |
| `last_email_sent_date` | → `Customer.last_email_sent_date` | ✅ | — |
| `last_email_sent_type` | → `Customer.last_email_sent` | ✅ | Rename mapping documented |
| `emails_sent_count` | → `Customer.emails_sent_count` | ✅ | — |
| `notes` | → `Customer.notes` | ✅ | — |
| `next_recommended_action` | → `Customer.next_recommended_action` | ✅ | — |

**Synthetic fields on `Customer` (not on Accounts sheet):** `admin_email`, `user_email`, `role`, `engagement_model`, `days_since_start`, `days_to_renewal`, `automation_status` — filled by rollup, not Phase L columns.

### Contacts sheet → operational contact

| Phase L field | Current source | Status | L-1B change |
|---------------|----------------|--------|-------------|
| `contact_email` | Rollup → `admin_email` / `user_email` / `owner` only (first per role) | ⚠️ | **🔧** persist all rows in `importedContacts[]`; normalize lowercase |
| `contact_role` | Lost except Admin/User slots on `Customer` | ⚠️ | **🔧** store on `ImportedContact` / `DerivedContact` from sheet |
| `contact_name` | Partial via `account_owner` hint | ⚠️ | **🔧** persist per contact |
| `do_not_contact` | Warning only; not stored | ❌ | **🔧** persist on contact record; wire to suppression later |
| `customer_id` | Via parent `Customer` | ✅ | **🔧** explicit on contact row |

### Signals sheet

| Phase L field | Current source | Status | L-1B change |
|---------------|----------------|--------|-------------|
| `contact_email` | Parsed `ImportedSignalRow` | ⚠️ preview only | **🔧** validate as blocker if orphan; keep preview-only persistence |
| `customer_id` | Parsed | ⚠️ | **🔧** promote orphan to blocker |
| `sent_at` | Parsed; invalid → warning | ⚠️ | **🔧** align severity with Phase L |
| `template_or_type` | Parsed | ⚠️ preview | No persistence L-1 |
| `channel` | Parsed | ⚠️ preview | No persistence L-1 |
| `status` | Parsed | ⚠️ preview | No persistence L-1 |

---

## 6. Source-of-truth changes required

| Requirement | Current gap | L-1B approach |
|-------------|-------------|---------------|
| `Contacts.contact_email` = source of truth | Contacts derived from `Customer` emails post-rollup | Add session `importedContacts: ImportedContactRow[]` (or `StoredContact`) set on apply; Contacts tab prefers sheet contacts over derivation |
| Trim + lowercase emails | Partial in validation maps; parser/rollup output may retain case | `normalizeContactEmail()` in parser + rollup + cross-validation |
| Global duplicate `contact_email` = blocker | Only per `(customer_id, email, role)` | New `CONTACT_DUPLICATE_EMAIL` blocker in `validateContactsSheet` |
| Re-upload replaces session | Already `setCustomers(uploaded)` | Extend to `setImportedContacts(...)` + clear prior import snapshot |
| No duplicate contacts on apply | Blocked at validation (after fix) | Rollup must not invent extra emails |
| Signals do not create contacts | Already true | Keep; add tests |
| Signals may repeat same email | Already allowed | Keep; verify no dedupe on Signals |

### Recommended session shape (L-1B.4)

```ts
// lib/types.ts (proposed)
export type ImportedContact = {
  contact_email: string; // normalized
  contact_role: "Admin" | "User" | "CSM";
  contact_name?: string;
  do_not_contact?: "Yes" | "No";
  customer_id: string;
};

// CustomerDataProvider
importedContacts: ImportedContact[];
lastImportSummary?: { accounts, contacts, signals, ... };
```

`deriveAllContacts()` should prefer `importedContacts` when `dataSource === "upload"`, else fall back to legacy derivation for demo data.

---

## 7. One-template UI plan (L-1B.1)

### Remove

- Button **Download Current Upload Template** + helper paragraph
- Button **Download Target Multi-Sheet Template** + helper paragraph
- `downloadCurrentUploadTemplate` import/usage (keep function deprecated or remove if unused)
- `ImportFormatNotice` branches for `option_a` / dual-format messaging
- CSV path in `handleFileSelect`, `handleValidate`, `ValidationResults` Option A branch

### Add / keep

| Element | Target |
|---------|--------|
| Single button | **Download Excel Import Template** |
| Handler | Rename `downloadTargetMultisheetTemplate` → `downloadExcelImportTemplate`; filename `excel-import-template.xlsx` |
| Upload button label | **Upload Excel Workbook** (or keep short **Upload XLSX**) |
| `accept` | `.xlsx` only |
| Helper text | One workbook, three sheets (`Accounts`, `Contacts`, `Signals`); re-upload replaces session data; duplicate `contact_email` blocked |
| Docs link | Point to `docs/context/phase-l-single-excel-import.md` in panel helper |

### Format detection simplification

- Remove `option_a` path from `detectImportFormatFromFile` for UI uploads (or return `invalid` for CSV / single-sheet legacy).
- Single valid format: `Accounts` + `Contacts` + `Signals` sheets present.

---

## 8. Template download / generation plan (L-1B.1)

### Current source

| Aspect | Detail |
|--------|--------|
| Static files in repo | **None** shipped |
| Generation | **Client-side** via `xlsx` package |
| Entry | `lib/import-templates.ts` |
| Workbook builder | `buildTargetMultisheetWorkbook()` |
| Columns | `TARGET_ACCOUNTS_COLUMNS`, `TARGET_CONTACTS_COLUMNS`, `TARGET_SIGNALS_COLUMNS` — **already match Phase L** |
| Sample rows | 2 accounts, 3 contacts, 1 signal |
| Route/API | **None** — browser download only |

### L-1B recommendation

| Decision | Recommendation |
|----------|----------------|
| Keep client-side XLSX | **Yes** — matches existing pattern |
| Rename exports | `downloadExcelImportTemplate()`, `excel-import-template.xlsx` |
| Sheets | Keep `Accounts`, `Contacts`, `Signals` |
| Headers | No change — already aligned with Phase L |
| Sample rows | **Keep samples** (current pattern aids demo) |
| Remove CSV template | Remove `downloadCurrentUploadTemplate` from UI; optionally keep `lib/csv-template.ts` for tests only |

---

## 9. Verification script plan (L-1B.5 / L-1F)

### New script: `scripts/verify-single-excel-import.ts`

Combine **static string checks** (UI source) + **library behavioral tests** (no browser).

#### A. Static UI checks (read `data-upload-panel.tsx` as text)

| Assert | Method |
|--------|--------|
| Only one template download button label | grep for `Download Excel Import Template`; absent: `Download Current Upload Template`, `Download Target Multi-Sheet Template` |
| CSV template button removed | string not in file |
| Excel template handler present | `downloadExcelImportTemplate` or equivalent |
| Upload accept | `.xlsx` only (no `.csv`) |

#### B. Validation library tests

| Assert | Method |
|--------|--------|
| Duplicate `contact_email` (same email, two rows) → blocker | `validateNormalizedMultisheetImport` fixture |
| Case-insensitive duplicate (`A@x.com` / `a@x.com`) → blocker | fixture after normalize |
| `normalizeContactEmail` applied in parser output | unit test on `parseTargetMultisheetWorkbook` |
| Signal unknown `contact_email` → **blocker** (after L-1B) | fixture |
| Signals do not increase contact count | parse + validate signal-only rows |
| Valid template workbook passes | `buildTargetMultisheetWorkbook()` |

#### C. Apply semantics (provider or pure function)

| Assert | Method |
|--------|--------|
| Apply replaces customers (not concat) | test helper simulating `setCustomers` |
| No SendGrid import in upload libs | grep `sendgrid`, `@sendgrid` in `lib/import*` and `data-upload-panel` |
| No new customer send routes | grep `send-customer` in changed files |

#### D. Audit safety (if wired in L-1B)

| Assert | Method |
|--------|--------|
| Actions registered | `data.excel_import.validate`, `data.excel_import.apply` in `ui-audit-events.ts` |
| Metadata keys | only count fields; no `contact_email` arrays in audit metadata |
| Permission | `upload_customer_data` |

#### E. Update existing scripts

| Script | Update |
|--------|--------|
| `verify-import-multisheet-cross-validation.ts` | Add global duplicate email case; update signal orphan to blocker when implemented |
| `verify-import-multisheet-cross-validation-wired.ts` | Ensure wired path still blocks apply |
| `verify-ui-audit-ingestion.ts` | Add excel_import actions if renamed |

---

## 10. Risks and blockers

| Risk | Impact | Mitigation (L-1B) |
|------|--------|-------------------|
| `Customer` model only stores 2 emails | Cannot persist all contacts without new state | `importedContacts` session array + Contacts tab reads it |
| Extra contacts dropped at rollup | Silent data loss vs Phase L | Keep preview `extra_contacts_not_persisted`; reduce to zero when all contacts stored |
| Contacts tab uses `deriveAllContacts` | Shows max ~3 emails per account | L-1B.4 switch to imported contacts |
| Signals preview without persistence | OK for L-1 | Document in preview; no Communication Log writes |
| Apply resets `workflowStatuses` | In-flight Action Queue approvals lost on re-upload | **Known behavior** — document in helper text; do not reset `sendLogs` |
| Apply does **not** reset `sendLogs` | Old logs may reference prior customer names | **Known limitation** — acceptable for session MVP |
| Demo restore resets everything | Unaffected | — |
| Sequences enrolled by email | Orphan enrollments if contact removed on re-upload | **Known limitation** — warn in L-1B docs |
| `CONTACT_INVALID_ROLE` is blocker today; Phase L says warning | Stricter than spec | **L-1B decision:** downgrade to warning per Phase L §4.2 |
| Missing multi-sheet column validation | Bad workbooks may pass | **L-1B.2** add required header checks per sheet |
| `Signals` sheet optional today; Phase L requires sheet | Format detection gap | **L-1B.2** require `Signals` sheet (empty rows OK) |
| Existing verify scripts assume `CONTACT_DUPLICATE_KEY` | Tests need update when adding global email blocker | Update in L-1B.5 |
| README / EXCEL-IMPORT-TEMPLATE still describe two templates | Doc drift | L-1B.6 doc pass |

### Tests / scripts needing updates

- `scripts/verify-import-multisheet-cross-validation.ts` — duplicate email scenarios
- `scripts/verify-import-multisheet-cross-validation-wired.ts`
- `scripts/verify-ui-audit-ingestion.ts` — if audit action names change
- Optional: deprecate `verify-import-customer-rollup.ts` extras warnings once all contacts stored

---

## 11. L-1B implementation plan (phased)

### L-1B.1 — UI / template cleanup

| File | Changes |
|------|---------|
| `components/customers/data-upload-panel.tsx` | Single template button; XLSX-only upload; remove Option A branches; update copy; rename audit actions |
| `lib/import-templates.ts` | `downloadExcelImportTemplate()`, rename filename; deprecate/remove CSV download export |
| `lib/import-format-detection.ts` | Single format: require Accounts + Contacts + Signals; reject CSV |
| `README.md` | Single-template import section |
| `docs/EXCEL-IMPORT-TEMPLATE.md` | Mark Option A legacy; point to Phase L |
| `docs/context/product.md` | L-1B status when done |

### L-1B.2 — Parser / validation hardening

| File | Changes |
|------|---------|
| `lib/import-multisheet-parser.ts` | Require Signals sheet; `normalizeContactEmail()` on contacts; optional header validation helper |
| `lib/import-multisheet-cross-validation.ts` | Global `CONTACT_DUPLICATE_EMAIL` blocker; signal orphans → blockers; account-with-no-contacts warning; downgrade invalid role to warning; missing column blockers |
| `lib/import-multisheet-validation.ts` | Extend `importSummary` with Phase L preview counts (`duplicate_contact_email_count`, `orphan_signal_count`, etc.) |
| `lib/import-contacts-quality-summary.ts` | Add `duplicateContactEmails` count; align naming with Phase L |
| `lib/upload-validation.ts` | Remove or isolate Option A from upload path (keep for tests if needed) |

### L-1B.3 — Apply / replace semantics ✅

| File | Changes |
|------|---------|
| `lib/types.ts` | `ImportedContact` type |
| `lib/imported-contacts.ts` | Map Contacts sheet rows → `ImportedContact[]` |
| `components/providers/customer-data-provider.tsx` | `importedContacts` state; `applyUploadedCustomers({ customers, importedContacts })`; replace not append |
| `components/customers/data-upload-panel.tsx` | Pass contacts from validation result on apply; `data.excel_import.*` audit for option_c |
| `lib/import-multisheet-validation.ts` | Return `importedContacts` on successful `ValidationResult` |
| `lib/session-export.ts` | Safe imported contact CSV export |
| `lib/audit/ui-audit-events.ts` | `data.excel_import.validate` / `apply` allowlist (legacy `data.upload.*` retained for option_a) |

**Note:** Customer rollup still uses first Admin/User per account. Full Contacts sheet is preserved in `importedContacts` for L-1B.4.

### L-1B.4 — Contacts source-of-truth UI ✅

| File | Changes |
|------|---------|
| `lib/customer-contacts.ts` | `buildContactsForDisplay()` — prefer `importedContacts` when `dataSource === "upload"` |
| `components/customers/contacts-table.tsx` | Contacts / Emails tab uses imported contacts; shows `contact_name`, `do_not_contact`, Excel Import label |
| `lib/session-export.ts` | Contacts export uses `exportImportedContactsCsv` in upload mode |
| `lib/reports-snapshot.ts` | Reports contact counts use `importedContacts` when upload active |
| `lib/dashboard-contact-metrics.ts` | Dashboard contact metrics use `buildContactsForDisplay` |
| `components/reports/reports-page-content.tsx` | Passes `importedContacts` + `dataSource` to snapshot |
| `components/customers/contacts-import-quality-preview.tsx` | Updated copy — contacts preserved in session/UI |

### L-1B.5 — Audit + export + verification polish ✅

| File | Changes |
|------|---------|
| `lib/audit/excel-import-audit.ts` | **New** — `buildExcelImportAuditMetadata()` with counts-only keys |
| `components/customers/data-upload-panel.tsx` | Uses shared audit metadata helper |
| `components/customers/multisheet-import-preview.tsx` | Stale L-1B.4 / not-persisted copy removed |
| `lib/reports-snapshot.ts` | Data gap copy updated for importedContacts |
| `components/reports/import-quality-report-section.tsx` | “Not in account rollup” label |
| `scripts/verify-single-excel-import.ts` | Full L-1B.1–L-1B.5 regression checks |

**Next:** Phase **I** (durable server-side persistence) · **K-2** (SendGrid webhook).

### L-1B.6 — Docs + runtime smoke (merged into L-1B.5)

| File | Changes |
|------|---------|
| `docs/context/phase-l-single-excel-import.md` | Mark L-1B complete |
| `docs/context/phase-l-1a-model-audit.md` | Link implementation status |
| Manual smoke | Upload template → validate → apply → Contacts tab → Refresh Action Queue (no send) |

---

## 12. Open decisions (resolved for L-1B)

| Topic | L-1A decision |
|-------|---------------|
| Legacy CSV upload | **Remove from UI**; no backward-compat in Customer Data panel |
| Signals sheet empty | **Sheet required**; zero data rows allowed |
| Extra contacts | **Persist all** via `importedContacts`; rollup still fills `Customer` admin/user for triggers |
| Signals → Communication Logs | **Out of scope** L-1B |
| `days_since_start` / `days_to_renewal` | **Keep computed** in rollup |
| Audit action rename | **Add** `data.excel_import.*`; optionally keep `data.upload.*` as aliases one release |
| Invalid `contact_role` | **Downgrade to warning** per Phase L |

---

## Related documentation

- [Phase L Single Excel Import design](phase-l-single-excel-import.md)
- [Excel import template spec](../EXCEL-IMPORT-TEMPLATE.md)
- [Product context](product.md) §20 Phase L
