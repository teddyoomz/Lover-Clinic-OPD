// tests/v81-fix1-firestore-type-roundtrip.test.js
// V81-fix1 (2026-05-17 EOD+1) — Timestamp/GeoPoint/Bytes round-trip preservation.
//
// CRITICAL bug found 2026-05-17 via real-prod diagnostic:
//   Firebase admin SDK Timestamp.toJSON() outputs {_seconds, _nanoseconds};
//   batch.set(doc, {seconds, nanoseconds}) writes as plain Map, NOT Timestamp.
//   → V81 restore silently degraded every Timestamp field in prod.
//
// Fix: encodeFirestoreData wraps in sentinel markers (__type: 'timestamp');
//      decodeFirestoreData re-hydrates via SDK constructors.
//
// These tests exercise the contract WITHOUT requiring firebase-admin SDK
// (pure JS with mock Timestamp/GeoPoint classes).

import { describe, it, expect } from 'vitest';
import {
  encodeFirestoreData,
  decodeFirestoreData,
} from '../src/lib/wholeSystemBackupCore.js';

// ─── Mock Firebase SDK types (mirror admin SDK internal shape) ─────────────

class MockTimestamp {
  constructor(seconds, nanoseconds) {
    this._seconds = seconds;
    this._nanoseconds = nanoseconds;
  }
  // Mirror admin SDK's getters for compat verification
  get seconds() { return this._seconds; }
  get nanoseconds() { return this._nanoseconds; }
  toMillis() { return this._seconds * 1000 + Math.floor(this._nanoseconds / 1e6); }
}

class MockGeoPoint {
  constructor(latitude, longitude) {
    this._latitude = latitude;
    this._longitude = longitude;
  }
  get latitude() { return this._latitude; }
  get longitude() { return this._longitude; }
}

const FB_OPTS = { Timestamp: MockTimestamp, GeoPoint: MockGeoPoint };

// ─── Group G: encodeFirestoreData ─────────────────────────────────────────

describe('V81-fix1 — encodeFirestoreData (Group G)', () => {
  it('G.1 — Timestamp → {__type:timestamp, seconds, nanoseconds} marker', () => {
    const ts = new MockTimestamp(1778932523, 661000000);
    const encoded = encodeFirestoreData(ts);
    expect(encoded).toEqual({
      __type: 'timestamp',
      seconds: 1778932523,
      nanoseconds: 661000000,
    });
  });

  it('G.2 — GeoPoint → {__type:geopoint, latitude, longitude} marker', () => {
    const gp = new MockGeoPoint(13.7, 100.5);
    const encoded = encodeFirestoreData(gp);
    expect(encoded).toEqual({
      __type: 'geopoint',
      latitude: 13.7,
      longitude: 100.5,
    });
  });

  it('G.3 — Buffer → {__type:bytes, base64} marker', () => {
    const buf = Buffer.from('hello world', 'utf8');
    const encoded = encodeFirestoreData(buf);
    expect(encoded.__type).toBe('bytes');
    expect(Buffer.from(encoded.base64, 'base64').toString('utf8')).toBe('hello world');
  });

  it('G.4 — Plain object passthrough (no markers added)', () => {
    const o = { name: 'Alice', age: 30, active: true };
    const encoded = encodeFirestoreData(o);
    expect(encoded).toEqual(o);
    expect(encoded.__type).toBeUndefined();
  });

  it('G.5 — Array recursion (Timestamps inside arrays encoded)', () => {
    const arr = [
      new MockTimestamp(1, 0),
      'plain string',
      { ts: new MockTimestamp(2, 0) },
    ];
    const encoded = encodeFirestoreData(arr);
    expect(encoded[0]).toEqual({ __type: 'timestamp', seconds: 1, nanoseconds: 0 });
    expect(encoded[1]).toBe('plain string');
    expect(encoded[2].ts).toEqual({ __type: 'timestamp', seconds: 2, nanoseconds: 0 });
  });

  it('G.6 — Deeply nested objects with mixed types', () => {
    const doc = {
      id: 'CUST-1',
      name: 'Alice',
      meta: {
        createdAt: new MockTimestamp(100, 0),
        location: new MockGeoPoint(13.7, 100.5),
        nested: { deeper: { evenDeeper: new MockTimestamp(999, 123) } },
      },
    };
    const encoded = encodeFirestoreData(doc);
    expect(encoded.meta.createdAt).toEqual({ __type: 'timestamp', seconds: 100, nanoseconds: 0 });
    expect(encoded.meta.location).toEqual({ __type: 'geopoint', latitude: 13.7, longitude: 100.5 });
    expect(encoded.meta.nested.deeper.evenDeeper).toEqual({ __type: 'timestamp', seconds: 999, nanoseconds: 123 });
  });

  it('G.7 — Null/undefined/primitives passthrough', () => {
    expect(encodeFirestoreData(null)).toBe(null);
    expect(encodeFirestoreData(undefined)).toBe(undefined);
    expect(encodeFirestoreData(42)).toBe(42);
    expect(encodeFirestoreData('str')).toBe('str');
    expect(encodeFirestoreData(true)).toBe(true);
  });

  it('G.8 — V38 spread-order preserved: id stays last after encoding', () => {
    const doc = { ...{ name: 'A', branchId: 'B', createdAt: new MockTimestamp(1, 0) }, id: 'CUST-1' };
    const encoded = encodeFirestoreData(doc);
    const keys = Object.keys(encoded);
    expect(keys[keys.length - 1]).toBe('id'); // id wins (V38 invariant)
    expect(encoded.id).toBe('CUST-1');
    expect(encoded.createdAt.__type).toBe('timestamp');
  });

  it('G.9 — Does NOT falsely encode user objects with `_seconds`/`_nanoseconds` plus extra keys', () => {
    // Strict 2-key shape required — anything else is treated as plain object
    const userObj = { _seconds: 100, _nanoseconds: 0, extraField: 'hi' };
    const encoded = encodeFirestoreData(userObj);
    expect(encoded.__type).toBeUndefined();
    expect(encoded._seconds).toBe(100);
    expect(encoded.extraField).toBe('hi');
  });

  it('G.10 — Empty object / empty array passthrough', () => {
    expect(encodeFirestoreData({})).toEqual({});
    expect(encodeFirestoreData([])).toEqual([]);
  });
});

