---
updated_at: "2026-07-21 EOD — worry-list 12 + fx-perf + hub pagination + iOS wedge-prevention — ALL DEPLOYED LIVE"
status: "master 2e343c89 = prod LIVE (lover-clinic-e2q4c5j5p aliased; ping 200). rules UNCHANGED ทั้งวัน → vercel-only. FULL vitest 18,187/0 + build clean. โค้ดใหม่ verified in live bundle."
branch: master
last_commit: "2e343c89 — docs(agents): wedge prevention DEPLOYED + LIVE-bundle verified"
tests: "FULL 18,187/18,187 · 0 fail (14:58 run; ~150 new today). ห้าม re-run (session-end)."
production_url: https://lover-clinic-app.vercel.app
production_commit: "2e343c89 (3a1ba363 wedge-fix + earlier batches) — deployed 2026-07-21"
firestore_rules_version: "2026-07-20 NIGHT (be_line_friends + probe #20) — UNCHANGED today"
---

# Active — 2026-07-21 EOD

## State
- master `2e343c89` = prod LIVE · rules UNCHANGED ทั้งวัน (5 deploys = vercel-only)
- FULL vitest 18,187/0 + build clean · code backlog = ศูนย์
- Detail → checkpoint `.agents/sessions/2026-07-21-worrylist-perf-wedge.md`

## What this session shipped (3 batches, all DEPLOYED)
- **Worry-list 12** (5-dim audit): 💣 backfill 3 legacy 1MB-cap treatments · FB webhook fail-closed
  (prove-red 200→401) · backup/LINE warn contract · dead-man's switch · retention guard · QR self-host
  · heartbeat dedup 144→2/วัน · off-site backup + runbook · dead-dep removal
- **fx-perf**: iOS จอขาว root fix (`--fx-anim` pause plane 19 rules; scroll-pause + full/eco tier)
- **hub pagination**: 270 การ์ด → 20/หน้า ทุก tab (DOM 21,359→3,000, L1 LIVE)
- **iOS wedge-prevention** (systematic-debugging, beacon-proven): boot watchdog (cache-read 3s race →
  memory-cache reload ตอนหน้าโหลด = "ครั้งแรกไม่เจอ") + escalation gated ด้วย reachability probe
  + hub spinner bound 10s + reason conn-wedge(24h)≠idb-slow(14d) — ห้ามเรียกเครื่องเร็วว่าช้า
- 07:35 health sweep รอบแรก = 14/14 เขียว, alert ไม่ยิง (ถูกต้อง)

## Next action
- idle (code backlog ว่าง) — รอ user L1 feedback บน iPhone

## Outstanding user-triggered actions
1. 📱 iPhone L1: เปิดจาก home screen ซ้ำๆ — ครั้งแรกไม่ควรเจอ banner; หลุดมา กด#2 ต้องหาย ·
   เลื่อน TFP/ย้อนหลังเร็วๆ ดูจอขาว/breath · ดู [conn-wedge] ในการ์ดสุขภาพว่าลดไหม
2. สมัคร healthchecks.io → ใส่ HEALTHCHECK_PING_URL ใน Vercel env
3. ยืนยัน LINE/FB channel secrets rotate หลัง WS1 (10 มิ.ย.) หรือยัง (comment ค้างใน rules)
4. ritual รายสัปดาห์: `node scripts/offsite-backup-pull.mjs`
5. ค้างเดิม: picker ผูกเจ้าของ + ทดสอบแจ้งเตือน · desktop toast Windows · laptop 10 ปี ratchet

## ⚠️ Landmine — `scripts/trim-session-handoff.mjs` เคย BUGGY; ตรวจ output ก่อนเชื่อ
