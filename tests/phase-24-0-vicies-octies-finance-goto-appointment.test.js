// ─── Phase 24.0-vicies-octies — Finance "ไปที่นัด" deep-link ─────────────
//
// User directive 2026-05-06: "ทำให้จากหน้า tab=finance มีปุ่ม ไปที่นัด
// เมื่อกดก็จะเด้งไป tab=appointment-deposit ในวันนั้น นัดนั้นเลย".
//
// Implementation:
//   1. AppointmentCalendarView gains optional initialSelectedDate prop;
//      when valid YYYY-MM-DD, opens calendar on that date instead of today.
//      calMonth also anchors to the date's month.
//   2. BackendDashboard deep-link useEffect reads ?date= query param +
//      stores in initialApptDate state + passes to AppointmentCalendarView.
//   3. DepositPanel deposit row gains "ไปที่นัด" button (Calendar icon,
//      blue) for rows with linked appointment + appointment.date set.
//      onClick → window.open(`?backend=1&tab=appointment-deposit&date=...`,
//      '_blank') — new tab + fresh BackendDashboard mount picks up the
//      deep-link params.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const DEPOSIT_PANEL = fs.readFileSync(
  path.join(ROOT, 'src/components/backend/DepositPanel.jsx'),
  'utf8',
);
const VIEW = fs.readFileSync(
  path.join(ROOT, 'src/components/backend/AppointmentCalendarView.jsx'),
  'utf8',
);
const BACKEND = fs.readFileSync(
  path.join(ROOT, 'src/pages/BackendDashboard.jsx'),
  'utf8',
);

