// tests/v75-fb-settings-tab-rtl.test.jsx
// V75 Item 3 — FbSettingsTab RTL behavior tests.
// Adapted from plan: actual fbConfigClient uses direct Firestore (Task 13
// DROPPED — no /api/admin/fb-config-by-branch endpoint), so save path
// mocks fbConfigClient module (not fetch). testFbConnection still uses
// fetch (via fbTestClient) — that path mocks fetch.

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// fbConfigClient mocks (direct-Firestore path)
const mockGetFbConfig = vi.fn();
const mockSaveFbConfig = vi.fn();
const mockValidateFbConfig = vi.fn();

vi.mock('../src/lib/fbConfigClient.js', () => ({
  getFbConfig: (...a) => mockGetFbConfig(...a),
  saveFbConfig: (...a) => mockSaveFbConfig(...a),
  validateFbConfig: (...a) => mockValidateFbConfig(...a),
  DEFAULT_FB_CONFIG: {
    pageId: '',
    pageAccessToken: '',
    appSecret: '',
    verifyToken: '',
    displayName: '',
    enabled: false,
  },
}));

// fbTestClient mock (fetch-proxy)
const mockTestFbConnection = vi.fn();
vi.mock('../src/lib/fbTestClient.js', () => ({
  testFbConnection: (...a) => mockTestFbConnection(...a),
}));

vi.mock('../src/firebase.js', () => ({
  auth: { currentUser: { getIdToken: async () => 'tok' } },
  db: {},
  appId: 'loverclinic-opd-4c39b',
}));

vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({
    branchId: 'BR-NAKHON',
    branch: { name: 'นครราชสีมา' },
  }),
}));

import FbSettingsTab from '../src/components/backend/FbSettingsTab.jsx';

beforeEach(() => {
  vi.clearAllMocks();
  mockValidateFbConfig.mockReturnValue({ valid: true, errors: [] });
});
afterAll(() => {});

