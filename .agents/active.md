---
updated_at: "2026-07-07 EOD+3 — Fable-5 final batch: TFP extraction ×2 + reconciliation (tab+cron) + CentralStock modal + extended-suite revival — SHIPPED + DEPLOYED LIVE."
status: "master = prod. Awaiting user L1 (มือถือ/iPad + backend จริง) for this batch + the earlier instant-coldstart/AV205 batch."
branch: "master"
last_commit: "(state-files commit) — code head = feat(recon)+test nav registration + L1 spec"
tests: "FINAL gate full vitest 17,526/17,526 · 0 fail (flake also passed) + extended 2,668/0 + Playwright L1 FR1 PASSED on live prod data (screenshot) + Rule Q L2 recon 17 sales real prod. Build clean. Do NOT re-run at boot."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "= master code (deploy 2026-07-07 EOD+3, vercel-only; firestore.rules UNCHANGED → no Probe-Deploy-Probe)"
firestore_rules_version: "UNCHANGED"
---

# Active — 2026-07-07 EOD+3 — Fable-5 final batch

## State
- master = prod LIVE (alias 200; live cron L2: recon-daily-20260706 written on the DEPLOYED endpoint — checked 5, discrepancy 0).
- 4 workstreams shipped this session (detail → checkpoint `.agents/sessions/2026-07-07-fable-final-batch.md`):
  1. TFP extraction steps 1+2 (5,946→5,330 lines; primitives + 6 item modals → src/components/treatment-form/)
  2. Money reconciliation — reports-reconciliation tab + nightly cron 04:15 BKK (V155/V157 residual CLOSED)
  3. CentralStockTab in-place adjust/order modal (V144/AV173 deferred instance CLOSED; CB1 flipped)
  4. tests/extended revived — config drift fixed (+125 tests) + 49 stale files quarantined w/ ledger → 2,668/0

## Next action
- **User L1**: ① recon tab (รายงาน → ตรวจความครบธุรกรรม): เลือกช่วง → ตารางขึ้น + banner cron
  ② TFP เปิดฟอร์ม + modal ยา/แลป/สิ้นเปลือง เปิด-ปิด-บันทึกปกติ ③ คลังกลาง: ปุ่ม ปรับ/+ เปิด modal in-place
  (ต้องมี stock ในคลังกลางก่อนถึงเห็นปุ่ม) ④ ค้างจาก batch ก่อน: มือถือ cold-start + AV205 scroll + push.

## Outstanding user-triggered actions
- (none — prod = master). Next-model backlog → memory `project_next_model_backlog.md`
  (TFP buy-modal extraction · opd_sessions archive-retention 180d · ArcBloom deep-link gap noted).
