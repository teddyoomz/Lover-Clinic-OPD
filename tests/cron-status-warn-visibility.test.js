// ─── cron-status-warn-visibility (2026-07-21) — "green on a partial run" fix ─
// Locks the shared warn contract that closes two monitor blind spots found by
// the whole-app audit:
//   (a) whole-system backup wrote ok:true "สำรองสำเร็จ" even when collections
//       silently failed to export → infra-health stayed ✅ on a partial backup
//   (b) a FULLY-failed LINE-reminder tick (channel token revoked → every push
//       401s) wrote ok:true → customers silently stop getting reminders
// Mechanism: writeScheduledTaskStatus gains {warn, counts} → infraHealthCore
// checkOneTask renders st.warn===true as a 'warn' check → daily alert fires.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { writeScheduledTaskStatus } from '../api/_lib/scheduledTaskRuntime.js';
import { evaluateInfraHealth, INFRA_TASK_EXPECTATIONS } from '../src/lib/infraHealthCore.js';

const ROOT = join(__dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/** Injected fake db capturing the set() payload (runtime takes db as a param — no mocks). */
function fakeDb() {
  const captured = { data: null, opts: null };
  return {
    captured,
    doc: () => ({ set: async (data, opts) => { captured.data = data; captured.opts = opts; } }),
  };
}

describe('W1 — writeScheduledTaskStatus warn/counts passthrough', () => {
  it('W1.1 warn:true + counts are persisted on the task slice', async () => {
    const db = fakeDb();
    await writeScheduledTaskStatus(db, 'demoTask', { ok: true, warn: true, counts: { failed: 3 }, summary: 'x' });
    const slice = db.captured.data.demoTask;
    expect(slice.warn).toBe(true);
    expect(slice.counts).toEqual({ failed: 3 });
    expect(slice.ok).toBe(true);
    expect(db.captured.opts).toEqual({ merge: true });
  });

  it('W1.2 warn defaults to false (backward compat for every existing caller)', async () => {
    const db = fakeDb();
    await writeScheduledTaskStatus(db, 'demoTask', { ok: true, summary: 'ปกติ' });
    expect(db.captured.data.demoTask.warn).toBe(false);
    expect(db.captured.data.demoTask).not.toHaveProperty('counts');
  });

  it('W1.3 non-object/array counts are dropped (V14: no garbage leaves)', async () => {
    const db = fakeDb();
    await writeScheduledTaskStatus(db, 'demoTask', { counts: [1, 2] });
    expect(db.captured.data.demoTask).not.toHaveProperty('counts');
  });
});

describe('W2 — checkOneTask warn semantics (via evaluateInfraHealth, pure)', () => {
  // Use a REAL task id from the expectations table so the evaluator walks it.
  const TASK_ID = 'wholeSystemBackup';
  const label = INFRA_TASK_EXPECTATIONS[TASK_ID]?.label || TASK_ID;
  const fresh = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago

  function runWith(slice) {
    const res = evaluateInfraHealth({
      statusMap: { [TASK_ID]: slice },
      reconExpected: false,
      pushTokens: [{ ts: new Date().toISOString() }],
      nowMs: Date.now(),
    });
    return res.checks.find((c) => c.label === label);
  }

  it('W2.1 PROVE-RED — fresh + ok:true + warn:true → warn (pre-fix code returned ok)', () => {
    expect(INFRA_TASK_EXPECTATIONS[TASK_ID]).toBeTruthy();
    const c = runWith({ lastRunAt: fresh, ok: true, warn: true, summary: 'สำรองสำเร็จบางส่วน — collection ล้มเหลว 2 / ไฟล์ 0' });
    expect(c.status).toBe('warn');
    expect(c.detail).toContain('บางส่วน');
  });

  it('W2.2 hard failure (ok:false) outranks warn', () => {
    const c = runWith({ lastRunAt: fresh, ok: false, warn: true, error: 'boom' });
    expect(c.status).toBe(INFRA_TASK_EXPECTATIONS[TASK_ID].sev);
  });

  it('W2.3 staleness outranks warn', () => {
    const stale = new Date(Date.now() - 90 * 60 * 60 * 1000).toISOString();
    const c = runWith({ lastRunAt: stale, ok: true, warn: true });
    expect(c.detail).toContain('ไม่ได้รันตามรอบ');
  });

  it('W2.4 warn absent/false stays ok (no false alarms on healthy runs)', () => {
    expect(runWith({ lastRunAt: fresh, ok: true }).status).toBe('ok');
    expect(runWith({ lastRunAt: fresh, ok: true, warn: false }).status).toBe('ok');
  });

  it('W2.5 a warn check drives overall to warn → the daily alert path fires', () => {
    const res = evaluateInfraHealth({
      statusMap: { [TASK_ID]: { lastRunAt: fresh, ok: true, warn: true, summary: 'x' } },
      reconExpected: false,
      pushTokens: [{ ts: new Date().toISOString() }],
      nowMs: Date.now(),
    });
    expect(['warn', 'red']).toContain(res.overall);
  });
});

describe('W3 — cron wiring source-grep locks', () => {
  it('W3.1 backup cron computes failed counts + passes warn (no more unconditional สำรองสำเร็จ)', () => {
    const src = read('api/cron/whole-system-backup-daily.js');
    expect(src).toMatch(/failedCollections/);
    expect(src).toMatch(/failedStorageObjects/);
    expect(src).toMatch(/warn:\s*partial/);
    expect(src).toMatch(/สำรองสำเร็จบางส่วน/);
    // anti-regression: the old unconditional one-liner is gone
    expect(src).not.toMatch(/\{ ok: true, skipped: false, summary: 'สำรองสำเร็จ' \}/);
  });

  it('W3.2 line-reminder-fire surfaces failed count + warns on a fully-failed tick', () => {
    const src = read('api/cron/line-reminder-fire.js');
    expect(src).toMatch(/summary\.failed > 0 && summary\.sent === 0/);
    expect(src).toMatch(/warn:\s*reminderWarn/);
    expect(src).toMatch(/ล้มเหลว \$\{summary\.failed\}/);
    expect(src).toMatch(/counts:\s*\{\s*sent: summary\.sent/);
  });

  it('W3.3 infraHealthCore carries the warn branch (st.warn === true → warn)', () => {
    const src = read('src/lib/infraHealthCore.js');
    expect(src).toMatch(/st\.warn === true/);
    expect(src).toMatch(/รันสำเร็จแต่มีปัญหาบางส่วน/);
  });
});
