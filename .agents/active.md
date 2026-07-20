---
updated_at: "2026-07-20 NIGHT — LINE Friend Picker (hybrid+real-time, AV213) + done-tab sort DEPLOYED LIVE (COMBINED deploy: vercel + firestore:rules + Probe-Deploy-Probe)."
status: "master = prod LIVE (`lover-clinic-gc5hpnt2t` aliased lover-clinic-app.vercel.app 200). firestore.rules CHANGED+DEPLOYED (be_line_friends read=staff/write=deny; probe #20 added; full probe set green pre+post — probe5 403 blip = harness token artifact, disproven with body-level rerun 200/200). Korat roster PRE-SEEDED 2,087/2,087 followers (OA = VERIFIED; names 100%, pics 97%)."
branch: "master"
tests: "Full vitest exit-0 (319s) + 107 new tests 0 fail + L2 --full 20/0 vs redeployed prod (client listener realtime 173ms · guard live) + L1 Playwright 2/2 vs LIVE URL (both realtime legs, Q-vis eyeballed). Do NOT re-run at boot."
production_url: "https://lover-clinic-app.vercel.app"
firestore_rules_version: "2026-07-20 NIGHT — be_line_friends added (probe #20). Next deploy: vercel-only unless rules touched again."
---

# Active — 2026-07-20 NIGHT — LINE Friend Picker + done-sort DEPLOYED

## State
- Feature ①: picker เลือก LINE userId จากรายชื่อ real-time (แอด/ทักปุ๊ปโผล่ปั๊บ) ใช้ 2 ที่ —
  การ์ดสุขภาพ (เติม lineTargets) + modal ผูก LINE ลูกค้า (bind mirror approve + audit + collision guard).
  Webhook เก็บ follow/unfollow → be_line_friends. Endpoint /api/admin/line-friends (list backfill + bind).
- Feature ②: วันนี้·เสร็จแล้ว เรียง serviceCompletedAt desc (กดล่าสุดบนสุด) — L1 บน prod จริงผ่าน.
- **บั๊คที่ post-deploy e2e จับสด**: legacy-token fallback ทำ backfill ติด branchId ผิด (300 docs) →
  guard `source==='be_line_configs' OR fallback-branch-only` + sweep แล้ว + E1.3 lock → redeploy → 20/0.
- AV213 both SKILL copies (SY1) · spec+plan HTML committed · checkpoint ยังไม่เขียน (รอ /session-end).

## Next action
- User L1: เปิด picker จริง → ค้นชื่อเจ้าของจาก 2,087 คน → ผูก target → กด "ทดสอบแจ้งเตือน" (ปิด backlog เดิมด้วย).
- แอดเพื่อนใหม่จริงจากมือถือ → ดูโผล่ใน picker (พิสูจน์ follow-event webhook เต็มทาง — ชิ้นเดียวที่เหลือ).
- สาขาอื่นเปิด picker ครั้งแรก = backfill อัตโนมัติ (ถ้าสาขานั้นมี be_line_configs ของตัวเอง).

## Outstanding user-triggered actions
- (ค้างเดิม) Desktop toast Windows + standing L1 stack (มือถือ/iPad) + laptop 10 ปี เปิด TFP เช็ค ratchet.
- พรุ่งนี้หลัง 07:30: `node scripts/diag-infra-health.mjs` (health cron sweep ใหม่รอบแรก).

## ⚠️ Landmine — `scripts/trim-session-handoff.mjs` BUGGY (ห้ามรัน; trim มือเท่านั้น)
