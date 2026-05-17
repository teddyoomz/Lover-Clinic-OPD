// tests/v82-fix2-permanent-restore-reset-stamp.test.js
//
// V82-fix2 (2026-05-17 EOD+3 LATE+3) — regression test for the State D × E
// combinatorial gap missed by v82-followup-state-machine-test.mjs.
//
// User report (verbatim): "ใน frontend tab ประวัติ เมื่อกดปุ่มกลับเข้าคิว
// แล้วเลือกคิวถาวร กลายเป็น list ลูกค้านั้นหายไปเลย ไม่ยอมกลับเข้ามาหน้าคิว
// หน้าคลินิก แล้วก็หายไปจากหน้าประวัติด้วย".
//
// Root cause: AdminDashboard.jsx queue filter (line 2272+) had the
// _v82FollowupOpdResetAt opt-out AFTER the isPermanent-non-deposit early-
// reject (line 2275). When user clicked "กลับเข้าคิว → ลิงก์ดูข้อมูล" on a
// reset-stamped session, isPermanent=true was set, line 2275 returned false,
// and the opt-out was unreachable → session silently routed to จองไม่มัดจำ
// tab.
//
// State-machine test missed it because it tested State D (restore-permanent)
// and State E (V82-followup reset stamp) IN ISOLATION — never the D+E
// combination.
//
// Class-of-bug = V12 multi-reader-sweep family at FILTER ORDERING boundary
// (sibling tab-routing filters must consult the same transient flag).
// New invariant AV77 codifies the pattern permanently.
//
// 4 groups, ~30 assertions:
//   A. State-machine combinatorial gap — D+E + adversarial states (10)
//   B. noDepositSessions exclusion (4)
//   C. Source-grep regression locks at AdminDashboard.jsx (8)
//   D. Architectural invariant — opt-out fires before isPermanent reject (4)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(import.meta.dirname, '..');
const readFile = (p) => readFileSync(p, 'utf-8');

const SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const NOW = Date.now();
const TS = (ms) => ({ toMillis: () => ms });

// ── Filter mirrors — VERBATIM from AdminDashboard.jsx (post-V82-fix2) ────────
// When the source changes, update here too (V12 multi-reader-sweep guard).

function queueFilter(session, now) {
  if (session.isArchived) return false;
  // V82-fix2: opt-out fires before isPermanent/deposit excludes for non-deposit.
  if (session._v82FollowupOpdResetAt && session.formType !== 'deposit') return true;
  if (session.formType === 'deposit' && !session.serviceCompleted) return false;
  if (session.isPermanent && session.formType !== 'deposit' && !session.serviceCompleted) return false;
  if (session.isPermanent) return true;
  if (session.formType === 'deposit' && session.serviceCompleted) return true;
  if (session._v82FollowupOpdResetAt) return true;
  if (!session.createdAt) return true;
  return (now - session.createdAt.toMillis()) <= SESSION_TIMEOUT_MS;
}

function noDepositFilter(s) {
  // V82-fix2: exclude reset-stamped sessions (they belong in queue).
  return !s.isArchived && s.isPermanent && s.formType !== 'deposit' && !s.serviceCompleted && !s._v82FollowupOpdResetAt;
}

// State A-F mirrors from scripts/v82-followup-state-machine-test.mjs
function stateOverlay(state, now) {
  const oneHrAgo = TS(now - 60 * 60 * 1000);
  const threeHrAgo = TS(now - 3 * 60 * 60 * 1000);
  const nowTs = TS(now);
  switch (state) {
    case 'A': return { isArchived: false, createdAt: oneHrAgo };
    case 'B': return { isArchived: true, archivedAt: nowTs, createdAt: threeHrAgo, opdRecordedAt: nowTs };
    case 'C': return { isArchived: false, archivedAt: null, isPermanent: false, createdAt: nowTs };
    case 'D': return { isArchived: false, archivedAt: null, isPermanent: true, createdAt: threeHrAgo };
    case 'E': return { isArchived: false, createdAt: threeHrAgo, _v82FollowupOpdResetAt: nowTs };
    case 'F': return { isArchived: false, createdAt: oneHrAgo, serviceCompleted: true };
    default: throw new Error(`Unknown state ${state}`);
  }
}

function buildSession(formType, ...states) {
  const base = { formType };
  for (const s of states) Object.assign(base, stateOverlay(s, NOW));
  return base;
}

// ────────────────────────────────────────────────────────────────────────────

