import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// 2026-05-27 — Appointment-page LIVE cross-device.
// Approved design: Q1=A Listener-trigger (extend the existing appointmentDataVersion
// pattern), Q2=A treatments listener allBranches:true (mirror loadAll, V64-fix6).
// Add live onSnapshot listeners for treatments + deposits + sales; each fires on a
// cross-device change → bumps liveRefreshTick → existing loadAll({silent}) re-fetches.
//
// These are SOURCE-GREP + pure flow-simulate guards (lock the wiring shape).
// Real cross-device behaviour is verified by the Rule Q 2-client L1 (Playwright /
// real-browser 2-context) — mock tests cannot prove onSnapshot cross-device push.

const BC = readFileSync('src/lib/backendClient.js', 'utf8');
const SDL = readFileSync('src/lib/scopedDataLayer.js', 'utf8');
const HUB = readFileSync('src/components/admin/AppointmentHubView.jsx', 'utf8');

describe('Task 1 — Layer-1 trigger listeners (backendClient.js)', () => {
  it('listenToTreatmentsByDateRange exists + onSnapshot over treatmentsCol + allBranches handling', () => {
    expect(BC).toContain('export function listenToTreatmentsByDateRange(opts, onChange, onError)');
    expect(BC).toMatch(/listenToTreatmentsByDateRange[\s\S]*?onSnapshot\(treatmentsCol\(\)/);
    expect(BC).toMatch(/listenToTreatmentsByDateRange[\s\S]*?const allBranches = !!\(opts/);
  });
  it('listenToTreatmentsByDateRange is safe-by-default (BS-13): no-op empty when branch-scoped but unresolvable', () => {
    expect(BC).toMatch(/listenToTreatmentsByDateRange[\s\S]*?if \(!allBranches && !effectiveBranchId\) \{ onChange\?\.\(\[\]\); return \(\) => \{\}; \}/);
  });
  it('listenToAllDeposits exists + branch-scoped where + safe-by-default', () => {
    expect(BC).toContain('export function listenToAllDeposits(opts, onChange, onError)');
    expect(BC).toMatch(/listenToAllDeposits[\s\S]*?where\('branchId', '==', String\(effectiveBranchId\)\)/);
    expect(BC).toMatch(/listenToAllDeposits[\s\S]*?if \(!allBranches && !effectiveBranchId\) \{ onChange\?\.\(\[\]\); return \(\) => \{\}; \}/);
  });
});

describe('Task 2 — scopedDataLayer re-exports', () => {
  it('re-exports both new listeners (passthrough)', () => {
    expect(SDL).toContain('export const listenToTreatmentsByDateRange = (...args) => raw.listenToTreatmentsByDateRange(...args);');
    expect(SDL).toContain('export const listenToAllDeposits = (...args) => raw.listenToAllDeposits(...args);');
  });
});

describe('Task 3 — AppointmentHubView live wiring', () => {
  it('imports the 3 trigger listeners + the BSA hook + thaiTodayISO', () => {
    expect(HUB).toContain('listenToTreatmentsByDateRange');
    expect(HUB).toContain('listenToAllDeposits');
    expect(HUB).toContain('listenToAllSales');
    expect(HUB).toContain("import { useBranchAwareListener } from '../../hooks/useBranchAwareListener.js'");
    expect(HUB).toContain("import { thaiTodayISO } from '../../utils.js'");
  });
  it('subscribes treatments (allBranches:true, direct) + deposits/sales (branch-aware hook)', () => {
    expect(HUB).toContain('listenToTreatmentsByDateRange(');
    expect(HUB).toContain('allBranches: true');
    expect(HUB).toContain('useBranchAwareListener(listenToAllDeposits, {}, onDepLive)');
    // sales = allBranches direct (V66-safe: composite branchId+saleDate index doesn't exist)
    expect(HUB).toContain('listenToAllSales({ allBranches: true }, onSaleLive');
  });
  it('every live fire routes through bumpLive → setLiveRefreshTick → loadAll({silent})', () => {
    expect(HUB).toContain('setLiveRefreshTick');
    expect(HUB).toContain('loadAll({ silent: true })');
    expect(HUB).toMatch(/const bumpLive = useCallback\(\(key\) => \{[\s\S]*?setLiveRefreshTick\(\(t\) => t \+ 1\)/);
  });
  it('skip-first guard exists (no mount double-load)', () => {
    expect(HUB).toContain('liveFirstFire');
    expect(HUB).toMatch(/if \(liveFirstFire\.current\[key\]\) \{ liveFirstFire\.current\[key\] = false; return; \}/);
  });
  it('resilience: wideRange recomputes on todayKey + visibility/online resume guard', () => {
    expect(HUB).toContain('}, [todayKey]);');
    expect(HUB).toContain("addEventListener('visibilitychange', refresh)");
    expect(HUB).toContain("addEventListener('online', refresh)");
  });
});

describe('BS audit — branch-scope discipline', () => {
  it('treatments allBranches listener is annotated listener-direct; deposits/sales via useBranchAwareListener', () => {
    // allBranches treatments trigger must carry the sanctioned annotation
    expect(HUB).toMatch(/audit-branch-scope: listener-direct[\s\S]*?listenToTreatmentsByDateRange\(/);
    // branch-scoped deposits go through the hook; sales is allBranches DIRECT
    // (index-safe — the composite branchId+saleDate index does not exist).
    expect(HUB).toContain('useBranchAwareListener(listenToAllDeposits');
    expect(HUB).toContain('listenToAllSales({ allBranches: true }');
    expect(HUB).not.toContain('useBranchAwareListener(listenToAllSales');
  });
});

describe('Rule I flow-simulate — fire → skip-first → bump → loadAll', () => {
  // Pure mirror of the component wiring (no React mount).
  function makeBumper() {
    const firstFire = { tx: true, dep: true, sale: true };
    let tick = 0;
    const bump = (key) => {
      if (firstFire[key]) { firstFire[key] = false; return; }
      tick += 1;
    };
    return { bump, getTick: () => tick };
  }

  it('first fire per listener is skipped (mount), subsequent fires bump', () => {
    const { bump, getTick } = makeBumper();
    bump('tx'); bump('dep'); bump('sale');   // mount fires — all skipped
    expect(getTick()).toBe(0);
    bump('tx');                               // doctor saves OPD on another device
    expect(getTick()).toBe(1);
    bump('dep'); bump('sale');                // deposit + sale change elsewhere
    expect(getTick()).toBe(3);
  });

  it('a tick change drives exactly one silent reload per distinct value', () => {
    let reloads = 0;
    let prev = 0;
    const apply = (tickVal) => { if (tickVal === prev) return; prev = tickVal; reloads += 1; };
    apply(0);            // baseline — no reload (equal to prev)
    apply(1); apply(2);  // two distinct bumps → two reloads
    apply(2);            // duplicate → no reload
    expect(reloads).toBe(2);
  });
});
