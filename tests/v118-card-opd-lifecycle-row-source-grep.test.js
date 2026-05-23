// V118 (2026-05-23) — source-grep regression bank.
// Locks: AV118 invariant + V87/AV84 preservation + sanctioned-callsite list.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const ADMIN = fs.readFileSync(path.join(ROOT, 'src/pages/AdminDashboard.jsx'), 'utf8');
const ROWCARD = fs.readFileSync(path.join(ROOT, 'src/components/admin/AppointmentHubRowCard.jsx'), 'utf8');
const HUBVIEW = fs.readFileSync(path.join(ROOT, 'src/components/admin/AppointmentHubView.jsx'), 'utf8');
const ROW = fs.readFileSync(path.join(ROOT, 'src/components/admin/OpdLifecycleRow.jsx'), 'utf8');
const STATE = fs.readFileSync(path.join(ROOT, 'src/lib/opdSessionState.js'), 'utf8');
const AV = fs.readFileSync(path.join(ROOT, '.agents/skills/audit-anti-vibe-code/SKILL.md'), 'utf8');

describe('V118 — Source-grep AV118 + helper module', () => {
  it('SG1.1 — opdSessionState.js exports the 4 canonical helpers', () => {
    expect(STATE).toMatch(/export function isOpdSessionSaved\(/);
    expect(STATE).toMatch(/export function hasPatientData\(/);
    expect(STATE).toMatch(/export function resolveCardOpdState\(/);
    expect(STATE).toMatch(/export function synthesizeSessionFromCustomer\(/);
  });

  it('SG1.2 — AdminDashboard imports isOpdSessionSaved from opdSessionState', () => {
    expect(ADMIN).toMatch(/from\s+['"]\.\.\/lib\/opdSessionState\.js['"]/);
    expect(ADMIN).toMatch(/isOpdSessionSaved/);
  });

  it('SG1.3 — HubView imports resolveCardOpdState + synthesizeSessionFromCustomer', () => {
    expect(HUBVIEW).toMatch(/resolveCardOpdState/);
    expect(HUBVIEW).toMatch(/synthesizeSessionFromCustomer/);
    expect(HUBVIEW).toMatch(/from\s+['"]\.\.\/\.\.\/lib\/opdSessionState\.js['"]/);
  });

  it('SG1.4 — AdminDashboard imports SendCustomerLinkModal + provisionOpdLinkForBookingPair', () => {
    expect(ADMIN).toMatch(/import\s+SendCustomerLinkModal/);
    expect(ADMIN).toMatch(/provisionOpdLinkForBookingPair/);
  });
});

describe('V118 — AV118 invariant + sanctioned exceptions', () => {
  it('SG2.1 — AV118 entry is present in audit-anti-vibe-code SKILL.md', () => {
    expect(AV).toMatch(/AV118[\s\S]{0,400}Card-level OPD state derivation/i);
    expect(AV).toMatch(/opdSessionState/);
  });

  it('SG2.2 — AV118 sanctioned exception list explicitly includes the 4 closed-list entries', () => {
    // Verify the 4 named sanctioned files are listed in the AV118 entry to lock
    // the closed list against silent expansion.
    const av118 = AV.match(/AV118[\s\S]{0,4000}/i)?.[0] || '';
    expect(av118).toMatch(/opdSessionState\.js/);
    expect(av118).toMatch(/v118-opd-session-state-helpers/);
    expect(av118).toMatch(/v87-link-button-opd-save-guard/);
    expect(av118).toMatch(/handleOpdClick/);
  });
});

describe('V118 — V87/AV84 preservation (regression locks)', () => {
  it('SG3.1 — V87/AV84 preserved: setPatientLinkModal trigger count remains 2', () => {
    const matches = ADMIN.match(/setPatientLinkModal\(session\.id\)/g) || [];
    expect(matches.length).toBe(2);
  });

  it('SG3.2 — V87/AV84 guard wrapper still present (regression lock)', () => {
    expect(ADMIN).toMatch(/session\.opdRecordedAt\s*&&\s*session\.brokerStatus\s*===\s*['"]done['"]/);
  });
});

describe('V118 — AppointmentHubRowCard integration', () => {
  it('SG4.1 — RowCard renders OpdLifecycleRow when opdLifecycle prop set', () => {
    expect(ROWCARD).toMatch(/import OpdLifecycleRow/);
    expect(ROWCARD).toMatch(/<OpdLifecycleRow/);
    expect(ROWCARD).toMatch(/opdLifecycle\s*=\s*null/);
  });

  it('SG4.2 — Ready-to-save chip rendered when state === "D"', () => {
    expect(ROWCARD).toMatch(/opdLifecycle.*state\s*===\s*['"]D['"]/);
    expect(ROWCARD).toMatch(/ลูกค้ากรอกแล้ว/);
    expect(ROWCARD).toMatch(/data-testid="opd-ready-to-save-chip"/);
  });

  it('SG4.3 — RowCard passes 6 expected props to OpdLifecycleRow', () => {
    // Source-grep: each handler/prop name must appear inside the rendered JSX
    expect(ROWCARD).toMatch(/state=\{opdLifecycle\.state\}/);
    expect(ROWCARD).toMatch(/onSendLink=\{opdLifecycle\.onSendLink\}/);
    expect(ROWCARD).toMatch(/onViewLink=\{opdLifecycle\.onViewLink\}/);
    expect(ROWCARD).toMatch(/onSaveOpd=\{opdLifecycle\.onSaveOpd\}/);
    expect(ROWCARD).toMatch(/onViewOpd=\{opdLifecycle\.onViewOpd\}/);
  });
});

describe('V118 — OpdLifecycleRow component', () => {
  it('SG5.1 — renders 5 distinct state branches', () => {
    expect(ROW).toMatch(/state\s*===\s*['"]B['"]/);
    expect(ROW).toMatch(/state\s*===\s*['"]C['"]/);
    expect(ROW).toMatch(/state\s*===\s*['"]D['"]/);
    expect(ROW).toMatch(/state\s*===\s*['"]A['"]/);
    expect(ROW).toMatch(/state\s*===\s*['"]E['"]/);
  });

  it('SG5.2 — showOpdView includes State D (review-before-save per user directive)', () => {
    // Locks the user directive: "admin จะต้อง Review ข้อมูลลูกค้า ... ก่อน ... บันทึก"
    // State D must include the view button alongside the save button.
    expect(ROW).toMatch(/showOpdView\s*=\s*state\s*===\s*['"]A['"][\s\S]{0,100}state\s*===\s*['"]D['"]/);
  });

  it('SG5.3 — 5 distinct data-testid markers present', () => {
    expect(ROW).toMatch(/data-testid="opd-link-send-btn"/);
    expect(ROW).toMatch(/data-testid="opd-link-view-btn"/);
    expect(ROW).toMatch(/data-testid="opd-save-btn-wait"/);
    expect(ROW).toMatch(/data-testid="opd-save-btn-active"/);
    expect(ROW).toMatch(/data-testid="opd-view-btn"/);
  });
});

describe('V118 — AppointmentHubView wiring', () => {
  it('SG6.1 — HubView hides opdLifecycle on cancelled sub-tab', () => {
    expect(HUBVIEW).toMatch(/activeTab\s*===\s*['"]cancelled['"]/);
    expect(HUBVIEW).toMatch(/hideOpdLifecycle/);
  });

  it('SG6.2 — HubView builds customersById Map for synth-session fallback', () => {
    expect(HUBVIEW).toMatch(/customersById/);
    expect(HUBVIEW).toMatch(/allCustomersState/);
  });

  it('SG6.3 — HubView passes opdLifecycle prop to RowCard', () => {
    expect(HUBVIEW).toMatch(/opdLifecycle=\{opdLifecycle\}/);
  });
});

describe('V118 — AdminDashboard handlers', () => {
  it('SG7.1 — handleSendOrViewOpdLink calls provisionOpdLinkForBookingPair', () => {
    expect(ADMIN).toMatch(/handleSendOrViewOpdLink/);
    expect(ADMIN).toMatch(/provisionOpdLinkForBookingPair\(/);
  });

  it('SG7.2 — handleSaveOpdFromCard delegates to handleOpdClick', () => {
    expect(ADMIN).toMatch(/handleSaveOpdFromCard/);
    // The handler must invoke the existing handleOpdClick (the canonical writer).
    expect(ADMIN).toMatch(/await\s+handleOpdClick\(session\)/);
  });

  it('SG7.3 — resolveLinkedSession with lazy-fetch pattern present', () => {
    expect(ADMIN).toMatch(/resolveLinkedSession/);
    expect(ADMIN).toMatch(/lazyFetchedSessionsRef/);
  });

  it('SG7.4 — sessionsById memo spans all 5 session state arrays', () => {
    expect(ADMIN).toMatch(/sessionsById/);
    // The memo body must reference each of the 5 source arrays.
    const memo = ADMIN.match(/const sessionsById[\s\S]{0,800}\}\,\s*\[[^\]]*\]/)?.[0] || '';
    expect(memo).toMatch(/sessions/);
    expect(memo).toMatch(/archivedSessions/);
    expect(memo).toMatch(/depositSessions/);
    expect(memo).toMatch(/archivedDepositSessions/);
    expect(memo).toMatch(/noDepositSessions/);
  });

  it('SG7.5 — synth-session __synthetic gate present at destructive modal buttons', () => {
    // The 3 V118 gates added to viewingSession modal's destructive ops
    const gateMatches = ADMIN.match(/!viewingSession\.__synthetic/g) || [];
    expect(gateMatches.length).toBeGreaterThanOrEqual(3);
  });
});

describe('V118 — Marker comments + cross-file institutional memory', () => {
  it('SG8.1 — V118 marker comments present at AdminDashboard call sites', () => {
    const markers = ADMIN.match(/V118 \(2026-05-23\)/g) || [];
    expect(markers.length).toBeGreaterThanOrEqual(4);
  });

  it('SG8.2 — V118 marker comments present at OpdLifecycleRow', () => {
    expect(ROW).toMatch(/V118 \(2026-05-23\)/);
  });

  it('SG8.3 — V118 marker comments present at HubView', () => {
    expect(HUBVIEW).toMatch(/V118 \(2026-05-23\)/);
  });

  it('SG8.4 — V118 marker comments present at RowCard', () => {
    expect(ROWCARD).toMatch(/V118 \(2026-05-23\)/);
  });
});
