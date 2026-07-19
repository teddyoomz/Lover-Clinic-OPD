// ─── infra-health UI (2026-07-19) — RTL ────────────────────────────────────
// U1 StaffChatSystemCard 'infra-health' kind (plain-text card, NO customer
// machinery — unknown kinds used to fall back to a broken intake card) ·
// U2 existing kinds unchanged · U3 InfraHealthSection states + save wiring ·
// U4 AppErrorBoundary (black screen → recoverable fallback).
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('firebase/firestore', () => ({
  doc: (...a) => ({ __kind: 'doc', path: a.slice(1).join('/') }),
  collection: (...a) => ({ __kind: 'collection', path: a.slice(1).join('/') }),
  where: (field, op, val) => ({ __kind: 'where', field, op, val }),
  query: (coll, ...clauses) => ({ __kind: 'query', coll, clauses }),
  onSnapshot: () => () => {},
}));
vi.mock('../src/firebase.js', () => ({
  db: {}, appId: 'test-app',
  auth: { currentUser: { getIdToken: async () => 'test-token', email: 'admin@test' } },
}));
const getAdminAuditDocMock = vi.fn();
const listBranchesMock = vi.fn(async () => [{ id: 'BR-A', name: 'นครราชสีมา' }, { id: 'BR-B', name: 'พระราม 3' }]);
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  getCustomer: vi.fn(async () => null),
  getAdminAuditDoc: (...a) => getAdminAuditDocMock(...a),
  listBranches: (...a) => listBranchesMock(...a),
}));
const saveSystemConfigMock = vi.fn(async () => ({ auditId: 'a1', version: 2 }));
vi.mock('../src/lib/systemConfigClient.js', () => ({
  saveSystemConfig: (...a) => saveSystemConfigMock(...a),
}));

import { StaffChatSystemCard } from '../src/components/staffchat/StaffChatSystemCard.jsx';
import InfraHealthSection from '../src/components/backend/InfraHealthSection.jsx';
import AppErrorBoundary from '../src/components/AppErrorBoundary.jsx';

const ORIGINAL_FETCH = global.fetch;
afterAll(() => { if (ORIGINAL_FETCH === undefined) delete global.fetch; else global.fetch = ORIGINAL_FETCH; });
beforeEach(() => {
  getAdminAuditDocMock.mockReset();
  saveSystemConfigMock.mockClear();
  global.fetch = vi.fn(async () => ({ status: 200, json: async () => ({ ok: true, rows: [] }) }));
});
afterEach(() => { vi.restoreAllMocks(); });

const TS = { toMillis: () => 1700000000000 };

describe('U1 — StaffChatSystemCard kind infra-health', () => {
  const msg = {
    id: 'CHAT-SYS-INFRA-20260719', createdAt: TS,
    text: '🩺 ระบบมีปัญหาร้ายแรง (19/07/2569 07:30)\n🔴 Backup ทั้งระบบ: ล้มเหลว\nดูรายละเอียด: Backend → ตั้งค่าระบบ → สุขภาพระบบ',
    system: { kind: 'infra-health', overall: 'red', issueCount: 1, dateKey: '20260719' },
  };
  it('U1.1 renders headline + multiline body, data-kind=infra-health', () => {
    render(<StaffChatSystemCard message={msg} />);
    const card = screen.getByTestId('staff-chat-system-card');
    expect(card.getAttribute('data-kind')).toBe('infra-health');
    expect(screen.getByText(/ตรวจสุขภาพระบบ/)).toBeTruthy();
    const body = screen.getByTestId('system-card-infra-body');
    expect(body.textContent).toContain('Backup ทั้งระบบ');
    expect(body.className).toContain('whitespace-pre-line');
  });
  it('U1.2 NO customer machinery — no รอลงทะเบียน row, no customer link/name', () => {
    render(<StaffChatSystemCard message={msg} />);
    expect(screen.queryByText('รอลงทะเบียน')).toBeNull();
    expect(screen.queryByTestId('system-card-customer-name')).toBeNull();
    expect(screen.queryByTestId('system-card-customer-link')).toBeNull();
  });
  it('U1.3 accent: red overall → #ef4444, warn overall → amber', () => {
    const { unmount } = render(<StaffChatSystemCard message={msg} />);
    expect(screen.getByTestId('staff-chat-system-card').style.borderLeftColor).toBe('rgb(239, 68, 68)');
    unmount();
    render(<StaffChatSystemCard message={{ ...msg, system: { ...msg.system, overall: 'warn' } }} />);
    expect(screen.getByTestId('staff-chat-system-card').style.borderLeftColor).toBe('rgb(245, 158, 11)');
  });
});

describe('U2 — existing kinds unchanged (anti-regression)', () => {
  it('U2.1 intake still renders the pending row', () => {
    render(<StaffChatSystemCard message={{ id: 'm', createdAt: TS, system: { kind: 'intake', customerId: null, sessionId: '', nameSnapshot: 'สมชาย ใจดี' } }} />);
    expect(screen.getByText('กรอกข้อมูลรับเข้าเสร็จแล้ว')).toBeTruthy();
    expect(screen.getByText('รอลงทะเบียน')).toBeTruthy();
  });
  it('U2.2 tfp-doctor still violet with doctor name', () => {
    render(<StaffChatSystemCard message={{ id: 'm', createdAt: TS, system: { kind: 'tfp-doctor', customerId: 'C1', doctorName: 'หมอมายด์' } }} />);
    expect(screen.getByText('🩺 แพทย์ลงบันทึกเสร็จแล้ว')).toBeTruthy();
    expect(screen.getByTestId('system-card-doctor-name').textContent).toContain('หมอมายด์');
  });
});

