---
updated_at: "2026-06-10 — Cybersecurity hardening WS1+WS2+WS3+WS4 ALL DEPLOYED + Rule Q L2 verified on real prod. Pre-deploy audit caught a live CRITICAL (chat_config secrets still world-readable) + fixed it. ⚠ USER MUST ROTATE LINE/FB secrets."
status: "DEPLOYED LIVE (frontend e5965311 + firestore.rules @ HEAD). vercel: WS2 jspdf4 + WS3 api auth + WS4 headers + WS1 client. firestore.rules: WS1 anon-lockdown + C2-bis chat_config secret lockdown. Rule Q L2 13/13 + all post-deploy probes green."
branch: "master"
last_commit: "e5418722 — fix(security/WS1-C2-bis-2): chat_config lockdown via wildcard exclusion (Firestore OR-semantics)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "frontend = e5965311 LIVE; firestore.rules = e5418722 LIVE (C2-bis-2)."
firestore_rules_version: "WS1 (opd_sessions get/list, clinic_schedules get/list+write staff, chat create/update isClinicStaff, form_templates get/list) + C2-bis (clinic_settings/{settingId} read excludes chat_config — secrets staff-only)."
---

# Active — 2026-06-10 — Cybersecurity hardening WS1–WS4 SHIPPED + DEPLOYED + pre-deploy audit

## 🚨 USER ACTION REQUIRED (CRITICAL) — ROTATE secrets
clinic_settings/chat_config held the LINE + FB channel secrets and was **world-readable on prod for an unknown window** (now closed). The rule stops FUTURE reads; anything scraped is still valid → **ROTATE**: LINE `channelSecret` + `channelAccessToken`, FB `appSecret` + `pageAccessToken` (LINE/FB Developer Console → update in Backend → ตั้งค่า LINE OA / FB Page tabs).

## State
- prod LIVE: vercel `e5965311` + firebase rules `e5418722`. Tree clean. 4-workstream cybersecurity hardening (audit 2026-06-10) — ALL DEPLOYED.

## Deployed + verified (Rule Q L2 13/13 real prod + post-deploy probes)
- **WS1** anon-surface lockdown: opd_sessions get/list split (killed anon mass-PII dump — was REAL live), clinic_schedules get/list+write, chat create/update→isClinicStaff, form_templates get/list. + client crypto-128-bit ids, PatientDashboard→/api/patient-view, webhook chat→admin SDK.
- **WS1 C2-bis** (found by THIS audit): clinic_settings/chat_config secrets were STILL world-readable (C2 migrated readers to admin SDK but never closed the rule). **First fix attempt (specific staff-only match) was INEFFECTIVE** — Firestore OR-unions all matching rules, so `true OR isClinicStaff == true` (verified live: system_config same-structure also 200). **Real fix: wildcard `read: if settingId != 'chat_config'`.** Post-probe: chat_config unauth 200→403; main/system_config stay 200 (App.jsx v86Glow anon read preserved).
- **WS2** deps: html2pdf removed (CRIT XSS, dead dep), jspdf 3→4.2.1 (CRIT, not-reachable in our flat-image use; L1 PDF + node 5/5), vite 8.0.16 (HIGH), postcss 8.5.15. npm audit criticals now 0.
- **WS3** endpoint auth: send.js + saved-replies were BROKEN (500 since V50 — ghost import of V50-deleted proclinic/_lib/auth) + the old gate checked no claim (latent weak-auth). NEW verifyClinicStaffToken (verifyIdToken + isClinicStaff/admin claim). Post-deploy: no-auth send/saved-replies → 401 (was 500). + schedule token 40→128-bit.
- **WS4** security headers (vercel.json had NONE): CSP (script-src hashes, no unsafe-inline/eval; connect *.googleapis.com) + HSTS + nosniff + X-Frame SAMEORIGIN + Referrer + Permissions + X-DNS. L1-verified (app renders + Firestore connects + 0 CSP violations). All 7 confirmed live on prod.

## Pre-deploy audit verdict (the /systematic-debugging ask)
- **V23 re-break trap CLEARED**: exhaustive grep — every list/query of opd_sessions/clinic_schedules/form_templates runs in STAFF context (AdminDashboard + CustomFormBuilder); patients only get-by-id/token.
- **Perf**: no new hot-path cost (CSP=headers 0 runtime; jspdf lazy; verifyClinicStaffToken not hot; PatientDashboard endpoint was already the path).
- **ChatPanel passes Bearer getIdToken()** → staff send works under the new gate (same claim that gates chat read). No-auth → 401 proven.
- The audit's value: caught the live chat_config CRITICAL that would have shipped.

## Honest gaps (Rule Q-honest)
- WS3 full staff-SEND (vs no-auth→401) needs a real staff token = user hands-on / L3. Claim-consistency argument + 401 gate proof stand.
- Authenticated flows not re-driven in a real browser (no staff creds in Chrome); WS1 live since earlier today with no breakage report.

## Next action
- IDLE / await direction. **Remind user to ROTATE the LINE/FB secrets (above).**
- Remaining audit tail (deferred): firebase-admin 14 major + fast-xml-builder/picomatch/tmp HIGH (transitive dev, low reachability); patient-view rate-limit (documented residual — strong token + Vercel DDoS).

## Outstanding user-triggered (NOT this work)
- `npm run test:extended` 283 fail = V50-deleted tabs in stale RTL (opt-in).
- SESSION_HANDOFF.md ~207 KB over 200 KB soft-cap → archival on a maintenance turn.
- 3 timing/perf-flake tests (backend-menu-d-stress / staffchat-sticker-objecturl / subtab-filters-stress) fail under full-suite load, pass isolated (19/19) — unrelated to today's work.
