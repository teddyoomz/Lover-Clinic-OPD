// ─── Scheduled Tasks Registry (2026-06-02) ────────────────────────────────
//
// Pure, no Firebase imports. Single source of truth describing every scheduled
// task in the app, consumed by:
//   - ScheduledTasksTab.jsx (UI render + param defaults + safety notes)
//   - systemConfigClient.js (validate param min/max + known-task check)
//   - run-scheduled-task.js (dispatch by id → cron module)
//   - cron guards (TASK_ID strings + source-grep regression)
//
// Param DEFAULTS import each core's exported constant where one exists (true
// single source — change the core, the registry follows). Literals that live
// inside a cron file (dayBeforeHour/dayOfHour) are declared here; a source-grep
// parity test locks them to the cron-file value.
//
// SCOPE: 10 tasks, all Vercel crons. The V73 Firebase staff-chat fn was retired
// 2026-06-02 (duplicate of staffChatRetention). NO schedule field is editable —
// Vercel cron timing is deploy-time (vercel.json); the UI shows it read-only.

import { RETENTION_HOURS } from './chatHistoryRetentionCore.js';
import { RETENTION_DAYS as STAFF_CHAT_DAYS } from './staffChatRetentionCore.js';
import { RETENTION_DAYS as STOCK_MOVE_DAYS } from './stockMovementRetentionCore.js';
import { SESSION_TIMEOUT_MS } from '../constants.js';

const num = (key, label, def, min, max, unit) =>
  ({ key, label, type: 'number', default: def, min, max, unit });

