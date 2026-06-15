// EOD+7 (2026-05-26) — OPD review modal ("ดูข้อมูลรับเข้า" → modal) 5-item cleanup.
//   1. แก้ไขข้อมูล works for admin: PatientForm bypasses isExpired/isArchived when isSimulation
//   2. "ซิงค์ข้อมูลใหม่" Sync button removed (+ dead renderResyncButton def)
//   3. modal save button "บันทึกลง OPD" → "บันทึกเข้าระบบ"
//   4. modal header "ประวัติผู้ป่วย OPD" → "บันทึกข้อมูลรับเข้า"
//   5. "ID: {viewingSession.id}" hidden from the modal header
// Isolated UI/behavior cleanups (no class-of-bug — source-grep regression locks).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const ADMIN = read('src/pages/AdminDashboard.jsx');
const PF = read('src/pages/PatientForm.jsx');

describe('EOD+7 OPD modal — item 1: admin edit bypasses public-link gates', () => {
  it('M1.1 PatientForm 2h-expiry gate skipped when isSimulation (admin edit)', () => {
    // 2026-06-15 (ED Score) — an explicit `!data.expiresAt` was inserted into the
    // gate so ED follow-up links (which carry expiresAt) use their own 1-day expiry
    // instead of the 2h intake timeout. The isPermanent + isSimulation guards are
    // PRESERVED (admin edit still bypasses); only the literal shape changed.
    expect(PF).toMatch(/!data\.isPermanent && !data\.expiresAt && !isSimulation/);
  });
  it('M1.2 PatientForm archived gate skipped when isSimulation (admin edit)', () => {
    expect(PF).toContain('data.isArchived && !isSimulation');
  });
  it('M1.3 public link KEEPS the 2h security timeout (not removed, only bypassed for admin)', () => {
    expect(PF).toContain('SESSION_TIMEOUT_MS');
    expect(PF).toContain('setIsExpired(true)');
  });
});

describe('EOD+7 OPD modal — item 2: "ซิงค์ข้อมูลใหม่" Sync button removed', () => {
  it('M2.1 the Sync label + its render fn are gone from AdminDashboard', () => {
    expect(ADMIN).not.toContain("'ซิงค์ข้อมูลใหม่'");
    expect(ADMIN).not.toContain('renderResyncButton');
  });
});

describe('EOD+7 OPD modal — item 3: save button renamed', () => {
  it('M3.1 modal save button reads "บันทึกเข้าระบบ"', () => {
    expect(ADMIN).toContain("viewingSession.opdRecordedAt ? 'OPD บันทึกแล้ว' : 'บันทึกเข้าระบบ'");
  });
});

describe('EOD+7 OPD modal — item 4: header renamed', () => {
  it('M4.1 modal header reads "บันทึกข้อมูลรับเข้า"', () => {
    expect(ADMIN).toContain("isFollowUp ? 'แบบรายงานติดตาม' : 'บันทึกข้อมูลรับเข้า'");
  });
});

describe('EOD+7 OPD modal — item 5: session ID hidden', () => {
  it('M5.1 the "ID: {viewingSession.id}" line is removed from the modal header', () => {
    expect(ADMIN).not.toContain('ID: {viewingSession.id}');
  });
});
