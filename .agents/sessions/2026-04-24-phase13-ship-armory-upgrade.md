# 2026-04-24 · Phase 13 SHIPPED + Armory upgraded + Phase 14 scoped

## Summary

Marathon session: shipped Phase 13 (6 sub-phases, +313 tests), deployed
both firestore:rules + Vercel prod, logged V11 (mock-shadowed missing
export), upgraded the ProClinic-inspection armory with 3 new opd.js
commands (flow / har / inspect) driven by user directive to inspect
behaviour not just shape, then used the new armory to capture Phase 14
DF modal Triangle — discovering the hidden `/admin/df/calculate2`
endpoint we would have missed otherwise.

## Current State

- **Branch**: `master`
- **Last commit**: `f55f62e docs(phase14): extend DF modal brief with save-flow capture findings`
- **Tests**: 3178/3178 PASS (was 2865 at session start; +313 this session — Phase 13 net delta)
- **Build**: clean
- **Production**: `ab5a60a` via Vercel — **8 commits BEHIND HEAD** (quotation fixes + armory docs not deployed yet)
- **firestore:rules**: deployed to `loverclinic-opd-4c39b` after Probe-Deploy-Probe 200×4 both sides
- **Scraper repo (`F:/replicated/`)**: `flow-commands.js` NEW + `commands.js`/`opd.js` edited + 3 recipes — not tracked in LoverClinic-app git

## Decisions

1. **Rule F-bis — behaviour capture required**. Screenshots + form
   intel = shape only. For any feature replicating ProClinic interactive
   behaviour (conditional fields, auto-populate, modal flows), the
   Triangle Rule now requires fill + observe + inspect. Codified in
   `.claude/rules/00-session-start.md`. Enforced by new `/triangle-inspect`
   skill (7-step workflow).

2. **Armory upgrade committed** to scraper repo:
   - `opd.js flow <recipe.json>` — 11-action DSL (navigate / click /
     fill / selectOption / wait / observe / snapshot / inspect / dumpForm
     / waitForResponse), writes trace + apiLog to JSON
   - `opd.js har <page> [--recipe=.. --duration=..]` — full HAR export
     (HTTP Archive) importable to Chrome DevTools Network panel
   - `opd.js inspect <page> "<js-expr>"` — evaluate arbitrary JS in
     page context; captures JSON-safe result
   - User directive: "ใส่เครื่องมือในการช่วย inspect flow, wiring และ
     logic" + "ให้อิสระเต็มที่ในการเสริมอาวุธ" — pre-authorised.

3. **V11 logged** — mock-shadowed missing export. QuotationFormModal
   imported `getAllStaff` but the real export is `listStaff`. vi.mock
   created the name in the mock → focused tests passed; `npm run build`
   caught the MISSING_EXPORT. Rule 02 pre-commit VERIFY step updated
   with V11 near-miss explainer + pre-flight grep recommendation.

4. **Phase 14 design informed by DF modal Triangle capture**:
   - Treatment edit URL is `/admin/treatment/{numericId}/edit` (NOT the
     MC-prefix display label)
   - 2 modals: `#addDfModal` + `#editDfModal` — opened via JS, no
     `data-bs-target` triggers
   - **Hidden API found**: `POST /admin/df/calculate2?doctor_id=X&df_group_id=Y&treatment_id=Z`
     fires on modal open + doctor change + group change
   - Row inputs in the modal have NO `name` attribute — ProClinic JS
     harvests DOM at submit; our replica can design `dfEntries[]` shape
     freely (no field-name parity needed)
   - Client-side dup-guard: ADD modal rejects doctors already having
     entries; routes to `#editDfModal` instead
   - Our Phase 13.3 `getRateForStaffCourse` + `computeDfAmount` mirror
     the calculate2 logic — no new server endpoint required

5. **Phase 13 shipped with 6 sub-phases in one session** (~7h):
   - 13.1 quotations + convert-to-sale (5 commits)
   - 13.2 staff schedules + collision warning (5 commits)
   - 13.3 DF groups + rate matrix (3 commits)
   - 13.4 DF payout report (1 commit)
   - 13.5 tab-gate scaffolding (1 commit)
   - 13.6 treatment validator (1 commit + Phase 13 wrap)
   - Follow-up fixes post-deploy: dual print, print portal, payment,
     logo, price fallback

6. **Deploy sequence A → B → C → (not ended)**:
   - A — firestore:rules with full Probe-Deploy-Probe (4 endpoints pre
     + 4 post all 200) ✅
   - B — `vercel --prod` at `ab5a60a` ✅
   - C — session-end NOT executed immediately per user "ยังไม่ต้อง C
     นะ ดูบั๊คแล้วแก้ก่อย" → bug-fix rounds happened AFTER deploy
     (8 commits ahead of prod now)

## Blockers

None.

## Files Touched

**Source (LoverClinic-app master, 25 commits total this session):**

Phase 13.1 (staging fixes pre-deploy):
- `150c075` seller-name staff schema fields
- `23ad098` V11 + rule 02

Phase 13.2–13.6 shipping cascade (14 commits from `9b9d7eb` → `ab5a60a`):
- staffSchedule + dfGroup + dfPayout validators + CRUDs + UI
- Treatment validator
- 3 existing nav-config tests updated (master count 12→14, reports 12→13)

