// ─── WithdrawalDetailModal — read-only detail view for a single withdrawal ──
// Click row in StockWithdrawalPanel → this modal shows items + status + route.

import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, ClipboardCheck, AlertCircle, ArrowRightLeft, Package } from 'lucide-react';
import {
  getStockWithdrawal, getStockBatch, listStockLocations,
} from '../../lib/backendClient.js';
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

export default function WithdrawalDetailModal({ withdrawalId, onClose }) {
  const [data, setData] = useState(null);
  const [batches, setBatches] = useState({});
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
          </div>
        )}
      </div>
    </div>
  );
}
