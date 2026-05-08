// ─── ScheduleEntryFormModal — Phase 13.2.7 ─────────────────────────────────
// Single shared modal for adding/editing all 3 schedule entry kinds:
//   1. recurring weekly shift (dayOfWeek + start + end)
//   2. daily override (date + type=work|halfday|holiday + optional start/end)
//   3. leave entry (date + type=leave|sick + note)
//
// Switches input fields based on `kind` prop. Reuses TIME_SLOTS dropdown
// + DateField + DAY_OF_WEEK_LABEL from validation module.

import { useEffect, useMemo, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import DateField from '../../DateField.jsx';
import RequiredAsterisk from '../../ui/RequiredAsterisk.jsx';
import {
  TIME_SLOTS,
  TYPE_LABEL,
  DAY_OF_WEEK_LABEL,
  validateStaffScheduleStrict,
  generateStaffScheduleId,
} from '../../../lib/staffScheduleValidation.js';
// V53 (2026-05-08, BS-12) — per-branch openHours filter the start/end pickers.
// For recurring entries (no date, only dayOfWeek), synthesize a Bangkok-anchor
// date so the helper can derive the monFri vs satSun bucket consistently.
import {
  getVisibleTimeSlotsForDate,
  isTimeOutsideOpenHours,
} from '../../../lib/scheduleFilterUtils.js';
import { useEffectiveClinicSettings } from '../../../lib/BranchContext.jsx';

// V53 — Jan 2026 anchor dates for each day-of-week (Bangkok). Used when
// kind === 'recurring' (no concrete date, only dayOfWeek 0-6).
const DOW_ANCHOR_DATE = {
  0: '2026-01-04', // Sun
  1: '2026-01-05', // Mon
  2: '2026-01-06', // Tue
  3: '2026-01-07', // Wed
  4: '2026-01-08', // Thu
  5: '2026-01-09', // Fri
  6: '2026-01-10', // Sat
};

const KIND_TITLE = {
  recurring: 'งานประจำสัปดาห์',
  override:  'งานรายวัน',
  leave:     'วันลา',
};

// Per-kind allowed types
const KIND_TYPES = {
  recurring: [{ value: 'recurring', label: 'ทำงานประจำสัปดาห์' }],
  override:  [
    { value: 'work',     label: TYPE_LABEL.work },
    { value: 'halfday',  label: TYPE_LABEL.halfday },
    { value: 'holiday',  label: TYPE_LABEL.holiday },
  ],
  leave: [
    { value: 'leave',  label: TYPE_LABEL.leave },
    { value: 'sick',   label: TYPE_LABEL.sick },
  ],
};

function defaultEntry(kind, staffId, staffName) {
  if (kind === 'recurring') {
    return { type: 'recurring', staffId, staffName, dayOfWeek: 1, startTime: '09:00', endTime: '17:00', date: '' };
  }
  if (kind === 'override') {
    return { type: 'work', staffId, staffName, date: '', dayOfWeek: null, startTime: '09:00', endTime: '17:00' };
  }
  return { type: 'leave', staffId, staffName, date: '', dayOfWeek: null, note: '', startTime: '', endTime: '' };
}

export default function ScheduleEntryFormModal({
  open,
  kind,           // 'recurring' | 'override' | 'leave'
  staffId,
  staffName = '',
  initialEntry,   // for edit mode
  onClose,
  onSave,         // async (entry) => Promise<void>
  branchId = '',
}) {
  const [form, setForm] = useState(() => initialEntry || defaultEntry(kind, staffId, staffName));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // V53 (BS-12) — branch-reactive merged settings + visible time-slots
  // filtered by branch's openHours for the active date / dayOfWeek bucket.
  // Modal is rendered without clinicSettings prop; useEffectiveClinicSettings
  // pulls branch.settings via context regardless.
  const cs = useEffectiveClinicSettings(undefined);
  const dateForBucket = (kind === 'recurring')
    ? (DOW_ANCHOR_DATE[Number(form.dayOfWeek)] || DOW_ANCHOR_DATE[1])
    : (form.date || DOW_ANCHOR_DATE[1]);
  const visibleTime = useMemo(
    () => getVisibleTimeSlotsForDate({
      dateISO: dateForBucket,
      mergedSettings: cs,
      allTimeSlots: TIME_SLOTS,
    }),
    [dateForBucket, cs?.openHoursMonFri, cs?.openHoursSatSun],
  );
  const visibleSlots = visibleTime.slots;

  useEffect(() => {
    if (open) {
      setForm(initialEntry || defaultEntry(kind, staffId, staffName));
      setError('');
    }
  }, [open, kind, staffId, staffName, initialEntry]);

  if (!open) return null;

  const allowedTypes = KIND_TYPES[kind] || [];
  const showTime = form.type === 'recurring' || form.type === 'work' || form.type === 'halfday';

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    setSaving(true);
    setError('');
    try {
      const id = form.id || generateStaffScheduleId();
      const payload = {
        ...form,
        id,
        scheduleId: id,
        staffId,
        staffName,
        branchId,
      };
      const fail = validateStaffScheduleStrict(payload);
      if (fail) { setError(fail[1]); setSaving(false); return; }
      await onSave?.(payload);
      onClose?.();
    } catch (e) {
      setError(e?.message || 'บันทึกล้มเหลว');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="w-full max-w-md rounded-2xl bg-[var(--bg-surface)] border border-[var(--bd)] shadow-2xl overflow-hidden"
        data-testid="schedule-entry-modal">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--bd)]">
          <h2 className="text-sm font-bold text-[var(--tx-heading)]">
            {form.id ? 'แก้ไข' : 'เพิ่ม'}{KIND_TITLE[kind] || ''}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--tx-muted)]"
            aria-label="ปิด">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {/* Type selector */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-[var(--tx-muted)] mb-1 block">
              ประเภท <RequiredAsterisk />
            </label>
            <select required value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-input)] border border-[var(--bd)] text-[var(--tx-primary)]"
              data-testid="schedule-form-type">
              {allowedTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* dayOfWeek (recurring only) */}
          {kind === 'recurring' && (
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-[var(--tx-muted)] mb-1 block">
                วันในสัปดาห์ <RequiredAsterisk />
              </label>
              <select required value={form.dayOfWeek ?? 1}
                onChange={(e) => setForm({ ...form, dayOfWeek: parseInt(e.target.value, 10) })}
                className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-input)] border border-[var(--bd)] text-[var(--tx-primary)]"
                data-testid="schedule-form-day-of-week">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <option key={d} value={d}>{DAY_OF_WEEK_LABEL[d]}</option>
                ))}
              </select>
            </div>
          )}

          {/* Date (override or leave) */}
          {kind !== 'recurring' && (
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-[var(--tx-muted)] mb-1 block">
                วันที่ <RequiredAsterisk />
              </label>
              <DateField value={form.date}
                onChange={(v) => setForm({ ...form, date: v })}
                locale="ce" placeholder="วัน/เดือน/ปี" />
            </div>
          )}

          {/* Time fields (recurring + work + halfday) */}
          {showTime && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-[var(--tx-muted)] mb-1 block">
                  เริ่ม <RequiredAsterisk />
                </label>
                <select required value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-input)] border border-[var(--bd)] text-[var(--tx-primary)]"
                  data-testid="schedule-form-start-time">
                  {/* V53 (BS-12) — filtered by branch openHours for selected date / dayOfWeek */}
                  {visibleSlots.map((t) => <option key={t} value={t}>{t}</option>)}
                  {form.startTime && !visibleSlots.includes(form.startTime) && (
                    <option key={`legacy-${form.startTime}`} value={form.startTime}>{form.startTime}</option>
                  )}
                </select>
                {isTimeOutsideOpenHours(form.startTime, dateForBucket, cs) && (
                  <p className="text-[10px] text-amber-400 mt-1" data-testid="schedule-modal-startTime-warning">
                    ⚠ นอกเวลาเปิดสาขา
                  </p>
                )}
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-[var(--tx-muted)] mb-1 block">
                  สิ้นสุด <RequiredAsterisk />
                </label>
                <select required value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-input)] border border-[var(--bd)] text-[var(--tx-primary)]"
                  data-testid="schedule-form-end-time">
                  {visibleSlots.map((t) => <option key={t} value={t}>{t}</option>)}
                  {form.endTime && !visibleSlots.includes(form.endTime) && (
                    <option key={`legacy-${form.endTime}`} value={form.endTime}>{form.endTime}</option>
                  )}
                </select>
              </div>
            </div>
          )}

          {/* Note (leave + override) */}
          {kind !== 'recurring' && (
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-[var(--tx-muted)] mb-1 block">
                หมายเหตุ
              </label>
              <input type="text" value={form.note || ''}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="เช่น ลาพักร้อน"
                className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-input)] border border-[var(--bd)] text-[var(--tx-primary)]" />
            </div>
          )}

          {error && (
            <div className="text-xs text-rose-400 px-3 py-2 rounded bg-rose-900/20 border border-rose-800">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)]">
              ยกเลิก
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50 inline-flex items-center gap-1.5"
              data-testid="schedule-form-submit">
              {saving && <Loader2 size={12} className="animate-spin" />}
              บันทึก
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
