import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { sortApptsConfirmedFirst } from '../src/lib/appointmentHubFilters.js';

const mk = (id, status, startTime, serviceCompletedAt = null, date = '2026-05-31') =>
  ({ id, status, startTime, serviceCompletedAt, date });

describe('sortApptsConfirmedFirst (①)', () => {
  test('confirmed-active first, each partition by time asc', () => {
    const out = sortApptsConfirmedFirst([
      mk('a','pending','09:00'), mk('b','confirmed','10:30'),
      mk('c','pending','11:15'), mk('d','confirmed','13:00'),
    ]);
    expect(out.map(x => x.id)).toEqual(['b','d','a','c']);
  });
  test('confirmed but already served (serviceCompletedAt) drops to rest', () => {
    const out = sortApptsConfirmedFirst([
      mk('a','confirmed','09:00','2026-05-31T05:00:00Z'), // served → rest
      mk('b','confirmed','10:30'),                        // active → top
    ]);
    expect(out.map(x => x.id)).toEqual(['b','a']);
  });
  test('done/cancelled never bubble; empty safe', () => {
    expect(sortApptsConfirmedFirst([])).toEqual([]);
    const out = sortApptsConfirmedFirst([mk('a','done','09:00'), mk('b','cancelled','08:00'), mk('c','confirmed','12:00')]);
    expect(out[0].id).toBe('c');
  });
  test('does not mutate input', () => {
    const input = [mk('a','pending','09:00'), mk('b','confirmed','10:30')];
    const copy = JSON.parse(JSON.stringify(input));
    sortApptsConfirmedFirst(input);
    expect(input).toEqual(copy);
  });
});

describe('② wiring — AppointmentHubView today sort', () => {
  const src = readFileSync('src/components/admin/AppointmentHubView.jsx', 'utf8');
  test('imports + uses sortApptsConfirmedFirst on today tab', () => {
    expect(src).toMatch(/sortApptsConfirmedFirst/);
    expect(src).toMatch(/activeTab === 'today'\s*\n?\s*\?\s*sortApptsConfirmedFirst/);
  });
});

describe('① card tint — AppointmentHubRowCard', () => {
  const src = readFileSync('src/components/admin/AppointmentHubRowCard.jsx', 'utf8');
  test('confirmed → green surface; else var(--bg-card)', () => {   // (2026-05-31) sky→green
    expect(src).toMatch(/isConfirmedHighlight\s*=\s*effectiveStatus === 'confirmed'/);
    expect(src).toMatch(/border-green-500\/50 bg-green-500\/\[0\.06\]/);
    expect(src).not.toMatch(/border-sky-500\/50 bg-sky-500\/\[0\.06\]/);   // anti-regression
    expect(src).toMatch(/border \$\{surfaceCls\}/);
  });
});

describe('② confirmed status color = green (bar + chip) — _apptHubStyles', () => {
  const s = readFileSync('src/components/admin/_apptHubStyles.js', 'utf8');
  test('ACCENT_BAR.confirmed + STATUS_CHIP_CLS.confirmed are green (not sky)', () => {
    expect(s).toMatch(/confirmed:\s*'bg-gradient-to-b from-green-400 to-green-600'/);
    expect(s).toMatch(/confirmed:\s*'bg-green-100 text-green-900[^']*dark:bg-green-950/);
    expect(s).not.toMatch(/from-sky-400 to-cyan-600/);          // anti-regression
    expect(s).not.toMatch(/confirmed:\s*'bg-sky-100/);          // anti-regression
  });
});
