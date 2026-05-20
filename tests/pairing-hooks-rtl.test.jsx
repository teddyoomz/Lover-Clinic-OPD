import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const upsert = vi.fn(() => Promise.resolve());
const free = vi.fn(() => Promise.resolve());
const createSession = vi.fn(() => Promise.resolve());
const updateSession = vi.fn(() => Promise.resolve());
const deleteSession = vi.fn(() => Promise.resolve());
const uploadImg = vi.fn(() => Promise.resolve('https://storage/template.png'));
const downloadImg = vi.fn(() => Promise.resolve('data:image/png;base64,RESULT'));
const cleanup = vi.fn(() => Promise.resolve());
let sessionOnChange = null;
const listenSession = vi.fn((id, onChange) => { sessionOnChange = onChange; return () => { sessionOnChange = null; }; });

vi.mock('../src/lib/chartEditSession.js', () => ({
  upsertChartTabletPresence: (...a) => upsert(...a),
  freeChartTablet: (...a) => free(...a),
  createChartEditSession: (...a) => createSession(...a),
  listenToChartEditSession: (...a) => listenSession(...a),
  updateChartEditSession: (...a) => updateSession(...a),
  deleteChartEditSession: (...a) => deleteSession(...a),
  uploadTransportImage: (...a) => uploadImg(...a),
  downloadTransportImageAsDataUrl: (...a) => downloadImg(...a),
  cleanupSessionStorage: (...a) => cleanup(...a),
}));

import { useTabletPresence } from '../src/hooks/useTabletPresence.js';
import { useChartEditSession } from '../src/hooks/useChartEditSession.js';

describe('useTabletPresence (T3)', () => {
  beforeEach(() => { vi.useFakeTimers(); upsert.mockClear(); free.mockClear(); });
  afterEach(() => { vi.useRealTimers(); });
  it('H1 upserts on mount then heartbeats on the interval', () => {
    renderHook(() => useTabletPresence({ deviceId: 'TEST-T1', deviceName: 'iPad 1', branchId: 'BR-x', uid: 'u1', byName: 'A', enabled: true }));
    expect(upsert).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(10000); });
    expect(upsert).toHaveBeenCalledTimes(2);
  });
  it('H2 disabled (no branch yet) → no upsert', () => {
    renderHook(() => useTabletPresence({ deviceId: 'TEST-T1', enabled: false }));
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('useChartEditSession (T3)', () => {
  beforeEach(() => { vi.useRealTimers(); createSession.mockClear(); uploadImg.mockClear(); updateSession.mockClear(); downloadImg.mockClear(); deleteSession.mockClear(); sessionOnChange = null; });
  const startArgs = (over = {}) => ({ tablet: { deviceId: 'TEST-T1', deviceName: 'iPad 1' }, template: { id: 'tpl', name: 'face', category: 'head' }, patientLabel: 'คุณ มะลิ', templateDataUrl: 'data:image/png;base64,TPL', branchId: 'BR-x', ...over });
  it('H3 start → creates session + uploads template + phase waiting', async () => {
    const { result } = renderHook(() => useChartEditSession({ pcDeviceId: 'PC1', pcUid: 'u1', onSaved: vi.fn() }));
    await act(async () => { await result.current.start(startArgs()); });
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ tabletDeviceId: 'TEST-T1', branchId: 'BR-x', pcDeviceId: 'PC1' }));
    expect(uploadImg).toHaveBeenCalledWith(expect.any(String), 'template', 'data:image/png;base64,TPL');
    expect(result.current.phase).toBe('waiting');
  });
  it('H4 a saved session doc → onSaved fires with tablet chart data + cleanup', async () => {
    const onSaved = vi.fn();
    const { result } = renderHook(() => useChartEditSession({ pcDeviceId: 'PC1', pcUid: 'u1', onSaved }));
    await act(async () => { await result.current.start(startArgs()); });
    await act(async () => { await sessionOnChange({ status: 'saved', resultImageUrl: 'https://storage/result.png', template: { id: 'tpl' }, tabletDeviceId: 'TEST-T1' }); });
    expect(downloadImg).toHaveBeenCalledWith('https://storage/result.png');
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ source: 'tablet', fabricJson: null, templateId: 'tpl', dataUrl: 'data:image/png;base64,RESULT' }));
    expect(deleteSession).toHaveBeenCalled();
  });
  it('H5 a cancelled-by-tablet doc → phase failed', async () => {
    const { result } = renderHook(() => useChartEditSession({ pcDeviceId: 'PC1', pcUid: 'u1', onSaved: vi.fn() }));
    await act(async () => { await result.current.start(startArgs()); });
    await act(async () => { await sessionOnChange({ status: 'cancelled', cancelledBy: 'tablet', tabletDeviceId: 'TEST-T1' }); });
    expect(result.current.phase).toBe('failed');
    expect(result.current.error).toMatch(/ยกเลิก/);
  });
  it('H6 TABLET_BUSY on create → phase failed with busy message', async () => {
    createSession.mockImplementationOnce(() => { const e = new Error('TABLET_BUSY'); e.code = 'TABLET_BUSY'; return Promise.reject(e); });
    const { result } = renderHook(() => useChartEditSession({ pcDeviceId: 'PC1', pcUid: 'u1', onSaved: vi.fn() }));
    await act(async () => { await result.current.start(startArgs()); });
    expect(result.current.phase).toBe('failed');
    expect(result.current.error).toMatch(/กำลังถูกใช้งาน/);
  });
});
