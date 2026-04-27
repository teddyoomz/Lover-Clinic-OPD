// V32-tris (2026-04-26) — shared smart auto-fill logic for document
// templates. Extracted from DocumentPrintModal so BulkPrintModal (and any
// future caller) can reuse the same field-key conventions + record-shape
// adapters.
//
// User directive (2026-04-25): "ใช้ความฉลาดเช็คด้วยว่า มีอะไรดึงมาได้ auto
// อีกบ้าง" — when a doctor/staff is picked in a staff-select field, auto-
// populate ALL related fields the template declares from the be_doctors /
// be_staff record.
//
// V32-tris (2026-04-26) bonus fix: the original implementation in
// DocumentPrintModal had a latent bug — the inner StaffSelectField only
// emitted onChange(displayName) without the record, so the auto-fill block
// never fired. Fixed in extracted shared component (StaffSelectField.jsx)
// by emitting (displayName, record) pair.
//
// Field-key convention: <baseKey><Suffix>
//   doctorName    → doctorLicenseNo, doctorPhone, doctorEmail,
//                   doctorPosition, doctorNameEn, doctorDepartment,
//                   doctorSignature
//   staffName     → staffLicenseNo, staffPhone, ...
//   assistantName → assistant{LicenseNo,Phone,Email,Position,NameEn,
//                              Department,Signature}
//   sellerName    → sellerLicenseNo, sellerPhone, ...

import { safeImgTag } from './documentPrintEngine.js';

/**
 * Compute display name for a be_doctors / be_staff record.
 * Handles ProClinic raw shape (firstname/lastname) + various aliases.
 */
export function composeStaffDisplayName(p) {
  if (!p || typeof p !== 'object') return '';
  const prefix = (p.prefix || '').trim();
  const first = (p.firstname || p.firstName || '').trim();
  const last = (p.lastname || p.lastName || '').trim();
  const composed = [prefix, first, last].filter(Boolean).join(' ').trim();
  if (composed) return composed;
  if (p.name) return p.name;
  if (p.fullName) return p.fullName;
  if (p.nickname) return p.nickname;
  return '(ไม่มีชื่อ)';
}

/**
 * Resolve the display name for a saved-on-sale seller record.
 *
 * Sales/quotations/memberships/deposits store sellers as
 *   `{ id, name, percent, total }` (4 callers, Rule of 3 met).
 *
 * Lookup chain:
 *   1. seller.name (saved at write time — usually present for new sales)
 *   2. seller.sellerName (legacy alias)
 *   3. lookup[].find(opt => opt.id === seller.id).name (covers legacy
 *      records where name wasn't captured at write time, e.g. early-V20
 *      sales saved before the dropdown change)
 *   4. ''   ← V22 contract: NEVER fall back to seller.id (numeric).
 *      User directive 2026-04-26: "ทุกที่แสดงชื่อแพทย์และพนง เป็น text
 *      ไม่ใช่ตัวเลย"
 *
 * Pure — no Firestore, no React. Easy to unit-test.
 *
 * @param {object} seller   — { id, name?, sellerName?, percent?, ... }
 * @param {Array<{id, name}>} [lookup]   — be_staff + be_doctors merged
 *                                         list (e.g. listAllSellers result)
 * @returns {string}  display name; empty string when nothing resolves
 */
export function resolveSellerName(seller, lookup) {
  if (!seller || typeof seller !== 'object') return '';
  const direct = typeof seller.name === 'string' ? seller.name.trim() : '';
  if (direct) return direct;
  const alt = typeof seller.sellerName === 'string' ? seller.sellerName.trim() : '';
  if (alt) return alt;
  if (Array.isArray(lookup) && seller.id != null && seller.id !== '') {
    const match = lookup.find((opt) => opt && String(opt.id) === String(seller.id));
    if (match && typeof match.name === 'string' && match.name.trim()) {
      return match.name.trim();
    }
  }
  // V22 lock — never leak numeric ID. Caller decides UI placeholder.
  return '';
}

/**
 * Build a "search-and-display" subtitle string for one staff/doctor record.
 * Used in dropdown lists to help admin pick the right person when there
 * are 27+ doctors with similar names.
 */
