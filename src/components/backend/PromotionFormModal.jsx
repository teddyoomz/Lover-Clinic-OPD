// ─── Promotion Form Modal — Phase 9 Marketing ──────────────────────────────
// 27-field form mirroring ProClinic /admin/promotion. Flow on submit:
// 1) brokerClient.createPromotion|updatePromotion → POST ProClinic
// 2) backendClient.savePromotion → write be_promotions + master_data mirror
//
// Courses/products sub-items + cover_image multipart push are deferred to
// a follow-up pass (9.1b) — UI leaves a "เพิ่มภายหลังในโหมดแก้ไข" note.

import { useState, useMemo, useRef, useEffect } from 'react';
import { X, Save, Loader2, AlertCircle, Info } from 'lucide-react';
import DateField from '../DateField.jsx';
import { createPromotion, updatePromotion } from '../../lib/brokerClient.js';
import { savePromotion } from '../../lib/backendClient.js';
import { validatePromotion, emptyPromotionForm } from '../../lib/promotionValidation.js';
import { hexToRgb } from '../../utils.js';

const USAGE_OPTIONS = [
  { v: 'clinic', t: 'ระดับคลินิก' },
  { v: 'branch', t: 'ระดับสาขา' },
];

const STATUS_OPTIONS = [
  { v: 'active', t: 'ใช้งาน' },
  { v: 'suspended', t: 'พักใช้งาน' },
];

const PROMOTION_TYPE_OPTIONS = [
  { v: 'fixed', t: 'ระบุคอร์สและจำนวนคอร์ส', d: 'คอร์ส/จำนวนคงที่' },
  { v: 'flexible', t: 'เลือกคอร์สตามจริง', d: 'ลูกค้าเลือกคอร์สได้' },
];

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

