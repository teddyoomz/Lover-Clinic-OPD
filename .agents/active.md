---
updated_at: "2026-07-21 ~15:10 — worry-list 12/12 + fx-perf + hub pagination + WEDGE PREVENTION — ALL DEPLOYED LIVE"
status: "master `3a1ba363` = prod LIVE (`lover-clinic-e2q4c5j5p` aliased; ping 200; new code verified IN the live bundle). rules UNCHANGED → vercel-only. FULL vitest 18,187/0 + build clean. L1 LIVE: no false-positive auto-reload on a healthy client (navType=navigate, zero stamps)."
branch: "master"
last_commit: "2c277f7f — test(repoint): 5 stale V21 locks from 2026-07-20 AV212-R2 + probe-20"
tests: "FULL 18,120/0 exit-0 (326s) + ~100 new tests + build clean. 5 stale repoints = yesterday's AV212-R2/probe-20 drift, NOT this batch."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "3cdcbeb2 (worry-list sweep) — deployed 2026-07-21 ~03:15"
firestore_rules_version: "2026-07-20 NIGHT (be_line_friends + probe #20) — UNCHANGED this batch"
---

# Active — 2026-07-21 — worry-list + fx-perf + pagination + wedge-prevention DEPLOYED

## มือถือค้าง "ตายรัวๆ" — root cause + 3-rung fix (2026-07-21 บ่าย) ⭐
- **หลักฐาน beacon**: 13:23:03 wedge → :09 hard-reload → :22 wedge ซ้ำ (13s = 8s+4s).
  beacon POST สำเร็จ = เน็ตดี, ตายเฉพาะ Firestore. Windows ก็ wedge 3 ครั้ง = ไม่ใช่เครื่องเดียว
- **Root**: บันได AV214 ตันที่ "reload ด้วย config เดิม" แต่ IDB/lease ที่ค้าง = origin storage
  → รอด reload → วนไม่จบ. ทางออก AV212 (memory-cache) มีอยู่แต่เอื้อมไม่ถึง (idbBroken ตั้งเฉพาะ
  throw/onerror; noPersist ตั้งจาก TFP probe เท่านั้น)
- **Fix 3 ชั้น**: ① boot watchdog (cache read แข่ง 3s → ค้าง = สลับ memory-cache + reload เอง
  ตอนยังอยู่หน้าโหลด = "ครั้งแรกก็ไม่เจอ") ② wedge-after-reload → escalate (กันด้วย reachability
  probe: ปิดแคชเฉพาะเมื่อพิสูจน์ว่าเน็ต Firestore ปกติ) ③ hub spinner bound 10s
- **reason แยกจาก AV212**: `conn-wedge` (24h TTL) ≠ `idb-slow` (14d) — **ห้ามเรียกเครื่องเร็วว่าช้า**
  (user: "17 pro max เครื่องไม่ได้ช้านะ"); การ์ดสุขภาพขึ้นข้อความตาม reason
- **User L1 ที่ต้องดู**: เปิดแอปจาก home screen ซ้ำๆ — ครั้งแรกไม่ควรเจอ banner เลย;
  ถ้าหลุดมา กดลองใหม่ครั้งที่ 2 ต้องหาย; ดู [conn-wedge] ในการ์ดสุขภาพว่าลดลงไหม

## fx-perf — iOS white-scroll root fix + visual tier (2026-07-21 ~03:50)
- Root (วัดจริง): 10 การ์ด TFP เต็มกว้าง breathe box-shadow infinite (v86 auto-glow) →
  ทั้งหน้า invalidate 60fps → iOS tile cache ไม่ได้ → เลื่อนเร็ว = ขาวครึ่งจอ (17 Pro Max ก็โดน)
- Fix: `--fx-anim` plane บน 19 rules → html.is-scrolling หยุด breath ตอนเลื่อน (ทุก tier) ·
  html[data-visual-tier=eco] หยุดถาวร+หรี่ (0.25 !important — ชนะ useV86GlowApply inline;
  จับสดใน L1) · tier = override > hw floor > jank 2/3 > full · toggle ในการ์ดสุขภาพ
- src/lib/fxPerf.js + App wiring + FP1-FP5 (14 เทส, classifier กัน glow ใหม่หลุด plane)
- **User L1 pending: เลื่อน TFP เร็วๆ บน iPhone อีกครั้ง — ขาวต้องหาย/ลดมาก + breath นิ่งขึ้น;
  ถ้ายังกระตุกตอนอยู่นิ่ง → escalate compositor-layer breath (เตรียมแนวไว้แล้ว)**

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
- ⏰ waiter #2 (~20 นาที): ยืนยัน heartbeat daily docs โผล่หลัง cron tick แรกบน build ใหม่
- DEPLOYED แล้ว — prove-green ผ่าน (FB 401) · LINE-reminder tick หน้าจะเขียน summary shape ใหม่ (ส่ง/ข้าม/ล้มเหลว)

## Outstanding user-triggered
- สมัคร healthchecks.io (ฟรี) → ใส่ HEALTHCHECK_PING_URL ใน Vercel env
- ยืนยัน LINE/FB channel secrets เคย rotate หลัง WS1 (10 มิ.ย.) หรือยัง (comment ใน rules ยังค้าง)
- ritual รายสัปดาห์: `node scripts/offsite-backup-pull.mjs`
- ค้างเดิม: picker ผูกเจ้าของ + ทดสอบแจ้งเตือน · มือถือ [conn-wedge] (count สะอาดแล้ว — harness 2 ตัวถูกลบ) ·
  desktop toast Windows · laptop 10 ปี ratchet

## ⚠️ Landmine — `scripts/trim-session-handoff.mjs` BUGGY (ห้ามรัน; trim มือเท่านั้น)
