// VIP sort (2026-07-19) — "👑 VIP ก่อน" toggle in CustomerListTab.
//
// User ask: "ฝากให้ sort ลูกค้า vip ได้ในหน้าข้อมูลลูกค้าด้วย".
// Design: a VIP-first STABLE sort toggle in the meta row (V89 button bar
// untouched). Membership reads the SAME real-time VipProvider set the gold
// badges render from (id derivation mirrors CustomerCard: proClinicId || id)
// so order can never disagree with the badges. RTL EXECUTION per V163 lesson
// — only the data layer is mocked; the real component + real VipProvider run.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';

const CUSTOMERS = [
  { id: 'LC-A', patientData: { firstName: 'หนึ่ง' } },
  { id: 'LC-VIP', patientData: { firstName: 'วีไอพี' } },
  { id: '2853', proClinicId: '2853', patientData: { firstName: 'เลกาซี่วีไอพี' } }, // legacy: vip set keys doc id = proClinicId
  { id: 'LC-B', patientData: { firstName: 'สอง' } },
];

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  getAllCustomers: vi.fn(async () => CUSTOMERS),
  listBranches: vi.fn(async () => []),
  listenToVipCustomers: vi.fn((onChange) => { onChange(['LC-VIP', '2853']); return () => {}; }),
}));
vi.mock('../src/lib/swrRead.js', () => ({
  swrRun: async ({ serverLoad, apply }) => apply(await serverLoad(), { fromCache: false }),
}));
vi.mock('../src/hooks/useTabAccess.js', () => ({ useHasPermission: () => true }));
vi.mock('../src/components/backend/CustomerCard.jsx', () => ({
  default: ({ customer }) => <div data-testid="cust-card" data-cid={customer.id} />,
}));
vi.mock('../src/components/backend/BulkPrintModal.jsx', () => ({ default: () => null }));
vi.mock('../src/components/backend/DeleteCustomerCascadeModal.jsx', () => ({ default: () => null }));

const { VipProvider } = await import('../src/lib/VipContext.jsx');
const { default: CustomerListTab } = await import('../src/components/backend/CustomerListTab.jsx');

const renderTab = () => render(
  <VipProvider>
    <CustomerListTab clinicSettings={{}} theme="dark" onViewCustomer={() => {}} />
  </VipProvider>,
);

const cardOrder = () => screen.getAllByTestId('cust-card').map(el => el.getAttribute('data-cid'));

describe('VIP sort — CustomerListTab "VIP ก่อน" toggle (RTL execution)', () => {
  beforeEach(() => cleanup());

  it('R1 default OFF — original load order preserved', async () => {
    renderTab();
    await waitFor(() => expect(screen.getAllByTestId('cust-card')).toHaveLength(4));
    expect(cardOrder()).toEqual(['LC-A', 'LC-VIP', '2853', 'LC-B']);
  });

  it('R2 toggle ON — VIP rows first, STABLE order inside each group (incl. legacy proClinicId keying)', async () => {
    renderTab();
    await waitFor(() => expect(screen.getAllByTestId('cust-card')).toHaveLength(4));
    fireEvent.click(screen.getByTestId('vip-sort-toggle'));
    expect(cardOrder()).toEqual(['LC-VIP', '2853', 'LC-A', 'LC-B']);
    expect(screen.getByTestId('vip-sort-toggle').getAttribute('data-active')).toBe('true');
  });

  it('R3 toggle back OFF — returns to original order', async () => {
    renderTab();
    await waitFor(() => expect(screen.getAllByTestId('cust-card')).toHaveLength(4));
    const btn = screen.getByTestId('vip-sort-toggle');
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(cardOrder()).toEqual(['LC-A', 'LC-VIP', '2853', 'LC-B']);
    expect(btn.getAttribute('data-active')).toBeNull();
  });

  it('R4 sort composes with search filter (filter first, then VIP-first)', async () => {
    renderTab();
    await waitFor(() => expect(screen.getAllByTestId('cust-card')).toHaveLength(4));
    fireEvent.click(screen.getByTestId('vip-sort-toggle'));
    fireEvent.change(screen.getByPlaceholderText(/ค้นหาลูกค้าในระบบ/), { target: { value: 'วีไอพี' } });
    await waitFor(() => expect(screen.getAllByTestId('cust-card')).toHaveLength(2));
    expect(cardOrder()).toEqual(['LC-VIP', '2853']);
  });
});

describe('VIP sort — useVipIds hook contract', () => {
  it('H1 outside a provider → stable EMPTY set (AV202-inert; identical reference across calls)', async () => {
    const { useVipIds } = await import('../src/lib/VipContext.jsx');
    let a; let b;
    function Probe() { a = useVipIds(); return null; }
    function Probe2() { b = useVipIds(); return null; }
    render(<><Probe /><Probe2 /></>);
    expect(a).toBeInstanceOf(Set);
    expect(a.size).toBe(0);
    expect(a).toBe(b); // stable reference — memo-dep safe
  });
});

describe('VIP sort — source-grep locks', () => {
  const TAB = readFileSync(path.resolve(process.cwd(), 'src/components/backend/CustomerListTab.jsx'), 'utf8');
  const CTX = readFileSync(path.resolve(process.cwd(), 'src/lib/VipContext.jsx'), 'utf8');

  it('SG1 grid renders `displayed` (filtered + optional VIP-first), never raw filtered.map', () => {
    expect(TAB).toContain('displayed.map(customer');
    expect(TAB).not.toMatch(/\{filtered\.map\(customer/);
  });

  it('SG2 membership keys mirror CustomerCard id derivation (proClinicId || id)', () => {
    expect(TAB).toMatch(/vipIds\.has\(String\(c\.proClinicId \|\| c\.id/);
  });

  it('SG3 VipContext exports useVipIds with a stable empty-set fallback', () => {
    expect(CTX).toContain('export function useVipIds()');
    expect(CTX).toContain('EMPTY_VIP_SET');
  });
});
