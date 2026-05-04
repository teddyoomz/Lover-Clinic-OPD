// ─── Finance Master Tab — Phase 12.5 CRUD ──────────────────────────────────
// Combined tab owning 3 small reference collections:
//   - be_bank_accounts      (payment method targets on sales/deposits/online_sales)
//   - be_expense_categories (classification for expenses)
//   - be_expenses           (actual expense log entries)
//
// Firestore-only. One MarketingTabShell + 3 inline sections separated by
// headers. Sections have their own inline "add" forms (no separate modal)
// since each entity has ≤8 fields.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, Banknote, FolderOpen, TrendingDown, Loader2, Plus, Star } from 'lucide-react';
import DateField from '../DateField.jsx';
import {
  listBankAccounts, saveBankAccount, deleteBankAccount,
  listExpenseCategories, saveExpenseCategory, deleteExpenseCategory,
  listExpenses, saveExpense, deleteExpense,
} from '../../lib/backendClient.js';
import {
  emptyBankAccountForm, generateBankAccountId,
  ACCOUNT_TYPE_OPTIONS,
} from '../../lib/bankAccountValidation.js';
import {
  emptyExpenseCategoryForm, generateExpenseCategoryId,
} from '../../lib/expenseCategoryValidation.js';
import {
  emptyExpenseForm, generateExpenseId,
} from '../../lib/expenseValidation.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
export default function FinanceMasterTab({ clinicSettings, theme }) {
  const [tab, setTab] = useState('bank');
  return (
    <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--bd)] p-5 space-y-4" data-testid="finance-master-tab">
      <div className="flex items-center gap-3 pb-2 border-b border-[var(--bd)]">
        <div className="w-10 h-10 rounded-xl bg-[var(--bg-hover)] border border-[var(--bd)] flex items-center justify-center">
          <Banknote size={18} className="text-[var(--tx-muted)]" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-[var(--tx-heading)] leading-tight" style={{ letterSpacing: '-0.015em' }}>ตั้งค่าการเงิน</h2>
          <p className="text-xs text-[var(--tx-muted)] mt-0.5">บัญชีธนาคาร · หมวดค่าใช้จ่าย · ค่าใช้จ่าย</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {[
          { id: 'bank', label: 'บัญชีธนาคาร', icon: Banknote },
          { id: 'category', label: 'หมวดค่าใช้จ่าย', icon: FolderOpen },
          { id: 'expense', label: 'ค่าใช้จ่าย', icon: TrendingDown },
        ].map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} type="button"
              data-testid={`finance-subtab-${t.id}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-all ${active ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'bg-[var(--bg-hover)] text-[var(--tx-muted)] border-[var(--bd)] hover:text-[var(--accent)]'}`}>
              <t.icon size={12} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'bank' ? <BankAccountsSection /> :
       tab === 'category' ? <ExpenseCategoriesSection /> :
       <ExpensesSection />}
    </div>
  );
}

/* ─── Bank Accounts section ─────────────────────────────────────────────── */

