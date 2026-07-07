# Checkpoint 2026-07-07 (cont.) — link-patient LCP fix + header strip + configurable LINE keywords — ALL DEPLOYED

## Summary
Three ships in one session, all deployed + live-verified: (1) the deferred link-patient LCP 4.3s
data-chain fix (AV204); (2) customer-link header strip (no avatar/HN, "ข้อมูลลูกค้า"); (3) admin-
configurable LINE id-link keyword set (เมนูคำขอผูก LINE). firestore.rules UNCHANGED all session.

## Current State
- master `92b9ba15` = prod (`lover-clinic-y5fpano5s` aliased lover-clinic-app.vercel.app, HTTP 200).
- Full vitest **17,336/17,336 · 0 fail** (definitive json run; one earlier "1 fail" = parallel flake). Build clean.
- link-patient LCP: local-preview 3780→2040ms (−46%) · LIVE prod **3472→2212ms (−36%)**.
- /api/patient-view: hn stripped + branch-gets parallel — LIVE payload-identical per `scripts/diag-patient-view-l2.mjs`.
- Keywords doc `clinic_settings/link_id_keywords` NOT created on prod (defaults active) — admin creates it via the card.

## Commits
```
92b9ba15 perf(measure): live prod link-patient after-lcpfix (LCP -36%)
e9f6dd92 feat(customer-link+line-bot): header strip + configurable id-link keywords
f08dfc34 docs(plan): customer-link header + LINE keywords (7 tasks)
1dce88b4 docs(spec): same (approved Q1=B/Q2=Customer Info/Q3=strip hn/Q4=global)
b1e1bbea docs(active): lcpfix shipped local
907d373b perf(link-patient): LCP -46% — entry-time early fetch (AV204)
```

## Files Touched
- LCP: `src/lib/patientViewEarlyFetch.js`(new) · `src/main.jsx` · `src/pages/PatientDashboard.jsx` ·
  `api/patient-view.js` · `vite.config.js`(narrow proxy) · `scripts/diag-patient-view-l2.mjs`(new) ·
  `tests/perf-link-patient-early-fetch.test.js`(new) · AV204 both SKILL.md copies · docs/perf/punchlist.md
- Header/keywords: `src/pages/PatientDashboard.jsx` · `api/patient-view.js` · `src/lib/lineBotResponder.js` ·
  `api/webhook/line.js` · `src/lib/idLinkKeywordsClient.js`(new) · `src/components/backend/LinkRequestsTab.jsx` ·
  `tests/line-link-keywords-configurable.test.js`(new) · `tests/link-keyword-settings-card-rtl.test.jsx`(new)
- V21 repoints: customer-patient-link-flow-simulate F3 · v33-9 C6 (intent-precise, not window-grep)

## Decisions (1-line each)
- AV204: public-link fetches needing no Firebase auth start at ENTRY time; NO warm chunk import (module-map
  failure poisoning on iOS Safari → React.lazy black screen — adversarial-review finding, removed).
- Vite proxy stays NARROW (`/api/patient-view` only) — structural B6 lock; bare `/api` would hit prod from dev.
- Keywords storage = NEW `clinic_settings/link_id_keywords` (spec AMENDED from chat_config — secret-locked
  WS1-C2-bis); covered by existing wildcard rule → zero rules change; webhook reads w/ 60s TTL cache.
- Hint (ID_REQUEST_INVALID) renders first configured keyword; th/en defaults byte-identical to legacy.
- Q1=B centered card · Q2 "Customer Info" · Q3 hn stripped from anon payload · Q4 global single list.
- Honest gaps: bot-on-real-LINE with a CUSTOM keyword = user L1 (interpret layer unit-locked + live doc
  round-trip done); endpoint cold start ~3.5s remains (warmup-cron option parked in punchlist).

## Verification (Rule Q inventory)
- L1 real browser: LCP matrix 24/24 · DISABLED-branch lifecycle 11/11 (TEST fixture → pristine) ·
  header/card TH+EN+mobile 12/12 · keywords LIVE round-trip on real prod 22/22 · LIVE deployed URL 5/5 +
  screenshots eyeballed (Q-vis). Pixel parity (LCP fix) 0.000%/0.000% loaded-vs-loaded.
- L2: local handler vs LIVE endpoint payload-identical (pre+post deploy) · hn absent live.
- Tests: +51 new locks; full suite 17,336/0; 2-agent adversarial review (both findings fixed).

## Next Todo
1. User L1: มือถือจริงเปิด ?patient= (เร็ว + หน้าใหม่) · LINE จริงพิมพ์ link/คำ custom → คิวคำขอผูก.
2. Parked: punchlist deferred items (cold-start, movement-log pagination, opd_sessions retention).

## Resume Prompt
Resume LoverClinic — 2026-07-07 EOD. All shipped + deployed (lover-clinic-app.vercel.app).
Read CLAUDE.md → SESSION_HANDOFF.md → .agents/active.md → .claude/rules/00-session-start.md →
this checkpoint. 17336/0 tests. Status: idle — awaiting user L1. No deploy without "deploy" (V18).
