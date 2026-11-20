# Digital Customer Journey Control Center — Product Context

> Central reference for product purpose, logic, and roadmap. Use this document when making development, UX, or architecture decisions so new work stays aligned with the product vision.

---

## 1. Product Purpose

This application is **not** just an email automation tool. It is a **Digital Customer Journey Control Center** — a control plane that uses customer data from Excel/CSV to identify activity, inactivity, risk, lifecycle stage, and communication opportunities, then routes those signals through human review before anything is sent.

The product connects operational customer data to planned journeys, timing, cooling rules, and a review workbench so teams can orchestrate onboarding, activation, education, and renewal communications with safety and visibility.

### Contact-first principle

**Account tells us where the person belongs. Email tells us who the journey is for.**

| Identity | Role |
|----------|------|
| **Primary operational identity** | `contact_email` — journeys, cooling, logs, send eligibility, sequence enrollment |
| **Context identity** | `customer_id` / `customer_name` — plan, stage, usage, seats, renewal, owner/DAM |

Communication, sequence enrollment, cooling, logs, and send eligibility are **email/contact-level first**. Account/customer fields provide context only.

The MVP still presents some surfaces account-first (Customer Data table, trigger test counts, Dashboard metrics). Email Sequences and the conflict engine are largely contact-first already. Phase **C** migrates the rest of the UI and queue/log models to match this principle.

### Core flow

```
Customer Data
  → Derived Contacts / Email Addresses
  → Activity Triggers
  → Email Templates
  → Email Sequences
  → Timing Rules
  → Cooling / Conflict Rules
  → Action Queue
  → Human Review
  → Communication Logs
  → Reports
```

Each stage has a distinct role: data informs signals and resolves contacts, triggers and sequences define *what* might happen **for a contact email**, timing and cooling define *when* and *whether* it may happen for that email, the Action Queue gives humans the final say per contact action, and logs/reports prove outcomes at contact level (with account rollups secondary).

---

## 2. Core Product Logic

| Layer | Role |
|-------|------|
| **Customer Data** | Account context + derived contact emails |
| **Derived contacts** | Primary operational records for journeys and comms |
| **Activity Triggers** | Evaluate account signals; output actions per `contact_email` |
| **Email Sequences** | Define planned journeys per contact |
| **Timing Rules** | Decide when a contact action becomes due |
| **Cooling Rules** | Prevent over-communication to a contact email |
| **Action Queue** | Review workbench for contact-level actions |
| **Logs** | Prove what happened to each contact email |
| **Reports** | Contact metrics first; account rollups secondary |

Nothing in this chain should bypass human review for outbound communication in the MVP. Automatic sending is out of scope until governance, persistence, and compliance are in place.

---

## 3. Trigger vs Sequence

### Activity Trigger

A **rule that reacts to customer behavior or inactivity** based on uploaded or integrated customer data.

**Examples:**

- Customer registered today
- Invite not accepted after 3 days
- No usage after 7 days
- Seats not assigned
- High usage detected
- Academy not visited
- Webinar not attended
- Renewal risk detected

A trigger can:

- Create a one-off email action
- Enroll a contact into a sequence *(planned — not wired in MVP)*
- Notify the Digital Account Manager (DAM)
- Create an internal alert
- Pause or exit a sequence *(planned)*
- Tag or report the customer *(planned)*

### Email Sequence

A **planned multi-step journey for a contact/email address**, using approved templates and defined delays between steps.

**Example:**

| Day | Step |
|-----|------|
| 0 | Welcome email |
| 2 | Getting started guide |
| 5 | Usage tips |
| 10 | Webinar invite |
| 14 | Internal DAM alert if no activity |

**Trigger = why something starts.**  
**Sequence = what journey happens after that.**

In the current MVP, sequences are manually enrolled and progressed. Automation-driven enrollment from triggers is a future phase.

### Activity Triggers — contact-first outputs

Triggers **may evaluate account-level conditions** (usage, seats, invite status on the customer row). **Outputs must resolve to `contact_email`.**

| Rule | Behavior |
|------|----------|
| Condition | Account/customer fields (and future contact-level fields) |
| Resolution | Map `recipientType` → admin, user, or CSM contact via `resolveSequenceContacts()` |
| Output | **One reviewable Action Queue item per resolved contact** |
| No contact | Blocked row with reason: *No eligible contact email found* |

**Example — Invite Not Accepted:**

1. Condition evaluated from account/contact fields (e.g. invite pending, days since start).
2. Target resolved to admin `contact_email`.
3. Output = Action Queue item for that email (template, schedule, conflict checks at contact level).

Internal-alert triggers (e.g. Renewal Risk) still create reviewable rows; recipient is internal/DAM routing, not a customer inbox in MVP.

### Custom Activity Triggers / Add Trigger

Users can **create custom Activity Triggers** from the Activity Triggers page (Phase **E-1C** ✅). The approved design reuses existing infrastructure — no new send paths.

#### Approved design

| Principle | Rule |
|-----------|------|
| UI reuse | **Add Trigger** button opens the existing `RuleEditModal` in **create mode** (same fields as Edit). |
| Default state | New triggers are saved **`active: false` (inactive)**. The user must **manually enable** a trigger before it can generate Action Queue rows. |
| Queue derivation | The Action Queue is **reactively derived** from **active** Activity Triggers and current customer data (`buildActionQueue` / `buildEnrichedActionQueue`). When rules or customers change, the queue recomputes automatically. |
| Refresh button | **Refresh Action Queue** (Customer Data) is **not a safety gate** — it recounts and shows status in a toast. It does **not** gate whether queue rows exist. |
| Primary safety control | Because the queue is reactive, **inactive-by-default** is the main guard for new custom triggers. |
| SendGrid | Creating, editing, or testing a trigger must **not** call SendGrid. |
| Test Trigger | Preview-only — shows matching customers and would-be actions. **Does not send email.** |
| Auto-send | Creating, editing, and testing triggers must **not** automatically send anything. |
| Customer sends | Remain **disabled** by design. |
| Internal SendGrid | Unchanged — still requires manual Action Queue approval + confirm modal. |

