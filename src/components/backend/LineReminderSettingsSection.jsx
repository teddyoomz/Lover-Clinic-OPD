// ─── LineReminderSettingsSection — Task 11 (2026-05-15) ───────────────────────
//
// Per-branch controlled form section for LINE OA Appointment Reminder settings.
// Renders inside LineSettingsTab.jsx after the existing channel/Q&A/linking
// sections, BEFORE the Save bar. Edits the parent's form.lineReminder.* fields;
// parent persists via existing saveLineConfig flow.
//
// Spec ref §5 C.1:
//  - Toggle: เปิด/ปิด แจ้งเตือนสาขานี้
//  - 4 time pickers (dayBeforeHour, dayOfHour with "ปิด" option, quietHourStart, quietHourEnd)
//  - 3 textareas (templateDayBefore, templateDayOf, cancellationPolicyText)
//  - Token hints above textareas
//
// Pure controlled component — no state inside. onChange receives a patch in
// the shape `{ lineReminder: { ...prev, [field]: value } }` so the parent's
// existing `update(patch)` merger works without modification.

import { BellRing, AlertCircle } from 'lucide-react';

const HOURS_0_23 = Array.from({ length: 24 }, (_, i) => i);

const TOKEN_HINTS = '{{customerName}} {{branchName}} {{doctorName}} {{treatments}} {{date}} {{time}} {{cancellationPolicyText}}';

const inputCls =
  'w-full px-3 py-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-sm text-[var(--tx-primary)]';
const labelCls = 'block text-xs text-[var(--tx-muted)] mb-1';

export function LineReminderSettingsSection({ form, onChange }) {
  const r = form?.lineReminder || {};

  // Patch helper — merge the existing reminder block with the new field value
  // and emit as `{ lineReminder: ... }` so parent's `update(patch)` spread works.
  const patch = (field, value) => {
    if (typeof onChange !== 'function') return;
    onChange({ lineReminder: { ...r, [field]: value } });
  };

  return (
    <div
      className="rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] p-4 space-y-3"
      data-testid="line-reminder-settings-section"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BellRing size={16} className="text-[var(--tx-muted)]" />
          <h3 className="text-sm font-bold text-[var(--tx-heading)]">การแจ้งเตือนนัดหมาย (Appointment Reminder)</h3>
        </div>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={!!r.enabled}
            onChange={(e) => patch('enabled', e.target.checked)}
            data-field="lineReminder.enabled"
            aria-label="แจ้งเตือนสาขานี้"
          />
          แจ้งเตือนสาขานี้
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>เวลายิงข้อความ "วันก่อนนัด" (0-23)</label>
          <select
            value={Number.isFinite(r.dayBeforeHour) ? r.dayBeforeHour : 20}
            onChange={(e) => patch('dayBeforeHour', Number(e.target.value))}
            data-field="lineReminder.dayBeforeHour"
            className={inputCls}
          >
            {HOURS_0_23.map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>เวลายิงข้อความ "เช้าวันนัด" (เลือกปิดได้)</label>
          <select
            value={r.dayOfHour === null ? '__null__' : (Number.isFinite(r.dayOfHour) ? String(r.dayOfHour) : '9')}
            onChange={(e) => {
              const v = e.target.value;
              patch('dayOfHour', v === '__null__' ? null : Number(v));
            }}
            data-field="lineReminder.dayOfHour"
            className={inputCls}
          >
            <option value="__null__">ปิด (ไม่ยิงเช้าวันนัด)</option>
            {HOURS_0_23.map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Quiet Hours — เริ่ม (0-23)</label>
          <select
            value={Number.isFinite(r.quietHourStart) ? r.quietHourStart : 22}
            onChange={(e) => patch('quietHourStart', Number(e.target.value))}
            data-field="lineReminder.quietHourStart"
            className={inputCls}
          >
            {HOURS_0_23.map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Quiet Hours — สิ้นสุด (0-23)</label>
          <select
            value={Number.isFinite(r.quietHourEnd) ? r.quietHourEnd : 8}
            onChange={(e) => patch('quietHourEnd', Number(e.target.value))}
            data-field="lineReminder.quietHourEnd"
            className={inputCls}
          >
            {HOURS_0_23.map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
            ))}
          </select>
        </div>
      </div>

      <div className="px-2 py-1.5 rounded bg-amber-900/15 border border-amber-700/30 text-amber-200 text-[10px] flex items-start gap-1.5">
        <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
        <div>
          <strong>Tokens ใช้ใน template:</strong>
          <code className="ml-1 font-mono">{TOKEN_HINTS}</code>
        </div>
      </div>

      <div>
        <label className={labelCls}>ข้อความวันก่อนนัด (templateDayBefore)</label>
        <textarea
          rows={5}
          value={typeof r.templateDayBefore === 'string' ? r.templateDayBefore : ''}
          onChange={(e) => patch('templateDayBefore', e.target.value)}
          data-field="lineReminder.templateDayBefore"
          className={inputCls}
          placeholder="สวัสดีคุณ {{customerName}} ค่ะ พรุ่งนี้ {{date}} เวลา {{time}} ..."
        />
      </div>

      <div>
        <label className={labelCls}>ข้อความเช้าวันนัด (templateDayOf)</label>
        <textarea
          rows={4}
          value={typeof r.templateDayOf === 'string' ? r.templateDayOf : ''}
          onChange={(e) => patch('templateDayOf', e.target.value)}
          data-field="lineReminder.templateDayOf"
          className={inputCls}
          placeholder="สวัสดีคุณ {{customerName}} ค่ะ วันนี้คุณมีนัดเวลา {{time}} ..."
        />
      </div>

      <div>
        <label className={labelCls}>ข้อความนโยบายยกเลิก (cancellationPolicyText)</label>
        <textarea
          rows={2}
          value={typeof r.cancellationPolicyText === 'string' ? r.cancellationPolicyText : ''}
          onChange={(e) => patch('cancellationPolicyText', e.target.value)}
          data-field="lineReminder.cancellationPolicyText"
          className={inputCls}
          placeholder="กรุณาเลื่อน/ยกเลิกล่วงหน้า 24 ชั่วโมง"
        />
      </div>
    </div>
  );
}

export default LineReminderSettingsSection;
