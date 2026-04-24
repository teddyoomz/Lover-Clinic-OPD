// ─── DF Entry Modal — Phase 14.3 ──────────────────────────────────────────
// Mirrors ProClinic's #addDfModal / #editDfModal from
// /admin/treatment/{id}/edit (Triangle capture 2026-04-24 via opd.js flow).
//
// UX rules (per df-modal-brief-phase14.md):
//   - Doctor dropdown pre-fills dfGroupId from doctor.defaultDfGroupId
//   - Changing doctor OR group refetches default rows (client-side resolver
//     mirrors ProClinic's hidden /admin/df/calculate2; see Phase 13.3)
//   - ADD mode blocks doctors who already have a DF entry on this treatment
//     (ProClinic shows "แพทย์/ผู้ช่วยแพทย์คนดังกล่าวถูกเลือกแล้ว" toast)
//   - EDIT mode allows changing rows + group but doctorId is fixed
//   - Per-row fields: checkbox (enabled) + number input (value) + toggle baht/%
//
// This component is a pure VIEW — it does NOT write Firestore itself.
// The parent (TreatmentFormPage, Phase 14.4) holds the dfEntries[] state
// and decides when to persist via saveTreatment.

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Calculator, AlertCircle } from 'lucide-react';
import MarketingFormShell from './MarketingFormShell.jsx';
import {
  validateDfEntry, normalizeDfEntry, emptyDfEntry,
  generateDfEntryId, buildDefaultRows, isDoctorAlreadyEntered,
} from '../../lib/dfEntryValidation.js';
import { getRateForStaffCourse, RATE_TYPES } from '../../lib/dfGroupValidation.js';
import { scrollToField } from '../../lib/marketingUiUtils.js';

/**
 * @param {object} props
 * @param {object|null} props.entry — existing DF entry for edit mode; null/undefined for add
 * @param {Array<{courseId, courseName}>} props.treatmentCourses — courses selected on the treatment (rows source)
 * @param {Array<{id, name, position, defaultDfGroupId}>} props.people — combined doctors + assistants (option.doctors + option.assistants from TreatmentFormPage)
 * @param {Array<{id, groupId, name}>} props.dfGroups — from listDfGroups()
 * @param {Array} props.staffRates — be_df_staff_rates docs for resolver override
 * @param {Array} props.existingEntries — already-added entries on this treatment (for dup-guard)
 * @param {(entry: object) => void} props.onSave
 * @param {() => void} props.onClose
 * @param {object} [props.clinicSettings]
 */
