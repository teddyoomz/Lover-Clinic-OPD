// ─── Voucher Form Modal — Phase 9 Marketing (Firestore-only) ───────────────
// Per CLAUDE.md rule E: Backend ใช้ Firestore เท่านั้น.
// Modal chrome extracted to MarketingFormShell (AV10).

import { useState } from 'react';
import DateField from '../DateField.jsx';
import MarketingFormShell from './MarketingFormShell.jsx';
import RequiredAsterisk from '../ui/RequiredAsterisk.jsx';
import { saveVoucher } from '../../lib/scopedDataLayer.js';
import { validateVoucher, emptyVoucherForm, VOUCHER_PLATFORMS } from '../../lib/voucherValidation.js';
import { scrollToField, generateMarketingId } from '../../lib/marketingUiUtils.js';

export default function VoucherFormModal({ voucher, onClose, onSaved, clinicSettings }) {
  const isEdit = !!voucher;
  const [form, setForm] = useState(() => ({ ...emptyVoucherForm(), ...(voucher || {}) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    const err = validateVoucher(form);
    if (err) { setError(err[1]); scrollToField(err[0]); return; }

    setSaving(true); setError('');
    const payload = {
      ...form,
      sale_price: Number(form.sale_price) || 0,
      commission_percent: Number(form.commission_percent) || 0,
    };
    try {
      const id = isEdit ? (voucher.voucherId || voucher.id) : generateMarketingId('VOUC');
      await saveVoucher(id, {
        ...payload, voucherId: id,
        createdAt: isEdit ? (voucher.createdAt || new Date().toISOString()) : new Date().toISOString(),
      });
      onSaved?.();
    } catch (e) { setError(e.message || 'บันทึกไม่สำเร็จ'); }
    finally { setSaving(false); }
  };

  return (
    <MarketingFormShell
      isEdit={isEdit}
      titleCreate="สร้าง Voucher ใหม่"
      titleEdit="แก้ไข Voucher"
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      error={error}
      maxWidth="2xl"
      bodySpacing={4}
      clinicSettings={clinicSettings}
    >
      <div data-field="usage_type">
        <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">ระดับการใช้งาน</label>
        <div className="flex items-center gap-4">
          {[{v:'clinic',t:'ระดับคลินิก'},{v:'branch',t:'ระดับสาขา'}].map(opt => (
            <label key={opt.v} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="v_usage_type" value={opt.v}
                checked={form.usage_type === opt.v}
                onChange={(e) => update('usage_type', e.target.value)} />
              <span className="text-sm">{opt.t}</span>
            </label>
          ))}
        </div>
      </div>

      <div data-field="voucher_name">
        <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">
          ชื่อ Voucher <RequiredAsterisk />
        </label>
        <input type="text" value={form.voucher_name} onChange={(e) => update('voucher_name', e.target.value)}
          placeholder="กรอกชื่อ Voucher"
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] focus:outline-none focus:border-[var(--accent)]" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div data-field="sale_price">
          <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">
            ราคาขาย (Inc. VAT) <RequiredAsterisk />
          </label>
          <input type="number" min="0" step="0.01" value={form.sale_price}
            onChange={(e) => update('sale_price', e.target.value)} placeholder="0.00"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
        <div data-field="commission_percent">
          <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">
            % ค่าธรรมเนียม <RequiredAsterisk />
          </label>
          <input type="number" min="0" max="100" step="0.01" value={form.commission_percent}
            onChange={(e) => update('commission_percent', e.target.value)} placeholder="0"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
      </div>

      <div data-field="platform">
        <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">Platform</label>
        <select value={form.platform} onChange={(e) => update('platform', e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] focus:outline-none focus:border-[var(--accent)]">
          <option value="">— ไม่ระบุ —</option>
          {VOUCHER_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <input id="has-period-v" type="checkbox" checked={form.has_period}
          onChange={(e) => update('has_period', e.target.checked)} />
        <label htmlFor="has-period-v" className="text-sm cursor-pointer">กำหนดช่วงเวลา</label>
      </div>

      {form.has_period && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div data-field="period_start">
            <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">วันเริ่ม</label>
            <DateField value={form.period_start} onChange={(v) => update('period_start', v)}
              locale="ce" placeholder="เลือกวันเริ่ม" size="md" />
          </div>
          <div data-field="period_end">
            <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">วันสิ้นสุด</label>
            <DateField value={form.period_end} onChange={(v) => update('period_end', v)}
              locale="ce" placeholder="เลือกวันสิ้นสุด" size="md"
              min={form.period_start || undefined} />
          </div>
        </div>
      )}

      <div data-field="description">
        <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">รายละเอียด</label>
        <textarea value={form.description} onChange={(e) => update('description', e.target.value)}
          rows={2} placeholder="กรอกรายละเอียด"
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] focus:outline-none focus:border-[var(--accent)] resize-y" />
      </div>

      <div data-field="status">
        <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">สถานะ</label>
        <div className="flex items-center gap-4">
          {[{v:'active',t:'ใช้งาน'},{v:'suspended',t:'พักใช้งาน'}].map(opt => (
            <label key={opt.v} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="v_status" value={opt.v}
                checked={form.status === opt.v}
                onChange={(e) => update('status', e.target.value)} />
              <span className="text-sm">{opt.t}</span>
            </label>
          ))}
        </div>
      </div>
    </MarketingFormShell>
  );
}
