// ─── SystemSettingsTab — Phase 16.3 (2026-04-29) ───────────────────────────
//
// Single full-tab page with 4 stacked sections:
//   1. Tab Visibility Overrides — admin overrides static tabPermissions defaults
//   2. Defaults                  — depositPercent / pointsPerBaht / dateRange
//   3. Feature Flags             — allowNegativeStock toggle (Q4-C semantic)
//   4. Audit Viewer              — last 50 system_config changes (read-only)
//
// Each editable section has its own "บันทึก" button — atomic per-section save
// via writeBatch (system_config + audit doc together).
//
// Permission gate: page accessible to anyone with `system_config_management`
// permission OR admin claim. Sidebar gate enforced via tabPermissions.js.
// Save action enforced at firestore.rules layer.
//
// V14 lock: every persisted field has a fallback to the schema default — no
// undefined leaves slip into setDoc.

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Settings, Save, AlertTriangle, RefreshCw, ShieldCheck, Eye, EyeOff,
  Loader2, CheckCircle2, X, Plus, AlertCircle, CalendarDays, Activity,
} from 'lucide-react';
import { useSystemConfig } from '../../hooks/useSystemConfig.js';
import { saveSystemConfig, __SYSTEM_CONFIG_VALID_DATE_RANGES as VALID_DATE_RANGES } from '../../lib/systemConfigClient.js';
import { TAB_PERMISSION_MAP } from '../../lib/tabPermissions.js';
import { ALL_PERMISSION_KEYS } from '../../lib/permissionGroupValidation.js';
import { useTabAccess, useHasPermission } from '../../hooks/useTabAccess.js';
import SystemConfigAuditPanel from './SystemConfigAuditPanel.jsx';
import { auth } from '../../firebase.js';

const DATE_RANGE_LABELS = {
  '7d':   '7 วันล่าสุด',
  '30d':  '30 วันล่าสุด',
  '90d':  '90 วันล่าสุด',
  '180d': '180 วันล่าสุด',
  '1y':   '1 ปีล่าสุด',
  'mtd':  'ตั้งแต่ต้นเดือนถึงวันนี้',
  'qtd':  'ตั้งแต่ต้นไตรมาสถึงวันนี้',
  'ytd':  'ตั้งแต่ต้นปีถึงวันนี้',
};

function SectionCard({ icon: Icon, title, subtitle, children, footer }) {
  return (
    <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--bd)] shadow-lg overflow-hidden mb-6">
      <div className="px-5 py-4 border-b border-[var(--bd)] flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[var(--bg-hover)] border border-[var(--bd)] flex items-center justify-center">
          <Icon size={18} className="text-[var(--tx-secondary)]" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-[var(--tx-heading)]">{title}</h3>
          {subtitle && <p className="text-xs text-[var(--tx-muted)] mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
      {footer && (
        <div className="px-5 py-3 bg-[var(--bg-hover)]/30 border-t border-[var(--bd)]">{footer}</div>
      )}
    </div>
  );
}

function StatusBanner({ kind, children }) {
  const palette = {
    success: 'bg-emerald-900/20 border-emerald-700/40 text-emerald-300',
    error:   'bg-rose-900/20    border-rose-700/40    text-rose-300',
    info:    'bg-sky-900/20     border-sky-700/40     text-sky-300',
  };
  return (
    <div className={`text-xs px-3 py-2 rounded-lg border ${palette[kind] || palette.info} flex items-center gap-2 mb-3`}>
      {kind === 'success' && <CheckCircle2 size={14} />}
      {kind === 'error' && <AlertCircle size={14} />}
      {kind === 'info' && <AlertTriangle size={14} />}
      <span>{children}</span>
    </div>
  );
}

function SaveButton({ onClick, saving, success, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving || disabled}
      className="px-4 py-2 rounded-lg text-xs font-bold bg-rose-700 text-white hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
    >
      {saving ? <Loader2 size={14} className="animate-spin" /> :
       success ? <CheckCircle2 size={14} /> :
       <Save size={14} />}
      {saving ? 'กำลังบันทึก...' : success ? 'บันทึกสำเร็จ' : 'บันทึก'}
    </button>
  );
}

