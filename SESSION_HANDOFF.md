# Session Handoff — LoverClinic OPD Cross-Session State

> **This file is read FIRST every new session.** Updated by `/session-end` skill.
> Link out to `.agents/sessions/*` for detail.

---

## Current State

- **Date last updated**: 2026-04-25 (end-of-session — Rule I + 10 bug fixes + 5 audits + DEPLOYED)
- **Branch**: `master`
- **Last commit**: `1cb58d5 audit(priority3): fix AV2 + H-bis findings + 18 regression guard tests`
- **Test count**: 3959 / 3959 passing (was 3306 at session start; **+653 this session**)
- **Build**: clean
- **Deploy state**:
  - **firestore:rules**: unchanged this session
  - **Vercel prod**: `1cb58d5` via `vercel --prod --yes` — **UP-TO-DATE with HEAD** ✅
- **Production URL**: https://lover-clinic-app.vercel.app
- **Remote sync**: master = origin/master ✅
- **Prod probe**: 200 OK + hasRoot + hasViteBundle verified via preview_eval

---

## What's Done (recent phases)

- ✅ **Phase 1-11.9** — base app + Master Data Suite (historical)
- ✅ **Phase 12.0-12.11** — Financial completeness + adapter bridge + Firebase Admin SDK
- ✅ **Phase 13.1-13.6** — Quotations, staff schedules, DF groups + payout report, tab gates, treatment validator
- ✅ **Phase 14 + 14.x** — DF modal Triangle + auto-populate + wallet/membership/medicine-label migrate
- ✅ **Phase 12.2b COMPLETE** (2026-04-24) — Course form ProClinic parity end-to-end for 4 course types
- ✅ **Phase 12.2b follow-ups 2026-04-25** (this session, all deployed):
  - pick-at-treatment: nothing shows → fixed (late-visit + in-visit + picked- rowId routing)
  - buffet display "1/1 U" → "บุฟเฟต์" text + hint + no-decrement behavior + exempt from filters
  - buffet customer card hide มูลค่าคงเหลือ + show "หมดอายุอีก N วัน" countdown
  - course expiry sync → migrate → store → buy → assign chain preserves daysBeforeExpire
  - openBuyModal whitelist preservation + shadow course dedup (ProClinic parity: 4 matches not 7)
  - DF report linkedSaleId back-link via NEW setTreatmentLinkedSaleId (3-shape reconciled)
  - blood type dropdown objects shape (was string array → empty dropdown)
  - AV2: 2 raw <input type="date"> → DateField
  - H-bis: api/proclinic/explore.js @dev-only banner
- ✅ **Rule I (iron-clad) established** — mandatory full-flow simulate per sub-phase
- ✅ **V13 logged** — 3-round helper-only test failure pattern
- ✅ **Priority 1/2/3 test batches** — 15 full-flow simulate files, +653 tests
- ✅ **5 Priority-3 audits run** (firestore-correctness, backend-firestore-only, anti-vibe-code, react-patterns, ui-cultural-a11y, reports-accuracy; skip PDPA per user)

---

## What's Next

### Primary: user UI-verify on production

8 items to smoke-test. If any fails → bug report + Rule I debug cycle.
See "Outstanding User Actions" below for the checklist.

### If all UI-verify passes

Pick one per `memory/project_execution_order.md`:

**A. Phase 15 Central Stock Conditional** — next phase per execution order
**B. Phase 14.x gap sweep** — if any Phase 14 items still incomplete (check project_comprehensive_gap_audit.md)
**C. Polish / hardening** — run `/audit-all` for release readiness

---

## Outstanding User Actions (NOT auto-run)

### UI-verify on production (2026-04-25 fixes just deployed)

- [ ] **Buy buffet course via SaleTab** → customer's "คอร์สของฉัน" tab shows
      - Parent card with violet "บุฟเฟต์" badge on product row
      - "หมดอายุอีก N วัน" countdown next to the expiry date (not "มูลค่าคงเหลือ ฿X")
      - Amber color when ≤ 30 days, violet otherwise
- [ ] **Buy pick-at-treatment inside treatment form** → "เลือกสินค้า" button
      appears → click → PickProductsModal renders options → tick products
      + qty → confirm → course shows as tickable rows → treatment save
      succeeds with NO "คอร์สคงเหลือไม่พอ" error
- [ ] **Buy pick-at-treatment via SaleTab** → open new treatment for same
      customer → placeholder with "เลือกสินค้า" button shows in course
      column → click → pick → save → next visit shows N resolved entries
- [ ] **Multi-visit buffet** — use buffet 3+ times → course stays in active,
      qty never drops
- [ ] **DF Payout Report** — date range covering a backend-created sale
      with dfEntries → rows show non-zero ฿ (was ฿0 before this session)