export default function PromotionFormModal({ promotion, onClose, onSaved, clinicSettings, isDark }) {
  const isEdit = !!promotion;
  const [form, setForm] = useState(() => ({ ...emptyPromotionForm(), ...(promotion || {}) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const closeBtnRef = useRef(null);

  const ac = clinicSettings?.accentColor || '#dc2626';
  const acRgb = hexToRgb(ac);

  // ESC-to-close accessibility
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  const update = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  // Auto-compute sale_price_incl_vat when VAT toggle or sale_price changes
  const computedVatPrice = useMemo(() => {
    const p = Number(form.sale_price) || 0;
    if (!form.is_vat_included) return p;
    return Math.round(p * 1.07 * 100) / 100;
  }, [form.sale_price, form.is_vat_included]);

  const handleSave = async () => {
    const err = validatePromotion(form);
    if (err) {
      setError(err[1]);
      scrollToField(err[0]);
      return;
    }

    setSaving(true);
    setError('');

    // Normalize numeric strings before sending
    const payload = {
      ...form,
      deposit_price: Number(form.deposit_price) || 0,
      sale_price: Number(form.sale_price) || 0,
      sale_price_incl_vat: Number(form.sale_price_incl_vat) || computedVatPrice,
      min_course_chosen_count: Number(form.min_course_chosen_count) || 1,
      max_course_chosen_count: Number(form.max_course_chosen_count) || 1,
      min_course_chosen_qty: Number(form.min_course_chosen_qty) || 1,
      max_course_chosen_qty: Number(form.max_course_chosen_qty) || 1,
    };

    try {
      // 1. Push to ProClinic
      const r = isEdit
        ? await updatePromotion(promotion.proClinicId, payload)
        : await createPromotion(payload);

      if (!r?.success) {
        throw new Error(r?.error || (isEdit ? 'อัพเดท ProClinic ล้มเหลว' : 'สร้างใน ProClinic ล้มเหลว'));
      }

      const proClinicId = isEdit ? promotion.proClinicId : r.proClinicId;
      if (!proClinicId) throw new Error('ไม่ได้รับ proClinicId กลับจาก ProClinic');

      // 2. Mirror to Firestore be_promotions (+ master_data/promotions/items)
      await savePromotion(proClinicId, {
        ...payload,
        proClinicId,
        createdAt: isEdit ? (promotion.createdAt || new Date().toISOString()) : new Date().toISOString(),
      });

      onSaved?.();
    } catch (e) {
      setError(e.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose?.(); }}>
      <div className="w-full max-w-3xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col bg-[var(--bg-surface)] border border-[var(--bd)]"
        style={{ boxShadow: `0 0 40px rgba(${acRgb},0.2)` }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--bd)]">
          <h2 className="text-lg font-black tracking-wider uppercase" style={{ color: ac }}>
            {isEdit ? 'แก้ไขโปรโมชัน' : 'สร้างโปรโมชันใหม่'}
          </h2>
          <button ref={closeBtnRef} onClick={() => !saving && onClose?.()} disabled={saving}
            className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-[var(--tx-primary)] transition-colors disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Section: ข้อมูลพื้นฐาน */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--tx-muted)]">ข้อมูลพื้นฐาน</h3>

            <div data-field="usage_type">
              <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">ระดับการใช้งาน</label>
              <div className="flex items-center gap-4">
                {USAGE_OPTIONS.map(opt => (
                  <label key={opt.v} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="usage_type" value={opt.v}
                      checked={form.usage_type === opt.v}
                      onChange={(e) => update('usage_type', e.target.value)} />
                    <span className="text-sm">{opt.t}</span>
                  </label>
                ))}
              </div>
            </div>

            <div data-field="promotion_name">
              <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">
                ชื่อโปรโมชัน <span className="text-red-500">*</span>
              </label>
              <input type="text" value={form.promotion_name}
                onChange={(e) => update('promotion_name', e.target.value)}
                placeholder="กรอกชื่อโปรโมชัน"
                className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div data-field="receipt_promotion_name">
              <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">ชื่อโปรโมชัน (แสดงในใบเสร็จ)</label>
              <input type="text" value={form.receipt_promotion_name}
                onChange={(e) => update('receipt_promotion_name', e.target.value)}
                placeholder="เว้นว่าง = ใช้ชื่อด้านบน"
                className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div data-field="promotion_code">
                <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">รหัสโปรโมชัน</label>
                <input type="text" value={form.promotion_code}
                  onChange={(e) => update('promotion_code', e.target.value)}
                  placeholder="กรอกรหัส"
                  className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div data-field="category_name">
                <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">หมวดหมู่</label>
                <input type="text" value={form.category_name}
                  onChange={(e) => update('category_name', e.target.value)}
                  placeholder="เช่น CHA01, picosure"
                  className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div data-field="procedure_type_name">
                <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">ประเภทหัตถการ</label>
                <input type="text" value={form.procedure_type_name}
                  onChange={(e) => update('procedure_type_name', e.target.value)}
                  placeholder="เช่น laser"
                  className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>
          </section>

          {/* Section: ราคา */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--tx-muted)]">ราคา</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div data-field="deposit_price">
                <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">ราคามัดจำ (บาท)</label>
                <input type="number" min="0" value={form.deposit_price}
                  onChange={(e) => update('deposit_price', e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div data-field="sale_price">
                <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">
                  ราคาขาย (บาท) <span className="text-red-500">*</span>
                </label>
                <input type="number" min="0" value={form.sale_price}
                  onChange={(e) => update('sale_price', e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input id="vat" type="checkbox" checked={form.is_vat_included}
                onChange={(e) => update('is_vat_included', e.target.checked)} />
              <label htmlFor="vat" className="text-sm text-[var(--tx-primary)] cursor-pointer">
                มีภาษีมูลค่าเพิ่ม (VAT 7%)
              </label>
              {form.is_vat_included && (
                <span className="text-xs text-[var(--tx-muted)] ml-auto">
                  Inc. VAT: <span className="font-mono font-bold text-[var(--tx-primary)]">{computedVatPrice.toLocaleString('th-TH')}</span> ฿
                </span>
              )}
            </div>
          </section>

          {/* Section: โหมด */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--tx-muted)]">โหมดโปรโมชัน</h3>

            <div data-field="promotion_type" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PROMOTION_TYPE_OPTIONS.map(opt => (
                <label key={opt.v}
                  className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-all ${
                    form.promotion_type === opt.v
                      ? 'border-[var(--accent)] bg-[var(--bg-hover)]'
                      : 'border-[var(--bd)] hover:border-[var(--accent)]'
                  }`}>
                  <input type="radio" name="promotion_type" value={opt.v}
                    checked={form.promotion_type === opt.v}
                    onChange={(e) => update('promotion_type', e.target.value)}
                    className="mt-1" />
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{opt.t}</div>
                    <div className="text-[11px] text-[var(--tx-muted)] mt-0.5">{opt.d}</div>
                  </div>
                </label>
              ))}
            </div>

            {form.promotion_type === 'flexible' && (
              <div className="pl-3 border-l-2 border-[var(--accent)] space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <div data-field="min_course_chosen_count">
                    <label className="block text-[11px] font-semibold text-[var(--tx-muted)] mb-1">จำนวนคอร์ส ต่ำสุด</label>
                    <input type="number" min="1" value={form.min_course_chosen_count}
                      onChange={(e) => update('min_course_chosen_count', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div data-field="max_course_chosen_count">
                    <label className="block text-[11px] font-semibold text-[var(--tx-muted)] mb-1">จำนวนคอร์ส สูงสุด</label>
                    <input type="number" min="1" value={form.max_course_chosen_count}
                      onChange={(e) => update('max_course_chosen_count', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div data-field="min_course_chosen_qty">
                    <label className="block text-[11px] font-semibold text-[var(--tx-muted)] mb-1">จำนวนครั้ง ต่ำสุด</label>
                    <input type="number" min="1" value={form.min_course_chosen_qty}
                      onChange={(e) => update('min_course_chosen_qty', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div data-field="max_course_chosen_qty">
                    <label className="block text-[11px] font-semibold text-[var(--tx-muted)] mb-1">จำนวนครั้ง สูงสุด</label>
                    <input type="number" min="1" value={form.max_course_chosen_qty}
                      onChange={(e) => update('max_course_chosen_qty', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Section: ช่วงเวลา */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--tx-muted)]">ช่วงเวลา</h3>

            <div className="flex items-center gap-2">
              <input id="has-period" type="checkbox" checked={form.has_promotion_period}
                onChange={(e) => update('has_promotion_period', e.target.checked)} />
              <label htmlFor="has-period" className="text-sm cursor-pointer">กำหนดช่วงเวลา</label>
            </div>

            {form.has_promotion_period && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div data-field="promotion_period_start">
                  <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">วันเริ่ม</label>
                  <DateField value={form.promotion_period_start}
                    onChange={(v) => update('promotion_period_start', v)}
                    locale="ce" placeholder="เลือกวันเริ่ม" size="md" />
                </div>
                <div data-field="promotion_period_end">
                  <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">วันสิ้นสุด</label>
                  <DateField value={form.promotion_period_end}
                    onChange={(v) => update('promotion_period_end', v)}
                    locale="ce" placeholder="เลือกวันสิ้นสุด" size="md"
                    min={form.promotion_period_start || undefined} />
                </div>
              </div>
            )}
          </section>

          {/* Section: การแสดงผล */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--tx-muted)]">การแสดงผล</h3>

            <div data-field="description">
              <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">รายละเอียด</label>
              <textarea value={form.description}
                onChange={(e) => update('description', e.target.value)}
                placeholder="กรอกรายละเอียดโปรโมชัน" rows={3}
                className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)] resize-y"
              />
            </div>

            <div data-field="status">
              <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">สถานะ</label>
              <div className="flex items-center gap-4">
                {STATUS_OPTIONS.map(opt => (
                  <label key={opt.v} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="status" value={opt.v}
                      checked={form.status === opt.v}
                      onChange={(e) => update('status', e.target.value)} />
                    <span className="text-sm">{opt.t}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input id="line-oa" type="checkbox" checked={form.enable_line_oa_display}
                onChange={(e) => update('enable_line_oa_display', e.target.checked)} />
              <label htmlFor="line-oa" className="text-sm cursor-pointer">แสดงผลใน Line OA</label>
            </div>

            {form.enable_line_oa_display && (
              <div className="pl-3 border-l-2 border-[var(--bd)] space-y-2">
                <div data-field="is_price_line_display">
                  <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">แสดงราคาใน Line OA</label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="is_price_line_display" checked={form.is_price_line_display === true}
                        onChange={() => update('is_price_line_display', true)} />
                      <span className="text-sm">แสดงผล</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="is_price_line_display" checked={form.is_price_line_display === false}
                        onChange={() => update('is_price_line_display', false)} />
                      <span className="text-sm">ไม่แสดงผล</span>
                    </label>
                  </div>
                </div>
                <div data-field="button_label">
                  <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">ชื่อปุ่ม</label>
                  <input type="text" value={form.button_label}
                    onChange={(e) => update('button_label', e.target.value)}
                    placeholder="เช่น จองเลย / สนใจ"
                    className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>
            )}
          </section>

          {/* Deferred features note */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-sky-900/20 border border-sky-800/40 text-xs text-sky-300">
            <Info size={14} className="flex-shrink-0 mt-0.5" />
            <span>
              รูปปก (cover image) + รายการคอร์ส/สินค้าในโปรโมชัน จะเพิ่มในเฟสถัดไป
              (v9.1b) — ตอนนี้สร้างโปรโมชันเปล่าได้ แล้วแก้ไขใน ProClinic เดิมสำหรับ sub-items.
            </span>
          </div>

          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-900/30 border border-red-700/50 text-sm text-red-300">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--bd)]">
          <button onClick={() => !saving && onClose?.()} disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] hover:border-[var(--tx-muted)] transition-all disabled:opacity-50">
            ยกเลิก
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-2 transition-all disabled:opacity-50"
            style={{
              background: `linear-gradient(135deg, rgba(${acRgb},0.95), rgba(${acRgb},0.75))`,
              boxShadow: `0 0 15px rgba(${acRgb},0.4)`,
            }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isEdit ? 'บันทึก' : 'สร้าง'}
          </button>
        </div>
      </div>
    </div>
  );
}
