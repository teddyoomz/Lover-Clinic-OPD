// ─── CourseHistoryTab — Phase 16.5-quater (2026-04-29) ────────────────────
// Sub-tab in CustomerDetailView "คอร์สของฉัน" section, peer to active /
// expired / purchases. Renders the unified course-mutation audit log
// (be_course_changes) for one customer:
//   kind = 'add' | 'use' | 'exchange' | 'share' | 'cancel' | 'refund'
//
// Per user directive 2026-04-29:
//   - "ตรง tab ประวัติการใช้คอร์ส ต้องแสดงคอร์สที่ตัดจากการรักษาในหน้า
//      สร้างการรักษาด้วยนะ" — kind='use' included.
//   - "หากลูกค้าคนนั้นๆโดนยกเลิกจากหน้า tab=reports-remaining-course
//      คอร์สในตัวลูกค้าคนนั้นก็ต้องหายจริง และมาแสดงใน tab ประวัติการใช้คอร์ส
//      นี้ด้วยว่าโดยยกเลิก และยกเลิกโดยใครด้วย" — kind='cancel' shows here
//      since the course is removed from customer.courses[].
//   - "พร้อมแสดงผู้ทำรายการนั้นๆที่ได้บันทึกไว้ด้วย" — staffName per row.
//
// V36-quinquies (2026-04-29) — switched from one-shot listCourseChanges to
// real-time listenToCourseChanges. User report: "ประวัติการใช้คอร์สไม่รี
// เฟรชแบบ real time ต้องกด f5 ก่อนในหน้าข้อมูลลูกค้า แก้ให้ทุกอย่างในหน้า
// ข้อมูลลูกค้า refresh real time เลย". Pre-fix: customer saved a treatment
// in TreatmentFormPage modal → audit emit wrote a be_course_changes doc →
// but CustomerDetailView's CourseHistoryTab still showed the snapshot from
// when the modal opened → user had to F5 to see the new entry. With the
// listener, the new entry appears the moment Firestore confirms the write.

import { useEffect, useState } from 'react';
import {
  Clock, Loader2, Plus, ArrowDownLeft, Repeat, Share2, X as XIcon, Receipt,
} from 'lucide-react';
import { listenToCourseChanges } from '../../lib/backendClient.js';
import { fmtMoney } from '../../lib/financeUtils.js';

const KIND_META = {
  add:      { label: 'เพิ่มคงเหลือ', color: 'text-emerald-400', bg: 'bg-emerald-900/20', border: 'border-emerald-700/40', Icon: Plus },
  use:      { label: 'ใช้คอร์ส',     color: 'text-sky-400',     bg: 'bg-sky-900/20',     border: 'border-sky-700/40',     Icon: ArrowDownLeft },
  exchange: { label: 'เปลี่ยนสินค้า', color: 'text-violet-400',  bg: 'bg-violet-900/20',  border: 'border-violet-700/40',  Icon: Repeat },
  share:    { label: 'แชร์คอร์ส',    color: 'text-purple-400',  bg: 'bg-purple-900/20',  border: 'border-purple-700/40',  Icon: Share2 },
  cancel:   { label: 'ยกเลิก',       color: 'text-rose-400',    bg: 'bg-rose-900/20',    border: 'border-rose-700/40',    Icon: XIcon },
  refund:   { label: 'คืนเงิน',       color: 'text-amber-400',   bg: 'bg-amber-900/20',   border: 'border-amber-700/40',   Icon: Receipt },
};

// Phase 16.7-quinquies-ter (2026-04-29) — courseType badge meta. Surfaced
// per user directive "ฝากแจ้งในประวัติการใช้คอร์สเลยละกัน ว่าการใช้คอร์ส
// นั้นมันมาจากคอร์สประเภทไหน". Empty courseType → no badge (standard).
const COURSE_TYPE_META = {
  'เหมาตามจริง':      { label: 'เหมาตามจริง', cls: 'text-orange-400 border-orange-700/40 bg-orange-900/20' },
  'บุฟเฟต์':           { label: 'บุฟเฟต์',      cls: 'text-amber-400 border-amber-700/40 bg-amber-900/20' },
  'pick-at-treatment': { label: 'เลือกตอนรักษา', cls: 'text-cyan-400 border-cyan-700/40 bg-cyan-900/20' },
};

function fmtDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Thai locale dd/mm/yyyy HH:mm
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const HH = String(d.getHours()).padStart(2, '0');
  const MM = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${HH}:${MM}`;
}

function CourseHistoryRow({ entry }) {
  const meta = KIND_META[entry.kind] || KIND_META.use;
  const { Icon } = meta;
  const fromName = entry.fromCourse?.name || '(ไม่ระบุคอร์ส)';
  const fromValue = entry.fromCourse?.value || '';
  const toName = entry.toCourse?.name || '';
  const qtyDelta = entry.qtyDelta;
  const qtyBefore = entry.qtyBefore || '';
  const qtyAfter = entry.qtyAfter || '';
  const staffLine = entry.staffName ? `โดย ${entry.staffName}` : (entry.actor ? `โดย ${entry.actor}` : '');
  const refundLine = (entry.kind === 'refund' && typeof entry.refundAmount === 'number')
    ? `คืนเงิน ${fmtMoney(entry.refundAmount)} บาท`
    : '';
  const shareLine = (entry.kind === 'share' && entry.toCustomerName)
    ? `แชร์ให้ ${entry.toCustomerName}${entry.toCustomerId ? ` (${entry.toCustomerId})` : ''}`
    : '';
  const treatmentLine = entry.linkedTreatmentId
    ? `อ้างอิงการรักษา ${entry.linkedTreatmentId}`
    : '';
  // Phase 16.7-quinquies-ter (2026-04-29) — surface the actual product
  // consumed within the wrapper course (e.g. Allergan 100 U -75 U inside
  // "เทส IV แก้แฮงค์2"). Only render when both name and qty exist on the
  // audit doc; older entries without these fields fall back to course-only.
  const productName = String(entry.productName || '').trim();
  const productQty = Number(entry.productQty) || 0;
  const productUnit = String(entry.productUnit || '').trim();
  const showProductLine = entry.kind === 'use' && productName && productQty > 0;
  // When the product line is shown, the course-level qty tracker
  // ("1/1 U → 0/1 U (-1)") is internal accounting noise — the actual
  // consumption story is the product line (e.g. "Allergan 100 U  -75 U").
  // Wrapper courses like "เทส IV แก้แฮงค์2" with sentinel 1/1 qty AND
  // เหมาตามจริง / บุฟเฟต์ types both produce a misleading course-tracker
  // movement that confuses admins. Hide the qty line in this case.
  // For in-house treatments without a product (e.g. "ธาราบำบัด" 9/10 →
  // 8/10 ครั้ง), no productName is set → qty line is meaningful → shown.
  const showQtyLine = (qtyBefore || qtyAfter) && !showProductLine;
  // Phase 16.7-quinquies-ter — courseType badge.
  const courseType = String(entry.fromCourse?.courseType || '').trim();
  const courseTypeMeta = COURSE_TYPE_META[courseType] || null;

  return (
    <div className={`px-3 py-3 border-b border-[var(--bd)]/50 hover:bg-[var(--bg-hover)] flex items-start gap-3`}
         data-testid={`course-history-row-${entry.changeId}`}>
      <div className={`flex-shrink-0 w-9 h-9 rounded-full ${meta.bg} ${meta.border} border flex items-center justify-center`}>
        <Icon size={16} className={meta.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[10px] font-bold uppercase tracking-wider ${meta.color}`}>{meta.label}</span>
          <span className="text-[10px] text-[var(--tx-muted)]">{fmtDateTime(entry.createdAt)}</span>
        </div>
        <div className="text-sm text-[var(--tx-primary)] mt-0.5 break-words">
          {entry.kind === 'exchange' && toName
            ? <>เปลี่ยน <span className="font-bold">{fromName}</span> → <span className="font-bold">{toName}</span></>
            : <span className="font-bold">{fromName}</span>}
          {fromValue && entry.kind !== 'exchange' && (
            <span className="text-[11px] text-[var(--tx-muted)] ml-1">({fromValue})</span>
          )}
          {courseTypeMeta && (
            <span
              data-testid={`course-history-type-${entry.changeId}`}
              className={`ml-2 inline-block text-[10px] px-1.5 py-0.5 rounded border ${courseTypeMeta.cls}`}
            >
              {courseTypeMeta.label}
            </span>
          )}
        </div>
        <div className="text-[11px] text-[var(--tx-muted)] mt-1 space-y-0.5">
          {showProductLine && (
            <div data-testid={`course-history-product-${entry.changeId}`}>
              สินค้า: <span className="font-bold text-[var(--tx-secondary)]">{productName}</span>
              <span className="ml-2 text-rose-400">-{productQty}{productUnit ? ` ${productUnit}` : ''}</span>
            </div>
          )}
          {showQtyLine && (
            <div>
              จำนวน: <span className="text-[var(--tx-secondary)]">{qtyBefore || '-'}</span>
              {' → '}
              <span className="text-[var(--tx-secondary)] font-bold">{qtyAfter || '-'}</span>
              {typeof qtyDelta === 'number' && qtyDelta !== 0 && (
                <span className={`ml-2 ${qtyDelta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  ({qtyDelta > 0 ? '+' : ''}{qtyDelta})
                </span>
              )}
            </div>
          )}
          {refundLine && <div className="text-amber-400">{refundLine}</div>}
          {shareLine && <div className="text-purple-400">{shareLine}</div>}
          {treatmentLine && <div className="text-sky-400">{treatmentLine}</div>}
          {entry.reason && <div className="italic">{entry.reason}</div>}
          {staffLine && <div className="text-[var(--tx-secondary)]">{staffLine}</div>}
        </div>
      </div>
    </div>
  );
}

export default function CourseHistoryTab({ customerId }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!customerId) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    // V36-quinquies: real-time listener. New be_course_changes docs
    // (kind='use' from treatment-deduct, etc.) appear without F5.
    const unsubscribe = listenToCourseChanges(
      customerId,
      (list) => {
        setEntries(list || []);
        setLoading(false);
      },
      (e) => {
        setError(e?.message || 'โหลดประวัติไม่สำเร็จ');
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [customerId]);

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-[var(--tx-muted)] flex items-center justify-center gap-2"
           data-testid="course-history-loading">
        <Loader2 size={14} className="animate-spin" /> กำลังโหลด...
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4 text-xs text-red-400 bg-red-950/40 border border-red-800 rounded-lg m-3"
           data-testid="course-history-error">
        {error}
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-[var(--tx-muted)]" data-testid="course-history-empty">
        <Clock size={32} className="inline opacity-40 mb-2" />
        <p>ยังไม่มีประวัติการใช้คอร์ส</p>
      </div>
    );
  }
  return (
    <div data-testid="course-history-list">
      {entries.map((entry) => (
        <CourseHistoryRow key={entry.changeId} entry={entry} />
      ))}
    </div>
  );
}