export const SCHEDULED_TASKS = Object.freeze([
  Object.freeze({
    id: 'lineReminderFire', category: 'reminder', source: 'vercel',
    label: 'ส่ง LINE เตือนนัด',
    description: 'เตือนล่วงหน้า 1 วัน (20:00) + เตือนวันนัด (09:00)',
    scheduleHuman: 'ทุกชั่วโมง', cronPath: '/api/cron/line-reminder-fire',
    auditOpPrefix: 'line-reminder-daily', deletesData: false, safetyCritical: false,
    // เวลาเตือน (ก่อนวัน/วันนัด) ตั้งแยก "ต่อสาขา" ในตั้งค่า LINE OA แล้ว — ไม่ทำซ้ำที่นี่
    // (ที่นี่เป็น master kill-switch เปิด/ปิดทั้งหมด + รันตอนนี้ + ดูสถานะ).
    params: [],
  }),
  Object.freeze({
    id: 'lineReminderRetry', category: 'reminder', source: 'vercel',
    label: 'Retry งานเตือนที่ล้มเหลว',
    description: 'ลองส่งซ้ำสูงสุด 3 ครั้ง',
    scheduleHuman: 'ทุก 5 นาที', cronPath: '/api/cron/line-reminder-retry',
    auditOpPrefix: 'line-alert', deletesData: false, safetyCritical: false, params: [],
  }),
  Object.freeze({
    id: 'wholeSystemBackup', category: 'backup', source: 'vercel',
    label: 'สำรองทั้งระบบรายวัน',
    description: 'backup เต็ม + ลบ backup เก่ากว่าที่ตั้งไว้',
    scheduleHuman: 'ทุกวัน 03:00', cronPath: '/api/cron/whole-system-backup-daily',
    auditOpPrefix: 'whole-system-backup', deletesData: true, safetyCritical: true,
    safetyNote: 'ปิดแล้ว = ไม่มี backup รายวัน ถ้าระบบมีปัญหาจะกู้ข้อมูลไม่ได้',
    // จำนวนวันที่เก็บ backup (5) อยู่ใน executor (V122) — v1 ให้แค่ เปิด/ปิด + รันตอนนี้ + สถานะ
    params: [],
  }),
  Object.freeze({
    id: 'chatHistoryRetention', category: 'retention', source: 'vercel',
    label: 'ลบประวัติแชทลูกค้า',
    description: 'ลบ chat_history เก่า (เดิมโตจน snapshot ใหญ่ทำหน้า frontend ช้า)',
    scheduleHuman: 'ทุกวัน 04:00', cronPath: '/api/cron/chat-history-retention-sweep',
    auditOpPrefix: 'chat-history-retention-sweep', deletesData: true, safetyCritical: true,
    safetyNote: 'ปิดแล้ว = chat_history จะโตขึ้นเรื่อย ๆ จนหน้า frontend ช้า',
    params: [num('retentionHours', 'เก็บไว้', RETENTION_HOURS, 1, 720, 'ชม.')],
  }),
  Object.freeze({
    id: 'staffChatRetention', category: 'retention', source: 'vercel',
    label: 'ลบไฟล์แชทพนักงานเก่า',
    description: 'ลบข้อความ + ไฟล์แนบ staff-chat + กวาด orphan',
    scheduleHuman: 'ทุกวัน 02:45', cronPath: '/api/cron/staff-chat-retention-sweep',
    auditOpPrefix: 'staff-chat-retention-sweep', deletesData: true, safetyCritical: false,
    params: [num('retentionDays', 'เก็บไว้', STAFF_CHAT_DAYS, 1, 365, 'วัน')],
  }),
  Object.freeze({
    id: 'stockMovementRetention', category: 'retention', source: 'vercel',
    label: 'ลบประวัติเคลื่อนไหวสต็อกเก่า',
    description: 'archive → Storage แล้วลบ stock_movements ออกจาก Firestore',
    scheduleHuman: 'ทุกวัน 03:30', cronPath: '/api/cron/stock-movement-retention',
    auditOpPrefix: 'stock-movement-retention', deletesData: true, safetyCritical: false,
    params: [num('retentionDays', 'เก็บไว้', STOCK_MOVE_DAYS, 7, 730, 'วัน')],
  }),
  Object.freeze({
    id: 'stockLotCleanup', category: 'retention', source: 'vercel',
    label: 'ลบ lot สต็อกว่างซ้ำซ้อน',
    description: 'ต่อ (สินค้า×สาขา) เก็บ lot ที่เหลือ + อย่างมาก 1 placeholder ว่าง',
    scheduleHuman: 'ทุกวัน 03:45', cronPath: '/api/cron/stock-lot-cleanup',
    auditOpPrefix: 'stock-lot-cleanup', deletesData: true, safetyCritical: false, params: [],
  }),
  Object.freeze({
    id: 'patientLinkCleanup', category: 'retention', source: 'vercel',
    label: 'ลบลิงก์คนไข้ที่ไม่ใช้แล้ว',
    description: 'ลิงก์ว่าง (ไม่มีนัด + ไม่มีคอร์ส) เกิน grace → ลบ token',
    scheduleHuman: 'ทุกวัน 04:30', cronPath: '/api/cron/patient-link-cleanup-sweep',
    auditOpPrefix: 'patient-link-cleanup-sweep', deletesData: true, safetyCritical: false,
    params: [num('graceDays', 'Grace', 30, 1, 365, 'วัน')],
  }),
  Object.freeze({
    id: 'chartEditSessionSweep', category: 'sweep', source: 'vercel',
    label: 'กวาดเซสชันแก้ chart (tablet)',
    description: 'ยกเลิกเซสชันค้าง (client crash) + คืน tablet ให้ว่าง',
    scheduleHuman: 'ทุก 15 นาที', cronPath: '/api/cron/chart-edit-session-sweep',
    auditOpPrefix: 'chart-edit-session-sweep', deletesData: true, safetyCritical: false, params: [],
  }),
  Object.freeze({
    id: 'opdSessionCleanup', category: 'sweep', source: 'vercel',
    label: 'ลบ/กวาด OPD session ค้าง',
    description: 'archive / hide / delete opd_sessions หมดอายุ',
    scheduleHuman: 'ทุก 30 นาที', cronPath: '/api/cron/opd-session-cleanup-sweep',
    auditOpPrefix: 'opd-session-cleanup-sweep', deletesData: true, safetyCritical: true,
    safetyNote: 'ปิดแล้ว = opd_sessions ค้างสะสม → listener cascade + หน้าค้าง',
    params: [num('sessionTimeoutHours', 'หมดอายุหลัง', Math.round(SESSION_TIMEOUT_MS / 3600000), 1, 24, 'ชม.')],
  }),
]);

export const CATEGORY_LABELS = Object.freeze({
  reminder: 'LINE แจ้งเตือนนัดหมาย',
  backup: 'สำรองข้อมูล',
  retention: 'ลบข้อมูลเก่า (Retention)',
  sweep: 'กวาดล้างเซสชัน (Sweep)',
});
export const CATEGORY_ORDER = Object.freeze(['reminder', 'backup', 'retention', 'sweep']);
export const CATEGORY_ICON = Object.freeze({ reminder: '🔔', backup: '💾', retention: '🧹', sweep: '🔄' });

export function getTask(id) { return SCHEDULED_TASKS.find(t => t.id === id) || null; }
export function listParams(id) { return getTask(id)?.params || []; }
export function defaultParamsFor(id) {
  return Object.fromEntries(listParams(id).map(p => [p.key, p.default]));
}
