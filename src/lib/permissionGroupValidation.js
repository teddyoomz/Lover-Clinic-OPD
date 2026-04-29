// ─── Permission Group validation — Phase 11.7 pure helpers ────────────────
// Triangle (Rule F, 2026-04-20): `opd.js forms /admin/permission-group`
// revealed ~130 distinct permission checkboxes grouped into ~13 modules.
// Rather than a module × action matrix (plan's original design), ProClinic
// uses flat per-action toggles — we mirror that.
//
// Storage: permissions is a Record<string, boolean>. UI groups by module
// prefix for user convenience; data stays flat.

export const STATUS_OPTIONS = Object.freeze(['ใช้งาน', 'พักใช้งาน']);
export const NAME_MAX_LENGTH = 80;
export const DESC_MAX_LENGTH = 300;

/**
 * Permission catalog — modules → [{key, label}]. Module order is display
 * order. Key names match ProClinic's `permission_<key>` form fields
 * (prefix stripped for brevity in our docs).
 */
export const PERMISSION_MODULES = Object.freeze([
  {
    id: 'dashboard',
    label: 'แดชบอร์ด',
    items: [
      { key: 'dashboard', label: 'แดชบอร์ด' },
    ],
  },
  {
    id: 'customer',
    label: 'ลูกค้า',
    items: [
      { key: 'customer_management',       label: 'จัดการลูกค้า' },
      { key: 'customer_view',              label: 'ดูข้อมูลลูกค้าทั่วไป' },
      { key: 'customer_contact_view',      label: 'ดูข้อมูลการติดต่อของลูกค้า' },
      { key: 'branch_customer',            label: 'ดูเฉพาะลูกค้าสาขา' },
      { key: 'customer_delete',            label: 'ลบลูกค้า' },
      { key: 'customer_product_change',    label: 'เปลี่ยนสินค้าที่ขายให้ลูกค้า' },
      { key: 'change_customer_credit',     label: 'ปรับวงเงินบัตรสมาชิก' },
      { key: 'change_customer_point',      label: 'ปรับคะแนนบัตรสมาชิก' },
    ],
  },
  {
    id: 'appointment',
    label: 'นัดหมาย',
    items: [
      { key: 'appointment',                  label: 'จองนัดหมาย' },
      { key: 'appointment_self',             label: 'จองนัดหมาย (เฉพาะแพทย์)' },
      { key: 'coming_appointment',           label: 'นัดหมายวันนี้ (ทั้งหมด)' },
      { key: 'coming_appointment_self',      label: 'นัดหมายวันนี้ (เฉพาะแพทย์)' },
      { key: 'manage_own_appointments_only', label: 'จัดการนัดหมายเฉพาะผู้ใช้งาน' },
      { key: 'doctor_schedule_management',   label: 'จัดการตารางแพทย์' },
      { key: 'doctor_schedule_view',         label: 'ดูตารางแพทย์' },
      { key: 'user_schedule_management',     label: 'จัดการตารางพนักงาน' },
      { key: 'user_schedule_view',           label: 'ดูตารางพนักงาน' },
    ],
  },
  {
    id: 'treatment',
    label: 'การรักษา',
    items: [
      { key: 'treatment_management',   label: 'บันทึกการตรวจ OPD' },
      { key: 'treatment_df_management',label: 'เปลี่ยนแปลงค่ามือแพทย์/ผู้ช่วย' },
      { key: 'treatment_df_view',      label: 'ดูค่ามือแพทย์/ผู้ช่วย' },
      { key: 'treatment_cancel',       label: 'ยกเลิกการรักษา' },
    ],
  },
  {
    id: 'sale',
    label: 'การขาย',
    items: [
      { key: 'sale_management',         label: 'ขายคอร์ส' },
      { key: 'sale_view',               label: 'ดูรายการขาย' },
      { key: 'edit_sale_price',         label: 'แก้ไขราคาขาย' },
      { key: 'edit_sale_discount',      label: 'ระบุส่วนลดท้ายบิล' },
      { key: 'sale_cancel',             label: 'ยกเลิกการขาย' },
      { key: 'quotation_management',    label: 'ทำใบเสนอราคา' },
      { key: 'quotation_view',          label: 'ดูรายการใบเสนอราคา' },
      { key: 'online_sale',             label: 'ขายออนไลน์' },
      { key: 'online_sale_cancel',      label: 'ยกเลิกขายออนไลน์' },
    ],
  },
  {
    id: 'course_membership',
    label: 'คอร์ส / บัตรสมาชิก',
    items: [
      { key: 'course_management',        label: 'จัดการคอร์ส (ระดับสาขา)' },
      { key: 'course_view',              label: 'ดูคอร์ส' },
      { key: 'clinic_course_management', label: 'จัดการคอร์ส (ระดับคลินิก)' },
      { key: 'remaining_course',         label: 'จัดการคอร์สคงเหลือ' },
      { key: 'membership',               label: 'บัตรสมาชิก' },
      { key: 'membership_cancel',        label: 'ยกเลิกบัตรสมาชิก' },
    ],
  },
  {
    id: 'finance',
    label: 'การเงิน',
    items: [
      { key: 'deposit',            label: 'จ่ายมัดจำ' },
      { key: 'deposit_cancel',     label: 'ยกเลิกมัดจำ' },
      { key: 'wallet_management',  label: 'จัดการกระเป๋าเงิน' },
      { key: 'expense_management', label: 'จัดการรายจ่ายอื่นๆ' },
      { key: 'expense_view',       label: 'ดูรายจ่ายอื่นๆ' },
    ],
  },
  {
    id: 'stock',
    label: 'สต็อก',
    items: [
      { key: 'stock_management',            label: 'สต็อคสินค้า' },
      { key: 'view_stock_cost',             label: 'ดูต้นทุนสต็อค' },
      { key: 'stock_movement',              label: 'ดูรายการเคลื่อนไหวสต็อค' },
      { key: 'order_management',            label: 'นำสินค้าเข้าสต็อค / ยกเลิก' },
      { key: 'order',                       label: 'รายการนำเข้าสินค้า' },
      { key: 'vendor_sale_management',      label: 'ขายสินค้าในสต็อค' },
      { key: 'stock_change_management',     label: 'ปรับสินค้าในสต็อค' },
      { key: 'stock_transfer_management',   label: 'โอนสินค้าข้ามสาขา' },
      { key: 'stock_receiving_management',  label: 'รับสินค้าเข้าสาขา' },
      { key: 'stock_withdrawal_management', label: 'เบิกสินค้าจากคลังกลาง' },
      { key: 'branch_stock_withdrawal',     label: 'เบิกสินค้าจากสต็อค' },
      { key: 'central_stock',               label: 'คลังสินค้ากลาง' },
      { key: 'central_stock_setting',       label: 'ตั้งค่าคลังสินค้ากลาง' },
    ],
  },
  {
    id: 'marketing',
    label: 'การตลาด',
    items: [
      { key: 'promotion_management',        label: 'จัดการโปรโมชัน (ระดับสาขา)' },
      { key: 'promotion_view',              label: 'ดูโปรโมชัน' },
      { key: 'clinic_promotion_management', label: 'จัดการโปรโมชัน (ระดับคลินิก)' },
      { key: 'coupon_management',           label: 'จัดการคูปองส่วนลด' },
      { key: 'coupon_view',                 label: 'ดูคูปองส่วนลด' },
      { key: 'voucher_management',          label: 'จัดการ Voucher (ระดับสาขา)' },
      { key: 'voucher_view',                label: 'ดู Voucher' },
      { key: 'clinic_voucher_management',   label: 'จัดการ Voucher (ระดับคลินิก)' },
    ],
  },
  {
    id: 'df',
    label: 'ค่ามือแพทย์ / ผู้ช่วย',
    items: [
      { key: 'doctor_df_management',            label: 'ค่ามือแพทย์' },
      { key: 'doctor_assistance_df_management', label: 'ค่ามือผู้ช่วยแพทย์' },
      { key: 'course_df_group_df_management',   label: 'ค่ามือกลุ่ม' },
      { key: 'df_group',                        label: 'จัดการกลุ่มค่ามือ' },
    ],
  },
  {
    id: 'document',
    label: 'เอกสาร / ใบรับรอง',
    items: [
      { key: 'treatment_document',      label: 'เอกสารการรักษา' },
      { key: 'chart_document',          label: 'Chart' },
      { key: 'consent_document',        label: 'ใบยินยอม' },
      { key: 'sale_cancelation_document', label: 'เอกสารยกเลิกบิล' },
      { key: 'medical_certificate',     label: 'ใบรับรองแพทย์' },
      { key: 'medicine_label',          label: 'ฉลากยา' },
    ],
  },
  {
    id: 'analytics',
    label: 'วิเคราะห์',
    items: [
      { key: 'crm_insight',                    label: 'Customer Insight (RFM)' },
      { key: 'smart_audience',                 label: 'Smart Audience' },
      { key: 'revenue_analysis_by_procedure',  label: 'วิเคราะห์รายรับตามหัตถการ' },
      { key: 'appointment_analysis',           label: 'วิเคราะห์รายการนัดหมาย' },
      { key: 'appointment_analysis_user',      label: 'วิเคราะห์นัดหมายรายผู้ใช้งาน' },
      { key: 'payment_summary_analysis',       label: 'วิเคราะห์สรุปบัญชีรับชำระเงิน' },
    ],
  },
  {
    id: 'reports',
    label: 'รายงาน',
    items: [
      { key: 'report_appointment',                          label: 'รายงานนัดหมาย' },
      { key: 'report_sale',                                 label: 'รายงานการขาย' },
      { key: 'report_unpaid',                               label: 'รายการขายค้างชำระ' },
      { key: 'report_customer',                             label: 'รายงานลูกค้า' },
      { key: 'report_customer_sales',                       label: 'รายงานยอดขายรายลูกค้า' },
      { key: 'report_top_customer_sales',                   label: 'รายงาน Top ลูกค้า' },
      { key: 'report_paid_seller_sales',                    label: 'รายงานยอดขายรายผู้ขาย' },
      { key: 'report_top_seller_sales',                     label: 'รายงาน Top ผู้ขาย' },
      { key: 'report_top_course_sales',                     label: 'รายงาน Top คอร์ส' },
      { key: 'report_course',                               label: 'รายงานคอร์ส' },
      { key: 'report_course_usage',                         label: 'รายงานการใช้คอร์ส' },
      { key: 'report_treatment',                            label: 'รายงานประวัติการรักษา' },
      { key: 'report_treatment_profit',                     label: 'รายงานกำไรการรักษา' },
      { key: 'report_treatment_spending',                   label: 'รายงานสรุปใช้ยาประจำวัน' },
      { key: 'report_sum_treatment_spending',               label: 'สรุปใช้ยาตามช่วงเวลา' },
      { key: 'report_treatment_spending_by_treatment_date', label: 'สรุปใช้ยาตามวันที่รักษา' },
      { key: 'report_treatment_spending_by_sale_date',      label: 'สรุปใช้ยาตามวันที่ขาย' },
      { key: 'report_product',                              label: 'รายงานสินค้า' },
      { key: 'report_stock',                                label: 'รายงานสต็อค' },
      { key: 'report_stock_movement',                       label: 'รายงานเคลื่อนไหวสต็อค' },
      { key: 'report_order',                                label: 'รายงานนำเข้าสินค้า' },
      { key: 'report_nearing_expiration_stock',             label: 'รายงานล็อตใกล้หมดอายุ' },
      { key: 'report_expired_stock',                        label: 'รายงานล็อตหมดอายุ' },
      { key: 'report_nearing_out_of_stock',                 label: 'รายงานสินค้าใกล้หมดสต็อค' },
      { key: 'report_future_stock',                         label: 'รายงานตัดสต็อคล่วงหน้า' },
      { key: 'report_promotion',                            label: 'รายงานโปรโมชัน' },
      { key: 'report_coupon',                               label: 'รายงานคูปอง' },
      { key: 'report_voucher',                              label: 'รายงาน Voucher' },
      { key: 'report_remaining_course',                     label: 'รายงานคอร์สคงเหลือ' },
      { key: 'report_vendor_sales',                         label: 'รายงานขายสินค้าในสต็อค' },
      { key: 'report_online_sale',                          label: 'รายงานการขายออนไลน์' },
      { key: 'report_online_sale_payment',                  label: 'รับเงินจาก ProClinic' },
      { key: 'report_expense',                              label: 'รายงานรายจ่าย' },
      { key: 'report_other_expense',                        label: 'รายจ่ายอื่นๆ' },
      { key: 'report_doctor_expense',                       label: 'รายจ่ายค่ามือแพทย์' },
      { key: 'report_doctor_self_expense',                  label: 'ค่ามือแพทย์ (ตัวเอง)' },
      { key: 'report_employee_expense',                     label: 'ค่ามือผู้ช่วย' },
      { key: 'report_employee_self_expense',                label: 'ค่ามือผู้ช่วย (ตัวเอง)' },
      { key: 'report_profit_and_loss',                      label: 'รายงาน P&L' },
      { key: 'report_income',                               label: 'รายงานรายรับ' },
      { key: 'clinic_report_expense',                       label: 'รายจ่ายระดับคลินิก' },
      { key: 'clinic_report_treatment_spending',            label: 'ใช้ยาระดับคลินิก' },
    ],
  },
  {
    id: 'settings',
    label: 'ตั้งค่า / ข้อมูลพื้นฐาน',
    items: [
      { key: 'branch_management',             label: 'ตั้งค่าสาขา' },
      { key: 'holiday_setting',               label: 'ตั้งค่าวันหยุดสาขา' },
      { key: 'medical_instrument',            label: 'เครื่องหัตถการ' },
      { key: 'product_management',            label: 'จัดการสินค้า' },
      { key: 'default_product_unit',          label: 'จัดการหน่วยสินค้า' },
      { key: 'product_group',                 label: 'จัดการกลุ่มสินค้า' },
      { key: 'permission_group_management',   label: 'จัดการกลุ่มสิทธิ์การใช้งาน' },
      { key: 'doctor_management',             label: 'จัดการแพทย์ & ผู้ช่วย' },
      { key: 'user_management',               label: 'จัดการพนักงาน' },
      { key: 'google_calendar',               label: 'ตั้งค่า Google Calendar' },
      // Phase 16.3 (2026-04-29) — System Settings tab. Owner/admin grants
      // this to head-of-ops or designated power users so they can adjust
      // tab visibility / defaults / feature flags without needing the
      // full admin claim. See firestore.rules clinic_settings/system_config.
      { key: 'system_config_management',      label: 'ตั้งค่าระบบ (16.3)' },
    ],
  },
]);

