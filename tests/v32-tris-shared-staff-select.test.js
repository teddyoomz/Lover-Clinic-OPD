// V32-tris (2026-04-26) — shared staff-select + auto-fill + 10px gap
//
// User chain across session 10:
//   1. "บั๊ค Bulk PDF ที่สร้างเกินมา 1 หน้า + วางตัวอักษรไม่ตรงเส้น" → V32 base
//   2. "สร้างหน้าเดียวแล้ว แต่วันที่รักษายังไม่ตรง" → V32-bis
//   3. "วันที่รักษายังไม่ตรง" + "ให้ Auto ดึง field แพทย์ และมีใบอนุญาต" → V32-tris
//   4. "วันที่รักษาไม่ตรง ต้องเอาขึ้นอีกนิด" → V32-tris round 2 (10px gap)
//
// V32-tris extracts shared module so BulkPrintModal can use the SAME smart
// dropdown as DocumentPrintModal:
//   - src/lib/documentFieldAutoFill.js — pure helpers (composeName,
//     composeSubtitle, filterByQuery, computeStaffAutoFill)
//   - src/components/backend/StaffSelectField.jsx — searchable combobox
//
// V32-tris also fixes a LATENT BUG in the original DocumentPrintModal:
// the inner StaffSelectField only emitted onChange(displayName) without
// the record, so the smart auto-fill block never fired. Fixed by emitting
// (displayName, record) pair.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  composeStaffDisplayName,
  composeStaffSubtitle,
  filterStaffByQuery,
  computeStaffAutoFill,
} from '../src/lib/documentFieldAutoFill.js';

const STAFF_SELECT_SRC = readFileSync('src/components/backend/StaffSelectField.jsx', 'utf8');
const DOC_MODAL_SRC = readFileSync('src/components/backend/DocumentPrintModal.jsx', 'utf8');
const BULK_MODAL_SRC = readFileSync('src/components/backend/BulkPrintModal.jsx', 'utf8');
const ENGINE_SRC = readFileSync('src/lib/documentPrintEngine.js', 'utf8');

// ─── T1 — composeStaffDisplayName ────────────────────────────────────────
describe('T1 composeStaffDisplayName', () => {
  test('T1.1 prefers prefix + firstname + lastname', () => {
    expect(composeStaffDisplayName({ prefix: 'นพ.', firstname: 'สมชาย', lastname: 'ใจดี' })).toBe('นพ. สมชาย ใจดี');
  });
  test('T1.2 falls back to firstName/lastName camelCase', () => {
    expect(composeStaffDisplayName({ prefix: 'Mr.', firstName: 'John', lastName: 'Doe' })).toBe('Mr. John Doe');
  });
  test('T1.3 falls back to .name field', () => {
    expect(composeStaffDisplayName({ name: 'พญ. แพรว' })).toBe('พญ. แพรว');
  });
  test('T1.4 falls back to fullName then nickname', () => {
    expect(composeStaffDisplayName({ fullName: 'Doctor Smith' })).toBe('Doctor Smith');
    expect(composeStaffDisplayName({ nickname: 'หมอ' })).toBe('หมอ');
  });
  test('T1.5 returns "(ไม่มีชื่อ)" placeholder when nothing usable', () => {
    expect(composeStaffDisplayName({})).toBe('(ไม่มีชื่อ)');
    expect(composeStaffDisplayName({ position: 'แพทย์' })).toBe('(ไม่มีชื่อ)');
  });
  test('T1.6 handles null/undefined input', () => {
    expect(composeStaffDisplayName(null)).toBe('');
    expect(composeStaffDisplayName(undefined)).toBe('');
    expect(composeStaffDisplayName('string')).toBe('');
  });
  test('T1.7 trims whitespace from individual parts', () => {
    // Each part is trimmed individually before joining with single spaces
    expect(composeStaffDisplayName({ prefix: '  Mr. ', firstname: ' John ', lastname: ' Doe  ' })).toBe('Mr. John Doe');
  });
});

// ─── T2 — composeStaffSubtitle ───────────────────────────────────────────
describe('T2 composeStaffSubtitle', () => {
  test('T2.1 joins position + license + nickname + dept + phone + email with " · "', () => {
    expect(composeStaffSubtitle({ position: 'แพทย์', licenseNo: '12345', nickname: 'หมอ', email: 'a@b.com' }))
      .toBe('แพทย์ · เลขที่ 12345 · ชื่อเล่น หมอ · a@b.com');
  });
  test('T2.2 returns empty string when no info available', () => {
    expect(composeStaffSubtitle({})).toBe('');
    expect(composeStaffSubtitle({ name: 'X' })).toBe('');
  });
  test('T2.3 handles null/undefined gracefully', () => {
    expect(composeStaffSubtitle(null)).toBe('');
    expect(composeStaffSubtitle(undefined)).toBe('');
  });
  test('T2.4 falls back to staffLicenseNo + medicalLicenseNo aliases', () => {
    expect(composeStaffSubtitle({ medicalLicenseNo: 'ML123' })).toContain('เลขที่ ML123');
    expect(composeStaffSubtitle({ staffLicenseNo: 'SL456' })).toContain('เลขที่ SL456');
  });
});

