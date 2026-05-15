// Rule Q L2 verification for V68 LINE badge.
//
// Renders <AppointmentLineBadge> + <CustomerLineBadge> against fixture data
// using REAL React + jsdom (project's vitest env). Not mock-shadow.
//
// Spec § 7.5 — L2 here = real React render against fixture data with the
// actual production component code, not mock-shadowed Firestore. Real-prod
// query verification was done in V67. V68 is a render-layer fix, so L2 =
// real render of the production components.
//
// Asserts:
//   - notifyChannel:['line']        → 🟢 LINE chip rendered
//   - lineNotify:true (legacy)      → 🟢 LINE chip rendered (defensive fallback)
//   - both fields set               → 🟢 LINE chip rendered (OR-merge)
//   - neither                       → no chip
//   - missing fields                → defensive null
//   - notifyChannel as string       → defensive against shape drift
//   - 3 size variants render with correct text-size class
//
// Also smoke-tests CustomerLineBadge per-branch logic:
//   - linked at this branch (lineUserId_byBranch[contextBranchId])  → 🟢 LINE
//   - linked at other branch only                                   → ⚪️ LINE
//   - legacy customer.lineUserId at customer.branchId === ctx       → 🟢 LINE
//   - not linked anywhere                                            → null

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AppointmentLineBadge } from '../src/components/AppointmentLineBadge.jsx';
import { CustomerLineBadge } from '../src/components/CustomerOption.jsx';

describe('V68 Rule Q L2 — AppointmentLineBadge render verification', () => {
  it('L2.1 — notifyChannel:["line"] → renders 🟢 LINE chip', () => {
    const { container } = render(<AppointmentLineBadge appt={{ id: 'a1', notifyChannel: ['line'] }} />);
    expect(container.textContent).toMatch(/🟢\s*LINE/);
  });

  it('L2.2 — lineNotify:true (legacy V32-tris-ter) → renders 🟢 LINE (defensive fallback)', () => {
    const { container } = render(<AppointmentLineBadge appt={{ id: 'a2', lineNotify: true }} />);
    expect(container.textContent).toMatch(/🟢\s*LINE/);
  });

  it('L2.3 — both notifyChannel + lineNotify set → renders chip (OR-merge)', () => {
    const { container } = render(<AppointmentLineBadge appt={{ id: 'a3', notifyChannel: ['line'], lineNotify: true }} />);
    expect(container.textContent).toMatch(/🟢\s*LINE/);
  });

  it('L2.4 — notifyChannel:[] + lineNotify:false → renders nothing', () => {
    const { container } = render(<AppointmentLineBadge appt={{ id: 'a4', notifyChannel: [], lineNotify: false }} />);
    expect(container.textContent).toBe('');
  });

  it('L2.5 — appt with no notifyChannel + no lineNotify → defensive null', () => {
    const { container } = render(<AppointmentLineBadge appt={{ id: 'a5' }} />);
    expect(container.textContent).toBe('');
  });

  it('L2.6 — notifyChannel as string (shape drift) → defensive null (Array.isArray guard)', () => {
    const { container } = render(<AppointmentLineBadge appt={{ id: 'a6', notifyChannel: 'line' }} />);
    expect(container.textContent).toBe('');
  });

  it('L2.7 — appt is null → returns null', () => {
    const { container } = render(<AppointmentLineBadge appt={null} />);
    expect(container.textContent).toBe('');
  });

  it.each([
    ['xs', 'text-[10px]'],
    ['sm', 'text-xs'],
    ['md', 'text-sm'],
  ])('L2.8 — size="%s" applies %s class', (size, expectedClass) => {
    const { container } = render(<AppointmentLineBadge appt={{ id: 'a8', notifyChannel: ['line'] }} size={size} />);
    const span = container.querySelector('span');
    expect(span).toBeTruthy();
    expect(span.className).toContain(expectedClass);
  });

  it('L2.9 — invalid size falls back to sm', () => {
    const { container } = render(<AppointmentLineBadge appt={{ id: 'a9', notifyChannel: ['line'] }} size="huge" />);
    const span = container.querySelector('span');
    expect(span.className).toContain('text-xs'); // sm size class
  });
});

describe('V68 Rule Q L2 — CustomerLineBadge per-branch render verification', () => {
  it('L2.10 — linked at this branch via lineUserId_byBranch → renders 🟢 LINE', () => {
    const customer = {
      lineUserId_byBranch: { 'BR-A': { lineUserId: 'U123', lineDisplayName: 'Test User' } },
    };
    const { container } = render(<CustomerLineBadge customer={customer} contextBranchId="BR-A" />);
    expect(container.textContent).toMatch(/🟢\s*LINE/);
  });

  it('L2.11 — linked at OTHER branch only → renders ⚪️ LINE', () => {
    const customer = {
      lineUserId_byBranch: { 'BR-A': { lineUserId: 'U123' } },
    };
    const { container } = render(<CustomerLineBadge customer={customer} contextBranchId="BR-B" />);
    expect(container.textContent).toMatch(/⚪️\s*LINE/);
  });

  it('L2.12 — legacy customer.lineUserId at customer.branchId === contextBranchId → renders 🟢 LINE', () => {
    const customer = {
      lineUserId: 'U-legacy',
      branchId: 'BR-A',
    };
    const { container } = render(<CustomerLineBadge customer={customer} contextBranchId="BR-A" />);
    expect(container.textContent).toMatch(/🟢\s*LINE/);
  });

  it('L2.13 — legacy customer.lineUserId BUT customer.branchId !== contextBranchId → renders ⚪️ LINE', () => {
    const customer = {
      lineUserId: 'U-legacy',
      branchId: 'BR-A',
    };
    const { container } = render(<CustomerLineBadge customer={customer} contextBranchId="BR-B" />);
    expect(container.textContent).toMatch(/⚪️\s*LINE/);
  });

  it('L2.14 — not linked anywhere → renders null', () => {
    const customer = {};
    const { container } = render(<CustomerLineBadge customer={customer} contextBranchId="BR-A" />);
    expect(container.textContent).toBe('');
  });

  it('L2.15 — missing contextBranchId → defensive null', () => {
    const customer = { lineUserId: 'U-x', branchId: 'BR-A' };
    const { container } = render(<CustomerLineBadge customer={customer} contextBranchId="" />);
    expect(container.textContent).toBe('');
  });

  it('L2.16 — null customer → defensive null', () => {
    const { container } = render(<CustomerLineBadge customer={null} contextBranchId="BR-A" />);
    expect(container.textContent).toBe('');
  });
});
