// ─── Online Sales Tab — Phase 12.6 pre-sale + status machine ───────────────
// State flow: pending → paid → completed / cancelled. Completion requires a
// linkedSaleId (wired up in Phase 12.9 when saleTab converts online-sale to
// a full be_sales record).

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, Globe2, Loader2, Plus, CheckCircle2, XCircle, Clock } from 'lucide-react';
import DateField from '../DateField.jsx';
import {
  listOnlineSales, saveOnlineSale, deleteOnlineSale, transitionOnlineSale,
  listBankAccounts, getAllCustomers,
} from '../../lib/scopedDataLayer.js';
import {
  STATUS_OPTIONS, emptyOnlineSaleForm, generateOnlineSaleId,
} from '../../lib/onlineSaleValidation.js';
import MarketingTabShell from './MarketingTabShell.jsx';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';

const STATUS_BADGE = {
  pending:   { label: 'รอชำระ',   cls: 'bg-amber-700/20 border-amber-700/40 text-amber-400',   icon: Clock },
  paid:      { label: 'ชำระแล้ว', cls: 'bg-sky-700/20 border-sky-700/40 text-sky-400',         icon: CheckCircle2 },
  completed: { label: 'เสร็จสิ้น', cls: 'bg-emerald-700/20 border-emerald-700/40 text-emerald-400', icon: CheckCircle2 },
  cancelled: { label: 'ยกเลิก',    cls: 'bg-neutral-700/20 border-neutral-700/40 text-neutral-400', icon: XCircle },
};

