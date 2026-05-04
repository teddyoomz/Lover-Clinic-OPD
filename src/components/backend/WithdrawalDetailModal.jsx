// ─── WithdrawalDetailModal — detail view + Phase 15.5B approve/reject ──────
// Click row in StockWithdrawalPanel → this modal shows items + status + route.
// Phase 15.5B (2026-04-28): admins (custom claim `admin: true` OR
// permission-group meta) can approve/reject pending (status=0) withdrawals
// remotely via /api/admin/stock-withdrawal-approve. Approve = soft (records
// audit + metadata, status STAYS at 0 — warehouse still does the dispatch).
// Reject = flips 0→3 + records audit + reason.

import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, ClipboardCheck, AlertCircle, ArrowRightLeft, Package, CheckCircle2, Ban } from 'lucide-react';
import {
  getStockWithdrawal, getStockBatch, listStockLocations,
} from '../../lib/scopedDataLayer.js';
import {
  approveStockWithdrawal, rejectStockWithdrawal,
} from '../../lib/stockWithdrawalApprovalClient.js';
import { useTabAccess } from '../../hooks/useTabAccess.js';
import { fmtSlashDateTime } from '../../lib/dateFormat.js';

const STATUS_INFO = {
  0: { label: 'รอยืนยัน', color: 'amber' },
  1: { label: 'รอส่ง', color: 'sky' },
  2: { label: 'สำเร็จ', color: 'emerald' },
  3: { label: 'ยกเลิก', color: 'red' },
};
const BADGE_CLS = {
  amber: 'bg-orange-900/30 text-orange-400 border-orange-800',
  sky: 'bg-sky-900/30 text-sky-400 border-sky-800',
  emerald: 'bg-emerald-900/30 text-emerald-400 border-emerald-800',
  red: 'bg-red-900/30 text-red-400 border-red-800',
};

function fmtQty(n) { return Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }
const fmtDateTime = fmtSlashDateTime;

