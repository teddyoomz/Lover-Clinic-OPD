# Session Handoff — LoverClinic OPD Cross-Session State

> **This file is read FIRST every new session.** Updated by `/session-end` skill.
> Link out to `.agents/sessions/*` for detail.

---

## Current State

- **Date last updated**: 2026-04-24 (end-of-session)
- **Branch**: `master`
- **Last commit**: `f55f62e docs(phase14): extend DF modal brief with save-flow capture findings`
- **Test count**: 3178 / 3178 passing (was 2865 at session start; +313 this session)
- **Build**: clean
- **Deploy state**:
  - **firestore:rules**: deployed 2026-04-24 (Probe-Deploy-Probe 200×4 both sides)
  - **Vercel prod**: `ab5a60a` via `vercel --prod` — **8 commits BEHIND HEAD** (quotation fixes + armory docs not deployed)
- **Production URL**: https://lover-clinic-app.vercel.app
- **Remote sync**: master = origin/master ✅

**Scraper companion (`F:/replicated/`, separate git repo):**
- `flow-commands.js` NEW + `commands.js` + `opd.js` + 3 recipes in `recipes/` — committed in that repo
- Commands live: `opd.js flow|har|inspect`

---

## What's Done (recent phases)

- ✅ **Phase 1-11.9** — base app + Master Data Suite (historical)
- ✅ **Phase 12.0-12.11** — Financial completeness + adapter bridge + Firebase Admin SDK (historical)
- ✅ **Phase 13.1** (2026-04-24) — Quotations + convert-to-sale + dual-print + payment-record
- ✅ **Phase 13.2** (2026-04-24) — Staff schedules + AppointmentTab collision warning
- ✅ **Phase 13.3** (2026-04-24) — DF groups + staff-rate matrix + DfGroupsTab UI
- ✅ **Phase 13.4** (2026-04-24) — DF Payout Report (aggregator + ReportTab)
- ✅ **Phase 13.5** (2026-04-24) — Tab-gate scaffolding (pure helpers + stub hook, no wiring yet)
- ✅ **Phase 13.6** (2026-04-24) — Treatment validator + schema
- ✅ **V11 logged** (2026-04-24) — mock-shadowed missing export; rule 02 pre-commit updated
- ✅ **Deployed** (2026-04-24) — firestore:rules (4 new be_* rules) + Vercel prod at ab5a60a
- ✅ **Armory upgrade** (2026-04-24) — Rule F-bis + /triangle-inspect skill + opd.js flow/har/inspect commands
- ✅ **Phase 14 Triangle scan DONE** — DF modal brief at `docs/proclinic-scan/df-modal-brief-phase14.md`

---

## What's Next

**Phase 14.1 Staff list bug + `defaultDfGroupId` schema** (next active session, ~1h, Low risk)

Files to touch (per Triangle brief):
- `src/components/TreatmentFormPage.jsx:570` — assistant filter misses some positions; add fallback
- `src/lib/doctorValidation.js:136` — make `defaultDfGroupId` required for positions ผู้ช่วยแพทย์ / แพทย์
- `src/lib/staffValidation.js` — add `defaultDfGroupId` field
- `src/components/backend/DoctorFormModal.jsx` + `StaffFormModal.jsx` — add DF group dropdown field
- `tests/` — extend validator tests (~+10 tests)

Then Phase 14.2 (already done — Triangle) → 14.3 (DfEntryModal) → 14.4 (TreatmentFormPage wiring) → 14.5 (validator + aggregator update).

Triangle artefacts:
- `docs/proclinic-scan/df-modal-brief-phase14.md` — full behavioural capture with hidden `/admin/df/calculate2` API
- `F:/replicated/output/flows/df-modal-capture-*.json` — 15-step flow trace with apiLog
- `F:/replicated/output/har/har-*_treatment_3357_edit-*.har` — full HTTP Archive

---

## Outstanding User Actions (NOT auto-run)

- [ ] **Vercel re-deploy** — HEAD `f55f62e` is 8 commits ahead of prod `ab5a60a`. Includes: dual print fix, print portal fix, บันทึกชำระ modal, logo fix, price fallback, armory docs. User decides when.
- [ ] **Test Phase 13 features end-to-end on prod** after re-deploy — quotations / staff schedules / DF groups / DF payout report
- [ ] **Optional Phase 14 Triangle follow-up captures**:
  - Save POST on a doctor with NO existing entry (dup-guard blocked our capture)
  - `#editDfModal` flow probe
