// V69 (2026-05-15) — regression bank for 3 V67-class mock-shadow drift bugs
// surfaced by user post-V68 deploy:
//
//   Bug A (render):  resolveTokens leaves Thai title prefix on customerName
//                    (e.g. "นางสาว แพรพร" instead of "แพรพร")
//   Bug B (consume): UI reads result.sent (root) but endpoint returns
//                    { results: { sent } } → always 0/0/0 in panel
//   Bug C (produce): UI sends `branchNameConfirm` but endpoint reads
//                    `confirmBranchName` → BRANCH_NAME_CONFIRM_MISMATCH
//
// All 3 are V67 mock-shadow class — UI tests passed because mock data didn't
// surface the contract drift; endpoint tests passed because hand-crafted
// payloads matched the endpoint's own destructure.

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { resolveTokens } from '../src/lib/lineReminderTemplate.js';

// V55.3 / AV41 — capture-restore global.fetch to prevent worker-pool leak
const ORIGINAL_FETCH = global.fetch;
afterAll(() => {
  if (ORIGINAL_FETCH === undefined) delete global.fetch;
  else global.fetch = ORIGINAL_FETCH;
});

vi.mock('../src/firebase.js', () => ({
  auth: { currentUser: { getIdToken: async () => 'mock-token' } },
}));

import { LineReminderDebugSection } from '../src/components/backend/LineReminderDebugSection.jsx';

describe('V69 Bug A — stripCustomerNamePrefix on resolved customerName', () => {
  it('A.1 strips นางสาว prefix from appt.customerName fallback', () => {
    const tokens = resolveTokens({
      cust: {},
      appt: { id: 'a1', customerName: 'นางสาว แพรพร พรแพร', date: '2026-05-16', startTime: '13:15' },
    });
    expect(tokens.customerName).toBe('แพรพร พรแพร');
  });

  it('A.2 strips นาย prefix', () => {
    const tokens = resolveTokens({
      cust: {},
      appt: { id: 'a2', customerName: 'นาย ทดสอบ คลินิก', date: '2026-05-16', startTime: '14:00' },
    });
    expect(tokens.customerName).toBe('ทดสอบ คลินิก');
  });

  it('A.3 strips นาง prefix', () => {
    const tokens = resolveTokens({
      cust: { fullName: 'นาง ลูกค้า ใหม่' },
      appt: { id: 'a3' },
    });
    expect(tokens.customerName).toBe('ลูกค้า ใหม่');
  });

  it('A.4 strips เด็กชาย prefix', () => {
    const tokens = resolveTokens({
      cust: { fullName: 'เด็กชาย เล็ก ทดสอบ' },
      appt: { id: 'a4' },
    });
    expect(tokens.customerName).toBe('เล็ก ทดสอบ');
  });

  it('A.5 strips เด็กหญิง prefix', () => {
    const tokens = resolveTokens({
      cust: { fullName: 'เด็กหญิง น้อง น่ารัก' },
      appt: { id: 'a5' },
    });
    expect(tokens.customerName).toBe('น้อง น่ารัก');
  });

  it('A.6 strips ไม่ระบุ prefix (no-prefix entry)', () => {
    const tokens = resolveTokens({
      cust: { fullName: 'ไม่ระบุ ลูกค้า ใหม่' },
      appt: { id: 'a6' },
    });
    expect(tokens.customerName).toBe('ลูกค้า ใหม่');
  });

  it('A.7 leaves name unchanged if no recognized title prefix', () => {
    const tokens = resolveTokens({
      cust: { fullName: 'แพรพร พรแพร' },
      appt: { id: 'a7' },
    });
    expect(tokens.customerName).toBe('แพรพร พรแพร');
  });

  it('A.8 handles cust.firstname + cust.lastname fallback (no title in either)', () => {
    const tokens = resolveTokens({
      cust: { firstname: 'แพรพร', lastname: 'พรแพร' },
      appt: { id: 'a8' },
    });
    expect(tokens.customerName).toBe('แพรพร พรแพร');
  });

  it('A.9 returns empty string when nothing resolves', () => {
    const tokens = resolveTokens({
      cust: {},
      appt: {},
    });
    expect(tokens.customerName).toBe('');
  });
});

describe('V69 Bug B — UI reads result.results.{sent,skipped,failed} (not root)', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  it('B.1 single-mode response with results.sent=1 displays Sent: 1 (NOT 0)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        mode: 'single',
        totalAttempted: 1,
        results: { sent: 1, skipped: 0, failed: 0, details: [{ apptId: 'BA-x', status: 'sent' }] },
      }),
    });
    render(<LineReminderDebugSection branchId="BR-A" branchName="นครราชสีมา" />);
    fireEvent.click(screen.getByLabelText(/ยิงเฉพาะลูกค้า/));
    fireEvent.change(screen.getByPlaceholderText(/LC-26000001/), { target: { value: '000004' } });
    fireEvent.click(screen.getByTestId('debug-fire-button'));
    await waitFor(() => {
      expect(screen.getByTestId('debug-fire-sent').textContent).toBe('1');
    });
    expect(screen.getByTestId('debug-fire-skipped').textContent).toBe('0');
    expect(screen.getByTestId('debug-fire-failed').textContent).toBe('0');
  });

  it('B.2 single-mode response with totalAttempted=0 shows no-candidates hint', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        mode: 'single',
        totalAttempted: 0,
        results: { sent: 0, skipped: 0, failed: 0, details: [] },
      }),
    });
    render(<LineReminderDebugSection branchId="BR-A" branchName="นครราชสีมา" />);
    fireEvent.click(screen.getByLabelText(/ยิงเฉพาะลูกค้า/));
    fireEvent.change(screen.getByPlaceholderText(/LC-26000001/), { target: { value: '000004' } });
    fireEvent.click(screen.getByTestId('debug-fire-button'));
    await waitFor(() => {
      expect(screen.getByTestId('debug-fire-no-candidates')).toBeTruthy();
    });
  });

  it('B.3 dry-run response with totalEligible=2 shows eligible counter', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        mode: 'dry-run',
        totalEligible: 2,
        previews: [{ apptId: 'a1' }, { apptId: 'a2' }],
      }),
    });
    render(<LineReminderDebugSection branchId="BR-A" branchName="นครราชสีมา" />);
    // dry-run is default mode; no extra setup needed
    fireEvent.click(screen.getByTestId('debug-fire-button'));
    await waitFor(() => {
      expect(screen.getByTestId('debug-fire-eligible').textContent).toBe('2');
    });
  });
});

describe('V69 Bug C — UI sends `confirmBranchName` (matching server destructure)', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  it('C.1 all-mode payload uses key `confirmBranchName` (NOT `branchNameConfirm`)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        mode: 'all',
        totalAttempted: 0,
        results: { sent: 0, skipped: 0, failed: 0, details: [] },
      }),
    });
    render(<LineReminderDebugSection branchId="BR-A" branchName="นครราชสีมา" />);
    fireEvent.click(screen.getByLabelText(/ยิงทุกคนพรุ่งนี้/));
    const branchInput = screen.getByPlaceholderText(/พิมพ์.*นครราชสีมา.*เพื่อยืนยัน/);
    fireEvent.change(branchInput, { target: { value: 'นครราชสีมา' } });
    fireEvent.click(screen.getByTestId('debug-fire-button'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse(init.body);
    expect(sentBody.confirmBranchName).toBe('นครราชสีมา');
    expect(sentBody.branchNameConfirm).toBeUndefined();
  });
});
