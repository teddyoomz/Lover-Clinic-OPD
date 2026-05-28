// V127 — appointment hover-peek: hook unit (H), RTL body/peek (F), source-grep (SG).
import { renderHook, act, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import useApptHoverPeek from '../src/hooks/useApptHoverPeek.js';

const mouseEvt = (over = {}) => ({
  pointerType: 'mouse',
  currentTarget: { getBoundingClientRect: () => ({ left: 10, top: 20, right: 110, bottom: 60, width: 100, height: 40 }) },
  ...over,
});

describe('V127 useApptHoverPeek — desktop-only hover-intent', () => {
  it('H1: mouse enter (after delay) opens peek with appt + rect; leave closes', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useApptHoverPeek({ openDelay: 150, closeGrace: 80 }));
    const appt = { appointmentId: 'A1' };
    act(() => { result.current.getHoverProps(appt).onPointerEnter(mouseEvt()); });
    act(() => { vi.advanceTimersByTime(150); });
    expect(result.current.peek?.appt).toBe(appt);
    expect(result.current.peek?.rect.left).toBe(10);
    act(() => { result.current.getHoverProps(appt).onPointerLeave({ pointerType: 'mouse' }); vi.advanceTimersByTime(80); });
    expect(result.current.peek).toBe(null);
    vi.useRealTimers();
  });

  it('H2: touch pointer never opens the peek', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useApptHoverPeek());
    act(() => {
      result.current.getHoverProps({ appointmentId: 'A1' }).onPointerEnter(mouseEvt({ pointerType: 'touch' }));
      vi.advanceTimersByTime(500);
    });
    expect(result.current.peek).toBe(null);
    vi.useRealTimers();
  });

  it('H3: closePeek clears immediately', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useApptHoverPeek());
    act(() => { result.current.getHoverProps({ id: 'x' }).onPointerEnter(mouseEvt()); vi.advanceTimersByTime(150); });
    expect(result.current.peek).not.toBe(null);
    act(() => { result.current.closePeek(); });
    expect(result.current.peek).toBe(null);
    vi.useRealTimers();
  });
});

const APPT = {
  appointmentId: 'A1', customerName: 'นาย ประหยัด เกตุดี', customerHN: '0188',
  customerPhone: '081-234-5678',
  startTime: '16:00', endTime: '16:30', doctorName: 'นพ.สมชาย',
  appointmentTo: 'ช็อคเวฟ6/6', status: 'confirmed', appointmentType: 'no-deposit-booking',
};

describe('V127 AppointmentDetailBody — shared modal/peek field block', () => {
  it('F1: peek variant shows name/meta/service/doctor/status + click-hint; phone plain (not a link)', async () => {
    const { default: AppointmentDetailBody } = await import('../src/components/backend/AppointmentDetailBody.jsx');
    render(<AppointmentDetailBody appt={APPT} roomName="ห้องช็อคเวฟ" doctorMap={{}} variant="peek" />);
    expect(screen.getByTestId('appt-detail-name')).toHaveTextContent('ประหยัด');
    expect(screen.getByTestId('appt-detail-meta')).toHaveTextContent('0188');
    expect(screen.getByTestId('appt-detail-service')).toHaveTextContent('ช็อคเวฟ');
    expect(screen.getByTestId('appt-detail-doctor')).toHaveTextContent('สมชาย');
    expect(screen.getByTestId('appt-detail-status')).toBeInTheDocument();
    expect(screen.getByText('คลิกเพื่อแก้ไข')).toBeInTheDocument();
    // peek phone is plain text, NOT an <a> link
    expect(screen.getByTestId('appt-detail-phone').tagName).not.toBe('A');
  });

  it('F2: modal variant renders the same fields, no click-hint, name not red', async () => {
    const { default: AppointmentDetailBody } = await import('../src/components/backend/AppointmentDetailBody.jsx');
    render(<AppointmentDetailBody appt={APPT} roomName="" doctorMap={{}} variant="modal" />);
    expect(screen.getByTestId('appt-detail-name')).toBeInTheDocument();
    expect(screen.getByTestId('appt-detail-name').className).not.toMatch(/text-red/);
    expect(screen.queryByText('คลิกเพื่อแก้ไข')).toBeNull();
  });
});

describe('V127 source-grep — AV144 invariants', () => {
  const hook = readFileSync('src/hooks/useApptHoverPeek.js', 'utf8');
  const peek = readFileSync('src/components/backend/AppointmentHoverPeek.jsx', 'utf8');
  const cal = readFileSync('src/components/backend/AppointmentCalendarView.jsx', 'utf8');
  const agenda = readFileSync('src/components/backend/AppointmentAgendaView.jsx', 'utf8');
  const body = readFileSync('src/components/backend/AppointmentDetailBody.jsx', 'utf8');
  const av = readFileSync('.agents/skills/audit-anti-vibe-code/SKILL.md', 'utf8');

  it('SG1: hook is desktop-only (pointerType mouse guard)', () => {
    expect(hook).toMatch(/pointerType !== 'mouse'/);
  });

  it('SG2: peek is portal + no-backdrop + reuses the shared body', () => {
    expect(peek).toMatch(/createPortal/);
    expect(peek).toMatch(/AppointmentDetailBody/);
    expect(peek).not.toMatch(/bg-black\//); // no dimmed backdrop
  });

  it('SG3: both calendar surfaces wired; click closes peek; modal flow intact; body is shared', () => {
    expect(cal).toMatch(/useApptHoverPeek/);
    expect(cal).toMatch(/getHoverProps\(appt\)/);
    expect(cal).toMatch(/getHoverProps\(dup\)/);
    expect(cal).toMatch(/AppointmentHoverPeek/);
    expect(cal).toMatch(/closePeek\(\); openDetail\(appt\)/);
    expect(cal).toMatch(/AppointmentDetailPopover/);      // modal still rendered on click
    expect(agenda).toMatch(/getHoverProps\(appt\)/);
    // modal + body share the field source (no drift)
    const modal = readFileSync('src/components/backend/AppointmentDetailPopover.jsx', 'utf8');
    expect(modal).toMatch(/AppointmentDetailBody/);
    expect(body).toMatch(/variant === 'peek'/);
  });

  it('SG4: AV144 invariant present in audit-anti-vibe-code SKILL.md', () => {
    expect(av).toMatch(/### AV144 —/);
    expect(av).toMatch(/AppointmentHoverPeek/);
  });
});
