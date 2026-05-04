// ─── Vendor Sales Tab — Phase 14.3 (G6) — 2026-04-25 ──────────────────────
// B2B sale variant — sell stock to vendors. Tab combines:
//   - Vendor master CRUD (small modal: name + tax ID + contact + address)
//   - Vendor sale CRUD (list + form-modal: pick vendor + add items + confirm)
//
// ProClinic parity: /admin/sale/vendor/create form-fill page.
// Rule E: Firestore-only — no broker calls.
// Rule H-tris: backend reads only `be_vendors` + `be_vendor_sales` + `be_products`.

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Edit2, Trash2, Globe2, X, CheckCircle2, XCircle, Clock, Users as UsersIcon,
  Briefcase,
} from 'lucide-react';
import DateField from '../DateField.jsx';
import {
  listVendors, saveVendor, deleteVendor,
  listVendorSales, saveVendorSale, deleteVendorSale, transitionVendorSale,
  // Phase 14.10-tris (2026-04-26) — be_products canonical
  listProducts,
} from '../../lib/scopedDataLayer.js';
import {
  emptyVendorForm, generateVendorId, validateVendor,
} from '../../lib/vendorValidation.js';
import {
  emptyVendorSaleForm, generateVendorSaleId, validateVendorSale, STATUS_OPTIONS,
} from '../../lib/vendorSaleValidation.js';
import MarketingTabShell from './MarketingTabShell.jsx';
import MarketingFormShell from './MarketingFormShell.jsx';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';

const STATUS_BADGE = {
  draft:     { label: 'ร่าง',       cls: 'bg-amber-700/20 border-amber-700/40 text-amber-400',     icon: Clock },
  confirmed: { label: 'ยืนยันแล้ว', cls: 'bg-emerald-700/20 border-emerald-700/40 text-emerald-400', icon: CheckCircle2 },
  cancelled: { label: 'ยกเลิก',     cls: 'bg-rose-700/20 border-rose-700/40 text-rose-400',         icon: XCircle },
};

