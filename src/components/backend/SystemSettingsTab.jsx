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
  Sparkles,
} from 'lucide-react';
import { useSystemConfig } from '../../hooks/useSystemConfig.js';
import { saveSystemConfig, __SYSTEM_CONFIG_VALID_DATE_RANGES as VALID_DATE_RANGES, V86_GLOW_DEFAULTS } from '../../lib/systemConfigClient.js';
import { TAB_PERMISSION_MAP } from '../../lib/tabPermissions.js';
import { ALL_PERMISSION_KEYS } from '../../lib/permissionGroupValidation.js';
import { useTabAccess, useHasPermission } from '../../hooks/useTabAccess.js';
import SystemConfigAuditPanel from './SystemConfigAuditPanel.jsx';
import { SectionCard, StatusBanner, SaveButton } from './SettingsPrimitives.jsx';
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

// SectionCard / StatusBanner / SaveButton → extracted to SettingsPrimitives.jsx
// (Rule C1, 2026-06-02 — shared with ScheduledTasksTab).

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

// ─── V86-followup-2 — Neon Glow Section (2026-05-18 EOD+10) ────────────────
// Admin tunes V86 universal red glow: 2 color pickers (border c1 + halo c2)
// with 4 preset dots each + custom hex input, 1 intensity slider 0-150%,
// enabled toggle, live preview card, Save/Reset/Cancel buttons.
//
// Live preview mechanism: local-state useEffect mirrors useV86GlowApply —
// sets document.documentElement CSS vars on every draft change so ALL cards
// across the page update immediately. Save persists to system_config.v86Glow
// + audit doc (via existing saveSystemConfig path with new validateV86Glow
// validator). Reset → defaults (no save). Cancel → revert to last-saved.

const V86_C1_PRESETS = ['#dc2626', '#3b82f6', '#10b981', '#a855f7']; // red default + blue/green/purple
const V86_C2_PRESETS = ['#ef4444', '#06b6d4', '#22c55e', '#ec4899']; // red-light default + cyan/green-light/pink

