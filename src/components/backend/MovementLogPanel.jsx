// ─── MovementLogPanel — read-only stock movement audit log ──────────────────
// Mirrors ProClinic /admin/stock-movement with filters: product, type, date.
// Types grouped per ProClinic UI: 1=นำเข้า, 14=ยกเลิกนำเข้า, 2|5=ขาย,
// 3|4=ปรับสต็อค, 6|7=รักษา, 8|10=ส่งออก, 9=รับเข้า, 12|13=เบิก.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Loader2, Activity, Filter, Search, Plus, Minus, Package } from 'lucide-react';
// Phase 14.10-tris (2026-04-26) — be_products canonical (was master_data mirror)
import { listStockMovements, listProducts, listStockLocations } from '../../lib/scopedDataLayer.js';
import { fmtSlashDateTime } from '../../lib/dateFormat.js';
import DateField from '../DateField.jsx';
import { useSelectedBranch, resolveBranchName } from '../../lib/BranchContext.jsx';
// Phase 15.4 (2026-04-28) — shared 20/page pager.
import Pagination from './Pagination.jsx';
import { usePagination } from '../../lib/usePagination.js';

// Tailwind needs explicit class names in source for JIT — no dynamic `bg-${color}`.
const BADGE_CLASSES = {
  emerald: 'bg-emerald-900/30 text-emerald-400 border-emerald-800',
  rose:    'bg-rose-900/30 text-rose-400 border-rose-800',
  amber:   'bg-orange-900/30 text-orange-400 border-orange-800',
  sky:     'bg-sky-900/30 text-sky-400 border-sky-800',
  violet:  'bg-violet-900/30 text-violet-400 border-violet-800',
  purple:  'bg-purple-900/30 text-purple-400 border-purple-800',
  red:     'bg-red-900/30 text-red-400 border-red-800',
  gray:    'bg-[var(--bg-hover)] text-[var(--tx-muted)] border-[var(--bd)]',
};

const TYPE_LABELS = {
  1: { label: 'นำเข้า', color: 'emerald', group: 'import' },
  2: { label: 'ขาย', color: 'rose', group: 'sale' },
  3: { label: 'ปรับเพิ่ม', color: 'emerald', group: 'adjust' },
  4: { label: 'ปรับลด', color: 'amber', group: 'adjust' },
  5: { label: 'ขาย (wholesale)', color: 'rose', group: 'sale' },
  6: { label: 'รักษา', color: 'sky', group: 'treatment' },
  7: { label: 'รักษา (ยา)', color: 'sky', group: 'treatment' },
  8: { label: 'ส่งออก (transfer)', color: 'violet', group: 'export' },
  9: { label: 'รับเข้า', color: 'emerald', group: 'receive' },
  10: { label: 'ส่งออก (withdrawal)', color: 'violet', group: 'export' },
  12: { label: 'เบิก (request)', color: 'purple', group: 'withdrawal' },
  13: { label: 'เบิก (confirm)', color: 'purple', group: 'withdrawal' },
  14: { label: 'ยกเลิกนำเข้า', color: 'red', group: 'cancel' },
  // Phase 15.4 (s19) — admin approval/rejection of withdrawal requests
  // (audit-only; no stock change — emitted from updateStockWithdrawalStatus).
  15: { label: 'อนุมัติเบิก', color: 'emerald', group: 'withdrawal' },
  16: { label: 'ปฏิเสธเบิก', color: 'red', group: 'withdrawal' },
};

// Filter groups: mimic ProClinic multi-type filter
const TYPE_GROUPS = [
  { id: '', label: 'ทุกประเภท', types: [] },
  { id: 'import', label: 'นำเข้า', types: [1] },
  { id: 'cancel', label: 'ยกเลิกนำเข้า', types: [14] },
  { id: 'sale', label: 'ขาย', types: [2, 5] },
  { id: 'adjust', label: 'ปรับสต็อก', types: [3, 4] },
  { id: 'treatment', label: 'รักษา', types: [6, 7] },
  { id: 'export', label: 'ส่งออก', types: [8, 10] },
  { id: 'receive', label: 'รับเข้า', types: [9] },
  { id: 'withdrawal', label: 'เบิก', types: [12, 13, 15, 16] },
];

