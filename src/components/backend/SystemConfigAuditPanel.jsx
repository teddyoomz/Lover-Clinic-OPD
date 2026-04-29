// ─── SystemConfigAuditPanel — Phase 16.3 (2026-04-29) ──────────────────────
//
// Read-only paginated list of recent `be_admin_audit/system-config-*` docs.
// Shows: timestamp, executedBy, changedFields list, before→after diff.
//
// Backed by onSnapshot listener so new audits appear immediately when admin
// saves on another browser tab (or another admin saves).
//
// Permissions: read gate is `isClinicStaff()` per firestore.rules — anyone
// who can see the System Settings tab can also see the audit list.

import { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import { db, appId } from '../../firebase.js';
import { Loader2, AlertCircle, Clock } from 'lucide-react';

const PAGE_SIZE = 20;
const MAX_FETCH = 50;

function formatTimestamp(t) {
  if (!t) return '-';
  // serverTimestamp comes back as Firestore Timestamp w/ toDate()
  const d = t.toDate ? t.toDate() : new Date(t);
  if (Number.isNaN(d.getTime())) return '-';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const HH = String(d.getHours()).padStart(2, '0');
  const MM = String(d.getMinutes()).padStart(2, '0');
  const SS = String(d.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${HH}:${MM}:${SS}`;
}

function formatValue(v) {
  if (v === null || v === undefined) return 'ไม่ตั้งค่า';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export default function SystemConfigAuditPanel() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let unsub = () => {};
    try {
      const col = collection(db, 'artifacts', appId, 'public', 'data', 'be_admin_audit');
      const q = query(
        col,
        where('action', '==', 'system_config_update'),
        orderBy('executedAt', 'desc'),
        limit(MAX_FETCH),
      );
      unsub = onSnapshot(
        q,
        (snap) => {
          const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setEntries(rows);
          setLoading(false);
        },
        (e) => {
          // Composite-index missing? Fallback to client-side sort.
          if (e?.code === 'failed-precondition') {
            const fb = collection(db, 'artifacts', appId, 'public', 'data', 'be_admin_audit');
            const fbQ = query(fb, where('action', '==', 'system_config_update'), limit(MAX_FETCH));
            unsub = onSnapshot(fbQ, (snap) => {
              const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
              rows.sort((a, b) => {
                const ta = a.executedAt?.toMillis ? a.executedAt.toMillis() : 0;
                const tb = b.executedAt?.toMillis ? b.executedAt.toMillis() : 0;
                return tb - ta;
              });
              setEntries(rows);
              setLoading(false);
            }, () => {
              setError('โหลด audit trail ไม่สำเร็จ');
              setLoading(false);
            });
          } else {
            setError(e?.message || 'โหลด audit trail ไม่สำเร็จ');
            setLoading(false);
          }
        },
      );
    } catch (e) {
      setError(e?.message || 'โหลด audit trail ไม่สำเร็จ');
      setLoading(false);
    }
    return () => unsub();
  }, []);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const visible = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return entries.slice(start, start + PAGE_SIZE);
  }, [entries, page]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center gap-2 text-sm text-[var(--tx-muted)]">
        <Loader2 size={14} className="animate-spin" /> กำลังโหลด...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-xs text-rose-400 bg-rose-950/40 border border-rose-800 rounded-lg flex items-center gap-2">
        <AlertCircle size={14} /> {error}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-[var(--tx-muted)]">
        <Clock size={20} className="mx-auto mb-2 opacity-50" />
        ยังไม่มีประวัติการเปลี่ยนแปลง
      </div>
    );
  }

  return (
    <div data-testid="system-config-audit-panel">
      <div className="space-y-2">
        {visible.map((e) => (
          <div
            key={e.id}
            className="border border-[var(--bd)] rounded-lg px-3 py-2 hover:bg-[var(--bg-hover)]/40"
            data-testid={`audit-row-${e.id}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-[10px] text-[var(--tx-muted)] font-mono">{formatTimestamp(e.executedAt)}</div>
              <div className="text-[10px] text-[var(--tx-secondary)]">โดย {e.executedBy || '?'}</div>
            </div>
            <div className="mt-1.5 text-xs">
              <span className="text-[var(--tx-muted)]">เปลี่ยน {(e.changedFields || []).length} field:</span>{' '}
              {(e.changedFields || []).map((f) => (
                <span key={f} className="inline-block mx-0.5 px-1.5 py-0.5 rounded bg-[var(--bg-hover)] border border-[var(--bd)] font-mono text-[10px]">{f}</span>
              ))}
            </div>
            {(e.changedFields || []).length > 0 && (
              <div className="mt-1.5 grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <div className="text-rose-400 font-bold mb-0.5">ก่อน:</div>
                  {(e.changedFields || []).map((f) => (
                    <div key={`b-${f}`} className="font-mono break-all">
                      <span className="text-[var(--tx-muted)]">{f}:</span> {formatValue(e.beforeValues?.[f])}
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-emerald-400 font-bold mb-0.5">หลัง:</div>
                  {(e.changedFields || []).map((f) => (
                    <div key={`a-${f}`} className="font-mono break-all">
                      <span className="text-[var(--tx-muted)]">{f}:</span> {formatValue(e.afterValues?.[f])}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {e.reason && <div className="mt-1 italic text-[10px] text-[var(--tx-muted)]">เหตุผล: {e.reason}</div>}
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-xs">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="px-3 py-1.5 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] disabled:opacity-40"
          >ก่อนหน้า</button>
          <span className="text-[var(--tx-muted)]">หน้า {page} / {totalPages} (ทั้งหมด {entries.length} รายการ)</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="px-3 py-1.5 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] disabled:opacity-40"
          >ถัดไป</button>
        </div>
      )}
    </div>
  );
}
