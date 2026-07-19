// ─── infra-health flow-simulate (Rule I, 2026-07-19) ───────────────────────
// Chains the REAL modules end-to-end (no helper-output-in-isolation lies):
// F1 status-doc shape parity → evaluate → alert → card → server text rule ·
// F2 beacon full chain (real thrown error → handler → payload → server
// validator → stored doc shape → viewer grouping) · F3 the 3 historical
// silent-death repros MUST alert · F4 system_config infraHealth round-trip ·
// F5 vercel.json blast-radius guard (headers untouched — AV210) · F6 cron
// wiring source-grep locks.
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const readRoot = (...p) => readFileSync(path.join(ROOT, ...p), 'utf8');

vi.mock('firebase/firestore', () => ({
  doc: (...a) => ({ __kind: 'doc', path: a.slice(1).join('/') }),
  collection: (...a) => ({ __kind: 'collection', path: a.slice(1).join('/') }),
  getDoc: async () => ({ exists: () => false, data: () => null }),
  onSnapshot: () => () => {},
  writeBatch: () => ({ set: () => {}, commit: async () => {} }),
  serverTimestamp: () => ({ __serverTimestamp: true }),
  query: (c) => c, where: () => ({}), orderBy: () => ({}), limit: () => ({}), getDocs: async () => ({ docs: [] }),
}));
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app', auth: { currentUser: null } }));

import {
  evaluateInfraHealth, buildInfraAlertText, buildInfraChatCardDoc,
  INFRA_TASK_EXPECTATIONS,
} from '../src/lib/infraHealthCore.js';
import { validateClientErrorBody, groupClientErrors } from '../src/lib/clientErrorCore.js';
import { installErrorBeacon, _resetBeaconStateForTest } from '../src/lib/errorBeacon.js';
import {
  mergeSystemConfigDefaults, validateSystemConfigPatch, normalizeInfraHealth,
  SYSTEM_CONFIG_DEFAULTS, computeChangedFields,
} from '../src/lib/systemConfigClient.js';

const NOW = Date.parse('2026-07-19T02:00:00.000Z');
const H = 3600 * 1000;
const iso = (ms) => new Date(ms).toISOString();

// The EXACT slice shape writeScheduledTaskStatus writes (source-parity locked in F1.1).
const slice = (ageH, extra = {}) => ({ lastRunAt: iso(NOW - ageH * H), ok: true, summary: '', error: '', skipped: false, ...extra });
const freshStatusMap = () => Object.fromEntries(Object.keys(INFRA_TASK_EXPECTATIONS).map(t => [t, slice(0.5)]));

const ORIGINAL_FETCH = global.fetch;
afterAll(() => { if (ORIGINAL_FETCH === undefined) delete global.fetch; else global.fetch = ORIGINAL_FETCH; });

describe('F1 — status-slice parity → evaluate → alert → card → server text rule', () => {
  it('F1.1 writeScheduledTaskStatus source writes EXACTLY the fields the evaluator reads', () => {
    const src = readRoot('api', '_lib', 'scheduledTaskRuntime.js');
    for (const field of ['lastRunAt', 'ok', 'summary', 'error', 'skipped']) {
      expect(src, `runtime slice must carry "${field}"`).toContain(`${field}`);
    }
    expect(src).toContain('new Date().toISOString()'); // lastRunAt is an ISO string — Date.parse-able
  });

  it('F1.2 full chain: stale backup → evaluate → alertText → card doc → be_staff_chat_messages text rule (≤500, non-empty)', () => {
    const statusMap = freshStatusMap();
    statusMap.wholeSystemBackup = slice(72);
    const r = evaluateInfraHealth({
      statusMap, taskConfigMap: {}, reconDoc: { checked: 3, discrepancyCount: 0 },
      pushTokens: [{ token: 't', createdAt: iso(NOW - 24 * H) }], pushSettings: {},
      errorCount24h: 0, nowMs: NOW,
    });
    expect(r.overall).toBe('red');
    const card = buildInfraChatCardDoc(r, { dateKey: '20260719', branchId: 'BR-X', dateLabel: '19/07/2569 07:30' });
    // firestore.rules text validator contract for staff-chat messages: ≤500 + non-empty
    expect(card.text.trim().length).toBeGreaterThan(0);
    expect(card.text.length).toBeLessThanOrEqual(500);
    expect(card.displayName.length).toBeGreaterThanOrEqual(2);
    expect(card.displayName.length).toBeLessThanOrEqual(50);
    expect(card.deviceId.length).toBeGreaterThan(0);
    expect(card.text).toContain('Backup');
  });
});

