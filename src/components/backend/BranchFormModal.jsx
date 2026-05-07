// ─── Branch Form Modal — Phase 11.6 CRUD ───────────────────────────────────
// Core 13 branch fields (identification / contact / tax / address / map /
// geo + bilingual name/address). Weekly schedule hours are deferred to
// Phase 13 where they pair with staff-schedule + AppointmentTab wiring.
//
// V51 (2026-05-08) — per-branch settings sub-object added (Spec #2 §6).
// 4 new sections after Map: settings.email + lineOaUrl, cooldown, openHours,
// chatHours. ClinicSettingsPanel post-deletion preserves only chain-level
// brand fields. Migration script v51-migrate-clinic-settings-to-branch.mjs
// flips per-branch settings on prod data.

import { useState, useCallback } from 'react';
import MarketingFormShell from './MarketingFormShell.jsx';
import RequiredAsterisk from '../ui/RequiredAsterisk.jsx';
import TimeSelect24 from '../ui/TimeSelect24.jsx';
import { saveBranch } from '../../lib/scopedDataLayer.js';
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
  const [form, setForm] = useState(() => {
    const base = emptyBranchForm();
    if (!branch) return base;
    // V51 — deep-merge settings sub-object so partial existing branches
    // (pre-V51 data without settings.*) get default values for new fields.
    const merged = { ...base, ...branch };
    const branchSettings = (branch.settings && typeof branch.settings === 'object') ? branch.settings : {};
    merged.settings = {
      ...base.settings,
      ...branchSettings,
      openHours: {
        ...base.settings.openHours,
        ...(branchSettings.openHours || {}),
        monFri: { ...base.settings.openHours.monFri, ...(branchSettings.openHours?.monFri || {}) },
        satSun: { ...base.settings.openHours.satSun, ...(branchSettings.openHours?.satSun || {}) },
      },
      chatHours: {
        ...base.settings.chatHours,
        ...(branchSettings.chatHours || {}),
        monFri: { ...base.settings.chatHours.monFri, ...(branchSettings.chatHours?.monFri || {}) },
        satSun: { ...base.settings.chatHours.satSun, ...(branchSettings.chatHours?.satSun || {}) },
      },
    };
    return merged;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = useCallback((patch) => setForm(prev => ({ ...prev, ...patch })), []);
  // V51 — settings sub-object update helpers
  const updateSettings = useCallback((patch) =>
    setForm(prev => ({ ...prev, settings: { ...prev.settings, ...patch } })), []);
  const updateOpenHours = useCallback((day, patch) =>
    setForm(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        openHours: {
          ...prev.settings.openHours,
          [day]: { ...prev.settings.openHours[day], ...patch },
        },
      },
    })), []);
  const updateChatAlwaysOn = useCallback((alwaysOn) =>
    setForm(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        chatHours: { ...prev.settings.chatHours, alwaysOn: !!alwaysOn },
      },
    })), []);
  const updateChatHours = useCallback((day, patch) =>
    setForm(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        chatHours: {
          ...prev.settings.chatHours,
          [day]: { ...prev.settings.chatHours[day], ...patch },
        },
      },
    })), []);

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
      // V51 Phase 3 cleanup — dual-write removed post-migration. form already
      // has settings populated correctly (UI binds directly to form.settings.X).
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
        <div data-field="settings.phone">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">
            เบอร์ติดต่อ <RequiredAsterisk />
          </label>
          <input
            type="tel"
            value={form.settings?.phone || ''}
            onChange={(e) => updateSettings({ phone: e.target.value })}
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
        <div data-field="settings.licenseNo">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">เลขที่ใบอนุญาต</label>
          <input
            type="text"
            value={form.settings?.licenseNo || ''}
            onChange={(e) => updateSettings({ licenseNo: e.target.value })}
            placeholder="เลขที่ใบอนุญาต"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
        <div data-field="settings.taxId">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">เลขประจำตัวผู้เสียภาษี</label>
          <input
            type="text"
            value={form.settings?.taxId || ''}
            onChange={(e) => updateSettings({ taxId: e.target.value })}
            placeholder="เลข 13 หลัก"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>

      {/* Address (TH + EN) — V51 Phase 3 cleanup: bound to settings sub-object */}
      <div data-field="settings.address">
        <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ที่อยู่ (ไทย)</label>
        <textarea
          value={form.settings?.address || ''}
          onChange={(e) => updateSettings({ address: e.target.value })}
          rows={2}
          placeholder="บ้านเลขที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด รหัสไปรษณีย์"
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)] resize-none"
        />
      </div>
      <div data-field="settings.addressEn">
        <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ที่อยู่ (EN) — สำหรับออกเอกสารภาษาอังกฤษ</label>
        <textarea
          value={form.settings?.addressEn || ''}
          onChange={(e) => updateSettings({ addressEn: e.target.value })}
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

      {/* V51 (2026-05-08) — Settings: Contact (additional) ─────────────── */}
      <div className="border-t border-[var(--bd)] pt-4 mt-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--tx-muted)] mb-3">
          ติดต่อเพิ่มเติม
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div data-field="settings.email">
            <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">อีเมล</label>
            <input
              type="email"
              value={form.settings?.email || ''}
              onChange={(e) => updateSettings({ email: e.target.value })}
              placeholder="contact@example.com"
              className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div data-field="settings.lineOaUrl">
            <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">LINE Official Account URL</label>
            <input
              type="url"
              value={form.settings?.lineOaUrl || ''}
              onChange={(e) => updateSettings({ lineOaUrl: e.target.value })}
              placeholder="https://lin.ee/xxxxx"
              className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>
      </div>

      {/* V51 — Settings: Patient Sync Cooldown ───────────────────────────── */}
      <div className="border-t border-[var(--bd)] pt-4 mt-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--tx-muted)] mb-3">
          ระยะเวลา cooldown ระหว่าง sync ข้อมูลผู้ป่วย
        </h3>
        <div data-field="settings.patientSyncCooldownMins" className="max-w-xs">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">
            cooldown (นาที)
          </label>
          <input
            type="number"
            min={0}
            max={99999}
            step={1}
            value={form.settings?.patientSyncCooldownMins ?? 10}
            onChange={(e) => updateSettings({ patientSyncCooldownMins: e.target.value === '' ? '' : Number(e.target.value) })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
          <p className="text-[10px] text-[var(--tx-muted)] mt-1">ค่าเริ่มต้น 10 นาที — ป้องกัน sync ซ้ำในเวลาสั้นๆ</p>
        </div>
      </div>

      {/* V51 — Settings: เวลาเปิด-ปิดคลินิก ─────────────────────────────── */}
      <div className="border-t border-[var(--bd)] pt-4 mt-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--tx-muted)] mb-3">
          เวลาเปิด-ปิดคลินิก
        </h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap" data-field="settings.openHours.monFri">
            <span className="text-sm font-medium text-[var(--tx-primary)] w-32">จันทร์ - ศุกร์</span>
            <TimeSelect24
              value={form.settings?.openHours?.monFri?.open || '10:00'}
              onChange={(v) => updateOpenHours('monFri', { open: v })}
            />
            <span className="text-sm text-[var(--tx-muted)]">ถึง</span>
            <TimeSelect24
              value={form.settings?.openHours?.monFri?.close || '20:30'}
              onChange={(v) => updateOpenHours('monFri', { close: v })}
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap" data-field="settings.openHours.satSun">
            <span className="text-sm font-medium text-[var(--tx-primary)] w-32">เสาร์ - อาทิตย์</span>
            <TimeSelect24
              value={form.settings?.openHours?.satSun?.open || '10:00'}
              onChange={(v) => updateOpenHours('satSun', { open: v })}
            />
            <span className="text-sm text-[var(--tx-muted)]">ถึง</span>
            <TimeSelect24
              value={form.settings?.openHours?.satSun?.close || '19:30'}
              onChange={(v) => updateOpenHours('satSun', { close: v })}
            />
          </div>
        </div>
      </div>

      {/* V51 — Settings: เวลาทำการระบบแชท ─────────────────────────────── */}
      <div className="border-t border-[var(--bd)] pt-4 mt-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--tx-muted)] mb-3">
          เวลาทำการระบบแชท
        </h3>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer" data-field="settings.chatHours.alwaysOn">
            <input
              type="checkbox"
              checked={!!form.settings?.chatHours?.alwaysOn}
              onChange={(e) => updateChatAlwaysOn(e.target.checked)}
              className="rounded border-[var(--bd)]"
            />
            <span className="text-[var(--tx-primary)]">เปิดตลอด 24 ชั่วโมง</span>
          </label>
          {!form.settings?.chatHours?.alwaysOn && (
            <div className="space-y-3 pl-6">
              <div className="flex items-center gap-3 flex-wrap" data-field="settings.chatHours.monFri">
                <span className="text-sm font-medium text-[var(--tx-primary)] w-32">จันทร์ - ศุกร์</span>
                <TimeSelect24
                  value={form.settings?.chatHours?.monFri?.open || '10:00'}
                  onChange={(v) => updateChatHours('monFri', { open: v })}
                />
                <span className="text-sm text-[var(--tx-muted)]">ถึง</span>
                <TimeSelect24
                  value={form.settings?.chatHours?.monFri?.close || '20:45'}
                  onChange={(v) => updateChatHours('monFri', { close: v })}
                />
              </div>
              <div className="flex items-center gap-3 flex-wrap" data-field="settings.chatHours.satSun">
                <span className="text-sm font-medium text-[var(--tx-primary)] w-32">เสาร์ - อาทิตย์</span>
                <TimeSelect24
                  value={form.settings?.chatHours?.satSun?.open || '10:00'}
                  onChange={(v) => updateChatHours('satSun', { open: v })}
                />
                <span className="text-sm text-[var(--tx-muted)]">ถึง</span>
                <TimeSelect24
                  value={form.settings?.chatHours?.satSun?.close || '19:45'}
                  onChange={(v) => updateChatHours('satSun', { close: v })}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Phase 17.2 (2026-05-05): isDefault checkbox stripped — all branches
          are equal peers. Newest-created branch is the implicit landing
          default (resolved in BranchContext.jsx). */}

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
        เวลาเปิด-ปิด/แชท ใช้ค่าเริ่มต้นเหมือน ProClinic (จ-ศ 10:00–20:30, ส-อา 10:00–19:30).
        ตารางเวลาแบบรายวัน 7 วัน เลื่อนไป Phase 13 (พร้อม staff schedule + booking integration).
      </p>
    </MarketingFormShell>
  );
}
