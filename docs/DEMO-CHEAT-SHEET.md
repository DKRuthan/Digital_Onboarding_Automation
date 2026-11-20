# Demo Cheat Sheet — One Page

**Core message:** Account tells us where the person belongs. Email tells us who the journey is for.

**Mode:** Local/internal demo — controlled prototype, not production.

---

## Pre-demo checklist (5 min)

1. Fresh browser tab → open app → click **Use Demo Data**
2. Sidebar: **Customer sends: disabled**, send APIs **disabled (env gate)**, **Internal send mode: dry_run**
3. Dashboard: **13 accounts**, ~**18 contacts**, unresolved contact emails visible
4. Optional: download flat **Journey Import** template for upload demo
5. After upload Apply + refresh demo → **Use Demo Data** again if you need full demo dataset for later steps

---

## Key numbers (demo data)

| Metric | Value |
|--------|-------|
| Accounts | 13 |
| Contacts (derived) | ~18 |
| Low Usage accounts | 8 of 13 |
| Unresolved contact email actions | 3 |
| CSM-owner DQ warnings | 13 (all accounts) |
| Low Usage trigger matches | ~8 |
| Reports sections | 7 |

---

## Presenter flow (~25 min)

| # | Page | Show |
|---|------|------|
| 1 | **Dashboard** | Contact metrics, unresolved emails |
| 2 | **Customer Data → Use Demo Data** | Clean slate |
| 3 | **Customer Data → Download template** | Flat Journey Import (Row 1 labels, Row 2 keys, Row 3+ data) |
| 4 | **Customer Data → Upload** | Validate → Apply → **Refresh** (local persistence) |
| 5 | **Customer Data → Contacts** | Imported contact emails |
| 6 | **Activity Triggers** | Test trigger → matches only, no send |
| 7 | **Email Templates / Sequences** | Approved templates; manual enrollment |
| 8 | **Action Queue** | Contact-first table, approve flow, gated Send |
| 9 | **Communication Logs** | Demo / simulated / test — session-only |
| 10 | **Reports** | Data source + local-only banner; Export CSV |
| 11 | **Safety close** | No customer sends; local prototype; production needs DB/auth/audit |

---

## Talking points

- **Flat Journey Import is primary:** one `Journey Import` sheet; legacy multi-sheet still works as fallback.
- **Local persistence:** applied upload survives refresh; Use Demo Data clears it.
- **Session-only:** queue workflow status, communication logs, reports snapshot.
- **Contact-first:** `contact_email` is operational identity; account is context.
- **Unresolved rows:** fix contact/owner data before journey continues.
- **Reports:** snapshot/demo reporting — not production BI.
- **Use Demo Data:** resets customers, clears stored import, resets local demo config (triggers, templates, sequences, logs).

---

## Safety close (30 sec)

- **No customer-facing sends**
- **Send APIs gated** (disabled by default)
- **No automatic sends** / no cron
- **Manual sequence progression**
- **Human review** before Send via SendGrid
- **Local browser prototype** — production needs database, auth, audit
- Reports are **read-only** snapshots

---

Full script: [DEMO-SCRIPT.md](DEMO-SCRIPT.md)