describe('V82-fix2 — A. State-machine combinatorial gap (D×E + adversarial)', () => {
  it('A.1 — D+E combo for intake: queue=true (post-fix; was false pre-fix)', () => {
    const s = buildSession('intake', 'D', 'E');
    // sanity: confirm combo state
    expect(s.isPermanent).toBe(true);
    expect(!!s._v82FollowupOpdResetAt).toBe(true);
    expect(s.formType).toBe('intake');
    // PRE-V82-fix2 BUG: queueFilter returned false here (line 2275 won).
    // POST-V82-fix2: V82-followup opt-out fires first → queue=true.
    expect(queueFilter(s, NOW + SESSION_TIMEOUT_MS + 1)).toBe(true);
  });

  it('A.2 — D+E combo for followup_ed: queue=true', () => {
    const s = buildSession('followup_ed', 'D', 'E');
    expect(queueFilter(s, NOW + SESSION_TIMEOUT_MS + 1)).toBe(true);
  });

  it('A.3 — D+E combo for followup_adam: queue=true', () => {
    const s = buildSession('followup_adam', 'D', 'E');
    expect(queueFilter(s, NOW + SESSION_TIMEOUT_MS + 1)).toBe(true);
  });

  it('A.4 — D+E combo for followup_mrs: queue=true', () => {
    const s = buildSession('followup_mrs', 'D', 'E');
    expect(queueFilter(s, NOW + SESSION_TIMEOUT_MS + 1)).toBe(true);
  });

  it('A.5 — D+E combo for custom: queue=true', () => {
    const s = buildSession('custom', 'D', 'E');
    expect(queueFilter(s, NOW + SESSION_TIMEOUT_MS + 1)).toBe(true);
  });

  it('A.6 — D+E combo for deposit + !serviceCompleted: still deposit tab (NOT in queue)', () => {
    // Per state-machine test E intent — deposit tab has priority even with reset stamp.
    // V82-fix2 narrow scope: only non-deposit branch elevated.
    const s = buildSession('deposit', 'D', 'E');
    expect(queueFilter(s, NOW + SESSION_TIMEOUT_MS + 1)).toBe(false);
  });

  it('A.7 — D alone (no reset stamp) for intake: queue=false (unchanged design)', () => {
    const s = buildSession('intake', 'D');
    expect(queueFilter(s, NOW + SESSION_TIMEOUT_MS + 1)).toBe(false);
  });

  it('A.8 — E alone (reset stamp, no isPermanent) for intake: queue=true (V82-followup baseline)', () => {
    const s = buildSession('intake', 'E');
    expect(queueFilter(s, NOW + SESSION_TIMEOUT_MS + 1)).toBe(true);
  });

  it('A.9 — D+E + isArchived=true: queue=false (archive always wins)', () => {
    const s = buildSession('intake', 'D', 'E');
    s.isArchived = true;
    expect(queueFilter(s, NOW + SESSION_TIMEOUT_MS + 1)).toBe(false);
  });

  it('A.10 — reproduction of LOV-1F5QNL + LOV-5PG74T real-prod state', () => {
    const realProdShape = {
      formType: 'intake',
      isArchived: false,
      isPermanent: true,
      serviceCompleted: false,
      _v82FollowupOpdResetAt: TS(NOW),
      createdAt: TS(NOW - 60 * 60 * 1000), // ~1hr ago — irrelevant once opt-out fires
    };
    expect(queueFilter(realProdShape, NOW + SESSION_TIMEOUT_MS + 1)).toBe(true);
  });
});

describe('V82-fix2 — B. noDepositSessions exclusion', () => {
  it('B.1 — D+E intake EXCLUDED from noDepositSessions (avoid double-appearance)', () => {
    const s = buildSession('intake', 'D', 'E');
    expect(noDepositFilter(s)).toBe(false);
  });

  it('B.2 — D alone intake (no reset stamp) INCLUDED in noDepositSessions (design preserved)', () => {
    const s = buildSession('intake', 'D');
    expect(noDepositFilter(s)).toBe(true);
  });

  it('B.3 — D+E followup_ed EXCLUDED', () => {
    const s = buildSession('followup_ed', 'D', 'E');
    expect(noDepositFilter(s)).toBe(false);
  });

  it('B.4 — D+E + isArchived=true: also excluded (no double-trip back through archive logic)', () => {
    const s = buildSession('intake', 'D', 'E');
    s.isArchived = true;
    expect(noDepositFilter(s)).toBe(false);
  });
});