export default function VendorSalesTab({ clinicSettings }) {
  const [tab, setTab] = useState('sales'); // 'sales' | 'vendors'
  const [vendors, setVendors] = useState([]);
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [transitioning, setTransitioning] = useState(null);

  // Sale form modal
  const [saleFormOpen, setSaleFormOpen] = useState(false);
  const [editingSale, setEditingSale] = useState(null);
  // Vendor form modal
  const [vendorFormOpen, setVendorFormOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [vs, ss, ps] = await Promise.all([
        listVendors(),
        listVendorSales(),
        listProducts().catch(() => []),
      ]);
      setVendors(vs);
      setSales(ss);
      setProducts(ps.filter(p => p.type === 'สินค้าหน้าร้าน' || p.type === 'สินค้า'));
    } catch (e) { setError(e.message || 'โหลดข้อมูลล้มเหลว'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const filteredSales = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sales.filter(s => {
      if (filterStatus && s.status !== filterStatus) return false;
      if (q) {
        const hay = [s.vendorName, s.note].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sales, query, filterStatus]);

  const filteredVendors = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vendors.filter(v => {
      if (q) {
        const hay = [v.name, v.taxId, v.phone, v.contactName].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [vendors, query]);

  const handleDeleteVendor = async (v) => {
    if (!window.confirm(`ลบคู่ค้า "${v.name}"?`)) return;
    try { await deleteVendor(v.vendorId || v.id); await reload(); }
    catch (e) { setError(e.message); }
  };

  const handleDeleteSale = async (s) => {
    if (!window.confirm('ลบรายการขายให้คู่ค้านี้?')) return;
    try { await deleteVendorSale(s.vendorSaleId || s.id); await reload(); }
    catch (e) { setError(e.message); }
  };

  const handleTransition = async (s, nextStatus, extra = {}) => {
    const id = s.vendorSaleId || s.id;
    setTransitioning(id); setError('');
    try { await transitionVendorSale(id, nextStatus, extra); await reload(); }
    catch (e) { setError(e.message); }
    finally { setTransitioning(null); }
  };

  const extraFilters = (
    <>
      <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--bg-hover)]" role="tablist">
        <button onClick={() => setTab('sales')} role="tab" aria-selected={tab === 'sales'}
          data-testid="vendor-tab-sales"
          className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${tab === 'sales' ? 'bg-rose-700 text-white' : 'text-[var(--tx-muted)] hover:text-[var(--tx-primary)]'}`}>
          การขาย ({sales.length})
        </button>
        <button onClick={() => setTab('vendors')} role="tab" aria-selected={tab === 'vendors'}
          data-testid="vendor-tab-vendors"
          className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${tab === 'vendors' ? 'bg-rose-700 text-white' : 'text-[var(--tx-muted)] hover:text-[var(--tx-primary)]'}`}>
          คู่ค้า ({vendors.length})
        </button>
      </div>
      {tab === 'sales' && (
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
          data-testid="vendor-sale-status-filter">
          <option value="">สถานะทั้งหมด</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_BADGE[s].label}</option>)}
        </select>
      )}
    </>
  );

  return (
    <>
      <MarketingTabShell
        icon={Briefcase}
        title="ขายให้คู่ค้า (B2B)"
        totalCount={tab === 'sales' ? sales.length : vendors.length}
        filteredCount={tab === 'sales' ? filteredSales.length : filteredVendors.length}
        createLabel={tab === 'sales' ? 'เพิ่มการขาย' : 'เพิ่มคู่ค้า'}
        onCreate={() => {
          if (tab === 'sales') { setEditingSale(null); setSaleFormOpen(true); }
          else { setEditingVendor(null); setVendorFormOpen(true); }
        }}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder={tab === 'sales' ? 'ค้นหารายการขาย / ชื่อคู่ค้า' : 'ค้นหาชื่อคู่ค้า / เลขผู้เสียภาษี'}
        extraFilters={extraFilters}
        error={error}
        loading={loading}
        emptyText={tab === 'sales' ? 'ยังไม่มีการขายให้คู่ค้า' : 'ยังไม่มีคู่ค้า — เพิ่มได้จากปุ่ม "เพิ่มคู่ค้า"'}
        notFoundText="ไม่พบรายการที่ตรงกับตัวกรอง"
        clinicSettings={clinicSettings}
      >
        {tab === 'sales' ? (
          <div className="space-y-1" data-testid="vendor-sales-list">
            {filteredSales.map(s => {
              const id = s.vendorSaleId || s.id;
              const badge = STATUS_BADGE[s.status] || STATUS_BADGE.draft;
              const BadgeIcon = badge.icon;
              const busy = transitioning === id;
              return (
                <div key={id} data-testid={`vendor-sale-row-${id}`}
                  className="flex items-center gap-2 p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] text-sm flex-wrap">
                  <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-bold uppercase ${badge.cls}`}>
                    <BadgeIcon size={10} /> {badge.label}
                  </span>
                  <span className="text-xs text-[var(--tx-muted)]">{s.saleDate || '—'}</span>
                  <span className="font-bold">{s.vendorName || s.vendorId}</span>
                  <span className="text-xs text-[var(--tx-muted)]">· {(s.items || []).length} รายการ</span>
                  <span className="ml-auto font-bold text-emerald-400">฿{Number(s.totalAmount || 0).toLocaleString('th-TH')}</span>
                  {s.status === 'draft' && (
                    <button disabled={busy} onClick={() => handleTransition(s, 'confirmed')}
                      data-testid={`vendor-sale-confirm-${id}`}
                      className="px-2 py-1 rounded text-xs bg-emerald-700 text-white disabled:opacity-50">ยืนยัน</button>
                  )}
                  {(s.status === 'draft' || s.status === 'confirmed') && (
                    <button disabled={busy} onClick={() => {
                      const reason = window.prompt('เหตุผลยกเลิก (ถ้ามี):') || '';
                      handleTransition(s, 'cancelled', { cancelReason: reason });
                    }} data-testid={`vendor-sale-cancel-${id}`}
                      className="px-2 py-1 rounded text-xs bg-neutral-700 text-white disabled:opacity-50">ยกเลิก</button>
                  )}
                  {s.status === 'draft' && (
                    <button onClick={() => { setEditingSale(s); setSaleFormOpen(true); }} aria-label={`แก้ไขขาย ${id}`}
                      className="p-1 text-sky-400 hover:bg-sky-900/20 rounded"><Edit2 size={12} /></button>
                  )}
                  <button onClick={() => handleDeleteSale(s)} aria-label={`ลบ ${id}`}
                    className="p-1 text-red-400 hover:bg-red-900/20 rounded"><Trash2 size={12} /></button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-1" data-testid="vendors-list">
            {filteredVendors.map(v => {
              const id = v.vendorId || v.id;
              return (
                <div key={id} data-testid={`vendor-row-${id}`}
                  className="flex items-center gap-2 p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] text-sm flex-wrap">
                  <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-bold ${v.isActive === false ? 'bg-neutral-700/20 border-neutral-700/40 text-neutral-400' : 'bg-emerald-700/20 border-emerald-700/40 text-emerald-400'}`}>
                    {v.isActive === false ? 'ปิด' : 'ใช้งาน'}
                  </span>
                  <span className="font-bold">{v.name}</span>
                  {v.taxId && <span className="text-xs text-[var(--tx-muted)]">เลขภาษี {v.taxId}</span>}
                  {v.phone && <span className="text-xs text-[var(--tx-muted)]">· {v.phone}</span>}
                  {v.contactName && <span className="text-xs text-[var(--tx-muted)]">ผู้ติดต่อ {v.contactName}</span>}
                  <button onClick={() => { setEditingVendor(v); setVendorFormOpen(true); }} aria-label={`แก้ไข ${v.name}`}
                    className="ml-auto p-1 text-sky-400 hover:bg-sky-900/20 rounded"><Edit2 size={12} /></button>
                  <button onClick={() => handleDeleteVendor(v)} aria-label={`ลบ ${v.name}`}
                    className="p-1 text-red-400 hover:bg-red-900/20 rounded"><Trash2 size={12} /></button>
                </div>
              );
            })}
          </div>
        )}
      </MarketingTabShell>

      {/* Vendor form modal */}
      {vendorFormOpen && (
        <VendorFormModal vendor={editingVendor}
          onClose={() => { setVendorFormOpen(false); setEditingVendor(null); }}
          onSaved={async () => { await reload(); }}
          clinicSettings={clinicSettings} />
      )}

      {/* Sale form modal */}
      {saleFormOpen && (
        <VendorSaleFormModal
          sale={editingSale}
          vendors={vendors}
          products={products}
          onClose={() => { setSaleFormOpen(false); setEditingSale(null); }}
          onSaved={async () => { await reload(); }}
          clinicSettings={clinicSettings}
        />
      )}
    </>
  );
}

