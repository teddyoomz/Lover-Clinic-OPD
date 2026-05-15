// ─── AppointmentLineBadge — Shared appt-row 🟢 LINE chip ──────────────────
// V68 (2026-05-15) — single source of truth for the appointment-list LINE
// badge across 4 admin surfaces (AppointmentCalendarView, AppointmentHubView,
// CustomerDetailView appts tab, AdminDashboard queue calendar).
//
// Mirror of LR-4 CustomerOption chip pattern — same colors, same emoji,
// same Tailwind classes — so admin recognizes the badge as "this appt
// triggers LINE" everywhere it appears.
//
// Defensive `||` fallback chain (V67 lesson — mock-shadow drift):
//   1. appt.notifyChannel.includes('line')   — canonical post-V67
//   2. appt.lineNotify === true              — legacy V32-tris-ter compat
//                                              (kept for in-flight be_appointments
//                                               docs created BEFORE V68 strip;
//                                               stripped from new writes by V68)
//
// Props:
//   appt              — be_appointments doc shape
//   contextBranchId   — reserved for future per-branch variant (v1 ignores)
//   size              — 'xs' | 'sm' | 'md' (caller picks based on row density)

const SIZE_CLASSES = {
  xs: 'px-1 py-0 text-[10px]',
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2 py-1 text-sm',
};

export function AppointmentLineBadge({ appt, contextBranchId = '', size = 'sm' }) {
  if (!appt) return null;

  const channels = Array.isArray(appt.notifyChannel) ? appt.notifyChannel : [];
  const linkedViaChannel = channels.includes('line');
  const linkedViaLegacy = appt.lineNotify === true;
  const isLineNotify = linkedViaChannel || linkedViaLegacy;

  if (!isLineNotify) return null;

  const sizeCls = SIZE_CLASSES[size] || SIZE_CLASSES.sm;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded bg-green-500/10 text-green-700 dark:text-green-400 font-medium flex-shrink-0 ${sizeCls}`}
      title="แจ้งเตือนนัดผ่าน LINE"
    >
      🟢 LINE
    </span>
  );
}
