// Hardening evidence for the Scheduled Tasks param pipeline (2026-06-02).
//
// The destructive retention/cleanup crons compute a deletion window from a config
// param via `cfg.params?.X ?? DEFAULT`. `??` only falls back on null/undefined —
// a `0` would survive and (e.g. retentionHours:0 → cutoff = now) delete EVERYTHING.
// The only guard between a bad param and a destructive cron is validateSystemConfigPatch
// (UI Save throws on it) + the UI input clamp. This suite proves both, plus a
// STRUCTURAL invariant (every numeric param min >= 1) that makes 0 impossible for
// ANY param, and locks each cron's unit conversion + default parity.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateSystemConfigPatch } from '../src/lib/systemConfigClient.js';
import { SCHEDULED_TASKS, getTask } from '../src/lib/scheduledTasksRegistry.js';
import { RETENTION_HOURS } from '../src/lib/chatHistoryRetentionCore.js';
import { RETENTION_DAYS as STAFF_CHAT_DAYS } from '../src/lib/staffChatRetentionCore.js';
import { RETENTION_DAYS as STOCK_MOVE_DAYS } from '../src/lib/stockMovementRetentionCore.js';
import { SESSION_TIMEOUT_MS } from '../src/constants.js';

const PARAM_TASKS = SCHEDULED_TASKS.filter((t) => t.params.length > 0);
// cwd-relative (vitest runs from project root); avoids new URL(import.meta.url) which
// isn't a file:// URL under the vite transform.
const read = (p) => readFileSync(`api/cron/${p}`, 'utf8');

// ── G1 · validateSystemConfigPatch is the gate that protects the destructive crons ──
describe('G1 · destructive-param gate (validateSystemConfigPatch.scheduledTasks)', () => {
  for (const t of PARAM_TASKS) {
    for (const p of t.params) {
      describe(`${t.id}.${p.key} (min ${p.min}, max ${p.max})`, () => {
        const patch = (v) => ({ scheduledTasks: { [t.id]: { params: { [p.key]: v } } } });

        it('rejects 0 (the catastrophic delete-all value)', () => {
          // every param min >= 1, so 0 is always below min → rejected
          expect(validateSystemConfigPatch(patch(0))).toMatch(new RegExp(`${p.key} must be`));
        });
        it('rejects a negative value', () => {
          expect(validateSystemConfigPatch(patch(-5))).toBeTruthy();
        });
        it('rejects below min', () => {
          if (p.min > 1) expect(validateSystemConfigPatch(patch(p.min - 1))).toBeTruthy();
          else expect(validateSystemConfigPatch(patch(0))).toBeTruthy();
        });
        it('rejects above max', () => {
          expect(validateSystemConfigPatch(patch(p.max + 1))).toBeTruthy();
        });
        it('rejects NaN / Infinity', () => {
          expect(validateSystemConfigPatch(patch(NaN))).toBeTruthy();
          expect(validateSystemConfigPatch(patch(Infinity))).toBeTruthy();
        });
        it('rejects a non-numeric string', () => {
          expect(validateSystemConfigPatch(patch('abc'))).toBeTruthy();
        });
        it('accepts min, max, and a mid value', () => {
          expect(validateSystemConfigPatch(patch(p.min))).toBeNull();
          expect(validateSystemConfigPatch(patch(p.max))).toBeNull();
          expect(validateSystemConfigPatch(patch(Math.round((p.min + p.max) / 2)))).toBeNull();
        });
      });
    }
  }

  it('rejects an unknown task id', () => {
    expect(validateSystemConfigPatch({ scheduledTasks: { nope: { enabled: false } } }))
      .toMatch(/unknown/);
  });
  it('rejects an unknown param key on a known task', () => {
    expect(validateSystemConfigPatch({ scheduledTasks: { chatHistoryRetention: { params: { bogus: 5 } } } }))
      .toMatch(/unknown/);
  });
  it('rejects a non-boolean enabled', () => {
    expect(validateSystemConfigPatch({ scheduledTasks: { chatHistoryRetention: { enabled: 'yes' } } }))
      .toMatch(/enabled must be boolean/);
  });
  it('rejects scheduledTasks as an array + a task cfg as an array', () => {
    expect(validateSystemConfigPatch({ scheduledTasks: [] })).toBeTruthy();
    expect(validateSystemConfigPatch({ scheduledTasks: { chatHistoryRetention: [] } })).toBeTruthy();
    expect(validateSystemConfigPatch({ scheduledTasks: { chatHistoryRetention: { params: [1, 2] } } })).toBeTruthy();
  });
  it('a valid full patch passes', () => {
    const full = {};
    for (const t of SCHEDULED_TASKS) {
      full[t.id] = { enabled: true, params: Object.fromEntries(t.params.map((p) => [p.key, p.default])) };
    }
    expect(validateSystemConfigPatch({ scheduledTasks: full })).toBeNull();
  });
});

