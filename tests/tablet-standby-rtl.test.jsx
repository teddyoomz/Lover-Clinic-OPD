import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

let cachedName = '';
vi.mock('../src/lib/tabletDeviceCache.js', () => ({
  getCachedDeviceName: () => cachedName, setCachedDeviceName: (v) => { cachedName = v; },
  getCachedBranchId: () => 'BR-x', setCachedBranchId: vi.fn(), getOrCreateDeviceId: () => 'TEST-T1',
}));
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branches: [{ branchId: 'BR-x', name: 'นครราชสีมา' }], branchId: 'BR-x', selectBranch: vi.fn(), isReady: true }),
}));
const presenceSpy = vi.fn();
vi.mock('../src/hooks/useTabletPresence.js', () => ({ useTabletPresence: (a) => { presenceSpy(a); return { setBusy: () => {}, setIdle: () => {} }; } }));

import TabletStandby from '../src/components/tablet-chart/TabletStandby.jsx';

beforeEach(() => { cachedName = ''; presenceSpy.mockClear(); });

describe('TabletStandby (T5)', () => {
  it('S1 no cached name → asks for name, presence disabled', () => {
    render(<TabletStandby deviceId="TEST-T1" uid="u1" byName="A" />);
    expect(screen.getByTestId('standby-name-input')).toBeTruthy();
    expect(presenceSpy).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
  });
  it('S2 saving a name enables presence (ready)', () => {
    render(<TabletStandby deviceId="TEST-T1" uid="u1" byName="A" />);
    fireEvent.change(screen.getByTestId('standby-name-input'), { target: { value: 'iPad ห้อง 1' } });
    fireEvent.click(screen.getByTestId('standby-name-save'));
    expect(presenceSpy).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true, deviceName: 'iPad ห้อง 1', branchId: 'BR-x' }));
  });
  it('S3 branch dropdown lists branches by name', () => {
    render(<TabletStandby deviceId="TEST-T1" uid="u1" byName="A" />);
    expect(screen.getByRole('option', { name: 'นครราชสีมา' })).toBeTruthy();
  });
});
