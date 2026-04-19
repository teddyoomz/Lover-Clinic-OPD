// ─── SaleDetailModal — read-only sale detail panel for Phase 10 reports ────
// Used by SaleReportTab (and future report tabs) to expand a sale row.
// Shows items + billing breakdown + payment channels + sellers + audit fields.
//
// Why a separate component (not reusing SaleTab's modal): SaleTab's modal is
// embedded in a ~3000-LOC stateful tab and includes edit/cancel/refund actions
// we don't want here (Reports = read-only, Rule E spirit). This is a thin
// presentational shell over a single sale doc.

import { useEffect } from 'react';
import { X, Pill, ShoppingCart, Receipt, Users, Wallet, CreditCard } from 'lucide-react';
import { fmtMoney } from '../../../lib/financeUtils.js';

/** Format YYYY-MM-DD as dd/mm/yyyy ค.ศ. (admin convention — AR13). */
function fmtDateCE(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

const STATUS_COLOR = {
  paid:   'text-emerald-400 bg-emerald-900/30',
  split:  'text-orange-400 bg-orange-900/30',
  unpaid: 'text-red-400 bg-red-900/30',
};
const STATUS_LABEL = { paid: 'ชำระแล้ว', split: 'ชำระบางส่วน', unpaid: 'ค้างชำระ' };

/**
 * @param {object} props
 * @param {object} props.sale            — be_sale doc (raw, not aggregated row)
 * @param {() => void} props.onClose
 * @param {(customerId: string) => void} [props.onOpenCustomer]
 *   Receives the customer's proClinicId. Default: opens new tab to backend
 *   customer detail page.
 */
export default function SaleDetailModal({ sale, onClose, onOpenCustomer }) {
  // Esc-to-close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!sale) return null;

  const billing = sale.billing || {};
  const payment = sale.payment || {};
  const items = sale.items || {};
  const courses = Array.isArray(items.courses) ? items.courses : [];
  const products = Array.isArray(items.products) ? items.products : [];
  const medications = Array.isArray(items.medications) ? items.medications : [];
  const promotions = Array.isArray(items.promotions) ? items.promotions : [];
  const channels = Array.isArray(payment.channels) ? payment.channels : [];
  const sellers = Array.isArray(sale.sellers) ? sale.sellers : [];

  const isCancelled = sale.status === 'cancelled';

  const handleOpenCustomer = () => {
    const cid = String(sale.customerId || '');
    if (!cid) return;
    if (onOpenCustomer) {
      onOpenCustomer(cid);
    } else if (typeof window !== 'undefined') {
      window.open(`${window.location.origin}?backend=1&customer=${cid}`, '_blank');
    }
  };

  const channelSum = channels.reduce((s, c) => s + (Number(c?.amount) || 0), 0);
  const netTotal = Number(billing.netTotal) || 0;
  const outstanding = Math.max(0, netTotal - channelSum);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sale-detail-title"
      onClick={onClose}
      data-testid="sale-detail-modal"
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl bg-[var(--bg-card)] border border-[var(--bd)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--bd)] flex items-center justify-between sticky top-0 bg-[var(--bg-card)] z-10">
          <div>
            <h3 id="sale-detail-title" className="text-base font-bold text-cyan-400 flex items-center gap-2">
              <Receipt size={16} /> {sale.saleId || sale.id || '—'}
              {isCancelled && (
                <span className="text-[10px] font-bold uppercase tracking-wider bg-red-900/30 text-red-400 px-2 py-0.5 rounded">
                  ยกเลิก
                </span>
              )}
            </h3>
            <p className="text-xs text-[var(--tx-muted)] mt-0.5">
              <button
                type="button"
                onClick={handleOpenCustomer}
                className="hover:text-cyan-400 underline-offset-2 hover:underline transition-colors"
                data-testid="open-customer-link"
                disabled={!sale.customerId}
              >
                {sale.customerHN ? `${sale.customerHN} ` : ''}{sale.customerName || '-'}
              </button>
              {' · '}{fmtDateCE(sale.saleDate)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--tx-muted)] hover:text-[var(--tx-primary)] p-1"
            aria-label="ปิด"
            data-testid="close-modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {/* Items section */}
          <Section icon={ShoppingCart} title="รายการ">
            {courses.length === 0 && products.length === 0 && medications.length === 0 && promotions.length === 0 && (
              <p className="text-[var(--tx-muted)] py-2 text-center">— ไม่มีรายการ —</p>
            )}
            {promotions.map((it, i) => (
              <ItemRow key={`promo-${i}`} name={it.name} qty={it.qty} unitPrice={it.unitPrice} prefix="โปร: " />
            ))}
            {courses.map((it, i) => (
              <ItemRow key={`c-${i}`} name={it.name} qty={it.qty} unitPrice={it.unitPrice} />
            ))}
            {products.map((it, i) => (
              <ItemRow key={`p-${i}`} name={it.name} qty={it.qty} unitPrice={it.unitPrice} prefix="สินค้า: " />
            ))}
            {medications.map((it, i) => (
              <ItemRow
                key={`m-${i}`}
                name={it.name}
                qty={it.qty}
                unitPrice={it.unitPrice}
                prefix={<Pill size={10} className="inline mr-1 text-purple-400" />}
                suffix={it.dosage ? ` ${it.dosage}` : ''}
              />
            ))}
          </Section>

          {/* Billing breakdown */}
          <Section icon={Receipt} title="สรุปยอด">
            <BillingRow label="ยอดรวม" value={billing.subtotal} />
            {Number(billing.billDiscount) > 0 && (
              <BillingRow label="ส่วนลด" value={-billing.billDiscount} color="text-red-400" />
            )}
            {Number(billing.membershipDiscount) > 0 && (
              <BillingRow
                label={`ส่วนลดสมาชิก (${billing.membershipDiscountPercent || 0}%)`}
                value={-billing.membershipDiscount}
                color="text-purple-400"
              />
            )}
            {Number(billing.depositApplied) > 0 && (
              <BillingRow label="หักมัดจำ" value={-billing.depositApplied} color="text-emerald-400" />
            )}
            {(Array.isArray(billing.depositIds) ? billing.depositIds : []).map((d, i) => (
              <div key={`d${i}`} className="flex justify-between text-[10px] text-[var(--tx-muted)] pl-4">
                <span className="font-mono">· {d.depositId}</span>
                <span className="font-mono">{fmtMoney(d.amount)} บาท</span>
              </div>
            ))}
            {Number(billing.walletApplied) > 0 && (
              <BillingRow
                label={`หัก Wallet${billing.walletTypeName ? ` (${billing.walletTypeName})` : ''}`}
                value={-billing.walletApplied}
                color="text-sky-400"
              />
            )}
            <div className="flex justify-between pt-2 mt-1 border-t border-[var(--bd)] font-bold">
              <span>ยอดสุทธิ</span>
              <span className="text-emerald-400 font-mono">{fmtMoney(netTotal)} บาท</span>
            </div>
            {outstanding > 0 && (
              <div className="flex justify-between text-red-400 font-bold">
                <span>ค้างชำระ</span>
                <span className="font-mono">{fmtMoney(outstanding)} บาท</span>
              </div>
            )}
            {Number(sale.refundAmount) > 0 && (
              <div className="flex justify-between text-orange-400 font-bold">
                <span>คืนเงิน</span>
                <span className="font-mono">{fmtMoney(sale.refundAmount)} บาท</span>
              </div>
            )}
          </Section>

          {/* Payment channels */}
          <Section icon={CreditCard} title="ช่องทางชำระเงิน">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[var(--tx-muted)]">สถานะ:</span>
              <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${STATUS_COLOR[payment.status] || ''}`}>
                {STATUS_LABEL[payment.status] || 'ค้างชำระ'}
              </span>
            </div>
            {channels.length === 0 ? (
              <p className="text-[var(--tx-muted)] py-1">— ยังไม่ได้รับชำระ —</p>
            ) : (
              channels.map((c, i) => (
                <div key={i} className="flex justify-between py-1 border-b border-[var(--bd)]/50 last:border-0">
                  <span>
                    {c.name || '-'}
                    {c.refNo && <span className="text-[10px] text-[var(--tx-muted)] ml-2">Ref: {c.refNo}</span>}
                  </span>
                  <span className="font-mono">{fmtMoney(c.amount)} บาท</span>
                </div>
              ))
            )}
            {(payment.date || payment.time) && (
              <div className="flex justify-between text-[10px] text-[var(--tx-muted)] mt-2">
                <span>วันที่ชำระ</span>
                <span>{fmtDateCE(payment.date)}{payment.time ? ` · ${payment.time}` : ''}</span>
              </div>
            )}
            {payment.note && (
              <div className="text-[10px] text-[var(--tx-muted)] mt-1">หมายเหตุ: {payment.note}</div>
            )}
          </Section>

          {/* Sellers */}
          {sellers.length > 0 && (
            <Section icon={Users} title="พนักงานขาย / ค่าคอมมิชชัน">
              {sellers.map((s, i) => (
                <div key={s.id || i} className="flex justify-between py-1 border-b border-[var(--bd)]/50 last:border-0">
                  <span>
                    {s.name || '-'}
                    {s.percent !== undefined && (
                      <span className="text-[10px] text-[var(--tx-muted)] ml-2">{s.percent}%</span>
                    )}
                  </span>
                  <span className="font-mono">{fmtMoney(s.total)} บาท</span>
                </div>
              ))}
            </Section>
          )}

          {/* Audit fields */}
          {(sale.createdBy || sale.cancelledBy || sale.saleNote) && (
            <Section icon={Wallet} title="ข้อมูลเพิ่มเติม">
              {sale.createdBy && <KV label="ผู้ทำรายการ" value={sale.createdBy} />}
              {sale.cancelledBy && <KV label="ผู้ยกเลิก" value={sale.cancelledBy} />}
              {sale.saleNote && <KV label="หมายเหตุ" value={sale.saleNote} />}
              {sale.createdAt && <KV label="สร้างเมื่อ" value={sale.createdAt} mono />}
            </Section>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3 border-t border-[var(--bd)] flex items-center justify-between sticky bottom-0 bg-[var(--bg-card)]">
          <button
            type="button"
            onClick={handleOpenCustomer}
            className="text-xs font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5"
            disabled={!sale.customerId}
            data-testid="footer-open-customer"
          >
            <Users size={14} /> ดูข้อมูลลูกค้า
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-bold rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-secondary)] hover:text-[var(--tx-primary)]"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Tiny presentational helpers ─────────────────────────────────────────── */

function Section({ icon: Icon, title, children }) {
  return (
    <div>
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--tx-muted)] mb-2 flex items-center gap-1.5">
        {Icon ? <Icon size={11} /> : null} {title}
      </h4>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function ItemRow({ name, qty, unitPrice, prefix, suffix }) {
  const lineTotal = (Number(unitPrice) || 0) * (Number(qty) || 1);
  return (
    <div className="flex justify-between py-1 border-b border-[var(--bd)]/50 last:border-0">
      <span>
        {prefix}{name || '-'}{suffix}
        {qty !== undefined && <span className="text-[var(--tx-muted)] ml-2">×{qty}</span>}
      </span>
      <span className="font-mono">{fmtMoney(lineTotal)} บาท</span>
    </div>
  );
}

function BillingRow({ label, value, color }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--tx-muted)]">{label}</span>
      <span className={`font-mono ${color || ''}`}>{fmtMoney(value)} บาท</span>
    </div>
  );
}

function KV({ label, value, mono = false }) {
  return (
    <div className="flex justify-between text-[10px]">
      <span className="text-[var(--tx-muted)]">{label}</span>
      <span className={mono ? 'font-mono' : ''}>{value}</span>
    </div>
  );
}
