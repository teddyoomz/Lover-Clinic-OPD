// ─── StockTransferPanel — inter-location stock transfer (Phase 8f) ──────────
// State machine: 0 รอส่ง → 1 รอรับ → 2 สำเร็จ ; 0|1 → 3 ยกเลิก ; 1 → 4 ปฏิเสธ
// Each state transition triggers stock mutations via backendClient. UI shows
// available actions per current status.

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Truck, Plus, Trash2, X, Loader2, AlertCircle, CheckCircle2, ArrowLeft,
  Send, PackageCheck, XCircle, Ban, ArrowRightLeft,
} from 'lucide-react';
import {
  listStockTransfers, createStockTransfer, updateStockTransferStatus,
  listStockLocations, listStockBatches,
  // 2026-04-27 actor tracking
  listAllSellers,
} from '../../lib/backendClient.js';
import { fmtSlashDateTime } from '../../lib/dateFormat.js';
import TransferDetailModal from './TransferDetailModal.jsx';
import ActorPicker, { resolveActorUser } from './ActorPicker.jsx';
import ActorConfirmModal from './ActorConfirmModal.jsx';
// Phase 15.4 (2026-04-28) — shared 20/page pager.
import Pagination from './Pagination.jsx';
import { usePagination } from '../../lib/usePagination.js';

function fmtQty(n) { return Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }
const fmtDate = fmtSlashDateTime;

const STATUS_INFO = {
  0: { label: 'รอส่ง', color: 'amber' },
  1: { label: 'รอรับ', color: 'sky' },
  2: { label: 'สำเร็จ', color: 'emerald' },
  3: { label: 'ยกเลิก', color: 'red' },
  4: { label: 'ปฏิเสธ', color: 'red' },
};
const STATUS_BADGE = {
  amber: 'bg-orange-900/30 text-orange-400 border-orange-800',
  sky: 'bg-sky-900/30 text-sky-400 border-sky-800',
  emerald: 'bg-emerald-900/30 text-emerald-400 border-emerald-800',
  red: 'bg-red-900/30 text-red-400 border-red-800',
};

