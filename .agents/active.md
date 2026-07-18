---
updated_at: "2026-07-18 EOD — TFP Entry SWR (AV208) DEPLOYED LIVE + post-deploy L1 probe green บน prod จริง."
status: "master = prod LIVE (vercel `lover-clinic-4hr8of3tr` aliased lover-clinic-app.vercel.app HTTP 200; rules UNCHANGED → vercel-only, no Probe-Deploy-Probe). Awaiting user L1 บนเครื่องคลินิกที่ช้าจริง."
branch: "master"
last_commit: "98e2a562 — docs(state): TFP Entry SWR (AV208) V-entry + checkpoint + handoff"
tests: "full vitest 17,631/17,631 · 0 fail (definitive, this session) + AV208 bank 76/0 + build clean + Rule Q L1 adversarial 5/5 + post-deploy LIVE probe (chip + cache paint + 18KB delta @400kbps). Do NOT re-run at boot."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "= master (deployed 2026-07-18 vercel-only; firestore.rules UNCHANGED)"
firestore_rules_version: "UNCHANGED (AV208 = frontend-only)"
---

# Active — 2026-07-18 — TFP Entry SWR (AV208) DEPLOYED LIVE

## State
- User report: TFP เปิดแล้วหมุนค้างบน WiFi คลินิก (5G เร็ว, หน้าอื่นเร็ว, เครื่องเปิด TFP บ่อย = ช้าสุด).
- Root cause (วัดจริง): TFP หลุด AV206 sweep (~600 docs/630KB server pull ทุกการเปิด) + working set
  ~44MB ชน cache cap 40MB → LRU evict บนเครื่องใช้หนัก + WiFi แย่คูณ. ไม่ใช่ block/cookie.
- Bug-hunt loop R1(4 confirmed)→R2(4 hardenings)→R3(0) = CONVERGED (≤5 agents/รอบ ตาม user).

## What this session shipped (12 commits + deploy — checkpoint `.agents/sessions/2026-07-18-tfp-entry-swr.md`)
- TFP swrRun 2-pass: cache paint ทันที + server แก้เงียบ + SyncIndicator chip + save-gate 15s
- cacheSizeBytes 200MB · idle prefetch 6 listers @ 2 staff shells · AV208 full-scan classifier (+8 ไฟล์จับได้)
- R1 fixes (เงิน/สต็อคทั้งหมด): applyChain gate · treatment server-fresh · DF-rate gate · skip-flag live-resolve
- R2 hardenings: per-link catch · single point-read · classifier regex · doctors MISS gate
- ตัวเลข: reopen ดึง 4-18KB (เดิม 630KB) · spinner ~0.5-2s แม้ 400kbps/500ms · ยืนยันบน LIVE prod หลัง deploy

## Next action
- **User L1 บนเครื่องคลินิกที่ช้าจริง**: กดเข้า TFP ซ้ำๆ (ควร ≤1-2s + chip ⟳ แว๊บแล้วหาย) + เทียบ 5G + มือถือ.
  ห้ามล้าง cache/temp เป็น folk-fix (ยิ่งช้า). Prior batches L1 ยังค้าง: reports-home / mobile cold-start / AV205 / push.

## Outstanding user-triggered actions
- (none — deployed). Backlog: TFP resilient-timeout (half-dead parity) · positional-rowId watchlist ·
  doctorName-filtered edge · `project_next_model_backlog.md`.

## ⚠️ Landmine เดิม — `scripts/trim-session-handoff.mjs` BUGGY (ห้ามรัน; trim มือเท่านั้น — วันนี้ trim มือแล้ว 10+10)
