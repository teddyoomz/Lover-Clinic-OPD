// B2 (2026-07-07 instant cold-start, spec Q2=A) — AppointmentHubView 2-stage
// load: stage 1 (appointments + schedules) paints FIRST; stage 2 (finance
// enrichment) fills chips later; SWR cache leg paints instantly + SyncIndicator
// shows until the server leg confirms.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { readFileSync } from 'fs';

// ── controllable deferreds per getter ───────────────────────────────────────
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const state = {};
function resetState() {
  state.apptCacheCalls = 0;
  state.apptServerCalls = 0;
  state.apptCache = deferred();
  state.apptServer = deferred();
  state.customersServer = deferred();
  state.customersReject = false;
}

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  getAppointmentsByDateRange: vi.fn((opts = {}) => {
    if (opts.source === 'cache') { state.apptCacheCalls += 1; return state.apptCache.promise; }
    state.apptServerCalls += 1; return state.apptServer.promise;
  }),
  listStaffSchedules: vi.fn(() => Promise.resolve([])),
  getAllCustomers: vi.fn((opts = {}) => {
    if (opts.source === 'cache') return Promise.reject(new Error('cold cache'));
    if (state.customersReject) return Promise.reject(new Error('enrichment down'));
    return state.customersServer.promise;
  }),
  getAllDeposits: vi.fn(() => Promise.resolve([])),
  getAllSales: vi.fn(() => Promise.resolve([])),
  getAllMemberships: vi.fn(() => Promise.resolve([])),
  getWalletsForCustomerIds: vi.fn(() => Promise.resolve([])),
  markAppointmentServiceCompleted: vi.fn(() => Promise.resolve()),
  listenToTreatmentsByDateRange: () => () => {},
  listenToAllDeposits: () => () => {},
  listenToAllSales: () => () => {},
}));
vi.mock('../src/lib/reportsLoaders.js', () => ({
  loadTreatmentsByDateRange: vi.fn(() => Promise.resolve([])),
}));
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: 'BR-B2-test' }),
}));

import AppointmentHubView from '../src/components/admin/AppointmentHubView.jsx';

function todayBangkok() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
const APPT = () => [{ id: 'A1', date: todayBangkok(), startTime: '10:00', customerId: 'C1', customerName: 'ทดสอบ หนึ่ง', status: 'confirmed', serviceCompletedAt: null }];

describe('B2 — hub two-stage SWR', () => {
  beforeEach(() => resetState());

  it('B2.1 cache leg paints the list INSTANTLY (server + enrichment both still pending) + skeleton chips + sync indicator', async () => {
    render(<AppointmentHubView />);
    await act(async () => { state.apptCache.resolve(APPT()); });
    // list painted from cache — server leg + stage 2 both unresolved
    await waitFor(() => expect(screen.getAllByTestId('appt-hub-row').length).toBe(1));
    expect(screen.getByTestId('sync-indicator')).toBeInTheDocument();
    expect(screen.getAllByTestId('row-chip-skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByText('กำลังโหลด…')).toBeNull();
  });

  it('B2.2 server leg confirms → sync indicator disappears (list stays)', async () => {
    render(<AppointmentHubView />);
    await act(async () => { state.apptCache.resolve(APPT()); });
    await waitFor(() => expect(screen.getByTestId('sync-indicator')).toBeInTheDocument());
    await act(async () => { state.apptServer.resolve(APPT()); });
    await waitFor(() => expect(screen.queryByTestId('sync-indicator')).toBeNull());
    expect(screen.getAllByTestId('appt-hub-row').length).toBe(1);
  });

  it('B2.3 EMPTY cache result does NOT paint (no false empty-state flash) — stays on loading until server', async () => {
    render(<AppointmentHubView />);
    await act(async () => { state.apptCache.resolve([]); });
    // empty cache → swrRun skips the paint → still the loading spinner
    expect(screen.getByText('กำลังโหลด…')).toBeInTheDocument();
    expect(screen.queryByTestId('appt-hub-empty')).toBeNull();
    await act(async () => { state.apptServer.resolve(APPT()); });
    await waitFor(() => expect(screen.getAllByTestId('appt-hub-row').length).toBe(1));
  });

  it('B2.4 stage-2 enrichment lands → skeleton chips replaced (summaryLoading cleared)', async () => {
    render(<AppointmentHubView />);
    await act(async () => { state.apptCache.resolve(APPT()); state.apptServer.resolve(APPT()); });
    await waitFor(() => expect(screen.getAllByTestId('appt-hub-row').length).toBe(1));
    await act(async () => { state.customersServer.resolve([{ id: 'C1', firstname: 'ทดสอบ' }]); });
    await waitFor(() => expect(screen.queryAllByTestId('row-chip-skeleton')).toHaveLength(0));
  });

  it('B2.5 enrichment FAILURE never takes down the painted list — skeletons clear, chips absent', async () => {
    state.customersReject = true;
    render(<AppointmentHubView />);
    await act(async () => { state.apptCache.resolve(APPT()); state.apptServer.resolve(APPT()); });
    await waitFor(() => expect(screen.getAllByTestId('appt-hub-row').length).toBe(1));
    await waitFor(() => expect(screen.queryAllByTestId('row-chip-skeleton')).toHaveLength(0));
    expect(screen.getAllByTestId('appt-hub-row').length).toBe(1); // list intact
  });
});

describe('B2 — source-grep locks', () => {
  const hub = readFileSync('src/components/admin/AppointmentHubView.jsx', 'utf8');
  const card = readFileSync('src/components/admin/AppointmentHubRowCard.jsx', 'utf8');

  it('B2.6 silent reloads bypass the cache leg in BOTH stages (server-only, no loading flash)', () => {
    expect(hub).toMatch(/if \(silent\) \{ const r = await fetchCore\(undefined\); applyCore\(r, \{ fromCache: _resultFromCache\(r\) \}\); return; \}/);
    expect(hub).toMatch(/if \(silent\) \{ applyEnrich\(await fetchEnrich\(undefined\)\); return; \}/);
  });

  it('B2.7 stage 2 chains after core WITHOUT being awaited by the paint path + its failure is contained', () => {
    expect(hub).toMatch(/loadEnrichment\(\{ silent \}\)\.catch/);
    expect(hub).toMatch(/setSummaryLoading\(false\);\s*\}\);/);
  });

  it('B2.8 offline server-leg fallback keeps the indicator honest (__fromCache metadata, B1-fix from S1 e2e)', () => {
    // a network-down "server" getDocs silently serves cache — the data layer
    // tags it (_tagCache) and swrRun/_resultFromCache surface it so the
    // indicator NEVER clears while cache data is on screen.
    expect(hub).toMatch(/_resultFromCache/);
    const swr = readFileSync('src/lib/swrRead.js', 'utf8');
    expect(swr).toMatch(/_resultFromCache\(fresh\)/);
    const bc = readFileSync('src/lib/backendClient.js', 'utf8');
    expect(bc).toMatch(/function _tagCache\(/);
    expect(bc).toMatch(/metadata\?\.fromCache/);
  });

  it('B2.9 RowCard renders skeleton chips gated on summaryLoading && !summary', () => {
    expect(card).toMatch(/summaryLoading && !summary/);
    expect(card).toMatch(/row-chip-skeleton/);
  });

  it('B2.10 apptsRef is synced inside applyCore (stage-2 wallets read it race-free)', () => {
    expect(hub).toMatch(/apptsRef\.current = apptList;/);
  });
});
