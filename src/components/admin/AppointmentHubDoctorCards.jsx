// V164 — doctor-only header (2026-06-29). User: show which DOCTORS are in today;
// if none, show the doctor-empty message. Drops the V64 doctors+assistants header
// — the assistant (purple) chips + the old generic no-staff empty text are gone.
// Assistant shift info still lives in the schedule view (TodaysDoctorsPanel).
//
// Renders ONLY when tab is 'today' or 'tomorrow'; otherwise null.
// Doctor chip = sky theme; time value font-black for at-a-glance legibility.

import React from 'react';

export default function AppointmentHubDoctorCards({ tab, doctorShifts = [] }) {
  if (tab !== 'today' && tab !== 'tomorrow') return null;

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="appt-hub-doctor-cards">
      {doctorShifts.length > 0 ? (
        doctorShifts.map((s, i) => (
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
        ))
      ) : (
        <span className="text-xs text-[var(--tx-muted)] italic" data-testid="appt-hub-doctor-cards-empty">
          ไม่มีแพทย์เข้า
        </span>
      )}
    </div>
  );
}