#### Safe defaults for new triggers

These defaults apply when Add Trigger is wired (via `createEmptyRule()` in `lib/automation-rule-definitions.ts`):

| Field | Default |
|-------|---------|
| `name` | `New Trigger` |
| `active` | **`false`** |
| `priority` | `5` |
| `recipientType` | `Admin` |
| `cooldownDays` | `7` |
| `requiresApproval` | `true` |
| `group_logic` | `AND` |
| Condition starter | One group (AND): `invite_status` **equals** `Pending` |
| `channel` | `email` |
| `template` | Empty until user selects an approved template |
| `recommendedAction` | Empty until user fills in |
| `description` | Empty |
| `timing` | `immediate` |

**Implementation note:** `createEmptyRule()` sets `active: false` and name `New Trigger`. Duplicates also start inactive; new triggers follow the same pattern.

#### Validation rules (save)

Existing `validateAutomationRule()` checks (modal save path):

- Trigger **name** required (non-empty trim)
- **Recommended action** required
- At least one **condition group** with at least one condition
- Each condition: **field**, **operator**, and **value** required (non-empty trim)
- **Template** required unless channel is `in_app`
- Template must **exist** in Email Library, be **approved**, and **match channel type** (`customer_email` for `email`, `internal_alert` for `internal_alert`)
- **Cooldown** must be `0` or greater
- **Timing** must be valid (`validateRuleTiming`)

Planned hardening (Phase **E-1D**) ✅:

- New rule **id** must be **unique** on create — `resolveRuleIdForCreate()` regenerates on collision; `validateRuleIdForSave()` blocks save if still colliding
- Duplicate trigger **names** — warning only in create/edit modal (`getDuplicateTriggerNameWarning()`), not a save blocker
- Provider **shape guard** — `saveAutomationRule()` rejects missing id/name/channel/recipient/condition groups without Email Library context

Verification: `npx tsx scripts/verify-automation-add-trigger-safety.ts`

#### Implementation phases (Add Trigger)

| Phase | Focus |
|-------|--------|
| **E-1A** | Audit — trigger model, UI reuse, safety boundaries ✅ |
| **E-1B** | Document Add Trigger design and safety model in this file ✅ |
| **E-1C** | Add Trigger UI — button, create mode on `RuleEditModal`, inactive default ✅ |
| **E-1D** | Validation hardening (unique id) + browser smoke test ✅ |

Out of scope for Add Trigger MVP: JSON import of rules, auto-enable on save, customer-facing live send, automatic SendGrid calls.

## 4. Account vs Contact Model

The app is **contact/email-first**. Sequences, cooling, and enrollment identity already follow this model. Customer Data, triggers, Action Queue UI, logs, Dashboard, and exports are migrating to match (Phase **C**).

> **Account tells us where the person belongs. Email tells us who the journey is for.**

### Account / customer context

Provides **where** the person belongs — not who receives operational comms by default:

| Field / concept | Purpose |
|-----------------|---------|
| `customer_id` | Stable account identifier |
| `customer_name` | Display name |
| `plan`, `stage`, segment | Lifecycle and tier context |
| `owner` / DAM | Assigned Digital Account Manager |
| Seats, usage, renewal | Adoption and risk signals |
| Account-level tags | New Customer, Low Usage, Renewal Risk, etc. |

### Contact / email operational record

Primary unit for **journeys, cooling, logs, and send eligibility**:

| Field / concept | Purpose |
|-----------------|---------|
| `contact_email` | **Primary operational identity** |
| `contact_name` | Display |
| `contact_role` | Admin / User / CSM |
| Invite state | Pending / accepted (per contact where available) |
| Sequence enrollment | Active/paused/completed per `contact_email + sequence_key` |
| Communication history | Sends, tests, dry runs tied to recipient email |
| Cooling status | Contact-level cooldown and conflict state |
| Data quality | Missing/invalid email, duplicate across accounts |
| Send eligibility | Approved + due + conflict-clear for that email |

**Principle:** The account tells us the customer context. The contact/email tells us who receives the communication and owns the journey state.

Enrollment identity is **`contact_email + sequence_key`**, not `account_id` alone. One account may have multiple contacts, each with independent enrollments, cooling history, and queue rows.

---

## 5. Customer Data / Excel Source

Customer data enters the system via **Excel/CSV upload** (and demo seed data in development). The product should support upload, validation, column mapping, tagging, and data quality checks.

The **Customer Data** page has **Accounts** and **Contacts / Emails** tabs. The Accounts tab shows one row per account (filters, export). The Contacts tab derives one row per email from flat upload rows via `lib/customer-contacts.ts` (display-only).

#### Accounts tab *(target)*

- One row per account
- Account-level context: plan, stage, owner/DAM, seats, usage, renewal
- Account-level tags and data quality summary
- Drill-down to contacts on the account

#### Contacts / Emails tab *(target — primary operational table)*

| Column / concept | Purpose |
|------------------|---------|
| `contact_email` | **First column** — primary key for the row |
| `contact_role` | Admin / User / CSM |
| Customer / account | `customer_name`, `customer_id` as context |
| Tags | Contact tags (In Sequence, Cooling Active, etc.) |
| Sequence status | Enrolled / not enrolled for this email |
| Cooling status | Contact-level cooling active or clear |
| Last communication | Last send or log for this email |
| Next eligible communication | From conflict engine / schedule |
| Data quality | Invalid email, missing contact, cross-account duplicate |

MVP upload remains flat (one row per account with `admin_email` / `user_email`). Phase **C-2** derives contacts from account rows; Phase **C-7** evolves upload toward one row per contact or account + nested contacts.

### Exports *(contact-first target)*

**Account export (intentionally account-first):** Customer Data → Accounts → `customer-data-export-*.csv` — one row per account with tags and data quality.

**Contact-first exports:**

