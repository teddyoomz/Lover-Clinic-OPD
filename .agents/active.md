---
updated_at: "2026-04-28 (s20 — V15 combined deploy COMPLETE; Phase 15.4 + 5 post-deploy fixes LIVE in production)"
status: "Production = ae2ab7e LIVE (matches master). All 5 post-s19 bug reports addressed + audit shipped. V15 combined deploy verified Pre+Post probe 6/6 + 4/4 negative."
current_focus: "Live QA on the 5 post-deploy fixes — verify in production browser"
branch: "master"
last_commit: "ae2ab7e"
tests: 2183
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ae2ab7e"
firestore_rules_version: 19
storage_rules_version: 2
---

# Active Context

## State
- master = `ae2ab7e` · **2183/2183** focused vitest pass · build clean (BD ~911 KB)
- Production = `ae2ab7e` LIVE — synced with master (V15 combined deploy complete this session)
- Working tree clean (after EOD docs commit)

## V15 combined deploy results (s20)
- **Vercel**: `lover-clinic-en5gqnqzd-teddyoomz-4523s-projects.vercel.app` → aliased `lover-clinic-app.vercel.app` (49s)
- **Firestore rules**: released to cloud.firestore (Phase 15.2 + s19 shape additions)
- **Pre-probe**: 6/6 positive 200 + 4/4 negative 403 ✓
- **Post-probe**: 6/6 positive 200 + 4/4 negative 403 ✓
- **Cleanup**: 4/4 (pc_appointments DELETE x2 + clinic_settings PATCH strip x2)
- **HTTP smoke**: root + /admin + /api/webhook/line = 200 ✓ (FB webhook 403 by-design)
- **Probe list extended**: 6 pos + 4 neg permanent (added `be_central_stock_orders` negative)

## What this session shipped (s20 — 2026-04-28)
6 commits:
- `69a5dd9` — bug 1 (V11 OrderPanel local-import) + bug 4 (gate includeLegacyMain on branch-tier) + 12 tests
- `f2b71ec` — bug 2 v2 (listStockMovements client-side branchId filter; drop dual-query Promise.all) + 27 tests refresh
- `244e909` — bug 3 AdjustDetailModal (mirrors Transfer/Withdrawal) + getStockAdjustment + wire row click + 21 tests
- `ae2ab7e` — bug 5 audit (12 emit sites + 22 regression tests + 2 regex relaxations)
- (this commit) — EOD docs + V15 deploy verification

Tests: 2123 → 2183 (+60 across 5 post-deploy fixes + audit).

## Next action
**Live QA on the 5 deployed fixes** — verify in production browser:
- Bug 1: stock tab → "+ สร้าง" → form renders (no blank screen)
- Bug 4: central tab → ปรับสต็อค → batch picker shows ONLY warehouse batches
- Bug 2: stock tab MovementLog → see both transfer + withdrawal cross-branch
- Bug 3: stock tab adjust list → click row → detail modal opens
- Bug 5: every movement type appears in correct branch+central logs

## Outstanding user-triggered actions (NOT auto-run)
- Live QA on the 5 fixes (above)
- Carry-over: admin LineSettings creds + webhook URL · backfill customer IDs · TEST-/E2E- prefix convention
- Deferred to Phase 15.5+: ActorPicker branchIds[] filter (was s18 EOD #7); Phase 15.4 central→branch dispatch flow; Phase 15.5 withdrawal approval admin endpoint
