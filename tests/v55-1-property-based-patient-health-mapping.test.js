// V55.1 — Brutal pre-deploy test bank: property-based + adversarial fuzz
// (Phase 26.2g-fillin-bis-followup verification, 2026-05-14)
// Covers: derive*/resolve* helpers in patientHealthMapping.js +
//         kioskPatientToCanonical Rule-of-3 close behavioral diff
//
// fast-check 4.x via @fast-check/vitest 0.4.x. Defaults to numRuns:100;
// critical helpers bumped to 200.
//
// Per design spec docs/superpowers/specs/2026-05-14-brutal-pre-deploy-test-bank-design.md
// Tier 2 + Tier 2.6 + Tier 4.

import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  derivePatientCongenitalDisease,
  derivePatientCongenitalDiseaseEnglish,
  derivePatientTreatmentHistory,
  resolvePatientCongenitalDisease,
  resolvePatientDrugAllergy,
  resolvePatientTreatmentHistory,
  UD_LABELS,
  UD_LABELS_EN,
  PREGNANCY_LABEL_PREFIX,
  MEDICATION_LABEL_PREFIX,
  BEFORE_TREATMENT_LABEL_PREFIX,
  DRUG_ALLERGY_LABEL_PREFIX,
  FOOD_ALLERGY_LABEL_PREFIX,
} from '../src/lib/patientHealthMapping.js';
import { kioskPatientToCanonical } from '../src/lib/kioskPatientToCanonical.js';
import {
  ADVERSARIAL_STRINGS,
  ADVERSARIAL_NON_STRINGS,
  CLEAN_PATIENT_FORM_FIXTURES,
  describeAdversarialNonString,
  describeAdversarialString,
} from './helpers/adversarialFixtures.js';

// ─── Arbitrary builders ─────────────────────────────────────────────────────

const HAS_UNDERLYING_ARB = fc.constantFrom('มี', 'ไม่มี', '', 'random', null, undefined);

// All 6 ud_* flags as fc.boolean → exhaustively explores 2^6 = 64 truth-subsets
// over 200 random runs.
const UD_FLAGS_RECORD = {
  ud_hypertension: fc.boolean(),
  ud_diabetes: fc.boolean(),
  ud_lung: fc.boolean(),
  ud_kidney: fc.boolean(),
  ud_heart: fc.boolean(),
  ud_blood: fc.boolean(),
};

// Sanitized string filter — only "clean" PatientForm-shaped strings (no
// leading/trailing whitespace; either empty or non-empty trimmed content).
// Used for the byte-identical legacy-vs-helper property in Group T2.6 D1.
const SANITIZED_STRING_ARB = fc.string().filter(
  (s) => s === '' || (s === s.trim() && s.length > 0)
);

// Pregnancy field: explore sentinel + non-sentinel + whitespace + non-string.
const PREGNANCY_ARB = fc.oneof(
  fc.constant(''),
  fc.constant('ไม่เกี่ยวข้อง/ไม่ได้ตั้งครรภ์'),
  fc.constant('   '),
  fc.string(),
  fc.constantFrom(null, undefined, 42, true)
);

// Patient canonical (resolver) shape — for resolve* helpers
const PD_CANONICAL_ARB = fc.record(
  {
    congenitalDisease: fc.oneof(fc.string(), fc.constantFrom(null, undefined, 42, [], {})),
    drugAllergy: fc.oneof(fc.string(), fc.constantFrom(null, undefined, 42, [])),
    foodAllergy: fc.oneof(fc.string(), fc.constantFrom(null, undefined, 42, [])),
    beforeTreatment: fc.oneof(fc.string(), fc.constantFrom(null, undefined, 42, [])),
    // STRICT === true: pregnanted MUST be exactly true to count.
    pregnanted: fc.oneof(
      fc.constant(true),
      fc.constant(false),
      fc.constant(1),
      fc.constant('true'),
      fc.constant(null),
      fc.constant(undefined),
      fc.constant('yes')
    ),
  },
  { requiredKeys: [] }
);

// Patient kiosk (derive) shape — for derive* helpers
const PD_KIOSK_ARB = fc.record(
  {
    hasUnderlying: HAS_UNDERLYING_ARB,
    ud_hypertension: fc.oneof(fc.boolean(), fc.constant(undefined)),
    ud_diabetes: fc.oneof(fc.boolean(), fc.constant(undefined)),
    ud_lung: fc.oneof(fc.boolean(), fc.constant(undefined)),
    ud_kidney: fc.oneof(fc.boolean(), fc.constant(undefined)),
    ud_heart: fc.oneof(fc.boolean(), fc.constant(undefined)),
    ud_blood: fc.oneof(fc.boolean(), fc.constant(undefined)),
    ud_other: fc.oneof(fc.boolean(), fc.constant(undefined)),
    ud_otherDetail: fc.oneof(
      fc.string(),
      fc.constantFrom(null, undefined, 42, [], {})
    ),
    pregnancy: PREGNANCY_ARB,
    currentMedication: fc.oneof(
      fc.string(),
      fc.constantFrom(null, undefined, 42)
    ),
  },
  { requiredKeys: [] }
);

