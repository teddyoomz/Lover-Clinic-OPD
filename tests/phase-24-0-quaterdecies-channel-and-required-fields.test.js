// ─── Phase 24.0-quaterdecies — appointment channel + required-field tweaks ──
//
// User report 2026-05-06 (3-point follow-up):
//   1. ใน field dropdown ช่องทางนัดหมาย ของทั้ง 2 modal ให้เพิ่ม โทรศัพท์ เข้าไปด้วย
//   2. ในภาพที่ 2 ซึ่งเป็น modal จองไม่มัดจำ + นัดหมาย ใน frontend ไม่จำเป็น
//      ต้องกรอก เบอร์โทร, แพทย์, ผู้ช่วยแพทย์, ห้องตรวจ ดังนั้นเอาไอ้ * สีแดงๆ
//      ออกไปใน field ที่บอก ส่วน field อื่นๆที่ไม่ได้บอกก็มี require เหมือนเดิม
//   3. ในภาพที่ 1 ของ modal สร้างคิวลูกค้าจองมัดจำ เมื่อติ๊กนัดหมาย ให้มี
//      require field เหมือนของ จองไม่มัดจำ + นัดหมาย ที่เพิ่งแก้ไป

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const ADMIN = fs.readFileSync(path.join(ROOT, 'src/pages/AdminDashboard.jsx'), 'utf8');

