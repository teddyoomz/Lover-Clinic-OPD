// ─── CentralOrderDetailModal — read-only detail view for a Central PO ──────
// Phase 15.4 post-deploy s22 (2026-04-28).
//
// User report: "ใน tab คลังกลาง การนำเข้าจาก Vendor ให้กดเข้าไปดูรายละเอียดได้ด้วย"
//
// Mirrors OrderDetailModal pattern (branch-tier orders) but reads from
// be_central_stock_orders via getCentralStockOrder. Read-only for now —
// admins use receive/cancel buttons in the list view to mutate state.

import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, AlertCircle, Package, ShoppingBag } from 'lucide-react';
import { getCentralStockOrder } from '../../lib/backendClient.js';
import { fmtMoney } from '../../lib/financeUtils.js';
import { fmtSlashDateTime } from '../../lib/dateFormat.js';

const STATUS_INFO = {
  pending: { label: 'รอรับ', color: 'amber' },
  partial: { label: 'รับบางส่วน', color: 'sky' },
  received: { label: 'รับครบ', color: 'emerald' },
  cancelled: { label: 'ยกเลิก', color: 'red' },
  cancelled_post_receive: { label: 'ยกเลิก (หลังรับ)', color: 'red' },
};
const BADGE_CLS = {
  amber: 'bg-orange-900/30 text-orange-400 border-orange-800',
  sky: 'bg-sky-900/30 text-sky-400 border-sky-800',
  emerald: 'bg-emerald-900/30 text-emerald-400 border-emerald-800',
  red: 'bg-red-900/30 text-red-400 border-red-800',
};

function fmtQty(n) { return Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }
const fmtDate = (iso) => fmtSlashDateTime(iso, { withTime: false });
const fmtDateTime = fmtSlashDateTime;