const fmtDate = fmtSlashDateTime;

function fmtQty(n) {
  const num = Number(n || 0);
  return num.toLocaleString('th-TH', { maximumFractionDigits: 2 });
}

// Phase 15.4 post-deploy bug 2 v4 (2026-04-28) — counterparty label for the
// 4 cross-tier movement types. Each movement stays at ITS branch only; the
// label tells the user what's on the OTHER side. Computed from `branchIds`
// (Phase E metadata: [src, dst]).
//
// Types 8 + 10 are SOURCE-SIDE (we sent stock OUT). Counterparty = destination.
// Types 9 + 13 are DESTINATION-SIDE (we received stock IN). Counterparty = source.
const COUNTERPARTY_TEMPLATES = {
  8: 'ส่งออกไป',     // EXPORT_TRANSFER — outbound transfer to {dest}
  9: 'รับเข้าจาก',    // RECEIVE — inbound transfer from {src}
  10: 'เบิกโดย',      // EXPORT_WITHDRAWAL — withdrawn-by {requester=dest}
  13: 'รับเบิกจาก',   // WITHDRAWAL_CONFIRM — received-via-withdrawal-from {src}
};

function getCounterpartyId(m) {
  if (!Array.isArray(m?.branchIds) || m.branchIds.length < 2) return null;
  const own = String(m.branchId || '');
  const other = m.branchIds.find((b) => String(b) !== own);
  return other ? String(other) : null;
}

