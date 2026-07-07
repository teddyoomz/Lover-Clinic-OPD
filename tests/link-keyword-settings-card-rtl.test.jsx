import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// ─── KeywordSettingsCard RTL (2026-07-07) ────────────────────────────────────
// The "คำที่ใช้ผูกบัญชี" card in LinkRequestsTab: load chips → add/remove →
// save through the REAL validator path (saveIdLinkKeywords is mocked at the
// CLIENT layer; validation behavior itself is covered by the unit bank in
// tests/line-link-keywords-configurable.test.js C-group).

const mockGet = vi.fn();
const mockSave = vi.fn();
vi.mock('../src/lib/idLinkKeywordsClient.js', () => ({
  getIdLinkKeywords: (...a) => mockGet(...a),
  saveIdLinkKeywords: (...a) => mockSave(...a),
}));
vi.mock('../src/firebase.js', () => ({ auth: { currentUser: { uid: 'staff-1' } }, db: {}, appId: 'test-app' }));
vi.mock('../src/lib/linkRequestsClient.js', () => ({
  listLinkRequests: vi.fn(async () => ({ items: [] })),
  approveLinkRequest: vi.fn(),
  rejectLinkRequest: vi.fn(),
}));
vi.mock('../src/lib/customerLineLinkClient.js', () => ({
  listLinkedCustomers: vi.fn(async () => ({ items: [] })),
  suspendLineLink: vi.fn(), resumeLineLink: vi.fn(), unlinkLineAccount: vi.fn(), updateLineLinkLanguage: vi.fn(),
}));
vi.mock('../src/lib/BranchContext.jsx', () => ({ useSelectedBranch: () => ({ branchId: 'BR-1' }) }));

import LinkRequestsTab from '../src/components/backend/LinkRequestsTab.jsx';

beforeEach(() => {
  mockGet.mockReset().mockResolvedValue(['ผูก', 'ผูกบัญชี', 'link']);
  mockSave.mockReset().mockResolvedValue({ ok: true, keywords: ['ผูก', 'ผูกบัญชี', 'link'] });
});

describe('KeywordSettingsCard', () => {
  it('K1: renders the stored keywords as chips after load', async () => {
    render(<LinkRequestsTab />);
    await waitFor(() => expect(screen.getByTestId('link-keyword-chip-0')).toBeTruthy());
    expect(screen.getByTestId('link-keyword-chip-0').textContent).toContain('ผูก');
    expect(screen.getByTestId('link-keyword-chip-1').textContent).toContain('ผูกบัญชี');
    expect(screen.getByTestId('link-keyword-chip-2').textContent).toContain('link');
  });

  it('K2: add a word (Enter key) → chip appears; save sends the full list + uid', async () => {
    mockSave.mockResolvedValue({ ok: true, keywords: ['ผูก', 'ผูกบัญชี', 'link', 'เชื่อม'] });
    render(<LinkRequestsTab />);
    await waitFor(() => expect(screen.getByTestId('link-keyword-input')).toBeTruthy());
    fireEvent.change(screen.getByTestId('link-keyword-input'), { target: { value: 'เชื่อม' } });
    fireEvent.keyDown(screen.getByTestId('link-keyword-input'), { key: 'Enter' });
    expect(screen.getByTestId('link-keyword-chip-3').textContent).toContain('เชื่อม');
    fireEvent.click(screen.getByTestId('link-keyword-save'));
    await waitFor(() => expect(mockSave).toHaveBeenCalledWith(['ผูก', 'ผูกบัญชี', 'link', 'เชื่อม'], 'staff-1'));
    await waitFor(() => expect(screen.getByTestId('link-keywords-msg').textContent).toContain('บันทึกแล้ว'));
  });

  it('K3: remove a chip → excluded from the saved list', async () => {
    render(<LinkRequestsTab />);
    await waitFor(() => expect(screen.getByTestId('link-keyword-remove-0')).toBeTruthy());
    fireEvent.click(screen.getByTestId('link-keyword-remove-0')); // ลบ "ผูก"
    fireEvent.click(screen.getByTestId('link-keyword-save'));
    await waitFor(() => expect(mockSave).toHaveBeenCalledWith(['ผูกบัญชี', 'link'], 'staff-1'));
  });

  it('K4: validation error from save renders the Thai error copy', async () => {
    mockSave.mockResolvedValue({ ok: false, error: 'ต้องมีอย่างน้อย 1 คำ' });
    render(<LinkRequestsTab />);
    await waitFor(() => expect(screen.getByTestId('link-keyword-save')).toBeTruthy());
    fireEvent.click(screen.getByTestId('link-keyword-save'));
    await waitFor(() => expect(screen.getByTestId('link-keywords-msg').textContent).toContain('ต้องมีอย่างน้อย 1 คำ'));
  });

  it('K5: save throwing (network/rules) surfaces a failure message — no crash', async () => {
    mockSave.mockRejectedValue(new Error('permission-denied'));
    render(<LinkRequestsTab />);
    await waitFor(() => expect(screen.getByTestId('link-keyword-save')).toBeTruthy());
    fireEvent.click(screen.getByTestId('link-keyword-save'));
    await waitFor(() => expect(screen.getByTestId('link-keywords-msg').textContent).toContain('บันทึกไม่สำเร็จ'));
  });

  it('K6: getIdLinkKeywords rejection → card degrades (empty list) without crashing the tab', async () => {
    mockGet.mockRejectedValue(new Error('offline'));
    render(<LinkRequestsTab />);
    await waitFor(() => expect(screen.getByTestId('link-keyword-save')).toBeTruthy());
    expect(screen.queryByTestId('link-keyword-chip-0')).toBeNull();
  });
});
