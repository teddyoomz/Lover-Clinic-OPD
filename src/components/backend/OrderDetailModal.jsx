// ─── OrderDetailModal — view + edit a single vendor order (Phase 8d++) ──────
// Shows all items in an order with per-batch consumption status.
// Editable: vendorName, note, per-item cost/expiresAt (only if batch unused).
// Qty edits are blocked server-side (would desync movement log audit trail).

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X, Loader2, Save, AlertCircle, Edit3, Package, CheckCircle2, Trash2,
} from 'lucide-react';
import {
  getStockOrder, listStockMovements, updateStockOrder, cancelStockOrder,
} from '../../lib/backendClient.js';
import { auth } from '../../firebase.js';
import DateField from '../DateField.jsx';
import { fmtMoney } from '../../lib/financeUtils.js';
import { useSelectedBranch, resolveBranchName } from '../../lib/BranchContext.jsx';

function currentAuditUser() {
  const u = auth.currentUser;
  return {
    userId: u?.uid || '',
    userName: u?.email?.split('@')[0] || u?.displayName || '',
  };
}

// fmtMoney — imported from financeUtils (Rule of 3: was duplicated across 3 files).
function fmtQty(n) { return Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }

export default function OrderDetailModal({ orderId, onClose, onSaved }) {
  // 2026-04-27 fix — branch list for human-readable name lookup.
  // Pre-fix the modal rendered `order.branchId` raw → user saw codes like
  // "BR-1777095572005-ae97f911" which are unreadable. resolveBranchName
  // looks up the branch name from be_branches via BranchProvider.
  const { branches } = useSelectedBranch();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [consumption, setConsumption] = useState({}); // batchId → { used, count, totalOut }

  // Edit state
  const [vendorName, setVendorName] = useState('');
  const [note, setNote] = useState('');
  const [itemEdits, setItemEdits] = useState({}); // orderProductId → { cost, expiresAt }

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const o = await getStockOrder(orderId);
      if (!o) throw new Error('Order not found');
      setOrder(o);
      setVendorName(o.vendorName || '');
      setNote(o.note || '');
      const edits = {};
      for (const it of (o.items || [])) {
        edits[it.orderProductId] = { cost: String(it.cost ?? ''), expiresAt: it.expiresAt || '' };
      }
      setItemEdits(edits);

      // Per-batch consumption (parallel)
      const cons = {};
      await Promise.all((o.items || []).map(async it => {
        if (!it.batchId) return;
        try {
          const mvts = await listStockMovements({ batchId: it.batchId, includeReversed: true });
          const nonImport = mvts.filter(m => Number(m.type) !== 1);
          const totalOut = nonImport.reduce((s, m) => s + Math.abs(Number(m.qty) || 0), 0);
          cons[it.batchId] = { used: nonImport.length > 0, count: nonImport.length, totalOut };
        } catch { cons[it.batchId] = { used: false, count: 0, totalOut: 0 }; }
      }));
      setConsumption(cons);
    } catch (e) { setError(e.message || 'โหลดไม่สำเร็จ'); }
    finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const canEdit = order && order.status !== 'cancelled';
  const hasUsedItems = useMemo(() => {
    if (!order) return false;
    return (order.items || []).some(it => consumption[it.batchId]?.used);
  }, [order, consumption]);

  const hasEdits = useMemo(() => {
    if (!order) return false;
    if ((order.vendorName || '') !== vendorName) return true;
    if ((order.note || '') !== note) return true;
    for (const it of (order.items || [])) {
      const e = itemEdits[it.orderProductId];
      if (!e) continue;
      if (String(it.cost ?? '') !== String(e.cost ?? '')) return true;
      if ((it.expiresAt || '') !== (e.expiresAt || '')) return true;
    }
    return false;
  }, [order, vendorName, note, itemEdits]);

  const handleSave = async () => {
    if (!hasEdits) { setEditMode(false); return; }
    setSaving(true); setError('');
    try {
      const patch = {};
      if ((order.vendorName || '') !== vendorName) patch.vendorName = vendorName.trim();
      if ((order.note || '') !== note) patch.note = note.trim();

      const changed = [];
      for (const it of (order.items || [])) {
        const e = itemEdits[it.orderProductId];
        if (!e) continue;
        const c = consumption[it.batchId];
        if (c?.used) continue; // skip used items
        const update = { orderProductId: it.orderProductId };
        let dirty = false;
        if (String(it.cost ?? '') !== String(e.cost ?? '')) {
          update.cost = Number(e.cost) || 0; dirty = true;
        }
        if ((it.expiresAt || '') !== (e.expiresAt || '')) {
          update.expiresAt = e.expiresAt || null; dirty = true;
        }
        if (dirty) changed.push(update);
      }
      if (changed.length > 0) patch.items = changed;

      await updateStockOrder(orderId, patch);
      setSuccess(true);
      setTimeout(() => { onSaved?.(); onClose?.(); }, 500);
    } catch (e) { setError(e.message || 'บันทึกไม่สำเร็จ'); setSaving(false); }
  };

  const handleCancelOrder = async () => {
    const msg = `ยกเลิก Order ${orderId}?\nทุก batch ที่นำเข้าจะถูก mark cancel. ถ้ามีของถูกใช้แล้ว ระบบจะบล็อก`;
    if (!confirm(msg)) return;
    setSaving(true); setError('');
    try {
      await cancelStockOrder(orderId, { reason: '', user: currentAuditUser() });
      onSaved?.();
      onClose?.();
    } catch (e) { setError(e.message || 'ยกเลิกไม่สำเร็จ'); setSaving(false); }
  };

  const total = order ? (order.items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.cost) || 0), 0) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--bg-surface)] rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[var(--bg-surface)] border-b border-[var(--bd)] px-5 py-3 flex items-center gap-3">
          <Package size={18} className="text-rose-400" />
          <h2 className="text-base font-bold text-[var(--tx-heading)]">รายละเอียด Order</h2>
          <span className="font-mono text-sky-400 text-sm">{orderId}</span>
          {order?.status === 'cancelled' && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-900/30 text-red-400 border border-red-800">ยกเลิกแล้ว</span>
          )}
          <div className="flex-1" />
          {canEdit && !editMode && !loading && (
            <>
              <button onClick={() => setEditMode(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-rose-400 border border-[var(--bd)] hover:border-rose-700 flex items-center gap-1.5">
                <Edit3 size={12} /> แก้ไข
              </button>
              <button onClick={handleCancelOrder} disabled={hasUsedItems}
                title={hasUsedItems ? 'มีสินค้าถูกใช้แล้ว — ยกเลิกไม่ได้' : 'ยกเลิก Order ทั้งใบ'}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-900/20 text-red-400 hover:bg-red-900/40 border border-red-800 hover:border-red-600 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5">
                <Trash2 size={12} /> ยกเลิก Order
              </button>
            </>
          )}
          {editMode && (
            <>
              <button onClick={() => { setEditMode(false); load(); }}
                className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-hover)] text-[var(--tx-muted)] border border-[var(--bd)]">ยกเลิก</button>
              <button onClick={handleSave} disabled={saving || !hasEdits}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-rose-700 text-white hover:bg-rose-600 disabled:opacity-40 flex items-center gap-1.5 shadow-[0_0_15px_rgba(244,63,94,0.3)]">
                {saving ? <Loader2 size={12} className="animate-spin" /> : success ? <CheckCircle2 size={12} /> : <Save size={12} />}
                {saving ? 'กำลังบันทึก' : success ? 'สำเร็จ' : 'บันทึก'}
              </button>
            </>
          )}
          <button onClick={onClose} className="ml-1 p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--tx-muted)]" title="ปิด"><X size={16} /></button>
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
            {/* Header info grid */}
            <div className="bg-[var(--bg-hover)]/50 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">Vendor / คู่ค้า</div>
                {editMode ? (
                  <input type="text" value={vendorName} onChange={e => setVendorName(e.target.value)}
                    className="w-full px-2 py-1 rounded bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)]" />
                ) : (
                  <div className="text-sm text-[var(--tx-primary)]">{order.vendorName || '-'}</div>
                )}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">วันที่นำเข้า</div>
                <div className="text-sm text-[var(--tx-primary)]">{order.importedDate || '-'}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">สาขา</div>
                <div className="text-sm text-[var(--tx-primary)]" data-testid="order-detail-branch-name">
                  {resolveBranchName(order.branchId, branches) || (order.branchId === 'main' ? 'สาขาหลัก' : '-')}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">ยอดรวม</div>
                <div className="font-mono text-orange-400 font-bold">฿{fmtMoney(total)}</div>
              </div>
              <div className="col-span-2 md:col-span-4">
                <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-1">หมายเหตุ</div>
                {editMode ? (
                  <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                    className="w-full px-2 py-1 rounded bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)] resize-none" />
                ) : (
                  <div className="text-sm text-[var(--tx-primary)]">{order.note || '-'}</div>
                )}
              </div>
            </div>

            {/* Items table */}
            <div>
              <h3 className="text-sm font-bold text-[var(--tx-heading)] mb-2 flex items-center gap-2">
                <Package size={14} /> รายการ ({(order.items || []).length})
              </h3>
              <div className="overflow-x-auto rounded-lg border border-[var(--bd)]">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase tracking-wider">
                    <tr>
                      <th className="px-2 py-2 text-left font-bold w-8">#</th>
                      <th className="px-2 py-2 text-left font-bold">สินค้า</th>
                      <th className="px-2 py-2 text-left font-bold w-24">Batch</th>
                      <th className="px-2 py-2 text-right font-bold w-20">จำนวน</th>
                      <th className="px-2 py-2 text-right font-bold w-24">ต้นทุน/หน่วย</th>
                      <th className="px-2 py-2 text-left font-bold w-36">วันหมดอายุ</th>
                      <th className="px-2 py-2 text-center font-bold w-12">ของแถม</th>
                      <th className="px-2 py-2 text-center font-bold w-24">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(order.items || []).map((it, idx) => {
                      const c = consumption[it.batchId];
                      const isUsed = !!c?.used;
                      const isCancelled = order.status === 'cancelled';
                      const edit = itemEdits[it.orderProductId] || { cost: '', expiresAt: '' };
                      const editable = editMode && !isUsed && !isCancelled;
                      return (
                        <tr key={it.orderProductId || idx} className={`border-t border-[var(--bd)] ${isUsed ? 'bg-orange-900/10' : ''}`}>
                          <td className="px-2 py-2 text-center text-[var(--tx-muted)]">{idx + 1}</td>
                          <td className="px-2 py-2 text-[var(--tx-primary)]">
                            <div>{it.productName || '-'}</div>
                            {it.unit && <div className="text-[9px] text-[var(--tx-muted)]">หน่วย: {it.unit}</div>}
                          </td>
                          <td className="px-2 py-2 font-mono text-[10px] text-sky-400" title={it.batchId}>
                            {it.batchId ? `…${it.batchId.slice(-8)}` : '-'}
                          </td>
                          <td className="px-2 py-2 text-right font-mono">{fmtQty(it.qty)}</td>
                          <td className="px-2 py-2 text-right">
                            {editable ? (
                              <input type="number" step="0.01" min="0" value={edit.cost}
                                onChange={e => setItemEdits(prev => ({
                                  ...prev,
                                  [it.orderProductId]: { ...(prev[it.orderProductId] || {}), cost: e.target.value },
                                }))}
                                className="w-24 px-2 py-1 rounded text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-right text-[var(--tx-primary)]" />
                            ) : (
                              <span className="font-mono text-orange-400">{fmtMoney(it.cost)}</span>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            {editable ? (
                              <DateField value={edit.expiresAt} onChange={v => setItemEdits(prev => ({
                                ...prev,
                                [it.orderProductId]: { ...(prev[it.orderProductId] || {}), expiresAt: v },
                              }))} locale="ce" size="sm" />
                            ) : (
                              <span className="text-[var(--tx-primary)]">{it.expiresAt || '-'}</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {it.isPremium ? <span className="text-rose-400">✓</span> : <span className="text-[var(--tx-muted)]">-</span>}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {isCancelled ? (
                              <span className="px-2 py-0.5 rounded text-[9px] bg-red-900/30 text-red-400 border border-red-800">ยกเลิก</span>
                            ) : isUsed ? (
                              <span className="px-2 py-0.5 rounded text-[9px] bg-orange-900/30 text-orange-400 border border-orange-800"
                                title={`${c.count} movements, ใช้ไป ${fmtQty(c.totalOut)}`}>
                                ใช้แล้ว ({fmtQty(c.totalOut)})
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[9px] bg-emerald-900/30 text-emerald-400 border border-emerald-800">พร้อมใช้</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {editMode && (
                <div className="mt-3 text-[10px] text-[var(--tx-muted)] flex items-start gap-1.5 p-2 rounded bg-orange-950/20 border border-orange-900/30">
                  <AlertCircle size={11} className="flex-shrink-0 mt-0.5 text-orange-400" />
                  <div>
                    <div>แก้ไขได้เฉพาะ <b>ต้นทุน</b> และ <b>วันหมดอายุ</b> ของ batch ที่ยังไม่ถูกใช้</div>
                    <div>— จำนวนแก้ไม่ได้ (ต้องใช้ "ปรับสต็อก" เพื่อ log การเปลี่ยนแปลง)</div>
                    <div>— ลบรายการย่อยไม่ได้ ต้องยกเลิกทั้งใบ (ซึ่งจะบล็อกถ้ามีของถูกใช้)</div>
                  </div>
                </div>
              )}
            </div>

            {order.status === 'cancelled' && (
              <div className="bg-red-950/30 border border-red-900/50 rounded-lg p-3 text-xs space-y-1">
                <div className="font-bold text-red-400">Order นี้ถูกยกเลิก</div>
                <div className="text-[var(--tx-muted)]">เหตุผล: {order.cancelReason || '-'}</div>
                <div className="text-[var(--tx-muted)]">วันที่ยกเลิก: {order.cancelledAt || '-'}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
