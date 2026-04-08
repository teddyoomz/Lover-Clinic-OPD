// ─── CustomerCard — Reusable card for displaying customer info ──────────────
// Used in both CloneTab (search results) and CustomerListTab (cloned customers).
// Follows Thai cultural rules: no red on names/HN, uses CSS variables for theme.

import { User, Phone, Calendar, Stethoscope, Package, Clock, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { hexToRgb } from '../../utils.js';

export default function CustomerCard({
  customer,           // { proClinicId/id, proClinicHN/hn, name, phone, patientData, ... }
  accentColor,        // clinic accent color
  mode = 'search',    // 'search' | 'cloned'
  cloneStatus,        // 'idle' | 'cloning' | 'done' | 'error' | 'exists'
  cloneProgress,      // { step, label, percent, detail }
  onClone,            // callback when "ดูดข้อมูลทั้งหมด" clicked
}) {
  const ac = accentColor || '#dc2626';
  const acRgb = hexToRgb(ac);

  // Normalize fields across search results and cloned data
  const hn = customer.proClinicHN || customer.hn || '';
  const id = customer.proClinicId || customer.id || '';
  const name = customer.name || (customer.patientData
    ? `${customer.patientData.prefix || ''} ${customer.patientData.firstName || ''} ${customer.patientData.lastName || ''}`.trim()
    : '-');
  const phone = customer.phone || customer.patientData?.phone || '-';
  const gender = customer.patientData?.gender || '';
  const treatmentCount = customer.treatmentCount || 0;
  const courseCount = (customer.courses?.length || 0);
  const syncedAt = customer.lastSyncedAt;
  const status = customer.cloneStatus;

  // Format relative time
  const relativeTime = (isoStr) => {
    if (!isoStr) return '-';
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'เมื่อสักครู่';
    if (mins < 60) return `${mins} นาทีที่แล้ว`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} ชม.ที่แล้ว`;
    const days = Math.floor(hrs / 24);
    return `${days} วันที่แล้ว`;
  };

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--bd)] rounded-xl overflow-hidden transition-all hover:border-[var(--bd-strong)] hover:shadow-lg group">

      {/* Card Header — HN badge + avatar area */}
      <div className="flex items-start gap-3 p-4 pb-2">
        {/* Avatar circle */}
        <div className="w-12 h-12 rounded-full bg-[var(--bg-elevated)] border-2 border-[var(--bd-strong)] flex items-center justify-center flex-shrink-0">
          <User size={20} className="text-[var(--tx-muted)]" />
        </div>

        <div className="flex-1 min-w-0">
          {/* HN Badge */}
          {hn && (
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider bg-[var(--bg-elevated)] border border-[var(--bd)] text-[var(--tx-secondary)] mb-1">
              {hn}
            </span>
          )}
          {/* Name — NEVER red (Thai culture) */}
          <h3 className="text-sm font-bold text-[var(--tx-heading)] truncate leading-tight">
            {name}
          </h3>
        </div>
      </div>

      {/* Card Body — details */}
      <div className="px-4 pb-3 space-y-1.5">
        {phone !== '-' && (
          <div className="flex items-center gap-2 text-xs text-[var(--tx-secondary)]">
            <Phone size={12} className="flex-shrink-0" /> {phone}
          </div>
        )}
        {gender && (
          <div className="flex items-center gap-2 text-xs text-[var(--tx-secondary)]">
            <User size={12} className="flex-shrink-0" /> {gender}
          </div>
        )}

        {/* Cloned mode: show stats */}
        {mode === 'cloned' && (
          <div className="flex items-center gap-4 pt-1">
            <div className="flex items-center gap-1.5 text-xs text-[var(--tx-muted)]">
              <Stethoscope size={12} /> {treatmentCount} รักษา
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[var(--tx-muted)]">
              <Package size={12} /> {courseCount} คอร์ส
            </div>
          </div>
        )}

        {/* Clone status indicator */}
        {mode === 'cloned' && status && (
          <div className="flex items-center gap-2 pt-1">
            {status === 'complete' && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-medium">
                <CheckCircle2 size={11} /> Clone สมบูรณ์
              </span>
            )}
            {status === 'partial_error' && (
              <span className="flex items-center gap-1 text-[10px] text-amber-500 font-medium">
                <AlertCircle size={11} /> Clone บางส่วน
              </span>
            )}
            {status === 'in_progress' && (
              <span className="flex items-center gap-1 text-[10px] text-blue-400 font-medium">
                <Loader2 size={11} className="animate-spin" /> กำลัง Clone...
              </span>
            )}
            {syncedAt && (
              <span className="flex items-center gap-1 text-[10px] text-[var(--tx-muted)]">
                <Clock size={10} /> {relativeTime(syncedAt)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Card Footer — action buttons */}
      {mode === 'search' && onClone && (
        <div className="px-4 pb-4">
          {cloneStatus === 'cloning' ? (
            <div className="space-y-2">
              {/* Progress bar */}
              <div className="w-full h-1.5 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${cloneProgress?.percent || 0}%`,
                    background: `linear-gradient(90deg, rgba(${acRgb},0.8), rgba(${acRgb},1))`,
                  }} />
              </div>
              <p className="text-[10px] text-[var(--tx-muted)] truncate">{cloneProgress?.label || 'กำลังดำเนินการ...'}</p>
            </div>
          ) : cloneStatus === 'done' ? (
            <button disabled className="w-full py-2 rounded-lg text-xs font-bold bg-emerald-900/30 border border-emerald-700/40 text-emerald-400 flex items-center justify-center gap-2">
              <CheckCircle2 size={14} /> Clone สำเร็จ
            </button>
          ) : cloneStatus === 'error' ? (
            <button onClick={() => onClone(id)} className="w-full py-2 rounded-lg text-xs font-bold bg-red-900/20 border border-red-700/40 text-red-400 hover:bg-red-900/30 transition-all flex items-center justify-center gap-2">
              <AlertCircle size={14} /> ลองอีกครั้ง
            </button>
          ) : cloneStatus === 'exists' ? (
            <button onClick={() => onClone(id)} className="w-full py-2 rounded-lg text-xs font-bold bg-amber-900/20 border border-amber-700/40 text-amber-400 hover:bg-amber-900/30 transition-all flex items-center justify-center gap-2">
              <Clock size={14} /> อัพเดทข้อมูล
            </button>
          ) : (
            <button onClick={() => onClone(id)}
              className="w-full py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 hover:shadow-lg active:scale-[0.98]"
              style={{
                backgroundColor: `rgba(${acRgb},0.15)`,
                border: `1px solid rgba(${acRgb},0.4)`,
                color: ac,
              }}>
              <Download size={14} /> ดูดข้อมูลทั้งหมด
            </button>
          )}
        </div>
      )}
    </div>
  );
}
