// ─── DF Group Form Modal — Phase 13.3.3 ──────────────────────────────────
// Matrix editor for DF rates per course. Rule E/H clean.

import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Search } from 'lucide-react';
import MarketingFormShell from './MarketingFormShell.jsx';
import { saveDfGroup, getAllMasterDataItems } from '../../lib/backendClient.js';
import {
  emptyDfGroupForm, generateDfGroupId, validateDfGroupStrict, normalizeDfGroup,
  STATUS_OPTIONS, RATE_TYPES, RATE_TYPE_LABEL,
} from '../../lib/dfGroupValidation.js';
import { scrollToField } from '../../lib/marketingUiUtils.js';

export default function DfGroupFormModal({ group, onClose, onSaved, clinicSettings }) {
  const isEdit = !!group;
  const [form, setForm] = useState(() => ({ ...emptyDfGroupForm(), ...(group || {}) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [courses, setCourses] = useState([]);
  const [courseQuery, setCourseQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    getAllMasterDataItems('courses').catch(() => [])
      .then((c) => { if (!cancelled) setCourses(c || []); });
    return () => { cancelled = true; };
  }, []);

  const takenCourseIds = useMemo(() => new Set((form.rates || []).map((r) => String(r.courseId))), [form.rates]);
  const availablePool = useMemo(() => {
    const q = courseQuery.trim().toLowerCase();
    const pool = courses.filter((c) => !takenCourseIds.has(String(c.id)));
    if (!q) return pool.slice(0, 20);
    return pool.filter((c) =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.category || '').toLowerCase().includes(q)
    ).slice(0, 20);
  }, [courses, takenCourseIds, courseQuery]);

  const addRate = (course) => {
    setForm((prev) => ({
      ...prev,
      rates: [...(prev.rates || []), {
        courseId: course.id, courseName: course.name || '',
        value: 0, type: 'baht',
      }],
    }));
    setCourseQuery('');
  };

  const updateRate = (idx, patch) => {
    setForm((prev) => ({
      ...prev,
      rates: prev.rates.map((r, i) => i === idx ? { ...r, ...patch } : r),
    }));
  };

  const removeRate = (idx) => {
    setForm((prev) => ({ ...prev, rates: prev.rates.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    setError('');
    const normalized = normalizeDfGroup(form);
    const fail = validateDfGroupStrict(normalized);
    if (fail) {
      setError(fail[1]);
      scrollToField(fail[0]);
      return;
    }
    setSaving(true);
    try {
      const id = isEdit ? (group.groupId || group.id) : generateDfGroupId();
      await saveDfGroup(id, {
        ...normalized,
        createdAt: isEdit ? (group.createdAt || new Date().toISOString()) : new Date().toISOString(),
      });
      onSaved?.();
    } catch (e) {
      setError(e.message || 'บันทึกไม่สำเร็จ');
    } finally { setSaving(false); }
  };

  return (
    <MarketingFormShell
      isEdit={isEdit}
      titleCreate="สร้างกลุ่ม DF ใหม่"
      titleEdit="แก้ไขกลุ่ม DF"
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      error={error}
      maxWidth="4xl"
      bodySpacing={5}
      clinicSettings={clinicSettings}
    >
      {/* Header fields */}
      <section className="space-y-3">
        <div data-field="name">
          <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">
            ชื่อกลุ่ม <span className="text-red-500">*</span>
          </label>
          <input type="text" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="เช่น กลุ่มแพทย์ A"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] focus:outline-none focus:border-[var(--accent)]" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div data-field="status">
            <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">สถานะ</label>
            <select value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)]">
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s === 'active' ? 'ใช้งาน' : 'พักใช้งาน'}</option>
              ))}
            </select>
          </div>
          <div data-field="note">
            <label className="block text-xs font-semibold text-[var(--tx-muted)] mb-1.5">หมายเหตุ</label>
            <input type="text" value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="(ถ้ามี)"
              className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)]" />
          </div>
        </div>
      </section>

      {/* Rate matrix */}
      <section className="space-y-3" data-field="rates">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--tx-muted)]">
            อัตราค่ามือต่อคอร์ส
          </h3>
          <span className="text-[10px] text-[var(--tx-muted)]">{(form.rates || []).length} รายการ</span>
        </div>

        {/* Course picker */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tx-muted)] pointer-events-none" />
          <input type="text" value={courseQuery}
            onChange={(e) => setCourseQuery(e.target.value)}
            placeholder="ค้นหาคอร์สเพื่อเพิ่มอัตรา"
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
        {availablePool.length > 0 && (
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1">
            {availablePool.map((c) => (
              <button key={c.id} type="button" onClick={() => addRate(c)}
                className="px-2 py-1 rounded-full text-[11px] bg-[var(--bg-hover)] border border-[var(--bd)] hover:border-[var(--accent)] flex items-center gap-1">
                <Plus size={10} /> {c.name || c.id}
              </button>
            ))}
          </div>
        )}

        {/* Rate rows */}
        {(form.rates || []).length > 0 && (
          <div className="space-y-1.5" data-testid="df-rate-list">
            {form.rates.map((r, idx) => (
              <div key={`${r.courseId}-${idx}`}
                className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--bd)]">
                <span className="col-span-6 text-sm truncate" title={r.courseName || r.courseId}>
                  {r.courseName || r.courseId}
                </span>
                <input type="number" min="0" step="0.01" value={r.value}
                  onChange={(e) => updateRate(idx, { value: Math.max(0, Number(e.target.value) || 0) })}
                  className="col-span-3 px-2 py-1 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)]"
                  data-testid={`df-rate-value-${idx}`} />
                <select value={r.type}
                  onChange={(e) => updateRate(idx, { type: e.target.value })}
                  className="col-span-2 px-2 py-1 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)]"
                  data-testid={`df-rate-type-${idx}`}>
                  {RATE_TYPES.map((t) => <option key={t} value={t}>{RATE_TYPE_LABEL[t]}</option>)}
                </select>
                <button type="button" onClick={() => removeRate(idx)}
                  aria-label={`ลบอัตรา ${r.courseName || r.courseId}`}
                  className="col-span-1 justify-self-center p-1 text-red-400 hover:bg-red-900/20 rounded">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </MarketingFormShell>
  );
}
