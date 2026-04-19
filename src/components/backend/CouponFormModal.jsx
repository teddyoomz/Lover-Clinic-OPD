// ─── Coupon Form Modal — Phase 9 Marketing ──────────────────────────────────
import { useState, useEffect, useRef } from 'react';
import { X, Save, Loader2, AlertCircle } from 'lucide-react';
import DateField from '../DateField.jsx';
import { createCoupon, updateCoupon } from '../../lib/brokerClient.js';
import { saveCoupon } from '../../lib/backendClient.js';
import { validateCoupon, emptyCouponForm, COUPON_BRANCHES } from '../../lib/couponValidation.js';
import { hexToRgb } from '../../utils.js';

function scrollToField(name) {
  if (typeof document === 'undefined') return;
  const el = document.querySelector(`[data-field="${name}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('ring-2', 'ring-red-500');
  setTimeout(() => el.classList.remove('ring-2', 'ring-red-500'), 3000);
  const input = el.querySelector('input, textarea, select');
  if (input) input.focus();
}

export default function CouponFormModal({ coupon, onClose, onSaved, clinicSettings, isDark }) {
  const isEdit = !!coupon;
  const [form, setForm] = useState(() => ({ ...emptyCouponForm(), ...(coupon || {}) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const closeBtnRef = useRef(null);

  const ac = clinicSettings?.accentColor || '#dc2626';
  const acRgb = hexToRgb(ac);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

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
      const r = isEdit
        ? await updateCoupon(coupon.proClinicId, payload)
        : await createCoupon(payload);
      if (!r?.success) throw new Error(r?.error || (isEdit ? 'อัพเดท ProClinic ล้มเหลว' : 'สร้างใน ProClinic ล้มเหลว'));
      const proClinicId = isEdit ? coupon.proClinicId : r.proClinicId;
      if (!proClinicId) throw new Error('ไม่ได้รับ proClinicId');

      await saveCoupon(proClinicId, {
        ...payload,
        proClinicId,
        createdAt: isEdit ? (coupon.createdAt || new Date().toISOString()) : new Date().toISOString(),
      });
      onSaved?.();
    } catch (e) {
      setError(e.message || 'บันทึกไม่สำเร็จ');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose?.(); }}>
      <div className="w-full max-w-2xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col bg-[var(--bg-surface)] border border-[var(--bd)]"
        style={{ boxShadow: `0 0 40px rgba(${acRgb},0.2)` }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--bd)]">
          <h2 className="text-lg font-black tracking-wider uppercase" style={{ color: ac }}>
            {isEdit ? 'แก้ไขคูปอง' : 'สร้างคูปองใหม่'}
          </h2>
          <button ref={closeBtnRef} onClick={() => !saving && onClose?.()} disabled={saving}
            className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-[var(--tx-primary)] disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div data-field="coupon_name">
            <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">
              ชื่อคูปอง <span className="text-red-500">*</span>
            </label>
            <input type="text" value={form.coupon_name}
              onChange={(e) => update('coupon_name', e.target.value)}
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
                  onChange={(e) => update('discount', e.target.value)}
                  placeholder="0.00"
                  className="flex-1 px-3 py-2 rounded-l-lg text-sm bg-[var(--bg-hover)] border border-r-0 border-[var(--bd)] focus:outline-none focus:border-[var(--accent)]" />
                <select value={form.discount_type}
                  onChange={(e) => update('discount_type', e.target.value)}
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
                onChange={(e) => update('max_qty', e.target.value)}
                placeholder="0"
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

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-900/30 border border-red-700/50 text-sm text-red-300">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--bd)]">
          <button onClick={() => !saving && onClose?.()} disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-[var(--bg-hover)] border border-[var(--bd)] disabled:opacity-50">
            ยกเลิก
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-2 disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, rgba(${acRgb},0.95), rgba(${acRgb},0.75))`, boxShadow: `0 0 15px rgba(${acRgb},0.4)` }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isEdit ? 'บันทึก' : 'สร้าง'}
          </button>
        </div>
      </div>
    </div>
  );
}
