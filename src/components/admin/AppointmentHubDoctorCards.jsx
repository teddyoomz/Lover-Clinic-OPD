// V64 — doctors + assistants header (Q2=B+D).
// Renders ONLY when tab is 'today' or 'tomorrow'; otherwise null.
//
// V64-fix9 (2026-05-09): redesigned as COMPACT inline chip row so it can
// live inside the TabBar's rightContent slot (next to ย้อนหลัง 30 วัน tab)
// without occupying its own area-above-tabs strip. Per user: "เอา badge
// แสดงแพทย์เข้ามาไว้ถัดไปจาก tab ย้อนหลัง 30 วัน น่าจะดีกว่า เวลาในหน้า
// ที่ไม่มีแพทย์เข้า ข้างบนมันจะได้ไม่โล่งแบบปัจจุบัน".

import React from 'react';

export default function AppointmentHubDoctorCards({ tab, doctorShifts = [], assistantShifts = [], dateLabel = '' }) {
  if (tab !== 'today' && tab !== 'tomorrow') return null;

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="appt-hub-doctor-cards">
      {doctorShifts.length > 0 && (
        <>
          {doctorShifts.map((s, i) => (
            <span
              key={`d-${i}`}
              data-testid="appt-hub-doctor-card"
              className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded bg-sky-100 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/50 text-sky-800 dark:text-sky-200"
              title={`แพทย์ ${s.name} ${s.startTime}-${s.endTime}`}
            >
              <span aria-hidden="true">🩺</span>
              <span className="truncate max-w-[140px]">{s.name}</span>
              <span className="text-sky-600 dark:text-sky-300 font-mono">{s.startTime}-{s.endTime}</span>
            </span>
          ))}
        </>
      )}
      {assistantShifts.length > 0 && (
        <>
          {assistantShifts.map((s, i) => (
            <span
              key={`a-${i}`}
              data-testid="appt-hub-assistant-card"
              className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded bg-purple-100 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/50 text-purple-800 dark:text-purple-200"
              title={`ผู้ช่วย ${s.name} ${s.startTime}-${s.endTime}`}
            >
              <span aria-hidden="true">👤</span>
              <span className="truncate max-w-[120px]">{s.name}</span>
              <span className="text-purple-600 dark:text-purple-300 font-mono">{s.startTime}-{s.endTime}</span>
            </span>
          ))}
        </>
      )}
      {doctorShifts.length === 0 && assistantShifts.length === 0 && (
        <span className="text-[11px] text-[var(--tx-muted)] italic" data-testid="appt-hub-doctor-cards-empty">
          ไม่มีพนักงานเข้างาน{dateLabel ? ` วัน${dateLabel}` : ''}
        </span>
      )}
    </div>
  );
}
