// ─── infra-health-core (2026-07-19) — evaluator matrix + anti-drift classifier
// H1 evaluate matrix (incl. the 3 historical silent-death repros: AV210 push /
// V122 backup / dead-retention-cron) · H2 alert text · H3 chat card doc (V14
// no-undefined-leaf) · H4 CLASSIFIER: every vercel.json crons[].path must be
// declared in the health coverage sets — a future cron added without declaring
// coverage FAILS here (AV142-style anti-drift lock) · H5 token freshness.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
import {
  evaluateInfraHealth, buildInfraAlertText, buildInfraChatCardDoc,
  freshPushTokenCount, INFRA_TASK_EXPECTATIONS, INFRA_UNMONITORED_CRON_PATHS,
  INFRA_SPECIAL_CRON_PATHS, INFRA_SELF_CRON_PATH,
  DEFAULT_ERROR_THRESHOLD_24H,
} from '../src/lib/infraHealthCore.js';

const NOW = Date.parse('2026-07-19T02:00:00.000Z'); // 09:00 BKK
const H = 3600 * 1000;
const iso = (ms) => new Date(ms).toISOString();

function healthyStatusMap() {
  const m = {};
  for (const taskId of Object.keys(INFRA_TASK_EXPECTATIONS)) {
    m[taskId] = { lastRunAt: iso(NOW - 0.5 * H), ok: true, summary: '', error: '', skipped: false };
  }
  return m;
}
const healthyInputs = () => ({
  statusMap: healthyStatusMap(),
  taskConfigMap: {},
  reconDoc: { checked: 5, discrepancyCount: 0 },
  pushTokens: [{ token: 't1', createdAt: iso(NOW - 24 * H) }],
  pushSettings: { globalPushMuted: false },
  errorCount24h: 0,
  errorThreshold24h: DEFAULT_ERROR_THRESHOLD_24H,
  errorSamples: [],
  nowMs: NOW,
});
const byId = (r, id) => r.checks.find(c => c.id === id);

function walkNoUndefined(node, path = '$') {
  expect(node, `${path} must not be undefined`).not.toBe(undefined);
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) walkNoUndefined(v, `${path}.${k}`);
  }
}

describe('H1 — evaluateInfraHealth matrix', () => {
  it('H1.1 all healthy → overall ok, no warn/red checks', () => {
    const r = evaluateInfraHealth(healthyInputs());
    expect(r.overall).toBe('ok');
    expect(r.checks.some(c => c.status === 'red' || c.status === 'warn')).toBe(false);
    expect(byId(r, 'task:wholeSystemBackup').status).toBe('ok');
  });

  it('H1.2 V122 repro — backup lastRunAt 3 days ago → RED + overall red', () => {
    const inp = healthyInputs();
    inp.statusMap.wholeSystemBackup.lastRunAt = iso(NOW - 72 * H);
    const r = evaluateInfraHealth(inp);
    expect(byId(r, 'task:wholeSystemBackup').status).toBe('red');
    expect(r.overall).toBe('red');
  });

  it('H1.3 backup ok:false (NO_MANIFEST class) → RED with error detail', () => {
    const inp = healthyInputs();
    inp.statusMap.wholeSystemBackup = { lastRunAt: iso(NOW - 2 * H), ok: false, error: 'FUNCTION_INVOCATION_TIMEOUT' };
    const r = evaluateInfraHealth(inp);
    expect(byId(r, 'task:wholeSystemBackup').status).toBe('red');
    expect(byId(r, 'task:wholeSystemBackup').detail).toContain('FUNCTION_INVOCATION_TIMEOUT');
  });

  it('H1.4 dead-retention-cron repro — chatHistoryRetention silent 5 days → warn', () => {
    const inp = healthyInputs();
    inp.statusMap.chatHistoryRetention.lastRunAt = iso(NOW - 5 * 24 * H);
    const r = evaluateInfraHealth(inp);
    expect(byId(r, 'task:chatHistoryRetention').status).toBe('warn');
    expect(r.overall).toBe('warn');
  });

  it('H1.5 admin-disabled task → skip, NOT counted in overall', () => {
    const inp = healthyInputs();
    delete inp.statusMap.stockLotCleanup; // no runs since disabling
    inp.taskConfigMap = { stockLotCleanup: { enabled: false } };
    const r = evaluateInfraHealth(inp);
    expect(byId(r, 'task:stockLotCleanup').status).toBe('skip');
    expect(r.overall).toBe('ok');
  });

  it('H1.6 latest run skipped:true → skip (not a failure)', () => {
    const inp = healthyInputs();
    inp.statusMap.staffChatRetention.skipped = true;
    const r = evaluateInfraHealth(inp);
    expect(byId(r, 'task:staffChatRetention').status).toBe('skip');
  });

  it('H1.7 task missing from status doc entirely → severity fires', () => {
    const inp = healthyInputs();
    delete inp.statusMap.opdSessionCleanup;
    const r = evaluateInfraHealth(inp);
    expect(byId(r, 'task:opdSessionCleanup').status).toBe('warn');
    expect(byId(r, 'task:opdSessionCleanup').detail).toContain('ไม่พบประวัติการรัน');
  });

  it('H1.8 recon doc missing → warn · H1.9 discrepancyCount 2 → warn with count', () => {
    const a = evaluateInfraHealth({ ...healthyInputs(), reconDoc: null });
    expect(byId(a, 'recon').status).toBe('warn');
    const b = evaluateInfraHealth({ ...healthyInputs(), reconDoc: { checked: 9, discrepancyCount: 2 } });
    expect(byId(b, 'recon').status).toBe('warn');
    expect(byId(b, 'recon').detail).toContain('2');
  });

  it('H1.10 AV210 repro — 8 stale tokens (05-26), zero minted since → RED fleet-dead', () => {
    const inp = healthyInputs();
    inp.pushTokens = Array.from({ length: 8 }, (_, i) => ({ token: `t${i}`, createdAt: '2026-05-26T10:00:00.000Z' }));
    const r = evaluateInfraHealth(inp);
    expect(byId(r, 'push').status).toBe('red');
    expect(byId(r, 'push').detail).toContain('AV210');
    expect(r.overall).toBe('red');
  });

  it('H1.11 globalPushMuted → info (deliberate), overall stays ok', () => {
    const inp = healthyInputs();
    inp.pushTokens = [];
    inp.pushSettings = { globalPushMuted: true };
    const r = evaluateInfraHealth(inp);
    expect(byId(r, 'push').status).toBe('info');
    expect(r.overall).toBe('ok');
  });

  it('H1.12 errors 7 ≥ default 5 → warn with samples · H1.13 threshold 10 → ok', () => {
    const a = evaluateInfraHealth({ ...healthyInputs(), errorCount24h: 7, errorSamples: ['TypeError: x is not a function'] });
    expect(byId(a, 'clientErrors').status).toBe('warn');
    expect(byId(a, 'clientErrors').detail).toContain('TypeError');
    const b = evaluateInfraHealth({ ...healthyInputs(), errorCount24h: 7, errorThreshold24h: 10 });
    expect(byId(b, 'clientErrors').status).toBe('ok');
  });

  it('H1.14 empty inputs (all null/missing) → does not throw; alerts fire', () => {
    const r = evaluateInfraHealth({ nowMs: NOW });
    expect(r.overall).toBe('red'); // push has no tokens → red; tasks never ran
    walkNoUndefined(r);
  });
});

