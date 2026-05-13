# Brutal pre-deploy test bank — design spec
**Date**: 2026-05-14
**Goal**: catch every bug in today's shipped code before deploying 95 commits
**User directive (verbatim)**: "เขียนเทสทุกประเภทที่มี ที่ครอบคลุมทั้ง Logic, flow, calculate และ stimulate user work flow user ใช้งานจริงในโปรแกรมของเราให้ครบ ครอบคลุม และจับผิดตัวเองให้ได้ ... โหดที่สุด ... อนุญาตทุกอย่างที่นายอยากจะทำ"

## Scope of "today's work" + adjacent surface in deploy queue

| # | Commit | Surface | Risk |
|---|---|---|---|
| 1 | `2e95696` Phase 26.2g-fillin-bis-followup | `src/lib/kioskPatientToCanonical.js` (10-line inline ud_* push → 1-line helper call) | **BEHAVIORAL DRIFT discovered**: helper trims + typeof-guards `ud_otherDetail`; inline did not. Byte-identical claim only verified for PatientForm-sanitized inputs. |
| 2 | `e71dbf9` Phase 17.1 flake fix | `tests/phase-17-1-cross-branch-import-rtl.test.jsx` (global.fetch capture/restore + clearAllMocks + WAIT_FOR_OPTS) | WAIT_FOR_OPTS=3000ms could mask slow regressions; afterAll only runs once per file. |
| 3 | `d1daf3a` defensive sweep | `tests/branch-backup-ui-rtl.test.jsx` + `tests/phase15.5b-withdrawal-approval-endpoint.test.js` (same pattern) | `extended/adminUsersClient.test.js` still uses `afterEach delete` not afterAll restore — incomplete coverage of the AVxx invariant we want to lock. |

**Bis saga underlying today's followup (in queue)**:
- `src/lib/patientHealthMapping.js` — 3 `derive*` + 3 `resolve*` helpers + 5 prefix constants + 2 frozen UD_LABELS maps
- `src/components/TreatmentFormPage.jsx` lines 1022-1039 — create-mode auto-fill consumes `resolve*` helpers
- `src/utils.js` lines 354-357 + 416-419 — OPD print builders consume `derive*` helpers

## Behavioral-drift inventory (where helper ≠ inline)

Discovered while reading the 2e95696 diff. **EVERY ROW IS A POTENTIAL PROD BUG ON LEGACY DATA** because the kiosk PatientForm sanitizes input but migration scripts / ProClinic-imported records / direct Firestore Console edits don't.

| Input | OLD inline behavior | NEW helper behavior |
|---|---|---|
| `ud_otherDetail = '  พิษทะเล  '` | pushes `'  พิษทะเล  '` | pushes `'พิษทะเล'` (trim) |
| `ud_otherDetail = '   '` (whitespace) | pushes `'   '` | skipped (trim → empty) |
| `ud_otherDetail = 123` (number) | `pmh.push(123)`; join coerces → `'123'` | `''` (typeof guard) |
| `ud_otherDetail = null` + `ud_other = true` | `null` is falsy → skipped (same result) | `''` (typeof guard) (same result) |
| `d = null` | THROWS `Cannot read properties of null` | returns `''` |
| `d = []` | `[].hasUnderlying` is `undefined` → guards via undefined !== 'มี' | `_isPlainObject` rejects array → `''` |
| `d = Object.create(null)` (no prototype) | works | works |
| `ud_hypertension` on prototype chain | reads it → pushes | reads it → pushes (same) |

## Tier 1 — Foundation re-verify (5 min)

**Goal**: confirm the 8556 + 1 skipped baseline still holds, plus check coverage on touched modules.

- **T1.1**: re-run all phase-26-2g-fillin-* + phase-17-1 + branch-backup-ui + phase15.5b tests → expect GREEN
- **T1.2**: `npm run build` → expect clean
- **T1.3**: `npm test -- --coverage --run tests/phase-26-2g-fillin-bis-*.test.{js,jsx}` over `src/lib/patientHealthMapping.js` + `src/lib/kioskPatientToCanonical.js` + `src/utils.js` → expect ≥85% lines + ≥75% branches on patientHealthMapping; identify uncovered branches.

