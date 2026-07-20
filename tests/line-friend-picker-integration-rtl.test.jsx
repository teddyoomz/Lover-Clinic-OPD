// ─── LINE Friend Picker (2026-07-20) — surface integrations (Task 8) ─────────
// I1 InfraHealthSection: ปุ่มเลือกจากรายชื่อ per lineTargets row → picker →
// onPick fills userId + label + branchId. I2 LinkLineInstructionsModal
// (UNLINKED): ปุ่มผูกจากรายชื่อเพื่อน → picker mode=bind → bind endpoint call.
// Source-grep anchors กัน silent regression ของ save path + old flows.
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'fs';

const ORIGINAL_FETCH = global.fetch;
let pickerProps = null;

vi.mock('../src/components/backend/LineFriendPickerModal.jsx', () => ({
  default: (props) => {
    pickerProps = props;
    return props.open ? <div data-testid="picker-stub" /> : null;
  },
}));
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  getAdminAuditDoc: vi.fn(async () => null),
  listBranches: vi.fn(async () => ([{ id: 'BR-A', name: 'นครราชสีมา' }])),
}));
vi.mock('../src/lib/systemConfigClient.js', () => ({
  saveSystemConfig: vi.fn(async () => ({})),
}));
vi.mock('../src/lib/clientErrorCore.js', () => ({
  groupClientErrors: vi.fn(() => []),
}));
vi.mock('../src/firebase.js', () => ({
  auth: { currentUser: { uid: 'admin-1', getIdToken: async () => 'tok' } },
}));
vi.mock('../src/lib/customerLineLinkClient.js', () => ({
  suspendLineLink: vi.fn(), resumeLineLink: vi.fn(), unlinkLineAccount: vi.fn(),
  updateLineLinkLanguage: vi.fn(),
}));

import InfraHealthSection from '../src/components/backend/InfraHealthSection.jsx';
import LinkLineInstructionsModal from '../src/components/backend/LinkLineInstructionsModal.jsx';

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  pickerProps = null;
  global.fetch = vi.fn(async () => ({ status: 200, json: async () => ({ ok: true, status: 'bound' }) }));
});
afterAll(() => {
  if (ORIGINAL_FETCH === undefined) delete global.fetch;
  else global.fetch = ORIGINAL_FETCH;
});

describe('I1 — InfraHealthSection lineTargets picker', () => {
  const config = { infraHealth: { lineTargets: [{ branchId: 'BR-A', lineUserId: '', label: '' }], staffChatBranchId: '' } };

  it('I1.1 target row has a เลือกจากรายชื่อ button that opens the picker with the row branch', async () => {
    render(<InfraHealthSection config={config} executedBy="admin" />);
    const btn = await screen.findByTestId('infra-line-target-pick-0');
    fireEvent.click(btn);
    expect(pickerProps?.open).toBe(true);
    expect(pickerProps?.branchId).toBe('BR-A');
    expect(pickerProps?.mode).toBe('pick');
  });

  it('I1.2 onPick fills lineUserId + label(=displayName when empty) + branchId(when row empty)', async () => {
    const cfg = { infraHealth: { lineTargets: [{ branchId: '', lineUserId: '', label: '' }], staffChatBranchId: '' } };
    render(<InfraHealthSection config={cfg} executedBy="admin" />);
    fireEvent.click(await screen.findByTestId('infra-line-target-pick-0'));
    pickerProps.onPick({ lineUserId: 'U-owner1', displayName: 'เจ้าของร้าน', branchId: 'BR-A' });
    await waitFor(() => {
      const row = screen.getByTestId('infra-line-target-0');
      const inputs = row.querySelectorAll('input');
      expect(inputs[0].value).toBe('U-owner1');       // lineUserId (font-mono input)
      expect(inputs[1].value).toBe('เจ้าของร้าน');     // label auto-filled from displayName
    });
  });

  it('I1.3 onPick does NOT clobber an existing label', async () => {
    const cfg = { infraHealth: { lineTargets: [{ branchId: 'BR-A', lineUserId: '', label: 'เจ้าของ' }], staffChatBranchId: '' } };
    render(<InfraHealthSection config={cfg} executedBy="admin" />);
    fireEvent.click(await screen.findByTestId('infra-line-target-pick-0'));
    pickerProps.onPick({ lineUserId: 'U-x', displayName: 'ชื่อไลน์', branchId: 'BR-A' });
    await waitFor(() => {
      const inputs = screen.getByTestId('infra-line-target-0').querySelectorAll('input');
      expect(inputs[1].value).toBe('เจ้าของ'); // preserved
    });
  });
});

