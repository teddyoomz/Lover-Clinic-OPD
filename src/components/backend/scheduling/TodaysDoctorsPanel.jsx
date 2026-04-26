// ─── TodaysDoctorsPanel — Phase 13.2.9 (ProClinic /admin/appointment parity) ──
// Sidebar widget showing doctors WORKING on the selected date. Sources from
// the schedule (be_staff_schedules merged via getActiveSchedulesForDate),
// filtered to staffIds that exist in be_doctors. ProClinic-fidelity:
// doctors with a recurring shift but no booked appointments today STILL
// appear; doctors with appointments but no shift do NOT.
//
// Replaces the legacy panel that derived from be_appointments (which
// dropped scheduled-but-unbooked doctors and showed appointment-time
// ranges instead of shift-time ranges).
//
// Pure-presentation; data fetched in parent + passed in. Click row emits
// onDoctorClick(doctorId) — caller filters the time grid.

import { User } from 'lucide-react';

function fmtThaiDate(dateISO) {
  if (!dateISO) return '';
  const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  const THAI_MONTHS = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
  ];
  try {
    const [y, m, d] = dateISO.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const dow = date.getUTCDay();
    return `วัน${THAI_DAYS[dow]}ที่ ${d} ${THAI_MONTHS[m - 1]} ${y}`;
  } catch { return dateISO; }
}

export default function TodaysDoctorsPanel({
  dateISO,                 // YYYY-MM-DD; defaults handled by caller
  doctors = [],            // [{ doctorId, firstname, lastname, nickname, ... }]
  todaysSchedules = [],    // pre-merged + filtered effective entries from getActiveSchedulesForDate
  loading = false,
  onDoctorClick,           // (doctorId) => void
  isDark = true,
}) {
  // Build per-doctor info: WORKING shifts (recurring/work/halfday) only —
  // exclude leave/holiday/sick which mean "not working".
  const todaysDoctors = (todaysSchedules || [])
    .filter((s) => s.type === 'recurring' || s.type === 'work' || s.type === 'halfday')
    .map((s) => {
      const doc = doctors.find((d) => String(d.doctorId || d.id) === String(s.staffId));
      if (!doc) return null;
      const firstname = doc.firstname || doc.firstName || '';
      const lastname = doc.lastname || doc.lastName || '';
      const nick = doc.nickname ? ` (${doc.nickname})` : '';
      const display = `${firstname} ${lastname}`.trim() + nick;
      return {
        doctorId: String(doc.doctorId || doc.id),
        name: display || doc.name || `แพทย์ ${s.staffId}`,
        startTime: s.startTime,
        endTime: s.endTime,
        sourceEntry: s,
      };
    })
    .filter(Boolean);

  // Sort by startTime ascending for stable display
  todaysDoctors.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

  return (
    <div className="bg-[var(--bg-surface)] rounded-xl p-3 shadow-lg"
      style={{ border: '1.5px solid rgba(14,165,233,0.15)' }}
      data-testid="todays-doctors-panel">
      <h4 className="text-xs font-black text-[var(--tx-heading)] mb-1 tracking-tight"
        data-testid="todays-doctors-title">
        {fmtThaiDate(dateISO)}
      </h4>
      <p className="text-[11px] text-sky-400 font-bold mb-2"
        data-testid="todays-doctors-count">
        แพทย์เข้าตรวจ {todaysDoctors.length} คน
      </p>
      {loading ? (
        <p className="text-[11px] text-[var(--tx-muted)]">กำลังโหลด...</p>
      ) : todaysDoctors.length === 0 ? (
        <p className="text-[11px] text-[var(--tx-muted)]" data-testid="todays-doctors-empty">
          ไม่มีแพทย์เข้าตรวจ
        </p>
      ) : (
        <div className="space-y-1.5">
          {todaysDoctors.map((doc) => (
            <button
              key={doc.doctorId}
              onClick={() => onDoctorClick?.(doc.doctorId)}
              className="w-full flex items-center gap-2 text-left rounded p-1 hover:bg-[var(--bg-hover)] transition-colors"
              data-testid={`todays-doctor-row-${doc.doctorId}`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-sky-900/30' : 'bg-sky-50'}`}>
                <User size={11} className={isDark ? 'text-sky-400' : 'text-sky-600'} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[var(--tx-secondary)] font-medium truncate">{doc.name}</p>
                <p className="text-[11px] text-[var(--tx-muted)] font-mono">
                  {doc.startTime} - {doc.endTime}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
