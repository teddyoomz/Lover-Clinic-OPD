// ─── ScheduleSidebarPanel — Phase 13.2.7 ───────────────────────────────────
// Right sidebar replicating ProClinic /admin/schedule/{doctor,employee}:
//   1. งานประจำสัปดาห์ — recurring weekly shifts (Mon-Sun list)
//   2. งานรายวัน — per-date overrides
//   3. วันลา — leave entries
//
// Pure-presentation; data + handlers come from parent (DoctorSchedulesTab /
// EmployeeSchedulesTab). Add/Edit buttons open ScheduleEntryFormModal.

import { Plus, Edit2, Trash2, Loader2, Calendar } from 'lucide-react';
import { DAY_OF_WEEK_LABEL, TYPE_LABEL } from '../../../lib/staffScheduleValidation.js';

// JS dayOfWeek 1..6,0 in human "Mon..Sun" order
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function fmtDateThai(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export default function ScheduleSidebarPanel({
  selectedStaff,           // { id, name, avatar?, ... } — null when nothing picked
  recurringEntries = [],   // type='recurring' entries for this staff
  overrideEntries = [],    // type='work'|'halfday'|'holiday' per-date entries
  leaveEntries = [],       // type='leave'|'sick' per-date entries
  loading = false,
  busyId = null,           // currently-deleting entry id
  canManage = true,        // permission gate
  onAddRecurring,          // () => void
  onEditRecurring,         // (entry) => void
  onDeleteRecurring,       // (entry) => Promise<void>
  onAddOverride,           // () => void
  onEditOverride,          // (entry) => void
  onDeleteOverride,        // (entry) => Promise<void>
  onAddLeave,              // () => void
  onEditLeave,
  onDeleteLeave,
  onClearAllOverrides,     // optional
}) {
  // Pre-organize recurring shifts by JS dayOfWeek for the Mon..Sun display
  const recurringByDay = new Map();
  for (const e of recurringEntries) {
    const dow = Number(e.dayOfWeek);
    if (!Number.isInteger(dow)) continue;
    if (!recurringByDay.has(dow)) recurringByDay.set(dow, []);
    recurringByDay.get(dow).push(e);
  }

  const renderHeader = (
    <div className="px-4 py-3 border-b border-[var(--bd)]">
      <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--tx-muted)]">
        การทำงาน
      </div>
      {selectedStaff ? (
        <div className="flex items-center gap-2.5 mt-2">
          <div className="w-9 h-9 rounded-full bg-[var(--bg-hover)] border border-[var(--bd)] flex items-center justify-center text-sm font-bold text-[var(--tx-primary)] flex-shrink-0">
            {(selectedStaff.name || selectedStaff.firstname || '?').slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-[var(--tx-heading)] truncate" data-testid="schedule-sidebar-staff-name">
              {selectedStaff.name || selectedStaff.firstname || ''}
            </div>
            {selectedStaff.subtitle && (
              <div className="text-[10px] text-[var(--tx-muted)] truncate">{selectedStaff.subtitle}</div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-xs text-[var(--tx-muted)] mt-2 italic">— ยังไม่ได้เลือก —</div>
      )}
    </div>
  );

  if (loading) {
    return (
      <aside className="w-72 shrink-0 rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] flex items-center justify-center min-h-[400px]">
        <Loader2 size={20} className="animate-spin text-[var(--tx-muted)]" />
      </aside>
    );
  }

  return (
    <aside className="w-72 shrink-0 rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] flex flex-col"
      data-testid="schedule-sidebar-panel">
      {renderHeader}

      {/* Section 1: Recurring weekly shifts */}
      <section className="border-b border-[var(--bd)]">
        <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-hover)]">
          <h4 className="text-xs font-bold text-[var(--tx-heading)]">งานประจำสัปดาห์</h4>
          {canManage && (
            <button onClick={onAddRecurring} disabled={!selectedStaff}
              data-testid="schedule-sidebar-add-recurring"
              title="เพิ่มงานประจำสัปดาห์"
              className="p-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50">
              <Plus size={12} />
            </button>
          )}
        </div>
        <ul className="divide-y divide-[var(--bd)]">
          {WEEK_ORDER.map((dow) => {
            const list = recurringByDay.get(dow) || [];
            return (
              <li key={dow} className="flex items-start gap-2 px-4 py-2 text-xs">
                <div className="w-12 shrink-0 font-bold text-[var(--tx-muted)]">
                  {DAY_OF_WEEK_LABEL[dow]}
                </div>
                <div className="flex-1 min-w-0">
                  {list.length === 0 ? (
                    <span className="text-[var(--tx-faint)] italic">—</span>
                  ) : (
                    list.map((e) => (
                      <div key={e.id} className="flex items-center gap-1.5 group" data-testid={`recurring-row-${e.id}`}>
                        <span className="font-mono text-[var(--tx-primary)]">
                          {e.startTime || '--'}-{e.endTime || '--'}
                        </span>
                        {canManage && (
                          <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                            <button onClick={() => onEditRecurring?.(e)}
                              className="p-1 rounded hover:bg-[var(--bg-hover)] text-sky-400" title="แก้ไข"
                              data-testid={`recurring-edit-${e.id}`}>
                              <Edit2 size={10} />
                            </button>
                            <button onClick={() => onDeleteRecurring?.(e)} disabled={busyId === e.id}
                              className="p-1 rounded hover:bg-[var(--bg-hover)] text-rose-400 disabled:opacity-50" title="ลบ"
                              data-testid={`recurring-delete-${e.id}`}>
                              {busyId === e.id ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                            </button>
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Section 2: Daily overrides */}
      <section className="border-b border-[var(--bd)]">
        <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-hover)]">
          <h4 className="text-xs font-bold text-[var(--tx-heading)]">งานรายวัน</h4>
          <div className="flex items-center gap-1.5">
            {canManage && overrideEntries.length > 0 && onClearAllOverrides && (
              <button onClick={onClearAllOverrides}
                className="text-[10px] text-rose-400 hover:text-rose-300 underline">
                ลบทั้งหมด
              </button>
            )}
            {canManage && (
              <button onClick={onAddOverride} disabled={!selectedStaff}
                data-testid="schedule-sidebar-add-override"
                title="เพิ่มงานรายวัน"
                className="p-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50">
                <Plus size={12} />
              </button>
            )}
          </div>
        </div>
        <ul className="divide-y divide-[var(--bd)]">
          {overrideEntries.length === 0 ? (
            <li className="px-4 py-3 text-xs text-[var(--tx-faint)] italic flex items-center justify-center gap-2">
              <Calendar size={12} /> ไม่มีข้อมูล
            </li>
          ) : (
            overrideEntries.map((e) => (
              <li key={e.id} className="flex items-center gap-2 px-4 py-2 text-xs group"
                data-testid={`override-row-${e.id}`}>
                <span className="text-[var(--tx-muted)] shrink-0">{fmtDateThai(e.date)}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${
                  e.type === 'work' ? 'bg-emerald-700/20 border-emerald-700/40 text-emerald-400' :
                  e.type === 'halfday' ? 'bg-sky-700/20 border-sky-700/40 text-sky-400' :
                  'bg-amber-700/20 border-amber-700/40 text-amber-400'
                }`}>
                  {TYPE_LABEL[e.type] || e.type}
                </span>
                {(e.startTime || e.endTime) && (
                  <span className="font-mono text-[10px] text-[var(--tx-muted)]">
                    {e.startTime}-{e.endTime}
                  </span>
                )}
                {canManage && (
                  <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                    <button onClick={() => onEditOverride?.(e)}
                      className="p-1 rounded hover:bg-[var(--bg-hover)] text-sky-400" title="แก้ไข"
                      data-testid={`override-edit-${e.id}`}>
                      <Edit2 size={10} />
                    </button>
                    <button onClick={() => onDeleteOverride?.(e)} disabled={busyId === e.id}
                      className="p-1 rounded hover:bg-[var(--bg-hover)] text-rose-400 disabled:opacity-50" title="ลบ"
                      data-testid={`override-delete-${e.id}`}>
                      {busyId === e.id ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                    </button>
                  </span>
                )}
              </li>
            ))
          )}
        </ul>
      </section>

      {/* Section 3: Leave dates */}
      <section className="flex-1">
        <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-hover)]">
          <h4 className="text-xs font-bold text-[var(--tx-heading)]">วันลา</h4>
          {canManage && (
            <button onClick={onAddLeave} disabled={!selectedStaff}
              data-testid="schedule-sidebar-add-leave"
              title="เพิ่มข้อมูลวันลา"
              className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1">
              <Plus size={10} /> เพิ่มข้อมูล
            </button>
          )}
        </div>
        <ul className="divide-y divide-[var(--bd)]">
          {leaveEntries.length === 0 ? (
            <li className="px-4 py-3 text-xs text-[var(--tx-faint)] italic">— ไม่มี —</li>
          ) : (
            leaveEntries.map((e) => (
              <li key={e.id} className="flex items-center gap-2 px-4 py-2 text-xs group"
                data-testid={`leave-row-${e.id}`}>
                <span className="text-[var(--tx-muted)] shrink-0">{fmtDateThai(e.date)}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${
                  e.type === 'sick' ? 'bg-rose-700/20 border-rose-700/40 text-rose-400' :
                  'bg-orange-700/20 border-orange-700/40 text-orange-400'
                }`}>
                  {TYPE_LABEL[e.type] || e.type}
                </span>
                {e.note && <span className="text-[10px] text-[var(--tx-faint)] italic truncate">· {e.note}</span>}
                {canManage && (
                  <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                    <button onClick={() => onEditLeave?.(e)}
                      className="p-1 rounded hover:bg-[var(--bg-hover)] text-sky-400" title="แก้ไข"
                      data-testid={`leave-edit-${e.id}`}>
                      <Edit2 size={10} />
                    </button>
                    <button onClick={() => onDeleteLeave?.(e)} disabled={busyId === e.id}
                      className="p-1 rounded hover:bg-[var(--bg-hover)] text-rose-400 disabled:opacity-50" title="ลบ"
                      data-testid={`leave-delete-${e.id}`}>
                      {busyId === e.id ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                    </button>
                  </span>
                )}
              </li>
            ))
          )}
        </ul>
      </section>
    </aside>
  );
}
