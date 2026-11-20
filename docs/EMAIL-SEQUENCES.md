# Email Sequences — Contact/Email-Level Design

> **Status:** Phases 1–5 complete (library, preview, enrollment, Action Queue, manual step progression). Automations enrollment not wired yet.
>
> App-wide contact-first principles (Customer Data, triggers, logs, Dashboard) are defined in [Product context §4](../docs/context/product.md#4-account-vs-contact-model). This doc covers sequence-specific design.

## Core principle

**Sequences are contact/email-level. Accounts provide context, but enrollments and cooldowns are tied to email addresses.**

One customer account can have multiple admins/users with different invite status, usage, and communication history. A sequence enrollment must target a specific `contact_email`, not the account alone.

---

## Identity model

| Concept | Key |
|---------|-----|
| Enrollment uniqueness | `contact_email` + `sequence_key` |
| ~~Not sufficient~~ | `account_id` + `sequence_key` alone |

Helper: `sequenceEnrollmentId(contactEmail, sequenceKey)` in `lib/email-sequence-types.ts`.

---

## SequenceEnrollment

Each enrollment record includes:

| Field | Purpose |
|-------|---------|
| `account_id` | Customer/account context |
| `customer_name` | Display |
| `contact_email` | **Primary recipient identity** |
| `contact_name` | Display |
| `contact_role` | Admin \| User \| CSM |
| `sequence_key` / `sequence_name` | Which sequence |
| `enrollment_status` | active, paused, completed, exited, cancelled, blocked |
| `enrolled_at` | When enrolled |
| `current_step_number` | Current step |
| `next_step_due_at` | When next step is due (recommendation only) |
| `completed_steps` | History of completed/skipped steps (`CompletedStepRecord[]`) |
| `exit_reason` | Why exited (if applicable) |
| `account_context` | Snapshot of account fields (not recipient) |

### Account context (read-only on enrollment)

- `customer_id`, `customer_name`, `account_owner`
- `seats_total`, `seats_assigned`
- `usage_sessions`, `usage_threshold_percent`
- `renewal_date`

---

## Sequence steps

Each `EmailSequenceStep` defines:

- `step_number`, `step_name`
- `recipient_type`: Admin \| User \| CSM
- `template_key`
- Optional `timing` / `delay_after_previous_days`

### Enrollment resolution

When a rule enrolls a sequence:

1. Evaluate conditions at **account** level (and future contact-level fields).
2. For each matching step, resolve `contact_email` via `resolveSequenceContacts()` / `resolveContactsForRuleEnrollment()`.
3. If **multiple contacts** match → **one enrollment per `contact_email`**.
4. If **no contact** → blocked Action Queue item with reason: *"No eligible contact email found."*

### Default rule → contact mapping (examples)

| Rule | Contact resolution |
|------|-------------------|
| Invite Not Accepted | Pending invite → admin email |
| Seats Underassigned | Admin email |
| No Usage | Admin or User per rule `recipientType` |
| Renewal Risk | Internal CSM/DAM alert — **not** customer email sequence unless explicitly configured |

---

## Cooling / conflict engine

Primary checks use **`contact_email`** (`checkContactSequenceConflicts` / `checkContactSequencePreviewConflict` in `lib/email-sequence-conflicts.ts`):

1. Same email within global cooldown period
2. Same email received same template recently
3. Same email already active in same sequence
4. Same email exceeded max emails per 30 days

Optional **account-level** checks:

- Account exceeded max emails per 7/30 days
- Too many contacts from same account in same period

**Internal alerts:** CSM/DAM internal alerts may bypass customer email cooldown when `internal_alerts_bypass_contact_cooldown` is true (default).

Conflicts block queue send eligibility only — **no automatic sends**.

---

## Action Queue (target shape)

`SequenceAwareActionQueueItem` extends current queue rows with:

- `contact_email`, `contact_role`
- `sequence_key`, `sequence_name`
- `sequence_step_number`, `sequence_step_name`
- `conflict_status`, `conflict_reason`, `next_eligible_at`

### Target UI columns

- Customer
- Contact Email
- Role
- Sequence
- Step
- Schedule Status (existing timing feature)
- Conflict Status

Send remains: **Approved + internal-eligible + due_now + conflict-clear + manual SendGrid**.

---

## Communication Logs (target shape)

`SequenceAwareSendLog` adds:

- `contact_email`, `contact_role`
- `account_id`, `customer_name`
- `sequence_key`, `sequence_step_number`
- `conflict_status`

---

## Exports (target)

Action Queue CSV and Communication Logs CSV will include contact + sequence + conflict columns when sequences are implemented.

---

## Automation rules

Rules continue to evaluate account-level (and future contact-level) conditions. When creating sequence enrollments:

- Enroll **resolved `contact_email`**, not account alone.
- Internal channel rules → internal recipient path, not customer sequence.

---

## Safety (unchanged)

| Rule | Status |
|------|--------|
| Sequences send automatically | **No** — not implemented |
| Customer-facing live sends | **Disabled** |
| Internal SendGrid | Manual, approved, internal-only, due_now, conflict-clear |
| Test sends | `SENDGRID_TEST_TO_EMAIL` only |
| Cron / background jobs | **None** |

---

## Implementation phases

### Phase 1 — Sequence Library UI ✅

- `lib/email-sequence-definitions.ts` — editable sequence model + 4 defaults
- `lib/email-sequences-storage.ts` — localStorage key `onboarding-control-email-sequences`
- `/sequences` page — create, edit, duplicate, approve, archive, preview, export
- **Not wired:** Action Queue, enrollments, Automations, sends

### Phase 2 — Contact-level sequence preview ✅

- `lib/email-sequence-preview.ts` — timeline calculation, contact resolution, scheduled dates
- Preview modal — demo customer, contact role (Admin/User/CSM), editable preview start date
- Shows enrollment identity (`contact_email::sequence_key`), per-step schedule, template status, conflict/cooling status
- Uses session send logs + customer fields; no enrollments or Action Queue items created
- Draft/archived sequences: metadata preview allowed with approval warning
- **Not wired:** enrollments, Action Queue, Automations, sends

### Phase 3 — Manual enrollment registry ✅

- `lib/email-sequence-enrollments-storage.ts` — localStorage key `onboarding-control-sequence-enrollments`
- `lib/email-sequence-enrollment.ts` — create enrollment, duplicate prevention, step scheduling
- **Enroll Contact** on approved sequences — modal with customer/role selection
- **Enrollments** tab — pause, resume, cancel, exit, preview, export JSON
- Duplicate block: one active/paused enrollment per `contact_email::sequence_key`
- **Not wired:** Automations, sends, auto step completion

### Phase 4 — Action Queue generation ✅

- `lib/email-sequence-queue.ts` — build queue rows from **active** enrollments (current step only)
- Merged into Action Queue via `buildEnrichedActionQueue` with contact, sequence, schedule, and conflict fields
- Action Queue UI — Source / Conflict filters, sequence columns, indigo row styling
- Send guard — internal only, approved, `due_now`, conflict-clear; customer-facing sequence rows disabled
- CSV exports include sequence + conflict columns; Communication Logs include sequence metadata on internal sends
- **Not wired:** auto step progression, Automations enrollment, customer-facing sends

### Phase 5 — Manual step progression ✅

- `lib/email-sequence-progression.ts` — mark complete, skip, advance, complete enrollment
- `CompletedStepRecord` history with status, source, notes
- Active Enrollments + Action Queue — Mark Step Complete, Skip Step, Complete Enrollment
- Optional prompt after internal dry run/live: mark step complete (still manual confirm)
- **Not wired:** auto-advance after send, Automations enrollment, customer-facing sends

### Phase 6 — Rule → sequence enrollment

- Optional `sequence_key` on automation rules
- Wire `resolveContactsForRuleEnrollment` on match

**Out of scope until product sign-off:** customer live sends, auto-send on `next_step_due_at`, cron workers.