- [ ] **Port armory + Rule F-bis to claude-guardrails** — same methodology upgrade benefits every project using guardrails
- [ ] **firestore:rules deploy** — NONE pending

---

## Blockers

None.

---

## Known Limitations / Technical Debt

- Phase 14 is new scope (DF ↔ Treatment integration). Phase 13 shipped the DATA layer of DF; Phase 14 wires it into TreatmentFormPage.
- 5 newer guardrails skills exist in `.claude/skills/` (copied earlier this session): `audit-rules`, `audit-health`, `skill-relevant`, `research-gap`, `skill-autoinstall`. Available but not yet used in LoverClinic flow.
- Production is 8 commits behind HEAD — includes cosmetic fixes + armory docs. Not urgent but prod UX for quotation convert + print shows stale behaviour.
- `membership_types` + `wallet_types` still master_data-only (Phase 16 migration candidates).

---

## Violations This Session

**V11 — 2026-04-24 — Mock-shadowed missing export** (pre-commit near-miss, caught by `npm run build`):
- `QuotationFormModal` imported `getAllStaff`; real export is `listStaff`
- `vi.mock()` created the name in the mock → focused tests passed, build caught it
- Rule 02 VERIFY step augmented + entry added to `.claude/rules/00-session-start.md`

---

## Resume Prompt

Paste this block into the next Claude session (or just invoke `/session-start`):

```
Resume LoverClinic OPD — continue from 2026-04-24 end-of-session.

Read in order BEFORE any tool call:
1. CLAUDE.md (stack + env + rule index)
2. SESSION_HANDOFF.md (this file, cross-session state of truth)
3. .agents/active.md (hot state — master=f55f62e, 3178 tests)
4. .claude/rules/00-session-start.md (iron-clad A-H + F-bis + V1-V11)
5. .agents/sessions/2026-04-24-phase13-ship-armory-upgrade.md (detail checkpoint)

Status summary:
- master = f55f62e, 3178/3178 tests pass, build clean
- Production (Vercel): ab5a60a — 8 commits BEHIND HEAD (fix + armory docs)
- firestore:rules: deployed 2026-04-24 (4 new be_* rules from Phase 13.2-13.3)
- Scraper armory (F:/replicated/scraper/): opd.js flow | har | inspect NEW
- Phase 14 Triangle DONE — brief at docs/proclinic-scan/df-modal-brief-phase14.md

Next action (Phase 14.1, ~1h, Low risk):
A. Fix staff list filter bug at src/components/TreatmentFormPage.jsx:570
   (assistants filter misses some positions — grep before fix)
B. Make defaultDfGroupId required in doctorValidation.js + add to staffValidation.js
C. Add DF group dropdown to DoctorFormModal + StaffFormModal
D. Extend validator tests (~+10)

Phase 14 roadmap after 14.1: 14.3 DfEntryModal (3h) → 14.4 TreatmentFormPage wiring (2h) → 14.5 validator + aggregator update (1.5h). 14.2 Triangle already DONE.

Outstanding user-triggered actions (NOT auto-run):
- Vercel re-deploy (8 commits ahead) — user decides when
- Optional: Phase 14 Triangle follow-ups (save POST + edit modal probe)
- Optional: port armory + Rule F-bis to claude-guardrails

Rules to remember:
- No deploy without explicit THIS-turn authorization (V4/V7 repeat)
- Probe-Deploy-Probe 4 endpoints before any firestore:rules deploy (V1/V9 repeat)
- Rule F-bis (NEW 2026-04-24): behaviour capture not just shape — use /triangle-inspect skill for any interactive ProClinic replica
- V11 (NEW 2026-04-24): vi.mock creates names; trust npm run build over focused tests for import resolution
- Phase 13 feedback_test_per_subphase: focused tests per sub-commit; full regression only at end of major Phase (13/14/15/16)
- Backend = Firestore ONLY except MasterDataTab (rule E)
- Every bug → test + rule + audit invariant (rule D)

Invoke /session-start to boot context.
```

---

## How to use this file

- `/session-end` skill auto-updates it. If editing manually, keep under ~200 lines.
- Detail lives in `.agents/sessions/YYYY-MM-DD-*.md` checkpoints.
- Resume Prompt block is the KEY output — user pastes into new chat to boot.
- Committed to repo (not memory-only) → team-visible + cross-machine synced.
