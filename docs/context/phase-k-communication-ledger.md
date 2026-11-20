# Phase K — Communication Ledger / Simulated Send Logs

> **Approved design document** for simulated communication logs and later SendGrid event tracking.  
> **Status:** **K-0** documentation context ✅ · **K-1A** model audit ✅ · **K-1B** implementation ✅ · **K-1F** stable verification ✅ · **K-2** pending · **K-2F** pending.  
> **Prerequisite:** Phase **J** auth/RBAC/audit foundation (J-0–J-6F ✅; J-7 pending). Customer-facing live sends remain **out of scope** until explicit approval after K-2.

---

## 1. Feature purpose

We want to **import real customer, contact, and action data** and exercise the full journey control plane — triggers, sequences, templates, timing, cooling, Action Queue review — **without real emails going out yet**.

Phase K introduces a **Communication Ledger**: durable **Communication Log** entries that record **what would have happened** when an approved action is eligible to send. These logs let operators validate:

- Business logic (right trigger, right contact, right template)
- Targeting and recipient resolution
- Template choice and subject/body rendering
- Frequency, cooling, and conflict rules
- Reporting and exports before any provider is connected

### Guiding principle

> **Action Queue decides what should happen.**  
> **Communication Logs record what happened or what would have happened.**  
> **Reports summarize Communication Logs.**  
> **SendGrid updates Communication Logs later.**

Nothing in Phase K-1 bypasses human review or implies delivery. K-1 is a **dry-run ledger**, not a send pipeline.

### What Phase K is not (K-0 / K-1)

- **Not** customer-facing live sending
- **Not** automatic or background sending
- **Not** SendGrid API calls or webhook ingestion (K-2)
- **Not** a replacement for Phase **I** persistence (logs may start in session/localStorage and migrate later)

---

## 2. Required terminology

Simulated communication must **never** be labeled as plain **“Sent”** or wording that implies a real email was delivered.

### Safe labels (use these)

| Label | When to use |
|-------|-------------|
| **Simulated Sent** | Primary status for K-1 ledger rows that represent a would-have-sent event |
| **Dry Run** | `send_mode` or UI badge when no provider was invoked |
| **Logged Only** | Emphasis that the row is audit/ledger only |
| **Not Sent** | Explicit negative — no provider call, no delivery |
| **Provider: None** | `provider` field for K-1 rows |

### Avoid

| Label | Why |
|-------|-----|
| **Sent** (alone) | Implies real delivery |
| **Delivered** | Reserved for provider-confirmed delivery (K-2+) |
| **Emailed**, **Mailed**, **Dispatched** | Suggests outbound delivery |

Existing MVP statuses like **Dry Run Complete** (internal alerts) and **Test Sent** (test inbox) remain valid for their paths. K-1 adds **Simulated Sent** for customer-facing template actions that are approved but not actually sent.

---

## 3. Safety rules

These rules apply to **K-1** and must not be relaxed without an explicit later phase and operational approval.

| Rule | K-1 requirement |
|------|-----------------|
| **No real email** | No message leaves the app to a customer or contact inbox |
| **No SendGrid call** | No `POST` to SendGrid mail send API in K-1 |
| **No customer live send route** | Do not add `POST /api/send-customer-email` or equivalent |
| **No automatic sending** | No cron, background worker, or queue consumer that sends |
| **Auth / RBAC / audit** | Existing Phase J guards stay intact; new write paths require permission + audit where appropriate |
| **SendGrid gates** | `INTERNAL_SEND_API_ENABLED`, `SENDGRID_TEST_SEND_ENABLED`, and `SENDGRID_INTERNAL_SEND_MODE` behavior **unchanged** unless explicitly enabled for unrelated internal/test paths |
| **Clear simulation marking** | Every K-1 row: `status` = Simulated Sent (or Not Sent if blocked), `send_mode` = dry_run / logged_only, `provider` = None |

Internal alert dry-run and test-send paths from earlier phases are **unchanged** by K-1. K-1 adds **simulated customer-facing ledger rows** only.

---

## 4. Communication Log target fields

K-1 implementation should converge on a single **Communication Log** shape. Use existing app naming where equivalent fields already exist (see `SendLog` in `lib/types.ts`).

### Target field list

