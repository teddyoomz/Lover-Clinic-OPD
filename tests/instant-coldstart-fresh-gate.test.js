// A2 (2026-07-07 instant cold-start, spec Q1=A) — layer 1: customer-facing
// pages render SERVER-CONFIRMED data ONLY. With persistentLocalCache (A1) every
// onSnapshot fires a cache snapshot first; freshGate drops those so a customer
// NEVER sees a stale course balance / appointment time (the 2026-06-16
// fresh-always contract, preserved through the staff-SWR reversal).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';

// ── unit: onSnapshotFresh drops fromCache, passes server snapshots ──────────
const fireRef = { current: null };
const unsubSpy = vi.fn();
vi.mock('firebase/firestore', () => ({
  onSnapshot: vi.fn((ref, opts, cb, onError) => {
    // freshGate MUST subscribe with includeMetadataChanges so the server-confirm
    // event is guaranteed to fire even when doc CONTENT is byte-identical to cache
    if (!opts || opts.includeMetadataChanges !== true) {
      throw new Error('freshGate must pass { includeMetadataChanges: true }');
    }
    fireRef.current = { cb, onError };
    return unsubSpy;
  }),
}));

const { onSnapshotFresh } = await import('../src/lib/freshGate.js');

describe('A2 — freshGate unit', () => {
  beforeEach(() => { fireRef.current = null; unsubSpy.mockClear(); });

  it('A2.1 skips fromCache snapshots, passes server snapshots (order + count)', () => {
    const seen = [];
    onSnapshotFresh({}, (s) => seen.push(s.data().v));
    fireRef.current.cb({ metadata: { fromCache: true }, data: () => ({ v: 'stale' }) });
    expect(seen).toHaveLength(0); // customer never sees cache data
    fireRef.current.cb({ metadata: { fromCache: false }, data: () => ({ v: 'fresh' }) });
    expect(seen).toEqual(['fresh']);
  });

  it('A2.2 forwards onError + returns the real unsubscribe', () => {
    const errs = [];
    const unsub = onSnapshotFresh({}, () => {}, (e) => errs.push(e));
    fireRef.current.onError(new Error('boom'));
    expect(errs).toHaveLength(1);
    unsub();
    expect(unsubSpy).toHaveBeenCalledTimes(1);
  });

  it('A2.3 repeated server snapshots all pass (live updates still stream)', () => {
    const seen = [];
    onSnapshotFresh({}, (s) => seen.push(s.data().v));
    fireRef.current.cb({ metadata: { fromCache: false }, data: () => ({ v: 1 }) });
    fireRef.current.cb({ metadata: { fromCache: true }, data: () => ({ v: 99 }) });
    fireRef.current.cb({ metadata: { fromCache: false }, data: () => ({ v: 2 }) });
    expect(seen).toEqual([1, 2]);
  });
});

// ── source-grep: customer pages consume the gate (AV206.a closed list) ──────
describe('A2 — customer pages wired to freshGate', () => {
  const pf = readFileSync('src/pages/PatientForm.jsx', 'utf8');
  const cs = readFileSync('src/pages/ClinicSchedule.jsx', 'utf8');

  it('A2.4 PatientForm imports onSnapshotFresh + uses it on the opd_sessions listener', () => {
    expect(pf).toMatch(/import \{ onSnapshotFresh \} from '\.\.\/lib\/freshGate\.js'/);
    expect(pf).toMatch(/onSnapshotFresh\(doc\(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId\)/);
  });

  it('A2.5 ClinicSchedule imports onSnapshotFresh + uses it on the clinic_schedules listener', () => {
    expect(cs).toMatch(/import \{ onSnapshotFresh \} from '\.\.\/lib\/freshGate\.js'/);
    expect(cs).toMatch(/onSnapshotFresh\(/);
  });

  it('A2.6 anti-regression: no bare onSnapshot( call remains in either customer page', () => {
    // (import lines excluded — only CALL sites matter)
    const calls = (src) => src.split('\n').filter(l => /(?<!\w)onSnapshot\(/.test(l) && !/^import/.test(l.trim()));
    expect(calls(pf)).toEqual([]);
    expect(calls(cs)).toEqual([]);
  });
});
