// TFP → staff-chat system cards (2026-07-04, spec ③④ — AV203).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildTfpChatCard, TFP_CARD_KINDS } from '../src/lib/tfpStaffChatNotify.js';
import { buildTreatmentEditUrl } from '../src/lib/customerNavigation.js';

const read = (p) => fs.readFileSync(path.resolve(p), 'utf8');

// V14 — no undefined leaves anywhere in a Firestore-bound doc.
function walkNoUndefined(o, trail = '$') {
  expect(o, trail).not.toBeUndefined();
  if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o)) walkNoUndefined(v, `${trail}.${k}`);
  }
}

describe('③④ buildTfpChatCard (pure)', () => {
  const base = {
    kind: 'tfp-vitals', treatmentId: 'BT-1783150000000', customerId: 'LC-26000123',
    customerName: 'คุณสมหญิง ใจดี', customerHN: 'LC-26000123', branchId: 'BR-1',
  };

  it('C1 vitals card shape — deterministic id, ระบบ identity, snapshots, no doctorName', () => {
    const c = buildTfpChatCard(base);
    expect(c.id).toBe('CHAT-SYS-TFP-BT-1783150000000-vitals');
    expect(c.branchId).toBe('BR-1');
    expect(c.deviceId).toBe('system');
    expect(c.displayName).toBe('ระบบ');
    expect(c.text).toContain('บันทึกซักประวัติเสร็จแล้ว');
    expect(c.system).toMatchObject({
      kind: 'tfp-vitals', treatmentId: 'BT-1783150000000',
      customerId: 'LC-26000123', nameSnapshot: 'คุณสมหญิง ใจดี', hnSnapshot: 'LC-26000123',
    });
    expect('doctorName' in c.system).toBe(false);
    walkNoUndefined(c);
  });

  it('C2 doctor card — violet kind + doctorName from the TFP header select', () => {
    const c = buildTfpChatCard({ ...base, kind: 'tfp-doctor', doctorName: 'นพ.สมชาย รักษาดี' });
    expect(c.id).toBe('CHAT-SYS-TFP-BT-1783150000000-doctor');
    expect(c.text).toContain('แพทย์ลงบันทึกเสร็จแล้ว');
    expect(c.system.kind).toBe('tfp-doctor');
    expect(c.system.doctorName).toBe('นพ.สมชาย รักษาดี');
    walkNoUndefined(c);
  });

  it('C3 deterministic — same treatment+kind → same id (re-save cannot duplicate)', () => {
    expect(buildTfpChatCard(base).id).toBe(buildTfpChatCard(base).id);
  });

  it('C4 invalid input → null (no branchId / no treatmentId / bad kind) — never throws', () => {
    expect(buildTfpChatCard({ ...base, branchId: '' })).toBeNull();     // all-branches view
    expect(buildTfpChatCard({ ...base, treatmentId: '' })).toBeNull();
    expect(buildTfpChatCard({ ...base, kind: 'intake' })).toBeNull();   // server-only kind — client builder refuses
    expect(buildTfpChatCard()).toBeNull();
    expect(TFP_CARD_KINDS).toEqual(['tfp-vitals', 'tfp-doctor']);
  });

  it('C5 adversarial — Thai/emoji names, numeric ids, missing HN → null hnSnapshot (V14-safe)', () => {
    const c = buildTfpChatCard({ kind: 'tfp-vitals', treatmentId: 12345, customerId: 999, customerName: '👑ทดสอบ ยาวๆ', branchId: 'BR-2' });
    expect(c.system.treatmentId).toBe('12345');
    expect(c.system.customerId).toBe('999');
    expect(c.system.hnSnapshot).toBeNull();
    walkNoUndefined(c);
  });
});

describe('③④ TFP wire (source-grep — V104-safe resolved-id pattern)', () => {
  const tfp = read('src/components/TreatmentFormPage.jsx');
  it('W1 card fires ONLY for vitals/doctor saves, after save success, fire-and-forget', () => {
    const m = tfp.match(/saveMode === 'vitals' \|\| saveMode === 'doctor'[\s\S]{0,900}/);
    expect(m).toBeTruthy();
    expect(m[0]).toMatch(/writeTfpChatCard/);
    expect(m[0]).toMatch(/result\?\.treatmentId \|\| treatmentId/); // V36-quater newTid pattern
    expect(m[0]).toMatch(/\.catch\(\(\) => \{\}\)/);
  });
  it('W2 no card write on staff/course saves (single gated INVOCATION)', () => {
    // count actual invocations (writeTfpChatCard({...) — comments/import destructure excluded
    expect((tfp.match(/writeTfpChatCard\(\{/g) || []).length).toBe(1);
  });
});

describe('③④ firestore.rules — narrow tfp-* allowance, intake/followup unforgeable', () => {
  const rules = read('firestore.rules');
  it('RL1 tfp allowlist present with treatmentId/customerId validators', () => {
    expect(rules).toMatch(/system\.get\('kind', ''\) in \['tfp-vitals', 'tfp-doctor'\]/);
    expect(rules).toMatch(/system\.get\('treatmentId', ''\) is string/);
    expect(rules).toMatch(/system\.get\('customerId', ''\) is string/);
  });
  it("RL2 the no-system arm survives (human messages unaffected) + update stays immutable", () => {
    expect(rules).toMatch(/!\('system' in request\.resource\.data\)/);
    const block = rules.slice(rules.indexOf('be_staff_chat_messages'), rules.indexOf('be_recalls'));
    expect(block).toMatch(/allow update: if false/);
  });
  it('RL3 probe #18 registered in Rule B (Probe-Deploy-Probe)', () => {
    const ic = read('.claude/rules/01-iron-clad.md');
    expect(ic).toMatch(/18\. \*\*TFP staff-chat system cards/);
    expect(ic).toMatch(/diag-tfp-chat-card-l2\.mjs/);
  });
});

describe('③④ deep link', () => {
  it('D1 buildTreatmentEditUrl encodes both ids; empty → ""', () => {
    const url = buildTreatmentEditUrl('LC-26000123', 'BT-17 83');
    expect(url).toContain('?backend=1&customer=LC-26000123&treatment=BT-17%2083');
    expect(buildTreatmentEditUrl('', 'BT-1')).toBe('');
    expect(buildTreatmentEditUrl('LC-1', '')).toBe('');
  });
  it('D2 BackendDashboard consumes ?treatment= → setTreatmentFormMode edit (mirror of the opener)', () => {
    const bd = read('src/pages/BackendDashboard.jsx');
    const m = bd.match(/params\.get\('treatment'\)[\s\S]{0,1400}/);
    expect(m).toBeTruthy();
    expect(m[0]).toMatch(/setTreatmentFormMode\(\{/);
    expect(m[0]).toMatch(/mode: 'edit'/);
    expect(m[0]).toMatch(/treatmentId: treatmentParam/);
    expect(m[0]).toMatch(/patientData: c\.patientData/);
  });
});
