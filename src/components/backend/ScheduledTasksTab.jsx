// ─── ScheduledTasksTab — "งานอัตโนมัติ & ตารางเวลา" (2026-06-02) ────────────
// Registry-driven admin tab: every scheduled task can be enabled/disabled, have
// its params tuned, show its last-run status, and be run on demand. The schedule
// (when it fires) is read-only — Vercel cron timing is deploy-time (vercel.json).
//
// Reads system_config.scheduledTasks (via useSystemConfig) + the live status doc
// (useScheduledTaskStatus). Saves the whole scheduledTasks slice atomically via
// the existing saveSystemConfig (audit-emit). Run-now POSTs /api/admin/run-scheduled-task.
import { useEffect, useMemo, useState } from 'react';
import {
  Clock, Play, Loader2, Bell, Database, Trash2, RefreshCw, Lock,
} from 'lucide-react';
import { useSystemConfig } from '../../hooks/useSystemConfig.js';
import { useScheduledTaskStatus } from '../../hooks/useScheduledTaskStatus.js';
import { saveSystemConfig } from '../../lib/systemConfigClient.js';
import {
  SCHEDULED_TASKS, CATEGORY_ORDER, CATEGORY_LABELS, defaultParamsFor,
} from '../../lib/scheduledTasksRegistry.js';
import { useTabAccess, useHasPermission } from '../../hooks/useTabAccess.js';
import { SectionCard, StatusBanner, SaveButton } from './SettingsPrimitives.jsx';
import { auth } from '../../firebase.js';

const CAT_LUCIDE = { reminder: Bell, backup: Database, retention: Trash2, sweep: RefreshCw };
const CAT_SUBTITLE = {
  reminder: 'ส่ง LINE เตือนนัด + retry งานที่ส่งไม่สำเร็จ',
  backup: 'สำรองทั้งระบบอัตโนมัติทุกวัน',
  retention: 'ลบ/ย้ายข้อมูลหมดอายุ กันฐานข้อมูลบวม + หน้าช้า',
  sweep: 'เก็บกวาดเซสชันค้าง/หมดอายุบ่อย ๆ',
};

function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

// Build the editable draft from the saved config (defaults fill missing).
function buildDraft(config) {
  const out = {};
  for (const t of SCHEDULED_TASKS) {
    const saved = config?.scheduledTasks?.[t.id] || {};
    out[t.id] = {
      enabled: saved.enabled !== false,
      params: { ...defaultParamsFor(t.id), ...(saved.params || {}) },
    };
  }
  return out;
}

// Thai relative time for a last-run ISO string.
function relTime(iso) {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'เมื่อสักครู่';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} นาทีที่แล้ว`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ชม.ที่แล้ว`;
  return `${Math.floor(diff / 86_400_000)} วันที่แล้ว`;
}

function LastRunBadge({ status }) {
  if (!status || !status.lastRunAt) {
    return <span className="text-[var(--tx-muted)]">— ยังไม่เคยรัน</span>;
  }
  const t = relTime(status.lastRunAt);
  if (status.skipped) return <span className="text-[var(--tx-muted)]">ปิดอยู่ · {t}</span>;
  if (status.ok === false) {
    return <span className="text-rose-400" title={status.error || ''}>✗ {(status.error || 'ล้มเหลว').slice(0, 40)} · {t}</span>;
  }
  return <span className="text-emerald-300">✓ {status.summary || 'สำเร็จ'} · {t}</span>;
}

function Toggle({ on, onChange, taskId, disabled }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} disabled={disabled}
      onClick={() => onChange(!on)}
      data-testid={`toggle-${taskId}`}
      className={`relative w-11 h-6 rounded-full border transition flex-shrink-0 disabled:opacity-50
        ${on ? 'bg-rose-700 border-rose-600' : 'bg-[var(--bd-strong)] border-[var(--bd-stronger)]'}`}
    >
      <span
        className="absolute top-0.5 rounded-full bg-white transition-all"
        style={{ width: 18, height: 18, left: on ? 20 : 2 }}
      />
    </button>
  );
}

