# Checkpoint 2026-07-19 — "ไล่ทำทั้งหมดอย่าให้เหลือ" — full backlog sweep (9 items) + hunt loop CONVERGED — SHIPPED local, NOT deployed

> User (verbatim): "ไล่ทำทั้งหมดอย่าให้เหลือ อย่างรอบคอบห้ามขี้เกียจ และต้องไม่มีบั๊คเพิ่มเติมแล้ว"
> master = `2a187033`+docs (13 commits ahead of prod `a9719afd`); **firestore.rules UNCHANGED → deploy = vercel-only**.
> FINAL gate: full vitest **17,742/17,742 · 0 fail** (definitive json) + extended **4,681/0** (quarantine CLEARED) + build clean.

## The 9 swept items
1. **AV209 rowId TOCTOU** (เงิน): NEW `resolveCourseRowIndex` identity-first (courseId > validated hint > unambiguous live search > Thai stale error) ทุก courses[] mutator + `removeCustomerCourseRowAtomic` แทน getCustomer→splice→updateCustomer (Rule T) + 6 UI callsites ส่ง identity. **โบนัส**: L2 e2e จับ audit "ลดคงเหลือ" fail เงียบตั้งแต่ 06-09 (whitelist ไม่มี 'reduce') — แก้แล้ว.
2. **doctorName-edge**: `resolvePersonNameById` chain (filtered → doctorsUnfiltered → persisted same-person) ที่ 3 save sites.
3. **TFP resilient-timeout**: 15s → ลองใหม่ escape (run-seq invalidation ก่อน reconnect — R1 fix).
4. **ArcBloom deep-link**: `initialBloomClosed` จาก validated `hadTabDeepLink`.
5. **TFP buy-modal extraction step 3** (verbatim, zero logic moved; **L1 Playwright 10/10 บน prod จริง** — fixture '2867' ถูกลบจาก prod = สาเหตุ spec ตาย, seed TEST- แทน + 3 stale-selector repoints).
6. **opd_sessions archive retention**: cron 03:20 BKK (หลัง backup 03:00) + guards (isPermanent/live-link/booking-referenced/no-timestamp) + dual-type timestamps + cursor pagination (R1) + registry/UI wiring. Prod dry-run: scanned 159 / eligible 0 (ยังไม่มี archive >180d).
7. **ws1-probe-vandal** (`{hacked:true}`) ลบ + audit + idempotent.
8. **patient-view warmup**: `?ping=1` (ก่อน token gate, 1-doc read) + cron */5; handler จริงรันกับ prod ผ่าน.
9. **Extended quarantine CLEARED**: 49 ไฟล์/~320 asserts repointed (2 agents + orchestrator adjudication), 25 obsolete V50 asserts ลบ, suite 4,681/0. **จับบั๊คจริง**: PermissionGroupsTab render `<Loader2/>` ไม่ import (V163 class → จอดำตอนกดลบ) → fix + `lucide-icon-import-classifier` ปิด class ทั้งโปรเจ็ค.

## Hunt loop (≤2 agents/รอบ + orchestrator adjudicate ทุก finding first-hand)
- **R1** (2 lens) → 5 confirmed fixed: `''`-เป็น-constraint (name-only search เคย refund ผิดแถวบน legacy rows) · courseId-miss = hard-fail (twin ไม่โดน) · terminal-twin exclusion · TFP retry ordering (invalidate ก่อน reconnect — empty-paint + no-escape end-state) · retention cursor. + mojibake hygiene (PS5.1 ซ้ำ — ไฟล์เทส restore แล้ว).
- **R2** → 1 confirmed: R1 terminal-exclusion เอง redirect op ไปที่ live twin ตอน target โดน terminalize คาที่ (A13 เคยล็อคพฤติกรรมผิด!) → SPLIT semantics (hint identity-match ชนะแม้ terminal + downstream guards TERMINAL_MSG ใน adjust/exchange/remove) + stale() catch-continuations.
- **R3** → 1 confirmed **pre-existing** (Phase 16.5): `applyCourseRefund` ไม่กัน 'ยกเลิก' → refund คอร์สที่ cascade คืนเงินไปแล้ว = double-reimbursement record → mirror guard 1 บรรทัด + A15. **งานวันนี้ 0 findings = CONVERGED**.

## Verification (Rule Q)
- **L2 จริงบน prod**: `scripts/e2e-av209-course-row-identity.mjs` **17/0 — re-run หลังทุก hunt round** (TOCTOU shift ซ้าย/ขวา, ambiguity abort, refund/exchange/remove, OCC race; TEST- fixtures + cleanup pristine ทุกรอบ).
- **L1 Playwright บน prod จริง**: `treatment-buy-deduct.spec.js` **10/10** (เปิด modal/ซื้อ 3 ประเภท/ลบ/ติ๊ก-untick/no-doctor error/50-cap+โหลดเพิ่ม ผ่าน TfpBuyModal ที่ serve จริง).
- Retention dry-run prod + warmup handler executed on prod + ws1 delete verified + full/extended/build ตามหัวไฟล์. AV209 SKILL.md (SY1 ✓) + lucide classifier + ~30 V21 repoints รวมทุก batch.

## Honest gaps
- **User L1 ทั้ง stack** (batch นี้ + ก่อนหน้า: TFP เครื่องช้า/มือถือ/AV205/push/reports-home + buy modal บนเครื่องจริง + retry escape).
- Warmup `?ping=1` + retention cron ทำงานจริง = **หลัง deploy** (post-deploy check: `curl .../api/patient-view?ping=1` → `{ok,ping}` + audit doc `opd-session-archive-retention-*` คืนแรก).
- Irreducible tail: legacy row (no courseId) โดน splice + เหลือ twin เดียว → resolve ไป twin (แยกไม่ได้ด้วย name+product; แก้ขาดต้อง backfill courseId ~1384 rows — Rule M ถ้าเคยกัด).
- Cosmetic: BranchesTab อ่าน b.phone/address legacy (V51 ย้ายไป settings.*) — การ์ด branch ที่ migrate เต็มไม่โชว์เบอร์.

## Resume Prompt
Resume LoverClinic — 2026-07-19. Full backlog sweep (9 items) + hunt R1(5)→R2(2)→R3(1 pre-existing)→CONVERGED.
master 13 commits ahead of prod, NOT deployed (รอ "deploy"; rules UNCHANGED → vercel-only). Full vitest 17,742/0 +
extended 4,681/0 + L1 10/10 + L2 17/0 บน prod. Read CLAUDE.md → SESSION_HANDOFF.md → .agents/active.md →
00-session-start.md → this checkpoint.
