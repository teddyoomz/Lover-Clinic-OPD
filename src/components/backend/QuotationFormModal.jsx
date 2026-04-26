// ─── Quotation Form Modal — Phase 13.1.3 ──────────────────────────────────
// Firestore-only CRUD (Rule E). OUR data in be_quotations. Sub-items picked
// from master_data/{courses,products,promotions} — read-only consume of the
// sync mirror. Takeaway meds carry medication fields (dosage, admin method,
// admin times) per the ProClinic Triangle scan (detailed-adminquotationcreate.json).

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Plus, Trash2, Search } from 'lucide-react';
import DateField from '../DateField.jsx';
import MarketingFormShell from './MarketingFormShell.jsx';
import RequiredAsterisk from '../ui/RequiredAsterisk.jsx';
import {
  saveQuotation, getAllCustomers, listStaff, getAllMasterDataItems,
} from '../../lib/backendClient.js';
import {
  validateQuotationStrict, normalizeQuotation, emptyQuotationForm,
  generateQuotationId, DOSAGE_UNITS, ADMINISTRATION_METHODS, ADMINISTRATION_TIMES,
} from '../../lib/quotationValidation.js';
import { scrollToField } from '../../lib/marketingUiUtils.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';

const ADMIN_METHOD_LABEL = {
  before_meal_30min: 'ก่อนอาหาร 30 นาที',
  after_meal: 'หลังอาหาร',
  interval: 'ทุกๆ N ชม.',
};
const ADMIN_TIME_LABEL = {
  morning: 'เช้า', noon: 'กลางวัน', evening: 'เย็น', bedtime: 'ก่อนนอน',
};

