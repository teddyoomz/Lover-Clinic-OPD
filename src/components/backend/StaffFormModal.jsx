// ─── Staff Form Modal — Phase 12.1 CRUD ────────────────────────────────────
// Core staff fields + optional Firebase account creation via /api/admin/users.
// Password only required when creating a new Firebase account OR explicitly
// rotating an existing account's password.
//
// Per-branch multi-select + permission group ref (Phase 11.6 + 11.7 wiring).

import { useState, useCallback, useEffect } from 'react';
import MarketingFormShell from './MarketingFormShell.jsx';
import RequiredAsterisk from '../ui/RequiredAsterisk.jsx';
import { saveStaff, listBranches, listPermissionGroups, listDfGroups } from '../../lib/backendClient.js';
import { createAdminUser, updateAdminUser } from '../../lib/adminUsersClient.js';
import {
  STATUS_OPTIONS, POSITION_OPTIONS,
  validateStaff, emptyStaffForm, generateStaffId,
} from '../../lib/staffValidation.js';
import { scrollToField } from '../../lib/marketingUiUtils.js';

export default function StaffFormModal({ staff, onClose, onSaved, clinicSettings }) {
  const isEdit = !!staff;
  const [form, setForm] = useState(() => staff ? { ...emptyStaffForm(), ...staff, password: '' } : emptyStaffForm());
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
    const fail = validateStaff(form);
    if (fail) {
      const [field, msg] = fail;
      setError(msg);
      scrollToField(field);
      return;
    }

    setSaving(true);
    try {
      const id = staff?.staffId || staff?.id || generateStaffId();
      let firebaseUid = form.firebaseUid || '';

      // Create or update the Firebase Auth account if caller provided email + password.
      if (form.email && form.password) {
        if (firebaseUid) {
          await updateAdminUser({ uid: firebaseUid, email: form.email, password: form.password, disabled: !!form.disabled, displayName: `${form.firstname} ${form.lastname}`.trim() });
        } else {
          const created = await createAdminUser({ email: form.email, password: form.password, displayName: `${form.firstname} ${form.lastname}`.trim(), disabled: !!form.disabled });
          firebaseUid = created?.uid || '';
        }
      } else if (firebaseUid && (form.disabled !== staff?.disabled || form.email !== staff?.email)) {
        // Toggling disable or updating email without changing password is still a Firebase op.
        await updateAdminUser({ uid: firebaseUid, email: form.email || undefined, disabled: !!form.disabled, displayName: `${form.firstname} ${form.lastname}`.trim() });
      }

      await saveStaff(id, { ...form, firebaseUid, createdAt: staff?.createdAt });
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
      titleCreate="เพิ่มพนักงาน"
      titleEdit="แก้ไขพนักงาน"
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      error={error}
      maxWidth="3xl"
      bodySpacing={4}
      clinicSettings={clinicSettings}
    >
      {/* Identity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div data-field="firstname">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">
            ชื่อ <RequiredAsterisk />
          </label>
          <input type="text" value={form.firstname} onChange={(e) => update({ firstname: e.target.value })}
            placeholder="กรอกชื่อ"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
        <div data-field="lastname">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">นามสกุล</label>
          <input type="text" value={form.lastname} onChange={(e) => update({ lastname: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div data-field="nickname">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ชื่อเล่น</label>
          <input type="text" value={form.nickname} onChange={(e) => update({ nickname: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
        <div data-field="employeeCode">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">รหัสพนักงาน</label>
          <input type="text" value={form.employeeCode} onChange={(e) => update({ employeeCode: e.target.value })}
            placeholder="EMP-001"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
      </div>

      {/* Role + position */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div data-field="position">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ตำแหน่ง</label>
          <select value={form.position} onChange={(e) => update({ position: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]">
            <option value="">— เลือกตำแหน่ง —</option>
            {POSITION_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
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
        <p className="text-[11px] font-bold text-[var(--tx-muted)] mb-2 uppercase tracking-wider">บัญชี Firebase (อีเมล + รหัสผ่าน)</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div data-field="email">
            <label className="block text-xs text-[var(--tx-muted)] mb-1">อีเมล</label>
            <input type="email" value={form.email} onChange={(e) => update({ email: e.target.value })}
              placeholder="user@clinic.com"
              className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-base)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
          </div>
          <div data-field="password">
            <label className="block text-xs text-[var(--tx-muted)] mb-1">รหัสผ่าน {isEdit ? '(เว้นว่างถ้าไม่เปลี่ยน)' : ''}</label>
            <input type="password" value={form.password} onChange={(e) => update({ password: e.target.value })}
              placeholder="≥ 8 ตัว ต้องมี A/a/0"
              className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-base)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
          </div>
        </div>
        {isEdit && form.firebaseUid && (
          <p className="text-[10px] text-[var(--tx-muted)] mt-1">Firebase UID: <code>{form.firebaseUid}</code></p>
        )}
      </div>

      {/* DF group (optional on staff) — Phase 14.1 */}
      <div data-field="defaultDfGroupId">
        <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">กลุ่มค่ามือเริ่มต้น (ถ้ามี)</label>
        <select value={form.defaultDfGroupId || ''} onChange={(e) => update({ defaultDfGroupId: e.target.value })}
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]">
          <option value="">— ไม่ระบุ —</option>
          {dfGroups.map(g => {
            const gid = g.groupId || g.id;
            return <option key={gid} value={gid}>{g.name || gid}</option>;
          })}
        </select>
        <p className="text-[10px] text-[var(--tx-muted)] mt-1 italic">ใช้เมื่อพนักงานมีส่วนแบ่งค่ามือจากคอร์ส — ปล่อยว่างได้ถ้าไม่เกี่ยว</p>
      </div>

      {/* Branches */}
      <div data-field="branchIds">
        <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">สาขาที่เข้าถึง</label>
        {branches.length === 0 ? (
          <p className="text-xs text-[var(--tx-muted)] italic">ยังไม่มีสาขา — เพิ่มสาขาได้ที่ "สาขา"</p>
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
