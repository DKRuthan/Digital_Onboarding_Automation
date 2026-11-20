# Digital Customer Journey Control Center — Demo Script

Internal walkthrough for the contact-first MVP. Verified against demo data (13 accounts, ~18 derived contacts).

**Mode:** Local/internal demo — controlled prototype, not production.

**Core message:** Account tells us where the person belongs. Email tells us who the journey is for.

---

## 1. Opening

Today I want to show the Digital Customer Journey Control Center.

This is a **local demo build**:

- **No customer emails are sent**
- **SendGrid send APIs are gated off** by default
- **Reports are snapshot/demo reporting**, not production BI
- **Production** would need database persistence, auth, and audit

The main product idea: we should not only manage customers at the account level. We should understand who the actual journey is for.

**Account tells us where the person belongs. Email tells us who the journey is for.**

The customer account gives context; **`contact_email` is the operational identity**.

---

## 2. Dashboard

Start on the Dashboard.

Contact-first metrics:

- total accounts and contacts
- contacts in sequences
- contacts in cooling
- actions due now
- unresolved contact emails

**Demo numbers (after Use Demo Data):** 13 accounts and ~18 derived contacts.

Unresolved contact email actions show where the journey cannot continue safely without clean contact data.

---

## 3. Customer Data — Accounts & Contacts

Go to **Customer Data**.

Two views:

- **Accounts** — plan, stage, usage, seats, owner, renewal, data quality
- **Contacts / Emails** — contact email first; who we can communicate with

**Low Usage filter:** 8 of 13 accounts in demo data.

**Data Quality:** all 13 demo accounts show a CSM-owner warning (owner is not an email). Good example of why contact-first data quality matters.

---

## 4. Flat Journey Import (primary path)

The **primary import** is a flat **Journey Import** Excel workbook:

| Row | Content |
|-----|---------|
| Row 1 | Human-readable labels (ignored by parser) |
| Row 2 | System keys (canonical) |
| Row 3+ | Data — one row = one account + one contact |

Optional **Field Guide** sheet is ignored.

**Legacy fallbacks** (not the demo lead): L-2 multi-sheet Row 2 workbook and L-1 legacy single-row format still parse if uploaded.

### Demo flow

1. Click **Use Demo Data** for a clean slate (also clears any stored uploaded import).
2. **Download Excel Import Template** — flat `Journey Import` workbook.
3. **Upload Excel Workbook** → **Validate Data** → review preview (accounts, contacts, blockers/warnings).
4. **Apply Uploaded Data** — replaces current customers and imported contacts. **No emails sent.** **No Communication Logs created.**
5. **Refresh the browser** — applied upload **persists locally** in this browser (`digital-journey.active-import.v1`).
6. Open **Contacts / Emails** — imported contacts visible.
7. **Use Demo Data** again before continuing the rest of the demo if you want the full 13-account dataset back.

**Re-upload replaces** stored data — it does not append.

---

## 5. Activity Triggers

Open **Activity Triggers**.

Rules identify what action should happen next.

**Test Low Usage** → ~8 matching customers. **Test does not send anything.**

New custom triggers are saved **inactive by default** — enable only when ready.

Plain-English summaries and grouped AND/OR logic help explain why a row would appear.

---

## 6. Email Templates & Sequences

**Email Templates** — draft / approved / archived; variables; test send goes to test inbox only.

**Email Sequences** — contact-level journeys; **manual enrollment and progression**; no automatic customer sends.

---

## 7. Action Queue

The review workbench — contact email first:

- role, account context, source, schedule, conflict, approval status

Some rows show **“Contact email not resolved”** — operational signal to fix data (e.g. CSM owner not an email).

**Send via SendGrid** is gated. **Customer sends disabled.** Sidebar shows internal send mode and API gate status.

**Workflow progress is session-only** — refresh clears approval/send status (uploaded customers still persist if applied).

---

## 8. Communication Logs

Contact-first history:

- demo seed events
- simulated logs (from approved queue actions)
- test sends, dry runs, internal alerts

**Session-only** — new entries reset on refresh (demo seed reloads).

Import does **not** create logs.

---

## 9. Reports

**Read-only** snapshot reporting — does not send email or mutate data.

Seven sections: Executive Overview, Import Quality, Contact Journey, Action Queue, Communication, Sequences, Account Context.

**Import Quality** reflects the last validation snapshot. After an applied import, validation summary can restore from **local browser persistence** along with customer/contact data.

**Not production BI:** numbers reflect current browser session + localStorage; workflow logs and queue progress do not persist like a warehouse.

**Export Reports CSV** for sharing outside the app.

---

## 10. Persistence & safety close

### What persists after refresh (this browser)

- Applied uploaded customers and imported contacts
- Active import metadata
- Automation rules, email templates, sequences, enrollments (localStorage)

### Session / demo only

- Action Queue workflow progress
- Communication Logs (except demo seed on reload)
- Reports snapshot timing
- Audit logs (unless DB + `AUDIT_ENABLED` configured)

### Not active in this demo

- Neon / server database persistence (future code exists, not wired)
- Customer-facing sending
- Automatic sends

### Safety rules

- No customer-facing emails
- No background automation / cron
- No automatic sequence progression
- Human review before any Send via SendGrid
- Send APIs gated off by default

**Value today:** contact-first control center for onboarding, data quality, human-reviewed actions, and demo reporting.

**Next for production:** server persistence, auth/RBAC, durable audit, and customer-safe sending only after governance approval.
