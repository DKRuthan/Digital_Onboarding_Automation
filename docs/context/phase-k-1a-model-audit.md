# Phase K-1A — Communication Logs Model Audit & K-1B Implementation Plan

> **Audit + plan document** for simulated Communication Logs.  
> **Status:** **K-1A** complete ✅ · **K-1B** complete ✅ · **K-1F** stable verification ✅.  
> **Prerequisite:** [Phase K Communication Ledger design](phase-k-communication-ledger.md) (K-0 ✅).

---

## 1. Current Communication Logs model

### Type / interface

| Item | Value |
|------|--------|
| **Primary type** | `SendLog` (`lib/types.ts`) |
| **UI label** | Communication Logs (`/send-logs`) |
| **Mode union** | `SendLogMode`: `demo` \| `test` \| `dry_run` \| `live` |
| **Status union** | `SendLogStatus`: `Delivered`, `Failed`, `Bounced`, `Queued`, `Test Sent`, `Previewed`, `Approved`, `Skipped`, `Dry Run Complete`, `Live Internal Alert Sent`, `Internal Send Failed` |

### Current `SendLog` fields

| Field | Type | Notes |
|-------|------|--------|
| `id` | `string` | e.g. `LOG-WF-{timestamp}-{random}` or `LOG-001` (demo) |
| `date` | `string` | ISO timestamp |
| `customer_name` | `string` | No `customer_id` on log row |
| `issue` | `string` | Trigger issue label |
| `action` | `string` | `recommended_action` snapshot |
| `recipient` | `string` | Email or internal routing label |
| `template` | `string` | Template **key** (not id) |
| `status` | `SendLogStatus` | Includes workflow echoes (`Previewed`, `Approved`) |
| `note` | `string` | Free text |
| `error` | `string` | Error message |
| `send_mode?` | `SendLogMode \| ""` | Often empty for workflow-only rows |
| `enrollment_id?` | `string` | Sequence enrollment |
| `contact_email?` | `string` | Contact-first identity |
| `contact_role?` | `RecipientType \| string` | |
| `sequence_key?` | `string` | |
| `sequence_name?` | `string` | |
| `sequence_step_number?` | `number` | |
| `sequence_step_name?` | `string` | |
| `conflict_status?` | `QueueConflictStatus \| ""` | |
| `conflict_reason?` | `string` | |

**Missing vs K-1 target:** `simulated_send_at`, `recipient_type`, `customer_id`, `account_owner`, `source_type`, `trigger_id`, `trigger_name`, `sequence_step_id`, `template_id`, `subject`, `delivery_status`, `provider`, `provider_message_id`, `action_queue_item_id`, `workflow_status_at_send`, `created_by_mode`.

### Storage

| Layer | Behavior |
|-------|----------|
| **React state** | `useState<SendLog[]>(demoSendLogs)` in `CustomerDataProvider` |
| **localStorage** | **Not persisted** (unlike rules, templates, sequences, enrollments) |
| **Server / DB** | **None** |
| **Session lifetime** | In-memory for browser tab; **resets on refresh** except demo seed re-init |

UI note on `/send-logs`: *"Session-only logs: new test, dry-run, and live entries reset on page refresh."*

`restoreDemoData()` resets `sendLogs` to `lib/mock-data.ts` seed array.

### Where seed / demo logs are created

- **`lib/mock-data.ts`** — `export const sendLogs: SendLog[]` (6+ rows)
- Status `Delivered` / `Failed` with `send_mode: "demo"` and note *"Demo seed data — no real email was sent."*
- Loaded on provider mount and on demo restore

### Where logs are added today

| Path | Function | Trigger | Typical status / mode |
|------|----------|---------|---------------------|
| Workflow status change | `updateWorkflowStatus` → `addWorkflowLog` | Previewed, Approved, Skipped, Test Sent | `Previewed`, `Approved`, `Skipped`, `Test Sent` |
| Internal SendGrid path | `logInternalSend` → `addWorkflowLog` | After `POST /api/send-approved-internal` | `Dry Run Complete` / `Live Internal Alert Sent` / `Internal Send Failed`; `dry_run` / `live` |
| Direct helper | `addWorkflowLog` | Exported on context; not called from UI directly | — |

`addWorkflowLog` prepends a row to `sendLogs` with generated id `LOG-WF-{Date.now()}-…`.

**No path today** creates customer-facing “would have sent” ledger rows.

### Communication Logs page rendering