export default function WithdrawalDetailModal({ withdrawalId, onClose, onAfterAction }) {
  const [data, setData] = useState(null);
  const [batches, setBatches] = useState({});
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Phase 15.5B (2026-04-28) — admin approve/reject state
  const { isAdmin } = useTabAccess();
  const [actionPending, setActionPending] = useState(null); // 'approve' | 'reject' | null
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [approvalNote, setApprovalNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [w, locs] = await Promise.all([getStockWithdrawal(withdrawalId), listStockLocations()]);
      if (!w) throw new Error('Withdrawal not found');
      setData(w);
      setLocations(locs);
      const ids = new Set();
      for (const it of (w.items || [])) {
        if (it.sourceBatchId) ids.add(it.sourceBatchId);
        if (it.destinationBatchId) ids.add(it.destinationBatchId);
      }
      const bm = {};
      await Promise.all([...ids].map(async bid => {
        try { bm[bid] = await getStockBatch(bid); } catch {}
      }));
      setBatches(bm);
    } catch (e) { setError(e.message || 'โหลดไม่สำเร็จ'); }
    finally { setLoading(false); }
  }, [withdrawalId]);

  useEffect(() => { load(); }, [load]);

  // Phase 15.5B (2026-04-28) — admin approve/reject handlers.
  // Approve = soft (status STAYS at 0; warehouse still does the dispatch).
  // Reject = flips status 0→3 + records audit + reason.
  const handleApprove = useCallback(async () => {
    setActionError(''); setActionSuccess('');
    setActionPending('approve');
    try {
      await approveStockWithdrawal({ withdrawalId, note: approvalNote.trim() });
      setActionSuccess('อนุมัติสำเร็จ — รอวอร์เฮาส์ส่งสินค้า');
      setApprovalNote('');
      await load(); // refresh modal data
      onAfterAction?.(); // signal parent to refresh list
    } catch (e) {
      setActionError(e.message || 'อนุมัติไม่สำเร็จ');
    } finally {
      setActionPending(null);
    }
  }, [withdrawalId, approvalNote, load, onAfterAction]);

  const handleReject = useCallback(async () => {
    setActionError(''); setActionSuccess('');
    setActionPending('reject');
    try {
      await rejectStockWithdrawal({ withdrawalId, reason: rejectReason.trim() });
      setActionSuccess('ปฏิเสธสำเร็จ — สถานะเปลี่ยนเป็นยกเลิก');
      setRejectReason('');
      setRejectModal(false);
      await load();
      onAfterAction?.();
    } catch (e) {
      setActionError(e.message || 'ปฏิเสธไม่สำเร็จ');
    } finally {
      setActionPending(null);
    }
  }, [withdrawalId, rejectReason, load, onAfterAction]);

  const locationName = (id) => locations.find(l => l.id === id)?.name || id || '-';
  const status = data ? Number(data.status) : 0;
  const info = STATUS_INFO[status] || STATUS_INFO[0];
  const directionLabel = data?.direction === 'branch_to_central' ? 'สาขา → คลังกลาง' : 'คลังกลาง → สาขา';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--bg-surface)] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-[var(--bg-surface)] border-b border-[var(--bd)] px-5 py-3 flex items-center gap-3">
          <ClipboardCheck size={18} className="text-violet-400" />
          <h2 className="text-base font-bold text-[var(--tx-heading)]">รายละเอียดการเบิก</h2>
          <span className="font-mono text-violet-400 text-sm">{withdrawalId}</span>
          {data && (
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${BADGE_CLS[info.color]}`}>{info.label}</span>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--tx-muted)]" title="ปิด"><X size={16} /></button>
        </div>

        {loading ? (
          <div className="p-12 flex items-center justify-center text-xs text-[var(--tx-muted)]">
            <Loader2 size={16} className="animate-spin mr-2" /> กำลังโหลด...
          </div>
        ) : error ? (
          <div className="p-6">
            <div className="bg-red-950/40 border border-red-800 rounded-lg p-3 text-xs text-red-400 flex items-start gap-2">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {error}
            </div>
          </div>
        ) : data && (
          <div className="p-5 space-y-4">
            <div className="bg-[var(--bg-hover)]/50 rounded-xl p-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <div className="col-span-2 md:col-span-3">
                <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">ทิศทาง</div>
                <div className="text-sm font-bold text-violet-400">{directionLabel}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">ต้นทาง</div>
                <div>{locationName(data.sourceLocationId)}</div>
              </div>
              <div className="hidden md:flex items-center justify-center text-[var(--tx-muted)]">
                <ArrowRightLeft size={16} />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">ปลายทาง</div>
                <div>{locationName(data.destinationLocationId)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">วันที่สร้าง</div>
                <div>{fmtDateTime(data.createdAt)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">อัพเดทล่าสุด</div>
                <div>{fmtDateTime(data.updatedAt)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">ผู้สร้าง</div>
                <div data-testid="withdrawal-creator-name">{data.user?.userName || '-'}</div>
                {data.createdAt && (
                  <div className="text-[9px] text-[var(--tx-muted)] mt-0.5">{fmtDateTime(data.createdAt)}</div>
                )}
              </div>
              {/* Phase 15.4 (s19 item 6) — ผู้อนุมัติและส่งสินค้า (status 0→1) */}
              {(status >= 1 || data.approvedByUser) && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">ผู้อนุมัติและส่งสินค้า</div>
                  <div data-testid="withdrawal-approver-name">{data.approvedByUser?.userName || '-'}</div>
                  {data.approvedAt && (
                    <div className="text-[9px] text-[var(--tx-muted)] mt-0.5">{fmtDateTime(data.approvedAt)}</div>
                  )}
                </div>
              )}
              {/* Phase 15.4 (s19 item 6) — ผู้รับสินค้า (status 1→2) */}
              {(status >= 2 || data.receivedByUser) && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">ผู้รับสินค้า</div>
                  <div data-testid="withdrawal-receiver-name">{data.receivedByUser?.userName || '-'}</div>
                  {data.receivedAt && (
                    <div className="text-[9px] text-[var(--tx-muted)] mt-0.5">{fmtDateTime(data.receivedAt)}</div>
                  )}
                </div>
              )}
              {data.note && (
                <div className="col-span-2 md:col-span-3">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">หมายเหตุ</div>
                  <div>{data.note}</div>
                </div>
              )}
              {data.canceledNote && (
                <div className="col-span-2 md:col-span-3 bg-red-950/30 rounded-lg p-2 border border-red-900/50">
                  <div className="text-[10px] uppercase tracking-wider text-red-400 font-bold mb-1">เหตุผลการยกเลิก</div>
                  <div className="text-red-400">{data.canceledNote}</div>
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-bold text-[var(--tx-heading)] mb-2 flex items-center gap-2">
                <Package size={14} /> รายการสินค้า ({(data.items || []).length})
              </h3>
              <div className="overflow-x-auto rounded-lg border border-[var(--bd)]">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase tracking-wider">
                    <tr>
                      <th className="px-2 py-2 text-left font-bold w-8">#</th>
                      <th className="px-2 py-2 text-left font-bold">สินค้า</th>
                      <th className="px-2 py-2 text-left font-bold">Batch ต้นทาง</th>
                      <th className="px-2 py-2 text-right font-bold w-24">จำนวน</th>
                      <th className="px-2 py-2 text-left font-bold">Batch ปลายทาง</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.items || []).map((it, idx) => {
                      const src = batches[it.sourceBatchId];
                      const dst = batches[it.destinationBatchId];
                      const name = src?.productName || it.productName || it.productId || '-';
                      return (
                        <tr key={idx} className="border-t border-[var(--bd)]">
                          <td className="px-2 py-2 text-center text-[var(--tx-muted)]">{idx + 1}</td>
                          <td className="px-2 py-2 text-[var(--tx-primary)]">
                            <div>{name}</div>
                            {src?.expiresAt && <div className="text-[9px] text-[var(--tx-muted)]">หมด {src.expiresAt}</div>}
                          </td>
                          <td className="px-2 py-2 font-mono text-[10px] text-violet-400" title={it.sourceBatchId}>
                            {it.sourceBatchId ? `…${it.sourceBatchId.slice(-8)}` : '-'}
                            {src && <div className="text-[9px] text-[var(--tx-muted)]">คงเหลือ: {fmtQty(src.qty?.remaining)}/{fmtQty(src.qty?.total)}</div>}
                          </td>
                          <td className="px-2 py-2 text-right font-mono text-emerald-400 font-bold">{fmtQty(it.qty)}</td>
                          <td className="px-2 py-2 font-mono text-[10px]" title={it.destinationBatchId}>
                            {it.destinationBatchId ? (
                              <>
                                <span className="text-emerald-400">…{it.destinationBatchId.slice(-8)}</span>
                                {dst && <div className="text-[9px] text-[var(--tx-muted)]">คงเหลือ: {fmtQty(dst.qty?.remaining)}/{fmtQty(dst.qty?.total)}</div>}
                              </>
                            ) : (
                              <span className="text-[var(--tx-muted)]">ยังไม่สร้าง (ต้องรอรับ)</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Phase 15.5B (2026-04-28) — admin approve/reject UI.
                Visible only when:
                  - User is admin (custom claim or permission group meta)
                  - status === 0 (PENDING_APPROVAL)
                  - Approval not yet recorded (data.approvedAt absent) — for approve button
                Reject is shown until status flips to non-zero. */}
            {isAdmin && status === 0 && (
              <div
                className="bg-amber-950/30 rounded-xl p-4 border border-amber-900/50 space-y-3"
                data-testid="withdrawal-admin-action-section"
              >
                <div className="flex items-start gap-2">
                  <ClipboardCheck size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-300 font-bold">
                    การอนุมัติ (Admin only)
                    <div className="text-[10px] text-[var(--tx-muted)] font-normal mt-0.5">
                      อนุมัติ = บันทึก audit + รอวอร์เฮาส์ส่งสินค้า · ปฏิเสธ = เปลี่ยนเป็นยกเลิก
                    </div>
                  </div>
                </div>
                {actionError && (
                  <div className="bg-red-950/40 border border-red-800 rounded p-2 text-[11px] text-red-400 flex items-start gap-1.5" data-testid="withdrawal-action-error">
                    <AlertCircle size={12} className="flex-shrink-0 mt-0.5" /> {actionError}
                  </div>
                )}
                {actionSuccess && (
                  <div className="bg-emerald-950/40 border border-emerald-800 rounded p-2 text-[11px] text-emerald-400 flex items-start gap-1.5" data-testid="withdrawal-action-success">
                    <CheckCircle2 size={12} className="flex-shrink-0 mt-0.5" /> {actionSuccess}
                  </div>
                )}
                {data.approvedAt ? (
                  <div className="bg-emerald-950/30 border border-emerald-900/50 rounded p-2 text-[11px] text-emerald-400">
                    ✓ อนุมัติแล้วโดย <strong>{data.approvedByUser?.userName || '-'}</strong> เมื่อ {fmtDateTime(data.approvedAt)}
                    {data.approvalNote && <div className="text-[10px] text-[var(--tx-muted)] mt-1 italic">หมายเหตุ: {data.approvalNote}</div>}
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1 font-bold">หมายเหตุการอนุมัติ (optional)</label>
                    <input
                      type="text"
                      value={approvalNote}
                      onChange={(e) => setApprovalNote(e.target.value)}
                      maxLength={500}
                      placeholder="(ถ้ามี)"
                      className="w-full px-2.5 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)]"
                      disabled={!!actionPending}
                      data-testid="withdrawal-approval-note"
                    />
                  </div>
                )}
                <div className="flex gap-2">
                  {!data.approvedAt && (
                    <button
                      onClick={handleApprove}
                      disabled={!!actionPending}
                      className="px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                      data-testid="withdrawal-approve-btn"
                    >
                      {actionPending === 'approve' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                      อนุมัติ
                    </button>
                  )}
                  <button
                    onClick={() => { setActionError(''); setActionSuccess(''); setRejectModal(true); }}
                    disabled={!!actionPending}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold bg-red-700 text-white hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                    data-testid="withdrawal-reject-btn"
                  >
                    <Ban size={12} /> ปฏิเสธ
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Phase 15.5B (2026-04-28) — reject reason modal */}
      {rejectModal && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4"
          onClick={() => !actionPending && setRejectModal(false)}
          data-testid="withdrawal-reject-modal"
        >
          <div className="bg-[var(--bg-surface)] rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[var(--tx-heading)] flex items-center gap-2">
              <Ban size={16} className="text-red-400" /> ปฏิเสธคำขอเบิก?
            </h3>
            <p className="text-[11px] text-[var(--tx-muted)]">
              สถานะจะถูกเปลี่ยนเป็น <strong className="text-red-400">ยกเลิก</strong> และไม่สามารถย้อนกลับได้
            </p>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1 font-bold">เหตุผล (optional)</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                maxLength={500}
                placeholder="ระบุเหตุผล (ถ้ามี)"
                rows={3}
                className="w-full px-2.5 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)] resize-none"
                disabled={!!actionPending}
                data-testid="withdrawal-reject-reason"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRejectModal(false)}
                disabled={!!actionPending}
                className="px-4 py-1.5 rounded-lg text-xs bg-[var(--bg-hover)] text-[var(--tx-primary)] border border-[var(--bd)]"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleReject}
                disabled={!!actionPending}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-red-700 text-white hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                data-testid="withdrawal-reject-confirm-btn"
              >
                {actionPending === 'reject' ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
                ปฏิเสธ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
