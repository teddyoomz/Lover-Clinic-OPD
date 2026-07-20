// @vitest-environment jsdom
// ─── watcher-of-the-watcher (2026-07-21) — dead-man's switch + stale banner ──
// The infra-health sweep watches 14 crons but its OWN death was silent, and it
// shares every platform failure mode (Vercel account / CRON_SECRET / admin
// creds) with what it watches. Two independent layers close that:
//   D  pingDeadMansSwitch — external heartbeat AFTER a successful sweep; an
//      outside monitor alerts when pings STOP (covers total-platform death)
//   S  InfraHealthStaleBanner — staff daily surfaces warn when the sweep's
//      latest doc is missing/stale >36h (covers sweep-only death, in-app)
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pingDeadMansSwitch } from '../api/cron/infra-health-sweep.js';
import { evaluateSweepStaleness, SWEEP_STALE_HOURS } from '../src/lib/infraHealthCore.js';

const ROOT = join(__dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// ── mock the data layer BEFORE importing the banner ─────────────────────────
const mockGetAdminAuditDoc = vi.fn();
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  getAdminAuditDoc: (...a) => mockGetAdminAuditDoc(...a),
}));
const { default: InfraHealthStaleBanner } = await import('../src/components/InfraHealthStaleBanner.jsx');

