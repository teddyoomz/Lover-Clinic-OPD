---
updated_at: "2026-06-10 — Cybersecurity hardening: WS1 (anon-surface lockdown) + WS2 (dep-vuln remediation) BOTH SHIPPED + DEPLOYED LIVE. WS3/WS4 remaining."
status: "DEPLOYED LIVE. WS1 = vercel client + firebase rules (Rule Q L2 11/11 on real prod). WS2 = vercel jspdf4/vite/postcss bundle (no rules change). prod frontend = ba43ebb8 LIVE; firestore.rules = WS1-tightened LIVE."
branch: "master"
last_commit: "ba43ebb8 — fix(security/WS2): remove dead html2pdf.js + bump jspdf 3->4.2.1 + vite 8.0.16 + postcss 8.5.15 (+ active.md commit after)"
tests: "full vitest 16343/16343 (post-WS1 V21 fixup + post-WS2 deps bump, both 0 fail). build clean. WS1 L2 scripts/diag-ws1-anon-lockdown.mjs 11/11 real prod. WS2 node API-compat scripts/diag-ws2-jspdf4-compat.mjs 5/5 + L1 real-browser PDF valid."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "frontend = ba43ebb8 LIVE (WS1+WS2). firestore.rules = WS1-tightened LIVE."
firestore_rules_version: "WS1 (2026-06-10) — opd_sessions get/list split; clinic_schedules get(public)/list+write(staff); chat create/update->isClinicStaff; form_templates get/list split. be_chart_templates kept signed-in read (residual)."
---

# Active — 2026-06-10 — Cybersecurity hardening WS1 + WS2 SHIPPED + DEPLOYED

## State
- prod LIVE: vercel `ba43ebb8` + firebase WS1 rules. Tree clean (after this active.md commit). Audit done 2026-06-10; 4-workstream plan (Q1=risk order, each its own spec+plan+deploy).

## WS1 — Anon-Surface Lockdown (CRIT+HIGH) ✅ DEPLOYED
- C1 opd_sessions read→get(signed-in)/list(staff) — killed anon mass-PII dump (was REAL on live prod). H1 chat create/update if-true→isClinicStaff (webhooks use admin SDK). H2 clinic_schedules get(public)/list+write(staff). M2 form_templates get/list split; be_chart_templates kept signed-in read (anon TFP lists, low-PII residual).
- Rule Q L2 `scripts/diag-ws1-anon-lockdown.mjs`: RED-before 5/11 (anon could dump opd_sessions etc.) → GREEN-after **11/11** on real prod. Rule B probe#1 updated (chat anon POST 200→403). spec: `docs/superpowers/specs/2026-06-10-ws1-anon-surface-lockdown-design.html`.

## WS2 — Dependency Vuln Remediation (2 CRIT + HIGH/MOD) ✅ DEPLOYED
- html2pdf.js REMOVED (dead dep, CRIT XSS) · jspdf 3→4.2.1 (CRIT, NOT reachable in our flat-image usage — no AcroForm/loadFile) · vite 8.0.1→8.0.16 (HIGH dev-server) · postcss 8.5.8→8.5.15 (MOD build-time). npm audit: **criticals now 0**.
- Verify: node API-compat **5/5** (`scripts/diag-ws2-jspdf4-compat.mjs`) + build clean + full vitest 16343/0 + **L1 real-browser** html2canvas→jspdf4 = valid %PDF (Thai content rendered). spec: `docs/superpowers/specs/2026-06-10-ws2-dependency-vuln-remediation-design.html`.

## Honest gap (Rule Q-honest)
- WS1: no real-browser L1 of rendered patient PAGES (Chrome MCP not connected) — Firestore ops proven via real client SDK (L2). WS2: L1 PDF done on local dev serving identical committed source (= the deployed bundle, vercel-only precedent); not re-driven on the live URL (auth-gated).

## Next action (WS3 / WS4 — from the 2026-06-10 audit, NOT yet started)
- **Public-endpoint hardening**: api/patient-view.js + api/branch-line-oa.js — IDOR/enumeration (token crypto strength + length), PII in response, NO rate-limiting on public data endpoints. + send.js outbound-message-abuse auth review. + bootstrap-self review.
- **Security headers**: no vercel.json `headers` block — add CSP / HSTS / X-Frame-Options / X-Content-Type-Options / Referrer-Policy.
- **Deferred deps cluster**: firebase-admin 14 major (server, breaks-risk across api/admin+cron, low reachability) + fast-xml-builder/picomatch/tmp HIGH (transitive dev). Separate careful chunk.
- Each = own spec+plan+deploy. Await user direction on which next.

## Outstanding user-triggered (NOT this work)
- `npm run test:extended` 283 fail = V50-deleted tabs in stale RTL (opt-in).
- SESSION_HANDOFF.md ~207 KB over 200 KB soft-cap → archival on a maintenance turn.