/** Flat list of all permission keys for quick validation + all-on toggle. */
export const ALL_PERMISSION_KEYS = Object.freeze(
  PERMISSION_MODULES.flatMap(m => m.items.map(i => i.key)),
);

export function validatePermissionGroup(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    return ['form', 'missing form'];
  }

  if (typeof form.name !== 'string' || !form.name.trim()) {
    return ['name', 'กรุณากรอกชื่อตำแหน่ง/บทบาท'];
  }
  if (form.name.trim().length > NAME_MAX_LENGTH) {
    return ['name', `ชื่อเกิน ${NAME_MAX_LENGTH} ตัวอักษร`];
  }

  if (form.description != null && typeof form.description !== 'string') {
    return ['description', 'คำอธิบายต้องเป็นข้อความ'];
  }
  if (form.description && form.description.length > DESC_MAX_LENGTH) {
    return ['description', `คำอธิบายเกิน ${DESC_MAX_LENGTH} ตัวอักษร`];
  }

  if (form.permissions == null) {
    // empty map is OK (= no permissions granted)
  } else if (typeof form.permissions !== 'object' || Array.isArray(form.permissions)) {
    return ['permissions', 'permissions ต้องเป็น object'];
  } else {
    for (const [k, v] of Object.entries(form.permissions)) {
      if (typeof v !== 'boolean') {
        return [`permissions.${k}`, `permission ${k} ต้องเป็น boolean`];
      }
    }
  }

  if (form.status != null && !STATUS_OPTIONS.includes(form.status)) {
    return ['status', 'สถานะไม่ถูกต้อง'];
  }

  return null;
}

