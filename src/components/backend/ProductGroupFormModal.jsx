// ─── Product Group Form Modal — Phase 11.2 CRUD ────────────────────────────
// Create/edit modal for `be_product_groups`. Uses the shared
// MarketingFormShell chrome (Rule C1) so header / ESC / backdrop / save-
// button / error banner land consistent with Phase 9 marketing forms.
//
// Fields:
//   - name              (text, required, ≤ 80)
//   - productType       (select, 4 options from PRODUCT_TYPES)
//   - status            (select, 2 options)
//   - note              (textarea, optional free-form)
//
// productIds[] is NOT edited here — it's wired in Phase 11.8 via StockTab
// product picker (add a group chip on each product → reverse-indexed).
//
// Iron-clad compliance:
//   E backend=Firestore ONLY: no brokerClient / no /api/proclinic
//   C2 security: ID via generateMarketingId (crypto-random) — same helper
//      used by Promotion/Coupon/Voucher, verified in marketingUiUtils.js
//   F Triangle: fields (name/productType) match ProClinic product-group intel

import { useState, useCallback } from 'react';
import MarketingFormShell from './MarketingFormShell.jsx';
import { saveProductGroup } from '../../lib/backendClient.js';
import {
  PRODUCT_TYPES,
  STATUS_OPTIONS,
  NAME_MAX_LENGTH,
  validateProductGroup,
  emptyProductGroupForm,
} from '../../lib/productGroupValidation.js';
import { generateMarketingId, scrollToField } from '../../lib/marketingUiUtils.js';

export default function ProductGroupFormModal({ productGroup, onClose, onSaved, clinicSettings }) {
  const isEdit = !!productGroup;
  const [form, setForm] = useState(() => productGroup ? { ...emptyProductGroupForm(), ...productGroup } : emptyProductGroupForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = useCallback((patch) => setForm(prev => ({ ...prev, ...patch })), []);

  const handleSave = async () => {
    setError('');
    const fail = validateProductGroup(form);
    if (fail) {
      const [field, msg] = fail;
      setError(msg);
      scrollToField(field);
      return;
    }

    setSaving(true);
    try {
      const id = productGroup?.groupId || productGroup?.id || generateMarketingId('GRP');
      await saveProductGroup(id, {
        ...form,
        name: String(form.name).trim(),
        note: String(form.note || '').trim(),
      });
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
      titleCreate="สร้างกลุ่มสินค้า"
      titleEdit="แก้ไขกลุ่มสินค้า"
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      error={error}
      maxWidth="xl"
      bodySpacing={4}
      clinicSettings={clinicSettings}
    >
      {/* name */}
      <div data-field="name">
        <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">
          ชื่อกลุ่มสินค้า <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => update({ name: e.target.value })}
          maxLength={NAME_MAX_LENGTH + 10 /* allow over-type, validate clamps */}
          placeholder="เช่น Botox, Filler, ยาฉีด"
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
        />
        <p className="text-[10px] text-[var(--tx-muted)] mt-1">{form.name.length} / {NAME_MAX_LENGTH} ตัวอักษร</p>
      </div>

      {/* productType */}
      <div data-field="productType">
        <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">
          ประเภทสินค้า <span className="text-red-400">*</span>
        </label>
        <select
          value={form.productType}
          onChange={(e) => update({ productType: e.target.value })}
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]"
        >
          {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <p className="text-[10px] text-[var(--tx-muted)] mt-1">
          ควบคุมว่า product ในกลุ่มนี้ถูก lookup ตอนขาย/เบิก/สต๊อคอย่างไร
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
          placeholder="เช่น เงื่อนไขการใช้กลุ่ม, รายการที่ควรรวมเข้ากลุ่มนี้"
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)] resize-none"
        />
      </div>

      {/* Deferred: productIds — linked products shown as chips (Phase 11.8 wiring) */}
      {isEdit && Array.isArray(form.productIds) && form.productIds.length > 0 && (
        <div className="text-[11px] text-[var(--tx-muted)] border-t border-[var(--bd)] pt-3">
          สินค้าที่ผูกกลุ่มนี้: <span className="font-bold text-[var(--tx-primary)]">{form.productIds.length}</span> รายการ
          <span className="ml-2 text-[10px] opacity-75">(แก้ไขจาก StockTab ใน Phase 11.8)</span>
        </div>
      )}
    </MarketingFormShell>
  );
}
