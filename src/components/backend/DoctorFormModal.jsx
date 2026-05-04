// ─── Doctor Form Modal — Phase 12.1 CRUD ───────────────────────────────────
// Shared doctor/assistant form discriminated by position. Thai + English name
// pair (for documents). Optional Firebase account via /api/admin/users. DF
// fields (defaultDfGroupId/dfPaidType/hourlyIncome/minimumDfType) are inputs
// here. Phase 14.1 (2026-04-24) makes `defaultDfGroupId` required for both
// positions — picked from be_df_groups via listDfGroups().

import { useState, useCallback, useEffect } from 'react';
import MarketingFormShell from './MarketingFormShell.jsx';
import RequiredAsterisk from '../ui/RequiredAsterisk.jsx';
import { saveDoctor, listBranches, listPermissionGroups, listDfGroups } from '../../lib/scopedDataLayer.js';
import { createAdminUser, updateAdminUser } from '../../lib/adminUsersClient.js';
import {
  STATUS_OPTIONS, POSITION_OPTIONS, DF_PAID_TYPE_OPTIONS,
  validateDoctor, emptyDoctorForm, generateDoctorId,
} from '../../lib/doctorValidation.js';
import { scrollToField } from '../../lib/marketingUiUtils.js';

export default function DoctorFormModal({ doctor, onClose, onSaved, clinicSettings }) {
  const isEdit = !!doctor;
  const [form, setForm] = useState(() => doctor ? { ...emptyDoctorForm(), ...doctor, password: '' } : emptyDoctorForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [branches, setBranches] = useState([]);
  const [permissionGroups, setPermissionGroups] = useState([]);
  const [dfGroups, setDfGroups] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [bs, pg, dfg] = await Promise.all([listBranches(), listPermissionGroups(), listDfGroups()]);
        setBranches(bs);
        setPermissionGroups(pg);
        setDfGroups(dfg);
      } catch (e) {
        setError(e.message || 'โหลดข้อมูลอ้างอิงล้มเหลว');
      }
    })();
  }, []);

  const update = useCallback((patch) => setForm(prev => ({ ...prev, ...patch })), []);

  const toggleBranch = (bid) => {
    setForm(prev => {
      const ids = new Set(prev.branchIds || []);
      if (ids.has(bid)) ids.delete(bid); else ids.add(bid);
      return { ...prev, branchIds: Array.from(ids) };
    });
  };

  const handleSave = async () => {
    setError('');
    const fail = validateDoctor(form);
    if (fail) {
      const [field, msg] = fail;
      setError(msg);
      scrollToField(field);
      return;
    }

    setSaving(true);
    try {
      const id = doctor?.doctorId || doctor?.id || generateDoctorId(form.position);
      let firebaseUid = form.firebaseUid || '';
      const displayName = `${form.firstname} ${form.lastname}`.trim();

      if (form.email && form.password) {
        if (firebaseUid) {
          await updateAdminUser({ uid: firebaseUid, email: form.email, password: form.password, disabled: !!form.disabled, displayName });
        } else {
          const created = await createAdminUser({ email: form.email, password: form.password, displayName, disabled: !!form.disabled });
          firebaseUid = created?.uid || '';
        }
      } else if (firebaseUid && (form.disabled !== doctor?.disabled || form.email !== doctor?.email)) {
        await updateAdminUser({ uid: firebaseUid, email: form.email || undefined, disabled: !!form.disabled, displayName });
      }

      await saveDoctor(id, { ...form, firebaseUid, createdAt: doctor?.createdAt });
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
      titleCreate="เพิ่มแพทย์ / ผู้ช่วย"
      titleEdit="แก้ไขแพทย์ / ผู้ช่วย"
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      error={error}
      maxWidth="3xl"
      bodySpacing={4}
      clinicSettings={clinicSettings}
    >
      {/* Position (discriminator) + license */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div data-field="position">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">
            ตำแหน่ง <RequiredAsterisk />
          </label>
          <select value={form.position} onChange={(e) => update({ position: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]">
            {POSITION_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div data-field="professionalLicense">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">เลขใบประกอบวิชาชีพ</label>
          <input type="text" value={form.professionalLicense} onChange={(e) => update({ professionalLicense: e.target.value })}
            placeholder="ว.XXXXX"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
      </div>

      {/* Thai names */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div data-field="firstname">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">
            ชื่อ (ไทย) <RequiredAsterisk />
          </label>
          <input type="text" value={form.firstname} onChange={(e) => update({ firstname: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
        <div data-field="lastname">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">นามสกุล (ไทย)</label>
          <input type="text" value={form.lastname} onChange={(e) => update({ lastname: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
      </div>

      {/* English names */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div data-field="firstnameEn">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ชื่อ (EN) — ใช้บนเอกสาร</label>
          <input type="text" value={form.firstnameEn} onChange={(e) => update({ firstnameEn: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
        <div data-field="lastnameEn">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">นามสกุล (EN)</label>
          <input type="text" value={form.lastnameEn} onChange={(e) => update({ lastnameEn: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div data-field="nickname">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ชื่อเล่น</label>
          <input type="text" value={form.nickname} onChange={(e) => update({ nickname: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
        <div data-field="permissionGroupId">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">กลุ่มสิทธิ์</label>
          <select value={form.permissionGroupId} onChange={(e) => update({ permissionGroupId: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]">
            <option value="">— ไม่ระบุ —</option>
            {permissionGroups.map(g => (
              <option key={g.permissionGroupId || g.id} value={g.permissionGroupId || g.id}>{g.name || g.id}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Firebase account */}
      <div className="rounded-xl border border-[var(--bd)] p-3 bg-[var(--bg-hover)]">
        <p className="text-[11px] font-bold text-[var(--tx-muted)] mb-2 uppercase tracking-wider">บัญชี Firebase</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div data-field="email">
            <label className="block text-xs text-[var(--tx-muted)] mb-1">อีเมล</label>
            <input type="email" value={form.email} onChange={(e) => update({ email: e.target.value })}
              className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-base)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
          </div>
          <div data-field="password">
            <label className="block text-xs text-[var(--tx-muted)] mb-1">รหัสผ่าน {isEdit ? '(เว้นว่างถ้าไม่เปลี่ยน)' : ''}</label>
            <input type="password" value={form.password} onChange={(e) => update({ password: e.target.value })}
              placeholder="≥ 8 ตัว ต้องมี A/a/0"
              className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-base)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
          </div>
        </div>
      </div>

      {/* Branches */}
      <div data-field="branchIds">
        <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">สาขาที่ออกตรวจ</label>
        {branches.length === 0 ? (
          <p className="text-xs text-[var(--tx-muted)] italic">ยังไม่มีสาขา</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {branches.map(b => {
              const bid = b.branchId || b.id;
              const active = (form.branchIds || []).includes(bid);
              return (
                <button key={bid} type="button" onClick={() => toggleBranch(bid)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${active ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'bg-[var(--bg-hover)] text-[var(--tx-muted)] border-[var(--bd)] hover:text-[var(--accent)]'}`}>
                  {b.name || bid}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* DF — Phase 14.1: defaultDfGroupId required; hourly/paidType informational */}
      <div className="rounded-xl border border-dashed border-[var(--bd)] p-3">
        <p className="text-[11px] font-bold text-[var(--tx-muted)] mb-2 uppercase tracking-wider">ค่ามือ (DF)</p>
        <div data-field="defaultDfGroupId" className="mb-3">
          <label className="block text-xs text-[var(--tx-muted)] mb-1">
            กลุ่มค่ามือเริ่มต้น <RequiredAsterisk />
          </label>
          <select value={form.defaultDfGroupId || ''} onChange={(e) => update({ defaultDfGroupId: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]">
            <option value="">— เลือกกลุ่มค่ามือ —</option>
            {dfGroups.map(g => {
              const gid = g.groupId || g.id;
              return <option key={gid} value={gid}>{g.name || gid}</option>;
            })}
          </select>
          {dfGroups.length === 0 && (
            <p className="text-[10px] text-[var(--tx-muted)] mt-1 italic">ยังไม่มีกลุ่มค่ามือ — สร้างที่ "ข้อมูลพื้นฐาน → กลุ่มค่ามือ"</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div data-field="hourlyIncome">
            <label className="block text-xs text-[var(--tx-muted)] mb-1">รายได้รายชั่วโมง</label>
            <input type="number" step="0.01" min="0" value={form.hourlyIncome ?? ''} onChange={(e) => update({ hourlyIncome: e.target.value })}
              className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
          </div>
          <div data-field="dfPaidType">
            <label className="block text-xs text-[var(--tx-muted)] mb-1">ประเภทการจ่ายค่ามือ</label>
            <select value={form.dfPaidType || ''} onChange={(e) => update({ dfPaidType: e.target.value })}
              className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]">
              <option value="">— ไม่ระบุ —</option>
              {DF_PAID_TYPE_OPTIONS.filter(Boolean).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Phase 16.7-quinquies — salary fields */}
      <div className="grid grid-cols-2 gap-3">
        <div data-field="salary">
          <label className="block text-xs text-[var(--tx-muted)] mb-1">เงินเดือน (บาท/เดือน)</label>
          <input
            type="number"
            min="0"
            step="any"
            value={form.salary || ''}
            onChange={(e) => update({ salary: e.target.value })}
            placeholder="0"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
            data-field="salary"
          />
        </div>
        <div data-field="salaryDate">
          <label className="block text-xs text-[var(--tx-muted)] mb-1">วันที่จ่ายเงินเดือน (1-31)</label>
          <input
            type="number"
            min="1"
            max="31"
            step="1"
            value={form.salaryDate || ''}
            onChange={(e) => update({ salaryDate: e.target.value })}
            placeholder="25"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
            data-field="salaryDate"
          />
        </div>
      </div>

      {/* Colors */}
      <div className="grid grid-cols-2 gap-3">
        <div data-field="color">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">สีข้อความ</label>
          <input type="color" value={form.color || '#1f2937'} onChange={(e) => update({ color: e.target.value })}
            className="w-full h-10 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)]" />
        </div>
        <div data-field="backgroundColor">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">สีพื้นหลัง</label>
          <input type="color" value={form.backgroundColor || '#ffffff'} onChange={(e) => update({ backgroundColor: e.target.value })}
            className="w-full h-10 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)]" />
        </div>
      </div>

      {/* Flags */}
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-[var(--tx-primary)] cursor-pointer">
          <input type="checkbox" checked={!!form.hasSales} onChange={(e) => update({ hasSales: e.target.checked })}
            className="w-4 h-4 rounded accent-emerald-500" />
          ขายของได้
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--tx-primary)] cursor-pointer">
          <input type="checkbox" checked={!!form.disabled} onChange={(e) => update({ disabled: e.target.checked })}
            className="w-4 h-4 rounded accent-red-500" />
          ระงับใช้งาน (disable Firebase account)
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div data-field="status">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">สถานะ</label>
          <select value={form.status} onChange={(e) => update({ status: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]">
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div data-field="note">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">หมายเหตุ</label>
          <input type="text" value={form.note} onChange={(e) => update({ note: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
      </div>
    </MarketingFormShell>
  );
}
