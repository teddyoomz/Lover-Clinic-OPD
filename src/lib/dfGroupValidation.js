// ─── DF (Doctor Fee) validation — Phase 13.3.1 ────────────────────────────
// Triangle (Rule F): admin-df-df-group.json + admin-df-doctor.json +
// admin-df-assistance.json scanned 2026-04-20. ProClinic stores per-course
// rates as `df_group_{groupId}_df_course_{courseId}` batch-POSTed on group
// save. We collapse into an embedded `rates[]` array on each group doc —
// realistic volume (~5 groups × ~200 courses) stays well under 1MB.
//
// Staff overrides live in a separate `be_df_staff_rates/{staffId}` doc keyed
// by staff — one override doc per staff with a rates[] array.
//
// Resolver: getRateForStaffCourse(staffId, courseId, groups, staffRates,
// doctorDfGroupId) → staff-override first, group fallback, null if neither.
//
// Rule E ✅, Rule H ✅ (OUR data in Firestore; never written to ProClinic).
//
// be_df_groups invariants (DFG-1..DFG-7):
//   DFG-1 name required
//   DFG-2 status in STATUS_OPTIONS
//   DFG-3 each rate has courseId + value ≥ 0 + type in RATE_TYPES
//   DFG-4 no duplicate courseId within rates[]
//   DFG-5 type='percent' ⇒ value ≤ 100
//   DFG-6 id format DFG-{MMYY}-{8hex} when present
//   DFG-7 rates array optional (empty = group with no rates, still valid)
//
// be_df_staff_rates invariants (DSR-1..DSR-5):
//   DSR-1 staffId required
//   DSR-2 each rate has courseId + value ≥ 0 + type in RATE_TYPES
//   DSR-3 no duplicate courseId within rates[]
//   DSR-4 type='percent' ⇒ value ≤ 100
//   DSR-5 rates array optional

export const STATUS_OPTIONS = Object.freeze(['active', 'disabled']);
export const RATE_TYPES = Object.freeze(['percent', 'baht']);
export const RATE_TYPE_LABEL = Object.freeze({ percent: '%', baht: 'บาท' });

const GROUP_ID_RE = /^DFG-\d{4}-[0-9a-f]{8}$/;

function trim(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function validateRatesArray(rates, fieldPrefix) {
  if (rates == null) return null;
  if (!Array.isArray(rates)) return [fieldPrefix, `${fieldPrefix} ต้องเป็น array`];
  const seen = new Set();
  for (const [i, r] of rates.entries()) {
    if (!r || typeof r !== 'object') return [fieldPrefix, `${fieldPrefix}[${i}] ต้องเป็น object`];
    const cid = trim(r.courseId ?? r.course_id);
    if (!cid) return [fieldPrefix, `${fieldPrefix}[${i}] ต้องมี courseId`];
    if (seen.has(cid)) return [fieldPrefix, `${fieldPrefix}[${i}] courseId ซ้ำ (${cid})`];
    seen.add(cid);
    const value = Number(r.value);
    if (!Number.isFinite(value) || value < 0) {
      return [fieldPrefix, `${fieldPrefix}[${i}].value ต้องไม่ติดลบ`];
    }
    const type = r.type;
    if (!RATE_TYPES.includes(type)) {
      return [fieldPrefix, `${fieldPrefix}[${i}].type ไม่ถูกต้อง`];
    }
    if (type === 'percent' && value > 100) {
      return [fieldPrefix, `${fieldPrefix}[${i}] percent เกิน 100`];
    }
  }
  return null;
}

export function validateDfGroupStrict(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    return ['form', 'missing form'];
  }
  const name = trim(form.name);
  if (!name) return ['name', 'กรุณากรอกชื่อกลุ่ม'];

  const status = form.status ?? 'active';
  if (!STATUS_OPTIONS.includes(status)) return ['status', 'สถานะไม่ถูกต้อง'];

  const ratesErr = validateRatesArray(form.rates, 'rates');
  if (ratesErr) return ratesErr;

  const id = trim(form.id);
  if (id && !GROUP_ID_RE.test(id)) return ['id', 'id ต้องเป็น DFG-MMYY-8hex'];

  return null;
}