function BankAccountsSection() {
  // Phase BS V2 — branch-scoped reads + writes.
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyBankAccountForm());
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try { setItems(await listBankAccounts({ branchId: selectedBranchId })); }
    catch (e) { setError(e.message); setItems([]); }
    finally { setLoading(false); }
  }, [selectedBranchId]);
  useEffect(() => { reload(); }, [reload]);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    try {
      const id = editingId || generateBankAccountId();
      // Phase BS V2 — stamp branchId on save (preserves on edit).
      await saveBankAccount(id, { ...form, branchId: form.branchId || selectedBranchId });
      setForm(emptyBankAccountForm());
      setEditingId(null);
      await reload();
    } catch (e2) { setError(e2.message); }
  };

  const handleEdit = (b) => { setForm({ ...emptyBankAccountForm(), ...b }); setEditingId(b.bankAccountId || b.id); };
  const handleCancel = () => { setForm(emptyBankAccountForm()); setEditingId(null); };

  const handleDelete = async (b) => {
    if (!window.confirm(`ลบบัญชี "${b.bankName} ${b.accountNumber}" ?`)) return;
    try { await deleteBankAccount(b.bankAccountId || b.id); await reload(); }
    catch (e) { setError(e.message); }
  };

  return (
    <div className="space-y-3" data-testid="bank-accounts-section">
      {error && <div className="text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded p-2">{error}</div>}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-6 gap-2 p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)]">
        <input type="text" required placeholder="ธนาคาร *" value={form.bankName}
          onChange={(e) => setForm({ ...form, bankName: e.target.value })}
          className="px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
        <input type="text" required placeholder="เลขบัญชี *" value={form.accountNumber}
          onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
          className="px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
        <input type="text" placeholder="ชื่อบัญชี" value={form.accountName}
          onChange={(e) => setForm({ ...form, accountName: e.target.value })}
          className="px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
        <select value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value })}
          className="px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
          {ACCOUNT_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs text-[var(--tx-primary)]">
          <input type="checkbox" checked={!!form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
            className="w-4 h-4 accent-amber-500" /> หลัก
        </label>
        <div className="flex gap-1">
          <button type="submit" className="flex-1 px-3 py-1.5 rounded text-xs font-bold bg-[var(--accent)] text-white">
            {editingId ? 'บันทึก' : <><Plus size={12} className="inline" /> เพิ่ม</>}
          </button>
          {editingId && <button type="button" onClick={handleCancel} className="px-2 text-xs text-[var(--tx-muted)]">ยกเลิก</button>}
        </div>
      </form>

      {loading ? <div className="text-center py-6"><Loader2 size={16} className="inline animate-spin" /></div> :
       items.length === 0 ? <div className="text-center py-6 text-sm text-[var(--tx-muted)]">ยังไม่มีบัญชีธนาคาร</div> :
       <div className="space-y-1">
         {items.map(b => {
           const id = b.bankAccountId || b.id;
           return (
             <div key={id} data-testid={`bank-account-row-${id}`}
               className="flex items-center gap-2 p-2 rounded bg-[var(--bg-hover)] border border-[var(--bd)] text-sm">
               {b.isDefault && <Star size={12} className="text-amber-400" />}
               <span className="font-bold">{b.bankName}</span>
               <span className="text-[var(--tx-muted)]">{b.accountNumber}</span>
               {b.accountName && <span className="text-xs text-[var(--tx-muted)]">({b.accountName})</span>}
               <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--bg-base)] text-[var(--tx-muted)]">{b.accountType}</span>
               <button onClick={() => handleEdit(b)} className="p-1 text-sky-400 hover:bg-sky-900/20 rounded"><Edit2 size={12} /></button>
               <button onClick={() => handleDelete(b)} aria-label={`ลบบัญชี ${b.bankName}`} className="p-1 text-red-400 hover:bg-red-900/20 rounded"><Trash2 size={12} /></button>
             </div>
           );
         })}
       </div>}
    </div>
  );
}

/* ─── Expense Categories section ────────────────────────────────────────── */

function ExpenseCategoriesSection() {
  // Phase BS V2 — branch-scoped reads + writes.
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyExpenseCategoryForm());
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try { setItems(await listExpenseCategories({ branchId: selectedBranchId })); }
    catch (e) { setError(e.message); setItems([]); }
    finally { setLoading(false); }
  }, [selectedBranchId]);
  useEffect(() => { reload(); }, [reload]);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    try {
      const id = editingId || generateExpenseCategoryId();
      // Phase BS V2 — stamp branchId on save (preserves on edit).
      await saveExpenseCategory(id, { ...form, branchId: form.branchId || selectedBranchId });
      setForm(emptyExpenseCategoryForm());
      setEditingId(null);
      await reload();
    } catch (e2) { setError(e2.message); }
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`ลบหมวด "${c.name}" ?`)) return;
    try { await deleteExpenseCategory(c.categoryId || c.id); await reload(); }
    catch (e) { setError(e.message); }
  };

  return (
    <div className="space-y-3" data-testid="expense-categories-section">
      {error && <div className="text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded p-2">{error}</div>}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-2 p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)]">
        <input type="text" required placeholder="ชื่อหมวด *" value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="md:col-span-2 px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
        <input type="text" placeholder="note" value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          className="md:col-span-2 px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
        <button type="submit" className="px-3 py-1.5 rounded text-xs font-bold bg-[var(--accent)] text-white">
          {editingId ? 'บันทึก' : <><Plus size={12} className="inline" /> เพิ่ม</>}
        </button>
      </form>

      {loading ? <div className="text-center py-6"><Loader2 size={16} className="inline animate-spin" /></div> :
       items.length === 0 ? <div className="text-center py-6 text-sm text-[var(--tx-muted)]">ยังไม่มีหมวดค่าใช้จ่าย</div> :
       <div className="space-y-1">
         {items.map(c => {
           const id = c.categoryId || c.id;
           return (
             <div key={id} data-testid={`expense-category-row-${id}`}
               className="flex items-center gap-2 p-2 rounded bg-[var(--bg-hover)] border border-[var(--bd)] text-sm">
               <span className="font-bold">{c.name}</span>
               {c.note && <span className="text-xs text-[var(--tx-muted)]">· {c.note}</span>}
               <button onClick={() => { setForm({ ...emptyExpenseCategoryForm(), ...c }); setEditingId(id); }} className="ml-auto p-1 text-sky-400 hover:bg-sky-900/20 rounded"><Edit2 size={12} /></button>
               <button onClick={() => handleDelete(c)} aria-label={`ลบหมวด ${c.name}`} className="p-1 text-red-400 hover:bg-red-900/20 rounded"><Trash2 size={12} /></button>
             </div>
           );
         })}
       </div>}
    </div>
  );
}

