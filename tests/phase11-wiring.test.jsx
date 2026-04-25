// ─── Phase 11.8 wiring + audit skill integrity tests ──────────────────────
// Verifies AppointmentTab now renders the holiday banner via the pure
// `isDateHoliday` decider (from 11.5) + the `audit-master-data-ownership`
// skill file ships with 10 MO invariants.

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import fs from 'fs';

/* ─── W: AppointmentTab holiday banner wiring ───────────────────────────── */

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = () => ({
      matches: false, media: '', onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }
});

vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app' }));

// Mock backendClient — stub everything AppointmentTab calls. listHolidays is
// the NEW wire (Phase 11.8); the rest are existing getters returning safe
// defaults so the tab mounts without exploding.
// Phase 14.7.H follow-up H (2026-04-26): AppointmentTab migrated from
// one-shot listHolidays to onSnapshot via listenToHolidays. Mock pipes
// mockListHolidays() result to onChange to preserve W1-W5 semantics.
const mockListHolidays = vi.fn();
vi.mock('../src/lib/backendClient.js', () => ({
  createBackendAppointment: vi.fn(),
  updateBackendAppointment: vi.fn(),
  deleteBackendAppointment: vi.fn(),
  getAppointmentsByMonth: vi.fn(() => Promise.resolve({})),
  getAppointmentsByDate: vi.fn(() => Promise.resolve([])),
  // Phase 14.7.H follow-up B — listener variant. Mock returns the same
  // shape as onSnapshot: returns an unsubscribe function. Calls onChange
  // synchronously with [] so the component lands in a stable empty state.
  listenToAppointmentsByDate: (date, onChange) => {
    if (onChange) onChange([]);
    return () => {};
  },
  getAllCustomers: vi.fn(() => Promise.resolve([])),
  getAllMasterDataItems: vi.fn(() => Promise.resolve({})),
  listHolidays: (...a) => mockListHolidays(...a),
  listenToHolidays: (onChange, onError) => {
    Promise.resolve(mockListHolidays()).then(
      (items) => onChange(items || []),
      (err) => (onError || (() => {}))(err),
    );
    return () => {};
  },
}));

describe('Phase 11.8 wiring — AppointmentTab holiday banner', () => {
  beforeEach(() => { mockListHolidays.mockReset(); });

  it('W1: no banner when current date is NOT a holiday', async () => {
    mockListHolidays.mockResolvedValueOnce([
      { type: 'specific', dates: ['1999-01-01'], note: 'old' },
    ]);
    const { default: AppointmentTab } = await import('../src/components/backend/AppointmentTab.jsx');
    render(<AppointmentTab clinicSettings={{ accentColor: '#dc2626' }} theme="dark" />);
    // Wait for initial load (listHolidays fires in useEffect).
    await waitFor(() => expect(mockListHolidays).toHaveBeenCalled());
    // Banner testid absent.
    expect(screen.queryByTestId('appt-holiday-banner')).not.toBeInTheDocument();
  });

  it('W2: banner renders when current date IS a specific holiday', async () => {
    // AppointmentTab uses thaiTodayISO() for selectedDate (Bangkok TZ).
    // `new Date().toISOString().slice(0, 10)` is UTC — off-by-one after
    // 17:00 Bangkok / 00:00 UTC. Use the same helper as the component so
    // dates match regardless of run time.
    const { thaiTodayISO } = await import('../src/utils.js');
    const today = thaiTodayISO();
    mockListHolidays.mockResolvedValueOnce([
      { type: 'specific', dates: [today], note: 'Test Holiday' },
    ]);
    vi.resetModules();
    const { default: AppointmentTab } = await import('../src/components/backend/AppointmentTab.jsx');
    render(<AppointmentTab clinicSettings={{ accentColor: '#dc2626' }} theme="dark" />);
    await waitFor(() => expect(screen.getByTestId('appt-holiday-banner')).toBeInTheDocument());
    expect(screen.getByText(/Test Holiday/)).toBeInTheDocument();
  });

  it('W3: weekly holiday matching current dayOfWeek shows banner', async () => {
    const todayDow = new Date().getDay();  // 0-6 local time — fine since test only needs a match
    mockListHolidays.mockResolvedValueOnce([
      { type: 'weekly', dayOfWeek: todayDow, note: 'Weekly closure' },
    ]);
    vi.resetModules();
    const { default: AppointmentTab } = await import('../src/components/backend/AppointmentTab.jsx');
    render(<AppointmentTab clinicSettings={{ accentColor: '#dc2626' }} theme="dark" />);
    await waitFor(() => expect(screen.getByTestId('appt-holiday-banner')).toBeInTheDocument());
    expect(screen.getByText(/ทุกวัน/)).toBeInTheDocument();
  });

  it('W4: holiday with status=พักใช้งาน does NOT show banner', async () => {
    const today = new Date().toISOString().slice(0, 10);
    mockListHolidays.mockResolvedValueOnce([
      { type: 'specific', dates: [today], note: 'Skipped', status: 'พักใช้งาน' },
    ]);
    vi.resetModules();
    const { default: AppointmentTab } = await import('../src/components/backend/AppointmentTab.jsx');
    render(<AppointmentTab clinicSettings={{ accentColor: '#dc2626' }} theme="dark" />);
    await waitFor(() => expect(mockListHolidays).toHaveBeenCalled());
    expect(screen.queryByTestId('appt-holiday-banner')).not.toBeInTheDocument();
  });

  it('W5: listHolidays rejection is silent (no banner, no crash)', async () => {
    mockListHolidays.mockRejectedValueOnce(new Error('permission denied'));
    vi.resetModules();
    const { default: AppointmentTab } = await import('../src/components/backend/AppointmentTab.jsx');
    expect(() => render(<AppointmentTab clinicSettings={{ accentColor: '#dc2626' }} theme="dark" />)).not.toThrow();
    await waitFor(() => expect(mockListHolidays).toHaveBeenCalled());
    expect(screen.queryByTestId('appt-holiday-banner')).not.toBeInTheDocument();
  });
});

/* ─── A: audit-master-data-ownership skill integrity ────────────────────── */

describe('Phase 11.8 — /audit-master-data-ownership skill file', () => {
  const skillPath = '.claude/skills/audit-master-data-ownership/SKILL.md';

  it('A1: skill file exists', () => {
    expect(fs.existsSync(skillPath)).toBe(true);
  });

  it('A2: frontmatter declares `user-invocable: true`', () => {
    const src = fs.readFileSync(skillPath, 'utf-8');
    expect(src).toMatch(/^---[\s\S]*user-invocable:\s*true[\s\S]*---/m);
  });

  it('A3: documents MO1 through MO10 (10 invariants)', () => {
    const src = fs.readFileSync(skillPath, 'utf-8');
    for (let i = 1; i <= 10; i++) {
      expect(src).toMatch(new RegExp(`### MO${i}\\b`));
    }
  });

  it('A4: every MO has a grep command example', () => {
    const src = fs.readFileSync(skillPath, 'utf-8');
    // Count grep-fence pairs after MO headings.
    const moSections = src.split(/### MO\d+/).slice(1);
    expect(moSections.length).toBeGreaterThanOrEqual(10);
    for (const section of moSections.slice(0, 10)) {
      // Each MO must contain either a ```bash``` block OR `grep -` command.
      expect(section).toMatch(/(```bash|grep -|grep -rn|grep -rnE|grep -E|grep -cE|grep -An)/);
    }
  });

  it('A5: references Rule H explicitly', () => {
    const src = fs.readFileSync(skillPath, 'utf-8');
    expect(src).toMatch(/Rule H/);
  });
});
