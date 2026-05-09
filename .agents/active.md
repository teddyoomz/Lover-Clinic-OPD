---
updated_at: "2026-05-09 EOD #22 — V64-fix9..fix14 hub UX overhaul + Editorial Ember redesign DEPLOYED"
status: "master=ad7ee0e · prod=ad7ee0e · 0 ahead · 8199 passed · build clean · DEPLOYED"
branch: "master"
last_commit: "feat(V64-fix14): mobile responsive polish + count text equal weight"
tests: 8199
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ad7ee0e"
firestore_rules_version: 29
storage_rules_version: 2
---

# Active Context

## State
- master = `ad7ee0e` · prod = `ad7ee0e` (0 ahead — combined deploy 2026-05-09 EOD #22)
- 6 V64-fix commits since prior prod (`dcb6c41` from EOD #21): fix9 → fix10 → fix11 → fix12 → fix13 → fix14
- Invariant set unchanged (AV1-AV30 + AV32-AV36 + BS-1..BS-16 + CB-1..5)

## What this session shipped
- **V64-fix9** (`9b90bb7`) — 8 hub UX polish: real-time tab refresh on appt mutation (`appointmentDataVersion` counter mirroring V64-fix7 treatmentDataVersion), sort filteredAppts by date+startTime ASC (`sortApptsByDateTimeAsc` helper in `appointmentHubFilters.js`), time chip emphasis (amber), purpose chip emphasis (emerald), patient name sky color + text-base, doctor badge moved to TabBar rightContent compact chips, `BranchSelector` added to BackendTopBar (mobile <lg fix), Home button (กลับ Frontend) in mobile + desktop. +13 tests (V64.R9 ×5 + V64.F9 ×8).
- **V64-fix10** (`6dbe23c`) — finance chips bumped to text-xs + font-bold + border + dark-mode + emoji prefix (💰 Wallet · 🏷️ มัดจำ · ⚠️ ค่างชำระ · 📈 ยอดสั่งซื้อ). data-testids `row-chip-{wallet,deposit,outstanding,lifetime}`.
- **V64-fix11** (`780a750`) — "Editorial Ember" redesign per `.impeccable.md` (Dark + Fire/Ember + Premium masculine). NEW shared style module `_apptHubStyles.js`: 3 button tiers (PRIMARY ember gradient · SECONDARY sky outline ghost · DESTRUCTIVE rose ghost) + LINE brand `#06C755` + tab pills (ember active, ghost inactive) + card surface (gradient + warm hover border) + status accent bar (3px gradient left edge: missed/pending/confirmed/done/cancelled). Patient name bumped to text-lg font-black. HN font-mono uppercase tracking-widest. Detail block: `<dl><dt><dd>` grid `[auto_1fr]`. R4.11 regex relaxed for refined "GOLD · เหลือ N วัน".
- **V64-fix12** (`642c79a`) — doctor badge `ml-auto` → `mx-auto` (center of remaining space, not pinned-right).
- **V64-fix13** (`1166367`) — doctor badge moved from TabBar.rightContent → FilterBar.doctorBadge (beside "รายการนัดหมาย" heading). Chips bumped to text-sm + px-3 py-1.5 + rounded-lg + shadow + font-black mono time. Reserved space via `min-h-[44px]` on slot wrapper (no UI jump on tab switch).
- **V64-fix14** (`ad7ee0e`) — "N คน" count text bumped to `text-sm font-black text-tx-heading` (peer of heading); `data-testid="appt-hub-result-count"` added. RowCard mobile responsive: LEFT/MIDDLE `min-w-0 md:min-w-[260px]` (no overflow on 320px), RIGHT section always `flex flex-col` (was `flex md:flex-col` causing horizontal crowd on mobile), `items-start md:items-end`, button group `md:justify-end`, RIGHT min-w only on md+.
- **DEPLOY** — combined `vercel --prod` (60s exit 0; aliased `lover-clinic-app.vercel.app`) + `firebase deploy --only firestore:rules` (idempotent — rules unchanged). Probe-Deploy-Probe: probe 1 + 5 GREEN both pre+post; probes 2/3/4 V50-followup-2 expected false-positive. Cleanup: 4 probe artifacts nuked.

## Next action
Idle — V64-fix9..fix14 deployed; production stable.

## Outstanding user-triggered actions
- (Optional, unchanged) `scripts/probe-deploy-probe.mjs` probes 2/3/4 still test V50-stripped collections — false-positive 403 each deploy; ignored manually per Sessions #20-#22 precedent.
- (Optional, unchanged) `bsa-task7-h-quater-fix` flake — passes standalone, flakes in full-suite parallel runs.

## Institutional memory anchors (carried forward + V64-fix9..14 additions)
- `_apptHubStyles.js` — single source of truth for hub buttons / tabs / cards / accent bars / status chips. Future hub additions MUST import from there (Rule of 3 lock at 9+ usages across 5 components).
- `customerNavigation.js` Phase 15.7-septies pattern — 4th adopter (V64-fix8). Canonical for "navigate to customer detail".
- V63 + V62-bis / AV35 — admin calendar 🔥 from canonical `be_staff_schedules`.
- V62 / AV34 — schedule-link `doctorDays` + `customDoctorHours` derive ALL modes.
- V61 / AV33 — schedule-link modal room dropdown from canonical.
- V60 / AV32 — schedule-link `doctorDays` derive-and-merge canonical pattern.
- V54 / BS-13 — raw listener safe-by-default architectural backstop.
- V53 / BS-12 — time-axis branch-aware.
- V52 / BS-11 — report-tab branch-refresh.
