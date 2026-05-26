// Real-time intake notification on appointment cards (2026-05-26, AV137)
// Patient-form submissions sent off a นัดหมาย card (card-flow:
// createdFromBackendBooking + isHiddenFromQueue) must update the card real-time
// + fire blue bubble + sound. Card-flow sessions are excluded from the queue
// data/ndData arrays; this verifies they re-enter (a) live linked-session
// resolution and (b) notification detection. Rule I flow-simulate (pure mirrors
// of the inline AdminDashboard logic) + source-grep regression locks.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const ADMIN = readFileSync('src/pages/AdminDashboard.jsx', 'utf8');

// --- Pure mirrors of the inline AdminDashboard logic (Rule I item a) ---------
function buildSessionsById(arrays) {
  const m = new Map();
  for (const arr of arrays) for (const s of arr || []) if (s?.id) m.set(s.id, s);
  return m;
}
function cardFlowNotifFilter(allDocs) {
  return allDocs.filter(s =>
    !s.isArchived && s.isHiddenFromQueue && s.createdFromBackendBooking &&
    s.patientData && s.isUnread && s.status === 'completed');
}

describe('F1 — real-time linked-session resolution (FIX ①)', () => {
  const cardFlow = {
    id: 'TEST-APPT-sess-1', createdFromBackendBooking: true, isHiddenFromQueue: true,
    patientData: { firstName: 'สมชาย' }, isUnread: true, status: 'completed',
  };
  it('F1.1 card-flow session NOT resolvable from the filtered arrays alone (pre-fix)', () => {
    const preFix = buildSessionsById([[], [], [], [], []]); // 5 filtered arrays exclude card-flow
    expect(preFix.has('TEST-APPT-sess-1')).toBe(false);
  });
  it('F1.2 card-flow session IS resolvable once allLinkedSessions is included (post-fix)', () => {
    const postFix = buildSessionsById([[], [], [], [], [], [cardFlow]]);
    expect(postFix.get('TEST-APPT-sess-1')).toEqual(cardFlow);
  });
  it('F1.3 fresh unfiltered doc wins over a stale filtered copy (allLinkedSessions last)', () => {
    const stale = { id: 'X', patientData: {} };
    const fresh = { id: 'X', patientData: { firstName: 'now' } };
    const m = buildSessionsById([[stale], [], [], [], [], [fresh]]);
    expect(m.get('X').patientData.firstName).toBe('now');
  });
});

describe('F2 — card-flow form-fill enters notification stream (FIX ②)', () => {
  it('F2.1 a card-flow session with patientData+isUnread+completed is detected', () => {
    const allDocs = [{ id: 'A', createdFromBackendBooking: true, isHiddenFromQueue: true, patientData: { firstName: 'ก' }, isUnread: true, status: 'completed' }];
    expect(cardFlowNotifFilter(allDocs).map(s => s.id)).toEqual(['A']);
  });
  it('F2.2 NOT detected before fill (no patientData) — no pre-fill spam', () => {
    const allDocs = [{ id: 'A', createdFromBackendBooking: true, isHiddenFromQueue: true, isUnread: false, status: 'pending' }];
    expect(cardFlowNotifFilter(allDocs)).toHaveLength(0);
  });
  it('F2.3 archived / non-card-flow / not-hidden excluded', () => {
    const allDocs = [
      { id: 'B', createdFromBackendBooking: true, isHiddenFromQueue: true, patientData: { x: 1 }, isUnread: true, status: 'completed', isArchived: true },
      { id: 'C', createdFromBackendBooking: false, isHiddenFromQueue: true, patientData: { x: 1 }, isUnread: true, status: 'completed' },
      { id: 'D', createdFromBackendBooking: true, isHiddenFromQueue: false, patientData: { x: 1 }, isUnread: true, status: 'completed' },
    ];
    expect(cardFlowNotifFilter(allDocs)).toHaveLength(0);
  });
});

describe('SG — source-grep regression locks', () => {
  it('SG1 sessionsById memo includes allLinkedSessions (source array + deps)', () => {
    const hits = ADMIN.match(/noDepositSessions,\s*allLinkedSessions\]/g) || [];
    expect(hits.length).toBeGreaterThanOrEqual(2); // for-array + useMemo deps
  });
  it('SG2 listener publishes allLinkedSessions read-only', () => {
    expect(ADMIN).toMatch(/setAllLinkedSessions\(allDocs\)/);
  });
  it('SG3 allNotifData includes cardFlowNotif', () => {
    expect(ADMIN).toMatch(/allNotifData\s*=\s*\[\.\.\.data,\s*\.\.\.ndData,\s*\.\.\.cardFlowNotif\]/);
  });
  it('SG4 cardFlowNotif uses the exact excluded predicate', () => {
    expect(ADMIN).toMatch(/isHiddenFromQueue\s*&&\s*s\.createdFromBackendBooking/);
  });
  it('SG5 push self-heal effect present + permission-guarded', () => {
    expect(ADMIN).toContain('push self-heal');
    expect(ADMIN).toMatch(/lc_push_enabled/);
    expect(ADMIN).toMatch(/Notification\.permission !== 'granted'/);
  });
  it('SG6 FIX ① marker comment present (publish is setState-only / read-only listener)', () => {
    expect(ADMIN).toMatch(/FIX ① — publish the unfiltered branch session set/);
  });
});

describe('AV137 — invariant registered', () => {
  it('audit-anti-vibe-code SKILL.md documents AV137', () => {
    const av = readFileSync('.agents/skills/audit-anti-vibe-code/SKILL.md', 'utf8');
    expect(av).toMatch(/AV137/);
  });
});
