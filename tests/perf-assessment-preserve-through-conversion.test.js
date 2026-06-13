import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { kioskPatientToCanonical } from '../src/lib/kioskPatientToCanonical.js';
import { normalizeCustomer } from '../src/lib/customerValidation.js';
import { KIOSK_ASSESSMENT_FIELDS, pickKioskAssessmentFields } from '../src/lib/kioskAssessmentFields.js';

// 2026-06-13 — /systematic-debugging. The kiosk perf/hormone assessment answers
// (Part1 symp_pe / ADAM adam_1..10 / IIEF-5 iief_1..5 / MRS mrs_1..11) must
// survive the kiosk intake → be_customers conversion. PROVEN on real prod:
// opd_sessions carry the perf fields 116/136, be_customers 0/150 — the
// conversion DROPPED them, so the saved-customer intake view ("บันทึกข้อมูล
// รับเข้า" perf sections, which read patientData.{symp_pe,adam_*,iief_*,mrs_*})
// showed everything 0 / ไม่มี / "ข้อมูลไม่ครบถ้วน". Same class as V141/AV162
// (visit_reasons dropped → blank "สาเหตุที่มาพบแพทย์"). Fix = the 3-mapper
// triangle (kioskPatientToCanonical + buildPatientDataFromForm +
// buildFormFromCustomer) carrying the 27 fields via pickKioskAssessmentFields.

vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test', auth: { currentUser: null } }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}), collection: () => ({}),
  getDoc: vi.fn(), getDocs: vi.fn(), setDoc: vi.fn(), updateDoc: vi.fn(),
  deleteDoc: vi.fn(), query: vi.fn(), where: vi.fn(), limit: vi.fn(),
  orderBy: vi.fn(), writeBatch: vi.fn(() => ({ commit: vi.fn() })),
  runTransaction: vi.fn(), onSnapshot: vi.fn(), serverTimestamp: vi.fn(() => '__TS__'),
  arrayUnion: vi.fn(), arrayRemove: vi.fn(), increment: vi.fn(),
}));
const { buildPatientDataFromForm, buildFormFromCustomer } = await import('../src/lib/backendClient.js');

// A realistic perf customer (the EXACT shape PatientForm writes to
// opd_sessions.patientData): ADAM checkboxes = boolean, IIEF/MRS = string answer.
const PERF_SESSION = {
  firstName: 'ภูดิท', lastName: 'เนินพลกรัง', phone: '0910157999',
  gender: 'ชาย', visitReasons: ['สมรรถภาพทางเพศ'],
  symp_pe: true,
  adam_1: true, adam_2: false, adam_3: true, adam_4: false, adam_5: false,
  adam_6: false, adam_7: true, adam_8: false, adam_9: false, adam_10: false,
  iief_1: '4', iief_2: '3', iief_3: '5', iief_4: '2', iief_5: '4',
  mrs_1: '0', mrs_2: '1', mrs_3: '2', mrs_4: '3', mrs_5: '4',
  mrs_6: '0', mrs_7: '', mrs_8: '', mrs_9: '', mrs_10: '', mrs_11: '',
};

describe('A · pickKioskAssessmentFields helper', () => {
  it('A1 list = 27 fields (symp_pe + 10 ADAM + 5 IIEF + 11 MRS)', () => {
    expect(KIOSK_ASSESSMENT_FIELDS.length).toBe(27);
    expect(KIOSK_ASSESSMENT_FIELDS).toContain('symp_pe');
    expect(KIOSK_ASSESSMENT_FIELDS).toContain('adam_10');
    expect(KIOSK_ASSESSMENT_FIELDS).toContain('iief_5');
    expect(KIOSK_ASSESSMENT_FIELDS).toContain('mrs_11');
  });
  it('A2 keeps true ADAM + non-empty IIEF/MRS (incl. "0"); drops false + empty', () => {
    const r = pickKioskAssessmentFields(PERF_SESSION);
    expect(r.symp_pe).toBe(true);
    expect(r.adam_1).toBe(true); expect(r.adam_7).toBe(true);
    expect('adam_2' in r).toBe(false);          // false dropped
    expect(r.iief_1).toBe('4'); expect(r.iief_4).toBe('2');
    expect(r.mrs_1).toBe('0');                  // "0" is a valid MRS answer — KEPT
    expect('mrs_7' in r).toBe(false);           // '' dropped
  });
  it('A3 no perf answers → {} (lean: non-perf customers get zero assessment keys)', () => {
    expect(pickKioskAssessmentFields({ firstName: 'A', symp_pe: false, iief_1: '', mrs_1: '' })).toEqual({});
    expect(pickKioskAssessmentFields(null)).toEqual({});
    expect(pickKioskAssessmentFields('x')).toEqual({});
  });
  it('A4 no camelCase keys (Phase 23.0 root-doc contract — safe to land on root)', () => {
    expect(KIOSK_ASSESSMENT_FIELDS.filter((k) => /[A-Z]/.test(k))).toEqual([]);
  });
});

