import React from 'react';
import { Check } from 'lucide-react';
import { getStepLabels, resolveCourseStepState } from '../../../lib/treatmentDisplayResolvers.js';
import { formatBadgeTime } from '../../../lib/formatBadgeTime.js';

const BASE_STEPS = ['vitalsigns', 'doctor', 'completed'];
// V139 (2026-05-31) — 4-step variant inserts "course" between doctor + completed.
const COURSE_STEPS = ['vitalsigns', 'doctor', 'course', 'completed'];

/**
 * Phase 28 (2026-05-14) — 3-dot stepper with connector lines for treatment lifecycle.
 * Shows vitals → doctor → completed with timestamps under each dot.
 *
 * V139 (2026-05-31) — opt-in 4th "course" step (between doctor + completed) for the
 * "นัดหมาย วันนี้" OPD card. The course step is driven by `courseDeducted` (a boolean
 * from resolveCourseDeducted — NOT a lifecycle timestamp):
 *   done(violet) = ตัดคอร์สแล้ว · not-deducted(muted "ไม่ตัดคอร์ส") = OPD เสร็จแต่ไม่ตัด · pending = ระหว่างทาง.
 * CDV treatment-history (③ 2026-05-31) opts in via withCourseStep (4 steps, keeps its teal/amber connectors).
 *
 * State per step:
 * - 'done': filled gradient + ✓ + glow per stage color (teal/amber/violet/emerald)
 * - 'not-deducted' (course only): muted dim dot + "–" + "ไม่ตัดคอร์ส" label  [② 2026-05-31, was 'warn'/amber Q1=B]
 * - 'pending-now' (only when isLatest && previous stage done): pulse animation
 * - 'pending-future': dim + step number
 * - 'skipped' (later stage done but this one not): "−" symbol + dim
 *
 * @param {Array<{key: string, time: string|null}>} lifecycle — from getTreatmentLifecycle
 * @param {boolean} isDark — theme flag (reserved for future variant; tokens drive colors)
 * @param {boolean} isLatest — whether this is the latest treatment row (controls pulse on next step)
 * @param {boolean} withCourseStep — V139 opt-in: insert the "course" step (4 dots)
 * @param {boolean} courseDeducted — V139: did this OPD deduct a course (resolveCourseDeducted)
 */