/* ─── Expenses section ──────────────────────────────────────────────────── */

function ExpensesSection() {
  // Phase 14.7.H follow-up D — branch-aware expense writes.
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(emptyExpenseForm());
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      // Phase BS — branch-scoped expenses (already supported pre-Phase-BS;
      // explicit pass to fold into the {branchId, allBranches} contract).
      const [list, cats] = await Promise.all([
        listExpenses({ branchId: selectedBranchId }),
        listExpenseCategories(),
      ]);
      setItems(list);
      setCategories(cats);
    } catch (e) { setError(e.message); setItems([]); }
    finally { setLoading(false); }
  }, [selectedBranchId]);
  useEffect(() => { reload(); }, [reload]);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    try {
      const id = editingId || generateExpenseId();
      const cat = categories.find(c => (c.categoryId || c.id) === form.categoryId);
      await saveExpense(id, { ...form, categoryName: cat?.name || '', branchId: selectedBranchId }, { strict: true });
      setForm(emptyExpenseForm());
      setEditingId(null);
      await reload();
    } catch (e2) { setError(e2.message); }
  };

  const handleDelete = async (ex) => {
    if (!window.confirm(`ลบค่าใช้จ่าย "${ex.expenseName}" ?`)) return;
    try { await deleteExpense(ex.expenseId || ex.id); await reload(); }
    catch (e) { setError(e.message); }
  };

  const total = useMemo(() => items.reduce((acc, e) => acc + (Number(e.amount) || 0), 0), [items]);

  return (
    <div className="space-y-3" data-testid="expenses-section">
      {error && <div className="text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded p-2">{error}</div>}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-6 gap-2 p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)]">
        <DateField value={form.date}
          onChange={(v) => setForm({ ...form, date: v })}
          fieldClassName="px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
        <input type="text" required placeholder="รายการ *" value={form.expenseName}
          onChange={(e) => setForm({ ...form, expenseName: e.target.value })}
          className="md:col-span-2 px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
        <select required value={form.categoryId}
          onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
          className="px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
          <option value="">— หมวด *</option>
          {categories.map(c => <option key={c.categoryId || c.id} value={c.categoryId || c.id}>{c.name}</option>)}
        </select>
        <input type="number" required step="0.01" min="0.01" placeholder="ยอด *" value={form.amount ?? ''}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          className="px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
        <button type="submit" className="px-3 py-1.5 rounded text-xs font-bold bg-[var(--accent)] text-white">
          {editingId ? 'บันทึก' : <><Plus size={12} className="inline" /> เพิ่ม</>}
        </button>
      </form>

      {loading ? <div className="text-center py-6"><Loader2 size={16} className="inline animate-spin" /></div> :
       items.length === 0 ? <div className="text-center py-6 text-sm text-[var(--tx-muted)]">ยังไม่มีค่าใช้จ่าย</div> :
       <>
         <div className="text-xs text-[var(--tx-muted)] mb-1">รวม {items.length} รายการ · ยอดรวม {total.toLocaleString('th-TH')} บาท</div>
         <div className="space-y-1">
           {items.map(ex => {
             const id = ex.expenseId || ex.id;
             return (
               <div key={id} data-testid={`expense-row-${id}`}
                 className="flex items-center gap-2 p-2 rounded bg-[var(--bg-hover)] border border-[var(--bd)] text-sm">
                 <span className="text-[var(--tx-muted)] text-xs">{ex.date}</span>
                 <span className="font-bold">{ex.expenseName}</span>
                 {ex.categoryName && <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--bg-base)] text-[var(--tx-muted)]">{ex.categoryName}</span>}
                 <span className="ml-auto font-bold text-rose-400">{Number(ex.amount).toLocaleString('th-TH')}</span>
                 <button onClick={() => { setForm({ ...emptyExpenseForm(), ...ex }); setEditingId(id); }} className="p-1 text-sky-400 hover:bg-sky-900/20 rounded"><Edit2 size={12} /></button>
                 <button onClick={() => handleDelete(ex)} aria-label={`ลบค่าใช้จ่าย ${ex.expenseName}`} className="p-1 text-red-400 hover:bg-red-900/20 rounded"><Trash2 size={12} /></button>
               </div>
             );
           })}
         </div>
       </>}
    </div>
  );
}