describe('H2 — buildInfraAlertText', () => {
  it('H2.1 red lines before warn, header matches severity, bounded ≤900, pointer line present', () => {
    const inp = healthyInputs();
    inp.statusMap.wholeSystemBackup.lastRunAt = iso(NOW - 72 * H); // red
    inp.reconDoc = null; // warn
    const r = evaluateInfraHealth(inp);
    const text = buildInfraAlertText(r, { dateLabel: '19/07/2569 07:30' });
    expect(text.length).toBeLessThanOrEqual(900);
    expect(text).toContain('ร้ายแรง');
    expect(text).toContain('19/07/2569');
    expect(text.indexOf('🔴')).toBeLessThan(text.indexOf('🟡'));
    expect(text).toContain('สุขภาพระบบ');
  });
});

describe('H3 — buildInfraChatCardDoc', () => {
  it('H3.1 deterministic per-day id + system shape + text ≤500 + NO undefined leaf (V14)', () => {
    const inp = healthyInputs();
    inp.statusMap.wholeSystemBackup.lastRunAt = iso(NOW - 72 * H);
    const r = evaluateInfraHealth(inp);
    const card = buildInfraChatCardDoc(r, { dateKey: '20260719', branchId: 'BR-X', dateLabel: '19/07/2569' });
    expect(card.id).toBe('CHAT-SYS-INFRA-20260719');
    expect(card.branchId).toBe('BR-X');
    expect(card.deviceId).toBe('system');
    expect(card.displayName).toBe('ระบบ');
    expect(card.text.length).toBeLessThanOrEqual(500);
    expect(card.system.kind).toBe('infra-health');
    expect(card.system.overall).toBe('red');
    expect(card.system.issueCount).toBeGreaterThan(0);
    walkNoUndefined(card);
  });
});

describe('H4 — CLASSIFIER: vercel.json crons ⊆ declared health coverage (anti-drift)', () => {
  const vercel = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const declared = new Set([
    ...Object.values(INFRA_TASK_EXPECTATIONS).map(e => e.cronPath),
    ...Object.keys(INFRA_SPECIAL_CRON_PATHS),
    ...INFRA_UNMONITORED_CRON_PATHS,
    INFRA_SELF_CRON_PATH,
  ]);

  it('H4.1 every crons[].path is declared (new cron w/o coverage = RED here)', () => {
    for (const { path } of vercel.crons) {
      expect(declared.has(path), `cron ${path} must be declared in infraHealthCore coverage sets`).toBe(true);
    }
  });

  it('H4.2 no stale expectation — every declared cronPath exists in vercel.json', () => {
    const live = new Set(vercel.crons.map(c => c.path));
    for (const p of declared) {
      expect(live.has(p), `declared ${p} no longer exists in vercel.json crons`).toBe(true);
    }
  });

  it('H4.3 the health sweep itself is scheduled daily 00:30 UTC (07:30 BKK)', () => {
    const self = vercel.crons.find(c => c.path === INFRA_SELF_CRON_PATH);
    expect(self?.schedule).toBe('30 0 * * *');
  });
});

describe('H5 — freshPushTokenCount', () => {
  it('H5.1 legacy string tokens = stale; object with fresh createdAt counts', () => {
    const tokens = [
      'legacy-bare-string',
      { token: 'a', createdAt: '2026-05-26T00:00:00.000Z' }, // 54d old
      { token: 'b', createdAt: iso(NOW - 10 * 24 * H) },      // fresh
      { token: 'c' },                                          // no createdAt
      null,
    ];
    expect(freshPushTokenCount(tokens, NOW)).toBe(1);
    expect(freshPushTokenCount([], NOW)).toBe(0);
    expect(freshPushTokenCount(null, NOW)).toBe(0);
  });
});
