// ─── debugLog helper + wiring tests — Phase 14.7.H follow-up J ──────────
//
// Closes the observability gap noted in SESSION_HANDOFF as
//   "ProClinic API silent-catch logging — 35+ intentional `/* best effort */`
//    blocks; debug observability gap. M to add structured logger."
//
// debugLog (src/lib/debugLog.js):
//   - CLIENT prod build: no-op (zero user-facing console noise)
//   - CLIENT dev: console.warn with [debug:category] message — error.message
//   - SERVER (Node ESM, no import.meta.env): always logs; Vercel captures
//
// Coverage:
//   DL1 — helper exists + correct contract (export shape, prefix format,
//         dev-vs-prod gating, error coercion, console.warn level)
//   DL2 — wiring verified at the highest-value sites (api/proclinic/{customer,
//         appointment,treatment,deposit}.js) where a silent failure would
//         hide a future bug report
//   DL3 — anti-regression: no naked `catch {}` or `catch(_) {}` immediately
//         followed by a closing brace at the wired sites (locks the V13/V21
//         lesson — prove behavior, not just shape)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { debugLog } from '../../src/lib/debugLog.js';

const ROOT = path.resolve(__dirname, '..', '..');
const READ = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ═══════════════════════════════════════════════════════════════════════
// DL1 — helper contract
// ═══════════════════════════════════════════════════════════════════════

describe('DL1: debugLog helper contract', () => {
  let warnSpy;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('DL1.1: export exists + is a function', () => {
    expect(typeof debugLog).toBe('function');
  });

  it('DL1.2: format = [debug:category] message', () => {
    debugLog('test-cat', 'something happened');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toBe('[debug:test-cat] something happened');
  });

  it('DL1.3: with Error — appends — error.message', () => {
    debugLog('test-cat', 'op failed', new Error('boom'));
    expect(warnSpy.mock.calls[0][0]).toBe('[debug:test-cat] op failed — boom');
  });

  it('DL1.4: with non-Error value — coerces to string + truncates to 200 chars', () => {
    const longStr = 'x'.repeat(300);
    debugLog('test-cat', 'op failed', longStr);
    const msg = warnSpy.mock.calls[0][0];
    expect(msg.startsWith('[debug:test-cat] op failed — ')).toBe(true);
    // Detail length capped at 200 chars (after the " — " separator)
    expect(msg.length).toBeLessThan('[debug:test-cat] op failed — '.length + 201);
  });

  it('DL1.5: with no error — bare message, no trailing dash', () => {
    debugLog('test-cat', 'op started');
    expect(warnSpy.mock.calls[0][0]).toBe('[debug:test-cat] op started');
  });

  it('DL1.6: with null error — bare message (no " — " separator)', () => {
    debugLog('test-cat', 'op done', null);
    expect(warnSpy.mock.calls[0][0]).toBe('[debug:test-cat] op done');
  });

  it('DL1.7: with empty string error — bare message', () => {
    debugLog('test-cat', 'op done', '');
    expect(warnSpy.mock.calls[0][0]).toBe('[debug:test-cat] op done');
  });

  it('DL1.8: uses console.warn (not console.error) — preserves error budget', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    debugLog('cat', 'msg');
    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    errSpy.mockRestore();
  });

  it('DL1.9: returns undefined (no leak via return value)', () => {
    expect(debugLog('cat', 'msg')).toBeUndefined();
    expect(debugLog('cat', 'msg', new Error('x'))).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// DL1.b — source-shape: gating logic correct (catches future regressions
// where someone removes the prod gate)
// ═══════════════════════════════════════════════════════════════════════

describe('DL1.b: debugLog source-shape gating', () => {
  const SRC = READ('src/lib/debugLog.js');

  it('DL1.b.1: gates on import.meta.env.PROD (client-prod no-op)', () => {
    expect(SRC).toMatch(/import\.meta\?\.env\?\.PROD/);
  });

  it('DL1.b.2: uses console.warn (not console.error)', () => {
    expect(SRC).toMatch(/console\.warn\(/);
    expect(SRC).not.toMatch(/console\.error\(/);
  });

  it('DL1.b.3: prefix is [debug:${category}] (greppable for log filters)', () => {
    expect(SRC).toMatch(/`\[debug:\$\{category\}\] /);
  });

  it('DL1.b.4: error.message preferred over String(error) coercion', () => {
    expect(SRC).toMatch(/error\?\.message/);
    // String(error) coercion is in a const → s.slice(...) on the next line
    expect(SRC).toMatch(/String\(error\)/);
    expect(SRC).toMatch(/s\.slice\(0,\s*200\)/);
  });

  it('DL1.b.5: detail truncates to 200 chars (caps log size)', () => {
    expect(SRC).toMatch(/\.slice\(0,\s*200\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// DL2 + DL3 — DELETED 2026-07-19: both blocks asserted debugLog wiring inside
// api/proclinic/{customer,appointment,treatment,deposit}.js — ALL removed by
// the V50 ProClinic strip (api/proclinic/** deleted; AV28 forbids its return).
// DL1 (the live src/lib/debugLog.js helper contract) is kept above; a single
// guard below locks the deletion itself.
// ═══════════════════════════════════════════════════════════════════════

describe('DL2/DL3 successor: api/proclinic wiring targets are V50-deleted', () => {
  it('api/proclinic/ no longer exists (debugLog wiring sites went with it)', () => {
    expect(fs.existsSync(path.join(ROOT, 'api/proclinic'))).toBe(false);
  });
});
