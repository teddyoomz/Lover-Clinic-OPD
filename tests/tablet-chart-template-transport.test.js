// @vitest-environment jsdom
// Bugfix regression — Tablet Chart Editor "ไม่ขึ้นรูป" (no template on iPad) + PC
// "เริ่มการเชื่อมต่อไม่สำเร็จ". Two coupled causes:
//   #1 (format) default chart templates store a PATH ('/chart-templates/face.svg'), not a
//      data URL → uploadString(...,'data_url') threw storage/invalid-format → PC generic catch
//      + templateImageUrl never set. Fix: resolveToDataUrl normalizes (data: passthrough /
//      path → fetch+convert / blank → null) at the transport chokepoint.
//   #2 (race) the tablet read templateImageUrl ONCE at instant-pop (still null) and ignored
//      the later update. Fix: tablet listener loads a late-arriving templateImageUrl.
// Plus defense-in-depth: PC cancels + frees the tablet if a post-create step fails.
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(__dir, p), 'utf8');

// AV41 global.fetch isolation (Phase 17.1 flake-fix) — R1/R2 assign global.fetch; restore it.
const ORIGINAL_FETCH = global.fetch;
afterAll(() => { if (ORIGINAL_FETCH === undefined) delete global.fetch; else global.fetch = ORIGINAL_FETCH; });

vi.mock('../src/firebase.js', () => ({ storage: {}, db: {}, auth: {}, appId: 'test' }));
vi.mock('firebase/storage', () => ({
  ref: vi.fn((_s, p) => ({ __path: p })),
  uploadString: vi.fn(async () => {}),
  getDownloadURL: vi.fn(async (r) => `https://dl.example/${r.__path}`),
  listAll: vi.fn(async () => ({ items: [] })),
  deleteObject: vi.fn(async () => {}),
}));
// chartEditSession.js re-exports the pairing fns from scopedDataLayer — stub it so the test
// doesn't pull backendClient/firebase wiring.
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listenToChartTabletPresenceByBranch: vi.fn(), listenToRequestedSessionForTablet: vi.fn(),
  upsertChartTabletPresence: vi.fn(), listenToChartEditSession: vi.fn(), createChartEditSession: vi.fn(),
  updateChartEditSession: vi.fn(), freeChartTablet: vi.fn(), deleteChartEditSession: vi.fn(),
}));

import { resolveToDataUrl, uploadTransportImage } from '../src/lib/chartEditSession.js';
import { uploadString } from 'firebase/storage';
import { defaultChartTemplates } from '../src/data/chartTemplates.js';

const SRC = read('../src/lib/chartEditSession.js');
const CHARTSEC = read('../src/components/ChartSection.jsx');
const HOOK = read('../src/hooks/useChartEditSession.js');
const TABPAGE = read('../src/pages/TabletChartEditorPage.jsx');

