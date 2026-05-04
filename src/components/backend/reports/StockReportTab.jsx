// audit-branch-scope: report — uses {allBranches:true} for cross-branch aggregation
// ─── StockReportTab — Phase 10.5 ──────────────────────────────────────────
// Replicates ProClinic /admin/report/stock (9 cols + Export File).
// Joins be_stock_batches + master_data/products. Read-only — no mutations.
//
// Triangle-verified 2026-04-19: opd.js intel captured 9 cols + 4 filters
// (q, product_category_id, product_type, product_status). Category dropdown
// derived dynamically from master_data/products so it stays in sync without
// needing a hardcoded 94-item list.
//
// Batch qty is `{ remaining, total }` (buildQtyNumeric). Aggregator handles
// both that + legacy scalar qty — this tab never touches batch internals.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Boxes, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import ReportShell from './ReportShell.jsx';
import {
  aggregateStockReport,
  buildStockReportColumns,
} from '../../../lib/stockReportAggregator.js';
import { loadAllStockBatchesForReport } from '../../../lib/reportsLoaders.js';
// Phase 14.10-tris (2026-04-26) — be_products canonical
import { listProducts } from '../../../lib/backendClient.js';
import { fmtMoney } from '../../../lib/financeUtils.js';
import { downloadCSV } from '../../../lib/csvExport.js';
import { sortBy } from '../../../lib/reportsUtils.js';
import { thaiTodayISO } from '../../../utils.js';

const SORTABLE = {
  productName:     { key: 'productName',     type: 'string', label: 'ชื่อสินค้า' },
  productType:     { key: 'productType',     type: 'string', label: 'ประเภท' },
  productCategory: { key: 'productCategory', type: 'string', label: 'หมวดหมู่' },
  weightedAvgCost: { key: 'weightedAvgCost', type: 'number', label: 'ต้นทุน/หน่วย' },
  totalQty:        { key: 'totalQty',        type: 'number', label: 'จำนวน' },
  totalValue:      { key: 'totalValue',      type: 'number', label: 'มูลค่ารวม' },
  nearExpiryQty:   { key: 'nearExpiryQty',   type: 'number', label: 'ใกล้หมดอายุ' },
  expiredQty:      { key: 'expiredQty',      type: 'number', label: 'หมดอายุ' },
};

const TYPE_OPTIONS = [
  { v: 'all',             t: 'ทุกประเภทสินค้า' },
  { v: 'ยา',              t: 'ยา' },
  { v: 'สินค้าหน้าร้าน',   t: 'สินค้าหน้าร้าน' },
  { v: 'สินค้าสิ้นเปลือง', t: 'สินค้าสิ้นเปลือง' },
  { v: 'บริการ',          t: 'บริการ' },
];

const STATUS_OPTIONS = [
  { v: 'all',       t: 'ทุกสถานะสินค้า' },
  { v: 'ใช้งาน',     t: 'ใช้งาน' },
  { v: 'พักใช้งาน',   t: 'พักใช้งาน' },
];

function fmtQty(n, unit) {
  const num = Number(n) || 0;
  const txt = num.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return unit ? `${txt} ${unit}` : txt;
}

