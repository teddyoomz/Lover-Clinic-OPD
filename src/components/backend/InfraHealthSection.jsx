// ─── Infra Health Section (2026-07-19) — SystemSettingsTab card ────────────
// The human-visible face of the infra-health-sweep cron: latest check result
// (reads the deterministic be_admin_audit/infra-health-latest doc — the recon-
// banner pattern), alert-routing config (LINE targets + staff-chat branch,
// saved via the audited saveSystemConfig rail), a REAL test-alert button
// (Rule Q L1: proof = the human SEEING the card/LINE arrive), run-now, and the
// client-error viewer (admin endpoint — client_error_log is default-deny).
// Enable/threshold for the cron live in ScheduledTasksTab like every task.
import { useState, useEffect, useCallback } from 'react';
import {
  HeartPulse, RefreshCw, Send, Bug, Play, Trash2, Plus, Loader2, Users,
} from 'lucide-react';
// LINE Friend Picker (2026-07-20) — เลือก lineUserId จากรายชื่อเพื่อนแบบ
// real-time แทนการพิมพ์มือ (user pain: "หา user id ไม่ได้")
import LineFriendPickerModal from './LineFriendPickerModal.jsx';
import { SectionCard, StatusBanner, SaveButton } from './SettingsPrimitives.jsx';
import { auth } from '../../firebase.js';
import { getAdminAuditDoc, listBranches } from '../../lib/scopedDataLayer.js';
import { saveSystemConfig } from '../../lib/systemConfigClient.js';
import { groupClientErrors } from '../../lib/clientErrorCore.js';

const CHIP = {
  ok:   'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-300',
  warn: 'bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300',
  red:  'bg-rose-500/15 border-rose-500/50 text-rose-700 dark:text-rose-300',
  info: 'bg-sky-500/10 border-sky-500/40 text-sky-700 dark:text-sky-300',
  skip: 'bg-[var(--bg-hover)] border-[var(--bd)] text-[var(--tx-muted)]',
};
const CHIP_LABEL = { ok: 'ปกติ', warn: 'ตรวจ', red: 'ปัญหา', info: 'ข้อมูล', skip: 'ข้าม' };

