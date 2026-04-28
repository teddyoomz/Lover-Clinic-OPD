// ─── ExchangeCourseModal — Phase 16.5 (2026-04-29) ─────────────────────────
// Exchange a customer's purchased course for a different master course.
// Calls backendClient.exchangeCourseProduct(customerId, courseIndex, newProduct, reason).
//
// Note signature quirk: helper takes courseIndex + newProduct shape:
//   newProduct = { name: <courseName>, qty: <qtyString>, unit: <unit> }
// We map from the picked master course as: name=courseName, qty=string from
// first product entry (mirrors assignCourseToCustomer convention), unit=''.

import { useState, useEffect } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { exchangeCourseProduct, listCourses, listStaffByBranch } from '../../lib/backendClient.js';
import ActorPicker, { resolveActorUser } from './ActorPicker.jsx';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';

/**
 * @param {object} props
 *   - open: bool
 *   - row: { customerId, courseIndex, customerHN, customerName, courseId, courseName }
 *   - onSuccess: () => void
 *   - onCancel: () => void
 */
export default function ExchangeCourseModal({ open, row, onSuccess, onCancel }) {
  const { branchId } = useSelectedBranch();
  const [courses, setCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [staff, setStaff] = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [actorId, setActorId] = useState('');
  const [search, setSearch] = useState('');
  const [pickedCourseId, setPickedCourseId] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Load master courses when modal opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingCourses(true);
    listCourses()
      .then((items) => { if (!cancelled) setCourses(items || []); })
      .catch((e) => { if (!cancelled) setError(e?.message || 'โหลดรายการคอร์สไม่สำเร็จ'); })
      .finally(() => { if (!cancelled) setLoadingCourses(false); });
    return () => { cancelled = true; };
  }, [open]);

  // Phase 16.5-ter — load branch-filtered staff.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStaffLoading(true);
    listStaffByBranch({ branchId })
      .then((list) => { if (!cancelled) setStaff(list || []); })
      .catch(() => { if (!cancelled) setStaff([]); })
      .finally(() => { if (!cancelled) setStaffLoading(false); });
    return () => { cancelled = true; };
  }, [open, branchId]);

  if (!open || !row) return null;

  const lowerSearch = search.trim().toLowerCase();
  const filteredCourses = lowerSearch
    ? courses.filter(c => String(c.courseName || '').toLowerCase().includes(lowerSearch))
    : courses;

  const picked = courses.find(c => c.id === pickedCourseId) || null;
  const actor = resolveActorUser(actorId, staff);
  const reasonOk = reason.trim().length > 0;
  const canConfirm = !!picked && !!actor && reasonOk && !submitting;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    setError('');
    try {
      const products = Array.isArray(picked.products) ? picked.products : [];
      const newProduct = {
        name: picked.courseName || picked.name || '',
        qty: products[0]?.qty || picked.qty || 1,
        unit: products[0]?.unit || '',
      };
      await exchangeCourseProduct(row.customerId, row.courseIndex, newProduct, reason.trim(), {
        staffId: actor.userId,
        staffName: actor.userName,
      });
      setActorId(''); setSearch(''); setPickedCourseId(''); setReason('');
      onSuccess?.();
    } catch (e) {
      setError(e?.message || 'เปลี่ยนคอร์สไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setActorId(''); setSearch(''); setPickedCourseId(''); setReason(''); setError('');
    onCancel?.();
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      data-testid="exchange-course-modal"
      onClick={handleCancel}
      onKeyDown={(e) => { if (e.key === 'Escape') handleCancel(); }}
    >
      <div
        className="w-full max-w-md mx-4 rounded-2xl shadow-2xl bg-[var(--bg-surface)] border border-[var(--bd)] max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[var(--bd)] flex items-start gap-3">
          <div className="flex-1">
            <h3 className="text-sm font-bold text-[var(--tx-heading)]">เปลี่ยนคอร์ส</h3>
            <p className="text-xs text-[var(--tx-muted)] mt-1">
              เลือกคอร์สใหม่ที่จะเปลี่ยน คอร์สเดิมจะถูกแทนที่ในรายการของลูกค้า
            </p>
          </div>
          <button onClick={handleCancel} className="text-[var(--tx-muted)] hover:text-[var(--tx-primary)]">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div className="rounded-lg border border-[var(--bd)] bg-[var(--bg-card)] p-3 text-xs space-y-1">
            <div><span className="text-[var(--tx-muted)]">ลูกค้า: </span>
              <span className="text-[var(--tx-primary)] font-bold">{row.customerHN} {row.customerName}</span></div>
            <div><span className="text-[var(--tx-muted)]">คอร์สเดิม: </span>
              <span className="text-[var(--tx-primary)] font-bold">{row.courseName}</span></div>
          </div>

          <ActorPicker
            value={actorId}
            onChange={setActorId}
            sellers={staff}
            loading={staffLoading}
            label="พนักงานที่ทำรายการ"
            required
            testId="exchange-course-staff"
          />

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1 font-bold">
              ค้นหาคอร์สใหม่
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="พิมพ์ชื่อคอร์ส..."
              className="w-full px-2.5 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)]"
              data-testid="exchange-course-search"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1 font-bold">
              คอร์สใหม่ * {loadingCourses && <span className="text-[var(--tx-muted)] normal-case ml-1">(กำลังโหลด...)</span>}
            </label>
            <select
              value={pickedCourseId}
              onChange={(e) => setPickedCourseId(e.target.value)}
              disabled={loadingCourses || filteredCourses.length === 0}
              className="w-full px-2.5 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)]"
              data-testid="exchange-course-picker"
            >
              <option value="">— เลือกคอร์ส —</option>
              {filteredCourses.map(c => (
                <option key={c.id} value={c.id}>
                  {c.courseName || c.name || c.id}
                  {c.price ? ` — ${c.price} บาท` : ''}
                </option>
              ))}
            </select>
            {!loadingCourses && filteredCourses.length === 0 && (
              <p className="text-[10px] text-[var(--tx-muted)] mt-1">ไม่พบคอร์สที่ตรง</p>
            )}
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1 font-bold">
              เหตุผลในการเปลี่ยน *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="เช่น ลูกค้าขอเปลี่ยนคอร์ส / โปรโมชันสิ้นสุด / อื่นๆ"
              className="w-full px-2.5 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)] resize-none"
              data-testid="exchange-course-reason"
            />
          </div>

          {error && (
            <div className="bg-red-950/40 border border-red-800 rounded-lg p-2 text-xs text-red-400 flex items-start gap-2"
                 data-testid="exchange-course-error">
              <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={handleCancel}
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-xs bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-[var(--tx-primary)] border border-[var(--bd)]"
              data-testid="exchange-course-close"
            >
              ปิด
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="px-5 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 bg-violet-700 hover:bg-violet-600"
              data-testid="exchange-course-submit"
            >
              {submitting ? <Loader2 size={12} className="animate-spin" /> : null}
              ยืนยันเปลี่ยนคอร์ส
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
