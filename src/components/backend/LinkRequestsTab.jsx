// ─── Link Requests Tab — V32-tris-quater (2026-04-26) ──────────────────
// Admin queue for LINE link requests. Customer DM'd "ผูก <ID>" to LINE
// OA → webhook validated ID + created pending entry. Admin reviews here +
// approves (writes lineUserId onto customer + pushes confirm to LINE) or
// rejects (pushes apology to LINE).
//
// Per V32-tris-quater design: same-reply anti-enumeration on the bot
// side means CUSTOMER can't tell whether their ID matched — admin sees
// the matched customer here and decides.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { CheckCircle2, XCircle, Loader2, RefreshCw, MessageCircle, IdCard, Clock, AlertCircle } from 'lucide-react';
import {
  listLinkRequests,
  approveLinkRequest,
  rejectLinkRequest,
} from '../../lib/linkRequestsClient.js';

const STATUS_TABS = [
  { id: 'pending',  label: 'รอตรวจสอบ', cls: 'bg-amber-700/30 border-amber-700/50 text-amber-200' },
  { id: 'approved', label: 'อนุมัติแล้ว', cls: 'bg-emerald-700/30 border-emerald-700/50 text-emerald-200' },
  { id: 'rejected', label: 'ไม่อนุมัติ', cls: 'bg-red-700/30 border-red-700/50 text-red-200' },
];

export default function LinkRequestsTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('pending');
  const [busyId, setBusyId] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listLinkRequests({ status: filter });
      setItems(Array.isArray(result?.items) ? result.items : []);
    } catch (e) {
      setError(e.message || 'โหลดรายการคำขอล้มเหลว');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { reload(); }, [reload]);

  const handleApprove = async (requestId) => {
    if (!window.confirm('ยืนยันการผูกบัญชี LINE ให้ลูกค้า?')) return;
    setBusyId(requestId);
    setError('');
    try {
      await approveLinkRequest(requestId);
      await reload();
    } catch (e) {
      setError(e.message || 'อนุมัติล้มเหลว');
    } finally {
      setBusyId('');
    }
  };

  const handleReject = async (requestId) => {
    const reason = window.prompt('เหตุผลที่ไม่อนุมัติ (จะส่งให้ลูกค้าทราบหรือไม่ก็ได้):', '');
    if (reason === null) return; // cancelled
    setBusyId(requestId);
    setError('');
    try {
      await rejectLinkRequest(requestId, reason);
      await reload();
    } catch (e) {
      setError(e.message || 'ปฏิเสธล้มเหลว');
    } finally {
      setBusyId('');
    }
  };

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0 };
    items.forEach(i => {
      if (c[i.status] !== undefined) c[i.status]++;
    });
    return c;
  }, [items]);

  return (
    <div className="space-y-4 max-w-4xl" data-testid="link-requests-tab">
      <div className="flex items-center gap-2 mb-2">
        <MessageCircle size={20} className="text-[#06C755]" />
        <h2 className="text-2xl font-black text-[var(--tx-heading)]">คำขอผูก LINE จากลูกค้า</h2>
      </div>

      <div className="px-3 py-2 rounded-lg bg-violet-900/20 border border-violet-700/40 text-violet-200 text-xs">
        ลูกค้าที่ส่งข้อความ "ผูก [เลขบัตรประชาชน/พาสปอร์ต]" ใน LINE OA จะปรากฏที่นี่.
        เมื่อกด "อนุมัติ" → ระบบจะผูก LINE userId กับ be_customers + ส่งข้อความยืนยันให้ลูกค้าทราบ.
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          {STATUS_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id)}
              data-testid={`link-requests-filter-${t.id}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${filter === t.id ? t.cls : 'bg-[var(--bg-hover)] border-[var(--bd)] text-[var(--tx-muted)]'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={reload}
          disabled={loading}
          data-testid="link-requests-reload"
          className="text-xs flex items-center gap-1 px-3 py-1.5 rounded bg-[var(--bg-hover)] hover:bg-[var(--bg-card)] disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          รีเฟรช
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-900/20 border border-red-700/40 text-red-300 text-xs flex items-start gap-2" data-testid="link-requests-error">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {loading && items.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-[var(--tx-muted)]" />
        </div>
      )}

      {!loading && items.length === 0 && !error && (
        <div className="text-center py-12 text-sm text-[var(--tx-muted)]" data-testid="link-requests-empty">
          ยังไม่มีคำขอในสถานะ "{STATUS_TABS.find(t => t.id === filter)?.label}"
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-2" data-testid="link-requests-list">
          {items.map(req => {
            const isBusy = busyId === req.requestId;
            return (
              <div
                key={req.requestId}
                data-testid={`link-request-${req.requestId}`}
                className="p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)]"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-bold text-[var(--tx-heading)]">
                        {req.customerName || '(ไม่มีชื่อ)'}
                      </div>
                      {req.customerHN && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--bg-hover)] text-[var(--tx-muted)]">
                          HN {req.customerHN}
                        </span>
                      )}
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-900/30 border border-violet-700/40 text-violet-200 inline-flex items-center gap-1">
                        <IdCard size={10} />
                        {req.idType === 'national-id' ? 'บัตรประชาชน' : 'พาสปอร์ต'} ลงท้าย {req.idValueLast4 || '?'}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[var(--tx-muted)] flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1">
                        <MessageCircle size={11} />
                        {req.lineDisplayName || '(LINE ไม่มีชื่อ)'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {req.requestedAt ? new Date(req.requestedAt).toLocaleString('th-TH') : '-'}
                      </span>
                      {req.status !== 'pending' && (
                        <span>resolved: {req.resolvedAt ? new Date(req.resolvedAt).toLocaleString('th-TH') : '-'}</span>
                      )}
                    </div>
                    {req.rejectReason && (
                      <div className="mt-1 text-[11px] text-amber-300">เหตุผล: {req.rejectReason}</div>
                    )}
                  </div>
                  {req.status === 'pending' && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleApprove(req.requestId)}
                        disabled={isBusy}
                        data-testid={`link-request-approve-${req.requestId}`}
                        className="text-xs flex items-center gap-1 px-3 py-1.5 rounded bg-emerald-700 text-white font-bold disabled:opacity-50"
                      >
                        {isBusy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                        อนุมัติ
                      </button>
                      <button
                        onClick={() => handleReject(req.requestId)}
                        disabled={isBusy}
                        data-testid={`link-request-reject-${req.requestId}`}
                        className="text-xs flex items-center gap-1 px-3 py-1.5 rounded bg-red-700 text-white font-bold disabled:opacity-50"
                      >
                        {isBusy ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                        ปฏิเสธ
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="text-[10px] text-[var(--tx-muted)] mt-4">
        คำขอทั้งหมด: รอตรวจ {counts.pending} · อนุมัติ {counts.approved} · ปฏิเสธ {counts.rejected}
      </div>
    </div>
  );
}
