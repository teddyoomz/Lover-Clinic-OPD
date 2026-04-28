# 2026-04-28 (session 24 EOD) — Phase 15.5 four-feature bundle + audit S21-S25

## Summary

Auto-mode session shipped Phase 15.5 in 4 commits across 4 features. After
V15 #3 deploy (V34 + s22 + s23) finished early in the session, user pivoted
to Phase 15.5: 15.5A ActorPicker `branchIds[]` filter + 15.5B Withdrawal
approval admin endpoint + Item 1 per-product balance warnings + Item 2
unit dropdown enrichment + Phase G audit-stock-flow S21-S25 extension +
Phase H coverage spot-check. **2527/2527 tests · 4 commits unpushed-to-prod**.

## Current State

- master = `ac75ad0` · production = `da15849` (V15 #3 LIVE)
- 4 commits unpushed-to-prod: 248416e (docs) + d037cf0 (15.5A+B) + 89c5607 (Item1+2) + ac75ad0 (audit+coverage)
- Tests 2389 → 2527 (+138)
- Build clean
- Awaiting V15 #4 deploy auth (per V18)

## Commits (this session)

```
ac75ad0 chore(audit): Phase G + H — audit-stock-flow S21-S25 + coverage spot-check
89c5607 feat(stock): Phase 15.5 — Item 1 (per-product balance warnings) + Item 2 (unit dropdown enrichment)
d037cf0 feat(stock): Phase 15.5 — A: ActorPicker branchIds[] filter + B: withdrawal approval admin endpoint
248416e docs(agents): V15 #3 deploy COMPLETE — V34 + s22 + s23 LIVE
```

## User reports (verbatim) → fixes

| # | User words | Commit |
|---|---|---|
| 1 | "ลุย phase 15 ต่อ" → 15.5A actor filter + 15.5B withdrawal approval | `d037cf0` |
| 2 | "การแจ้งใกล้หมดในหน้ายอดคงเหลือ ... ยึดตามข้อมูลที่กรอกไปในสินค้าแต่ละชิ้น ไม่ใช่ยึดตาม UI filter" | `89c5607` Item 1 |
| 3 | "หน่วยสินค้าในหน้าเพิ่มสินค้า ... เพิ่มหน่วยที่มีอยู่ในสินค้าในระบบแล้วมาให้เลือก" | `89c5607` Item 2 |
| 4 | "เพิ่มระบบ แจ้งก่อนหมดอายุ (วัน), แจ้งใกล้หมด (qty), แจ้งเกินสต็อก (qty)" (Item 1 expanded mid-session) | `89c5607` Item 1 |
| 5 | "เพิ่ม audit/skill แล้ว ลอง test reset coverage / spot-check" | `ac75ad0` |

## Files Touched

NEW:
- api/admin/stock-withdrawal-approve.js
- src/lib/stockWithdrawalApprovalClient.js
- tests/phase15.5a-actor-picker-branch-filter.test.js
- tests/phase15.5b-withdrawal-approval-endpoint.test.js
- tests/phase15.5-item1-balance-warnings.test.js
- tests/phase15.5-item2-product-unit-dropdown.test.js

MODIFIED:
- src/lib/backendClient.js (mergeSellersWithBranchFilter pure helper + listAllSellers branchId param)
- src/components/backend/StockAdjustPanel.jsx + OrderPanel.jsx + CentralStockOrderPanel.jsx + StockTransferPanel.jsx + StockWithdrawalPanel.jsx (5 panels pass branchId)
- src/components/backend/StockBalancePanel.jsx (productThresholdMap + 3 helpers + 4 row badges + 3 filter checkboxes; ≤30/≤5 hardcoded REMOVED)
- src/components/backend/ProductFormModal.jsx (unitDatalistOptions useMemo merging master + existing product units)
- src/components/backend/WithdrawalDetailModal.jsx (admin approve/reject UI + reject reason modal)
- tests/stock-actor-tracking.test.js (A3 assertion flipped to new listAllSellers({branchId}) shape)
- .claude/skills/audit-stock-flow/{checklist,patterns,SKILL}.md (S21-S25 added)
- .claude/skills/audit-all/SKILL.md (tier-1 line + per-skill summary)
- .gitignore + package.json + package-lock.json (@vitest/coverage-v8 dev-dep)

## Decisions (1-line each)

1. **15.5A scope = 5 stock-mutation panels only** (not SaleTab/MembershipPanel/QuotationTab/reports/CustomerDetail) — those need historical seller name lookups across branches; filter would hide history.
2. **15.5B approve = SOFT** — status STAYS at 0 after admin approve (warehouse still does dispatch via existing UI). Rationale: separation of managerial-approval ↔ physical-dispatch + auto-flipping 0→1 from API would skip _exportFromSource = stock corruption.
3. **15.5B reject = HARD** — status 0→3 + audit + reason in single atomic batch. No stock work needed.
4. **Item 1 reused existing `alertDayBeforeExpire/QtyBeforeOutOfStock/QtyBeforeMaxStock`** — already in productValidation schema + ProductFormModal inputs (from Phase 12.2). Just wired StockBalancePanel to read them; no schema/form changes.
5. **Item 1 hardcoded thresholds REMOVED** — no fallback when threshold unset (admin opt-in only). Source-grep B6/B7 anti-regression.
6. **Item 2 R1 real-time** — refetch on each modal mount (no Firestore listener). Closing + reopening modal after save surfaces new units.
7. **Phase G — S21-S25 extend audit-stock-flow** (not new skill) — fits existing structure; audit-all auto-picks-up via unchanged skill name.
8. **Phase H verdict** — UI render coverage gaps (0-5%) accepted because 138 source-grep tests assert structural correctness; admin endpoint at 89.47% lines clears 80% bar; pure helpers at 85-100%. No P0 blocker.
9. **Audit pure helper extraction** — `mergeSellersWithBranchFilter` exposed for testability (28 unit tests cover algorithm directly without mocking Firestore); `unitDatalistOptions` pure useMemo similarly testable.

## Next Todo

**Awaiting user "deploy" auth** for V15 #4 combined deploy (per V18, never carries forward):
- Pre-flight + Pre-probe Rule B (6 positive + 4 negative)
- Vercel `--prod --yes` + Firebase `deploy --only firestore:rules` parallel
- Post-probe + cleanup + HTTP smoke
- Update SESSION_HANDOFF + active.md
- Live QA: 4 features

After deploy: Phase 15 = COMPLETE on production. Next focus options:
- Carry-over admin tasks (LINE creds, customer ID backfill)
- Phase 15.6+ (if user adds scope) or Phase 16 polish
- Tackle deferred AUDIT-V34 concurrency bugs (4 P0 + 4 P1) → V35

## Resume Prompt

```
Resume LoverClinic — continue from 2026-04-28 EOD.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=ac75ad0, prod=da15849 — 4 commits unpushed)
3. .agents/active.md (2527 tests pass; Phase 15.5 NOT deployed)
4. .claude/rules/00-session-start.md (iron-clad A-I + V-summary)
5. .agents/sessions/2026-04-28-session24-phase15-5-bundle.md

Status: master=ac75ad0, 2527/2527 tests pass, prod=da15849 LIVE (V15 #3).

Next: V15 #4 combined deploy when authorized (4 commits: 248416e + d037cf0 +
89c5607 + ac75ad0). Live QA: 15.5A actor filter, 15.5B approve/reject buttons,
Item 1 per-product warnings, Item 2 unit dropdown.

Outstanding (admin): LineSettings creds · customer ID backfill · TEST-/E2E- prefix.

Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe.

/session-start
```
