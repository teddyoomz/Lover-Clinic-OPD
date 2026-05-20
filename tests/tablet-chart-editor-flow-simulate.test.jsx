import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { isPresenceReady } from '../src/lib/chartEditSessionCore.js';

// ── Rule I full-flow simulate. A shared in-memory store stands in for Firestore +
// Storage; the REAL useChartEditSession hook (PC) drives it, and helper fns simulate
// the tablet. This chains the WHOLE lifecycle: createSession (TX guard) → tablet
// open/active → save (upload) → PC merge into charts[] → presence freed, plus the
// cancel-from-each-side + 2-PC TABLET_BUSY branches. ──
const store = { sessions: new Map(), presence: new Map(), blobs: new Map(), listeners: new Map(), seq: 0 };
function reset() { store.sessions.clear(); store.presence.clear(); store.blobs.clear(); store.listeners.clear(); store.seq = 0; }
function fire(id) { const cb = store.listeners.get(id); if (cb) cb(store.sessions.get(id) || null); }

vi.mock('../src/lib/chartEditSession.js', () => ({
  createChartEditSession: vi.fn(async (payload) => {
    const pres = store.presence.get(payload.tabletDeviceId);
    if (pres && pres.status === 'busy') { const e = new Error('TABLET_BUSY'); e.code = 'TABLET_BUSY'; throw e; }
    if (!isPresenceReady(pres, Date.now())) { const e = new Error('TABLET_OFFLINE'); e.code = 'TABLET_OFFLINE'; throw e; }
    store.presence.set(payload.tabletDeviceId, { ...pres, status: 'busy' });   // TX guard: claim the tablet
    store.sessions.set(payload.sessionId, { ...payload, status: 'requested', cancelledBy: null, templateImageUrl: null, resultImageUrl: null, tabletHeartbeatAt: null });
  }),
  listenToChartEditSession: vi.fn((id, onChange) => { store.listeners.set(id, onChange); onChange(store.sessions.get(id) || null); return () => store.listeners.delete(id); }),
  updateChartEditSession: vi.fn(async (id, patch) => { const cur = store.sessions.get(id); if (cur) { store.sessions.set(id, { ...cur, ...patch }); fire(id); } }),
  deleteChartEditSession: vi.fn(async (id) => { store.sessions.delete(id); }),
  freeChartTablet: vi.fn(async (deviceId) => { const p = store.presence.get(deviceId); if (p) store.presence.set(deviceId, { ...p, status: 'idle' }); }),
  uploadTransportImage: vi.fn(async (id, kind, dataUrl) => { const url = `mem://${kind}/${store.seq++}`; store.blobs.set(url, dataUrl); return url; }),
  downloadTransportImageAsDataUrl: vi.fn(async (url) => store.blobs.get(url)),
  cleanupSessionStorage: vi.fn(async () => {}),
}));

import { useChartEditSession } from '../src/hooks/useChartEditSession.js';

function seedReadyTablet(deviceId = 'TEST-T1') { store.presence.set(deviceId, { deviceId, status: 'idle', lastHeartbeatAt: Date.now() }); }
const firstSessionId = () => [...store.sessions.keys()][0];
async function tabletOpen(id) { const s = store.sessions.get(id); store.sessions.set(id, { ...s, status: 'active', tabletHeartbeatAt: Date.now() }); fire(id); }
async function tabletSave(id, dataUrl = 'data:image/png;base64,DRAWN') { const url = `mem://result/${store.seq++}`; store.blobs.set(url, dataUrl); const s = store.sessions.get(id); store.sessions.set(id, { ...s, status: 'saved', resultImageUrl: url }); fire(id); }
async function tabletCancel(id) { const s = store.sessions.get(id); store.sessions.set(id, { ...s, status: 'cancelled', cancelledBy: 'tablet' }); fire(id); }
const startArgs = (over = {}) => ({ tablet: { deviceId: 'TEST-T1', deviceName: 'iPad 1' }, template: { id: 'tpl', name: 'face', category: 'head' }, patientLabel: 'คุณ มะลิ', templateDataUrl: 'data:image/png;base64,TPL', branchId: 'BR-x', ...over });

beforeEach(() => { reset(); });

