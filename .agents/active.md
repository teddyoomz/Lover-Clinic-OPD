---
updated_at: "2026-07-20 NIGHT+1 /session-end — LINE Friend Picker (AV213) + done-sort + mobile wedge-escalation (AV214) — ALL DEPLOYED LIVE."
status: "master `31d67b68`+ = prod LIVE (`lover-clinic-o1abzsdk8` aliased lover-clinic-app.vercel.app 200; post-deploy L1 wedge-ladder PASS on LIVE bundle + L2 --full 20/0). rules DEPLOYED ค่ำนี้ (be_line_friends + probe #20, probes green). Korat roster PRE-SEEDED 2,087/2,087 (OA VERIFIED)."
branch: "master"
last_commit: "31d67b68 — docs(agents): AV214 wedge-escalation deployed"
tests: "full vitest exit-0 ×2 today (319s/324s) + ~119 new tests 0 fail + L2 --full 20/0 vs prod + L1 Playwright 5 specs (picker/done-sort/wedge — Q-vis eyeballed) + build clean. Do NOT re-run at boot."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "31f87210 (AV214) on top of 36a3b8f9 (line-friends stack)"
firestore_rules_version: "2026-07-20 NIGHT — be_line_friends added (probe #20). Next deploy: vercel-only unless rules touched."
---

# Active — 2026-07-20 NIGHT+1 — picker + done-sort + wedge fix DEPLOYED

## State
- ① LINE Friend Picker: เลือก userId จากรายชื่อ real-time (แอด/ทักปุ๊ปโผล่ปั๊บ) — การ์ดสุขภาพ + ผูกลูกค้า;
  bind mirror approve + audit + collision guard; Korat 2,087 คน pre-seeded (OA verified).
- ② วันนี้·เสร็จแล้ว เรียง serviceCompletedAt desc (กดล่าสุดบนสุด) — L1 บน prod ผ่าน.
- ③ AV214: มือถือค้าง-retry-ไม่หาย → timeboxed reconnect + ลองใหม่ escalate เป็น hard reload
  (≤2 กดจบทุกกรณี) + `[conn-wedge]` telemetry เข้าการ์ดสุขภาพ.

## What this session shipped
- Detail ทั้งหมด: `.agents/sessions/2026-07-20-line-picker-donesort-wedgefix.md` (checkpoint)
- AV213 + AV214 both SKILL copies (SY1) · Rule B probe #20 · COLLECTION_MATRIX be_line_friends
- บั๊คที่ e2e จับสด 2 ตัว: legacy-token cross-branch backfill pollution (guard+sweep แล้ว) +
  probe5 403 harness artifact (พิสูจน์ก่อน ไม่ revert มั่ว)

## Next action
- User L1: picker → ผูกเจ้าของ → "ทดสอบแจ้งเตือน" · แอดเพื่อน OA จริงจากมือถือ → ดูโผล่สด
- พรุ่งนี้หลัง 07:30: `node scripts/diag-infra-health.mjs` (sweep ใหม่รอบแรก)

## Outstanding user-triggered actions
- มือถือ: สังเกต 1-2 วัน — ค้างอีกต้องหายใน ≤2 กด + เช็ค [conn-wedge] ในการ์ดสุขภาพ
- ค้างเดิม: desktop toast Windows · laptop 10 ปี TFP ratchet · standing L1 stack (มือถือ/iPad)

## ⚠️ Landmine — `scripts/trim-session-handoff.mjs` BUGGY (ห้ามรัน; trim มือเท่านั้น)
