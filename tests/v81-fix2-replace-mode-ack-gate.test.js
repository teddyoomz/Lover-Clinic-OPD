// tests/v81-fix2-replace-mode-ack-gate.test.js
// V81-fix2 (2026-05-17 EOD+1) — Replace mode password-reset acknowledgment gate.
//
// CRITICAL bug 2026-05-17 EOD+1: V81 Replace mode wipes Auth users + restores
// without passwords (sanitizeAuthUser strips passwordHash per Rule C2).
// Caller passed sendPasswordResetEmails: false → 353 users locked out.
//
// Fix: 3-layer gate — UI checkbox + endpoint validation + executor double-check.
// AV66 audit invariant locks the pattern.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

// ─── Group K: source-grep regression locks for V81-fix2 ─────────────────

describe('V81-fix2 — Replace mode ack gate (Group K)', () => {
  it('K.1 — restore executor accepts ackPasswordResetRequired param', () => {
    const src = fs.readFileSync('api/admin/_lib/wholeSystemRestoreExecutor.js', 'utf8');
    expect(src).toMatch(/ackPasswordResetRequired/);
    expect(src).toMatch(/V81-fix2/);
  });

  it('K.2 — restore executor throws REPLACE_ACK_REQUIRED when replace mode + missing ack', () => {
    const src = fs.readFileSync('api/admin/_lib/wholeSystemRestoreExecutor.js', 'utf8');
    expect(src).toMatch(/REPLACE_ACK_REQUIRED/);
    expect(src).toMatch(/mode === 'replace' && ackPasswordResetRequired !== true/);
  });

  it('K.3 — restore executor forces effectiveSendResetEmails on replace mode', () => {
    const src = fs.readFileSync('api/admin/_lib/wholeSystemRestoreExecutor.js', 'utf8');
    expect(src).toMatch(/effectiveSendResetEmails\s*=\s*mode === 'replace' \? true/);
    expect(src).toMatch(/if \(effectiveSendResetEmails\)/);
  });

  it('K.4 — endpoint extracts ackPasswordResetRequired from req.body', () => {
    const src = fs.readFileSync('api/admin/whole-system-restore.js', 'utf8');
    expect(src).toMatch(/ackPasswordResetRequired/);
    expect(src).toMatch(/REPLACE_ACK_REQUIRED/);
  });

  it('K.5 — endpoint returns 400 REPLACE_ACK_REQUIRED for replace+missing ack', () => {
    const src = fs.readFileSync('api/admin/whole-system-restore.js', 'utf8');
    // Endpoint pre-flight check
    const preflightIdx = src.indexOf('mode === \'replace\' && ackPasswordResetRequired !== true');
    expect(preflightIdx).toBeGreaterThan(-1);
    // The 400 response status is right after the check
    const after = src.slice(preflightIdx, preflightIdx + 300);
    expect(after).toMatch(/status\(400\)/);
    expect(after).toMatch(/REPLACE_ACK_REQUIRED/);
  });

  it('K.6 — UI modal has v81-fix2-ack-password-reset checkbox', () => {
    const src = fs.readFileSync('src/components/backend/WholeSystemRestoreModal.jsx', 'utf8');
    expect(src).toMatch(/data-testid="v81-fix2-ack-password-reset"/);
    expect(src).toMatch(/ackPasswordReset/);
  });

  it('K.7 — UI modal disables submit when replace mode + ack unchecked', () => {
    const src = fs.readFileSync('src/components/backend/WholeSystemRestoreModal.jsx', 'utf8');
    // canSubmit incorporates ackPasswordReset for replace mode
    expect(src).toMatch(/canSubmit\s*=[\s\S]{0,400}!replaceAckRequired\s*\|\|\s*ackPasswordReset/);
  });

  it('K.8 — UI modal sends ackPasswordResetRequired in request body for replace mode', () => {
    const src = fs.readFileSync('src/components/backend/WholeSystemRestoreModal.jsx', 'utf8');
    expect(src).toMatch(/ackPasswordResetRequired:\s*mode === 'replace' \? ackPasswordReset : false/);
  });

  it('K.9 — UI modal forces sendPasswordResetEmails=true server-side for replace mode', () => {
    const src = fs.readFileSync('src/components/backend/WholeSystemRestoreModal.jsx', 'utf8');
    expect(src).toMatch(/sendPasswordResetEmails:\s*mode === 'replace' \? true : sendPasswordReset/);
  });

  it('K.10 — Replace mode warning panel + Thai password-reset copy present', () => {
    const src = fs.readFileSync('src/components/backend/WholeSystemRestoreModal.jsx', 'utf8');
    expect(src).toMatch(/ทุก staff ต้อง reset password/);
    expect(src).toMatch(/ลืมรหัสผ่าน/);
    expect(src).toMatch(/Rule C2/);
  });

  it('K.11 — AV66 invariant documented in audit-anti-vibe-code SKILL.md', () => {
    const src = fs.readFileSync('.agents/skills/audit-anti-vibe-code/SKILL.md', 'utf8');
    expect(src).toMatch(/AV66.*V81-fix2/);
    expect(src).toMatch(/password-reset acknowledgment/);
    expect(src).toMatch(/3-layer gate/);
  });

  it('K.12 — AV66 listed in CRITICAL priority section', () => {
    const src = fs.readFileSync('.agents/skills/audit-anti-vibe-code/SKILL.md', 'utf8');
    expect(src).toMatch(/AV66.*V81-fix2.*Replace mode/);
  });
});

