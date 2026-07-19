# Checkpoint 2026-07-19 EOD+3 — Infra Health Monitor + Error Beacon (AV211) + TFP keystroke isolation (#20)

> User: iPhone popup เด้งแล้ว (AV210 ปิด) + "/brainstorming เหลืออะไรที่เป็นห่วง..." → เสนอ 3 งาน →
> "ทำหมดเลย แต่ห้ามเพิ่มบั๊ค อย่างเช่นที่ noti หายไป" → Q1=staff-chat+LINE, Q2=beacon ทุกหน้า → spec→plan→inline.
> master `2d6ac980` = 4 commits ahead of prod `a61ad87a` (rules UNCHANGED → deploy = vercel-only). NOT deployed (V18).

## Summary
ปิด class "infra ตายเงียบ" (push 12 วัน / backup 5 วัน / cron 46 รอบ — user เจอเองทุกครั้ง): health cron
รายวันเฝ้าทุก liveness surface + แจ้งเตือน 2 ช่องที่อิสระจาก FCM; client error ทุกหน้า (รวมลิ้งลูกค้า)
มองเห็นได้ใน viewer ภายในนาที; และ TFP #20 — keystroke ค้นหาใน buy modal ไม่ re-render ฟอร์มเงินอีก.
ศูนย์การแตะ firestore.rules / CSP / SW / push path (blast-radius audit ฝังเป็นเทส).

## Current State
- Full vitest **17,887/17,887 · 0 fail** (definitive json) + build clean + AV210 bank green.
- Health cron `infra-health-sweep` (07:30 BKK): `infraHealthCore.js` pure evaluator + EXPECTED_MAX_AGE ต่อ cron
  + classifier (vercel.json crons ⊆ declared coverage — cron ใหม่ลืมประกาศ = เทสแดง) + UNMONITORED ประกาศชัด
  (patient-view-warmup). Alert = staff-chat card kind `infra-health` (id/วัน idempotent; StaffChatSystemCard
  branch ใหม่ post-hooks) + LINE OA text ต่อ target (`getLineConfigForBranch`+`pushLineMessage`; 410 จดในการ์ด).
- Beacon: `errorBeacon.js` (dedupe 1/5min·cap 20/session·self-safe) + `AppErrorBoundary` + `clientErrorCore.js`
  (sanitize client + validate server ร่วมไฟล์เดียว; URL เก็บชื่อ param เท่านั้น) + `api/client-error.js`
  (tx daily cap 500 → 200 dropped กัน retry storm) + `api/admin/client-errors-list.js` + retention 30 วันใน cron.
- UI: `InfraHealthSection.jsx` ใน SystemSettingsTab (status + LINE targets + ทดสอบแจ้งเตือน + ตรวจตอนนี้ +
  error viewer) · `system_config.infraHealth` additive · registry task ที่ 12 (+ run-now ฟรีจาก ScheduledTasksTab).
- TFP #20: buyQuery/cat/limit + filter memo → TfpBuyModal (verbatim); reset = mount-fresh + [buyModalType] effect;
  money state/handlers TFP เดิม 100%; props −8 view +buyItems.

## Verification (Rule Q)
- L2 จริงบน prod: `scripts/diag-infra-health.mjs` (read-only) = 13/14 ok + 🟡 จริง 1 ตัวถูกต้อง
  (archive-retention "ไม่เคยรัน" — รอบแรกคืนนี้ 03:20 = monitor เฝ้า todo ที่ค้างให้เอง) + push token สด 3 ·
  `scripts/e2e-client-error-endpoint.mjs` 10/0 (handler จริง: token stripped server-side / over-cap dropped /
  cleanup zero-orphan + meta restored).
- L1: beacon จับ uncaught error จริงใน browser → `sendBeacon('/api/client-error')` payload sanitized (round แรก
  "เงียบ" เพราะ sendBeacon มองไม่เห็นใน network monitor — instrument พิสูจน์) · การ์ดสุขภาพระบบ render กับ
  prod data จริง (getAdminAuditDoc null → empty state ถูกต้อง) · **Playwright buy-modal 10/10** browser จริง
  (seed TEST-AV192-COURSE → cleaned).
- Repro เทส 3 เหตุการณ์ประวัติศาสตร์ (AV210 token เก่าล้วน / V122 backup fail / dead-cron 5 วัน) → ทุกอันต้อง alert.
- Honest gaps: Q-vis screenshot การ์ด = harness renderer stuck (DOM+console+RTL แทน; ดูจริง post-deploy) ·
  alert ตัวจริง (การ์ด+LINE เด้ง) + beacon full round-trip = post-deploy L1.

## Commits
```
8deef22c docs(spec+plan): infra health monitor + client error beacon
7d432634 feat(observability): structure (16 files)
72211bb1 test(observability): AV211 bank 72/0 + V21 repoints + L2 e2e
2d6ac980 perf(tfp): buy-modal keystroke isolation (#20)
```

## Files Touched
NEW: infraHealthCore/clientErrorCore/errorBeacon (src/lib) · AppErrorBoundary · InfraHealthSection ·
api/cron/infra-health-sweep · api/client-error · api/admin/{client-errors-list,infra-health-test-alert} ·
scripts/{diag-infra-health,e2e-client-error-endpoint}.mjs · tests ×6 · specs/plans ×4.
MOD: main.jsx · SystemSettingsTab · StaffChatSystemCard · systemConfigClient · scheduledTasksRegistry ·
vercel.json (crons/functions เท่านั้น) · TfpBuyModal · TreatmentFormPage · เทส repoints ×4 · AV SKILL ×2 (AV211).

## Decisions (1-line each)
- Alert ช่องคู่ staff-chat+LINE — FCM ประกาศความตายตัวเองไม่ได้ (วนตัวเอง).
- client_error_log default-deny + endpoints — ศูนย์ rules change ทั้ง batch (ลด blast radius ตาม "ห้ามเพิ่มบั๊ค").
- enabled/threshold อยู่ scheduledTasks rail เดิม; infraHealth key เก็บแค่ routing (ไม่สร้าง config home ซ้อน).
- daily cap ตอบ 200 dropped (ไม่ 429) — กัน client retry storm.
- warmup = UNMONITORED ประกาศชัด (liveness write 288/วัน ไม่คุ้ม stakes).
- TFP: ย้ายเฉพาะ view-filter; reset = mount-fresh + effect (verbatim semantics).

## Next Todo
1. **User: "deploy"** → vercel-only → การ์ดสุขภาพระบบ → ตั้ง LINE target (เลือกสาขา OA ที่ user เป็นเพื่อน) →
   กด "ทดสอบแจ้งเตือน" → เห็นการ์ด staff chat + LINE เด้งจริง = L1 ปิดท้าย. Health cron รอบแรก 07:30.
2. Retention cron คืนแรก: `node scripts/diag-cron-first-night.mjs` (พรุ่งนี้) — health card จะเลิก 🟡 เอง.
3. Standing: desktop toast (Windows settings) + user L1 stack เดิม.

## Resume Prompt
Resume LoverClinic — 2026-07-19 EOD+3. Observability batch (AV211) + TFP #20 shipped local, NOT deployed.
master `2d6ac980` (4 ahead of prod `a61ad87a`; rules UNCHANGED). Full vitest 17,887/0.
Next: user "deploy" → post-deploy L1 (LINE target + ทดสอบแจ้งเตือน) + cron first-night check.
Read CLAUDE.md → SESSION_HANDOFF.md → .agents/active.md → 00-session-start.md → this checkpoint.
