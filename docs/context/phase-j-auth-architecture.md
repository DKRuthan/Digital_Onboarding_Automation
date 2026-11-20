# Phase J — Authentication, Authorization, RBAC & Audit Architecture

> **Approved design document** for production identity and access control before enabling real send behavior on non-demo URLs.  
> **Status:** **J-0** complete ✅ · **J-1** complete ✅ · **J-2B** complete ✅ · **J-3** complete ✅ · **J-4** complete ✅ · **J-5B** complete ✅ · **J-5C** complete ✅ · **J-5D** complete ✅ · **J-6B** complete ✅ · **J-6C** complete ✅ · **J-6D** complete ✅ · **J-6E** complete ✅ · **J-6F** complete ✅ · **J-7** pending.  
> **Provider:** **Clerk** (selected J-2A; implemented J-2B).

---

## 1. Purpose

Phase **J** introduces a **production-safe identity model** so operators are known, authorized, and auditable before any live send behavior is enabled on a public or shared URL.

Phase J delivers:

| Capability | Description |
|------------|-------------|
| **Server-side session auth** | HttpOnly session cookies; identity resolved on the server for every protected request |
| **Protected dashboard routes** | All app pages require sign-in |
| **Protected API routes** | Sensitive `/api/*` handlers require session + permission checks |
| **RBAC permissions** | Role-based permission map for operators (Admin, Operator, Viewer, optional Dev/Internal Admin) |
| **Audit logging** | Append-only durable log of sensitive actions (required before live sends) |
| **Production-safe identity** | Caller identity on send, approve, upload, and export actions |

### What Phase J is not

- **Phase J is not customer live sending.** No route to `admin_email` or `user_email` is in scope.
- **Customer email pipeline** (compliance, unsubscribe, consent, dedicated send routes) comes **after** auth, RBAC, and audit are in place — see **§11** (J-8+ / Phase K).

### Relationship to Phase F-2B

F-2B implemented **operational kill switches** (env-gated send routes, redacted public config). Those layers **remain** after Phase J:

- Env gates (`INTERNAL_SEND_API_ENABLED`, `SENDGRID_TEST_SEND_ENABLED`) stay as **defense-in-depth** — not a replacement for identity.
- Business guards (Approved, due_now, conflict-clear, internal-only recipient) stay **unchanged**.
- `dry_run` remains the **default** internal send mode until explicit operational approval for live.

---

## 2. Current state (as of J-1)

| Area | Status |
|------|--------|
| Auth packages (Clerk, Auth.js, Supabase, etc.) | **None** installed |
| Next.js middleware | **None** (`middleware.ts` does not exist) |
| User / session context | **None** |
| Protected pages or API routes | **None** — all dashboard pages and API routes are public |
| API caller identity | **None** — handlers do not read session or credentials |
| Operator RBAC | **None** — “role” in codebase means **contact role** (Admin/User/CSM), not operator permissions |
| Data persistence | **localStorage + in-memory session** for customers, queue, logs, rules, templates, sequences |
| F-2B env gates | **✅ Implemented** — send routes return 403 by default; config is redacted |

**Implication:** Any caller who can reach the deployment can use the full UI and call API routes when env gates are enabled. Phase J closes the **identity and authorization** gap; Phase I (persistence) can proceed in parallel or after auth foundation.

---

## 3. Auth provider decision

**Selected provider: Clerk** (J-2A decision, J-2B implementation).

| Factor | Notes |
|--------|-------|
| Implementation speed | Fastest path for Next.js App Router on Vercel |
| Operator SSO | Google / Microsoft / SAML for internal team sign-in |
| Vercel fit | Native Marketplace integration |
| RBAC start | Organization roles via metadata; migrate to DB membership in J-6 |

**Alternatives deferred:** Auth.js or Supabase Auth if Phase I Postgres starts immediately in the same sprint.

### J-2B foundation (implemented)

