import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { kioskPatientToCanonical } from '../src/lib/kioskPatientToCanonical.js';

// V141 (2026-05-31) — /systematic-debugging. The chief-complaint / visit-reason
// dataset (visitReasons, visitReasonOther, hrtGoals, hrtTransType, hrtOtherDetail)
// must survive the kiosk intake → be_customers conversion. PROVEN on real prod:
// opd_sessions have visitReasons 100%, be_customers 0% — the conversion folded
// visitReasons → `symptoms` (string) + dropped the rest, so the intake view
// ("สาเหตุที่มาพบแพทย์") + Clinical Summary ("Chief Complaint") showed BLANK even
// though the customer filled it. Fix = the 3-mapper triangle.

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

const SESSION = {
  firstName: 'เกรียงไกร', lastName: 'พืชน์ไพบูลย์', phone: '0874247375',
  visitReasons: ['ขลิบ', 'อื่นๆ'], visitReasonOther: 'ปรึกษาเรื่อง X',
  hrtGoals: ['ออกกำลังกาย'], hrtTransType: 'ชายเป็นหญิง / MtF', hrtOtherDetail: 'รายละเอียด',
};

describe('V141.A · kioskPatientToCanonical preserves the visit-reason dataset (not only folded symptoms)', () => {
  const out = kioskPatientToCanonical(SESSION, { summaryLanguage: 'en' });
  it('carries visit_reasons (snake canonical array — no camelCase leak onto root doc)', () => {
    expect(out.visit_reasons).toEqual(['ขลิบ', 'อื่นๆ']);
    expect(out.symptoms).toContain('ขลิบ'); // legacy joined string still produced (ProClinic/back-compat)
    // Phase 23.0 contract — canonical form has NO camelCase keys.
    expect(Object.keys(out).filter((k) => /[A-Z]/.test(k))).toEqual([]);
  });
  it('carries visit_reason_other + hrt_goals + hrt_trans_type + hrt_other_detail', () => {
    expect(out.visit_reason_other).toBe('ปรึกษาเรื่อง X');
    expect(out.hrt_goals).toEqual(['ออกกำลังกาย']);
    expect(out.hrt_trans_type).toBe('ชายเป็นหญิง / MtF');
    expect(out.hrt_other_detail).toBe('รายละเอียด');
  });
  it('tolerates a session with no visit reasons → empty array (no crash)', () => {
    const o = kioskPatientToCanonical({ firstName: 'A' });
    expect(o.visit_reasons).toEqual([]);
  });
});

describe('V141.B · buildPatientDataFromForm maps the dataset onto pd', () => {
  const pd = buildPatientDataFromForm(kioskPatientToCanonical(SESSION));
  it('pd.visitReasons present (the field the intake view + Clinical Summary read)', () => {
    expect(pd.visitReasons).toEqual(['ขลิบ', 'อื่นๆ']);
    expect(pd.visitReasonOther).toBe('ปรึกษาเรื่อง X');
    expect(pd.hrtGoals).toEqual(['ออกกำลังกาย']);
    expect(pd.hrtTransType).toBe('ชายเป็นหญิง / MtF');
    expect(pd.hrtOtherDetail).toBe('รายละเอียด');
  });
  it('admin form without visit reasons → pd omits them (no harm to backend-created customers)', () => {
    const pd2 = buildPatientDataFromForm({ firstname: 'Admin' });
    expect(pd2.visitReasons).toBeUndefined();
    expect(pd2.firstName).toBe('Admin');
  });
});

describe('V141.C · buildFormFromCustomer round-trips the dataset (edit no-clobber)', () => {
  it('reads visit_reasons family back from patientData (camelCase pd → snake form)', () => {
    const form = buildFormFromCustomer({ patientData: { visitReasons: ['ขลิบ'], visitReasonOther: 'x', hrtGoals: ['g'], hrtTransType: 't', hrtOtherDetail: 'o' } });
    expect(form.visit_reasons).toEqual(['ขลิบ']);
    expect(form.visit_reason_other).toBe('x');
    expect(form.hrt_goals).toEqual(['g']);
  });
});

describe('V141.D · full reported-scenario round-trip (create + edit both preserve)', () => {
  it('session → kiosk → pd has visitReasons; then edit round-trip keeps it', () => {
    const pd = buildPatientDataFromForm(kioskPatientToCanonical(SESSION));
    expect(Array.isArray(pd.visitReasons) && pd.visitReasons.length).toBeTruthy();
    const reloaded = buildFormFromCustomer({ patientData: pd });          // admin opens the customer
    const pd2 = buildPatientDataFromForm(reloaded);                       // admin re-saves
    expect(pd2.visitReasons).toEqual(pd.visitReasons);                    // NOT clobbered
    expect(pd2.visitReasonOther).toBe('ปรึกษาเรื่อง X');
  });
});

describe('V141.E · AV162 + source-grep', () => {
  it('all 3 mappers carry visitReasons', () => {
    const bc = readFileSync('src/lib/backendClient.js', 'utf8');
    const kc = readFileSync('src/lib/kioskPatientToCanonical.js', 'utf8');
    expect(kc).toMatch(/visit_reasons:/);                                  // kioskPatientToCanonical out (snake canonical)
    expect((bc.match(/visitReasons/g) || []).length).toBeGreaterThanOrEqual(2); // pd.visitReasons in build*ToForm + buildFormFrom*
  });
  it('AV162 documented', () => {
    expect(readFileSync('.agents/skills/audit-anti-vibe-code/SKILL.md', 'utf8')).toMatch(/AV162/);
  });
});
