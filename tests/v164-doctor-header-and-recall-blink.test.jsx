// V164 (2026-06-29) — doctor-only นัดหมาย header + Recall-วันนี้ pill blink.
// Spec: docs/superpowers/specs/2026-06-29-doctor-header-and-recall-blink-design.html
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import fs from 'fs';
import path from 'path';
import AppointmentHubDoctorCards from '../src/components/admin/AppointmentHubDoctorCards.jsx';
import { RecallTogglePill } from '../src/components/backend/recall/RecallTogglePill.jsx';

const recallHolder = vi.hoisted(() => ({ recalls: [] }));
vi.mock('../src/hooks/useRecallListener.js', () => ({
  useRecallListener: () => ({ recalls: recallHolder.recalls }),
}));

const classes = (el) => el.className.split(/\s+/).filter(Boolean);
const read = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('V164 D — doctor-only header (AppointmentHubDoctorCards)', () => {
  it('D1 shows doctor chips with name + hours', () => {
    render(
      <AppointmentHubDoctorCards
        tab="today"
        doctorShifts={[{ name: 'นพ.สมชาย', startTime: '09:00', endTime: '17:00' }]}
      />
    );
    const chip = screen.getByTestId('appt-hub-doctor-card');
    expect(chip).toHaveTextContent('นพ.สมชาย');
    expect(chip).toHaveTextContent('09:00-17:00');
    expect(screen.queryByTestId('appt-hub-doctor-cards-empty')).toBeNull();
  });

  it('D2 no doctor → "ไม่มีแพทย์เข้า", never "ไม่มีพนักงานเข้างาน"', () => {
    render(<AppointmentHubDoctorCards tab="today" doctorShifts={[]} />);
    expect(screen.getByTestId('appt-hub-doctor-cards-empty')).toHaveTextContent('ไม่มีแพทย์เข้า');
    expect(screen.queryByText(/ไม่มีพนักงานเข้างาน/)).toBeNull();
  });

  it('D3 (Rule I / Q1=A) assistant present but no doctor → still "ไม่มีแพทย์เข้า", no assistant chip', () => {
    render(
      <AppointmentHubDoctorCards
        tab="today"
        doctorShifts={[]}
        assistantShifts={[{ name: 'ผู้ช่วยเอ', startTime: '09:00', endTime: '17:00' }]}
      />
    );
    expect(screen.getByTestId('appt-hub-doctor-cards-empty')).toHaveTextContent('ไม่มีแพทย์เข้า');
    expect(screen.queryByTestId('appt-hub-assistant-card')).toBeNull();
    expect(screen.queryByText(/ผู้ช่วยเอ/)).toBeNull();
  });

  it('D4 non today/tomorrow tab → renders nothing', () => {
    const { container } = render(
      <AppointmentHubDoctorCards
        tab="upcoming"
        doctorShifts={[{ name: 'x', startTime: '09:00', endTime: '10:00' }]}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('V164 R — recall pill blink (RecallTogglePill)', () => {
  beforeEach(() => { recallHolder.recalls = []; });

  it('R1 count>0 + inactive → recall-pill-blink (not -active)', () => {
    recallHolder.recalls = [{ status: 'pending', recallDate: '2020-01-01' }];
    render(<RecallTogglePill active={false} onClick={() => {}} />);
    const b = classes(screen.getByTestId('appt-view-toggle-recall'));
    expect(b).toContain('recall-pill-blink');
    expect(b).not.toContain('recall-pill-blink-active');
  });

  it('R2 count>0 + active → recall-pill-blink-active (not plain blink)', () => {
    recallHolder.recalls = [{ status: 'pending', recallDate: '2020-01-01' }];
    render(<RecallTogglePill active={true} onClick={() => {}} />);
    const b = classes(screen.getByTestId('appt-view-toggle-recall'));
    expect(b).toContain('recall-pill-blink-active');
    expect(b).not.toContain('recall-pill-blink');
  });

  it('R3 count===0 (all done/closed) → no blink class', () => {
    recallHolder.recalls = [
      { status: 'done', recallDate: '2020-01-01' },
      { status: 'closed-no-answer', recallDate: '2020-01-01' },
    ];
    render(<RecallTogglePill active={false} onClick={() => {}} />);
    const b = classes(screen.getByTestId('appt-view-toggle-recall'));
    expect(b).not.toContain('recall-pill-blink');
    expect(b).not.toContain('recall-pill-blink-active');
  });

  it('R4 (adversarial) future-dated pending (recallDate > today) → not counted → no blink', () => {
    recallHolder.recalls = [{ status: 'pending', recallDate: '2999-12-31' }];
    render(<RecallTogglePill active={false} onClick={() => {}} />);
    const b = classes(screen.getByTestId('appt-view-toggle-recall'));
    expect(b).not.toContain('recall-pill-blink');
    expect(b).not.toContain('recall-pill-blink-active');
  });
});

describe('V164 SG — source-grep regression', () => {
  it('SG1 doctor card: no "ไม่มีพนักงานเข้างาน", has "ไม่มีแพทย์เข้า", no assistant chip', () => {
    const s = read('src/components/admin/AppointmentHubDoctorCards.jsx');
    expect(s).not.toMatch(/ไม่มีพนักงานเข้างาน/);
    expect(s).toMatch(/ไม่มีแพทย์เข้า/);
    expect(s).not.toMatch(/appt-hub-assistant-card/);
  });

  it('SG2 RecallTogglePill: blink derived from count', () => {
    const s = read('src/components/backend/recall/RecallTogglePill.jsx');
    expect(s).toMatch(/recall-pill-blink-active/);
    expect(s).toMatch(/const blink = count > 0/);
  });

  it('SG3 index.css: keyframes + reduced-motion override', () => {
    const s = read('src/index.css');
    expect(s).toMatch(/@keyframes recall-pill-blink\b/);
    expect(s).toMatch(/@keyframes recall-pill-blink-active/);
    expect(s).toMatch(/prefers-reduced-motion[\s\S]{0,400}recall-pill-blink/);
  });

  it('SG4 AppointmentHubView: no assistantShifts remaining', () => {
    const s = read('src/components/admin/AppointmentHubView.jsx');
    expect(s).not.toMatch(/assistantShifts/);
  });
});