| Item | Status |
|------|--------|
| `@clerk/nextjs` installed | ✅ |
| `AUTH_ENABLED=false` default | ✅ — demo unchanged without Clerk keys |
| `lib/auth/session.ts` helpers | ✅ |
| `lib/auth/permissions.ts` placeholder | ✅ — enforcement in J-5 |
| Conditional `ClerkProvider` | ✅ |
| `/sign-in`, `/sign-up` routes | ✅ |
| `middleware.ts` skeleton | ✅ — pass-through when disabled |
| Dashboard page protection | ✅ **J-3** — `auth.protect()` on dashboard routes when auth active |
| API route protection | ✅ **J-4** — session check in route handlers when auth active |
| RBAC enforcement | ✅ **J-5B** — API permission checks; ✅ **J-5C** — UI action gating |
| Audit logs | **J-6B** foundation ✅ · API **J-6C** ✅ · UI ingestion **J-6D** ✅ · read/export **J-6E** ✅ · stable verification **J-6F** ✅ |
| SendGrid env gates | **Unchanged** — default off |

### J-3 dashboard protection (implemented)

When `AUTH_ENABLED=true` and Clerk keys are configured, unauthenticated users opening any dashboard route are redirected to `/sign-in`:

- `/`, `/customers`, `/email-library`, `/sequences`, `/automations`, `/action-queue`, `/send-logs`, `/reports`

Public routes (never protected in J-3): `/sign-in`, `/sign-up`.

When `AUTH_ENABLED=false`, all dashboard pages remain open with no redirect (demo/local mode unchanged).

### J-4 API protection (implemented)

When `AUTH_ENABLED=true` and Clerk keys exist, unauthenticated API requests return **401** `{ "success": false, "error": "Unauthorized" }`:

- `GET /api/internal-send-config`
- `POST /api/send-approved-internal`
- `POST /api/send-test-email`

When `AUTH_ENABLED=false`, API routes remain open (demo mode). Send routes still use F-2B env gates after any session check.

**Guard order (send routes, auth enabled):** session → 401 · permission → 403 Forbidden · env gate → 403 (gate message) · business validation → 400 · execute (SendGrid unchanged).

RBAC **J-5B** implemented: role from Clerk `publicMetadata.role`; missing/invalid → **Viewer**. UI action buttons gated in **J-5C** (`PermissionsProvider`, `useCan()`). Audit logs **J-6**. Helpers: `lib/auth/api-auth.ts` (`requireApiPermission()`), `lib/auth/operator-context.ts` (`getEffectivePermissionsForSession()`), `lib/auth/permission-ui.ts` (`permissionDeniedTitle()`).

### J-5B API RBAC (implemented)

| Route | Permission |
|-------|------------|
| `GET /api/internal-send-config` | `view_dashboard` |
| `POST /api/send-approved-internal` | `send_internal_alert` |
| `POST /api/send-test-email` | `send_test_email` |

**Role source:** Clerk `publicMetadata.role` (`Admin` \| `Operator` \| `Viewer` \| `Developer`). Missing/invalid → **Viewer**.

**Auth off:** `requireApiPermission()` skips checks; returns `DEFAULT_DEMO_PERMISSIONS` (operator-equivalent).

**UI gating:** ✅ **J-5C** — dashboard layout resolves permissions server-side; `DashboardShell` wraps `PermissionsProvider`. When `AUTH_ENABLED=false`, demo/operator permissions apply and no UI actions are blocked. When auth is on, restricted buttons are `disabled` with `title` tooltips (e.g. `Requires upload_customer_data permission`). **UI gating is not a substitute for server enforcement** on API routes (J-5B) or for securing localStorage-only mutations until persistence + audit (J-6).

### J-5C UI permission gating (implemented)