export default function DfEntryModal({
  entry,
  treatmentCourses = [],
  people = [],
  dfGroups = [],
  staffRates = [],
  existingEntries = [],
  onSave,
  onClose,
  clinicSettings,
}) {
  const isEdit = !!entry;
  const [form, setForm] = useState(() => (entry ? { ...emptyDfEntry(), ...entry } : emptyDfEntry()));
  const [error, setError] = useState('');
  const [dupWarn, setDupWarn] = useState(false);

  const peopleById = useMemo(() => {
    const m = new Map();
    for (const p of people || []) m.set(String(p.id), p);
    return m;
  }, [people]);

  // Memoize the resolver invocation so rows rebuild with a stable reference.
  const resolveRows = useCallback((doctorId, dfGroupId) => {
    return buildDefaultRows(
      treatmentCourses,
      doctorId,
      dfGroupId,
      dfGroups,
      staffRates,
      getRateForStaffCourse,
    );
  }, [treatmentCourses, dfGroups, staffRates]);

  // On ADD mode mount with no rows yet but doctor + group already chosen,
  // populate defaults. In EDIT mode the existing rows are authoritative.
  useEffect(() => {
    if (isEdit) return;
    if (form.doctorId && form.dfGroupId && (!form.rows || form.rows.length === 0)) {
      setForm((prev) => ({ ...prev, rows: resolveRows(prev.doctorId, prev.dfGroupId) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDoctorChange = (doctorId) => {
    setError('');
    const picked = peopleById.get(String(doctorId));
    const doctorName = picked?.name || '';
    // Dup-guard (ADD only): don't block the state change — we warn + disable save.
    const isDup = !isEdit && isDoctorAlreadyEntered(doctorId, existingEntries);
    setDupWarn(isDup);
    // Phase 12.2b Step 5 (2026-04-24): resolve inside the setForm updater so
    // we read the LATEST dfGroupId from React's state pipeline rather than
    // the closure value from the render that created this handler. Guards
    // against rapid successive changes (doctor → group in same tick) where
    // the closure `form.dfGroupId` would be stale.
    setForm((prev) => {
      const defaultGroupId = picked?.defaultDfGroupId || prev.dfGroupId || '';
      const nextRows = resolveRows(doctorId, defaultGroupId);
      return { ...prev, doctorId, doctorName, dfGroupId: defaultGroupId, rows: nextRows };
    });
  };

  const handleGroupChange = (dfGroupId) => {
    setError('');
    // Phase 12.2b Step 5 (2026-04-24): same setForm-updater treatment as
    // handleDoctorChange — read doctorId from prev so a rapid doctor-then-
    // group change can't resolve against a stale doctorId (user-reported
    // bug: "เปลี่ยน group แล้วค่ามือไม่แสดง" = rates didn't refresh because
    // resolveRows was called with empty doctorId during a batched update).
    setForm((prev) => {
      const nextRows = resolveRows(prev.doctorId, dfGroupId);
      return { ...prev, dfGroupId, rows: nextRows };
    });
  };

  const updateRow = (courseId, patch) => {
    setForm((prev) => ({
      ...prev,
      rows: (prev.rows || []).map((r) => (String(r.courseId) === String(courseId) ? { ...r, ...patch } : r)),
    }));
  };

  const recalcRows = () => {
    setForm((prev) => ({ ...prev, rows: resolveRows(prev.doctorId, prev.dfGroupId) }));
  };

  const handleSave = () => {
    setError('');
    if (dupWarn) {
      setError('แพทย์ / ผู้ช่วยแพทย์คนดังกล่าวมีรายการค่ามืออยู่แล้ว — แก้ไขรายการเดิมแทน');
      return;
    }
    const prepared = {
      ...form,
      id: form.id || generateDfEntryId(),
      doctorName: form.doctorName || (peopleById.get(String(form.doctorId))?.name || ''),
    };
    const normalized = normalizeDfEntry(prepared);
    const fail = validateDfEntry(normalized);
    if (fail) {
      const [field, msg] = fail;
      setError(msg);
      scrollToField(field);
      return;
    }
    onSave?.(normalized);
  };

  const enabledCount = (form.rows || []).filter((r) => r.enabled).length;

  return (
    <MarketingFormShell
      isEdit={isEdit}
      titleCreate="เพิ่มค่ามือแพทย์ & ผู้ช่วยแพทย์"
      titleEdit="แก้ไขค่ามือแพทย์ & ผู้ช่วยแพทย์"
      onClose={onClose}
      onSave={handleSave}
      error={error}
      maxWidth="2xl"
      bodySpacing={4}
      createLabel="ยืนยัน"
      editLabel="บันทึก"
      clinicSettings={clinicSettings}
    >
      {/* Doctor + Group picker row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div data-field="doctorId">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">
            แพทย์ / ผู้ช่วยแพทย์ <span className="text-red-400">*</span>
          </label>
          <select
            value={form.doctorId}
            onChange={(e) => handleDoctorChange(e.target.value)}
            disabled={isEdit}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-70"
          >
            <option value="">— เลือก —</option>
            {(people || []).map((p) => (
              <option key={p.id} value={p.id}>{p.name || p.id}{p.position ? ` · ${p.position}` : ''}</option>
            ))}
          </select>
          {isEdit && (
            <p className="text-[10px] text-[var(--tx-muted)] mt-1 italic">แก้ไขไม่ได้ — ต้องลบแล้วเพิ่มใหม่ถ้าจะเปลี่ยนคน</p>
          )}
          {dupWarn && (
            <div className="flex items-start gap-1.5 mt-2 text-xs text-red-400">
              <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
              <span>แพทย์ / ผู้ช่วยแพทย์คนนี้มีรายการค่ามืออยู่แล้วบน treatment นี้</span>
            </div>
          )}
        </div>

        <div data-field="dfGroupId">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">
            กลุ่มค่ามือ <span className="text-red-400">*</span>
          </label>
          <select
            value={form.dfGroupId}
            onChange={(e) => handleGroupChange(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="">— เลือกกลุ่ม —</option>
            {(dfGroups || []).map((g) => {
              const gid = g.groupId || g.id;
              return <option key={gid} value={gid}>{g.name || gid}</option>;
            })}
          </select>
          {dfGroups.length === 0 && (
            <p className="text-[10px] text-[var(--tx-muted)] mt-1 italic">ยังไม่มีกลุ่มค่ามือ — สร้างที่ "ข้อมูลพื้นฐาน → กลุ่มค่ามือ"</p>
          )}
        </div>
      </div>

      {/* Rows section */}
      <div data-field="rows" className="rounded-xl border border-[var(--bd)] p-3 bg-[var(--bg-hover)]">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold text-[var(--tx-muted)] uppercase tracking-wider">
            ค่ามือต่อคอร์ส <span className="text-[10px] normal-case text-[var(--tx-muted)]">({enabledCount}/{form.rows?.length || 0} เลือก)</span>
          </p>
          <button
            type="button"
            onClick={recalcRows}
            disabled={!form.doctorId || !form.dfGroupId}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] bg-[var(--bg-base)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-[var(--accent)] disabled:opacity-40"
          >
            <Calculator size={11} /> คำนวณใหม่
          </button>
        </div>

        {(!form.rows || form.rows.length === 0) ? (
          <p className="text-xs text-[var(--tx-muted)] italic text-center py-4">
            {form.doctorId && form.dfGroupId
              ? 'ไม่พบคอร์สบน treatment นี้ — เพิ่มคอร์สที่ "รายการคอร์ส" ก่อน'
              : 'เลือกแพทย์ + กลุ่ม เพื่อคำนวณอัตโนมัติ'}
          </p>
        ) : (
          <div className="space-y-1.5">
            {form.rows.map((r) => (
              <div
                key={r.courseId}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[var(--bg-base)] border border-[var(--bd)]"
              >
                <input
                  type="checkbox"
                  checked={!!r.enabled}
                  onChange={(e) => updateRow(r.courseId, { enabled: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500 flex-shrink-0"
                  aria-label={`เปิด/ปิด ${r.courseName || r.courseId}`}
                />
                <span className="flex-1 min-w-0 truncate text-xs font-semibold text-[var(--tx-primary)]">
                  {r.courseName || r.courseId}
                  {r.source && (
                    <span className="ml-1.5 text-[9px] text-[var(--tx-muted)] italic">
                      ({r.source === 'staff' ? 'override ส่วนบุคคล' : 'จากกลุ่ม'})
                    </span>
                  )}
                  {/* Phase 12.2b Step 5 (2026-04-24): explain why an
                      otherwise-enabled course shows value 0 after a group
                      switch — it genuinely has no rate in the new group.
                      Was the source of the "ค่ามือกลุ่มอื่นไม่แสดง" bug
                      report: switching worked but user expected a rate
                      that doesn't exist. */}
                  {!r.source && form.doctorId && form.dfGroupId && (
                    <span className="ml-1.5 text-[9px] text-amber-400 italic">
                      (ไม่มีอัตราในกลุ่มนี้)
                    </span>
                  )}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={r.value ?? 0}
                  onChange={(e) => updateRow(r.courseId, { value: e.target.value })}
                  disabled={!r.enabled}
                  className="w-24 px-2 py-1 rounded text-right text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] disabled:opacity-40"
                />
                <select
                  value={r.type}
                  onChange={(e) => updateRow(r.courseId, { type: e.target.value })}
                  disabled={!r.enabled}
                  className="px-1.5 py-1 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] disabled:opacity-40"
                >
                  {RATE_TYPES.map((t) => (
                    <option key={t} value={t}>{t === 'baht' ? 'บาท' : '%'}</option>
                  ))}
                </select>
                {/* Phase 12.2b follow-up (2026-04-24): show the computed
                    baht amount when rate is percent so the doctor/admin
                    can see how much they're actually earning without
                    mental math. Uses course.price from treatmentCourses
                    prop (TreatmentFormPage passes full course price). */}
                {r.enabled && r.type === 'percent' && (() => {
                  const tc = (treatmentCourses || []).find((c) => String(c.courseId) === String(r.courseId));
                  const priceNum = Number(tc?.price) || 0;
                  const rateNum = Number(r.value) || 0;
                  const amount = priceNum * rateNum / 100;
                  return (
                    <span
                      className="text-[11px] font-mono text-emerald-400 tabular-nums whitespace-nowrap w-20 text-right"
                      title={`${rateNum}% × ฿${priceNum.toLocaleString('th-TH')}`}
                    >
                      ≈ ฿{amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </div>
    </MarketingFormShell>
  );
}