describe('Tablet Chart Editor — template transport normalization (bugfix)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ── R1 resolveToDataUrl ──
  it('R1.1 a data: URL passes through unchanged (no fetch)', async () => {
    global.fetch = vi.fn();
    const d = 'data:image/png;base64,AAAA';
    expect(await resolveToDataUrl(d)).toBe(d);
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('R1.2 empty / null / undefined / non-string → ""', async () => {
    expect(await resolveToDataUrl('')).toBe('');
    expect(await resolveToDataUrl(null)).toBe('');
    expect(await resolveToDataUrl(undefined)).toBe('');
    expect(await resolveToDataUrl(123)).toBe('');
  });
  it('R1.3 a PATH is fetched + converted to a data: URL (real FileReader)', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['<svg/>'], { type: 'image/svg+xml' }) }));
    const out = await resolveToDataUrl('/chart-templates/face-female.svg');
    expect(global.fetch).toHaveBeenCalledWith('/chart-templates/face-female.svg');
    expect(typeof out).toBe('string');
    expect(out.startsWith('data:')).toBe(true);
  });
  it('R1.4 fetch !ok → throws TEMPLATE_FETCH_FAILED with status', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 404 }));
    await expect(resolveToDataUrl('/missing.svg')).rejects.toMatchObject({ code: 'TEMPLATE_FETCH_FAILED', status: 404 });
  });

  // ── R2 uploadTransportImage routing (the chokepoint) ──
  it('R2.1 a PATH src uploads the CONVERTED data URL — never the raw path (the bug)', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['<svg/>'], { type: 'image/svg+xml' }) }));
    const url = await uploadTransportImage('TEST-CES-1', 'template', '/chart-templates/face-female.svg');
    expect(uploadString).toHaveBeenCalledTimes(1);
    const passed = uploadString.mock.calls[0][1];
    expect(passed.startsWith('data:')).toBe(true);
    expect(passed).not.toBe('/chart-templates/face-female.svg');
    expect(uploadString.mock.calls[0][2]).toBe('data_url');
    expect(typeof url).toBe('string');
  });
  it('R2.2 a data: src (canvas result) passes straight through to uploadString', async () => {
    global.fetch = vi.fn();
    const d = 'data:image/png;base64,DRAWN';
    await uploadTransportImage('TEST-CES-2', 'result', d);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(uploadString.mock.calls[0][1]).toBe(d);
  });
  it('R2.3 a blank/null template → returns null + NO uploadString (กระดาษเปล่า)', async () => {
    const url = await uploadTransportImage('TEST-CES-3', 'template', null);
    expect(url).toBe(null);
    expect(uploadString).not.toHaveBeenCalled();
  });

  // ── R3 producer-shape lock (V66 anti-regression: templates supply NON-data-URLs) ──
  it('R3.1 default chart templates supply PATHS or null — NEVER data URLs, so normalization is required', () => {
    for (const t of defaultChartTemplates) {
      if (t.imageUrl == null) continue;
      expect(t.imageUrl.startsWith('data:')).toBe(false);
      expect(t.imageUrl.startsWith('/')).toBe(true);
    }
    expect(defaultChartTemplates.find(t => t.id === 'face-female').imageUrl).toBe('/chart-templates/face-female.svg');
    expect(defaultChartTemplates.find(t => t.id === 'blank').imageUrl).toBe(null);
  });

  // ── R4 source-grep regression locks ──
  it('R4.1 uploadTransportImage routes through resolveToDataUrl', () => {
    expect(SRC).toMatch(/export async function uploadTransportImage[\s\S]*?resolveToDataUrl\(/);
  });
  it('R4.2 ChartSection passes the selector template imageUrl as templateDataUrl (re-edit sends the existing chart dataUrl)', () => {
    // re-edit-on-tablet: new chart → blank template imageUrl; re-edit → the existing chart's dataUrl (raster fallback)
    expect(CHARTSEC).toMatch(/templateDataUrl:\s*pendingChart \? pendingChart\.dataUrl : pendingTemplate\?\.imageUrl/);
  });
  it('R4.3 PC start cancels + frees the tablet on a post-create failure', () => {
    expect(HOOK).toMatch(/let created = false/);
    expect(HOOK).toMatch(/if \(created\)[\s\S]*?CANCELLED[\s\S]*?freeChartTablet/);
  });
  it('R4.4 tablet loads a late-arriving templateImageUrl via resolveSource (instant-pop race)', () => {
    // re-edit-on-tablet: the late-arrival handling moved into resolveSource(doc) (json-first, then
    // the raster PNG); the session listener routes late arrivals through it.
    expect(TABPAGE).toMatch(/doc\.templateImageUrl && doc\.templateImageUrl !== loadedUrl/);
    expect(TABPAGE).toMatch(/await resolveSource\(live\)/);
  });

  // ── R5 PC saved-handler MUST NOT hang on a download failure ──
  it('R5.1 the saved-merge wraps the result download in try/catch (no un-guarded await hang)', () => {
    // the merge block must guard the download so a throw can't leave the PC stuck "waiting"
    const merge = HOOK.slice(HOOK.indexOf('SESSION_STATUS.SAVED'));
    expect(merge).toMatch(/try\s*\{[\s\S]*downloadTransportImageAsDataUrl[\s\S]*\}\s*catch/);
  });
  it('R5.2 a failed result download surfaces phase=failed + still tears down (never infinite waiting)', () => {
    const merge = HOOK.slice(HOOK.indexOf('SESSION_STATUS.SAVED'));
    expect(merge).toMatch(/setPhase\('failed'\)/);
    expect(merge).toMatch(/teardown\(\);[\s\S]*if \(merged\) setPhase\('idle'\)/);
  });

  // ── R6 tablet picks the NEWEST requested session (not arbitrary docs[0]) ──
  it('R6.1 listenToRequestedSessionForTablet sorts requested sessions newest-first, not snap.docs[0]', () => {
    const bc = read('../src/lib/backendClient.js');
    const fn = bc.slice(bc.indexOf('export function listenToRequestedSessionForTablet'), bc.indexOf('export function listenToChartEditSession'));
    expect(fn).toMatch(/toMillis\(b\.createdAt\) - toMillis\(a\.createdAt\)/);
    expect(fn).not.toMatch(/snap\.docs\[0\]\.data\(\)/);
  });

  // ── R7 PenCanvas shows the template at its TRUE aspect ratio (contain, not stretch) ──
  it('R7.1 PenCanvas canvas does NOT stretch (no width:100%+height:100%); uses contain (max-width/height)', () => {
    const pc = read('../src/components/tablet-chart/PenCanvas.jsx');
    expect(pc).toMatch(/maxWidth:\s*'100%',\s*maxHeight:\s*'100%'/);
    // the stretch pattern (both width AND height 100%) must be gone from the canvas style
    expect(pc).not.toMatch(/touchAction:\s*'none',\s*width:\s*'100%',\s*height:\s*'100%'/);
  });
  it('R7.2 PenCanvas sizes the drawing buffer to the image REAL ratio (naturalWidth/Height), not a fixed buffer', () => {
    const pc = read('../src/components/tablet-chart/PenCanvas.jsx');
    expect(pc).toMatch(/img\.naturalWidth/);
    expect(pc).toMatch(/img\.naturalHeight/);
    expect(pc).toMatch(/c\.width\s*=\s*Math\.max\(1,\s*Math\.round\(nw\s*\*\s*s\)\)/);
  });
});