export default function OnlineSalesTab({ clinicSettings, theme }) {
  // Phase 14.7.H follow-up D — branch-aware online-sale writes.
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [form, setForm] = useState(emptyOnlineSaleForm());
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [transitioning, setTransitioning] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [os, bs, cs] = await Promise.all([listOnlineSales(), listBankAccounts(), getAllCustomers()]);
      setItems(os);
      setBankAccounts(bs);
      setCustomers(cs);
    } catch (e) { setError(e.message); setItems([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(o => {
      if (filterStatus && o.status !== filterStatus) return false;
      if (q) {
        const hay = [o.customerName, o.customerHN, o.bankAccountLabel, o.source].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, filterStatus, query]);

  const handleCreate = () => { setForm(emptyOnlineSaleForm()); setEditingId(null); };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    try {
      const id = editingId || generateOnlineSaleId();
      const cust = customers.find(c => (c.proClinicId || c.id) === form.customerId);
      const bank = bankAccounts.find(b => (b.bankAccountId || b.id) === form.bankAccountId);
      await saveOnlineSale(id, {
        ...form,
        branchId: selectedBranchId,
        customerName: cust ? `${cust.patientData?.firstName || ''} ${cust.patientData?.lastName || ''}`.trim() : form.customerName,
        customerHN: cust?.proClinicHN || cust?.hn || form.customerHN,
        bankAccountLabel: bank ? `${bank.bankName} ${bank.accountNumber.slice(-4) || ''}` : form.bankAccountLabel,
      }, { strict: true });
      setForm(emptyOnlineSaleForm());
      setEditingId(null);
      await reload();
    } catch (e2) { setError(e2.message); }
  };

  const handleDelete = async (o) => {
    const id = o.onlineSaleId || o.id;
    if (!window.confirm('ลบรายการนี้?')) return;
    try { await deleteOnlineSale(id); await reload(); }
    catch (e) { setError(e.message); }
  };

  const handleTransition = async (o, nextStatus, extra = {}) => {
    const id = o.onlineSaleId || o.id;
    setTransitioning(id); setError('');
    try { await transitionOnlineSale(id, nextStatus, extra); await reload(); }
    catch (e) { setError(e.message); }
    finally { setTransitioning(null); }
  };

  const extraFilters = (
    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
      className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
      <option value="">สถานะทั้งหมด</option>
      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_BADGE[s].label}</option>)}
    </select>
  );

  return (
    <MarketingTabShell
      icon={Globe2}
      title="ขายออนไลน์"
      totalCount={items.length}
      filteredCount={filtered.length}
      createLabel={editingId ? 'ยกเลิกแก้ไข' : 'เคลียร์ฟอร์ม'}
      onCreate={handleCreate}
      searchValue={query}
      onSearchChange={setQuery}
      searchPlaceholder="ค้นหาชื่อลูกค้า / HN / บัญชี"
      extraFilters={extraFilters}
      error={error}
      loading={loading}
      emptyText='ยังไม่มีรายการขายออนไลน์'
      notFoundText="ไม่พบรายการที่ตรงกับตัวกรอง"
      clinicSettings={clinicSettings}
    >
      {/* Inline add / edit form */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-6 gap-2 p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] mb-3" data-testid="online-sale-form">
        <select required value={form.customerId}
          onChange={(e) => setForm({ ...form, customerId: e.target.value })}
          className="md:col-span-2 px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
          <option value="">— ลูกค้า *</option>
          {customers.slice(0, 500).map(c => {
            const cid = c.proClinicId || c.id;
            const name = `${c.patientData?.firstName || ''} ${c.patientData?.lastName || ''}`.trim();
            return <option key={cid} value={cid}>{name || cid} {c.proClinicHN ? `(${c.proClinicHN})` : ''}</option>;
          })}
        </select>
        <select required value={form.bankAccountId}
          onChange={(e) => setForm({ ...form, bankAccountId: e.target.value })}
          className="px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
          <option value="">— บัญชี *</option>
          {bankAccounts.map(b => <option key={b.bankAccountId || b.id} value={b.bankAccountId || b.id}>{b.bankName} ***{String(b.accountNumber || '').slice(-4)}</option>)}
        </select>
        <input type="number" required step="0.01" min="0.01" placeholder="ยอด *" value={form.amount ?? ''}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          className="px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
        <DateField value={form.transferDate} placeholder="วันที่โอน"
          onChange={(v) => setForm({ ...form, transferDate: v })}
          fieldClassName="px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
        <button type="submit" className="px-3 py-1.5 rounded text-xs font-bold bg-[var(--accent)] text-white">
          {editingId ? 'บันทึก' : <><Plus size={12} className="inline" /> เพิ่ม</>}
        </button>
      </form>

      <div className="space-y-1" data-testid="online-sales-list">
        {filtered.map(o => {
          const id = o.onlineSaleId || o.id;
          const badge = STATUS_BADGE[o.status] || STATUS_BADGE.pending;
          const busy = transitioning === id;
          const BadgeIcon = badge.icon;
          return (
            <div key={id} data-testid={`online-sale-row-${id}`}
              className="flex items-center gap-2 p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] text-sm flex-wrap">
              <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-bold uppercase tracking-wider ${badge.cls}`}>
                <BadgeIcon size={10} /> {badge.label}
              </span>
              <span className="text-xs text-[var(--tx-muted)]">{o.transferDate || '—'}</span>
              <span className="font-bold">{o.customerName || o.customerId}</span>
              {o.customerHN && <span className="text-xs text-[var(--tx-muted)]">{o.customerHN}</span>}
              <span className="text-xs text-[var(--tx-muted)]">· {o.bankAccountLabel || o.bankAccountId}</span>
              <span className="ml-auto font-bold text-emerald-400">{Number(o.amount).toLocaleString('th-TH')}</span>
              {o.status === 'pending' && (
                <button disabled={busy} onClick={() => handleTransition(o, 'paid')} data-testid={`online-sale-mark-paid-${id}`}
                  className="px-2 py-1 rounded text-xs bg-sky-700 text-white disabled:opacity-50">ชำระแล้ว</button>
              )}
              {o.status === 'paid' && (
                <button disabled={busy} onClick={() => {
                  const saleId = window.prompt('เลขที่ใบเสร็จที่เชื่อมโยง (linkedSaleId):');
                  if (!saleId) return;
                  handleTransition(o, 'completed', { linkedSaleId: saleId });
                }} data-testid={`online-sale-complete-${id}`}
                  className="px-2 py-1 rounded text-xs bg-emerald-700 text-white disabled:opacity-50">เสร็จสิ้น</button>
              )}
              {(o.status === 'pending' || o.status === 'paid') && (
                <button disabled={busy} onClick={() => {
                  const reason = window.prompt('เหตุผลยกเลิก (ถ้ามี):') || '';
                  handleTransition(o, 'cancelled', { cancelReason: reason });
                }} data-testid={`online-sale-cancel-${id}`}
                  className="px-2 py-1 rounded text-xs bg-neutral-700 text-white disabled:opacity-50">ยกเลิก</button>
              )}
              <button onClick={() => { setForm({ ...emptyOnlineSaleForm(), ...o }); setEditingId(id); }} aria-label={`แก้ไข online-sale ${id}`}
                className="p-1 text-sky-400 hover:bg-sky-900/20 rounded"><Edit2 size={12} /></button>
              <button onClick={() => handleDelete(o)} aria-label={`ลบ online-sale ${id}`}
                className="p-1 text-red-400 hover:bg-red-900/20 rounded"><Trash2 size={12} /></button>
            </div>
          );
        })}
      </div>
    </MarketingTabShell>
  );
}
