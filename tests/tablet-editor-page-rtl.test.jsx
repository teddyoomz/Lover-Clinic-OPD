import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';

const update = vi.fn(() => Promise.resolve());
const upload = vi.fn(() => Promise.resolve('https://storage/result.png'));
const uploadJson = vi.fn(() => Promise.resolve('https://storage/result.json'));
const download = vi.fn(() => Promise.resolve('data:image/png;base64,TPL'));
const free = vi.fn(() => Promise.resolve());
const standbySpy = vi.fn();
let requestedCb = null;
let sessionCb = null;

vi.mock('../src/lib/chartEditSession.js', () => ({
  listenToRequestedSessionForTablet: (opts, onChange) => { requestedCb = onChange; return () => {}; },
  listenToChartEditSession: (id, onChange) => { sessionCb = onChange; return () => {}; },
  updateChartEditSession: (...a) => update(...a),
  freeChartTablet: (...a) => free(...a),
  uploadTransportImage: (...a) => upload(...a),
  uploadTransportJson: (...a) => uploadJson(...a),
  downloadTransportImageAsDataUrl: (...a) => download(...a),
}));
vi.mock('../src/lib/BranchContext.jsx', () => ({ useSelectedBranch: () => ({ branchId: 'BR-x', branches: [], selectBranch: vi.fn(), isReady: true }) }));
vi.mock('../src/firebase.js', () => ({ auth: { currentUser: { uid: 'u1', email: 'a@x.com', displayName: 'Dr A' } } }));
vi.mock('../src/lib/tabletDeviceCache.js', () => ({ getOrCreateDeviceId: () => 'TEST-T1' }));
vi.mock('../src/components/tablet-chart/TabletStandby.jsx', () => ({ default: (props) => { standbySpy(props); return <div data-testid="standby-stub">standby</div>; } }));
vi.mock('../src/components/tablet-chart/TabletChartCanvas.jsx', () => ({
  default: forwardRef((props, ref) => {
    useImperativeHandle(ref, () => ({ exportDataUrl: () => 'data:image/png;base64,DRAWN', exportFabricJson: () => '{"objects":[]}', undo: () => {}, redo: () => {}, clear: () => {}, deleteSelected: () => {} }));
    return <div data-testid="tablet-canvas-stub" />;
  }),
}));

import TabletChartEditorPage from '../src/pages/TabletChartEditorPage.jsx';

const requested = { sessionId: 'CES-1', template: { id: 'tpl', name: 'ใบหน้า' }, patientLabel: 'คุณ มะลิ', templateImageUrl: 'https://storage/template.png', tabletDeviceId: 'TEST-T1' };

beforeEach(() => { update.mockClear(); upload.mockClear(); uploadJson.mockClear(); download.mockClear(); free.mockClear(); standbySpy.mockClear(); requestedCb = null; sessionCb = null; });

describe('TabletChartEditorPage (T6)', () => {
  it('E1 standby until a requested session arrives', () => {
    render(<TabletChartEditorPage />);
    expect(screen.getByTestId('standby-stub')).toBeTruthy();
  });
  it('E6 presence stays busy while editing (standby kept mounted, busy flips true)', async () => {
    render(<TabletChartEditorPage />);
    expect(standbySpy).toHaveBeenLastCalledWith(expect.objectContaining({ busy: false }));
    await act(async () => { await requestedCb(requested); });
    expect(standbySpy).toHaveBeenLastCalledWith(expect.objectContaining({ busy: true }));
  });
  it('E2 requested session → editor pops (active) + marks active', async () => {
    render(<TabletChartEditorPage />);
    await act(async () => { await requestedCb(requested); });
    expect(await screen.findByTestId('editor-save')).toBeTruthy();
    expect(screen.getByTestId('tablet-canvas-stub')).toBeTruthy();
    expect(update).toHaveBeenCalledWith('CES-1', expect.objectContaining({ status: 'active' }));
  });
  it('E3 save → upload result + status saved + free tablet', async () => {
    render(<TabletChartEditorPage />);
    await act(async () => { await requestedCb(requested); });
    await act(async () => { fireEvent.click(screen.getByTestId('editor-save')); });
    await waitFor(() => expect(upload).toHaveBeenCalledWith('CES-1', 'result', 'data:image/png;base64,DRAWN'));
    await waitFor(() => expect(uploadJson).toHaveBeenCalledWith('CES-1', 'result', { objects: [] }));
    expect(update).toHaveBeenCalledWith('CES-1', expect.objectContaining({ status: 'saved', resultImageUrl: 'https://storage/result.png', resultFabricJsonUrl: 'https://storage/result.json' }));
    await waitFor(() => expect(free).toHaveBeenCalledWith('TEST-T1'));
  });
  it('E4 cancel → status cancelled by tablet', async () => {
    render(<TabletChartEditorPage />);
    await act(async () => { await requestedCb(requested); });
    await act(async () => { fireEvent.click(screen.getByTestId('editor-cancel')); });
    await waitFor(() => expect(update).toHaveBeenCalledWith('CES-1', expect.objectContaining({ status: 'cancelled', cancelledBy: 'tablet' })));
  });
  it('E5 PC cancels (session listener) → notice + back to standby', async () => {
    render(<TabletChartEditorPage />);
    await act(async () => { await requestedCb(requested); });
    await act(async () => { sessionCb({ status: 'cancelled', cancelledBy: 'pc' }); });
    expect(await screen.findByTestId('editor-notice')).toBeTruthy();
  });
});
