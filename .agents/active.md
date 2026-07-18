---
updated_at: "2026-07-18 — TFP Entry SWR cold-start fix (AV208): root cause 3 ชั้นวัดจริง + fix 4 ชั้น + bug-hunt R1(4)→R2(4)→R3(0) CONVERGED. SHIPPED local, NOT deployed."
status: "master = 10 commits ahead of prod. รอ user สั่ง 'deploy' (rules UNCHANGED → vercel-only, no Probe-Deploy-Probe) แล้ว user L1 บนเครื่องคลินิกที่ช้าจริง."
branch: "master"
last_commit: "(R2 hardenings — ดู git log; spec/plan/diag/fix/test ครบใน 10 commits วันนี้)"
tests: "full vitest 17,631/17,631 · 0 fail (definitive) + AV208 bank 76/0 + build clean + Rule Q L1 adversarial 5/5 บน real prod. Do NOT re-run at boot."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "21306fc6-era (2026-07-08 reports-home) — AV208 batch NOT deployed yet"
firestore_rules_version: "UNCHANGED (AV208 = frontend-only) → next deploy = vercel-only"
---

# Active — 2026-07-18 — TFP Entry SWR (AV208) shipped local

## State
- User report: TFP เปิดแล้วหมุนค้างบน WiFi คลินิก (5G เร็ว, หน้าอื่นเร็ว, เครื่องเปิด TFP บ่อย = ช้าสุด).
- Root cause (วัดจริงบน LIVE prod จากเครื่องคลินิก): TFP หลุดจาก AV206 sweep → หน้าเดียวที่ paint
  ผูก network (~600 docs/630KB ทุกการเปิด) + working set ~44MB ชน cache cap 40MB → LRU evict
  บนเครื่องใช้หนัก → cold pull ทุกรอบ + WiFi แย่คูณ (cold 23.8s@0.4Mbps vs warm ≤3.2s).
  ไม่ใช่ block / ไม่ใช่ cookie (ล้าง cache ยิ่งแย่).
- Fix 4 ชั้น: TFP swrRun 2-pass (cache paint + chip + save-gate) · cacheSizeBytes 200MB ·
  idle prefetch 6 listers · AV208 full-scan classifier (จับได้อีก 8 ไฟล์ unclassified).
- Bug-hunt loop (≤5 agents/รอบ ตาม user): R1 = 4 confirmed fixed (applyChain gate เงิน V101-class /
  treatment server-fresh กัน stale snapshot / DF-rate gate / skip-flag live-resolve) → R2 = 4 hardenings
  (chain poison / single point-read / classifier regex / doctors gate) → R3 = 0 → CONVERGED.
- ตัวเลข: TFP reopen ดึง 4-18KB (เดิม 630KB) · spinner ~0.5-2s แม้ 400kbps/500ms.

## Next action
1. User สั่ง **"deploy"** → vercel-only → re-run probes บน PROD → **user L1 เครื่องคลินิกที่ช้าจริง**
   (กดเข้า TFP ซ้ำๆ ต้อง ≤1-2s + เห็น chip ⟳ แว๊บแล้วหาย; เทียบ 5G; มือถือด้วย).
2. Prior batches L1 ยังค้าง: reports-home + mobile cold-start + AV205 scroll + push.

## Backlog (จากรอบนี้)
- TFP resilient-timeout สำหรับ half-dead network (ตอนนี้ = pre-AV208 parity, autoDetect คุม)
- Positional-rowId identity (courses[]) — pre-existing TOCTOU watchlist
- doctorName '' เมื่อ doctor โดน filter (พักใช้งาน/hidden) ตอน edit-save — pre-existing

## ⚠️ Landmine เดิม — `scripts/trim-session-handoff.mjs` BUGGY (ห้ามรัน; trim มือเท่านั้น)
