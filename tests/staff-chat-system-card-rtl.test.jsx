// AV198 — StaffChatSystemCard render + the pending→registered LIVE FLIP (the
// user's must-work case). The real useSystemCardCustomer hook runs; firebase is
// mocked so the test drives the onSnapshot callback + getCustomer resolution.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

let snapCb = null;
let unsubCalls = 0;
vi.mock('firebase/firestore', () => ({
  doc: (...a) => ({ path: a.slice(1).join('/') }),
  onSnapshot: (_ref, cb) => { snapCb = cb; return () => { unsubCalls++; snapCb = null; }; },
}));
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app' }));
const getCustomerMock = vi.fn();
vi.mock('../src/lib/scopedDataLayer.js', () => ({ getCustomer: (...a) => getCustomerMock(...a) }));

import { StaffChatSystemCard } from '../src/components/staffchat/StaffChatSystemCard.jsx';

const TS = { toMillis: () => 1700000000000 };
beforeEach(() => { snapCb = null; unsubCalls = 0; getCustomerMock.mockReset(); });

describe('StaffChatSystemCard', () => {
  it('R1 follow-up → clickable sky link + HN; href /?backend=1&customer=, target=_blank rel=noopener', async () => {
    getCustomerMock.mockResolvedValue({ firstname: 'แพรพร', lastname: 'พรแพร', hn_no: 'LC-26000079' });
    render(<StaffChatSystemCard message={{ id: 'm1', createdAt: TS, system: { kind: 'followup', customerId: 'LC-9', nameSnapshot: 'แพรพร พรแพร', hnSnapshot: 'LC-26000079' } }} />);
    const link = await screen.findByTestId('system-card-customer-link');
    expect(link.getAttribute('href')).toBe('/?backend=1&customer=LC-9');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByTestId('system-card-hn').textContent).toMatch(/LC-26000079/);
    expect(screen.getByText('กรอกแบบประเมินติดตามเสร็จแล้ว')).toBeTruthy();
  });

  it('R2 intake pending → name + รอลงทะเบียน, NO link', () => {
    render(<StaffChatSystemCard message={{ id: 'm2', createdAt: TS, system: { kind: 'intake', customerId: null, sessionId: 'S2', nameSnapshot: 'สมชาย ใจดี', hnSnapshot: null } }} />);
    expect(screen.getByTestId('system-card-customer-name').textContent).toMatch(/สมชาย ใจดี/);
    expect(screen.getByText('รอลงทะเบียน')).toBeTruthy();
    expect(screen.queryByTestId('system-card-customer-link')).toBeNull();
    expect(screen.getByText('กรอกข้อมูลรับเข้าเสร็จแล้ว')).toBeTruthy();
  });

  it('R3 intake LIVE FLIP: session gets brokerProClinicId → card becomes clickable + HN', async () => {
    getCustomerMock.mockResolvedValue({ firstname: 'สมชาย', lastname: 'ใจดี', hn_no: 'LC-26000180' });
    render(<StaffChatSystemCard message={{ id: 'm3', createdAt: TS, system: { kind: 'intake', customerId: null, sessionId: 'S3', nameSnapshot: 'สมชาย ใจดี', hnSnapshot: null } }} />);
    expect(screen.getByText('รอลงทะเบียน')).toBeTruthy();
    expect(typeof snapCb).toBe('function'); // intake subscribed to its session
    await act(async () => { snapCb({ exists: () => true, data: () => ({ brokerProClinicId: 'LC-26000180' }) }); });
    const link = await screen.findByTestId('system-card-customer-link');
    expect(link.getAttribute('href')).toBe('/?backend=1&customer=LC-26000180');
    expect(screen.getByTestId('system-card-hn').textContent).toMatch(/LC-26000180/);
    expect(getCustomerMock).toHaveBeenCalledWith('LC-26000180');
    expect(screen.queryByText('รอลงทะเบียน')).toBeNull();
  });

  it('R4 customer NAME link is sky, NEVER red (Thai culture)', async () => {
    getCustomerMock.mockResolvedValue({ firstname: 'A', lastname: 'B', hn_no: 'X' });
    render(<StaffChatSystemCard message={{ id: 'm4', createdAt: TS, system: { kind: 'followup', customerId: 'LC-1', nameSnapshot: 'A B', hnSnapshot: 'X' } }} />);
    const link = await screen.findByTestId('system-card-customer-link');
    expect(link.className).toMatch(/text-sky/);
    expect(link.className).not.toMatch(/text-red/);
  });

  it('R5 follow-up does NOT subscribe to a session (customerId known)', () => {
    getCustomerMock.mockResolvedValue({ firstname: 'A', lastname: 'B', hn_no: 'X' });
    render(<StaffChatSystemCard message={{ id: 'm5', createdAt: TS, system: { kind: 'followup', customerId: 'LC-1', sessionId: 'S5', nameSnapshot: 'A B', hnSnapshot: 'X' } }} />);
    expect(snapCb).toBeNull(); // no onSnapshot — direct customerId
  });
});