function fmtPerformedAt(iso) {
  const ms = Date.parse(iso || '');
  if (!Number.isFinite(ms)) return '—';
  const d = new Date(ms + 7 * 3600000);
  const s = d.toISOString();
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${Number(s.slice(0, 4)) + 543} ${s.slice(11, 16)}`;
}

async function adminFetch(path, opts = {}) {
  const idToken = await auth.currentUser?.getIdToken?.();
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken || ''}`, ...(opts.headers || {}) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

export default function InfraHealthSection({ config, executedBy }) {
  const [statusDoc, setStatusDoc] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [branches, setBranches] = useState([]);
  const [draft, setDraft] = useState(() => ({
    lineTargets: (config?.infraHealth?.lineTargets || []).map(t => ({ ...t })),
    staffChatBranchId: config?.infraHealth?.staffChatBranchId || '',
  }));
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [errorGroups, setErrorGroups] = useState(null);
  // LINE Friend Picker (2026-07-20) — index of the lineTargets row being filled
  const [pickerRow, setPickerRow] = useState(null);

  const handlePickFriend = (row) => {
    const i = pickerRow;
    if (i == null) return;
    setDraft(d => ({
      ...d,
      lineTargets: d.lineTargets.map((t, j) => (j === i ? {
        ...t,
        lineUserId: row.lineUserId || '',
        // label auto-fills from the LINE display name — never clobbers a
        // label the admin already typed
        label: t.label || row.displayName || '',
        branchId: t.branchId || row.branchId || '',
      } : t)),
    }));
    setPickerRow(null);
  };
  const [errorsLoading, setErrorsLoading] = useState(false);
  // AV212 rule 8 — per-machine slow-mode state (localStorage, this device only)
  const [machinePerf, setMachinePerf] = useState(null);
  const [wiping, setWiping] = useState(false);
  // 2026-07-21 fx-perf — per-machine visual tier (full/eco; auto = measured)
  const [visualTier, setVisualTier] = useState(null);

  useEffect(() => {
    import('../../lib/machinePerf.js')
      .then((m) => setMachinePerf(m.getMachinePerfState()))
      .catch(() => setMachinePerf({ noPersist: false, probeHist: [] }));
    import('../../lib/fxPerf.js')
      .then((m) => setVisualTier(m.getVisualTierState()))
      .catch(() => setVisualTier({ override: 'auto', applied: 'full', hist: [] }));
  }, []);

  const setTierMode = useCallback(async (mode) => {
    try {
      const m = await import('../../lib/fxPerf.js');
      m.setVisualTierOverride(mode); // stamps html[data-visual-tier] live — no reload
      setVisualTier(m.getVisualTierState());
    } catch { /* best-effort */ }
  }, []);

  const toggleSlowMachineMode = useCallback(async () => {
    try {
      const next = !(machinePerf?.noPersist);
      if (!window.confirm(next
        ? 'เปิดโหมดเครื่องช้า (ปิดแคชเครื่องนี้) แล้วรีโหลดหน้า?'
        : 'เปิดแคชเครื่องนี้กลับ แล้วรีโหลดหน้า?')) return;
      const m = await import('../../lib/machinePerf.js');
      m.setNoPersist(next);
    } catch { /* best-effort */ }
    try { window.location.reload(); } catch { /* noop */ }
  }, [machinePerf]);

  const wipeLocalCache = useCallback(async () => {
    if (!window.confirm('ล้างแคชข้อมูลของเครื่องนี้ (ข้อมูลจริงอยู่บนเซิร์ฟเวอร์ ไม่หาย) แล้วรีโหลดหน้า?')) return;
    setWiping(true);
    try {
      const [{ terminate, clearIndexedDbPersistence }, { db }] = await Promise.all([
        import('firebase/firestore'),
        import('../../firebase.js'),
      ]);
      await terminate(db);                    // required before clear
      await clearIndexedDbPersistence(db);    // wipes the local Firestore IDB
    } catch { /* best-effort — reload regardless (terminate leaves SDK unusable) */ }
    try { window.location.reload(); } catch { /* noop */ }
  }, []);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const doc = await getAdminAuditDoc('infra-health-latest');
      setStatusDoc(doc || null);
    } catch { setStatusDoc(null); }
    setStatusLoading(false);
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => {
    let alive = true;
    listBranches().then(bs => { if (alive) setBranches(Array.isArray(bs) ? bs : []); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  // Re-sync the draft when a fresher config arrives (live listener upstream).
  useEffect(() => {
    setDraft({
      lineTargets: (config?.infraHealth?.lineTargets || []).map(t => ({ ...t })),
      staffChatBranchId: config?.infraHealth?.staffChatBranchId || '',
    });
  }, [config?.infraHealth]);

  const handleSave = async () => {
    setSaving(true); setSaveOk(false); setErrMsg('');
    try {
      await saveSystemConfig({ patch: { infraHealth: draft }, executedBy, reason: 'infra-health alert routing' });
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
    } catch (e) {
      setErrMsg(`บันทึกไม่สำเร็จ: ${e?.message || e}`);
    }
    setSaving(false);
  };

  const handleTestAlert = async () => {
    setTesting(true); setTestResult(null); setErrMsg('');
    try {
      const { status, body } = await adminFetch('/api/admin/infra-health-test-alert', { method: 'POST', body: JSON.stringify({}) });
      if (status !== 200 || !body?.ok) setErrMsg(`ทดสอบไม่สำเร็จ (HTTP ${status})`);
      else setTestResult(body);
    } catch (e) {
      setErrMsg(`ทดสอบไม่สำเร็จ: ${e?.message || e}`);
    }
    setTesting(false);
  };

  const handleRunNow = async () => {
    setRunning(true); setErrMsg('');
    try {
      const { status, body } = await adminFetch('/api/admin/run-scheduled-task', {
        method: 'POST', body: JSON.stringify({ taskId: 'infraHealthSweep' }),
      });
      if (status !== 200 || body?.cronStatus >= 400) setErrMsg(`ตรวจไม่สำเร็จ (HTTP ${status})`);
      await loadStatus();
    } catch (e) {
      setErrMsg(`ตรวจไม่สำเร็จ: ${e?.message || e}`);
    }
    setRunning(false);
  };

  const loadErrors = async () => {
    setErrorsLoading(true); setErrMsg('');
    try {
      const { status, body } = await adminFetch('/api/admin/client-errors-list');
      if (status === 200 && body?.ok) setErrorGroups(groupClientErrors(body.rows));
      else setErrMsg(`โหลด error ไม่สำเร็จ (HTTP ${status})`);
    } catch (e) {
      setErrMsg(`โหลด error ไม่สำเร็จ: ${e?.message || e}`);
    }
    setErrorsLoading(false);
  };

  const setTarget = (i, field, value) => {
    setDraft(d => ({
      ...d,
      lineTargets: d.lineTargets.map((t, j) => (j === i ? { ...t, [field]: value } : t)),
    }));
  };

  const checks = statusDoc?.checks || [];
  const overall = statusDoc?.overall || null;

  return (
    <SectionCard
      icon={HeartPulse}
      title="🩺 สุขภาพระบบ"
      subtitle="ตรวจ backup / push / cron / client error รายวัน 07:30 — แจ้งเตือน staff chat + LINE เมื่อพบปัญหา (เปิด/ปิด + เกณฑ์ error อยู่ในแท็บงานตั้งเวลา)"
    >
      <div data-testid="infra-health-section">
        {errMsg && <StatusBanner kind="error">{errMsg}</StatusBanner>}

        {/* ── latest check result ── */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-bold text-[var(--tx-heading)]">ผลตรวจล่าสุด</span>
          {overall && (
            <span data-testid="infra-overall" className={`text-[11px] px-2 py-0.5 rounded-full border font-bold ${CHIP[overall] || CHIP.info}`}>
              {overall === 'ok' ? 'ปกติทุกจุด' : overall === 'red' ? 'มีปัญหาร้ายแรง' : 'มีจุดต้องตรวจ'}
            </span>
          )}
          <span className="text-[11px] text-[var(--tx-muted)]">
            {statusLoading ? 'กำลังโหลด…' : statusDoc ? `ตรวจเมื่อ ${fmtPerformedAt(statusDoc.performedAt)}` : 'ยังไม่เคยตรวจ — จะรันอัตโนมัติทุกวัน 07:30'}
          </span>
          <button type="button" onClick={loadStatus} title="รีเฟรช"
            className="ml-auto p-1.5 rounded-lg border border-[var(--bd)] text-[var(--tx-muted)] hover:bg-[var(--bg-hover)]">
            <RefreshCw size={13} className={statusLoading ? 'animate-spin' : ''} />
          </button>
        </div>
        {checks.length > 0 && (
          <div className="rounded-xl border border-[var(--bd)] divide-y divide-[var(--bd)] mb-4" data-testid="infra-check-rows">
            {checks.map(c => (
              <div key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                <span className="flex-1 text-[var(--tx-primary)]">{c.label}</span>
                <span className="text-[11px] text-[var(--tx-muted)] text-right max-w-[55%] truncate" title={c.detail}>{c.detail}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold flex-none ${CHIP[c.status] || CHIP.info}`}>
                  {CHIP_LABEL[c.status] || c.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── actions ── */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button type="button" data-testid="infra-test-alert-btn" onClick={handleTestAlert} disabled={testing}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-rose-700 text-white hover:bg-rose-600 disabled:opacity-40 inline-flex items-center gap-1.5">
            {testing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} ทดสอบแจ้งเตือน
          </button>
          <button type="button" data-testid="infra-run-now-btn" onClick={handleRunNow} disabled={running}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold border border-[var(--bd)] text-[var(--tx-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-40 inline-flex items-center gap-1.5">
            {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} ตรวจตอนนี้
          </button>
          <button type="button" data-testid="infra-load-errors-btn" onClick={loadErrors} disabled={errorsLoading}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold border border-[var(--bd)] text-[var(--tx-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-40 inline-flex items-center gap-1.5">
            {errorsLoading ? <Loader2 size={13} className="animate-spin" /> : <Bug size={13} />} ดู client errors
          </button>
        </div>
        {testResult && (
          <StatusBanner kind={testResult.staffChat?.ok ? 'success' : 'error'}>
            <span data-testid="infra-test-result">
              การ์ด staff chat: {testResult.staffChat?.ok ? `ส่งแล้ว (สาขา ${testResult.staffChat.branchId})` : 'ล้มเหลว'} ·
              LINE: {testResult.noLineTargets ? 'ยังไม่ได้ตั้ง target' :
                (testResult.line || []).map(l => `${l.lineUserId.slice(0, 8)}… → ${l.statusCode === 200 ? 'ส่งแล้ว ✓' : `fail (${l.statusCode})`}`).join(' · ')}
              {' '}— เช็คว่าเห็นข้อความจริงบนอุปกรณ์
            </span>
          </StatusBanner>
        )}

        {/* ── client error viewer ── */}
        {errorGroups !== null && (
          <div className="rounded-xl border border-[var(--bd)] mb-4" data-testid="infra-error-viewer">
            <div className="px-3 py-2 text-[11px] font-bold text-[var(--tx-muted)] border-b border-[var(--bd)]">
              Client errors ล่าสุด (group ตามชนิด · เก็บ 30 วัน · สูงสุด 100 รายการล่าสุด)
            </div>
            {errorGroups.length === 0 ? (
              <div className="px-3 py-3 text-xs text-[var(--tx-muted)]">ไม่มี error ในระบบ 🎉</div>
            ) : errorGroups.map(g => (
              <div key={g.hash} className="px-3 py-2 border-b border-[var(--bd)] last:border-b-0 text-xs">
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-mono text-[11px] text-[var(--tx-primary)] truncate" title={g.message}>{g.message}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold flex-none ${CHIP.warn}`}>×{g.count}</span>
                </div>
                <div className="text-[10px] text-[var(--tx-muted)] mt-0.5">
                  {g.surface} · {g.sampleUrl || '—'} · ล่าสุด {g.lastMs ? fmtPerformedAt(new Date(g.lastMs).toISOString()) : '—'}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── alert routing config ── */}
        <div className="text-xs font-bold text-[var(--tx-heading)] mb-2">การแจ้งเตือน</div>
        <div className="mb-3">
          <label className="block text-[11px] text-[var(--tx-muted)] mb-1">สาขาที่รับการ์ดใน staff chat</label>
          <select
            data-testid="infra-staffchat-branch"
            value={draft.staffChatBranchId}
            onChange={e => setDraft(d => ({ ...d, staffChatBranchId: e.target.value }))}
            className="w-full max-w-xs px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)]"
          >
            <option value="">— ค่าเริ่มต้น (นครราชสีมา) —</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name || b.id}</option>
            ))}
          </select>
        </div>
        <div className="mb-2">
          <label className="block text-[11px] text-[var(--tx-muted)] mb-1">
            LINE targets (ผู้รับต้องเป็นเพื่อนกับ LINE OA ของสาขานั้น — ดู User ID ได้จากแชทลูกค้า/ผู้ที่เคยทักเข้ามา)
          </label>
          {draft.lineTargets.map((t, i) => (
            <div key={i} className="flex flex-wrap gap-2 mb-1.5 items-center" data-testid={`infra-line-target-${i}`}>
              <select value={t.branchId} onChange={e => setTarget(i, 'branchId', e.target.value)}
                className="px-2 py-1.5 rounded-lg text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)]">
                <option value="">— สาขา OA —</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name || b.id}</option>)}
              </select>
              <input value={t.lineUserId} onChange={e => setTarget(i, 'lineUserId', e.target.value)}
                placeholder="LINE User ID (Uxxxx…)"
                className="flex-1 min-w-[180px] px-2 py-1.5 rounded-lg text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)] font-mono" />
              <input value={t.label || ''} onChange={e => setTarget(i, 'label', e.target.value)}
                placeholder="ป้าย (เช่น เจ้าของ)"
                className="w-28 px-2 py-1.5 rounded-lg text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)]" />
              <button type="button" data-testid={`infra-line-target-pick-${i}`}
                title="เลือกจากรายชื่อเพื่อน LINE (real-time)"
                onClick={() => setPickerRow(i)}
                className="px-2 py-1.5 rounded-lg text-xs border border-rose-700/50 bg-rose-950/30 text-rose-300 hover:bg-rose-900/40 inline-flex items-center gap-1">
                <Users size={13} /> เลือกจากรายชื่อ
              </button>
              <button type="button" title="ลบ target"
                onClick={() => setDraft(d => ({ ...d, lineTargets: d.lineTargets.filter((_, j) => j !== i) }))}
                className="p-1.5 rounded-lg border border-[var(--bd)] text-[var(--tx-muted)] hover:bg-[var(--bg-hover)]">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {draft.lineTargets.length < 5 && (
            <button type="button" data-testid="infra-add-line-target"
              onClick={() => setDraft(d => ({ ...d, lineTargets: [...d.lineTargets, { branchId: '', lineUserId: '', label: '' }] }))}
              className="px-3 py-1.5 rounded-lg text-xs border border-dashed border-[var(--bd)] text-[var(--tx-muted)] hover:bg-[var(--bg-hover)] inline-flex items-center gap-1">
              <Plus size={13} /> เพิ่ม LINE target
            </button>
          )}
        </div>

        <div className="flex gap-2 mt-3 pt-3 border-t border-[var(--bd)]">
          <SaveButton onClick={handleSave} saving={saving} success={saveOk} />
        </div>

        {/* LINE Friend Picker (2026-07-20) — fills the row the admin clicked */}
        <LineFriendPickerModal
          open={pickerRow != null}
          branchId={pickerRow != null ? (draft.lineTargets[pickerRow]?.branchId || '') : ''}
          mode="pick"
          onPick={handlePickFriend}
          onClose={() => setPickerRow(null)}
        />

        {/* AV212 rule 8 (2026-07-20) — per-MACHINE performance controls. The
            10-year-laptop class: Firestore's indexless local cache grew until
            reading it costs more than re-pulling over WiFi on weak hardware.
            The TFP fast-paint probe auto-flips such machines to memory-cache
            (lover.noPersist, 14d TTL); these buttons are the manual override +
            a local-cache wipe (server data untouched — safe, reload required). */}
        <div className="mt-4 pt-3 border-t border-[var(--bd)]" data-testid="infra-machine-box">
          <p className="text-[11px] font-bold text-[var(--tx-muted)] mb-1.5">เครื่องนี้ (ตั้งค่าเฉพาะเครื่องที่เปิดหน้านี้)</p>
          <p className="text-xs mb-2 text-[var(--tx-primary)]">
            แคชข้อมูลในเครื่อง:{' '}
            {machinePerf === null ? '…' : machinePerf.noPersist
              ? '⛔ ปิดอยู่ — โหมดเครื่องช้า (ดึงข้อมูลสดจากเซิร์ฟเวอร์ เร็วกว่าสำหรับเครื่องเก่า)'
              : '✅ เปิดปกติ'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-testid="infra-slow-machine-toggle"
              onClick={toggleSlowMachineMode}
              className="px-3 py-1.5 rounded-lg text-xs border border-[var(--bd)] text-[var(--tx-primary)] hover:bg-[var(--bg-hover)]">
              {machinePerf?.noPersist ? 'เปิดแคชกลับ (เครื่องนี้เร็วแล้ว)' : 'โหมดเครื่องช้า — ปิดแคชเครื่องนี้'}
            </button>
            <button type="button" data-testid="infra-wipe-local-cache"
              onClick={wipeLocalCache} disabled={wiping}
              className="px-3 py-1.5 rounded-lg text-xs border border-[var(--bd)] text-[var(--tx-muted)] hover:bg-[var(--bg-hover)] inline-flex items-center gap-1">
              {wiping ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} ล้างแคชเครื่องนี้
            </button>
          </div>
          <p className="text-[10px] text-[var(--tx-muted)] mt-1.5">
            เครื่องเก่าที่เปิดฟอร์มช้า ระบบจะวัดแล้วสลับโหมดให้อัตโนมัติ — ปุ่มนี้ใช้บังคับเอง/ย้อนกลับได้ (กดแล้วหน้าจะรีโหลด; ข้อมูลจริงอยู่บนเซิร์ฟเวอร์ ไม่หายไปไหน)
          </p>

          {/* 2026-07-21 fx-perf — visual tier (เอฟเฟกต์แสง/animation ต่อเครื่อง).
              auto = ระบบวัดเฟรมแล้วเลือกให้ · full = สวยเต็ม · eco = ประหยัด
              (หยุด breathing + หรี่ glow — เครื่องอ่อนลื่นขึ้นทันที ไม่ต้องรีโหลด) */}
          <div className="mt-3 pt-2 border-t border-dashed border-[var(--bd)]" data-testid="infra-visual-tier-box">
            <p className="text-xs mb-1.5 text-[var(--tx-primary)]">
              เอฟเฟกต์ภาพเครื่องนี้:{' '}
              {visualTier === null ? '…' : visualTier.applied === 'eco'
                ? '🍃 โหมดประหยัด (หยุด animation แสงเรือง)'
                : '✨ โหมดเต็ม (แสงเรือง + animation ครบ)'}
              {visualTier && visualTier.override !== 'auto' ? ' · บังคับเอง' : ' · อัตโนมัติ'}
            </p>
            <div className="flex flex-wrap gap-2">
              {[['auto', 'อัตโนมัติ (วัดเอง)'], ['full', 'สวยเต็ม'], ['eco', 'ประหยัด']].map(([mode, label]) => (
                <button key={mode} type="button" data-testid={`infra-visual-tier-${mode}`}
                  onClick={() => setTierMode(mode)}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                    (visualTier?.override || 'auto') === mode
                      ? 'border-teal-600/60 text-teal-400 bg-teal-950/20'
                      : 'border-[var(--bd)] text-[var(--tx-muted)] hover:bg-[var(--bg-hover)]'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-[var(--tx-muted)] mt-1.5">
              ทุกเครื่องหยุด animation ชั่วคราวขณะเลื่อนหน้าอยู่แล้ว (แก้จอขาวตอนเลื่อนเร็วบนมือถือ) — ปุ่มนี้คุมตอน "อยู่นิ่งๆ" เท่านั้น
            </p>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