// ─── T3 — filterStaffByQuery ─────────────────────────────────────────────
describe('T3 filterStaffByQuery', () => {
  const list = [
    { firstname: 'สมชาย', lastname: 'ใจดี', licenseNo: '12345' },
    { firstName: 'John', lastName: 'Doe', medicalLicenseNo: 'ML999' },
    { firstname: 'Jane', firstnameEn: 'Jane', lastnameEn: 'Smith', licenseNo: '7777' },
  ];
  test('T3.1 returns full list when query is empty', () => {
    expect(filterStaffByQuery(list, '')).toHaveLength(3);
    expect(filterStaffByQuery(list, '   ')).toHaveLength(3);
  });
  test('T3.2 matches Thai name', () => {
    expect(filterStaffByQuery(list, 'สมชาย')).toHaveLength(1);
  });
  test('T3.3 matches English name (case-insensitive)', () => {
    expect(filterStaffByQuery(list, 'JOHN')).toHaveLength(1);
    expect(filterStaffByQuery(list, 'john')).toHaveLength(1);
  });
  test('T3.4 matches license number', () => {
    expect(filterStaffByQuery(list, '12345')).toHaveLength(1);
    expect(filterStaffByQuery(list, 'ML999')).toHaveLength(1);
  });
  test('T3.5 matches firstnameEn / lastnameEn', () => {
    expect(filterStaffByQuery(list, 'Smith')).toHaveLength(1);
  });
  test('T3.6 returns empty array for no match', () => {
    expect(filterStaffByQuery(list, 'นั่นไม่ใช่ใครเลย')).toHaveLength(0);
  });
  test('T3.7 returns [] for non-array input', () => {
    expect(filterStaffByQuery(null, 'q')).toEqual([]);
    expect(filterStaffByQuery({}, 'q')).toEqual([]);
  });
});

