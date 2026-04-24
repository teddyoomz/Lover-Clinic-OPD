---
updated_at: "2026-04-24 (end-of-session via /session-end)"
status: "Phase 13 SHIPPED + deployed. Phase 14 Triangle brief captured. Armory upgraded (Rule F-bis + /triangle-inspect + opd.js flow/har/inspect). Ready to start Phase 14.1 next session."
current_focus: "Phase 14 DF ↔ Treatment Form wiring — Triangle captured, 14.1 (staff list bug + defaultDfGroupId) next"
branch: "master"
project_type: "node (React 19 + Vite 8 + Firebase + Tailwind 3.4)"
last_commit: "f55f62e"
tests: 3178
production_url: "https://lover-clinic-app.vercel.app"
last_deploy: "ab5a60a (2026-04-24) via vercel --prod — 8 commits AHEAD since deploy (fixes + armory)"
firestore_rules_deployed: "2026-04-24 via firebase deploy --only firestore:rules, Probe-Deploy-Probe 200x4 both sides"
---

# Active Context

## Objective

Phase 14 (DF ↔ Treatment Form wiring) starts next active session with 14.1
(staff list filter bug + `defaultDfGroupId` schema extension). All Triangle
scanning + brief complete — armed with real data, not guessed.

## Current State (end of 2026-04-24 session)

- **LoverClinic**: `master = f55f62e`, **3178 tests** passing, build clean.
- **Deployed this session**:
  - firestore:rules (4 new be_* rules from Phase 13.2-13.3) after Probe-Deploy-Probe 200x4 both sides
  - Vercel prod at `ab5a60a` (Phase 13 feature set + quotation fixes). 8 commits ahead since (fix + armory) — production is BEHIND HEAD.
- **Armory upgraded (F:/replicated/scraper/)** — 3 new commands + 1 test recipe committed in that separate repo:
  - `flow-commands.js` NEW — flow / har / inspect implementations
  - `commands.js` + `opd.js` — dispatcher + CLI parser updates
  - `recipes/smoke-df-doctor.json` + `recipes/df-modal-capture.json` + `recipes/df-save-capture.json`
  - Smoke-tested: `inspect /admin/df/doctor` returns 211 number inputs (matrix). `flow` recipe runs 15-step capture + apiLog.
- **Phase 13 commits this session** (14 commits): 13.1 quick fixes → 13.2 staff schedules → 13.3 DF matrix → 13.4 payout report → 13.5 tab-gate scaffold → 13.6 treatment validator + Phase 13 wrap. Then live bug fixes (dual print, print portal, logo, payment, price fallback).
- **V11 logged** mid-session (mock-shadowed missing export), rule 02 pre-commit checklist updated with V11 near-miss explainer.

## Blockers

None. Phase 14.1 ready to start.

## Next Action

**Phase 14.1** — Staff list filter bug + `defaultDfGroupId` schema extension (~1h).

Files to touch:
- `src/components/TreatmentFormPage.jsx:570` — `allDoctors.filter(d => d.position?.includes('ผู้ช่วย'))` misses assistants whose position field is empty or differently cased. Add fallback + log missing positions.
- `src/lib/doctorValidation.js` — `defaultDfGroupId` field already declared at line 136 as optional. **Make it mandatory for position='แพทย์' / 'ผู้ช่วยแพทย์'** + add validator.
- `src/lib/staffValidation.js` — add same `defaultDfGroupId` field (for non-doctor staff who may also appear in DF list, e.g. ผู้ช่วยทั่วไป).
- `src/components/backend/DoctorFormModal.jsx` + `StaffFormModal.jsx` — add DF group dropdown (reads `listDfGroups()`), required for roles that appear in treatment DF list.
- `tests/` — extend doctor/staff validator tests + add new assertions for defaultDfGroupId.

Success criteria: doctor save without defaultDfGroupId fails; staff list on TreatmentFormPage shows every active assistant; focused tests pass.

## Phase 14 roadmap (not started beyond 14.2 Triangle)

| Sub | งาน | Est |
|---|---|---:|
| 14.1 | Staff list bug + `defaultDfGroupId` schema | 1h |
| 14.2 | ✅ Triangle scan (DONE) — brief at `docs/proclinic-scan/df-modal-brief-phase14.md` | — |
| 14.3 | `DfEntryModal` (add/edit) — dropdown แพทย์ + dropdown group + course rows + override | 3h |
| 14.4 | TreatmentFormPage wiring (`dfEntries[]` + "เพิ่มค่ามือ" button + auto-compute on change) | 2h |
| 14.5 | Treatment validator extension + DF-payout consumes explicit `dfEntries[]` | 1.5h |

## Recent Decisions (this session, 2026-04-24)

1. **Rule F-bis codified** — behaviour capture required, not just shape. Screenshots + form intel lie by omission. `/triangle-inspect` skill enforces 7-step workflow.
2. **Armory upgrade committed** to F:/replicated/scraper/ — new commands `flow` (11-action DSL), `har` (HTTP Archive), `inspect` (JS eval). Used immediately to scan DF modal, discovered hidden `/admin/df/calculate2` API we would've missed otherwise.
3. **Phase 14 design**: client-side DF resolution (reuse Phase 13.3 `getRateForStaffCourse` + `computeDfAmount`). No new server endpoint needed — ProClinic's calculate2 just mirrors what our resolver already does.
4. **Dup-guard behaviour observed**: ProClinic ADD DF modal rejects doctors already having entries via `#editDfModal`. Our implementation should route existing-doctor editing through edit modal (not allow dup-add).
5. **Row inputs are unnamed** in ProClinic — JS harvests DOM at submit. Our replica can design `dfEntries[]` shape freely (no ProClinic parity at field-name level needed).
6. **Production is 8 commits behind HEAD** — fixes (dual print / portal / payment / logo / price) + armory docs not deployed yet. User decides when to re-deploy (awaiting explicit authorization).

## V-log status

- V11 logged this session (`23ad098` in `.claude/rules/00-session-start.md`): mock-shadowed missing export near-miss. Lesson: vi.mock creates export names; builds verify reachability; grep `^export` before writing new imports.
- No new V-entries pending.

## Optional follow-ups (not blocking)

- [ ] Re-deploy Vercel when user authorizes — 8 commits ahead include cosmetic fixes + armory docs
- [ ] Capture DF modal SAVE POST on a doctor with no existing entry (dup-guard blocked our first capture)
- [ ] Probe `#editDfModal` flow (open → inspect → fill → submit)
- [ ] Document armory in claude-guardrails feedback (compounding-loop across projects)

## Notes

- **Iron-clad rules** in `.claude/rules/` are unchanged this session except:
  - `00-session-start.md`: Rule F-bis added + V11 entry
  - `02-workflow.md`: V11 near-miss explainer added to VERIFY pre-commit step
- **.agents/** layer + V-log = core institutional memory. Never AI-compress.
- **Scraper repo** (`F:/replicated/`) is SEPARATE git repo — armory upgrade commits live there, not in LoverClinic-app. Access via `node F:/replicated/scraper/opd.js <cmd>`.
