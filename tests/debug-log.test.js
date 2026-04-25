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
import { debugLog } from '../src/lib/debugLog.js';

const ROOT = path.resolve(__dirname, '..');
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
// DL2 — wiring verified at highest-value silent-catch sites
// ═══════════════════════════════════════════════════════════════════════

describe('DL2: debugLog wired at high-value silent-catch sites', () => {
  it('DL2.1: api/proclinic/customer.js imports debugLog', () => {
    const src = READ('api/proclinic/customer.js');
    expect(src).toMatch(/import\s*\{\s*debugLog\s*\}\s*from\s*['"]\.\.\/\.\.\/src\/lib\/debugLog\.js['"]/);
  });

  it('DL2.2: customer.js logs HN extract failure (was naked catch (_))', () => {
    const src = READ('api/proclinic/customer.js');
    expect(src).toMatch(/debugLog\(['"]proclinic-customer['"], `extract HN/);
  });

  it('DL2.3: customer.js logs pc_customers create-backup PATCH failure', () => {
    const src = READ('api/proclinic/customer.js');
    expect(src).toMatch(/debugLog\(['"]proclinic-customer['"], `pc_customers create-backup PATCH/);
  });

  it('DL2.4: customer.js logs pc_customers update-backup PATCH failure', () => {
    const src = READ('api/proclinic/customer.js');
    expect(src).toMatch(/debugLog\(['"]proclinic-customer['"], `pc_customers update-backup PATCH/);
  });

  it('DL2.5: api/proclinic/appointment.js imports debugLog', () => {
    const src = READ('api/proclinic/appointment.js');
    expect(src).toMatch(/import\s*\{\s*debugLog\s*\}\s*from\s*['"]\.\.\/\.\.\/src\/lib\/debugLog\.js['"]/);
  });

  it('DL2.6: appointment.js logs redirect-parse failure (was /* best effort */)', () => {
    const src = READ('api/proclinic/appointment.js');
    expect(src).toMatch(/debugLog\(['"]proclinic-appointment['"], 'parse appointment list after redirect/);
  });

  it('DL2.7: appointment.js logs update lookup-by-date failure', () => {
    const src = READ('api/proclinic/appointment.js');
    expect(src).toMatch(/debugLog\(['"]proclinic-appointment['"], `update: lookup existing data by date/);
  });

  it('DL2.8: appointment.js logs 365d scan-batch failures', () => {
    const src = READ('api/proclinic/appointment.js');
    expect(src).toMatch(/debugLog\(['"]proclinic-appointment['"], `update: scan-batch fetch/);
  });

  it('DL2.9: api/proclinic/treatment.js imports debugLog', () => {
    const src = READ('api/proclinic/treatment.js');
    expect(src).toMatch(/import\s*\{\s*debugLog\s*\}\s*from\s*['"]\.\.\/\.\.\/src\/lib\/debugLog\.js['"]/);
  });

  it('DL2.10: treatment.js logs image inline-fetch failure', () => {
    const src = READ('api/proclinic/treatment.js');
    expect(src).toMatch(/debugLog\(['"]proclinic-treatment['"], `image inline-fetch failed/);
  });

  it('DL2.11: treatment.js logs pc_treatments view-time backup PATCH failure', () => {
    const src = READ('api/proclinic/treatment.js');
    expect(src).toMatch(/debugLog\(['"]proclinic-treatment['"], `pc_treatments view-time backup PATCH/);
  });

  it('DL2.12: api/proclinic/deposit.js imports debugLog', () => {
    const src = READ('api/proclinic/deposit.js');
    expect(src).toMatch(/import\s*\{\s*debugLog\s*\}\s*from\s*['"]\.\.\/\.\.\/src\/lib\/debugLog\.js['"]/);
  });

  it('DL2.13: deposit.js logs pc_deposit_options backup PATCH failure', () => {
    const src = READ('api/proclinic/deposit.js');
    expect(src).toMatch(/debugLog\(['"]proclinic-deposit['"], 'pc_deposit_options backup PATCH/);
  });

  it('DL2.14: deposit.js converted earlier console.warn → debugLog (consistency)', () => {
    const src = READ('api/proclinic/deposit.js');
    // The earlier line `console.warn('[deposit] Firestore options backup failed:', err.message)`
    // must be gone, replaced by debugLog. Lock it so future "convenience" reverts are caught.
    expect(src).not.toMatch(/console\.warn\(['"]?\[deposit\] Firestore options backup failed/);
  });

  it('DL2.15: deposit.js logs submit-time deposit-list parse failure', () => {
    const src = READ('api/proclinic/deposit.js');
    expect(src).toMatch(/debugLog\(['"]proclinic-deposit['"], `submit: parse deposit list/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// DL3 — anti-regression: at the wired sites, the catch clause must NOT be
// naked again (i.e. someone reverts and silently swallows). We grep for
// the SPECIFIC patterns that were swallow-only before the wiring landed.
// ═══════════════════════════════════════════════════════════════════════

describe('DL3: anti-regression — wired catches remain non-silent', () => {
  it('DL3.1: customer.js — no `catch (_) { /* non-fatal */ }` for HN extract anymore', () => {
    const src = READ('api/proclinic/customer.js');
    // The legacy form was on the line right after `proClinicHN = extractHN(editHtml);`
    // Now it must use debugLog. Match the signature-shape near "extractHN(editHtml)"
    // so we don't false-match unrelated catches.
    const region = src.match(/proClinicHN = extractHN\(editHtml\);[\s\S]{0,400}/)?.[0] || '';
    expect(region).toMatch(/debugLog\(/);
    expect(region).not.toMatch(/catch\s*\(_\)\s*\{\s*\/\*\s*non-fatal\s*\*\/\s*\}/);
  });

  it('DL3.2: customer.js — no naked catch (_) {} after pc_customers create PATCH', () => {
    const src = READ('api/proclinic/customer.js');
    // Find the create PATCH region (right after createdAt/syncedAt block)
    const region = src.match(/createdAt: \{ stringValue: new Date\(\)[\s\S]{0,800}/)?.[0] || '';
    expect(region).toMatch(/debugLog\(['"]proclinic-customer['"], `pc_customers create-backup PATCH/);
    // No bare `.catch(() => {})` remains in this region
    expect(region).not.toMatch(/\.catch\(\(\)\s*=>\s*\{\}\)/);
  });

  it('DL3.3: appointment.js — no `catch { /* best effort */ }` for redirect parse anymore', () => {
    const src = READ('api/proclinic/appointment.js');
    expect(src).not.toMatch(/catch\s*\{\s*\/\*\s*best effort\s*\*\/\s*\}/);
  });

  it('DL3.4: treatment.js — image inline-fetch now logs on failure', () => {
    const src = READ('api/proclinic/treatment.js');
    // The pattern was `} catch { return img; }` — must now have debugLog
    // before the return.
    const region = src.match(/buffer\.toString\('base64'\)`[\s\S]{0,400}/)?.[0]
      || src.match(/\$\{ct\};base64,\$\{buffer\.toString\('base64'\)\}`[\s\S]{0,400}/)?.[0]
      || src.match(/data:\$\{ct\};base64,[\s\S]{0,400}/)?.[0]
      || '';
    expect(region).toMatch(/debugLog\(['"]proclinic-treatment['"], `image inline-fetch/);
  });

  it('DL3.5: treatment.js — pc_treatments view-time backup PATCH now logs on failure', () => {
    const src = READ('api/proclinic/treatment.js');
    // Before: `.catch(() => {})` directly after the PATCH body
    // After: `.catch(e => debugLog(...))`
    const region = src.match(/pc_treatments\/\$\{treatmentId\}[\s\S]{0,800}/)?.[0] || '';
    expect(region).toMatch(/debugLog\(/);
    expect(region).not.toMatch(/\.catch\(\(\)\s*=>\s*\{\}\)/);
  });

  it('DL3.6: deposit.js — submit-time deposit-list parse no longer naked', () => {
    const src = READ('api/proclinic/deposit.js');
    // The wiring lands the message verbatim — direct substring check
    expect(src).toMatch(/debugLog\(['"]proclinic-deposit['"], `submit: parse deposit list/);
    // Plus the legacy "best effort" comment is gone from this region
    const beforeRegion = src.split('submit: parse deposit list')[0] || '';
    const lastBestEffort = beforeRegion.lastIndexOf('/* best effort */');
    // Either no best-effort comment in front of the wiring, or it's > 200 chars
    // before (i.e. unrelated to this catch site)
    expect(lastBestEffort === -1 || (beforeRegion.length - lastBestEffort) > 200).toBe(true);
  });
});
