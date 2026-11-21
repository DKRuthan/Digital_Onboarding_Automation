# Digital Customer Journey Control Center

A Next.js dashboard for customer journey control — mock data, CSV upload, approval workflow, and internal SendGrid alerts.

## Documentation

Production Error Audit plan is documented in [docs/context/product.md](docs/context/product.md) under **Phase F**.

- **[Product context](docs/context/product.md)** — purpose, core logic, **contact-first architecture**, account vs contact model, UI map, safety principles, and roadmap for the Digital Customer Journey Control Center
- **[Email Sequences design](docs/EMAIL-SEQUENCES.md)** — contact-level sequences, enrollment, Action Queue, and manual progression
- **[Excel import template spec](docs/EXCEL-IMPORT-TEMPLATE.md)** — current account-first upload (39 columns) and target multi-sheet **Accounts + Contacts** workbook
- **[Demo script](docs/DEMO-SCRIPT.md)** — full internal walkthrough (contact-first narrative)
- **[Demo cheat sheet](docs/DEMO-CHEAT-SHEET.md)** — one-page live demo reference
- **[Phase J auth architecture](docs/context/phase-j-auth-architecture.md)** — approved session auth, RBAC, audit logging (pre-implementation design)
- **[Phase K Communication Ledger](docs/context/phase-k-communication-ledger.md)** — simulated Communication Logs from approved Action Queue items (**K-1B** ✅; **K-1F** stable verification ✅; no email sent; duplicate prevention); SendGrid webhook tracking is **K-2** (future)
- **[Phase L — Single Excel Import System](docs/context/phase-l-single-excel-import.md)** — one Excel workbook; **`contact_email` is the source of truth** (**L-1** ✅ · **L-1F** stable verification ✅)
- **[Phase L-2 — Row 2 header import](docs/context/phase-l-2-row2-header-import.md)** — **L-2F** ✅ stable Row 2 import (`npx tsx scripts/verify-l-2f-stable.ts`)
- **[Phase L-4 — Flat single-sheet import](docs/context/phase-l-4-flat-single-sheet-import.md)** — **L-4F** ✅ stable flat public import (`npx tsx scripts/verify-l-4f-stable.ts`)
- **[Phase I — Persistence](docs/context/phase-i-1-persistence-schema-design.md)** — **I-1** ✅ schema · **I-2** ✅ SQL draft · **I-3** ✅ [repository design](docs/context/phase-i-3-import-repository-design.md) · **I-4A** ✅ foundation · **I-4B** ✅ atomic transaction + live verify script

### Contact-first architecture

