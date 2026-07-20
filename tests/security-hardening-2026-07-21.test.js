// ─── security-hardening-2026-07-21 — regression locks + universal classifiers ─
// Locks the 2026-07-21 whole-app-audit security fixes so none can silently
// regress, and classifies the whole surface so FUTURE files can't reintroduce
// the same classes (AV142-style anti-drift):
//
//   SH1  FB webhook signature fail-closed (was fail-OPEN on missing header —
//        proven live: unsigned POST → HTTP 200 EVENT_RECEIVED pre-fix, see
//        scripts/diag-webhook-signature-probe.mjs)
//   SH2  universal webhook classifier — every webhook that verifies an HMAC
//        signature must reject a MISSING header (never `if (signature) {...}`)
//   SH3  verifyIdToken universal classifier — every call in api/ passes
//        checkRevoked=true (disabled staff rejected instantly, not at ~1h expiry)
//   SH4  CRON_SECRET universal classifier — every cron auth gate fails CLOSED
//        when the secret is unset (no "Bearer undefined" acceptance)
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

describe('SH1 — FB webhook signature fail-closed', () => {
  const fb = read('api/webhook/facebook.js');

  it('SH1.1 guard rejects missing OR invalid signature in one fail-closed branch', () => {
    expect(fb).toMatch(/if\s*\(\s*!signature\s*\|\|\s*!verifySignature\(rawBody,\s*signature,\s*fbConfig\.appSecret\)\s*\)/);
  });

  it('SH1.2 anti-regression — the old fail-open shape (verify only WHEN header present) is gone', () => {
    // Pre-fix: `if (signature) { if (!verifySignature(...)) return 401 } }`
    // — a missing header fell through to JSON.parse + event processing.
    expect(fb).not.toMatch(/if\s*\(\s*signature\s*\)\s*\{\s*\n?\s*if\s*\(\s*!verifySignature/);
  });

  it('SH1.3 the 401 response still exists on the guard path', () => {
    const guardIdx = fb.indexOf('!signature || !verifySignature');
    expect(guardIdx).toBeGreaterThan(-1);
    const after = fb.slice(guardIdx, guardIdx + 400);
    expect(after).toMatch(/status\(401\)/);
  });

  it('SH1.4 LINE webhook parity — its fail-closed guard is intact (the reference shape)', () => {
    const line = read('api/webhook/line.js');
    expect(line).toMatch(/!signature\s*\|\|\s*!verifySignature/);
  });
});

describe('SH2 — universal webhook signature classifier', () => {
  // Every file under api/webhook/ that DEFINES verifySignature must gate with
  // the fail-closed form. A new webhook with `if (signature) {` fails here.
  const files = readdirSync(join(ROOT, 'api/webhook')).filter((f) => f.endsWith('.js'));

  it('SH2.1 every signature-verifying webhook fails closed on a missing header', () => {
    const offenders = [];
    for (const f of files) {
      const src = read(`api/webhook/${f}`);
      if (!/function verifySignature/.test(src)) continue; // not a signature-verifying webhook
      const failClosed = /!signature\s*\|\|\s*!verifySignature/.test(src);
      const failOpen = /if\s*\(\s*signature\s*\)\s*\{\s*\n?\s*if\s*\(\s*!verifySignature/.test(src);
      if (!failClosed || failOpen) offenders.push(f);
    }
    expect(offenders, `fail-open signature gate in: ${offenders.join(', ')}`).toEqual([]);
  });

  it('SH2.2 sanity — the classifier actually saw both webhook files', () => {
    const verifying = files.filter((f) => /function verifySignature/.test(read(`api/webhook/${f}`)));
    expect(verifying).toEqual(expect.arrayContaining(['facebook.js', 'line.js']));
  });
});

describe('SH3 — verifyIdToken checkRevoked universal classifier', () => {
  const walk = (dir, out = []) => {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${dir}/${e.name}`, out);
      else if (e.name.endsWith('.js')) out.push(`${dir}/${e.name}`);
    }
    return out;
  };

  it('SH3.1 every verifyIdToken CALL in api/ passes checkRevoked=true', () => {
    const offenders = [];
    for (const f of walk('api')) {
      const src = read(f);
      // match calls only (skip comments/docs): `verifyIdToken(<arg>` not followed by `, true`
      const calls = src.match(/verifyIdToken\([^)]*\)/g) || [];
      for (const c of calls) {
        if (!/verifyIdToken\([^)]*,\s*true\s*\)/.test(c)) offenders.push(`${f}: ${c}`);
      }
    }
    expect(offenders, `verifyIdToken without checkRevoked: ${offenders.join(' · ')}`).toEqual([]);
  });

  it('SH3.2 tfp-options carries the checkRevoked flag (the 2026-07-21 fix)', () => {
    expect(read('api/tfp-options.js')).toMatch(/verifyIdToken\(token,\s*true\)/);
  });
});

describe('SH4 — CRON_SECRET fail-closed universal classifier', () => {
  const files = readdirSync(join(ROOT, 'api/cron')).filter((f) => f.endsWith('.js'));

  it('SH4.1 every cron that gates on CRON_SECRET also guards against it being unset', () => {
    const offenders = [];
    for (const f of files) {
      const src = read(`api/cron/${f}`);
      if (!src.includes('CRON_SECRET')) continue;
      // Accept either fleet idiom:
      //   if (!process.env.CRON_SECRET || auth !== `Bearer ${...}`)
      //   const cronSecret = process.env.CRON_SECRET; if (!cronSecret || ...)
      const failClosed = /!\s*process\.env\.CRON_SECRET\s*\|\|/.test(src) || /!\s*cronSecret\s*\|\|/.test(src);
      if (!failClosed) offenders.push(f);
    }
    expect(offenders, `crons accepting "Bearer undefined" when secret unset: ${offenders.join(', ')}`).toEqual([]);
  });

  it('SH4.2 the two 2026-07-21 fixes are in place (line-reminder fire + retry)', () => {
    expect(read('api/cron/line-reminder-fire.js')).toMatch(/!process\.env\.CRON_SECRET\s*\|\|/);
    expect(read('api/cron/line-reminder-retry.js')).toMatch(/!process\.env\.CRON_SECRET\s*\|\|/);
  });
});
