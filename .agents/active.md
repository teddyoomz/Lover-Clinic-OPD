---
updated_at: "2026-05-23 EOD+1 LATE+1 — V111 receiptCourseName override wired (local, awaiting deploy)"
status: "V111 SHIPPED locally — 5 buy-fetcher/renderer sites wired + 31 V111 tests PASS + AV111 + Rule I flow-simulate D1-D6. Build clean. NOT yet committed/pushed/deployed."
branch: "master"
last_commit: "97385d0d chore(scripts): delete-staff-chat-with-office-attachments (Rule M) — V111 about to commit"
tests: "vitest 14215/0 PASS (was 14161 → +54: 31 V111 + ~23 overlap)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "0dda0eae (Vercel — V111 PENDING) · office-to-pdf-00007-tfb (Cloud Run, V110-bis fonts + alias + Word-compat XCU)"
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
- Commit V111 (single commit `fix(receipt): V111`) + push + add V111 row to `.claude/rules/00-session-start.md` § 2 V-summary table.
- Awaiting explicit "deploy" authorization (V18; combined `vercel --prod` only — V111 client-only, no rules/index change).

## Outstanding user-triggered actions
- L1 hands-on AFTER deploy: edit a course → set "ชื่อคอร์ส (แสดงในใบเสร็จ)" → save → create a NEW sale buying that course → open the receipt → confirm override appears (e.g. "ขลิบเลเซอร์ Sleeve เทคนิค (ไม่ดมยาสลบ)" instead of original).
- Snapshot-at-write semantic: existing/historical receipts (e.g. INV-20260520-0010) will continue to show their original name — that's by design (legal-record integrity, analogous to price snapshot). If user wants retroactive change on historical receipts, that requires a Rule M backfill script (NOT shipped — would deviate from snapshot semantic, requires explicit user authorization).