function NeonGlowSection({ config, executedBy }) {
  const [draft, setDraft] = useState(() => ({ ...V86_GLOW_DEFAULTS, ...(config.v86Glow || {}) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Sync local draft when remote config changes (e.g. another admin saved)
  useEffect(() => {
    setDraft({ ...V86_GLOW_DEFAULTS, ...(config.v86Glow || {}) });
    setSuccess(false);
  }, [config.v86Glow?.enabled, config.v86Glow?.c1, config.v86Glow?.c2, config.v86Glow?.intensityPercent]);

  // Live preview — apply local draft to CSS vars on every change
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (!draft.enabled) {
      root.style.setProperty('--neon-intensity', '0');
      return;
    }
    const hexToRgb = (hex) => {
      const h = (hex || '').replace('#', '');
      if (h.length !== 6) return '220, 38, 38';
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      if ([r, g, b].some(n => Number.isNaN(n))) return '220, 38, 38';
      return `${r}, ${g}, ${b}`;
    };
    root.style.setProperty('--neon-c1', hexToRgb(draft.c1));
    root.style.setProperty('--neon-c2', hexToRgb(draft.c2));
    root.style.setProperty('--neon-intensity', String(draft.intensityPercent / 100));
  }, [draft.enabled, draft.c1, draft.c2, draft.intensityPercent]);

  const handleHexInput = useCallback((field) => (e) => {
    const v = e.target.value;
    setDraft(prev => ({ ...prev, [field]: v.toLowerCase() }));
    setSuccess(false);
  }, []);

  const handleV86Save = useCallback(async () => {
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      await saveSystemConfig({
        patch: { v86Glow: draft },
        executedBy,
        reason: 'neon glow tune',
      });
      setSuccess(true);
    } catch (e) {
      setError(e?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }, [draft, executedBy]);

  const handleV86Reset = useCallback(() => {
    setDraft({ ...V86_GLOW_DEFAULTS });
    setSuccess(false);
  }, []);

  const handleV86Cancel = useCallback(() => {
    setDraft({ ...V86_GLOW_DEFAULTS, ...(config.v86Glow || {}) });
    setSuccess(false);
  }, [config.v86Glow]);

  return (
    <SectionCard
      icon={Sparkles}
      title="เอฟเฟกต์แสงเรือง (Neon Glow)"
      subtitle="ตั้งค่าสีและความสว่างของเรืองทั่วระบบ — ใช้ทั้ง Frontend และ Backend"
    >
      {error && <StatusBanner kind="error">{error}</StatusBanner>}
      {success && <StatusBanner kind="success">บันทึก neon glow เรียบร้อย</StatusBanner>}

      {/* Color section */}
      <div className="space-y-3 mb-4">
        <h4 className="text-sm font-bold text-[var(--tx-heading)]">สี (Color)</h4>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-[var(--tx-secondary)] min-w-[100px]">สีขอบ (border)</label>
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(draft.c1) ? draft.c1 : V86_GLOW_DEFAULTS.c1}
            onChange={(e) => setDraft(prev => ({ ...prev, c1: e.target.value.toLowerCase() }))}
            className="w-12 h-8 border border-[var(--bd)] rounded cursor-pointer bg-transparent"
            data-field="v86GlowC1"
          />
          <input
            type="text"
            value={draft.c1}
            onChange={handleHexInput('c1')}
            className="bg-[var(--bg-card)] border border-[var(--bd)] rounded px-2 py-1 text-xs font-mono w-24"
            maxLength={7}
          />
          <div className="flex gap-1.5">
            {V86_C1_PRESETS.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setDraft(prev => ({ ...prev, c1: p }))}
                className="w-7 h-7 rounded-full border border-[var(--bd)] cursor-pointer transition hover:scale-110"
                style={{ background: p }}
                title={p}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-[var(--tx-secondary)] min-w-[100px]">สี halo (glow)</label>
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(draft.c2) ? draft.c2 : V86_GLOW_DEFAULTS.c2}
            onChange={(e) => setDraft(prev => ({ ...prev, c2: e.target.value.toLowerCase() }))}
            className="w-12 h-8 border border-[var(--bd)] rounded cursor-pointer bg-transparent"
            data-field="v86GlowC2"
          />
          <input
            type="text"
            value={draft.c2}
            onChange={handleHexInput('c2')}
            className="bg-[var(--bg-card)] border border-[var(--bd)] rounded px-2 py-1 text-xs font-mono w-24"
            maxLength={7}
          />
          <div className="flex gap-1.5">
            {V86_C2_PRESETS.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setDraft(prev => ({ ...prev, c2: p }))}
                className="w-7 h-7 rounded-full border border-[var(--bd)] cursor-pointer transition hover:scale-110"
                style={{ background: p }}
                title={p}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Intensity slider */}
      <div className="space-y-3 mb-4 pt-4 border-t border-[var(--bd)]">
        <h4 className="text-sm font-bold text-[var(--tx-heading)]">ความสว่าง (Intensity)</h4>
        <div className="flex items-center gap-3">
          <label className="text-xs text-[var(--tx-secondary)] min-w-[100px]">ระดับ</label>
          <input
            type="range"
            min={0}
            max={150}
            step={5}
            value={draft.intensityPercent}
            onChange={(e) => setDraft(prev => ({ ...prev, intensityPercent: Number(e.target.value) }))}
            className="flex-1 accent-rose-500"
            data-field="v86GlowIntensity"
          />
          <span className="text-xs font-mono text-[var(--tx-primary)] min-w-[48px] text-right">{draft.intensityPercent}%</span>
        </div>
      </div>

      {/* Enabled toggle */}
      <div className="space-y-3 mb-4 pt-4 border-t border-[var(--bd)]">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.enabled !== false}
            onChange={(e) => setDraft(prev => ({ ...prev, enabled: e.target.checked }))}
            className="w-4 h-4 accent-rose-500"
            data-field="v86GlowEnabled"
          />
          <span className="text-sm text-[var(--tx-secondary)]">เปิดเอฟเฟกต์แสงเรือง (ปิดเพื่อกลับไปดูแบบ V85)</span>
        </label>
      </div>

      {/* Live preview */}
      <div className="pt-4 border-t border-[var(--bd)]">
        <h4 className="text-sm font-bold text-[var(--tx-heading)] mb-2">ตัวอย่าง Live Preview</h4>
        <div className="v86-glow-card bg-[var(--bg-card)] rounded-xl p-4">
          <div className="text-sm font-bold mb-1">ตัวอย่างการ์ด</div>
          <div className="text-xs text-[var(--tx-muted)]">เลื่อน slider / เปลี่ยนสี เพื่อดูผลแบบ live</div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-[var(--bd)]">
        <SaveButton onClick={handleV86Save} saving={saving} success={success} />
        <button
          type="button"
          onClick={handleV86Reset}
          className="px-4 py-2 rounded-lg text-xs font-bold bg-[var(--bg-hover)] hover:bg-[var(--bg-hover)] text-[var(--tx-secondary)] border border-[var(--bd)] transition"
        >
          รีเซ็ตเป็นค่าเริ่มต้น
        </button>
        <button
          type="button"
          onClick={handleV86Cancel}
          className="px-4 py-2 rounded-lg text-xs font-bold bg-[var(--bg-hover)] hover:bg-[var(--bg-hover)] text-[var(--tx-muted)] border border-[var(--bd)] transition"
        >
          ยกเลิก
        </button>
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
      <NeonGlowSection config={config} executedBy={executedBy} />

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
