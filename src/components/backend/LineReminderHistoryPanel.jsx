// ─── LineReminderHistoryPanel — Task 11 (2026-05-15) ──────────────────────────
//
// Read-only audit panel showing the last 7 days of `be_line_reminder_log`
// docs filtered by branchId === selectedBranchId. Per-branch (passed via
// props). Auto-refresh via onSnapshot.
//
// Spec ref §5 C.3:
//   - Columns: timestamp / appointmentId / customerId / type / status / retryCount
//   - Filters: status (all / sent / failed / skipped-*) + type (all / dayBefore / dayOf)
//   - Click row → modal with full `lineApiResult` + `templateRendered`
//   - Status color chips: sent=green, failed=red, skipped-*=gray
//
// Note: be_line_reminder_log is locked at firestore.rules level (`if false`).
// Reads from this UI go through firebase-admin-aware endpoint OR through
// a relaxation post-Task 13. Pre-Task-13, listener may fire onError → render
// graceful empty state. Component is resilient to that.

import { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, query, where, limit } from 'firebase/firestore';
import { db, appId } from '../../firebase.js';
import { Loader2, AlertCircle, Clock, History, X } from 'lucide-react';
import { ModalScrollLock } from '../../lib/useModalScrollLock.js';

const PAGE_FETCH = 200;          // pull last 200; client-side filter for last-7d
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function formatTimestamp(t) {
  if (!t) return '-';
  const d = t?.toDate ? t.toDate() : (typeof t === 'string' ? new Date(t) : new Date(t));
  if (!d || Number.isNaN(d.getTime())) return '-';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const HH = String(d.getHours()).padStart(2, '0');
  const MM = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${HH}:${MM}`;
}

function timestampToMs(t) {
  if (!t) return 0;
  if (t?.toMillis) return t.toMillis();
  if (t?.toDate) return t.toDate().getTime();
  if (typeof t === 'string') return new Date(t).getTime() || 0;
  return 0;
}

function StatusChip({ status }) {
  const s = String(status || '');
  let cls = 'bg-neutral-700/40 text-neutral-300 border-neutral-600/40'; // skipped-*
  if (s === 'sent') cls = 'bg-emerald-900/30 text-emerald-300 border-emerald-700/40';
  else if (s === 'failed') cls = 'bg-red-900/30 text-red-300 border-red-700/40';
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono border ${cls}`}>
      {s || '-'}
    </span>
  );
}