describe('B · kioskPatientToCanonical carries the assessment dataset', () => {
  const out = kioskPatientToCanonical(PERF_SESSION, { summaryLanguage: 'en' });
  it('B1 carries symp_pe / ADAM(true) / IIEF / MRS through', () => {
    expect(out.symp_pe).toBe(true);
    expect(out.adam_1).toBe(true); expect(out.adam_7).toBe(true);
    expect(out.iief_3).toBe('5');
    expect(out.mrs_5).toBe('4'); expect(out.mrs_1).toBe('0');
  });
  it('B2 still NO camelCase leak onto the canonical/root form (Phase 23.0)', () => {
    expect(Object.keys(out).filter((k) => /[A-Z]/.test(k))).toEqual([]);
  });
  it('B3 non-perf session → no assessment keys added', () => {
    const o = kioskPatientToCanonical({ firstName: 'A', visitReasons: ['ขลิบ'] });
    expect(KIOSK_ASSESSMENT_FIELDS.some((k) => k in o)).toBe(false);
  });
});

describe('C · buildPatientDataFromForm projects assessment fields onto patientData (the reader source)', () => {
  it('C1 the intake reader keys (d.symp_pe / d.adam_* / d.iief_* / d.mrs_*) resolve', () => {
    const form = kioskPatientToCanonical(PERF_SESSION, { summaryLanguage: 'en' });
    const pd = buildPatientDataFromForm(form);
    // The EXACT keys AdminDashboard perf sections read:
    expect(pd.symp_pe).toBe(true);
    expect(pd.adam_1).toBe(true); expect(pd.adam_7).toBe(true);
    expect(pd.iief_1).toBe('4'); expect(pd.iief_5).toBe('4');
    expect(pd.mrs_1).toBe('0'); expect(pd.mrs_5).toBe('4');
    // false/empty correctly absent (renders ไม่มี — display-equivalent)
    expect('adam_2' in pd).toBe(false);
    expect('mrs_7' in pd).toBe(false);
  });
  it('C2 IIEF score reconstitutes from the carried fields (4+3+5+2+4 = 18)', () => {
    const pd = buildPatientDataFromForm(kioskPatientToCanonical(PERF_SESSION));
    const score = [pd.iief_1, pd.iief_2, pd.iief_3, pd.iief_4, pd.iief_5]
      .reduce((s, v) => s + (parseInt(v, 10) || 0), 0);
    expect(score).toBe(18); // pre-fix the reader showed "ข้อมูลไม่ครบถ้วน" 0/25
  });
});

describe('D · FULL chain — kiosk → canonical → normalize → patientData (real new-customer save path)', () => {
  it('D1 all answered fields survive normalizeCustomer (spread-preserve)', () => {
    const canonical = kioskPatientToCanonical(PERF_SESSION, { summaryLanguage: 'en' });
    const finalForm = normalizeCustomer({ ...canonical });
    const pd = buildPatientDataFromForm(finalForm);
    expect(pd.symp_pe).toBe(true);
    expect(pd.adam_1).toBe(true);
    expect(pd.iief_3).toBe('5');
    expect(pd.mrs_5).toBe('4');
  });
});

describe('E · ROUND-TRIP — backend edit re-save does NOT clobber (buildFormFromCustomer ↔ buildPatientDataFromForm)', () => {
  it('E1 load saved customer → form → re-save preserves assessment fields', () => {
    const pd0 = buildPatientDataFromForm(kioskPatientToCanonical(PERF_SESSION));
    const customer = { id: 'TEST', patientData: pd0 };
    const form = buildFormFromCustomer(customer);           // CustomerEditPage prefill
    const reSaved = buildPatientDataFromForm(normalizeCustomer({ ...form })); // re-save
    expect(reSaved.symp_pe).toBe(true);
    expect(reSaved.adam_7).toBe(true);
    expect(reSaved.iief_3).toBe('5');
    expect(reSaved.mrs_5).toBe('4');
    expect(reSaved.mrs_1).toBe('0');
  });
});

describe('G · source-grep regression — the 3-mapper triangle uses the shared helper', () => {
  const read = (p) => readFileSync(path.resolve(process.cwd(), p), 'utf8');
  it('G1 kioskPatientToCanonical imports + spreads pickKioskAssessmentFields(d)', () => {
    const src = read('src/lib/kioskPatientToCanonical.js');
    expect(src).toMatch(/from '\.\/kioskAssessmentFields\.js'/);
    expect(src).toMatch(/pickKioskAssessmentFields\(d\)/);
  });
  it('G2 backendClient buildPatientDataFromForm + buildFormFromCustomer use the helper', () => {
    const src = read('src/lib/backendClient.js');
    expect(src).toMatch(/from '\.\/kioskAssessmentFields\.js'/);
    expect(src).toMatch(/pickKioskAssessmentFields\(form\)/); // builder
    expect(src).toMatch(/pickKioskAssessmentFields\(pd\)/);   // reverse round-trip
  });
});