## Tier 2 — Property-based testing (NEW — fast-check integrated)

**File**: `tests/v55-1-property-based-patient-health-mapping.test.js` (NEW)

Using `@fast-check/vitest` v0.4.1. Each property runs 100 random fixtures by default; bump to 200 for critical helpers.

### T2.1 — `derivePatientCongenitalDisease` invariants
- **P1**: For any boolean subset of `{ud_hypertension, ud_diabetes, ud_lung, ud_kidney, ud_heart, ud_blood}` AND `hasUnderlying = 'มี'`: output contains EXACTLY the Thai labels of the truthy flags in UI order, comma-separated. (Tests label-order + label-stability across 2^6 = 64 subsets.)
- **P2**: For any kiosk-shape patientData with `hasUnderlying ∉ {'มี'}`: output === `''`. (Tests the gate.)
- **P3**: Idempotency: calling the helper twice with same input → same output.
- **P4**: For random ud_otherDetail string + ud_other=true: output contains TRIMMED detail iff detail.trim().length > 0.
- **P5**: For random NON-STRING ud_otherDetail + ud_other=true: output does NOT contain the value.
- **P6**: No undefined/null in output (V14 lock).

### T2.2 — `derivePatientCongenitalDiseaseEnglish` invariants
- Mirror P1-P6 with `UD_LABELS_EN`.
- **P7 cross-language**: For any flag subset, Thai output has same count of comma-separated parts as English output. (Both consume same UD_LABELS keys.)

### T2.3 — `derivePatientTreatmentHistory` invariants
- **P8**: When pregnancy = SENTINEL `'ไม่เกี่ยวข้อง/ไม่ได้ตั้งครรภ์'` → pregnancy NOT in output.
- **P9**: When pregnancy is non-sentinel + non-empty string → pregnancy IS in output with prefix.
- **P10**: When both pregnancy + currentMedication empty → output === `''`.
- **P11**: Order is FIXED: pregnancy first, medication second (when both present).
- **P12**: Trimming applied to both fields.

### T2.4 — `kioskPatientToCanonical` invariants
- **P13**: For any kiosk-shape input, output has all 22 canonical snake_case keys (or empty `{}` if input falsy).
- **P14**: `congenital_disease` output === `derivePatientCongenitalDisease(input)`. (Locks the Rule-of-3 close.)
- **P15**: `gender` is `'M'|'F'|'LGBTQ'|''` (no other values).
- **P16**: When `nationality === 'ต่างชาติ'`: output has `passport_id` not `citizen_id`; else vice versa.
- **P17**: `birthdate` is `''` OR `YYYY-MM-DD` format.
- **P18**: BE year > 2400 → CE year is BE - 543; CE year ≤ 2400 → preserved as-is.

### T2.5 — Resolver helper invariants (Phase 26.2g-fillin-bis)
- **P19**: `resolvePatientCongenitalDisease` returns trim()ed `patientData.congenitalDisease` OR `''` if non-string.
- **P20**: `resolvePatientDrugAllergy` asymmetric prefix rule (4 cases verified property-based).
- **P21**: `resolvePatientTreatmentHistory` STRICT `pregnanted === true` (rejects truthy non-true).
- **P22**: Insertion order FIXED: beforeTreatment first, pregnancy second.

### T2.6 — PRE-Rule-of-3 vs POST-Rule-of-3 behavioral diff (CRITICAL)
- Re-implement OLD inline derivation as `_legacyInlineCongenitalDisease(d)` in test file.
- Property test: For PatientForm-sanitized inputs (no leading/trailing whitespace, strings only) → outputs MUST match.
- Property test: For dirty inputs (whitespace-padded, non-string types, null) → DOCUMENT the divergence with explicit assertions. (Not failures — documented behavior change.)

## Tier 3 — Mutation testing via Stryker (NEW)