export function emptyPermissionGroupForm() {
  return {
    name: '',
    description: '',
    permissions: {},   // Record<string, boolean> — key omitted = implicitly false
    status: 'ใช้งาน',
  };
}

export function normalizePermissionGroup(form) {
  // Keep only boolean-TRUE entries with known keys. Drops unknown keys and
  // falsy values so the doc stays compact (user toggling N on + off leaves
  // the stored map with only the ones still on).
  const incoming = (form.permissions && typeof form.permissions === 'object') ? form.permissions : {};
  const knownKeys = new Set(ALL_PERMISSION_KEYS);
  const perms = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (v === true && knownKeys.has(k)) perms[k] = true;
  }
  return {
    ...form,
    name: String(form.name || '').trim(),
    description: typeof form.description === 'string' ? form.description.trim() : '',
    permissions: perms,
    status: form.status || 'ใช้งาน',
  };
}

/** Count granted permissions; used in tab cards. */
export function countPermissions(permissions) {
  if (!permissions || typeof permissions !== 'object') return 0;
  let n = 0;
  for (const v of Object.values(permissions)) {
    if (v === true) n++;
  }
  return n;
}

/** Helper: does this group grant a specific permission? Pure — ready for
 * consumers (11.8 wiring) to gate tabs/buttons. */
export function hasPermission(group, key) {
  if (!group || !group.permissions) return false;
  return group.permissions[key] === true;
}