export default function CentralOrderDetailModal({ orderId, onClose }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const o = await getCentralStockOrder(orderId);
      if (!o) throw new Error('Central PO not found');
      setOrder(o);
    } catch (e) { setError(e.message || 'โหลดไม่สำเร็จ'); }
    finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const status = order?.status || 'pending';
  const info = STATUS_INFO[status] || STATUS_INFO.pending;
  const subtotal = (order?.items || []).reduce(
    (s, it) => s + (Number(it.qty) || 0) * (Number(it.cost) || 0),
    0
  );
  const discount = Number(order?.discount) || 0;
  const isPercent = order?.discountType === 'percent';
  const discountAmt = isPercent ? (subtotal * discount) / 100 : discount;
  const netTotal = Math.max(0, subtotal - discountAmt);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[var(--bg-surface)] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        data-testid="central-order-detail-modal"
      >
        <div className="sticky top-0 z-10 bg-[var(--bg-surface)] border-b border-[var(--bd)] px-5 py-3 flex items-center gap-3">
          <ShoppingBag size={18} className="text-orange-400" />
          <h2 className="text-base font-bold text-[var(--tx-heading)]">รายละเอียด Central PO</h2>
          <span className="font-mono text-orange-400 text-sm" data-testid="central-detail-order-id">{orderId}</span>
          {order && (
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${BADGE_CLS[info.color]}`} data-testid="central-detail-status">
              {info.label}
            </span>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--tx-muted)]" title="ปิด" data-testid="central-detail-close">
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
        ) : order && (
          <div className="p-5 space-y-4">
            {/* Overview */}
            <div className="bg-[var(--bg-hover)]/50 rounded-xl p-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">วันที่นำเข้า</div>
                <div data-testid="central-detail-date">{fmtDate(order.importedDate || order.createdAt)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">Vendor</div>
                <div data-testid="central-detail-vendor">{order.vendorName || order.vendorId || '-'}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">คลังกลาง</div>
                <div className="font-mono text-[11px]" data-testid="central-detail-warehouse">{order.centralWarehouseId || '-'}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">ผู้ทำรายการ</div>
                <div data-testid="central-detail-actor">{order.user?.userName || '-'}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">สร้างเมื่อ</div>
                <div>{fmtDateTime(order.createdAt)}</div>
              </div>
              {order.updatedAt && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">อัพเดทล่าสุด</div>
                  <div>{fmtDateTime(order.updatedAt)}</div>
                </div>
              )}
              {order.note && (
                <div className="col-span-2 md:col-span-3">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">หมายเหตุ</div>
                  <div data-testid="central-detail-note">{order.note}</div>
                </div>
              )}
              {order.cancelReason && (
                <div className="col-span-2 md:col-span-3 bg-red-950/30 rounded-lg p-2 border border-red-900/50">
                  <div className="text-[10px] uppercase tracking-wider text-red-400 font-bold mb-1">เหตุผลการยกเลิก</div>
                  <div className="text-red-400">{order.cancelReason}</div>
                </div>
              )}
            </div>

            {/* Items */}
            <div>
              <h3 className="text-sm font-bold text-[var(--tx-heading)] mb-2 flex items-center gap-2">
                <Package size={14} /> รายการสินค้า ({(order.items || []).length})
              </h3>
              <div className="overflow-x-auto rounded-lg border border-[var(--bd)]">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase tracking-wider">
                    <tr>
                      <th className="px-2 py-2 text-left font-bold w-8">#</th>
                      <th className="px-2 py-2 text-left font-bold">สินค้า</th>
                      <th className="px-2 py-2 text-right font-bold w-20">จำนวน</th>
                      <th className="px-2 py-2 text-left font-bold w-16">หน่วย</th>
                      <th className="px-2 py-2 text-right font-bold w-24">ต้นทุน/หน่วย</th>
                      <th className="px-2 py-2 text-right font-bold w-28">ยอด</th>
                      <th className="px-2 py-2 text-left font-bold w-24">หมดอายุ</th>
                      <th className="px-2 py-2 text-center font-bold w-16">รับแล้ว</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(order.items || []).map((it, idx) => {
                      const qty = Number(it.qty) || 0;
                      const cost = Number(it.cost) || 0;
                      const lineTotal = qty * cost;
                      const received = !!it.receivedBatchId;
                      return (
                        <tr key={idx} className="border-t border-[var(--bd)]" data-testid={`central-detail-item-${idx}`}>
                          <td className="px-2 py-2 text-center text-[var(--tx-muted)]">{idx + 1}</td>
                          <td className="px-2 py-2 text-[var(--tx-primary)]">
                            {it.productName || it.productId || '-'}
                            {it.isPremium && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] bg-orange-900/30 text-orange-400 border border-orange-800">ฟรี</span>}
                          </td>
                          <td className="px-2 py-2 text-right font-mono">{fmtQty(qty)}</td>
                          <td className="px-2 py-2 text-[var(--tx-muted)] text-[11px]">{it.unit || '-'}</td>
                          <td className="px-2 py-2 text-right font-mono text-[var(--tx-muted)]">฿{fmtQty(cost)}</td>
                          <td className="px-2 py-2 text-right font-mono text-orange-400">฿{fmtMoney(lineTotal)}</td>
                          <td className="px-2 py-2 text-[var(--tx-muted)] text-[11px]">{it.expiresAt || '-'}</td>
                          <td className="px-2 py-2 text-center">
                            {received ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-900/30 text-emerald-400 border border-emerald-800">รับแล้ว</span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-900/30 text-orange-400 border border-orange-800">รอ</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-[var(--bg-hover)]/50 text-xs">
                    <tr>
                      <td colSpan={5} className="px-2 py-2 text-right text-[var(--tx-muted)]">รวมก่อนส่วนลด</td>
                      <td className="px-2 py-2 text-right font-mono">฿{fmtMoney(subtotal)}</td>
                      <td colSpan={2}></td>
                    </tr>
                    {discount > 0 && (
                      <tr>
                        <td colSpan={5} className="px-2 py-2 text-right text-[var(--tx-muted)]">
                          ส่วนลด {isPercent ? `${discount}%` : ''}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-red-400">-฿{fmtMoney(discountAmt)}</td>
                        <td colSpan={2}></td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={5} className="px-2 py-2 text-right font-bold">ยอดสุทธิ</td>
                      <td className="px-2 py-2 text-right font-mono font-bold text-orange-400" data-testid="central-detail-net-total">
                        ฿{fmtMoney(netTotal)}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