| Surface | Permission(s) |
|---------|----------------|
| Customer Data upload/validate/apply/demo/refresh queue | `upload_customer_data` |
| Account/contact CSV exports | `export_reports` |
| Activity Triggers — Add | `create_triggers` |
| Activity Triggers — edit/duplicate/enable/disable/reset/test | `edit_triggers` |
| Activity Triggers — JSON export | `export_reports` |
| Email Templates — edit/approve/duplicate/reset/create | `edit_templates` |
| Email Templates — Send Test | `send_test_email` |
| Email Sequences — enroll/progress/pause/edit/duplicate/reset | `manage_sequences` |
| Action Queue — approve/review/skip/reset/sequence step actions | `approve_queue_actions` |
| Action Queue — Send via SendGrid (+ confirm modal) | `send_internal_alert` |
| Action Queue / Reports CSV exports | `export_reports` |

Verify: `npx tsx scripts/verify-ui-permission-gating.ts`.

### J-5D RBAC verification pass (complete)

Verification covered permission matrix consistency, API guard order, UI gating coverage, F-2B safety gate preservation, verify scripts, and `AUTH_ENABLED=false` browser/API checks.

| Check | Result |
|-------|--------|
| Permission matrix (Admin/Developer/Operator/Viewer/demo) | ✅ Scripts + code inspection |
| API RBAC guard order on 3 routes | ✅ session → permission → env gate → validation |
| UI gating on scoped surfaces | ✅ Pass (one gap fixed: email preview modal Approve/Send Test) |
| F-2B env gates / customer sends disabled | ✅ Unchanged |
| `AUTH_ENABLED=false` browser test | ✅ Dashboard, mutations, exports usable |
| `AUTH_ENABLED=true` role browser test | ⏭ Not run — no Clerk keys in `.env.local` |

**J-5D fix:** `components/action-queue/email-preview-modal.tsx` — Approve and Send Test were not permission-gated (missed in J-5C).

**Accepted limitations (unchanged):** localStorage-only mutations are not server-enforced; opening email preview can still auto-set `Previewed` status via existing workflow logic (now audited as `queue.preview_opened`); demo permissions mirror Operator (Send Test UI disabled even when `AUTH_ENABLED=false`). UI-origin audit rows are **non-authoritative** until Phase I server persistence.

### J-6B audit foundation (implemented)

| Item | Status |
|------|--------|
| Persistence | Neon / Vercel Postgres (design) |
| Driver | `@neondatabase/serverless` |
| SQL schema | `db/migrations/001_create_audit_logs.sql` — **manual apply only** |
| Env | `AUDIT_ENABLED=false` (default), `DATABASE_URL`, `DEFAULT_WORKSPACE_ID`, `AUDIT_HASH_SALT` |
| Helpers | `lib/audit/audit-log.ts` (`writeAuditLog`, `writeSecurityAuditLog`), `safe-audit-metadata.ts` |
| App wiring | **J-6C** API routes ✅ · **J-6D** UI ingestion ✅ · **J-6E** read/export ✅ · **J-6F** stable verification ✅ |

Verify: `npx tsx scripts/verify-audit-schema.ts`, `npx tsx scripts/verify-audit-helpers.ts`, `npx tsx scripts/verify-api-audit-logging.ts`, `npx tsx scripts/verify-ui-audit-ingestion.ts`, `npx tsx scripts/verify-audit-read-export.ts`.

### J-6C server-side API audit (implemented)

| Route | Audit events |
|-------|----------------|
| `GET /api/internal-send-config` | `config.internal_send.read`; 401 → `auth.session.denied`; 403 → `auth.permission.denied` |
| `POST /api/send-approved-internal` | auth denials, `api.env_gate.blocked`, `api.validation.blocked`, `send.internal.attempt`, `send.internal.dry_run` / `send.internal.success` / `send.internal.error` |
| `POST /api/send-test-email` | auth denials, `api.env_gate.blocked`, `api.validation.blocked`, `send.test.attempt`, `send.test.success` / `send.test.error` |

