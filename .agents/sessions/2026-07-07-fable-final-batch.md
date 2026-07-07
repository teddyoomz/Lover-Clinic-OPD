# Checkpoint 2026-07-07 EOD+3 — Fable-5 final batch — SHIPPED + DEPLOYED LIVE

## Summary
User: "ไล่ทำเลย ยังมีเวลา" on the Fable farewell wishlist → 4 workstreams executed, 2 wishlist items
discovered ALREADY-DONE (verify-first), full Fable-5 final review (per user "กลัวจริงๆ... 100% แล้วค่อย Deploy"),
then deployed. FINAL gate: full vitest **17,526/17,526 · 0 fail** (even the phase15.5b flake passed) +
extended **2,668/0** + build clean + L1/L2 below.

## Shipped (all committed + pushed + deployed; rules UNCHANGED → vercel-only)
1. **TFP extraction steps 1+2** (extraction-only, verbatim): 7 memo leaf components →
   `src/components/treatment-form/TfpFormPrimitives.jsx`; 6 item-entry modals (lab/med/medGroup/
   remed/cons/consGroup) → `TfpItemModals.jsx`. TFP 5,946→5,330. State+handlers stay in TFP
   (explicit props); mount-conditionals stay at callsites (V160). Buy modal NOT moved (V13 money
   history — next session). V21 repoints: tf2 (anchors→family union) · TF3.D.2/E.8 · V125 aaAccent
   wraps→family · cc-button-row textarea→primitives. NEW execution smokes (V163 net): 8 SMK + eslint
   0 no-undef.
2. **Money reconciliation (V155/V157 residual CLOSED)**: SSOT pure `src/lib/reconcileSaleCore.js`
   (injected fetchers) → `reports-reconciliation` tab (BS-11; DateRangePicker; drill-down; cron
   banner via deterministic getDoc) + `api/cron/money-reconciliation-sweep` (04:15 BKK; idempotent
   `be_admin_audit/recon-daily-YYYYMMDD`). Verdict discipline: deterministic-only discrepancies
   (deposit usage / wallet net V158 / cancelled-reversal V153 / courses total-failure V104);
   stock + active-points = INFO. **False positive adjudicated + killed pre-ship**: audit-flow sales
   (source reduceRemaining/addRemaining/exchange/share = course-mutation records) → info.
   Sale total display = `billing.netTotal` (real prod shape).
3. **CentralStockTab in-place modal (V144/AV173 deferred instance CLOSED)**: exported
   `CentralOrderCreateForm`; NEW `CentralStockActionModal` (adjust = AdjustCreateForm
   branchId=warehouseId; order = central Vendor PO form; AV78+AV205 shell); handlers →
   setCentralAction (s22 prefill plumbing removed). CB1 flipped to lock CLOSED; S22.B repointed;
   AV173 updated BOTH SKILL.md (byte-identical, SY1 green). CSM.1-3 RTL smokes.
4. **tests/extended revival**: ROOT CAUSE = vite.config became a FUNCTION (filler-obfuscator gate,
   ~2026-06-20) but vitest.extended.config.js spread it as an object → no jsdom → every .jsx suite
   died silently ("window is not defined"). Fix = call the function → +125 tests instantly.
   Remaining 317 stale asserts / 49 files → `quarantineStale20260707` ledger (per-file counts,
   reversible; un-park guidance in config comment).

## Verification (Rule Q)
- **L2 real prod**: `scripts/diag-money-reconciliation-l2.mjs` — EXACT cron path over 17 real sales
  (3 days), initial run flagged INV-20260706-0001 → adjudicated FALSE POSITIVE → fixed → 17/17 clean.
- **L1 real browser** (`tests/e2e/session-final-review.spec.js`, dev server → real prod Firestore):
  FR1 PASSED — bloom nav → recon tab → นครราชสีมา switch → 39 sales scanned → all-clear banner +
  verdict table + real baht + drill-down (screenshot eyeballed, Q-vis). FR2 — central tab renders +
  navigates; modal-open click SKIPPED (central warehouse has 0 stock rows — real-data limit; modal
  execution covered by CSM RTL). L1 lessons: ArcBloom orbs float → force:true + `visible=true`
  filters; **tab= deep links land on bloom home in new-menu mode (pre-existing, ALL tabs — noted)**.
- **LIVE post-deploy L2**: deployed cron triggered with CRON_SECRET → 200 →
  `recon-daily-20260706` written (checked 5, discrepancy 0). Alias 200 + fresh version.json.
- L1 found + fixed pre-deploy: `reports-reconciliation` missing from ALL_ITEM_IDS (deep-link
  whitelist) → navConfig registered (+ D.1 count 60→61).

## Discovered ALREADY-DONE (wishlist was stale — verify-first)
- Chart PNG→Storage-ref: shipped 2026-05-22; prod legacy inline charts = **ZERO**
  (`scripts/diag-legacy-inline-charts.mjs`) → no backfill. CLOSED.
- Movement-log growth: V106 `stock-movement-retention` cron archives→deletes daily → bounded. CLOSED.
- Remaining true backlog → memory `project_next_model_backlog.md` (TFP buy modal · opd_sessions
  archive-retention 180d · ArcBloom deep-link gap · un-park quarantined extended files).

## Next Todo
1. User L1: recon tab + TFP modals + central ปรับ/+ modal + the earlier batch (mobile cold-start /
   AV205 / push).
2. Next session: TFP buy-modal extraction (pattern established) · opd_sessions archive-retention
   (investigate referenced classes first, dry-run → user OK).

## Resume Prompt
Resume LoverClinic — 2026-07-07 EOD+3. Fable-5 final batch (TFP extraction ×2 + reconciliation
tab/cron + CentralStock modal + extended revival) SHIPPED + DEPLOYED LIVE (master = prod).
Read CLAUDE.md → SESSION_HANDOFF.md → .agents/active.md → 00-session-start.md → this checkpoint.
17,526/17,526 full + 2,668/0 extended. Status: idle — awaiting user L1. No deploy without "deploy" (V18).