| Export | Row grain | Filename |
|--------|-----------|----------|
| Contacts | One row per contact email | `contact-data-export-*.csv` |
| Action Queue | One row per queue item | `action-queue-export-*.csv` |
| Communication Logs | One row per log | `communication-logs-export-*.csv` |

Future CSV exports should lead with `contact_email`, `contact_role`, `customer_name`, `customer_id`, then account context. ✅ **C-7B–C-7E:** contact/queue/log CSV exports and export label cleanup complete. Accounts CSV remains account-first by design.

### Recommended fields

**Account fields**

| Field | Purpose |
|-------|---------|
| `account_id` | Stable account identifier |
| `customer_name` | Display name |
| `plan` | Product tier |
| `segment` | Market or size segment |
| `lifecycle_stage` | Onboarding / active / at-risk / etc. |
| `renewal_date` | Renewal planning |
| `owner_or_dam` | Assigned Digital Account Manager |

**Contact fields**

| Field | Purpose |
|-------|---------|
| `contact_email` | Primary communication identity |
| `contact_name` | Display name |
| `contact_role` | Admin / User / CSM |
| `admin_email` | Account admin inbox |
| `user_email` | Primary user inbox |
| `csm_email` | CSM inbox (if distinct from owner name) |

**Onboarding fields**

| Field | Purpose |
|-------|---------|
| `onboarding_start_date` | Journey anchor |
| `invite_status` | Pending / accepted |
| `invite_sent_date` | Invite timing |
| `seats_total` | License capacity |
| `seats_assigned` | Adoption signal |

**Activity fields**

| Field | Purpose |
|-------|---------|
| `usage_sessions` | Product usage |
| `last_activity_date` | Recency |
| `academy_visited` | Education engagement |
| `webinar_attended` | Event engagement |

**Communication fields**

| Field | Purpose |
|-------|---------|
| `last_email_sent_date` | Cooldown input |
| `emails_sent_count` | Volume tracking |
| `do_not_contact` | Suppression flag |

**Tags**

- `lifecycle_stage`
- `risk_level`
- `use_case`
- `journey_tag`

---

## 6. Tags and Segmentation

Tags support filtering, reporting, trigger conditions, and journey assignment.

### Account tags

- New Customer
- Onboarding
- Activated
- Low Usage
- High Usage
- Renewal Risk
- Expansion Opportunity
- Dormant

### Contact tags

- Admin
- End User
- Pending Invite
- Accepted Invite
- No Usage
- Power User
- Do Not Contact
- In Sequence
- Cooling Active

### Journey tags

- Onboarding Sequence
- Activation Sequence
- Education Sequence
- Renewal Sequence
- Reactivation Sequence

Tags may be derived from data rules, applied manually, or set by trigger/sequence outcomes in future phases.

---

## 7. Main Product Sections / UI Map

Recommended sidebar structure and purpose:

| # | Section | Route (current) | Purpose |
|---|---------|-----------------|---------|
| 1 | **Dashboard** | `/` | Contact-first workload overview *(target)*: due actions, cooling blocks, enrollments; account rollup secondary |
| 2 | **Customer Data** | `/customers` | Upload Excel/CSV, validate columns, view accounts/contacts, apply tags |
| 3 | **Email Templates** | `/email-library` | Manage reusable approved email and internal alert templates |
| 4 | **Email Sequences** | `/sequences` | Build multi-step contact-level journeys using approved templates |
| 5 | **Activity Triggers** | `/automations` | Create behavior-based rules from customer data *(labeled Automations in MVP)* |
| 6 | **Action Queue** | `/action-queue` | Review all triggered and sequence-based actions before anything happens |
| 7 | **Reports** | `/reports` | Read-only contact-first reporting — 7 core sections + CSV export |
| 8 | **Communication Logs** | `/send-logs` | Test sends, dry runs, internal alerts, skipped/completed actions |
| 9 | **Settings / Governance** | *(planned)* | Cooling periods, SendGrid mode, safety rules, communication policy |

The MVP implements sections 1–8 with local/demo storage. Governance is future work.

---

## 8. Action Queue Role

The **Action Queue is the review workbench for contact-level actions** — the control point where humans decide what proceeds for each resolved `contact_email` (or internal alert recipient).

### It receives

- Activity-triggered actions (one row per resolved contact when fully wired)
- Sequence-step actions (from active enrollments, current step only)
- Internal DAM alerts
- Blocked / conflict actions (including *no eligible contact email*)
- Scheduled / not-due actions

### Recommended column order *(contact-first target)*

| # | Column | Description |
|---|--------|-------------|
| 1 | **Contact Email** | Primary operational identity |
| 2 | **Role** | Admin / User / CSM |
| 3 | **Customer / Account** | Context: name, id |
| 4 | **Source** | Trigger or Sequence |
| 5 | **Trigger / Sequence** | Rule name or sequence name |
| 6 | **Step** | Step number and name (sequences) |
| 7 | **Schedule Status** | Due now / not due / scheduled |
| 8 | **Conflict Status** | Clear or blocked (cooldown, cap, duplicate sequence, etc.) |
| 9 | **Approval Status** | Needs Review → Approved → Sent / Skipped / Blocked |

MVP UI: Action Queue displays **contact/email first** (Phase **C-4A**). Activity Trigger rows now include `contact_email` when safely resolvable (**C-4B-1**). One-row-per-contact fan-out remains deferred (**C-4B-2**).

