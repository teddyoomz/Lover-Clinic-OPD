# Phase 26.2g-fillin — patientData → TFP health-state auto-fill (design spec)

**Date:** 2026-05-13
**Brainstorm approval:** user explicit "Phase 26.2g-fillin: approve design" (2026-05-13)
**Predecessor:** Phase 26.2f (TreatmentReadOnlyMirror + vitals-save workflow shipped at `6d134a5`)

---

## 1. Problem (user-reported, verbatim)

User creates a patient via PatientForm (kiosk / QR / admin manual). Patient declares:
- Chronic conditions via `hasUnderlying:'มี'` + checkboxes (`ud_diabetes`, `ud_hypertension`, ...) + `ud_otherDetail`
- Current medication via `currentMedication` textarea
- Pregnancy state via `pregnancy` radio

Later, admin opens a new TFP (create mode) for that customer. Two health-info textareas stay empty:
- **โรคประจำตัว** (`congenitalDisease`) — should be derived from `hasUnderlying` + `ud_*` flags
- **ประวัติการรักษาอื่นๆ** (`treatmentHistory`) — should be derived from `currentMedication` + `pregnancy`

Pre-existing auto-fill (TFP:1017-1020) handles `bloodType` + `drugAllergy` (via `patientData.allergiesDetail`) but never extended to chronic + medication. Result: every new TFP starts blank for those fields, forcing admin to re-key from the patient profile.

## 2. Class-of-bug (Rule P Step 2)

**V12 multi-reader-sweep family** at TFP create-mode auto-fill boundary. Same shape as V52 (report-tabs branch-scope drift) / V36 (callsite gap) / V44 (canonical-mapper bypass): one block of code handles N derived values, two were filled, two were silently dropped.

Sub-class: **patient-profile → treatment-record health-info field-completion gap.** No prior V-entry covers this surface specifically. AV40 invariant locks the contract.

## 3. Data source decision (Q1 — locked by user prior session)

Auto-fill reads **structured `patientData.*` fields**, NOT `customer.note`. Rationale:
- PatientForm writes ONLY to `patientData.*` (verified via `src/pages/PatientForm.jsx:245` healthFields list)
- `customer.note` is admin free-text, may contain unrelated content
- `patientData` is the canonical patient self-report (PDPA-relevant fields)

Available shape (canonical):
```js
patientData = {
  hasAllergies: 'มี' | 'ไม่มี',
  allergiesDetail: string,           // already used by line 1019
  hasUnderlying: 'มี' | 'ไม่มี',
  ud_hypertension: boolean,
  ud_diabetes: boolean,
  ud_lung: boolean,
  ud_kidney: boolean,
  ud_heart: boolean,
  ud_blood: boolean,
  ud_other: boolean,
  ud_otherDetail: string,
  currentMedication: string,         // free text
  pregnancy: string,                 // default 'ไม่เกี่ยวข้อง/ไม่ได้ตั้งครรภ์'
  bloodType: string,                 // already used by line 1018
}
```

## 4. Helper API

NEW file `src/lib/patientHealthMapping.js`. Pure JS. Zero Firebase. Branch-blind.

### `derivePatientCongenitalDisease(patientData) → string`

Returns comma-separated Thai labels of chronic conditions. Returns `''` (empty) when:
- `patientData` falsy / non-object
- `hasUnderlying !== 'มี'` (patient explicitly declared no underlying)
- All `ud_*` flags falsy AND `ud_otherDetail` empty/whitespace

Order matches PatientForm UI order (hypertension → diabetes → lung → kidney → heart → blood → other).

```
Input:  { hasUnderlying:'มี', ud_diabetes:true, ud_hypertension:true }
Output: 'ความดันโลหิตสูง, เบาหวาน'

Input:  { hasUnderlying:'มี', ud_other:true, ud_otherDetail:'ไมเกรน' }
Output: 'ไมเกรน'

Input:  { hasUnderlying:'มี', ud_diabetes:true, ud_other:true, ud_otherDetail:'ไมเกรน' }
Output: 'เบาหวาน, ไมเกรน'

Input:  { hasUnderlying:'ไม่มี', ud_diabetes:true }   // user contradicted self
Output: ''                                              // hasUnderlying wins

Input:  null | undefined | {} | 'string'
Output: ''
```

Label map (frozen):
```js
const UD_LABELS = Object.freeze({
  ud_hypertension: 'ความดันโลหิตสูง',
  ud_diabetes:     'เบาหวาน',
  ud_lung:         'โรคปอด',
  ud_kidney:       'โรคไต',
  ud_heart:        'โรคหัวใจ',
  ud_blood:        'โรคโลหิต',
});
```

`ud_other=true` with empty `ud_otherDetail` → silently skip (not "other" by itself — needs the detail to be meaningful).

### `derivePatientTreatmentHistory(patientData) → string`

Returns " / "-joined parts. Returns `''` when both inputs are empty / sentinel.

Parts (in this order when both present):
1. `การตั้งครรภ์: <value>` — only when `pregnancy` is a non-empty string AND NOT the sentinel `'ไม่เกี่ยวข้อง/ไม่ได้ตั้งครรภ์'`
2. `ยาที่ใช้ประจำ: <trimmed value>` — only when `currentMedication` trims to non-empty