export default function StockTransferPanel({ clinicSettings, theme, filterLocationId }) {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [locations, setLocations] = useState([]);
  const [detailId, setDetailId] = useState(null);
  // 2026-04-27 actor tracking — eager-load sellers + pending-action state
  // for the ActorConfirmModal (replaces confirm()+prompt() for 4 transitions)
  const [sellers, setSellers] = useState([]);
  const [sellersLoading, setSellersLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState(null);  // { transfer, next }
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listAllSellers();
        if (!cancelled && Array.isArray(list)) setSellers(list);
      } catch (e) {
        console.error('[StockTransferPanel] listAllSellers failed:', e);
      } finally {
        if (!cancelled) setSellersLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Phase 15.1 — when caller supplies filterLocationId, only show transfers
  // where source OR destination matches it (central-warehouse-focused view).
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tr, locs] = await Promise.all([
        listStockTransfers(filterLocationId ? { locationId: filterLocationId } : undefined),
        listStockLocations(),
      ]);
      setTransfers(tr);
      setLocations(locs);
    } catch (e) { console.error('[Transfer]', e); }
    finally { setLoading(false); }
  }, [filterLocationId]);

  useEffect(() => { load(); }, [load]);

  // Phase 15.4 — pagination 20/page recent-first. Reset on filter-location change.
  // listStockTransfers already sorts createdAt DESC.
  const { page, setPage, totalPages, visibleItems, totalCount } = usePagination(transfers, {
    key: String(filterLocationId || ''),
  });

  const locationName = useCallback((id) => locations.find(l => l.id === id)?.name || id, [locations]);

  // 2026-04-27 actor tracking — opens ActorConfirmModal instead of native
  // confirm(). User must pick "ผู้ทำรายการ" + (for cancel/reject) reason.
  // The picked actor is passed to updateStockTransferStatus so the emitted
  // EXPORT_TRANSFER / RECEIVE / reverse movements record WHO triggered them.
  const handleTransition = (t, next) => setPendingAction({ transfer: t, next });

  if (formOpen) {
    return <TransferCreateForm
      locations={locations}
      sellers={sellers}
      sellersLoading={sellersLoading}
      onClose={() => setFormOpen(false)}
      onSaved={async () => { setFormOpen(false); await load(); }}
    />;
  }

  return (
    <div className="space-y-4">
      <div className="bg-[var(--bg-surface)] rounded-2xl p-5 shadow-lg" style={{ border: '1.5px solid rgba(244,63,94,0.15)' }}>
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-sky-900/30 border border-sky-800">
            <Truck size={22} className="text-sky-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-[var(--tx-heading)]">โอนย้ายสต็อก (Transfer)</h2>
            <p className="text-xs text-[var(--tx-muted)]">ย้ายสต็อกระหว่างสาขา/คลังกลาง — state 0→1→2 (สำเร็จ)</p>
          </div>
          <button onClick={() => setFormOpen(true)}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-sky-700 text-white hover:bg-sky-600 flex items-center gap-1.5">
            <Plus size={14} /> สร้างใบโอน
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-[var(--tx-muted)] text-xs">
          <Loader2 size={16} className="animate-spin mr-2" /> กำลังโหลด...
        </div>
      ) : transfers.length === 0 ? (
        <div className="bg-[var(--bg-surface)] rounded-2xl p-8 text-center border border-[var(--bd)]">
          <Truck size={32} className="mx-auto text-[var(--tx-muted)] mb-2" />
          <p className="text-xs text-[var(--tx-muted)]">ยังไม่มีใบโอนย้าย — กด "สร้างใบโอน"</p>
        </div>
      ) : (
        <div className="bg-[var(--bg-surface)] rounded-2xl overflow-x-auto shadow-lg border border-[var(--bd)]">
          <table className="w-full text-xs min-w-[900px]">
            <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left font-bold">เลขที่</th>
                <th className="px-3 py-2 text-left font-bold">วันที่</th>
                <th className="px-3 py-2 text-left font-bold">ต้นทาง → ปลายทาง</th>
                <th className="px-3 py-2 text-center font-bold">รายการ</th>
                <th className="px-3 py-2 text-center font-bold">สถานะ</th>
                <th className="px-3 py-2 text-right font-bold">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map(t => {
                const s = Number(t.status);
                const info = STATUS_INFO[s] || { label: '-', color: 'amber' };
                return (
                  <tr key={t.transferId} onClick={() => setDetailId(t.transferId)}
                    className="border-t border-[var(--bd)] hover:bg-[var(--bg-hover)] cursor-pointer">
                    <td className="px-3 py-2 font-mono text-sky-400">{t.transferId}</td>
                    <td className="px-3 py-2 text-[var(--tx-muted)] whitespace-nowrap">{fmtDate(t.createdAt)}</td>
                    <td className="px-3 py-2 text-[var(--tx-primary)] text-[11px]">
                      <span>{locationName(t.sourceLocationId)}</span>
                      <ArrowRightLeft size={10} className="inline mx-1 text-[var(--tx-muted)]" />
                      <span>{locationName(t.destinationLocationId)}</span>
                    </td>
                    <td className="px-3 py-2 text-center">{(t.items || []).length}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${STATUS_BADGE[info.color]}`}>{info.label}</span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setDetailId(t.transferId)}
                        className="px-2 py-1 rounded text-[10px] bg-sky-900/20 hover:bg-sky-900/40 text-sky-400 border border-sky-800 hover:border-sky-600 mr-1" title="ดูรายละเอียด">ดู</button>
                      {s === 0 && (
                        <>
                          <button onClick={() => handleTransition(t, 1)} className="px-2 py-1 rounded text-[10px] bg-sky-900/20 hover:bg-sky-900/40 text-sky-400 border border-sky-800 inline-flex items-center gap-1 mr-1" title="ส่งของ"><Send size={10} /> ส่ง</button>
                          <button onClick={() => handleTransition(t, 3)} className="px-2 py-1 rounded text-[10px] bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-800 inline-flex items-center gap-1" title="ยกเลิก"><XCircle size={10} /> ยกเลิก</button>
                        </>
                      )}
                      {s === 1 && (
                        <>
                          <button onClick={() => handleTransition(t, 2)} className="px-2 py-1 rounded text-[10px] bg-emerald-900/20 hover:bg-emerald-900/40 text-emerald-400 border border-emerald-800 inline-flex items-center gap-1 mr-1" title="ยืนยันรับของ"><PackageCheck size={10} /> รับ</button>
                          <button onClick={() => handleTransition(t, 3)} className="px-2 py-1 rounded text-[10px] bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-800 inline-flex items-center gap-1 mr-1" title="ยกเลิก"><XCircle size={10} /> ยกเลิก</button>
                          <button onClick={() => handleTransition(t, 4)} className="px-2 py-1 rounded text-[10px] bg-[var(--bg-hover)] hover:bg-red-900/30 text-[var(--tx-muted)] hover:text-red-400 border border-[var(--bd)] inline-flex items-center gap-1" title="ปฏิเสธ"><Ban size={10} /> ปฏิเสธ</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalCount={totalCount} />
        </div>
      )}

      {detailId && (
        <TransferDetailModal transferId={detailId} onClose={() => setDetailId(null)} />
      )}

      {/* 2026-04-27 actor tracking — confirm transition with required ผู้ทำรายการ */}
      <ActorConfirmModal
        open={!!pendingAction}
        title={pendingAction
          ? (() => {
            const labels = { 1: 'ส่งของ', 2: 'ยืนยันรับสินค้า', 3: 'ยกเลิก', 4: 'ปฏิเสธ' };
            return `${labels[pendingAction.next] || 'เปลี่ยนสถานะ'} — ${pendingAction.transfer.transferId}`;
          })()
          : ''}
        message={pendingAction && (pendingAction.next === 1
          ? 'ระบบจะหักสต็อกจากต้นทาง + เขียน EXPORT_TRANSFER movement (type 8)'
          : pendingAction.next === 2
            ? 'ระบบจะสร้าง batch ที่ปลายทาง + เขียน RECEIVE movement (type 9)'
            : 'ระบบจะ reverse EXPORT_TRANSFER ถ้าสถานะ 1 ก่อนหน้านี้')}
        actionLabel={pendingAction
          ? ({ 1: 'ส่งของ', 2: 'ยืนยันรับ', 3: 'ยกเลิก', 4: 'ปฏิเสธ' }[pendingAction.next] || 'ยืนยัน')
          : 'ยืนยัน'}
        actionColor={pendingAction && (pendingAction.next === 3 || pendingAction.next === 4) ? 'red' : 'sky'}
        sellers={sellers}
        sellersLoading={sellersLoading}
        reasonOptional={pendingAction && (pendingAction.next === 3 || pendingAction.next === 4)}
        reasonLabel={pendingAction
          ? (pendingAction.next === 3 ? 'เหตุผลการยกเลิก' : pendingAction.next === 4 ? 'เหตุผลการปฏิเสธ' : 'หมายเหตุ')
          : 'หมายเหตุ'}
        onCancel={() => setPendingAction(null)}
        onConfirm={async ({ actor, reason }) => {
          const t = pendingAction.transfer;
          const next = pendingAction.next;
          const extra = { user: actor };
          if (next === 3) extra.canceledNote = reason;
          if (next === 4) extra.rejectedNote = reason;
          await updateStockTransferStatus(t.transferId, next, extra);
          setPendingAction(null);
          await load();
        }}
      />
    </div>
  );
}

function TransferCreateForm({ locations, sellers, sellersLoading, onClose, onSaved }) {
  // 2026-04-27 actor tracking — required ผู้ทำรายการ picker
  const [actorId, setActorId] = useState('');
  const [src, setSrc] = useState('main');
  const [dst, setDst] = useState('');
  const [note, setNote] = useState('');
  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [items, setItems] = useState([{ sourceBatchId: '', qty: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!src) { setBatches([]); return; }
    let cancelled = false;
    setBatchesLoading(true);
    (async () => {
      try {
        const list = await listStockBatches({ branchId: src, status: 'active' });
        if (!cancelled) setBatches(list);
      } catch (e) { if (!cancelled) setBatches([]); }
      finally { if (!cancelled) setBatchesLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [src]);

  const updateItem = (idx, patch) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  const addItem = () => setItems(prev => [...prev, { sourceBatchId: '', qty: '' }]);
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  const validItems = items.filter(it => it.sourceBatchId && Number(it.qty) > 0);
  const actorUser = resolveActorUser(actorId, sellers);
  const canSave = src && dst && src !== dst && validItems.length > 0 && !!actorUser;

  const handleSave = async () => {
    if (!canSave) {
      if (!actorUser) setError('กรุณาเลือกผู้ทำรายการก่อนบันทึก');
      else setError('กรุณากรอกต้นทาง ปลายทาง และ batch อย่างน้อย 1 รายการ');
      return;
    }
    setSaving(true); setError('');
    try {
      await createStockTransfer({
        sourceLocationId: src,
        destinationLocationId: dst,
        note,
        items: validItems.map(it => ({ sourceBatchId: it.sourceBatchId, qty: Number(it.qty) })),
      }, { user: actorUser });
      setSuccess(true);
      setTimeout(onSaved, 500);
    } catch (e) { setError(e.message); setSaving(false); }
  };

  const inputCls = `w-full px-2.5 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)]`;
  const labelCls = 'block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1 font-bold';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 bg-[var(--bg-surface)] rounded-2xl p-4 shadow-lg border border-[var(--bd)]">
        <button onClick={onClose} className="px-3 py-2 rounded-lg text-xs bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-[var(--tx-primary)] border border-[var(--bd)] flex items-center gap-1.5">
          <ArrowLeft size={14} /> กลับ
        </button>
        <div className="flex-1">
          <h2 className="text-base font-bold text-[var(--tx-heading)]">สร้างใบโอนย้ายสต็อก</h2>
          <p className="text-xs text-[var(--tx-muted)]">เลือก batch ต้นทาง + qty ที่จะย้ายไปปลายทาง (status เริ่มที่ 0 รอส่ง)</p>
        </div>
        <button onClick={handleSave} disabled={!canSave || saving} className="px-5 py-2 rounded-lg text-xs font-bold bg-sky-700 text-white hover:bg-sky-600 disabled:opacity-40 flex items-center gap-1.5">
          {saving ? <Loader2 size={14} className="animate-spin" /> : success ? <CheckCircle2 size={14} /> : <Plus size={14} />}
          {saving ? 'กำลังบันทึก' : success ? 'สำเร็จ' : 'สร้าง'}
        </button>
      </div>
      {error && <div className="bg-red-950/40 border border-red-800 rounded-lg p-3 text-xs text-red-400 flex items-start gap-2"><AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {error}</div>}

      <div className="bg-[var(--bg-surface)] rounded-2xl p-5 shadow-lg border border-[var(--bd)] space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>ต้นทาง *</label>
            <select value={src} onChange={e => setSrc(e.target.value)} className={inputCls}>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>ปลายทาง *</label>
            <select value={dst} onChange={e => setDst(e.target.value)} className={inputCls}>
              <option value="">— เลือกปลายทาง —</option>
              {locations.filter(l => l.id !== src).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>หมายเหตุ</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} className={inputCls} placeholder="เช่น ย้ายเพื่อเติมสต็อกสาขาหลัก" />
          </div>
        </div>
        {/* 2026-04-27 actor tracking — required ผู้ทำรายการ picker */}
        <div className="mt-3">
          <ActorPicker
            value={actorId}
            onChange={setActorId}
            sellers={sellers}
            loading={sellersLoading}
            inputCls={inputCls}
            testId="transfer-create-actor"
          />
        </div>
      </div>

      <div className="bg-[var(--bg-surface)] rounded-2xl p-5 shadow-lg border border-[var(--bd)]">
        <h3 className="text-sm font-bold text-[var(--tx-heading)] mb-3">รายการ batch ที่จะย้าย</h3>
        {batchesLoading ? (
          <div className="text-[11px] text-[var(--tx-muted)] flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> โหลด batch ของต้นทาง...</div>
        ) : batches.length === 0 ? (
          <div className="text-[11px] text-[var(--tx-muted)]">ต้นทางยังไม่มี batch ที่ active — สร้าง Order ก่อน</div>
        ) : (
          <>
            <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[500px]">
              <thead className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)]">
                <tr>
                  <th className="px-2 py-2 w-8">#</th>
                  <th className="px-2 py-2 text-left font-bold">Batch ต้นทาง *</th>
                  <th className="px-2 py-2 text-left font-bold w-20">จำนวน *</th>
                  <th className="px-2 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const b = batches.find(x => x.batchId === it.sourceBatchId);
                  return (
                    <tr key={idx} className="border-t border-[var(--bd)]">
                      <td className="px-2 py-2 text-center text-[var(--tx-muted)]">{idx + 1}</td>
                      <td className="px-2 py-2">
                        <select value={it.sourceBatchId} onChange={e => updateItem(idx, { sourceBatchId: e.target.value })} className={inputCls}>
                          <option value="">— เลือก batch —</option>
                          {batches.map(x => (
                            <option key={x.batchId} value={x.batchId}>
                              {x.productName} — ...{x.batchId.slice(-8)} ({fmtQty(x.qty.remaining)}/{fmtQty(x.qty.total)} {x.unit}{x.expiresAt ? `, หมด ${x.expiresAt}` : ''})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" min="0" step="0.01" value={it.qty} onChange={e => updateItem(idx, { qty: e.target.value })} className={inputCls}
                          max={b ? b.qty.remaining : undefined} />
                        {b && Number(it.qty) > Number(b.qty.remaining) && <div className="text-[9px] text-red-400 mt-0.5">เกินคงเหลือ {b.qty.remaining}</div>}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button onClick={() => removeItem(idx)} disabled={items.length === 1}
                          className="p-1 rounded text-[var(--tx-muted)] hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"><X size={12} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <button onClick={addItem} className="mt-3 px-3 py-2 rounded-lg text-xs font-bold bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-sky-400 border border-[var(--bd)] hover:border-sky-700 flex items-center gap-1.5">
              <Plus size={12} /> เพิ่ม batch
            </button>
          </>
        )}
      </div>
    </div>
  );
}
