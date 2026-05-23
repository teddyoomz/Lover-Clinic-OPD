---
updated_at: "2026-05-23 EOD+1 LATE+2 — V112+V113+V113-C local · V114 spec brainstormed (ready for writing-plans)"
status: "V112-A + V113 + V113-C LOCAL on master (committed + pushed, NOT yet deployed — last vercel attempt interrupted by user when V112-B V66 issue surfaced). V114 spec written + committed; ready for writing-plans in next chat. NOTE: Vercel prod still on 1305d040 (V111 only) — V112/V113 need deploy."
branch: "master"
last_commit: "<latest> docs(spec): V114 — receipt-info toggle in preview header (brainstormed Q1-Q5, ready for writing-plans)"
tests: "vitest V113 45/45 PASS · V112 deleted (V113 supersedes) · build clean ✓ 3.14s"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "1305d040 (Vercel — V111 only; V112+V113 PENDING deploy) · office-to-pdf-00007-tfb (Cloud Run, V110-bis)"
firestore_rules_version: "unchanged"
---

# Active Context

## State
- V111 — receipt course-name override wired (LOCAL, awaiting deploy). User report: admin set "ชื่อคอร์ส (แสดงในใบเสร็จ)" in CourseFormModal, but receipt still printed original `courseName`. Root cause: 3 buy-fetcher mappers (SaleTab loadOptions, TFP loadOptions, QuotationFormModal entry builder) copied only `shape.name` and silently dropped `shape.receipt_course_name` (V44 canonical mapper already exposed it). Architecture: Option β — carry `receiptCourseName` as PARALLEL field; `name` stays original for non-receipt consumers; SalePrintView + QuotationPrintView prefer override in fallback chain. Snapshot-at-write semantic (historical receipts unchanged).
- Pre-existing: V109 + V110 LIVE on Cloud Run rev 00007-tfb. Engine-bound limit (LO ≠ Word for Thai CTL) accepted by user.

## What this session shipped
- V111 (local, await deploy):
  - `src/components/backend/SaleTab.jsx` — loadOptions buy mapper + confirmBuy carry receiptCourseName
  - `src/components/TreatmentFormPage.jsx` — loadOptions buy mapper + confirmBuyModal carry receiptCourseName
  - `src/components/backend/QuotationFormModal.jsx` — course entry stamps receiptCourseName from item.receipt_course_name
  - `src/components/backend/SalePrintView.jsx` — grouped + legacy flat readers prefer receiptCourseName in fallback chain
  - `src/components/backend/QuotationPrintView.jsx` — course reader prefers receiptCourseName
  - NEW `tests/v111-receipt-course-name-override.test.js` 31/0 (A1-A10 source-grep + B1-B3 mapper contract + C1-C11 fallback + D1-D6 Rule I flow-simulate + E1 AV111)
  - NEW AV111 invariant in `.agents/skills/audit-anti-vibe-code/SKILL.md` + HIGH priority entry
- Pre-existing this session (still live): V109 + V110 wrapped, Outstanding cleared.

## Verification
- vitest **14215/0** (was 14161 → +54 net incl. 31 V111). Full suite GREEN.
- Module sweep (sale-tab-buy-mapping + salePrintView + beCourseToMasterShape + saletab-print-receipt + quotationUi + v44/v45/v48 prof-grade + phase-17-2-septies): 173/173 PASS — no V21 lock-ins surfaced.
- Build clean ✓ 3.08s.
- Rule Q scope: L2 via source-grep regression A1-A10 + Rule I flow-simulate D1-D6 (mirrors source-grep-locked to real impl). L1 user-hands-on after deploy (create NEW sale with a course that has the override set; receipt should show override).

## Next action
1. User authorizes deploy → vercel --prod (V112+V113+V113-C client-only, no rules) → smoke-check INV-20260520-0010 receipt on prod via Rule S Chrome MCP (live-resolve customer + course override + receipt-info block all live).
2. Next chat: read `docs/superpowers/specs/2026-05-23-receipt-info-toggle-design.html` → invoke `writing-plans` skill → produce `docs/superpowers/plans/2026-05-23-receipt-info-toggle.html` → execute via `executing-plans` or `subagent-driven-development`.
3. V114 is purely additive UI over V113 — no rules, no migration. Can ship same deploy cycle OR separate.

## Outstanding user-triggered actions
- L1 hands-on (optional, not blocking): edit a course → set "ชื่อคอร์ส (แสดงในใบเสร็จ)" → save → create a NEW sale buying that course → open the receipt → confirm override appears (e.g. "ขลิบเลเซอร์ Sleeve เทคนิค (ไม่ดมยาสลบ)" instead of original). The e2e script already verified the full chain on real prod (18/0 PASS); UI confirmation is gold standard but not required.
- Snapshot-at-write semantic (by design): existing/historical receipts (e.g. INV-20260520-0010) continue to show their original name — legal-record integrity, analogous to price snapshot. If user wants retroactive change on historical receipts, requires a Rule M backfill script (NOT shipped — deviates from snapshot semantic, needs explicit user authorization).
