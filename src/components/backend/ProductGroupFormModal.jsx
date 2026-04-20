// ─── Product Group Form Modal — Phase 11.2 + 11.9 rewrite ─────────────────
// Create/edit modal for `be_product_groups`. Matches ProClinic modal
// "เพิ่มกลุ่มสินค้า" (Triangle re-scanned 2026-04-20 via API endpoint
// `GET /admin/api/product-group` which revealed pivot.qty per group-product):
//   - group_name (text, required)
//   - product_type (radio, 2 options: ยากลับบ้าน | สินค้าสิ้นเปลือง)
//   - products[] (multi-picker with per-product qty) ← pivot.qty from API
//
// Product picker: transfer-list pattern (available ←→ selected). Products
// filtered by group type:
//   - ยากลับบ้าน   → be_products.productType === 'ยา'
//   - สินค้าสิ้นเปลือง → be_products.productType === 'สินค้าสิ้นเปลือง'
// Type is locked after create (ProClinic edit-form disables this radio).
//
// Iron-clad:
//   E backend=Firestore ONLY
//   C1 reuses MarketingFormShell chrome (Rule of 3 — 4th user)
//   C2 crypto-random id via generateMarketingId
//   F Triangle verified 2026-04-20 (Phase 11.9 correction of 11.2 drift)

import { useState, useEffect, useCallback, useMemo } from 'react';
import MarketingFormShell from './MarketingFormShell.jsx';
import { saveProductGroup, listProducts } from '../../lib/backendClient.js';
import {
  PRODUCT_TYPES,
  NAME_MAX_LENGTH,
  validateProductGroup,
  emptyProductGroupForm,
  normalizeProductType,
  migrateProductIdsToProducts,
} from '../../lib/productGroupValidation.js';
import { generateMarketingId, scrollToField } from '../../lib/marketingUiUtils.js';

function productMatchesGroupType(product, groupType) {
  const pt = String(product.productType || '').trim();
  if (groupType === 'ยากลับบ้าน') return pt === 'ยา' || pt === 'ยากลับบ้าน';
  if (groupType === 'สินค้าสิ้นเปลือง') return pt === 'สินค้าสิ้นเปลือง';
  return false;
}