export default function StockReportTab({ clinicSettings, theme }) {
  const [searchText, setSearchText] = useState('');
  const [productType, setProductType] = useState('all');
  const [productCategory, setProductCategory] = useState('all');
  const [productStatus, setProductStatus] = useState('all');
  const [showZeroQty, setShowZeroQty] = useState(false);
  const [sortKey, setSortKey] = useState('productName');
  const [sortDir, setSortDir] = useState('asc');
  const [batches, setBatches] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let abort = false;
    setLoading(true); setError('');
    Promise.all([
      loadAllStockBatchesForReport(),
      listProducts(),
    ])
      .then(([bs, ps]) => {
        if (abort) return;
        setBatches(bs);
        setProducts(ps);
      })
      .catch(e => { if (!abort) setError(e?.message || 'โหลดข้อมูลล้มเหลว'); })
      .finally(() => { if (!abort) setLoading(false); });
    return () => { abort = true; };
  }, [reloadKey]);

  const out = useMemo(
    () => aggregateStockReport(batches, products, {
      searchText, productType, productCategory, productStatus, showZeroQty,
    }),
    [batches, products, searchText, productType, productCategory, productStatus, showZeroQty]
  );

  // Apply column sort AFTER aggregation. Default: productName asc.
  const sortedRows = useMemo(() => {
    if (sortKey === 'productName' && sortDir === 'asc') return out.rows;
    const meta = SORTABLE[sortKey];
    if (!meta) return out.rows;
    return sortBy(out.rows, r => {
      const v = r?.[meta.key];
      if (meta.type === 'number') return Number(v) || 0;
      return v || '';
    }, sortDir);
  }, [out.rows, sortKey, sortDir]);

  // Category dropdown derived from actual product data
  const categoryOptions = useMemo(() => {
    const set = new Set();
    for (const p of products) {
      const c = (p?.category || p?.categoryName || '').trim();
      if (c) set.add(c);
    }
    return [{ v: 'all', t: 'ทุกหมวดหมู่สินค้า' }, ...[...set].sort().map(c => ({ v: c, t: c }))];
  }, [products]);

  const columns = useMemo(
    () => buildStockReportColumns({ fmtMoney, fmtQty }),
    []
  );

  const handleExport = useCallback(() => {
    // Audit P2 (2026-04-26 TZ1 medium): use Bangkok TZ helper so CSV
    // filenames match the operator's calendar (admin downloading at 02:00
    // Bangkok would otherwise see yesterday's date in the filename).
    downloadCSV(`stock-report_${thaiTodayISO()}`, out.rows, columns);
  }, [out.rows, columns]);

  const handleRefresh = useCallback(() => setReloadKey(k => k + 1), []);

  // Unified sort handler. `forceToggle=true` flips direction without
  // changing the sort key (used by mobile sort-dir button).
  const handleSort = useCallback((key, forceToggle = false) => {
    setSortKey(prev => {
      if (forceToggle) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        return prev;
      }
      if (prev === key) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        return prev;
      }
      setSortDir(SORTABLE[key]?.type === 'number' ? 'desc' : 'asc');
      return key;
    });
  }, []);

  return (
    <ReportShell
      icon={Boxes}
      title="สต็อคสินค้า"
      subtitle={`เกณฑ์ใกล้หมดอายุ: ${out.meta.nearExpiryDays} วัน · ใกล้หมดอายุ ${out.totals.near30ProductCount} รายการ · หมดอายุ ${out.totals.expiredProductCount} รายการ`}
      totalCount={out.meta.totalCount}
      filteredCount={out.meta.filteredCount}
      onExport={handleExport}
      exportDisabled={out.meta.filteredCount === 0}
      onRefresh={handleRefresh}
      loading={loading}
      error={error}
      emptyText="ยังไม่มีสินค้าที่มีสต็อค"
      notFoundText="ไม่พบสินค้าตามตัวกรอง"
      clinicSettings={clinicSettings}
      filtersSlot={
        <FiltersRow
          searchText={searchText} setSearchText={setSearchText}
          productType={productType} setProductType={setProductType}
          productCategory={productCategory} setProductCategory={setProductCategory}
          productStatus={productStatus} setProductStatus={setProductStatus}
          showZeroQty={showZeroQty} setShowZeroQty={setShowZeroQty}
          categoryOptions={categoryOptions}
        />
      }
    >
      <MobileSortBar sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
      <StockMobileList rows={sortedRows} />
      <StockMobileFooter totals={out.totals} />
      <StockReportTable
        rows={sortedRows}
        totals={out.totals}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
      />
    </ReportShell>
  );
}