// ─── T4 — computeStaffAutoFill ───────────────────────────────────────────
describe('T4 computeStaffAutoFill', () => {
  const seedFields = [
    { key: 'doctorName' },
    { key: 'doctorLicenseNo' },
    { key: 'doctorPhone' },
    { key: 'doctorEmail' },
    { key: 'doctorPosition' },
    { key: 'doctorNameEn' },
    { key: 'doctorDepartment' },
    { key: 'doctorSignature' },
  ];
  const record = {
    licenseNo: '12345',
    phone: '0812345678',
    email: 'doc@clinic.com',
    position: 'แพทย์ผู้เชี่ยวชาญ',
    firstnameEn: 'John',
    lastnameEn: 'Doe',
    department: 'Internal Medicine',
    signatureUrl: 'data:image/png;base64,iVBORw0KGgo=',
  };

  test('T4.1 returns {} for null record', () => {
    expect(computeStaffAutoFill(null, 'doctorName', seedFields)).toEqual({});
    expect(computeStaffAutoFill(undefined, 'doctorName', seedFields)).toEqual({});
  });
  test('T4.2 returns {} for missing pickedFieldKey', () => {
    expect(computeStaffAutoFill(record, '', seedFields)).toEqual({});
    expect(computeStaffAutoFill(record, null, seedFields)).toEqual({});
  });
  test('T4.3 returns {} for non-array seedFields', () => {
    expect(computeStaffAutoFill(record, 'doctorName', null)).toEqual({});
    expect(computeStaffAutoFill(record, 'doctorName', {})).toEqual({});
  });
  test('T4.4 fills license / phone / email / position when fields exist', () => {
    const out = computeStaffAutoFill(record, 'doctorName', seedFields);
    expect(out.doctorLicenseNo).toBe('12345');
    expect(out.doctorPhone).toBe('0812345678');
    expect(out.doctorEmail).toBe('doc@clinic.com');
    expect(out.doctorPosition).toBe('แพทย์ผู้เชี่ยวชาญ');
  });
  test('T4.5 fills English name (joined firstnameEn + lastnameEn)', () => {
    const out = computeStaffAutoFill(record, 'doctorName', seedFields);
    expect(out.doctorNameEn).toBe('John Doe');
  });
  test('T4.6 fills department', () => {
    const out = computeStaffAutoFill(record, 'doctorName', seedFields);
    expect(out.doctorDepartment).toBe('Internal Medicine');
  });
  test('T4.7 wraps signatureUrl in safe <img> tag', () => {
    const out = computeStaffAutoFill(record, 'doctorName', seedFields);
    expect(out.doctorSignature).toContain('<img');
    expect(out.doctorSignature).toMatch(/src="data:image\/png;base64,/);
    expect(out.doctorSignature).toContain('alt="signature"');
  });
  test('T4.8 only fills fields that exist in seedFields (skips missing)', () => {
    const minimalSeed = [{ key: 'doctorName' }, { key: 'doctorLicenseNo' }];
    const out = computeStaffAutoFill(record, 'doctorName', minimalSeed);
    expect(out.doctorLicenseNo).toBe('12345');
    expect(out.doctorPhone).toBeUndefined();
    expect(out.doctorEmail).toBeUndefined();
  });
  test('T4.9 skips fields where record value is empty', () => {
    const sparseRecord = { licenseNo: '12345' };
    const out = computeStaffAutoFill(sparseRecord, 'doctorName', seedFields);
    expect(out.doctorLicenseNo).toBe('12345');
    expect(out.doctorPhone).toBeUndefined();
    expect(out.doctorEmail).toBeUndefined();
  });
  test('T4.10 supports assistantName → assistantLicenseNo / etc. (different baseKey)', () => {
    const assistSeed = [{ key: 'assistantName' }, { key: 'assistantLicenseNo' }, { key: 'assistantPhone' }];
    const out = computeStaffAutoFill(record, 'assistantName', assistSeed);
    expect(out.assistantLicenseNo).toBe('12345');
    expect(out.assistantPhone).toBe('0812345678');
  });
  test('T4.11 supports staff fallback aliases (medicalLicenseNo, staffLicenseNo)', () => {
    const out1 = computeStaffAutoFill({ medicalLicenseNo: 'ML999' }, 'doctorName', seedFields);
    expect(out1.doctorLicenseNo).toBe('ML999');
    const out2 = computeStaffAutoFill({ staffLicenseNo: 'SL777' }, 'doctorName', seedFields);
    expect(out2.doctorLicenseNo).toBe('SL777');
  });
  test('T4.12 phone falls back to tel/mobile', () => {
    expect(computeStaffAutoFill({ tel: '0223334444' }, 'doctorName', seedFields).doctorPhone).toBe('0223334444');
    expect(computeStaffAutoFill({ mobile: '0998887777' }, 'doctorName', seedFields).doctorPhone).toBe('0998887777');
  });
  test('T4.13 position falls back to role', () => {
    expect(computeStaffAutoFill({ role: 'Nurse' }, 'doctorName', seedFields).doctorPosition).toBe('Nurse');
  });
  test('T4.14 department falls back to section', () => {
    expect(computeStaffAutoFill({ section: 'ER' }, 'doctorName', seedFields).doctorDepartment).toBe('ER');
  });
  test('T4.15 supports firstNameEn / lastNameEn camelCase', () => {
    const out = computeStaffAutoFill({ firstNameEn: 'Jane', lastNameEn: 'Smith' }, 'doctorName', seedFields);
    expect(out.doctorNameEn).toBe('Jane Smith');
  });
});

// ─── T5 — StaffSelectField source-grep regression guards ─────────────────
describe('T5 StaffSelectField source-grep regression guards', () => {
  test('T5.1 imports shared helpers from documentFieldAutoFill', () => {
    expect(STAFF_SELECT_SRC).toMatch(/from ['"]\.\.\/\.\.\/lib\/documentFieldAutoFill\.js['"]/);
    expect(STAFF_SELECT_SRC).toMatch(/composeStaffDisplayName/);
    expect(STAFF_SELECT_SRC).toMatch(/composeStaffSubtitle/);
    expect(STAFF_SELECT_SRC).toMatch(/filterStaffByQuery/);
  });
  test('T5.2 emits BOTH displayName AND record on pick (V32-tris bug fix)', () => {
    // Original DocumentPrintModal version emitted only displayName so
    // auto-fill never fired. Lock the fix shape.
    expect(STAFF_SELECT_SRC).toMatch(/onChange\(composeStaffDisplayName\(p\),\s*p\)/);
  });
  test('T5.3 has data-testid="staff-select-{key}" for E2E targeting', () => {
    expect(STAFF_SELECT_SRC).toMatch(/data-testid=\{[^}]*staff-select-/);
  });
  test('T5.4 default-exports the component', () => {
    expect(STAFF_SELECT_SRC).toMatch(/export default function StaffSelectField/);
  });
});

// ─── T6 — DocumentPrintModal uses shared modules (refactor) ──────────────
describe('T6 DocumentPrintModal uses shared StaffSelectField + autofill', () => {
  test('T6.1 imports StaffSelectField from sibling file', () => {
    expect(DOC_MODAL_SRC).toMatch(/from ['"]\.\/StaffSelectField\.jsx['"]/);
  });
  test('T6.2 imports computeStaffAutoFill from lib', () => {
    expect(DOC_MODAL_SRC).toMatch(/computeStaffAutoFill/);
    expect(DOC_MODAL_SRC).toMatch(/from ['"]\.\.\/\.\.\/lib\/documentFieldAutoFill\.js['"]/);
  });
  test('T6.3 NO local StaffSelectField function (was 110 LoC duplicate)', () => {
    expect(DOC_MODAL_SRC).not.toMatch(/^function StaffSelectField/m);
  });
  test('T6.4 NO inline auto-fill block (replaced by computeStaffAutoFill spread)', () => {
    // The old block had ~70 lines of repeated has(licKey)/firstNonEmpty boilerplate
    expect(DOC_MODAL_SRC).not.toMatch(/firstNonEmpty\s*=/);
    // Must have the new spread call shape
    expect(DOC_MODAL_SRC).toMatch(/computeStaffAutoFill\(record, f\.key/);
  });
});

// ─── T7 — BulkPrintModal renders staff-select smart dropdown ─────────────
describe('T7 BulkPrintModal smart picker', () => {
  test('T7.1 imports StaffSelectField + computeStaffAutoFill', () => {
    expect(BULK_MODAL_SRC).toMatch(/from ['"]\.\/StaffSelectField\.jsx['"]/);
    expect(BULK_MODAL_SRC).toMatch(/computeStaffAutoFill/);
  });
  test('T7.2 imports listDoctors + listStaff', () => {
    expect(BULK_MODAL_SRC).toMatch(/listDoctors/);
    expect(BULK_MODAL_SRC).toMatch(/listStaff/);
  });
  test('T7.3 has doctorList + staffList state hooks', () => {
    expect(BULK_MODAL_SRC).toMatch(/setDoctorList/);
    expect(BULK_MODAL_SRC).toMatch(/setStaffList/);
  });
  test('T7.4 renders staff-select fields via StaffSelectField (not raw <input>)', () => {
    // The fill step must branch on f.type === 'staff-select' and render
    // <StaffSelectField> for it.
    expect(BULK_MODAL_SRC).toMatch(/f\.type === 'staff-select'/);
    expect(BULK_MODAL_SRC).toMatch(/<StaffSelectField/);
  });
  test('T7.5 onChange spreads computeStaffAutoFill output', () => {
    expect(BULK_MODAL_SRC).toMatch(/computeStaffAutoFill\(record,\s*f\.key,\s*selected\.fields\s*\|\|\s*\[\]\)/);
  });
  test('T7.6 staff-select source maps to doctors / staff / both', () => {
    expect(BULK_MODAL_SRC).toMatch(/src === 'staff'/);
    expect(BULK_MODAL_SRC).toMatch(/src === 'doctors\+staff'/);
  });
});

// ─── T8 — V32-tris round 2: 10px gap (visual breathing room) ─────────────
describe('T8 V32-tris round 2 — 10px gap (user "ต้องเอาขึ้นอีกนิด")', () => {
  test('T8.1 applyPdfAlignmentInline uses bottom: 10px (not 4px)', () => {
    expect(ENGINE_SRC).toMatch(/bottom:\s*10px/);
    expect(ENGINE_SRC).not.toMatch(/bottom:\s*4px/);
  });
  test('T8.2 minHeight bumped to 26px (was 22px in round 1)', () => {
    // Loose match: allow either '24px' / '26px' as both are valid round-2 values
    expect(ENGINE_SRC).toMatch(/el\.style\.minHeight\s*=\s*['"]2[46]px['"]/);
  });
  test('T8.3 buildPrintDocument <style> uses padding-bottom: 10px', () => {
    const styleBlock = ENGINE_SRC.match(/span\[style\*="border-bottom:1px dotted"\]\[style\*="display:inline-block"\][\s\S]*?\}/);
    expect(styleBlock).toBeTruthy();
    expect(styleBlock[0]).toMatch(/padding-bottom:\s*10px/);
  });
  test('T8.4 DocumentPrintModal preview <style> mirrors padding-bottom: 10px', () => {
    expect(DOC_MODAL_SRC).toMatch(/padding-bottom:\s*10px/);
  });
  test('T8.5 V32-tris round 2 marker comment present (institutional memory)', () => {
    expect(ENGINE_SRC).toMatch(/V32-tris round 2/i);
  });
});