// ─── Section 1: Tab Visibility Overrides ───────────────────────────────────
function TabOverridesSection({ config, executedBy }) {
  const [draft, setDraft] = useState(() => ({ ...(config.tabOverrides || {}) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [filter, setFilter] = useState('');

  // Refresh draft whenever the live config changes (other admin saved)
  useEffect(() => {
    setDraft({ ...(config.tabOverrides || {}) });
    setSuccess(false);
  }, [config.tabOverrides]);

  const allTabs = useMemo(() => Object.keys(TAB_PERMISSION_MAP).sort(), []);
  const filtered = useMemo(() => {
    if (!filter.trim()) return allTabs;
    const q = filter.toLowerCase();
    return allTabs.filter((id) => id.toLowerCase().includes(q));
  }, [allTabs, filter]);

  const updateOverride = (tabId, patch) => {
    setDraft((prev) => {
      const next = { ...prev };
      const current = next[tabId] || {};
      const merged = { ...current, ...patch };
      // Strip empty/false fields so the doc stays clean
      const cleaned = {};
      if (merged.hidden === true) cleaned.hidden = true;
      if (merged.adminOnly === true) cleaned.adminOnly = true;
      if (Array.isArray(merged.requires) && merged.requires.length > 0) {
        cleaned.requires = merged.requires.filter(Boolean);
      }
      if (Object.keys(cleaned).length === 0) {
        delete next[tabId];
      } else {
        next[tabId] = cleaned;
      }
      return next;
    });
    setSuccess(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      await saveSystemConfig({
        patch: { tabOverrides: draft },
        executedBy,
        reason: 'tab visibility overrides',
      });
      setSuccess(true);
    } catch (e) {
      setError(e?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      icon={Eye}
      title="ตั้งค่าการมองเห็นแท็บ"
      subtitle={`Override default permission gate per tab (${allTabs.length} tabs total). เปลี่ยน hidden / requires / adminOnly ตามที่ admin ต้องการ.`}
      footer={<div className="flex justify-end"><SaveButton onClick={handleSave} saving={saving} success={success} /></div>}
    >
      {error && <StatusBanner kind="error">{error}</StatusBanner>}
      {success && <StatusBanner kind="success">บันทึก tab overrides เรียบร้อย</StatusBanner>}

      <input
        type="text"
        placeholder="กรองด้วยชื่อ tab..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full px-3 py-2 mb-4 text-xs bg-[var(--bg-hover)] border border-[var(--bd)] rounded-lg text-[var(--tx-primary)]"
      />

      <div className="max-h-96 overflow-y-auto border border-[var(--bd)] rounded-lg">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[var(--bg-hover)] border-b border-[var(--bd)]">
            <tr>
              <th className="px-3 py-2 text-left font-bold">Tab ID</th>
              <th className="px-3 py-2 text-left font-bold">Default rule</th>
              <th className="px-3 py-2 text-center font-bold">ซ่อน</th>
              <th className="px-3 py-2 text-center font-bold">Admin only</th>
              <th className="px-3 py-2 text-center font-bold">เปลี่ยน</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((tabId) => {
              const staticGate = TAB_PERMISSION_MAP[tabId];
              const ov = draft[tabId] || {};
              const hasOverride = Object.keys(ov).length > 0;
              const defaultLabel = staticGate.adminOnly
                ? 'admin only'
                : (staticGate.requires || []).join(', ') || '(public)';
              return (
                <tr key={tabId} className="border-b border-[var(--bd)]/50 hover:bg-[var(--bg-hover)]/50">
                  <td className="px-3 py-2 font-mono">{tabId}</td>
                  <td className="px-3 py-2 text-[var(--tx-muted)] truncate max-w-xs" title={defaultLabel}>{defaultLabel}</td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={!!ov.hidden}
                      onChange={(e) => updateOverride(tabId, { hidden: e.target.checked })}
                      data-testid={`override-hidden-${tabId}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={!!ov.adminOnly}
                      onChange={(e) => updateOverride(tabId, { adminOnly: e.target.checked })}
                      data-testid={`override-adminonly-${tabId}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    {hasOverride && <span className="px-2 py-0.5 rounded-full bg-amber-900/40 border border-amber-700 text-[10px] text-amber-300 font-bold">เปลี่ยน</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--tx-muted)] mt-2">
        💡 <code>requires[]</code> override (เพิ่ม permission keys) ยังไม่อยู่ใน UI v1 — ใช้ Firestore admin หากต้องการ.
        Default columns โชว์ permission keys หรือ "admin only" ของแต่ละ tab.
      </p>
    </SectionCard>
  );
}

// ─── Section 2: Defaults ───────────────────────────────────────────────────
function DefaultsSection({ config, executedBy }) {
  const [draft, setDraft] = useState(config.defaults || {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setDraft(config.defaults || {});
    setSuccess(false);
  }, [config.defaults]);

  const update = (k, v) => { setDraft((prev) => ({ ...prev, [k]: v })); setSuccess(false); };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      await saveSystemConfig({
        patch: { defaults: draft },
        executedBy,
        reason: 'form/filter defaults',
      });
      setSuccess(true);
    } catch (e) {
      setError(e?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      icon={CalendarDays}
      title="ค่าเริ่มต้น (Defaults)"
      subtitle="ค่าที่ form/filter/report pickers ใช้เป็น initial value — admin override ผ่าน UI ตามต้องการ"
      footer={<div className="flex justify-end"><SaveButton onClick={handleSave} saving={saving} success={success} /></div>}
    >
      {error && <StatusBanner kind="error">{error}</StatusBanner>}
      {success && <StatusBanner kind="success">บันทึก defaults เรียบร้อย</StatusBanner>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">มัดจำ % เริ่มต้น</label>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={draft.depositPercent ?? 0}
            onChange={(e) => update('depositPercent', Number(e.target.value))}
            className="w-full px-3 py-2 text-xs bg-[var(--bg-hover)] border border-[var(--bd)] rounded-lg text-[var(--tx-primary)]"
            data-testid="default-deposit-percent"
          />
          <p className="text-[10px] text-[var(--tx-muted)] mt-1">0 = ไม่ auto-suggest. 1-100 = pre-fill ใน sale form</p>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">คะแนน/บาท เริ่มต้น</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={draft.pointsPerBaht ?? 0}
            onChange={(e) => update('pointsPerBaht', Number(e.target.value))}
            className="w-full px-3 py-2 text-xs bg-[var(--bg-hover)] border border-[var(--bd)] rounded-lg text-[var(--tx-primary)]"
            data-testid="default-points-per-baht"
          />
          <p className="text-[10px] text-[var(--tx-muted)] mt-1">0 = ปิด earning. เช่น 0.01 = 1% ของยอดขาย</p>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">ช่วงเวลา default ใน filter</label>
          <select
            value={draft.dateRange || '30d'}
            onChange={(e) => update('dateRange', e.target.value)}
            className="w-full px-3 py-2 text-xs bg-[var(--bg-hover)] border border-[var(--bd)] rounded-lg text-[var(--tx-primary)]"
            data-testid="default-date-range"
          >
            {VALID_DATE_RANGES.map((r) => (
              <option key={r} value={r}>{DATE_RANGE_LABELS[r] || r}</option>
            ))}
          </select>
          <p className="text-[10px] text-[var(--tx-muted)] mt-1">ใช้ใน Sale Report / Customer Report ฯลฯ</p>
        </div>
      </div>
    </SectionCard>
  );
}

// ─── Section 3: Feature Flags ──────────────────────────────────────────────
function FeatureFlagsSection({ config, executedBy }) {
  const [draft, setDraft] = useState(config.featureFlags || {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setDraft(config.featureFlags || {});
    setSuccess(false);
  }, [config.featureFlags]);

  const handleToggle = (k) => {
    setDraft((prev) => ({ ...prev, [k]: !prev[k] }));
    setSuccess(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      await saveSystemConfig({
        patch: { featureFlags: draft },
        executedBy,
        reason: 'feature flag toggle',
      });
      setSuccess(true);
    } catch (e) {
      setError(e?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const allowNeg = draft.allowNegativeStock !== false;
  return (
    <SectionCard
      icon={ShieldCheck}
      title="Feature Flags"
      subtitle="Toggle clinic-wide behaviour. ระวัง: ปิด flag จะกระทบ workflow ของทั้ง clinic"
      footer={<div className="flex justify-end"><SaveButton onClick={handleSave} saving={saving} success={success} /></div>}
    >
      {error && <StatusBanner kind="error">{error}</StatusBanner>}
      {success && <StatusBanner kind="success">บันทึก feature flags เรียบร้อย</StatusBanner>}

      <div className="border border-[var(--bd)] rounded-lg p-4 bg-[var(--bg-hover)]/30">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={allowNeg}
            onChange={() => handleToggle('allowNegativeStock')}
            className="mt-1"
            data-testid="flag-allow-negative-stock"
          />
          <div className="flex-1">
            <div className="text-sm font-bold text-[var(--tx-heading)]">อนุญาตการตัดสต็อคติดลบ (Phase 15.7)</div>
            <p className="text-xs text-[var(--tx-muted)] mt-1">
              เมื่อ <strong>เปิด</strong> (default): treatment/sale ที่ขาดสต็อค → push ไปที่ AUTO-NEG batch + auto-repay เมื่อมี import/transfer/withdrawal/adjust เข้ามา.
            </p>
            <p className="text-xs text-amber-400 mt-1">
              เมื่อ <strong>ปิด</strong>: ยังคง <strong>repay batch ติดลบเดิม</strong>ได้ตามปกติ แต่ <strong>treatment/sale ใหม่ที่จะตัดเกินคงเหลือจะถูก block</strong> + แสดง error "สต็อคไม่พอ" — admin ต้องนำเข้า stock ก่อนถึงจะตัดได้.
            </p>
          </div>
        </label>
      </div>
    </SectionCard>
  );
}

// ─── Main component ────────────────────────────────────────────────────────
export default function SystemSettingsTab() {
  const { config, loading } = useSystemConfig();
  const { isAdmin } = useTabAccess();
  const canManage = useHasPermission('system_config_management');
  const executedBy = useMemo(() => auth.currentUser?.email || auth.currentUser?.uid || 'unknown', []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center gap-2 text-sm text-[var(--tx-muted)]">
        <Loader2 size={16} className="animate-spin" /> กำลังโหลด system_config...
      </div>
    );
  }

  if (!isAdmin && !canManage) {
    return (
      <div className="p-8">
        <StatusBanner kind="error">
          คุณไม่มีสิทธิ์เข้าถึงหน้านี้ — ต้องการ permission "system_config_management" หรือสิทธิ์ admin
        </StatusBanner>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-5xl mx-auto" data-testid="system-settings-tab">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-full bg-rose-900/30 border border-rose-700 flex items-center justify-center">
          <Settings size={20} className="text-rose-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--tx-heading)]">ตั้งค่าระบบ</h2>
          <p className="text-xs text-[var(--tx-muted)]">Phase 16.3 — admin-only system config (per-tab visibility / defaults / feature flags / audit trail)</p>
        </div>
      </div>

      <TabOverridesSection config={config} executedBy={executedBy} />
      <DefaultsSection config={config} executedBy={executedBy} />
      <FeatureFlagsSection config={config} executedBy={executedBy} />

      <SectionCard
        icon={Activity}
        title="ประวัติการเปลี่ยนแปลง"
        subtitle="audit trail ของ system_config — เห็นใครเปลี่ยนอะไรเมื่อไหร่"
      >
        <SystemConfigAuditPanel />
      </SectionCard>

      <p className="text-[10px] text-[var(--tx-muted)] text-center mt-6">
        Permissions: เฉพาะ admin หรือ permission "system_config_management" เขียนได้.
        Schema version: {config._version || 0}.
        {config._updatedBy && <> Last updated by {config._updatedBy}.</>}
      </p>
    </div>
  );
}