**Behavior:** `AUDIT_ENABLED=false` (default) → audit helpers no-op; API responses unchanged. When enabled, writes are **non-blocking** (failures logged server-side only). Metadata passes through `safeAuditMetadata` — no API keys, secrets, full bodies, or raw routing emails.

**Guard order preserved:** session → permission → env gate → business validation → execute (attempt logged after validation passes on internal send).

**Next:** **J-7** production auth + Neon verification.

### J-6D protected UI-origin audit ingestion (implemented)

| Item | Detail |
|------|--------|
| Route | `POST /api/audit-events` — session + RBAC when auth enabled; demo mode when `AUTH_ENABLED=false` |
| Client | `lib/audit/client-audit.ts` — `recordClientAuditEvent()` (non-blocking fetch) |
| Allowlist | `lib/audit/ui-audit-events.ts` — high-value UI actions only |
| Identity | Server stamps `actor_user_id`, `actor_role`, `workspace_id`, `source: "ui"` — client must not send these |
| Metadata | `authoritative: false`, `origin: "client_ui"` on every UI row |
| Wired | Customer import, triggers, templates, sequences, action queue, exports, send button clicks |

Email Preview auto-`Previewed` side effect is audited (`queue.preview_opened`) but behavior unchanged. API send outcomes remain authoritative via J-6C routes.

### J-6E audit read/export foundation (implemented)

| Item | Detail |
|------|--------|
| Read helper | `lib/audit/audit-read.ts` — `listAuditLogs`, `exportAuditLogsCsv`, `isAuditReadConfigured` |
| API | `GET /api/audit-logs` (JSON) · `?format=csv` export |
| Permission | `view_audit_logs` (Admin/Developer; role matrix unchanged) |
| UI | Reports → **Audit Logs** section (status card + latest 100 rows) |
| Safe when off | `AUDIT_ENABLED=false` or missing `DATABASE_URL` → empty rows + message, no crash |

No full admin audit viewer yet — **J-7** real Clerk + Neon end-to-end.

### J-6F stable verification / freeze check (complete)

Verification-only pass after J-6B–J-6E. No feature changes, no deploy, no `.env.local` edits.

| Check | Result |
|-------|--------|
| `npm run lint` / `npm run build` | ✅ Pass |
| All verify scripts (audit, RBAC, API security, reports) | ✅ Pass |
| Route inventory (8 dashboard pages + 5 API routes; no `/api/send-customer-email`) | ✅ Confirmed |
| Demo mode smoke (`AUTH_ENABLED=false`) | ✅ All pages 200; banner “Operator auth: disabled (demo mode)” |
| API smoke (gates off, `AUDIT_ENABLED=false`) | ✅ Config 200 redacted · sends 403 · audit-events 200 no-op · audit-logs safe disabled/CSV header |
| Security defaults (`.env.example`) | ✅ `AUDIT_ENABLED=false`, send gates off, `dry_run` internal mode |
| DB-backed audit verification | ⏭ Not run — requires `DATABASE_URL`, applied schema, and `AUDIT_ENABLED=true` |

**Decision:** stable for demo / audit-disabled operation. **Next:** **J-7** real Clerk + Neon verification.

Middleware remains focused on dashboard page protection (J-3); API checks are in route handlers. The middleware matcher excludes `/api/*` so Clerk edge middleware does not run on API routes.

### Preferred fast MVP — Clerk (historical J-1 draft)

| Factor | Notes |
|--------|-------|
| Implementation speed | Fastest path for Next.js App Router on Vercel |
| Operator SSO | Google / Microsoft / SAML for internal team sign-in |
| Vercel fit | Native Marketplace integration |
| RBAC start | Organization roles via metadata; migrate to DB membership in J-6 |

**Choose Clerk when:** priority is shipping protected preview/internal deploys quickly with operator SSO.

### Alternative — Auth.js or Supabase Auth

