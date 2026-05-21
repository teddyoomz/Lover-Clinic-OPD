import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const bc = fs.readFileSync('src/lib/backendClient.js', 'utf8');
const sdl = fs.readFileSync('src/lib/scopedDataLayer.js', 'utf8');
const ces = fs.readFileSync('src/lib/chartEditSession.js', 'utf8');

describe('chart-edit backend wiring (T2)', () => {
  it('B1 presence listener is BS-13 safe-by-default', () => {
    expect(bc).toMatch(/export function listenToChartTabletPresenceByBranch/);
    expect(bc).toMatch(/if \(!effectiveBranchId && !allBranches\)/);
    expect(bc).toMatch(/be_chart_tablet_presence/);
  });
  it('B2 createChartEditSession uses a transaction + TABLET_BUSY guard', () => {
    expect(bc).toMatch(/export async function createChartEditSession/);
    expect(bc).toMatch(/runTransaction/);
    expect(bc).toMatch(/TABLET_BUSY/);
    expect(bc).toMatch(/isPresenceReady/);
  });
  it('B3 V38 spread order (id last) in the new listeners + newest-requested selection (bugfix 2026-05-21)', () => {
    // V38 spread order (id last) preserved in the listener maps.
    expect(bc).toMatch(/\.\.\.d\.data\(\), id: d\.id/);
    // Bugfix: the requested-session listener now picks the NEWEST requested session
    // (createdAt desc) instead of an arbitrary snap.docs[0] (which could open a stale
    // session and leave the PC waiting on one the tablet never touches).
    expect(bc).toMatch(/toMillis\(b\.createdAt\) - toMillis\(a\.createdAt\)/);
    expect(bc).not.toMatch(/\.\.\.snap\.docs\[0\]\.data\(\), id: snap\.docs\[0\]\.id/);
  });
  it('B4 instant-pop listener queries branchId + tabletDeviceId + requested', () => {
    expect(bc).toMatch(/export function listenToRequestedSessionForTablet/);
    expect(bc).toMatch(/where\('tabletDeviceId', '==', String\(tabletDeviceId\)\)/);
    expect(bc).toMatch(/where\('status', '==', 'requested'\)/);
  });
  it('B5 scopedDataLayer exposes all 8 pairing wrappers', () => {
    for (const fn of [
      'listenToChartTabletPresenceByBranch', 'listenToRequestedSessionForTablet', 'upsertChartTabletPresence',
      'createChartEditSession', 'listenToChartEditSession', 'updateChartEditSession', 'freeChartTablet', 'deleteChartEditSession',
    ]) expect(sdl).toMatch(new RegExp('export const ' + fn + ' ='));
  });
  it('B6 chartEditSession.js has Storage transport + re-exports the pairing fns', () => {
    expect(ces).toMatch(/export async function uploadTransportImage/);
    expect(ces).toMatch(/export async function downloadTransportImageAsDataUrl/);
    expect(ces).toMatch(/export async function cleanupSessionStorage/);
    expect(ces).toMatch(/uploads\/chart-edit-sessions/);
    expect(ces).toMatch(/from '\.\/scopedDataLayer\.js'/);
  });
});