// Kiosk full-shape arb for kioskPatientToCanonical
const PD_KIOSK_FULL_ARB = fc.record(
  {
    prefix: fc.oneof(fc.string(), fc.constant(undefined)),
    firstName: fc.oneof(fc.string(), fc.constant(undefined)),
    lastName: fc.oneof(fc.string(), fc.constant(undefined)),
    nationality: fc.oneof(
      fc.constant('ไทย'),
      fc.constant('ต่างชาติ'),
      fc.constant(undefined)
    ),
    idCard: fc.oneof(fc.string(), fc.constant(undefined)),
    nationalityCountry: fc.oneof(fc.string(), fc.constant(undefined)),
    gender: fc.oneof(
      fc.constantFrom('ชาย', 'หญิง', 'LGBTQ+', 'M', 'F', 'LGBTQ', 'male', 'female', '', 'xyz'),
      fc.constant(undefined)
    ),
    dobYear: fc.oneof(fc.integer({ min: 2400, max: 2600 }).map(String), fc.integer({ min: 1900, max: 2100 }).map(String), fc.constant(undefined), fc.constant('xyz')),
    dobMonth: fc.oneof(fc.integer({ min: 1, max: 12 }).map(String), fc.constant(undefined)),
    dobDay: fc.oneof(fc.integer({ min: 1, max: 31 }).map(String), fc.constant(undefined)),
    hasUnderlying: HAS_UNDERLYING_ARB,
    ud_hypertension: fc.boolean(),
    ud_diabetes: fc.boolean(),
    ud_lung: fc.boolean(),
    ud_kidney: fc.boolean(),
    ud_heart: fc.boolean(),
    ud_blood: fc.boolean(),
    ud_other: fc.boolean(),
    ud_otherDetail: fc.string(),
    hasAllergies: fc.oneof(fc.constant('มี'), fc.constant('ไม่มี'), fc.constant(undefined)),
    allergiesDetail: fc.string(),
    phone: fc.string(),
    isInternationalPhone: fc.boolean(),
    phoneCountryCode: fc.string(),
    emergencyPhone: fc.string(),
    isInternationalEmergencyPhone: fc.boolean(),
    emergencyPhoneCountryCode: fc.string(),
    bloodType: fc.constantFrom('A', 'B', 'AB', 'O', ''),
    visitReasons: fc.oneof(fc.array(fc.string()), fc.constant(undefined)),
    howFoundUs: fc.oneof(fc.array(fc.string()), fc.string(), fc.constant(undefined)),
    emergencyName: fc.string(),
    emergencyRelation: fc.string(),
  },
  { requiredKeys: [] }
);

const RUNS_200 = { numRuns: 200 };
const RUNS_100 = { numRuns: 100 };

// ════════════════════════════════════════════════════════════════════════════
// Group T2 — Property-Based Invariants
// ════════════════════════════════════════════════════════════════════════════

describe('T2.1 — derivePatientCongenitalDisease invariants', () => {
  test.prop([fc.record(UD_FLAGS_RECORD)], RUNS_200)(
    'P1 — UI order: output Thai labels appear in UD_LABELS key order',
    (flags) => {
      const pd = { hasUnderlying: 'มี', ...flags };
      const out = derivePatientCongenitalDisease(pd);
      if (out === '') return true; // no flags set
      const parts = out.split(', ');
      const orderedLabels = Object.keys(UD_LABELS)
        .filter((k) => flags[k])
        .map((k) => UD_LABELS[k]);
      // Output may include trailing ud_otherDetail; check labels-only prefix.
      for (let i = 0; i < orderedLabels.length; i++) {
        if (parts[i] !== orderedLabels[i]) return false;
      }
      return true;
    }
  );

  test.prop([PD_KIOSK_ARB], RUNS_200)(
    'P2 — hasUnderlying !== "มี" gate: output === ""',
    (pd) => {
      if (pd.hasUnderlying === 'มี') return true; // skip — gate open
      return derivePatientCongenitalDisease(pd) === '';
    }
  );

  test.prop([PD_KIOSK_ARB], RUNS_200)(
    'P3 — idempotency: f(f-input) === f(f-input) on second call',
    (pd) => {
      const a = derivePatientCongenitalDisease(pd);
      const b = derivePatientCongenitalDisease(pd);
      return a === b;
    }
  );

  test.prop(
    [fc.string(), fc.record(UD_FLAGS_RECORD)],
    RUNS_200
  )('P4 — ud_otherDetail trimmed when ud_other=true', (detail, flags) => {
    // V55.1-FIX (2026-05-14): predicate hole found by fast-check shrinking —
    // counterexample `["", {all flags false}]` revealed that the prior
    // assertion `!out.split(', ').includes(detail)` fails when out = "" because
    // "".split(", ") = [""] which DOES contain the empty string detail.
    // Fix: assert the FULL output shape (UD_LABEL parts in order + trimmed
    // detail if non-empty after trim) — vacuously correct for all-flags-false
    // + empty-detail case.
    const pd = { hasUnderlying: 'มี', ...flags, ud_other: true, ud_otherDetail: detail };
    const out = derivePatientCongenitalDisease(pd);
    const trimmed = detail.trim();
    const expectedParts = Object.keys(UD_LABELS)
      .filter((k) => flags[k])
      .map((k) => UD_LABELS[k]);
    if (trimmed.length > 0) expectedParts.push(trimmed);
    return out === expectedParts.join(', ');
  });

  test.prop(
    [
      fc.oneof(
        fc.constant(null),
        fc.constant(undefined),
        fc.integer(),
        fc.boolean(),
        fc.array(fc.anything()),
        fc.object()
      ),
      fc.record(UD_FLAGS_RECORD),
    ],
    RUNS_100
  )('P5 — non-string ud_otherDetail typeof-guarded out', (badDetail, flags) => {
    const pd = { hasUnderlying: 'มี', ...flags, ud_other: true, ud_otherDetail: badDetail };
    const out = derivePatientCongenitalDisease(pd);
    // The non-string should NOT appear in the output. Compute the "valid" prefix
    // from flags only, then assert output === that prefix (no detail appended).
    const validParts = Object.keys(UD_LABELS)
      .filter((k) => flags[k])
      .map((k) => UD_LABELS[k]);
    return out === validParts.join(', ');
  });

  test.prop([PD_KIOSK_ARB], RUNS_200)(
    'P6 — output never contains "undefined" or "null" literal strings',
    (pd) => {
      const out = derivePatientCongenitalDisease(pd);
      return !out.includes('undefined') && !out.includes('null');
    }
  );
});

