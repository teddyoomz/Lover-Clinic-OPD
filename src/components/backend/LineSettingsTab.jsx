// ─── LINE Settings Tab — Phase BS V3 (2026-05-04) ──────────────────────
// Per-branch LINE Official Account configuration. Each branch has its own
// channel + bot Q&A + linking config stored at:
//   artifacts/{appId}/public/data/be_line_configs/{branchId}
//
// User directive 2026-05-04: "ตั้งค่า line OA กับ คำของผูก Line ก็แยกข้อมูล
// กันนะ ใช้คนละ line กัน" (LINE OA settings + LINE link requests must be
// separate per branch — each branch uses different LINE channel).
//
// Pre-V3 (V32-tris-ter, 2026-04-26 → V33.x): single config at
//   clinic_settings/chat_config.line — shared across all branches. The
//   webhook + admin endpoints retain that location as a transition fallback;
//   this UI is fully migrated to be_line_configs/{branchId}.
//
// Sections:
//   1. ช่อง / Channel — channelId, channelSecret, channelAccessToken,
//      botBasicId, enabled toggle
//   2. ทดสอบการเชื่อมต่อ — push to LINE /v2/bot/info via /api/admin/line-test
//   3. Bot Q&A — bot enabled, intent keywords, max-list sizes,
//      help/welcome/error message overrides
//   4. ผูกบัญชีลูกค้า — admin-mediated id-link flow config
//   5. Webhook URL — display-only, copy button (paste into LINE Developers)
//
// All edits stage on a local form + commit on Save (single Firestore write).

import { useState, useEffect, useCallback } from 'react';
import { Save, Loader2, AlertCircle, CheckCircle2, Copy, Wifi, WifiOff, MessageCircle, QrCode, Settings as SettingsIcon, Eye, EyeOff } from 'lucide-react';
// V32-tris-ter-fix (2026-04-26) — direct browser → api.line.me fails CORS
// preflight (LINE doesn't send Access-Control-Allow-Origin). Proxy via
// admin-gated /api/admin/line-test endpoint instead.
import { testLineConnection } from '../../lib/lineTestClient.js';
import {
  getLineConfig,
  saveLineConfig,
  DEFAULT_LINE_CONFIG,
  validateLineConfig,
} from '../../lib/lineConfigClient.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';

