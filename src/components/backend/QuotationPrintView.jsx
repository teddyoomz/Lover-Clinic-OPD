// ─── Quotation Print View — Phase 13.1.3 ──────────────────────────────────
// Customer-facing A4 document (ใบเสนอราคา). Clean, professional, Thai-first.
// Rule 04: dates in พ.ศ. (customer-facing), 24hr time, no red on names/HN.
// Print via window.print() — @media print strips the modal chrome and prints
// only the document surface.

import { useEffect, useMemo } from 'react';
import { X, Printer, Download } from 'lucide-react';

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

const ADMIN_METHOD_LABEL = {
  before_meal_30min: 'ก่อนอาหาร 30 นาที',
  after_meal: 'หลังอาหาร',
  interval: 'ทุกๆ',
};
const ADMIN_TIME_LABEL = { morning: 'เช้า', noon: 'กลางวัน', evening: 'เย็น', bedtime: 'ก่อนนอน' };

function computeLineTotal(item) {
  const gross = (Number(item.qty) || 0) * (Number(item.price) || 0);
  const disc = Number(item.itemDiscount) || 0;
  const net = item.itemDiscountType === 'percent' ? gross * (1 - disc / 100) : gross - disc;
  return Math.max(0, net);
}

export default function QuotationPrintView({ quotation, clinicSettings, onClose }) {
  const q = quotation || {};
  const clinic = clinicSettings || {};
  const accent = clinic.accentColor || '#dc2626';

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Flatten all 4 categories into one display list with category labels.
  const rows = useMemo(() => {
    const out = [];
    (q.courses || []).forEach((x) => out.push({ kind: 'course', label: 'คอร์ส', name: x.courseName || x.courseId, ...x }));
    (q.products || []).forEach((x) => out.push({ kind: 'product', label: 'สินค้า', name: x.productName || x.productId, ...x }));
    (q.promotions || []).forEach((x) => out.push({ kind: 'promotion', label: 'โปรโมชัน', name: x.promotionName || x.promotionId, ...x }));
    (q.takeawayMeds || []).forEach((x) => out.push({ kind: 'med', label: 'ยา', name: x.productName || x.productId, ...x }));
    return out;
  }, [q.courses, q.products, q.promotions, q.takeawayMeds]);

  const subtotal = rows.reduce((sum, r) => sum + computeLineTotal(r), 0);
  const headerDiscount = Number(q.discount) || 0;
  const discountAmount = q.discountType === 'percent'
    ? subtotal * (headerDiscount / 100)
    : headerDiscount;
  const netTotal = Math.max(0, subtotal - discountAmount);

  const quotationNumber = q.quotationId || q.id || '—';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm overflow-auto print:bg-white print:backdrop-blur-none print:overflow-visible"
      data-testid="quotation-print-overlay">
      {/* Screen chrome — hidden on print */}
      <div className="print:hidden sticky top-0 z-10 bg-black/80 backdrop-blur border-b border-neutral-800">
        <div className="max-w-4xl mx-auto flex items-center gap-2 px-4 py-3">
          <h2 className="text-sm font-bold text-white flex-1">พรีวิว · ใบเสนอราคา</h2>
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

      {/* A4 document surface */}
      <div className="mx-auto my-8 print:my-0 bg-white text-neutral-900 shadow-2xl print:shadow-none"
        style={{ width: '210mm', minHeight: '297mm', padding: '18mm 16mm', fontFamily: "'Sarabun', 'Noto Sans Thai', system-ui, sans-serif" }}
        data-testid="quotation-print-surface">

        {/* Header band — accent stripe + clinic block */}
        <div className="relative pb-5 mb-5 border-b-2" style={{ borderColor: accent }}>
          <div className="absolute -top-[18mm] -left-[16mm] h-2 w-[210mm]" style={{ background: accent }} aria-hidden />
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] tracking-[0.3em] uppercase text-neutral-500 mb-1">Quotation · ใบเสนอราคา</div>
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

            {clinic.logoUrl && (
              <img src={clinic.logoUrl} alt="" className="h-16 w-16 object-contain shrink-0"
                onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            )}
          </div>
        </div>

        {/* Meta grid — quotation number + date + customer */}
        <div className="grid grid-cols-12 gap-x-5 gap-y-3 mb-6 text-[12px]">
          <div className="col-span-7">
            <div className="text-[10px] tracking-widest uppercase text-neutral-500 mb-0.5">เรียน (Customer)</div>
            <div className="text-[15px] font-bold text-neutral-900">{q.customerName || '—'}</div>
            {q.customerHN && <div className="text-[11px] text-neutral-600 mt-0.5">HN {q.customerHN}</div>}
          </div>

          <div className="col-span-5 grid grid-cols-2 gap-x-4 gap-y-2">
            <div className="col-span-2">
              <div className="text-[10px] tracking-widest uppercase text-neutral-500 mb-0.5">เลขที่</div>
              <div className="font-mono text-[13px] font-bold" style={{ color: accent }}>{quotationNumber}</div>
            </div>
            <div className="col-span-2">
              <div className="text-[10px] tracking-widest uppercase text-neutral-500 mb-0.5">วันที่</div>
              <div className="text-[12px] font-semibold">{formatDateThaiBE(q.quotationDate)}</div>
            </div>
            {q.sellerName && (
              <div className="col-span-2">
                <div className="text-[10px] tracking-widest uppercase text-neutral-500 mb-0.5">พนักงานขาย</div>
                <div className="text-[12px]">{q.sellerName}</div>
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
              const discLabel = r.itemDiscount
                ? (r.itemDiscountType === 'percent' ? `${r.itemDiscount}%` : `฿${fmtMoney(r.itemDiscount)}`)
                : '—';
              return (
                <tr key={`${r.kind}-${i}`} className="border-b border-neutral-200 align-top">
                  <td className="py-2 px-2 text-neutral-500">{i + 1}</td>
                  <td className="py-2 px-2">
                    <div className="flex items-start gap-2">
                      <span className="inline-flex items-center text-[9px] px-1.5 py-0.5 rounded border border-neutral-300 text-neutral-600 uppercase tracking-wider shrink-0 mt-0.5"
                        style={{ borderColor: `${accent}40`, color: accent }}>{r.label}</span>
                      <div className="min-w-0">
                        <div className="font-semibold text-neutral-900">{r.name}</div>
                        {r.isPremium && <div className="text-[9px] text-amber-600 font-bold uppercase">ของแถม</div>}
                        {r.kind === 'med' && (
                          <div className="text-[10px] text-neutral-600 mt-0.5 leading-snug space-y-0.5">
                            {r.genericName && <div>{r.genericName}</div>}
                            {r.indications && <div>ข้อบ่งใช้: {r.indications}</div>}
                            {(r.dosageAmount || r.dosageUnit) && (
                              <div>
                                ครั้งละ {r.dosageAmount} {r.dosageUnit}
                                {r.timesPerDay && ` · วันละ ${r.timesPerDay} ครั้ง`}
                              </div>
                            )}
                            {r.administrationMethod && (
                              <div>
                                {ADMIN_METHOD_LABEL[r.administrationMethod] || r.administrationMethod}
                                {r.administrationMethod === 'interval' && r.administrationMethodHour ? ` ${r.administrationMethodHour} ชม.` : ''}
                                {r.administrationTimes?.length > 0 && ` · ${r.administrationTimes.map((t) => ADMIN_TIME_LABEL[t] || t).join(' · ')}`}
                              </div>
                            )}
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

        {/* Totals panel */}
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
                  {q.discountType === 'percent' && ` (${headerDiscount}%)`}
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
          </div>
        </div>

        {/* Note + terms */}
        {q.note && (
          <div className="mb-6 p-3 rounded bg-neutral-50 border-l-4 text-[11px] leading-relaxed" style={{ borderColor: accent }}>
            <div className="text-[10px] uppercase tracking-wider font-bold text-neutral-500 mb-1">หมายเหตุ</div>
            <div className="text-neutral-800 whitespace-pre-line">{q.note}</div>
          </div>
        )}

        <div className="text-[10px] text-neutral-500 leading-relaxed mb-8">
          <div className="font-bold text-neutral-700 mb-1">เงื่อนไขการเสนอราคา</div>
          <ol className="list-decimal list-inside space-y-0.5">
            <li>ราคานี้มีผลภายใน 30 วันนับจากวันที่เสนอราคา</li>
            <li>ราคาอาจมีการเปลี่ยนแปลงตามสิทธิ์โปรโมชันในแต่ละช่วงเวลา</li>
            <li>กรุณานำใบเสนอราคานี้มาแสดงเพื่อยืนยันราคาในวันเข้ารับบริการ</li>
          </ol>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-12 mt-auto pt-8 text-[11px]">
          <div className="text-center">
            <div className="border-t border-neutral-400 pt-2">
              <div className="font-semibold">ลูกค้า</div>
              <div className="text-neutral-500 mt-0.5">( ............................................ )</div>
              <div className="text-[10px] text-neutral-500 mt-3">วันที่ ..................</div>
            </div>
          </div>
          <div className="text-center">
            <div className="border-t border-neutral-400 pt-2">
              <div className="font-semibold">ผู้เสนอราคา</div>
              <div className="text-neutral-500 mt-0.5">
                ( {q.sellerName || '............................................'} )
              </div>
              <div className="text-[10px] text-neutral-500 mt-3">วันที่ ..................</div>
            </div>
          </div>
        </div>
      </div>

      {/* Print CSS: A4 portrait, no margins on page, hide chrome */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body { background: #fff !important; }
          [data-testid="quotation-print-overlay"] { position: static !important; background: #fff !important; }
          [data-testid="quotation-print-surface"] { box-shadow: none !important; margin: 0 !important; }
        }
      `}</style>
    </div>
  );
}