```
Input:  { pregnancy:'กำลังตั้งครรภ์', currentMedication:'Asprin 1 เม็ด เช้า' }
Output: 'การตั้งครรภ์: กำลังตั้งครรภ์ / ยาที่ใช้ประจำ: Asprin 1 เม็ด เช้า'

Input:  { pregnancy:'ไม่เกี่ยวข้อง/ไม่ได้ตั้งครรภ์', currentMedication:'Asprin' }
Output: 'ยาที่ใช้ประจำ: Asprin'

Input:  { pregnancy:'', currentMedication:'   ' }
Output: ''

Input:  null
Output: ''
```

The literal label prefixes (`การตั้งครรภ์:` + `ยาที่ใช้ประจำ:`) are exported constants so tests can lock the wording and admin can recognize the auto-fill origin in the textarea.

## 5. TFP wiring

`src/components/TreatmentFormPage.jsx` — extend the existing create-mode block at lines 1016-1020:

```js
// Pre-fill from patient data (create mode only — !isEdit)
if (patientData) {
  if (patientData.bloodType && !isEdit) setBloodType(patientData.bloodType);
  if (patientData.allergiesDetail && !isEdit) setDrugAllergy(patientData.allergiesDetail);
  // Phase 26.2g-fillin — derive chronic + treatment-history from structured patientData
  if (!isEdit) {
    const derivedCongenital = derivePatientCongenitalDisease(patientData);
    if (derivedCongenital) setCongenitalDisease(derivedCongenital);
    const derivedHistory = derivePatientTreatmentHistory(patientData);
    if (derivedHistory) setTreatmentHistory(derivedHistory);
  }
}
```

Import added at the top with the other lib imports.

**Edit-mode untouched** — lines 927-932 still drive edit-mode restore from `t.healthInfo.*`. Auto-fill is create-mode-only by contract.

**Non-empty gate** — only call setter when derived value is non-empty. Avoids needlessly thrashing state from `''` (default) to `''` (derived empty). Mirrors the existing `if (patientData.bloodType && ...)` gate shape.

## 6. Anti-patterns (forbidden)