// ─── Group H: decodeFirestoreData ─────────────────────────────────────────

describe('V81-fix1 — decodeFirestoreData (Group H)', () => {
  it('H.1 — Timestamp marker → Timestamp instance via constructor', () => {
    const marker = { __type: 'timestamp', seconds: 1778932523, nanoseconds: 661000000 };
    const decoded = decodeFirestoreData(marker, FB_OPTS);
    expect(decoded).toBeInstanceOf(MockTimestamp);
    expect(decoded._seconds).toBe(1778932523);
    expect(decoded._nanoseconds).toBe(661000000);
    expect(decoded.toMillis()).toBe(1778932523 * 1000 + 661);
  });

  it('H.2 — GeoPoint marker → GeoPoint instance via constructor', () => {
    const marker = { __type: 'geopoint', latitude: 13.7, longitude: 100.5 };
    const decoded = decodeFirestoreData(marker, FB_OPTS);
    expect(decoded).toBeInstanceOf(MockGeoPoint);
    expect(decoded._latitude).toBe(13.7);
    expect(decoded._longitude).toBe(100.5);
  });

  it('H.3 — Bytes marker → Buffer', () => {
    const marker = { __type: 'bytes', base64: Buffer.from('hello', 'utf8').toString('base64') };
    const decoded = decodeFirestoreData(marker, FB_OPTS);
    expect(Buffer.isBuffer(decoded)).toBe(true);
    expect(decoded.toString('utf8')).toBe('hello');
  });

  it('H.4 — Plain object without markers passthrough', () => {
    const obj = { name: 'Alice', age: 30 };
    expect(decodeFirestoreData(obj, FB_OPTS)).toEqual(obj);
  });

  it('H.5 — Nested marker re-hydration inside arrays + objects', () => {
    const encoded = {
      id: 'C1',
      events: [
        { __type: 'timestamp', seconds: 1, nanoseconds: 0 },
        'plain',
        { nested: { __type: 'timestamp', seconds: 2, nanoseconds: 0 } },
      ],
    };
    const decoded = decodeFirestoreData(encoded, FB_OPTS);
    expect(decoded.events[0]).toBeInstanceOf(MockTimestamp);
    expect(decoded.events[1]).toBe('plain');
    expect(decoded.events[2].nested).toBeInstanceOf(MockTimestamp);
  });

  it('H.6 — Missing Timestamp constructor → fallback {_seconds,_nanoseconds}', () => {
    const marker = { __type: 'timestamp', seconds: 100, nanoseconds: 0 };
    const decoded = decodeFirestoreData(marker, {}); // no Timestamp class
    expect(decoded).toEqual({ _seconds: 100, _nanoseconds: 0 });
  });

  it('H.7 — Malformed marker (missing seconds) → treated as plain object', () => {
    const fakeMarker = { __type: 'timestamp' }; // no seconds/nanoseconds
    const decoded = decodeFirestoreData(fakeMarker, FB_OPTS);
    expect(decoded).toEqual({ __type: 'timestamp' });
    expect(decoded).not.toBeInstanceOf(MockTimestamp);
  });

  it('H.8 — Unknown __type → treated as plain object (forward-compat)', () => {
    const futureMarker = { __type: 'future_unknown', data: 'x' };
    const decoded = decodeFirestoreData(futureMarker, FB_OPTS);
    expect(decoded).toEqual(futureMarker);
  });

  it('H.9 — Null/undefined/primitives passthrough', () => {
    expect(decodeFirestoreData(null, FB_OPTS)).toBe(null);
    expect(decodeFirestoreData(undefined, FB_OPTS)).toBe(undefined);
    expect(decodeFirestoreData(42, FB_OPTS)).toBe(42);
    expect(decodeFirestoreData('str', FB_OPTS)).toBe('str');
  });

  it('H.10 — Empty object / empty array passthrough', () => {
    expect(decodeFirestoreData({}, FB_OPTS)).toEqual({});
    expect(decodeFirestoreData([], FB_OPTS)).toEqual([]);
  });
});