function VendorFormModal({ vendor, onClose, onSaved, clinicSettings }) {
  const isEdit = !!vendor;
  const [form, setForm] = useState(() => ({ ...emptyVendorForm(), ...(vendor || {}) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setError('');
    const fail = validateVendor(form, { strict: true });
    if (fail) { setError(fail[1]); return; }
    setSaving(true);
    try {
      const id = isEdit ? (vendor.vendorId || vendor.id) : generateVendorId();
      await saveVendor(id, form, { strict: true });
      onSaved?.(); onClose?.();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <MarketingFormShell isEdit={isEdit}
      titleCreate="เพิ่มคู่ค้า" titleEdit="แก้ไขคู่ค้า"
      onClose={onClose} onSave={handleSave}
      saving={saving} error={error}
      maxWidth="lg" bodySpacing={3} clinicSettings={clinicSettings}>
      <div className="space-y-2">
        <label className="block text-xs text-[var(--tx-muted)]">ชื่อคู่ค้า *</label>
        <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
          data-field="name" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="block text-xs text-[var(--tx-muted)]">เลขผู้เสียภาษี</label>
          <input type="text" value={form.taxId || ''} onChange={(e) => setForm({ ...form, taxId: e.target.value })}
            className="w-full px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
        </div>
        <div className="space-y-2">
          <label className="block text-xs text-[var(--tx-muted)]">โทรศัพท์</label>
          <input type="tel" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
        </div>
      </div>
      <div className="space-y-2">
        <label className="block text-xs text-[var(--tx-muted)]">ที่อยู่</label>
        <textarea rows={2} value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })}
          className="w-full px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="block text-xs text-[var(--tx-muted)]">ผู้ติดต่อ</label>
          <input type="text" value={form.contactName || ''} onChange={(e) => setForm({ ...form, contactName: e.target.value })}
            className="w-full px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
        </div>
        <div className="space-y-2">
          <label className="block text-xs text-[var(--tx-muted)]">อีเมล</label>
          <input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
        </div>
      </div>
      <div className="space-y-2">
        <label className="block text-xs text-[var(--tx-muted)]">หมายเหตุ</label>
        <textarea rows={2} value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })}
          className="w-full px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
      </div>
      <label className="text-xs flex items-center gap-2">
        <input type="checkbox" checked={form.isActive !== false}
          onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
        เปิดใช้งาน
      </label>
    </MarketingFormShell>
  );
}

