---
updated_at: "2026-07-19 — Full backlog sweep (9 items) + AV209 + hunt loop CONVERGED — SHIPPED local, NOT deployed."
status: "master 13 commits ahead of prod `a9719afd` (rules UNCHANGED → deploy = vercel-only, no Probe-Deploy-Probe). Awaiting user 'deploy' + user L1 stack."
branch: "master"
last_commit: "docs(state) sweep-all-backlog — V-entry + checkpoint + handoff (after 2a187033 hunt-R3 fix)"
tests: "full vitest 17,742/17,742 · 0 fail (definitive json, this session) + extended 4,681/0 (quarantine CLEARED) + build clean + Rule Q L2 AV209 e2e 17/0 real prod (re-run ทุก hunt round) + L1 Playwright buy-deduct 10/10 real prod. Do NOT re-run at boot."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "a9719afd (2026-07-18 AV208 deploy) — 13 commits BEHIND master"
firestore_rules_version: "UNCHANGED ทั้ง session (ทุกอย่าง = frontend/cron/scripts) → deploy = vercel-only"
---

# Active — 2026-07-19 — Backlog sweep (9/9) + AV209 — NOT deployed

## State
- User: "ไล่ทำทั้งหมดอย่าให้เหลือ อย่างรอบคอบห้ามขี้เกียจ และต้องไม่มีบั๊คเพิ่มเติมแล้ว" → sweep ครบ 9 items +
  bug-hunt loop จน 0: R1(5 fixed)→R2(1 fixed — R1 เอง redirect ไป twin, A13 rewrite)→R3(1 pre-existing)→CONVERGED.
- Checkpoint `.agents/sessions/2026-07-19-sweep-all-backlog.md` · V-entry "Backlog Sweep (AV209)" ใน 00-session-start.md § 2.

## What this session shipped (13 commits — local only)
- **AV209 (เงิน)**: `resolveCourseRowIndex` identity-first ทุก courses[] mutator + `removeCustomerCourseRowAtomic`
  (Rule T) + 6 UI callsites + terminal SPLIT semantics. โบนัสจับ 3 บั๊คแฝง: reduce-audit whitelist (เงียบตั้งแต่ 06-09) ·
  PermissionGroupsTab Loader2 จอดำ (V163; lucide classifier) · refund-on-cancelled double-reimbursement (16.5-era).
- doctorName-edge · TFP resilient-timeout (15s ลองใหม่; run-seq invalidate ก่อน reconnect) · ArcBloom deep-link ·
  TFP buy-modal extraction step 3 (L1 10/10 prod) · opd_sessions retention cron 03:20 (dry-run prod: 0 eligible) ·
  ws1-probe-vandal ลบ · patient-view `?ping=1` + warm cron */5 · extended quarantine CLEARED (49 ไฟล์ → 4,681/0).

## Next action
1. **User พิมพ์ "deploy"** → `vercel --prod` อย่างเดียว (rules UNCHANGED). Post-deploy check:
   `curl https://lover-clinic-app.vercel.app/api/patient-view?ping=1` → `{ok,ping}` 200 · warmup cron ยิงทุก 5 นาที ·
   retention cron คืนแรก → audit doc `opd-session-archive-retention-*` (eligible 0 ช่วงแรก — drain เมื่อ archive อายุ >180d).
2. **User L1 stack**: buy modal บนเครื่องจริง + TFP retry escape + deep link `?backend=1&tab=X` + ของเดิม
   (TFP เครื่องช้า / mobile cold-start / AV205 / push / reports-home).

## Outstanding user-triggered actions
- "deploy" (vercel-only). Irreducible tail: legacy course row ไม่มี courseId + twin เดียว → resolve ไป twin
  (แก้ขาด = Rule M backfill courseId ~1384 rows ถ้าเคยกัดจริง). Cosmetic: BranchesTab อ่าน b.phone legacy (V51).

## ⚠️ Landmine เดิม — `scripts/trim-session-handoff.mjs` BUGGY (ห้ามรัน; trim มือเท่านั้น — วันนี้ trim มือแล้ว 10+10)
