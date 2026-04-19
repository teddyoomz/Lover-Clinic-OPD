// ─── Coupon Form Modal — Phase 9 Marketing (Firestore-only) ────────────────
// Per CLAUDE.md rule E: Backend ใช้ Firestore เท่านั้น — no broker/ProClinic
// coupling. Coupons are OUR own entities stored in be_coupons/{id}.
//
// Modal chrome (backdrop/header/footer/ESC) extracted to MarketingFormShell
// and id/scrollToField extracted to marketingUiUtils (AV10).

import { useState } from 'react';
import DateField from '../DateField.jsx';
import MarketingFormShell from './MarketingFormShell.jsx';
import { saveCoupon } from '../../lib/backendClient.js';
import { validateCoupon, emptyCouponForm, COUPON_BRANCHES } from '../../lib/couponValidation.js';
import { scrollToField, generateMarketingId } from '../../lib/marketingUiUtils.js';

export default function CouponFormModal({ coupon, onClose, onSaved, clinicSettings }) {
  const isEdit = !!coupon;
  const [form, setForm] = useState(() => ({ ...emptyCouponForm(), ...(coupon || {}) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const toggleBranch = (id) => {
    setForm(prev => {
      const has = (prev.branch_ids || []).map(String).includes(String(id));
      const next = has
        ? prev.branch_ids.filter(b => String(b) !== String(id))
        : [...(prev.branch_ids || []), id];
      return { ...prev, branch_ids: next };
    });
  };

  const handleSave = async () => {
    const err = validateCoupon(form);
    if (err) { setError(err[1]); scrollToField(err[0]); return; }

    setSaving(true); setError('');
    const payload = {
      ...form,
      discount: Number(form.discount) || 0,
      max_qty: Number(form.max_qty) || 0,
    };
    try {
      const id = isEdit ? (coupon.couponId || coupon.id) : generateMarketingId('COUP');
      await saveCoupon(id, {
        ...payload,
        couponId: id,
        createdAt: isEdit ? (coupon.createdAt || new Date().toISOString()) : new Date().toISOString(),
      });
      onSaved?.();
    } catch (e) { setError(e.message || 'บันทึกไม่สำเร็จ'); }
    finally { setSaving(false); }
  };

  return (
    <MarketingFormShell
      isEdit={isEdit}
      titleCreate="สร้างคูปองใหม่"
      titleEdit="แก้ไขคูปอง"
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      error={error}
      maxWidth="2xl"
      bodySpacing={4}
      clinicSettings={clinicSettings}
    >
      <div data-field="coupon_name">
        <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">
          ชื่อคูปอง <span className="text-red-500">*</span>
        </label>
        <input type="text" value={form.coupon_name} onChange={(e) => update('coupon_name', e.target.value)}
          placeholder="กรอกชื่อคูปอง"
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] focus:outline-none focus:border-[var(--accent)]" />
      </div>

      <div data-field="coupon_code">
        <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">
          โค้ดส่วนลด <span className="text-red-500">*</span>
        </label>
        <input type="text" value={form.coupon_code}
          onChange={(e) => update('coupon_code', e.target.value.toUpperCase())}
          placeholder="เช่น NEWYEAR2026" maxLength={32}
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] font-mono focus:outline-none focus:border-[var(--accent)]" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div data-field="discount">
          <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">
            ส่วนลด <span className="text-red-500">*</span>
          </label>
          <div className="flex items-stretch gap-0">
            <input type="number" min="0.01" step="0.01" value={form.discount}
              onChange={(e) => update('discount', e.target.value)} placeholder="0.00"
              className="flex-1 px-3 py-2 rounded-l-lg text-sm bg-[var(--bg-hover)] border border-r-0 border-[var(--bd)] focus:outline-none focus:border-[var(--accent)]" />
            <select value={form.discount_type} onChange={(e) => update('discount_type', e.target.value)}
              className="px-3 py-2 rounded-r-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] font-bold min-w-[70px]">
              <option value="percent">%</option>
              <option value="baht">บาท</option>
            </select>
          </div>
        </div>
        <div data-field="max_qty">
          <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">
            จำนวนใช้งานได้ <span className="text-red-500">*</span>
          </label>
          <input type="number" min="0" step="1" value={form.max_qty}
            onChange={(e) => update('max_qty', e.target.value)} placeholder="0"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input id="limit-per-user" type="checkbox" checked={form.is_limit_per_user}
          onChange={(e) => update('is_limit_per_user', e.target.checked)} />
        <label htmlFor="limit-per-user" className="text-sm cursor-pointer">จำกัดการใช้งานคนละ 1 ครั้ง</label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div data-field="start_date">
          <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">
            วันเริ่ม <span className="text-red-500">*</span>
          </label>
          <DateField value={form.start_date} onChange={(v) => update('start_date', v)}
            locale="ce" placeholder="เลือกวันเริ่ม" size="md" />
        </div>
        <div data-field="end_date">
          <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">
            วันสิ้นสุด <span className="text-red-500">*</span>
          </label>
          <DateField value={form.end_date} onChange={(v) => update('end_date', v)}
            locale="ce" placeholder="เลือกวันสิ้นสุด" size="md"
            min={form.start_date || undefined} />
        </div>
      </div>

      <div data-field="description">
        <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">รายละเอียด</label>
        <textarea value={form.description} onChange={(e) => update('description', e.target.value)}
          rows={2} placeholder="กรอกรายละเอียด"
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] focus:outline-none focus:border-[var(--accent)] resize-y" />
      </div>

      <div>
        <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-2">สาขาที่ใช้ได้ (เว้นว่าง = ทุกสาขา)</label>
        <div className="flex flex-wrap gap-2">
          {COUPON_BRANCHES.map(b => {
            const active = (form.branch_ids || []).map(String).includes(String(b.id));
            return (
              <label key={b.id}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all border ${
                  active
                    ? 'bg-[var(--accent)] text-white border-transparent'
                    : 'bg-[var(--bg-hover)] border-[var(--bd)] text-[var(--tx-primary)] hover:border-[var(--accent)]'
                }`}>
                <input type="checkbox" checked={active} onChange={() => toggleBranch(b.id)} className="hidden" />
                {b.name}
              </label>
            );
          })}
        </div>
      </div>
    </MarketingFormShell>
  );
}
