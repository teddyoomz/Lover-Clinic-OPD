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
    expect(SRC).toMatch(/onClick=\{\(\) => \{ closePeek\(\); openDetail\(appt\); \}\}/); // V127: + closePeek (dismiss hover peek); openDetail behavior preserved
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

describe('appt-calendar-density · T4 span=1 single-line cell + rollup', () => {
  it('T4.1 derives isShortBlock + nameSizeCls from span', () => {
    expect(SRC).toMatch(/const isShortBlock = span === 1/);
    expect(SRC).toMatch(/const nameSizeCls = isShortBlock \? 'text-\[11px\] leading-\[18px\]' : 'text-sm leading-tight'/);
  });

  it('T4.2 block padding gates on isShortBlock (py-0 when short)', () => {
    expect(SRC).toMatch(/rounded-lg px-2 \$\{isShortBlock \? 'py-0' : 'py-1'\} text-left/);
  });

  it('T4.3 both name wrappers use nameSizeCls (no hardcoded text-sm leading-tight on the name)', () => {
    // <a> link name + <span> temp name both interpolate nameSizeCls
    const nameUses = SRC.match(/\$\{nameSizeCls\} font-bold text-\[var\(--tx-heading\)\] truncate/g) || [];
    expect(nameUses.length).toBeGreaterThanOrEqual(2);
  });

  it('T4.4 dupe rollup pills open the popover (openDetail, not openEdit)', () => {
    expect(SRC).toMatch(/onClick=\{\(e\) => \{ e\.stopPropagation\(\); closePeek\(\); openDetail\(dup\); \}\}/); // V127: + closePeek
    expect(SRC).not.toMatch(/openEdit\(dup\)/);
  });

  it('T4.5 +N collision badge preserved (at-a-glance count)', () => {
    expect(SRC).toMatch(/data-testid="appt-collision-badge"/);
    expect(SRC).toMatch(/\+\{dupCount\}/);
  });
});

describe('appt-calendar-density · T6 responsive switch + toggle', () => {
  it('T6.1 imports useIsBelowLg + AppointmentAgendaView', () => {
    expect(SRC).toMatch(/import \{ useIsBelowLg \} from '\.\.\/\.\.\/hooks\/useIsBelowLg\.js'/);
    expect(SRC).toMatch(/import AppointmentAgendaView from '\.\/AppointmentAgendaView\.jsx'/);
  });

  it('T6.2 derives effectiveView from viewModeOverride || (belowLg ? agenda : grid)', () => {
    expect(SRC).toMatch(/const belowLg = useIsBelowLg\(\)/);
    expect(SRC).toMatch(/const \[viewModeOverride, setViewModeOverride\] = useState\(null\)/);
    expect(SRC).toMatch(/const effectiveView = viewModeOverride \|\| \(belowLg \? 'agenda' : 'grid'\)/);
  });

  it('T6.3 toggle button flips viewModeOverride', () => {
    expect(SRC).toMatch(/data-testid="appt-view-toggle"/);
    expect(SRC).toMatch(/setViewModeOverride\(effectiveView === 'grid' \? 'agenda' : 'grid'\)/);
    expect(SRC).toMatch(/effectiveView === 'grid' \? '☰ ลิสต์' : '⊞ ตาราง'/);
  });

  it('T6.4 render gated on effectiveView; agenda branch fed by typedDayAppts + effectiveRoom + openDetail', () => {
    expect(SRC).toMatch(/\{effectiveView === 'agenda' \? \(/);
    expect(SRC).toMatch(/<AppointmentAgendaView appts=\{typedDayAppts\} resolveRoom=\{effectiveRoom\} onSelect=\{openDetail\} getHoverProps=\{getHoverProps\} \/>/); // V127: + getHoverProps (hover peek)
  });
});