**Config**: `stryker.conf.json`, scoped to `src/lib/{patientHealthMapping,kioskPatientToCanonical}.js` only (~15 min runtime, vs hours for full suite).

**Threshold**: `high: 85, low: 70, break: 60`

**Mutators enabled**: ArithmeticOperator, BooleanLiteral, ConditionalExpression, EqualityOperator, LogicalOperator, StringLiteral, BlockStatement, ArrayDeclaration, MethodExpression.

**Expected output**: % killed / survived / timed-out per mutant category.

**Action**: every surviving mutant on a critical path → add a focused test to kill it. Document survivors in `tests/v55-1-stryker-mutation-report.md`.

## Tier 4 — Adversarial fuzz

**File**: `tests/v55-1-adversarial-fuzz-patient-health.test.js` (NEW)

Codify `tests/helpers/adversarialFixtures.js` (NEW shared module):

```js
export const ADVERSARIAL_STRINGS = [
  '',                                  // empty
  '\0',                                // NUL byte
  'a'.repeat(10_000),                  // 10K char
  'café'.normalize('NFC'),             // Latin NFC
  'café'.normalize('NFD'),             // NFD (decomposed)
  'มะม่วง',                            // Thai cluster
  'ค' + '่' + 'ำ',          // Thai with combining marks
  'ＡＢＣ',                             // fullwidth Latin
  '𝐀𝐁𝐂',                              // astral plane
  '​‌‍',                // zero-width joiners
  '﻿',                            // BOM
  'leading ',                     // trailing space
  ' trailing',                    // leading space
  '  middle  spaces',
  '"; DROP TABLE--',                   // SQL-injection shape
  '<script>alert(1)</script>',         // XSS shape
  '../../etc/passwd',                  // path traversal shape
];
export const ADVERSARIAL_NON_STRINGS = [
  null, undefined, 0, 1, false, true,
  NaN, Infinity, -Infinity,
  [], [1, 2], {}, { x: 1 },
  Symbol('a'),
  () => {},
  new Date(),
];
```

**Test groups**:
- **A1**: Every helper × every adversarial string → no throw, no `undefined`/`null` in output, defined fallback.
- **A2**: Every helper × every adversarial non-string → returns `''`, no throw.
- **A3**: NFC vs NFD output equivalence — `'café'.normalize('NFC') === ...NFD'` should produce same length-1 visible char count.
- **A4**: Prototype pollution probe — set `Object.prototype.ud_hypertension = true` BEFORE helper call → does NOT contaminate output for empty patientData. (Should reject via own-property check OR document the leak.)
- **A5**: Cyclic reference — `d.self = d` → no infinite loop, no stack overflow.
- **A6**: Frozen objects — `Object.freeze(d)` → helper still works (read-only contract).

## Tier 5 — Snapshot tests for byte-identical contracts

**File**: `tests/v55-1-snapshot-byte-identical.test.js` (NEW)

- **S1**: OPD print Thai builder for 8 canonical patientData scenarios (no flags / 1 flag / all 6 flags / ud_other only / ud_other + 2 flags / hasUnderlying=ไม่มี / empty / with allergies). Use `toMatchInlineSnapshot()`.
- **S2**: OPD print English builder for same 8 scenarios.
- **S3**: `kioskPatientToCanonical` for 6 canonical kiosk inputs (Thai female complete / foreigner / minimal / BE birthdate / CE birthdate / partial address). Snapshot the canonical output object.
- **S4**: Cross-validate: same patientData fed to Thai + English builders → same paragraph COUNT, same SECTION HEADERS in respective languages.

## Tier 6 — NEW audit invariant AV41: global.fetch hygiene

**File**: `tests/v55-1-global-fetch-isolation-audit.test.js` (NEW)

**Invariant**: Every test file that contains `global.fetch =` MUST have **either** `afterAll(() => { ... restore... })` OR `afterEach(() => { delete global.fetch ... })`. Preferred = `afterAll` + ORIGINAL_FETCH capture. Mandatory after Phase 17.1 flake fix (V-entry).