export default function MovementLogPanel({ clinicSettings, theme, branchIdOverride }) {
  // Phase 14.7.H follow-up A — branch-scoped audit log queries.
  // Phase 15.1 — branchIdOverride lets CentralStockTab query a central
  // warehouse's movements without changing the global BranchContext.
  const { branchId: ctxBranchId, branches } = useSelectedBranch();
  const BRANCH_ID = branchIdOverride || ctxBranchId;

  // Phase 17.2 (2026-05-05): legacy-main fallback removed — migration
  // script rewrites all legacy `branchId='main'` movements to real branch
  // IDs. Strict branchId filter via listStockMovements.
  const isDark = theme === 'dark';
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  // Phase 15.4 post-deploy bug 2 v4 — counterparty name lookup
  const [locations, setLocations] = useState([]);
  const [productId, setProductId] = useState('');
  const [typeGroup, setTypeGroup] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [includeReversed, setIncludeReversed] = useState(false);

  // Load products for filter dropdown
  useEffect(() => {
    (async () => {
      try { setProducts(await listProducts() || []); }
      catch { setProducts([]); }
    })();
  }, []);

  // Load locations for counterparty name resolution (Phase 15.4 bug 2 v4)
  useEffect(() => {
    (async () => {
      try { setLocations(await listStockLocations() || []); }
      catch { setLocations([]); }
    })();
  }, []);

  // Resolve counterparty's human-readable name from id.
  // Lookup chain: listStockLocations (covers 'main' + WH-*) → be_branches
  // (covers BR-*) → fall back to id itself if nothing matches.
  const resolveCounterpartyName = useCallback((id) => {
    if (!id) return '';
    const fromLoc = locations.find((l) => String(l?.id) === String(id));
    if (fromLoc?.name) return String(fromLoc.name);
    const fromBranch = resolveBranchName(id, branches);
    if (fromBranch) return fromBranch;
    return String(id);
  }, [locations, branches]);

  const loadMovements = useCallback(async () => {
    setLoading(true);
    try {
      const filters = { branchId: BRANCH_ID, includeReversed };
      if (productId) filters.productId = productId;
      const all = await listStockMovements(filters);
      // Filter by typeGroup and date range client-side (list query can't combine all)
      let filtered = all;
      if (typeGroup) {
        const group = TYPE_GROUPS.find(g => g.id === typeGroup);
        if (group?.types?.length) {
          const set = new Set(group.types);
          filtered = filtered.filter(m => set.has(Number(m.type)));
        }
      }
      if (dateFrom) filtered = filtered.filter(m => (m.createdAt || '') >= dateFrom);
      if (dateTo) filtered = filtered.filter(m => (m.createdAt || '') < dateTo + 'T99:99:99');
      // Sort newest first
      filtered.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setMovements(filtered);
    } catch (e) { console.error('[MovementLog] load failed:', e); setMovements([]); }
    finally { setLoading(false); }
  }, [productId, typeGroup, dateFrom, dateTo, includeReversed, BRANCH_ID]);

  useEffect(() => { loadMovements(); }, [loadMovements]);

  const displayMovements = useMemo(() => {
    if (!search.trim()) return movements;
    const q = search.toLowerCase();
    return movements.filter(m =>
      (m.productName || '').toLowerCase().includes(q) ||
      (m.note || '').toLowerCase().includes(q) ||
      (m.batchId || '').toLowerCase().includes(q) ||
      (m.linkedSaleId || '').toLowerCase().includes(q) ||
      (m.linkedTreatmentId || '').toLowerCase().includes(q) ||
      (m.linkedOrderId || '').toLowerCase().includes(q)
    );
  }, [movements, search]);

  // Phase 15.4 — pagination 20/page recent-first. Reset on any filter change.
  const { page, setPage, totalPages, visibleItems, totalCount } = usePagination(displayMovements, {
    key: `${BRANCH_ID}|${productId}|${typeGroup}|${dateFrom}|${dateTo}|${search}|${includeReversed}`,
  });

  const summary = useMemo(() => {
    const byGroup = {};
    for (const m of movements) {
      const info = TYPE_LABELS[m.type];
      const group = info?.group || 'other';
      byGroup[group] = (byGroup[group] || 0) + 1;
    }
    return byGroup;
  }, [movements]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-[var(--bg-surface)] rounded-2xl p-5 shadow-lg" style={{ border: '1.5px solid rgba(244,63,94,0.15)' }}>
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-violet-900/30 border border-violet-800">
            <Activity size={22} className="text-violet-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-[var(--tx-heading)]">Stock Movement Log</h2>
            <p className="text-xs text-[var(--tx-muted)]">บันทึกการเคลื่อนไหวทุก transaction (append-only, MOPH audit trail)</p>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1 font-bold">สินค้า</label>
            <select value={productId} onChange={e => setProductId(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)]">
              <option value="">ทุกสินค้า</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1 font-bold">ประเภท</label>
            <select value={typeGroup} onChange={e => setTypeGroup(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)]">
              {TYPE_GROUPS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1 font-bold">จาก</label>
            <DateField value={dateFrom} onChange={setDateFrom} locale="ce" size="sm" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1 font-bold">ถึง</label>
            <DateField value={dateTo} onChange={setDateTo} locale="ce" size="sm" />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tx-muted)]" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาในผลลัพธ์: ชื่อสินค้า / note / batch / sale-id / treatment-id / order-id"
              className="w-full pl-9 pr-3 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)]" />
          </div>
          <label className="flex items-center gap-2 text-[11px] text-[var(--tx-muted)] cursor-pointer">
            <input type="checkbox" checked={includeReversed} onChange={e => setIncludeReversed(e.target.checked)} className="accent-violet-500" />
            แสดง movement ที่ถูก reverse แล้ว
          </label>
        </div>

        {/* Summary chips */}
        {!loading && movements.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--bg-hover)] text-[var(--tx-muted)] border border-[var(--bd)]">
              รวม {movements.length} รายการ
            </span>
            {Object.entries(summary).map(([g, c]) => {
              const info = TYPE_GROUPS.find(x => x.id === g);
              return (
                <span key={g} className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--bg-hover)] text-[var(--tx-muted)] border border-[var(--bd)]">
                  {info?.label || g}: {c}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-[var(--tx-muted)] text-xs">
          <Loader2 size={16} className="animate-spin mr-2" /> กำลังโหลด...
        </div>
      ) : displayMovements.length === 0 ? (
        <div className="bg-[var(--bg-surface)] rounded-2xl p-8 text-center border border-[var(--bd)]">
          <Activity size={32} className="mx-auto text-[var(--tx-muted)] mb-2" />
          <p className="text-xs text-[var(--tx-muted)]">ไม่พบ movement — ปรับ filter หรือลองคำค้นใหม่</p>
        </div>
      ) : (
        <div className="bg-[var(--bg-surface)] rounded-2xl overflow-x-auto shadow-lg border border-[var(--bd)]">
          <table className="w-full text-xs min-w-[900px]">
            <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left font-bold w-32">วันที่</th>
                <th className="px-3 py-2 text-left font-bold">ประเภท</th>
                <th className="px-3 py-2 text-left font-bold">สินค้า</th>
                <th className="px-3 py-2 text-right font-bold w-20">จำนวน</th>
                <th className="px-3 py-2 text-right font-bold w-16">ก่อน</th>
                <th className="px-3 py-2 text-right font-bold w-16">หลัง</th>
                {/* 2026-04-27 actor tracking — show ผู้ทำรายการ for every movement */}
                <th className="px-3 py-2 text-left font-bold w-28">ผู้ทำ</th>
                <th className="px-3 py-2 text-left font-bold">link / note</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map(m => {
                const info = TYPE_LABELS[m.type];
                const color = info?.color || 'gray';
                const link = m.linkedSaleId ? `Sale: ${m.linkedSaleId}` :
                  m.linkedTreatmentId ? `Treatment: ${m.linkedTreatmentId}` :
                  m.linkedOrderId ? `Order: ${m.linkedOrderId}` :
                  m.linkedAdjustId ? `Adj: ${m.linkedAdjustId}` :
                  m.linkedTransferId ? `Transfer: ${m.linkedTransferId}` :
                  m.linkedWithdrawalId ? `Withdraw: ${m.linkedWithdrawalId}` : '';
                const isReverse = !!m.reverseOf;
                // Phase 15.4 post-deploy bug 2 v4 — counterparty label for cross-tier types
                const cpId = COUNTERPARTY_TEMPLATES[m.type] ? getCounterpartyId(m) : null;
                const cpName = cpId ? resolveCounterpartyName(cpId) : '';
                const labelText = (cpId && cpName)
                  ? `${COUNTERPARTY_TEMPLATES[m.type]} ${cpName}`
                  : (info?.label || `type=${m.type}`);
                return (
                  <tr key={m.movementId} className={`border-t border-[var(--bd)] hover:bg-[var(--bg-hover)] ${m.reversedByMovementId || isReverse ? 'opacity-60' : ''}`}>
                    <td className="px-3 py-2 text-[var(--tx-muted)] whitespace-nowrap">{fmtDate(m.createdAt)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${BADGE_CLASSES[color] || BADGE_CLASSES.gray}`}
                        data-testid="movement-type-label"
                      >
                        {labelText}
                      </span>
                      {isReverse && <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] bg-[var(--bg-hover)] text-[var(--tx-muted)] border border-[var(--bd)]">REV</span>}
                      {m.skipped && <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] bg-[var(--bg-hover)] text-[var(--tx-muted)] border border-[var(--bd)]">SKIP</span>}
                      {m.isPremium && <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] bg-orange-900/30 text-orange-400 border border-orange-800">ฟรี</span>}
                    </td>
                    <td className="px-3 py-2 text-[var(--tx-primary)]">
                      {m.productName || '-'}
                      {m.batchId && <div className="text-[10px] font-mono text-[var(--tx-muted)]" title={m.batchId}>…{m.batchId.slice(-8)}</div>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold">
                      <span className={(Number(m.qty) || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {(Number(m.qty) || 0) >= 0 ? '+' : ''}{fmtQty(m.qty)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--tx-muted)] font-mono">{m.before != null ? fmtQty(m.before) : '-'}</td>
                    <td className="px-3 py-2 text-right text-[var(--tx-muted)] font-mono">{m.after != null ? fmtQty(m.after) : '-'}</td>
                    {/* 2026-04-27 actor tracking — show user.userName per movement.
                        Falls back to '-' for legacy movements without user
                        (pre-actor-picker era). NEVER displays raw userId. */}
                    <td className="px-3 py-2 text-[var(--tx-primary)] text-[11px]" data-testid="movement-actor">
                      {(typeof m.user?.userName === 'string' && m.user.userName.trim()) ? m.user.userName : '-'}
                    </td>
                    <td className="px-3 py-2 text-[var(--tx-muted)] text-[11px]">
                      {link && <div className="font-mono">{link}</div>}
                      {m.note && <div className="italic">{m.note}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalCount={totalCount} />
        </div>
      )}
    </div>
  );
}
