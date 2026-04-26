// ─── Holiday Form Modal — Phase 11.5 CRUD ──────────────────────────────────
// Two modes: specific (pick 1+ dates) or weekly (pick 0-6 day-of-week).
// Type toggle switches the form body. DateField for date picks; dates render
// as removable chips.

import { useState, useCallback } from 'react';
import { Plus, X, CalendarX } from 'lucide-react';
import MarketingFormShell from './MarketingFormShell.jsx';
import RequiredAsterisk from '../ui/RequiredAsterisk.jsx';
import DateField from '../DateField.jsx';
import { saveHoliday } from '../../lib/backendClient.js';
import {
  HOLIDAY_TYPES,
  STATUS_OPTIONS,
  NOTE_MAX_LENGTH,
  DAY_OF_WEEK_LABELS,
  MAX_SPECIFIC_DATES,
  validateHoliday,
  emptyHolidayForm,
} from '../../lib/holidayValidation.js';
import { generateMarketingId, scrollToField } from '../../lib/marketingUiUtils.js';

export default function HolidayFormModal({ holiday, onClose, onSaved, clinicSettings }) {
  const isEdit = !!holiday;
  const [form, setForm] = useState(() => {
    if (!holiday) return emptyHolidayForm('specific');
    const base = emptyHolidayForm(holiday.type || 'specific');
    return {
      ...base,
      ...holiday,
      dates: Array.isArray(holiday.dates) ? [...holiday.dates] : [],
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pendingDate, setPendingDate] = useState('');

  const update = useCallback((patch) => setForm(prev => ({ ...prev, ...patch })), []);

  const addDate = () => {
    if (!pendingDate) return;
    setForm(prev => {
      if (prev.dates.includes(pendingDate)) return prev;         // dedup
      if (prev.dates.length >= MAX_SPECIFIC_DATES) return prev;
      const next = [...prev.dates, pendingDate].sort();
      return { ...prev, dates: next };
    });
    setPendingDate('');
  };

  const removeDate = (d) => {
    setForm(prev => ({ ...prev, dates: prev.dates.filter(x => x !== d) }));
  };

  const handleSave = async () => {
    setError('');
    const fail = validateHoliday(form);
    if (fail) {
      const [field, msg] = fail;
      setError(msg);
      scrollToField(String(field).split('.')[0]);
      return;
    }

    setSaving(true);
    try {
      const id = holiday?.holidayId || holiday?.id || generateMarketingId('HOL');
      await saveHoliday(id, form);
      await onSaved?.();
    } catch (e) {
      setError(e.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <MarketingFormShell
      isEdit={isEdit}
      titleCreate="เพิ่มวันหยุด"
      titleEdit="แก้ไขวันหยุด"
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      error={error}
      maxWidth="xl"
      bodySpacing={4}
      clinicSettings={clinicSettings}
    >
      {/* type toggle */}
      <div data-field="type">
        <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">
          ประเภทวันหยุด <RequiredAsterisk />
        </label>
        <div className="grid grid-cols-2 gap-2">
          {HOLIDAY_TYPES.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => update({ type: t })}
              className={`px-3 py-2 rounded-lg text-sm font-bold border transition-all ${
                form.type === t
                  ? 'bg-orange-700/30 border-orange-600/60 text-orange-200'
                  : 'bg-[var(--bg-hover)] border-[var(--bd)] text-[var(--tx-muted)] hover:border-[var(--accent)]'
              }`}
            >
              {t === 'specific' ? 'วันที่เฉพาะ' : 'รายสัปดาห์'}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-[var(--tx-muted)] mt-1">
          {form.type === 'specific'
            ? 'เลือกวันหยุดเฉพาะ เช่น วันสงกรานต์ 13-16 เม.ย.'
            : 'ปิดทำการซ้ำทุกสัปดาห์ในวันที่เลือก (เช่น ปิดทุกวันอาทิตย์)'}
        </p>
      </div>

      {/* specific: dates chips */}
      {form.type === 'specific' && (
        <div data-field="dates">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">
            วันหยุด <RequiredAsterisk />
          </label>
          <div className="flex items-end gap-2 mb-2">
            <div className="flex-1">
              <DateField value={pendingDate} onChange={setPendingDate} locale="ce" size="md" />
            </div>
            <button
              type="button"
              onClick={addDate}
              disabled={!pendingDate || form.dates.length >= MAX_SPECIFIC_DATES}
              className="px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1 bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] hover:border-sky-700/40 hover:text-sky-400 disabled:opacity-40"
            >
              <Plus size={12} /> เพิ่มวัน
            </button>
          </div>
          <div className="flex items-center flex-wrap gap-1.5">
            {form.dates.length === 0 ? (
              <p className="text-[11px] text-[var(--tx-muted)] italic">ยังไม่มีวันที่ — เลือกวันแล้วกด "เพิ่มวัน"</p>
            ) : (
              form.dates.map(d => (
                <span key={d}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-rose-700/20 border border-rose-700/40 text-rose-300 text-xs font-semibold">
                  <CalendarX size={11} /> {d}
                  <button type="button" onClick={() => removeDate(d)}
                    aria-label={`ลบวัน ${d}`}
                    className="ml-1 hover:text-red-200">
                    <X size={11} />
                  </button>
                </span>
              ))
            )}
          </div>
          <p className="text-[10px] text-[var(--tx-muted)] mt-2">
            รวม {form.dates.length} / {MAX_SPECIFIC_DATES} วัน
          </p>
        </div>
      )}

      {/* weekly: day-of-week radio */}
      {form.type === 'weekly' && (
        <div data-field="dayOfWeek">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">
            ปิดทุกวัน <RequiredAsterisk />
          </label>
          <div className="grid grid-cols-7 gap-1.5">
            {DAY_OF_WEEK_LABELS.map((label, i) => (
              <button
                key={i}
                type="button"
                onClick={() => update({ dayOfWeek: i })}
                className={`px-1 py-2 rounded-lg text-xs font-bold border transition-all ${
                  Number(form.dayOfWeek) === i
                    ? 'bg-orange-700/30 border-orange-600/60 text-orange-200'
                    : 'bg-[var(--bg-hover)] border-[var(--bd)] text-[var(--tx-muted)] hover:border-[var(--accent)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* note */}
      <div data-field="note">
        <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">หมายเหตุ</label>
        <input
          type="text"
          value={form.note}
          onChange={(e) => update({ note: e.target.value })}
          maxLength={NOTE_MAX_LENGTH + 10}
          placeholder="เช่น วันสงกรานต์, ปิดปีใหม่"
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
        />
      </div>

      {/* status */}
      <div data-field="status">
        <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">สถานะ</label>
        <select
          value={form.status}
          onChange={(e) => update({ status: e.target.value })}
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]"
        >
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <p className="text-[10px] text-[var(--tx-muted)] mt-1">
          พักใช้งาน = ยกเว้นชั่วคราว (เช่น เปิดพิเศษวันสงกรานต์ปีนี้) — ยังอยู่ในระบบแต่ไม่บล็อกการจอง
        </p>
      </div>
    </MarketingFormShell>
  );
}
