# Phase 26.2g-fillin-bis — canonical patientData resolvers (design spec)

**Date:** 2026-05-13
**Brainstorm approval:** user explicit "ok let's gooo" (2026-05-13)
**Predecessor:** Phase 26.2g-fillin (master `9135313`) + Phase 26.2g-fillin-followup (master `75f90be`)
**Class:** V21 architectural-error correction + V12 multi-reader-sweep close at TFP create-mode auto-fill

---

## 1. Critical context: Phase 26.2g-fillin was a no-op

`updateCustomerFromForm` at `src/lib/backendClient.js:586`:
```js
patientData: buildPatientDataFromForm(finalForm),
```

`buildPatientDataFromForm` (lines 278-353) writes ONLY canonical camelCase fields. It does NOT preserve `hasUnderlying` / `ud_*` / `allergiesDetail` / `currentMedication` / `pregnancy` (kiosk-shape fields). Those fields live on `opd_sessions/{id}.patientData` (kiosk source); `kioskPatientToCanonical.js` pre-derives them into canonical string fields BEFORE the customer doc is written via `addCustomer`. The customer doc never sees the kiosk shape.

**Phase 26.2g-fillin's `derivePatientCongenitalDisease` / `derivePatientTreatmentHistory` helpers read kiosk-shape fields that NEVER exist on `be_customers.patientData`.** The helpers always returned `''`. The auto-fill never fired for any customer (kiosk-created or admin-created). The bug went undetected because:
- (a) bloodType auto-fill DID work (canonical field exists on both paths)
- (b) tests verified helpers in isolation (unit tests) without verifying they were pointed at the right consumer surface
- (c) tests verified TFP wiring shape (source-grep) without verifying runtime behavior on a real be_customers patientData

User's surfacing complaint: edited LC-26000001 via admin form → entered "ง่วง" / "พารา" / "ขนมถ้วย" → opened TFP create → all 3 textareas empty (placeholder text only).

This is a V21-class architectural error: I read fields that never exist on the target doc shape. The institutional memory must record this.

## 2. Canonical patientData field map on `be_customers.patientData`

