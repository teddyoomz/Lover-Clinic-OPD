// ─── Default Permission Group Seed — Phase 13.5.1 ─────────────────────────
// Idempotent seed of 5 starter permission groups. Runs once on first
// PermissionGroupsTab mount when `be_permission_groups` is empty.
//
// Customers can edit the assignment via PermissionGroupsTab afterwards;
// this seed exists so a fresh deployment isn't permission-paralyzed
// (chicken-and-egg: assigning permissionGroupId requires PermissionGroupsTab,
// which is admin-gated, which requires permissionGroupId).
//
// 5 groups (Thai labels match user expectations):
//   gp-owner     — เจ้าของกิจการ — full admin (all 130 keys)
//   gp-manager   — ผู้จัดการ — operations + reports, no permission/staff mgmt
//   gp-frontdesk — พนักงานต้อนรับ — customer/appointment/sale-view + deposit
//   gp-nurse     — พยาบาล — treatment + customer-view + stock-view
//   gp-doctor    — แพทย์ — treatment + customer-view + own-appointment
//
// IDs are stable strings (gp-* prefix). Stable so cross-staff references
// don't break if seed re-runs (which is idempotent — setDoc with `merge: false`
// would overwrite, but listPermissionGroups guards via "is empty" check).

import { ALL_PERMISSION_KEYS } from './permissionGroupValidation.js';

// Helper: create a permissions object with all flagged keys set to true.
function pickKeys(keys) {
  const out = {};
  for (const k of keys) {
    if (ALL_PERMISSION_KEYS.includes(k)) out[k] = true;
  }
  return out;
}

// Helper: create permissions for ALL keys (owner).
function allKeys() {
  const out = {};
  for (const k of ALL_PERMISSION_KEYS) out[k] = true;
  return out;
}

// Manager = all keys EXCEPT permission/user/branch admin (so manager can't
// promote themselves or wreck the master settings).
function managerKeys() {
  const exclude = new Set([
    'permission_group_management',
    'user_management',
    'branch_management',
  ]);
  const out = {};
  for (const k of ALL_PERMISSION_KEYS) {
    if (!exclude.has(k)) out[k] = true;
  }
  return out;
}

export const DEFAULT_PERMISSION_GROUPS = Object.freeze([
  {
    permissionGroupId: 'gp-owner',
    name: 'เจ้าของกิจการ',
    description: 'สิทธิ์เต็มทุกระบบ — เจ้าของคลินิก',
    status: 'ใช้งาน',
    permissions: allKeys(),
  },
  {
    permissionGroupId: 'gp-manager',
    name: 'ผู้จัดการ',
    description: 'สิทธิ์จัดการธุรกิจ — ยกเว้นจัดการสิทธิ์/พนักงาน/สาขา',
    status: 'ใช้งาน',
    permissions: managerKeys(),
  },
  {
    permissionGroupId: 'gp-frontdesk',
    name: 'พนักงานต้อนรับ',
    description: 'จองนัด, ลงทะเบียนลูกค้า, รับเงินมัดจำ',
    status: 'ใช้งาน',
    permissions: pickKeys([
      'dashboard',
      'customer_management', 'customer_view', 'customer_contact_view',
      'appointment', 'coming_appointment', 'doctor_schedule_view', 'user_schedule_view',
      'sale_view',
      'deposit', 'deposit_cancel',
      'coupon_view', 'voucher_view', 'promotion_view',
      'membership',
      'report_appointment', 'report_customer',
    ]),
  },
  {
    permissionGroupId: 'gp-nurse',
    name: 'พยาบาล / ผู้ช่วย',
    description: 'บันทึกการรักษา, ดูข้อมูลลูกค้า, ดูสต็อก',
    status: 'ใช้งาน',
    permissions: pickKeys([
      'dashboard',
      'customer_view', 'customer_contact_view',
      'appointment', 'coming_appointment',
      'treatment_management', 'treatment_df_view',
      'stock_management', 'stock_movement', 'order',
      'medical_instrument',
      'report_treatment', 'report_appointment',
    ]),
  },
  {
    permissionGroupId: 'gp-doctor',
    name: 'แพทย์',
    description: 'บันทึกการรักษา (เคสตัวเอง), ดูประวัติคนไข้, จัดตารางตัวเอง',
    status: 'ใช้งาน',
    permissions: pickKeys([
      'dashboard',
      'customer_view', 'customer_contact_view',
      'appointment_self', 'coming_appointment_self', 'manage_own_appointments_only',
      'doctor_schedule_view',
      'treatment_management', 'treatment_df_view',
      'doctor_df_management',
      'report_treatment', 'report_doctor_self_expense',
    ]),
  },
]);

/**
 * Idempotent seed. Reads existing groups via `listPermissionGroups()`; if
 * none exist, writes the 5 defaults via `savePermissionGroup()`. Otherwise
 * no-ops.
 *
 * @param {{
 *   listPermissionGroups: () => Promise<Array<object>>,
 *   savePermissionGroup: (id: string, data: object) => Promise<void>,
 * }} client
 * @returns {Promise<{ seeded: boolean, count: number }>}
 */
export async function seedDefaultPermissionGroups(client) {
  if (!client || typeof client.listPermissionGroups !== 'function' || typeof client.savePermissionGroup !== 'function') {
    throw new Error('seedDefaultPermissionGroups requires client with listPermissionGroups + savePermissionGroup');
  }
  const existing = await client.listPermissionGroups();
  if (Array.isArray(existing) && existing.length > 0) {
    return { seeded: false, count: existing.length };
  }
  for (const group of DEFAULT_PERMISSION_GROUPS) {
    await client.savePermissionGroup(group.permissionGroupId, group);
  }
  return { seeded: true, count: DEFAULT_PERMISSION_GROUPS.length };
}
