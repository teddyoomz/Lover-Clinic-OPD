// ─── MonthCalendarGrid — Phase 13.2.7 (ProClinic /admin/schedule/{doctor,employee} parity) ──
// Pure presentational grid:
//   - Header: month label (BE year พ.ศ.) + prev/next nav arrows
//   - 7 col × 6 row grid (จ-อา week starts Monday per ProClinic)
//   - Each cell: date number + N chips of `HH:MM-HH:MM` for matched entries
//   - Saturday + Sunday cells slightly shaded (vs weekdays)
//   - Trailing-month / leading-month dates rendered muted
//
// Pure — props in, render out. Caller passes pre-fetched schedules; we
// resolve effective entries per-day via mergeSchedulesForDate.

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { mergeSchedulesForDate, TYPE_LABEL } from '../../../lib/staffScheduleValidation.js';

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

// ProClinic week order: จ อ พ พฤ ศ ส อา (Monday-first).
// JS Date.getDay() returns 0=Sun..6=Sat, so we map slot 0..6 → JS dayOfWeek
//   slot 0=Mon=1, slot 1=Tue=2, ..., slot 5=Sat=6, slot 6=Sun=0
const WEEK_HEADER = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
const SLOT_TO_JS_DAY = [1, 2, 3, 4, 5, 6, 0];

// Type → tailwind chip color (matches ProClinic palette per look-admin_schedule_*.png)
const TYPE_CHIP_CLS = {
  recurring: 'bg-emerald-700/30 border-emerald-700/50 text-emerald-300',
  work:      'bg-emerald-700/30 border-emerald-700/50 text-emerald-300',
  halfday:   'bg-sky-700/30 border-sky-700/50 text-sky-300',
  holiday:   'bg-amber-700/30 border-amber-700/50 text-amber-300',
  leave:     'bg-rose-700/30 border-rose-700/50 text-rose-300',
  sick:      'bg-rose-700/30 border-rose-700/50 text-rose-300',
};

// Phase 13.2.7-bis (2026-04-26): per-staff chip palette inspired by
// ProClinic (which assigns one color per user_id — pink/cyan/peach/etc).
// Deterministic hash → palette index so the SAME staff gets the SAME
// color across reloads + days.
const STAFF_CHIP_PALETTE = [
  'bg-pink-700/35 border-pink-600/60 text-pink-200',
  'bg-cyan-700/35 border-cyan-600/60 text-cyan-200',
  'bg-orange-700/35 border-orange-600/60 text-orange-200',
  'bg-violet-700/35 border-violet-600/60 text-violet-200',
  'bg-lime-700/35 border-lime-600/60 text-lime-200',
  'bg-yellow-700/35 border-yellow-600/60 text-yellow-200',
  'bg-teal-700/35 border-teal-600/60 text-teal-200',
  'bg-fuchsia-700/35 border-fuchsia-600/60 text-fuchsia-200',
  'bg-indigo-700/35 border-indigo-600/60 text-indigo-200',
  'bg-rose-700/35 border-rose-600/60 text-rose-200',
];

function staffColorClass(staffId) {
  if (!staffId) return STAFF_CHIP_PALETTE[0];
  const s = String(staffId);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return STAFF_CHIP_PALETTE[Math.abs(h) % STAFF_CHIP_PALETTE.length];
}

function pad2(n) { return String(n).padStart(2, '0'); }

function isoDate(year, monthIdx, day) {
  return `${year}-${pad2(monthIdx + 1)}-${pad2(day)}`;
}

/**
 * Build the 6×7 grid of date cells for a given (year, monthIdx).
 * Returns 42 entries; each:
 *   { dateISO, day, isCurrentMonth, jsDayOfWeek }
 * Week starts Monday (ProClinic convention).
 */
