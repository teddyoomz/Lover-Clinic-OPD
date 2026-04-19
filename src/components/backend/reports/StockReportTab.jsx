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
import { getAllMasterDataItems } from '../../../lib/backendClient.js';
import { fmtMoney } from '../../../lib/financeUtils.js';
import { downloadCSV } from '../../../lib/csvExport.js';
import { sortBy } from '../../../lib/reportsUtils.js';

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
      getAllMasterDataItems('products'),
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
    downloadCSV(`stock-report_${new Date().toISOString().slice(0, 10)}`, out.rows, columns);
  }, [out.rows, columns]);

  const handleRefresh = useCallback(() => setReloadKey(k => k + 1), []);

  const handleSort = useCallback((key) => {
    setSortKey(prev => {
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
  return (
    <>
      <input
        type="text"
        value={searchText}
        onChange={e => setSearchText(e.target.value)}
        placeholder="ค้นหา รหัส / ชื่อสินค้า"
        className="px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] min-w-[220px]"
        data-testid="stock-filter-search"
      />
      <select
        value={productCategory}
        onChange={e => setProductCategory(e.target.value)}
        className="px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
        data-testid="stock-filter-category"
      >
        {categoryOptions.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
      <select
        value={productType}
        onChange={e => setProductType(e.target.value)}
        className="px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
        data-testid="stock-filter-type"
      >
        {TYPE_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
      <select
        value={productStatus}
        onChange={e => setProductStatus(e.target.value)}
        className="px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
        data-testid="stock-filter-status"
      >
        {STATUS_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
      <label className="flex items-center gap-1.5 text-xs text-[var(--tx-muted)] cursor-pointer">
        <input
          type="checkbox"
          checked={showZeroQty}
          onChange={e => setShowZeroQty(e.target.checked)}
          className="accent-cyan-600"
          data-testid="stock-filter-zero-qty"
        />
        แสดงสินค้าที่จำนวนเป็น 0
      </label>
    </>
  );
}

function StockReportTable({ rows, totals, sortKey, sortDir, onSort }) {
  const headerProps = { currentKey: sortKey, currentDir: sortDir, onSort };
  return (
    <div className="overflow-auto rounded-lg border border-[var(--bd)] bg-[var(--bg-card)]" data-testid="stock-report-table">
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
