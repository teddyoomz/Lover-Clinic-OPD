/**
 * Phase 29.22 (2026-05-14) — pure validation helpers for be_recall_cases.
 * Mirror staff/doctor V41 soft-archive pattern.
 */

const CASE_NAME_MAX = 100;
const DAYS_MIN = 1;
const DAYS_MAX = 365;

export function emptyRecallCaseForm() {
  return { caseName: '', defaultDays: 7, isHidden: false };
}

export function normalizeRecallCase(form) {
  if (!form || typeof form !== 'object') {
    return { caseName: '', defaultDays: 0, isHidden: false };
  }
  const caseName = typeof form.caseName === 'string' ? form.caseName.trim() : '';
  const defaultDaysNum = Math.floor(Number(form.defaultDays));
  const defaultDays = Number.isFinite(defaultDaysNum) ? defaultDaysNum : 0;
  const isHidden = !!form.isHidden && form.isHidden !== 'false' && form.isHidden !== 0;
  return { caseName, defaultDays, isHidden };
}

export function validateRecallCase(form) {
  const n = normalizeRecallCase(form);
  if (!n.caseName) return 'กรุณากรอกชื่อเคส';
  if (n.caseName.length > CASE_NAME_MAX) return `ชื่อเคสยาวเกิน ${CASE_NAME_MAX} ตัวอักษร`;
  if (!Number.isInteger(n.defaultDays) || n.defaultDays < DAYS_MIN || n.defaultDays > DAYS_MAX) {
    return `ระยะเวลาต้องเป็นจำนวนเต็ม ${DAYS_MIN}-${DAYS_MAX} วัน`;
  }
  return null;
}

/**
 * Find an active (non-hidden) recall case by case-insensitive trimmed name.
 * @param {Array} cases
 * @param {string} name
 * @returns {object|null}
 */
export function findRecallCaseByName(cases, name) {
  if (!Array.isArray(cases) || cases.length === 0) return null;
  const needle = typeof name === 'string' ? name.trim().toLowerCase() : '';
  if (!needle) return null;
  return cases.find(c => (
    !c.isHidden && typeof c.caseName === 'string' && c.caseName.trim().toLowerCase() === needle
  )) || null;
}