describe('V75 Item 3 — FbSettingsTab UI', () => {
  it('FST1.1 — renders 5 main sections (creds + test + enable + webhook URL)', async () => {
    mockGetFbConfig.mockResolvedValueOnce({
      pageId: '',
      pageAccessToken: '',
      appSecret: '',
      verifyToken: '',
      displayName: '',
      enabled: false,
    });
    render(<FbSettingsTab />);
    await waitFor(() => expect(mockGetFbConfig).toHaveBeenCalled());

    expect(screen.getByText(/ตั้งค่า FB Page/i)).toBeInTheDocument();
    // 5 input data-fields
    expect(document.querySelector('[data-field="fb-pageId"]')).toBeTruthy();
    expect(document.querySelector('[data-field="fb-pageAccessToken"]')).toBeTruthy();
    expect(document.querySelector('[data-field="fb-appSecret"]')).toBeTruthy();
    expect(document.querySelector('[data-field="fb-verifyToken"]')).toBeTruthy();
    expect(document.querySelector('[data-field="fb-displayName"]')).toBeTruthy();
    expect(document.querySelector('[data-field="fb-enabled"]')).toBeTruthy();
    // sections
    expect(screen.getByRole('button', { name: /ทดสอบการเชื่อมต่อ/ })).toBeInTheDocument();
    expect(screen.getByText(/Webhook URL/i)).toBeInTheDocument();
    expect(screen.getByText(/บันทึก/)).toBeInTheDocument();
  });

  it('FST1.2 — no auto-seed banner (AV195 — legacy chat_config auto-seed removed)', async () => {
    // 2026-06-13 (AV195) — the auto-seed banner was removed; getFbConfig never
    // returns _autoSeeded anymore. Even if a config arrives with a stray
    // _autoSeeded flag, FbSettingsTab must NOT render the legacy banner.
    mockGetFbConfig.mockResolvedValueOnce({
      pageId: 'PAGE',
      pageAccessToken: 'tok',
      appSecret: '',
      verifyToken: '',
      displayName: 'Lover Clinic นครราชสีมา',
      enabled: false,
      _autoSeeded: true,
    });
    render(<FbSettingsTab />);
    await waitFor(() => expect(screen.getByText(/บันทึก/)).toBeInTheDocument());
    expect(screen.queryByTestId('fb-auto-seed-banner')).not.toBeInTheDocument();
  });

  it('FST1.3 — save button calls saveFbConfig(branchId, cfg) with edited fields', async () => {
    mockGetFbConfig.mockResolvedValueOnce({
      pageId: '',
      pageAccessToken: '',
      appSecret: '',
      verifyToken: '',
      displayName: '',
      enabled: false,
    });
    mockSaveFbConfig.mockResolvedValueOnce({ ok: true });
    mockGetFbConfig.mockResolvedValueOnce({
      pageId: '12345',
      pageAccessToken: 'tok',
      appSecret: '',
      verifyToken: '',
      displayName: '',
      enabled: false,
    });
    render(<FbSettingsTab />);
    await waitFor(() => expect(mockGetFbConfig).toHaveBeenCalledTimes(1));

    const pageInput = document.querySelector('[data-field="fb-pageId"]');
    const tokenInput = document.querySelector('[data-field="fb-pageAccessToken"]');
    fireEvent.change(pageInput, { target: { value: '12345' } });
    fireEvent.change(tokenInput, { target: { value: 'tok' } });

    fireEvent.click(screen.getByText(/บันทึก/));
    await waitFor(() => expect(mockSaveFbConfig).toHaveBeenCalled());

    const [calledBranchId, calledCfg] = mockSaveFbConfig.mock.calls[0];
    expect(calledBranchId).toBe('BR-NAKHON');
    expect(calledCfg.pageId).toBe('12345');
    expect(calledCfg.pageAccessToken).toBe('tok');
  });

  it('FST1.4 — test connection surfaces FB-side error reason', async () => {
    mockGetFbConfig.mockResolvedValueOnce({
      pageId: '123',
      pageAccessToken: 'bad',
      appSecret: '',
      verifyToken: '',
      displayName: '',
      enabled: false,
    });
    mockTestFbConnection.mockResolvedValueOnce({
      ok: false,
      reason: 'Invalid OAuth access token',
    });
    render(<FbSettingsTab />);
    await waitFor(() => expect(mockGetFbConfig).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /ทดสอบการเชื่อมต่อ/ }));
    await waitFor(() =>
      expect(screen.getByTestId('fb-test-result')).toHaveTextContent(/Invalid OAuth/)
    );
  });

  it('FST1.5 — test connection happy path shows pageName', async () => {
    mockGetFbConfig.mockResolvedValueOnce({
      pageId: '12345',
      pageAccessToken: 'good',
      appSecret: '',
      verifyToken: '',
      displayName: '',
      enabled: false,
    });
    mockTestFbConnection.mockResolvedValueOnce({
      ok: true,
      pageId: '12345',
      pageName: 'Lover Clinic',
    });
    render(<FbSettingsTab />);
    await waitFor(() => expect(mockGetFbConfig).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /ทดสอบการเชื่อมต่อ/ }));
    await waitFor(() =>
      expect(screen.getByTestId('fb-test-result')).toHaveTextContent(/Lover Clinic/)
    );
  });

  it('FST1.6 — password-toggle on pageAccessToken (mask by default → reveal on click)', async () => {
    mockGetFbConfig.mockResolvedValueOnce({
      pageId: '',
      pageAccessToken: 'tok',
      appSecret: '',
      verifyToken: '',
      displayName: '',
      enabled: false,
    });
    render(<FbSettingsTab />);
    await waitFor(() => expect(mockGetFbConfig).toHaveBeenCalled());

    const tokenInput = document.querySelector('[data-field="fb-pageAccessToken"]');
    expect(tokenInput.type).toBe('password');
    fireEvent.click(screen.getByLabelText(/แสดง token/i));
    expect(tokenInput.type).toBe('text');
  });

  it('FST1.7 — validation errors surfaced (enabled=true without creds)', async () => {
    mockGetFbConfig.mockResolvedValueOnce({
      pageId: '',
      pageAccessToken: '',
      appSecret: '',
      verifyToken: '',
      displayName: '',
      enabled: false,
    });
    mockValidateFbConfig.mockReturnValueOnce({
      valid: false,
      errors: ['เปิดใช้งาน FB Page ต้องกรอก Page ID + Page Access Token'],
    });
    render(<FbSettingsTab />);
    await waitFor(() => expect(mockGetFbConfig).toHaveBeenCalled());

    fireEvent.click(screen.getByText(/บันทึก/));
    await waitFor(() =>
      expect(screen.getByText(/ต้องกรอก Page ID/)).toBeInTheDocument()
    );
    expect(mockSaveFbConfig).not.toHaveBeenCalled();
  });

  it('FST1.8 — V75 marker comment in source', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/components/backend/FbSettingsTab.jsx', 'utf8');
    expect(src).toMatch(/V75 Item 3/);
  });

  it('FST1.9 — uses BranchContext + fbConfigClient + fbTestClient (3 imports)', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/components/backend/FbSettingsTab.jsx', 'utf8');
    expect(src).toMatch(/BranchContext\.jsx/);
    expect(src).toMatch(/fbConfigClient/);
    expect(src).toMatch(/fbTestClient/);
  });
});
