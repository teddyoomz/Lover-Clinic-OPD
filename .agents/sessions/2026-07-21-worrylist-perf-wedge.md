# Checkpoint 2026-07-21 — worry-list sweep + perf + iOS wedge prevention

## Summary
มาราธอนวันเดียว: (1) ปิด worry-list 12 ข้อจาก whole-app 5-dimension audit, (2) fx-perf
adaptive visuals แก้ iOS จอขาวตอนเลื่อน, (3) hub pagination 20/หน้าทุก tab, (4) systematic-debugging
มือถือ "ตายรัวๆ" → 3-rung wedge-prevention (boot watchdog + escalation + spinner bound). ทุกชุด DEPLOYED LIVE.

## Current State
- master `2e343c89` = prod LIVE (`lover-clinic-e2q4c5j5p` aliased lover-clinic-app.vercel.app; ping 200)
- rules UNCHANGED ทั้งวัน → ทุก deploy = vercel-only (no Probe-Deploy-Probe)
- FULL vitest **18,187/18,187 · 0 fail** (ครั้งสุดท้าย 14:58; ~150 เทสใหม่วันนี้) + build clean
- โค้ดใหม่ทุกชุด verified IN the live bundle (curl len:2 fail = harness, พิสูจน์ด้วยไฟล์)

## Worry-list (5-dim audit → 12 fixes, DEPLOYED เช้า)
- 💣 backfill 3 legacy inline-blob be_treatments (1021KB=100%cap → 5KB) · FB webhook fail-closed
  (prove-red สด 200→401) · backup partial-warn + LINE-reminder failed-night warn (เคยเขียวหลอก)
- dead-man's switch (HEALTHCHECK_PING_URL) · staleness banner · retention keep-last-valid guard
- QR self-host (เลิก qrserver.com; L1+Q-vis) · heartbeat dedup 144→2 docs/วัน · off-site backup
  pull (F:\LoverClinic-backups verified) · runbook · npm uninstall cheerio/bottleneck
- 07:35 health sweep รอบแรก = 14/14 เขียว, alert ไม่ยิง (ถูกต้อง)

## fx-perf + pagination (DEPLOYED บ่าย)
- **iOS จอขาว root**: 10 การ์ด TFP breathe box-shadow infinite → หน้า invalidate 60fps → tile cache
  ไม่ได้. Fix: `--fx-anim` plane 19 rules → html.is-scrolling หยุดตอนเลื่อน + eco tier (fast device = full)
- **hub pagination**: 270 การ์ด → 20/หน้า ทุก tab; DOM 21,359→3,000 (L1 LIVE data จริง)

## Wedge prevention (systematic-debugging, DEPLOYED บ่าย) ⭐
- **beacon**: 13:23:03 wedge→:09 reload→:22 wedge (13s). POST สำเร็จ=เน็ตดี. Windows ก็โดน
- **root**: AV214 ตันที่ reload-config-เดิม; IDB/lease=origin storage รอด reload → วนไม่จบ.
  AV212 escape เอื้อมไม่ถึง (idbBroken เฉพาะ throw; noPersist เฉพาะ TFP probe)
- **3 rung**: bootCacheWatchdog (cache read แข่ง 3s→ค้าง=memory-cache+reload ตอนหน้าโหลด="ครั้งแรกไม่เจอ")
  · escalateWedgeIfReloadFailed (gated ด้วย reachability probe — ปิดแคชเฉพาะเน็ตพิสูจน์ว่าปกติ)
  · hub spinner bound 10s
- **reason แยก**: conn-wedge(24h) ≠ idb-slow(14d) — ห้ามเรียกเครื่องเร็วว่าช้า (user: "17 pro max ไม่ช้า")
- **L1 จับบั๊คใน commit เอง**: probe path เป็น string form ≠ segment form ของ listener → reject ทันที
  =no-op เงียบ (dead-feature class) → แก้ตรง + getLastBootWatchdogVerdict() พิสูจน์ว่ารันจริง

## Commits (วันนี้ ~14 commits)
```
2e343c89 docs wedge deploy · 3a1ba363 boot watchdog · 48dc3e5f escalation+reachability+reason
cc363315 wedge missing rung · 5910f639+32f772b6 hub pagination · 19ad0f45+19830a91 fx-perf
+ worry-list เช้า (security · observability · retention · QR · dedup · offsite · runbook)
```

## Files Touched (หลัก)
- NEW: src/lib/{fxPerf,wedgeEscalation,bootCacheWatchdog}.js · src/components/{QrImage,InfraHealthStaleBanner,admin/AppointmentHubPagination}.jsx · scripts/{backfill-legacy-treatment-blobs,offsite-backup-pull}.mjs · docs/RUNBOOK-restore.md
- EDIT: src/lib/{machinePerf,firestoreReconnect,infraHealthCore,appointmentHubFilters,documentPrintEngine}.js · src/{App,firebase}.jsx · src/pages/{AdminDashboard,BackendDashboard}.jsx · src/components/{TreatmentFormPage?,admin/AppointmentHubView,backend/InfraHealthSection}.jsx · src/index.css · api/webhook/facebook.js · api/tfp-options.js · api/cron/{line-reminder-fire,line-reminder-retry,whole-system-backup-daily,infra-health-sweep,chart-edit-session-sweep,opd-session-cleanup-sweep}.js · api/_lib/scheduledTaskRuntime.js · api/admin/_lib/wholeSystemBackupExecutor.js · package.json
- NEW tests: security-hardening · cron-status-warn-visibility · backup-retention-validity-guard · watcher-of-the-watcher · qr-* · heartbeat-audit-dedup · fx-perf-adaptive · appt-hub-pagination · wedge-escalation-ladder · boot-cache-watchdog

## Decisions (1-line)
- RENDER-side pagination ไม่ใช่ query-side (query แชร์กับ badge ทุก tab หลัง AV206 = delta เล็ก)
- fx-perf: pause box-shadow anim ตอนเลื่อน (invisible mid-scroll) — เครื่องแรงไม่เสียอะไร
- wedge escalation ต้องผ่าน reachability probe ก่อน = ห้ามลดคุณภาพเครื่องเมื่อปัญหาคือเน็ต
- auto-reload ล้อมด้วย 10-min cooldown + persistence-on-only = วนไม่ได้
- reason/TTL แยกใน machinePerf (back-compat: legacy bare-timestamp = idb-slow/14d)

## Next Todo (user-triggered)
1. **📱 iPhone L1**: เปิดจาก home screen ซ้ำๆ — ครั้งแรกไม่ควรเจอ banner; หลุดมา กด#2 ต้องหาย
2. เลื่อน TFP/แท็บย้อนหลังเร็วๆ — จอขาวควรหาย + breath ลื่นขึ้น
3. สมัคร healthchecks.io → ใส่ HEALTHCHECK_PING_URL ใน Vercel env
4. ยืนยัน LINE/FB channel secrets rotate หลัง WS1 (10 มิ.ย.) หรือยัง (comment ค้างใน rules)
5. ritual รายสัปดาห์: `node scripts/offsite-backup-pull.mjs`
6. ค้างเดิม: picker ผูกเจ้าของ + ทดสอบแจ้งเตือน · desktop toast Windows · laptop 10 ปี ratchet

## Resume Prompt
Resume LoverClinic — continue from 2026-07-21 EOD. master=2e343c89, prod=lover-clinic-e2q4c5j5p LIVE.
Next: user L1 (iPhone wedge / TFP scroll / picker) — code backlog = ศูนย์. /session-start