Phase 13.1 live fixes (post-deploy, pre-armory):
- `a93b7cd` dual print (SalePrintView + getBackendSale)
- `326e37b` print portal (createPortal fixes 3-page print bug)
- `565dda9` บันทึกชำระ modal (SalePaymentModal + markSalePaid)
- `aadf467` logo + disable paid button (logoUrlLight pref)
- `a4eab32` price fallback (6-variant field pickPrice)

Armory + Phase 14 Triangle:
- `9980082` Rule F-bis + /triangle-inspect skill (LoverClinic-app)
- `5879835` df-modal-brief-phase14.md
- `f55f62e` extended df-modal-brief with save-flow notes

**Scraper repo (F:/replicated/, separate git):**
- `flow-commands.js` NEW (465 lines)
- `commands.js` + `opd.js` edits (dispatcher + CLI parser)
- `recipes/smoke-df-doctor.json` + `recipes/df-modal-capture.json` + `recipes/df-save-capture.json`

## Commands Run

Notable (replay-friendly):
```bash
# Phase 13 sub-phases — standard pattern per sub:
npm test -- --run tests/<focused>.test.{js,jsx}
npm run build
git add <files> && git commit -m "..." && git push origin master

# Full regression end-of-Phase-13 (per feedback_test_per_subphase):
npm test -- --run   # 3178/3178 pass

# Deploy rules (Rule B Probe-Deploy-Probe):
curl -X POST "https://firestore.googleapis.com/v1/projects/loverclinic-opd-4c39b/databases/(default)/documents/artifacts/loverclinic-opd-4c39b/public/data/chat_conversations?documentId=test-probe-$(date +%s)" -d '{"fields":{"probe":{"booleanValue":true}}}'
# (× 4 endpoints, pre + post deploy)
firebase deploy --only firestore:rules
# Strip probe field from clinic_settings after deploy

# Vercel prod:
vercel --prod   # HEAD was ab5a60a at deploy time

# Armory smoke tests:
node F:/replicated/scraper/opd.js inspect "/admin/df/doctor" "document.querySelectorAll('input[type=number]').length"  # → 211
node F:/replicated/scraper/opd.js flow F:/replicated/scraper/recipes/smoke-df-doctor.json  # 6 steps, all ok

# Phase 14 Triangle captures:
node F:/replicated/scraper/opd.js flow F:/replicated/scraper/recipes/df-modal-capture.json  # found /admin/df/calculate2
node F:/replicated/scraper/opd.js har "/admin/treatment/3357/edit" --recipe=F:/replicated/scraper/recipes/df-save-capture.json
```

## Commit List (this session, 25 commits on master)

```
f55f62e docs(phase14): extend DF modal brief with save-flow capture findings
5879835 docs(phase14): Triangle-inspect brief for DF modal on treatment edit
9980082 docs(rules): Rule F-bis + /triangle-inspect skill + 3 new scraper commands
a4eab32 fix(phase13.1.3): sub-item price falls back across master_data shape variants
aadf467 fix(phase13.1): print logo uses logoUrlLight; disable บันทึกชำระ when paid
565dda9 feat(phase13.1.4): 'บันทึกชำระ' button on converted quotation row
326e37b fix(phase13.1): print produces 3 pages — portal overlay outside #root
a93b7cd fix(phase13.1.4): dual print after convert — quotation + sale side-by-side
ab5a60a feat(phase13.6): treatment validator + schema — Phase 13 SHIPPED
c85399a feat(phase13.5): permission tab-gate scaffolding — Phase 13.5 SHIPPED
8b91c62 feat(phase13.4): DF Payout Report — Phase 13.4 SHIPPED
ad3645b feat(phase13.3.3): DfGroupsTab + FormModal + nav wiring — Phase 13.3 SHIPPED
122e045 feat(phase13.3.2): DF group + staff-rate CRUD + firestore rules
920f4e0 feat(phase13.3.1): DF group + staff-rate validator + resolver
7f79894 feat(phase13.2.5): nav + dashboard wiring — Phase 13.2 SHIPPED
2823569 feat(phase13.2.4): AppointmentTab staff-schedule collision warning
59466a5 feat(phase13.2.3): StaffSchedulesTab — inline form + list
af1e7d5 feat(phase13.2.2): be_staff_schedules CRUD + firestore rules
9b9d7eb feat(phase13.2.1): be_staff_schedules validator + collision helper
23ad098 docs(rules): log V11 + update rule 02 with mock-shadow caveat
150c075 fix(phase13.1): QuotationFormModal seller dropdown — use staff schema fields
(... and 4 earlier Phase 13.1 commits at session start: 3e4a23b / efe0bc9 / 68635be / c5b1658 / d39bd2b / f5bff7d)
```

## Next Todo (ranked by risk vs value)

1. **Phase 14.1** (1h, Low risk) — staff list filter bug + defaultDfGroupId schema. Pure schema + UI field. Unblocks 14.3.
2. **Phase 14.3** (3h, Medium risk) — DfEntryModal (add + edit). Biggest UX piece. Needs 14.1 defaults to pre-fill correctly.
3. **Phase 14.4** (2h, Medium risk) — TreatmentFormPage wiring. Integrates modal + auto-compute into real save flow.
4. **Phase 14.5** (1.5h, Low risk) — validator extension + DF payout aggregator update to consume explicit dfEntries[]. Closes the loop with Phase 13.4 report.
5. (Optional) Re-deploy Vercel — 8 commits ahead include cosmetic fixes + armory docs. User decides when.

## Resume Prompt

(copy block in SESSION_HANDOFF.md)
