# Session 2026-05-19 LATE+3 NIGHT+5 — V104→V107 mega-session (5 V-entries + Rule M backfills + light-theme universal fix)

## Summary

5 V-entries shipped + 4 Rule M backfills --apply'd on real prod + 6 AV invariants codified + V101 victim sweep + V106 brainstorming locked-but-stashed + 4 combined deploys (V104 → V104-followup → V105 → V105-followup → V107). Triggered by ongoing class-of-bug saga on customer วันเพ็ญ (LC-26000078) plus light-theme iPhone Safari bug report.

## Current State

- master = `f076a45d` = prod, V104→V107 ALL LIVE at https://lover-clinic-app.vercel.app (deploy `85pg892xe`)
- 195 vitest tests GREEN + 39/39 E2E stress + 24/24 V107 L2 verify
- 6 AV invariants codified (AV91-AV96)
- Probe-Deploy-Probe 4/4 IDENTICAL on every deploy round
- V106 brainstorming complete but stashed; awaiting user approval to ship

## Commits

```
f076a45d fix(V107): light-theme text visibility — narrow accent exception + form-element safety net + AV96
cb88770c fix(V105-followup): stock movement createdAt ISO contract + E2E stress
1a16e98b fix(V105): customer-name canonical resolver + cancel-flow atomic-rollback
96535012 fix(V104-followup): be_course_changes canonical audit shape + AV92
f3b0706a fix(V104): handleSubmit param shadow + silent-swallow rip + AV91
```

## Files Touched (names only)

### V104
- src/components/TreatmentFormPage.jsx (param rename + silent-swallow rip)
- .claude/skills/audit-anti-vibe-code/SKILL.md (AV91)
- tests/v104-handle-submit-options-shadow.test.js
- scripts/diag-v104-{buy-and-use-deduction,all-today-treatments}.mjs

