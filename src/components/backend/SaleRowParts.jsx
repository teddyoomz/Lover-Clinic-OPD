// SaleRowParts — pure presentational bits for the SaleTab list row (2026-06-01 redesign).
// Extracted from SaleTab.jsx so they're RTL-testable in isolation + to trim the
// 2000-line SaleTab. Same labels + per-source/per-status colors as the prior
// inline source badges + status chip (cosmetic-shell — no behavior change).

const SALE_SOURCE_TAGS = {
  treatment:    { label: 'จาก OPD Card', dark: 'bg-orange-900/30 text-orange-400',   light: 'bg-orange-50 text-orange-700' },
  exchange:     { label: 'เปลี่ยนสินค้า', dark: 'bg-sky-900/30 text-sky-400',          light: 'bg-sky-50 text-sky-700' },
  share:        { label: 'แชร์คอร์ส',     dark: 'bg-violet-900/30 text-violet-400',    light: 'bg-violet-50 text-violet-700' },
  addRemaining: { label: 'เพิ่มคงเหลือ',  dark: 'bg-emerald-900/30 text-emerald-400',  light: 'bg-emerald-50 text-emerald-700' },
};

/**
 * Small "source" tag shown at the top of the รายการขาย cell (moved out of the
 * money column so the amounts stay a clean aligned single line). Renders null
 * for a plain form sale / unknown source.
 */
export function SaleSourceTag({ source, isDark }) {
  const cfg = SALE_SOURCE_TAGS[source];
  if (!cfg) return null;
  return (
    <span
      data-testid={`sale-source-tag-${source}`}
      className={`flex w-fit items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded mb-1 whitespace-nowrap ${isDark ? cfg.dark : cfg.light}`}
    >
      {cfg.label}
    </span>
  );
}

const SALE_STATUS_PILL = {
  emerald: { dark: 'bg-emerald-900/30 text-emerald-400', light: 'bg-emerald-50 text-emerald-700' },
  amber:   { dark: 'bg-orange-900/30 text-orange-400',   light: 'bg-orange-50 text-orange-700' },
  red:     { dark: 'bg-red-900/30 text-red-400',         light: 'bg-red-50 text-red-700' },
  gray:    { dark: 'bg-gray-900/30 text-gray-400',       light: 'bg-gray-100 text-gray-600' },
  purple:  { dark: 'bg-purple-900/30 text-purple-400',   light: 'bg-purple-50 text-purple-700' },
  sky:     { dark: 'bg-sky-900/30 text-sky-400',         light: 'bg-sky-50 text-sky-700' },
};

/**
 * Status as a nowrap rounded pill with a leading dot. `color` + `label` come
 * straight from resolveSaleStatus(sale) (PAYMENT_STATUSES entry). Unknown color
 * falls back to sky.
 */
export function SaleStatusPill({ color, label, isDark }) {
  const cfg = SALE_STATUS_PILL[color] || SALE_STATUS_PILL.sky;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${isDark ? cfg.dark : cfg.light}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" aria-hidden />
      {label}
    </span>
  );
}