| Field | Source — admin form path | Source — kiosk path |
|---|---|---|
| `bloodType` | `form.blood_type` | `kioskPatientToCanonical:141` (`d.bloodType`) |
| `congenitalDisease` (string) | `form.congenital_disease` (raw admin text) | `kioskPatientToCanonical:157` (pre-derived from `d.hasUnderlying`+`d.ud_*`) |
| `drugAllergy` (string) | `form.history_of_drug_allergy` (raw admin) | `kioskPatientToCanonical:156` (= `d.allergiesDetail` when `d.hasAllergies==='มี'`) |
| `foodAllergy` (string) | `form.history_of_food_allergy` (raw admin) | NOT WRITTEN (kiosk has no separate food allergy) |
| `beforeTreatment` (string) | `form.before_treatment` | NOT WRITTEN (kiosk doesn't fill) |
| `pregnanted` (boolean) | `form.pregnanted` | NOT WRITTEN (kiosk uses `pregnancy` string, lost to note via clinicalSummary) |
| `note` (string) | `form.note` | `kioskPatientToCanonical:170` (= `clinicalSummary` which includes kiosk medication + pregnancy) |

**Key insight**: kiosk medication + pregnancy STRING are NOT preserved as structured canonical fields. They flow into the `note` (clinicalSummary) string. Recovering them cleanly requires a schema change (out of scope).

## 3. Class-of-bug

**V12 multi-reader-sweep family at the data-shape boundary** + **V21 architectural error**.

V12 dimension: TFP auto-fill ignores admin-shape canonical fields (`drugAllergy`, `foodAllergy`, `beforeTreatment`, `pregnanted`) — also affects pre-Phase 26.2g-fillin code (the line 1019 `setDrugAllergy(patientData.allergiesDetail)` was equally broken).

V21 dimension: Phase 26.2g-fillin read kiosk-shape fields on the canonical-only target. Wrong fields, wrong assumption about data shape persistence.

## 4. Goal

TFP create-mode auto-fill reads the canonical patientData fields directly (admin-shape names: `congenitalDisease`, `drugAllergy`, `foodAllergy`, `beforeTreatment`, `pregnanted`). All admin-created AND kiosk-created customers get correct auto-fill.

## 5. Approach (locked = A)

**Approach A — direct canonical reads via NEW resolver helpers** (user-locked, 2026-05-13).

1. Extend `src/lib/patientHealthMapping.js` with 3 NEW pure helpers + 3 NEW label-prefix constants.
2. TFP swap `derivePatient*` → `resolvePatient*` calls (3 setter sites).
3. Existing `derivePatient*` helpers stay UNTOUCHED (legitimate use: `src/utils.js` OPD print consumes opd_session.patientData where kiosk-shape DOES exist).
4. AV40 extended to lock direct reads of canonical `drugAllergy`/`foodAllergy`/`beforeTreatment`/`pregnanted` in `src/components/**` + `src/pages/**`.

**Rejected alternatives**:
- B (revert Phase 26.2g-fillin entirely): loses utils.js Rule-of-3 close. Not worth.
- C (extend `derivePatient*` to check both shapes): conflates two concerns in one helper; breaks Phase 26.2g-fillin-followup's English-helper contract; the existing helpers DO serve a legitimate purpose (just not TFP).

## 6. New helper APIs (`src/lib/patientHealthMapping.js`)

```js
const BEFORE_TREATMENT_LABEL_PREFIX = 'การรักษาก่อนหน้า: ';
const DRUG_ALLERGY_LABEL_PREFIX     = 'แพ้ยา: ';
const FOOD_ALLERGY_LABEL_PREFIX     = 'แพ้อาหาร: ';
// reuse existing PREGNANCY_LABEL_PREFIX = 'การตั้งครรภ์: '

/**
 * Direct canonical read — patientData.congenitalDisease is the authoritative
 * field, populated for both admin-created customers (raw text) and kiosk-created
 * customers (pre-derived via kioskPatientToCanonical from ud_* flags).
 */
export function resolvePatientCongenitalDisease(patientData) {
  if (!_isPlainObject(patientData)) return '';
  return typeof patientData.congenitalDisease === 'string'
    ? patientData.congenitalDisease.trim()
    : '';
}

/**
 * Compose drugAllergy + foodAllergy. Asymmetric prefix rule:
 *   - Both present → prefix both for disambiguation
 *   - drugAllergy only → raw (TFP textarea label "ประวัติแพ้ยา" provides context)
 *   - foodAllergy only → prefix (disambiguate from drug; TFP label is drug-oriented)
 *   - Neither → ''
 */
export function resolvePatientDrugAllergy(patientData) {
  if (!_isPlainObject(patientData)) return '';
  const drug = typeof patientData.drugAllergy === 'string'
    ? patientData.drugAllergy.trim() : '';
  const food = typeof patientData.foodAllergy === 'string'
    ? patientData.foodAllergy.trim() : '';
  if (drug && food) {
    return `${DRUG_ALLERGY_LABEL_PREFIX}${drug} / ${FOOD_ALLERGY_LABEL_PREFIX}${food}`;
  }
  if (drug) return drug;
  if (food) return `${FOOD_ALLERGY_LABEL_PREFIX}${food}`;
  return '';
}

/**
 * Compose beforeTreatment + pregnanted boolean. Locked prefixes — all parts
 * always prefixed when present (matches Q3 user direction).
 *
 * NOTE: kiosk medication string is NOT preserved on be_customers.patientData
 * (lost to `note` via clinicalSummary). Adding currentMedication recovery
 * requires a schema change (out of scope).
 */
export function resolvePatientTreatmentHistory(patientData) {
  if (!_isPlainObject(patientData)) return '';
  const parts = [];
  const before = typeof patientData.beforeTreatment === 'string'
    ? patientData.beforeTreatment.trim() : '';
  if (before) parts.push(`${BEFORE_TREATMENT_LABEL_PREFIX}${before}`);
  if (patientData.pregnanted === true) {
    parts.push(`${PREGNANCY_LABEL_PREFIX}กำลังตั้งครรภ์`);
  }
  return parts.join(' / ');
}
```

3 new exports + `BEFORE_TREATMENT_LABEL_PREFIX` + `DRUG_ALLERGY_LABEL_PREFIX` + `FOOD_ALLERGY_LABEL_PREFIX` constants. Total ~70 LOC added.

## 7. TFP refactor

Replace the existing Phase 26.2g-fillin block at lines 1024-1034 plus REMOVE the pre-existing line `setDrugAllergy(patientData.allergiesDetail)` at line 1019 (which was ALSO a no-op all along — allergiesDetail doesn't exist on be_customers).

**Before** (lines 1017-1034 post-Phase 26.2g-fillin):
```js
if (patientData) {
  if (patientData.bloodType && !isEdit) setBloodType(patientData.bloodType);
  if (patientData.allergiesDetail && !isEdit) setDrugAllergy(patientData.allergiesDetail);
  // Phase 26.2g-fillin (V12 multi-reader-sweep close): derive congenital + treatment-history
  if (!isEdit) {
    const derivedCongenital = derivePatientCongenitalDisease(patientData);
    if (derivedCongenital) setCongenitalDisease(derivedCongenital);
    const derivedHistory = derivePatientTreatmentHistory(patientData);
    if (derivedHistory) setTreatmentHistory(derivedHistory);
  }
}
```

**After**:
```js
if (patientData) {
  if (patientData.bloodType && !isEdit) setBloodType(patientData.bloodType);
  if (!isEdit) {
    // Phase 26.2g-fillin-bis (2026-05-13) — read CANONICAL patientData fields directly.
    // Phase 26.2g-fillin derivePatient* approach was a no-op: kiosk-shape fields
    // (ud_*/hasUnderlying/allergiesDetail) don't exist on be_customers.patientData —
    // kioskPatientToCanonical pre-derives them into canonical strings BEFORE customer
    // doc creation. resolvePatient* read those canonical strings directly.
    const congenital = resolvePatientCongenitalDisease(patientData);
    if (congenital) setCongenitalDisease(congenital);
    const allergy = resolvePatientDrugAllergy(patientData);
    if (allergy) setDrugAllergy(allergy);
    const history = resolvePatientTreatmentHistory(patientData);
    if (history) setTreatmentHistory(history);
  }
}
```

Net: removed 4 source lines (allergiesDetail line + 3 derive lines), added 8 (3 resolver calls + comment).

Import block: remove the 2 `derivePatient*` named imports; add 3 `resolvePatient*` named imports.

## 8. Anti-patterns (forbidden)

- ❌ Read `patientData.ud_*` / `patientData.hasUnderlying` / `patientData.allergiesDetail` / `patientData.currentMedication` / `patientData.pregnancy` from `be_customers.patientData` — those don't exist on that doc shape
- ❌ Read `patientData.foodAllergy` directly in TFP — must go through `resolvePatientDrugAllergy`
- ❌ Inline `patientData.beforeTreatment` access in TFP — must go through `resolvePatientTreatmentHistory`
- ❌ Modify `derivePatient*` helpers to read canonical fields (would break utils.js OPD print which legitimately consumes kiosk-shape)
- ❌ Add a `lang` param to existing `derive*` (Approach C rejected — concern separation)
- ❌ Schema-change `buildPatientDataFromForm` to preserve `currentMedication` (out of scope; defer)
- ❌ Mutate `patientData` argument

## 9. Test bank (~110 assertions)

### `tests/phase-26-2g-fillin-bis-resolver-helpers.test.js` (~25 assertions)

R1 — `resolvePatientCongenitalDisease` (6 cases):
- R1.1: empty / null / non-object → `''`
- R1.2: empty string / whitespace string → `''`
- R1.3: trimmed value returned
- R1.4: non-string field type silently ignored (typeof guard lock)
- R1.5: kiosk-derived value preserved verbatim (`'เบาหวาน, ความดัน'`)
- R1.6: admin-typed value preserved verbatim (`'ง่วง'`)

R2 — `resolvePatientDrugAllergy` (10 cases):
- R2.1: empty / null / non-object → `''`
- R2.2: drug only → raw value (no prefix; textarea label provides context)
- R2.3: food only → `'แพ้อาหาร: <food>'` (prefixed for disambiguation)
- R2.4: both → `'แพ้ยา: <drug> / แพ้อาหาร: <food>'` (locked literal)
- R2.5: drug with whitespace + food empty → trimmed raw drug
- R2.6: drug empty + food whitespace → `''`
- R2.7: both with whitespace → trimmed prefixed
- R2.8: non-string drugAllergy → ignored (typeof guard)
- R2.9: non-string foodAllergy → ignored (typeof guard)
- R2.10: drug value with internal spaces preserved

R3 — `resolvePatientTreatmentHistory` (9 cases):
- R3.1: empty / null / non-object → `''`
- R3.2: beforeTreatment only → `'การรักษาก่อนหน้า: <value>'`
- R3.3: pregnanted=true only → `'การตั้งครรภ์: กำลังตั้งครรภ์'`
- R3.4: both → `'การรักษาก่อนหน้า: <bt> / การตั้งครรภ์: กำลังตั้งครรภ์'`
- R3.5: pregnanted=false → no entry
- R3.6: pregnanted=null/undefined/'true'string → no entry (strict boolean check)
- R3.7: beforeTreatment whitespace → ignored
- R3.8: non-string beforeTreatment → ignored
- R3.9: insertion order locked: beforeTreatment first, pregnancy second

### `tests/phase-26-2g-fillin-bis-source-grep.test.js` (~6 assertions)

G4.1: TFP imports the 3 `resolvePatient*` from patientHealthMapping
G4.2: 3 resolver calls inside the create-mode auto-fill block (`!isEdit` gate)
G4.3: anti-regression: NO `patientData.allergiesDetail` read remains in TFP (was a no-op)
G4.4: anti-regression: NO `derivePatientCongenitalDisease(patientData)` call in TFP (replaced)
G4.5: anti-regression: NO `derivePatientTreatmentHistory(patientData)` call in TFP (replaced)
G4.6: 3 setter call sites preserved (`setCongenitalDisease`, `setDrugAllergy`, `setTreatmentHistory`)

### `tests/phase-26-2g-fillin-bis-flow-simulate.test.js` (~40 assertions)

Rule I full-flow simulate covering data path through the real helpers:

FB1 — Kiosk path simulate (chronic):
- Input: synthetic `opd_session.patientData = { hasUnderlying:'มี', ud_diabetes:true, ud_hypertension:true }`
- Call `kioskPatientToCanonical(...)` → canonical form
- Assert `form.congenital_disease === 'ความดันโลหิตสูง, เบาหวาน'`
- Call `buildPatientDataFromForm(form)` → patientData
- Assert `patientData.congenitalDisease === 'ความดันโลหิตสูง, เบาหวาน'`
- Call `resolvePatientCongenitalDisease(patientData)` → returns same string
- Simulate TFP setter chain → `setCongenitalDisease('ความดันโลหิตสูง, เบาหวาน')` fires

FB2 — Kiosk path simulate (allergy):
- Input: `{ hasAllergies:'มี', allergiesDetail:'shrimp' }`
- Chain to canonical → `history_of_drug_allergy:'shrimp'`
- Chain to patientData → `drugAllergy:'shrimp', foodAllergy:undefined`
- Resolver → `'shrimp'` (raw, drug-only)

FB3 — Admin path simulate:
- Input: form `{ congenital_disease:'ง่วง', history_of_drug_allergy:'พารา', history_of_food_allergy:'ขนมถ้วย' }`
- buildPatientDataFromForm → patientData fields
- Resolvers return: congenital='ง่วง'; allergy='แพ้ยา: พารา / แพ้อาหาร: ขนมถ้วย'; history=''

FB4 — Admin pregnanted boolean:
- Input: `{ pregnanted:true, before_treatment:'X-ray' }`
- patientData has pregnanted:true + beforeTreatment:'X-ray'
- Resolver: `'การรักษาก่อนหน้า: X-ray / การตั้งครรภ์: กำลังตั้งครรภ์'`

FB5 — Empty / no data:
- Empty patientData → all 3 resolvers return ''
- Setters never fire

FB6 — Allergy matrix (6 scenarios):
- drug-only / food-only / both / neither / kiosk-allergies / admin-overlay
- Each verifies expected resolver output

### `tests/phase-26-2g-fillin-bis-tfp-autofill-rtl.test.jsx` (~15 assertions)

RTL test mounting TFP with synthetic patientData. 4 scenarios:
- Kiosk-derived chronic + allergy → textareas populated with derived strings
- Admin-only fields → textareas populated with admin strings
- Mixed kiosk+admin (admin wins via canonical pre-derivation) → admin values shown
- Empty patientData → placeholder text only (no auto-fill)

### `scripts/e2e-phase-26-2g-fillin-bis.mjs` (Rule M canonical pattern, ~25 assertions)

Live admin-SDK end-to-end script:
1. `vercel env pull .env.local.prod` (refresh creds)
2. Init firebase-admin with PEM-key conversion
3. Canonical path `artifacts/{APP_ID}/public/data`
4. 6 scenarios (TEST-prefixed customer IDs per V33.10):
   - SC1: kiosk hasUnderlying='มี' + ud_diabetes + ud_hypertension (TEST-PHASE-26-2G-BIS-K1)
   - SC2: kiosk hasAllergies='มี' + allergiesDetail='shrimp' (TEST-...-K2)
   - SC3: kiosk hasUnderlying='มี' + ud_other + ud_otherDetail='Migraine' (TEST-...-K3)
   - SC4: admin congenitalDisease='ง่วง' + drugAllergy='พารา' + foodAllergy='ขนมถ้วย' (TEST-...-A1)
   - SC5: admin beforeTreatment='X-ray' + pregnanted=true (TEST-...-A2)
   - SC6: empty patientData (TEST-...-E1)
5. For each scenario:
   - (For K scenarios) Synthesize opd_session.patientData → run `kioskPatientToCanonical` → write be_customers via `addCustomer`
   - (For A scenarios) Write be_customers directly via `addCustomer({form})`
   - Read back be_customers/{TEST-PREFIX-...} → assert canonical fields landed correctly
   - Call resolvers → assert output strings match expected
   - Simulate TFP setter chain → assert setter call log matches expectation
6. Cleanup all TEST-prefixed fixtures (V33.10 discipline)
7. Audit doc emit to `be_admin_audit/phase-26-2g-fillin-bis-e2e-{ts}-{rand}` with scenarios + outcomes

**Why all 5 layers**: helper unit (logic) + source-grep (regression lock) + flow-simulate (cross-file integration) + RTL (UI render verification) + live admin-SDK (real Firestore round-trip). Catches different failure modes.

## 10. AV40 extension

Update `audit-anti-vibe-code/SKILL.md` AV40 invariant to forbid direct reads of:
- `patientData.drugAllergy` (read via `resolvePatientDrugAllergy`)
- `patientData.foodAllergy` (read via `resolvePatientDrugAllergy`)
- `patientData.beforeTreatment` (read via `resolvePatientTreatmentHistory`)
- `patientData.pregnanted` (read via `resolvePatientTreatmentHistory`)
- `patientData.congenitalDisease` (read via `resolvePatientCongenitalDisease`)

In `src/components/**` + `src/pages/**`. Sanctioned exceptions unchanged (PatientForm.jsx writer + AdminDashboard.jsx display chips + the now-existing `src/utils.js` consumer of derive helpers — already documented in Phase 26.2g-fillin-followup).

G2.1 grep walk needs PATTERN extension to catch these new direct-read patterns.

Add a NEW G5.1 test: walks src/components + src/pages for these specific canonical-field direct reads. Sanctioned exceptions: TFP (uses resolvers) + same as AV40.

## 11. V-entry transparency

Document Phase 26.2g-fillin no-op explicitly:
- Code shipped to master at `9135313` had `derivePatientCongenitalDisease` / `derivePatientTreatmentHistory` helpers reading `patientData.hasUnderlying` / `ud_*` / `allergiesDetail` / `currentMedication` / `pregnancy` — fields that DO NOT exist on `be_customers.patientData`
- Bug surfaced 2026-05-13 when user manually tested admin-edit → TFP create flow
- This is V21-class: architectural assumption (kiosk-shape persists to be_customers) was false; helpers always returned ''
- Phase 26.2g-fillin-followup (utils.js refactor) WAS legitimate — utils.js consumes opd_session.patientData where kiosk-shape exists
- Phase 26.2g-fillin-bis (this fix) corrects TFP with direct canonical reads

This V-entry MUST acknowledge the no-op as institutional memory. Future reviewers grepping the V-log will find "Phase 26.2g-fillin was a no-op — the helpers existed but read wrong fields" and avoid repeating the architectural mistake.

## 12. File structure (locked)

| Type | Path | Responsibility |
|---|---|---|
| MODIFIED | `src/lib/patientHealthMapping.js` | +3 resolver helpers + 3 label-prefix constants (~70 LOC) |
| MODIFIED | `src/components/TreatmentFormPage.jsx` | Swap derive→resolve imports; refactor auto-fill block (~10 LOC net) |
| NEW | `tests/phase-26-2g-fillin-bis-resolver-helpers.test.js` | R1-R3 (~25 assertions) |
| NEW | `tests/phase-26-2g-fillin-bis-source-grep.test.js` | G4 (~6 assertions) |
| NEW | `tests/phase-26-2g-fillin-bis-flow-simulate.test.js` | FB1-FB6 (~40 assertions) |
| NEW | `tests/phase-26-2g-fillin-bis-tfp-autofill-rtl.test.jsx` | RTL (~15 assertions) |
| NEW | `scripts/e2e-phase-26-2g-fillin-bis.mjs` | Live admin-SDK e2e (~25 assertions across 6 scenarios) |
| MODIFIED | `.agents/skills/audit-anti-vibe-code/SKILL.md` | AV40 extension + G5 test added |
| MODIFIED | `tests/phase-26-2g-fillin-source-grep.test.js` | G2.1 PATTERN extended for new canonical fields |
| MODIFIED | `.claude/rules/00-session-start.md` § 2 | Phase 26.2g-fillin-bis V-entry with no-op acknowledgment |
| MODIFIED | `SESSION_HANDOFF.md` + `.agents/active.md` | State update at session-end |
| NEW | `.agents/sessions/2026-05-13-phase-26-2g-fillin-bis.md` | Checkpoint |

Net new code: ~70 LOC helper + ~10 LOC TFP edits + ~400 LOC tests + ~150 LOC live e2e script.

## 13. Verify locally first

Per Rule N (refactor + admin-SDK ops on real data):
1. `npx vitest run tests/phase-26-2g-fillin-bis-*.test.js{,x}` → ~85 assertions GREEN
2. `npx vitest run tests/phase-26-2g-fillin-*.test.js` → 27 prior + 16 followup + ~85 bis ≈ ~128 GREEN
3. `npm run build` → clean (TFP imports change; catches resolution errors)
4. `node scripts/e2e-phase-26-2g-fillin-bis.mjs --apply` → 6 scenarios PASS on real prod with TEST-prefixed fixtures + cleanup
5. `npm test -- --run` → full suite GREEN (TFP is widely-touched; full suite catches regressions in mock-shadow / source-grep-window tests)

## 14. Deploy authorization (V18)

NO deploy this turn. Joins the 80-commits-ahead queue. User authorizes `vercel --prod` + `firebase deploy --only firestore:rules` separately per V15 + Rule B Probe-Deploy-Probe.

## 15. Out of scope (explicit YAGNI)

- Currents medication recovery from `note` clinicalSummary string (would need parser; brittle)
- Schema change to add `currentMedication` to `buildPatientDataFromForm` (separate phase)
- kioskPatientToCanonical Rule-of-3 refactor (replace inline derive at lines 47-55 with `derivePatientCongenitalDisease` helper call) — follow-up; not blocking
- Full Playwright admin-UI e2e (admin-login automation infrastructure not present; 5-layer test bank above covers data-path correctness)
- AdminDashboard display chips refactor — still sanctioned per AV40
- PatientForm.jsx writer changes — unchanged
