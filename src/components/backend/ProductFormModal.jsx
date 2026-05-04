// ─── Product Form Modal — Phase 12.2 CRUD ──────────────────────────────────
// Core product fields + dosage cluster for ยา. Category/unit pickers pull
// from existing be_product_groups + be_product_units (Phase 11.2 + 11.3)
// so new products inherit the same taxonomy as synced ones.

import { useState, useCallback, useEffect, useMemo } from 'react';
import MarketingFormShell from './MarketingFormShell.jsx';
import RequiredAsterisk from '../ui/RequiredAsterisk.jsx';
import { saveProduct, listProductGroups, listProductUnitGroups, listProducts } from '../../lib/scopedDataLayer.js';
import {
  STATUS_OPTIONS, PRODUCT_TYPE_OPTIONS,
  validateProduct, emptyProductForm, generateProductId,
} from '../../lib/productValidation.js';
import { scrollToField } from '../../lib/marketingUiUtils.js';

export default function ProductFormModal({ product, onClose, onSaved, clinicSettings }) {
  const isEdit = !!product;
  const [form, setForm] = useState(() => product ? { ...emptyProductForm(), ...product } : emptyProductForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [groups, setGroups] = useState([]);
  const [units, setUnits] = useState([]);
  // Phase 15.5 / Item 2 (2026-04-28) — eager-load existing products' mainUnitName
  // values to enrich the unit datalist. Refetch on each modal mount (R1 real-time:
  // closing + reopening modal picks up newly-saved units immediately).
  const [productUnits, setProductUnits] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [g, u, p] = await Promise.all([
          listProductGroups(),
          listProductUnitGroups(),
          listProducts().catch(() => []), // non-fatal — datalist degrades gracefully
        ]);
        setGroups(g);
        setUnits(u);
        // Extract unique non-empty mainUnitName values from existing products
        const seen = new Set();
        const productUnitOpts = [];
        for (const prod of (Array.isArray(p) ? p : [])) {
          const u = typeof prod?.mainUnitName === 'string' ? prod.mainUnitName.trim() : '';
          if (!u) continue;
          if (seen.has(u)) continue;
          seen.add(u);
          productUnitOpts.push(u);
        }
        productUnitOpts.sort((a, b) => a.localeCompare(b, 'th'));
        setProductUnits(productUnitOpts);
      } catch (e) {
        setError(e.message || 'โหลดข้อมูลอ้างอิงล้มเหลว');
      }
    })();
  }, []);

  // Phase 15.5 / Item 2 — merged datalist options (master units + existing
  // product units, deduped). Master takes precedence (key shape preserved).
  const unitDatalistOptions = useMemo(() => {
    const seen = new Set();
    const out = [];
    // Master units first (be_product_units groups → flat)
    for (const u of units) {
      if (!u || typeof u !== 'object') continue;
      for (const x of (u.units || [])) {
        const name = typeof x?.name === 'string' ? x.name.trim() : '';
        if (!name || seen.has(name)) continue;
        seen.add(name);
        out.push({ key: `master-${u.unitGroupId || u.id}-${name}`, value: name, source: 'master' });
      }
    }
    // Then product-derived units not already in master
    for (const name of productUnits) {
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push({ key: `product-${name}`, value: name, source: 'product' });
    }
    return out;
  }, [units, productUnits]);

  const update = useCallback((patch) => setForm(prev => ({ ...prev, ...patch })), []);

  const handleSave = async () => {
    setError('');
    const fail = validateProduct(form);
    if (fail) {
      const [field, msg] = fail;
      setError(msg);
      scrollToField(field);
      return;
    }
    setSaving(true);
    try {
      const id = product?.productId || product?.id || generateProductId();
      await saveProduct(id, { ...form, createdAt: product?.createdAt });
      await onSaved?.();
    } catch (e) {
      setError(e.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const isMedicine = form.productType === 'ยา';

  return (
    <MarketingFormShell
      isEdit={isEdit}
      titleCreate="เพิ่มสินค้า"
      titleEdit="แก้ไขสินค้า"
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      error={error}
      maxWidth="3xl"
      bodySpacing={4}
      clinicSettings={clinicSettings}
    >
      {/* Type + status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div data-field="productType">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">
            ประเภท <RequiredAsterisk />
          </label>
          <select value={form.productType} onChange={(e) => update({ productType: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]">
            {PRODUCT_TYPE_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div data-field="status">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">สถานะ</label>
          <select value={form.status} onChange={(e) => update({ status: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]">
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Name + code */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div data-field="productName">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">
            ชื่อสินค้า <RequiredAsterisk />
          </label>
          <input type="text" value={form.productName} onChange={(e) => update({ productName: e.target.value })}
            placeholder="ชื่อสินค้า"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
        <div data-field="productCode">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">รหัส</label>
          <input type="text" value={form.productCode} onChange={(e) => update({ productCode: e.target.value })}
            placeholder="รหัสสินค้า"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
      </div>

      {/* Category + unit */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div data-field="categoryName">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">หมวดหมู่</label>
          <input type="text" list="product-group-list" value={form.categoryName} onChange={(e) => update({ categoryName: e.target.value })}
            placeholder="หมวดหมู่"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
          <datalist id="product-group-list">
            {groups.map(g => <option key={g.groupId || g.id} value={g.name} />)}
          </datalist>
        </div>
        <div data-field="mainUnitName">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">หน่วย</label>
          <input type="text" list="product-unit-list" value={form.mainUnitName} onChange={(e) => update({ mainUnitName: e.target.value })}
            placeholder="เช่น ครั้ง / amp. / ชิ้น"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
          {/* Phase 15.5 / Item 2 (2026-04-28) — datalist merges master units
              (be_product_units) WITH units already used in be_products. Lets
              admin pick existing in-system units even if no master entry. */}
          <datalist id="product-unit-list" data-testid="product-unit-datalist">
            {unitDatalistOptions.map((opt) => (
              <option key={opt.key} value={opt.value} data-source={opt.source} />
            ))}
          </datalist>
        </div>
      </div>

      {/* Pricing */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div data-field="price">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ราคา</label>
          <input type="number" step="0.01" min="0" value={form.price ?? ''} onChange={(e) => update({ price: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
        <div data-field="priceInclVat">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ราคารวม VAT</label>
          <input type="number" step="0.01" min="0" value={form.priceInclVat ?? ''} onChange={(e) => update({ priceInclVat: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
      </div>

      {/* Flags */}
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-[var(--tx-primary)] cursor-pointer">
          <input type="checkbox" checked={!!form.isVatIncluded} onChange={(e) => update({ isVatIncluded: e.target.checked })} className="w-4 h-4 rounded accent-emerald-500" />
          ราคารวม VAT แล้ว
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--tx-primary)] cursor-pointer">
          <input type="checkbox" checked={!!form.isClaimDrugDiscount} onChange={(e) => update({ isClaimDrugDiscount: e.target.checked })} className="w-4 h-4 rounded accent-emerald-500" />
          เบิกยา
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--tx-primary)] cursor-pointer">
          <input type="checkbox" checked={!!form.isTakeawayProduct} onChange={(e) => update({ isTakeawayProduct: e.target.checked })} className="w-4 h-4 rounded accent-emerald-500" />
          ให้กลับบ้านได้
        </label>
      </div>

      {/* Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div data-field="alertDayBeforeExpire">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">แจ้งก่อนหมดอายุ (วัน)</label>
          <input type="number" min="0" value={form.alertDayBeforeExpire ?? ''} onChange={(e) => update({ alertDayBeforeExpire: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
        <div data-field="alertQtyBeforeOutOfStock">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">แจ้งใกล้หมด (qty)</label>
          <input type="number" min="0" value={form.alertQtyBeforeOutOfStock ?? ''} onChange={(e) => update({ alertQtyBeforeOutOfStock: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
        <div data-field="alertQtyBeforeMaxStock">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">แจ้งเกินสต็อก (qty)</label>
          <input type="number" min="0" value={form.alertQtyBeforeMaxStock ?? ''} onChange={(e) => update({ alertQtyBeforeMaxStock: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
      </div>

      {/* Medicine dosage cluster — shown only for ยา */}
      {isMedicine && (
        <div className="rounded-xl border border-[var(--bd)] p-3">
          <p className="text-[11px] font-bold text-[var(--tx-muted)] mb-2 uppercase tracking-wider">ข้อมูลยา (สำหรับประเภท "ยา" เท่านั้น)</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div data-field="genericName">
              <label className="block text-xs text-[var(--tx-muted)] mb-1">ชื่อสามัญทางยา</label>
              <input type="text" value={form.genericName} onChange={(e) => update({ genericName: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]" />
            </div>
            <div data-field="dosageAmount">
              <label className="block text-xs text-[var(--tx-muted)] mb-1">ขนาดยา</label>
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={form.dosageAmount} onChange={(e) => update({ dosageAmount: e.target.value })}
                  placeholder="500"
                  className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]" />
                <input type="text" value={form.dosageUnit} onChange={(e) => update({ dosageUnit: e.target.value })}
                  placeholder="mg"
                  className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]" />
              </div>
            </div>
          </div>
          <div data-field="indications" className="mt-3">
            <label className="block text-xs text-[var(--tx-muted)] mb-1">ข้อบ่งใช้</label>
            <textarea rows={2} value={form.indications} onChange={(e) => update({ indications: e.target.value })}
              className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)] resize-none" />
          </div>
          <div data-field="instructions" className="mt-3">
            <label className="block text-xs text-[var(--tx-muted)] mb-1">วิธีใช้</label>
            <textarea rows={2} value={form.instructions} onChange={(e) => update({ instructions: e.target.value })}
              className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)] resize-none" />
          </div>
          <div data-field="storageInstructions" className="mt-3">
            <label className="block text-xs text-[var(--tx-muted)] mb-1">การเก็บรักษา</label>
            <textarea rows={2} value={form.storageInstructions} onChange={(e) => update({ storageInstructions: e.target.value })}
              className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)] resize-none" />
          </div>
        </div>
      )}

      {/* Order */}
      <div className="grid grid-cols-2 gap-3">
        <div data-field="orderBy">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ลำดับการแสดง</label>
          <input type="number" min="0" value={form.orderBy ?? ''} onChange={(e) => update({ orderBy: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
        <div data-field="stockLocation">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ตำแหน่งเก็บ</label>
          <input type="text" value={form.stockLocation} onChange={(e) => update({ stockLocation: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
      </div>
    </MarketingFormShell>
  );
}
