# 2026-06-10 — Cybersecurity Hardening WS1–WS4 + pre-deploy audit (chat_config CRITICAL)

## Summary
Whole-app security hardening across 4 workstreams (audit done this session via multi-agent + inline), ALL DEPLOYED + Rule Q L2-verified on real prod. A pre-deploy `/systematic-debugging` audit caught a LIVE CRITICAL that would otherwise have shipped: `clinic_settings/chat_config` (LINE/FB channel secrets) was still world-readable. ⚠ USER MUST ROTATE the LINE/FB secrets.

## Current State
- prod LIVE: frontend `e5965311` (vercel) + firestore.rules `e5418722` (firebase). master HEAD `c537ca47`. Tree clean.
- Rule Q L2 `scripts/diag-ws1-anon-lockdown.mjs` = **13/13** on real prod (anon enumerate/forge DENIED, patient get/create ALLOWED, chat_config DENIED, main/control correct).
- Post-deploy probes: chat_config unauth 200→**403**; send/saved-replies no-auth → **401** (was 500); all **7 WS4 headers** live; opd_sessions list unauth 403.
- Tests: full vitest 16349 pass / 3 timing-flakes (pass isolated 19/19, unrelated) — last run this session; not re-run at EOD.

## Commits
```
c537ca47 docs(agents): WS1-4 hardening DEPLOYED + audit caught chat_config CRITICAL
e5418722 fix(security/WS1-C2-bis-2): chat_config lockdown via WILDCARD EXCLUSION (OR-semantics)
e5965311 fix(security/WS1-C2-bis): rule-lock chat_config (first attempt — specific match)
b9de1c39 fix(security/WS3): restore send.js/saved-replies auth + schedule token 40->128-bit
d48f79b6 feat(security/WS4): security headers + CSP (was: NO headers)
ba43ebb8 fix(security/WS2): remove html2pdf + jspdf 4.2.1 + vite 8.0.16 + postcss
(+ WS1 client fad0554c..2bcba3e9 + rules 8a66983c + 14f81901 spec, deployed earlier today)
```

## Files Touched
- firestore.rules (WS1 get/list splits + chat/form_templates + C2-bis wildcard exclusion)
- vercel.json (WS4 headers block); package.json/lock (WS2 deps)
- api/admin/_lib/adminAuth.js (verifyClinicStaffToken); api/webhook/{send,saved-replies}.js (re-point)
- src/pages/AdminDashboard.jsx (schedule token 128-bit); src/lib/documentPrintEngine.js (WS2 comment)
- tests/{ws1-c2bis,ws3,ws4}-*.test.js (+ 1 V21 fixup chart-template-persistence)
- scripts/diag-ws1-anon-lockdown.mjs + diag-ws2-jspdf4-compat.mjs
- docs/superpowers/specs/2026-06-10-ws{1,2,3,4}-*-design.html
- .claude/rules/01-iron-clad.md (Rule B probe#1 chat 200→403)

## Decisions (1-line each)
- WS1-C2-bis fix is the WILDCARD EXCLUSION (`read: if settingId != 'chat_config'`), NOT a specific match — Firestore UNIONS all matching rules so a specific staff-only match canNOT restrict (`true OR isClinicStaff`=true; verified live, system_config had same latent leak).
- system_config stays PUBLIC (App.jsx v86Glow reads it on anon patient loads) — it's config not secrets; only chat_config excluded.
- WS3: send.js was 500-broken since V50 (ghost import); restored with clinic-staff claim gate (consistent with the chat read gate; ChatPanel passes Bearer getIdToken).
- WS2 jspdf CRIT not reachable (flat-image, no AcroForm) — bumped for hygiene + L1-verified.
- WS4 CSP uses inline-script SHA-256 hashes (no unsafe-inline/eval); L1-verified non-breaking before deploy.
- rate-limit on patient-view = documented residual (128-bit token + Vercel DDoS; in-memory limit = theater).

## Next Todo
- IDLE. ⚠ Remind user to ROTATE LINE channelSecret/accessToken + FB appSecret/pageAccessToken.
- Deferred audit tail: firebase-admin 14 major + fast-xml-builder/picomatch/tmp HIGH (transitive dev); these need a separate careful chunk.
- SESSION_HANDOFF.md ~207 KB over 200 KB cap → archival on a maintenance turn.

## Resume Prompt
Resume LoverClinic — continue from 2026-06-10 EOD. Cybersecurity WS1-4 DEPLOYED + L2 13/13. ⚠ user must rotate LINE/FB secrets. Next: idle. /session-start