export default function ProductGroupFormModal({ productGroup, onClose, onSaved, clinicSettings }) {
  const isEdit = !!productGroup;
  const [form, setForm] = useState(() => {
    if (!productGroup) return emptyProductGroupForm();
    // Merge existing group + normalize type (legacy 4-opt → 2-opt) + migrate
    // legacy productIds[] → products[{productId,qty:1}]
    const base = { ...emptyProductGroupForm(), ...productGroup };
    const typeNormalized = { ...base, productType: normalizeProductType(base.productType) };
    return migrateProductIdsToProducts(typeNormalized);
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    (async () => {
      setProductsLoading(true);
      try {
        const all = await listProducts();
        setProducts(Array.isArray(all) ? all : []);
      } catch (e) {
        setError(e.message || 'โหลดสินค้าไม่สำเร็จ');
      } finally {
        setProductsLoading(false);
      }
    })();
  }, []);

  const update = useCallback((patch) => setForm(prev => ({ ...prev, ...patch })), []);

  const selectedIds = useMemo(() => {
    const arr = Array.isArray(form.products) ? form.products : [];
    return new Set(arr.map(p => String(p.productId)));
  }, [form.products]);

  const addProduct = useCallback((productId) => {
    const pid = String(productId);
    setForm(prev => {
      const current = Array.isArray(prev.products) ? prev.products : [];
      if (current.some(p => String(p.productId) === pid)) return prev;
      return { ...prev, products: [...current, { productId: pid, qty: 1 }] };
    });
  }, []);

  const removeProduct = useCallback((productId) => {
    const pid = String(productId);
    setForm(prev => ({
      ...prev,
      products: (prev.products || []).filter(p => String(p.productId) !== pid),
    }));
  }, []);

  const updateQty = useCallback((productId, qty) => {
    const pid = String(productId);
    const q = Math.max(0.01, Number(qty) || 1);
    setForm(prev => ({
      ...prev,
      products: (prev.products || []).map(p =>
        String(p.productId) === pid ? { ...p, qty: q } : p
      ),
    }));
  }, []);

  const availableFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter(p => productMatchesGroupType(p, form.productType))
      .filter(p => !selectedIds.has(String(p.productId || p.id)))
      .filter(p => {
        if (!q) return true;
        const name = String(p.productName || p.name || '').toLowerCase();
        const code = String(p.productCode || p.code || '').toLowerCase();
        return name.includes(q) || code.includes(q);
      });
  }, [products, form.productType, selectedIds, query]);

  // Resolve selected products' full data for display (name + unit + qty)
  const selectedRows = useMemo(() => {
    const byId = new Map(products.map(p => [String(p.productId || p.id), p]));
    return (form.products || []).map(entry => {
      const pid = String(entry.productId);
      const p = byId.get(pid);
      return {
        productId: pid,
        qty: Number(entry.qty) || 1,
        productName: p?.productName || p?.name || `(สินค้า ${pid})`,
        unit: p?.mainUnitName || '',
      };
    });
  }, [form.products, products]);

  const handleSave = async () => {
    setError('');
    const fail = validateProductGroup(form);
    if (fail) {
      const [field, msg] = fail;
      setError(msg);
      scrollToField(field);
      return;
    }
    setSaving(true);
    try {
      const id = productGroup?.groupId || productGroup?.id || generateMarketingId('GRP');
      await saveProductGroup(id, {
        ...form,
        name: String(form.name).trim(),
        note: String(form.note || '').trim(),
        products: (form.products || []).map(p => ({
          productId: String(p.productId),
          qty: Number(p.qty) || 1,
        })),
      });
      await onSaved?.();
    } catch (e) {
      setError(e.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const typeLabel = form.productType === 'ยากลับบ้าน' ? 'ยากลับบ้าน' : 'สินค้าสิ้นเปลือง';

  return (
    <MarketingFormShell
      isEdit={isEdit}
      titleCreate="เพิ่มกลุ่มสินค้า"
      titleEdit="แก้ไขกลุ่มสินค้า"
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      error={error}
      maxWidth="5xl"
      bodySpacing={4}
      clinicSettings={clinicSettings}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── Column 1: ข้อมูลกลุ่มสินค้า ── */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[var(--accent)] border-b border-[var(--bd)] pb-1">ข้อมูลกลุ่มสินค้า</h3>

          <div data-field="name">
            <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">
              ชื่อกลุ่มสินค้า <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update({ name: e.target.value })}
              maxLength={NAME_MAX_LENGTH + 10}
              placeholder="กรอกชื่อกลุ่มสินค้า"
              className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
            />
            <p className="text-[10px] text-[var(--tx-muted)] mt-1">{form.name.length} / {NAME_MAX_LENGTH} ตัวอักษร</p>
          </div>

          <div data-field="productType">
            <label className="block text-xs font-bold text-[var(--tx-muted)] mb-2 uppercase tracking-wider">ประเภทกลุ่มสินค้า</label>
            <div className="space-y-2">
              {PRODUCT_TYPES.map(t => (
                <label key={t} className={`flex items-center gap-2 text-sm cursor-pointer ${isEdit ? 'opacity-60 cursor-not-allowed' : ''}`}>
                  <input
                    type="radio"
                    name="productType"
                    value={t}
                    checked={form.productType === t}
                    onChange={() => update({ productType: t, products: [] })}
                    disabled={isEdit}
                    className="w-4 h-4 accent-[var(--accent)]"
                  />
                  <span className="text-[var(--tx-primary)]">{t}</span>
                </label>
              ))}
            </div>
            {isEdit && (
              <p className="text-[10px] text-[var(--tx-muted)] mt-1">เปลี่ยนประเภทหลังสร้างไม่ได้</p>
            )}
          </div>
        </div>

        {/* ── Column 2: Product picker ── */}
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-[var(--accent)] border-b border-[var(--bd)] pb-1">{typeLabel}</h3>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาสินค้า"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
          <div className="h-80 overflow-y-auto border border-[var(--bd)] rounded-lg bg-[var(--bg-card)]">
            {productsLoading ? (
              <p className="text-xs text-[var(--tx-muted)] text-center py-6">กำลังโหลดสินค้า...</p>
            ) : availableFiltered.length === 0 ? (
              <p className="text-xs text-[var(--tx-muted)] text-center py-6">
                {products.length === 0 ? 'ไม่พบสินค้า — เพิ่มสินค้าในแท็บ "สินค้า" ก่อน'
                  : query ? 'ไม่พบสินค้าที่ค้นหา'
                  : 'ไม่มีสินค้าประเภทนี้ให้เลือก'}
              </p>
            ) : (
              availableFiltered.map(p => {
                const pid = String(p.productId || p.id);
                return (
                  <label key={pid} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer border-b border-[var(--bd)] hover:bg-[var(--bg-hover)]">
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => addProduct(pid)}
                      className="w-4 h-4 accent-[var(--accent)] shrink-0"
                    />
                    <span className="truncate text-[var(--tx-primary)]">{p.productName || p.name || pid}</span>
                    {p.mainUnitName && <span className="text-[11px] text-[var(--tx-muted)] shrink-0">({p.mainUnitName})</span>}
                  </label>
                );
              })
            )}
          </div>
          <p className="text-[10px] text-[var(--tx-muted)]">ติ๊กเพื่อเพิ่มเข้ากลุ่ม ({availableFiltered.length} รายการให้เลือก)</p>
        </div>

        {/* ── Column 3: Selected products with qty input ── */}
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-[var(--accent)] border-b border-[var(--bd)] pb-1">{typeLabel}ที่เลือก</h3>
          <div data-field="products" className="h-80 overflow-y-auto border border-[var(--bd)] rounded-lg bg-[var(--bg-card)]">
            {selectedRows.length === 0 ? (
              <p className="text-xs text-[var(--tx-muted)] text-center py-6">ไม่พบสินค้า</p>
            ) : (
              selectedRows.map(row => (
                <div key={row.productId} className="flex items-center gap-2 px-3 py-2 text-sm border-b border-[var(--bd)]">
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-[var(--tx-primary)]">{row.productName}</div>
                    {row.unit && <div className="text-[10px] text-[var(--tx-muted)]">หน่วย: {row.unit}</div>}
                  </div>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={row.qty}
                    onChange={(e) => updateQty(row.productId, e.target.value)}
                    className="w-20 px-2 py-1 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] text-right focus:outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    type="button"
                    onClick={() => removeProduct(row.productId)}
                    aria-label={`ลบ ${row.productName} จากกลุ่ม`}
                    className="text-red-400 hover:text-red-300 shrink-0 text-xs font-bold w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/10"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
          <p className="text-[10px] text-[var(--tx-muted)]">{selectedRows.length} รายการในกลุ่ม (กรอกจำนวน/หน่วย)</p>
        </div>
      </div>
    </MarketingFormShell>
  );
}