| Field | Purpose | Existing equivalent (if any) |
|-------|---------|------------------------------|
| `id` | Stable row id | `SendLog.id` |
| `logged_at` | When the ledger row was created | `SendLog.date` |
| `simulated_send_at` | When the send *would* have occurred (schedule/due time) | — |
| `recipient_email` | Resolved delivery target | `SendLog.recipient` |
| `recipient_type` | Admin / User / CSM / internal | `ActionQueueItem.recipient_type` |
| `contact_email` | Primary contact identity | `SendLog.contact_email` |
| `contact_role` | Contact role label | `SendLog.contact_role` |
| `customer_id` | Account context | `ActionQueueItem.customer_id` |
| `customer_name` | Account display name | `SendLog.customer_name` |
| `account_owner` | DAM / owner name | `ActionQueueItem.owner` |
| `source` | Human-readable source | `SendLog.issue` / `action` (display via `displayLogSource`) |
| `source_type` | `rule` \| `sequence_enrollment` \| `manual` \| `test` \| `internal_alert` | `ActionQueueItem.source` |
| `trigger_id` | Activity trigger rule id | — |
| `trigger_name` | Trigger display name | — |
| `sequence_id` | Sequence id / key | `SendLog.sequence_key` |
| `sequence_name` | Sequence display name | `SendLog.sequence_name` |
| `sequence_step_id` | Step identifier | — |
| `template_id` | Template id | — |
| `template_name` | Template name / key | `SendLog.template` |
| `subject` | Rendered subject line | — |
| `status` | Simulated Sent, Not Sent, Delivered, etc. | `SendLog.status` |
| `send_mode` | demo \| test \| dry_run \| live \| logged_only | `SendLog.send_mode` |
| `delivery_status` | Provider delivery state (K-2+) | — |
| `provider` | `none` \| `sendgrid` | — |
| `provider_message_id` | SendGrid message id (K-2+) | — |
| `action_queue_item_id` | Link to originating queue row | — |
| `workflow_status_at_send` | Queue workflow status when logged | — |
| `reason` | Skip/block/simulation reason | `SendLog.note` |
| `created_by_mode` | `operator_approval` \| `system_simulation` \| etc. | — |