function VendorSaleFormModal({ sale, vendors, products, onClose, onSaved, clinicSettings }) {
  const isEdit = !!sale;
  // Phase 14.7.H follow-up D — branch-aware vendor-sale writes.
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [form, setForm] = useState(() => ({ ...emptyVendorSaleForm(), ...(sale || {}) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleVendorChange = (vendorId) => {
    const v = vendors.find(x => (x.vendorId || x.id) === vendorId);
    setForm(f => ({ ...f, vendorId, vendorName: v?.name || '' }));
  };

  const addItem = () => {
    setForm(f => ({ ...f, items: [...(f.items || []), { productId: '', name: '', qty: 1, unitPrice: 0 }] }));
  };

  const updateItem = (idx, patch) => {
    setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }));
  };

  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const subTotal = useMemo(
    () => (form.items || []).reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0), 0),
    [form.items]
  );
  const total = Math.max(0, subTotal - (Number(form.discount) || 0));

  const handleSave = async () => {
    setError('');
    const formWithTotal = { ...form, totalAmount: total, branchId: selectedBranchId };
    const fail = validateVendorSale(formWithTotal, { strict: true });
    if (fail) { setError(fail[1]); return; }
    setSaving(true);
    try {
      const id = isEdit ? (sale.vendorSaleId || sale.id) : generateVendorSaleId();
      await saveVendorSale(id, formWithTotal, { strict: true });
      onSaved?.(); onClose?.();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <MarketingFormShell isEdit={isEdit}
      titleCreate="เพิ่มการขายให้คู่ค้า" titleEdit="แก้ไขการขาย"
      onClose={onClose} onSave={handleSave}
      saving={saving} error={error}
      maxWidth="3xl" bodySpacing={4} clinicSettings={clinicSettings}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="block text-xs text-[var(--tx-muted)]">คู่ค้า *</label>
          <select required value={form.vendorId} onChange={(e) => handleVendorChange(e.target.value)}
            className="w-full px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
            data-field="vendorId">
            <option value="">— เลือกคู่ค้า —</option>
            {vendors.filter(v => v.isActive !== false).map(v => (
              <option key={v.vendorId || v.id} value={v.vendorId || v.id}>{v.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="block text-xs text-[var(--tx-muted)]">วันที่ขาย *</label>
          <DateField value={form.saleDate} onChange={(v) => setForm({ ...form, saleDate: v })}
            fieldClassName="w-full px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-[var(--tx-muted)]">รายการสินค้า *</label>
          <button type="button" onClick={addItem}
            className="text-xs flex items-center gap-1 px-2 py-1 rounded bg-[var(--bg-hover)] hover:bg-[var(--bg-card)]">
            <Plus size={12} /> เพิ่มสินค้า
          </button>
        </div>
        <div className="space-y-1">
          {(form.items || []).map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <select value={it.productId}
                onChange={(e) => {
                  const p = products.find(x => x.id === e.target.value);
                  updateItem(i, { productId: e.target.value, name: p?.name || '', unitPrice: Number(p?.price) || it.unitPrice });
                }}
                className="col-span-5 px-2 py-1 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
                <option value="">— เลือกสินค้า —</option>
                {products.slice(0, 500).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input type="number" step="0.01" min="0.01" placeholder="จำนวน" value={it.qty}
                onChange={(e) => updateItem(i, { qty: e.target.value })}
                className="col-span-2 px-2 py-1 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
              <input type="number" step="0.01" min="0" placeholder="ราคา/หน่วย" value={it.unitPrice}
                onChange={(e) => updateItem(i, { unitPrice: e.target.value })}
                className="col-span-2 px-2 py-1 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
              <span className="col-span-2 text-xs text-right tabular-nums">
                ฿{((Number(it.qty) || 0) * (Number(it.unitPrice) || 0)).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <button type="button" onClick={() => removeItem(i)}
                className="col-span-1 text-red-400 hover:bg-red-900/20 rounded p-1">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--bd)]">
        <div className="space-y-1">
          <div className="flex justify-between text-xs"><span>มูลค่ารวม</span><span className="font-mono tabular-nums">฿{subTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
          <div className="flex justify-between text-xs items-center">
            <span>ส่วนลดท้ายบิล</span>
            <input type="number" step="0.01" min="0" value={form.discount || 0}
              onChange={(e) => setForm({ ...form, discount: e.target.value })}
              className="w-24 px-2 py-1 rounded text-xs text-right bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
          </div>
          <div className="border-t border-[var(--bd)] pt-1 mt-1 flex justify-between text-sm font-bold"><span>รวมทั้งสิ้น</span><span className="font-mono tabular-nums text-emerald-400">฿{total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
        </div>
        <div className="space-y-2">
          <label className="block text-xs text-[var(--tx-muted)]">หมายเหตุการขาย</label>
          <textarea rows={3} value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })}
            className="w-full px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
        </div>
      </div>
    </MarketingFormShell>
  );
}
