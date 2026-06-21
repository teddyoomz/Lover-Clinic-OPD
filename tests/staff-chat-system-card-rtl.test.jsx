// AV198 — StaffChatSystemCard render + the pending→registered LIVE FLIP (the
// user's must-work case). The real useSystemCardCustomer hook runs; firebase is
// mocked so the test drives the onSnapshot callbacks + getCustomer resolution.
// Two listeners now: the opd_session (kiosk/queue brokerProClinicId) AND the
// linked appointment (booking-flow customerId) — the mock routes them by ref kind.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

let sessionSnapCb = null;  // opd_session single-doc listener
let apptSnapCb = null;     // be_appointments query listener
let unsubCalls = 0;
vi.mock('firebase/firestore', () => ({
  doc: (...a) => ({ __kind: 'doc', path: a.slice(1).join('/') }),
  collection: (...a) => ({ __kind: 'collection', path: a.slice(1).join('/') }),
  where: (field, op, val) => ({ __kind: 'where', field, op, val }),
  query: (coll, ...clauses) => ({ __kind: 'query', coll, clauses }),
  onSnapshot: (ref, cb) => {
    if (ref && ref.__kind === 'query') apptSnapCb = cb; else sessionSnapCb = cb;
    return () => { unsubCalls++; };
  },
}));
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app' }));
const getCustomerMock = vi.fn();
vi.mock('../src/lib/scopedDataLayer.js', () => ({ getCustomer: (...a) => getCustomerMock(...a) }));

import { StaffChatSystemCard } from '../src/components/staffchat/StaffChatSystemCard.jsx';