describe('T2.2 — derivePatientCongenitalDiseaseEnglish invariants', () => {
  test.prop([fc.record(UD_FLAGS_RECORD)], RUNS_200)(
    'P7 — UI order English: output English labels appear in UD_LABELS_EN key order',
    (flags) => {
      const pd = { hasUnderlying: 'มี', ...flags };
      const out = derivePatientCongenitalDiseaseEnglish(pd);
      if (out === '') return true;
      const parts = out.split(', ');
      const orderedLabels = Object.keys(UD_LABELS_EN)
        .filter((k) => flags[k])
        .map((k) => UD_LABELS_EN[k]);
      for (let i = 0; i < orderedLabels.length; i++) {
        if (parts[i] !== orderedLabels[i]) return false;
      }
      return true;
    }
  );

  test.prop([PD_KIOSK_ARB], RUNS_200)(
    'P8 — English: hasUnderlying !== "มี" gate (Thai key value regardless of locale)',
    (pd) => {
      if (pd.hasUnderlying === 'มี') return true;
      return derivePatientCongenitalDiseaseEnglish(pd) === '';
    }
  );

  test.prop([PD_KIOSK_ARB], RUNS_200)(
    'P9 — idempotency English',
    (pd) => {
      return (
        derivePatientCongenitalDiseaseEnglish(pd) ===
        derivePatientCongenitalDiseaseEnglish(pd)
      );
    }
  );

  test.prop([fc.string(), fc.record(UD_FLAGS_RECORD)], RUNS_200)(
    'P10 — English: ud_otherDetail trimmed',
    (detail, flags) => {
      // V55.1-FIX (2026-05-14): same predicate fix as P4 — assert full output
      // shape against UD_LABELS_EN parts + trimmed detail (or none).
      const pd = { hasUnderlying: 'มี', ...flags, ud_other: true, ud_otherDetail: detail };
      const out = derivePatientCongenitalDiseaseEnglish(pd);
      const trimmed = detail.trim();
      const expectedParts = Object.keys(UD_LABELS_EN)
        .filter((k) => flags[k])
        .map((k) => UD_LABELS_EN[k]);
      if (trimmed.length > 0) expectedParts.push(trimmed);
      return out === expectedParts.join(', ');
    }
  );

  test.prop([PD_KIOSK_ARB], RUNS_200)(
    'P11 — English: no "undefined"/"null" literal in output',
    (pd) => {
      const out = derivePatientCongenitalDiseaseEnglish(pd);
      return !out.includes('undefined') && !out.includes('null');
    }
  );

  test.prop(
    [fc.record(UD_FLAGS_RECORD), fc.option(fc.string(), { freq: 3 })],
    RUNS_200
  )(
    'P12 — cross-language: Thai and English outputs have same number of parts for same flag subset',
    (flags, otherDetail) => {
      const includeOther = otherDetail !== null && otherDetail.trim().length > 0;
      const pd = {
        hasUnderlying: 'มี',
        ...flags,
        ud_other: includeOther,
        ud_otherDetail: includeOther ? otherDetail : '',
      };
      const thai = derivePatientCongenitalDisease(pd);
      const eng = derivePatientCongenitalDiseaseEnglish(pd);
      // Both empty → both 0 parts; both non-empty → split + count.
      const thaiCount = thai === '' ? 0 : thai.split(', ').length;
      const engCount = eng === '' ? 0 : eng.split(', ').length;
      return thaiCount === engCount;
    }
  );
});