- **Route:** `app/(dashboard)/send-logs/page.tsx` → `SendLogsPageContent`
- **Data:** `useCustomerData().sendLogs`
- **Display helpers:** `lib/communication-log-display.ts` (`displayLogContactEmail`, `displayLogSource`, `displayLogSequenceStep`, search)
- **Columns:** Time, Recipient/Contact Email, Role, Customer/Account, Source, Template, Sequence/Step, Status, Mode
- **Export:** `exportSendLogsCsv` from `lib/session-export.ts`
- **customer_id:** Derived at render time via `customerIdByName` map (not stored on log)

### How Reports read logs

- **`buildReportsSnapshot`** (`lib/reports-snapshot.ts`) takes `sendLogs` from provider
- **`buildCommunicationReport`:** `totalLogs`, `bySource` (`displayLogSource`), `byStatus`, `bySendMode`, contact resolved/unresolved counts
- **Executive overview:** `totalCommunicationLogs: input.sendLogs.length`
- **Contact journey / tags:** `sendLogs` passed into `computeContactTags` for cooling
- **UI:** `components/reports/communication-report-section.tsx` — stat cards + three breakdown panels
- **No simulated vs actual split** today; demo `Delivered` rows count in `byStatus`

---

## 2. Current Action Queue send flow

### Approval flow

1. User selects rows in `ActionQueueTable`
2. **Mark Reviewed** → `updateWorkflowStatus(ids, "Previewed")` — blocked items rejected; creates log with status `Previewed`
3. Optional **Send Test** via `EmailPreviewModal` → `POST /api/send-test-email` → `Test Sent` workflow + log
4. **Approve Selected** requires status `Previewed` or `Test Sent` → `Approved` + log
5. Workflow overrides stored in `workflowStatuses: Record<string, ActionWorkflowStatus>` (session memory, not localStorage)

### “Send via SendGrid” flow (internal only)

1. Button enabled when: `canSendInternal`, all selected `Approved`, `canSendInternalAction` for every row, `due_now`, conflict clear
2. **`canSendInternalAction`** rejects customer-facing and sequence email-channel items (`isSequenceCustomerFacingItem`)
3. Opens `InternalSendConfirmModal` → user confirms
4. **`handleConfirmInternalSend`** loops `sendableItems`, calls `requestInternalSend` → `POST /api/send-approved-internal`
5. On success: `logInternalSend` + `updateWorkflowStatus` → `Dry Run Complete` or `Live Internal Alert Sent`
6. Optional sequence step complete prompt (manual)

### When send gates are off

| Gate | Effect |
|------|--------|
| `INTERNAL_SEND_API_ENABLED=false` | API returns **403**; modal shows disabled state; confirm button disabled |
| Missing SendGrid env | API **400** after gate passes |
| `AUTH_ENABLED=true` | Requires session + `send_internal_alert` permission |
| UI | `Send via SendGrid` disabled for customer-facing selections with tooltip *"Customer emails are not enabled yet…"* |

Dry-run still hits the API when gate is on (SendGrid not called server-side when `SENDGRID_INTERNAL_SEND_MODE=dry_run`).

### Selected queue item availability

- `selected: Set<string>` in `ActionQueueTable`
- `selectedItems = items.filter(i => selected.has(i.id))`
- Full `ActionQueueItem` available including: `id`, `customer_id`, `customer_name`, `owner`, `rule_id`, `source`, `contact_email`, `recipient`, `recipient_type`, `template`, `template_key`, `sequence_*`, `workflow_status`, `schedule_status`, `conflict_*`, `channel`, `enrollment_id`

### Metadata sufficient for simulated logs?

**Yes, with small gaps:**

| Available on queue item | K-1 use |
|-------------------------|---------|
| `id` | `action_queue_item_id` |
| `customer_id`, `customer_name`, `owner` | account context |
| `contact_email`, `recipient_type`, `recipient` | recipient resolution |
| `rule_id`, `source` | trigger / sequence linkage |
| `template` / `template_key` | template key; resolve `template_id` via `emailTemplates` |
| `sequence_key`, `sequence_step_id`, `sequence_name`, `sequence_step_name` | sequence fields |
| `scheduled_for` | `simulated_send_at` |
| `workflow_status` | `workflow_status_at_send` |

**Resolve at create time (not on row):** `subject` via `resolveActionEmailPreview`; `trigger_name` via `automationRules.find(r => r.id === item.rule_id)`; `template_id` via library template `id`.

---

## 3. Target field mapping (K-1)

