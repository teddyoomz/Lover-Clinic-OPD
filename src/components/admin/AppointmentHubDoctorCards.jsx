// V64 — doctors + assistants header (Q2=B+D).
// Renders ONLY when tab is 'today' or 'tomorrow'; otherwise null.

import React from 'react';

export default function AppointmentHubDoctorCards({ tab, doctorShifts = [], assistantShifts = [], dateLabel = '' }) {
  if (tab !== 'today' && tab !== 'tomorrow') return null;

  return (
    <div className="mb-4 space-y-3" data-testid="appt-hub-doctor-cards">
      {doctorShifts.length > 0 && (
        <div>
          <div className="text-xs font-bold text-[var(--tx-heading)] mb-1">
            🩺 แพทย์เข้างาน {doctorShifts.length} คน
          </div>
          <div className="flex gap-2 flex-wrap">
            {doctorShifts.map((s, i) => (
              <div key={`d-${i}`} className="bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/40 rounded-lg px-3 py-2 text-xs min-w-[140px]" data-testid="appt-hub-doctor-card">
                <div className="font-bold text-[var(--tx-heading)] truncate">{s.name}</div>
                <div className="text-[var(--tx-muted)]">{s.startTime} - {s.endTime}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {assistantShifts.length > 0 && (
        <div>
          <div className="text-xs font-bold text-[var(--tx-heading)] mb-1">
            👤 ผู้ช่วยเข้างาน {assistantShifts.length} คน
          </div>
          <div className="flex gap-2 flex-wrap">
            {assistantShifts.map((s, i) => (
              <div key={`a-${i}`} className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/40 rounded-lg px-2 py-1.5 text-xs min-w-[120px]" data-testid="appt-hub-assistant-card">
                <div className="font-bold text-[var(--tx-heading)] truncate">{s.name}</div>
                <div className="text-[var(--tx-muted)]">{s.startTime} - {s.endTime}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {doctorShifts.length === 0 && assistantShifts.length === 0 && (
        <div className="text-xs text-[var(--tx-muted)] italic" data-testid="appt-hub-doctor-cards-empty">
          ไม่มีพนักงานเข้างาน{dateLabel ? ` วัน${dateLabel}` : ''}
        </div>
      )}
    </div>
  );
}