// ─── Group I: ROUND-TRIP IDENTITY (the contract that closes the V81-fix1 gap) ─

describe('V81-fix1 — round-trip identity (Group I)', () => {
  it('I.1 — Single Timestamp survives JSON.stringify/parse round-trip as Timestamp', () => {
    const original = new MockTimestamp(1778932523, 661000000);
    const encoded = encodeFirestoreData(original);
    const json = JSON.stringify(encoded);
    const parsed = JSON.parse(json);
    const decoded = decodeFirestoreData(parsed, FB_OPTS);
    expect(decoded).toBeInstanceOf(MockTimestamp);
    expect(decoded._seconds).toBe(original._seconds);
    expect(decoded._nanoseconds).toBe(original._nanoseconds);
  });

  it('I.2 — Document with multiple Timestamps + nested fields preserves all types', () => {
    const doc = {
      name: 'Alice',
      branchId: 'BR-1',
      createdAt: new MockTimestamp(100, 0),
      updatedAt: new MockTimestamp(200, 500000000),
      tags: ['a', 'b'],
      address: new MockGeoPoint(13.7, 100.5),
      sessions: [
        { startedAt: new MockTimestamp(300, 0), notes: 'first' },
        { startedAt: new MockTimestamp(400, 0), notes: 'second' },
      ],
      id: 'CUST-1', // V38: id last
    };
    const json = JSON.stringify(encodeFirestoreData(doc));
    const decoded = decodeFirestoreData(JSON.parse(json), FB_OPTS);

    expect(decoded.name).toBe('Alice');
    expect(decoded.createdAt).toBeInstanceOf(MockTimestamp);
    expect(decoded.createdAt._seconds).toBe(100);
    expect(decoded.updatedAt).toBeInstanceOf(MockTimestamp);
    expect(decoded.updatedAt._nanoseconds).toBe(500000000);
    expect(decoded.address).toBeInstanceOf(MockGeoPoint);
    expect(decoded.sessions[0].startedAt).toBeInstanceOf(MockTimestamp);
    expect(decoded.sessions[1].startedAt._seconds).toBe(400);
    expect(decoded.id).toBe('CUST-1');
  });

  it('I.3 — V38 spread-order preserved through full round-trip', () => {
    // Source has stray data.id; spread + V38 ensures docId wins
    const raw = { id: 'STRAY_LEGACY_NUMERIC', name: 'A', createdAt: new MockTimestamp(1, 0) };
    const v38Source = { ...raw, id: 'REAL_DOC_ID' }; // V38 spread-order
    const encoded = encodeFirestoreData(v38Source);
    const decoded = decodeFirestoreData(JSON.parse(JSON.stringify(encoded)), FB_OPTS);
    expect(decoded.id).toBe('REAL_DOC_ID'); // V38 invariant preserved
    expect(decoded.createdAt).toBeInstanceOf(MockTimestamp);
  });

  it('I.4 — Adversarial: doc with user data __type field NOT clobbered if missing payload', () => {
    // Real-world risk: user data could have __type as their own field name
    // Decoder must require valid payload shape to re-hydrate; partial markers passthrough
    const doc = { __type: 'user-defined-classification', other: 'data' };
    const encoded = encodeFirestoreData(doc); // no Firestore types → passthrough
    expect(encoded).toEqual(doc);
    const decoded = decodeFirestoreData(JSON.parse(JSON.stringify(encoded)), FB_OPTS);
    expect(decoded).toEqual(doc);
  });

  it('I.5 — Empty doc / null fields preserved exactly', () => {
    const doc = { id: 'C1', name: 'A', nullField: null, emptyArr: [], emptyObj: {} };
    const decoded = decodeFirestoreData(JSON.parse(JSON.stringify(encodeFirestoreData(doc))), FB_OPTS);
    expect(decoded).toEqual(doc);
  });

  it('I.6 — Property-based: 50 random fixtures with Timestamps round-trip identical', () => {
    function mulberry32(seed) {
      return function() {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    for (let i = 1; i <= 50; i++) {
      const rng = mulberry32(i);
      const docs = [];
      const count = Math.floor(rng() * 10) + 1;
      for (let j = 0; j < count; j++) {
        docs.push({
          id: `CUST-${i}-${j}`,
          name: `User-${i}-${j}`,
          createdAt: new MockTimestamp(Math.floor(rng() * 1e10), Math.floor(rng() * 1e9)),
          ...(rng() > 0.5 ? { updatedAt: new MockTimestamp(Math.floor(rng() * 1e10), 0) } : {}),
        });
      }
      const encoded = encodeFirestoreData(docs);
      const restored = decodeFirestoreData(JSON.parse(JSON.stringify(encoded)), FB_OPTS);
      for (let k = 0; k < docs.length; k++) {
        expect(restored[k].createdAt).toBeInstanceOf(MockTimestamp);
        expect(restored[k].createdAt._seconds).toBe(docs[k].createdAt._seconds);
        expect(restored[k].createdAt._nanoseconds).toBe(docs[k].createdAt._nanoseconds);
        if (docs[k].updatedAt) {
          expect(restored[k].updatedAt).toBeInstanceOf(MockTimestamp);
        }
      }
    }
  });

  it('I.7 — V81 prod-shape (mirror real diagnostic finding): _v76BranchBackfilledAt re-hydrates', () => {
    // Mirror the exact field name + shape found via real-prod diagnostic
    const liveDoc = {
      _v76BranchBackfilledAt: new MockTimestamp(1778932523, 661000000),
      _v77quinquiesBackfilledAt: new MockTimestamp(1778935299, 990000000),
      branchId: 'BR-X',
      id: 'CHAT-1',
    };
    const encoded = encodeFirestoreData(liveDoc);
    const restored = decodeFirestoreData(JSON.parse(JSON.stringify(encoded)), FB_OPTS);
    expect(restored._v76BranchBackfilledAt).toBeInstanceOf(MockTimestamp);
    expect(restored._v77quinquiesBackfilledAt).toBeInstanceOf(MockTimestamp);
    expect(restored._v76BranchBackfilledAt._seconds).toBe(1778932523);
  });
});

// ─── Group J: anti-regression source-grep ─────────────────────────────────

describe('V81-fix1 — source-grep regression locks (Group J)', () => {
  it('J.1 — backup executor imports encodeFirestoreData', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('api/admin/_lib/wholeSystemBackupExecutor.js', 'utf8');
    expect(src).toMatch(/encodeFirestoreData/);
    expect(src).toMatch(/V81-fix1/);
  });

  it('J.2 — restore executor imports decodeFirestoreData + Timestamp class', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('api/admin/_lib/wholeSystemRestoreExecutor.js', 'utf8');
    expect(src).toMatch(/decodeFirestoreData/);
    expect(src).toMatch(/Timestamp/);
    expect(src).toMatch(/FB_TYPE_OPTS/);
  });

  it('J.3 — backup executor wraps all docs.map sites with encodeFirestoreData', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('api/admin/_lib/wholeSystemBackupExecutor.js', 'utf8');
    const matches = src.match(/encodeFirestoreData\(\{\s*\.\.\.d\.data\(\),\s*id:\s*d\.id\s*\}\)/g) || [];
    // V122 (2026-05-26): the separate universal + branch-scoped sequential loops were
    // merged into ONE parallel mapWithConcurrency over dynamically-enumerated collections,
    // so the 4 pre-V122 sites (universal/branch/subcoll/chat) are now 3 (collections/subcoll/chat).
    expect(matches.length).toBe(3); // 3 sites: collections (universal+branch+other) + customer-subcoll + chat-messages
  });

  it('J.4 — restore executor decodes BEFORE batch.set in restoreCollections', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('api/admin/_lib/wholeSystemRestoreExecutor.js', 'utf8');
    const decodeIdx = src.indexOf('decodeFirestoreData');
    const setIdx = src.indexOf('batch.set(db.doc');
    expect(decodeIdx).toBeGreaterThan(-1);
    expect(setIdx).toBeGreaterThan(-1);
    expect(decodeIdx).toBeLessThan(setIdx); // decode happens before set
  });
});
