# Phase F-2B — API Authentication & Internal Config Restriction

> **Approved design document** for production hardening of SendGrid-related API routes.  
> **Status:** **F-2B-0–F-2B-4** complete ✅ · Real auth/session remains **Phase J**.
> **Source audit:** F-1 production audit (H-1, H-2) and F-2B-0 API security audit.

---

## 1. Purpose

Phase **F-2B** addresses **high-priority production hardening risks** identified in the F-1 and F-2B-0 audits:

| ID | Risk | Summary |
|----|------|---------|
| **H-1** | Unauthenticated send routes | `POST /api/send-approved-internal` and `POST /api/send-test-email` are publicly callable with no auth, session, or middleware guards. |
| **H-2** | Public internal config leak | `GET /api/internal-send-config` returns internal routing emails (`damAlertEmail`, `fromEmail`, `internalEmailDomain`) to any unauthenticated client. |

**Why this matters**

- Required before **open/public production deployment** with SendGrid credentials configured.
- **Not required** for a **controlled local demo** with `SENDGRID_INTERNAL_SEND_MODE=dry_run` and a trusted audience.

F-2B does **not** implement full user authentication. It establishes **honest, layered operational guards** until real session/auth exists (Phase J).

---

## 2. Current state (as of F-2B-2)

| Capability | Status |
|------------|--------|
| User authentication / sessions | **None** |
| Next.js middleware | **None** (`middleware.ts` does not exist) |
| Auth packages (Clerk, Auth0, NextAuth, etc.) | **None** installed |
| Route-level API env gates | **✅ F-2B-2** — send routes return 403 unless explicitly enabled |
| Redacted public config | **✅ F-2B-2** — GET config returns status fields only |

**SendGrid safety is operational plus env-gated access control:**

- Customer sends are disabled by design (no customer send route; server rejects admin/user recipients).
- Internal send defaults to `dry_run` when `SENDGRID_INTERNAL_SEND_MODE` is unset.
- Test send always delivers to `SENDGRID_TEST_TO_EMAIL`, never the intended recipient — but **route returns 403** unless `SENDGRID_TEST_SEND_ENABLED=true`.
- `POST /api/send-approved-internal` returns **403** unless `INTERNAL_SEND_API_ENABLED=true`.
- Action Queue UI gates sends in the browser — env gates add server-side protection against direct API calls.

---

## 3. Explicit rejected design

The following approach is **not approved** for this SPA:

### Browser-exposed static API key

- Do **not** use a static `X-API-Key` (or similar) sent from browser JavaScript as the **primary** security layer.
- Any secret shipped to the browser is visible in DevTools, bundled assets, and network logs — trivially replayable by any caller.
- This creates a **false sense of security** on a public URL.

### Static server-to-server keys (deferred, different use case)

- Static API keys may be useful **later** for **server-only** automation (cron, webhooks, internal services).
- They are **not** appropriate as the security model for this Next.js SPA calling `/api/*` from the client.

---

## 4. Approved near-term hardening design

Use a **layered model**. Layers 1–3 are implemented in F-2B-2 / F-2B-3. Layer 4 is Phase J.

### Layer 1 — Env-gated send routes

New recommended environment variables:

| Variable | Default when unset | Purpose |
|----------|-------------------|---------|
| `INTERNAL_SEND_API_ENABLED` | **`false` / disabled** | Master gate for `POST /api/send-approved-internal` |
| `SENDGRID_TEST_SEND_ENABLED` | **`false` / disabled** | Master gate for `POST /api/send-test-email` |

**Behavior (F-2B-2 implementation):**

- `POST /api/send-approved-internal` returns **`403 Forbidden`** when `INTERNAL_SEND_API_ENABLED !== "true"`.
- `POST /api/send-test-email` returns **`403 Forbidden`** when `SENDGRID_TEST_SEND_ENABLED !== "true"`.
- Unset or any value other than `"true"` is treated as **disabled**.

Response shape (recommended):

```json
{ "success": false, "error": "Internal send API is disabled" }
```

```json
{ "success": false, "error": "Test send API is disabled" }
```

### Layer 2 — Redacted public config

`GET /api/internal-send-config` must return **status fields only**.

**Allowed response fields:**