describe('U3 — InfraHealthSection', () => {
  const config = { infraHealth: { lineTargets: [], staffChatBranchId: '' } };
  const statusDoc = {
    type: 'infra-health', overall: 'red', dateKey: '20260719',
    performedAt: '2026-07-19T00:30:00.000Z',
    checks: [
      { id: 'task:wholeSystemBackup', label: 'Backup ทั้งระบบ', status: 'red', detail: 'ล้มเหลว' },
      { id: 'push', label: 'Push notifications', status: 'ok', detail: 'token สด 2 ตัว' },
    ],
  };
  it('U3.1 renders latest result: overall chip + check rows', async () => {
    getAdminAuditDocMock.mockResolvedValue(statusDoc);
    render(<InfraHealthSection config={config} executedBy="admin@test" />);
    await waitFor(() => expect(screen.getByTestId('infra-overall')).toBeTruthy());
    expect(screen.getByTestId('infra-overall').textContent).toBe('มีปัญหาร้ายแรง');
    expect(screen.getByTestId('infra-check-rows').textContent).toContain('Backup ทั้งระบบ');
    expect(getAdminAuditDocMock).toHaveBeenCalledWith('infra-health-latest');
  });
  it('U3.2 no doc yet → "ยังไม่เคยตรวจ" empty state + all action buttons present', async () => {
    getAdminAuditDocMock.mockResolvedValue(null);
    render(<InfraHealthSection config={config} executedBy="admin@test" />);
    await waitFor(() => expect(screen.getByText(/ยังไม่เคยตรวจ/)).toBeTruthy());
    expect(screen.getByTestId('infra-test-alert-btn')).toBeTruthy();
    expect(screen.getByTestId('infra-run-now-btn')).toBeTruthy();
    expect(screen.getByTestId('infra-load-errors-btn')).toBeTruthy();
  });
  it('U3.3 add LINE target → save → saveSystemConfig called with the infraHealth patch', async () => {
    getAdminAuditDocMock.mockResolvedValue(null);
    render(<InfraHealthSection config={config} executedBy="admin@test" />);
    fireEvent.click(screen.getByTestId('infra-add-line-target'));
    const row = await screen.findByTestId('infra-line-target-0');
    const inputs = row.querySelectorAll('input');
    fireEvent.change(row.querySelector('select'), { target: { value: 'BR-A' } });
    fireEvent.change(inputs[0], { target: { value: 'U1234567890abcdef' } });
    fireEvent.click(screen.getByText('บันทึก'));
    await waitFor(() => expect(saveSystemConfigMock).toHaveBeenCalledTimes(1));
    const arg = saveSystemConfigMock.mock.calls[0][0];
    expect(arg.executedBy).toBe('admin@test');
    expect(arg.patch.infraHealth.lineTargets[0]).toMatchObject({ branchId: 'BR-A', lineUserId: 'U1234567890abcdef' });
  });
  it('U3.4 test-alert button POSTs the admin endpoint with a Bearer token + shows per-channel result', async () => {
    getAdminAuditDocMock.mockResolvedValue(null);
    global.fetch = vi.fn(async () => ({
      status: 200,
      json: async () => ({ ok: true, staffChat: { ok: true, branchId: 'BR-A' }, line: [{ lineUserId: 'U12345678', statusCode: 200 }], noLineTargets: false }),
    }));
    render(<InfraHealthSection config={config} executedBy="admin@test" />);
    fireEvent.click(screen.getByTestId('infra-test-alert-btn'));
    await waitFor(() => expect(screen.getByTestId('infra-test-result')).toBeTruthy());
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/admin/infra-health-test-alert');
    expect(opts.headers.Authorization).toBe('Bearer test-token');
    expect(screen.getByTestId('infra-test-result').textContent).toContain('ส่งแล้ว');
  });
  it('U3.5 client-error viewer renders grouped rows from the admin endpoint', async () => {
    getAdminAuditDocMock.mockResolvedValue(null);
    global.fetch = vi.fn(async () => ({
      status: 200,
      json: async () => ({
        ok: true,
        rows: [
          { hash: 'eA', message: 'TypeError: boom', surface: 'staff', url: '/?tab=', createdAtMs: 1752900000000 },
          { hash: 'eA', message: 'TypeError: boom', surface: 'staff', url: '/?tab=', createdAtMs: 1752900001000 },
        ],
      }),
    }));
    render(<InfraHealthSection config={config} executedBy="admin@test" />);
    fireEvent.click(screen.getByTestId('infra-load-errors-btn'));
    const viewer = await screen.findByTestId('infra-error-viewer');
    expect(viewer.textContent).toContain('TypeError: boom');
    expect(viewer.textContent).toContain('×2');
  });
});

describe('U4 — AppErrorBoundary', () => {
  it('U4.1 render crash → Thai fallback + reload button (NOT a black screen)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {}); // React logs the caught error
    const Bomb = () => { throw new Error('render bomb'); };
    render(<AppErrorBoundary><Bomb /></AppErrorBoundary>);
    expect(screen.getByTestId('app-error-boundary-fallback')).toBeTruthy();
    expect(screen.getByText('เกิดข้อผิดพลาดในการแสดงผล')).toBeTruthy();
    expect(screen.getByText('โหลดหน้าใหม่')).toBeTruthy();
  });
  it('U4.2 healthy children render untouched', () => {
    render(<AppErrorBoundary><div data-testid="healthy">ok</div></AppErrorBoundary>);
    expect(screen.getByTestId('healthy')).toBeTruthy();
    expect(screen.queryByTestId('app-error-boundary-fallback')).toBeNull();
  });
});
