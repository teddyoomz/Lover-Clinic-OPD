// ─── AdjustDetailModal — read-only detail view for a single adjustment ──────
// Phase 15.4 post-deploy bug 3 (2026-04-28).
//
// User report (s19 EOD): "รายการหน้าปรับสต็อคจะต้องกดเข้าไปดูรายละเอียดในแต่ละ
// รายการได้เหมือนหน้าอื่นๆ" — Adjust list rows must be clickable to see
// detail like Transfer/Withdrawal/Order panels.
//
// Click a row in StockAdjustPanel → this modal shows: type (add/reduce),
// product, batch, qty, note, ผู้ทำ (creator), createdAt + linked movement
// metadata.

import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, SlidersHorizontal, AlertCircle, Plus, Minus, Package } from 'lucide-react';
import {
  getStockAdjustment, getStockBatch, listStockLocations,
} from '../../lib/scopedDataLayer.js';
import { fmtSlashDateTime } from '../../lib/dateFormat.js';
import { resolveBranchName } from '../../lib/BranchContext.jsx';

const TYPE_INFO = {
  add: { label: 'เพิ่มสต็อก', color: 'emerald', Icon: Plus },
  reduce: { label: 'ลดสต็อก', color: 'red', Icon: Minus },
};
const BADGE_CLS = {
  emerald: 'bg-emerald-900/30 text-emerald-400 border-emerald-800',
  red: 'bg-red-900/30 text-red-400 border-red-800',
};

function fmtQty(n) { return Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }
const fmtDateTime = fmtSlashDateTime;

export default function AdjustDetailModal({ adjustmentId, onClose, branches = [] }) {
  const [data, setData] = useState(null);
  const [batch, setBatch] = useState(null);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [a, locs] = await Promise.all([
        getStockAdjustment(adjustmentId),
        listStockLocations(),
      ]);
      if (!a) throw new Error('Adjustment not found');
      setData(a);
      setLocations(locs);
      if (a.batchId) {
        try { setBatch(await getStockBatch(a.batchId)); } catch {}
      }
    } catch (e) { setError(e.message || 'โหลดไม่สำเร็จ'); }
    finally { setLoading(false); }
  }, [adjustmentId]);

  useEffect(() => { load(); }, [load]);

  const locationName = (id) => locations.find((l) => l.id === id)?.name || id || '-';

  const type = data?.type || 'add';
  const info = TYPE_INFO[type] || TYPE_INFO.add;
  const TypeIcon = info.Icon;
  // Resolve branch via canonical helper so we never display raw codes.
  const branchDisplay = data?.branchId
    ? (resolveBranchName(data.branchId, branches) || locationName(data.branchId))
    : '-';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[var(--bg-surface)] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        data-testid="adjust-detail-modal"
      >
        <div className="sticky top-0 z-10 bg-[var(--bg-surface)] border-b border-[var(--bd)] px-5 py-3 flex items-center gap-3">
          <SlidersHorizontal size={18} className="text-orange-400" />
          <h2 className="text-base font-bold text-[var(--tx-heading)]">รายละเอียดการปรับสต็อก</h2>
          <span className="font-mono text-orange-400 text-sm" data-testid="adjust-detail-id">
            {adjustmentId}
          </span>
          {data && (
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold border inline-flex items-center gap-1 ${BADGE_CLS[info.color]}`}
              data-testid="adjust-detail-type-badge"
            >
              <TypeIcon size={10} /> {info.label}
            </span>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--tx-muted)]"
            title="ปิด"
            data-testid="adjust-detail-close"
          >
            <X size={16} />
          </button>
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
            {/* Overview */}
            <div className="bg-[var(--bg-hover)]/50 rounded-xl p-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">วันที่</div>
                <div data-testid="adjust-detail-date">{fmtDateTime(data.createdAt)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">สาขา / คลัง</div>
                <div data-testid="adjust-detail-branch">{branchDisplay}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">ผู้ทำรายการ</div>
                <div data-testid="adjust-detail-actor">{data.user?.userName || '-'}</div>
              </div>
              <div className="col-span-2 md:col-span-3">
                <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">สินค้า</div>
                <div className="text-sm font-bold text-[var(--tx-primary)]" data-testid="adjust-detail-product">
                  {data.productName || data.productId || '-'}
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">Batch</div>
                <div className="font-mono text-[11px] text-orange-400" title={data.batchId} data-testid="adjust-detail-batch">
                  {data.batchId ? `…${String(data.batchId).slice(-12)}` : '-'}
                  {batch?.expiresAt && (
                    <span className="ml-2 text-[var(--tx-muted)] font-sans text-[10px]">
                      หมดอายุ {batch.expiresAt}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">จำนวน</div>
                <div className={`text-sm font-mono font-bold ${type === 'add' ? 'text-emerald-400' : 'text-red-400'}`} data-testid="adjust-detail-qty">
                  {type === 'add' ? '+' : '−'}{fmtQty(data.qty)} {batch?.unit || ''}
                </div>
              </div>
            </div>

            {/* Note */}
            {data.note ? (
              <div className="bg-[var(--bg-hover)]/30 rounded-lg p-3 border border-[var(--bd)]">
                <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">หมายเหตุ</div>
                <div className="text-xs text-[var(--tx-primary)]" data-testid="adjust-detail-note">{data.note}</div>
              </div>
            ) : null}

            {/* Batch context */}
            {batch && (
              <div className="bg-[var(--bg-hover)]/30 rounded-lg p-4 border border-[var(--bd)]">
                <h3 className="text-xs font-bold text-[var(--tx-heading)] mb-2 flex items-center gap-2">
                  <Package size={12} /> ข้อมูล Batch ปัจจุบัน
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[11px]">
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-[var(--tx-muted)]">คงเหลือ</div>
                    <div className="font-mono text-[var(--tx-primary)] font-bold">{fmtQty(batch.qty?.remaining)} / {fmtQty(batch.qty?.total)} {batch.unit || ''}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-[var(--tx-muted)]">ต้นทุน/หน่วย</div>
                    <div className="font-mono text-orange-400">฿{fmtQty(batch.originalCost)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-[var(--tx-muted)]">สถานะ</div>
                    <div className="text-[var(--tx-primary)]">{batch.status || '-'}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Linked movement */}
            {data.movementId && (
              <div className="text-[10px] text-[var(--tx-muted)] flex items-center gap-1">
                <AlertCircle size={11} className="flex-shrink-0" />
                <span>
                  Movement: <span className="font-mono">{data.movementId}</span>
                  {' · '}การปรับสต็อกเป็น append-only — ห้ามแก้ไข/ลบ ถ้าผิดให้สร้าง adjustment ใหม่ในทิศตรงกันข้าม
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