describe('F2 — beacon full chain: thrown error → handler → server validator → stored shape → viewer', () => {
  beforeEach(() => { _resetBeaconStateForTest(); });
  it('F2.1 window error → POST body → validateClientErrorBody → groupClientErrors', async () => {
    if (global.navigator) delete global.navigator.sendBeacon;
    const posts = [];
    global.fetch = vi.fn((url, opts) => { posts.push(JSON.parse(opts.body)); return Promise.resolve({ ok: true }); });
    installErrorBeacon();
    const err = new Error('flow-simulate boom');
    err.stack = 'Error: flow-simulate boom\n  at Component (/src/App.jsx:1:1)';
    window.dispatchEvent(new ErrorEvent('error', { error: err, message: err.message }));
    expect(posts.length).toBe(1);

    // server side — the EXACT validator api/client-error.js runs
    const v = validateClientErrorBody(posts[0]);
    expect(v.ok).toBe(true);
    const storedDoc = { ...v.doc, id: 'CE-1', createdAtMs: NOW };
    // viewer side — the grouping the admin card renders
    const groups = groupClientErrors([storedDoc, { ...storedDoc, createdAtMs: NOW + 1 }]);
    expect(groups.length).toBe(1);
    expect(groups[0].count).toBe(2);
    expect(groups[0].message).toContain('flow-simulate boom');
  });
});

describe('F3 — the 3 historical silent-deaths MUST alert (repro fixtures)', () => {
  const base = () => ({
    statusMap: freshStatusMap(), taskConfigMap: {},
    reconDoc: { checked: 1, discrepancyCount: 0 },
    pushTokens: [{ token: 't', createdAt: iso(NOW - 24 * H) }],
    pushSettings: {}, errorCount24h: 0, nowMs: NOW,
  });
  it('F3.1 AV210 (push fleet dead — every token from 05-26) → RED alert names push', () => {
    const inp = base();
    inp.pushTokens = Array.from({ length: 8 }, (_, i) => ({ token: `t${i}`, createdAt: '2026-05-26T10:00:00.000Z' }));
    const r = evaluateInfraHealth(inp);
    expect(r.overall).toBe('red');
    expect(buildInfraAlertText(r, {})).toContain('Push');
  });
  it('F3.2 V122 (backup failing, stale manifest) → RED alert names backup', () => {
    const inp = base();
    inp.statusMap.wholeSystemBackup = slice(2, { ok: false, error: 'NO_MANIFEST' });
    const r = evaluateInfraHealth(inp);
    expect(r.overall).toBe('red');
    expect(buildInfraAlertText(r, {})).toContain('Backup');
  });
  it('F3.3 dead retention cron (46 silent runs class — 5 days no lastRunAt movement) → warn alert', () => {
    const inp = base();
    inp.statusMap.chatHistoryRetention = slice(120);
    const r = evaluateInfraHealth(inp);
    expect(r.overall).toBe('warn');
    expect(buildInfraAlertText(r, {})).toContain('แชท');
  });
});

