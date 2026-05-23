// V121 (2026-05-23) — source-grep regression bank.
// Locks: helper exports + AdminDashboard wiring + V120-gap close + HubView + TabBar + AV118 amendment.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const ADMIN = fs.readFileSync(path.join(ROOT, 'src/pages/AdminDashboard.jsx'), 'utf8');
const HUBVIEW = fs.readFileSync(path.join(ROOT, 'src/components/admin/AppointmentHubView.jsx'), 'utf8');
const TABBAR = fs.readFileSync(path.join(ROOT, 'src/components/admin/AppointmentHubTabBar.jsx'), 'utf8');
const STATE = fs.readFileSync(path.join(ROOT, 'src/lib/opdSessionState.js'), 'utf8');
const AV = fs.readFileSync(path.join(ROOT, '.agents/skills/audit-anti-vibe-code/SKILL.md'), 'utf8');

describe('V121 — Helper exports', () => {
  it('SG1.1 — opdSessionState exports isCardFlowSession + isCardFlowUnread', () => {
    expect(STATE).toMatch(/export function isCardFlowSession\(/);
    expect(STATE).toMatch(/export function isCardFlowUnread\(/);
  });
  it('SG1.2 — Helpers carry V121 marker comment for institutional memory', () => {
    expect(STATE).toMatch(/V121 \(2026-05-23\)/);
  });
});

describe('V121 — AdminDashboard wiring', () => {
  it('SG2.1 — imports isCardFlowSession + isCardFlowUnread', () => {
    expect(ADMIN).toMatch(/isCardFlowSession/);
    expect(ADMIN).toMatch(/isCardFlowUnread/);
  });

  it('SG2.2 — cardFlowUnreadCount memo spans 5 session arrays', () => {
    expect(ADMIN).toMatch(/cardFlowUnreadCount\s*=\s*useMemo/);
    const memo = ADMIN.match(/cardFlowUnreadCount[\s\S]{0,1500}\}\,\s*\[[^\]]*\]/)?.[0] || '';
    expect(memo).toMatch(/sessions/);
    expect(memo).toMatch(/archivedSessions/);
    expect(memo).toMatch(/depositSessions/);
    expect(memo).toMatch(/archivedDepositSessions/);
    expect(memo).toMatch(/noDepositSessions/);
  });

  it('SG2.3 — Modal-open gate skips card-flow sessions (Option B)', () => {
    expect(ADMIN).toMatch(/!isCardFlowSession\(session\)/);
  });

  it('SG2.4 — Desktop sidebar tab purple bubble rendered', () => {
    expect(ADMIN).toMatch(/data-testid="cardflow-unread-badge-desktop"/);
    expect(ADMIN).toMatch(/#a855f7/);
  });

  it('SG2.5 — Mobile dock purple bubble rendered (same primitive)', () => {
    expect(ADMIN).toMatch(/data-testid="cardflow-unread-badge-mobile"/);
  });

  it('SG2.6 — V120-gap close: card-flow sessions stay hidden post-fill (3 filter sites)', () => {
    // V121 new gate pattern present in main queue + ndData + depositSessions filters.
    const v121GapPattern = /isHiddenFromQueue\s*&&\s*[^!]?(?:s\.|session\.)?createdFromBackendBooking/g;
    const matches = ADMIN.match(v121GapPattern) || [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });
});

describe('V121 — HubView wiring', () => {
  it('SG3.1 — imports isCardFlowUnread', () => {
    expect(HUBVIEW).toMatch(/isCardFlowUnread/);
  });
  it('SG3.2 — cardFlowSubPillCounts memo present + passed to TabBar via cardFlowCounts prop', () => {
    expect(HUBVIEW).toMatch(/cardFlowSubPillCounts\s*=\s*useMemo/);
    expect(HUBVIEW).toMatch(/cardFlowCounts=\{cardFlowSubPillCounts\}/);
  });
});

describe('V121 — TabBar wiring', () => {
  it('SG4.1 — accepts cardFlowCounts prop (default {})', () => {
    expect(TABBAR).toMatch(/cardFlowCounts\s*=\s*\{\}/);
  });
  it('SG4.2 — renders purple bubble per sub-pill when count > 0', () => {
    expect(TABBAR).toMatch(/appt-hub-tab-\$\{t\.key\}-cardflow-bubble/);
    expect(TABBAR).toMatch(/#a855f7/);
  });
});

describe('V121 — AV118 extension', () => {
  it('SG5.1 — AV118 V121 amendment present', () => {
    expect(AV).toMatch(/AV118 — V121 amendment/);
    expect(AV).toMatch(/isCardFlowSession/);
    expect(AV).toMatch(/isCardFlowUnread/);
  });
});