describe('Rule I — tablet chart editor full-flow simulate', () => {
  it('F1 happy path: start → tablet open → save → PC merges charts[] + tablet freed + session deleted', async () => {
    seedReadyTablet();
    const onSaved = vi.fn();
    const { result } = renderHook(() => useChartEditSession({ pcDeviceId: 'PC1', pcUid: 'u1', onSaved }));
    await act(async () => { await result.current.start(startArgs()); });
    const id = firstSessionId();
    expect(store.sessions.get(id).status).toBe('requested');
    expect(store.presence.get('TEST-T1').status).toBe('busy');           // TX claimed the tablet
    await act(async () => { await tabletOpen(id); });
    expect(store.sessions.get(id).status).toBe('active');
    await act(async () => { await tabletSave(id); });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ source: 'tablet', fabricJson: null, templateId: 'tpl', dataUrl: 'data:image/png;base64,DRAWN' }));
    expect(store.presence.get('TEST-T1').status).toBe('idle');           // freed after save
    expect(store.sessions.has(id)).toBe(false);                          // deleted
    expect(result.current.phase).toBe('idle');
  });
  it('F2 tablet cancels → PC phase failed (แท็บเล็ตยกเลิก)', async () => {
    seedReadyTablet();
    const { result } = renderHook(() => useChartEditSession({ pcDeviceId: 'PC1', pcUid: 'u1', onSaved: vi.fn() }));
    await act(async () => { await result.current.start(startArgs()); });
    await act(async () => { await tabletOpen(firstSessionId()); });
    await act(async () => { await tabletCancel(firstSessionId()); });
    expect(result.current.phase).toBe('failed');
    expect(result.current.error).toMatch(/ยกเลิก/);
  });
  it('F3 PC cancels → session cancelled/pc + tablet freed (tablet would receive it)', async () => {
    seedReadyTablet();
    const { result } = renderHook(() => useChartEditSession({ pcDeviceId: 'PC1', pcUid: 'u1', onSaved: vi.fn() }));
    await act(async () => { await result.current.start(startArgs()); });
    const id = firstSessionId();
    await act(async () => { await tabletOpen(id); });
    await act(async () => { await result.current.cancel(); });
    expect(store.sessions.get(id).status).toBe('cancelled');
    expect(store.sessions.get(id).cancelledBy).toBe('pc');
    expect(store.presence.get('TEST-T1').status).toBe('idle');
  });
  it('F4 a 2nd PC cannot start on a busy tablet (TABLET_BUSY)', async () => {
    seedReadyTablet();
    const pc1 = renderHook(() => useChartEditSession({ pcDeviceId: 'PC1', pcUid: 'u1', onSaved: vi.fn() }));
    await act(async () => { await pc1.result.current.start(startArgs()); });
    const pc2 = renderHook(() => useChartEditSession({ pcDeviceId: 'PC2', pcUid: 'u2', onSaved: vi.fn() }));
    await act(async () => { await pc2.result.current.start(startArgs()); });
    expect(pc2.result.current.phase).toBe('failed');
    expect(pc2.result.current.error).toMatch(/กำลังถูกใช้งาน/);
  });
  it('F6 a stale/offline tablet → TABLET_OFFLINE (accurate message, not "in use")', async () => {
    store.presence.set('TEST-T1', { deviceId: 'TEST-T1', status: 'idle', lastHeartbeatAt: Date.now() - 60000 }); // 60s stale
    const { result } = renderHook(() => useChartEditSession({ pcDeviceId: 'PC1', pcUid: 'u1', onSaved: vi.fn() }));
    await act(async () => { await result.current.start(startArgs()); });
    expect(result.current.phase).toBe('failed');
    expect(result.current.error).toMatch(/ไม่พร้อม|หลุดการเชื่อมต่อ/);
    expect(result.current.error).not.toMatch(/กำลังถูกใช้งาน/);
  });
  it('F5 image bytes travel via Storage, NEVER in the session doc', async () => {
    seedReadyTablet();
    const { result } = renderHook(() => useChartEditSession({ pcDeviceId: 'PC1', pcUid: 'u1', onSaved: vi.fn() }));
    await act(async () => { await result.current.start(startArgs({ templateDataUrl: 'data:image/png;base64,' + 'A'.repeat(2_000_000) })); });
    const id = firstSessionId();
    const doc = store.sessions.get(id);
    expect(typeof doc.templateImageUrl).toBe('string');
    expect(doc.templateImageUrl.startsWith('mem://')).toBe(true);        // a URL, not the bytes
    expect(JSON.stringify(doc).length).toBeLessThan(5000);               // doc stays tiny (no base64 payload)
  });
});