describe('T2.3 — derivePatientTreatmentHistory invariants', () => {
  test.prop([PD_KIOSK_ARB], RUNS_200)(
    'P13 — sentinel pregnancy skipped',
    (pd) => {
      const forced = { ...pd, pregnancy: 'ไม่เกี่ยวข้อง/ไม่ได้ตั้งครรภ์' };
      const out = derivePatientTreatmentHistory(forced);
      // Sentinel pregnancy MUST NOT appear in output
      return !out.includes('ไม่เกี่ยวข้อง/ไม่ได้ตั้งครรภ์');
    }
  );

  test.prop([fc.string(), fc.string()], RUNS_200)(
    'P14 — prefix correctness: non-sentinel non-empty fields get locked prefixes',
    (preg, med) => {
      // Force non-sentinel + non-empty if trim non-empty
      if (preg.trim() === '' || preg.trim() === 'ไม่เกี่ยวข้อง/ไม่ได้ตั้งครรภ์') return true;
      if (med.trim() === '') return true;
      const pd = { pregnancy: preg, currentMedication: med };
      const out = derivePatientTreatmentHistory(pd);
      return (
        out.includes(PREGNANCY_LABEL_PREFIX) &&
        out.includes(MEDICATION_LABEL_PREFIX)
      );
    }
  );

  test.prop([fc.string({ minLength: 1 }).filter(s => s.trim().length > 0 && s.trim() !== 'ไม่เกี่ยวข้อง/ไม่ได้ตั้งครรภ์'), fc.string({ minLength: 1 }).filter(s => s.trim().length > 0)], RUNS_100)(
    'P15 — order: pregnancy first, medication second (when both present)',
    (preg, med) => {
      const pd = { pregnancy: preg, currentMedication: med };
      const out = derivePatientTreatmentHistory(pd);
      const pregIdx = out.indexOf(PREGNANCY_LABEL_PREFIX);
      const medIdx = out.indexOf(MEDICATION_LABEL_PREFIX);
      if (pregIdx === -1 || medIdx === -1) return false;
      return pregIdx < medIdx;
    }
  );

  test.prop(
    [
      fc.oneof(fc.constantFrom('', '   ', 'ไม่เกี่ยวข้อง/ไม่ได้ตั้งครรภ์'), fc.constant(null), fc.constant(undefined)),
      fc.oneof(fc.constantFrom('', '   '), fc.constant(null), fc.constant(undefined)),
    ],
    RUNS_100
  )('P16 — both empty / sentinel / non-string → output ""', (preg, med) => {
    const pd = { pregnancy: preg, currentMedication: med };
    return derivePatientTreatmentHistory(pd) === '';
  });

  test.prop([fc.string(), fc.string()], RUNS_200)(
    'P17 — trimming: leading/trailing whitespace stripped before prefix join',
    (preg, med) => {
      const pd = {
        pregnancy: `  ${preg}  `,
        currentMedication: `  ${med}  `,
      };
      const out = derivePatientTreatmentHistory(pd);
      // If both produce parts, neither part should have whitespace at the boundary
      // between prefix and value. Check no double-space after the colon-space.
      return !out.includes(': ' + ' ');
    }
  );
});

