// ─── client-error-core (2026-07-19) — PHI-safe sanitizer + server validator
// The privacy contract lives here: query param VALUES are stripped (patient
// link tokens travel in ?patient=/?session= values), fields are truncated on
// BOTH sides (server never trusts the client), extra fields are dropped.
import { describe, it, expect } from 'vitest';
import {
  sanitizeUrlForBeacon, deriveSurface, hashError, sanitizeErrorPayload,
  validateClientErrorBody, groupClientErrors, CLIENT_ERROR_LIMITS,
} from '../src/lib/clientErrorCore.js';

describe('C1 — sanitizeUrlForBeacon (PHI-safe)', () => {
  it('C1.1 strips query VALUES, keeps param NAMES in order', () => {
    expect(sanitizeUrlForBeacon('/x?patient=SECRETTOKEN123&tab=stock')).toBe('/x?patient=&tab=');
  });
  it('C1.2 absolute URL → path only (origin dropped)', () => {
    expect(sanitizeUrlForBeacon('https://lover-clinic-app.vercel.app/?patient=abcdef1234567890')).toBe('/?patient=');
  });
  it('C1.3 no query → bare path; empty/malformed → no throw', () => {
    expect(sanitizeUrlForBeacon('/backend/customers')).toBe('/backend/customers');
    expect(sanitizeUrlForBeacon('')).toBe('');
    expect(() => sanitizeUrlForBeacon('%%%not a url%%%')).not.toThrow();
  });
  it('C1.4 output never contains a token value + capped at limit', () => {
    const out = sanitizeUrlForBeacon(`/?schedule=${'S'.repeat(400)}&x=1`);
    expect(out).not.toContain('SSSS');
    expect(out.length).toBeLessThanOrEqual(CLIENT_ERROR_LIMITS.url);
  });
});

describe('C2 — deriveSurface', () => {
  it('C2.1 customer link routes → patient; staff routes → staff', () => {
    expect(deriveSurface('/?patient=x')).toBe('patient');
    expect(deriveSurface('https://a/?session=x')).toBe('patient');
    expect(deriveSurface('/?schedule=x')).toBe('patient');
    expect(deriveSurface('/?ed=x')).toBe('patient');
    expect(deriveSurface('/?backend=1&tab=stock')).toBe('staff');
    expect(deriveSurface('/')).toBe('staff');
  });
});

describe('C3 — hashError', () => {
  it('C3.1 deterministic; differs by message; uses first stack line only', () => {
    const a = hashError({ message: 'x is undefined', stack: 'Error\n  at Foo (a.js:1)' });
    expect(a).toBe(hashError({ message: 'x is undefined', stack: 'Error\n  at Foo (a.js:1)' }));
    expect(a).not.toBe(hashError({ message: 'y is undefined', stack: 'Error\n  at Foo (a.js:1)' }));
    expect(a).toMatch(/^e[0-9a-z]+$/);
  });
});

describe('C4 — sanitizeErrorPayload (client side)', () => {
  it('C4.1 truncates every field to LIMITS', () => {
    const p = sanitizeErrorPayload({
      message: 'M'.repeat(600), stack: 'S'.repeat(5000),
      href: '/?patient=tok', ua: 'U'.repeat(400), now: 1752900000000,
    });
    expect(p.message.length).toBe(CLIENT_ERROR_LIMITS.message);
    expect(p.stack.length).toBe(CLIENT_ERROR_LIMITS.stack);
    expect(p.ua.length).toBe(CLIENT_ERROR_LIMITS.ua);
    expect(p.url).toBe('/?patient=');
    expect(p.surface).toBe('patient');
    expect(p.clientTs).toBe(1752900000000);
  });
  it('C4.2 empty message → null (nothing to report)', () => {
    expect(sanitizeErrorPayload({ message: '   ' })).toBe(null);
    expect(sanitizeErrorPayload({})).toBe(null);
  });
});

describe('C5 — validateClientErrorBody (server side, untrusted input)', () => {
  it('C5.1 valid round-trip: client payload passes + doc has ONLY allowlist fields', () => {
    const p = sanitizeErrorPayload({ message: 'boom', stack: 'Error\n at x', href: '/?tab=1', ua: 'UA', now: 5 });
    const v = validateClientErrorBody({ ...p, evil: 'extra', __proto__injection: 'x' });
    expect(v.ok).toBe(true);
    // 2026-07-20 degradation telemetry: allowlist gained `kind` ('error'|'telemetry')
    expect(Object.keys(v.doc).sort()).toEqual(['clientTs', 'hash', 'kind', 'message', 'stack', 'surface', 'ua', 'url']);
    expect(v.doc.message).toBe('boom');
  });
  it('C5.2 rejects null / array / missing message', () => {
    expect(validateClientErrorBody(null).ok).toBe(false);
    expect(validateClientErrorBody([1]).ok).toBe(false);
    expect(validateClientErrorBody({ stack: 'x' }).ok).toBe(false);
    expect(validateClientErrorBody({ message: '' }).ok).toBe(false);
  });
  it('C5.3 server RE-sanitizes url — hand-crafted POST cannot smuggle a token value', () => {
    const v = validateClientErrorBody({ message: 'x', url: '/?patient=STOLENTOKEN' });
    expect(v.doc.url).toBe('/?patient=');
  });
  it('C5.4 bad hash regenerated; bad surface → unknown; wrong types truncated/defaulted', () => {
    const v = validateClientErrorBody({ message: 'x', hash: '<script>', surface: 'admin', stack: 12345, clientTs: 'NaN' });
    expect(v.doc.hash).toMatch(/^e[0-9a-z]+$/);
    expect(v.doc.surface).toBe('unknown');
    expect(v.doc.stack).toBe('');
    expect(v.doc.clientTs).toBe(0);
  });
  it('C5.5 server truncates oversize fields independently of the client', () => {
    const v = validateClientErrorBody({ message: 'M'.repeat(9000), stack: 'S'.repeat(9000) });
    expect(v.doc.message.length).toBe(CLIENT_ERROR_LIMITS.message);
    expect(v.doc.stack.length).toBe(CLIENT_ERROR_LIMITS.stack);
  });
});

describe('C6 — groupClientErrors (viewer)', () => {
  it('C6.1 groups by hash, counts, newest-first', () => {
    const rows = [
      { hash: 'eA', message: 'boom', surface: 'staff', url: '/a', createdAtMs: 100 },
      { hash: 'eA', message: 'boom', surface: 'staff', url: '/b', createdAtMs: 300 },
      { hash: 'eB', message: 'other', surface: 'patient', url: '/c', createdAtMs: 200 },
    ];
    const g = groupClientErrors(rows);
    expect(g.length).toBe(2);
    expect(g[0].hash).toBe('eA');
    expect(g[0].count).toBe(2);
    expect(g[0].sampleUrl).toBe('/b'); // newest sample wins
    expect(g[1].hash).toBe('eB');
  });
  it('C6.2 tolerates junk rows', () => {
    expect(groupClientErrors([null, 'x', {}])).toBeInstanceOf(Array);
    expect(groupClientErrors(null)).toEqual([]);
  });
});
