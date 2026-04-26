// ─── Course Form Modal — Phase 12.2b ProClinic parity ─────────────────────
// Rewritten 2026-04-24 from the Phase 12.2 core-only scaffolding to match
// ProClinic's /admin/course/{id}/edit form (Triangle capture via
// opd.js forms). Full field parity:
//   - 4 course types (radio) with contextual descriptions
//   - Main product picker + qty + per-time + min/max
//   - deductCost (หักต้นทุนก่อนคำนวณค่ามือ) + VAT
//   - Duration: daysBeforeExpire + period + time
//   - Usage scope (คลินิก / สาขา) + DF flags (มีค่ามือ, editable global, hidden)
//   - Secondary products table with per-row flags
//
// Phase 12.2b Rule H-tris: be_* only (no brokerClient touch). Readers that
// consume these fields land in Phase 12.2b follow-up (TreatmentFormPage
// branching per courseType).

import { useState, useCallback, useEffect, useMemo } from 'react';
import MarketingFormShell from './MarketingFormShell.jsx';
import RequiredAsterisk from '../ui/RequiredAsterisk.jsx';
import { saveCourse, listProducts, listCourses } from '../../lib/backendClient.js';
import {
  STATUS_OPTIONS, COURSE_TYPE_OPTIONS, USAGE_TYPE_OPTIONS,
  validateCourse, emptyCourseForm, generateCourseId,
  isRealQtyCourse, isBuffetCourse, isPickAtTreatmentCourse,
} from '../../lib/courseValidation.js';
import { scrollToField } from '../../lib/marketingUiUtils.js';
import { Trash2, Search } from 'lucide-react';

// Short descriptions under each radio — matches ProClinic's helper copy.
const COURSE_TYPE_DESC = {
  'ระบุสินค้าและจำนวนสินค้า': 'สำหรับคอร์ส/บริการ ที่ระบุจำนวนได้',
  'บุฟเฟต์': 'สำหรับคอร์สที่ระบุสินค้า/บริการได้ และใช้ได้ไม่จำกัดจนครบกำหนดระยะเวลา',
  'เหมาตามจริง': 'สำหรับคอร์สที่ไม่สามารถระบุจำนวนได้ทันที — ระบุจำนวนตอนเกิดการรักษาแล้ว',
  'เลือกสินค้าตามจริง': 'สำหรับคอร์สที่ไม่สามารถระบุสินค้า/บริการขณะซื้อ — เลือกได้เมื่อเกิดการรักษา',
};

