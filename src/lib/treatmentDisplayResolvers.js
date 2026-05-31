// src/lib/treatmentDisplayResolvers.js
//
// Phase 27.0 (2026-05-14) — live-resolve doctor/assistant/branch display
// names for treatment doc readers. Mirrors Rule O productName live-resolve
// pattern (V46/AV24) — fallback chain LIVE map → cached name → empty.
// NEVER returns a raw doc ID (DOC-/STAFF-/BR- prefix).
//
// Phase 28 (2026-05-14) — extended with 6 lifecycle/display helpers for
// treatment-history redesign (status label, stepper, relative date, group,
// row action). See "Phase 28" block below.
//
// Pure JS. Branch-blind. No Firestore deps — caller passes pre-built Maps.
//
// Audit: AV42 (audit-anti-vibe-code) — every component displaying treatment
// doctorId / assistants[].id / branchId MUST use these helpers. Direct reads
// (detail.doctorId || / a.name || a.id) outside this module are forbidden.

import { formatBadgeTime, toBadgeMs } from './formatBadgeTime.js';

function _trimmedString(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Live-resolve a doctor display name.
 *
 * Fallback chain:
 *   1. doctorMap.get(doctorId).name (LIVE — from listDoctors({includeHidden:true}))
 *   2. cachedName (denormalized snapshot from save time)
 *   3. ''  — caller renders '—' or placeholder
 *
 * NEVER returns the raw doctorId. NEVER returns object/undefined/null.
 */
export function resolveDoctorDisplayName(doctorId, doctorMap, cachedName) {
  if (doctorId && doctorMap && typeof doctorMap.get === 'function') {
    const live = _trimmedString(doctorMap.get(String(doctorId))?.name);
    if (live) return live;
  }
  return _trimmedString(cachedName);
}

/**
 * Live-resolve a single assistant entry. Cross-collection lookup: try
 * doctorMap first (doctors CAN be assistants), then staffMap, then cache.
 *
 * Accepts entry as either string id or {id, name?}.
 */
export function resolveAssistantDisplayName(entry, doctorMap, staffMap) {
  if (!entry) return '';
  const id = typeof entry === 'string' ? entry : entry?.id;
  if (id) {
    if (doctorMap && typeof doctorMap.get === 'function') {
      const live = _trimmedString(doctorMap.get(String(id))?.name);
      if (live) return live;
    }
    if (staffMap && typeof staffMap.get === 'function') {
      const live = _trimmedString(staffMap.get(String(id))?.name);
      if (live) return live;
    }
  }
  if (entry && typeof entry === 'object') {
    return _trimmedString(entry.name);
  }
  return '';
}

/**
 * Live-resolve a branch display name.
 */
export function resolveBranchDisplayName(branchId, branchMap, cachedName) {
  if (branchId && branchMap && typeof branchMap.get === 'function') {
    const live = _trimmedString(branchMap.get(String(branchId))?.name);
    if (live) return live;
  }
  return _trimmedString(cachedName);
}

/**
 * Compose a comma-joined display string for assistant list.
 * Empty resolutions filtered out.
 */
export function resolveAssistantsDisplay(assistants, doctorMap, staffMap) {
  if (!Array.isArray(assistants)) return '';
  return assistants
    .map((a) => resolveAssistantDisplayName(a, doctorMap, staffMap))
    .filter(Boolean)
    .join(', ');
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 28 (2026-05-14) — treatment history redesign helpers
//
// 6 pure helpers extracted/derived from CDV.jsx inline logic to enable
// rich timeline UI (status labels, stepper, relative date, grouping,
// row action). Pure JS · branch-blind · no React/Firestore deps.
//
// Audit anchor: tests/phase-28-treatment-history-resolvers.test.js
// ─────────────────────────────────────────────────────────────────────────

/**
 * Phase 28 (2026-05-14) — derive lifecycle stages array for a treatment.
 * Stages: vitalsigns / doctor / completed.
 * Sorted by time ascending; entries without time go to end (Infinity).
 * Tolerant fallback per Phase 27.2-ter logic (mirrors CDV inline pre-compute
 * at lines 1067-1095 — extracted here for Rule C1 reuse + testability).
 *
 * @param {object} t — treatmentSummary entry
 * @returns {Array<{key: 'vitalsigns'|'doctor'|'completed', time: string|null}>}
 */
export function getTreatmentLifecycle(t) {
  if (!t || typeof t !== 'object') return [];
  const stages = [];
  const vStage = !!t.vitalsignsRecordedAt || t.status === 'vitalsigns-recorded';
  const vTime = t.vitalsignsRecordedAt
    || (t.status === 'vitalsigns-recorded' ? t.recordedAt : null);
  if (vStage) stages.push({ key: 'vitalsigns', time: vTime || null });

  const dStage = !!t.doctorRecordedAt || t.status === 'doctor-recorded';
  const dTime = t.doctorRecordedAt
    || (t.status === 'doctor-recorded' ? t.recordedAt : null);
  if (dStage) stages.push({ key: 'doctor', time: dTime || null });

  const cStage = !!t.completedAt
    || (!t.status && (!!t.editedAt || !!t.recordedAt || !!t.editedByName));
  const cTime = t.completedAt
    || (!t.status && t.editedAt ? t.editedAt : null)
    || (!t.status && t.recordedAt ? t.recordedAt : null);
  if (cStage) stages.push({ key: 'completed', time: cTime || null });

  stages.sort((a, b) => {
    // Phase 28 (2026-05-14) — Bangkok-stable sort using toBadgeMs which handles
    // BOTH ISO strings AND Firestore Timestamp objects ({toDate} / {seconds,nanoseconds}).
    // Code quality reviewer flagged: `new Date(fsTimestamp).getTime()` returns NaN,
    // breaking sort for production data where serverTimestamp() writes FS Timestamps.
    const am = a.time ? toBadgeMs(a.time) : Infinity;
    const bm = b.time ? toBadgeMs(b.time) : Infinity;
    return am - bm;
  });
  return stages;
}

/**
 * V139 (2026-05-31) — did THIS treatment / OPD record DEDUCT a course?
 * Reads `detail.courseItems` (deduction ledger) OR `detail.treatmentItems`
 * (fill-later course usage) on the RAW be_treatments doc. Mirrors V136
 * `loadedHasNoCourseUsage` (TFP:1029-1037, `const t = existing.detail`) — same
 * predicate, exposed here as a reusable SSOT for the OPD-card course step.
 * Purchase-only (`detail.purchasedItems`) is NOT a deduction → false.
 * Field path Rule-R verified 2026-05-31 (TOP-LEVEL courseItems = 0 on prod).
 *
 * @param {object} t — raw be_treatments doc (top-level + `detail`)
 * @returns {boolean}
 */
export function resolveCourseDeducted(t) {
  if (!t || typeof t !== 'object') return false;
  const d = (t.detail && typeof t.detail === 'object') ? t.detail : {};
  const ci = Array.isArray(d.courseItems) ? d.courseItems.length : 0;
  const ti = Array.isArray(d.treatmentItems) ? d.treatmentItems.length : 0;
  return ci > 0 || ti > 0;
}

/**
 * V139 — display state for the OPD-card "course" step (TreatmentLifecycleStepper).
 *   done    → ตัดคอร์สแล้ว (violet ✓)
 *   warn    → OPD เสร็จแล้วแต่ไม่ได้ตัด (amber "ยังไม่ตัด")  [Q1=B locked]
 *   pending → ยังไม่เสร็จ (stepper upgrades to pending-now pulse upstream)
 *
 * @param {{courseDeducted:boolean, completedDone:boolean}} [a]
 * @returns {'done'|'warn'|'pending'}
 */
export function resolveCourseStepState({ courseDeducted = false, completedDone = false } = {}) {
  if (courseDeducted) return 'done';
  if (completedDone) return 'warn';
  return 'pending';
}

/**
 * Phase 28 (2026-05-14) — Thai status label per 9-case lifecycle vocabulary.
 * Pure derivation from getTreatmentLifecycle output (key set only — not times).
 * `isLatest` differentiates "รอแพทย์บันทึก" (queue head) vs "ซักประวัติเท่านั้น"
 * (older row that never advanced).
 *
 * @param {object} t — treatmentSummary entry
 * @param {boolean} [isLatest=false]
 * @returns {string} Thai status label
 */
export function getTreatmentStatusLabel(t, isLatest = false) {
  const lc = getTreatmentLifecycle(t);
  if (lc.length === 0) return 'ยังไม่บันทึก';
  const has = (k) => lc.some((s) => s.key === k);
  const hasV = has('vitalsigns');
  const hasD = has('doctor');
  const hasC = has('completed');

  if (hasV && hasD && hasC) return 'เสร็จสิ้น · ครบ 3 ขั้น';
  if (hasV && hasC && !hasD) return 'เสร็จสิ้น · ข้ามแพทย์';
  if (hasD && hasC && !hasV) return 'เสร็จสิ้น · ข้ามซักประวัติ';
  if (hasV && hasD && !hasC) return 'ครบขั้นแพทย์ · รอบันทึก';
  if (hasC && !hasV && !hasD) return 'เสร็จสิ้น · ตรงเข้าบันทึก';
  if (hasD && !hasV && !hasC) return 'แพทย์บันทึกแล้ว · รอเสร็จ';
  if (hasV && !hasD && !hasC) return isLatest ? 'รอแพทย์บันทึก' : 'ซักประวัติเท่านั้น';
  return 'ยังไม่บันทึก';
}

/**
 * Phase 28 (2026-05-14) — context-aware stepper labels (3 dots).
 * Pure derivation from lifecycle KEYS only (timestamps ignored).
 *
 *   t = vitals position label
 *   a = doctor position label
 *   e = completed position label (always "เสร็จ")
 *
 * Vitals position:
 *   - "ซักประวัติ" if vitals done OR no later stage done (default)
 *   - "ข้าม"     if any later stage (doctor or completed) done WITHOUT vitals
 *
 * Doctor position:
 *   - "แพทย์"      if doctor done
 *   - "ข้ามแพทย์"  if vitals + completed done but NO doctor (skip-doctor path)
 *   - "รอแพทย์"    if only vitals done (waiting for doctor)
 *   - "แพทย์"      otherwise (default/muted — stage name, NOT "skip"; EOD+7)
 *
 * @param {Array<{key:string, time?:string}>} lifecycle
 * @returns {{t:string, a:string, e:string}}
 */
export function getStepLabels(lifecycle) {
  const lc = Array.isArray(lifecycle) ? lifecycle : [];
  const has = (k) => lc.some((s) => s && s.key === k);
  const hasV = has('vitalsigns');
  const hasD = has('doctor');
  const hasC = has('completed');

  // Vitals slot
  let tLabel;
  if (hasV) tLabel = 'ซักประวัติ';
  else if (hasD || hasC) tLabel = 'ข้าม';
  else tLabel = 'ซักประวัติ';

  // Doctor slot
  let aLabel;
  if (hasD) aLabel = 'แพทย์';
  else if (hasV && hasC && !hasD) aLabel = 'ข้ามแพทย์';
  else if (hasV && !hasC) aLabel = 'รอแพทย์';
  // EOD+7 (2026-05-26) — default/muted doctor slot shows the STAGE NAME "แพทย์"
  // (was "ข้าม"). On a fresh/empty card the middle dot is the doctor stage that
  // is waiting to be recorded — "ข้าม" (skip) was confusing there. The genuine
  // skip-doctor case keeps its explicit "ข้ามแพทย์" label above. Per user.
  else aLabel = 'แพทย์';

  return { t: tLabel, a: aLabel, e: 'เสร็จ' };
}

/**
 * Phase 28 (2026-05-14) — Bangkok-stable relative-date label.
 *
 * Parses YYYY-MM-DD inputs as midday-UTC (`Date.UTC(y, mo-1, d, 12, 0, 0)`)
 * to keep the day stable in Bangkok-local regardless of test/server TZ
 * (per Rule on TZ — V53/Bangkok midday-UTC parse pattern).
 *
 * Buckets:
 *   0       → "วันนี้"
 *   1       → "เมื่อวาน"
 *   2-6     → "{N} วันที่แล้ว"
 *   7-29    → "{floor(N/7)} สัปดาห์ที่แล้ว"
 *   30-364  → "{floor(N/30)} เดือนที่แล้ว"
 *   ≥365    → "{floor(N/365)} ปีที่แล้ว"
 *
 * Returns '' for invalid inputs OR future dates.
 *
 * @param {string} dateISO    'YYYY-MM-DD' for the past date
 * @param {string} todayISO   'YYYY-MM-DD' for "today" reference
 * @returns {string}
 */
export function computeRelativeThaiDateLabel(dateISO, todayISO) {
  const past = _parseISOMiddayUTC(dateISO);
  const today = _parseISOMiddayUTC(todayISO);
  if (past == null || today == null) return '';
  const diffMs = today - past;
  if (diffMs < 0) return '';
  const daysAgo = Math.round(diffMs / (24 * 60 * 60 * 1000));
  if (daysAgo === 0) return 'วันนี้';
  if (daysAgo === 1) return 'เมื่อวาน';
  if (daysAgo < 7) return `${daysAgo} วันที่แล้ว`;
  if (daysAgo < 30) return `${Math.floor(daysAgo / 7)} สัปดาห์ที่แล้ว`;
  if (daysAgo < 365) return `${Math.floor(daysAgo / 30)} เดือนที่แล้ว`;
  return `${Math.floor(daysAgo / 365)} ปีที่แล้ว`;
}

/**
 * Internal — parse 'YYYY-MM-DD' string as midday-UTC.
 * Returns ms or null on invalid input.
 */
function _parseISOMiddayUTC(s) {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const ms = Date.UTC(y, mo - 1, d, 12, 0, 0);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Phase 28 (2026-05-14) — interleave date headers between consecutive same-date
 * rows. Caller pre-sorts rows (typically by `t.date` desc); this helper does
 * NOT re-sort — it groups consecutive same-date rows under one header.
 *
 * Output shape:
 *   [
 *     { type: 'header', date: 'YYYY-MM-DD', count: N },
 *     { type: 'row',    t: <row1> },
 *     { type: 'row',    t: <row2> },
 *     ...
 *   ]
 *
 * Rows with missing/falsy `date` field are bucketed under date `''`.
 *
 * @param {Array<{date?:string}>} rows
 * @returns {Array<{type:'header'|'row', date?:string, count?:number, t?:object}>}
 */
export function groupTreatmentsByDate(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const out = [];
  // Bucket consecutive same-date rows
  const groups = [];
  let currentDate = null;
  let currentBucket = null;
  for (const r of rows) {
    const date = (r && typeof r.date === 'string') ? r.date : '';
    if (date !== currentDate) {
      currentDate = date;
      currentBucket = { date, rows: [] };
      groups.push(currentBucket);
    }
    currentBucket.rows.push(r);
  }
  for (const g of groups) {
    out.push({ type: 'header', date: g.date, count: g.rows.length });
    for (const r of g.rows) {
      out.push({ type: 'row', t: r });
    }
  }
  return out;
}

/**
 * Phase 28 (2026-05-14) — primary action-button copy for a treatment row.
 *
 * Pure derivation from a getTreatmentLifecycle output:
 *   - empty/null/undefined         → { kind: 'unknown',     label: '' }
 *   - lifecycle has 'completed'    → { kind: 'completed',   label: '✓ บันทึก HH:MM' }
 *                                     (or '✓ บันทึกแล้ว' when time missing)
 *   - lifecycle non-empty otherwise→ { kind: 'in-progress', label: '⌛ in progress' }
 *
 * @param {Array<{key:string, time?:string|null}>} lifecycle
 * @returns {{kind:'unknown'|'in-progress'|'completed', label:string}}
 */
export function computeRowAction(lifecycle) {
  if (!Array.isArray(lifecycle) || lifecycle.length === 0) {
    return { kind: 'unknown', label: '' };
  }
  const completed = lifecycle.find((s) => s && s.key === 'completed');
  if (completed) {
    const timeStr = completed.time ? formatBadgeTime(completed.time) : '';
    return {
      kind: 'completed',
      label: timeStr ? `✓ บันทึก ${timeStr}` : '✓ บันทึกแล้ว',
    };
  }
  return { kind: 'in-progress', label: '⌛ in progress' };
}
