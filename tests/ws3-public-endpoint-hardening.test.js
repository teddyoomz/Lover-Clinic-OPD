import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ─── WS3 (2026-06-10) — public-endpoint hardening ────────────────────────────
// (1) send.js + saved-replies.js lost their auth gate when V50 deleted
//     api/proclinic/_lib/auth.js → broken import (HTTP 500) since 2026-05-08.
//     AND the deleted verifyAuth only checked token-validity, NOT any claim, so
//     an anon-auth user could have triggered outbound LINE/FB sends. Restored
//     via verifyClinicStaffToken (admin SDK verifyIdToken + isClinicStaff/admin
//     claim). (2) schedule (SCH) link token bumped 40-bit → 128-bit crypto.

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const adminAuth = read('api/admin/_lib/adminAuth.js');
const send = read('api/webhook/send.js');
const savedReplies = read('api/webhook/saved-replies.js');
const adminDash = read('src/pages/AdminDashboard.jsx');

function allApiJsFiles() {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) out.push(p);
    }
  })(path.join(root, 'api'));
  return out;
}

describe('WS3 — public-endpoint hardening', () => {
  it('adminAuth exports verifyClinicStaffToken with a clinic-staff claim check (admin OR isClinicStaff)', () => {
    expect(adminAuth).toMatch(/export async function verifyClinicStaffToken/);
    expect(adminAuth).toMatch(/verifyIdToken\(token, true\)/);          // checkRevoked
    expect(adminAuth).toMatch(/isClinicStaff === true/);
    expect(adminAuth).toMatch(/decoded\.admin === true/);
    expect(adminAuth).toMatch(/Forbidden: clinic-staff/);              // 403 on non-staff
  });

  it('send.js + saved-replies.js gate on verifyClinicStaffToken (restored auth)', () => {
    for (const src of [send, savedReplies]) {
      expect(src).toMatch(/import \{ verifyClinicStaffToken \} from '\.\.\/admin\/_lib\/adminAuth\.js'/);
      expect(src).toMatch(/await verifyClinicStaffToken\(req, res\)/);
      expect(src).not.toMatch(/await verifyAuth\(/);                   // old weak gate gone
    }
  });

  it('NO api file IMPORTS the V50-deleted proclinic/_lib/auth.js (ghost import gone)', () => {
    for (const f of allApiJsFiles()) {
      const src = fs.readFileSync(f, 'utf8');
      // import statements only — comments may legitimately mention the old path
      expect(src.split('\n').filter((l) => /^\s*import/.test(l)).join('\n'), f)
        .not.toMatch(/proclinic\/_lib\/auth/);
    }
  });

  it('schedule (SCH) link token is 128-bit crypto (was 40-bit / 5 bytes)', () => {
    expect(adminDash).toMatch(/'SCH-'[\s\S]{0,80}crypto\.getRandomValues\(new Uint8Array\(16\)\)/);
    expect(adminDash).not.toMatch(/'SCH-'[\s\S]{0,80}new Uint8Array\(5\)/);
  });
});
