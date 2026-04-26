// V33-customer-create — Thai address cascade facade.
// PatientForm + CustomerFormModal + future EditCustomerForm = 3 call sites
// (Rule of 3 → extract). Single canonical helper for the 4-level cascade
// province → district → sub_district → postal_code.

import { THAI_PROVINCES } from '../utils.js';
import thaiAddressDB from '../data/thai-address-db.js';

export { THAI_PROVINCES, thaiAddressDB };

/** All Thai provinces, alphabetically sorted (ProClinic Unicode order). */
export function getProvinces() {
  return THAI_PROVINCES;
}

/** Districts within a province; [] if province unknown. */
export function getDistricts(province) {
  if (!province) return [];
  const node = thaiAddressDB[province];
  if (!node || typeof node !== 'object') return [];
  return Object.keys(node).sort((a, b) => a.localeCompare(b, 'th'));
}

/** Sub-districts within a district; [] if district unknown. */
export function getSubDistricts(province, district) {
  if (!province || !district) return [];
  const node = thaiAddressDB[province]?.[district];
  if (!node || typeof node !== 'object') return [];
  return Object.keys(node).sort((a, b) => a.localeCompare(b, 'th'));
}

/** Postal code for a sub-district; '' if not found. */
export function getPostalCode(province, district, subDistrict) {
  if (!province || !district || !subDistrict) return '';
  const code = thaiAddressDB[province]?.[district]?.[subDistrict];
  return typeof code === 'string' || typeof code === 'number' ? String(code) : '';
}

/**
 * Cascade reset on province change. Returns the patch to apply to the form
 * (preserves `province`, blanks district/sub_district/postal_code).
 */
export function cascadeOnProvinceChange(province) {
  return {
    province: province || '',
    district: '',
    sub_district: '',
    postal_code: '',
  };
}

/** Cascade reset on district change (preserves province + new district). */
export function cascadeOnDistrictChange(province, district) {
  return {
    province,
    district: district || '',
    sub_district: '',
    postal_code: '',
  };
}

/** Cascade on sub-district change — auto-fills postal_code from db. */
export function cascadeOnSubDistrictChange(province, district, subDistrict) {
  return {
    province,
    district,
    sub_district: subDistrict || '',
    postal_code: getPostalCode(province, district, subDistrict),
  };
}
