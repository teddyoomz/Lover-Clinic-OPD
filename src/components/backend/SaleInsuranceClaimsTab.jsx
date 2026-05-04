// ─── Sale Insurance Claims Tab — Phase 12.3 (2026-04-25) ──────────────────
// Backs onto be_sale_insurance_claims. Backend CRUD + validator shipped
// in Phase 12.7 but had no UI entry point until Phase 12.3. Multi-claim-
// per-sale: partial reimbursements land as separate rows; SaleReport
// aggregator sums paid amounts by saleId.
//
// Status machine (saleInsuranceClaimValidation.js TRANSITIONS):
//   pending  → approved | rejected
//   approved → paid | rejected
//   paid     → (terminal)
//   rejected → (terminal)
//
// ProClinic parity (/admin/sale-insurance-claim, intel 2026-04-24):
// - Same column layout: sale# · customer · insurance info · claim ฿ ·
//   paid ฿ · status · actions.
// - Payment modal identical field set (paidAmount + method + file + note),
//   saved via transitionSaleInsuranceClaim({status:'paid', paidAmount}).
// - ProClinic POST /admin/sale/insurance-claim/payment — NOT called
//   (Rule E: backend = Firestore only).
//
// MODAL pattern (not inline form): the MarketingTabShell hides `children`
// when items.length === 0 (renders "empty state" instead), which would
// otherwise hide the inline form on a fresh install. The form lives in
// a modal that renders OUTSIDE the shell's body slot, so first-time users
// can always press "+ เพิ่ม" to create their first claim.

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Edit2, Trash2, Shield, Plus,
  CheckCircle2, XCircle, Clock, Banknote,
} from 'lucide-react';
import {
  listSaleInsuranceClaims,
  deleteSaleInsuranceClaim,
  transitionSaleInsuranceClaim,
  getAllSales,
  listBankAccounts,
} from '../../lib/scopedDataLayer.js';
import { STATUS_OPTIONS } from '../../lib/saleInsuranceClaimValidation.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import MarketingTabShell from './MarketingTabShell.jsx';
import SaleInsuranceClaimFormModal from './SaleInsuranceClaimFormModal.jsx';

const STATUS_BADGE = {
  pending:  { label: 'รออนุมัติ', cls: 'bg-amber-700/20 border-amber-700/40 text-amber-400',   icon: Clock },
  approved: { label: 'อนุมัติ',   cls: 'bg-sky-700/20 border-sky-700/40 text-sky-400',         icon: CheckCircle2 },
  paid:     { label: 'ชำระแล้ว', cls: 'bg-emerald-700/20 border-emerald-700/40 text-emerald-400', icon: Banknote },
  rejected: { label: 'ปฏิเสธ',   cls: 'bg-rose-700/20 border-rose-700/40 text-rose-400',       icon: XCircle },
};