function buildMonthGrid(year, monthIdx) {
  const firstOfMonth = new Date(Date.UTC(year, monthIdx, 1));
  const firstJsDow = firstOfMonth.getUTCDay();             // 0=Sun..6=Sat
  // Convert JS dayOfWeek to slot index (Mon=0, Sun=6)
  const firstSlotIdx = (firstJsDow + 6) % 7;
  // Number of days in current month
  const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  // Days in previous month (for leading filler)
  const daysInPrev = new Date(Date.UTC(year, monthIdx, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    let cellYear = year, cellMonth = monthIdx, cellDay;
    if (i < firstSlotIdx) {
      cellDay = daysInPrev - (firstSlotIdx - 1 - i);
      cellMonth = monthIdx - 1;
      if (cellMonth < 0) { cellMonth = 11; cellYear--; }
    } else if (i < firstSlotIdx + daysInMonth) {
      cellDay = i - firstSlotIdx + 1;
    } else {
      cellDay = i - firstSlotIdx - daysInMonth + 1;
      cellMonth = monthIdx + 1;
      if (cellMonth > 11) { cellMonth = 0; cellYear++; }
    }
    const jsDow = new Date(Date.UTC(cellYear, cellMonth, cellDay)).getUTCDay();
    cells.push({
      dateISO: isoDate(cellYear, cellMonth, cellDay),
      day: cellDay,
      isCurrentMonth: cellMonth === monthIdx,
      jsDayOfWeek: jsDow,
      slotIdx: i % 7,
    });
  }
  return cells;
}

export default function MonthCalendarGrid({
  year,
  monthIdx,
  schedules = [],
  selectedDateISO = '',
  selectedStaffId = '',     // 2026-04-26: highlights selected staff's chips
  staffMap = null,          // Map<staffId, { name, color? }> for chip labels
  onMonthChange,
  onCellClick,
}) {
  const cells = useMemo(() => buildMonthGrid(year, monthIdx), [year, monthIdx]);

  // Pre-compute per-cell effective entries (override > recurring) using the
  // merge helper. Schedules contain MULTIPLE STAFF — calendar shows ALL of
  // them per cell (ProClinic-fidelity: "ตารางหมอและพนง โชว์ทุกคนซ้อนกัน").
  const cellEntries = useMemo(() => {
    const map = new Map();
    for (const cell of cells) {
      try {
        const merged = mergeSchedulesForDate(cell.dateISO, schedules);
        // Sort within-cell by startTime ascending for stable display.
        merged.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
        map.set(cell.dateISO, merged);
      } catch {
        map.set(cell.dateISO, []);
      }
    }
    return map;
  }, [cells, schedules]);

  // Resolve staffId → display name; FALLBACK to schedule.staffName then "?"
  // (NEVER show numeric user_id as the visible chip text — V21-anti).
  const resolveStaffName = (entry) => {
    const sid = String(entry.staffId);
    if (staffMap && staffMap.has?.(sid)) {
      const m = staffMap.get(sid);
      return m?.name || entry.staffName || '?';
    }
    return entry.staffName || '?';
  };

  const beYear = year + 543;
  const monthLabel = `${THAI_MONTHS[monthIdx]} ${beYear}`;

  const goPrev = () => {
    let m = monthIdx - 1, y = year;
    if (m < 0) { m = 11; y--; }
    onMonthChange?.(y, m);
  };
  const goNext = () => {
    let m = monthIdx + 1, y = year;
    if (m > 11) { m = 0; y++; }
    onMonthChange?.(y, m);
  };

  return (
    <div className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] overflow-hidden" data-testid="schedule-month-grid">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--bd)]">
        <button onClick={goPrev} aria-label="เดือนก่อน"
          className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--tx-muted)]"
          data-testid="schedule-month-prev">
          <ChevronLeft size={16} />
        </button>
        <h3 className="text-sm font-bold text-[var(--tx-heading)] flex-1 text-center" data-testid="schedule-month-label">
          {monthLabel}
        </h3>
        <button onClick={goNext} aria-label="เดือนถัดไป"
          className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--tx-muted)]"
          data-testid="schedule-month-next">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Week-header row — Monday-first per ProClinic */}
      <div className="grid grid-cols-7 border-b border-[var(--bd)] bg-[var(--bg-hover)]">
        {WEEK_HEADER.map((label, idx) => {
          const jsDow = SLOT_TO_JS_DAY[idx];
          const isWeekend = jsDow === 0 || jsDow === 6;
          return (
            <div key={label}
              className={`text-center py-1.5 text-[10px] font-bold uppercase tracking-wider ${isWeekend ? 'text-[var(--tx-muted)]' : 'text-[var(--tx-secondary)]'}`}>
              {label}
            </div>
          );
        })}
      </div>

      {/* 6×7 grid */}
      <div className="grid grid-cols-7" data-testid="schedule-month-cells">
        {cells.map((cell, i) => {
          const isWeekend = cell.jsDayOfWeek === 0 || cell.jsDayOfWeek === 6;
          const entries = cellEntries.get(cell.dateISO) || [];
          const isSelected = cell.dateISO === selectedDateISO;
          return (
            <button
              key={`${cell.dateISO}-${i}`}
              onClick={() => onCellClick?.(cell.dateISO)}
              data-testid={`schedule-cell-${cell.dateISO}`}
              data-iso={cell.dateISO}
              data-current-month={cell.isCurrentMonth ? '1' : '0'}
              className={`min-h-[88px] p-1.5 border-r border-b border-[var(--bd)] text-left flex flex-col gap-0.5 transition-colors ${
                cell.isCurrentMonth ? 'bg-[var(--bg-card)]' : 'bg-[var(--bg-base)] opacity-60'
              } ${isWeekend ? 'bg-opacity-90' : ''} ${
                isSelected ? 'ring-2 ring-inset ring-emerald-500/60' : 'hover:bg-[var(--bg-hover)]'
              }`}
            >
              <div className={`text-[11px] font-bold ${cell.isCurrentMonth ? 'text-[var(--tx-primary)]' : 'text-[var(--tx-faint)]'}`}>
                {cell.day}
              </div>
              <div className="flex flex-col gap-0.5 mt-auto">
                {entries.slice(0, 5).map((e, idx) => {
                  const isWorking = e.type === 'recurring' || e.type === 'work' || e.type === 'halfday';
                  // Non-working types (leave/holiday/sick) keep type-color
                  // for clarity. Working types get per-staff color so user
                  // can visually scan multi-staff cells.
                  const cls = isWorking
                    ? staffColorClass(e.staffId)
                    : (TYPE_CHIP_CLS[e.type] || TYPE_CHIP_CLS.work);
                  const name = resolveStaffName(e);
                  // Format: "HH:MM-HH:MM <name>" matches ProClinic title format.
                  // Non-working: "<TYPE_LABEL> <name>" for clarity.
                  const label = isWorking
                    ? `${e.startTime || '--'}-${e.endTime || '--'} ${name}`
                    : `${TYPE_LABEL[e.type] || e.type} ${name}`;
                  // Highlight chip if it belongs to the selected staff.
                  const isSelected = selectedStaffId && String(e.staffId) === String(selectedStaffId);
                  return (
                    <div key={`${e.staffId}-${idx}`}
                      className={`text-[9px] px-1 py-0.5 rounded border truncate ${cls} ${
                        isSelected ? 'ring-1 ring-emerald-400 font-bold' : ''
                      }`}
                      title={label}
                      data-testid={`schedule-cell-chip-${cell.dateISO}-${idx}`}
                      data-staff-id={e.staffId}>
                      {label}
                    </div>
                  );
                })}
                {entries.length > 5 && (
                  <div className="text-[9px] text-[var(--tx-muted)]">+{entries.length - 5}</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Exported for tests
export { buildMonthGrid, TYPE_CHIP_CLS, THAI_MONTHS, WEEK_HEADER, SLOT_TO_JS_DAY };
