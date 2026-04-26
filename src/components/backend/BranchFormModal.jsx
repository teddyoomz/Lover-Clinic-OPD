// ─── Branch Form Modal — Phase 11.6 CRUD ───────────────────────────────────
// Core 13 branch fields (identification / contact / tax / address / map /
// geo + bilingual name/address). Weekly schedule hours are deferred to
// Phase 13 where they pair with staff-schedule + AppointmentTab wiring.

import { useState, useCallback } from 'react';
import MarketingFormShell from './MarketingFormShell.jsx';
import RequiredAsterisk from '../ui/RequiredAsterisk.jsx';
import { saveBranch } from '../../lib/backendClient.js';
import {
  STATUS_OPTIONS,
  NAME_MAX_LENGTH,
  ADDRESS_MAX_LENGTH,
  validateBranch,
  emptyBranchForm,
} from '../../lib/branchValidation.js';
import { generateMarketingId, scrollToField } from '../../lib/marketingUiUtils.js';

export default function BranchFormModal({ branch, onClose, onSaved, clinicSettings }) {
  const isEdit = !!branch;
  const [form, setForm] = useState(() => branch ? { ...emptyBranchForm(), ...branch } : emptyBranchForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = useCallback((patch) => setForm(prev => ({ ...prev, ...patch })), []);

  const handleSave = async () => {
    setError('');
    const fail = validateBranch(form);
    if (fail) {
      const [field, msg] = fail;
      setError(msg);
      scrollToField(field);
      return;
    }

    setSaving(true);
    try {
      const id = branch?.branchId || branch?.id || generateMarketingId('BR');
      await saveBranch(id, form);
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
      titleCreate="เพิ่มสาขา"
      titleEdit="แก้ไขสาขา"
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      error={error}
      maxWidth="3xl"
      bodySpacing={4}
      clinicSettings={clinicSettings}
    >
      {/* Identification */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div data-field="name">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">
            ชื่อสาขา (ไทย) <RequiredAsterisk />
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="เช่น สาขาหลัก สุขุมวิท"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
        <div data-field="nameEn">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ชื่อสาขา (EN)</label>
          <input
            type="text"
            value={form.nameEn}
            onChange={(e) => update({ nameEn: e.target.value })}
            placeholder="Sukhumvit Main Branch"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>

      {/* Contact + default toggle */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div data-field="phone">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">
            เบอร์ติดต่อ <RequiredAsterisk />
          </label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => update({ phone: e.target.value })}
            placeholder="0812345678"
            inputMode="tel"
            pattern="0[0-9]{8,10}"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
        <div data-field="website">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">เว็บไซต์</label>
          <input
            type="url"
            value={form.website}
            onChange={(e) => update({ website: e.target.value })}
            placeholder="https://example.com"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>

      {/* Legal */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div data-field="licenseNo">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">เลขที่ใบอนุญาต</label>
          <input
            type="text"
            value={form.licenseNo}
            onChange={(e) => update({ licenseNo: e.target.value })}
            placeholder="เลขที่ใบอนุญาต"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
        <div data-field="taxId">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">เลขประจำตัวผู้เสียภาษี</label>
          <input
            type="text"
            value={form.taxId}
            onChange={(e) => update({ taxId: e.target.value })}
            placeholder="เลข 13 หลัก"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>

      {/* Address (TH + EN) */}
      <div data-field="address">
        <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ที่อยู่ (ไทย)</label>
        <textarea
          value={form.address}
          onChange={(e) => update({ address: e.target.value })}
          rows={2}
          placeholder="บ้านเลขที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด รหัสไปรษณีย์"
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)] resize-none"
        />
      </div>
      <div data-field="addressEn">
        <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ที่อยู่ (EN) — สำหรับออกเอกสารภาษาอังกฤษ</label>
        <textarea
          value={form.addressEn}
          onChange={(e) => update({ addressEn: e.target.value })}
          rows={2}
          placeholder="เว้นว่างเพื่อใช้ที่อยู่ภาษาไทยแปล"
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)] resize-none"
        />
      </div>

      {/* Map */}
      <div data-field="googleMapUrl">
        <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ลิงก์แผนที่ Google Map</label>
        <input
          type="url"
          value={form.googleMapUrl}
          onChange={(e) => update({ googleMapUrl: e.target.value })}
          placeholder="https://maps.app.goo.gl/..."
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div data-field="latitude">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ละติจูด (-90 ถึง 90)</label>
          <input
            type="number"
            step="any"
            min={-90}
            max={90}
            value={form.latitude}
            onChange={(e) => update({ latitude: e.target.value })}
            placeholder="13.7563"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
        <div data-field="longitude">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ลองจิจูด (-180 ถึง 180)</label>
          <input
            type="number"
            step="any"
            min={-180}
            max={180}
            value={form.longitude}
            onChange={(e) => update({ longitude: e.target.value })}
            placeholder="100.5018"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>

      {/* Our extensions: isDefault + status + note */}
      <div data-field="isDefault" className="flex items-center gap-2 p-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)]">
        <input
          type="checkbox"
          id="isDefault-check"
          checked={!!form.isDefault}
          onChange={(e) => update({ isDefault: e.target.checked })}
          className="w-4 h-4 rounded accent-amber-500"
        />
        <label htmlFor="isDefault-check" className="text-sm text-[var(--tx-primary)] cursor-pointer">
          สาขาหลัก — ใช้เป็น default เมื่อสร้างข้อมูลใหม่
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
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
        <div data-field="note">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">หมายเหตุ</label>
          <input
            type="text"
            value={form.note}
            onChange={(e) => update({ note: e.target.value })}
            placeholder="เช่น LINE ID, Facebook"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>

      <p className="text-[10px] text-[var(--tx-muted)] italic border-t border-[var(--bd)] pt-2">
        ตารางเวลาเปิด-ปิด 7 วัน เลื่อนไป Phase 13 (พร้อม staff schedule + booking integration)
      </p>
    </MarketingFormShell>
  );
}