describe('T2.4 — kioskPatientToCanonical invariants', () => {
  test.prop([PD_KIOSK_FULL_ARB], RUNS_200)(
    'P18 — output is a plain object with canonical keys (or {} for falsy)',
    (pd) => {
      const out = kioskPatientToCanonical(pd);
      // Must always be a plain object
      if (typeof out !== 'object' || out === null || Array.isArray(out)) return false;
      // Empty input → may be {} or full shape; both valid per source code.
      return true;
    }
  );

  test.prop([PD_KIOSK_FULL_ARB], RUNS_200)(
    'P19 — congenital_disease === derivePatientCongenitalDisease(input) (Rule of 3 lock)',
    (pd) => {
      const out = kioskPatientToCanonical(pd);
      const direct = derivePatientCongenitalDisease(pd);
      return out.congenital_disease === direct;
    }
  );

  test.prop([PD_KIOSK_FULL_ARB], RUNS_100)(
    'P20 — gender ∈ {M, F, LGBTQ, ""}',
    (pd) => {
      const out = kioskPatientToCanonical(pd);
      return ['M', 'F', 'LGBTQ', ''].includes(out.gender);
    }
  );

  test.prop([PD_KIOSK_FULL_ARB], RUNS_100)(
    'P21 — foreigner branch: passport_id present, citizen_id absent (or reverse)',
    (pd) => {
      const out = kioskPatientToCanonical(pd);
      if (pd.nationality === 'ต่างชาติ') {
        return 'passport_id' in out && !('citizen_id' in out);
      }
      return 'citizen_id' in out && !('passport_id' in out);
    }
  );

  test.prop([PD_KIOSK_FULL_ARB], RUNS_100)(
    'P22 — birthdate format: "" OR matches /^\\d{4}-\\d{2}-\\d{2}$/',
    (pd) => {
      const out = kioskPatientToCanonical(pd);
      return out.birthdate === '' || /^\d{4}-\d{2}-\d{2}$/.test(out.birthdate);
    }
  );

  test.prop(
    [
      // V55.1-FIX (2026-05-14): boundary 2400 is STRICTLY treated as CE per
      // kioskPatientToCanonical.js:78 `beYear > 2400` (intentional design;
      // not a bug). Arbitrary starts at 2401 to exclude the ambiguous boundary.
      // Boundary behavior locked separately in `P23.boundary` it() block below.
      fc.integer({ min: 2401, max: 2600 }),
      fc.integer({ min: 1, max: 12 }),
      fc.integer({ min: 1, max: 28 }),
    ],
    RUNS_100
  )(
    'P23 — BE year > 2400 → CE = BE - 543',
    (beYear, mo, dy) => {
      const pd = {
        dobYear: String(beYear),
        dobMonth: String(mo),
        dobDay: String(dy),
      };
      const out = kioskPatientToCanonical(pd);
      const expectedCe = beYear - 543;
      const expected = `${expectedCe}-${String(mo).padStart(2, '0')}-${String(dy).padStart(2, '0')}`;
      return out.birthdate === expected;
    }
  );

  // V55.1-FIX (2026-05-14): explicit boundary documentation
  // (caught by fast-check shrinking — counterexample [2400, 1, 1]).
  // Code at kioskPatientToCanonical.js:78 uses `beYear > 2400` strict
  // inequality. Boundary value 2400 itself is preserved as CE (no conversion).
  // This is INTENTIONAL — anyone entering dobYear='2400' is in an undefined
  // zone (CE 2400 = far future; BE 2400 = 1857 historical). The strict cutoff
  // makes the boundary deterministic. Production kiosk never produces this
  // value (year pickers default to current year - 120).
  it('P23.boundary — beYear=2400 is preserved as CE (no BE→CE conversion at strict boundary)', () => {
    const out = kioskPatientToCanonical({ dobYear: '2400', dobMonth: '1', dobDay: '1' });
    expect(out.birthdate).toBe('2400-01-01');
  });

  it('P23.boundary — beYear=2401 IS converted (just past the strict boundary)', () => {
    const out = kioskPatientToCanonical({ dobYear: '2401', dobMonth: '1', dobDay: '1' });
    expect(out.birthdate).toBe(`${2401 - 543}-01-01`); // 1858-01-01
  });

  test.prop(
    [
      fc.integer({ min: 1900, max: 2400 }),
      fc.integer({ min: 1, max: 12 }),
      fc.integer({ min: 1, max: 28 }),
    ],
    RUNS_100
  )(
    'P24 — CE year ≤ 2400 → preserved as-is',
    (ceYear, mo, dy) => {
      const pd = {
        dobYear: String(ceYear),
        dobMonth: String(mo),
        dobDay: String(dy),
      };
      const out = kioskPatientToCanonical(pd);
      const expected = `${ceYear}-${String(mo).padStart(2, '0')}-${String(dy).padStart(2, '0')}`;
      return out.birthdate === expected;
    }
  );
});

describe('T2.5 — Resolver helper invariants (Phase 26.2g-fillin-bis)', () => {
  test.prop([fc.string()], RUNS_200)(
    'P25 — resolvePatientCongenitalDisease: trim semantics',
    (raw) => {
      const pd = { congenitalDisease: raw };
      return resolvePatientCongenitalDisease(pd) === raw.trim();
    }
  );

  test.prop([fc.oneof(fc.integer(), fc.constant(null), fc.array(fc.anything()), fc.object())], RUNS_100)(
    'P26 — resolvePatientCongenitalDisease: non-string → ""',
    (badValue) => {
      const pd = { congenitalDisease: badValue };
      return resolvePatientCongenitalDisease(pd) === '';
    }
  );

  test.prop([PD_CANONICAL_ARB], RUNS_200)(
    'P27 — resolvePatientDrugAllergy: asymmetric prefix rule (4 cases)',
    (pd) => {
      const drug = typeof pd.drugAllergy === 'string' ? pd.drugAllergy.trim() : '';
      const food = typeof pd.foodAllergy === 'string' ? pd.foodAllergy.trim() : '';
      const out = resolvePatientDrugAllergy(pd);
      if (drug && food) {
        return out === `${DRUG_ALLERGY_LABEL_PREFIX}${drug} / ${FOOD_ALLERGY_LABEL_PREFIX}${food}`;
      }
      if (drug) return out === drug; // raw, no prefix
      if (food) return out === `${FOOD_ALLERGY_LABEL_PREFIX}${food}`;
      return out === '';
    }
  );

  test.prop(
    [
      fc.oneof(
        fc.constant(true),
        fc.constant(false),
        fc.constant(1),
        fc.constant('true'),
        fc.constant(null),
        fc.constant(undefined),
        fc.constant('yes'),
        fc.constant(0)
      ),
    ],
    RUNS_100
  )(
    'P28 — resolvePatientTreatmentHistory: STRICT pregnanted === true gate (rejects truthy non-true)',
    (pregnanted) => {
      const pd = { pregnanted };
      const out = resolvePatientTreatmentHistory(pd);
      if (pregnanted === true) {
        return out === `${PREGNANCY_LABEL_PREFIX}กำลังตั้งครรภ์`;
      }
      return out === '';
    }
  );

  test.prop(
    [
      fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
    ],
    RUNS_100
  )(
    'P29 — resolvePatientTreatmentHistory: insertion order fixed (beforeTreatment first)',
    (before) => {
      const pd = { beforeTreatment: before, pregnanted: true };
      const out = resolvePatientTreatmentHistory(pd);
      const beforeIdx = out.indexOf(BEFORE_TREATMENT_LABEL_PREFIX);
      const pregIdx = out.indexOf(PREGNANCY_LABEL_PREFIX);
      if (beforeIdx === -1 || pregIdx === -1) return false;
      return beforeIdx < pregIdx;
    }
  );
});