// ─── Group L: behavioral simulation (pure logic) ────────────────────────

describe('V81-fix2 — endpoint gate behavior (Group L)', () => {
  // Simulate the endpoint pre-flight logic
  function preflightCheck({ mode, ackPasswordResetRequired }) {
    if (mode === 'replace' && ackPasswordResetRequired !== true) {
      return { ok: false, error: 'REPLACE_ACK_REQUIRED', status: 400 };
    }
    return { ok: true };
  }

  it('L.1 — Replace mode without ack → REPLACE_ACK_REQUIRED 400', () => {
    expect(preflightCheck({ mode: 'replace', ackPasswordResetRequired: false }))
      .toEqual({ ok: false, error: 'REPLACE_ACK_REQUIRED', status: 400 });
  });

  it('L.2 — Replace mode without ack field → REPLACE_ACK_REQUIRED 400', () => {
    expect(preflightCheck({ mode: 'replace' }))
      .toEqual({ ok: false, error: 'REPLACE_ACK_REQUIRED', status: 400 });
  });

  it('L.3 — Replace mode with explicit ack: true → ok', () => {
    expect(preflightCheck({ mode: 'replace', ackPasswordResetRequired: true }))
      .toEqual({ ok: true });
  });

  it('L.4 — Replace mode with ack: "true" (truthy string) → still REJECTED (must be strict true)', () => {
    // Strict === true check; truthy strings don't pass
    expect(preflightCheck({ mode: 'replace', ackPasswordResetRequired: 'true' }))
      .toEqual({ ok: false, error: 'REPLACE_ACK_REQUIRED', status: 400 });
  });

  it('L.5 — Fresh mode without ack → ok (Fresh doesn\'t wipe)', () => {
    expect(preflightCheck({ mode: 'fresh' }))
      .toEqual({ ok: true });
  });

  it('L.6 — Fresh mode with ack: true → still ok (ignored)', () => {
    expect(preflightCheck({ mode: 'fresh', ackPasswordResetRequired: true }))
      .toEqual({ ok: true });
  });

  // Simulate the executor's effectiveSendResetEmails logic
  function computeEffectiveSendReset({ mode, sendPasswordResetEmails }) {
    return mode === 'replace' ? true : !!sendPasswordResetEmails;
  }

  it('L.7 — Replace mode FORCES sendResetEmails=true regardless of caller false', () => {
    expect(computeEffectiveSendReset({ mode: 'replace', sendPasswordResetEmails: false })).toBe(true);
  });

  it('L.8 — Replace mode FORCES sendResetEmails=true regardless of caller undefined', () => {
    expect(computeEffectiveSendReset({ mode: 'replace' })).toBe(true);
  });

  it('L.9 — Fresh mode honors caller sendResetEmails: false', () => {
    expect(computeEffectiveSendReset({ mode: 'fresh', sendPasswordResetEmails: false })).toBe(false);
  });

  it('L.10 — Fresh mode honors caller sendResetEmails: true', () => {
    expect(computeEffectiveSendReset({ mode: 'fresh', sendPasswordResetEmails: true })).toBe(true);
  });

  // Simulate UI modal canSubmit logic
  function canSubmit({ selected, confirmName, selectedName, stage, mode, ackPasswordReset }) {
    const replaceAckRequired = mode === 'replace';
    return !!selected
      && confirmName === selectedName
      && stage === 'select'
      && (!replaceAckRequired || ackPasswordReset);
  }

  it('L.11 — UI modal: Replace mode + ack unchecked → submit DISABLED', () => {
    expect(canSubmit({
      selected: { name: 'manual-20260517-0257' },
      confirmName: 'manual-20260517-0257',
      selectedName: 'manual-20260517-0257',
      stage: 'select',
      mode: 'replace',
      ackPasswordReset: false,
    })).toBe(false);
  });

  it('L.12 — UI modal: Replace mode + ack CHECKED → submit ENABLED', () => {
    expect(canSubmit({
      selected: { name: 'manual-20260517-0257' },
      confirmName: 'manual-20260517-0257',
      selectedName: 'manual-20260517-0257',
      stage: 'select',
      mode: 'replace',
      ackPasswordReset: true,
    })).toBe(true);
  });

  it('L.13 — UI modal: Fresh mode without ack → submit ENABLED (Fresh doesn\'t need ack)', () => {
    expect(canSubmit({
      selected: { name: 'manual-20260517-0257' },
      confirmName: 'manual-20260517-0257',
      selectedName: 'manual-20260517-0257',
      stage: 'select',
      mode: 'fresh',
      ackPasswordReset: false,
    })).toBe(true);
  });
});