| Factor | Notes |
|--------|-------|
| Auth.js (NextAuth v5) | Flexible; custom session; pairs cleanly with Postgres adapter |
| Supabase Auth | Auth + Postgres in one stack if Phase I uses Supabase/Neon |
| Fit | Better when **database persistence is implemented immediately** alongside auth |

**Choose Auth.js or Supabase when:** Phase I Postgres is starting in the same sprint and a single persistence story is preferred.

### Explicitly rejected or supplemental only

| Approach | Verdict |
|----------|---------|
| **Browser-exposed API keys** | **Rejected** — not real security (see [Phase F-2B §3](phase-f2b-api-security.md#3-explicit-rejected-design)) |
| **Vercel Deployment Protection only** | **Supplemental only** — edge access control, not app-level RBAC or audit |
| **Custom password without provider** | Avoid unless forced; higher risk and maintenance |

---

## 4. Target entities

| Entity | Description |
|--------|-------------|
| **User / Operator** | Human identity (email, display name, auth provider user id) |
| **Workspace / Organization** | Tenant boundary for data, roles, and audit logs |
| **Workspace Member** | Join of user + workspace + role |
| **Role** | Named bundle of permissions (Admin, Operator, Viewer, Developer/Internal Admin) |
| **Permission** | Atomic capability checked on server (e.g. `send_internal_alert`) |
| **Audit Log** | Append-only record of sensitive actions with actor, target, result, metadata |
| **Send Action / Approval Event** | Typed audit metadata linking queue item, actor, approval/send outcome, send mode |

### Multi-workspace note

- **MVP:** Start with a **single workspace** if needed (one org, one deployment).
- **Design rule:** Schema and session helpers must **not block** future multi-workspace persistence (always scope by `workspace_id`).

---

## 5. Roles (MVP)

| Role | Purpose |
|------|---------|
| **Admin** | Full workspace control: user management, settings, all operator capabilities, audit log access, test sends, live-send policy (when enabled) |
| **Operator** | Day-to-day journey control: view data, upload customers, edit triggers/templates/sequences, approve queue actions, send internal alerts (when permitted and env gates allow) |
| **Viewer** | Read-only: dashboard, customer data, queue, logs, reports — no edits, uploads, approvals, or sends |
| **Developer / Internal Admin** *(optional)* | Break-glass / engineering: test sends, settings, env-adjacent operations — separate from customer-facing operators; use sparingly in production |

---

## 6. Permissions

Permissions are checked **on the server**. UI may hide controls for UX; server enforcement is mandatory.

| Permission | Description |
|------------|-------------|
| `view_dashboard` | Access dashboard and read-only app pages |
| `upload_customer_data` | Validate and apply customer uploads |
| `edit_triggers` | Edit existing activity triggers |
| `create_triggers` | Create new activity triggers |
| `edit_templates` | Create, edit, approve, archive email templates |
| `manage_sequences` | Create, edit, enroll, progress email sequences |
| `approve_queue_actions` | Approve, skip, reset Action Queue workflow status |
| `send_internal_alert` | Invoke internal SendGrid send path (subject to env gate + business guards) |
| `send_test_email` | Invoke test send API (test inbox only) |
| `export_reports` | Download Reports CSV and related exports |
| `manage_settings` | Workspace / SendGrid policy settings (future Governance page) |
| `view_audit_logs` | Read append-only audit trail |
| `manage_users` | Invite, remove, change roles for workspace members |

### Role → permission matrix

| Permission | Admin | Operator | Viewer | Dev / Internal Admin |
|------------|:-----:|:--------:|:------:|:--------------------:|
| `view_dashboard` | ✅ | ✅ | ✅ | ✅ |
| `upload_customer_data` | ✅ | ✅ | ❌ | ✅ |
| `edit_triggers` | ✅ | ✅ | ❌ | ✅ |
| `create_triggers` | ✅ | ✅ | ❌ | ✅ |
| `edit_templates` | ✅ | ✅ | ❌ | ✅ |
| `manage_sequences` | ✅ | ✅ | ❌ | ✅ |
| `approve_queue_actions` | ✅ | ✅ | ❌ | ✅ |
| `send_internal_alert` | ✅ | ✅ | ❌ | ✅ |
| `send_test_email` | ✅ | ❌ | ❌ | ✅ |
| `export_reports` | ✅ | ✅ | ✅ | ✅ |
| `manage_settings` | ✅ | ❌ | ❌ | ✅ |
| `view_audit_logs` | ✅ | ❌ | ❌ | ✅ |
| `manage_users` | ✅ | ❌ | ❌ | ✅ |

**Notes:**

- Operator `send_internal_alert` does not bypass env gates or business guards.
- Live internal send mode (`SENDGRID_INTERNAL_SEND_MODE=live`) may require **Admin** only in a later hardening pass.
- Permission map lives in server code initially; migrate to DB-backed roles in J-6 if needed.

---

## 7. API protection model

### Required handler pattern

All sensitive API routes follow this order:

```
1. Session present?        → else 401 Unauthorized
2. Permission allowed?     → else 403 Forbidden
3. Env gate enabled?       → else 403 Forbidden (send routes only)
4. Business validation     → else 400 / 422
5. Execute
6. Write audit log         → sensitive actions (including denied attempts where noted)
```

### Structured error responses

| Status | When | Example body |
|--------|------|----------------|
| **401** | No valid session | `{ "success": false, "error": "Unauthorized" }` |
| **403** | Session ok, permission denied | `{ "success": false, "error": "Forbidden" }` |
| **403** | Env gate disabled | `{ "success": false, "error": "Internal send API is disabled" }` (unchanged from F-2B) |
| **400** | Business guard failed | `{ "success": false, "error": "<reason>" }` |

### `GET /api/internal-send-config`

| Rule | Phase J behavior |
|------|------------------|
| Auth | **Require authenticated session** with `view_dashboard` |
| Response | **Remain redacted** — status fields only (F-2B shape unchanged) |
| Must not return | `damAlertEmail`, `fromEmail`, `internalEmailDomain`, test inbox, API key |

### `POST /api/send-approved-internal`

| Step | Requirement |
|------|-------------|
| 1 | Authenticated user |
| 2 | Permission `send_internal_alert` |
| 3 | `INTERNAL_SEND_API_ENABLED === "true"` (env gate — **keep**) |
| 4 | Existing business guards — **unchanged:** Approved, `due_now`, conflict clear, internal-only recipient, duplicate window, required fields |
| 5 | `SENDGRID_INTERNAL_SEND_MODE` — **`dry_run` default** |
| 6 | **Audit every attempt** (success, business rejection, permission denied, env gate denied) |
| 7 | Consider redacting `deliverTo` in JSON response for non-Admin roles |

**Must remain disabled until Phase J complete:** enabling this route on a **public URL** without session auth.

### `POST /api/send-test-email`

| Step | Requirement |
|------|-------------|
| 1 | Authenticated user |
| 2 | Permission `send_test_email` (typically Admin / Dev only) |
| 3 | `SENDGRID_TEST_SEND_ENABLED === "true"` (env gate — **keep**) |
| 4 | Always deliver to `SENDGRID_TEST_TO_EMAIL` — never customer |
| 5 | Response redaction — **`testRecipient: "[configured test inbox]"`** (keep) |
| 6 | **Audit every attempt** |

### No new send routes in Phase J

- **No customer-facing live send route** in J-2–J-7.
- Customer pipeline is **J-8+ / Phase K** (see §11).

---

## 8. Page protection model

### All dashboard pages require auth

Unauthenticated users are redirected to **sign-in**. No public app surface except auth callbacks and optional health check.

| Route | Page | Minimum permission |
|-------|------|-------------------|
| `/` | Dashboard | `view_dashboard` |
| `/customers` | Customer Data | `view_dashboard` |
| `/email-library` | Email Templates | `view_dashboard` |
| `/sequences` | Email Sequences | `view_dashboard` |
| `/automations` | Activity Triggers | `view_dashboard` |
| `/action-queue` | Action Queue | `view_dashboard` |
| `/send-logs` | Communication Logs | `view_dashboard` |
| `/reports` | Reports | `view_dashboard` |

### Page-level action permissions

| User action | Permission |
|-------------|------------|
| View any dashboard page | `view_dashboard` |
| Upload / apply customer data | `upload_customer_data` |
| Edit existing triggers | `edit_triggers` |
| Create triggers | `create_triggers` |
| Edit / approve templates | `edit_templates` |
| Sequence create / edit / enroll / progress | `manage_sequences` |
| Approve / skip / reset queue items | `approve_queue_actions` |
| Send internal alert (UI + API) | `send_internal_alert` |
| Send test email | `send_test_email` |
| Export reports CSV | `export_reports` |
| Governance / settings (future) | `manage_settings` |
| Audit log viewer (future) | `view_audit_logs` |
| User management (future) | `manage_users` |

### Implementation notes (J-3 / J-5)

- **Middleware** (`middleware.ts`): matcher for dashboard routes + `/api/*` (exclude auth provider callbacks).
- **UI:** Hide or disable buttons when permission missing; **never rely on UI alone**.

### localStorage MVP after auth

Customer data, triggers, templates, and sequences may **remain in localStorage** for demo after auth ships. Auth protects **who** can use the app; Phase I binds data to **workspace** persistence later.

---

## 9. Persistence / database dependency

| Question | Answer |
|----------|--------|
| Can auth ship before full customer data persistence? | **Yes** — session + RBAC can protect pages and API while MVP data stays in browser storage |
| Can localStorage MVP remain after auth? | **Yes** for demo/internal preview; not sufficient for multi-operator production |
| Must audit logs be durable before live sends? | **Yes** — append-only DB (or equivalent) before `live` internal sends on shared URLs |
| Should user/workspace tables come first? | **Minimum:** `workspaces`, `workspace_members`, `audit_logs` before live sends |

### Minimum database model (auth + audit)

```
workspaces
  id, name, created_at

workspace_members
  workspace_id, user_id, role, created_at

audit_logs (append-only — no UPDATE/DELETE)
  id
  workspace_id
  actor_user_id
  action
  target_type
  target_id
  result          -- success | denied | error
  metadata_json
  created_at
```

Full customer/queue/log persistence (Phase I) can follow or overlap J-6.

---

## 10. Audit logging model

### Events to log

| Category | action examples | target |
|----------|-----------------|--------|
| Auth | `auth.login`, `auth.logout` | user |
| Customer data | `data.upload_validate`, `data.upload_apply` | import batch |
| Triggers | `trigger.create`, `trigger.edit`, `trigger.enable`, `trigger.disable`, `trigger.delete` | rule id |
| Templates | `template.create`, `template.edit`, `template.approve` | template key |
| Sequences | `sequence.enroll`, `sequence.progress`, `sequence.cancel` | enrollment id |
| Action Queue | `queue.approve`, `queue.skip`, `queue.reset` | action_id |
| Sends | `send.internal`, `send.test` | action_id / template |
| Exports | `export.reports`, `export.customers`, … | export type |
| Demo | `demo.reset` | workspace |

### Required fields (every row)

- `id`, `workspace_id`, `actor_user_id`, `action`, `target_type`, `target_id`, `result`, `metadata_json`, `created_at`

### Rules

- **Denied attempts must be logged** — permission denied (403), env gate denied (403), business guard failed (400) on send routes.
- **Avoid raw internal routing emails** in audit metadata unless restricted to **admin-only audit views**.
- **Send metadata** should include: `sendMode`, `dryRun`, `action_id`, outcome — not necessarily raw `deliverTo`.
- Logs are **server-written only**; clients never append audit rows directly.

---

## 11. Implementation roadmap

| Phase | Focus | Status |
|-------|--------|--------|
| **J-0** | Auth architecture audit / design | ✅ Complete |
| **J-1** | Document approved auth architecture | ✅ Complete |
| **J-2A** | Auth provider decision + J-2B plan | ✅ Complete |
| **J-2B** | Clerk session foundation (`AUTH_ENABLED=false` default) | ✅ Complete |
| **J-3** | Protect dashboard pages | ✅ Complete |
| **J-4** | Protect API routes (401/403, session on all `/api/*`) | ✅ Complete |
| **J-5B** | RBAC permission helpers + API permission checks | ✅ Complete |
| **J-5C** | UI action gating | ✅ Complete |
| **J-5D** | RBAC verification pass | ✅ Complete |
| **J-6B** | Audit DB schema + helper foundation | ✅ Complete |
| **J-6C** | Server-side audit for API routes | ✅ Complete |
| **J-6D** | Protected UI-origin audit ingestion | ✅ Complete |
| **J-6E** | Audit read/export foundation | ✅ Complete |
| **J-6F** | Stable verification / freeze check | ✅ Complete |
| **J-7** | Production auth verification (curl + browser checklist) | Pending |
| **J-8+ / Phase K** | Customer email pipeline — compliance, unsubscribe, customer send routes, live customer sends | Future — **after J-7** |

### J-2 scope (when implemented)

- Install chosen auth provider
- Add env vars to `.env.example` (not `.env.local` unless operator opts in)
- Sign-in / sign-out pages
- `getSession()` / `requireSession()` server helpers
- Middleware skeleton

### Out of scope for J-2–J-7

- Customer-facing live sends
- Automatic sending
- Changes to Action Queue business workflow, Reports logic, imports/exports, Activity Triggers, Email Sequences behavior
- Enabling send env gates on public URLs without auth verification

---

## 12. Production decision rules

| Scenario | Safe? | Conditions |
|----------|-------|------------|
| Local demo without auth | **Yes** (current) | Trusted audience, gates off, dry_run |
| Protected preview (F-2B only) | **Yes** | Deployment Protection + gates off |
| Shared URL with send gates on, no auth | **No** | H-1 identity gap |
| Internal preview with sends | **After J-4+** | Auth + RBAC + gates on + prefer dry_run |
| Live internal sends | **After J-6–J-7** | Auth + RBAC + durable audit + explicit ops approval |
| Open public production | **After J-7** | Auth + RBAC + audit + deployment protection |
| Customer live sends | **After J-8+ / Phase K** | Auth + audit + compliance + dedicated routes |

---

## 13. Related files (implementation reference)

| Area | Files (current — pre-J-2) |
|------|---------------------------|
| API routes | `app/api/internal-send-config/route.ts`, `app/api/send-approved-internal/route.ts`, `app/api/send-test-email/route.ts` |
| SendGrid / env | `lib/sendgrid-env.ts`, `lib/sendgrid-internal.ts`, `lib/sendgrid-test.ts`, `lib/internal-send.ts` |
| Client API wrappers | `lib/internal-send-config-client.ts`, `lib/send-approved-internal-client.ts`, `lib/send-test-email-client.ts` |
| UI send surfaces | `components/action-queue/internal-send-confirm-modal.tsx`, `components/layout/sendgrid-config-panel.tsx` |
| App shell | `app/(dashboard)/layout.tsx`, `components/layout/sidebar.tsx` |
| F-2B design | [phase-f2b-api-security.md](phase-f2b-api-security.md) |

---

## Related documentation

- [Product context — Phase J](product.md#18-phase-j--auth-session-rbac--audit)
- [Product context — Production gaps](product.md#15-production-gaps)
- [Phase F-2B API security design](phase-f2b-api-security.md)
- [README — Environment variables](../../README.md#environment-variables)