// ── G2 · STRUCTURAL invariant: no numeric param may allow 0 (min >= 1 always) ──
describe('G2 · every numeric param min >= 1 (0 is structurally impossible)', () => {
  for (const t of PARAM_TASKS) {
    for (const p of t.params) {
      it(`${t.id}.${p.key} min (${p.min}) >= 1 + max > min`, () => {
        expect(p.min).toBeGreaterThanOrEqual(1);
        expect(p.max).toBeGreaterThan(p.min);
        expect(Number.isInteger(p.min) && Number.isInteger(p.max)).toBe(true);
      });
    }
  }
});

// ── G3 · default parity: registry default ∈ [min,max] AND == the cron's core default ──
describe('G3 · param default parity (UI default == cron fallback default)', () => {
  const CORE = {
    chatHistoryRetention: { retentionHours: RETENTION_HOURS },
    staffChatRetention: { retentionDays: STAFF_CHAT_DAYS },
    stockMovementRetention: { retentionDays: STOCK_MOVE_DAYS },
    opdSessionCleanup: { sessionTimeoutHours: Math.round(SESSION_TIMEOUT_MS / 3600000) },
    patientLinkCleanup: { graceDays: 30 }, // literal in both registry + cron
  };
  for (const t of PARAM_TASKS) {
    for (const p of t.params) {
      it(`${t.id}.${p.key} default (${p.default}) in-range + matches core`, () => {
        expect(p.default).toBeGreaterThanOrEqual(p.min);
        expect(p.default).toBeLessThanOrEqual(p.max);
        expect(p.default).toBe(CORE[t.id][p.key]);
      });
    }
  }
});

// ── G4 · each destructive cron threads its param with the CORRECT time unit ──
describe('G4 · cron param unit-conversion locks', () => {
  it('chatHistoryRetention: retentionHours → ms (× 60×60×1000)', () => {
    const s = read('chat-history-retention-sweep.js');
    expect(s).toMatch(/cfg\.params\?\.retentionHours\s*\?\?\s*RETENTION_HOURS/);
    expect(s).toMatch(/retentionHours\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  });
  it('staffChatRetention: retentionDays → ms (× 24×60×60×1000)', () => {
    const s = read('staff-chat-retention-sweep.js');
    expect(s).toMatch(/cfg\.params\?\.retentionDays\s*\?\?\s*RETENTION_DAYS/);
    expect(s).toMatch(/retentionDays\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  });
  it('patientLinkCleanup: graceDays → ms (× 24×60×60×1000)', () => {
    const s = read('patient-link-cleanup-sweep.js');
    expect(s).toMatch(/cfg\.params\?\.graceDays\s*\?\?\s*30/);
    expect(s).toMatch(/graceDays\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  });
  it('opdSessionCleanup: sessionTimeoutHours → ms (× 3600000)', () => {
    const s = read('opd-session-cleanup-sweep.js');
    expect(s).toMatch(/cfg\.params\?\.sessionTimeoutHours\s*\?\?/); // threads the param
    expect(s).toMatch(/\)\s*\*\s*3600000/);                        // resolved hours × 3600000 → ms
  });
  it('stockMovementRetention: retentionDays → computeCutoffISO(days)', () => {
    const s = read('stock-movement-retention.js');
    expect(s).toMatch(/cfg\.params\?\.retentionDays\s*\?\?\s*RETENTION_DAYS/);
    expect(s).toMatch(/computeCutoffISO\(new Date\(\),\s*retentionDays\)/);
  });
});

// ── G5 · UI input protections: min/max attrs + onChange clamp to [min,max] ──
describe('G5 · ScheduledTasksTab param input is clamped to [min,max]', () => {
  const tab = readFileSync('src/components/backend/ScheduledTasksTab.jsx', 'utf8');
  it('number input carries min={p.min} max={p.max}', () => {
    expect(tab).toMatch(/type="number"\s+min=\{p\.min\}\s+max=\{p\.max\}/);
  });
  it('onChange clamps via clamp(round(Number(...)), p.min, p.max)', () => {
    expect(tab).toMatch(/clamp\(Math\.round\(Number\(e\.target\.value\)\),\s*p\.min,\s*p\.max\)/);
  });
  it('clamp() returns min for a non-finite input (no NaN reaches the draft)', () => {
    expect(tab).toMatch(/if\s*\(!Number\.isFinite\(n\)\)\s*return\s+min/);
  });
});
