import { useState, useEffect, useMemo } from 'react';
import { listDoctors } from '../lib/scopedDataLayer.js';
import { buildDoctorMap } from '../lib/appointmentDisplay.js';

/**
 * useDoctorMap — live-ish doctor lookup map (id → {name}) for resolving an
 * appointment's doctor name at RENDER time (via resolveDoctorName), so renaming
 * a doctor in tab=doctors propagates to existing appointment cards instead of
 * showing the frozen `appt.doctorName` snapshot (2026-06-04 fix).
 *
 * One-shot load on mount + `includeHidden:true` so legacy/hidden doctors still
 * resolve (mirrors AppointmentCalendarView's doctors load, V41). Doctors rarely
 * change and the consuming surfaces re-mount on navigation, so a one-shot read is
 * sufficient (matching the existing calendar pattern). be_doctors is a universal
 * collection (BSA), so no branch scoping is needed.
 *
 * Surfaces that already build their own doctorMap (AppointmentCalendarView) keep
 * doing so; this hook is for surfaces that lacked one (the appointment hub).
 *
 * @returns {Map<string,{id:string,name:string}>}
 */
export function useDoctorMap() {
  const [doctors, setDoctors] = useState([]);
  useEffect(() => {
    let alive = true;
    // Defensive: doctorMap is a non-critical display enhancement — if listDoctors
    // is unavailable (e.g. a partial test mock) or rejects, fall back to the
    // snapshot appt.doctorName via resolveDoctorName. NEVER crash a render over it.
    try {
      const p = listDoctors({ includeHidden: true });
      if (p && typeof p.then === 'function') {
        p.then((d) => { if (alive) setDoctors(Array.isArray(d) ? d : []); })
         .catch(() => { /* non-fatal */ });
      }
    } catch { /* listDoctors unavailable — keep empty map, render uses snapshot */ }
    return () => { alive = false; };
  }, []);
  return useMemo(() => buildDoctorMap(doctors), [doctors]);
}