describe('D — pingDeadMansSwitch (execution, injectable fetch — no mocks of globals)', () => {
  it('D1.1 pings the configured URL exactly once', async () => {
    const calls = [];
    const out = await pingDeadMansSwitch('https://hc-ping.example/abc', async (url) => { calls.push(url); return { ok: true }; });
    expect(out.pinged).toBe(true);
    expect(calls).toEqual(['https://hc-ping.example/abc']);
  });

  it('D1.2 no URL configured → no-op, fetch never called', async () => {
    const fetchFn = vi.fn();
    const out = await pingDeadMansSwitch('', fetchFn);
    expect(out).toEqual({ pinged: false, reason: 'no-url' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('D1.3 FAIL-SAFE — a throwing fetch NEVER propagates (the sweep must not break)', async () => {
    const out = await pingDeadMansSwitch('https://hc-ping.example/abc', async () => { throw new Error('dns dead'); });
    expect(out.pinged).toBe(false);
    expect(out.error).toContain('dns dead');
  });

  it('D2.1 sweep wiring — ping fires AFTER the status write, heartbeat surfaced in the response', () => {
    const src = read('api/cron/infra-health-sweep.js');
    const statusIdx = src.lastIndexOf('writeScheduledTaskStatus(db, TASK_ID, {\n      ok: true,');
    const pingIdx = src.indexOf('pingDeadMansSwitch(process.env.HEALTHCHECK_PING_URL)');
    expect(statusIdx).toBeGreaterThan(-1);
    expect(pingIdx).toBeGreaterThan(statusIdx);
    expect(src).toMatch(/heartbeat\s*\}\);?\s*$/m);
  });
});

describe('S1 — evaluateSweepStaleness (pure)', () => {
  const now = Date.parse('2026-07-21T12:00:00Z');
  const hoursAgo = (h) => new Date(now - h * 3600 * 1000).toISOString();

  it('S1.1 fresh (<36h) → not stale', () => {
    expect(evaluateSweepStaleness({ performedAt: hoursAgo(20), nowMs: now }).stale).toBe(false);
  });

  it('S1.2 stale (>36h) → stale with ageHours', () => {
    const s = evaluateSweepStaleness({ performedAt: hoursAgo(48), nowMs: now });
    expect(s).toMatchObject({ stale: true, reason: 'stale' });
    expect(Math.round(s.ageHours)).toBe(48);
  });

  it('S1.3 missing / garbage performedAt → never-ran (silence is not success)', () => {
    expect(evaluateSweepStaleness({ performedAt: null, nowMs: now }).reason).toBe('never-ran');
    expect(evaluateSweepStaleness({ performedAt: 'not-a-date', nowMs: now }).reason).toBe('never-ran');
    expect(evaluateSweepStaleness({ nowMs: now }).stale).toBe(true);
  });

  it('S1.4 exactly at the threshold stays fresh (strict >)', () => {
    expect(evaluateSweepStaleness({ performedAt: hoursAgo(SWEEP_STALE_HOURS), nowMs: now }).stale).toBe(false);
  });
});

describe('S2 — InfraHealthStaleBanner (RTL, mocked data layer only)', () => {
  beforeEach(() => {
    cleanup();
    mockGetAdminAuditDoc.mockReset();
    try { sessionStorage.clear(); } catch { /* jsdom */ }
  });

  it('S2.1 stale doc → amber banner with the age in hours', async () => {
    mockGetAdminAuditDoc.mockResolvedValue({ performedAt: new Date(Date.now() - 50 * 3600 * 1000).toISOString() });
    render(<InfraHealthStaleBanner />);
    const el = await screen.findByTestId('infra-health-stale-banner');
    expect(el.textContent).toContain('ไม่ได้รันมา');
    expect(el.textContent).toContain('50');
  });

  it('S2.2 fresh doc → renders NOTHING', async () => {
    mockGetAdminAuditDoc.mockResolvedValue({ performedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString() });
    render(<InfraHealthStaleBanner />);
    await waitFor(() => expect(mockGetAdminAuditDoc).toHaveBeenCalled());
    expect(screen.queryByTestId('infra-health-stale-banner')).toBeNull();
  });

  it('S2.3 doc missing entirely → "never ran" banner (a real signal, not silence)', async () => {
    mockGetAdminAuditDoc.mockResolvedValue(null);
    render(<InfraHealthStaleBanner />);
    const el = await screen.findByTestId('infra-health-stale-banner');
    expect(el.textContent).toContain('ยังไม่เคยรัน');
  });

  it('S2.4 FAIL-SAFE — a read error renders nothing (no false alarms on offline devices)', async () => {
    mockGetAdminAuditDoc.mockRejectedValue(new Error('permission-denied'));
    render(<InfraHealthStaleBanner />);
    await waitFor(() => expect(mockGetAdminAuditDoc).toHaveBeenCalled());
    expect(screen.queryByTestId('infra-health-stale-banner')).toBeNull();
  });

  it('S2.5 dismiss hides for the session (24h TTL key in sessionStorage)', async () => {
    mockGetAdminAuditDoc.mockResolvedValue(null);
    render(<InfraHealthStaleBanner />);
    const el = await screen.findByTestId('infra-health-stale-banner');
    fireEvent.click(el.querySelector('button'));
    expect(screen.queryByTestId('infra-health-stale-banner')).toBeNull();
    expect(Number(sessionStorage.getItem('lover.infraStaleDismissedAt'))).toBeGreaterThan(0);
  });
});

describe('S3 — mount wiring on both staff daily surfaces', () => {
  it('S3.1 AdminDashboard imports + renders the banner', () => {
    const src = read('src/pages/AdminDashboard.jsx');
    expect(src).toMatch(/import InfraHealthStaleBanner from '\.\.\/components\/InfraHealthStaleBanner\.jsx'/);
    expect(src).toMatch(/<InfraHealthStaleBanner \/>/);
  });

  it('S3.2 BackendDashboard imports + renders the banner once, outside the menu-mode ternary', () => {
    const src = read('src/pages/BackendDashboard.jsx');
    expect(src).toMatch(/import InfraHealthStaleBanner from '\.\.\/components\/InfraHealthStaleBanner\.jsx'/);
    expect((src.match(/<InfraHealthStaleBanner \/>/g) || []).length).toBe(1);
  });

  it('S3.3 banner reads via scopedDataLayer (BS-1) + fixed positioning (no layout shift)', () => {
    const src = read('src/components/InfraHealthStaleBanner.jsx');
    expect(src).toMatch(/from '\.\.\/lib\/scopedDataLayer\.js'/);
    expect(src).not.toMatch(/from '\.\.\/lib\/backendClient\.js'/);
    expect(src).toMatch(/fixed bottom-2/);
  });
});