describe('I2 — LinkLineInstructionsModal picker path', () => {
  const customer = {
    id: 'CUST-1', customerName: 'แพรพร พรแพร', customerHN: '000004',
    patientData: { nationalId: '1234567890123' },
  };

  it('I2.1 UNLINKED state shows ผูกจากรายชื่อเพื่อน button → opens picker mode=bind with customer', async () => {
    render(<LinkLineInstructionsModal customer={customer} onClose={vi.fn()} onActionSuccess={vi.fn()} />);
    const btn = await screen.findByTestId('pick-from-friends-btn');
    fireEvent.click(btn);
    expect(pickerProps?.open).toBe(true);
    expect(pickerProps?.mode).toBe('bind');
    expect(pickerProps?.customer).toMatchObject({ customerName: 'แพรพร พรแพร' });
  });

  it('I2.2 onPick → POST /api/admin/line-friends action=bind + success + onActionSuccess', async () => {
    const onActionSuccess = vi.fn();
    render(<LinkLineInstructionsModal customer={customer} onClose={vi.fn()} onActionSuccess={onActionSuccess} />);
    fireEvent.click(await screen.findByTestId('pick-from-friends-btn'));
    pickerProps.onPick({ lineUserId: 'U-bind1', displayName: 'ไลน์เอ' });
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/admin/line-friends', expect.objectContaining({ method: 'POST' }));
    });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ action: 'bind', customerId: 'CUST-1', lineUserId: 'U-bind1', displayName: 'ไลน์เอ' });
    await waitFor(() => expect(onActionSuccess).toHaveBeenCalledWith(expect.objectContaining({ action: 'bind-picker' })));
    expect(screen.getByTestId('line-link-success')).toBeTruthy();
  });

  it('I2.3 bind endpoint error surfaces Thai error (no silent swallow — V31 class)', async () => {
    global.fetch = vi.fn(async () => ({ status: 400, json: async () => ({ error: 'LINE บัญชีนี้ถูกผูกกับลูกค้าอื่นแล้ว' }) }));
    render(<LinkLineInstructionsModal customer={customer} onClose={vi.fn()} onActionSuccess={vi.fn()} />);
    fireEvent.click(await screen.findByTestId('pick-from-friends-btn'));
    pickerProps.onPick({ lineUserId: 'U-taken', displayName: 'X' });
    await waitFor(() => {
      expect(screen.getByTestId('line-link-error').textContent).toContain('ถูกผูกกับลูกค้าอื่น');
    });
  });

  it('I2.4 ALREADY-LINKED state does NOT show the picker button (bind only when unlinked)', () => {
    render(<LinkLineInstructionsModal customer={{ ...customer, lineUserId: 'U-already' }} onClose={vi.fn()} onActionSuccess={vi.fn()} />);
    expect(screen.queryByTestId('pick-from-friends-btn')).toBe(null);
  });
});

describe('I3 — silent-regression anchors (source-grep)', () => {
  it('I3.1 InfraHealthSection save path untouched (saveSystemConfig + SaveButton intact)', () => {
    const src = readFileSync('src/components/backend/InfraHealthSection.jsx', 'utf8');
    expect(src).toMatch(/saveSystemConfig/);
    expect(src).toMatch(/<SaveButton onClick=\{handleSave\}/);
    expect(src).toMatch(/lineTargets: \[\.\.\.d\.lineTargets, \{ branchId: '', lineUserId: '', label: '' \}\]/);
  });
  it('I3.2 LinkLineInstructionsModal old flows intact (instructions + suspend/resume/unlink)', () => {
    const src = readFileSync('src/components/backend/LinkLineInstructionsModal.jsx', 'utf8');
    expect(src).toMatch(/suspendLineLink/);
    expect(src).toMatch(/resumeLineLink/);
    expect(src).toMatch(/unlinkLineAccount/);
    expect(src).toMatch(/พิมพ์เลขบัตรประชาชน 13 หลัก/);
  });
});
