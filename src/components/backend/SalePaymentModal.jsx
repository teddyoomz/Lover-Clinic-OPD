// ─── Sale Payment Modal — Phase 13.1.4 support ───────────────────────────
// Compact payment recorder for sales created via convert-from-quotation.
// Records one channel per open (call markSalePaid), updates sale totals +
// status in Firestore. Multi-channel split-pay: re-open and record again.

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, Loader2 } from 'lucide-react';
import DateField from '../DateField.jsx';
import { markSalePaid } from '../../lib/backendClient.js';
import { thaiTodayISO } from '../../utils.js';

const METHOD_OPTIONS = Object.freeze([
  'เงินสด', 'โอน', 'บัตรเครดิต', 'บัตรสมาชิก', 'Wallet',
]);

export default function SalePaymentModal({ sale, onClose, onSaved }) {
  const s = sale || {};
  const netTotal = Number(s.billing?.netTotal ?? s.netTotal) || 0;
  const alreadyPaid = Number(s.totalPaidAmount) || 0;
  const remaining = Math.max(0, netTotal - alreadyPaid);

  const [method, setMethod] = useState('เงินสด');
  const [amount, setAmount] = useState(String(remaining.toFixed(2)));
  // Audit P0 (2026-04-26 TZ1): paidAt MUST use Bangkok TZ helper.
  // Raw UTC slice would drift to YESTERDAY during 00:00-07:00 Bangkok →
  // reports filter wrong day → money record dated wrong (V12-class TZ
  // off-by-one bug pattern). thaiTodayISO is the canonical helper.
  const [paidAt, setPaidAt] = useState(thaiTodayISO());
  const [refNo, setRefNo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = async () => {
    setError('');
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('กรุณากรอกจำนวนเงินที่ถูกต้อง');
      return;
    }
    if (amt > remaining + 0.01) {
      const ok = window.confirm(`ยอดชำระ ${amt.toLocaleString('th-TH')} บาท เกินยอดคงเหลือ ${remaining.toLocaleString('th-TH')} บาท. ดำเนินการต่อหรือไม่?`);
      if (!ok) return;
    }
    setSaving(true);
    try {
      await markSalePaid(s.saleId || s.id, { method, amount: amt, paidAt, refNo: refNo.trim() });
      onSaved?.();
    } catch (e) {
      setError(e.message || 'บันทึกชำระไม่สำเร็จ');
    } finally { setSaving(false); }
  };

  const saleLabel = s.saleId || s.id || '—';

  const content = (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 overflow-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      data-testid="sale-payment-overlay">
      <div className="w-full max-w-md mt-12 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] shadow-2xl"
        data-testid="sale-payment-modal">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--bd)]">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <h2 className="text-sm font-bold text-[var(--tx-heading)] flex-1">บันทึกชำระใบขาย</h2>
          <button onClick={onClose}
            className="p-1 rounded text-[var(--tx-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--tx-primary)]"
            aria-label="ปิด">
            <X size={14} />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3 text-sm">
          <div className="flex items-center justify-between text-xs p-2 rounded bg-[var(--bg-hover)] border border-[var(--bd)]">
            <div className="space-y-0.5">
              <div className="font-mono text-[var(--tx-muted)]">{saleLabel}</div>
              {s.customerName && <div className="font-semibold text-[var(--tx-heading)]">{s.customerName}</div>}
            </div>
            <div className="text-right">
              <div className="text-[10px] text-[var(--tx-muted)] uppercase tracking-wider">คงเหลือ</div>
              <div className="text-base font-black text-emerald-400">
                {remaining.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          <label className="block text-xs">
            <span className="font-semibold text-[var(--tx-muted)] block mb-1">วิธีชำระ</span>
            <select value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full px-2 py-1.5 rounded bg-[var(--bg-hover)] border border-[var(--bd)]"
              data-testid="payment-method-select">
              {METHOD_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>

          <label className="block text-xs">
            <span className="font-semibold text-[var(--tx-muted)] block mb-1">จำนวนเงิน (บาท)</span>
            <input type="number" min="0" step="0.01" value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-2 py-1.5 rounded bg-[var(--bg-hover)] border border-[var(--bd)] font-mono"
              data-testid="payment-amount-input" />
          </label>

          <label className="block text-xs">
            <span className="font-semibold text-[var(--tx-muted)] block mb-1">วันที่ชำระ</span>
            <DateField value={paidAt} onChange={setPaidAt} locale="ce" />
          </label>

          <label className="block text-xs">
            <span className="font-semibold text-[var(--tx-muted)] block mb-1">เลขที่อ้างอิง / สลิป (ถ้ามี)</span>
            <input type="text" value={refNo}
              onChange={(e) => setRefNo(e.target.value)}
              placeholder="(optional)"
              className="w-full px-2 py-1.5 rounded bg-[var(--bg-hover)] border border-[var(--bd)]" />
          </label>

          {error && (
            <div className="px-3 py-2 rounded bg-red-900/30 border border-red-700/50 text-red-300 text-xs">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--bd)]">
          <button onClick={onClose}
            className="px-3 py-1.5 rounded text-xs font-bold bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
            ยกเลิก
          </button>
          <button onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50"
            data-testid="payment-save-button">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            บันทึกชำระ
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