export default function QuotationFormModal({ quotation, onClose, onSaved, clinicSettings }) {
  const isEdit = !!quotation;
  // Phase 14.7.H follow-up D — branch-aware quotation writes.
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [form, setForm] = useState(() => {
    const base = { ...emptyQuotationForm(), ...(quotation || {}) };
    base.courses = Array.isArray(base.courses) ? base.courses : [];
    base.products = Array.isArray(base.products) ? base.products : [];
    base.promotions = Array.isArray(base.promotions) ? base.promotions : [];
    base.takeawayMeds = Array.isArray(base.takeawayMeds) ? base.takeawayMeds : [];
    return base;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reference data (read from Firestore via adapter / master_data).
  const [customers, setCustomers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [masterCourses, setMasterCourses] = useState([]);
  const [masterProducts, setMasterProducts] = useState([]);
  const [masterPromotions, setMasterPromotions] = useState([]);
  const [refLoading, setRefLoading] = useState(false);

  // Picker queries for each sub-item category.
  const [courseQuery, setCourseQuery] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [promoQuery, setPromoQuery] = useState('');
  const [medQuery, setMedQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    setRefLoading(true);
    Promise.all([
      getAllCustomers().catch(() => []),
      listStaff().catch(() => []),
      getAllMasterDataItems('courses').catch(() => []),
      getAllMasterDataItems('products').catch(() => []),
      getAllMasterDataItems('promotions').catch(() => []),
    ])
      .then(([cs, st, mc, mp, mpr]) => {
        if (cancelled) return;
        setCustomers(cs || []);
        setStaff(st || []);
        setMasterCourses(mc || []);
        setMasterProducts(mp || []);
        setMasterPromotions(mpr || []);
      })
      .finally(() => { if (!cancelled) setRefLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const update = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  // ── Sub-item helpers: add / remove / update qty / update field ──
  const addSubItem = useCallback((category, item) => {
    if (!item) return;
    // Price field differs per master_data shape:
    //   - products: `price` (from beProductToMasterShape)
    //   - courses:  `price` (beCourseToMasterShape maps salePrice -> price)
    //   - promotions: `sale_price` ONLY (bePromotionToMasterShape just spreads
    //     the raw be_promotion doc — no `price` key). This is why earlier
    //     versions defaulted promotions to 0.
    // Fall through every known variant + take the first positive number.
    const pickPrice = (it) => {
      const keys = ['price', 'sale_price', 'salePrice',
        'sale_price_incl_vat', 'priceInclVat', 'price_incl_vat'];
      for (const k of keys) {
        const v = it?.[k];
        if (v == null || v === '') continue;
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) return n;
      }
      return 0;
    };
    setForm((prev) => {
      const list = prev[category] || [];
      const idKey = category === 'courses' ? 'courseId'
        : category === 'products' ? 'productId'
        : category === 'promotions' ? 'promotionId'
        : 'productId';
      if (list.some((x) => String(x[idKey]) === String(item.id))) return prev;
      const base = {
        qty: 1,
        price: pickPrice(item),
        itemDiscount: 0,
        itemDiscountType: '',
        isVatIncluded: false,
      };
      let entry;
      if (category === 'courses') {
        entry = { ...base, courseId: item.id, courseName: item.name || '' };
      } else if (category === 'products') {
        entry = { ...base, productId: item.id, productName: item.name || '', isPremium: false };
      } else if (category === 'promotions') {
        entry = { ...base, promotionId: item.id, promotionName: item.name || '' };
      } else {
        // takeawayMeds
        entry = {
          ...base, productId: item.id, productName: item.name || '',
          isPremium: false,
          genericName: '', indications: '',
          dosageAmount: '', dosageUnit: '', timesPerDay: '',
          administrationMethod: '', administrationMethodHour: 0,
          administrationTimes: [],
        };
      }
      return { ...prev, [category]: [...list, entry] };
    });
  }, []);

  const updateSubItem = useCallback((category, idx, patch) => {
    setForm((prev) => ({
      ...prev,
      [category]: (prev[category] || []).map((x, i) => i === idx ? { ...x, ...patch } : x),
    }));
  }, []);

  const removeSubItem = useCallback((category, idx) => {
    setForm((prev) => ({
      ...prev,
      [category]: (prev[category] || []).filter((_, i) => i !== idx),
    }));
  }, []);

  // Subtotal + net helpers. Kept simple — exact money rules land in Phase 13.x.
  const subtotal = useMemo(() => {
    const sum = (arr) => (arr || []).reduce((acc, x) => {
      const gross = (Number(x.qty) || 0) * (Number(x.price) || 0);
      const disc = Number(x.itemDiscount) || 0;
      const net = x.itemDiscountType === 'percent'
        ? gross * (1 - disc / 100)
        : gross - disc;
      return acc + Math.max(0, net);
    }, 0);
    return sum(form.courses) + sum(form.products) + sum(form.promotions) + sum(form.takeawayMeds);
  }, [form.courses, form.products, form.promotions, form.takeawayMeds]);

  const netTotal = useMemo(() => {
    const d = Number(form.discount) || 0;
    const after = form.discountType === 'percent'
      ? subtotal * (1 - d / 100)
      : subtotal - d;
    return Math.max(0, after);
  }, [subtotal, form.discount, form.discountType]);

  const handleSave = async () => {
    setError('');
    const normalized = normalizeQuotation({ ...form, subtotal, netTotal });
    const fail = validateQuotationStrict(normalized);
    if (fail) {
      setError(fail[1]);
      scrollToField(fail[0]);
      return;
    }
    setSaving(true);
    try {
      const id = isEdit ? (quotation.quotationId || quotation.id) : generateQuotationId();
      await saveQuotation(id, {
        ...normalized,
        branchId: selectedBranchId,
        createdAt: isEdit ? (quotation.createdAt || new Date().toISOString()) : new Date().toISOString(),
      });
      onSaved?.();
    } catch (e) {
      setError(e.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  // ── Filtered picker pools ──
  const filterPool = (pool, q, selectedIds) => {
    const query = (q || '').trim().toLowerCase();
    const taken = new Set(selectedIds.map(String));
    const available = pool.filter((p) => !taken.has(String(p.id)));
    if (!query) return available.slice(0, 20);
    return available.filter((p) =>
      (p.name || '').toLowerCase().includes(query) ||
      (p.category || '').toLowerCase().includes(query)
    ).slice(0, 20);
  };

  const coursesPool = filterPool(masterCourses, courseQuery, form.courses.map((c) => c.courseId));
  const productsPool = filterPool(masterProducts, productQuery, form.products.map((p) => p.productId));
  const promotionsPool = filterPool(masterPromotions, promoQuery, form.promotions.map((p) => p.promotionId));
  const medsPool = filterPool(masterProducts, medQuery, form.takeawayMeds.map((m) => m.productId));

  return (
    <MarketingFormShell
      isEdit={isEdit}
      titleCreate="สร้างใบเสนอราคาใหม่"
      titleEdit="แก้ไขใบเสนอราคา"
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      error={error}
      maxWidth="5xl"
      bodySpacing={6}
      clinicSettings={clinicSettings}
    >
      {/* Header: customer + date + seller + note + discount */}
      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--tx-muted)]">ข้อมูลทั่วไป</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div data-field="customerId">
            <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">
              ลูกค้า <RequiredAsterisk />
            </label>
            <select value={form.customerId}
              onChange={(e) => {
                const cid = e.target.value;
                const cust = customers.find((c) => (c.proClinicId || c.id) === cid);
                const cName = cust ? `${cust.patientData?.firstName || ''} ${cust.patientData?.lastName || ''}`.trim() : '';
                setForm((prev) => ({ ...prev, customerId: cid, customerName: cName, customerHN: cust?.proClinicHN || cust?.hn || '' }));
              }}
              className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] focus:outline-none focus:border-[var(--accent)]">
              <option value="">— เลือกลูกค้า *</option>
              {customers.slice(0, 500).map((c) => {
                const cid = c.proClinicId || c.id;
                const name = `${c.patientData?.firstName || ''} ${c.patientData?.lastName || ''}`.trim();
                return <option key={cid} value={cid}>{name || cid}{c.proClinicHN ? ` (${c.proClinicHN})` : ''}</option>;
              })}
            </select>
          </div>

          <div data-field="quotationDate">
            <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">
              วันที่เสนอราคา <RequiredAsterisk />
            </label>
            <DateField value={form.quotationDate}
              onChange={(v) => update('quotationDate', v)}
              locale="ce" placeholder="เลือกวันที่" />
          </div>

          <div data-field="sellerId">
            <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">พนักงานขาย</label>
            <select value={form.sellerId}
              onChange={(e) => {
                const sid = e.target.value;
                const s = staff.find((x) => (x.staffId || x.id) === sid);
                const full = s ? `${s.firstname || ''} ${s.lastname || ''}`.trim() : '';
                const sName = full || s?.nickname || s?.name || '';
                setForm((prev) => ({ ...prev, sellerId: sid, sellerName: sName }));
              }}
              className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] focus:outline-none focus:border-[var(--accent)]">
              <option value="">— ไม่ระบุ</option>
              {staff.slice(0, 500).map((s) => {
                const sid = s.staffId || s.id;
                const full = `${s.firstname || ''} ${s.lastname || ''}`.trim();
                const nick = s.nickname ? ` (${s.nickname})` : '';
                const display = full ? `${full}${nick}` : (s.nickname || s.name || sid);
                return <option key={sid} value={sid}>{display}</option>;
              })}
            </select>
          </div>

          <div data-field="note">
            <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">หมายเหตุ</label>
            <input type="text" value={form.note}
              onChange={(e) => update('note', e.target.value)}
              placeholder="กรอกหมายเหตุ (ถ้ามี)"
              className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] focus:outline-none focus:border-[var(--accent)]" />
          </div>
        </div>
      </section>

      {/* Sub-items: 4 categories */}
      {[
        { key: 'courses', label: 'คอร์ส', pool: coursesPool, query: courseQuery, setQuery: setCourseQuery, idField: 'courseId', nameField: 'courseName' },
        { key: 'products', label: 'สินค้าหน้าร้าน', pool: productsPool, query: productQuery, setQuery: setProductQuery, idField: 'productId', nameField: 'productName' },
        { key: 'promotions', label: 'โปรโมชัน', pool: promotionsPool, query: promoQuery, setQuery: setPromoQuery, idField: 'promotionId', nameField: 'promotionName' },
        { key: 'takeawayMeds', label: 'ยากลับบ้าน', pool: medsPool, query: medQuery, setQuery: setMedQuery, idField: 'productId', nameField: 'productName' },
      ].map(({ key, label, pool, query, setQuery, idField, nameField }) => (
        <section key={key} className="space-y-3" data-field={key}>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--tx-muted)]">{label}</h3>
            <span className="text-[10px] text-[var(--tx-muted)]">{(form[key] || []).length} รายการ</span>
          </div>

          {/* Picker */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tx-muted)] pointer-events-none" />
            <input type="text" value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`ค้นหา ${label}`}
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] focus:outline-none focus:border-[var(--accent)]" />
          </div>
          {pool.length > 0 && (
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1">
              {pool.map((item) => (
                <button key={item.id} type="button"
                  onClick={() => addSubItem(key, item)}
                  className="px-2 py-1 rounded-full text-[11px] bg-[var(--bg-hover)] border border-[var(--bd)] hover:border-[var(--accent)] flex items-center gap-1">
                  <Plus size={10} /> {item.name || item.id}
                  {item.price ? <span className="text-[var(--tx-muted)] text-[10px]">· {Number(item.price).toLocaleString('th-TH')}</span> : null}
                </button>
              ))}
            </div>
          )}

          {/* Selected items list */}
          {(form[key] || []).length > 0 && (
            <div className="space-y-2">
              {form[key].map((item, idx) => (
                <div key={`${item[idField]}-${idx}`}
                  className="p-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--bd)]">
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className="font-semibold text-sm flex-1 min-w-0 truncate">{item[nameField] || item[idField]}</span>
                    <button type="button" onClick={() => removeSubItem(key, idx)}
                      aria-label={`ลบ ${item[nameField] || item[idField]}`}
                      className="p-1 text-red-400 hover:bg-red-900/20 rounded shrink-0">
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                    <label className="text-[11px] text-[var(--tx-muted)]">
                      จำนวน
                      <input type="number" min="1" step="1" value={item.qty}
                        onChange={(e) => updateSubItem(key, idx, { qty: Math.max(1, Number(e.target.value) || 1) })}
                        className="w-full px-2 py-1 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] mt-0.5" />
                    </label>
                    <label className="text-[11px] text-[var(--tx-muted)]">
                      ราคา/หน่วย
                      <input type="number" min="0" step="0.01" value={item.price}
                        onChange={(e) => updateSubItem(key, idx, { price: Math.max(0, Number(e.target.value) || 0) })}
                        className="w-full px-2 py-1 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] mt-0.5" />
                    </label>
                    <label className="text-[11px] text-[var(--tx-muted)]">
                      ส่วนลด
                      <input type="number" min="0" step="0.01" value={item.itemDiscount || 0}
                        onChange={(e) => updateSubItem(key, idx, { itemDiscount: Math.max(0, Number(e.target.value) || 0) })}
                        className="w-full px-2 py-1 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] mt-0.5" />
                    </label>
                    <label className="text-[11px] text-[var(--tx-muted)]">
                      ประเภทส่วนลด
                      <select value={item.itemDiscountType || ''}
                        onChange={(e) => updateSubItem(key, idx, { itemDiscountType: e.target.value })}
                        className="w-full px-2 py-1 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] mt-0.5">
                        <option value="">—</option>
                        <option value="percent">%</option>
                        <option value="baht">บาท</option>
                      </select>
                    </label>
                  </div>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <label className="inline-flex items-center gap-1 text-[11px]">
                      <input type="checkbox" checked={!!item.isVatIncluded}
                        onChange={(e) => updateSubItem(key, idx, { isVatIncluded: e.target.checked })} />
                      รวม VAT
                    </label>
                    {(key === 'products' || key === 'takeawayMeds') && (
                      <label className="inline-flex items-center gap-1 text-[11px]">
                        <input type="checkbox" checked={!!item.isPremium}
                          onChange={(e) => updateSubItem(key, idx, { isPremium: e.target.checked })} />
                        ของแถม
                      </label>
                    )}
                  </div>

                  {/* Takeaway-med medication fields */}
                  {key === 'takeawayMeds' && (
                    <div className="mt-2 pt-2 border-t border-[var(--bd)] space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <label className="text-[11px] text-[var(--tx-muted)]">
                          ชื่อสามัญทางยา
                          <input type="text" value={item.genericName || ''}
                            onChange={(e) => updateSubItem(key, idx, { genericName: e.target.value })}
                            className="w-full px-2 py-1 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] mt-0.5" />
                        </label>
                        <label className="text-[11px] text-[var(--tx-muted)]">
                          ข้อบ่งใช้
                          <input type="text" value={item.indications || ''}
                            onChange={(e) => updateSubItem(key, idx, { indications: e.target.value })}
                            className="w-full px-2 py-1 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] mt-0.5" />
                        </label>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <label className="text-[11px] text-[var(--tx-muted)]">
                          ขนาดยา
                          <input type="text" value={item.dosageAmount || ''}
                            onChange={(e) => updateSubItem(key, idx, { dosageAmount: e.target.value })}
                            placeholder="เช่น 1-2"
                            className="w-full px-2 py-1 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] mt-0.5" />
                        </label>
                        <label className="text-[11px] text-[var(--tx-muted)]">
                          หน่วย
                          <select value={item.dosageUnit || ''}
                            onChange={(e) => updateSubItem(key, idx, { dosageUnit: e.target.value })}
                            className="w-full px-2 py-1 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] mt-0.5">
                            <option value="">—</option>
                            {DOSAGE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </label>
                        <label className="text-[11px] text-[var(--tx-muted)]">
                          ครั้ง/วัน
                          <input type="text" value={item.timesPerDay || ''}
                            onChange={(e) => updateSubItem(key, idx, { timesPerDay: e.target.value })}
                            placeholder="เช่น 3"
                            className="w-full px-2 py-1 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] mt-0.5" />
                        </label>
                        <label className="text-[11px] text-[var(--tx-muted)]">
                          วิธีใช้
                          <select value={item.administrationMethod || ''}
                            onChange={(e) => updateSubItem(key, idx, { administrationMethod: e.target.value })}
                            className="w-full px-2 py-1 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] mt-0.5">
                            <option value="">—</option>
                            {ADMINISTRATION_METHODS.map((m) => <option key={m} value={m}>{ADMIN_METHOD_LABEL[m]}</option>)}
                          </select>
                        </label>
                      </div>
                      {item.administrationMethod === 'interval' && (
                        <label className="text-[11px] text-[var(--tx-muted)] block">
                          ทุกๆ (ชม.) <RequiredAsterisk />
                          <input type="number" min="1" step="1" value={item.administrationMethodHour || ''}
                            onChange={(e) => updateSubItem(key, idx, { administrationMethodHour: Math.max(0, Number(e.target.value) || 0) })}
                            placeholder="เช่น 6"
                            className="w-full sm:w-32 px-2 py-1 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] mt-0.5" />
                        </label>
                      )}
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-[11px] text-[var(--tx-muted)]">เวลา:</span>
                        {ADMINISTRATION_TIMES.map((t) => (
                          <label key={t} className="inline-flex items-center gap-1 text-[11px]">
                            <input type="checkbox"
                              checked={(item.administrationTimes || []).includes(t)}
                              onChange={(e) => {
                                const cur = item.administrationTimes || [];
                                const next = e.target.checked ? [...cur, t] : cur.filter((x) => x !== t);
                                updateSubItem(key, idx, { administrationTimes: next });
                              }} />
                            {ADMIN_TIME_LABEL[t]}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      ))}

      {/* Header discount + summary */}
      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--tx-muted)]">สรุป</h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div data-field="discount">
            <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">ส่วนลดรวม</label>
            <input type="number" min="0" step="0.01" value={form.discount || 0}
              onChange={(e) => update('discount', Math.max(0, Number(e.target.value) || 0))}
              className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] focus:outline-none focus:border-[var(--accent)]" />
          </div>
          <div data-field="discountType">
            <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">ประเภท</label>
            <select value={form.discountType || ''}
              onChange={(e) => update('discountType', e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] focus:outline-none focus:border-[var(--accent)]">
              <option value="">—</option>
              <option value="percent">%</option>
              <option value="baht">บาท</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">ยอดสุทธิ</label>
            <div className="px-3 py-2 rounded-lg text-lg font-black bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-heading)]">
              {netTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท
            </div>
          </div>
        </div>
        <p className="text-[11px] text-[var(--tx-muted)]">ยอดรวมก่อนส่วนลด: {subtotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</p>
      </section>

      {refLoading && <p className="text-xs text-[var(--tx-muted)]">กำลังโหลดข้อมูลอ้างอิง...</p>}
    </MarketingFormShell>
  );
}
