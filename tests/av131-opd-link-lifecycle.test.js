// AV131 (2026-05-26) — OPD link lifecycle invariants (②③④).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('AV131 — OPD link lifecycle invariants', () => {
  it('opd-pending tab membership goes through isAppointmentOpdPending (single source)', () => {
    const view = fs.readFileSync('src/components/admin/AppointmentHubView.jsx', 'utf8');
    expect(view).toMatch(/isAppointmentOpdPending\(/);
    // no inline state-string comparison for tab membership (must use the helper)
    expect(view).not.toMatch(/activeTab === 'opd-pending'[\s\S]{0,120}=== 'B'/);
  });
  it('decideCleanupAction has the appt-date-passed branch above the age check', () => {
    const core = fs.readFileSync('src/lib/opdSessionCleanupCore.js', 'utf8');
    const idxDate = core.indexOf("reason: 'appt-date-passed'");
    const idxAge = core.indexOf('const ms = createdAtMs(data)'); // the call inside decideCleanupAction
    expect(idxDate).toBeGreaterThan(-1);
    expect(idxAge).toBeGreaterThan(-1);
    expect(idxDate).toBeLessThan(idxAge); // date branch fires before the age check
  });
  it('④ session delete is gated on isFromBookingFlow + targets opd_sessions/{sessionId}', () => {
    const dash = fs.readFileSync('src/pages/AdminDashboard.jsx', 'utf8');
    const fn = dash.slice(dash.indexOf('const _attachLinkedBookings'), dash.indexOf('const hasExistingProClinic'));
    expect(fn).toMatch(/if\s*\(\s*isFromBookingFlow\s*\)/);
    expect(fn).toMatch(/deleteDoc\([^)]*opd_sessions[^)]*sessionId/);
  });
  it('AV131 documented in the audit skill', () => {
    const skill = fs.readFileSync('.agents/skills/audit-anti-vibe-code/SKILL.md', 'utf8');
    expect(skill).toMatch(/AV131/);
  });
});