| Target K-1 field | Existing source | Gap / K-1B action |
|------------------|-----------------|-------------------|
| `id` | `SendLog.id` | Keep generator; prefix e.g. `LOG-SIM-` optional |
| `logged_at` | `SendLog.date` | Set `new Date().toISOString()` on create |
| `simulated_send_at` | `ActionQueueItem.scheduled_for` | **New optional field** on `SendLog` |
| `recipient_email` | `contact_email` or `recipient` if email | Map in helper; store in `recipient` + `contact_email` |
| `recipient_type` | `ActionQueueItem.recipient_type` | **New optional field** on `SendLog` |
| `contact_email` | `ActionQueueItem.contact_email` | Already optional on `SendLog` |
| `contact_role` | `ActionQueueItem.recipient_type` | Use `contact_role` (existing) |
| `customer_id` | `ActionQueueItem.customer_id` | **New optional field** on `SendLog` |
| `customer_name` | `ActionQueueItem.customer_name` | Existing |
| `account_owner` | `ActionQueueItem.owner` | **New optional field** (or reuse note) |
| `source` | `issue` + `action` / `displayLogSource` | Populate `issue`, `action` as today |
| `source_type` | `ActionQueueItem.source` (`rule` \| `sequence_enrollment`) | **New optional field** |
| `trigger_id` | `ActionQueueItem.rule_id` | **New optional field** |
| `trigger_name` | `automationRules.find(r => r.id === rule_id)?.name` or sequence name | **New optional field**; sequence rows use `sequence_name` |
| `sequence_id` | `sequence_key` | Map to existing `sequence_key` |
| `sequence_name` | `sequence_name` | Existing |
| `sequence_step_id` | `sequence_step_id` | **New optional field** |
| `template_id` | `EmailTemplate.id` from key lookup | **New optional field** |
| `template_name` | `template` key | Existing `template` field |
| `subject` | `resolveActionEmailPreview(...).subject` | **New optional field** |
| `status` | — | **New enum value:** `Simulated Sent` |
| `send_mode` | — | Use **`logged_only`** (new mode) or **`dry_run`**; recommend `logged_only` to distinguish from internal dry run |
| `delivery_status` | — | **New optional field;** value `Not Sent` |
| `provider` | — | **New optional field;** value `none` |
| `provider_message_id` | — | Leave empty in K-1 |
| `action_queue_item_id` | `ActionQueueItem.id` | **New optional field** (required for idempotency) |
| `workflow_status_at_send` | `workflow_status` at click time | **New optional field** |
| `reason` | — | `note`: *"Simulated log — no email was sent."* |
| `created_by_mode` | — | **New optional field;** `operator_simulation` |

**Type extensions (K-1B):** extend `SendLogStatus`, `SendLogMode`, and `SendLog` interface in `lib/types.ts` — no rename to `CommunicationLog` in K-1B (minimize churn).

---

## 4. Duplicate prevention design

### Preferred idempotency key

```
(action_queue_item_id, template_id | template_key, recipient_email, send_mode)
```

Normalized:

```ts
function simulatedLogIdempotencyKey(log: Pick<SendLog, ...>): string {
  const templatePart = log.template_id?.trim() || log.template?.trim() || "";
  const recipient = (log.contact_email || log.recipient).trim().toLowerCase();
  const mode = log.send_mode || "logged_only";
  return `${log.action_queue_item_id}|${templatePart}|${recipient}|${mode}`;
}
```

### Lookup rule

Before insert, scan `sendLogs` for existing row where:

- `action_queue_item_id` matches
- `template` or `template_id` matches
- `contact_email` or `recipient` matches (case-insensitive)
- `send_mode` is `logged_only` (or `dry_run` if reused)
- `status` is `Simulated Sent`

Return `{ created: false, existingId }` and surface toast: *"Simulated log already exists for this action."*

### Fallback (pre-migration rows)

If `action_queue_item_id` absent on old rows, fall back to:

```
(template, recipient, status=Simulated Sent, same calendar day)
```

Only for duplicate check safety — new rows must always set `action_queue_item_id`.

---

## 5. K-1B implementation plan (file list)

### New files

| File | Purpose |
|------|---------|
| `lib/communication-logs/simulated-log.ts` | `canCreateSimulatedLog`, `buildSimulatedLogFromQueueItem`, `findDuplicateSimulatedLog`, `SIMULATED_LOG_NOTE` |
| `lib/communication-logs/simulated-log-eligibility.ts` | Mirror approval guards: Approved, due_now, conflict clear, customer-facing, contact resolved |
| `scripts/verify-simulated-communication-logs.ts` | Idempotency, field population, report counts, no SendGrid imports |

### Modified files

