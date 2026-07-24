// V164 — doctor-only header (2026-06-29). User: show which DOCTORS are in today;
// if none, show the doctor-empty message. Drops the V64 doctors+assistants header
// — the assistant (purple) chips + the old generic no-staff empty text are gone.
// Assistant shift info still lives in the schedule view (TodaysDoctorsPanel).
//
// 2026-07-24 — the badge (both the 🩺 chips AND "ไม่มีแพทย์เข้า") is now TAPPABLE:
// tap → themed confirm → open the doctor-schedule tab in a new tab. Permission is
// enforced by the destination (BackendDashboard gates the tab) — no pre-check, so
// a no-permission user reaches the tab's own "เข้าไม่ได้". AV78: the modal backdrop
// does NOT close it (explicit ยกเลิก only).
//
// Renders ONLY when tab is 'today' or 'tomorrow'; otherwise null.

import React, { useState } from 'react';
import { useModalScrollLock } from '../../lib/useModalScrollLock.js';

// Existing deep-link pattern (AdminDashboard.jsx already links here) — opening
// the backend at this tab. New browser tab so the appointment page stays open.
export const DOCTOR_SCHEDULE_URL = '?backend=1&tab=doctor-schedules';

export default function AppointmentHubDoctorCards({ tab, doctorShifts = [] }) {
  const [confirm, setConfirm] = useState(false);
  // AV205 — lock background scroll while the confirm modal is open. Called before
  // the early return so hook order stays stable (rules of hooks); no-op when closed.
  useModalScrollLock(confirm);
  if (tab !== 'today' && tab !== 'tomorrow') return null;

  const openSchedule = () => {
    setConfirm(false);
    try { window.open(DOCTOR_SCHEDULE_URL, '_blank'); } catch { /* jsdom / blocked */ }
  };

  return (
    <>
      <button
        type="button"
        data-testid="appt-hub-doctor-cards"
        onClick={() => setConfirm(true)}
        aria-label="แก้ไขตารางแพทย์"
        title="แตะเพื่อไปหน้าตารางแพทย์"
        className="flex flex-wrap items-center gap-2 bg-transparent border-0 p-0 cursor-pointer text-left"
      >
        {doctorShifts.length > 0 ? (
          doctorShifts.map((s, i) => (
            <span
              key={`d-${i}`}
              data-testid="appt-hub-doctor-card"
              className="inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-lg bg-sky-100 dark:bg-sky-950/50 border border-sky-300 dark:border-sky-700/60 text-sky-900 dark:text-sky-100 shadow-sm shadow-sky-950/20"
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
      </button>

      {confirm && (
        // AV78: backdrop does NOT close — explicit ยกเลิก only.
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/55 overflow-y-auto overscroll-contain" data-testid="appt-doctor-nav-modal">
          <div className="w-full max-w-[300px] rounded-2xl border border-[var(--bd)] bg-[var(--bg-card)] p-5 shadow-2xl">
            <div className="text-sm font-bold text-[var(--tx-heading)]">ไปหน้าแก้ไขตารางแพทย์?</div>
            <div className="text-xs text-[var(--tx-muted)] mt-1.5">จะเปิดหน้า “ตารางแพทย์” ในแท็บใหม่ให้แก้ไขได้</div>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setConfirm(false)}
                className="flex-1 text-sm font-bold py-2 rounded-lg border border-[var(--bd)] text-[var(--tx-body)]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                data-testid="appt-doctor-nav-go"
                onClick={openSchedule}
                className="flex-1 text-sm font-bold py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white border border-red-900"
              >
                เปิดตารางแพทย์
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
