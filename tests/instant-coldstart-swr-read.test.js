// B1 (2026-07-07 instant cold-start) — swrRun contract + {source:'cache'}
// threading through the hub getters (backendClient + reportsLoaders).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { swrRun } from '../src/lib/swrRead.js';

describe('B1 — swrRun contract', () => {
  it('B1.1 cache-with-data paints BEFORE server, server overrides after', async () => {
    const paints = [];
    const r = await swrRun({
      cacheLoad: async () => ({ hasData: true, data: 'CACHED' }),
      serverLoad: async () => 'FRESH',
      apply: (d, { fromCache }) => paints.push([d, fromCache]),
    });
    expect(paints).toEqual([['CACHED', true], ['FRESH', false]]);
    expect(r.paintedFromCache).toBe(true);
  });

  it('B1.2 EMPTY cache = NO cached paint (no empty-state flash) — server paints alone', async () => {
    const paints = [];
    const r = await swrRun({
      cacheLoad: async () => ({ hasData: false, data: null }),
      serverLoad: async () => 'FRESH',
      apply: (d, m) => paints.push([d, m.fromCache]),
    });
    expect(paints).toEqual([['FRESH', false]]);
    expect(r.paintedFromCache).toBe(false);
  });

  it('B1.3 cache leg THROW is silent — server still delivers', async () => {
    const paints = [];
    await swrRun({
      cacheLoad: async () => { throw new Error('no cache'); },
      serverLoad: async () => 'FRESH',
      apply: (d) => paints.push(d),
    });
    expect(paints).toEqual(['FRESH']);
  });

  it('B1.4 server failure AFTER a cached paint → rethrows (caller error path) but the cached paint stays', async () => {
    const paints = [];
    await expect(swrRun({
      cacheLoad: async () => ({ hasData: true, data: 'CACHED' }),
      serverLoad: async () => { throw new Error('net'); },
      apply: (d) => paints.push(d),
    })).rejects.toThrow('net');
    expect(paints).toEqual(['CACHED']);
  });
});

describe('B1 — {source} threading (source-grep)', () => {
  const bc = readFileSync('src/lib/backendClient.js', 'utf8');
  const rl = readFileSync('src/lib/reportsLoaders.js', 'utf8');

  it('B1.5 backendClient defines _getDocsBySource (cache → getDocsFromCache, else getDocs)', () => {
    expect(bc).toMatch(/async function _getDocsBySource\(/);
    expect(bc).toMatch(/getDocsFromCache/);
  });

  it('B1.6 the 7 hub getters accept {source} and route through _getDocsBySource', () => {
    // getAllCustomers / getAppointmentsByDateRange / getAllSales / getAllDeposits
    // (via _listWithBranch) / getAllMemberships / getWalletsForCustomerIds /
    // listStaffSchedules — each function body must reference _getDocsBySource.
    for (const fn of [
      'export async function getAllCustomers',
      'export async function getAppointmentsByDateRange',
      'export async function getAllSales',
      'export async function getAllMemberships',
      'export async function getWalletsForCustomerIds',
      'export async function listStaffSchedules',
      'async function _listWithBranch(',   // note "(" — _listWithBranchOrMerge is a different fn
    ]) {
      const idx = bc.indexOf(fn);
      expect(idx, `${fn} not found`).toBeGreaterThan(-1);
      const body = bc.slice(idx, idx + 1600);
      expect(body, `${fn} must route through _getDocsBySource`).toMatch(/_getDocsBySource\(/);
    }
  });

  it('B1.7 reportsLoaders.loadTreatmentsByDateRange accepts {source} (cache leg for hub stage 2)', () => {
    const idx = rl.indexOf('export async function loadTreatmentsByDateRange');
    const body = rl.slice(idx, idx + 900);
    expect(body).toMatch(/source/);
    expect(rl).toMatch(/getDocsFromCache/);
  });

  it('B1.8 backward-compat: no existing caller shape broke — default source is undefined → getDocs (server)', () => {
    // _getDocsBySource must treat anything !== 'cache' as the default server path
    const idx = bc.indexOf('async function _getDocsBySource');
    const body = bc.slice(idx, idx + 500);
    expect(body).toMatch(/source === 'cache'/);
  });
});