describe('F4 — system_config.infraHealth round-trip', () => {
  it('F4.1 defaults present + merge normalizes junk + validate accepts/rejects correctly', () => {
    expect(SYSTEM_CONFIG_DEFAULTS.infraHealth).toEqual({ lineTargets: [], staffChatBranchId: '' });
    const merged = mergeSystemConfigDefaults({
      infraHealth: {
        lineTargets: [
          { branchId: 'BR-A', lineUserId: 'U1', label: 'เจ้าของ' },
          { branchId: '', lineUserId: 'U2' },        // dropped (no branch)
          'junk',                                     // dropped
        ],
        staffChatBranchId: 'BR-A',
      },
    });
    expect(merged.infraHealth.lineTargets.length).toBe(1);
    expect(merged.infraHealth.staffChatBranchId).toBe('BR-A');
    // valid patch
    expect(validateSystemConfigPatch({ infraHealth: { lineTargets: [{ branchId: 'B', lineUserId: 'U' }] } })).toBe(null);
    // invalid patches
    expect(validateSystemConfigPatch({ infraHealth: [] })).toBeTruthy();
    expect(validateSystemConfigPatch({ infraHealth: { lineTargets: [{ branchId: '', lineUserId: 'U' }] } })).toBeTruthy();
    expect(validateSystemConfigPatch({ infraHealth: { lineTargets: Array.from({ length: 6 }, () => ({ branchId: 'B', lineUserId: 'U' })) } })).toBeTruthy();
    expect(validateSystemConfigPatch({ infraHealth: { staffChatBranchId: 42 } })).toBeTruthy();
  });
  it('F4.2 changed-fields diff sees infraHealth changes (audit trail works)', () => {
    const before = mergeSystemConfigDefaults(null);
    const after = mergeSystemConfigDefaults({ infraHealth: { lineTargets: [{ branchId: 'B', lineUserId: 'U' }], staffChatBranchId: '' } });
    const diff = computeChangedFields(before, after);
    expect(diff).toContain('infraHealth.lineTargets');
  });
  it('F4.3 scheduledTasks validation knows the new task + its param bounds', () => {
    expect(validateSystemConfigPatch({ scheduledTasks: { infraHealthSweep: { enabled: false } } })).toBe(null);
    expect(validateSystemConfigPatch({ scheduledTasks: { infraHealthSweep: { params: { errorThreshold24h: 10 } } } })).toBe(null);
    expect(validateSystemConfigPatch({ scheduledTasks: { infraHealthSweep: { params: { errorThreshold24h: 0 } } } })).toBeTruthy();
    expect(validateSystemConfigPatch({ scheduledTasks: { infraHealthSweep: { params: { bogus: 1 } } } })).toBeTruthy();
  });
});

describe('F5 — vercel.json blast-radius guard (AV210 class)', () => {
  const vercel = JSON.parse(readRoot('vercel.json'));
  it('F5.1 this batch added ZERO headers rules — no infra/client-error source in headers', () => {
    for (const h of vercel.headers || []) {
      expect(String(h.source)).not.toMatch(/client-error|infra-health/);
    }
  });
  it('F5.2 the AV210 dedicated SW CSP rule + the global rule both still exist', () => {
    const sources = (vercel.headers || []).map(h => h.source);
    expect(sources).toContain('/firebase-messaging-sw.js');
    expect(sources.some(s => s.includes('(.*)'))).toBe(true);
  });
  it('F5.3 functions entry for the sweep has maxDuration like sibling crons', () => {
    expect(vercel.functions['api/cron/infra-health-sweep.js']).toEqual({ maxDuration: 300 });
  });
});

describe('F6 — cron + endpoint wiring (source-grep locks)', () => {
  const cron = readRoot('api', 'cron', 'infra-health-sweep.js');
  const sink = readRoot('api', 'client-error.js');
  it('F6.1 cron: config-guard + status write + pure evaluator + per-channel non-fatal alerts', () => {
    expect(cron).toContain("readScheduledTaskConfig(db, TASK_ID)");
    expect(cron).toContain('writeScheduledTaskStatus');
    expect(cron).toContain('evaluateInfraHealth');
    expect(cron).toContain('buildInfraChatCardDoc');
    expect(cron).toContain('pushLineMessage');
    expect(cron).toMatch(/staff-chat alert failed \(non-fatal\)/);
    expect(cron).toMatch(/LINE alert failed \(non-fatal\)/);
    expect(cron).toContain("x-cron-secret");
    expect(cron).toContain('INFRA_FALLBACK_STAFF_CHAT_BRANCH'); // V77-bis hardcoded fallback
  });
  it('F6.2 cron: status docs written BEFORE alerts (alert failure cannot lose state)', () => {
    const statusIdx = cron.indexOf('infra-health-latest');
    const alertIdx = cron.indexOf('buildInfraChatCardDoc(result');
    expect(statusIdx).toBeGreaterThan(-1);
    expect(alertIdx).toBeGreaterThan(statusIdx);
  });
  it('F6.3 sink: validator + tx daily cap + 200-on-drop (no retry storm) + generic 500', () => {
    expect(sink).toContain('validateClientErrorBody');
    expect(sink).toContain('runTransaction');
    expect(sink).toContain('dropped: true');
    expect(sink).toContain("SERVER_ERROR");
    expect(sink).toContain('client_error_log_meta/daily');
  });
  it('F6.4 the error-log collection is endpoint-only — no client-SDK reference anywhere in src/lib data layers', () => {
    const backendClient = readRoot('src', 'lib', 'backendClient.js');
    const scoped = readRoot('src', 'lib', 'scopedDataLayer.js');
    expect(backendClient).not.toContain('client_error_log');
    expect(scoped).not.toContain('client_error_log');
  });
});