function SortHeader({ sortKey, currentKey, currentDir, onSort, align = 'left', children }) {
  const isActive = currentKey === sortKey;
  const Arrow = isActive ? (currentDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  const ariaSort = isActive ? (currentDir === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'} font-bold whitespace-nowrap`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 select-none transition-colors ${
          isActive ? 'text-cyan-300' : 'text-[var(--tx-muted)] hover:text-[var(--tx-secondary)]'
        }`}
        data-testid={`sort-${sortKey}`}
        title={`เรียงตาม${SORTABLE[sortKey]?.label || sortKey}`}
      >
        <span>{children}</span>
        <Arrow size={11} className={isActive ? '' : 'opacity-40'} />
      </button>
    </th>
  );
}

function FiltersRow({
  searchText, setSearchText,
  productType, setProductType,
  productCategory, setProductCategory,
  productStatus, setProductStatus,
  showZeroQty, setShowZeroQty,
  categoryOptions,
}) {
  // On mobile: each field = full-width block, stacked. On ≥sm: inline with
  // a reasonable min-width so the search input dominates the row.
  const inputCls = "px-2 py-2 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] w-full sm:w-auto";
  const selectCls = `${inputCls} sm:min-w-[140px]`;
  return (
    <>
      <input
        type="text"
        value={searchText}
        onChange={e => setSearchText(e.target.value)}
        placeholder="ค้นหา รหัส / ชื่อสินค้า"
        className={`${inputCls} sm:min-w-[220px] sm:flex-1`}
        data-testid="stock-filter-search"
      />
      <div className="grid grid-cols-2 sm:flex sm:flex-none gap-2 sm:gap-3">
        <select
          value={productCategory}
          onChange={e => setProductCategory(e.target.value)}
          className={selectCls}
          data-testid="stock-filter-category"
        >
          {categoryOptions.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
        </select>
        <select
          value={productType}
          onChange={e => setProductType(e.target.value)}
          className={selectCls}
          data-testid="stock-filter-type"
        >
          {TYPE_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
        </select>
        <select
          value={productStatus}
          onChange={e => setProductStatus(e.target.value)}
          className={selectCls}
          data-testid="stock-filter-status"
        >
          {STATUS_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 text-xs text-[var(--tx-muted)] cursor-pointer select-none min-h-[32px] sm:min-h-0">
        <input
          type="checkbox"
          checked={showZeroQty}
          onChange={e => setShowZeroQty(e.target.checked)}
          className="accent-cyan-600 w-4 h-4"
          data-testid="stock-filter-zero-qty"
        />
        แสดงสินค้าที่จำนวนเป็น 0
      </label>
    </>
  );
}

/**
 * Mobile sort bar — surfaces sort controls on a <select> since table headers
 * are hidden on the card view. Single source of truth with the desktop
 * SortHeader buttons (shares sortKey/sortDir state).
 */
function MobileSortBar({ sortKey, sortDir, onSort }) {
  return (
    <div className="lg:hidden flex items-center gap-2 px-1">
      <label className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold shrink-0">
        เรียงตาม
      </label>
      <select
        value={sortKey}
        onChange={e => onSort(e.target.value, /* toggle */ false)}
        className="flex-1 px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
        data-testid="mobile-sort-key"
      >
        {Object.entries(SORTABLE).map(([k, v]) => (
          <option key={k} value={k}>{v.label}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onSort(sortKey, /* forceToggle */ true)}
        className="px-2.5 py-1.5 rounded text-xs font-bold border border-[var(--bd)] bg-[var(--bg-hover)] text-cyan-300 hover:bg-cyan-900/30 transition-colors"
        aria-label={sortDir === 'asc' ? 'เรียงจากน้อยไปมาก' : 'เรียงจากมากไปน้อย'}
        data-testid="mobile-sort-dir"
      >
        {sortDir === 'asc' ? (
          <ArrowUp size={12} className="inline" />
        ) : (
          <ArrowDown size={12} className="inline" />
        )}
      </button>
    </div>
  );
}

/**
 * Mobile card list — one product per card, stacked vertically. Primary qty +
 * value are prominent; near-expiry / expired chips only appear when > 0 so
 * the layout stays calm for healthy stock.
 */
function StockMobileList({ rows }) {
  return (
    <div className="lg:hidden space-y-2" data-testid="stock-report-mobile-list">
      {rows.map((r, i) => {
        const paused = r.productStatus === 'พักใช้งาน';
        const hasNear = r.nearExpiryQty > 0;
        const hasExpired = r.expiredQty > 0;
        return (
          <div
            key={`${r.productId || i}`}
            className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-3.5 shadow-sm hover:border-cyan-800/50 transition-colors"
            data-testid={`stock-mobile-row-${r.productId || i}`}
          >
            {/* Head: code + name (wraps) + paused badge */}
            <div className="flex items-start gap-2 justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--tx-muted)] mb-0.5">
                  <span>#{r.productCode || '-'}</span>
                  {r.productType && (
                    <>
                      <span className="opacity-50">·</span>
                      <span className="not-italic">{r.productType}</span>
                    </>
                  )}
                  {r.productCategory && (
                    <>
                      <span className="opacity-50">·</span>
                      <span className="not-italic truncate">{r.productCategory}</span>
                    </>
                  )}
                </div>
                <h3 className="text-sm font-bold text-[var(--tx-primary)] leading-snug break-words">
                  {r.productName}
                </h3>
              </div>
              {paused && (
                <span className="flex-shrink-0 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold border bg-amber-900/30 text-amber-300 border-amber-700/50">
                  พักใช้งาน
                </span>
              )}
            </div>

            {/* Primary metrics: qty + value (big, bold) */}
            <div className="mt-3 grid grid-cols-2 gap-2 pt-2 border-t border-[var(--bd)]">
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-wider text-[var(--tx-muted)] mb-0.5">จำนวน</div>
                <div className="text-base font-black tabular-nums text-[var(--tx-primary)] truncate" title={fmtQty(r.totalQty, r.unit)}>
                  {fmtQty(r.totalQty, r.unit)}
                </div>
              </div>
              <div className="min-w-0 text-right">
                <div className="text-[9px] uppercase tracking-wider text-[var(--tx-muted)] mb-0.5">มูลค่ารวม</div>
                <div className="text-base font-black tabular-nums text-emerald-400 truncate">
                  {fmtMoney(r.totalValue)} <span className="text-[9px] text-[var(--tx-muted)]">฿</span>
                </div>
              </div>
            </div>

            {/* Secondary: cost per unit + expiry chips */}
            <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
              <div className="text-[var(--tx-muted)]">
                ต้นทุน/หน่วย: <span className="text-[var(--tx-secondary)] font-bold tabular-nums">{fmtMoney(r.weightedAvgCost)}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                {hasNear && (
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold border bg-amber-900/30 text-amber-300 border-amber-700/50">
                    ใกล้หมด {fmtQty(r.nearExpiryQty, r.unit)}
                  </span>
                )}
                {hasExpired && (
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold border bg-red-900/30 text-red-300 border-red-700/50">
                    หมดอายุ {fmtQty(r.expiredQty, r.unit)}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Mobile footer — sticky summary banner at bottom of the card list.
 */
function StockMobileFooter({ totals }) {
  return (
    <div
      className="lg:hidden sticky bottom-0 z-[5] mt-3 -mx-1 px-3 py-2.5 rounded-xl border border-[var(--bd)] bg-[var(--bg-hover)]/95 backdrop-blur-sm shadow-lg"
      data-testid="stock-report-footer-mobile"
    >
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <div className="text-[var(--tx-muted)]">
          รวม <span className="text-[var(--tx-primary)] font-bold tabular-nums">{totals.productCount.toLocaleString('th-TH')}</span> รายการ
        </div>
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-wider text-[var(--tx-muted)]">มูลค่ารวม</div>
          <div className="font-black tabular-nums text-emerald-400">
            {fmtMoney(totals.totalValue)} <span className="text-[9px] opacity-70">฿</span>
          </div>
        </div>
      </div>
      {(totals.nearExpiryQty > 0 || totals.expiredQty > 0) && (
        <div className="mt-1.5 pt-1.5 border-t border-[var(--bd)] flex items-center gap-2 text-[10px] justify-end">
          {totals.nearExpiryQty > 0 && (
            <span className="text-amber-400 font-bold">
              ใกล้หมด {totals.nearExpiryQty.toLocaleString('th-TH', { maximumFractionDigits: 2 })}
            </span>
          )}
          {totals.expiredQty > 0 && (
            <>
              {totals.nearExpiryQty > 0 && <span className="opacity-50">·</span>}
              <span className="text-red-400 font-bold">
                หมดอายุ {totals.expiredQty.toLocaleString('th-TH', { maximumFractionDigits: 2 })}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StockReportTable({ rows, totals, sortKey, sortDir, onSort }) {
  const headerProps = { currentKey: sortKey, currentDir: sortDir, onSort };
  return (
    <div className="hidden lg:block overflow-auto rounded-lg border border-[var(--bd)] bg-[var(--bg-card)]" data-testid="stock-report-table">
      <table className="w-full text-xs min-w-[1200px]">
        <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase text-[10px] tracking-wider sticky top-0 z-[5]">
          <tr>
            <th className="px-3 py-2 text-left font-bold whitespace-nowrap">รหัสสินค้า</th>
            <SortHeader sortKey="productName"     {...headerProps}>ชื่อสินค้า</SortHeader>
            <SortHeader sortKey="productType"     {...headerProps}>ประเภท</SortHeader>
            <SortHeader sortKey="productCategory" {...headerProps}>หมวดหมู่</SortHeader>
            <SortHeader sortKey="weightedAvgCost" align="right" {...headerProps}>ต้นทุน/หน่วย</SortHeader>
            <SortHeader sortKey="totalQty"        align="right" {...headerProps}>จำนวน</SortHeader>
            <SortHeader sortKey="totalValue"      align="right" {...headerProps}>มูลค่ารวม</SortHeader>
            <SortHeader sortKey="nearExpiryQty"   align="right" {...headerProps}>ใกล้หมดอายุ</SortHeader>
            <SortHeader sortKey="expiredQty"      align="right" {...headerProps}>หมดอายุ</SortHeader>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const paused = r.productStatus === 'พักใช้งาน';
            const hasNear = r.nearExpiryQty > 0;
            const hasExpired = r.expiredQty > 0;
            return (
              <tr
                key={`${r.productId || i}`}
                className="border-t border-[var(--bd)] hover:bg-cyan-900/10 transition-colors"
                data-testid={`stock-row-${r.productId || i}`}
              >
                <td className="px-3 py-2 whitespace-nowrap font-mono text-[var(--tx-muted)] text-[10px]">
                  {r.productCode || '-'}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className="font-bold text-[var(--tx-primary)]">{r.productName}</span>
                  {paused && (
                    <span className="ml-2 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold border bg-amber-900/30 text-amber-300 border-amber-700/50">
                      พักใช้งาน
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-[var(--tx-secondary)]">{r.productType || '-'}</td>
                <td className="px-3 py-2 whitespace-nowrap text-[var(--tx-secondary)]">{r.productCategory || '-'}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--tx-secondary)]">
                  {fmtMoney(r.weightedAvgCost)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-[var(--tx-primary)]">
                  {fmtQty(r.totalQty, r.unit)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-400">
                  {fmtMoney(r.totalValue)}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${hasNear ? 'text-amber-400 font-bold' : 'text-[var(--tx-muted)]'}`}>
                  {fmtQty(r.nearExpiryQty, r.unit)}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${hasExpired ? 'text-red-400 font-bold' : 'text-[var(--tx-muted)]'}`}>
                  {fmtQty(r.expiredQty, r.unit)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="bg-[var(--bg-hover)] font-bold text-[var(--tx-primary)] border-t-2 border-[var(--bd)] sticky bottom-0 z-[5]" data-testid="stock-report-footer">
          <tr>
            <td colSpan={4} className="px-3 py-2">รวม {totals.productCount.toLocaleString('th-TH')} รายการ</td>
            <td className="px-3 py-2 text-right" />
            <td className="px-3 py-2 text-right tabular-nums" data-testid="footer-total-qty">
              {totals.totalQty.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </td>
            <td className="px-3 py-2 text-right tabular-nums" data-testid="footer-total-value">
              {fmtMoney(totals.totalValue)}
            </td>
            <td className="px-3 py-2 text-right tabular-nums text-amber-400" data-testid="footer-near-expiry">
              {totals.nearExpiryQty.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </td>
            <td className="px-3 py-2 text-right tabular-nums text-red-400" data-testid="footer-expired">
              {totals.expiredQty.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