export function composeStaffSubtitle(p) {
  if (!p || typeof p !== 'object') return '';
  const parts = [];
  const role = p.position || p.role || '';
  const lic = p.licenseNo || p.medicalLicenseNo || p.staffLicenseNo || '';
  const nick = p.nickname || '';
  const email = p.email || '';
  const dept = p.department || p.section || '';
  const phone = p.phone || p.tel || '';
  if (role) parts.push(role);
  if (lic) parts.push(`เลขที่ ${lic}`);
  if (nick) parts.push(`ชื่อเล่น ${nick}`);
  if (dept) parts.push(dept);
  if (phone) parts.push(phone);
  if (email) parts.push(email);
  return parts.join(' · ');
}

/**
 * Compute the LIST of fields a staff-pick should auto-fill, based on
 * (a) the picked staff/doctor record and (b) the template's declared fields.
 *
 * The baseKey is derived from the picked field by stripping a "Name" suffix:
 *   "doctorName"    → baseKey: "doctor"
 *   "assistantName" → baseKey: "assistant"
 *   "sellerName"    → baseKey: "seller"
 *
 * Returns a partial Object<fieldKey, value> for fields that BOTH (a) exist
 * in seedFields AND (b) have a non-empty value derivable from the record.
 *
 * Pure: caller merges into its own state. Easy to unit-test.
 *
 * @param {object} record — be_doctors / be_staff record
 * @param {string} pickedFieldKey — the staff-select field key (e.g. "doctorName")
 * @param {Array<{key: string}>} seedFields — template.fields
 * @returns {Object<string, string>} fields to spread into the form values
 */
export function computeStaffAutoFill(record, pickedFieldKey, seedFields) {
  if (!record || !pickedFieldKey || !Array.isArray(seedFields)) return {};
  const baseKey = pickedFieldKey.replace(/Name$/, '');
  const has = (k) => seedFields.some(sf => sf.key === k);
  const firstNonEmpty = (...keys) => {
    for (const k of keys) if (record[k]) return record[k];
    return '';
  };

  const out = {};

  // License (multiple aliases for be_doctors vs be_staff)
  const licKey = `${baseKey}LicenseNo`;
  if (has(licKey)) {
    const v = firstNonEmpty('licenseNo', 'medicalLicenseNo', 'staffLicenseNo');
    if (v) out[licKey] = v;
  }
  // Phone
  const phoneKey = `${baseKey}Phone`;
  if (has(phoneKey)) {
    const v = firstNonEmpty('phone', 'tel', 'mobile');
    if (v) out[phoneKey] = v;
  }
  // Email
  const emailKey = `${baseKey}Email`;
  if (has(emailKey)) {
    const v = firstNonEmpty('email');
    if (v) out[emailKey] = v;
  }
  // Position / role
  const posKey = `${baseKey}Position`;
  if (has(posKey)) {
    const v = firstNonEmpty('position', 'role');
    if (v) out[posKey] = v;
  }
  // English name (fit-to-fly, bilingual certs)
  const enKey = `${baseKey}NameEn`;
  if (has(enKey)) {
    const en = `${record.firstnameEn || record.firstNameEn || ''} ${record.lastnameEn || record.lastNameEn || ''}`.trim();
    if (en) out[enKey] = en;
  }
  // Department
  const deptKey = `${baseKey}Department`;
  if (has(deptKey)) {
    const v = firstNonEmpty('department', 'section');
    if (v) out[deptKey] = v;
  }
  // Signature image (template can use {{{doctorSignature}}} raw-HTML to
  // embed an <img>). URL is allow-listed against http(s) + data:image/*
  // via safeImgTag — hostile URLs (javascript:, data:text/html, …) are
  // dropped, not injected.
  const sigKey = `${baseKey}Signature`;
  if (has(sigKey) && record.signatureUrl) {
    out[sigKey] = safeImgTag(record.signatureUrl, { alt: 'signature', style: 'max-height:60px' });
  }

  return out;
}

/**
 * Filter a list of staff/doctor records by a search query. Matches against
 * composed name + license + English name. Used by StaffSelectField dropdown.
 *
 * @param {Array<object>} list
 * @param {string} query
 * @returns {Array<object>}
 */
export function filterStaffByQuery(list, query) {
  const safe = Array.isArray(list) ? list : [];
  const q = String(query || '').toLowerCase().trim();
  if (!q) return safe;
  return safe.filter(p => {
    const n = composeStaffDisplayName(p).toLowerCase();
    const lic = (p.licenseNo || p.medicalLicenseNo || '').toLowerCase();
    const en = `${p.firstnameEn || p.firstNameEn || ''} ${p.lastnameEn || p.lastNameEn || ''}`.toLowerCase().trim();
    return n.includes(q) || lic.includes(q) || en.includes(q);
  });
}