export default function SaleInsuranceClaimsTab({ clinicSettings }) {
  // Phase BS — branch-scoped sales fetch.
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [items, setItems] = useState([]);
  const [sales, setSales] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [transitioning, setTransitioning] = useState(null);

  // Form modal state
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  // Pay modal state
  const [payOpen, setPayOpen] = useState(null);
  const [payForm, setPayForm] = useState({ paidAmount: 0, paymentMethod: '', claimFileUrl: '', note: '' });

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [cls, ss, bs] = await Promise.all([
        listSaleInsuranceClaims(),
        getAllSales({ branchId: selectedBranchId }),
        listBankAccounts(),
      ]);
      setItems(cls);
      setSales(ss);
      setBankAccounts(bs);
    } catch (e) { setError(e.message || 'โหลดข้อมูลล้มเหลว'); setItems([]); }
    finally { setLoading(false); }
  }, [selectedBranchId]);
  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(c => {
      if (filterStatus && c.status !== filterStatus) return false;
      if (q) {
        const hay = [c.saleId, c.customerHN, c.customerName, c.insuranceCompany, c.policyNumber, c.note]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, filterStatus, query]);

  const handleCreate = () => { setEditing(null); setFormOpen(true); };

  const handleEdit = (c) => { setEditing(c); setFormOpen(true); };

  const handleFormClose = () => { setFormOpen(false); setEditing(null); };
  const handleFormSaved = async () => { await reload(); };

  const handleDelete = async (c) => {
    const id = c.claimId || c.id;
    if (!window.confirm('ลบรายการเบิกประกันนี้?')) return;
    try { await deleteSaleInsuranceClaim(id); await reload(); }
    catch (e) { setError(e.message); }
  };

  const handleTransition = async (c, nextStatus, extra = {}) => {
    const id = c.claimId || c.id;
    setTransitioning(id); setError('');
    try { await transitionSaleInsuranceClaim(id, nextStatus, extra); await reload(); }
    catch (e) { setError(e.message); }
    finally { setTransitioning(null); }
  };

  const openPayModal = (c) => {
    const claimTotal = Number(c.claimAmount) || 0;
    const already = Number(c.paidAmount) || 0;
    const remaining = Math.max(0, claimTotal - already);
    setPayForm({ paidAmount: remaining, paymentMethod: '', claimFileUrl: c.claimFileUrl || '', note: '' });
    setPayOpen(c);
  };

  const handlePaySubmit = async (e) => {
    e.preventDefault();
    const c = payOpen;
    if (!c) return;
    await handleTransition(c, 'paid', { paidAmount: Number(payForm.paidAmount) || 0 });
    setPayOpen(null);
  };

  const extraFilters = (
    <select
      value={filterStatus}
      onChange={(e) => setFilterStatus(e.target.value)}
      className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
      data-testid="insurance-claim-status-filter"
    >
      <option value="">สถานะทั้งหมด</option>
      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_BADGE[s].label}</option>)}
    </select>
  );

  return (
    <>
      <MarketingTabShell
        icon={Shield}
        title="เบิกประกัน"
        totalCount={items.length}
        filteredCount={filtered.length}
        createLabel="เพิ่มเบิกประกัน"
        onCreate={handleCreate}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="ค้นหาใบเสร็จ / HN / บริษัทประกัน"
        extraFilters={extraFilters}
        error={error}
        loading={loading}
        emptyText='ยังไม่มีรายการเบิกประกัน — กดปุ่ม "เพิ่มเบิกประกัน" เพื่อสร้างรายการแรก'
        notFoundText="ไม่พบรายการที่ตรงกับตัวกรอง"
        clinicSettings={clinicSettings}
      >
        <div className="space-y-1" data-testid="insurance-claims-list">
          {filtered.map(c => {
            const id = c.claimId || c.id;
            const badge = STATUS_BADGE[c.status] || STATUS_BADGE.pending;
            const BadgeIcon = badge.icon;
            const busy = transitioning === id;
            const claimTotal = Number(c.claimAmount) || 0;
            const paid = Number(c.paidAmount) || 0;
            const isTerminal = c.status === 'paid' || c.status === 'rejected';
            return (
              <div key={id} data-testid={`insurance-claim-row-${id}`}
                className="flex items-center gap-2 p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] text-sm flex-wrap">
                <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-bold uppercase tracking-wider ${badge.cls}`}>
                  <BadgeIcon size={10} /> {badge.label}
                </span>
                <span className="text-xs text-[var(--tx-muted)]">{c.claimDate || '—'}</span>
                <span className="font-mono text-xs">{c.saleId || '—'}</span>
                <span className="font-bold">{c.customerName || c.customerId}</span>
                {c.customerHN && <span className="text-xs text-[var(--tx-muted)]">{c.customerHN}</span>}
                {c.insuranceCompany && <span className="text-xs text-[var(--tx-muted)]">· {c.insuranceCompany}</span>}
                {c.policyNumber && <span className="text-xs text-[var(--tx-muted)]">(#{c.policyNumber})</span>}
                <span className="ml-auto font-bold text-emerald-400">฿{claimTotal.toLocaleString('th-TH')}</span>
                {paid > 0 && (
                  <span className="text-xs text-[var(--tx-muted)]">ชำระแล้ว ฿{paid.toLocaleString('th-TH')}</span>
                )}
                {c.status === 'pending' && (
                  <button disabled={busy} onClick={() => handleTransition(c, 'approved')}
                    data-testid={`insurance-claim-approve-${id}`}
                    className="px-2 py-1 rounded text-xs bg-sky-700 text-white disabled:opacity-50">อนุมัติ</button>
                )}
                {(c.status === 'pending' || c.status === 'approved') && (
                  <>
                    <button disabled={busy} onClick={() => openPayModal(c)}
                      data-testid={`insurance-claim-pay-${id}`}
                      className="px-2 py-1 rounded text-xs bg-emerald-700 text-white disabled:opacity-50">ชำระเงิน</button>
                    <button disabled={busy} onClick={() => {
                      const reason = window.prompt('เหตุผลปฏิเสธ (ถ้ามี):') || '';
                      handleTransition(c, 'rejected', { rejectReason: reason });
                    }} data-testid={`insurance-claim-reject-${id}`}
                      className="px-2 py-1 rounded text-xs bg-rose-700 text-white disabled:opacity-50">ปฏิเสธ</button>
                  </>
                )}
                {!isTerminal && (
                  <button onClick={() => handleEdit(c)} aria-label={`แก้ไขเบิกประกัน ${id}`}
                    className="p-1 text-sky-400 hover:bg-sky-900/20 rounded">
                    <Edit2 size={12} />
                  </button>
                )}
                <button onClick={() => handleDelete(c)} aria-label={`ลบเบิกประกัน ${id}`}
                  className="p-1 text-red-400 hover:bg-red-900/20 rounded"><Trash2 size={12} /></button>
              </div>
            );
          })}
        </div>
      </MarketingTabShell>

      {/* Create / edit form modal — lives outside the shell so it renders
          even when items.length === 0 (shell hides `children` in that state). */}
      {formOpen && (
        <SaleInsuranceClaimFormModal
          claim={editing}
          sales={sales}
          bankAccounts={bankAccounts}
          onClose={handleFormClose}
          onSaved={handleFormSaved}
          clinicSettings={clinicSettings}
        />
      )}

      {/* Pay modal — transition to 'paid' with paidAmount */}
      {payOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setPayOpen(null)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={handlePaySubmit}
            className="w-full max-w-md mx-4 rounded-2xl p-5 bg-[var(--bg-surface)] border border-[var(--bd)] space-y-3"
            data-testid="insurance-claim-pay-modal">
            <h3 className="text-lg font-bold text-[var(--tx-heading)]">รับชำระเงินเคลมประกัน</h3>
            <div className="text-xs text-[var(--tx-muted)]">
              ใบเสร็จ: <span className="font-mono">{payOpen.saleId}</span>
              {' · '}ยอดเคลม ฿{Number(payOpen.claimAmount).toLocaleString('th-TH')}
              {Number(payOpen.paidAmount) > 0 && ` · ชำระแล้ว ฿${Number(payOpen.paidAmount).toLocaleString('th-TH')}`}
            </div>
            <div className="space-y-2">
              <label className="block text-xs text-[var(--tx-muted)]">ยอดที่ชำระ *</label>
              <input type="number" required step="0.01" min="0.01" value={payForm.paidAmount ?? ''}
                onChange={(e) => setPayForm({ ...payForm, paidAmount: e.target.value })}
                className="w-full px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
                data-field="paidAmount" autoFocus />
            </div>
            <div className="space-y-2">
              <label className="block text-xs text-[var(--tx-muted)]">ช่องทางชำระเงิน</label>
              <select value={payForm.paymentMethod}
                onChange={(e) => setPayForm({ ...payForm, paymentMethod: e.target.value })}
                className="w-full px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
                <option value="">— เลือกช่องทาง —</option>
                <option value="cash">เงินสด</option>
                <option value="transfer">โอน</option>
                <option value="cheque">เช็ค</option>
                {bankAccounts.map(b => (
                  <option key={b.bankAccountId || b.id} value={`bank:${b.bankAccountId || b.id}`}>
                    {b.bankName} ***{String(b.accountNumber || '').slice(-4)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-xs text-[var(--tx-muted)]">URL หลักฐาน (ถ้ามี)</label>
              <input type="url" value={payForm.claimFileUrl}
                onChange={(e) => setPayForm({ ...payForm, claimFileUrl: e.target.value })}
                placeholder="https://..."
                className="w-full px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
            </div>
            <div className="space-y-2">
              <label className="block text-xs text-[var(--tx-muted)]">หมายเหตุ</label>
              <textarea rows={2} value={payForm.note}
                onChange={(e) => setPayForm({ ...payForm, note: e.target.value })}
                className="w-full px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setPayOpen(null)}
                className="px-3 py-1.5 rounded text-xs bg-neutral-700 text-white">ยกเลิก</button>
              <button type="submit"
                className="px-3 py-1.5 rounded text-xs font-bold bg-emerald-700 text-white"
                data-testid="insurance-claim-pay-submit">
                ยืนยันรับชำระ
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