### V104-followup
- scripts/v101-backfill-treatment-course-link.mjs (canonical buildCanonicalUseAudit helper)
- scripts/v104-migrate-broken-course-change-audits.mjs (NEW + --apply'd)
- scripts/diag-v104-followup-course-changes-shape.mjs
- .claude/skills/audit-anti-vibe-code/SKILL.md (AV92)
- tests/v104-followup-course-audit-canonical-shape.test.js

### V105
- src/lib/customerDisplayName.js (NEW canonical resolver)
- src/components/TreatmentFormPage.jsx (V105 wire create + edit auto-sale)
- src/components/backend/SaleTab.jsx (display fallback + cancel atomic-rollback)
- .claude/skills/audit-anti-vibe-code/SKILL.md (AV93 + AV94)
- scripts/v105-backfill-sale-customer-and-rededuct-stock.mjs (Rule M --apply'd)
- scripts/diag-v105-{sale-customer-and-meds-stock,reverse-and-customer-create}.mjs
- tests/v105-customer-display-name.test.js

### V105-followup
- src/components/backend/MovementLogPanel.jsx (_v105NormalizeCreatedAt defensive)
- scripts/v101-backfill-treatment-course-link.mjs (createdAt ISO fix in source)
- scripts/v105-followup-fix-rededuct-createdat.mjs (Rule M --apply'd)
- scripts/diag-{stock-movements-nakhon,v105-createdat-shape-mismatch}.mjs
- scripts/e2e-v105-tfp-stock-deduction-stress.mjs (39/39 PASS real prod)
- .claude/skills/audit-anti-vibe-code/SKILL.md (AV95)
- tests/v105-followup-stock-movement-createdat.test.js

### V107
- src/index.css (narrow accent exception + extend palette + form-element safety net + bg-white border + arbitrary text-[#fff] overrides)
- .claude/skills/audit-anti-vibe-code/SKILL.md (AV96)
- tests/v107-light-theme-text-visibility.test.js

### V101 victim sweep
- scripts/diag-v101-victim-customer-state.mjs

## Decisions (one-line each — full detail in v-log-archive.md)

- V104: `options` param → `submitOpts` — eliminates lexical shadow of React state. Plus silent-swallow rip at TFP:3134 with atomic-rollback mirroring existingDeductions
- V104-followup: backfill writer mirrors canonical buildChangeAuditEntry shape via local helper (admin-SDK ESM can't import React module). Sentinel-marker pattern + idempotent _v104Migrated flag
- V105 Bug A: canonical resolveCustomerDisplayName walks 6 shape variants in priority order (Th nested > camelCase nested > top-level lowercase > legacy name > nickname). Display-time fallback in SaleTab list
- V105 Bug B: SaleTab cancel-flow atomic-rollback re-deducts stock if cancelBackendSale fails after reverseStockForSale (V31-family silent partial-failure fix)
- V105-followup: stock-movement createdAt MUST be ISO string (AV95) + readers normalize Timestamp shapes defensively (MovementLogPanel _v105NormalizeCreatedAt)
- V107: narrow `[class*="bg-[var"]` accent exception to canonical names only (avoid matching bg-[var(--bg-card)] etc.). Extend named-color exception list to all 17 Tailwind palettes. Universal form-element safety net via element-type selector bypasses class confusion. Single CSS file change covers 108 source-file occurrences without per-file touches

## Rule M Backfill Audit docs (real prod)

- `be_admin_audit/v104-followup-migrate-course-audits-1779199488818-7f9673a0` (11 garbage → canonical)
- `be_admin_audit/v105-backfill-sale-customer-and-rededuct-stock-1779200999026-d341ccf7` (1 sale name + 7 stock re-deducts)
- `be_admin_audit/v105-followup-fix-rededuct-createdat-1779201811104-8db5edeb` (7 Timestamp → ISO)
- `be_admin_audit/v101-backfill-treatment-course-link-1779203008980-fd57c304` (idempotent victim sweep)

## Next Todo

1. **L1 user hands-on** (Rule Q V66 gold standard) — hard-refresh https://lover-clinic-app.vercel.app on iPhone Safari + verify:
   - Light theme: modal text DARK in inputs/textareas/selects, CTA buttons preserve WHITE, bg-white button has visible BORDER
   - Buy course in TFP → customer.courses[] decrement
   - Edit treatment → reverse + re-deduct stock correctly
   - INV-20260519-0008 sale shows "นาย สุขเกษม วิทยชาญวิฑูร" customer name
   - MovementLog นครราชสีมา shows 63+ movements (not empty)
   - "ประวัติการใช้คอร์ส" tab shows real course names + qty deltas (not "(ไม่ระบุคอร์ส)")
2. **V106 stock-movement 30-day retention** — design locked (Q1-Q4 answered). If user approves: write spec HTML at `docs/superpowers/specs/2026-05-19-stock-movement-30day-retention-design.html` + invoke writing-plans skill
3. If bug found in L1 → systematic-debugging + V108+

## Resume Prompt

```
Resume LoverClinic — continue from 2026-05-19 NIGHT+5 EOD.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=f076a45d, prod=f076a45d V107)
3. .agents/active.md (195 tests · V104→V107 LIVE)
4. .claude/rules/00-session-start.md (iron-clad + V-summary)
5. .agents/sessions/2026-05-19-v104-to-v107-mega-session.md (this file)

Status: master=f076a45d, V104→V107 ALL LIVE, 195/195 tests, 4/4 probes IDENTICAL
Next: Rule Q L1 hands-on on iPhone Safari → verify light-theme fix + modal text dark
Outstanding (user-triggered):
- L1 verify all V104-V107 fixes
- V106 stock-movement retention — design locked, awaiting user approval to ship

Rules: no deploy without "deploy" THIS turn (V18); V15 combined deploy;
Probe-Deploy-Probe Rule B (chat_conv 200 / 3× admin-only 403); Rule M data ops
local + admin-SDK + canonical artifacts/{APP_ID}/public/data/* path; Rule Q V66
real-adversarial verification (Playwright L1 / real client SDK L2 mandatory
before any "verified" claim).

/session-start
```