function TaskRow({ task, draft, status, onToggle, onParam, onRunNow, running }) {
  const CatIcon = CAT_LUCIDE[task.category] || Clock;
  return (
    <div className="border border-[var(--bd)] rounded-xl bg-[var(--bg-card)] p-3 mt-2.5" data-testid={`task-${task.id}`}>
      <div className="flex items-center gap-3">
        <Toggle on={draft.enabled} onChange={(v) => onToggle(task, v)} taskId={task.id} />
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-bold flex items-center gap-2 flex-wrap ${draft.enabled ? 'text-[var(--tx-heading)]' : 'text-[var(--tx-muted)]'}`}>
            {task.deletesData && <span className="text-rose-400 font-extrabold">ลบ</span>}
            <span>{task.label}</span>
            <span className="text-[9px] font-bold rounded px-1.5 py-0.5 bg-sky-500/10 text-sky-300 border border-sky-500/30">Vercel</span>
            {task.safetyCritical && (
              <span className="text-[9px] text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded px-1.5 py-0.5 inline-flex items-center gap-0.5">
                <Lock size={9} /> สำคัญ
              </span>
            )}
          </div>
          <div className="text-[11px] text-[var(--tx-secondary)] mt-0.5">{task.description}</div>
        </div>
      </div>

      <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap mt-2.5 pt-2.5 border-t border-[var(--bd)] text-[11px] text-[var(--tx-secondary)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="uppercase text-[9px] tracking-wide text-[var(--tx-muted)]">ตาราง</span>
          <span className="text-[var(--tx-primary)] font-semibold inline-flex items-center gap-1"><Clock size={11} /> {task.scheduleHuman}</span>
          <span className="text-[9px] text-[var(--tx-muted)] bg-[var(--bg-hover)] border border-[var(--bd)] rounded px-1.5 py-px">อ่านอย่างเดียว</span>
        </span>

        {task.params.map((p) => (
          <span key={p.key} className="inline-flex items-center gap-1.5">
            <span className="uppercase text-[9px] tracking-wide text-[var(--tx-muted)]">{p.label}</span>
            <input
              type="number" min={p.min} max={p.max}
              value={draft.params[p.key] ?? p.default}
              onChange={(e) => onParam(task.id, p.key, clamp(Math.round(Number(e.target.value)), p.min, p.max))}
              data-testid={`param-${task.id}-${p.key}`}
              className="w-16 bg-[var(--bg-hover)] border border-[var(--bd-strong)] rounded-md text-[var(--tx-primary)] px-2 py-1 text-xs text-center"
            />
            {p.unit && <span className="text-[var(--tx-muted)]">{p.unit}</span>}
          </span>
        ))}

        <span className="inline-flex items-center gap-1.5">
          <span className="uppercase text-[9px] tracking-wide text-[var(--tx-muted)]">ล่าสุด</span>
          <LastRunBadge status={status} />
        </span>

        <button
          type="button" onClick={() => onRunNow(task)} disabled={running}
          data-testid={`run-${task.id}`}
          className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-bold border border-rose-700 text-rose-400 rounded-lg px-3 py-1.5 hover:bg-rose-700/10 disabled:opacity-40"
        >
          {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} รันตอนนี้
        </button>
      </div>
    </div>
  );
}

export default function ScheduledTasksTab() {
  const { config, loading } = useSystemConfig();
  const status = useScheduledTaskStatus();
  const { isAdmin } = useTabAccess();
  const canManage = useHasPermission('scheduled_task_management');
  const executedBy = useMemo(() => auth.currentUser?.email || auth.currentUser?.uid || 'unknown', []);

  const [draft, setDraft] = useState(() => buildDraft(config));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [running, setRunning] = useState({});
  const [runMsg, setRunMsg] = useState('');

  // Refresh draft when another admin saves (or initial config arrives).
  // NOTE: do NOT reset `saved` here — our own save triggers a config onSnapshot
  // refire, which would instantly clear the "บันทึกเรียบร้อย" banner (a real
  // UX bug caught by the L1 e2e). The success banner is cleared by the next user
  // edit (onToggle/onParam) instead.
  useEffect(() => { setDraft(buildDraft(config)); }, [config?.scheduledTasks]);

  const enabledCount = useMemo(
    () => SCHEDULED_TASKS.filter((t) => draft[t.id]?.enabled).length, [draft]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center gap-2 text-sm text-[var(--tx-muted)]">
        <Loader2 size={16} className="animate-spin" /> กำลังโหลดงานอัตโนมัติ...
      </div>
    );
  }
  if (!isAdmin && !canManage) {
    return (
      <div className="p-8">
        <StatusBanner kind="error">
          คุณไม่มีสิทธิ์เข้าถึงหน้านี้ — ต้องการ permission "scheduled_task_management" หรือสิทธิ์ admin
        </StatusBanner>
      </div>
    );
  }

  const onToggle = (task, enabled) => {
    if (!enabled && task.safetyCritical) {
      const msg = `${task.safetyNote || 'งานนี้สำคัญต่อระบบ'}\n\nยืนยันปิด "${task.label}" ?`;
      if (typeof window !== 'undefined' && !window.confirm(msg)) return;
    }
    setDraft((d) => ({ ...d, [task.id]: { ...d[task.id], enabled } }));
    setSaved(false);
  };
  const onParam = (taskId, key, val) => {
    setDraft((d) => ({ ...d, [taskId]: { ...d[taskId], params: { ...d[taskId].params, [key]: val } } }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true); setError(''); setSaved(false);
    try {
      await saveSystemConfig({ patch: { scheduledTasks: draft }, executedBy, reason: 'scheduled tasks config' });
      setSaved(true);
    } catch (e) {
      setError(e?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const handleRunNow = async (task) => {
    if (task.deletesData && typeof window !== 'undefined'
        && !window.confirm(`รัน "${task.label}" ตอนนี้เลย? (งานนี้ลบ/ย้ายข้อมูลจริง)`)) return;
    setRunning((r) => ({ ...r, [task.id]: true })); setRunMsg('');
    try {
      const idToken = await auth.currentUser?.getIdToken?.();
      const res = await fetch('/api/admin/run-scheduled-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken || ''}` },
        body: JSON.stringify({ taskId: task.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
      setRunMsg(`สั่งรัน "${task.label}" แล้ว — ดูผลที่สถานะ "ล่าสุด"`);
    } catch (e) {
      setRunMsg(`รัน "${task.label}" ไม่สำเร็จ: ${e?.message || e}`);
    } finally {
      setRunning((r) => ({ ...r, [task.id]: false }));
    }
  };

  const groups = CATEGORY_ORDER
    .map((cat) => ({ cat, tasks: SCHEDULED_TASKS.filter((t) => t.category === cat) }))
    .filter((g) => g.tasks.length);

  return (
    <div className="p-4 max-w-5xl mx-auto" data-testid="scheduled-tasks-tab">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-rose-900/30 border border-rose-700 flex items-center justify-center">
          <Clock size={20} className="text-rose-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--tx-heading)]">งานอัตโนมัติ &amp; ตารางเวลา</h2>
          <p className="text-xs text-[var(--tx-muted)]">รวม cron + งานลบ-ล้างอัตโนมัติ ไว้ที่เดียว — เปิด/ปิด · ปรับค่า · ดูสถานะ · สั่งรันเอง</p>
        </div>
      </div>

      <div className="flex gap-2.5 flex-wrap mb-4 text-xs">
        <span className="bg-[var(--bg-card)] border border-[var(--bd)] rounded-lg px-3 py-1.5">
          <b className="text-[var(--tx-heading)] text-base">{SCHEDULED_TASKS.length}</b> <span className="text-[var(--tx-muted)]">งานทั้งหมด</span>
        </span>
        <span className="bg-[var(--bg-card)] border border-[var(--bd)] rounded-lg px-3 py-1.5">
          <b className="text-emerald-300 text-base">{enabledCount}</b> <span className="text-[var(--tx-muted)]">เปิดอยู่</span>
        </span>
        <span className="bg-[var(--bg-card)] border border-[var(--bd)] rounded-lg px-3 py-1.5">
          <b className="text-[var(--tx-muted)] text-base">{SCHEDULED_TASKS.length - enabledCount}</b> <span className="text-[var(--tx-muted)]">ปิด</span>
        </span>
      </div>

      <StatusBanner kind="info">
        ⏱ เวลา/ความถี่ที่งานทำงาน <b>แก้จากหน้านี้ไม่ได้</b> (ฝังใน Vercel cron — เปลี่ยนเวลาต้อง deploy). ที่นี่ตั้งได้: เปิด/ปิด · ค่าต่าง ๆ · สั่งรันเอง.
      </StatusBanner>
      {error && <StatusBanner kind="error">{error}</StatusBanner>}
      {saved && <StatusBanner kind="success">บันทึกการตั้งค่าเรียบร้อย</StatusBanner>}
      {runMsg && <StatusBanner kind="info">{runMsg}</StatusBanner>}

      {groups.map(({ cat, tasks }) => (
        <SectionCard key={cat} icon={CAT_LUCIDE[cat] || Clock} title={CATEGORY_LABELS[cat]} subtitle={CAT_SUBTITLE[cat]}>
          {tasks.map((t) => (
            <TaskRow
              key={t.id} task={t} draft={draft[t.id] || { enabled: true, params: {} }} status={status[t.id]}
              onToggle={onToggle} onParam={onParam} onRunNow={handleRunNow} running={!!running[t.id]}
            />
          ))}
        </SectionCard>
      ))}

      <div className="flex justify-end mt-2">
        <SaveButton onClick={handleSave} saving={saving} success={saved} />
      </div>
      <p className="text-[10px] text-[var(--tx-muted)] text-center mt-4">
        เฉพาะ admin หรือ permission "scheduled_task_management" แก้ได้ · ทุกการเปลี่ยนแปลงเก็บ audit trail.
      </p>
    </div>
  );
}