| Field | Type | Description |
|-------|------|-------------|
| `configured` | boolean | SendGrid env validation passed |
| `sendMode` | `"dry_run"` \| `"live"` | From `SENDGRID_INTERNAL_SEND_MODE` |
| `customerSendsEnabled` | boolean | Always `false` in current MVP |
| `internalSendsEnabled` | boolean | Derived from `INTERNAL_SEND_API_ENABLED === "true"` |
| `testSendEnabled` | boolean | Derived from `SENDGRID_TEST_SEND_ENABLED === "true"` |
| `validationErrors` | string[] | Generic validation messages (no email values) |

**Must not return:**

- `damAlertEmail`
- `fromEmail`
- `internalEmailDomain`
- Test recipient email (`SENDGRID_TEST_TO_EMAIL`)
- Any internal routing inbox address

**Recommended safe response example:**

```json
{
  "configured": true,
  "sendMode": "dry_run",
  "customerSendsEnabled": false,
  "internalSendsEnabled": false,
  "testSendEnabled": false,
  "validationErrors": []
}
```

### Layer 3 — Deployment protection

For preview or internal hosted demos:

- Use **Vercel Deployment Protection** (password, SSO, or equivalent) when SendGrid env vars are present.
- Do **not** expose a **public URL** with SendGrid credentials and send API gates enabled **before** real auth exists.
- Prefer **`dry_run`** and **disabled send gates** (`INTERNAL_SEND_API_ENABLED` / `SENDGRID_TEST_SEND_ENABLED` unset or `false`) on any URL that is not access-controlled.

### Layer 4 — Future real auth (Phase J)

Deferred to a later phase:

- Real **session authentication** and **role-based route guards** (who may approve, send, configure).
- **Live internal sending** and any **customer-facing sending** must not be enabled on **public production** until real auth exists.
- When auth is added, env gates remain as a **defense-in-depth** operational kill switch — not a replacement for identity.

---

## 5. Internal send preview design

### Internal send confirm modal (F-2B-3 implemented)

`InternalSendConfirmModal` uses **generic routing labels** via `getInternalRoutingPreview()` — no env emails on the client. Preview endpoint deferred; not required for demo.

### Approved implementation options

**Preferred (safest small option):**

Add a **server-side internal send preview** endpoint in F-2B-2 or F-2B-3, e.g.:

- `POST /api/internal-send-preview`

Accepts queue item / payload fields needed for routing validation. Returns routing **status** without exposing raw env config:

```json
{
  "ok": true,
  "deliverToLabel": "DAM alert inbox",
  "routingReason": "CSM owner \"Reed Demo\" routed to DAM alert inbox",
  "subject": "...",
  "body": "..."
}
```

The preview endpoint should be subject to the same env gate as send (`INTERNAL_SEND_API_ENABLED`) or a dedicated preview flag — implementation chooses the smallest safe option.

**Alternative MVP (if preview endpoint is deferred):**

Degrade client preview text without exposing exact addresses:

- `"Routed to DAM alert inbox"`
- `"Internal route configured"`
- Show queue recipient and routing **reason** only; resolve exact `deliverTo` on the server at send time.

**Implementation rule:** Choose the **safest small option** that preserves demo UX without leaking env emails in GET config.

---

## 6. Send route guard behavior

### `POST /api/send-approved-internal`

Guard order (F-2B-2):

1. **Env gate** — `INTERNAL_SEND_API_ENABLED !== "true"` → `403`
2. **Existing business guards** (unchanged):
   - `action_status` must be `"Approved"`
   - `schedule_status` must be `"due_now"`
   - `conflict_status` must be `"clear"`
   - Customer admin/user recipients **rejected**
   - Internal/DAM routing only (domain + owner name resolution)
   - Duplicate protection (7-day window) remains
3. **Send mode** — `SENDGRID_INTERNAL_SEND_MODE` defaults to **`dry_run`**; live only when explicitly set to `"live"`

Success response may still include `deliverTo` for authenticated operators in a future phase; consider redaction in public contexts.

### `POST /api/send-test-email`

Guard order (F-2B-2):

1. **Env gate** — `SENDGRID_TEST_SEND_ENABLED !== "true"` → `403`
2. **Existing behavior** (unchanged):
   - Required field validation
   - Always send to `SENDGRID_TEST_TO_EMAIL` — never `intended_recipient`
3. **Response redaction** — do **not** return raw test recipient email; use a generic label (e.g. `"configured test inbox"`) or omit the field

Test route remains **disabled by default** unless explicitly enabled via env.

---

## 7. Environment variable documentation

### Existing SendGrid variables (unchanged)

