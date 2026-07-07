// PaymentDocsModal (2026-06-09) — drill-down for one channel row in
// reports-payment. Lists the documents that make up the row: ใบขาย (sales) +
// ใบมัดจำ (deposits). Sale → onViewSale(saleId) (parent opens SaleDetailModal,
// z-90, above this z-80). Deposit → DepositReceiptRow (new-tab deep-link).
import { useEffect, useMemo } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { getMethodDocuments } from '../../../lib/paymentSummaryAggregator.js';
import { fmtMoney } from '../../../lib/financeUtils.js';
import DepositReceiptRow from './DepositReceiptRow.jsx';
import { useModalScrollLock } from '../../../lib/useModalScrollLock.js';

function fmtDateCE(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export default function PaymentDocsModal({ method, sales, deposits, range = {}, onViewSale, onClose }) {
  useModalScrollLock(true); // AV205 — renders only while open
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const docs = useMemo(
    () => getMethodDocuments(sales, deposits, method, range),
    [sales, deposits, method, range]
  );

  return (
    // AV78: backdrop click does NOT close — explicit close only (X / ESC)
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto overscroll-contain"
      role="dialog"
      aria-modal="true"
      data-testid="payment-docs-modal"
    >
      <div className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--bd)]">
          <div className="text-sm font-bold text-[var(--tx-primary)]">
            {method} <span className="text-[var(--tx-muted)] font-normal">· {docs.length} เอกสาร</span>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--tx-muted)]" data-testid="payment-docs-close" title="ปิด">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-auto">
          {docs.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-[var(--tx-muted)]">ไม่มีเอกสาร</div>
          ) : (
            docs.map(doc => (
              doc.type === 'sale' ? (
                <button
                  key={`sale-${doc.id}`}
                  type="button"
                  onClick={() => onViewSale?.(doc.id)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left border-t border-[var(--bd)] first:border-t-0 hover:bg-cyan-900/10 transition-colors"
                  data-testid={`payment-docs-sale-${doc.id}`}
                  title="ดูรายละเอียดใบเสร็จ"
                >
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold border bg-cyan-900/30 text-cyan-300 border-cyan-700/50 shrink-0">ใบขาย</span>
                  <span className="text-[10px] font-mono text-[var(--tx-muted)] tabular-nums shrink-0">{fmtDateCE(doc.date)}</span>
                  {doc.hn && <span className="text-[10px] font-mono text-[var(--tx-muted)] shrink-0">{doc.hn}</span>}
                  <span className="text-xs text-[var(--tx-secondary)] truncate min-w-0">{doc.name || '-'}</span>
                  <span className="ml-auto text-xs font-bold tabular-nums text-emerald-400 shrink-0">{fmtMoney(doc.amount)}</span>
                  <ChevronRight size={13} className="text-cyan-400 shrink-0" />
                </button>
              ) : (
                <DepositReceiptRow key={`dep-${doc.id}`} deposit={doc.doc} />
              )
            ))
          )}
        </div>
      </div>
    </div>
  );
}
