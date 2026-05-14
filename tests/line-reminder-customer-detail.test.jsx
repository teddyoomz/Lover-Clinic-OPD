// ─── T12 — CustomerLineSection (LINE OA Appointment Reminder) ───
// Task 12 (LINE OA Appointment Reminder, 2026-05-15) — spec §5 D.
// Renders the "การแจ้งเตือน LINE" section on the Customer Detail page:
//   • Per-branch LINE linkages list (customer.lineUserId_byBranch)
//   • Legacy V32-tris-ter fallback (customer.lineUserId + customer.branchId)
//   • Stale-link warning chip when _lineStale === true
//   • Global opt-out toggle (notifyOptOut), with sub-text when opt-out
//     came from a customer DM ("ลูกค้าเลือกปิดเอง").
//
// Tests verify: T12.1 per-branch list, T12.2 stale warning, T12.3 toggle.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CustomerLineSection } from '../src/components/backend/CustomerLineSection.jsx';

describe('T12 CustomerLineSection', () => {
  it('T12.1 shows per-branch linkages list', () => {
    const c = {
      lineUserId_byBranch: {
        'BR-A': { lineUserId: 'U-A', lineDisplayName: 'OakA', linkedAt: '2026-05-15T00:00:00Z' },
        'BR-B': { lineUserId: 'U-B', lineDisplayName: 'OakB', linkedAt: '2026-05-15T00:00:00Z' },
      },
    };
    const branchesById = {
      'BR-A': { branchName: 'Nakhon' },
      'BR-B': { branchName: 'Rama3' },
    };
    render(
      <CustomerLineSection
        customer={c}
        branchesById={branchesById}
        onToggleOptOut={() => {}}
      />,
    );
    expect(screen.getByText(/Nakhon/)).toBeInTheDocument();
    expect(screen.getByText(/Rama3/)).toBeInTheDocument();
    expect(screen.getByText(/OakA/)).toBeInTheDocument();
  });

  it('T12.2 stale branch shows warning chip', () => {
    const c = {
      lineUserId_byBranch: {
        'BR-A': { lineUserId: 'U', _lineStale: true },
      },
    };
    render(
      <CustomerLineSection
        customer={c}
        branchesById={{ 'BR-A': { branchName: 'A' } }}
        onToggleOptOut={() => {}}
      />,
    );
    expect(
      screen.getByText(/หมดอายุ|ถูกบล็อก|unfollow/i),
    ).toBeInTheDocument();
  });

  it('T12.3 opt-out toggle reflects state', () => {
    render(
      <CustomerLineSection
        customer={{ notifyOptOut: true }}
        branchesById={{}}
        onToggleOptOut={() => {}}
      />,
    );
    expect(
      screen.getByRole('checkbox', { name: /ปิดรับแจ้งเตือน/ }),
    ).toBeChecked();
  });
});
