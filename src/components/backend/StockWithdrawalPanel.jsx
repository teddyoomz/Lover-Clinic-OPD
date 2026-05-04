// ─── StockWithdrawalPanel — branch↔central requisitions (Phase 8g) ──────────
// State machine: 0 รอยืนยัน → 1 รอส่ง → 2 สำเร็จ ; 0|1 → 3 ยกเลิก
// Reuses most of TransferPanel's shape + direction selector at top.

import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardCheck, Plus, Loader2, AlertCircle, CheckCircle2, ArrowLeft, X,
  Send, PackageCheck, XCircle, ArrowRightLeft,
} from 'lucide-react';
import {
  listStockWithdrawals, createStockWithdrawal, updateStockWithdrawalStatus,
  listStockLocations, listStockBatches,
  // 2026-04-27 actor tracking
  listAllSellers,
} from '../../lib/scopedDataLayer.js';
import { fmtSlashDateTime } from '../../lib/dateFormat.js';
import WithdrawalDetailModal from './WithdrawalDetailModal.jsx';
import ActorPicker, { resolveActorUser } from './ActorPicker.jsx';
import ActorConfirmModal from './ActorConfirmModal.jsx';
// Phase 15.4 (2026-04-28) — shared 20/page pager.
import Pagination from './Pagination.jsx';
import { usePagination } from '../../lib/usePagination.js';
// Phase 15.4 fix — gate legacy-main fallback to branch-tier source only.
import { deriveLocationType, LOCATION_TYPE } from '../../lib/stockUtils.js';
// Phase 15.7-bis (2026-04-28) — banner UX for auto-repay of negative balances.
import { formatNegativeRepayBanner, hasNegativeRepay } from '../../lib/negativeRepayBanner.js';
// Phase 15.6 / V35.1 (2026-04-28) — searchable batch picker (Rule C1).
import BatchSelectField from './BatchSelectField.jsx';

function fmtQty(n) { return Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }
const fmtDate = fmtSlashDateTime;

const STATUS_INFO = {
  0: { label: 'รอยืนยัน', color: 'amber' },
  1: { label: 'รอส่ง', color: 'sky' },
  2: { label: 'สำเร็จ', color: 'emerald' },
  3: { label: 'ยกเลิก', color: 'red' },
};
const STATUS_BADGE = {
  amber: 'bg-orange-900/30 text-orange-400 border-orange-800',
  sky: 'bg-sky-900/30 text-sky-400 border-sky-800',
  emerald: 'bg-emerald-900/30 text-emerald-400 border-emerald-800',
  red: 'bg-red-900/30 text-red-400 border-red-800',
};