describe('V82-fix2 — C. Source-grep regression locks', () => {
  const SRC = readFile(join(REPO_ROOT, 'src', 'pages', 'AdminDashboard.jsx'));

  it('C.1 — V82-fix2 marker present near queue filter', () => {
    expect(SRC).toMatch(/V82-fix2.*opt-out.*MUST fire BEFORE/s);
  });

  it('C.2 — opt-out non-deposit branch present at TOP of queue filter (before line ~2275)', () => {
    expect(SRC).toMatch(/if \(session\._v82FollowupOpdResetAt && session\.formType !== 'deposit'\) return true;/);
  });

  it('C.3 — noDepositSessions filter excludes reset-stamped sessions', () => {
    expect(SRC).toMatch(/!s\.isArchived && s\.isPermanent && s\.formType !== 'deposit' && !s\.serviceCompleted && !s\._v82FollowupOpdResetAt/);
  });

  it('C.4 — V82-fix2 marker present near noDepositSessions filter', () => {
    expect(SRC).toMatch(/V82-fix2.*EXCLUDE _v82FollowupOpdResetAt-/s);
  });

  it('C.5 — original line 2275 isPermanent reject still in place (architectural intent preserved)', () => {
    expect(SRC).toMatch(/if \(session\.isPermanent && session\.formType !== 'deposit' && !session\.serviceCompleted\) return false;/);
  });

  it('C.6 — fallthrough opt-out at bottom still present (legacy / edge cases)', () => {
    // Both opt-outs present: top (non-deposit branch) + bottom (fallthrough)
    const matches = SRC.match(/if \(session\._v82FollowupOpdResetAt[^)]*\) return true;/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('C.7 — restoreToQueue handler unchanged (data-fix script handles legacy data, not handler)', () => {
    expect(SRC).toMatch(/const restoreToQueue = async \(sessionId, linkType\) => \{/);
    expect(SRC).toMatch(/if \(linkType === 'permanent'\) \{\s*updates\.isPermanent = true;/);
  });

  it('C.8 — anti-regression: no rebuilt-broken-ordering (opt-out CAN NOT be the only ordering for the line-2282 site)', () => {
    // Ensure the original line 2282 opt-out hasn't been removed entirely.
    // The top branch (C.2) handles non-deposit; fallthrough (C.6) handles edge cases.
    const idx = SRC.indexOf('if (session._v82FollowupOpdResetAt && session.formType !== \'deposit\') return true;');
    const idx2275 = SRC.indexOf('if (session.isPermanent && session.formType !== \'deposit\' && !session.serviceCompleted) return false;');
    expect(idx).toBeGreaterThan(0);
    expect(idx2275).toBeGreaterThan(0);
    expect(idx).toBeLessThan(idx2275); // opt-out (top) precedes the reject
  });
});

describe('V82-fix2 — D. Architectural invariant: AV77 candidate', () => {
  it('D.1 — opt-out fires before line-2275 isPermanent reject for ALL non-deposit formTypes', () => {
    const formTypes = ['intake', 'walkin', 'followup_ed', 'followup_adam', 'followup_mrs', 'custom'];
    for (const ft of formTypes) {
      const s = buildSession(ft, 'D', 'E');
      expect(queueFilter(s, NOW + SESSION_TIMEOUT_MS + 1)).toBe(true);
    }
  });

  it('D.2 — adversarial: opt-out + isPermanent + serviceCompleted=true → still in queue', () => {
    const s = buildSession('intake', 'D', 'E');
    s.serviceCompleted = true;
    expect(queueFilter(s, NOW + SESSION_TIMEOUT_MS + 1)).toBe(true);
  });

  it('D.3 — adversarial: opt-out with reset stamp = falsy value → reverts to normal flow', () => {
    const s = { formType: 'intake', isArchived: false, isPermanent: true, serviceCompleted: false, _v82FollowupOpdResetAt: null, createdAt: TS(NOW - 60 * 60 * 1000) };
    // Reset stamp is null → opt-out doesn't fire → line 2275 still excludes
    expect(queueFilter(s, NOW + SESSION_TIMEOUT_MS + 1)).toBe(false);
  });

  it('D.4 — adversarial: opt-out without isPermanent and old createdAt → still queue (E baseline)', () => {
    const s = buildSession('intake', 'E');
    expect(queueFilter(s, NOW + SESSION_TIMEOUT_MS + 1)).toBe(true);
  });
});