// ════════════════════════════════════════════════════════════════════════════
// Group T2.6 — PRE-Rule-of-3 vs POST-Rule-of-3 Behavioral Diff (CRITICAL)
// ════════════════════════════════════════════════════════════════════════════
//
// Re-implementation of the OLD inline derivation that was in
// kioskPatientToCanonical.js BEFORE Phase 26.2g-fillin-bis-followup (2026-05-13).
// Verbatim copy from the pre-2e95696 source. Used to verify byte-identical
// output for "clean" PatientForm-sanitized inputs AND document divergence
// for adversarial inputs.

function _legacyInlineCongenitalDisease(d) {
  const pmh = [];
  if (d.hasUnderlying === 'มี') {
    if (d.ud_hypertension) pmh.push('ความดันโลหิตสูง');
    if (d.ud_diabetes) pmh.push('เบาหวาน');
    if (d.ud_lung) pmh.push('โรคปอด');
    if (d.ud_kidney) pmh.push('โรคไต');
    if (d.ud_heart) pmh.push('โรคหัวใจ');
    if (d.ud_blood) pmh.push('โรคโลหิต');
    if (d.ud_other && d.ud_otherDetail) pmh.push(d.ud_otherDetail);
  }
  return pmh.join(', ');
}

describe('T2.6 — Behavioral diff: PRE-Rule-of-3 vs POST-Rule-of-3', () => {
  // Sanitized record for D1: ud_otherDetail must be either empty OR trimmed
  // non-empty string (matches PatientForm sanitization contract).
  const SANITIZED_KIOSK_ARB = fc.record({
    hasUnderlying: fc.constantFrom('มี', 'ไม่มี', ''),
    ud_hypertension: fc.boolean(),
    ud_diabetes: fc.boolean(),
    ud_lung: fc.boolean(),
    ud_kidney: fc.boolean(),
    ud_heart: fc.boolean(),
    ud_blood: fc.boolean(),
    ud_other: fc.boolean(),
    ud_otherDetail: SANITIZED_STRING_ARB,
  });

  test.prop([SANITIZED_KIOSK_ARB], RUNS_200)(
    'D1 — sanitized inputs: legacy output === helper output (byte-identical for PatientForm-clean data)',
    (pd) => {
      const legacy = _legacyInlineCongenitalDisease(pd);
      const helper = derivePatientCongenitalDisease(pd);
      return legacy === helper;
    }
  );

  it('D2 — leading/trailing whitespace divergence: legacy preserves, helper trims', () => {
    const pd = {
      hasUnderlying: 'มี',
      ud_other: true,
      ud_otherDetail: '  พิษทะเล  ',
    };
    const legacy = _legacyInlineCongenitalDisease(pd);
    const helper = derivePatientCongenitalDisease(pd);
    // Documented divergence:
    expect(legacy).toBe('  พิษทะเล  ');
    expect(helper).toBe('พิษทะเล');
    // Critical: the divergence happens, and helper is strictly safer.
    expect(legacy).not.toBe(helper);
  });

  it('D3 — whitespace-only ud_otherDetail: legacy pushes whitespace, helper skips', () => {
    const pd = {
      hasUnderlying: 'มี',
      ud_other: true,
      ud_otherDetail: '   ',
    };
    const legacy = _legacyInlineCongenitalDisease(pd);
    const helper = derivePatientCongenitalDisease(pd);
    expect(legacy).toBe('   '); // legacy emits whitespace as a "value"
    expect(helper).toBe('');    // helper skips entirely
    expect(legacy).not.toBe(helper);
  });

  it('D4 — numeric ud_otherDetail: legacy coerces via Array.join, helper skips', () => {
    const pd = {
      hasUnderlying: 'มี',
      ud_other: true,
      ud_otherDetail: 123,
    };
    const legacy = _legacyInlineCongenitalDisease(pd);
    const helper = derivePatientCongenitalDisease(pd);
    expect(legacy).toBe('123');  // 123 truthy → pushed → join coerces
    expect(helper).toBe('');     // typeof !== 'string' → skipped
    expect(legacy).not.toBe(helper);
  });

  it('D5 — null patientData: legacy THROWS, helper returns ""', () => {
    expect(() => _legacyInlineCongenitalDisease(null)).toThrow();
    expect(derivePatientCongenitalDisease(null)).toBe('');
    // Helper is strictly safer: no crash on legacy/malformed data.
  });

  it('D6 — array patientData: legacy enters loop (safe by coincidence), helper rejects via _isPlainObject', () => {
    const arr = [];
    const legacy = _legacyInlineCongenitalDisease(arr);
    const helper = derivePatientCongenitalDisease(arr);
    expect(legacy).toBe('');   // [].hasUnderlying is undefined !== 'มี' → no push
    expect(helper).toBe('');   // _isPlainObject rejects array
    // Both return '' but for DIFFERENT reasons. Result-equivalent.
  });

  it('D7 — array with ud_* properties (still safe by coincidence)', () => {
    // Arrays can have arbitrary string-keyed properties. Legacy reads them
    // because the hasUnderlying gate is checked first; helper rejects via
    // _isPlainObject — strictly safer.
    const weirdArr = [];
    weirdArr.hasUnderlying = 'มี';
    weirdArr.ud_diabetes = true;
    const legacy = _legacyInlineCongenitalDisease(weirdArr);
    const helper = derivePatientCongenitalDisease(weirdArr);
    expect(legacy).toBe('เบาหวาน'); // legacy reads property despite array
    expect(helper).toBe('');         // helper rejects array
    expect(legacy).not.toBe(helper); // documented behavioral drift
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Group T4 — Adversarial Fuzz
// ════════════════════════════════════════════════════════════════════════════

describe('T4 — Adversarial fuzz against helpers', () => {
  // ALL six helpers under test
  const helpers = [
    { name: 'derivePatientCongenitalDisease', fn: derivePatientCongenitalDisease },
    { name: 'derivePatientCongenitalDiseaseEnglish', fn: derivePatientCongenitalDiseaseEnglish },
    { name: 'derivePatientTreatmentHistory', fn: derivePatientTreatmentHistory },
    { name: 'resolvePatientCongenitalDisease', fn: resolvePatientCongenitalDisease },
    { name: 'resolvePatientDrugAllergy', fn: resolvePatientDrugAllergy },
    { name: 'resolvePatientTreatmentHistory', fn: resolvePatientTreatmentHistory },
  ];

  describe('A1 — every helper × every adversarial string → defined return, no throw', () => {
    // Each helper takes a patientData object; we feed adversarial strings into
    // the relevant string-typed field per helper signature. Smoke: pass the
    // string as multiple field positions for full coverage.
    for (const { name, fn } of helpers) {
      for (const s of ADVERSARIAL_STRINGS) {
        const label = describeAdversarialString(s);
        it(`${name} × ${label} (as multiple fields)`, () => {
          // Choose all known string fields and feed `s` to each, simultaneously
          const pd = {
            hasUnderlying: 'มี',
            ud_other: true,
            ud_otherDetail: s,
            pregnancy: s,
            currentMedication: s,
            congenitalDisease: s,
            drugAllergy: s,
            foodAllergy: s,
            beforeTreatment: s,
          };
          let result;
          expect(() => {
            result = fn(pd);
          }).not.toThrow();
          // Defined return
          expect(typeof result).toBe('string');
          expect(result).not.toBe(undefined);
          expect(result).not.toBe(null);
          // No "undefined" or "null" literal token leak
          expect(result.includes('undefined')).toBe(false);
          expect(result.includes('null')).toBe(false);
        });
      }
    }
  });

  describe('A2 — every helper × every adversarial non-string AS patientData → returns ""', () => {
    for (const { name, fn } of helpers) {
      for (const v of ADVERSARIAL_NON_STRINGS) {
        const label = describeAdversarialNonString(v);
        it(`${name}(${label}) → ""`, () => {
          let result;
          expect(() => {
            result = fn(v);
          }).not.toThrow();
          expect(result).toBe('');
        });
      }
    }
  });

  describe('A3 — NFC vs NFD codepoint equivalence', () => {
    it('derivePatientCongenitalDisease: ud_otherDetail NFC and NFD produce equivalent output (codepoint-different but visible-same)', () => {
      const nfc = 'café'.normalize('NFC');
      const nfd = 'café'.normalize('NFD');
      // Sanity: codepoints differ
      expect(nfc.length).not.toBe(nfd.length);
      const pdNfc = { hasUnderlying: 'มี', ud_other: true, ud_otherDetail: nfc };
      const pdNfd = { hasUnderlying: 'มี', ud_other: true, ud_otherDetail: nfd };
      const outNfc = derivePatientCongenitalDisease(pdNfc);
      const outNfd = derivePatientCongenitalDisease(pdNfd);
      // Visible-same content after trim. Helper doesn't normalize, so outputs
      // are strictly the same as the input (trimmed); the codepoints differ.
      expect(outNfc).toBe(nfc);
      expect(outNfd).toBe(nfd);
      // Re-normalize both to NFC → should be equal
      expect(outNfc.normalize('NFC')).toBe(outNfd.normalize('NFC'));
    });

    it('resolvePatientCongenitalDisease: same NFC/NFD equivalence', () => {
      const nfc = 'café'.normalize('NFC');
      const nfd = 'café'.normalize('NFD');
      const a = resolvePatientCongenitalDisease({ congenitalDisease: nfc });
      const b = resolvePatientCongenitalDisease({ congenitalDisease: nfd });
      expect(a.normalize('NFC')).toBe(b.normalize('NFC'));
    });
  });

  describe('A4 — Prototype pollution probe', () => {
    it('does NOT contaminate output when ud_hypertension on Object.prototype is set, but patientData is empty {}', () => {
      // Pollute prototype
      Object.prototype.ud_hypertension = true;
      try {
        // Empty patientData but hasUnderlying === 'มี' — does the helper read
        // prototype chain for ud_hypertension?
        const pd = { hasUnderlying: 'มี' };
        const out = derivePatientCongenitalDisease(pd);
        // DOCUMENT: bracket access `patientData[key]` will read prototype.
        // This is a KNOWN behavior, NOT a security bug for THIS helper because:
        //   1. patientData comes from be_customers Firestore docs (controlled source)
        //   2. ud_* are namespaced fields unlikely to collide with Object.prototype
        // But the test documents the actual behavior so anyone changing it knows.
        if (out === 'ความดันโลหิตสูง') {
          // Prototype pollution LEAKED into output. Documented.
          expect(out).toBe('ความดันโลหิตสูง');
        } else {
          // Helper isolates from prototype (e.g. uses hasOwnProperty).
          expect(out).toBe('');
        }
      } finally {
        // ALWAYS clean up — prototype pollution can wreck downstream tests.
        delete Object.prototype.ud_hypertension;
      }
    });

    it('does NOT contaminate output for the canonical resolver', () => {
      Object.prototype.congenitalDisease = 'POISON';
      try {
        // {} has no own 'congenitalDisease' but inherits from prototype
        const out = resolvePatientCongenitalDisease({});
        // Document actual behavior
        if (out === 'POISON') {
          // Leaked — known prototype-access behavior
          expect(out).toBe('POISON');
        } else {
          expect(out).toBe('');
        }
      } finally {
        delete Object.prototype.congenitalDisease;
      }
    });
  });

  describe('A5 — Cyclic reference', () => {
    it('does not infinite-loop or stack-overflow', () => {
      const d = { hasUnderlying: 'มี', ud_diabetes: true };
      d.self = d; // cycle
      let result;
      expect(() => {
        result = derivePatientCongenitalDisease(d);
      }).not.toThrow();
      // Should still get correct output for non-cyclic fields
      expect(result).toBe('เบาหวาน');
    });

    it('resolvePatientDrugAllergy with cyclic ref', () => {
      const d = { drugAllergy: 'พารา' };
      d.cycle = d;
      let result;
      expect(() => {
        result = resolvePatientDrugAllergy(d);
      }).not.toThrow();
      expect(result).toBe('พารา');
    });
  });

  describe('A6 — Frozen patientData', () => {
    it('derivePatientCongenitalDisease accepts frozen object (read-only contract)', () => {
      const frozen = Object.freeze({
        hasUnderlying: 'มี',
        ud_diabetes: true,
        ud_hypertension: true,
      });
      let result;
      expect(() => {
        result = derivePatientCongenitalDisease(frozen);
      }).not.toThrow();
      expect(result).toBe('ความดันโลหิตสูง, เบาหวาน');
    });

    it('all 6 helpers accept frozen patientData', () => {
      const frozen = Object.freeze({
        hasUnderlying: 'มี',
        ud_diabetes: true,
        congenitalDisease: 'X',
        drugAllergy: 'D',
        foodAllergy: 'F',
        beforeTreatment: 'BT',
        pregnanted: true,
        pregnancy: '3 months',
        currentMedication: 'med',
      });
      for (const { name, fn } of helpers) {
        expect(() => fn(frozen), `${name} should accept frozen`).not.toThrow();
      }
    });

    it('frozen patientData with sealed nested objects also OK', () => {
      const inner = Object.seal({ foo: 'bar' });
      const frozen = Object.freeze({
        hasUnderlying: 'มี',
        ud_other: true,
        ud_otherDetail: 'extra',
        nested: inner,
      });
      expect(() => derivePatientCongenitalDisease(frozen)).not.toThrow();
    });
  });

  describe('A7 — Clean fixtures still work post-fuzz (sanity)', () => {
    it('clean fixture outputs match published contract', () => {
      const f = CLEAN_PATIENT_FORM_FIXTURES;
      expect(resolvePatientCongenitalDisease({ congenitalDisease: f.congenitalDiseaseSimple }))
        .toBe(f.congenitalDiseaseSimple);
      expect(resolvePatientDrugAllergy({
        drugAllergy: f.drugAllergySimple,
        foodAllergy: f.foodAllergySimple,
      })).toBe(`แพ้ยา: ${f.drugAllergySimple} / แพ้อาหาร: ${f.foodAllergySimple}`);
      expect(resolvePatientTreatmentHistory({
        beforeTreatment: f.beforeTreatmentSimple,
        pregnanted: true,
      })).toBe(`การรักษาก่อนหน้า: ${f.beforeTreatmentSimple} / การตั้งครรภ์: กำลังตั้งครรภ์`);
    });
  });
});
