---
updated_at: "2026-06-10 — WS1 Anon-Surface Lockdown (Cybersecurity hardening #1/4) SHIPPED + DEPLOYED + Rule Q L2 verified on real prod. C1+H1+H2+M2."
status: "DEPLOYED LIVE — vercel (client Tasks 1-4) + firebase firestore:rules (WS1 C1+H1+H2+M2). Rule Q L2 RED-before (5/11, anon COULD dump opd_sessions PII) -> GREEN-after (11/11, anon blocked + patient paths intact). firestore.rules CHANGED -> Probe-Deploy-Probe done (rules compiled+released; L2 = canonical probe)."
branch: "master"
last_commit: "19c4dde0 — test(security/WS1): widen be_chart_templates rule-window 200->700 (V21 fixup) + Rule B probe#1 chat 200->403"
tests: "full vitest 16343/16343 (the 1 fail = chart-template-persistence V21 window break from WS1 M2 comment; FIXED 14/0, behavior unchanged). build clean. Rule Q L2 scripts/diag-ws1-anon-lockdown.mjs = 11/11 green on real prod."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "frontend = 19c4dde0 LIVE. firestore.rules = WS1-tightened LIVE."
firestore_rules_version: "WS1 (2026-06-10) — opd_sessions read->get/list split; clinic_schedules read->get(public)/list(staff)+write(staff); chat_conversations create/update if-true->isClinicStaff; form_templates read->get/list split. be_chart_templates KEPT signed-in read (documented residual)."
---

# Active — 2026-06-10 — WS1 Anon-Surface Lockdown (Security #1/4) SHIPPED + DEPLOYED

## State
- prod LIVE: vercel client `19c4dde0` + firebase WS1 rules. Tree clean (after this active.md commit).
- The CRITICAL was REAL on live prod (proven): an anonymous internet user could open ANY public link → app auto `signInAnonymously` → console `getDocs(opd_sessions)` → dump every patient's national ID + medical PII. NOW: `list` denied (PERMISSION_DENIED); patient `get`-by-crypto-id still works.

## What shipped (WS1 = workstream 1 of a 4-part hardening; audit done 2026-06-10)
- **C1 (CRITICAL)** opd_sessions: `read: if isSignedIn()` → `get: if isSignedIn()` + `list: if isClinicStaff()`. Kills anon mass-PII dump. Client Tasks 1-4 (crypto 128-bit ids, PatientDashboard ?patient= → /api/patient-view, secret) committed in prior turns (fad0554c..2bcba3e9).
- **H1 (HIGH)** chat_conversations + messages: `create/update: if true` → `isClinicStaff()`. Webhooks (line/facebook/send.js) all use firebase-admin SDK (bypass rules) — verified before tightening.
- **H2 (HIGH)** clinic_schedules: `read: if true` → `get: if true` + `list: if isClinicStaff()`; `write: if isSignedIn()` → `isClinicStaff()`. Patient ClinicSchedule.jsx only getDoc-by-token (V23-safe).
- **M2 (MED)** form_templates: read → get/list split. be_chart_templates KEPT signed-in read (anon TFP `onSnapshot(query(...))` lists it; low-PII diagrams) — documented residual.

## Verification (Rule Q — REAL, not mock)
- **L2 real client-SDK `signInAnonymously` on real prod** (`scripts/diag-ws1-anon-lockdown.mjs`): RED-before **5/11** (anon could list opd_sessions/clinic_schedules/form_templates + write chat/schedules) → GREEN-after **11/11** (anon enumerate/forge DENIED; patient get/create/booking ALLOWED; control be_customers staff-only DENIED).
- full vitest **16343/16343** (1 V21 window-break fixed); build clean; app 200; /api/patient-view alive (404 on bad token).
- Staff side unaffected by construction (every tightened rule kept its isClinicStaff branch).

## Honest gap (Rule Q-honest)
- No real-browser L1 of the rendered patient PAGES (Chrome MCP not connected). Underlying Firestore ops proven via real client SDK (L2). Patient pages do exactly those ops (getDoc-by-id / getDoc-by-token / anon create) → strong real verification, but rendered-page L1 is user-hands-on / next-Chrome-session.

## Next action
- WS2-4 remaining (from the 2026-06-10 audit): the MEDIUM/hardening tail — npm-audit deps (2 critical: jspdf/html2pdf transitive; 1 high vite 8.0.x), security headers (CSP/HSTS, no vercel.json headers block), public-endpoint rate-limiting (patient-view/branch-line-oa IDOR/enumeration + no rate limit), send.js outbound-abuse auth review, bootstrap-self review. Each = own spec+plan+deploy chunk (per Q1). Await user direction on which next.

## Outstanding user-triggered (NOT this work)
- `npm run test:extended` 283 fail = V50-deleted tabs in stale RTL (opt-in).
- SESSION_HANDOFF.md ~207 KB over 200 KB soft-cap → archival on a maintenance turn.
