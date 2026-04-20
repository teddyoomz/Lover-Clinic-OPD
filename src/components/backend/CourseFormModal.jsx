// ─── Course Form Modal — Phase 12.2 CRUD ───────────────────────────────────
// Core course fields + sub-items picker (products deducted per use). Product
// picker sources from be_products.

import { useState, useCallback, useEffect } from 'react';
import MarketingFormShell from './MarketingFormShell.jsx';
import { saveCourse, listProducts } from '../../lib/backendClient.js';
import {
  STATUS_OPTIONS,
  validateCourse, emptyCourseForm, generateCourseId,
} from '../../lib/courseValidation.js';
import { scrollToField } from '../../lib/marketingUiUtils.js';
import { Trash2 } from 'lucide-react';

export default function CourseFormModal({ course, onClose, onSaved, clinicSettings }) {
  const isEdit = !!course;
  const [form, setForm] = useState(() => course ? { ...emptyCourseForm(), ...course, courseProducts: course.courseProducts || [] } : emptyCourseForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [products, setProducts] = useState([]);
  const [pickerQuery, setPickerQuery] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setProducts(await listProducts());
      } catch (e) {
        setError(e.message || 'โหลดรายการสินค้าล้มเหลว');
      }
    })();
  }, []);

  const update = useCallback((patch) => setForm(prev => ({ ...prev, ...patch })), []);

  const addProduct = (p) => {
    const pid = p.productId || p.id;
    setForm(prev => {
      if ((prev.courseProducts || []).some(x => x.productId === pid)) return prev;
      return {
        ...prev,
        courseProducts: [...(prev.courseProducts || []), { productId: pid, productName: p.productName, qty: 1 }],
      };
    });
  };

  const removeProduct = (pid) => {
    setForm(prev => ({
      ...prev,
      courseProducts: (prev.courseProducts || []).filter(x => x.productId !== pid),
    }));
  };

  const updateProductQty = (pid, qty) => {
    setForm(prev => ({
      ...prev,
      courseProducts: (prev.courseProducts || []).map(x =>
        x.productId === pid ? { ...x, qty: Number(qty) || 0 } : x),
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

  const filteredPicker = products.filter(p => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return true;
    return (p.productName || '').toLowerCase().includes(q);
  }).slice(0, 50);

  return (
    <MarketingFormShell
      isEdit={isEdit}
      titleCreate="เพิ่มคอร์ส"
      titleEdit="แก้ไขคอร์ส"
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      error={error}
      maxWidth="3xl"
      bodySpacing={4}
      clinicSettings={clinicSettings}
    >
      {/* Name + receipt name */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div data-field="courseName">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">
            ชื่อคอร์ส <span className="text-red-400">*</span>
          </label>
          <input type="text" value={form.courseName} onChange={(e) => update({ courseName: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
        <div data-field="receiptCourseName">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ชื่อที่แสดงในใบเสร็จ</label>
          <input type="text" value={form.receiptCourseName} onChange={(e) => update({ receiptCourseName: e.target.value })}
            placeholder="เว้นว่างเพื่อใช้ชื่อคอร์ส"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
      </div>

      {/* Code + category */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div data-field="courseCode">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">รหัส</label>
          <input type="text" value={form.courseCode} onChange={(e) => update({ courseCode: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
        <div data-field="courseCategory">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">หมวดหมู่</label>
          <input type="text" value={form.courseCategory} onChange={(e) => update({ courseCategory: e.target.value })}
            placeholder="เช่น Laser / IV Drip"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
      </div>

      {/* Pricing */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div data-field="salePrice">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ราคาขาย</label>
          <input type="number" step="0.01" min="0" value={form.salePrice ?? ''} onChange={(e) => update({ salePrice: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
        <div data-field="salePriceInclVat">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ราคารวม VAT</label>
          <input type="number" step="0.01" min="0" value={form.salePriceInclVat ?? ''} onChange={(e) => update({ salePriceInclVat: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
        <div data-field="time">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">เวลา (นาที)</label>
          <input type="number" min="0" value={form.time ?? ''} onChange={(e) => update({ time: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
      </div>

      {/* Type + usage + VAT + status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div data-field="courseType">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ชนิดคอร์ส</label>
          <input type="text" value={form.courseType} onChange={(e) => update({ courseType: e.target.value })}
            placeholder="เช่น คอร์สครั้ง / คอร์สเดือน"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
        <div data-field="usageType">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ประเภทการใช้</label>
          <input type="text" value={form.usageType} onChange={(e) => update({ usageType: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-[var(--tx-primary)] cursor-pointer">
          <input type="checkbox" checked={!!form.isVatIncluded} onChange={(e) => update({ isVatIncluded: e.target.checked })} className="w-4 h-4 rounded accent-emerald-500" />
          ราคารวม VAT แล้ว
        </label>
      </div>

      {/* Sub-items */}
      <div data-field="courseProducts" className="rounded-xl border border-[var(--bd)] p-3">
        <p className="text-[11px] font-bold text-[var(--tx-muted)] mb-2 uppercase tracking-wider">สินค้าที่ใช้ต่อครั้ง</p>

        {(form.courseProducts || []).length === 0 ? (
          <p className="text-xs text-[var(--tx-muted)] italic mb-2">ยังไม่ได้เลือก — เลือกด้านล่าง</p>
        ) : (
          <div className="space-y-1 mb-2">
            {(form.courseProducts || []).map(item => (
              <div key={item.productId} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate text-[var(--tx-primary)]">{item.productName || item.productId}</span>
                <input type="number" step="0.01" min="0" value={item.qty}
                  onChange={(e) => updateProductQty(item.productId, e.target.value)}
                  className="w-20 px-2 py-1 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
                <button type="button" onClick={() => removeProduct(item.productId)}
                  aria-label={`ลบสินค้า ${item.productName || item.productId} จากคอร์ส`}
                  className="p-1 rounded hover:bg-red-900/20 text-red-400">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <input type="text" value={pickerQuery} onChange={(e) => setPickerQuery(e.target.value)}
          placeholder="ค้นหาสินค้าเพื่อเพิ่ม..."
          className="w-full px-3 py-2 rounded-lg text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)] mb-1" />
        <div className="max-h-32 overflow-y-auto space-y-0.5">
          {filteredPicker.map(p => {
            const pid = p.productId || p.id;
            const already = (form.courseProducts || []).some(x => x.productId === pid);
            return (
              <button key={pid} type="button" disabled={already} onClick={() => addProduct(p)}
                className={`w-full text-left text-xs px-2 py-1 rounded ${already ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[var(--bg-hover)]'}`}>
                {p.productName} {p.mainUnitName ? <span className="text-[var(--tx-muted)]">({p.mainUnitName})</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Status + order */}
      <div className="grid grid-cols-2 gap-3">
        <div data-field="status">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">สถานะ</label>
          <select value={form.status} onChange={(e) => update({ status: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]">
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div data-field="orderBy">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ลำดับการแสดง</label>
          <input type="number" min="0" value={form.orderBy ?? ''} onChange={(e) => update({ orderBy: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
      </div>
    </MarketingFormShell>
  );
}