**Reactive derivation:** Queue rows from Activity Triggers are computed whenever **active** rules or customer data change — not only when the user clicks **Refresh Action Queue**. Only **active** triggers contribute rows. See [§3 Custom Activity Triggers / Add Trigger](#custom-activity-triggers--add-trigger) for why new triggers must default to inactive.

No row sends automatically. Approved internal alerts still require explicit **Send via SendGrid** with server-side guards.

---

## 8a. Communication Logs Role

Logs prove **what happened to each contact email** (and internal recipients for DAM alerts). Account name is context, not the primary key.

### Recommended column order *(contact-first target)*

| # | Column | Description |
|---|--------|-------------|
| 1 | **Time** | When the event occurred |
| 2 | **Recipient / Contact Email** | Primary identity |
| 3 | **Role** | Admin / User / CSM (when applicable) |
| 4 | **Customer / Account** | Context |
| 5 | **Source** | Trigger, Sequence, Test, etc. |
| 6 | **Template** | Template key or name |
| 7 | **Sequence / Step** | If sequence-driven |
| 8 | **Status** | Delivered, Dry Run, Skipped, etc. |
| 9 | **Mode** | demo / test / dry_run / live |

MVP UI: Communication Logs display **contact/email first** (Phase **C-5A**). ✅ **C-7D:** Communication Logs CSV contact-first reorder. ✅ **C-7E:** export label cleanup.

---

## 9. Cooling / Conflict Rules

Triggers and sequences can both create communication actions for the same contact. **Conflict rules prevent over-communication** and duplicate journeys.

### Rule types

| Rule | Purpose |
|------|---------|
| **Email-level cooldown** | Minimum days between any emails to a contact |
| **Same-template cooldown** | Minimum days before reusing the same template |
| **Account-level communication cap** | Max emails per account in a window |
| **Active-sequence duplicate prevention** | Block enrolling or sending when already active in same sequence |
| **Do-not-contact suppression** | Hard block for opted-out contacts |
| **Role-based cadence** | Different limits per Admin / User / CSM |
| **Internal alert exception** | Internal DAM alerts may bypass contact cooldown when configured |
| **Priority override for risk alerts** | Renewal/risk may bypass soft blocks *(planned)* |

### Example

If a contact received a sequence email yesterday, and a trigger creates another customer email today, the new action should be **blocked or rescheduled** until the cooling period ends. The Action Queue shows the conflict reason and next eligible date.

---

## 10. DAM / Internal Alert Logic

**Digital Account Manager (DAM) notifications are internal alerts** — they go to internal inboxes or routed DAM email, never directly to customer admin/user addresses in the MVP.

### Internal alerts can be created by

- Activity triggers (e.g. renewal risk)
- Sequence steps (e.g. Day 14 internal alert if no activity)
- Sequence completion *(planned)*
- Renewal risk detection
- High usage / expansion opportunity *(planned)*
- No usage after sequence completion *(planned)*

### MVP behavior

Internal alerts still appear in the **Action Queue for review**. Sending requires:

- Workflow status **Approved**
- Schedule status **due_now**
- Conflict status **clear**
- Internal-only recipient (domain or DAM routing)

SendGrid mode `dry_run` validates without delivery; `live` sends to resolved internal recipients only.

---

## 11. Dashboard and Reports

### Dashboard — planned contact-first metrics

Primary cards *(target)*:

| Metric | Description |
|--------|-------------|
| **Total contacts** | Derived emails across loaded accounts |
| **Contacts in sequence** | Active/paused enrollments by contact |
| **Contacts blocked by cooling** | Contact-level conflict/cooldown |
| **Contacts with data quality issues** | Invalid/missing/duplicate emails |
| **Emails / actions due now** | Contact-level queue slice due for review |
| **Contact-level communication volume** | Sends/tests in period |

**Secondary (account rollup):** total customers, at-risk accounts, pending invites, low-usage accounts — useful context, not the primary operational lens.

MVP Dashboard: **C-6A** adds contact-first metric cards and contact-first recent queue/log widgets; account rollup remains as secondary context below.

### Reports needed

| Report | What it should show |
|--------|---------------------|
| **Sequence Performance Report** | Enrollments, completion rate, step drop-off, time-to-complete, skipped steps **per contact** |
| **Action Queue Report** | Volume by source, status, contact, owner; blocked vs cleared; aging |
| **Trigger Performance Report** | Rule match counts, **contact actions** created, conversion after trigger |
| **Communication Volume Report** | Emails/alerts **per contact** first; account rollup secondary; internal vs customer-facing |
| **Cooling / Conflict Report** | Blocked actions by contact, reason, next eligible dates |
| **Customer Journey Report** | **Contact timeline:** triggers, enrollments, sends, completions |
| **DAM Alert Report** | Internal alerts by type, contact/account context, DAM, response time |
| **Data Quality Report** | Missing emails, invalid fields, upload errors, tag coverage **by contact** |

The **Reports page is live** at `/reports` (Phase **D** ✅). It is **read-only** — it does not send email, mutate customer data, change queue statuses, or progress sequences.

| Section | Status |
|---------|--------|
| Executive Overview | ✅ Live |
| Import Quality | ✅ Live |
| Contact Journey | ✅ Live |
| Action Queue | ✅ Live |
| Communication | ✅ Live |
| Sequences | ✅ Live |
| Account Context | ✅ Live |
| Reports CSV export | ✅ Live — read-only snapshot download |

Future report types from the table below (trigger performance, cooling/conflict detail, DAM analytics) may extend this page in later phases.

---

## 12. Current MVP State

What exists today in the codebase:

| Capability | Status |
|------------|--------|
| Email Library (templates) | ✅ Exists — create, edit, approve, archive |
| Activity Triggers (Automations) | ✅ Exists — grouped AND/OR rules, timing; edit, duplicate, enable/disable, test, export |
| Add Trigger (custom rules) | ✅ Exists — Add Trigger button, create mode, inactive by default |
| Timing rules | ✅ Exists — immediate, delay, scheduled |
| Action Queue | ✅ Exists — rule + sequence rows merged |
| Internal SendGrid dry-run / live | ✅ Exists — internal alerts only |
| Customer-facing live sends | ❌ Disabled by design |
| Email Sequences | ✅ Exists — library, steps, cooling policy |
| Contact-level preview | ✅ Exists — timeline, conflicts, read-only |
| Manual enrollments | ✅ Exists — localStorage registry |
| Enrollments → Action Queue | ✅ Active enrollments generate current-step rows |
| Manual step progression | ✅ Mark complete, skip, complete enrollment |
| Conflict + schedule send guards | ✅ Client and server for internal sends |
| Automation → sequence enrollment | ❌ Not wired |
| Contact-first UI (Customer Data, triggers, queue, logs, dashboard) | 🔄 Documented (Phase C); partial in sequences/conflicts |
| Reports page | ✅ All core sections live + read-only CSV export (Executive Overview, Import Quality, Contact Journey, Action Queue, Communication, Sequences, Account Context) |
| Governance settings page | ❌ Not built |
| Database persistence | ❌ localStorage / session only |

---

## 13. Safety Principles

These rules are non-negotiable for MVP and early production:

1. **Nothing sends automatically.** All outbound paths require explicit human action.
2. **Customer-facing live sends are disabled.** No route sends to `admin_email` or `user_email` in production flow.
3. **Internal alerts require manual review and approval** before SendGrid.
4. **Internal send requires:** Approved + due_now + conflict-clear + internal-only recipient.
5. **Sequences are contact/email-level.** Enrollment identity is `contact_email + sequence_key`.
6. **Action Queue is the control point.** Triggers and sequences produce reviewable **contact-level** rows, not direct sends.
7. **Logs and exports must show what happened per contact email** — including sequence metadata, conflict status, and send mode; account fields are context.
8. **Production requires** persistence, immutable audit logs, RBAC, scheduler, and compliance before customer email goes live.

---

## 14. Future Phases

Recommended implementation order:

| Phase | Focus |
|-------|--------|
| **A** | Product UI naming cleanup (Automations → Activity Triggers, Send Logs → Communication Logs, etc.) |
| **B** | Customer Data tagging and data quality — **B-2:** helpers; **B-3:** tags/badges; **B-4:** Data Quality Review panel; **B-5:** filters; **B-6:** CSV export with computed tags and data quality |
| **C-1** | Product docs — contact-first architecture *(this document)* |
| **C-2** | Derived contact helper module — ✅ `lib/customer-contacts.ts` (`deriveContactsFromCustomer`, `deriveAllContacts`, duplicate detection) |
| **C-3** | Customer Data — ✅ **C-3A:** Accounts + **Contacts / Emails** tab; ✅ **C-7B–C-7E:** contact CSV export + export labels |
| **C-4** | Action Queue contact-first — ✅ **C-4A:** UI; ✅ **C-4B-1:** trigger `contact_email`; ✅ **C-7C:** contact-first Action Queue CSV export; **C-4B-2:** one row per contact fan-out (deferred) |
| **C-5** | Communication Logs contact-first — ✅ **C-5A:** UI/search; ✅ **C-7D:** contact-first CSV export |
| **C-6** | Dashboard and report cards — ✅ **C-6A:** contact-first dashboard metrics and widgets; **C-6B+:** reports page |
| **C-7** | Upload model evolution — one row per contact or account + contacts |
| **C-8** | Excel import templates — ✅ **C-8A:** schema audit; ✅ **C-8B:** spec; ✅ **C-8C:** downloadable templates; ✅ **C-8D-1:** format detection; ✅ **C-8D-2:** multi-sheet parser; ✅ **C-8D-3A:** Customer[] rollup; ✅ **C-8D-3B:** Option C validate/apply; ✅ **C-8D-4:** multi-sheet upload preview; ✅ **C-8E-1:** cross-sheet validation library; ✅ **C-8E-2:** cross-sheet validation wired into Option C upload; ✅ **C-8E-3:** Contacts Data Quality Preview |
| **D** | Reports page (contact-first reports from §11) — ✅ **D-1:** audit; ✅ **D-2:** `buildReportsSnapshot` helper library; ✅ **D-3:** `/reports` read-only page shell + sidebar link; ✅ **D-4:** Executive Overview + Import Quality sections; ✅ **D-5:** Contact Journey + Action Queue sections; ✅ **D-6:** Communication + Sequences + Account Context sections; ✅ **D-7:** read-only Reports CSV export |
| **E** | Governance / Settings page (cooling, SendGrid mode, policy) |
| **E-1A** | Activity Triggers — Add Trigger audit ✅ |
| **E-1B** | Activity Triggers — Add Trigger design docs ✅ |
| **E-1C** | Activity Triggers — Add Trigger UI (create mode, inactive default) ✅ |
| **E-1D** | Activity Triggers — validation hardening + smoke test ✅ |
| **F** | Production Error Audit — **F-0:** audit plan ✅; **F-1:** full-site audit ✅; **F-2A:** blocking fixes; **F-2B:** API security ✅ (**F-2B-0–4**); **F-2C:** polish ✅; **F-3:** final verification ✅ |
| **G** | Automation Trigger → Enroll Contact into Sequence |
| **H** | Sequence Completion → DAM Alert |
| **I** | Persistent backend storage (customers, queue, logs, rules, templates, sequences) |
| **J** | Auth, session, RBAC, audit — **J-0–J-6F** ✅ · **J-7** pending |
| **K** | Communication Ledger / Simulated Send Logs — **K-0** docs ✅ · **K-1B** simulated logs ✅ · **K-1F** stable verification ✅ — see [Phase K design](phase-k-communication-ledger.md) |
| **L** | Single Excel Import System — **L-4F** flat public import stable ✅ — see [Phase L design](phase-l-single-excel-import.md), [L-4 flat import](phase-l-4-flat-single-sheet-import.md) |
| **I** | Durable persistence — **I-4A** foundation ✅ · **I-4B** atomic transaction ✅ — I-5 API wiring next |

Phases **C-2–C-7** align the app with the contact-first model. Phase **F** is the production-readiness audit pass before wider demo or deploy. Phases **G–H** connect triggers and sequences. Phase **I** adds durable data. Phase **J** adds identity and access control before live sends on shared URLs. Phase **K** adds a simulated Communication Ledger before any customer-facing SendGrid sends; real customer email enablement comes **after K-2** with explicit approval.

---

## 15. Production Gaps

Before production use beyond internal demo:

- Database persistence (sequences, enrollments, logs, rules, templates)
- Immutable audit logs (append-only send and progression history)
- Backend scheduler (due-step surfacing, not auto-send)
- Idempotency (send and enrollment operations)
- Durable contact communication history (not session-only logs)
- Unsubscribe / suppression handling
- Customer email compliance (CAN-SPAM, GDPR, consent)
- Role-based permissions (who can approve, send, enroll)
- Server-side sequence state recomputation
- Environment separation (dev / staging / prod)
- SendGrid webhooks (delivery, bounce, unsubscribe events)
- Reporting warehouse or analytics export

---

## 16. Phase F — Production Error Audit

Phase F is an **audit-first production readiness pass** run before wider stakeholder demos or any production deployment. It identifies defects, safety risks, and known limitations — it does **not** change product behavior.

**Current status:** **F-0** ✅, **F-1** ✅, **F-2C** ✅, **F-3** ✅ (demo freeze). **F-2B** ✅ complete (API security hardening through F-2B-4). **Phase J** auth design documented — see [Phase J auth architecture](phase-j-auth-architecture.md).

### 16.1 Purpose

Phase F exists to find and categorize issues across the full app before production use or a high-stakes demo. F-1 must identify:

| Category | Examples |
|----------|----------|
| **Build / compile** | TypeScript errors, failed `next build`, lint failures |
| **Runtime** | Uncaught exceptions, React error boundaries, route crashes |
| **Hydration** | Server/client mismatch warnings in browser console |
| **Browser console** | Errors, warnings, failed assertions |
| **Network** | Failed `fetch`/API calls, 4xx/5xx on app routes |
| **Routing** | Broken links, 404s, layout crashes on navigation |
| **Exports / downloads** | CSV/JSON export failures, empty or corrupt files |
| **Imports / uploads** | CSV Option A and XLSX Option C validate/apply failures |
| **API safety** | Unguarded send paths, missing server-side checks |
| **SendGrid / customer-send risks** | Customer-facing send routes, automatic SendGrid calls |
| **Demo blockers** | Features that break core demo narrative |
| **Production blockers** | Issues that would fail in a real deployment |
| **Known limitations vs defects** | Intentional MVP gaps that must not be filed as bugs |

Audit findings must be **separated** from intentional current behavior (see [§13 Safety Principles](#13-safety-principles) and [§12 Current MVP State](#12-current-mvp-state)).

### 16.2 Non-goals

Phase **F-1** (audit execution) must **not**:

- Fix code
- Change behavior
- Deploy
- Commit
- Change `.env.local`
- Add new features
- Alter SendGrid or customer-send behavior
- Alter import/export behavior
- Alter Action Queue behavior
- Alter Reports behavior

F-1 is **report only**. Fixes belong in **F-2A / F-2B / F-2C** after review.

### 16.3 Audit phases

| Phase | Focus | Output |
|-------|--------|--------|
| **F-0** | Document production audit plan | This section in `docs/context/product.md` ✅ |
| **F-1** | Full site production error audit | Written audit report only — no code changes |
| **F-2A** | Blocking fixes | Patch only issues that block build, core routes, or safety |
| **F-2B** | High-priority API security hardening (H-1, H-2) | Env-gated send routes ✅, redacted config ✅, F-2B-4 verified ✅ — [design doc](phase-f2b-api-security.md) |
| **F-2C** | Low-priority polish | Copy, minor UX, harmless noise cleanup |
| **F-3** | Final production/demo readiness verification | Re-run F-1 checks; confirm scores and safety |

### 16.4 Audit scope (F-1)

F-1 must exercise the following **routes**:

| Route | Page |
|-------|------|
| `/` | Dashboard |
| `/customers` | Customer Data |
| `/email-library` | Email Templates |
| `/sequences` | Email Sequences |
| `/automations` | Activity Triggers |
| `/action-queue` | Action Queue |
| `/send-logs` | Communication Logs |
| `/reports` | Reports |

**Pages / features to check:**

| Area | Checks |
|------|--------|
| **Dashboard** | Contact-first metrics, recent widgets, no crash on load |
| **Customer Data — Accounts** | Table, filters, export, detail drawer |
| **Customer Data — Contacts / Emails** | Derived contact table, export |
| **Data Quality panel** | Review panel renders; issues match data |
| **Use Demo Data** | Reset restores demo customers and local config |
| **Import templates** | Download current CSV template; download target multi-sheet XLSX template |
| **Option A (CSV)** | Upload → validate → apply |
| **Option C (multi-sheet XLSX)** | Upload → validate → preview → apply |
| **Option C blocker case** | Invalid/cross-sheet workbook shows blocker UI (no silent apply) |
| **Activity Triggers** | List, edit, duplicate, enable/disable, test |
| **Add Trigger** | Create, edit, validate, **inactive-by-default** on save |
| **Email Templates** | CRUD, approve, preview, test send to test inbox only |
| **Email Sequences** | Manual enroll, progression, queue rows — no auto-send |
| **Action Queue** | Contact-first review workflow; Send via SendGrid gated |
| **Communication Logs** | Contact-first table, filters, export |
| **Reports** | All **7** sections render read-only |
| **Reports CSV export** | Snapshot download succeeds |
| **API routes** | All handlers under `app/api` — safety and error responses |
| **SendGrid routes** | Internal/test only; no customer live send path |
| **Sidebar safety state** | Config panel shows SendGrid mode, customer sends disabled |

**Safety boundaries to confirm during F-1:**

- Customer-facing sends remain **disabled**
- No customer live send route exists
- SendGrid is **internal/test only**
- No automatic sending; no cron/background send
- Reports are **read-only**
- Action Queue send behavior remains **gated** (Approved + due_now + conflict-clear + internal-only)
- Activity Triggers create **reviewable actions only**
- New custom triggers are **inactive by default**
- Action Queue is **reactively derived** from active triggers and customers
- **Refresh Action Queue** is **not** a safety gate
- Import **Signals** are detected but **not** imported into Communication Logs yet
- Extra contacts beyond MVP rollup are **not** persisted yet
- Data is **session/localStorage-based** unless otherwise implemented

### 16.5 Required commands for F-1

Run from repo root:

```bash
npm run lint
npm run build
npx tsx scripts/verify-import-multisheet-parser.ts
npx tsx scripts/verify-import-customer-rollup.ts
npx tsx scripts/verify-import-multisheet-validate.ts
npx tsx scripts/verify-import-multisheet-cross-validation.ts
npx tsx scripts/verify-import-multisheet-cross-validation-wired.ts
npx tsx scripts/verify-reports-snapshot.ts
npx tsx scripts/verify-reports-export.ts
npx tsx scripts/verify-automation-add-trigger-safety.ts
```

**Script policy:**

- If a script is **missing**, report it in the F-1 audit report.
- Do **not** create missing scripts during F-1.

Record exit codes and failure output for each command in the audit report.

### 16.6 Production server requirement

F-1 browser testing must use a **production build**, not dev-only behavior:

```bash
npm run build && npm run start -- -p 3015
```

| Rule | Detail |
|------|--------|
| **Port** | Use an open port (example: `3015`) |
| **`EADDRINUSE`** | Report as **environment/port issue**, not an app defect — unless it blocks testing completely |
| **Logs** | Capture server terminal output during browser pass |

### 16.7 Browser audit requirements

F-1 must include browser verification:

| Requirement | Detail |
|-------------|--------|
| **Browser** | Normal browser pass; ideally also **incognito** or manual second pass |
| **Console** | Log all errors and hydration warnings |
| **Network** | Note failed requests (status, URL, route) |
| **Server logs** | Correlate browser failures with terminal output |
| **Downloads** | Confirm CSV/JSON/template downloads complete |
| **Loading states** | Flag stuck spinners or never-resolving UI |
| **Layout** | Broken layouts, overflow, missing sidebar |
| **Routes** | Each route in §16.4 loads without crash |

Automated browser (e.g. Cursor IDE browser MCP) is acceptable if it covers the same checks.

### 16.8 Static production risk scan

F-1 should search the codebase and **categorize** matches by severity (not every hit is a blocker):

| Pattern / topic | What to look for |
|-----------------|------------------|
| `TODO` | Incomplete work |
| `FIXME` | Known broken areas |
| `console.error` | Error logging — may indicate unhandled paths |
| `console.log` | Debug noise in production paths |
| `throw new Error` | Unhandled failure surfaces |
| `any` | Type safety gaps |
| `@ts-ignore` | Suppressed type errors |
| `dangerouslySetInnerHTML` | XSS risk |
| Direct `localStorage` access | Session/persistence assumptions |
| Direct SendGrid calls | Bypass of server guards |
| Customer send references | Paths to `admin_email` / `user_email` delivery |
| Cron / background send references | Automatic send risk |
| Hardcoded `localhost` URLs | Broken in production |
| Missing error handling | Silent failures on API/upload |
| Unguarded browser-only APIs | SSR/hydration risk (`window`, `document` without guard) |

**Clarification:** Not every result is a blocker. Each finding gets a severity from §16.9.

### 16.9 Severity model

| Severity | Criteria |
|----------|----------|
| **Blocking** | Prevents build; crashes core routes; enables customer-facing sends; breaks import/apply completely; breaks Action Queue safety; corrupts data |
| **High** | Serious demo risk; broken major feature; misleading metrics; severe console/runtime errors; export/import failure on core flow |
| **Medium** | Non-blocking runtime warning; known session/localStorage limitation surfaced as error; partial UX issue; edge-case validation issue |
| **Low** | Copy issue; harmless console noise; polish; outdated comments; minor layout issue |
| **Known limitation** | Intentional current behavior — document and explain; **do not** treat as defect |

Examples of **known limitations** (not defects):

- localStorage/session-only persistence
- Signals sheet detected but not written to Communication Logs
- Extra contacts beyond MVP rollup not stored
- Customer-facing live sends disabled by design
- Refresh Action Queue is informational, not a safety gate

### 16.10 Required F-1 report format

The F-1 audit deliverable is a single written report containing:

1. **Executive summary**
2. **Production readiness score** (out of 10)
3. **Demo readiness score** (out of 10)
4. **Blocking issues**
5. **High-priority issues**
6. **Medium-priority issues**
7. **Low-priority issues / polish**
8. **Known limitations**
9. **Route-by-route results** (pass/fail/notes for each route in §16.4)
10. **Browser console findings**
11. **Server log findings**
12. **API route safety findings**
13. **Import/export findings**
14. **Add Trigger findings** (inactive default, validation, no SendGrid on create/test)
15. **SendGrid / customer-send safety confirmation**
16. **Data persistence / session limitations**
17. **Recommended fix phases** (map issues → F-2A / F-2B / F-2C)
18. **Files inspected**
19. **Commands run and results**

Suggested report location: `docs/context/phase-f1-audit-report.md` (create during F-1 only).

### 16.11 Production decision questions

The F-1 report must answer:

| Question | Intent |
|----------|--------|
| **Can we demo safely?** | Core flows work; no accidental customer sends |
| **Can we deploy safely?** | Build succeeds; no blocking runtime/safety issues |
| **What will break in production?** | Hardcoded localhost, SSR issues, missing env handling |
| **What is only a known limitation?** | Separate from defects |
| **What must be fixed before Joe/Jamilia sees it?** | Demo blockers → F-2A / F-2B |
| **What can wait?** | Polish and non-blocking items → F-2C or backlog |

---

## 17. Phase F-2B — API security hardening (H-1 / H-2)

High-priority production risks from F-1 / F-2B-0:

- **H-1:** Unauthenticated `POST /api/send-approved-internal` and `POST /api/send-test-email`
- **H-2:** `GET /api/internal-send-config` exposes internal routing emails

**Approved direction:** Env-gated send routes ✅ + redacted public config ✅ + deployment access protection (operational); real session/auth deferred to Phase J.

**F-2B-2 implemented:** Raw routing emails are no longer returned to the browser. Send routes return 403 unless `INTERNAL_SEND_API_ENABLED=true` or `SENDGRID_TEST_SEND_ENABLED=true` (default off).

Full approved design (layers, env vars, preview endpoint, guard behavior, production rules, implementation roadmap):

→ **[Phase F-2B API security design](phase-f2b-api-security.md)**

---

## 18. Phase J — Auth, session, RBAC & audit

Phase **J** is the **identity and access control foundation** required before enabling real send behavior on shared or public URLs. It is **not** the customer email pipeline.

| ID | Focus | Status |
|----|--------|--------|
| **J-0** | Auth architecture audit / design | ✅ Complete |
| **J-1** | Document approved auth architecture | ✅ Complete |
| **J-2B** | Clerk session foundation (`AUTH_ENABLED=false` default) | ✅ Complete |
| **J-3** | Protect dashboard pages | ✅ Complete |
| **J-4** | Protect API routes | ✅ Complete |
| **J-5B** | RBAC permission helpers + API permission checks | ✅ Complete |
| **J-5C** | UI action gating (`PermissionsProvider`, `useCan()`) | ✅ Complete |
| **J-5D** | RBAC verification pass | ✅ Complete |
| **J-6B** | Audit DB schema + helper foundation | ✅ Complete |
| **J-6C** | Server-side audit for API routes | ✅ Complete |
| **J-6D** | Protected UI-origin audit ingestion | ✅ Complete |
| **J-6E** | Audit read/export foundation | ✅ Complete |
| **J-6F** | Stable verification / freeze check | ✅ Complete |
| **J-6** | Durable audit logs (full wiring) | ✅ Complete (J-6B–J-6F) |
| **J-7** | Production auth verification | Pending |
| **J-8+** | Post-auth hardening (optional) | Future |

**Delivers:** server-side session auth, protected pages and API routes, operator RBAC (API + UI, verified J-5D), append-only audit foundation (J-6B), server-side API audit wiring (J-6C), protected UI-origin audit ingestion (J-6D), minimal audit read/export on Reports (J-6E), stable verification pass (J-6F). F-2B env gates remain as operational kill switches. `AUDIT_ENABLED=false` by default — audit helpers no-op; Reports audit section shows not-configured state safely. UI-origin events are non-authoritative until Phase I. DB-backed audit verification not run unless `DATABASE_URL`, applied schema, and `AUDIT_ENABLED=true` are configured. **Next:** J-7 real Clerk + Neon verification.

**Does not deliver:** customer-facing live sends, automatic sending, or changes to Action Queue business workflow.

Full approved design (provider options, roles, permissions, API/page protection, audit model, roadmap):

→ **[Phase J auth architecture](phase-j-auth-architecture.md)**

Layer 4 from [Phase F-2B](phase-f2b-api-security.md#layer-4--future-real-auth-phase-j) maps to Phase J implementation.

---

## 19. Phase K — Communication Ledger / Simulated Send Logs

Phase **K** introduces a **simulated Communication Ledger** so approved Action Queue items can produce Communication Log rows **without sending real email**. Reports summarize those rows; SendGrid webhooks update them later when real sending is enabled.

**Status:** **K-0** documentation ✅ · **K-1A** audit ✅ · **K-1B** simulated Communication Logs ✅ · **K-1F** stable verification ✅ · **K-2** SendGrid webhook next.

Full approved design (terminology, safety rules, target fields, K-1/K-2 behavior, reports, audit, roadmap):

→ **[Phase K Communication Ledger design](phase-k-communication-ledger.md)**

K-1A model audit and K-1B file plan:

→ **[Phase K-1A model audit & plan](phase-k-1a-model-audit.md)**

---

## 20. Phase L — Single Excel Import System

Phase **L** consolidates Customer Data import into **one Excel workbook template** (`Accounts`, `Contacts`, `Signals`). `Contacts.contact_email` is the single source of truth for people; re-upload **replaces** session data (no append, no duplicate contacts). Signals are validated and previewed only — not written to Communication Logs in L-1.

**Status:** **L-4F** flat public import stable ✅. **I-4B** atomic import transaction complete ✅. Persistence disabled by default; UI not wired. Run live verify after manual SQL apply. **I-5** API/persist-on-apply is next.

The two-template UX was removed in **L-1B.1**; audit/export polish completed in **L-1B.5**.

Full approved design (schema, validation, apply semantics, safety, audit, roadmap):

→ **[Phase L Single Excel Import design](phase-l-single-excel-import.md)**

→ **[Phase L-2 Row 2 header import](phase-l-2-row2-header-import.md)** — **L-2F** ✅ stable Row 2 import verification

→ **[Phase L-4 Flat single-sheet import](phase-l-4-flat-single-sheet-import.md)** — **L-4F** ✅ stable flat public import

→ **[Phase I-1 Persistence schema](phase-i-1-persistence-schema-design.md)** · **[I-3 Repository design](phase-i-3-import-repository-design.md)** — **I-4A** ✅ foundation

L-1A model audit and L-1B file plan:

→ **[Phase L-1A model audit & plan](phase-l-1a-model-audit.md)**

---

## Related documentation

- [Phase L Single Excel Import design](phase-l-single-excel-import.md) — one workbook template (**L-0** ✅; implementation not started)
- [Phase K Communication Ledger design](phase-k-communication-ledger.md) — simulated send logs (**K-1B** ✅), reporting split, SendGrid webhook direction (**K-2** future)
- [Phase J auth architecture](phase-j-auth-architecture.md) — approved session auth, RBAC, audit logging, implementation roadmap
- [Phase F-2B API security design](phase-f2b-api-security.md) — approved env gates, redacted config, deployment protection, implementation roadmap
- [Email Sequences design](../EMAIL-SEQUENCES.md) — contact-level sequences, enrollment, Action Queue, progression (Phases 1–5)
