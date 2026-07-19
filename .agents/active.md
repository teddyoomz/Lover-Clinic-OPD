---
updated_at: "2026-07-19 EOD+3 — Infra Health Monitor + Error Beacon + TFP keystroke isolation SHIPPED local (NOT deployed)."
status: "master `2d6ac980` = 4 commits ahead of prod `a61ad87a`. iPhone push popup USER-CONFIRMED (AV210 fully closed). NEW: observability batch (AV211) + TFP #20 — awaiting explicit 'deploy' (vercel-only; firestore.rules UNCHANGED)."
branch: "master"
last_commit: "2d6ac980 — perf(tfp): buy-modal keystroke isolation (#20)"
tests: "full vitest 17,887/17,887 · 0 fail (definitive json, post-Spec-B). Do NOT re-run at boot."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "a61ad87a (2026-07-19 EOD+2)"
firestore_rules_version: "UNCHANGED — next deploy = vercel-only, no Probe-Deploy-Probe"
---

# Active — 2026-07-19 EOD+3 — Observability batch + TFP #20 shipped local

## State
- iPhone test-push popup confirmed by user → AV210 push saga 100% closed.
- Spec A (Infra Health Monitor + Client Error Beacon, AV211) + Spec B (TFP buy-modal
  keystroke isolation #20) both SHIPPED local + pushed. NOT deployed (V18).
- Checkpoint: `.agents/sessions/2026-07-19-eod3-observability-tfp20.md`.

## What this session shipped
- **Health cron** `infra-health-sweep` (07:30 BKK): checks backup/11 crons/recon/push-token
  freshness/error volume via pure `infraHealthCore.js`; alerts staff-chat card (kind
  `infra-health`) + LINE OA text (FCM-independent — FCM can't announce its own death).
- **Error beacon**: onerror/unhandledrejection/AppErrorBoundary (จอดำ→หน้า reload) →
  `/api/client-error` (cap 500/วัน, PHI-safe URL) → `client_error_log` default-deny →
  admin viewer. **UI**: การ์ด "🩺 สุขภาพระบบ" ใน SystemSettingsTab (config LINE targets +
  ทดสอบแจ้งเตือน + ตรวจตอนนี้ + error viewer) + task ใน ScheduledTasksTab (12 tasks).
- **Anti-drift lock**: classifier test — cron ใหม่ใน vercel.json ต้องประกาศ health coverage.
- **TFP #20**: buyQuery/cat/limit + filter memo ย้ายเข้า TfpBuyModal — keystroke ไม่ re-render
  ฟอร์มเงิน 5.3k บรรทัดอีก; money state/handlers อยู่ TFP เดิม 100%.
- Verified: L2 จริง (diag-infra-health 13/14 ok บน prod + e2e-client-error 10/0 + beacon
  sendBeacon proof ใน browser จริง) + Playwright L1 10/10 (buy modal, TEST fixture cleaned).

## Next action
- **User พิมพ์ "deploy"** → vercel-only. Post-deploy: การ์ดสุขภาพระบบ → ตั้ง LINE target →
  กด "ทดสอบแจ้งเตือน" → ต้องเห็นการ์ดใน staff chat + LINE เด้งจริง (L1 ปิดท้าย) ·
  health cron รอบแรก 07:30 BKK · beacon full round-trip live.
- Retention cron คืนแรก: `node scripts/diag-cron-first-night.mjs` (พรุ่งนี้) — health card
  จะโชว์ 🟡 archive-retention "ไม่เคยรัน" จนกว่ารอบแรกคืนนี้ผ่าน (ถูกต้องตามจริง).

## Outstanding user-triggered actions
- "deploy" (V18) · desktop toast = Windows notification settings ที่เครื่องคลินิก ·
  standing L1 stack (wheel guard / VIP sort / AV209 / TFP เครื่องช้า / mobile).

## ⚠️ Landmine เดิม — `scripts/trim-session-handoff.mjs` BUGGY (ห้ามรัน; trim มือเท่านั้น)
