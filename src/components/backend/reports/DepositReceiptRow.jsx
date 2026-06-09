// DepositReceiptRow (2026-06-09) — one "มัดจำที่รับเข้า" row, shared by the
// reports-payment drill-down (PaymentDocsModal) AND the reports-sale section
// (Rule C1). Click → open the finance·deposit tab focused on this deposit
// (new tab, keeps the report context — mirrors the customer-link pattern).
import { ChevronRight } from 'lucide-react';
import { buildDepositDeepLinkUrl } from '../../../lib/depositReportUtils.js';
import { fmtMoney } from '../../../lib/financeUtils.js';

function fmtDateCE(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export default function DepositReceiptRow({ deposit }) {
  const d = deposit || {};
  const id = d.depositId || d.id || '';
  const name = d.customerName || d.customerNameTemp || '-';
  const open = () => {
    if (typeof window === 'undefined' || !id) return;
    window.open(buildDepositDeepLinkUrl(id), '_blank');
  };
  return (
    <button
      type="button"
      onClick={open}
      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left border-t border-[var(--bd)] first:border-t-0 hover:bg-teal-900/10 transition-colors"
      data-testid={`deposit-receipt-row-${id}`}
      title="เปิดหน้ามัดจำใบนี้ในแท็บใหม่"
    >
      <span className="text-[10px] font-mono text-[var(--tx-muted)] tabular-nums shrink-0">{fmtDateCE(d.paymentDate)}</span>
      {d.customerHN && <span className="text-[10px] font-mono text-[var(--tx-muted)] shrink-0">{d.customerHN}</span>}
      <span className="text-xs text-[var(--tx-secondary)] truncate min-w-0">{name}</span>
      {d.paymentChannel && (
        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold border bg-teal-900/30 text-teal-300 border-teal-700/50 shrink-0">
          {d.paymentChannel}
        </span>
      )}
      <span className="ml-auto text-xs font-bold tabular-nums text-teal-400 shrink-0">{fmtMoney(Number(d.amount) || 0)}</span>
      <ChevronRight size={13} className="text-teal-400 shrink-0" />
    </button>
  );
}