**Contact-first:** `contact_email` is the primary operational identity; account fields are context only (see [product context §4](product.md#4-account-vs-contact-model)).

---

## 5. K-1 — Simulated Communication Logs / Dry-Run Send Ledger

**K-1: Simulated Communication Logs / Dry-Run Send Ledger**

### Expected behavior

1. Operator approves an **eligible** Action Queue item (customer email action or sequence step — per existing workflow rules).
2. Operator triggers **“Create simulated log”** (or equivalent approved action) — **not** “Send email”.
3. App creates one or more **Communication Log** rows with:
   - `status`: **Simulated Sent**
   - `send_mode`: **dry_run** or **logged_only**
   - `provider`: **None**
   - `delivery_status`: **Not Sent**
4. **No email provider** is called.
5. Rows appear **immediately** on **Communication Logs** (`/send-logs`).
6. **Reports** (`buildReportsSnapshot` / Communication section) update from those rows.
7. **Duplicate prevention:** Do not create a second simulated log for the same `(action_queue_item_id, template_id, recipient_email, send_mode)` tuple when an equivalent row already exists.
8. **UI confirmation:** *“Simulated logs created. No email was sent.”*

### Idempotency key (recommended)

```
(action_queue_item_id, template_id, recipient_email, send_mode)
```

### K-1B implemented (client-side ledger)

- **Create Simulated Logs** on Action Queue (separate from Send via SendGrid)
- Provider method `createSimulatedCommunicationLogs` — no API/SendGrid calls
- Duplicate prevention via `idempotency_key`
- Communication Logs + Reports show simulated vs actual counts
- UI audit: `send.simulated_log.created`
- **K-1F:** stable verification pass ✅ (lint, build, 14 verify scripts, browser E2E, API safety, reports/export/audit checks)
- **Next:** **K-2** SendGrid Event Webhook ingestion

### Out of scope for K-1

- SendGrid mail send
- Webhook ingestion
- Changing Action Queue approval workflow semantics
- Auto-creating logs without an explicit operator action (unless a separate sub-phase is approved)

---

## 6. Reports direction

Reports must **separate simulated from real** delivery states. The Communication report section (and Executive Overview rollups) should expose:

### Status buckets

| Bucket | Meaning |
|--------|---------|
| **Simulated Sent** | K-1 ledger rows — no provider call |
| **Actually Sent** | Provider accepted the send (K-2+ / live enablement) |
| **Delivered** | Provider confirmed delivery |
| **Opened** | Open event (pixel-based; see §8) |
| **Clicked** | Click event (tracked link) |
| **Bounced** | Hard/soft bounce |
| **Failed** | Send or processing failure |
| **Not Sent** | Blocked, skipped, or logged-only without send attempt |

### Aggregate dimensions

- Total communication logs
- Simulated sent count
- Actual sent count
- By **source** (trigger, sequence, test, internal alert, manual)
- By **template**
- By **customer / account** (rollup; contact-first detail)
- By **status**
- By **send_mode**

Existing `lib/reports-snapshot.ts` Communication section should gain simulated vs actual breakdowns in K-1 without double-counting demo seed logs as real sends.

---

## 7. K-2 — SendGrid Event Webhook Tracking

**K-2: SendGrid Event Webhook Tracking**

When **real sending** is enabled later (explicit approval only), each real outbound email should:

1. Create or update a **Communication Log** row at send time with `provider: sendgrid` and `provider_message_id`.
2. Receive **SendGrid event webhook** updates that mutate `delivery_status` and related fields on that row.

### Planned SendGrid events

| Event | Typical `delivery_status` impact |
|-------|----------------------------------|
| `processed` | Accepted by SendGrid |
| `delivered` | Delivered |
| `open` | Opened |
| `click` | Clicked |
| `bounce` | Bounced |
| `dropped` | Dropped / not sent |
| `deferred` | Deferred |
| `spam_report` | Spam complaint |
| `unsubscribe` | Unsubscribed |

### SendGrid custom args (planned)

Attach stable ids on outbound mail for webhook correlation:

- `communication_log_id`
- `customer_id`
- `contact_email` (or opaque contact id if email must not appear in provider metadata)
- `template_id`
- `sequence_step_id`
- `action_queue_item_id`

Webhook handler must verify signatures, be idempotent, and never log secrets or full bodies in audit metadata.

**K-2 does not enable customer sends by itself** — it only tracks events for sends that are explicitly enabled in a later phase.

---

## 8. Open / click tracking caveat

| Signal | Reliability | Notes |
|--------|-------------|-------|
| **Open** | Useful but imperfect | Depends on tracking pixel/image load; blocked by some clients, plain-text-only, and privacy features |
| **Click** | Stronger | Based on tracked links; user must click a wrapped URL |

Reports and UI should treat opens as **directional engagement**, not proof of read receipt. Clicks are stronger evidence of intent.

---

## 9. Audit relationship

| Topic | Direction |
|-------|-----------|
| **K-1 audit events** | May log `communication_log.simulated_created` (or equivalent) when simulated rows are created |
| **Metadata safety** | No full email bodies, no full SendGrid payloads, no API secrets, no raw internal routing emails in audit metadata |
| **UI-origin audit** | Remains **non-authoritative** until Phase **I** persistence — same rule as Phase J |
| **Authoritative ledger** | Communication Log row is the product source of truth for “what would have / did happen”; audit is operator accountability |

Use existing helpers: `lib/audit/safe-audit-metadata.ts`, `lib/audit/ui-audit-events.ts`.

---

## 10. Phase sequence (roadmap)

| Phase | Name | Status |
|-------|------|--------|
| **K-0** | Documentation context (this file) | ✅ Complete |
| **K-1A** | Model audit + implementation plan | ✅ Complete — [K-1A audit](phase-k-1a-model-audit.md) |
| **K-1B** | Simulated Communication Logs / Dry-Run Send Ledger (implementation) | ✅ Complete |
| **K-1F** | Stable verification (lint, build, idempotency, report snapshot scripts, browser E2E) | ✅ Complete |
| **K-2** | SendGrid Event Webhook ingestion | Pending |
| **K-2F** | SendGrid reporting verification | Pending |
| **Later** | Real customer send enablement | Only after explicit operational approval, compliance review, and K-2 tracking in place |

### Dependency graph

```
J (auth/RBAC/audit) ──► K-0 (docs) ──► K-1 (simulated ledger) ──► K-1F
                                                              └──► K-2 (webhooks) ──► K-2F
                                                                        └──► Later: live customer sends
```

Phase **I** (persistence) may proceed in parallel; K-1 can start on session/localStorage with a migration path to durable storage.

---

## 11. Relationship to other phases

| Phase | Relationship |
|-------|----------------|
| **F-2B** | Env-gated send routes remain kill switches; K-1 does not bypass them |
| **J** | Simulated log creation requires auth/RBAC when `AUTH_ENABLED=true` |
| **I** | Durable Communication Logs and webhook idempotency store |
| **Prior “K” in J docs** | Customer email *pipeline* (compliance, unsubscribe) is **after** K-2; renamed/clarified here as **Later** enablement |

---

## Related documentation

- [Product context](product.md) — contact-first model, Communication Logs role (§8a), roadmap
- [Phase J auth architecture](phase-j-auth-architecture.md) — session, RBAC, audit
- [Phase F-2B API security](phase-f2b-api-security.md) — send route env gates