export default function CourseFormModal({ course, onClose, onSaved, clinicSettings }) {
  const isEdit = !!course;
  const [form, setForm] = useState(() => course
    ? { ...emptyCourseForm(), ...course, courseProducts: course.courseProducts || [] }
    : emptyCourseForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [products, setProducts] = useState([]);
  const [allCourses, setAllCourses] = useState([]);
  const [mainPickerQuery, setMainPickerQuery] = useState('');
  const [subPickerQuery, setSubPickerQuery] = useState('');

  useEffect(() => {
    (async () => {
      try {
        // Phase 12.2b follow-up (2026-04-24): load both products AND all
        // existing courses so the category + procedureType inputs can
        // offer datalist suggestions derived from be_courses (Rule H-tris:
        // read from be_* only, no master_data / ProClinic fallback). If
        // no existing courses carry a field yet, the datalist is empty
        // and the user types a new value — that value then becomes a
        // suggestion for the next course.
        const [productList, courseList] = await Promise.all([
          listProducts().catch(() => []),
          listCourses().catch(() => []),
        ]);
        setProducts(productList);
        setAllCourses(courseList);
      } catch (e) {
        setError(e.message || 'โหลดรายการสินค้าล้มเหลว');
      }
    })();
  }, []);

  // Phase 12.2b follow-up (2026-04-24): distinct existing values from
  // be_courses power the courseCategory + procedureType datalists.
  // Collected case-insensitively but preserve the first-seen casing so
  // duplicates from typos ("botox" vs "Botox") still appear separately
  // for the user to clean up (rename in the offending course if needed).
  const existingCategories = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const c of (allCourses || [])) {
      const v = String(c?.courseCategory || '').trim();
      if (!v) continue;
      const key = v.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
    return out.sort((a, b) => a.localeCompare(b, 'th'));
  }, [allCourses]);

  const existingProcedureTypes = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const c of (allCourses || [])) {
      const v = String(c?.procedureType || '').trim();
      if (!v) continue;
      const key = v.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
    return out.sort((a, b) => a.localeCompare(b, 'th'));
  }, [allCourses]);

  const update = useCallback((patch) => setForm((prev) => ({ ...prev, ...patch })), []);

  // Phase 12.2b: auto-compute VAT-inclusive price when user sets base price
  // + the VAT checkbox, and vice-versa. Mirrors ProClinic's reactive form.
  const updatePrice = (base, withVat) => {
    const vatOn = !!withVat;
    const baseN = Number(base) || 0;
    const incVat = vatOn ? Math.round(baseN * 1.07 * 100) / 100 : baseN;
    update({ salePrice: base, isVatIncluded: vatOn, salePriceInclVat: incVat });
  };

  // ── Main product picker ──
  const filteredMainPicker = useMemo(() => {
    const q = mainPickerQuery.trim().toLowerCase();
    return (products || []).filter((p) => {
      if (!q) return true;
      return (p.productName || '').toLowerCase().includes(q);
    }).slice(0, 20);
  }, [products, mainPickerQuery]);

  const pickMain = (p) => {
    const pid = String(p.productId || p.id || '');
    update({ mainProductId: pid, mainProductName: p.productName || '' });
    setMainPickerQuery('');
  };

  // ── Secondary products table ──
  const filteredSubPicker = useMemo(() => {
    const q = subPickerQuery.trim().toLowerCase();
    return (products || []).filter((p) => {
      if (!q) return true;
      return (p.productName || '').toLowerCase().includes(q);
    }).slice(0, 20);
  }, [products, subPickerQuery]);

  const addSubProduct = (p) => {
    const pid = String(p.productId || p.id || '');
    setForm((prev) => {
      if ((prev.courseProducts || []).some((x) => x.productId === pid)) return prev;
      return {
        ...prev,
        courseProducts: [
          ...(prev.courseProducts || []),
          {
            productId: pid,
            productName: p.productName || '',
            qty: 1,
            qtyPerTime: '',
            minQty: '',
            maxQty: '',
            isRequired: false,
            isDf: true,
            isHidden: false,
          },
        ],
      };
    });
    setSubPickerQuery('');
  };

  const removeSubProduct = (pid) => {
    setForm((prev) => ({
      ...prev,
      courseProducts: (prev.courseProducts || []).filter((x) => x.productId !== pid),
    }));
  };

  const updateSubProduct = (pid, patch) => {
    setForm((prev) => ({
      ...prev,
      courseProducts: (prev.courseProducts || []).map((x) =>
        x.productId === pid ? { ...x, ...patch } : x),
    }));
  };

  const handleSave = async () => {
    setError('');
    const fail = validateCourse(form);
    if (fail) {
      const [field, msg] = fail;
      setError(msg);
      scrollToField(field);
      return;
    }
    setSaving(true);
    try {
      const id = course?.courseId || course?.id || generateCourseId();
      await saveCourse(id, { ...form, createdAt: course?.createdAt });
      await onSaved?.();
    } catch (e) {
      setError(e.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  // Phase 12.2b: the main-product block is shown for 3/4 types. "เลือก
  // สินค้าตามจริง" courses don't preset a main product — user picks at
  // treatment time. Qty fields are also gated: real-qty + pick-at-treatment
  // hide pre-set qty; buffet allows "per-time" but not total qty.
  const showMainProduct = !isPickAtTreatmentCourse(form.courseType);
  const showMainQty = !isRealQtyCourse(form.courseType) && !isPickAtTreatmentCourse(form.courseType);
  const showQtyPerTime = showMainProduct; // per-visit qty applies to specific/buffet/real
  const showMinMax = showMainProduct;

  return (
    <MarketingFormShell
      isEdit={isEdit}
      titleCreate="สร้างคอร์ส"
      titleEdit="แก้ไขคอร์ส"
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      error={error}
      maxWidth="4xl"
      bodySpacing={4}
      clinicSettings={clinicSettings}
    >
      {/* ── Row 1: name + receipt name ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div data-field="courseName">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">
            ชื่อคอร์ส <RequiredAsterisk />
          </label>
          <input type="text" value={form.courseName}
            onChange={(e) => update({ courseName: e.target.value })}
            placeholder="กรอกชื่อคอร์ส"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
        <div data-field="receiptCourseName">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ชื่อคอร์ส (แสดงในใบเสร็จ)</label>
          <input type="text" value={form.receiptCourseName}
            onChange={(e) => update({ receiptCourseName: e.target.value })}
            placeholder="เว้นว่าง = ใช้ชื่อคอร์สด้านบน"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
      </div>

      {/* ── Row 2: code + category + procedure type ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div data-field="courseCode">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">รหัสคอร์ส</label>
          <input type="text" value={form.courseCode}
            onChange={(e) => update({ courseCode: e.target.value })}
            placeholder="กรอกรหัสคอร์ส"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
        <div data-field="courseCategory">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">หมวดหมู่</label>
          <input type="text" value={form.courseCategory}
            onChange={(e) => update({ courseCategory: e.target.value })}
            placeholder="เช่น Laser / Botox / Filler"
            list="course-category-options"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
          {/* Phase 12.2b follow-up (2026-04-24): datalist surfaces every
              distinct courseCategory already on be_courses. Pure suggestion
              — user can still type a new value; the next course that
              loads the modal will pick it up. */}
          <datalist id="course-category-options">
            {existingCategories.map((cat) => (
              <option key={cat} value={cat} />
            ))}
          </datalist>
          {existingCategories.length === 0 && (
            <p className="text-[10px] text-[var(--tx-muted)] mt-1 italic">
              ยังไม่มีหมวดหมู่ใน be_courses — พิมพ์สร้างใหม่ได้ หรือ sync ข้อมูลคอร์สจาก MasterDataTab
            </p>
          )}
        </div>
        <div data-field="procedureType">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ประเภทหัตถการ</label>
          <input type="text" value={form.procedureType}
            onChange={(e) => update({ procedureType: e.target.value })}
            placeholder="เช่น สัก / ฟิลเลอร์ / กายภาพบำบัด"
            list="procedure-type-options"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
          <datalist id="procedure-type-options">
            {existingProcedureTypes.map((pt) => (
              <option key={pt} value={pt} />
            ))}
          </datalist>
          {existingProcedureTypes.length === 0 && (
            <p className="text-[10px] text-[var(--tx-muted)] mt-1 italic">
              ยังไม่มีประเภทหัตถการใน be_courses — พิมพ์สร้างใหม่ได้ หรือ re-sync คอร์สจาก ProClinic ใน MasterDataTab (Phase 12.2b Step 3 มี field นี้)
            </p>
          )}
        </div>
      </div>

      {/* ── Row 3: pricing + VAT ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div data-field="salePrice">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">
            ราคาขาย <RequiredAsterisk />
          </label>
          <input type="number" step="0.01" min="0" value={form.salePrice ?? ''}
            onChange={(e) => updatePrice(e.target.value, form.isVatIncluded)}
            placeholder="กรอกราคาขาย"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
          <label className="flex items-center gap-2 text-xs text-[var(--tx-primary)] mt-1 cursor-pointer">
            <input type="checkbox" checked={!!form.isVatIncluded}
              onChange={(e) => updatePrice(form.salePrice ?? '', e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-emerald-500" />
            มีภาษีมูลค่าเพิ่ม (VAT 7%)
          </label>
        </div>
        <div data-field="salePriceInclVat">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">
            ราคาขาย (Inc. VAT)
          </label>
          <input type="number" step="0.01" min="0" value={form.salePriceInclVat ?? ''}
            onChange={(e) => update({ salePriceInclVat: e.target.value })}
            placeholder="กรอกราคาขาย"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
        <div data-field="deductCost">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">หักต้นทุนก่อนคำนวณค่ามือ</label>
          <input type="number" step="0.01" min="0" value={form.deductCost ?? ''}
            onChange={(e) => update({ deductCost: e.target.value })}
            placeholder="0.00"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
      </div>

      {/* ── Row 4: course type (4-radio picker) ── */}
      <div data-field="courseType" className="rounded-xl border border-[var(--bd)] p-3 bg-[var(--bg-hover)]">
        <p className="text-[11px] font-bold text-[var(--tx-muted)] mb-2 uppercase tracking-wider">ประเภทคอร์ส</p>
        <div className="space-y-2">
          {COURSE_TYPE_OPTIONS.map((t) => (
            <label key={t} className="flex items-start gap-2 cursor-pointer p-2 rounded-lg hover:bg-[var(--bg-base)]">
              <input type="radio" name="courseType" value={t} checked={form.courseType === t}
                onChange={() => update({ courseType: t })}
                className="mt-0.5 accent-[var(--accent)]" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-[var(--tx-primary)]">{t}</div>
                <div className="text-[10px] text-[var(--tx-muted)]">{COURSE_TYPE_DESC[t]}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* ── Row 5: main product picker (3/4 types) ── */}
      {showMainProduct && (
        <div data-field="mainProductId" className="rounded-xl border border-dashed border-[var(--bd)] p-3">
          <p className="text-[11px] font-bold text-[var(--tx-muted)] mb-2 uppercase tracking-wider">
            สินค้า / บริการหลัก <RequiredAsterisk />
          </p>
          {form.mainProductId ? (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] mb-2">
              <span className="flex-1 text-sm font-semibold text-[var(--tx-primary)] truncate">
                {form.mainProductName || form.mainProductId}
              </span>
              <button type="button" onClick={() => update({ mainProductId: '', mainProductName: '' })}
                className="p-1 text-red-400 hover:bg-red-900/20 rounded" aria-label="ลบสินค้าหลัก">
                <Trash2 size={12} />
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--tx-muted)] pointer-events-none" />
                <input type="text" value={mainPickerQuery} onChange={(e) => setMainPickerQuery(e.target.value)}
                  placeholder="ค้นหาสินค้า/บริการ"
                  className="w-full pl-7 pr-3 py-2 rounded-lg text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
              </div>
              {filteredMainPicker.length > 0 && (
                <div className="max-h-32 overflow-y-auto mt-1 space-y-0.5">
                  {filteredMainPicker.map((p) => {
                    const pid = String(p.productId || p.id || '');
                    return (
                      <button key={pid} type="button" onClick={() => pickMain(p)}
                        className="w-full text-left text-xs px-2 py-1 rounded hover:bg-[var(--bg-hover)]">
                        {p.productName}
                        {p.mainUnitName && <span className="text-[var(--tx-muted)]"> ({p.mainUnitName})</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Qty fields: gated by course type */}
          {(showMainQty || showQtyPerTime || showMinMax) && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
              {showMainQty && (
                <div data-field="mainQty">
                  <label className="block text-[10px] text-[var(--tx-muted)] mb-1">จำนวน</label>
                  <input type="number" step="0.01" min="0" value={form.mainQty ?? ''}
                    onChange={(e) => update({ mainQty: e.target.value })}
                    placeholder="กรอกจำนวน"
                    className="w-full px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)]" />
                </div>
              )}
              {showQtyPerTime && (
                <div data-field="qtyPerTime">
                  <label className="block text-[10px] text-[var(--tx-muted)] mb-1">จำนวนที่ใช้ต่อครั้ง</label>
                  <input type="number" step="0.01" min="0" value={form.qtyPerTime ?? ''}
                    onChange={(e) => update({ qtyPerTime: e.target.value })}
                    placeholder="ต่อครั้ง"
                    className="w-full px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)]" />
                </div>
              )}
              {showMinMax && (
                <>
                  <div data-field="minQty">
                    <label className="block text-[10px] text-[var(--tx-muted)] mb-1">ต่ำสุดที่เลือกได้</label>
                    <input type="number" step="0.01" min="0" value={form.minQty ?? ''}
                      onChange={(e) => update({ minQty: e.target.value })}
                      placeholder="0"
                      className="w-full px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)]" />
                  </div>
                  <div data-field="maxQty">
                    <label className="block text-[10px] text-[var(--tx-muted)] mb-1">สูงสุดที่เลือกได้</label>
                    <input type="number" step="0.01" min="0" value={form.maxQty ?? ''}
                      onChange={(e) => update({ maxQty: e.target.value })}
                      placeholder="ไม่จำกัด"
                      className="w-full px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)]" />
                  </div>
                </>
              )}
            </div>
          )}

          {isRealQtyCourse(form.courseType) && (
            <p className="text-[10px] text-amber-400 mt-2 italic">
              เหมาตามจริง: ไม่ต้องกรอกจำนวนล่วงหน้า — แพทย์จะระบุตอนทำการรักษา
            </p>
          )}
          {isBuffetCourse(form.courseType) && (
            <p className="text-[10px] text-sky-400 mt-2 italic">
              บุฟเฟ่ต์: ใช้ไม่จำกัดจนกว่าจะครบกำหนดระยะเวลา (ดูระยะเวลาทำซ้ำด้านล่าง)
            </p>
          )}
        </div>
      )}

      {isPickAtTreatmentCourse(form.courseType) && (
        <div className="rounded-xl border border-dashed border-[var(--bd)] p-3 text-xs text-[var(--tx-muted)] italic">
          เลือกสินค้าตามจริง: จะเลือกสินค้า/บริการได้ตอนทำการรักษา — ไม่ต้องกำหนดล่วงหน้า
        </div>
      )}

      {/* ── Row 6: duration ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div data-field="daysBeforeExpire">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">
            ระยะเวลาใช้งาน / วันหมดอายุ (วัน)
            {isBuffetCourse(form.courseType) && (
              <span className="ml-1 text-[10px] text-violet-400 normal-case italic">* บุฟเฟต์ใช้ได้จนครบกำหนด</span>
            )}
          </label>
          <input type="number" min="0" value={form.daysBeforeExpire ?? ''}
            onChange={(e) => update({ daysBeforeExpire: e.target.value })}
            placeholder={isBuffetCourse(form.courseType) ? 'เช่น 365 (1 ปี)' : 'ไม่จำกัด'}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)]" />
          <p className="text-[10px] text-[var(--tx-muted)] mt-1 italic">นับจากวันที่ลูกค้าซื้อคอร์ส</p>
        </div>
        <div data-field="period">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ระยะเวลาทำซ้ำ (วัน)</label>
          <input type="number" min="0" value={form.period ?? ''}
            onChange={(e) => update({ period: e.target.value })}
            placeholder="ไม่จำกัด"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)]" />
          <p className="text-[10px] text-[var(--tx-muted)] mt-1 italic">ระยะห่างขั้นต่ำระหว่างการใช้แต่ละครั้ง</p>
        </div>
        <div data-field="time">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">เวลา (นาที)</label>
          <input type="number" min="0" value={form.time ?? ''}
            onChange={(e) => update({ time: e.target.value })}
            placeholder="0"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)]" />
        </div>
      </div>

      {/* ── Row 7: secondary products table (รายการสินค้าอื่นๆ) ── */}
      <div data-field="courseProducts" className="rounded-xl border border-[var(--bd)] p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold text-[var(--tx-muted)] uppercase tracking-wider">รายการสินค้าอื่นๆ</p>
          <span className="text-[10px] text-[var(--tx-muted)]">{(form.courseProducts || []).length} รายการ</span>
        </div>

        <div className="relative mb-2">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--tx-muted)] pointer-events-none" />
          <input type="text" value={subPickerQuery} onChange={(e) => setSubPickerQuery(e.target.value)}
            placeholder="ค้นหาสินค้าเพื่อเพิ่ม"
            className="w-full pl-7 pr-3 py-2 rounded-lg text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
        {subPickerQuery && filteredSubPicker.length > 0 && (
          <div className="max-h-28 overflow-y-auto mb-2 space-y-0.5">
            {filteredSubPicker.map((p) => {
              const pid = String(p.productId || p.id || '');
              const already = (form.courseProducts || []).some((x) => x.productId === pid);
              return (
                <button key={pid} type="button" disabled={already} onClick={() => addSubProduct(p)}
                  className={`w-full text-left text-xs px-2 py-1 rounded ${already ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[var(--bg-hover)]'}`}>
                  {p.productName}
                  {p.mainUnitName && <span className="text-[var(--tx-muted)]"> ({p.mainUnitName})</span>}
                </button>
              );
            })}
          </div>
        )}

        {(form.courseProducts || []).length === 0 ? (
          <p className="text-xs text-[var(--tx-muted)] italic text-center py-3">
            ยังไม่มีสินค้าอื่น ๆ — ค้นหาด้านบนเพื่อเพิ่ม
          </p>
        ) : (
          <div className="space-y-1.5">
            {/* Header — Phase 12.2b follow-up (2026-04-24): grid template
                 pinned so header cells match content cells column-for-column.
                 Previous `auto` column + `w-20` header override caused the
                 FLAGS column to size differently between rows (header 80px,
                 content ~180px) → misaligned headers the user flagged as
                 "ช่องกับคำบรรยายไม่ตรง". Fixed width 200px fits 3 checkbox
                 labels + trash button; header label "FLAGS" centered in
                 the same 200px slot. */}
            <div className="grid grid-cols-[1fr_70px_70px_70px_200px] gap-1 text-[9px] text-[var(--tx-muted)] uppercase tracking-wider px-2">
              <div>สินค้า</div>
              <div className="text-right">ต่อครั้ง</div>
              <div className="text-right">ต่ำสุด</div>
              <div className="text-right">สูงสุด</div>
              <div className="text-center">flags</div>
            </div>
            {(form.courseProducts || []).map((item) => (
              <div key={item.productId}
                className="grid grid-cols-[1fr_70px_70px_70px_200px] gap-1 items-center p-2 rounded bg-[var(--bg-hover)] border border-[var(--bd)]">
                <div className="min-w-0 truncate text-xs font-semibold text-[var(--tx-primary)]">
                  {item.productName || item.productId}
                </div>
                <input type="number" step="0.01" min="0" value={item.qty ?? item.qtyPerTime ?? ''}
                  onChange={(e) => updateSubProduct(item.productId, { qty: Number(e.target.value) || 0 })}
                  className="w-full px-1.5 py-1 rounded text-xs text-right bg-[var(--bg-base)] border border-[var(--bd)] text-[var(--tx-primary)]" />
                <input type="number" step="0.01" min="0" value={item.minQty ?? ''}
                  onChange={(e) => updateSubProduct(item.productId, { minQty: e.target.value })}
                  placeholder="-"
                  className="w-full px-1.5 py-1 rounded text-xs text-right bg-[var(--bg-base)] border border-[var(--bd)] text-[var(--tx-primary)]" />
                <input type="number" step="0.01" min="0" value={item.maxQty ?? ''}
                  onChange={(e) => updateSubProduct(item.productId, { maxQty: e.target.value })}
                  placeholder="-"
                  className="w-full px-1.5 py-1 rounded text-xs text-right bg-[var(--bg-base)] border border-[var(--bd)] text-[var(--tx-primary)]" />
                <div className="flex items-center justify-center gap-1.5">
                  <label className="flex items-center gap-0.5 cursor-pointer" title="บังคับเลือก">
                    <input type="checkbox" checked={!!item.isRequired}
                      onChange={(e) => updateSubProduct(item.productId, { isRequired: e.target.checked })}
                      className="w-3 h-3 accent-amber-500" />
                    <span className="text-[9px] text-[var(--tx-muted)]">บังคับ</span>
                  </label>
                  <label className="flex items-center gap-0.5 cursor-pointer" title="มีค่ามือ">
                    <input type="checkbox" checked={!!item.isDf}
                      onChange={(e) => updateSubProduct(item.productId, { isDf: e.target.checked })}
                      className="w-3 h-3 accent-emerald-500" />
                    <span className="text-[9px] text-[var(--tx-muted)]">DF</span>
                  </label>
                  <label className="flex items-center gap-0.5 cursor-pointer" title="ซ่อนการแสดงผล">
                    <input type="checkbox" checked={!!item.isHidden}
                      onChange={(e) => updateSubProduct(item.productId, { isHidden: e.target.checked })}
                      className="w-3 h-3 accent-gray-400" />
                    <span className="text-[9px] text-[var(--tx-muted)]">ซ่อน</span>
                  </label>
                  <button type="button" onClick={() => removeSubProduct(item.productId)}
                    aria-label={`ลบสินค้า ${item.productName || item.productId}`}
                    className="p-0.5 text-red-400 hover:bg-red-900/20 rounded">
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Row 8: usage scope + DF flags ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div data-field="usageType" className="rounded-xl border border-[var(--bd)] p-3 bg-[var(--bg-hover)]">
          <p className="text-[11px] font-bold text-[var(--tx-muted)] mb-2 uppercase tracking-wider">การใช้งาน</p>
          <div className="space-y-1.5">
            {USAGE_TYPE_OPTIONS.map((u) => (
              <label key={u} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="usageType" value={u} checked={form.usageType === u}
                  onChange={() => update({ usageType: u })} className="accent-[var(--accent)]" />
                <span className="text-sm text-[var(--tx-primary)]">{u}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--bd)] p-3 bg-[var(--bg-hover)]">
          <p className="text-[11px] font-bold text-[var(--tx-muted)] mb-2 uppercase tracking-wider">ค่ามือ (DF)</p>
          <label className="flex items-center gap-2 cursor-pointer mb-1">
            <input type="checkbox" checked={!!form.isDf}
              onChange={(e) => update({ isDf: e.target.checked })}
              className="w-4 h-4 rounded accent-emerald-500" />
            <span className="text-sm text-[var(--tx-primary)]">มีค่ามือ</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer mb-1">
            <input type="checkbox" checked={!!form.dfEditableGlobal}
              onChange={(e) => update({ dfEditableGlobal: e.target.checked })}
              className="w-4 h-4 rounded accent-amber-500" />
            <span className="text-sm text-[var(--tx-primary)]">อนุญาตให้ทุกคนแก้ไขค่ามือได้เสมอ</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!form.isHidden}
              onChange={(e) => update({ isHidden: e.target.checked })}
              className="w-4 h-4 rounded accent-gray-400" />
            <span className="text-sm text-[var(--tx-primary)]">ซ่อนการขาย</span>
          </label>
        </div>
      </div>

      {/* ── Row 9: status + order ── */}
      <div className="grid grid-cols-2 gap-3">
        <div data-field="status">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">สถานะ</label>
          <div className="flex gap-4">
            {STATUS_OPTIONS.map((s) => (
              <label key={s} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="status" value={s} checked={form.status === s}
                  onChange={() => update({ status: s })} className="accent-[var(--accent)]" />
                <span className="text-sm text-[var(--tx-primary)]">{s}</span>
              </label>
            ))}
          </div>
        </div>
        <div data-field="orderBy">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ลำดับการแสดง</label>
          <input type="number" min="0" value={form.orderBy ?? ''}
            onChange={(e) => update({ orderBy: e.target.value })}
            placeholder="0"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
      </div>
    </MarketingFormShell>
  );
}