export default function LineSettingsTab() {
  const { branchId, branches, isReady } = useSelectedBranch();
  const [form, setForm] = useState(() => ({ ...DEFAULT_LINE_CONFIG }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, message } | null
  const [copied, setCopied] = useState('');

  const branchName =
    branches?.find?.((b) => (b.branchId || b.id) === branchId)?.branchName ||
    branches?.find?.((b) => (b.branchId || b.id) === branchId)?.name ||
    branchId ||
    '(ไม่ระบุสาขา)';

  // Load config for the selected branch on mount + on branch switch.
  const reload = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError('');
    setSuccess('');
    setTestResult(null);
    try {
      const remote = await getLineConfig(branchId);
      // Merge with defaults so newly-introduced fields have safe values.
      // remote=null when this branch has never been configured — that's
      // expected for fresh branches; show defaults so admin can start.
      setForm({
        ...DEFAULT_LINE_CONFIG,
        ...(remote || {}),
        coursesKeywords:
          Array.isArray(remote?.coursesKeywords) && remote.coursesKeywords.length
            ? remote.coursesKeywords
            : DEFAULT_LINE_CONFIG.coursesKeywords,
        appointmentsKeywords:
          Array.isArray(remote?.appointmentsKeywords) && remote.appointmentsKeywords.length
            ? remote.appointmentsKeywords
            : DEFAULT_LINE_CONFIG.appointmentsKeywords,
      });
    } catch (e) {
      setError(e.message || 'โหลดการตั้งค่า LINE ล้มเหลว');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    if (isReady && branchId) reload();
  }, [isReady, branchId, reload]);

  const update = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const handleSave = async () => {
    if (!branchId) {
      setError('ยังไม่ได้เลือกสาขา — โปรดเลือกสาขาที่จะตั้งค่า LINE OA');
      return;
    }
    const validation = validateLineConfig(form);
    if (!validation.valid) {
      setError(validation.errors[0] || 'ข้อมูลไม่ถูกต้อง');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await saveLineConfig(branchId, form);
      setSuccess(`บันทึกการตั้งค่า LINE ของ "${branchName}" เรียบร้อย`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setError(e.message || 'บันทึกการตั้งค่าล้มเหลว');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Pass branchId to backend proxy so it reads the saved token from
      // be_line_configs/{branchId} (not the unsaved form value). Admin
      // must Save before testing.
      if (!form.channelAccessToken) {
        setTestResult({ ok: false, message: 'ยังไม่ได้กรอก Channel Access Token — โปรดใส่ + กดบันทึกก่อนทดสอบ' });
        return;
      }
      const result = await testLineConnection({ branchId });
      setTestResult(result);
    } catch (e) {
      setTestResult({ ok: false, message: e.message || 'เกิดข้อผิดพลาดขณะทดสอบ' });
    } finally {
      setTesting(false);
    }
  };

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhook/line`
    : '/api/webhook/line';

  const handleCopy = async (key, text) => {
    try {
      await navigator.clipboard.writeText(String(text || ''));
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    } catch { /* clipboard might be blocked */ }
  };

  const updateKeywordList = (key, csv) => {
    const arr = String(csv || '').split(',').map(s => s.trim()).filter(Boolean);
    update({ [key]: arr });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="line-settings-loading">
        <Loader2 size={20} className="animate-spin text-[var(--tx-muted)]" />
      </div>
    );
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-sm text-[var(--tx-primary)]';
  const labelCls = 'block text-xs text-[var(--tx-muted)] mb-1';

  return (
    <div className="space-y-4 max-w-3xl" data-testid="line-settings-tab" data-branch-id={branchId || ''}>
      <div className="flex items-center gap-2 mb-2">
        <MessageCircle size={20} className="text-[#06C755]" />
        <h2 className="text-2xl font-black text-[var(--tx-heading)]">ตั้งค่า LINE Official Account</h2>
      </div>

      {/* Phase BS V3 — branch-scope hint. Hides on single-branch deployments. */}
      <div className="px-3 py-2 rounded-lg bg-amber-900/15 border border-amber-700/30 text-amber-200 text-xs flex items-start gap-2"
        data-testid="line-settings-branch-hint">
        <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
        <div>
          การตั้งค่านี้ใช้กับสาขา <strong>{branchName}</strong> เท่านั้น —
          แต่ละสาขาใช้ LINE OA แยกกัน ต้องตั้งของสาขาอื่นแยกต่างหาก
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-900/20 border border-red-700/40 text-red-300 text-xs flex items-start gap-2" data-testid="line-settings-error">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}
      {success && (
        <div className="px-3 py-2 rounded-lg bg-emerald-900/20 border border-emerald-700/40 text-emerald-200 text-xs flex items-start gap-2" data-testid="line-settings-success">
          <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
          <div>{success}</div>
        </div>
      )}

      {/* ── Section 1: Channel credentials ─────────────────────────── */}
      <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SettingsIcon size={16} className="text-[var(--tx-muted)]" />
            <h3 className="text-sm font-bold text-[var(--tx-heading)]">ช่อง LINE / Channel Credentials</h3>
          </div>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={!!form.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
              data-field="enabled"
            />
            เปิดใช้งาน
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Channel ID</label>
            <input type="text" value={form.channelId || ''} onChange={(e) => update({ channelId: e.target.value })}
              data-field="channelId" className={inputCls} placeholder="123456789" />
          </div>
          <div>
            <label className={labelCls}>Bot Basic ID (@-handle)</label>
            <input type="text" value={form.botBasicId || ''} onChange={(e) => update({ botBasicId: e.target.value })}
              data-field="botBasicId" className={inputCls} placeholder="@123abcde" />
          </div>
        </div>
        <div>
          <label className={labelCls}>Channel Secret</label>
          <div className="relative">
            <input type={showSecret ? 'text' : 'password'} value={form.channelSecret || ''}
              onChange={(e) => update({ channelSecret: e.target.value })}
              data-field="channelSecret" className={`${inputCls} pr-10`} />
            <button type="button" onClick={() => setShowSecret(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--tx-muted)] hover:text-[var(--tx-primary)]">
              {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
        <div>
          <label className={labelCls}>Channel Access Token (long-lived)</label>
          <div className="relative">
            <input type={showToken ? 'text' : 'password'} value={form.channelAccessToken || ''}
              onChange={(e) => update({ channelAccessToken: e.target.value })}
              data-field="channelAccessToken" className={`${inputCls} pr-10`} />
            <button type="button" onClick={() => setShowToken(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--tx-muted)] hover:text-[var(--tx-primary)]">
              {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {/* Phase BS V3 — destination (bot user ID) populated by test-conn,
             used by webhook routing. Read-only for transparency. */}
        {form.destination && (
          <div>
            <label className={labelCls}>LINE Bot Destination ID (auto-populated on connection test — used for webhook routing)</label>
            <input type="text" value={form.destination} readOnly
              className={`${inputCls} opacity-70 cursor-default`}
              data-field="destination" />
          </div>
        )}

        {/* Webhook URL */}
        <div className="pt-2 border-t border-[var(--bd)]">
          <label className={labelCls}>Webhook URL (paste into LINE Developers Console)</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-2 py-1.5 rounded bg-[var(--bg-hover)] text-xs font-mono text-[var(--tx-primary)] truncate" data-testid="line-settings-webhook-url">
              {webhookUrl}
            </code>
            <button type="button" onClick={() => handleCopy('webhook', webhookUrl)}
              data-testid="line-settings-copy-webhook"
              className="text-xs flex items-center gap-1 px-2 py-1.5 rounded bg-[var(--bg-hover)] hover:bg-[var(--bg-card)]">
              <Copy size={12} /> {copied === 'webhook' ? 'คัดลอกแล้ว ✓' : 'คัดลอก'}
            </button>
          </div>
        </div>

        {/* Test connection */}
        <div className="pt-2 border-t border-[var(--bd)] flex items-center gap-2 flex-wrap">
          <button type="button" onClick={handleTestConnection} disabled={testing || !form.channelAccessToken}
            data-testid="line-settings-test-conn"
            className="text-xs flex items-center gap-1 px-3 py-1.5 rounded font-bold bg-sky-700 text-white disabled:opacity-60 disabled:cursor-not-allowed">
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
            {testing ? 'กำลังทดสอบ...' : 'ทดสอบการเชื่อมต่อ'}
          </button>
          {testResult && (
            <div className={`text-xs flex items-center gap-1 px-2 py-1 rounded ${testResult.ok ? 'bg-emerald-900/20 text-emerald-300' : 'bg-red-900/20 text-red-300'}`}
              data-testid={testResult.ok ? 'line-settings-test-ok' : 'line-settings-test-fail'}>
              {testResult.ok ? <CheckCircle2 size={12} /> : <WifiOff size={12} />}
              {testResult.message}
            </div>
          )}
        </div>
      </div>

      {/* ── Section 2: Bot Q&A behavior ─────────────────────────────── */}
      <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle size={16} className="text-[var(--tx-muted)]" />
            <h3 className="text-sm font-bold text-[var(--tx-heading)]">บอทตอบอัตโนมัติ (Q&amp;A Bot)</h3>
          </div>
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={!!form.botEnabled}
              onChange={(e) => update({ botEnabled: e.target.checked })}
              data-field="botEnabled" />
            เปิดบอท
          </label>
        </div>
        <div>
          <label className={labelCls}>คำที่ทำให้บอทตอบ "คอร์สคงเหลือ" (คั่นด้วย ,)</label>
          <input type="text" value={(form.coursesKeywords || []).join(', ')}
            onChange={(e) => updateKeywordList('coursesKeywords', e.target.value)}
            data-field="coursesKeywords" className={inputCls} placeholder="คอร์ส, courses, เหลือ" />
        </div>
        <div>
          <label className={labelCls}>คำที่ทำให้บอทตอบ "วันนัดหมาย" (คั่นด้วย ,)</label>
          <input type="text" value={(form.appointmentsKeywords || []).join(', ')}
            onChange={(e) => updateKeywordList('appointmentsKeywords', e.target.value)}
            data-field="appointmentsKeywords" className={inputCls} placeholder="นัด, appointment, วันนัด" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>จำนวนคอร์สสูงสุดในข้อความตอบ (1-100)</label>
            <input type="number" min={1} max={100} value={form.maxCoursesInReply}
              onChange={(e) => update({ maxCoursesInReply: e.target.value })}
              data-field="maxCoursesInReply" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>จำนวนนัดสูงสุดในข้อความตอบ (1-100)</label>
            <input type="number" min={1} max={100} value={form.maxAppointmentsInReply}
              onChange={(e) => update({ maxAppointmentsInReply: e.target.value })}
              data-field="maxAppointmentsInReply" className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>ข้อความช่วยเหลือ (ปล่อยว่าง = ใช้ค่าเริ่มต้น)</label>
          <textarea rows={3} value={form.helpMessage || ''}
            onChange={(e) => update({ helpMessage: e.target.value })}
            data-field="helpMessage" className={inputCls}
            placeholder='ส่งคำว่า "คอร์ส" เพื่อดูคอร์ส หรือ "นัด" เพื่อดูนัดหมาย' />
        </div>
        <div>
          <label className={labelCls}>ข้อความเมื่อยังไม่ได้ผูกบัญชี</label>
          <textarea rows={2} value={form.notLinkedMessage || ''}
            onChange={(e) => update({ notLinkedMessage: e.target.value })}
            data-field="notLinkedMessage" className={inputCls}
            placeholder="บัญชี LINE นี้ยังไม่ได้ผูกกับลูกค้าในระบบ — โปรดติดต่อคลินิก" />
        </div>
      </div>

      {/* ── Section 3: Customer Linking ─────────────────────────────── */}
      <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <QrCode size={16} className="text-[var(--tx-muted)]" />
          <h3 className="text-sm font-bold text-[var(--tx-heading)]">ผูกบัญชีลูกค้า (QR Linking)</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>อายุของ token / QR (นาที — สูงสุด 7 วัน = 10080)</label>
            <input type="number" min={1} max={10080} value={form.tokenTtlMinutes}
              onChange={(e) => update({ tokenTtlMinutes: e.target.value })}
              data-field="tokenTtlMinutes" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>เมื่อ LINE userId นี้ผูกกับลูกค้าอื่นอยู่แล้ว</label>
            <select value={form.alreadyLinkedRule}
              onChange={(e) => update({ alreadyLinkedRule: e.target.value })}
              data-field="alreadyLinkedRule" className={inputCls}>
              <option value="block">บล็อก (ปฏิเสธการผูก) — แนะนำ</option>
              <option value="replace">แทนที่ (เปลี่ยนไปลูกค้าใหม่)</option>
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>ข้อความตอบเมื่อผูกบัญชีสำเร็จ (ปล่อยว่าง = ใช้ค่าเริ่มต้น)</label>
          <textarea rows={3} value={form.welcomeMessage || ''}
            onChange={(e) => update({ welcomeMessage: e.target.value })}
            data-field="welcomeMessage" className={inputCls}
            placeholder="🎉 ผูกบัญชี LINE สำเร็จ — พิมพ์ &quot;คอร์ส&quot; เพื่อดูคอร์สที่ใช้ได้" />
        </div>
      </div>

      {/* ── Save bar ────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 flex items-center justify-end gap-2 p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)]">
        <button type="button" onClick={reload}
          className="text-xs px-3 py-1.5 rounded bg-neutral-700 text-white">
          ยกเลิก / โหลดใหม่
        </button>
        <button type="button" onClick={handleSave} disabled={saving}
          data-testid="line-settings-save"
          className="text-xs flex items-center gap-1 px-3 py-1.5 rounded font-bold bg-emerald-700 text-white disabled:opacity-60 disabled:cursor-not-allowed">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>
    </div>
  );
}