The app is moving toward **contact/email-first operations**. Accounts provide context (`customer_id`, plan, usage, renewal); **`contact_email` is the primary unit** for journeys, sequence enrollment, cooling, Communication Logs, Action Queue review, and send eligibility. See [product context §4](docs/context/product.md#4-account-vs-contact-model) for the full model. MVP UI still shows some account-first surfaces; Phase **C** in the roadmap aligns implementation with this principle.

### MVP helper modules

- **`lib/customer-tags.ts`** — computed account, contact, and journey tags
- **`lib/customer-data-quality.ts`** — per-customer and cross-account data quality checks
- **`lib/customer-contacts.ts`** — derive contact/email records from flat Customer rows (Phase C-2 foundation; not wired to UI yet)

Customer Data shows computed tag chips, data quality badges, a **Data Quality Review** panel, filters, CSV export, and an **Accounts** tab plus a **Contacts / Emails** tab (derived from flat customer rows via `lib/customer-contacts.ts`; display-only).

**Import:** Customer Data → **Download Excel Import Template** → upload **`.xlsx`**. The public template is a flat **`Journey Import`** workbook (**Row 1** labels, **Row 2** system keys, **Row 3+** data — one row = account + contact). L-2 multi-sheet and L-1 legacy workbooks still parse as fallback. Validate → preview → apply replaces session customers and `importedContacts`. No emails or Communication Logs created on import. Stable checkpoint: `npx tsx scripts/verify-l-4f-stable.ts`. **I-4B** atomic apply via `sql.transaction()` in `lib/import-persistence/import-persistence-transaction.ts` — disabled by default (`IMPORT_PERSISTENCE_ENABLED=false`); not wired to UI. Live verify: `npx tsx scripts/verify-i-4b-import-persistence-live.ts` (SKIPPED without env). SQL manual apply only. Next: **I-5** API wiring after live verification passes.

## Getting Started

```bash
npm install
cp .env.example .env.local
# Edit .env.local with your values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `SENDGRID_API_KEY` | Internal sends | SendGrid API key (server-only, never exposed to client) |
| `SENDGRID_FROM_EMAIL` | Internal + test sends | Verified sender address |
| `SENDGRID_TEST_TO_EMAIL` | Test preview sends | Inbox for **Send Test** in email preview modal |
| `SENDGRID_DAM_ALERT_EMAIL` | Internal sends | Inbox for name-based CSM/owner alerts (e.g. `dam-team@team.example.com`) |
| `SENDGRID_INTERNAL_EMAIL_DOMAIN` | Internal sends | Approved internal domain, must start with `@` (e.g. `@team.example.com`) |
| `SENDGRID_INTERNAL_SEND_MODE` | Internal sends | `dry_run` (default) or `live` |
| `INTERNAL_SEND_API_ENABLED` | Internal send API gate | `false` (default) — set `true` to allow `POST /api/send-approved-internal` |
| `SENDGRID_TEST_SEND_ENABLED` | Test send API gate | `false` (default) — set `true` to allow `POST /api/send-test-email` |
| `AUTH_ENABLED` | Operator auth (Phase J) | `false` (default) — set `true` with Clerk keys to enable sign-in |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk auth | Client publishable key (when auth enabled) |
| `CLERK_SECRET_KEY` | Clerk auth | Server secret key (when auth enabled) |
| `AUDIT_ENABLED` | Audit logging (Phase J-6) | `false` (default) — no-op until Neon DB configured |
| `DATABASE_URL` | Audit logging | Neon/Vercel Postgres connection string (required when audit enabled) |
| `DEFAULT_WORKSPACE_ID` | Audit logging | Single-workspace MVP scope per deployment (e.g. `ws_demo_001`) |
| `AUDIT_HASH_SALT` | Audit logging | Optional salt for IP/identifier hashes in audit metadata |

Do not enable send API gates on public deployments without deployment protection and operator auth (Phase J). Auth architecture: [docs/context/phase-j-auth-architecture.md](docs/context/phase-j-auth-architecture.md).

### Send modes (internal alerts)

- **`dry_run`** (default): Validates routing and composes alerts but does **not** call SendGrid. Actions are marked **Dry Run Complete** and logged with mode **Dry Run**.
- **`live`**: Sends real emails to resolved internal recipients only. Actions are marked **Live Internal Alert Sent** and logged with mode **Live**.

Customer `admin_email` and `user_email` are **always rejected** for internal sends.

### Send types (what each label means)

| Type | What it is | Real email? |
|------|------------|-------------|
| **Demo logs** | Fake historical sample data on first load | No — seed data only |
| **Test send** | **Send Test** in the email preview modal (`POST /api/send-test-email`) | Yes — to `SENDGRID_TEST_TO_EMAIL` only, not the customer |
| **Dry run** | **Send via SendGrid** when `SENDGRID_INTERNAL_SEND_MODE=dry_run` | No — validates routing only |
| **Live internal send** | **Send via SendGrid** when mode is `live` | Yes — to DAM/internal recipient only |
| **Customer email send** | Welcome, getting-started, invite reminders to admin/user | **Not implemented yet** |

The sidebar shows live config from `/api/internal-send-config`: SendGrid configured/missing, internal send mode, API gate status, and that customer sends are disabled. Internal routing emails are not exposed to the browser.

**API security (Phase F-2B):** Send routes are env-gated (disabled by default). Public config no longer exposes internal routing emails. Full design: [docs/context/phase-f2b-api-security.md](docs/context/phase-f2b-api-security.md).

**Operator auth (Phase J):** Clerk foundation installed; `AUTH_ENABLED=false` by default so local demo works without sign-in. Dashboard pages require sign-in when auth is enabled (J-3). API routes require session + permissions when auth is enabled (J-4/J-5B). UI action buttons are permission-gated when auth is enabled (J-5C); RBAC verified in J-5D. Role from Clerk `publicMetadata.role`, missing role → Viewer. **Audit (J-6B–J-6F):** Neon schema (manual apply), write helpers, API + UI ingestion, `GET /api/audit-logs` read/export, Reports **Audit Logs** section (`view_audit_logs`), stable verification pass complete. Default `AUDIT_ENABLED=false` — safe not-configured state, no crash; DB-backed audit verification runs only when `DATABASE_URL`, applied schema, and `AUDIT_ENABLED=true` are configured. **Next:** J-7 production auth + Neon. Design: [docs/context/phase-j-auth-architecture.md](docs/context/phase-j-auth-architecture.md).

## Editable activity triggers (local browser storage)

Activity triggers are editable from **Activity Triggers** in the sidebar.

- **Add Trigger** — create a custom trigger (saved **inactive** by default; enable when ready).
- **Edit** — change name, conditions, thresholds, channel, recipient type, template, priority, cooldown, and approval requirement.
- **Duplicate** — copy a trigger as `[Name] - Variation` (or `Variation 2`, etc.). Duplicates start **inactive**.
- **Enable / Disable** — inactive triggers do not create Action Queue items.
- **Test Trigger** — preview which customers match and what action would be created. **Does not send email.**
- **Reset to default rules** — restore the built-in 7 triggers and clear locally saved trigger changes.

Custom triggers can be added with **Add Trigger**. New triggers are saved **inactive by default** because the Action Queue is derived from **active** triggers — enable a trigger when you are ready for matching rows to appear. Duplicate trigger names show a warning only; create saves use a unique id guard to avoid overwriting existing rules.

Each trigger card shows how many customers it **currently matches** (or would match if enabled).

### Grouped AND/OR logic

Rules use **condition groups** so AND and OR apply in the right places:

- **Match groups using** — ALL groups (AND) or ANY group (OR)
- **Within each group** — ALL conditions (AND) or ANY condition (OR)

Example:

```
(Usage Sessions equals 0 AND Days Since Start >= 7)
OR
(Invite Status equals Pending AND Days Since Start >= 14)
```

Set this in **Activity Triggers → Edit** by adding groups, conditions, and choosing AND/OR at each level.

Each trigger also shows a **plain-English summary** on the card, in the edit modal, and in Test Trigger. Summaries are for readability only — they describe the same logic as the grouped conditions and do not change how triggers are evaluated.

Legacy flat rules in localStorage are migrated automatically into one default group on load. Rules saved before timing was added migrate to **immediate** timing (actions appear due now when the rule matches).

### Rule timing (schedule recommendations only)

Each rule can define **when** a matching action should appear as due in the Action Queue. Timing controls visibility and schedule status only — it does **not** send emails automatically.

| Timing type | What it does |
|-------------|--------------|
| **Immediate** | Action is due now when the rule matches |
| **After delay** | Action is scheduled N calendar or business days after an anchor date (onboarding start, invite sent, renewal date, etc.) |
| **Weekly** | Recurring recommendation on a weekday at a set time (default timezone Europe/Berlin) |
| **Monthly** | Recurring recommendation on a day of month or first weekday of month |

**Examples (built into default rules):**

- **Invite Not Accepted** — 7 days after invite sent (or onboarding start)
- **No Usage** — 7 days after onboarding start
- **Low Usage** — every Wednesday at 10:00 Europe/Berlin
- **Seats Underassigned** — 3 days after onboarding start
- **No Academy Visit** — 5 days after onboarding start
- **No Webinar Attended** — every Wednesday at 10:00 Europe/Berlin
- **Renewal Risk** — immediate when conditions match

**Action Queue schedule status:**

| Status | Meaning |
|--------|---------|
| **Due now** | Scheduled time is now or in the past — action can be reviewed and (if approved) sent via internal SendGrid |
| **Scheduled** | Recurring rule — next occurrence is in the future |
| **Not due yet** | One-time delay — scheduled date is still in the future |

Use **Schedule** filters on Action Queue: **Due now**, **Scheduled**, or **All**. **Send via SendGrid** stays disabled for rows scheduled for later (tooltip: *Action is scheduled for later.*).

**Refresh Action Queue**, **Test Trigger**, and scheduled queue items never trigger customer sends. Customer-facing live sends remain **disabled**.

Trigger changes are saved in **localStorage** in this browser for demo use. Workflow progress and communication logs remain session-only.

**Refresh Action Queue** on Customer Data rebuilds/evaluates the Action Queue from active triggers and current customers. Activity Trigger rows include `contact_email` metadata when admin/user/CSM owner emails are safely resolvable. It does **not** call SendGrid or send customer emails.

Editing triggers, testing triggers, and refreshing the action queue are safe — they only affect the in-memory queue and labels. Customer-facing email sends remain **disabled**.

## Email Templates (local browser storage)

The **Email Templates** sidebar page manages email templates used by Activity Triggers and Email Sequences.

### Purpose

- Create, edit, duplicate, approve, and archive templates
- Preview subject/body with demo customer data
- Send tests to the configured test inbox only
- Select approved templates from Activity Trigger edit modal

Templates are saved in **localStorage** in this browser for demo use.

**Email Templates is the source of truth** for template subject/body in the Email Preview modal, internal send confirmation modal, and internal SendGrid payload (after the internal alert envelope is applied). Internal send requires an **approved** `internal_alert` template — archived or draft templates block confirm.

### Template statuses

| Status | Meaning |
|--------|---------|
| **Draft** | Work in progress — not selectable in triggers or sequences |
| **Approved** | Ready for use in Activity Triggers and Email Sequences |
| **Archived** | Retired — not selectable in triggers or sequences |

### Template key rule

Each template has a unique **key** (slug) such as `invite-reminder`. Keys must be unique. Display names can change, but keys identify templates in activity triggers, sequences, and communication logs.

### Sender selection

Senders are chosen from a controlled list (no arbitrary sender emails in MVP):

- Demo Onboarding Team
- Customer Success
- Digital Onboarding
- CSM Owner (dynamic — uses account owner email at send time, not a fixed address)

### Variables

Use these placeholders in subject and body:

`{{customer_name}}`, `{{admin_name}}`, `{{owner_name}}`, `{{seats_total}}`, `{{seats_assigned}}`, `{{usage_sessions}}`, `{{days_since_start}}`, `{{days_to_renewal}}`, `{{academy_link}}`, `{{webinar_link}}`

Unknown variables show a warning in the edit modal. Preview highlights unresolved variables.

### Test send behavior

**Send Test** from Email Templates or Action Queue preview sends only to `SENDGRID_TEST_TO_EMAIL`. It does **not** send to customer, admin, or user emails. Test sends are logged with mode **test**.

Creating or editing templates does **not** send email. Customer-facing live sends remain **disabled**. Internal SendGrid alert safety rules are unchanged.

### Default templates

Seven default templates match the built-in activity trigger keys: `invite-reminder`, `getting-started`, `usage-tips`, `seat-assignment`, `academy-invite`, `webinar-invite`, `renewal-risk`.

Use **Reset to default templates** to restore them.

### Version notes

When editing a template, you can add an optional **Change note** (e.g. “Updated subject for clarity”). On save, the template **version** increments and the note is stored as `latest_change_note`. Template cards show version, last updated, and the latest note.

Version notes are **local/demo-only** — stored in this browser’s localStorage with the template. They are included in Email Templates JSON export. They do not trigger sends or affect SendGrid behavior.

## Email Sequences (contact/email-level)

> Full design: [docs/EMAIL-SEQUENCES.md](docs/EMAIL-SEQUENCES.md)

**Sequences are contact/email-level. Accounts provide context, but enrollments and cooldowns are tied to email addresses.**

### Sequence Library (Phase 1–4)

The **Email Sequences** page (`/sequences`) lets you manage sequence definitions stored in **localStorage** (`onboarding-control-email-sequences`).

- Create, edit, duplicate, approve, archive, and preview sequences
- **Phase 2:** Contact-level preview — pick demo customer, contact role, preview start date, step timeline with conflict checks
- **Phase 3:** Manual contact enrollment registry — enroll approved sequences per contact email (`onboarding-control-sequence-enrollments` localStorage)
- **Phase 4:** Active enrollments generate **Action Queue** rows for the current step (review-only; no auto-send)
- **Phase 5:** Manual step progression — mark complete, skip, or complete enrollment; updates current step and queue rows
- Enrollments tab — pause, resume, cancel, exit, preview, export JSON
- Export JSON · Reset to Defaults (4 built-in demo sequences)
- **Not wired** to Activity Triggers or customer-facing SendGrid sends

Enrollment identity: **`contact_email::sequence_key`**, not `account_id` alone.

Active enrollments appear in Action Queue with contact email first, then customer/account context, sequence step, schedule, and conflict status. Customer-facing sequence emails remain **disabled**. Internal alerts follow existing manual SendGrid rules (approved, due_now, conflict-clear).

Sequence step progression is **manual only** — no auto-advance after send or schedule. Customer-facing sequence emails remain **disabled**.

## Exporting session data

Export buttons download current browser session data only. **Exports do not send email.**

| Export | Row grain | Filename | Contact-first? |
|--------|-----------|----------|----------------|
| **Accounts CSV** | One row per account | `customer-data-export-YYYY-MM-DD.csv` | No — account context |
| **Contacts CSV** | One row per contact email | `contact-data-export-YYYY-MM-DD.csv` | Yes |
| **Action Queue CSV** | One row per queue item | `action-queue-export-YYYY-MM-DD.csv` | Yes |
| **Communication Logs CSV** | One row per log | `communication-logs-export-YYYY-MM-DD.csv` | Yes |
| **Reports CSV** | Long-form metrics from reports snapshot | `reports-export-YYYY-MM-DD.csv` | Yes (read-only snapshot) |

| Export | Page | Button label |
|--------|------|--------------|
| **Accounts CSV** | Customer Data → Accounts | Export Filtered Accounts CSV / Export All Accounts CSV |
| **Contacts CSV** | Customer Data → Contacts / Emails | Export Filtered Contacts CSV / Export All Contacts CSV |
| **Action Queue CSV** | Action Queue | Export Action Queue CSV |
| **Communication Logs CSV** | Communication Logs | Export Communication Logs CSV |
| **Reports CSV** | Reports | Export Reports CSV |
| **Activity Triggers JSON** | Activity Triggers | Export Activity Triggers JSON |
| **Email Templates JSON** | Email Templates | Export JSON |
| **Email Sequences JSON** | Email Sequences | Export JSON |
| **Sequence Enrollments JSON** | Email Sequences → Enrollments | Export Enrollments JSON |

Action Queue exports include all current queue rows (not just selected rows) with `scheduled_for`, `schedule_status`, and `timing_label`. Rules export includes every editable rule field (including timing) plus an export timestamp.

## Demo Walkthrough

### 1. Explore the dashboard

- **Dashboard** — contact-first metrics with account context secondary; recent contact actions and logs
- **Reports** — read-only reporting at `/reports`: all core sections + Export Reports CSV snapshot download
- **Customer Data** — table, filters, row click for detail drawer
- **Activity Triggers** — edit, duplicate, enable/disable, and test IF/THEN triggers
- **Action Queue** — review workbench: contact/email-first table; approve and send internal alerts
- **Communication Logs** — contact/email-first delivery and workflow history

### 2. Upload customer data (optional)

1. Go to **Customer Data**
2. In **Import Template**, click **Download Excel Import Template**
3. **Upload Excel Workbook** → **Validate Data** → **Apply Uploaded Data**

Or click **Use Demo Data** to restore the built-in 13 customers and reset local demo configuration (triggers, templates, sequences, enrollments, and session logs) for a clean walkthrough.

### 3. Review and approve actions

1. Go to **Action Queue**
2. Filter **Issue: Renewal Risk** (internal-eligible — routes to CSM owner, not customer email)
3. Select a row → **Preview Selected**
4. Complete the approval checklist → **Approve**
5. Or select rows → **Approve Selected**

Blocked items (duplicate send within 7 days) require **Reset Status** before re-approval.

### 4. Send internal alert (dry run)

1. Ensure `.env.local` has all SendGrid vars and `SENDGRID_INTERNAL_SEND_MODE=dry_run`
2. Select **Approved** Renewal Risk row(s)
3. Click **Send via SendGrid**
4. Review the confirmation modal:
   - Resolved **deliver-to** email
   - **Routing reason** (e.g. CSM owner → DAM inbox)
   - Full **subject and body preview**
5. Click **Confirm Dry Run**
6. Check **Communication Logs** — workflow status **Dry Run Complete**, mode **Dry Run**, note *Dry run completed. No email was sent.*

### 5. Live internal send (optional)

1. Set `SENDGRID_INTERNAL_SEND_MODE=live` in `.env.local`
2. Restart `npm run dev`
3. Repeat approve + send flow
4. Communication Logs will show status **Live Internal Alert Sent**, mode **Live**

### 6. Test email preview (separate from internal send)

1. Action Queue → select one row → **Preview Selected**
2. Click **Send Test** — sends to `SENDGRID_TEST_TO_EMAIL` only (never the customer). Communication Logs show mode **Test** with note *Test email sent to SENDGRID_TEST_TO_EMAIL, not to the customer.*

## Safety

| Rule | Enforced |
|------|----------|
| Customer admin/user emails | Rejected |
| Unapproved actions | Cannot send |
| Blocked / skipped actions | Cannot send |
| Duplicate (< 7 days) | Blocked until reset |
| Scheduled for later | Cannot send via SendGrid until due |
| Customer-facing route | Not implemented |

## Scripts

```bash
npm run dev      # Development server
npm run build    # Production build
npm run start    # Start production server
npm run lint     # ESLint
```

## Tech Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- SendGrid (`@sendgrid/mail`)
- xlsx (CSV/Excel upload)