export default function StockWithdrawalPanel({ clinicSettings, theme, filterLocationId }) {
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [locations, setLocations] = useState([]);
  const [detailId, setDetailId] = useState(null);
  // 2026-04-27 actor tracking
  // Phase 15.5A (2026-04-28) — branch filter via filterLocationId when present.
  const [sellers, setSellers] = useState([]);
  const [sellersLoading, setSellersLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState(null);  // { withdrawal, next }
  const [repayBanner, setRepayBanner] = useState('');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSellersLoading(true);
      try {
        const list = await listAllSellers({ branchId: filterLocationId });
        if (!cancelled && Array.isArray(list)) setSellers(list);
      } catch (e) { console.error('[StockWithdrawalPanel] listAllSellers failed:', e); }
      finally { if (!cancelled) setSellersLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [filterLocationId]);

  // Phase 15.1 — when caller supplies filterLocationId, only show withdrawals
  // where source OR destination matches it (central-warehouse-focused view).
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, locs] = await Promise.all([
        listStockWithdrawals(filterLocationId ? { locationId: filterLocationId } : undefined),
        listStockLocations(),
      ]);
      setWithdrawals(list); setLocations(locs);
    } catch (e) { console.error('[Withdrawal]', e); }
    finally { setLoading(false); }
  }, [filterLocationId]);
  useEffect(() => { load(); }, [load]);

  // Phase 15.4 — pagination 20/page recent-first. Reset on filter change.
  const { page, setPage, totalPages, visibleItems, totalCount } = usePagination(withdrawals, {
    key: String(filterLocationId || ''),
  });

  const locationName = useCallback((id) => locations.find(l => l.id === id)?.name || id, [locations]);

  // 2026-04-27 actor tracking — opens ActorConfirmModal instead of confirm()
  const handleTransition = (w, next) => setPendingAction({ withdrawal: w, next });

  if (formOpen) {
    return <WithdrawalCreateForm
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
          <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-violet-900/30 border border-violet-800">
            <ClipboardCheck size={22} className="text-violet-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-[var(--tx-heading)]">เบิกสต็อก (Withdrawal)</h2>
            <p className="text-xs text-[var(--tx-muted)]">สาขาเบิกจากคลังกลาง / คลังกลางส่งให้สาขา — state 0→1→2</p>
          </div>
          <button onClick={() => setFormOpen(true)}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-violet-700 text-white hover:bg-violet-600 flex items-center gap-1.5">
            <Plus size={14} /> สร้างใบเบิก
          </button>
        </div>
      </div>

      {/* Phase 15.7-bis — repay banner when receive auto-cleared negative balances. */}
      {repayBanner && (
        <div
          className="bg-emerald-950/40 border border-emerald-800 rounded-lg p-3 text-xs text-emerald-300 whitespace-pre-line flex items-start gap-2"
          data-testid="negative-repay-banner"
        >
          <span className="flex-1">{repayBanner}</span>
          <button onClick={() => setRepayBanner('')} className="text-emerald-400 hover:text-emerald-200 text-xs" aria-label="ปิด">×</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-[var(--tx-muted)] text-xs">
          <Loader2 size={16} className="animate-spin mr-2" /> กำลังโหลด...
        </div>
      ) : withdrawals.length === 0 ? (
        <div className="bg-[var(--bg-surface)] rounded-2xl p-8 text-center border border-[var(--bd)]">
          <ClipboardCheck size={32} className="mx-auto text-[var(--tx-muted)] mb-2" />
          <p className="text-xs text-[var(--tx-muted)]">ยังไม่มีใบเบิก — กด "สร้างใบเบิก"</p>
        </div>
      ) : (
        <div className="bg-[var(--bg-surface)] rounded-2xl overflow-x-auto shadow-lg border border-[var(--bd)]">
          <table className="w-full text-xs min-w-[1000px]">
            <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left font-bold">เลขที่</th>
                <th className="px-3 py-2 text-left font-bold">วันที่</th>
                <th className="px-3 py-2 text-left font-bold">ทิศทาง</th>
                <th className="px-3 py-2 text-left font-bold">ต้นทาง → ปลายทาง</th>
                <th className="px-3 py-2 text-center font-bold">รายการ</th>
                <th className="px-3 py-2 text-center font-bold">สถานะ</th>
                <th className="px-3 py-2 text-right font-bold">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map(w => {
                const s = Number(w.status);
                const info = STATUS_INFO[s] || { label: '-', color: 'amber' };
                return (
                  <tr key={w.withdrawalId} onClick={() => setDetailId(w.withdrawalId)}
                    className="border-t border-[var(--bd)] hover:bg-[var(--bg-hover)] cursor-pointer">
                    <td className="px-3 py-2 font-mono text-violet-400">{w.withdrawalId}</td>
                    <td className="px-3 py-2 text-[var(--tx-muted)] whitespace-nowrap">{fmtDate(w.createdAt)}</td>
                    <td className="px-3 py-2 text-[var(--tx-primary)] text-[11px]">{w.direction === 'branch_to_central' ? 'สาขา→คลัง' : 'คลัง→สาขา'}</td>
                    <td className="px-3 py-2 text-[var(--tx-primary)] text-[11px]">
                      <span>{locationName(w.sourceLocationId)}</span>
                      <ArrowRightLeft size={10} className="inline mx-1 text-[var(--tx-muted)]" />
                      <span>{locationName(w.destinationLocationId)}</span>
                    </td>
                    <td className="px-3 py-2 text-center">{(w.items || []).length}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${STATUS_BADGE[info.color]}`}>{info.label}</span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setDetailId(w.withdrawalId)}
                        className="px-2 py-1 rounded text-[10px] bg-violet-900/20 hover:bg-violet-900/40 text-violet-400 border border-violet-800 hover:border-violet-600 mr-1" title="ดูรายละเอียด">ดู</button>
                      {s === 0 && (
                        <>
                          <button onClick={() => handleTransition(w, 1)} className="px-2 py-1 rounded text-[10px] bg-sky-900/20 hover:bg-sky-900/40 text-sky-400 border border-sky-800 inline-flex items-center gap-1 mr-1"><Send size={10} /> อนุมัติ</button>
                          <button onClick={() => handleTransition(w, 3)} className="px-2 py-1 rounded text-[10px] bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-800 inline-flex items-center gap-1"><XCircle size={10} /> ยกเลิก</button>
                        </>
                      )}
                      {s === 1 && (
                        <>
                          <button onClick={() => handleTransition(w, 2)} className="px-2 py-1 rounded text-[10px] bg-emerald-900/20 hover:bg-emerald-900/40 text-emerald-400 border border-emerald-800 inline-flex items-center gap-1 mr-1"><PackageCheck size={10} /> รับ</button>
                          <button onClick={() => handleTransition(w, 3)} className="px-2 py-1 rounded text-[10px] bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-800 inline-flex items-center gap-1"><XCircle size={10} /> ยกเลิก</button>
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
        <WithdrawalDetailModal withdrawalId={detailId} onClose={() => setDetailId(null)} />
      )}

      {/* 2026-04-27 actor tracking — confirm transition with required ผู้ทำรายการ */}
      <ActorConfirmModal
        open={!!pendingAction}
        title={pendingAction
          ? (() => {
            const labels = { 1: 'อนุมัติและส่งสินค้า', 2: 'ยืนยันรับสินค้า', 3: 'ยกเลิกใบเบิก' };
            return `${labels[pendingAction.next] || 'เปลี่ยนสถานะ'} — ${pendingAction.withdrawal.withdrawalId}`;
          })()
          : ''}
        message={pendingAction && (pendingAction.next === 1
          ? 'ระบบจะหักสต็อกจากต้นทาง + เขียน EXPORT_WITHDRAWAL movement (type 10)'
          : pendingAction.next === 2
            ? 'ระบบจะสร้าง batch ที่ปลายทาง + เขียน WITHDRAWAL_CONFIRM movement (type 13)'
            : 'ระบบจะ reverse EXPORT_WITHDRAWAL ถ้าสถานะ 1 ก่อนหน้านี้')}
        actionLabel={pendingAction
          ? ({ 1: 'อนุมัติ + ส่ง', 2: 'ยืนยันรับ', 3: 'ยกเลิก' }[pendingAction.next] || 'ยืนยัน')
          : 'ยืนยัน'}
        actionColor={pendingAction && pendingAction.next === 3 ? 'red' : 'violet'}
        sellers={sellers}
        sellersLoading={sellersLoading}
        reasonOptional={pendingAction && pendingAction.next === 3}
        reasonLabel={pendingAction && pendingAction.next === 3 ? 'เหตุผลการยกเลิก' : 'หมายเหตุ'}
        onCancel={() => setPendingAction(null)}
        onConfirm={async ({ actor, reason }) => {
          const w = pendingAction.withdrawal;
          const next = pendingAction.next;
          const extra = { user: actor };
          if (next === 3) extra.canceledNote = reason;
          const result = await updateStockWithdrawalStatus(w.withdrawalId, next, extra);
          // Phase 15.7-bis — banner when withdrawal-receive (status 1→2)
          // auto-cleared negative balances at the destination.
          if (next === 2 && hasNegativeRepay(result?.repays)) {
            setRepayBanner(formatNegativeRepayBanner(result.repays));
          } else if (next !== 2) {
            setRepayBanner('');
          }
          setPendingAction(null);
          await load();
        }}
      />
    </div>
  );
}

function WithdrawalCreateForm({ locations, sellers, sellersLoading, onClose, onSaved }) {
  // 2026-04-27 actor tracking — required ผู้ทำรายการ picker
  const [actorId, setActorId] = useState('');
  const [direction, setDirection] = useState('central_to_branch');
  // Central → branch: source=central warehouse, dest=branch
  // Branch → central: source=central warehouse (provides), dest=branch requests
  // Simpler: always pick source = where stock lives; dest = where stock goes
  const [src, setSrc] = useState('');
  const [dst, setDst] = useState('main');
  const [note, setNote] = useState('');
  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [items, setItems] = useState([{ sourceBatchId: '', qty: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Set defaults based on direction
  useEffect(() => {
    if (direction === 'central_to_branch') {
      // Source = central warehouse, Destination = branch
      const firstCentral = locations.find(l => l.kind === 'central');
      setSrc(firstCentral?.id || '');
      setDst('main');
    } else {
      // branch_to_central: Source = branch providing, Destination = central receiving
      setSrc('main');
      const firstCentral = locations.find(l => l.kind === 'central');
      setDst(firstCentral?.id || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction]);

  useEffect(() => {
    if (!src) { setBatches([]); return; }
    let cancelled = false;
    setBatchesLoading(true);
    (async () => {
      try {
        // Phase 15.4 (s19 item 2) — includeLegacyMain for pre-V20 batches.
        // Post-deploy bug 4 fix: only opt-in when source is branch tier.
        const isBranchSrc = deriveLocationType(src) === LOCATION_TYPE.BRANCH;
        const list = await listStockBatches({ branchId: src, status: 'active', includeLegacyMain: isBranchSrc });
        if (!cancelled) setBatches(list);
      } catch { if (!cancelled) setBatches([]); }
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
      else setError('กรุณากรอกให้ครบ');
      return;
    }
    setSaving(true); setError('');
    try {
      await createStockWithdrawal({
        direction,
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
          <h2 className="text-base font-bold text-[var(--tx-heading)]">สร้างใบเบิก</h2>
          <p className="text-xs text-[var(--tx-muted)]">เลือกทิศทาง + batch ต้นทาง + qty (เริ่มที่ status 0 รอยืนยัน)</p>
        </div>
        <button onClick={handleSave} disabled={!canSave || saving} className="px-5 py-2 rounded-lg text-xs font-bold bg-violet-700 text-white hover:bg-violet-600 disabled:opacity-40 flex items-center gap-1.5">
          {saving ? <Loader2 size={14} className="animate-spin" /> : success ? <CheckCircle2 size={14} /> : <Plus size={14} />}
          {saving ? 'กำลังบันทึก' : success ? 'สำเร็จ' : 'สร้าง'}
        </button>
      </div>
      {error && <div className="bg-red-950/40 border border-red-800 rounded-lg p-3 text-xs text-red-400 flex items-start gap-2"><AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {error}</div>}

      <div className="bg-[var(--bg-surface)] rounded-2xl p-5 shadow-lg border border-[var(--bd)] space-y-3">
        <div>
          <label className={labelCls}>ทิศทาง *</label>
          <div className="flex gap-3">
            <label className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer ${direction === 'central_to_branch' ? 'bg-violet-900/30 border-violet-700 text-violet-400' : 'bg-[var(--bg-hover)] border-[var(--bd)] text-[var(--tx-muted)]'}`}>
              <input type="radio" name="dir" value="central_to_branch" checked={direction === 'central_to_branch'} onChange={() => setDirection('central_to_branch')} className="accent-violet-500" />
              คลังกลาง → สาขา (ส่งให้สาขา)
            </label>
            <label className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer ${direction === 'branch_to_central' ? 'bg-violet-900/30 border-violet-700 text-violet-400' : 'bg-[var(--bg-hover)] border-[var(--bd)] text-[var(--tx-muted)]'}`}>
              <input type="radio" name="dir" value="branch_to_central" checked={direction === 'branch_to_central'} onChange={() => setDirection('branch_to_central')} className="accent-violet-500" />
              สาขา → คลังกลาง (คืนคลัง)
            </label>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>ต้นทาง *</label>
            <select value={src} onChange={e => setSrc(e.target.value)} className={inputCls}>
              <option value="">—</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>ปลายทาง *</label>
            <select value={dst} onChange={e => setDst(e.target.value)} className={inputCls}>
              <option value="">—</option>
              {locations.filter(l => l.id !== src).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>หมายเหตุ</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} className={inputCls} />
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
            testId="withdrawal-create-actor"
          />
        </div>
      </div>

      <div className="bg-[var(--bg-surface)] rounded-2xl p-5 shadow-lg border border-[var(--bd)]">
        <h3 className="text-sm font-bold text-[var(--tx-heading)] mb-3">รายการ batch ที่จะเบิก</h3>
        {batchesLoading ? (
          <div className="text-[11px] text-[var(--tx-muted)] flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> โหลด batch...</div>
        ) : batches.length === 0 ? (
          <div className="text-[11px] text-[var(--tx-muted)]">ต้นทางยังไม่มี batch ที่ active</div>
        ) : (
          <>
            <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[500px]">
              <thead className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)]">
                <tr>
                  <th className="px-2 py-2 w-8">#</th>
                  <th className="px-2 py-2 text-left font-bold">Batch ต้นทาง *</th>
                  {/* Phase 15.4 item 7 — auto-show unit when batch picked (no confusion) */}
                  <th className="px-2 py-2 text-left font-bold w-16">หน่วย</th>
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
                        <BatchSelectField
                          value={it.sourceBatchId}
                          options={batches}
                          onChange={(id) => updateItem(idx, { sourceBatchId: id })}
                          testId={`withdrawal-batch-${idx}`}
                          fieldKey={`withdrawal-item-${idx}-batch`}
                        />
                      </td>
                      {/* Phase 15.4 item 7 — auto-show unit (read-only) so user doesn't confuse units */}
                      <td className="px-2 py-2 text-[var(--tx-primary)] text-[11px]" data-testid={`withdrawal-unit-${idx}`}>
                        {b?.unit || <span className="text-[var(--tx-muted)]">-</span>}
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" min="0" step="0.01" value={it.qty} onChange={e => updateItem(idx, { qty: e.target.value })} className={inputCls} />
                        {b && Number(it.qty) > Number(b.qty.remaining) && <div className="text-[9px] text-red-400 mt-0.5">เกินคงเหลือ</div>}
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
            <button onClick={addItem} className="mt-3 px-3 py-2 rounded-lg text-xs font-bold bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-violet-400 border border-[var(--bd)] hover:border-violet-700 flex items-center gap-1.5">
              <Plus size={12} /> เพิ่ม batch
            </button>
          </>
        )}
      </div>
    </div>
  );
}
