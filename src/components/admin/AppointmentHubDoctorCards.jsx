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

  // V64-fix13 (2026-05-09): chips bumped to text-sm + px-3 py-1.5 + rounded-lg
  // + shadow-sm + bigger font-mono time. User: "ทำให้ใหญ่ขึ้นเด่นขึ้นในทุก
  // badge หมอเข้า". Doctor chip = sky theme; assistant chip = purple. Time
  // value font-black for legibility at-a-glance.
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="appt-hub-doctor-cards">
      {doctorShifts.length > 0 && (
        <>
          {doctorShifts.map((s, i) => (
            <span
              key={`d-${i}`}
              data-testid="appt-hub-doctor-card"
              className="inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-lg bg-sky-100 dark:bg-sky-950/50 border border-sky-300 dark:border-sky-700/60 text-sky-900 dark:text-sky-100 shadow-sm shadow-sky-950/20"
              title={`แพทย์ ${s.name} ${s.startTime}-${s.endTime}`}
            >
              <span aria-hidden="true" className="text-base">🩺</span>
              <span className="truncate max-w-[160px]">{s.name}</span>
              <span className="text-sky-700 dark:text-sky-200 font-mono font-black">{s.startTime}-{s.endTime}</span>
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
              className="inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-lg bg-purple-100 dark:bg-purple-950/50 border border-purple-300 dark:border-purple-700/60 text-purple-900 dark:text-purple-100 shadow-sm shadow-purple-950/20"
              title={`ผู้ช่วย ${s.name} ${s.startTime}-${s.endTime}`}
            >
              <span aria-hidden="true" className="text-base">👤</span>
              <span className="truncate max-w-[140px]">{s.name}</span>
              <span className="text-purple-700 dark:text-purple-200 font-mono font-black">{s.startTime}-{s.endTime}</span>
            </span>
          ))}
        </>
      )}
      {doctorShifts.length === 0 && assistantShifts.length === 0 && (
        <span className="text-xs text-[var(--tx-muted)] italic" data-testid="appt-hub-doctor-cards-empty">
          ไม่มีพนักงานเข้างาน{dateLabel ? ` วัน${dateLabel}` : ''}
        </span>
      )}
    </div>
  );
}
