---
updated_at: "2026-07-21 ~03:00 — whole-app risk-audit worry list CLOSED (12/12 tasks) — SHIPPED local, NOT deployed"
status: "master `2c277f7f`+ = 6 commits ahead of prod `31f87210`. rules UNCHANGED → next deploy = vercel-only. FULL vitest 18,120/18,120 · 0 fail (exit-0) + build clean + L1 QR/banner on real surfaces + Rule M backfill APPLIED on prod."
branch: "master"
last_commit: "2c277f7f — test(repoint): 5 stale V21 locks from 2026-07-20 AV212-R2 + probe-20"
tests: "FULL 18,120/0 exit-0 (326s) + ~100 new tests + build clean. 5 stale repoints = yesterday's AV212-R2/probe-20 drift, NOT this batch."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "31f87210 (AV214) — pre-batch"
firestore_rules_version: "2026-07-20 NIGHT (be_line_friends + probe #20) — UNCHANGED this batch"
---

# Active — 2026-07-21 — worry-list sweep เสร็จทั้ง 12 · รอ "deploy"

## Shipped this batch (จาก whole-app 5-dimension audit)
1. 💣 Rule M backfill APPLIED: 3 legacy inline-blob be_treatments (1021KB=100% cap!) → Storage, docs เหลือ 5/8/3KB
2. FB webhook fail-closed (เคย fail-open — พิสูจน์สดบน prod: unsigned POST ได้ 200) + checkRevoked + cron fail-closed
3. Warn contract: backup partial-fail + LINE-reminder failed-night → การ์ดสุขภาพเตือน (เคยเขียวหลอก)
4. Dead-man's switch (HEALTHCHECK_PING_URL — user ต้องสมัคร healthchecks.io + ตั้ง env) + staleness banner 2 shells
5. Retention keep-last-valid guard (V122 streak จะไม่ลบ backup valid ตัวสุดท้ายอีก)
6. QR self-host (<QrImage> — เลิกพึ่ง api.qrserver.com; L1 จริงบน CustomerPatientLinkModal + Q-vis)
7. Heartbeat dedup 144→2 docs/วัน + npm uninstall cheerio/bottleneck + off-site pull (F:\LoverClinic-backups
   มี auto-20260720-0301 verified แล้ว) + docs/RUNBOOK-restore.md

## Next action
- ⏰ background waiter จะเช็ค infra-health sweep รอบแรกหลัง 07:35 อัตโนมัติ (งานปิดท้าย per user)
- รอ user สั่ง "deploy" → vercel-only → post-deploy: `node scripts/diag-webhook-signature-probe.mjs`
  (FB ต้อง 401 = prove-green) + `diag-infra-health.mjs`

## Outstanding user-triggered
- สมัคร healthchecks.io (ฟรี) → ใส่ HEALTHCHECK_PING_URL ใน Vercel env
- ยืนยัน LINE/FB channel secrets เคย rotate หลัง WS1 (10 มิ.ย.) หรือยัง (comment ใน rules ยังค้าง)
- ritual รายสัปดาห์: `node scripts/offsite-backup-pull.mjs`
- ค้างเดิม: picker ผูกเจ้าของ + ทดสอบแจ้งเตือน · มือถือ [conn-wedge] (count สะอาดแล้ว — harness 2 ตัวถูกลบ) ·
  desktop toast Windows · laptop 10 ปี ratchet

## ⚠️ Landmine — `scripts/trim-session-handoff.mjs` BUGGY (ห้ามรัน; trim มือเท่านั้น)
