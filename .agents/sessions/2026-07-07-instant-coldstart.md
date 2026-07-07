# Checkpoint 2026-07-07 EOD+2 — Instant Cold-Start (AV206+AV207) — SHIPPED + DEPLOYED LIVE

## Summary
User video: iPhone PWA cold-start after a long gap → นัด hub stuck "กำลังโหลด…" 7-10+s.
Shipped the full "instant staff app": Firestore persistent cache (SWR) + customer fresh-gate +
staged hub load + staff-wide SWR sweep + app-shell Service Worker. Deployed live (vercel-only,
rules unchanged) — this deploy also shipped the pending AV205 modal scroll-lock.

## Current State
- master `2cf71bdc` = prod (lover-clinic-app.vercel.app, alias 200, sw.js no-cache header live).
- full vitest **17,485/17,486** (1 = phase15.5b flake เดิม, green isolated 51/0; 2 V21 repoints).
- **Rule Q L1 Playwright 4/4 on LIVE prod**: S1 SWR offline paint + honest indicator · S2 server
  correction · S3 customer fresh-gate (never renders cache) · S4 SW offline shell.
- Measured: hub data-on-screen **1736 → 566 ms (−67%)** (desktop preview; mobile delta far larger —
  BEFORE is network-bound, cache paint is constant ~0.5s).
- Parity: worktree-before vs after, 34/40 ≤0.5%; 6 dark-only flags eyeballed = starfield noise
  (hub + link pages 0.000%).

## Decisions (Q&A locked)
- Q1=A: SWR staff + ลูกค้ารอ fresh (REVERSES 2026-06-16 fresh-always for STAFF only; freshGate
  preserves the customer contract).
- Q2=A: hub 2 จังหวะ (นัด+แพทย์ paint ก่อน; chip เสริม skeleton).
- Q3=B: ทั้ง staff app — 12 tabs ADOPT + sanctioned list in docs/perf/swr-inventory.md
  (reports/stock-ops/modals/admin = server-first with written reasons).
- Q4=B: Service Worker — precache small shell only, /assets CacheFirst, never /api|googleapis,
  update toast + hidden-auto-reload, kill-switch, FCM SW moved to dedicated scope.

## Key files
- NEW: `src/lib/freshGate.js` · `src/lib/swrRead.js` · `src/components/SyncIndicator.jsx` ·
  `src/components/SwUpdateToast.jsx` · `docs/perf/swr-inventory.md` ·
  `docs/perf/instant-coldstart-report.md` · `tests/instant-coldstart-*.test.*` (5 files) ·
  `tests/e2e/instant-coldstart-swr.spec.js`
- Modified: `src/firebase.js` (persistentLocalCache + IDB detect) · `src/App.jsx`
  (storage.persist) · `src/main.jsx` (registerSW + toast) · `vite.config.js` (VitePWA) ·
  `vercel.json` (/sw.js no-cache) · `src/lib/backendClient.js` (+`_getDocsBySource`+`_tagCache`,
  {source} on 16 getters) · `src/lib/reportsLoaders.js` · `AppointmentHubView` (loadCore/
  loadEnrichment) + `AppointmentHubRowCard` (skeleton chips) · `AdminDashboard` (FCM scope ×2) ·
  12 swept tabs + `MarketingTabShell` (syncing prop) · AV206/AV207 both SKILL.md (SY1).

## Bugs the L1 caught (institutional)
1. **__fromCache honesty**: network-down "server" `getDocs` silently serves cache → indicator
   cleared while stale. Fix = `_tagCache` non-enumerable flag from REAL `snap.metadata.fromCache`
   read by `swrRun/_resultFromCache`.
2. **S4 SW race**: `reg.active` non-null at state 'activating' (precache still downloading on a
   real network) → reload before control → offline dead. Localhost never showed it. Fix = gate on
   `activated` + populated precache + controlled settle loop.

## Next Todo
1. User L1 มือถือ/iPad จริง: cold-start นัด hub instant + "กำลังซิงค์…" + modal scroll (AV205) +
   customer links fresh + push ยังมา (FCM re-scoped; self-heal re-mints on first staff load).
2. If iOS evicts IndexedDB after very long disuse → behavior degrades to staged+SW path (ยังเร็ว
   กว่า baseline เดิม) — no action needed.

## Resume Prompt
Resume LoverClinic — 2026-07-07 EOD+2. Instant cold-start (AV206/AV207) + AV205 DEPLOYED LIVE
(master 2cf71bdc = prod). Read CLAUDE.md → SESSION_HANDOFF.md → .agents/active.md →
.claude/rules/00-session-start.md → this checkpoint. 17,485/17,486 (1 known flake). Status: idle —
awaiting user L1 มือถือจริง. No deploy without "deploy" (V18).
