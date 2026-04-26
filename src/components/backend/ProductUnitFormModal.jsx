// ─── Product Unit Group Form Modal — Phase 11.3 CRUD ───────────────────────
// Create/edit modal for `be_product_units`. Dynamic rows for the unit list.
// Matches ProClinic form structure: `product_unit_group_name` + `unit_name[]` +
// `unit_amount[]` (first row = smallest, amount=1, implicitly the base).
//
// Row 0 (smallest) is locked to amount=1 in the UI — user types only the name.
// Rows 1..N accept user-chosen amount (how many smallest-units per this unit).

import { useState, useCallback } from 'react';
import { Plus, Trash2, Scale } from 'lucide-react';
import MarketingFormShell from './MarketingFormShell.jsx';
import RequiredAsterisk from '../ui/RequiredAsterisk.jsx';
import { saveProductUnitGroup } from '../../lib/backendClient.js';
import {
  STATUS_OPTIONS,
  GROUP_NAME_MAX_LENGTH,
  UNIT_NAME_MAX_LENGTH,
  MAX_UNITS,
  validateProductUnitGroup,
  emptyProductUnitGroupForm,
} from '../../lib/productUnitValidation.js';
import { generateMarketingId, scrollToField } from '../../lib/marketingUiUtils.js';

export default function ProductUnitFormModal({ unitGroup, onClose, onSaved, clinicSettings }) {
  const isEdit = !!unitGroup;
  const [form, setForm] = useState(() => {
    if (!unitGroup) return emptyProductUnitGroupForm();
    // Merge defensively — older docs might lack `note` / `status` fields.
    return {
      ...emptyProductUnitGroupForm(),
      ...unitGroup,
      units: Array.isArray(unitGroup.units) && unitGroup.units.length > 0
        ? unitGroup.units.map((u, i) => ({ ...u, isBase: i === 0 }))
        : emptyProductUnitGroupForm().units,
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = useCallback((patch) => setForm(prev => ({ ...prev, ...patch })), []);

  const updateUnit = (idx, patch) => {
    setForm(prev => ({
      ...prev,
      units: prev.units.map((u, i) => i === idx ? { ...u, ...patch } : u),
    }));
  };

  const addUnitRow = () => {
    if (form.units.length >= MAX_UNITS) return;
    setForm(prev => ({
      ...prev,
      units: [...prev.units, { name: '', amount: 2, isBase: false }],
    }));
  };

  const removeUnitRow = (idx) => {
    // Can't remove the base (row 0).
    if (idx === 0) return;
    setForm(prev => ({ ...prev, units: prev.units.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    setError('');
    const fail = validateProductUnitGroup(form);
    if (fail) {
      const [field, msg] = fail;
      setError(msg);
      // Dot-path field names scroll to the nearest [data-field] ancestor.
      const top = String(field).split('.')[0];
      scrollToField(top);
      return;
    }

    setSaving(true);
    try {
      const id = unitGroup?.unitGroupId || unitGroup?.id || generateMarketingId('UNIT');
      await saveProductUnitGroup(id, form);
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
      titleCreate="สร้างกลุ่มหน่วย"
      titleEdit="แก้ไขกลุ่มหน่วย"
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      error={error}
      maxWidth="2xl"
      bodySpacing={4}
      clinicSettings={clinicSettings}
    >
      {/* groupName */}
      <div data-field="groupName">
        <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">
          ชื่อกลุ่มหน่วยสินค้า <RequiredAsterisk />
        </label>
        <input
          type="text"
          value={form.groupName}
          onChange={(e) => update({ groupName: e.target.value })}
          placeholder="เช่น ampoule, bottle, เม็ด"
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
        />
        <p className="text-[10px] text-[var(--tx-muted)] mt-1">{form.groupName.length} / {GROUP_NAME_MAX_LENGTH} ตัวอักษร</p>
      </div>

      {/* units — dynamic rows */}
      <div data-field="units">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider">
            หน่วยในกลุ่ม <RequiredAsterisk />
          </label>
          <button
            type="button"
            onClick={addUnitRow}
            disabled={form.units.length >= MAX_UNITS}
            className="text-xs font-bold flex items-center gap-1 px-2 py-1 rounded bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] hover:border-sky-700/40 hover:text-sky-400 transition-all disabled:opacity-40"
          >
            <Plus size={12} /> เพิ่มหน่วย
          </button>
        </div>
        <div className="space-y-2">
          {form.units.map((u, i) => {
            const isBase = i === 0;
            return (
              <div key={i}
                className="flex items-center gap-2 p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--bd)]">
                <span className={`flex-shrink-0 w-8 h-8 rounded flex items-center justify-center text-[10px] font-bold ${
                  isBase ? 'bg-emerald-700/30 text-emerald-300 border border-emerald-700/40' : 'bg-[var(--bg-hover)] text-[var(--tx-muted)] border border-[var(--bd)]'
                }`}>
                  {isBase ? 'BASE' : i + 1}
                </span>
                <input
                  type="text"
                  value={u.name}
                  onChange={(e) => updateUnit(i, { name: e.target.value })}
                  placeholder={isBase ? 'ชื่อหน่วยเล็กที่สุด (เช่น เข็ม)' : `ชื่อหน่วย (เช่น amp)`}
                  maxLength={UNIT_NAME_MAX_LENGTH + 10}
                  className="flex-1 min-w-0 px-3 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
                />
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={isBase ? 1 : u.amount}
                  readOnly={isBase}
                  onChange={(e) => updateUnit(i, { amount: Number(e.target.value) || 1 })}
                  title={isBase ? 'หน่วยฐาน = 1 (ล็อค)' : 'จำนวนต่อหน่วยเล็กที่สุด'}
                  className={`w-24 px-2 py-1.5 rounded text-sm text-center bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)] ${isBase ? 'opacity-60 cursor-not-allowed' : ''}`}
                />
                <span className="text-[10px] text-[var(--tx-muted)] w-16 text-right">
                  {isBase ? '(ฐาน)' : `× ${form.units[0]?.name || '?'}`}
                </span>
                <button
                  type="button"
                  onClick={() => removeUnitRow(i)}
                  disabled={isBase || form.units.length <= 1}
                  aria-label={`ลบหน่วยแถว ${i + 1}`}
                  className="flex-shrink-0 p-1.5 rounded text-[var(--tx-muted)] hover:text-red-400 hover:bg-red-900/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-[var(--tx-muted)] mt-2">
          แถวแรกคือ <span className="font-bold text-emerald-400">หน่วยเล็กที่สุด</span> (จำนวน = 1 — ล็อค) · แถวอื่นใส่จำนวนต่อหน่วยเล็กที่สุด เช่น 1 amp = 10 เข็ม
        </p>
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
          placeholder="เช่น ใช้กับสินค้าประเภทใด, ข้อควรระวังเรื่อง conversion"
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)] resize-none"
        />
      </div>
    </MarketingFormShell>
  );
}