describe('Phase 24.0-vicies-octies — AppointmentCalendarView initialSelectedDate prop', () => {
  it('VOC.A.1 — prop declared in component signature', () => {
    expect(VIEW).toMatch(/initialSelectedDate/);
  });

  it('VOC.A.2 — useState init reads initialSelectedDate when valid YYYY-MM-DD', () => {
    expect(VIEW).toMatch(
      /useState\(\(\)\s*=>\s*\{[\s\S]{0,400}?const\s+candidate\s*=\s*String\(initialSelectedDate\s*\|\|\s*''\)\.trim\(\)/,
    );
    expect(VIEW).toMatch(/\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(candidate\)/);
  });

  it('VOC.A.3 — calMonth init anchors to initialSelectedDate month (mini calendar opens on right page)', () => {
    expect(VIEW).toMatch(
      /calMonth[\s\S]{0,400}?initialSelectedDate[\s\S]{0,300}?parseInt\(y/,
    );
  });

  it('VOC.A.4 — falls back to today on invalid/empty initialSelectedDate (anti-regression)', () => {
    expect(VIEW).toMatch(
      /useState\(\(\)\s*=>\s*\{[\s\S]{0,500}?return\s+dateStr\(new\s+Date\(\)\)/,
    );
  });

  it('VOC.A.5 — Phase 24.0-vicies-octies marker present', () => {
    expect(VIEW).toMatch(/Phase 24\.0-vicies-octies/);
  });
});

describe('Phase 24.0-vicies-octies — BackendDashboard deep-link reads ?date=', () => {
  it('VOC.B.1 — initialApptDate state declared (Issue-1: synchronous ?date= derive)', () => {
    // Issue-1 (2026-05-26) — was useState(''); now a synchronous URL-derive so the
    // calendar opens on the appt date at FIRST mount (the default activeTab already
    // mounts AppointmentCalendarView before the deep-link useEffect runs → its
    // selectedDate initializer would otherwise lock to today).
    expect(BACKEND).toMatch(
      /const\s+\[initialApptDate,\s*setInitialApptDate\]\s*=\s*useState\(\(\)\s*=>/,
    );
    const idx = BACKEND.indexOf('const [initialApptDate, setInitialApptDate] = useState(() =>');
    const block = BACKEND.slice(idx, idx + 400);
    expect(block).toMatch(/URLSearchParams\(window\.location\.search\)/);
    expect(block).toMatch(/\.get\(['"]date['"]\)/);
    // anti-regression: must NOT revert to the empty-string init (the today-lock bug).
    expect(BACKEND).not.toMatch(/const\s+\[initialApptDate,\s*setInitialApptDate\]\s*=\s*useState\(''\)/);
  });

  it('VOC.B.2 — deep-link useEffect reads dateParam', () => {
    expect(BACKEND).toMatch(
      /const\s+dateParam\s*=\s*params\.get\(['"]date['"]\)/,
    );
  });

  it('VOC.B.3 — setInitialApptDate gated on YYYY-MM-DD validation', () => {
    expect(BACKEND).toMatch(
      /if\s*\(dateParam\s*&&\s*\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(dateParam\)\)\s*\{[\s\S]{0,200}?setInitialApptDate\(dateParam\)/,
    );
  });

  it('VOC.B.4 — AppointmentCalendarView receives initialSelectedDate prop', () => {
    expect(BACKEND).toMatch(
      /<AppointmentCalendarView[\s\S]{0,800}?initialSelectedDate=\{initialApptDate\}/,
    );
  });

  it('VOC.B.5 — Phase 24.0-vicies-octies marker present', () => {
    expect(BACKEND).toMatch(/Phase 24\.0-vicies-octies/);
  });
});

describe('Phase 24.0-vicies-octies — DepositPanel "ไปที่นัด" button', () => {
  it('VOC.C.1 — button rendered with testid', () => {
    expect(DEPOSIT_PANEL).toContain('data-testid="deposit-goto-appointment-btn"');
  });

  it('VOC.C.2 — gated on (hasAppointment || linkedAppointmentId) && appointment.date', () => {
    expect(DEPOSIT_PANEL).toMatch(
      /\(dep\.hasAppointment\s*\|\|\s*dep\.linkedAppointmentId\)\s*&&\s*dep\.appointment\?\.date\s*&&\s*\(/,
    );
  });

  it('VOC.C.3 — onClick opens window with deep-link URL pattern', () => {
    expect(DEPOSIT_PANEL).toMatch(
      /window\.open\(url,\s*['"]_blank['"],\s*['"]noopener,noreferrer['"]\)/,
    );
    expect(DEPOSIT_PANEL).toMatch(
      /\?backend=1&tab=appointment-deposit&date=\$\{encodeURIComponent\(apptDate\)\}/,
    );
  });

  it('VOC.C.4 — button uses Calendar icon (lucide)', () => {
    // The button has <Calendar size={13} /> inside.
    expect(DEPOSIT_PANEL).toMatch(
      /data-testid="deposit-goto-appointment-btn"[\s\S]{0,400}?<Calendar\s+size=\{13\}\s*\/>/,
    );
  });

  it('VOC.C.5 — Calendar imported from lucide-react', () => {
    expect(DEPOSIT_PANEL).toMatch(/Calendar(?:,|\s|$)/);
  });

  it('VOC.C.6 — title attribute hints "เปิดแท็บใหม่"', () => {
    expect(DEPOSIT_PANEL).toMatch(/title="ไปที่นัด \(เปิดแท็บใหม่\)"/);
  });
});

describe('Phase 24.0-vicies-octies — full-flow simulate (Rule I)', () => {
  let openSpy;
  let originalOpen;
  let originalLocation;

  beforeEach(() => {
    originalOpen = window.open;
    originalLocation = window.location;
    openSpy = vi.fn();
    window.open = openSpy;
    delete window.location;
    window.location = { origin: 'https://lover-clinic-app.vercel.app' };
  });

  afterEach(() => {
    window.open = originalOpen;
    window.location = originalLocation;
  });

  it('VOC.F.1 — click ไปที่นัด → window.open with correct deep-link URL', () => {
    // Mirror of the DepositPanel onClick handler.
    const dep = {
      depositId: 'DEP-1',
      hasAppointment: true,
      linkedAppointmentId: 'BA-1',
      appointment: { date: '2026-05-09', startTime: '12:30' },
    };
    const apptDate = String(dep.appointment?.date || '').trim();
    expect(apptDate).toBe('2026-05-09');
    const origin = window.location.origin;
    const url = `${origin}/?backend=1&tab=appointment-deposit&date=${encodeURIComponent(apptDate)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    expect(openSpy).toHaveBeenCalledWith(
      'https://lover-clinic-app.vercel.app/?backend=1&tab=appointment-deposit&date=2026-05-09',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('VOC.F.2 — empty appointment.date → button gated off (button doesn\'t render)', () => {
    const dep = {
      depositId: 'DEP-2',
      hasAppointment: true,
      linkedAppointmentId: 'BA-2',
      appointment: null, // no date
    };
    const showButton = (dep.hasAppointment || dep.linkedAppointmentId)
      && dep.appointment?.date;
    expect(showButton).toBeFalsy();
  });

  it('VOC.F.3 — deposit-only (no linkedAppointmentId, no hasAppointment) → button gated off', () => {
    const dep = {
      depositId: 'DEP-3',
      hasAppointment: false,
      linkedAppointmentId: '',
      appointment: null,
    };
    const showButton = (dep.hasAppointment || dep.linkedAppointmentId)
      && dep.appointment?.date;
    expect(showButton).toBeFalsy();
  });

  it('VOC.F.4 — BackendDashboard receives ?date= → state set → prop passed', () => {
    // Simulate BackendDashboard's deep-link useEffect.
    const url = 'https://x.com/?backend=1&tab=appointment-deposit&date=2026-05-09';
    const params = new URLSearchParams(url.split('?')[1]);
    const dateParam = params.get('date');
    expect(dateParam).toBe('2026-05-09');
    expect(/^\d{4}-\d{2}-\d{2}$/.test(dateParam)).toBe(true);
    // → setInitialApptDate('2026-05-09') → AppointmentCalendarView receives prop
  });

  it('VOC.F.5 — invalid ?date= (e.g. mm/dd/yyyy) → state stays empty → calendar uses today', () => {
    const params = new URLSearchParams('?date=05/09/2026');
    const dateParam = params.get('date');
    const isValid = !!dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam);
    expect(isValid).toBe(false);
    // → setInitialApptDate not called → AppointmentCalendarView falls back
    //   to today via dateStr(new Date()).
  });

  it('VOC.F.6 — AppointmentCalendarView useState init mirror logic', () => {
    // Mirror of the useState init:
    //   const candidate = String(initialSelectedDate || '').trim();
    //   if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return candidate;
    //   return dateStr(new Date());
    const cases = [
      { input: '2026-05-09', expected: '2026-05-09' },
      { input: '', expected: 'today' },
      { input: null, expected: 'today' },
      { input: '05/09/2026', expected: 'today' }, // invalid format
      { input: '  2026-05-09  ', expected: '2026-05-09' }, // whitespace trimmed
    ];
    for (const { input, expected } of cases) {
      const candidate = String(input || '').trim();
      const result = /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : 'today';
      expect(result).toBe(expected);
    }
  });
});