export function LineReminderHistoryPanel({ branchId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [detail, setDetail] = useState(null); // selected log row for modal

  useEffect(() => {
    if (!branchId) {
      setRows([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    setError('');
    let unsub = () => {};
    try {
      const col = collection(db, 'artifacts', appId, 'public', 'data', 'be_line_reminder_log');
      const q = query(col, where('branchId', '==', branchId), limit(PAGE_FETCH));
      unsub = onSnapshot(
        q,
        (snap) => {
          const docs = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
          docs.sort((a, b) => timestampToMs(b.attemptedAt) - timestampToMs(a.attemptedAt));
          // Client-side last-7-days filter (server side just narrows by branch).
          const cutoff = Date.now() - SEVEN_DAYS_MS;
          const recent = docs.filter((d) => timestampToMs(d.attemptedAt) >= cutoff);
          setRows(recent);
          setLoading(false);
        },
        (e) => {
          // Rules lock or index issue — render graceful empty state.
          setError(e?.message || 'โหลดประวัติแจ้งเตือนไม่สำเร็จ');
          setLoading(false);
        },
      );
    } catch (e) {
      setError(e?.message || 'โหลดประวัติแจ้งเตือนไม่สำเร็จ');
      setLoading(false);
    }
    return () => {
      try { unsub(); } catch { /* noop */ }
    };
  }, [branchId]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'skipped-any') {
          if (!String(r.status || '').startsWith('skipped')) return false;
        } else if (r.status !== statusFilter) {
          return false;
        }
      }
      if (typeFilter !== 'all' && r.reminderType !== typeFilter) return false;
      return true;
    });
  }, [rows, statusFilter, typeFilter]);

  return (
    <div
      className="rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] p-4 space-y-3"
      data-testid="line-reminder-history-panel"
    >
      <div className="flex items-center gap-2">
        <History size={16} className="text-[var(--tx-muted)]" />
        <h3 className="text-sm font-bold text-[var(--tx-heading)]">📊 ประวัติแจ้งเตือน 7 วัน</h3>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-[var(--tx-muted)]">สถานะ:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            data-field="history-status-filter"
            className="px-2 py-1 rounded bg-[var(--bg-hover)] border border-[var(--bd)] text-xs"
          >
            <option value="all">ทั้งหมด</option>
            <option value="sent">sent</option>
            <option value="failed">failed</option>
            <option value="skipped-any">skipped-* (รวม)</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-[var(--tx-muted)]">ประเภท:</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            data-field="history-type-filter"
            className="px-2 py-1 rounded bg-[var(--bg-hover)] border border-[var(--bd)] text-xs"
          >
            <option value="all">ทั้งหมด</option>
            <option value="dayBefore">dayBefore</option>
            <option value="dayOf">dayOf</option>
          </select>
        </label>
        <span className="text-[10px] text-[var(--tx-muted)]">
          (แสดง {filtered.length} จาก {rows.length} รายการ)
        </span>
      </div>

      {loading && (
        <div className="p-4 flex items-center justify-center gap-2 text-xs text-[var(--tx-muted)]"
          data-testid="history-panel-loading">
          <Loader2 size={14} className="animate-spin" /> กำลังโหลด...
        </div>
      )}

      {!loading && error && (
        <div className="px-3 py-2 rounded-lg bg-red-900/20 border border-red-700/40 text-red-300 text-xs flex items-start gap-2"
          data-testid="history-panel-error">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="p-6 text-center text-xs text-[var(--tx-muted)]" data-testid="history-panel-empty">
          <Clock size={20} className="mx-auto mb-2 opacity-50" />
          ยังไม่มีประวัติแจ้งเตือนในช่วง 7 วันที่ผ่านมา
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="history-panel-table">
            <thead>
              <tr className="text-left text-[var(--tx-muted)] border-b border-[var(--bd)]">
                <th className="py-1.5 pr-2">เวลา</th>
                <th className="py-1.5 pr-2">นัด</th>
                <th className="py-1.5 pr-2">ลูกค้า</th>
                <th className="py-1.5 pr-2">ประเภท</th>
                <th className="py-1.5 pr-2">สถานะ</th>
                <th className="py-1.5 pr-2">retry</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-[var(--bd)]/40 hover:bg-[var(--bg-hover)]/40 cursor-pointer"
                  onClick={() => setDetail(r)}
                  data-testid={`history-row-${r.id}`}
                >
                  <td className="py-1.5 pr-2 font-mono text-[10px]">{formatTimestamp(r.attemptedAt)}</td>
                  <td className="py-1.5 pr-2 font-mono text-[10px]">{r.appointmentId || '-'}</td>
                  <td className="py-1.5 pr-2 font-mono text-[10px]">{r.customerId || '-'}</td>
                  <td className="py-1.5 pr-2">{r.reminderType || '-'}</td>
                  <td className="py-1.5 pr-2"><StatusChip status={r.status} /></td>
                  <td className="py-1.5 pr-2 text-center">{Number(r.retryCount || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        // AV78 (EOD8): backdrop click does NOT close — explicit close only (X / Cancel / ESC)
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto overscroll-contain"
          data-testid="history-detail-modal"
        >
          <ModalScrollLock />
          <div
            className="rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] p-4 max-w-2xl w-full max-h-[80vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-[var(--tx-heading)]">รายละเอียดแจ้งเตือน</h4>
              <button
                type="button"
                onClick={() => setDetail(null)}
                data-testid="history-detail-close"
                className="text-[var(--tx-muted)] hover:text-[var(--tx-primary)]"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2 text-xs">
              <div><strong>appointmentId:</strong> <span className="font-mono">{detail.appointmentId}</span></div>
              <div><strong>customerId:</strong> <span className="font-mono">{detail.customerId}</span></div>
              <div><strong>type:</strong> {detail.reminderType}</div>
              <div><strong>status:</strong> <StatusChip status={detail.status} /></div>
              <div><strong>retryCount:</strong> {Number(detail.retryCount || 0)}</div>
              {detail.lastError && (
                <div><strong>lastError:</strong> <span className="text-red-300 font-mono text-[10px]">{detail.lastError}</span></div>
              )}
              <div>
                <strong>templateRendered:</strong>
                <pre className="mt-1 p-2 rounded bg-[var(--bg-hover)] font-mono text-[10px] whitespace-pre-wrap">
                  {detail.templateRendered || '-'}
                </pre>
              </div>
              <div>
                <strong>lineApiResult:</strong>
                <pre className="mt-1 p-2 rounded bg-[var(--bg-hover)] font-mono text-[10px] overflow-auto">
                  {JSON.stringify(detail.lineApiResult, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LineReminderHistoryPanel;
