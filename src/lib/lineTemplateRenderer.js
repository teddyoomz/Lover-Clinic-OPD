/**
 * Phase 29 (2026-05-14) — LINE template rendering for recall messages.
 * Pure JS. Template variables in `{key}` syntax; missing keys replaced with empty string.
 */
import { formatThaiFullDate } from './recallResolvers.js';

/**
 * Phase 29 — frozen array of 3 default templates that ship with the system.
 * Admin can pick one or use 'custom' to type freely. Editing template text in
 * a settings UI is out of scope for Phase 29 (deferred to LineSettingsTab work).
 */
export const DEFAULT_RECALL_TEMPLATES = Object.freeze([
  {
    id: 'recall-default',
    label: '📅 แจ้งครบรอบ recall',
    text: 'คุณ {ชื่อ} สวัสดีค่ะ คลินิก Lover แจ้งให้ทราบว่าครบรอบบริการ {เรื่อง} ของคุณแล้วค่ะ หากสะดวกเข้ามารับบริการต่อ ทักหรือโทรกลับมาได้เลยนะคะ 😊',
  },
  {
    id: 'aftercare-followup',
    label: '💉 ติดตามผลฟิลเลอร์/botox',
    text: 'คุณ {ชื่อ} สวัสดีค่ะ ครบกำหนดติดตามอาการหลัง {เรื่อง} ของคุณแล้วค่ะ ผลและความรู้สึกหลังการรักษาเป็นอย่างไรบ้างคะ?',
  },
  {
    id: 'custom',
    label: '✏️ ข้อความ custom',
    text: '',
  },
]);

/**
 * Phase 29 — substitute `{key}` placeholders with values from `vars` map.
 * Missing keys → empty string. Non-string input → empty string.
 * @param {string} templateText
 * @param {Record<string,any>} vars
 * @returns {string}
 */
export function renderTemplate(templateText, vars) {
  if (!templateText || typeof templateText !== 'string') return '';
  const v = vars && typeof vars === 'object' ? vars : {};
  return templateText.replace(/\{([^}]+)\}/g, (_, key) => (v[key] !== undefined ? String(v[key]) : ''));
}

/**
 * Phase 29 — build the variable map for a recall message.
 * `N เดือน` left empty (caller computes if needed from recall.recallDate).
 * @param {object} recall
 * @param {object} customer
 * @returns {Record<string,string>}
 */
export function getRecallTemplateVariables(recall, customer) {
  return {
    'ชื่อ': customer?.displayName || customer?.firstName || '',
    'เรื่อง': recall?.reason || '',
    // 2026-07-05 (Q1=B — "recall ทุกที่ที่แสดงผลวันที่แบบเต็ม"): {วันที่} is
    // exposed to admins for custom LINE templates sent to customers → must be
    // the full Thai form "6 ก.ค. 2569" (พ.ศ. is correct for a Thai customer),
    // never the raw ISO "2026-07-06". formatThaiFullDate returns '' on missing.
    'วันที่': formatThaiFullDate(recall?.recallDate),
    'N เดือน': '',
    'คลินิก': 'Lover Clinic',
  };
}
