// AV208 T1+T2 (2026-07-18 TFP entry SWR cold-start fix) — source-grep locks:
// {source:'cache'} threading into the 4 getters TFP's load effect needs
// (listDfGroups / listDfStaffRates / getCustomer / getTreatment) + the
// firebase.js cacheSizeBytes 200MB cap. Mirrors the B1.x pattern in
// tests/instant-coldstart-swr-read.test.js (source-grep, not mocks — V66).
// Spec: docs/superpowers/specs/2026-07-18-tfp-entry-swr-coldstart-fix-design.html
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const bc = readFileSync('src/lib/backendClient.js', 'utf8');
const fb = readFileSync('src/firebase.js', 'utf8');

function fnBody(src, anchor, len = 1200) {
  const idx = src.indexOf(anchor);
  expect(idx, `${anchor} not found`).toBeGreaterThan(-1);
  return src.slice(idx, idx + len);
}

describe('AV208 G1 — _getDocBySource (single-doc SWR cache leg)', () => {
  it('G1.1 helper exists: cache → getDocFromCache, else getDoc', () => {
    const body = fnBody(bc, 'async function _getDocBySource(', 400);
    expect(body).toMatch(/source === 'cache'/);
    expect(body).toMatch(/getDocFromCache\(/);
    expect(body).toMatch(/getDoc\(/);
  });

  it('G1.2 getDocFromCache is imported from firebase/firestore', () => {
    const importBlock = bc.slice(0, bc.indexOf("from 'firebase/firestore'"));
    expect(importBlock).toMatch(/getDocFromCache/);
  });
});

describe('AV208 G2 — getCustomer + getTreatment accept {source}', () => {
  it('G2.1 getCustomer signature + routes through _getDocBySource', () => {
    const body = fnBody(bc, 'export async function getCustomer(', 500);
    expect(body).toMatch(/\{\s*source\s*\}\s*=\s*\{\}/);
    expect(body).toMatch(/_getDocBySource\(/);
  });

  it('G2.2 getTreatment signature + routes through _getDocBySource', () => {
    const body = fnBody(bc, 'export async function getTreatment(', 500);
    expect(body).toMatch(/\{\s*source\s*\}\s*=\s*\{\}/);
    expect(body).toMatch(/_getDocBySource\(/);
  });
});

describe('AV208 G3 — listDfGroups + listDfStaffRates accept {source}', () => {
  for (const fn of ['export async function listDfGroups(', 'export async function listDfStaffRates(']) {
    it(`G3 ${fn.slice(22, 40)}... routes through _getDocsBySource + _tagCache`, () => {
      const body = fnBody(bc, fn, 1000);
      expect(body).toMatch(/source/);
      expect(body).toMatch(/_getDocsBySource\(/);
      expect(body).toMatch(/_tagCache\(/);
    });
  }
});

describe('AV208 G4 — firebase.js cache cap 200MB (T2)', () => {
  it('G4.1 cacheSizeBytes: 200MB inside persistentLocalCache', () => {
    expect(fb).toMatch(/persistentLocalCache\(\{[^}]*cacheSizeBytes:\s*200 \* 1024 \* 1024/s);
  });

  it('G4.2 keeps tabManager + autoDetectLongPolling (anti-regression on prior batches)', () => {
    expect(fb).toMatch(/tabManager:\s*persistentMultipleTabManager\(\)/);
    expect(fb).toMatch(/experimentalAutoDetectLongPolling: true/);
  });

  it('G4.3 rationale comment references the 40MB eviction root cause (institutional memory)', () => {
    expect(fb).toMatch(/AV208/);
  });
});