| File | Change |
|------|--------|
| `lib/types.ts` | Add `Simulated Sent` status; `logged_only` mode; optional K-1 fields on `SendLog` |
| `components/providers/customer-data-provider.tsx` | `createSimulatedLogs(actionIds)` → append logs, no API |
| `components/action-queue/action-queue-table.tsx` | New button **Create Simulated Log** (separate from Send via SendGrid); confirm toast |
| `components/action-queue/simulated-log-confirm-modal.tsx` | *(optional)* Small confirm modal listing items + subject preview — or inline confirm for MVP |
| `components/send-logs/send-logs-page-content.tsx` | Show `subject`, `provider` if present; badge for `Simulated Sent` |
| `components/ui/badge.tsx` | `logStatusVariant` / `sendLogModeLabel` for new values |
| `lib/communication-log-display.ts` | `displayLogProvider`; treat `Simulated Sent` in source display if needed |
| `lib/reports-snapshot.ts` | Add `simulatedSentCount`, `actualSentCount` (exclude `demo` + `Simulated Sent` from actual) |
| `components/reports/communication-report-section.tsx` | Stat cards for simulated vs actual |
| `lib/audit/ui-audit-events.ts` | Add `communication_log.simulated_create` → `approve_queue_actions` |
| `lib/session-export.ts` | Include new columns in Communication Logs CSV export |

### Explicitly not changed in K-1B

- `app/api/send-approved-internal/route.ts` — no new send routes
- `lib/sendgrid-*` — no imports from simulated path
- Action Queue approval semantics — unchanged
- Sequence progression auto-advance — unchanged

---

## 6. Safety checks (K-1B must)

| Rule | How enforced |
|------|----------------|
| No SendGrid call | Client-only `createSimulatedLogs`; no `fetch` to send APIs |
| No email provider | No new `/api/*` send route |
| No customer live send | Status `Simulated Sent`, not `Sent` / `Delivered` |
| SendGrid gates unchanged | Do not touch env gates |
| Safe labels | `status: Simulated Sent`, `send_mode: logged_only`, `delivery_status: Not Sent`, `provider: none` |
| Auth/RBAC | Gate button with `approve_queue_actions`; audit via allowlist |
| Audit metadata | `action_queue_item_id`, `template_id`, `contact_email` hash optional — **no subject body, no secrets** |

---

## 7. K-1B smallest safe scope

1. **Eligibility helper** — customer-facing approved items only (`!canSendInternalAction` path OR `isSequenceCustomerFacingItem` OR customer recipient email)
2. **Single new Action Queue button** — *Create Simulated Log* (disabled when internal-only selection or not Approved/due/conflict-clear)
3. **Provider method** — build + dedupe + prepend logs
4. **Communication Logs UI** — new status/mode badges
5. **Reports** — `simulatedSentCount` + show in Communication section
6. **Verification script** — pure unit tests on helpers
7. **Toast** — *"Simulated logs created. No email was sent."* (or partial skip message if duplicates)

**Out of scope K-1B:** localStorage persistence, workflow status change after simulate, sequence auto-complete, new API route, SendGrid, K-2 webhooks.

---

## 8. Risks / blockers

| Risk | Mitigation |
|------|------------|
| Demo seed uses `Delivered` + `demo` | Reports must bucket `send_mode === "demo"` separately from simulated and actual |
| `SendLog` overload | Add optional fields only; don't break existing `addWorkflowLog` |
| Session-only logs lost on refresh | Document; Phase I persistence later |
| `template` is key not id | Store both; idempotency uses `template_id ?? template` |
| Sequence `rule_id` is `sequence:{key}` | `trigger_name` = sequence name for sequence rows |
| No permission for “simulate” | Reuse `approve_queue_actions` in K-1B |
| Workflow logs vs ledger rows | Simulated rows are distinct from `Approved` workflow echo logs — consider skipping duplicate `Approved` log when simulating (optional polish) |
| Internal dry_run mode collision | Use `logged_only` send_mode for customer simulation |

---

## 9. Recommended K-1B implementation prompt outline

```
Implement Phase K-1B: Simulated Communication Logs per docs/context/phase-k-1a-model-audit.md

1. Extend SendLog types (Simulated Sent, logged_only, optional K-1 fields).
2. Add lib/communication-logs/simulated-log.ts + eligibility helper.
3. Add createSimulatedLogs to CustomerDataProvider (client-only, idempotent).
4. Add "Create Simulated Log" button to Action Queue (approve_queue_actions gate).
5. Update Communication Logs table badges/columns for simulated rows.
6. Update buildCommunicationReport with simulatedSentCount / actualSentCount.
7. Add communication_log.simulated_create to UI audit allowlist.
8. Add scripts/verify-simulated-communication-logs.ts.
9. Do NOT add API routes, SendGrid calls, or change internal send flow.
10. Toast: "Simulated logs created. No email was sent."
```

---

## Related

- [Phase K Communication Ledger](phase-k-communication-ledger.md)
- [Product context — Communication Logs §8a](product.md)
