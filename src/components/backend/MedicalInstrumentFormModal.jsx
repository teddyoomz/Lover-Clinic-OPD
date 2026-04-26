// ─── Medical Instrument Form Modal — Phase 11.4 CRUD ───────────────────────
// 6 ProClinic-parity fields + our extensions (status, note, maintenanceLog).
// Dates go through the shared DateField (iron-clad: no raw <input type="date">).
//
// maintenanceLog is a nested array. Add row = append blank entry. Each entry:
// date (DateField) + cost + note + performedBy. Delete row per entry.

import { useState, useCallback } from 'react';
import { Plus, Trash2, Wrench } from 'lucide-react';
import MarketingFormShell from './MarketingFormShell.jsx';
import RequiredAsterisk from '../ui/RequiredAsterisk.jsx';
import DateField from '../DateField.jsx';
import { saveMedicalInstrument } from '../../lib/backendClient.js';
import {
  STATUS_OPTIONS,
  NAME_MAX_LENGTH,
  CODE_MAX_LENGTH,
  MAX_LOG_ENTRIES,
  validateMedicalInstrument,
  emptyMedicalInstrumentForm,
} from '../../lib/medicalInstrumentValidation.js';
import { generateMarketingId, scrollToField } from '../../lib/marketingUiUtils.js';

export default function MedicalInstrumentFormModal({ instrument, onClose, onSaved, clinicSettings }) {
  const isEdit = !!instrument;
  const [form, setForm] = useState(() => {
    if (!instrument) return emptyMedicalInstrumentForm();
    return {
      ...emptyMedicalInstrumentForm(),
      ...instrument,
      costPrice: instrument.costPrice ?? '',
      maintenanceIntervalMonths: instrument.maintenanceIntervalMonths ?? '',
      maintenanceLog: Array.isArray(instrument.maintenanceLog) ? instrument.maintenanceLog : [],
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = useCallback((patch) => setForm(prev => ({ ...prev, ...patch })), []);

  const updateLog = (idx, patch) => {
    setForm(prev => ({
      ...prev,
      maintenanceLog: prev.maintenanceLog.map((e, i) => i === idx ? { ...e, ...patch } : e),
    }));
  };

  const addLogRow = () => {
    if (form.maintenanceLog.length >= MAX_LOG_ENTRIES) return;
    setForm(prev => ({
      ...prev,
      maintenanceLog: [...prev.maintenanceLog, { date: '', cost: '', note: '', performedBy: '' }],
    }));
  };

  const removeLogRow = (idx) => {
    setForm(prev => ({ ...prev, maintenanceLog: prev.maintenanceLog.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    setError('');
    const fail = validateMedicalInstrument(form);
    if (fail) {
      const [field, msg] = fail;
      setError(msg);
      scrollToField(String(field).split('.')[0]);
      return;
    }

    setSaving(true);
    try {
      const id = instrument?.instrumentId || instrument?.id || generateMarketingId('INST');
      await saveMedicalInstrument(id, form);
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
      titleCreate="สร้างเครื่องหัตถการ"
      titleEdit="แก้ไขเครื่องหัตถการ"
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      error={error}
      maxWidth="2xl"
      bodySpacing={4}
      clinicSettings={clinicSettings}
    >
      {/* name */}
      <div data-field="name">
        <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">
          ชื่อเครื่องหัตถการ <RequiredAsterisk />
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="เช่น Ultraformer III, Thermage FLX, HIFU"
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
        />
        <p className="text-[10px] text-[var(--tx-muted)] mt-1">{form.name.length} / {NAME_MAX_LENGTH}</p>
      </div>

      {/* code */}
      <div data-field="code">
        <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">รหัสเครื่อง</label>
        <input
          type="text"
          value={form.code}
          onChange={(e) => update({ code: e.target.value })}
          placeholder="เช่น U3-001"
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
        />
      </div>

      {/* costPrice */}
      <div data-field="costPrice">
        <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ราคาทุน (บาท)</label>
        <input
          type="number"
          min={0}
          value={form.costPrice}
          onChange={(e) => update({ costPrice: e.target.value })}
          placeholder="850000"
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
        />
      </div>

      {/* purchaseDate + maintenanceIntervalMonths side by side */}
      <div className="grid grid-cols-2 gap-3">
        <div data-field="purchaseDate">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">วันที่ซื้อ</label>
          <DateField value={form.purchaseDate} onChange={(v) => update({ purchaseDate: v })} locale="ce" size="md" />
        </div>
        <div data-field="maintenanceIntervalMonths">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">รอบบำรุง (เดือน)</label>
          <input
            type="number"
            min={0}
            step={1}
            value={form.maintenanceIntervalMonths}
            onChange={(e) => update({ maintenanceIntervalMonths: e.target.value })}
            placeholder="6"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>

      {/* nextMaintenanceDate */}
      <div data-field="nextMaintenanceDate">
        <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">วันนัดซ่อมบำรุงครั้งถัดไป</label>
        <DateField value={form.nextMaintenanceDate} onChange={(v) => update({ nextMaintenanceDate: v })} locale="ce" size="md" />
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
      </div>

      {/* note */}
      <div data-field="note">
        <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">บันทึกเพิ่มเติม</label>
        <textarea
          value={form.note}
          onChange={(e) => update({ note: e.target.value })}
          rows={2}
          placeholder="เช่น Serial, warranty, vendor"
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)] resize-none"
        />
      </div>

      {/* maintenanceLog */}
      <div data-field="maintenanceLog" className="border-t border-[var(--bd)] pt-4">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider">
            ประวัติการซ่อม ({form.maintenanceLog.length})
          </label>
          <button
            type="button"
            onClick={addLogRow}
            disabled={form.maintenanceLog.length >= MAX_LOG_ENTRIES}
            className="text-xs font-bold flex items-center gap-1 px-2 py-1 rounded bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] hover:border-sky-700/40 hover:text-sky-400 disabled:opacity-40"
          >
            <Plus size={12} /> เพิ่มประวัติ
          </button>
        </div>

        {form.maintenanceLog.length === 0 ? (
          <p className="text-[11px] text-[var(--tx-muted)] italic">ยังไม่มีประวัติการซ่อม</p>
        ) : (
          <div className="space-y-2">
            {form.maintenanceLog.map((e, i) => (
              <div key={i} className="p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--bd)] space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-[var(--tx-muted)] w-6">#{i + 1}</span>
                  <div className="flex-1">
                    <DateField value={e.date} onChange={(v) => updateLog(i, { date: v })} locale="ce" size="sm" />
                  </div>
                  <input
                    type="number"
                    min={0}
                    value={e.cost}
                    onChange={(ev) => updateLog(i, { cost: ev.target.value })}
                    placeholder="ค่าใช้จ่าย"
                    className="w-28 px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    type="button"
                    onClick={() => removeLogRow(i)}
                    aria-label={`ลบประวัติแถว ${i + 1}`}
                    className="flex-shrink-0 p-1.5 rounded text-[var(--tx-muted)] hover:text-red-400 hover:bg-red-900/20"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="flex items-center gap-2 pl-8">
                  <input
                    type="text"
                    value={e.note || ''}
                    onChange={(ev) => updateLog(i, { note: ev.target.value })}
                    placeholder="หมายเหตุ"
                    className="flex-1 px-2 py-1 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  <input
                    type="text"
                    value={e.performedBy || ''}
                    onChange={(ev) => updateLog(i, { performedBy: ev.target.value })}
                    placeholder="ผู้ดำเนินการ"
                    className="w-40 px-2 py-1 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MarketingFormShell>
  );
}