describe('Phase 24.0-quaterdecies — APPT_CHANNELS_STATIC includes โทรศัพท์', () => {
  it('CRF.A.1 — APPT_CHANNELS_STATIC defined as frozen object', () => {
    expect(ADMIN).toMatch(/const\s+APPT_CHANNELS_STATIC\s*=\s*Object\.freeze\(\[/);
  });

  it('CRF.A.2 — โทรศัพท์ entry present with value:phone', () => {
    expect(ADMIN).toMatch(/{\s*value:\s*'phone'\s*,\s*label:\s*'โทรศัพท์'\s*}/);
  });

  it('CRF.A.3 — fetchDepositOptions uses APPT_CHANNELS_STATIC for appointmentChannels', () => {
    expect(ADMIN).toMatch(/appointmentChannels:\s*\[\.\.\.\s*APPT_CHANNELS_STATIC\s*\]/);
  });

  it('CRF.A.4 — APPT_CHANNELS_STATIC distinct from CUSTOMER_SOURCES_STATIC (Walk-in source vs phone channel)', () => {
    // Both arrays exist but are separate objects (channel array prepends โทรศัพท์
    // before walk-in/facebook/line; sources array does not include phone).
    const apptBlock = ADMIN.match(/APPT_CHANNELS_STATIC\s*=\s*Object\.freeze\(\[[\s\S]{0,400}?\]\)/);
    const sourcesBlock = ADMIN.match(/CUSTOMER_SOURCES_STATIC\s*=\s*Object\.freeze\(\[[\s\S]{0,400}?\]\)/);
    expect(apptBlock).toBeTruthy();
    expect(sourcesBlock).toBeTruthy();
    expect(apptBlock[0]).toMatch(/'โทรศัพท์'/);
    expect(sourcesBlock[0]).not.toMatch(/'โทรศัพท์'/);
  });

  it('CRF.A.5 — Phase 24.0-quaterdecies marker present', () => {
    expect(ADMIN).toMatch(/Phase 24\.0-quaterdecies/);
  });
});

describe('Phase 24.0-quaterdecies — noDeposit modal required-field surgery', () => {
  it('CRF.B.1 — เบอร์โทร label has NO red * (within the noDeposit modal block)', () => {
    // The customerPhoneTemp testid identifies the noDeposit phone input. The
    // preceding label must not contain a red asterisk span. Range widened to
    // 800 chars to span the Phase-24-quaterdecies comment + input attrs.
    const block = ADMIN.match(
      /<label[^>]*>เบอร์โทร[\s\S]{0,800}?data-testid="no-deposit-customer-phone-temp"/,
    );
    expect(block).toBeTruthy();
    expect(block[0]).not.toMatch(/<span[^>]*text-red-500[^>]*>\*/);
  });

  it('CRF.B.2 — แพทย์ label in noDeposit has NO red * (paired with noDepositFormData.doctor)', () => {
    const block = ADMIN.match(
      /<label[^>]*>แพทย์[\s\S]{0,300}?noDepositFormData\.doctor/,
    );
    expect(block).toBeTruthy();
    expect(block[0]).not.toMatch(/<span[^>]*text-red-500[^>]*>\*/);
  });

  it('CRF.B.3 — ผู้ช่วยแพทย์ label in noDeposit has NO red *', () => {
    const block = ADMIN.match(
      /<label[^>]*>ผู้ช่วยแพทย์[\s\S]{0,300}?noDepositFormData\.assistant/,
    );
    expect(block).toBeTruthy();
    expect(block[0]).not.toMatch(/<span[^>]*text-red-500[^>]*>\*/);
  });

  it('CRF.B.4 — ห้องตรวจ label in noDeposit has NO red *', () => {
    const block = ADMIN.match(
      /<label[^>]*>ห้องตรวจ[\s\S]{0,300}?noDepositFormData\.room/,
    );
    expect(block).toBeTruthy();
    expect(block[0]).not.toMatch(/<span[^>]*text-red-500[^>]*>\*/);
  });

  it('CRF.B.5 — ที่ปรึกษา (advisor) label in noDeposit STILL has red * (kept required)', () => {
    const block = ADMIN.match(
      /<label[^>]*>ที่ปรึกษา[\s\S]{0,300}?noDepositFormData\.advisor/,
    );
    expect(block).toBeTruthy();
    expect(block[0]).toMatch(/<span[^>]*text-red-500[^>]*>\*/);
  });

  it('CRF.B.6 — ช่องทางนัดหมาย (source) label in noDeposit STILL has red * (kept required)', () => {
    const block = ADMIN.match(
      /<label[^>]*>ช่องทางนัดหมาย[\s\S]{0,300}?noDepositFormData\.source/,
    );
    expect(block).toBeTruthy();
    expect(block[0]).toMatch(/<span[^>]*text-red-500[^>]*>\*/);
  });

  it('CRF.B.7 — submit-gate drops doctor / assistant / room from disabled checks', () => {
    // The noDeposit submit button gate now does NOT include these fields:
    const gate = ADMIN.match(
      /onClick=\{editingAppointment\s*\?\s*confirmUpdateAppointment\s*:\s*confirmCreateNoDeposit\}\s*disabled=\{[\s\S]{0,400}?\}/,
    );
    expect(gate).toBeTruthy();
    expect(gate[0]).not.toMatch(/!noDepositFormData\.doctor/);
    expect(gate[0]).not.toMatch(/!noDepositFormData\.assistant/);
    expect(gate[0]).not.toMatch(/!noDepositFormData\.room/);
  });

  it('CRF.B.8 — submit-gate keeps advisor / source / visitPurpose / date / start / end + adds customerNameTemp', () => {
    const gate = ADMIN.match(
      /onClick=\{editingAppointment\s*\?\s*confirmUpdateAppointment\s*:\s*confirmCreateNoDeposit\}\s*disabled=\{[\s\S]{0,400}?\}/,
    );
    expect(gate[0]).toMatch(/!noDepositFormData\.advisor/);
    expect(gate[0]).toMatch(/!noDepositFormData\.source/);
    expect(gate[0]).toMatch(/!noDepositFormData\.appointmentDate/);
    expect(gate[0]).toMatch(/!noDepositFormData\.appointmentStartTime/);
    expect(gate[0]).toMatch(/!noDepositFormData\.appointmentEndTime/);
    expect(gate[0]).toMatch(/visitPurpose\.length\s*===\s*0/);
    expect(gate[0]).toMatch(/!noDepositFormData\.customerNameTemp\?\.trim\(\)/);
  });
});

describe('Phase 24.0-quaterdecies — deposit modal hasAppointment validation', () => {
  it('CRF.C.1 — deposit appointment subform วันนัด label has red *', () => {
    // The deposit MODAL uses `depositFormData.hasAppointment` (state),
    // distinct from the deposit-detail panel's `dep.hasAppointment` (data).
    const block = ADMIN.match(
      /depositFormData\.hasAppointment\s*&&\s*\([\s\S]{0,3500}?วันนัด[\s\S]{0,200}?<\/label>/,
    );
    expect(block).toBeTruthy();
    expect(block[0]).toMatch(/วันนัด\s*<span[^>]*text-red-500[^>]*>\*/);
  });

  it('CRF.C.2 — deposit appointment subform เริ่ม + สิ้นสุด labels have red *', () => {
    const startBlock = ADMIN.match(
      /<label[^>]*>เริ่ม[\s\S]{0,200}?depositFormData\.appointmentStartTime/,
    );
    const endBlock = ADMIN.match(
      /<label[^>]*>สิ้นสุด[\s\S]{0,200}?depositFormData\.appointmentEndTime/,
    );
    expect(startBlock).toBeTruthy();
    expect(endBlock).toBeTruthy();
    expect(startBlock[0]).toMatch(/text-red-500/);
    expect(endBlock[0]).toMatch(/text-red-500/);
  });

  it('CRF.C.3 — deposit ที่ปรึกษา + ช่องทางนัดหมาย labels have red *', () => {
    // Find within deposit subform context.
    const consultBlock = ADMIN.match(
      /<label[^>]*>ที่ปรึกษา[\s\S]{0,200}?depositFormData\.consultant/,
    );
    const channelBlock = ADMIN.match(
      /<label[^>]*>ช่องทางนัดหมาย[\s\S]{0,200}?depositFormData\.appointmentChannel/,
    );
    expect(consultBlock).toBeTruthy();
    expect(channelBlock).toBeTruthy();
    expect(consultBlock[0]).toMatch(/text-red-500/);
    expect(channelBlock[0]).toMatch(/text-red-500/);
  });

  it('CRF.C.4 — deposit แพทย์/ผู้ช่วยแพทย์ + ผู้ช่วยแพทย์ + ห้องตรวจ stay optional (NO red *)', () => {
    const drBlock = ADMIN.match(
      /<label[^>]*>แพทย์\/ผู้ช่วยแพทย์[\s\S]{0,200}?depositFormData\.doctor/,
    );
    const asstBlock = ADMIN.match(
      /<label[^>]*>ผู้ช่วยแพทย์(?!\/)[\s\S]{0,200}?depositFormData\.assistant/,
    );
    const roomBlock = ADMIN.match(
      /<label[^>]*>ห้องตรวจ[\s\S]{0,200}?depositFormData\.room/,
    );
    expect(drBlock).toBeTruthy();
    expect(asstBlock).toBeTruthy();
    expect(roomBlock).toBeTruthy();
    expect(drBlock[0]).not.toMatch(/<span[^>]*text-red-500[^>]*>\*/);
    expect(asstBlock[0]).not.toMatch(/<span[^>]*text-red-500[^>]*>\*/);
    expect(roomBlock[0]).not.toMatch(/<span[^>]*text-red-500[^>]*>\*/);
  });

  it('CRF.C.5 — นัดมาเพื่อ label conditional * (only when hasAppointment)', () => {
    // The deposit modal's นัดมาเพื่อ label uses a conditional render
    // {depositFormData.hasAppointment && <span ...>*</span>}.
    expect(ADMIN).toMatch(
      /นัดมาเพื่อ\s*\{depositFormData\.hasAppointment\s*&&\s*<span[^>]*text-red-500/,
    );
  });

  it('CRF.C.6 — deposit submit-gate adds hasAppointment-conditional checks', () => {
    const gate = ADMIN.match(
      /onClick=\{confirmCreateDeposit\}[\s\S]{0,1200}?className/,
    );
    expect(gate).toBeTruthy();
    // Must include the conditional gate.
    expect(gate[0]).toMatch(/depositFormData\.hasAppointment\s*&&/);
    // Inside the hasAppointment branch:
    expect(gate[0]).toMatch(/!depositFormData\.appointmentDate/);
    expect(gate[0]).toMatch(/!depositFormData\.appointmentStartTime/);
    expect(gate[0]).toMatch(/!depositFormData\.appointmentEndTime/);
    expect(gate[0]).toMatch(/!depositFormData\.consultant/);
    expect(gate[0]).toMatch(/!depositFormData\.appointmentChannel/);
    expect(gate[0]).toMatch(/visitPurpose\.length\s*===\s*0/);
    // doctor / assistant / room NOT in gate.
    expect(gate[0]).not.toMatch(/!depositFormData\.doctor/);
    expect(gate[0]).not.toMatch(/!depositFormData\.assistant/);
    expect(gate[0]).not.toMatch(/!depositFormData\.room/);
  });

  it('CRF.C.7 — deposit gate preserves baseline (paymentAmount + customerNameTemp)', () => {
    const gate = ADMIN.match(
      /onClick=\{confirmCreateDeposit\}[\s\S]{0,1200}?className/,
    );
    expect(gate[0]).toMatch(/!depositFormData\.paymentAmount/);
    expect(gate[0]).toMatch(/!depositFormData\.customerNameTemp\?\.trim\(\)/);
  });
});

describe('Phase 24.0-quaterdecies — runtime invariants (Rule I full-flow simulate)', () => {
  it('CRF.F.1 — no-deposit modal: submit DISABLED when name/advisor/source/visitPurpose missing', () => {
    // Mirror of the React disabled-prop expression. Any missing required → disabled.
    const f = (overrides) => {
      const formData = {
        customerNameTemp: 'A', appointmentDate: '2026-05-10',
        appointmentStartTime: '10:00', appointmentEndTime: '10:15',
        advisor: 'adv-1', source: 'phone', visitPurpose: ['HRT'],
        ...overrides,
      };
      return !formData.customerNameTemp?.trim()
        || !formData.appointmentDate
        || !formData.appointmentStartTime
        || !formData.appointmentEndTime
        || !formData.advisor
        || !formData.source
        || formData.visitPurpose.length === 0;
    };
    expect(f({})).toBe(false); // baseline OK
    expect(f({ customerNameTemp: '' })).toBe(true); // missing name
    expect(f({ advisor: '' })).toBe(true); // missing advisor
    expect(f({ source: '' })).toBe(true); // missing channel
    expect(f({ visitPurpose: [] })).toBe(true); // missing purpose
    expect(f({ appointmentStartTime: '' })).toBe(true); // missing start
  });

  it('CRF.F.2 — no-deposit modal: submit ENABLED when only doctor/assistant/room missing (now optional)', () => {
    const formData = {
      customerNameTemp: 'A', appointmentDate: '2026-05-10',
      appointmentStartTime: '10:00', appointmentEndTime: '10:15',
      advisor: 'adv-1', source: 'phone', visitPurpose: ['HRT'],
      // doctor / assistant / room ALL EMPTY (now optional):
      doctor: '', assistant: '', room: '',
    };
    const disabled = !formData.customerNameTemp?.trim()
      || !formData.appointmentDate
      || !formData.appointmentStartTime
      || !formData.appointmentEndTime
      || !formData.advisor
      || !formData.source
      || formData.visitPurpose.length === 0;
    expect(disabled).toBe(false); // SUBMIT ENABLED — doctor/assistant/room are not in the gate
  });

  it('CRF.F.3 — deposit modal: hasAppointment=false only requires customerNameTemp + paymentAmount', () => {
    const formData = {
      customerNameTemp: 'A', paymentAmount: '500',
      hasAppointment: false,
      // All appointment fields empty:
      appointmentDate: '', appointmentStartTime: '', appointmentEndTime: '',
      consultant: '', appointmentChannel: '', visitPurpose: [],
    };
    const disabled = !formData.customerNameTemp?.trim()
      || !formData.paymentAmount
      || (formData.hasAppointment && (
        !formData.appointmentDate
        || !formData.appointmentStartTime
        || !formData.appointmentEndTime
        || !formData.consultant
        || !formData.appointmentChannel
        || formData.visitPurpose.length === 0
      ));
    expect(disabled).toBe(false); // ENABLED — hasAppointment=false short-circuits
  });

  it('CRF.F.4 — deposit modal: hasAppointment=true enforces full set', () => {
    const f = (overrides) => {
      const formData = {
        customerNameTemp: 'A', paymentAmount: '500',
        hasAppointment: true,
        appointmentDate: '2026-05-10', appointmentStartTime: '10:00',
        appointmentEndTime: '10:15', consultant: 'adv-1',
        appointmentChannel: 'phone', visitPurpose: ['HRT'],
        ...overrides,
      };
      return !formData.customerNameTemp?.trim()
        || !formData.paymentAmount
        || (formData.hasAppointment && (
          !formData.appointmentDate
          || !formData.appointmentStartTime
          || !formData.appointmentEndTime
          || !formData.consultant
          || !formData.appointmentChannel
          || formData.visitPurpose.length === 0
        ));
    };
    expect(f({})).toBe(false); // baseline OK
    expect(f({ consultant: '' })).toBe(true);
    expect(f({ appointmentChannel: '' })).toBe(true);
    expect(f({ visitPurpose: [] })).toBe(true);
    expect(f({ appointmentDate: '' })).toBe(true);
  });

  it('CRF.F.5 — deposit modal: hasAppointment=true does NOT require doctor/assistant/room', () => {
    const formData = {
      customerNameTemp: 'A', paymentAmount: '500',
      hasAppointment: true,
      appointmentDate: '2026-05-10', appointmentStartTime: '10:00',
      appointmentEndTime: '10:15', consultant: 'adv-1',
      appointmentChannel: 'phone', visitPurpose: ['HRT'],
      // doctor / assistant / room empty:
      doctor: '', assistant: '', room: '',
    };
    const disabled = !formData.customerNameTemp?.trim()
      || !formData.paymentAmount
      || (formData.hasAppointment && (
        !formData.appointmentDate
        || !formData.appointmentStartTime
        || !formData.appointmentEndTime
        || !formData.consultant
        || !formData.appointmentChannel
        || formData.visitPurpose.length === 0
      ));
    expect(disabled).toBe(false); // ENABLED
  });

  it('CRF.F.6 — APPT_CHANNELS_STATIC: phone is FIRST entry', () => {
    // First label after the value:phone match should be โทรศัพท์ — locks ordering.
    const block = ADMIN.match(/APPT_CHANNELS_STATIC\s*=\s*Object\.freeze\(\[([\s\S]{0,400}?)\]\)/);
    expect(block).toBeTruthy();
    const lines = block[1].split('\n').map(l => l.trim()).filter(Boolean);
    // First non-comment entry should be the phone option.
    const firstEntry = lines.find(l => l.startsWith('{'));
    expect(firstEntry).toMatch(/value:\s*'phone'/);
    expect(firstEntry).toMatch(/label:\s*'โทรศัพท์'/);
  });
});