| Variable | Scope | Notes |
|----------|-------|-------|
| `SENDGRID_API_KEY` | Server-only | Never in client responses |
| `SENDGRID_FROM_EMAIL` | Server-only | Never in public config |
| `SENDGRID_TEST_TO_EMAIL` | Server-only | Never in public config or test response |
| `SENDGRID_DAM_ALERT_EMAIL` | Server-only | Never in public config |
| `SENDGRID_INTERNAL_EMAIL_DOMAIN` | Server-only | Never in public config |
| `SENDGRID_INTERNAL_SEND_MODE` | Server-only | Default `dry_run` when unset |

### New gate variables (F-2B-2 will add to `.env.example`)

| Variable | Default | When `"true"` |
|----------|---------|---------------|
| `INTERNAL_SEND_API_ENABLED` | disabled | Allows `POST /api/send-approved-internal` (still subject to business guards + send mode) |
| `SENDGRID_TEST_SEND_ENABLED` | disabled | Allows `POST /api/send-test-email` |

**Safe default rule:** Missing or non-`"true"` values → route returns **403**.

F-2B-1 documents design only. **Do not modify `.env.local`.** `.env.example` and README updates happen in F-2B-2.

---

## 8. Production decision rules

| Scenario | Safe? | Conditions |
|----------|-------|------------|
| **Controlled local demo** | **Yes** | `dry_run`, trusted audience, local or protected access |
| **Open production before F-2B** | **No** | Unguarded send routes; config leaks internal emails |
| **Preview / internal after F-2B gates** | **Yes** | Deployment protection enabled; send gates **false** by default; prefer `dry_run` |
| **Live public sending (internal or customer)** | **No** | Not until **real auth** (Phase J) + explicit operational approval |

**Minimum acceptable guard before any public URL with SendGrid env:**

1. Redacted `GET /api/internal-send-config`
2. Send routes disabled by default via env gates
3. Deployment access control (Vercel Deployment Protection or equivalent)
4. Real session/auth before enabling sends on a public production URL

---

## 9. Implementation roadmap

| Phase | Focus | Status |
|-------|--------|--------|
| **F-2B-0** | API auth / config restriction audit | ✅ Complete |
| **F-2B-1** | Document approved API security design | ✅ Current |
| **F-2B-2** | Implement redacted config + env-gated send routes | ✅ Complete |
| **F-2B-3** | Client modal / config adaptation + verification | ✅ Complete (verification pass — no code changes) |
| **F-2B-4** | Production security verification (curl + browser) | ✅ Complete (2026-06-20) |
| **Phase J** | Real auth / session / RBAC before public live sends | Future |

### F-2B-2 scope (implementation)

- Update `getPublicSendGridConfig()` / `GET /api/internal-send-config` to redacted shape
- Add env gate checks to send route handlers
- Optionally add `POST /api/internal-send-preview`
- Update `.env.example` and README env table

### F-2B-3 scope (implementation)

- Update `lib/internal-send-config-client.ts` types
- Adapt `InternalSendConfirmModal` (and any consumer of `toEnvConfig()`)
- Ensure sidebar (`SendGridConfigPanel`) and mobile banner (`DemoBanner`) work with reduced config
- UI copy when send gates disabled (clear 403 messaging)

### F-2B-4 verification checklist

- `curl` unauthenticated → `403` on send routes when gates off
- `curl` GET config → no email fields in JSON
- Browser: demo flows unchanged when gates enabled locally for dev
- lint + build + existing verify scripts pass

---

## 10. Related files (implementation reference)

| Area | Files |
|------|-------|
| API routes | `app/api/internal-send-config/route.ts`, `app/api/send-approved-internal/route.ts`, `app/api/send-test-email/route.ts` |
| Server logic | `lib/sendgrid-env.ts`, `lib/sendgrid-internal.ts`, `lib/sendgrid-test.ts`, `lib/internal-send.ts` |
| Client wrappers | `lib/internal-send-config-client.ts`, `lib/send-approved-internal-client.ts`, `lib/send-test-email-client.ts` |
| UI consumers | `components/layout/sendgrid-config-panel.tsx`, `components/layout/demo-banner.tsx`, `components/action-queue/internal-send-confirm-modal.tsx`, `components/action-queue/action-queue-table.tsx` |

---

## Related documentation

- [Product context — Phase F](product.md#16-phase-f--production-error-audit)
- [Product context — Production gaps](product.md#15-production-gaps)
- [README — Environment variables](../../README.md#environment-variables)