const TS = { toMillis: () => 1700000000000 };
const apptSnap = (customerId) => ({ docs: customerId ? [{ data: () => ({ customerId }) }] : [] });
beforeEach(() => { sessionSnapCb = null; apptSnapCb = null; unsubCalls = 0; getCustomerMock.mockReset(); });

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

  it('R3 intake LIVE FLIP (kiosk/queue): session gets brokerProClinicId → card becomes clickable + HN', async () => {
    getCustomerMock.mockResolvedValue({ firstname: 'สมชาย', lastname: 'ใจดี', hn_no: 'LC-26000180' });
    render(<StaffChatSystemCard message={{ id: 'm3', createdAt: TS, system: { kind: 'intake', customerId: null, sessionId: 'S3', nameSnapshot: 'สมชาย ใจดี', hnSnapshot: null } }} />);
    expect(screen.getByText('รอลงทะเบียน')).toBeTruthy();
    expect(typeof sessionSnapCb).toBe('function'); // intake subscribed to its session
    await act(async () => { sessionSnapCb({ exists: () => true, data: () => ({ brokerProClinicId: 'LC-26000180' }) }); });
    const link = await screen.findByTestId('system-card-customer-link');
    expect(link.getAttribute('href')).toBe('/?backend=1&customer=LC-26000180');
    expect(screen.getByTestId('system-card-hn').textContent).toMatch(/LC-26000180/);
    expect(getCustomerMock).toHaveBeenCalledWith('LC-26000180');
    expect(screen.queryByText('รอลงทะเบียน')).toBeNull();
  });

  it('R9 intake LIVE FLIP (booking-flow): session DELETED + linked appointment gets customerId → card flips (prod bug นาย ปรัชญา / LC-26000176)', async () => {
    getCustomerMock.mockResolvedValue({ firstname: 'ปรัชญา', lastname: 'มนเทียรอาสน์', hn_no: 'LC-26000176' });
    render(<StaffChatSystemCard message={{ id: 'm9', createdAt: TS, system: { kind: 'intake', customerId: null, sessionId: 'BL-1782029621467', nameSnapshot: 'นาย ปรัชญา มนเทียรอาสน์', hnSnapshot: null } }} />);
    expect(screen.getByText('รอลงทะเบียน')).toBeTruthy();
    expect(typeof apptSnapCb).toBe('function'); // intake ALSO subscribed to the linked appointment
    // session is gone (booking-flow hard-deletes it on save) — the SESSION listener says exists:false
    await act(async () => { sessionSnapCb({ exists: () => false, data: () => ({}) }); });
    expect(screen.getByText('รอลงทะเบียน')).toBeTruthy(); // still pending — session gone
    // the durable signal: the linked appointment now carries customerId
    await act(async () => { apptSnapCb(apptSnap('LC-26000176')); });
    const link = await screen.findByTestId('system-card-customer-link');
    expect(link.getAttribute('href')).toBe('/?backend=1&customer=LC-26000176');
    expect(screen.getByTestId('system-card-hn').textContent).toMatch(/LC-26000176/);
    expect(getCustomerMock).toHaveBeenCalledWith('LC-26000176');
    expect(screen.queryByText('รอลงทะเบียน')).toBeNull();
  });

  it('R10 intake subscribes to BOTH the session AND the linked appointment', () => {
    render(<StaffChatSystemCard message={{ id: 'm10', createdAt: TS, system: { kind: 'intake', customerId: null, sessionId: 'S10', nameSnapshot: 'a b', hnSnapshot: null } }} />);
    expect(typeof sessionSnapCb).toBe('function');
    expect(typeof apptSnapCb).toBe('function');
  });

  it('R4 customer NAME link is sky, NEVER red (Thai culture)', async () => {
    getCustomerMock.mockResolvedValue({ firstname: 'A', lastname: 'B', hn_no: 'X' });
    render(<StaffChatSystemCard message={{ id: 'm4', createdAt: TS, system: { kind: 'followup', customerId: 'LC-1', nameSnapshot: 'A B', hnSnapshot: 'X' } }} />);
    const link = await screen.findByTestId('system-card-customer-link');
    expect(link.className).toMatch(/text-sky/);
    expect(link.className).not.toMatch(/text-red/);
  });

  it('R5 follow-up does NOT subscribe to a session OR an appointment (customerId known)', () => {
    getCustomerMock.mockResolvedValue({ firstname: 'A', lastname: 'B', hn_no: 'X' });
    render(<StaffChatSystemCard message={{ id: 'm5', createdAt: TS, system: { kind: 'followup', customerId: 'LC-1', sessionId: 'S5', nameSnapshot: 'A B', hnSnapshot: 'X' } }} />);
    expect(sessionSnapCb).toBeNull(); // no onSnapshot — direct customerId
    expect(apptSnapCb).toBeNull();
  });

  it('R6 customer DELETED after registration (getCustomer→null) → downgrades to plain name + ไม่พบข้อมูลลูกค้า, NO 404 link', async () => {
    getCustomerMock.mockResolvedValue(null); // be_customers doc gone
    render(<StaffChatSystemCard message={{ id: 'm6', createdAt: TS, system: { kind: 'followup', customerId: 'LC-DEL', nameSnapshot: 'ลบ แล้ว', hnSnapshot: 'LC-DEL' } }} />);
    expect(await screen.findByTestId('system-card-missing')).toBeTruthy();
    expect(screen.queryByTestId('system-card-customer-link')).toBeNull(); // no broken link
    expect(screen.getByText(/ลบ แล้ว/)).toBeTruthy();                      // name still shown (plain)
  });

  it('R7 transient getCustomer failure (throw) → KEEPS the optimistic link (valid target), no false-missing', async () => {
    getCustomerMock.mockRejectedValue(new Error('unavailable'));
    render(<StaffChatSystemCard message={{ id: 'm7', createdAt: TS, system: { kind: 'followup', customerId: 'LC-7', nameSnapshot: 'A B', hnSnapshot: 'LC-7' } }} />);
    const link = await screen.findByTestId('system-card-customer-link'); // link stays (customerId valid)
    expect(link.getAttribute('href')).toBe('/?backend=1&customer=LC-7');
    expect(screen.queryByTestId('system-card-missing')).toBeNull();       // a throw is NOT treated as deletion
  });

  it('R8 brokerProClinicId CLEARED on the session → card reverts to pending (hook mirrors the pure picker)', async () => {
    getCustomerMock.mockResolvedValue({ firstname: 'A', lastname: 'B', hn_no: 'LC-9' });
    render(<StaffChatSystemCard message={{ id: 'm8', createdAt: TS, system: { kind: 'intake', customerId: null, sessionId: 'S8', nameSnapshot: 'A B', hnSnapshot: null } }} />);
    await act(async () => { sessionSnapCb({ exists: () => true, data: () => ({ brokerProClinicId: 'LC-9' }) }); }); // register → resolve
    expect(await screen.findByTestId('system-card-customer-link')).toBeTruthy();
    await act(async () => { sessionSnapCb({ exists: () => true, data: () => ({ brokerProClinicId: null }) }); });    // clear → revert
    expect(await screen.findByText('รอลงทะเบียน')).toBeTruthy();
    expect(screen.queryByTestId('system-card-customer-link')).toBeNull();
  });
});
