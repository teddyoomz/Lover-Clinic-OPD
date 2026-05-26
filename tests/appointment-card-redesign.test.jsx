// Appointment Card Redesign (2026-05-26 EOD+6) — cosmetic-shell source-grep guards.
//
// Spec:  docs/superpowers/specs/2026-05-26-appointment-card-redesign-design.html
// Plan:  docs/superpowers/plans/2026-05-26-appointment-card-redesign.html
//
// Scope: Q1 band layout · Q2 theme-matched OPD pills · Q3 Editorial Ember ·
//        Q4 stepper untouched (re-position only) · Q5 remove "OPD lifecycle"
//        header · Q6 rename save label บันทึกลง OPD → บันทึกเข้าระบบ.
//
// COSMETIC-SHELL INVARIANT: every data-testid / handler / conditional preserved;
// only classNames + the 2 sanctioned labels change. These grep tests lock that.

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const read = (p) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');
// Strip full-line // comments so "not present" greps target rendered code, not
// the component's purpose-description / historical user-directive quotes.
const codeOnly = (p) => read(p).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const STYLES = 'src/components/admin/_apptHubStyles.js';

describe('Card redesign — Task 1: OPD_PILL tokens', () => {
  it('T1.1 exports OPD_PILL with blue/emerald/wait/save', () => {
    const s = read(STYLES);
    expect(s).toMatch(/export const OPD_PILL\b/);
    for (const k of ['blue', 'emerald', 'wait', 'save']) {
      expect(s, `OPD_PILL.${k}`).toMatch(new RegExp(`\\b${k}\\s*:`));
    }
  });

  it('T1.2 each token has a LIGHT base + a dark: override (theme-matched, not dark-only)', () => {
    const s = read(STYLES);
    // light bases present (the fix — these were missing, causing green-on-green)
    expect(s).toMatch(/bg-blue-100/);
    expect(s).toMatch(/bg-emerald-100/);
    expect(s).toMatch(/bg-slate-100/);
    expect(s).toMatch(/bg-rose-100/);
    // dark overrides present (mirror the prior dark-only values, now as dark: variants)
    expect(s).toMatch(/dark:bg-blue-900\/30/);
    expect(s).toMatch(/dark:bg-emerald-900\/30/);
    expect(s).toMatch(/dark:bg-slate-800\/50/);
    expect(s).toMatch(/dark:bg-red-950\/40/);
  });
});

describe('Card redesign — Task 2: OpdLifecycleRow theme-matched + label changes', () => {
  const ROW = 'src/components/admin/OpdLifecycleRow.jsx';

  it('T2.1 imports OPD_PILL from _apptHubStyles', () => {
    expect(read(ROW)).toMatch(/import\s*\{[^}]*OPD_PILL[^}]*\}\s*from\s*'\.\/_apptHubStyles\.js'/);
  });

  it('T2.2 NO unconditional dark-only semantic classes remain (the green-on-green bug)', () => {
    const s = codeOnly(ROW);
    expect(s).not.toMatch(/bg-emerald-900\/30/);
    expect(s).not.toMatch(/bg-blue-900\/30/);
    expect(s).not.toMatch(/bg-slate-800\/50/);
    expect(s).not.toMatch(/bg-red-950\/40/);
  });

  it('T2.3 Q5 — rendered "OPD lifecycle" header label removed (comments may still describe the component)', () => {
    expect(codeOnly(ROW)).not.toMatch(/OPD lifecycle/i);
  });

  it('T2.4 Q6 — save button reads "บันทึกเข้าระบบ", not "บันทึกลง OPD" (rendered label)', () => {
    expect(read(ROW)).toMatch(/บันทึกเข้าระบบ/);          // present in JSX
    expect(codeOnly(ROW)).not.toMatch(/บันทึกลง OPD/);    // absent in rendered code (historical quote in comments OK)
  });

  it('T2.5 every data-testid + data-attr preserved', () => {
    const s = read(ROW);
    for (const id of ['opd-lifecycle-row', 'opd-link-send-btn', 'opd-link-view-btn',
                      'opd-save-btn-wait', 'opd-view-btn', 'opd-save-btn-active']) {
      expect(s, id).toContain(`data-testid="${id}"`);
    }
    expect(s).toMatch(/data-opd-state=/);
    expect(s).toMatch(/data-opd-disabled-reason=/);
  });

  it('T2.6 all handler props still wired', () => {
    const s = read(ROW);
    for (const h of ['onSendLink', 'onViewLink', 'onSaveOpd', 'onViewOpd']) {
      expect(s, h).toMatch(new RegExp(`onClick=\\{${h}\\}`));
    }
  });
});

describe('Card redesign — Task 3: AppointmentHubRowCard cosmetic-shell invariant', () => {
  const CARD = 'src/components/admin/AppointmentHubRowCard.jsx';
  const TESTIDS = [
    'appt-hub-row', 'row-accent-bar', 'row-hn', 'row-name', 'opd-ready-to-save-chip',
    'row-finance-chips', 'row-chip-wallet', 'row-chip-deposit', 'row-chip-outstanding', 'row-chip-lifetime',
    'row-date-full', 'row-time-emphasis', 'row-type-chip', 'row-deposit-chip', 'row-missed-chip',
    'row-purpose-block', 'row-purpose', 'row-status', 'row-action-mark-complete', 'row-action-unmark-complete',
    'row-action-line', 'row-action-edit-treatment', 'row-action-edit', 'row-action-cancel',
    'row-action-create-treatment', 'row-action-confirm',
  ];

  it('T3.1 every data-testid preserved', () => {
    const s = read(CARD);
    for (const id of TESTIDS) expect(s, id).toContain(`data-testid="${id}"`);
  });

  it('T3.2 stepper + OpdLifecycleRow children still rendered (re-parented, not removed)', () => {
    const s = read(CARD);
    expect(s).toMatch(/<AppointmentOpdStepperRow\b/);
    expect(s).toMatch(/<OpdLifecycleRow\b/);
  });

  it('T3.3 every handler prop still wired through', () => {
    const s = read(CARD);
    for (const h of ['onConfirm', 'onEdit', 'onCancel', 'onCreateTreatment', 'onEditTreatment',
                     'onOpenLine', 'onMarkServiceComplete', 'onUnmarkServiceComplete']) {
      expect(s, h).toMatch(new RegExp(h));
    }
  });

  it('T3.4 patient name stays sky (never red) — Thai-culture iron-clad', () => {
    const s = read(CARD);
    expect(s).toMatch(/data-testid="row-name"[\s\S]{0,500}?text-sky-700/);
    expect(s).not.toMatch(/data-testid="row-name"[\s\S]{0,200}?text-red/);
  });

  it('T3.5 no IIFE-in-JSX (Vite OXC crash risk) introduced by the re-layout', () => {
    // {(() => …)()} inside JSX crashes the Vite OXC parser (rule 03-stack).
    // The todayBangkok IIFE is in the logic block (= (() => …)()), not JSX.
    expect(codeOnly(CARD)).not.toMatch(/\{\s*\(\(\)\s*=>/);
  });
});

describe('Card redesign — Task 5: AV136 invariant documented', () => {
  it('T5.1 AV136 entry present in audit-anti-vibe-code SKILL.md', () => {
    const s = read('.agents/skills/audit-anti-vibe-code/SKILL.md');
    expect(s).toMatch(/### AV136 —/);
    expect(s).toMatch(/OPD_PILL/);
    expect(s).toMatch(/OFF-LIMITS/);
  });
});
