// perf P3 (2026-07-06) — chat-history retention sweep TYPE-MISMATCH fix.
// BUG (found via Rule R prod diag): the sweep queried
//   where('resolvedAt', '<', Timestamp)
// but real docs store resolvedAt as an ISO STRING (ChatPanel handleResolve
// writes new Date().toISOString()). Firestore orders values by TYPE first —
// a string never compares against a Timestamp — so 46 daily cron runs each
// reported scanned:0 deleted:0 while 4,265 docs accumulated (oldest 2026-05-23,
// retention supposedly 24h). V67 schema-drift class: the query's assumed type
// diverged from the writer's actual type.
// FIX: dual-type query (ISO-string cutoff + Timestamp cutoff), merged, then the
// existing client-side resolvedAtMs/isExpired re-verification per doc.
import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { sweepChatHistoryRetention } from '../api/cron/chat-history-retention-sweep.js';

const NOW = Date.parse('2026-07-06T12:00:00.000Z');
const iso = (msAgoHours) => new Date(NOW - msAgoHours * 3600 * 1000).toISOString();

function makeDoc(id, resolvedAt) {
  const ref = { id, __ref: true };
  return { id, ref, data: () => ({ resolvedAt }) };
}

/** Fake Firestore db honoring type semantics: a where() cutoff only matches
 *  same-type field values (mirrors real Firestore type-ranked ordering). */
function makeDb(docs, deletedRefs) {
  return {
    collection: () => ({
      where: (field, op, cutoff) => ({
        limit: (n) => ({
          get: async () => {
            const matched = docs.filter((d) => {
              const v = d.data()[field];
              if (typeof cutoff === 'string') return typeof v === 'string' && v < cutoff;
              if (cutoff instanceof Timestamp) {
                return v instanceof Timestamp && v.toMillis() < cutoff.toMillis();
              }
              return false;
            }).slice(0, n);
            return { size: matched.length, docs: matched };
          },
        }),
      }),
    }),
    batch: () => ({
      delete: (ref) => deletedRefs.push(ref.id),
      commit: async () => {},
    }),
  };
}

describe('P3 — sweep matches STRING-typed resolvedAt (the real prod shape)', () => {
  it('deletes expired ISO-string docs (pre-fix: Timestamp-only query matched ZERO of these)', async () => {
    const deletedRefs = [];
    const docs = [
      makeDoc('old-str-1', iso(48)),   // 48h old string → expired
      makeDoc('old-str-2', iso(30)),   // 30h old string → expired
      makeDoc('fresh-str', iso(2)),    // 2h old string → kept (not matched by query)
    ];
    const res = await sweepChatHistoryRetention({ db: makeDb(docs, deletedRefs), now: NOW, apply: true, retentionHours: 24 });
    expect(deletedRefs.sort()).toEqual(['old-str-1', 'old-str-2']);
    expect(res.deleted).toBe(2);
  });

  it('STILL deletes expired Timestamp-typed docs (belt+suspenders dual query)', async () => {
    const deletedRefs = [];
    const docs = [
      makeDoc('old-ts', Timestamp.fromMillis(NOW - 48 * 3600 * 1000)),
      makeDoc('fresh-ts', Timestamp.fromMillis(NOW - 1 * 3600 * 1000)),
      makeDoc('old-str', iso(72)),
    ];
    const res = await sweepChatHistoryRetention({ db: makeDb(docs, deletedRefs), now: NOW, apply: true, retentionHours: 24 });
    expect(deletedRefs.sort()).toEqual(['old-str', 'old-ts']);
    expect(res.deleted).toBe(2);
  });

  it('dry-run (apply=false) counts but does NOT delete', async () => {
    const deletedRefs = [];
    const docs = [makeDoc('old-str', iso(48))];
    const res = await sweepChatHistoryRetention({ db: makeDb(docs, deletedRefs), now: NOW, apply: false, retentionHours: 24 });
    expect(res.deleted).toBe(1);      // would-delete count
    expect(deletedRefs).toEqual([]);  // no batch writes
  });

  it('client-side isExpired re-verify keeps a doc the query over-matched (clock-skew guard preserved)', async () => {
    const deletedRefs = [];
    // string sorts below cutoff lexicographically but parses to a FUTURE-ish time?
    // simulate the conservative path with a barely-not-expired doc forced through:
    const almost = iso(23.5); // 23.5h old — NOT expired at 24h retention
    const db = {
      collection: () => ({
        where: () => ({ limit: () => ({ get: async () => ({ size: 1, docs: [makeDoc('almost', almost)] }) }) }),
      }),
      batch: () => ({ delete: (r) => deletedRefs.push(r.id), commit: async () => {} }),
    };
    const res = await sweepChatHistoryRetention({ db, now: NOW, apply: true, retentionHours: 24 });
    expect(deletedRefs).toEqual([]);
    expect(res.kept).toBeGreaterThanOrEqual(1);
  });

  it('source-grep: the sweep queries BOTH the ISO-string and Timestamp cutoffs', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('api/cron/chat-history-retention-sweep.js', 'utf8');
    expect(src).toMatch(/toISOString\(\)/);
    expect(src).toMatch(/Timestamp\.fromMillis|Timestamp\.fromDate/);
    // anti-regression: never again a SINGLE Timestamp-only range query
    expect(src).toMatch(/cutoffIso/);
  });
});
