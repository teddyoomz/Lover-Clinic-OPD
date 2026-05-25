// ④ (2026-05-26) — delete the patient-fill-link session on OPD-save success.
// Source-grep regression (the runtime path is verified by scripts/e2e-opd-link-lifecycle.mjs).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const src = fs.readFileSync('src/pages/AdminDashboard.jsx', 'utf8');

describe('④ delete session on OPD-save success', () => {
  it('isFromBookingFlow is hoisted to handleOpdClick scope (before _maybeOpenWalkInModal)', () => {
    const idxFlag = src.indexOf('const isFromBookingFlow');
    const idxWalk = src.indexOf('const _maybeOpenWalkInModal');
    expect(idxFlag).toBeGreaterThan(-1);
    expect(idxWalk).toBeGreaterThan(-1);
    expect(idxFlag).toBeLessThan(idxWalk);
  });
  it('_attachLinkedBookings hard-deletes opd_sessions/{sessionId}, gated on isFromBookingFlow, best-effort', () => {
    const fn = src.slice(src.indexOf('const _attachLinkedBookings'), src.indexOf('const hasExistingProClinic'));
    expect(fn).toMatch(/if\s*\(\s*isFromBookingFlow\s*\)/);
    expect(fn).toMatch(/deleteDoc\(\s*doc\(db,\s*'artifacts',\s*appId,\s*'public',\s*'data',\s*'opd_sessions',\s*sessionId\)\s*\)/);
    // best-effort: the delete sits in a try/catch (no throw on delete failure)
    expect(fn).toMatch(/catch\s*\(\s*delErr\s*\)\s*\{[^}]*best-effort/i);
  });
});