- [ ] **Blood type dropdown** — new treatment page → "ข้อมูลสุขภาพลูกค้า" →
      กรุ๊ปเลือด dropdown shows A, B, AB, O, ไม่ทราบ (was empty before)
- [ ] **Search courses "บุฟ"** in buy modal → 4 matches (not 7 with duplicates
      or ฿0 rows) — matches ProClinic behavior
- [ ] **Treatment edit** — open saved treatment → change a tick/qty → save →
      customer.courses state = what a fresh save would produce (reverse+
      reapply net-zero invariant)

### Report any drift

If any UI-verify item fails → feed exact scenario + screenshot if possible.
Next session runs Rule I debug cycle (full-flow simulate + preview_eval + grep guards).

---

## Blockers

None.

---

## Known Limitations / Technical Debt

- **Pick-at-treatment partial-pick reopen**: user picks subset, can't
  reopen to add more later (must buy another course). MVP-acceptable.
- **Period enforcement** (min-interval between uses, e.g. 7 days/visit
  for Laser buffet 1-year): schema preserves `period` field but no
  save-time validation yet. Feature for Phase 15+.
- **React-patterns advisory**: IIFE top-level conditional renders (NOT
  click-handler crash pattern, pre-existing), silent catches in outer
  wrappers (non-mutation). Low priority; no bugs traced.
- **46% of synced courses are "shadow" rows** from ProClinic
  (empty courseType + null price). Filter at openBuyModal handles them
  — could move upstream to sync-time in a future polish pass.

---

## Violations This Session

**V13 added** (`.claude/rules/00-session-start.md` § 2) — 3 back-to-back
rounds of the same user-visible bug (buffet expiry + shadow courses +
LipoS pick), each shipped with green helper-unit tests while real UI was
still broken. Triggered creation of Rule I (iron-clad) mandating full-flow
simulate at every sub-phase. Cross-ref V11 (mock-shadowed export) + V12
(shape-migration half-fix) as the same failure-mode cluster.

**Iron-clad rule added — Rule I**:
Every sub-phase touching a user-visible flow gets a `phase<N>-<feature>-flow-simulate.test.js`
file. Required elements: (a) pure simulate mirrors of inline React logic,
(b) preview_eval on real Firestore data when dev server is live,
(c) source-grep regression guards, (d) adversarial inputs,
(e) lifecycle assertions on post-save docs. Helper-only tests are
NECESSARY BUT NOT SUFFICIENT.

---

## Resume Prompt

Paste this block into the next Claude session (or just invoke `/session-start`):

```
Resume LoverClinic OPD — continue from 2026-04-25 end-of-session.

Read in order BEFORE any tool call:
1. CLAUDE.md (stack + env + rule index including Rule I)
2. SESSION_HANDOFF.md (cross-session state of truth)
3. .agents/active.md (hot state — master=1cb58d5, 3959 tests, deployed)
4. .claude/rules/00-session-start.md (iron-clad A-I + V1-V13)
5. .agents/sessions/2026-04-25-rule-I-audits-deploy.md (detail checkpoint)

Status summary:
- master = 1cb58d5, 3959/3959 tests PASS, build clean
- Production = 1cb58d5 (deployed 2026-04-25, 200 OK probe passed)
- 12 commits this session: 10 user-reported bugs + Rule I + V13 + Priority 1/2/3 tests (+653 tests)
- 15 full-flow simulate test files exist per Rule I
- firestore:rules untouched

Next action:
User UI-verifies 8 items on prod (SESSION_HANDOFF "Outstanding User Actions"):
- Buffet course card: "บุฟเฟต์" + "หมดอายุอีก N วัน"
- Pick-at-treatment in-visit: PickProductsModal → save succeeds
- Pick-at-treatment late-visit: placeholder restores, pick + save works
- Multi-visit buffet: qty pinned
- DF Payout Report: non-zero ฿
- Blood type dropdown: 5 options
- Course search: 4 buffet matches (not 7)
- Treatment edit: reverse+reapply net-zero

If any fails: Rule I debug cycle. If all pass: advance next phase
per memory/project_execution_order.md (likely Phase 15 Central Stock).

Rules:
- No deploy unless user says "deploy" THIS turn (V4/V7)
- Probe-Deploy-Probe 4 endpoints before firestore:rules deploy (V1/V9)
- Full-flow simulate mandatory at sub-phase end (Rule I)
- Every bug → test + rule + audit invariant (Rule D + I)

Invoke /session-start to boot context.
```

---

## How to use this file

- `/session-end` skill auto-updates it. If editing manually, keep under ~250 lines.
- Detail lives in `.agents/sessions/YYYY-MM-DD-*.md` checkpoints.
- Resume Prompt block is the KEY output — user pastes into new chat to boot.
- Committed to repo (not memory-only) → team-visible + cross-machine synced.
