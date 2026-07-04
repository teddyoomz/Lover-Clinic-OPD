// StaffChatSystemCard — 4 kinds × action buttons (2026-07-04, spec ③④⑤⑥).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Controlled resolver — the card's live-resolve hook.
let mockResolved = { pending: false, missing: false, customerId: 'LC-26000123', name: 'คุณสมหญิง ใจดี', hn: 'LC-26000123' };
vi.mock('../src/lib/staffChatNotifyResolve.js', () => ({
  useSystemCardCustomer: () => mockResolved,
}));
// Modal hosts mocked — assert PROPS, behavior covered by their own suites.
const intakeModalSpy = vi.fn();
const edLauncherSpy = vi.fn();
vi.mock('../src/components/staffchat/StaffChatIntakeModal.jsx', () => ({
  StaffChatIntakeModal: (props) => { intakeModalSpy(props); return <div data-testid="mock-intake-modal" />; },
}));
vi.mock('../src/components/staffchat/StaffChatEdModalLauncher.jsx', () => ({
  StaffChatEdModalLauncher: (props) => { edLauncherSpy(props); return <div data-testid="mock-ed-launcher" />; },
}));

import { StaffChatSystemCard } from '../src/components/staffchat/StaffChatSystemCard.jsx';

const msg = (system) => ({ id: 'CHAT-1', createdAt: null, system });

beforeEach(() => {
  intakeModalSpy.mockClear();
  edLauncherSpy.mockClear();
  mockResolved = { pending: false, missing: false, customerId: 'LC-26000123', name: 'คุณสมหญิง ใจดี', hn: 'LC-26000123' };
});

describe('③ tfp-vitals card', () => {
  it('B1 headline + red-tint เปิดบันทึกการรักษา button with the exact deep link (new tab)', () => {
    render(<StaffChatSystemCard message={msg({ kind: 'tfp-vitals', treatmentId: 'BT-1', customerId: 'LC-26000123', nameSnapshot: 'x' })} />);
    expect(screen.getByText(/บันทึกซักประวัติเสร็จแล้ว/)).toBeInTheDocument();
    const btn = screen.getByTestId('system-card-open-treatment');
    expect(btn).toHaveAttribute('target', '_blank');
    expect(btn.getAttribute('href')).toContain('?backend=1&customer=LC-26000123&treatment=BT-1');
    expect(btn.className).toMatch(/bg-red-500\/10/); // v2-A red tint (card accent)
    expect(btn.className).not.toMatch(/gradient/);
  });
});

describe('④ tfp-doctor card', () => {
  it('B2 violet accent + โดยแพทย์ line + violet-tint button', () => {
    const { container } = render(<StaffChatSystemCard message={msg({ kind: 'tfp-doctor', treatmentId: 'BT-2', customerId: 'LC-26000123', doctorName: 'นพ.สมชาย รักษาดี' })} />);
    expect(screen.getByText(/แพทย์ลงบันทึกเสร็จแล้ว/)).toBeInTheDocument();
    expect(screen.getByTestId('system-card-doctor-name')).toHaveTextContent('นพ.สมชาย รักษาดี');
    const card = container.querySelector('[data-testid="staff-chat-system-card"]');
    expect(card.style.borderLeftColor).toBe('rgb(124, 58, 237)'); // #7c3aed (jsdom normalizes to rgb)
    expect(screen.getByTestId('system-card-open-treatment').className).toMatch(/bg-violet-500\/10/);
  });
  it('B2b no doctorName → line hidden (never renders an empty โดยแพทย์:)', () => {
    render(<StaffChatSystemCard message={msg({ kind: 'tfp-doctor', treatmentId: 'BT-2', customerId: 'LC-1' })} />);
    expect(screen.queryByTestId('system-card-doctor-name')).not.toBeInTheDocument();
  });
});

describe('⑤ intake card — ดูข้อมูลรับเข้า', () => {
  it('B3 button opens the intake modal with sessionId + resolved customerId (synthetic fallback inside)', () => {
    render(<StaffChatSystemCard message={msg({ kind: 'intake', sessionId: 'S-1', customerId: null, nameSnapshot: 'นาย วิชิตพงษ์' })} />);
    const btn = screen.getByTestId('system-card-view-intake');
    fireEvent.click(btn);
    expect(screen.getByTestId('mock-intake-modal')).toBeInTheDocument();
    expect(intakeModalSpy).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'S-1', customerId: 'LC-26000123' }));
  });
  it('B3b pending (ยังไม่ลงทะเบียน) → NO view button yet', () => {
    mockResolved = { pending: true, missing: false, customerId: '', name: 'นาย ก', hn: '' };
    render(<StaffChatSystemCard message={msg({ kind: 'intake', sessionId: 'S-1' })} />);
    expect(screen.queryByTestId('system-card-view-intake')).not.toBeInTheDocument();
    expect(screen.getByText('รอลงทะเบียน')).toBeInTheDocument();
  });
});

describe('⑥ followup card — ดูแบบประเมิน', () => {
  it('B4 button opens the ED launcher (the REAL EDDetailModal path) with customerId', () => {
    render(<StaffChatSystemCard message={msg({ kind: 'followup', sessionId: 'FW-1', customerId: 'LC-26000123' })} />);
    fireEvent.click(screen.getByTestId('system-card-view-assessment'));
    expect(screen.getByTestId('mock-ed-launcher')).toBeInTheDocument();
    expect(edLauncherSpy).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'LC-26000123' }));
  });
});

describe('cross-kind guards', () => {
  it('B5 intake/followup cards NEVER show the TFP button; tfp cards never show view buttons', () => {
    const { rerender } = render(<StaffChatSystemCard message={msg({ kind: 'intake', sessionId: 'S-1' })} />);
    expect(screen.queryByTestId('system-card-open-treatment')).not.toBeInTheDocument();
    rerender(<StaffChatSystemCard message={msg({ kind: 'followup', sessionId: 'FW-1', customerId: 'LC-1' })} />);
    expect(screen.queryByTestId('system-card-open-treatment')).not.toBeInTheDocument();
    rerender(<StaffChatSystemCard message={msg({ kind: 'tfp-vitals', treatmentId: 'BT-1', customerId: 'LC-1' })} />);
    expect(screen.queryByTestId('system-card-view-intake')).not.toBeInTheDocument();
    expect(screen.queryByTestId('system-card-view-assessment')).not.toBeInTheDocument();
  });
  it('B6 tfp card missing treatmentId → no broken button', () => {
    render(<StaffChatSystemCard message={msg({ kind: 'tfp-vitals', customerId: 'LC-1' })} />);
    expect(screen.queryByTestId('system-card-open-treatment')).not.toBeInTheDocument();
  });
  it('B7 customer name link still present + sky family (never red on a name)', () => {
    render(<StaffChatSystemCard message={msg({ kind: 'tfp-vitals', treatmentId: 'BT-1', customerId: 'LC-1' })} />);
    const link = screen.getByTestId('system-card-customer-link');
    expect(link.className).toMatch(/sky/);
    expect(link.className).not.toMatch(/text-red/);
  });
});
