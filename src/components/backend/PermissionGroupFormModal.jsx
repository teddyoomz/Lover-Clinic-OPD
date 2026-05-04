// ─── Permission Group Form Modal — Phase 11.7 CRUD ─────────────────────────
// 130 permissions across 14 collapsible modules. Each module has a "ทั้งหมด"
// checkbox that cascades to its children. Global "ใช้งานทุกระบบ" toggle at
// the top mirrors ProClinic's `permission-all` field.

import { useState, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronRight, ShieldCheck } from 'lucide-react';
import MarketingFormShell from './MarketingFormShell.jsx';
import RequiredAsterisk from '../ui/RequiredAsterisk.jsx';
import { savePermissionGroup } from '../../lib/scopedDataLayer.js';
import {
  STATUS_OPTIONS,
  NAME_MAX_LENGTH,
  DESC_MAX_LENGTH,
  PERMISSION_MODULES,
  ALL_PERMISSION_KEYS,
  validatePermissionGroup,
  emptyPermissionGroupForm,
} from '../../lib/permissionGroupValidation.js';
import { generateMarketingId, scrollToField } from '../../lib/marketingUiUtils.js';

export default function PermissionGroupFormModal({ permissionGroup, onClose, onSaved, clinicSettings }) {
  const isEdit = !!permissionGroup;
  const [form, setForm] = useState(() => {
    if (!permissionGroup) return emptyPermissionGroupForm();
    return {
      ...emptyPermissionGroupForm(),
      ...permissionGroup,
      permissions: permissionGroup.permissions || {},
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [openModules, setOpenModules] = useState(() => {
    // Auto-expand modules with any granted permissions (to confirm existing config).
    const open = {};
    for (const m of PERMISSION_MODULES) {
      open[m.id] = (permissionGroup?.permissions || {}) &&
        m.items.some(i => (permissionGroup?.permissions || {})[i.key] === true);
    }
    return open;
  });

  const update = useCallback((patch) => setForm(prev => ({ ...prev, ...patch })), []);

  const toggleKey = (key) => {
    setForm(prev => ({
      ...prev,
      permissions: { ...prev.permissions, [key]: !prev.permissions[key] },
    }));
  };

  const toggleModule = (moduleId, nextValue) => {
    const module = PERMISSION_MODULES.find(m => m.id === moduleId);
    if (!module) return;
    setForm(prev => {
      const next = { ...prev.permissions };
      for (const it of module.items) next[it.key] = nextValue;
      return { ...prev, permissions: next };
    });
  };

  const toggleAll = (nextValue) => {
    setForm(prev => {
      const next = {};
      for (const k of ALL_PERMISSION_KEYS) next[k] = nextValue;
      return { ...prev, permissions: next };
    });
  };

  const allOn = useMemo(
    () => ALL_PERMISSION_KEYS.every(k => form.permissions[k] === true),
    [form.permissions],
  );

  const moduleState = useMemo(() => {
    const out = {};
    for (const m of PERMISSION_MODULES) {
      const total = m.items.length;
      const on = m.items.filter(i => form.permissions[i.key] === true).length;
      out[m.id] = { total, on, allOn: on === total, anyOn: on > 0 };
    }
    return out;
  }, [form.permissions]);

  const handleSave = async () => {
    setError('');
    const fail = validatePermissionGroup(form);
    if (fail) {
      const [field, msg] = fail;
      setError(msg);
      scrollToField(String(field).split('.')[0]);
      return;
    }

    setSaving(true);
    try {
      const id = permissionGroup?.permissionGroupId || permissionGroup?.id || generateMarketingId('ROLE');
      await savePermissionGroup(id, form);
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
      titleCreate="สร้างกลุ่มสิทธิ์"
      titleEdit="แก้ไขกลุ่มสิทธิ์"
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      error={error}
      maxWidth="3xl"
      bodySpacing={4}
      clinicSettings={clinicSettings}
    >
      {/* name + status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div data-field="name">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">
            ชื่อตำแหน่ง / บทบาท <RequiredAsterisk />
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="เช่น พนักงานต้อนรับ, แพทย์, ผู้ดูแลระบบ"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
          <p className="text-[10px] text-[var(--tx-muted)] mt-1">{form.name.length} / {NAME_MAX_LENGTH}</p>
        </div>
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
      </div>

      {/* description */}
      <div data-field="description">
        <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">คำอธิบาย</label>
        <textarea
          value={form.description}
          onChange={(e) => update({ description: e.target.value })}
          rows={2}
          maxLength={DESC_MAX_LENGTH + 10}
          placeholder="บทบาทนี้ทำหน้าที่อะไร, ข้อจำกัดที่ควรทราบ"
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)] resize-none"
        />
      </div>

      {/* Master toggle */}
      <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-700/15 border border-amber-600/40">
        <input
          type="checkbox"
          id="perm-all-check"
          checked={allOn}
          onChange={(e) => toggleAll(e.target.checked)}
          className="w-4 h-4 rounded accent-amber-500"
        />
        <label htmlFor="perm-all-check" className="text-sm font-bold text-amber-200 cursor-pointer">
          ใช้งานทุกระบบ (Admin full access)
        </label>
        <span className="ml-auto text-xs text-[var(--tx-muted)]">
          {ALL_PERMISSION_KEYS.filter(k => form.permissions[k] === true).length} / {ALL_PERMISSION_KEYS.length} สิทธิ์
        </span>
      </div>

      {/* Modules */}
      <div data-field="permissions" className="space-y-2">
        {PERMISSION_MODULES.map(m => {
          const state = moduleState[m.id];
          const isOpen = !!openModules[m.id];
          return (
            <div key={m.id} className="rounded-lg border border-[var(--bd)] bg-[var(--bg-card)]">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--bd)]">
                <button
                  type="button"
                  onClick={() => setOpenModules(prev => ({ ...prev, [m.id]: !prev[m.id] }))}
                  aria-expanded={isOpen}
                  aria-label={`เปิด/ปิดหัวข้อ ${m.label}`}
                  className="flex-shrink-0 text-[var(--tx-muted)] hover:text-[var(--tx-primary)]"
                >
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <input
                  type="checkbox"
                  id={`perm-mod-${m.id}`}
                  checked={state.allOn}
                  ref={(el) => { if (el) el.indeterminate = !state.allOn && state.anyOn; }}
                  onChange={(e) => toggleModule(m.id, e.target.checked)}
                  className="w-4 h-4 rounded accent-sky-500"
                />
                <label htmlFor={`perm-mod-${m.id}`} className="flex-1 text-sm font-bold text-[var(--tx-heading)] cursor-pointer">
                  {m.label}
                </label>
                <span className="text-[10px] font-semibold text-[var(--tx-muted)]">
                  {state.on} / {state.total}
                </span>
              </div>
              {isOpen && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 px-3 py-2">
                  {m.items.map(it => (
                    <label key={it.key}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--bg-hover)] cursor-pointer text-xs text-[var(--tx-primary)]"
                    >
                      <input
                        type="checkbox"
                        checked={form.permissions[it.key] === true}
                        onChange={() => toggleKey(it.key)}
                        className="w-3.5 h-3.5 rounded accent-sky-500"
                      />
                      <span className="flex-1 truncate">{it.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </MarketingFormShell>
  );
}
