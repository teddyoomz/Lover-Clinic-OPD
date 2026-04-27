// ─── Sale Print View — Phase 13.1.4 support ───────────────────────────────
// Customer-facing A4 document for be_sales docs. Reuses the same visual
// language as QuotationPrintView (accent stripe + tabular-nums + Thai พ.ศ.
// dates) but labels as "ใบเสร็จ/ใบขาย" with payment status displayed.

import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';
import { resolveSellerName } from '../../lib/documentFieldAutoFill.js';

function formatDateThaiBE(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-');
  if (!y || !m || !d) return iso;
  const be = Number(y) + 543;
  const monthNames = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const mIdx = Math.max(0, Math.min(11, Number(m) - 1));
  return `${Number(d)} ${monthNames[mIdx]} ${be}`;
}

function fmtMoney(n) {
  return Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Phase 14.10-bis (2026-04-26) — STATUS map matches SaleTab PAYMENT_STATUSES
// + sale.status='cancelled' override. User reported "ชำระแล้วและไม่ชำระแล้ว
// ขึ้นผิด" — the previous SalePrintView recomputed status from totalPaidAmount
// vs netTotal, which diverged from the stored payment.status field. Source
// of truth = sale.payment.status (set by SaleTab's payment workflow).
const PAYMENT_STATUS_LABEL = {
  paid:      'ชำระแล้ว',
  split:     'แบ่งชำระ',
  unpaid:    'ค้างชำระ',
  deferred:  'ชำระภายหลัง',
  draft:     'แบบร่าง',
  cancelled: 'ยกเลิก',
};
function resolveSaleStatusLabel(sale) {
  if (!sale) return '—';
  // sale.status='cancelled' is the canonical cancelled flag (overrides payment.status)
  if (sale.status === 'cancelled') return PAYMENT_STATUS_LABEL.cancelled;
  const ps = sale.payment?.status;
  if (ps && PAYMENT_STATUS_LABEL[ps]) return PAYMENT_STATUS_LABEL[ps];
  // Legacy fallback: derive from paid-amount math
  const paidAmount = Number(sale.totalPaidAmount) || 0;
  const netTotal = Number(sale.billing?.netTotal ?? sale.netTotal) || 0;
  if (paidAmount >= netTotal - 0.01 && netTotal > 0) return PAYMENT_STATUS_LABEL.paid;
  if (paidAmount > 0) return PAYMENT_STATUS_LABEL.split;
  return PAYMENT_STATUS_LABEL.unpaid;
}

function computeLineTotal(item) {
  // Grouped items (SaleTab) use `unitPrice`; legacy flat items use `price`.
  const unit = Number(item.unitPrice ?? item.price) || 0;
  const gross = (Number(item.qty) || 0) * unit;
  const disc = Number(item.discount ?? item.itemDiscount) || 0;
  const type = item.discountType ?? item.itemDiscountType;
  if (type === 'percent') return Math.max(0, gross * (1 - disc / 100));
  return Math.max(0, gross - disc);
}

export default function SalePrintView({ sale, clinicSettings, onClose, sellersLookup = [] }) {
  const s = sale || {};
  const clinic = clinicSettings || {};
  const accent = clinic.accentColor || '#dc2626';

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // be_sales supports TWO shapes (accept both to avoid crashes):
  //   - GROUPED (canonical — SaleTab writes this): items = { promotions,
  //     courses, products, medications } where each bucket is an array
  //   - LEGACY FLAT: items = [{...courseId|productId...}, ...]
  // The grouped path was shipped by SaleTab since Phase 10; Phase 13.1.4's
  // quotation converter used to ship flat (a bug — crashed this component
  // and hid items from SaleTab's grouped reader at line 374). Phase 14.x
  // fix (2026-04-24) makes the converter produce grouped too. This reader
  // still handles both to survive any legacy docs already in Firestore.
  const rows = useMemo(() => {
    const src = s.items;
    if (src && !Array.isArray(src) && typeof src === 'object') {
      const out = [];
      for (const p of (src.promotions || [])) {
        out.push({
          ...p,
          kind: 'promotion',
          label: 'โปรโมชัน',
          name: p.name || p.promotionName || p.promotionId || '',
        });
      }
      for (const c of (src.courses || [])) {
        out.push({
          ...c,
          kind: 'course',
          label: 'คอร์ส',
          name: c.name || c.courseName || c.courseId || '',
        });
      }
      for (const p of (src.products || [])) {
        out.push({
          ...p,
          kind: p.isTakeaway ? 'med' : 'product',
          label: p.isTakeaway ? 'ยา' : 'สินค้า',
          name: p.name || p.productName || p.productId || '',
        });
      }
      for (const m of (src.medications || [])) {
        out.push({
          ...m,
          kind: 'med',
          label: 'ยา',
          name: m.name || '',
        });
      }
      return out;
    }
    // Legacy flat array path.
    return (Array.isArray(src) ? src : []).map((it) => ({
      ...it,
      kind: it.courseId ? 'course' : (it.isTakeaway ? 'med' : 'product'),
      label: it.courseId ? 'คอร์ส' : (it.isTakeaway ? 'ยา' : 'สินค้า'),
      name: it.name || it.courseName || it.productName || it.courseId || it.productId || '',
    }));
  }, [s.items]);

  const subtotal = rows.reduce((sum, r) => sum + computeLineTotal(r), 0);
  const billing = s.billing || {};
  const headerDiscount = Number(billing.discount ?? s.discount) || 0;
  const discType = billing.discountType ?? s.discountType;
  const discountAmount = discType === 'percent'
    ? subtotal * (headerDiscount / 100)
    : headerDiscount;
  const netTotal = Number(billing.netTotal ?? s.netTotal) || Math.max(0, subtotal - discountAmount);

  const saleNumber = s.saleId || s.id || '—';
  const paidAmount = Number(s.totalPaidAmount) || 0;
  // Phase 14.10-bis (2026-04-26) — derive from sale.payment.status (source of
  // truth set by SaleTab). Previous version recomputed and showed inverted
  // labels when totalPaidAmount diverged from payment.status.
  const statusLabel = resolveSaleStatusLabel(s);
  // Date stamp at signature lines — falls back through created → saleDate → today
  const signatureDateIso = s.createdAt
    ? String(s.createdAt).slice(0, 10)
    : (s.saleDate || new Date().toISOString().slice(0, 10));
  const signatureDateBE = formatDateThaiBE(signatureDateIso);
  // Customer + seller display: pull from the record (single source of truth).
  // Phase 14.10-tris (2026-04-26) — sellers were saved with `{ id, name, percent, total }`
  // shape (SaleTab.jsx line 498), but earlier SalePrintView read `sellerName`
  // (wrong key — never existed). User reported "ผู้ออกใบขายไม่ดึง" with
  // empty parens. Fix: read `name` (canonical) with fallback chain.
  const customerDisplay = s.customerName || (s.customerHN ? `HN ${s.customerHN}` : '');
  const firstSeller = (s.sellers || [])[0] || {};
  // V22 follow-up (2026-04-27) — resolveSellerName never falls back to
  // numeric seller.id; if nothing resolves we use createdBy* / blank
  // (NEVER the numeric ProClinic staff_id like "614").
  const sellerName = resolveSellerName(firstSeller, sellersLookup);
  const sellerDisplay = sellerName
    || s.createdByName
    || (typeof s.createdBy === 'string' ? s.createdBy : '')
    || '';

  // Render via React Portal into document.body so print CSS can hide #root
  // cleanly (see QuotationPrintView for the same pattern).
  const content = (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm overflow-auto print:bg-white print:backdrop-blur-none print:overflow-visible"
      data-testid="sale-print-overlay">
      <div className="print:hidden sticky top-0 z-10 bg-black/80 backdrop-blur border-b border-neutral-800">
        <div className="max-w-4xl mx-auto flex items-center gap-2 px-4 py-3">
          <h2 className="text-sm font-bold text-white flex-1">พรีวิว · ใบขาย</h2>
          <button onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white transition">
            <Printer size={14} /> พิมพ์
          </button>
          <button onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-neutral-700 hover:bg-neutral-600 text-white transition">
            <X size={14} /> ปิด
          </button>
        </div>
      </div>

      <div className="mx-auto my-8 print:my-0 bg-white text-neutral-900 shadow-2xl print:shadow-none"
        style={{ width: '210mm', minHeight: '297mm', padding: '18mm 16mm', fontFamily: "'Sarabun', 'Noto Sans Thai', system-ui, sans-serif" }}
        data-testid="sale-print-surface">

        {/* Header */}
        <div className="relative pb-5 mb-5 border-b-2" style={{ borderColor: accent }}>
          <div className="absolute -top-[18mm] -left-[16mm] h-2 w-[210mm]" style={{ background: accent }} aria-hidden />
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] tracking-[0.3em] uppercase text-neutral-500 mb-1">Invoice · ใบขาย / ใบเสร็จ</div>
              <div className="text-3xl font-black leading-tight" style={{ color: accent }}>
                {clinic.clinicName || 'LoverClinic'}
              </div>
              {clinic.clinicNameEn && (
                <div className="text-xs text-neutral-600 mt-0.5">{clinic.clinicNameEn}</div>
              )}
              {clinic.address && (
                <div className="text-[11px] text-neutral-600 mt-1.5 leading-relaxed max-w-sm">
                  {clinic.address}
                </div>
              )}
              <div className="text-[11px] text-neutral-600 mt-0.5 flex items-center gap-3 flex-wrap">
                {clinic.phone && <span>โทร: {clinic.phone}</span>}
                {clinic.taxId && <span>เลขผู้เสียภาษี: {clinic.taxId}</span>}
              </div>
            </div>
            {(() => {
              // Same as QuotationPrintView — prefer logoUrlLight (the black-red
              // variant uploaded for light backgrounds). No color manipulation.
              const printLogo = clinic.logoUrlLight || clinic.logoUrl;
              if (!printLogo) return null;
              return (
                <img src={printLogo} alt="" className="h-16 w-16 object-contain shrink-0"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              );
            })()}
          </div>
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-12 gap-x-5 gap-y-3 mb-6 text-[12px]">
          <div className="col-span-7">
            <div className="text-[10px] tracking-widest uppercase text-neutral-500 mb-0.5">ลูกค้า (Customer)</div>
            <div className="text-[15px] font-bold text-neutral-900">{s.customerName || '—'}</div>
            {s.customerHN && <div className="text-[11px] text-neutral-600 mt-0.5">HN {s.customerHN}</div>}
            {/* V33-customer-create — receipt-info block. Renders personal/company/inherit details
                from the snapshot taken at sale creation. Legacy sales without receiptInfo still show
                customerName above; if receiptInfo is set + differs from customerName, show it. */}
            {s.receiptInfo && (s.receiptInfo.taxId || s.receiptInfo.address || (s.receiptInfo.name && s.receiptInfo.name !== s.customerName)) && (
              <div className="mt-2 pt-2 border-t border-dashed border-neutral-300 text-[11px] text-neutral-700 leading-relaxed">
                <div className="text-[9px] tracking-widest uppercase text-neutral-500 mb-0.5">
                  {s.receiptInfo.type === 'company' ? 'ออกใบเสร็จในนามนิติบุคคล' : s.receiptInfo.type === 'personal' ? 'ออกใบเสร็จในนามบุคคล' : 'ออกใบเสร็จตามข้อมูลลูกค้า'}
                </div>
                {s.receiptInfo.name && s.receiptInfo.name !== s.customerName && <div className="font-semibold">{s.receiptInfo.name}</div>}
                {s.receiptInfo.taxId && <div>เลขประจำตัวผู้เสียภาษี: {s.receiptInfo.taxId}</div>}
                {s.receiptInfo.address && <div>{s.receiptInfo.address}</div>}
                {s.receiptInfo.phone && <div>โทร. {s.receiptInfo.phone}</div>}
              </div>
            )}
          </div>
          <div className="col-span-5 grid grid-cols-2 gap-x-4 gap-y-2">
            <div className="col-span-2">
              <div className="text-[10px] tracking-widest uppercase text-neutral-500 mb-0.5">เลขที่</div>
              <div className="font-mono text-[13px] font-bold" style={{ color: accent }}>{saleNumber}</div>
            </div>
            <div className="col-span-2">
              <div className="text-[10px] tracking-widest uppercase text-neutral-500 mb-0.5">วันที่</div>
              <div className="text-[12px] font-semibold">{formatDateThaiBE(s.saleDate)}</div>
            </div>
            <div className="col-span-2">
              <div className="text-[10px] tracking-widest uppercase text-neutral-500 mb-0.5">สถานะ</div>
              <div className="text-[12px] font-semibold">{statusLabel}</div>
            </div>
            {s.linkedQuotationId && (
              <div className="col-span-2">
                <div className="text-[10px] tracking-widest uppercase text-neutral-500 mb-0.5">แปลงจากใบเสนอราคา</div>
                <div className="font-mono text-[11px] text-neutral-700">{s.linkedQuotationId}</div>
              </div>
            )}
          </div>
        </div>

        {/* Line items table */}
        <table className="w-full text-[11px] border-collapse mb-6">
          <thead>
            <tr style={{ background: `${accent}0d` }}>
              <th className="text-left py-2 px-2 border-b-2 font-bold w-10" style={{ borderColor: accent }}>#</th>
              <th className="text-left py-2 px-2 border-b-2 font-bold" style={{ borderColor: accent }}>รายการ</th>
              <th className="text-right py-2 px-2 border-b-2 font-bold w-14" style={{ borderColor: accent }}>จำนวน</th>
              <th className="text-right py-2 px-2 border-b-2 font-bold w-24" style={{ borderColor: accent }}>ราคา/หน่วย</th>
              <th className="text-right py-2 px-2 border-b-2 font-bold w-20" style={{ borderColor: accent }}>ส่วนลด</th>
              <th className="text-right py-2 px-2 border-b-2 font-bold w-28" style={{ borderColor: accent }}>รวม (บาท)</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-neutral-400 italic">— ไม่มีรายการ —</td>
              </tr>
            )}
            {rows.map((r, i) => {
              const lineTotal = computeLineTotal(r);
              const disc = r.discount ?? r.itemDiscount ?? 0;
              const discType2 = r.discountType ?? r.itemDiscountType;
              const discLabel = disc
                ? (discType2 === 'percent' ? `${disc}%` : `฿${fmtMoney(disc)}`)
                : '—';
              return (
                <tr key={i} className="border-b border-neutral-200 align-top">
                  <td className="py-2 px-2 text-neutral-500">{i + 1}</td>
                  <td className="py-2 px-2">
                    <div className="flex items-start gap-2">
                      <span className="inline-flex items-center text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-wider shrink-0 mt-0.5"
                        style={{ borderColor: `${accent}40`, color: accent }}>{r.label}</span>
                      <div className="min-w-0">
                        <div className="font-semibold text-neutral-900">{r.name}</div>
                        {r.isPremium && <div className="text-[9px] text-amber-600 font-bold uppercase">ของแถม</div>}
                        {r.kind === 'med' && r.medication && (
                          <div className="text-[10px] text-neutral-600 mt-0.5 leading-snug">
                            {r.medication.genericName && <div>{r.medication.genericName}</div>}
                            {r.medication.dosageAmount && <div>ครั้งละ {r.medication.dosageAmount} {r.medication.dosageUnit}</div>}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">{r.qty}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmtMoney(r.price)}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-neutral-500">{discLabel}</td>
                  <td className="py-2 px-2 text-right tabular-nums font-semibold">{fmtMoney(lineTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-6">
          <div className="w-full sm:w-80 text-[12px]">
            <div className="flex justify-between py-1.5 border-b border-neutral-200">
              <span className="text-neutral-600">ยอดรวม</span>
              <span className="font-semibold tabular-nums">{fmtMoney(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between py-1.5 border-b border-neutral-200">
                <span className="text-neutral-600">
                  ส่วนลดรวม
                  {discType === 'percent' && ` (${headerDiscount}%)`}
                </span>
                <span className="font-semibold tabular-nums text-rose-600">− {fmtMoney(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-3 mt-1 border-t-2" style={{ borderColor: accent }}>
              <span className="text-[13px] font-bold uppercase tracking-wider">สุทธิ</span>
              <span className="text-xl font-black tabular-nums" style={{ color: accent }}>
                {fmtMoney(netTotal)} <span className="text-[11px] font-normal text-neutral-600">บาท</span>
              </span>
            </div>
            {paidAmount > 0 && (
              <div className="flex justify-between py-1.5 mt-2 text-[11px] text-neutral-600">
                <span>ชำระแล้ว</span>
                <span className="tabular-nums font-semibold text-emerald-600">{fmtMoney(paidAmount)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Note */}
        {s.saleNote && (
          <div className="mb-6 p-3 rounded bg-neutral-50 border-l-4 text-[11px] leading-relaxed" style={{ borderColor: accent }}>
            <div className="text-[10px] uppercase tracking-wider font-bold text-neutral-500 mb-1">หมายเหตุ</div>
            <div className="text-neutral-800 whitespace-pre-line">{s.saleNote}</div>
          </div>
        )}

        {/* Signatures
            Phase 14.10-bis (2026-04-26) — customer name + seller name pulled
            from the record's saved values (s.customerName + s.sellers[0]).
            Bottom date pre-fills with the record's createdAt → saleDate
            (was blank "..................") per user directive. */}
        <div className="grid grid-cols-2 gap-12 mt-auto pt-8 text-[11px]">
          <div className="text-center">
            <div className="border-t border-neutral-400 pt-2">
              <div className="font-semibold">ลูกค้า</div>
              <div className="text-neutral-700 mt-0.5">
                ( {customerDisplay || '............................................'} )
              </div>
              <div className="text-[10px] text-neutral-600 mt-3">วันที่ {signatureDateBE}</div>
            </div>
          </div>
          <div className="text-center">
            <div className="border-t border-neutral-400 pt-2">
              <div className="font-semibold">ผู้ออกใบขาย</div>
              <div className="text-neutral-700 mt-0.5">
                ( {sellerDisplay || '............................................'} )
              </div>
              <div className="text-[10px] text-neutral-600 mt-3">วันที่ {signatureDateBE}</div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          #root { display: none !important; }
          [data-testid="sale-print-overlay"] {
            position: static !important;
            background: #fff !important;
            overflow: visible !important;
          }
          [data-testid="sale-print-surface"] { box-shadow: none !important; margin: 0 !important; }
        }
      `}</style>
    </div>
  );

  return createPortal(content, document.body);
}
