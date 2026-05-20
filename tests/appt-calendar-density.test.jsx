// tests/appt-calendar-density.test.jsx
//
// Calendar-density (2026-05-20) — source-grep regression locks for the
// AppointmentCalendarView changes (T3 wire popover, T4 span=1 cell + rollup,
// T6 responsive switch). Source-grep guards the wiring shape; behavioral
// coverage is in the RTL + flow-simulate banks.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(here, '../src/components/backend/AppointmentCalendarView.jsx'), 'utf8');

describe('appt-calendar-density · T3 popover wiring', () => {
  it('T3.1 imports AppointmentDetailPopover', () => {
    expect(SRC).toMatch(/import AppointmentDetailPopover from '\.\/AppointmentDetailPopover\.jsx'/);
  });

  it('T3.2 declares detailAppt state + openDetail callback', () => {
    expect(SRC).toMatch(/const \[detailAppt, setDetailAppt\] = useState\(null\)/);
    expect(SRC).toMatch(/const openDetail = useCallback\(\(appt\) => setDetailAppt\(appt\), \[\]\)/);
  });

  it('T3.3 primary block click/keydown opens the popover (openDetail, NOT openEdit)', () => {
    expect(SRC).toMatch(/onClick=\{\(\) => openDetail\(appt\)\}/);
    expect(SRC).toMatch(/e\.preventDefault\(\); openDetail\(appt\);/);
    // anti-regression: the old direct-to-edit primary block click is gone
    expect(SRC).not.toMatch(/onClick=\{\(\) => openEdit\(appt\)\}/);
  });

  it('T3.4 renders AppointmentDetailPopover with effectiveRoom + edit routing', () => {
    expect(SRC).toMatch(/\{detailAppt && \(/);
    expect(SRC).toMatch(/<AppointmentDetailPopover/);
    expect(SRC).toMatch(/roomName=\{effectiveRoom\(detailAppt\)\}/);
    expect(SRC).toMatch(/doctorMap=\{doctorMap\}/);
    expect(SRC).toMatch(/onClose=\{\(\) => setDetailAppt\(null\)\}/);
  });

  it('T3.5 แก้ไข inside the popover still routes to the edit modal (openEdit reachable)', () => {
    expect(SRC).toMatch(/onEdit=\{\(\) => \{ const a = detailAppt; setDetailAppt\(null\); openEdit\(a\); \}\}/);
    // openEdit itself is still defined
    expect(SRC).toMatch(/const openEdit = \(appt\) =>/);
  });
});