export function TreatmentLifecycleStepper({
  lifecycle = [],
  isDark = true,
  isLatest = false,
  withCourseStep = false,
  courseDeducted = false,
}) {
  const lc = Array.isArray(lifecycle) ? lifecycle : [];
  const keys = new Set(lc.map((s) => s && s.key).filter(Boolean));
  const STEP_KEYS = withCourseStep ? COURSE_STEPS : BASE_STEPS;
  const labels = getStepLabels(lc);
  const labelMap = { vitalsigns: labels.t, doctor: labels.a, completed: labels.e };
  const timeByKey = Object.fromEntries(lc.filter((s) => s && s.key).map((s) => [s.key, s.time]));
  // V139 — narrower step in the 4-step variant so the card footer band stays tidy.
  const stepMinW = withCourseStep ? 'min-w-[64px]' : 'min-w-[74px]';

  // V139 — "course" done-ness comes from the courseDeducted prop (not lifecycle keys);
  // all other steps come from the lifecycle key set.
  const isStepDone = (key) => (key === 'course' ? !!courseDeducted : keys.has(key));

  const stepStateForKey = (key, idx) => {
    if (key === 'course') {
      const cs = resolveCourseStepState({
        courseDeducted: !!courseDeducted,
        completedDone: keys.has('completed'),
      });
      if (cs === 'done') return 'done';
      if (cs === 'not-deducted') return 'not-deducted';
      // pending → pulse when doctor done + latest, else dim number
      return isLatest && keys.has('doctor') ? 'pending-now' : 'pending-future';
    }
    if (isStepDone(key)) return 'done';
    // Skipped if any LATER step is done
    const laterDone = STEP_KEYS.slice(idx + 1).some((k) => isStepDone(k));
    if (laterDone) return 'skipped';
    // Pending-now when previous step was done AND this is the latest treatment
    const prevKey = STEP_KEYS[idx - 1];
    const prevDone = idx > 0 && isStepDone(prevKey);
    if (isLatest && prevDone) return 'pending-now';
    return 'pending-future';
  };

  const dotClasses = (key, state) => {
    const base =
      'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all relative z-10 border-2';
    if (state === 'done') {
      const tones = {
        vitalsigns:
          'bg-gradient-to-br from-teal-500 to-teal-700 border-teal-300 text-white shadow-[0_0_12px_rgba(20,184,166,0.5)]',
        doctor:
          'bg-gradient-to-br from-amber-500 to-amber-700 border-amber-300 text-white shadow-[0_0_12px_rgba(245,158,11,0.5)]',
        course:
          'bg-gradient-to-br from-violet-500 to-violet-700 border-violet-300 text-white shadow-[0_0_12px_rgba(139,92,246,0.5)]',
        completed:
          'bg-gradient-to-br from-emerald-500 to-emerald-700 border-emerald-300 text-white shadow-[0_0_12px_rgba(16,185,129,0.5)]',
      };
      return `${base} ${tones[key]}`;
    }
    // ② (2026-05-31) — V139 'warn' (amber) block REMOVED. 'not-deducted' uses the default muted style below.
    if (state === 'pending-now') {
      return `${base} bg-amber-500/5 border-amber-300 text-amber-300 animate-pulse`;
    }
    // pending-future + skipped + not-deducted: dim
    return `${base} bg-[var(--bg-base)] border-[var(--bd-strong)] text-[var(--tx-faint)]`;
  };

  const labelClasses = (state) => {
    if (state === 'done')
      return 'text-[10px] font-bold mt-1.5 text-center leading-tight text-[var(--tx-primary)]';
    // ② (2026-05-31) — 'warn' (amber) label block REMOVED → 'not-deducted' uses the default muted label below.
    if (state === 'pending-now')
      return 'text-[10px] font-bold mt-1.5 text-center leading-tight text-amber-300';
    return 'text-[10px] font-bold mt-1.5 text-center leading-tight text-[var(--tx-muted)]';
  };

  // ② (2026-05-31) — course label: muted "ไม่ตัดคอร์ส" when not-deducted, else "คอร์ส".
  const labelFor = (key, state) =>
    key === 'course' ? (state === 'not-deducted' ? 'ไม่ตัดคอร์ส' : 'คอร์ส') : labelMap[key];

  // Connector at index `idx` is BETWEEN STEP_KEYS[idx] and STEP_KEYS[idx+1]
  const connClasses = (idx) => {
    const prevKey = STEP_KEYS[idx];
    const nextKey = STEP_KEYS[idx + 1];
    const prevDone = isStepDone(prevKey);
    const nextDone = isStepDone(nextKey);
    const base = 'flex-1 h-0.5 -mx-0.5 mt-[11px] z-0';
    // Vitals→Doctor: teal gradient when both done
    if (prevDone && nextDone && prevKey === 'vitalsigns' && nextKey === 'doctor') {
      return `${base} bg-gradient-to-r from-teal-300 via-teal-500 to-teal-700`;
    }
    // V139 — Doctor→Course: amber→violet when both done
    if (prevDone && nextDone && prevKey === 'doctor' && nextKey === 'course') {
      return `${base} bg-gradient-to-r from-amber-300 via-amber-500 to-violet-600`;
    }
    // V139 — Course→Completed: violet→emerald when both done
    if (prevDone && nextDone && prevKey === 'course' && nextKey === 'completed') {
      return `${base} bg-gradient-to-r from-violet-400 via-violet-600 to-emerald-500`;
    }
    // Doctor→Completed: amber gradient when both done (3-step path, no course)
    if (prevDone && nextDone && prevKey === 'doctor' && nextKey === 'completed') {
      return `${base} bg-gradient-to-r from-amber-300 via-amber-500 to-amber-700`;
    }
    // Skip-doctor edge: vitals + completed but no doctor → bridge with teal across both connectors
    if (keys.has('vitalsigns') && keys.has('completed') && !keys.has('doctor')) {
      return `${base} bg-gradient-to-r from-teal-300 via-teal-500 to-emerald-500`;
    }
    return `${base} bg-[var(--bd)]`;
  };

  return (
    <div className="flex items-start pr-3" data-testid="treatment-lifecycle-stepper">
      {STEP_KEYS.map((key, idx) => {
        const state = stepStateForKey(key, idx);
        const label = labelFor(key, state);
        const time = timeByKey[key];
        const formattedTime = time ? formatBadgeTime(time) : null;
        let dotContent;
        if (state === 'done') dotContent = <Check size={11} aria-hidden="true" />;
        else if (state === 'not-deducted') dotContent = <span>–</span>;
        else if (state === 'skipped') dotContent = <span>−</span>;
        else dotContent = <span>{idx + 1}</span>;
        return (
          <React.Fragment key={key}>
            <div className={`flex flex-col items-center ${stepMinW} flex-shrink-0`}>
              <div className={dotClasses(key, state)} data-testid="stepper-dot">
                {dotContent}
              </div>
              <div className={labelClasses(state)}>{label}</div>
              <div
                className={`text-[9px] font-mono font-semibold mt-0.5 tracking-wider ${
                  formattedTime ? 'text-[var(--tx-secondary)]' : 'text-[var(--tx-faint)]'
                }`}
              >
                {formattedTime || '—'}
              </div>
            </div>
            {idx < STEP_KEYS.length - 1 && (
              <div className={connClasses(idx)} data-testid="stepper-connector" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