- ❌ Read from `customer.note` (PatientForm doesn't write there; would be drift)
- ❌ Read from `master_data/*` (Rule H-quater)
- ❌ Auto-fill in edit mode (would overwrite admin's prior edits — the whole point of `!isEdit` gate)
- ❌ Inline the mapping logic in TFP (Rule of 3 — extract from day one; future readers want the same data)
- ❌ Auto-fill in vitals-save mode (Phase 26.2f locked saveMode='vitals'; health-info textareas only meaningful at full doctor-save)
- ❌ Mutate `patientData` argument

## 7. Test bank (Rule N + Rule I, ~12-15 assertions)

### `tests/phase-26-2g-fillin-patient-health-mapping.test.js` (unit + property)

L1 — `derivePatientCongenitalDisease` (8 cases):
- L1.1: empty / null / undefined / non-object → `''`
- L1.2: `hasUnderlying:'ไม่มี'` ignores any ud_* → `''`
- L1.3: single flag → label
- L1.4: two flags → comma-join in UI order
- L1.5: all 6 flags → all 6 labels in UI order
- L1.6: `ud_other:true` + `ud_otherDetail:'X'` → `'X'`
- L1.7: `ud_other:true` no detail → omit
- L1.8: mixed flags + ud_other detail → flags first then detail

L2 — `derivePatientTreatmentHistory` (5 cases):
- L2.1: empty / null → `''`
- L2.2: sentinel pregnancy + no med → `''`
- L2.3: non-sentinel pregnancy + no med → `'การตั้งครรภ์: <val>'`
- L2.4: empty pregnancy + med → `'ยาที่ใช้ประจำ: <val>'`
- L2.5: both → joined by ` / ` with pregnancy first
- L2.5b: med with surrounding whitespace → trimmed

L3 — Export constants locked (2 cases):
- L3.1: `PREGNANCY_LABEL_PREFIX === 'การตั้งครรภ์: '` (or equivalent locked literal)
- L3.2: `MEDICATION_LABEL_PREFIX === 'ยาที่ใช้ประจำ: '`

### `tests/phase-26-2g-fillin-source-grep.test.js` (source-grep regression)

G1 — TFP wiring (3 cases):
- G1.1: TFP imports `derivePatientCongenitalDisease` + `derivePatientTreatmentHistory`
- G1.2: Both helpers called inside the `if (patientData) { ... }` block at the create-mode site
- G1.3: Both call-sites gated by `!isEdit` (no edit-mode auto-fill)

G2 — AV40 universal classifier (1 case):
- G2.1: NO `src/components/**` file outside TFP reads `patientData.ud_*` directly (would-be class-of-bug expansion site). Future readers MUST use the helpers.

### `tests/phase-26-2g-fillin-flow-simulate.test.js` (Rule I full-flow)

F1 — End-to-end auto-fill simulation (3 cases):
- F1.1: patientData with chronic + medication → simulated load → `setCongenitalDisease` + `setTreatmentHistory` fire with derived values
- F1.2: patientData with `hasUnderlying:'ไม่มี'` → neither setter fires (empty result)
- F1.3: Edit mode (`isEdit:true`) → neither setter fires regardless of patientData (gate respected)

Total: ~16 assertions across 3 files (slightly over the brainstorm estimate to ensure F1.2 + F1.3 lock the gate logic).

## 8. Audit invariant (AV40)

NEW entry in `.agents/skills/audit-anti-vibe-code/SKILL.md`:

> **AV40 — `patientData.ud_*` reads centralized via `patientHealthMapping.js`** (Phase 26.2g-fillin, 2026-05-13)
>
> Direct reads of `patientData.ud_diabetes` / `patientData.ud_hypertension` / `patientData.ud_lung` / `patientData.ud_kidney` / `patientData.ud_heart` / `patientData.ud_blood` / `patientData.ud_other` / `patientData.ud_otherDetail` / `patientData.hasUnderlying` / `patientData.currentMedication` / `patientData.pregnancy` are forbidden in `src/components/**` AND `src/pages/**`. Use `derivePatientCongenitalDisease` / `derivePatientTreatmentHistory` from `src/lib/patientHealthMapping.js` instead.
>
> **Sanctioned exceptions** (allow-list, source-grep'd):
> - `src/pages/PatientForm.jsx` — writer of these fields, not reader
> - `src/pages/AdminDashboard.jsx` — patient detail panel display chips at lines ~4504-4533 (`d.ud_*` JSX literals + `d.pregnancy` chip-color logic; pure display, not transform)
> - `src/utils.js` — Thai + English PMH builders at lines ~345-356 + ~415-426 inside `formatPatientFormSummary` (or similarly-named OPD print builder); pre-existing inline derivation with different output shape (line-prefixed "ประวัติโรคประจำตัว :"/"Past Medical History:" + "ปฏิเสธ"/"No known" fallback). **Tech-debt note**: future Rule-of-3 refactor opportunity to consume `derivePatientCongenitalDisease` from the helper module; out of scope for Phase 26.2g-fillin.
>
> **Why:** prevents the V12 multi-reader-sweep that surfaced Phase 26.2g-fillin (TFP create-mode field-completion gap). Future patient-health derivations land in the lib + tests there; consumers stay declarative.

### Class-of-bug discovery (Rule P Step 3 grep, 2026-05-13)

Pre-flight grep `grep -rn "\.ud_(diabetes|hypertension|lung|kidney|heart|blood|other|otherDetail)|\.hasUnderlying|\.currentMedication|\.pregnancy" src/` surfaced 3 callers (above). TFP create-mode auto-fill is the user-visible bug. AdminDashboard chips + utils.js OPD-print builder are sanctioned tech-debt. No fourth caller exists; class-of-bug is bounded by AV40 lock.

## 9. File structure (locked)

| Type | Path | Responsibility |
|---|---|---|
| NEW | `src/lib/patientHealthMapping.js` | 2 pure helpers + 2 label-prefix exports + frozen UD_LABELS |
| EDIT | `src/components/TreatmentFormPage.jsx` | Add 1 import line + extend `if (patientData)` block (~6 LOC) |
| NEW | `tests/phase-26-2g-fillin-patient-health-mapping.test.js` | L1-L3 unit (~15 assertions) |
| NEW | `tests/phase-26-2g-fillin-source-grep.test.js` | G1-G2 regression locks |
| NEW | `tests/phase-26-2g-fillin-flow-simulate.test.js` | F1 Rule I chain |
| EDIT | `.agents/skills/audit-anti-vibe-code/SKILL.md` | AV40 invariant block |
| EDIT | `.claude/rules/00-session-start.md` | V-summary table append Phase 26.2g-fillin (one-liner) |
| EDIT | `SESSION_HANDOFF.md` / `.agents/active.md` | State update (session-end) |

Net new code: ~80 LOC (helper) + ~6 LOC (TFP) + ~120 LOC (tests across 3 files).

## 10. Out of scope

- Other auto-fill expansions (e.g. ADAM scores, isPerfMode flags) — separate phase
- patientData → backend transform — already canonical (V33-X build/reverseMap)
- TFP edit-mode behavior — unchanged
- Mirror (Phase 26.2f) — read-only, doesn't auto-fill anything
- Vitals-save mode — health-info textareas not in scope at vitals stage

## 11. Verify locally first

Per Rule N (targeted-only for small fix):
1. `npx vitest run tests/phase-26-2g-fillin-*.test.js` → ~16 assertions GREEN
2. `npx vitest run tests/audit-anti-vibe-code.test.js` (if AV40 is asserted there too)
3. `npm run build` → clean (catches import typos)
4. Final pre-commit: `npm test -- --run` (full suite per Rule N "small-fix touches shared lib")

## 12. Deploy authorization (V18 reaffirmed)

NO deploy this turn. 50 commits ahead of prod already; Phase 26.2g-fillin commits join the queue. User authorizes `vercel --prod` + `firebase deploy --only firestore:rules` separately per V15 (combined deploy + Probe-Deploy-Probe).
