/**
 * Phase 29.23-bis — source-grep regression locks for AdminDashboard changes.
 *
 * Covers:
 *   - Issue 4: 3 ProClinic-mentioning tooltip strings on the OPD-save button
 *     replaced with neutral wording (ProClinic dev-only stack stripped per V50;
 *     we write to be_* directly now)
 *   - Issue 5: _maybeOpenWalkInModal gate on linkedAppointmentId / linkedDepositId
 *     (entries pushed from deposit-booking or no-deposit-booking already have an
 *     appointment; the appointment-create modal must not pop for them)
 *
 * User report (verbatim):
 *   - Issue 4: "เปลี่ยนชื่อปุ่ม บันทึกลง Proclinic ... ทั้งหมดใน Frontend
 *     ให้ไม่ใช้คำว่า Proclinic เพราะเราบันทึกลง be ของเราโดยตรงแล้ว"
 *   - Issue 5: "หากมาจากหน้า จองมัดจำ หรือ จองไม่มัดจำ ... เมื่อกดบันทึกลง OPD
 *     ในหน้า คิวหน้า Clinic จะไม่ต้องขึ้น modal มาให้สร้างนัดหมายอีก"
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const SRC = readFileSync('src/pages/AdminDashboard.jsx', 'utf-8');

describe('Phase 29.23-bis SG-A — OPD-save button tooltips no longer mention ProClinic', () => {
  // Anchor directly on the chained-ternary `title={isDone ? '...' : isPending
  // ? '...' : isFailed ? \`...\` : '...'}` attribute. There is exactly one such
  // pattern in AdminDashboard.jsx (the renderOpdButton tooltip). Matching the
  // attribute body avoids navigating the surrounding function block (which has
  // many `}` characters in JSX templates).
  const titleAttr = SRC.match(/title=\{isDone\s*\?[^}]+\}/);

  it('SG-A.1 — renderOpdButton title attribute exists', () => {
    expect(titleAttr).toBeTruthy();
  });

  it('SG-A.2 — "บันทึกลง OPD แล้ว" replaces "บันทึกลง ProClinic แล้ว"', () => {
    expect(titleAttr[0]).toContain('บันทึกลง OPD แล้ว');
    expect(titleAttr[0]).not.toContain('บันทึกลง ProClinic แล้ว');
    expect(titleAttr[0]).not.toContain('บันทึกลง Proclinic แล้ว');
  });

  it('SG-A.3 — "กำลังบันทึกข้อมูล" replaces "กำลังส่งข้อมูลไป ProClinic"', () => {
    expect(titleAttr[0]).toMatch(/กำลังบันทึก/);
    expect(titleAttr[0]).not.toContain('กำลังส่งข้อมูลไป ProClinic');
  });

  it('SG-A.4 — "บันทึกลง OPD" default tooltip replaces "ส่งข้อมูลบันทึกลง ProClinic"', () => {
    // Default-hover variant (else branch of the ternary)
    expect(titleAttr[0]).toContain('บันทึกลง OPD');
    expect(titleAttr[0]).not.toContain('ส่งข้อมูลบันทึกลง ProClinic');
  });

  it('SG-A.5 — title attribute has zero "ProClinic" / "Proclinic" mentions', () => {
    expect(titleAttr[0]).not.toMatch(/ProClinic/i);
    expect(titleAttr[0]).not.toMatch(/Proclinic/i);
  });
});

describe('Phase 29.23-bis SG-B — _maybeOpenWalkInModal gates on existing booking links', () => {
  // Locate the _maybeOpenWalkInModal helper block.
  // Anchor: helper declaration through the inner setWalkInModal call close
  // `});`. This captures everything inside the helper without needing to
  // navigate past the multi-line Thai marker comment to the outer `};` close
  // (which is harder to anchor cleanly with non-greedy whitespace).
  const walkInGateBlock = SRC.match(
    /const\s+_maybeOpenWalkInModal\s*=[\s\S]+?setWalkInModal\(\{[\s\S]+?\}\);/
  );

  it('SG-B.1 — _maybeOpenWalkInModal helper exists', () => {
    expect(walkInGateBlock).toBeTruthy();
  });

  it('SG-B.2 — gates on session.linkedAppointmentId (no-deposit + walk-in→appt path)', () => {
    expect(walkInGateBlock[0]).toMatch(/session\??\.linkedAppointmentId/);
  });

  it('SG-B.3 — gates on session.linkedDepositId (deposit-booking path)', () => {
    expect(walkInGateBlock[0]).toMatch(/session\??\.linkedDepositId/);
  });

  it('SG-B.4 — gate is an early-return (returns before setWalkInModal fires)', () => {
    // The early-return must appear BEFORE the setWalkInModal call.
    const linkedGateIdx = walkInGateBlock[0].search(/if\s*\(\s*session\??\.linkedAppointmentId\s*\|\|\s*session\??\.linkedDepositId\s*\)\s*return/);
    const setModalIdx = walkInGateBlock[0].indexOf('setWalkInModal');
    expect(linkedGateIdx).toBeGreaterThanOrEqual(0);
    expect(setModalIdx).toBeGreaterThan(linkedGateIdx);
  });

  it('SG-B.5 — preserves existing adminMode === "dashboard" gate (no regression)', () => {
    expect(walkInGateBlock[0]).toMatch(/adminMode\s*!==\s*'dashboard'/);
  });

  it('SG-B.6 — preserves existing customerId truthy gate (no regression)', () => {
    expect(walkInGateBlock[0]).toMatch(/if\s*\(\s*!\s*customerId\s*\)\s*return/);
  });

  it('SG-B.7 — Phase 29.23-bis marker comment present (institutional memory)', () => {
    expect(walkInGateBlock[0]).toMatch(/29\.23-bis/);
  });
});