export function emptyDfGroupForm() {
  return {
    id: '',
    name: '',
    note: '',
    status: 'active',
    rates: [],
    createdBy: '',
    branchId: '',
  };
}

export function normalizeDfGroup(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) return form;
  const out = { ...form };
  out.id = trim(out.id);
  out.name = trim(out.name);
  out.note = trim(out.note);
  out.status = STATUS_OPTIONS.includes(out.status) ? out.status : 'active';
  out.rates = Array.isArray(out.rates) ? out.rates.map((r) => ({
    courseId: trim(r?.courseId ?? r?.course_id),
    value: Math.max(0, Number(r?.value) || 0),
    type: RATE_TYPES.includes(r?.type) ? r.type : 'baht',
  })).filter((r) => r.courseId) : [];
  out.branchId = trim(out.branchId ?? out.branch_id);
  out.createdBy = trim(out.createdBy ?? out.created_by);
  return out;
}

export function generateDfGroupId(nowMs = Date.now()) {
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
    throw new Error('crypto.getRandomValues unavailable');
  }
  const thai = new Date(nowMs + 7 * 3600000);
  const mm = String(thai.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(thai.getUTCFullYear()).slice(-2);
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `DFG-${mm}${yy}-${hex}`;
}

// ─── Staff rate override validator (be_df_staff_rates) ─────────────────────

export function validateDfStaffRatesStrict(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    return ['form', 'missing form'];
  }
  const staffId = trim(form.staffId ?? form.staff_id);
  if (!staffId) return ['staffId', 'ต้องระบุ staffId'];
  const ratesErr = validateRatesArray(form.rates, 'rates');
  if (ratesErr) return ratesErr;
  return null;
}

export function emptyDfStaffRatesForm() {
  return {
    staffId: '',
    staffName: '',
    rates: [],
  };
}

export function normalizeDfStaffRates(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) return form;
  const out = { ...form };
  out.staffId = trim(out.staffId ?? out.staff_id);
  out.staffName = trim(out.staffName ?? out.staff_name);
  out.rates = Array.isArray(out.rates) ? out.rates.map((r) => ({
    courseId: trim(r?.courseId ?? r?.course_id),
    value: Math.max(0, Number(r?.value) || 0),
    type: RATE_TYPES.includes(r?.type) ? r.type : 'baht',
  })).filter((r) => r.courseId) : [];
  return out;
}

/**
 * Resolve the DF rate for a staff + course. Staff override wins; falls back
 * to the staff's DF group; null if neither covers the course.
 *
 * @param {string} staffId
 * @param {string} courseId
 * @param {string} dfGroupId        - the staff's assigned group id
 * @param {Array} groups            - be_df_groups docs
 * @param {Array} staffRatesDocs    - be_df_staff_rates docs
 * @returns {{ value, type, source: 'staff'|'group'|null }|null}
 */
export function getRateForStaffCourse(staffId, courseId, dfGroupId, groups, staffRatesDocs) {
  if (!staffId || !courseId) return null;
  const staffOverride = (staffRatesDocs || []).find((d) => String(d.staffId) === String(staffId));
  if (staffOverride) {
    const rate = (staffOverride.rates || []).find((r) => String(r.courseId) === String(courseId));
    if (rate) return { value: Number(rate.value) || 0, type: rate.type, source: 'staff' };
  }
  if (dfGroupId) {
    const group = (groups || []).find((g) => String(g.id || g.groupId) === String(dfGroupId));
    if (group) {
      const rate = (group.rates || []).find((r) => String(r.courseId) === String(courseId));
      if (rate) return { value: Number(rate.value) || 0, type: rate.type, source: 'group' };
    }
  }
  return null;
}

/**
 * Compute the DF payout amount for a single sale line given a resolved rate.
 * - percent: subtotal * (value / 100)
 * - baht:    value * qty
 * Returns 0 when rate is null or invalid.
 */
export function computeDfAmount(rate, lineSubtotal, qty) {
  if (!rate) return 0;
  const sub = Number(lineSubtotal) || 0;
  const q = Number(qty) || 0;
  if (rate.type === 'percent') return Math.max(0, sub * (Number(rate.value) / 100));
  if (rate.type === 'baht') return Math.max(0, Number(rate.value) * q);
  return 0;
}