**Test**: glob `tests/**/*.test.{js,jsx}`, regex-scan for `global\.fetch\s*=`, classify each file:
- ✅ Has ORIGINAL_FETCH capture + afterAll restore — preferred pattern
- ⚠️ Has only afterEach delete — acceptable but incomplete (warn)
- ❌ Has neither — fail test, list violator

**Fix**: `extended/adminUsersClient.test.js` — migrate to canonical pattern (capture + afterAll). Document why in V-entry.

**AV41 entry** in `audit-anti-vibe-code` SKILL.md:

```
AV41 — global.fetch test isolation discipline (Phase 17.1, 2026-05-14)
       Every test file assigning `global.fetch = vi.fn()` MUST capture
       `const ORIGINAL_FETCH = global.fetch` at module-load + restore
       via `afterAll`. Cross-file pollution under vitest worker
       parallelism causes intermittent flakes. Canonical pattern:
       see tests/phase-17-1-cross-branch-import-rtl.test.jsx.
       Sanctioned exception: NONE — every assignment must restore.
```

## Tier 7 — Stress / cross-file pollution simulation

**File**: `tests/v55-1-stress-fetch-pollution.test.js` (NEW)

- **ST1**: Sequential 50-iteration RTL render of `CrossBranchImportModal` — assert all 50 succeed without flake.
- **ST2**: Pollute global.fetch in beforeEach with a known signature (`() => ({ poisoned: true })`); render the modal; assert isolation via per-test local mock.
- **ST3**: Verify `afterAll` actually fires by reading `global.fetch === ORIGINAL_FETCH` post-suite.
- **ST4**: Run all 4 fetch-mocking test files via `npm test -- --pool=threads --no-isolate -- tests/{phase-17-1-cross-branch-import-rtl,branch-backup-ui-rtl,phase15.5b-withdrawal-approval-endpoint,extended/adminUsersClient}.test.{js,jsx}` and confirm GREEN. (Forces collision; passes = real isolation.)

## Tier 8 — Live admin-SDK e2e re-verification

**Action**: re-run `node scripts/e2e-phase-26-2g-fillin-bis.mjs` (dry-run; no --apply).

**Expected**: 6/6 scenarios PASS against current prod patientData distribution. If a single scenario fails → real customer data drifted since 2026-05-13 e2e → BLOCK DEPLOY until diagnosed.

## Tier 9 — Coverage report

**Action**: `npm test -- --coverage --run tests/phase-26-2g-fillin*.test.{js,jsx}` over `src/lib/patientHealthMapping.js` + `src/lib/kioskPatientToCanonical.js` + `src/utils.js` (lines 340-430 only).

**Thresholds**: 85% lines, 80% functions, 75% branches.

**Action on miss**: write focused tests for the missed branches.

## Tier 10 — Compile + deploy decision

Generate `BRUTAL_PRE_DEPLOY_REPORT.md` containing:
- All tiers' status (✅/⚠️/❌)
- Bugs found (count + severity + fix-applied status)
- Stryker mutation score
- Coverage report
- Behavioral-drift documented + decision (acceptable / block)
- Final deploy readiness verdict

If any ❌ remains → BLOCK DEPLOY. If only ⚠️ → user decides.

## Methodology integration into project canon

This session adds 3 new dev dependencies + 1 new audit invariant + 1 new test helper module:
- `fast-check` + `@fast-check/vitest` — property-based testing
- `@stryker-mutator/core` + `@stryker-mutator/vitest-runner` — mutation testing
- `tests/helpers/adversarialFixtures.js` — shared adversarial fixture library
- AV41 audit invariant — global.fetch isolation hygiene

Future Phase work that touches helpers or mutates state should follow this template:
1. Helper-unit tests (existing)
2. Source-grep regression (existing)
3. Rule I flow-simulate (existing)
4. **NEW**: property-based with fast-check
5. **NEW**: Stryker mutation score ≥ 85%
6. **NEW**: adversarial fuzz with shared fixture set
7. **NEW**: snapshot for byte-identical contracts (where applicable)
8. RTL component tests (existing)
9. Live admin-SDK e2e (Rule M)
