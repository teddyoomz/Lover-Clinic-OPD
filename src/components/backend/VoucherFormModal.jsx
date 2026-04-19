// ─── Voucher Form Modal — Phase 9 Marketing ─────────────────────────────────
import { useState, useEffect, useRef } from 'react';
import { X, Save, Loader2, AlertCircle } from 'lucide-react';
import DateField from '../DateField.jsx';
import { createVoucher, updateVoucher } from '../../lib/brokerClient.js';
import { saveVoucher } from '../../lib/backendClient.js';
import { validateVoucher, emptyVoucherForm, VOUCHER_PLATFORMS } from '../../lib/voucherValidation.js';
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

export default function VoucherFormModal({ voucher, onClose, onSaved, clinicSettings, isDark }) {
  const isEdit = !!voucher;
  const [form, setForm] = useState(() => ({ ...emptyVoucherForm(), ...(voucher || {}) }));
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
      const r = isEdit ? await updateVoucher(voucher.proClinicId, payload) : await createVoucher(payload);
      if (!r?.success) throw new Error(r?.error || (isEdit ? 'อัพเดท ProClinic ล้มเหลว' : 'สร้างใน ProClinic ล้มเหลว'));
      const proClinicId = isEdit ? voucher.proClinicId : r.proClinicId;
      if (!proClinicId) throw new Error('ไม่ได้รับ proClinicId');
      await saveVoucher(proClinicId, {
        ...payload, proClinicId,
        createdAt: isEdit ? (voucher.createdAt || new Date().toISOString()) : new Date().toISOString(),
      });
      onSaved?.();
    } catch (e) { setError(e.message || 'บันทึกไม่สำเร็จ'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose?.(); }}>
      <div className="w-full max-w-2xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col bg-[var(--bg-surface)] border border-[var(--bd)]"
        style={{ boxShadow: `0 0 40px rgba(${acRgb},0.2)` }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--bd)]">
          <h2 className="text-lg font-black tracking-wider uppercase" style={{ color: ac }}>
            {isEdit ? 'แก้ไข Voucher' : 'สร้าง Voucher ใหม่'}
          </h2>
          <button ref={closeBtnRef} onClick={() => !saving && onClose?.()} disabled={saving}
            className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-[var(--tx-primary)] disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
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
              ชื่อ Voucher <span className="text-red-500">*</span>
            </label>
            <input type="text" value={form.voucher_name} onChange={(e) => update('voucher_name', e.target.value)}
              placeholder="กรอกชื่อ Voucher"
              className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] focus:outline-none focus:border-[var(--accent)]" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div data-field="sale_price">
              <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">
                ราคาขาย (Inc. VAT) <span className="text-red-500">*</span>
              </label>
              <input type="number" min="0" step="0.01" value={form.sale_price}
                onChange={(e) => update('sale_price', e.target.value)} placeholder="0.00"
                className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] focus:outline-none focus:border-[var(--accent)]" />
            </div>
            <div data-field="commission_percent">
              <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">
                % ค่าธรรมเนียม <span className="text-red-500">*</span>
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
