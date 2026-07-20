---
updated_at: "2026-07-20 PM — Degradation Matrix (AV212): 2 latent crash classes closed + TFP fast-paint ≤5s — DEPLOYED LIVE (a1ef64ff → lover-clinic-d64gekhpl, post-deploy verified)."
status: "master a1ef64ff = prod LIVE (rules UNCHANGED, vercel-only done). Post-deploy: endpoint L2 11/0 + matrix LIVE M0 1.07s/M5 0.54s/M12 13.7s/M14 0.82s ทั้งหมด PASS."
branch: "master"
last_commit: "(AV212 degradation-matrix commit — see git log)"
tests: "full vitest 17,911/17,911 (2026-07-20 PM definitive json + repoint isolated) + matrix e2e 14/14 (E2E_DEGRADE opt-in) + hardening 24/0 + build + verify:filler clean. Do NOT re-run at boot."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "e67b6d51 (2026-07-20 เช้า — AV211 + TFP #20 + e2e harness)"
firestore_rules_version: "UNCHANGED — next deploy = vercel-only, no Probe-Deploy-Probe"
---

# Active — 2026-07-20 PM — Degradation Matrix (AV212) + TFP fast-paint ≤5s

## State
- User report: mini PC (BMAX B6 i5-8257U/16GB — ไม่ใช่เครื่องอ่อน) ยังชนการ์ด TFP 15 วิ →
  `/systematic-debugging` + 14-cell degradation matrix (CPU/net/IDB/quota/offline) vs LIVE bundle.
- **พบ + ปิด 2 crash class แฝง**: M7 IDB-throw → Firestore assertion b815 ฆ่าทั้งแอป
  (fix: idbHealthy probe + self-heal flag) · M10 offline lazy-chunk → boundary กลืนทั้งแอป
  (fix: lazyRetry chokepoint, 79 callsites via alias).
- **≤5s directive เข้าเป้า**: TFP fast-paint pre-stage (paint จาก ~15 docs; enrichment 595 docs
  ตามหลัง chip; save-gate เดิม 100%) → M1 ×6 6.6s→1.26s · M4 cold+400k→2.6-3.7s ·
  M12 warm+×20 35s→14.3s. เครื่องระดับจริงทุกเงื่อนไข ≤5s; ×20 synthetic = survive+honest.
- Telemetry `kind:'telemetry'` ([tfp-slow]+[client-env]) → health-card viewer โชว์ แต่ไม่นับ
  errorCount → หลัง deploy เครื่องช้าจะรายงานสาเหตุตัวเอง.
- Checkpoint: `.agents/sessions/2026-07-20-degradation-matrix.md` (ตาราง before/after เต็ม).

## Next action
- **user สั่ง "deploy"** → vercel-only → หลัง deploy: เปิด TFP บน mini PC จริง 1 ครั้ง →
  ดูการ์ดสุขภาพระบบ → [tfp-slow]/[client-env] จะระบุสาเหตุเครื่องนั้น (คำตอบ "เครื่องหรือระบบ").
- ค้างจากเช้า: user L1 การ์ดสุขภาพระบบ (LINE target + ทดสอบแจ้งเตือน) · desktop toast ·
  standing L1 stack.

## ⚠️ Landmine เดิม — `scripts/trim-session-handoff.mjs` BUGGY (ห้ามรัน; trim มือเท่านั้น)
