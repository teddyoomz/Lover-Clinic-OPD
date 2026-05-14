# LINE OA Appointment Reminder Implementation Plan (per-branch OA)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship per-branch LINE OA appointment reminder system that fires hourly, supports day-before + day-of windows, leverages existing Phase BS V3 `be_line_configs/{branchId}` infrastructure, and supports multi-branch expansion when other branches add their own LINE OA in the future.

**Architecture:** Vercel Cron (hourly + 5-min retry) → reads per-branch `be_line_configs/{branchId}.lineReminder` settings → looks up customer's branch-scoped lineUserId via `lineUserId_byBranch[branchId]` (with legacy customer.lineUserId fallback for V32-tris-ter customers at their creation branch) → Push API call uses per-branch channelAccessToken → idempotency via `be_line_reminder_log` doc per `(appointmentId, reminderType)`. Webhook extended with postback handler (✓ ยืนยัน / เลื่อน / ติดต่อ) + opt-out intents ("หยุดแจ้งเตือน" / "เริ่มแจ้งเตือน"). UI: NEW shared `<CustomerOption contextBranchId={...} />` with 🟢/⚪️ LINE badges in 6 callsites + auto-tick in 5 appointment modals + 3 new sections in LineSettingsTab + opt-out in CustomerDetailView.

**Tech Stack:** Node.js (firebase-admin + Vercel serverless), React (existing patterns), Vitest 4 (unit + RTL), Playwright (optional P4). Pure ESM throughout. No new deps.

**Spec:** `docs/superpowers/specs/2026-05-15-line-oa-appointment-reminder-design.md`. Each task references the relevant section.

---

## Pre-flight (do once before Task 1)

- [ ] **Read the spec end-to-end** at `docs/superpowers/specs/2026-05-15-line-oa-appointment-reminder-design.md`. Pay attention to §3 (pipeline), §4 (schema), §5 (UI), §18 (LR-1..LR-5 invariants).
- [ ] **Verify Phase BS V3 helpers exist**:
  ```bash
  grep -n "export function getLineConfigForBranch\|export function resolveLineConfigForWebhook\|export function resolveLineConfigForAdmin" api/admin/_lib/lineConfigAdmin.js
  ```
  Expected: all 3 functions exported. (They are — confirmed during spec write.)
- [ ] **Verify legacy customer schema**:
  ```bash
  grep -n "lineUserId\|lineDisplayName\|lineLinkedAt" src/lib/lineConfigClient.js src/lib/backendClient.js | head -20
  ```
  Expected: V32-tris-ter fields are read in customer linking flow.
- [ ] **Verify build clean from current master**: `npm run build` — green.

---

## Task 1 — Extend `lineConfigClient.js` DEFAULT_LINE_CONFIG + validateLineConfig

**Spec ref:** §4 schema (lineReminder block); §10 lineConfigClient.

**Files:**
- Modify: `src/lib/lineConfigClient.js`
- Test: `tests/line-reminder-config-defaults.test.js` (NEW)

- [ ] **Step 1: Write failing tests**

`tests/line-reminder-config-defaults.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import { DEFAULT_LINE_CONFIG, validateLineConfig } from '../src/lib/lineConfigClient.js';

describe('Task 1 — lineReminder defaults + validation', () => {
  it('T1.1 DEFAULT_LINE_CONFIG.lineReminder has all required fields', () => {
    expect(DEFAULT_LINE_CONFIG.lineReminder).toBeDefined();
    expect(DEFAULT_LINE_CONFIG.lineReminder.enabled).toBe(false);
    expect(DEFAULT_LINE_CONFIG.lineReminder.dayBeforeHour).toBe(20);
    expect(DEFAULT_LINE_CONFIG.lineReminder.dayOfHour).toBe(9);
    expect(DEFAULT_LINE_CONFIG.lineReminder.quietHourStart).toBe(22);
    expect(DEFAULT_LINE_CONFIG.lineReminder.quietHourEnd).toBe(8);
    expect(typeof DEFAULT_LINE_CONFIG.lineReminder.templateDayBefore).toBe('string');
    expect(typeof DEFAULT_LINE_CONFIG.lineReminder.templateDayOf).toBe('string');
    expect(typeof DEFAULT_LINE_CONFIG.lineReminder.cancellationPolicyText).toBe('string');
  });

  it('T1.2 Templates contain required tokens', () => {
    const t = DEFAULT_LINE_CONFIG.lineReminder.templateDayBefore;
    expect(t).toContain('{{customerName}}');
    expect(t).toContain('{{branchName}}');
    expect(t).toContain('{{date}}');
    expect(t).toContain('{{time}}');
    const o = DEFAULT_LINE_CONFIG.lineReminder.templateDayOf;
    expect(o).toContain('{{customerName}}');
    expect(o).toContain('{{time}}');
  });

  it('T1.3 validateLineConfig accepts valid lineReminder', () => {
    const config = {
      ...DEFAULT_LINE_CONFIG,
      lineReminder: { enabled: true, dayBeforeHour: 20, dayOfHour: 9, quietHourStart: 22, quietHourEnd: 8,
        templateDayBefore: 'x', templateDayOf: 'x', cancellationPolicyText: 'x' },
    };
    expect(validateLineConfig(config).valid).toBe(true);
  });

  it('T1.4 validateLineConfig rejects out-of-range hours', () => {
    const config = { ...DEFAULT_LINE_CONFIG, lineReminder: { ...DEFAULT_LINE_CONFIG.lineReminder, dayBeforeHour: 25 } };
    const r = validateLineConfig(config);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/dayBeforeHour/);
  });

  it('T1.5 validateLineConfig accepts dayOfHour=null (disabled day-of window)', () => {
    const config = { ...DEFAULT_LINE_CONFIG, lineReminder: { ...DEFAULT_LINE_CONFIG.lineReminder, dayOfHour: null } };
    expect(validateLineConfig(config).valid).toBe(true);
  });

  it('T1.6 validateLineConfig rejects when reminder.enabled=true but no channelAccessToken', () => {
    const config = {
      ...DEFAULT_LINE_CONFIG,
      enabled: true,
      channelAccessToken: '',
      lineReminder: { ...DEFAULT_LINE_CONFIG.lineReminder, enabled: true },
    };
    const r = validateLineConfig(config);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/channelAccessToken/);
  });

  it('T1.7 quiet-hour fields accept wrap-around (start > end)', () => {
    const config = {
      ...DEFAULT_LINE_CONFIG,
      lineReminder: { ...DEFAULT_LINE_CONFIG.lineReminder, quietHourStart: 22, quietHourEnd: 8 },
    };
    expect(validateLineConfig(config).valid).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/line-reminder-config-defaults.test.js
```
Expected: FAIL — `DEFAULT_LINE_CONFIG.lineReminder` undefined.

- [ ] **Step 3: Implement DEFAULT_LINE_CONFIG.lineReminder + validateLineConfig extension**

Open `src/lib/lineConfigClient.js`. Find the `DEFAULT_LINE_CONFIG` export. Add:

```javascript
// Inside DEFAULT_LINE_CONFIG (after existing fields):
  lineReminder: {
    enabled: false,
    dayBeforeHour: 20,
    dayOfHour: 9,
    quietHourStart: 22,
    quietHourEnd: 8,
    templateDayBefore: 'สวัสดีคุณ {{customerName}} ค่ะ พรุ่งนี้ {{date}} เวลา {{time}} คุณมีนัดที่สาขา {{branchName}} กับ {{doctorName}}\nบริการ: {{treatments}}\n\n{{cancellationPolicyText}}',
    templateDayOf: 'สวัสดีคุณ {{customerName}} ค่ะ วันนี้คุณมีนัดเวลา {{time}} ที่สาขา {{branchName}} กับ {{doctorName}}\nบริการ: {{treatments}}',
    cancellationPolicyText: 'กรุณาเลื่อน/ยกเลิกล่วงหน้า 24 ชั่วโมง',
  },
```

Find `validateLineConfig`. Add this block AFTER existing validation:

```javascript
// lineReminder block validation
if (config.lineReminder) {
  const r = config.lineReminder;
  if (typeof r.enabled !== 'boolean') errors.push('lineReminder.enabled ต้องเป็น boolean');
  if (typeof r.dayBeforeHour !== 'number' || r.dayBeforeHour < 0 || r.dayBeforeHour > 23) {
    errors.push('lineReminder.dayBeforeHour ต้องอยู่ในช่วง 0-23');
  }
  if (r.dayOfHour !== null && (typeof r.dayOfHour !== 'number' || r.dayOfHour < 0 || r.dayOfHour > 23)) {
    errors.push('lineReminder.dayOfHour ต้องอยู่ในช่วง 0-23 หรือ null');
  }
  if (typeof r.quietHourStart !== 'number' || r.quietHourStart < 0 || r.quietHourStart > 23) {
    errors.push('lineReminder.quietHourStart ต้องอยู่ในช่วง 0-23');
  }
  if (typeof r.quietHourEnd !== 'number' || r.quietHourEnd < 0 || r.quietHourEnd > 23) {
    errors.push('lineReminder.quietHourEnd ต้องอยู่ในช่วง 0-23');
  }
  if (r.enabled && config.enabled && !config.channelAccessToken) {
    errors.push('lineReminder.enabled แต่ยังไม่มี channelAccessToken — ต้องตั้งค่า Channel Access Token ก่อน');
  }
  for (const k of ['templateDayBefore', 'templateDayOf', 'cancellationPolicyText']) {
    if (typeof r[k] !== 'string') errors.push(`lineReminder.${k} ต้องเป็น string`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/line-reminder-config-defaults.test.js
```
Expected: 7/7 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lineConfigClient.js tests/line-reminder-config-defaults.test.js
git commit -m "feat(line-reminder): Task 1 — extend DEFAULT_LINE_CONFIG + validateLineConfig with lineReminder block"
```

---

## Task 2 — NEW `src/lib/lineReminderTemplate.js`

**Spec ref:** §6 Flex format; §10 lineReminderTemplate helpers.

**Files:**
- Create: `src/lib/lineReminderTemplate.js`
- Test: `tests/lineReminderTemplate.test.js` (NEW)
- Test: `tests/lineReminderTemplate-parse-postback.test.js` (NEW)

- [ ] **Step 1: Write failing tests — Flex builder + token resolver**

`tests/lineReminderTemplate.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import { buildReminderFlex, resolveTokens, renderTemplate, getDefaultFlexShape } from '../src/lib/lineReminderTemplate.js';

const baseInput = {
  cust: { fullName: 'นาย โอ๊ค', lineDisplayName: 'OakLINE' },
  appt: { id: 'BA-1778001-aaa', appointmentDate: '2026-05-16', startTime: '14:30' },
  branch: { branchName: 'นครราชสีมา', branchId: 'BR-X' },
  doctor: { name: 'นพ. สมชาย' },
  treatments: [{ name: 'ฉีดผิว' }, { name: 'เลเซอร์' }],
  branchSettings: { cancellationPolicyText: 'กรุณาเลื่อน/ยกเลิกล่วงหน้า 24 ชม.' },
  clinicName: 'LoverClinic',
};

describe('T2 lineReminderTemplate.resolveTokens', () => {
  it('T2.1 resolves all canonical tokens', () => {
    const tokens = resolveTokens(baseInput);
    expect(tokens.customerName).toBe('นาย โอ๊ค');
    expect(tokens.branchName).toBe('นครราชสีมา');
    expect(tokens.doctorName).toBe('นพ. สมชาย');
    expect(tokens.treatments).toBe('ฉีดผิว, เลเซอร์');
    expect(tokens.time).toBe('14:30');
    expect(tokens.appointmentId).toBe('BA-1778001-aaa');
    expect(tokens.cancellationPolicyText).toMatch(/24 ชม\./);
  });

  it('T2.2 date is Thai dd/mm/yyyy พ.ศ.', () => {
    const tokens = resolveTokens(baseInput);
    expect(tokens.date).toBe('16/05/2569');
  });

  it('T2.3 missing doctor falls back to "แพทย์ผู้ดูแล"', () => {
    const tokens = resolveTokens({ ...baseInput, doctor: null });
    expect(tokens.doctorName).toBe('แพทย์ผู้ดูแล');
  });

  it('T2.4 missing treatments falls back to "-"', () => {
    const tokens = resolveTokens({ ...baseInput, treatments: [] });
    expect(tokens.treatments).toBe('-');
  });

  it('T2.5 empty fullName falls back to name', () => {
    const tokens = resolveTokens({ ...baseInput, cust: { name: 'foo' } });
    expect(tokens.customerName).toBe('foo');
  });
});

describe('T2 lineReminderTemplate.renderTemplate', () => {
  it('T2.6 substitutes {{token}}', () => {
    expect(renderTemplate('Hi {{a}}, see you {{b}}', { a: 'X', b: 'Y' })).toBe('Hi X, see you Y');
  });
  it('T2.7 missing token renders as empty string', () => {
    expect(renderTemplate('Hi {{missing}}', {})).toBe('Hi ');
  });
  it('T2.8 handles adversarial inputs (null/undefined/numeric/Thai)', () => {
    expect(renderTemplate('{{a}}-{{b}}-{{c}}', { a: null, b: 0, c: 'ก' })).toBe('-0-ก');
  });
});

describe('T2 buildReminderFlex', () => {
  it('T2.9 returns valid LINE Flex Message JSON for dayBefore', () => {
    const branchSettings = { ...baseInput.branchSettings, templateDayBefore: 'Hi {{customerName}} appt {{date}} {{time}}' };
    const flex = buildReminderFlex({ ...baseInput, branchSettings, reminderType: 'dayBefore' });
    expect(flex.type).toBe('flex');
    expect(flex.altText).toMatch(/แจ้งเตือนนัดหมาย/);
    expect(flex.contents.type).toBe('bubble');
    expect(flex.contents.footer.contents).toHaveLength(3);
  });

  it('T2.10 footer buttons emit postback with appointmentId + branchId', () => {
    const flex = buildReminderFlex({ ...baseInput, branchSettings: baseInput.branchSettings, reminderType: 'dayBefore' });
    const confirmBtn = flex.contents.footer.contents[0];
    expect(confirmBtn.action.type).toBe('postback');
    expect(confirmBtn.action.data).toContain('action=confirm');
    expect(confirmBtn.action.data).toContain(`appt=${baseInput.appt.id}`);
    expect(confirmBtn.action.data).toContain(`br=${baseInput.branch.branchId}`);
  });

  it('T2.11 dayOf altText differs from dayBefore', () => {
    const flexBefore = buildReminderFlex({ ...baseInput, branchSettings: baseInput.branchSettings, reminderType: 'dayBefore' });
    const flexOf = buildReminderFlex({ ...baseInput, branchSettings: baseInput.branchSettings, reminderType: 'dayOf' });
    expect(flexBefore.altText).not.toBe(flexOf.altText);
  });

  it('T2.12 header background is fire-red brand', () => {
    const flex = buildReminderFlex({ ...baseInput, branchSettings: baseInput.branchSettings, reminderType: 'dayBefore' });
    expect(flex.contents.header.backgroundColor).toBe('#DC2626');
  });
});
```

`tests/lineReminderTemplate-parse-postback.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import { parsePostbackData } from '../src/lib/lineReminderTemplate.js';

describe('T2 parsePostbackData', () => {
  it('PB1 parses action + appt + br', () => {
    const r = parsePostbackData('action=confirm&appt=BA-x&br=BR-y');
    expect(r).toEqual({ action: 'confirm', appt: 'BA-x', br: 'BR-y' });
  });
  it('PB2 handles missing br field', () => {
    const r = parsePostbackData('action=reschedule&appt=BA-x');
    expect(r.action).toBe('reschedule');
    expect(r.br).toBe(null);
  });
  it('PB3 handles empty data', () => {
    expect(parsePostbackData('')).toEqual({ action: null, appt: null, br: null });
  });
  it('PB4 handles malformed (no equal)', () => {
    expect(parsePostbackData('confirm-and-appt-BA-x')).toEqual({ action: null, appt: null, br: null });
  });
  it('PB5 ignores unknown fields', () => {
    const r = parsePostbackData('action=confirm&appt=BA-x&unknown=hack');
    expect(r).toEqual({ action: 'confirm', appt: 'BA-x', br: null });
  });
});
```

- [ ] **Step 2: Run tests to verify fail**

```bash
npx vitest run tests/lineReminderTemplate.test.js tests/lineReminderTemplate-parse-postback.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/lineReminderTemplate.js`**

```javascript
// ─── LINE Reminder Template — Flex Message builder + token resolver ─────────
// Pure ESM. No Firebase deps. Tested in isolation.

const FIRE_RED = '#DC2626';
const ACCENT_GREEN = '#16A34A';

// Bangkok Thai date format dd/mm/yyyy in พ.ศ. (BE = CE + 543).
function formatThaiDateBE(isoYyyyMmDd) {
  if (!isoYyyyMmDd || typeof isoYyyyMmDd !== 'string') return '';
  const [y, m, d] = isoYyyyMmDd.split('-');
  if (!y || !m || !d) return '';
  const be = String(Number(y) + 543).padStart(4, '0');
  return `${d}/${m}/${be}`;
}

export function resolveTokens({ cust, appt, branch, doctor, treatments, branchSettings, clinicName } = {}) {
  cust = cust || {};
  appt = appt || {};
  branch = branch || {};
  branchSettings = branchSettings || {};
  return {
    clinicName: clinicName || 'LoverClinic',
    customerName: cust.fullName || cust.name || '',
    customerDisplayName: cust.lineDisplayName || '',
    branchName: branch.branchName || branch.name || '',
    doctorName: (doctor && doctor.name) || 'แพทย์ผู้ดูแล',
    treatments: Array.isArray(treatments) && treatments.length
      ? treatments.map(t => t && (t.name || '')).filter(Boolean).join(', ') || '-'
      : '-',
    date: formatThaiDateBE(appt.appointmentDate),
    time: appt.startTime || '00:00',
    cancellationPolicyText: branchSettings.cancellationPolicyText || '',
    appointmentId: appt.id || '',
  };
}

export function renderTemplate(template, tokens) {
  if (typeof template !== 'string') return '';
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = tokens[key];
    if (v === null || v === undefined) return '';
    return String(v);
  });
}

export function parsePostbackData(rawData) {
  const out = { action: null, appt: null, br: null };
  if (!rawData || typeof rawData !== 'string') return out;
  for (const pair of rawData.split('&')) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const k = pair.slice(0, idx);
    const v = pair.slice(idx + 1);
    if (k === 'action') out.action = v;
    else if (k === 'appt') out.appt = v;
    else if (k === 'br') out.br = v;
  }
  return out;
}

export function getDefaultFlexShape() {
  return {
    type: 'flex',
    altText: '',
    contents: { type: 'bubble', header: {}, body: {}, footer: {} },
  };
}

export function buildReminderFlex(input) {
  const tokens = resolveTokens(input);
  const template = input.reminderType === 'dayOf'
    ? (input.branchSettings.templateDayOf || '')
    : (input.branchSettings.templateDayBefore || '');
  const bodyText = renderTemplate(template, tokens);

  const headerTitle = input.reminderType === 'dayOf' ? '📅 นัดหมายวันนี้!' : '📅 แจ้งเตือนนัดหมาย';
  const altText = input.reminderType === 'dayOf'
    ? `นัดหมายวันนี้ ${tokens.time}`
    : `แจ้งเตือนนัดหมาย ${tokens.date} ${tokens.time}`;

  return {
    type: 'flex',
    altText,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: FIRE_RED,
        paddingAll: 'md',
        contents: [
          { type: 'text', text: `🏥 ${tokens.clinicName}`, weight: 'bold', color: '#FFFFFF', size: 'lg' },
          { type: 'text', text: headerTitle, color: '#FFFFFF', size: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: bodyText, wrap: true, size: 'md' },
          { type: 'separator' },
          ...buildDetailRows(tokens),
          { type: 'separator' },
          { type: 'text', text: tokens.cancellationPolicyText, size: 'xs', color: '#999999', wrap: true },
        ],
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          flexButton('primary', ACCENT_GREEN, '✓ ยืนยัน', `action=confirm&appt=${tokens.appointmentId}&br=${input.branch?.branchId || ''}`),
          flexButton('secondary', null, 'เลื่อน', `action=reschedule&appt=${tokens.appointmentId}&br=${input.branch?.branchId || ''}`),
          flexButton('secondary', null, 'ติดต่อ', `action=contact&appt=${tokens.appointmentId}&br=${input.branch?.branchId || ''}`),
        ],
      },
    },
  };
}

function buildDetailRows(tokens) {
  return [
    detailRow('📍 สาขา', tokens.branchName),
    detailRow('👨‍⚕️ แพทย์', tokens.doctorName),
    detailRow('💊 บริการ', tokens.treatments),
    detailRow('📅 วันที่', tokens.date),
    detailRow('🕐 เวลา', tokens.time),
  ];
}

function detailRow(label, value) {
  return {
    type: 'box',
    layout: 'baseline',
    spacing: 'sm',
    contents: [
      { type: 'text', text: label, color: '#999999', size: 'sm', flex: 2 },
      { type: 'text', text: String(value), weight: 'bold', flex: 5, wrap: true },
    ],
  };
}

function flexButton(style, color, label, data) {
  const action = { type: 'postback', label, data, displayText: label };
  const btn = { type: 'button', style, height: 'sm', action };
  if (color) btn.color = color;
  return btn;
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npx vitest run tests/lineReminderTemplate.test.js tests/lineReminderTemplate-parse-postback.test.js
```
Expected: 17/17 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lineReminderTemplate.js tests/lineReminderTemplate.test.js tests/lineReminderTemplate-parse-postback.test.js
git commit -m "feat(line-reminder): Task 2 — buildReminderFlex + resolveTokens + renderTemplate + parsePostbackData"
```

---

## Task 3 — NEW `src/lib/lineReminderClient.js`

**Spec ref:** §10 lineReminderClient (push helper + customer lookup + appointments lister).

**Files:**
- Create: `src/lib/lineReminderClient.js`
- Test: `tests/lineReminderClient.test.js` (NEW)

- [ ] **Step 1: Write failing tests**

`tests/lineReminderClient.test.js`:
```javascript
import { describe, it, expect, vi } from 'vitest';
import { getCustomerLineUserIdAtBranch, computeBackoffMs, getReminderLogKey } from '../src/lib/lineReminderClient.js';

describe('T3 getCustomerLineUserIdAtBranch', () => {
  it('T3.1 prefers lineUserId_byBranch[branchId]', () => {
    const c = { branchId: 'BR-A', lineUserId: 'legacy', lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A' }, 'BR-B': { lineUserId: 'U-B' } } };
    expect(getCustomerLineUserIdAtBranch(c, 'BR-A')).toBe('U-A');
    expect(getCustomerLineUserIdAtBranch(c, 'BR-B')).toBe('U-B');
  });

  it('T3.2 falls back to legacy lineUserId iff customer.branchId === branchId', () => {
    const c = { branchId: 'BR-A', lineUserId: 'legacy', lineUserId_byBranch: {} };
    expect(getCustomerLineUserIdAtBranch(c, 'BR-A')).toBe('legacy');
    expect(getCustomerLineUserIdAtBranch(c, 'BR-B')).toBe(null);
  });

  it('T3.3 returns null when stale at branch', () => {
    const c = { branchId: 'BR-A', lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A', _lineStale: true } } };
    expect(getCustomerLineUserIdAtBranch(c, 'BR-A')).toBe(null);
  });

  it('T3.4 returns null when legacy lineUserId stale at customer level', () => {
    const c = { branchId: 'BR-A', lineUserId: 'legacy', _lineStale: true, lineUserId_byBranch: {} };
    expect(getCustomerLineUserIdAtBranch(c, 'BR-A')).toBe(null);
  });

  it('T3.5 returns null when no linkage anywhere', () => {
    expect(getCustomerLineUserIdAtBranch({ branchId: 'BR-A' }, 'BR-A')).toBe(null);
    expect(getCustomerLineUserIdAtBranch({}, 'BR-A')).toBe(null);
  });

  it('T3.6 customer linked to other branch — appt at this branch — returns null', () => {
    const c = { branchId: 'BR-A', lineUserId: 'legacy', lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A' } } };
    expect(getCustomerLineUserIdAtBranch(c, 'BR-Y')).toBe(null);
  });
});

describe('T3 computeBackoffMs', () => {
  it('T3.7 retry 0 (immediate first retry) = 5 minutes', () => {
    expect(computeBackoffMs(0)).toBe(5 * 60 * 1000);
  });
  it('T3.8 retry 1 = 30 minutes', () => {
    expect(computeBackoffMs(1)).toBe(30 * 60 * 1000);
  });
  it('T3.9 retry 2 = 2 hours', () => {
    expect(computeBackoffMs(2)).toBe(2 * 60 * 60 * 1000);
  });
  it('T3.10 retry >= 3 returns null (DEAD)', () => {
    expect(computeBackoffMs(3)).toBe(null);
    expect(computeBackoffMs(99)).toBe(null);
  });
});

describe('T3 getReminderLogKey', () => {
  it('T3.11 returns appointmentId_reminderType', () => {
    expect(getReminderLogKey('BA-x', 'dayBefore')).toBe('BA-x_dayBefore');
    expect(getReminderLogKey('BA-y', 'dayOf')).toBe('BA-y_dayOf');
  });
});
```

- [ ] **Step 2: Run tests to verify fail**

```bash
npx vitest run tests/lineReminderClient.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/lineReminderClient.js`**

```javascript
// ─── LINE Reminder Client — admin-SDK consumers (cron + debug endpoint) ─────
// Pure ESM. Helper module for Push API + customer lookup + appointments lister.
// Designed so the cron endpoint + retry endpoint + debug-fire endpoint can all
// reuse the same primitives.

const PUSH_URL = 'https://api.line.me/v2/bot/message/push';

export async function pushLineMessage({ channelAccessToken, lineUserId, flexJson }) {
  if (!channelAccessToken) throw new Error('LINE_PUSH_NO_TOKEN');
  if (!lineUserId) throw new Error('LINE_PUSH_NO_USER_ID');
  if (!flexJson) throw new Error('LINE_PUSH_NO_PAYLOAD');
  const res = await fetch(PUSH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${channelAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to: lineUserId, messages: [flexJson] }),
  });
  let body = '';
  try { body = await res.text(); } catch { body = ''; }
  return { statusCode: res.status, body };
}

// Canonical customer lineUserId resolver — spec §3 Step 4 + §17 backward-compat.
// Used by reminder pipeline AND by UI auto-tick logic.
export function getCustomerLineUserIdAtBranch(customer, branchId) {
  if (!customer || !branchId) return null;
  const branchLink = customer.lineUserId_byBranch?.[branchId];
  if (branchLink && branchLink.lineUserId && branchLink._lineStale !== true) {
    return branchLink.lineUserId;
  }
  // Backward-compat: legacy customer.lineUserId is valid ONLY at
  // customer.branchId (where V32-tris-ter linkage was minted).
  if (
    customer.branchId === branchId
    && customer.lineUserId
    && customer._lineStale !== true
  ) {
    return customer.lineUserId;
  }
  return null;
}

export function computeBackoffMs(retryCount) {
  if (retryCount >= 3) return null;
  if (retryCount === 0) return 5 * 60 * 1000;
  if (retryCount === 1) return 30 * 60 * 1000;
  if (retryCount === 2) return 2 * 60 * 60 * 1000;
  return null;
}

export function getReminderLogKey(appointmentId, reminderType) {
  return `${appointmentId}_${reminderType}`;
}

// Helper to merge defaults with branch's lineReminder block.
// Used by cron + debug endpoint; reads cfg from getLineConfigForBranch.
export function getMergedReminderSettings(cfg, defaults) {
  const r = cfg?.lineReminder || {};
  const d = defaults || {};
  return {
    enabled: r.enabled === true,
    dayBeforeHour: typeof r.dayBeforeHour === 'number' ? r.dayBeforeHour : d.dayBeforeHour,
    dayOfHour: r.dayOfHour === null ? null : (typeof r.dayOfHour === 'number' ? r.dayOfHour : d.dayOfHour),
    quietHourStart: typeof r.quietHourStart === 'number' ? r.quietHourStart : d.quietHourStart,
    quietHourEnd: typeof r.quietHourEnd === 'number' ? r.quietHourEnd : d.quietHourEnd,
    templateDayBefore: r.templateDayBefore || d.templateDayBefore,
    templateDayOf: r.templateDayOf || d.templateDayOf,
    cancellationPolicyText: r.cancellationPolicyText || d.cancellationPolicyText,
  };
}

// Quiet-hour check supports wrap-around (e.g. 22→8).
export function isQuietHour(currentHour, quietHourStart, quietHourEnd) {
  if (quietHourStart === quietHourEnd) return false;
  if (quietHourStart < quietHourEnd) {
    return currentHour >= quietHourStart && currentHour < quietHourEnd;
  }
  // Wrap-around (e.g. 22-8): quiet if hour >= start OR hour < end
  return currentHour >= quietHourStart || currentHour < quietHourEnd;
}

// Helper to write the reminder log with consistent shape.
export function buildReminderLogDoc({
  appointmentId, customerId, branchId, customerLineUserId, reminderType,
  status, lineApiResult, retryCount, nextRetryAt, lastError, templateRendered,
}) {
  return {
    appointmentId,
    customerId,
    branchId,
    customerLineUserId: customerLineUserId || null,
    reminderType,
    status,
    attemptedAt: new Date().toISOString(),
    lineApiResult: lineApiResult || null,
    retryCount: retryCount ?? 0,
    nextRetryAt: nextRetryAt || null,
    lastError: lastError || null,
    templateRendered: templateRendered || '',
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npx vitest run tests/lineReminderClient.test.js
```
Expected: 11/11 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lineReminderClient.js tests/lineReminderClient.test.js
git commit -m "feat(line-reminder): Task 3 — lineReminderClient (push + customer lookup + backoff + log shape)"
```

---

## Task 4 — Cron fire endpoint `/api/cron/line-reminder-fire`

**Spec ref:** §2 architecture; §3 pipeline; §10 reuses lineConfigAdmin + lineReminderClient.

**Files:**
- Create: `api/cron/line-reminder-fire.js`
- Test: `tests/line-reminder-pipeline-idempotency.test.js` (NEW — mocked Firestore unit tests of pipeline)
- Test: `tests/line-reminder-pipeline-per-branch-credentials.test.js` (NEW — LR-1 invariant)
- Test: `tests/line-reminder-pipeline-customer-branch-link.test.js` (NEW — LR-3 invariant)

- [ ] **Step 1: Write failing tests for pipeline logic (mocked admin SDK)**

`tests/line-reminder-pipeline-idempotency.test.js`:
```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import the pipeline-step helper exported from the cron handler module.
// The handler exports runReminderPipeline for testing (with injected db + push fn).
import { runReminderPipeline } from '../api/cron/line-reminder-fire.js';

function fakeDb() {
  const data = new Map();
  function pathKey(parts) { return parts.join('/'); }
  return {
    data,
    doc(p) {
      const key = pathKey([p]);
      return {
        get: async () => ({ exists: data.has(key), data: () => data.get(key) || null, id: p.split('/').pop() }),
        set: async (v) => { data.set(key, v); },
        update: async (v) => { data.set(key, { ...(data.get(key) || {}), ...v }); },
      };
    },
  };
}

describe('T4 runReminderPipeline — idempotency + skip paths', () => {
  it('T4.1 already-sent log → returns "already-sent"', async () => {
    const db = fakeDb();
    const apptId = 'BA-1';
    const reminderType = 'dayBefore';
    db.data.set(`be_line_reminder_log/${apptId}_${reminderType}`, { status: 'sent' });
    const result = await runReminderPipeline({
      db,
      appt: { id: apptId, branchId: 'BR-A', customerId: 'C1', status: 'pending' },
      cust: { id: 'C1', branchId: 'BR-A', lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A' } } },
      branch: { branchId: 'BR-A' },
      branchCfg: { channelAccessToken: 'TOK', lineReminder: { quietHourStart: 22, quietHourEnd: 8 } },
      reminderType,
      currentHour: 20,
      pushFn: vi.fn(),
    });
    expect(result.status).toBe('already-sent');
  });

  it('T4.2 appt.status=cancelled → skipped-cancelled', async () => {
    const db = fakeDb();
    const r = await runReminderPipeline({
      db,
      appt: { id: 'BA-2', branchId: 'BR-A', customerId: 'C1', status: 'cancelled' },
      cust: { id: 'C1', branchId: 'BR-A', lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A' } } },
      branch: { branchId: 'BR-A' },
      branchCfg: { channelAccessToken: 'TOK', lineReminder: { quietHourStart: 22, quietHourEnd: 8 } },
      reminderType: 'dayBefore',
      currentHour: 20,
      pushFn: vi.fn(),
    });
    expect(r.status).toBe('skipped-cancelled');
  });

  it('T4.3 customer.notifyOptOut=true → skipped-optout', async () => {
    const db = fakeDb();
    const r = await runReminderPipeline({
      db,
      appt: { id: 'BA-3', branchId: 'BR-A', customerId: 'C1', status: 'pending' },
      cust: { id: 'C1', branchId: 'BR-A', notifyOptOut: true, lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A' } } },
      branch: { branchId: 'BR-A' },
      branchCfg: { channelAccessToken: 'TOK', lineReminder: { quietHourStart: 22, quietHourEnd: 8 } },
      reminderType: 'dayBefore',
      currentHour: 20,
      pushFn: vi.fn(),
    });
    expect(r.status).toBe('skipped-optout');
  });

  it('T4.4 successful push → status sent + log + appointment notifyMeta updated', async () => {
    const db = fakeDb();
    const apptId = 'BA-4';
    db.data.set(`be_appointments/${apptId}`, { id: apptId });
    const pushFn = vi.fn().mockResolvedValue({ statusCode: 200, body: '{}' });
    const r = await runReminderPipeline({
      db,
      appt: { id: apptId, branchId: 'BR-A', customerId: 'C1', status: 'pending', appointmentDate: '2026-05-16', startTime: '14:30' },
      cust: { id: 'C1', branchId: 'BR-A', name: 'X', lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A' } } },
      branch: { branchId: 'BR-A', branchName: 'Nakhon' },
      doctor: null,
      treatments: [],
      branchCfg: { channelAccessToken: 'TOK', lineReminder: { quietHourStart: 22, quietHourEnd: 8, templateDayBefore: 'hi {{customerName}}', templateDayOf: 'x', cancellationPolicyText: 'c' } },
      reminderType: 'dayBefore',
      currentHour: 20,
      pushFn,
    });
    expect(r.status).toBe('sent');
    expect(pushFn).toHaveBeenCalledOnce();
    const callArg = pushFn.mock.calls[0][0];
    expect(callArg.channelAccessToken).toBe('TOK');  // ← LR-1: per-branch
    expect(callArg.lineUserId).toBe('U-A');
    const logKey = `be_line_reminder_log/${apptId}_dayBefore`;
    const log = db.data.get(logKey);
    expect(log.status).toBe('sent');
    expect(log.branchId).toBe('BR-A');  // ← LR-5: branchId stamped
  });
});
```

`tests/line-reminder-pipeline-per-branch-credentials.test.js`:
```javascript
import { describe, it, expect, vi } from 'vitest';
import { runReminderPipeline } from '../api/cron/line-reminder-fire.js';

// LR-1: Push API call uses per-branch channelAccessToken (NOT global).

describe('T4 LR-1 — per-branch channelAccessToken discipline', () => {
  function fakeDb() {
    const data = new Map();
    return {
      data,
      doc(p) {
        return {
          get: async () => ({ exists: data.has(p), data: () => data.get(p) || null, id: p.split('/').pop() }),
          set: async (v) => { data.set(p, v); },
          update: async (v) => { data.set(p, { ...(data.get(p) || {}), ...v }); },
        };
      },
    };
  }

  it('LR1.1 BR-A push uses cfg-A token', async () => {
    const db = fakeDb();
    const pushFn = vi.fn().mockResolvedValue({ statusCode: 200, body: '{}' });
    await runReminderPipeline({
      db,
      appt: { id: 'BA-A', branchId: 'BR-A', customerId: 'C', status: 'pending', appointmentDate: '2026-05-16', startTime: '10:00' },
      cust: { id: 'C', branchId: 'BR-A', name: 'X', lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A' } } },
      branch: { branchId: 'BR-A', branchName: 'A' },
      doctor: null, treatments: [],
      branchCfg: { channelAccessToken: 'TOKEN-A', lineReminder: { quietHourStart: 22, quietHourEnd: 8, templateDayBefore: 'x', templateDayOf: 'x', cancellationPolicyText: 'c' } },
      reminderType: 'dayBefore',
      currentHour: 20,
      pushFn,
    });
    expect(pushFn.mock.calls[0][0].channelAccessToken).toBe('TOKEN-A');
  });

  it('LR1.2 BR-B push uses cfg-B token', async () => {
    const db = fakeDb();
    const pushFn = vi.fn().mockResolvedValue({ statusCode: 200, body: '{}' });
    await runReminderPipeline({
      db,
      appt: { id: 'BA-B', branchId: 'BR-B', customerId: 'C', status: 'pending', appointmentDate: '2026-05-16', startTime: '10:00' },
      cust: { id: 'C', branchId: 'BR-B', name: 'X', lineUserId_byBranch: { 'BR-B': { lineUserId: 'U-B' } } },
      branch: { branchId: 'BR-B', branchName: 'B' },
      doctor: null, treatments: [],
      branchCfg: { channelAccessToken: 'TOKEN-B', lineReminder: { quietHourStart: 22, quietHourEnd: 8, templateDayBefore: 'x', templateDayOf: 'x', cancellationPolicyText: 'c' } },
      reminderType: 'dayBefore',
      currentHour: 20,
      pushFn,
    });
    expect(pushFn.mock.calls[0][0].channelAccessToken).toBe('TOKEN-B');
  });

  it('LR1.3 No fallback to global chat_config when branchCfg missing token → throws', async () => {
    const db = fakeDb();
    const pushFn = vi.fn();
    const r = await runReminderPipeline({
      db,
      appt: { id: 'BA-X', branchId: 'BR-X', customerId: 'C', status: 'pending', appointmentDate: '2026-05-16', startTime: '10:00' },
      cust: { id: 'C', branchId: 'BR-X', name: 'X', lineUserId_byBranch: { 'BR-X': { lineUserId: 'U-X' } } },
      branch: { branchId: 'BR-X', branchName: 'X' },
      doctor: null, treatments: [],
      branchCfg: { channelAccessToken: '', lineReminder: { quietHourStart: 22, quietHourEnd: 8, templateDayBefore: 'x', templateDayOf: 'x', cancellationPolicyText: 'c' } },
      reminderType: 'dayBefore',
      currentHour: 20,
      pushFn,
    });
    expect(r.status).toMatch(/skipped-branch-no-oa/);
    expect(pushFn).not.toHaveBeenCalled();
  });
});
```

`tests/line-reminder-pipeline-customer-branch-link.test.js`:
```javascript
import { describe, it, expect, vi } from 'vitest';
import { runReminderPipeline } from '../api/cron/line-reminder-fire.js';

// LR-3: Customer LINE userId lookup uses branch-scoped helper.

describe('T4 LR-3 — customer lineUserId is branch-scoped', () => {
  function fakeDb() {
    const data = new Map();
    return {
      data,
      doc(p) {
        return {
          get: async () => ({ exists: data.has(p), data: () => data.get(p) || null, id: p.split('/').pop() }),
          set: async (v) => { data.set(p, v); },
          update: async (v) => { data.set(p, { ...(data.get(p) || {}), ...v }); },
        };
      },
    };
  }

  const baseCtx = {
    branch: { branchId: 'BR-Y', branchName: 'Y' },
    doctor: null, treatments: [],
    branchCfg: { channelAccessToken: 'T', lineReminder: { quietHourStart: 22, quietHourEnd: 8, templateDayBefore: 'x', templateDayOf: 'x', cancellationPolicyText: 'c' } },
    reminderType: 'dayBefore', currentHour: 20,
  };

  it('LR3.1 customer linked only at BR-A, appt at BR-Y → skipped-no-line-this-branch', async () => {
    const db = fakeDb();
    const pushFn = vi.fn();
    const r = await runReminderPipeline({
      db,
      appt: { id: 'BA-Y', branchId: 'BR-Y', customerId: 'C', status: 'pending', appointmentDate: '2026-05-16', startTime: '10:00' },
      cust: { id: 'C', branchId: 'BR-A', lineUserId: 'legacy-A', lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A' } } },
      ...baseCtx,
    });
    expect(r.status).toBe('skipped-no-line-this-branch');
    expect(pushFn).not.toHaveBeenCalled();
  });

  it('LR3.2 customer linked at appt branch via per-branch entry → uses that userId', async () => {
    const db = fakeDb();
    const pushFn = vi.fn().mockResolvedValue({ statusCode: 200, body: '{}' });
    const r = await runReminderPipeline({
      db,
      appt: { id: 'BA-Y2', branchId: 'BR-Y', customerId: 'C', status: 'pending', appointmentDate: '2026-05-16', startTime: '10:00' },
      cust: { id: 'C', branchId: 'BR-A', lineUserId: 'legacy-A', lineUserId_byBranch: { 'BR-Y': { lineUserId: 'U-Y' } } },
      ...baseCtx,
      pushFn,
    });
    expect(r.status).toBe('sent');
    expect(pushFn.mock.calls[0][0].lineUserId).toBe('U-Y');
  });

  it('LR3.3 legacy lineUserId valid ONLY when customer.branchId === appt.branchId', async () => {
    const db = fakeDb();
    const pushFn = vi.fn().mockResolvedValue({ statusCode: 200, body: '{}' });
    const r = await runReminderPipeline({
      db,
      appt: { id: 'BA-A', branchId: 'BR-A', customerId: 'C', status: 'pending', appointmentDate: '2026-05-16', startTime: '10:00' },
      cust: { id: 'C', branchId: 'BR-A', lineUserId: 'legacy-A', lineUserId_byBranch: {} },
      ...baseCtx,
      branch: { branchId: 'BR-A', branchName: 'A' },
      pushFn,
    });
    expect(r.status).toBe('sent');
    expect(pushFn.mock.calls[0][0].lineUserId).toBe('legacy-A');
  });

  it('LR3.4 per-branch stale → skipped-stale', async () => {
    const db = fakeDb();
    const pushFn = vi.fn();
    const r = await runReminderPipeline({
      db,
      appt: { id: 'BA-Y3', branchId: 'BR-Y', customerId: 'C', status: 'pending', appointmentDate: '2026-05-16', startTime: '10:00' },
      cust: { id: 'C', branchId: 'BR-A', lineUserId_byBranch: { 'BR-Y': { lineUserId: 'U-Y', _lineStale: true } } },
      ...baseCtx,
      pushFn,
    });
    expect(r.status).toBe('skipped-stale');
  });
});
```

- [ ] **Step 2: Run tests to verify fail**

```bash
npx vitest run tests/line-reminder-pipeline-idempotency.test.js tests/line-reminder-pipeline-per-branch-credentials.test.js tests/line-reminder-pipeline-customer-branch-link.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `api/cron/line-reminder-fire.js`**

```javascript
// ─── /api/cron/line-reminder-fire — Vercel Cron hourly tick ─────────────────
// Spec §2 + §3. Reads all be_line_configs (enabled branches), for each branch
// at the matching hour: lists tomorrow's appts (dayBefore) or today's appts
// (dayOf), runs pipeline per appt, writes audit doc at end.
//
// Auth: Authorization: Bearer ${CRON_SECRET} (Vercel injects via env).

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { resolveLineConfigForAdmin } from '../admin/_lib/lineConfigAdmin.js';
import { buildReminderFlex } from '../../src/lib/lineReminderTemplate.js';
import {
  pushLineMessage, getCustomerLineUserIdAtBranch, computeBackoffMs,
  getReminderLogKey, getMergedReminderSettings, isQuietHour, buildReminderLogDoc,
} from '../../src/lib/lineReminderClient.js';

const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_APP_ID || 'loverclinic-opd-4c39b';
const BASE_PATH = `artifacts/${APP_ID}/public/data`;

// Defaults — also used by getMergedReminderSettings fallback.
const TEMPLATE_DEFAULTS = {
  dayBeforeHour: 20,
  dayOfHour: 9,
  quietHourStart: 22,
  quietHourEnd: 8,
  templateDayBefore: 'สวัสดีคุณ {{customerName}} ค่ะ พรุ่งนี้ {{date}} เวลา {{time}} คุณมีนัดที่สาขา {{branchName}} กับ {{doctorName}}\nบริการ: {{treatments}}\n\n{{cancellationPolicyText}}',
  templateDayOf: 'สวัสดีคุณ {{customerName}} ค่ะ วันนี้คุณมีนัดเวลา {{time}} ที่สาขา {{branchName}} กับ {{doctorName}}\nบริการ: {{treatments}}',
  cancellationPolicyText: 'กรุณาเลื่อน/ยกเลิกล่วงหน้า 24 ชั่วโมง',
};

function getAdmin() {
  if (getApps().length > 0) return getFirestore(getApp());
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!clientEmail || !rawKey) throw new Error('firebase-admin not configured');
  const app = initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail,
      privateKey: rawKey.replace(/\\n/g, '\n'),
    }),
  });
  return getFirestore(app);
}

function bangkokHour(now = new Date()) {
  // Bangkok UTC+7
  const utcMs = now.getTime();
  const bkkMs = utcMs + 7 * 60 * 60 * 1000;
  return new Date(bkkMs).getUTCHours();
}

function bangkokDateISO(now = new Date()) {
  const utcMs = now.getTime();
  const bkkMs = utcMs + 7 * 60 * 60 * 1000;
  const d = new Date(bkkMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function tomorrowISO(now = new Date()) {
  const utcMs = now.getTime();
  const bkkMs = utcMs + 7 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000;
  const d = new Date(bkkMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Exported for unit tests (injects fake db + pushFn).
export async function runReminderPipeline(ctx) {
  const {
    db, appt, cust, branch, doctor, treatments, branchCfg, reminderType, currentHour, pushFn,
  } = ctx;

  const logKey = getReminderLogKey(appt.id, reminderType);
  const logRef = db.doc(`${BASE_PATH}/be_line_reminder_log/${logKey}`);

  // Step 1: idempotency
  const existingLog = await logRef.get();
  if (existingLog.exists && existingLog.data().status === 'sent') {
    return { status: 'already-sent' };
  }

  // Step 0/branch enable: branch must have config + reminder.enabled + channelAccessToken
  if (!branchCfg || !branchCfg.channelAccessToken) {
    const doc = buildReminderLogDoc({
      appointmentId: appt.id, customerId: appt.customerId, branchId: appt.branchId,
      customerLineUserId: null, reminderType, status: 'skipped-branch-no-oa',
    });
    await logRef.set(doc);
    return { status: 'skipped-branch-no-oa' };
  }

  // Step 2: appt cancelled
  if (appt.status === 'cancelled') {
    await logRef.set(buildReminderLogDoc({
      appointmentId: appt.id, customerId: appt.customerId, branchId: appt.branchId,
      customerLineUserId: null, reminderType, status: 'skipped-cancelled',
    }));
    return { status: 'skipped-cancelled' };
  }

  // Step 3: customer opt-out
  if (cust?.notifyOptOut === true) {
    await logRef.set(buildReminderLogDoc({
      appointmentId: appt.id, customerId: appt.customerId, branchId: appt.branchId,
      customerLineUserId: null, reminderType, status: 'skipped-optout',
    }));
    return { status: 'skipped-optout' };
  }

  // Step 4: LINE link check (BRANCH-SCOPED — LR-3)
  const lineUserId = getCustomerLineUserIdAtBranch(cust, appt.branchId);
  if (!lineUserId) {
    // Distinguish stale (exists but blocked) vs no-link
    const branchLink = cust?.lineUserId_byBranch?.[appt.branchId];
    const isStale = branchLink?._lineStale === true ||
      (cust?.branchId === appt.branchId && cust?._lineStale === true);
    await logRef.set(buildReminderLogDoc({
      appointmentId: appt.id, customerId: appt.customerId, branchId: appt.branchId,
      customerLineUserId: null, reminderType,
      status: isStale ? 'skipped-stale' : 'skipped-no-line-this-branch',
    }));
    return { status: isStale ? 'skipped-stale' : 'skipped-no-line-this-branch' };
  }

  // Step 5: quiet hours defensive guard
  const merged = getMergedReminderSettings(branchCfg, TEMPLATE_DEFAULTS);
  if (isQuietHour(currentHour, merged.quietHourStart, merged.quietHourEnd)) {
    await logRef.set(buildReminderLogDoc({
      appointmentId: appt.id, customerId: appt.customerId, branchId: appt.branchId,
      customerLineUserId: lineUserId, reminderType, status: 'skipped-quiet-hours',
    }));
    return { status: 'skipped-quiet-hours' };
  }

  // Step 6: build flex
  const flex = buildReminderFlex({
    cust, appt, branch, doctor, treatments,
    branchSettings: merged,
    reminderType,
  });
  const templateRendered = JSON.stringify(flex);

  // Step 7: push (LR-1 — per-branch channelAccessToken)
  const pushImpl = pushFn || pushLineMessage;
  let lineApiResult;
  try {
    lineApiResult = await pushImpl({
      channelAccessToken: branchCfg.channelAccessToken,
      lineUserId,
      flexJson: flex,
    });
  } catch (e) {
    await logRef.set(buildReminderLogDoc({
      appointmentId: appt.id, customerId: appt.customerId, branchId: appt.branchId,
      customerLineUserId: lineUserId, reminderType,
      status: 'failed', lastError: e.message || 'push-throw',
      retryCount: 0, nextRetryAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      templateRendered,
    }));
    return { status: 'failed', error: e.message };
  }

  // Step 8: response handling
  const sc = lineApiResult.statusCode;
  if (sc === 200) {
    await logRef.set(buildReminderLogDoc({
      appointmentId: appt.id, customerId: appt.customerId, branchId: appt.branchId,
      customerLineUserId: lineUserId, reminderType, status: 'sent', lineApiResult, templateRendered,
    }));
    // Update appointment.notifyMeta
    const apptRef = db.doc(`${BASE_PATH}/be_appointments/${appt.id}`);
    const apptSnap = await apptRef.get();
    if (apptSnap.exists) {
      await apptRef.update({
        [`notifyMeta.sent${reminderType[0].toUpperCase() + reminderType.slice(1)}`]: {
          at: new Date().toISOString(),
          lineApiStatusCode: 200,
        },
      });
    }
    return { status: 'sent' };
  }
  if (sc === 410) {
    // User blocked/unfollowed THIS branch's OA
    const custRef = db.doc(`${BASE_PATH}/be_customers/${appt.customerId}`);
    await custRef.update({
      [`lineUserId_byBranch.${appt.branchId}._lineStale`]: true,
      [`lineUserId_byBranch.${appt.branchId}._lineStaleAt`]: new Date().toISOString(),
    });
    await logRef.set(buildReminderLogDoc({
      appointmentId: appt.id, customerId: appt.customerId, branchId: appt.branchId,
      customerLineUserId: lineUserId, reminderType,
      status: 'failed', lineApiResult, lastError: 'user-blocked-or-unfollowed',
      templateRendered,
    }));
    return { status: 'failed', error: '410' };
  }
  // 429/5xx → retry queue
  const isRetryable = sc === 429 || (sc >= 500 && sc < 600);
  if (isRetryable) {
    await logRef.set(buildReminderLogDoc({
      appointmentId: appt.id, customerId: appt.customerId, branchId: appt.branchId,
      customerLineUserId: lineUserId, reminderType,
      status: 'failed', lineApiResult,
      retryCount: 0, nextRetryAt: new Date(Date.now() + computeBackoffMs(0)).toISOString(),
      lastError: `status-${sc}`, templateRendered,
    }));
    return { status: 'failed', error: `retryable-${sc}` };
  }
  // 4xx other → no retry
  await logRef.set(buildReminderLogDoc({
    appointmentId: appt.id, customerId: appt.customerId, branchId: appt.branchId,
    customerLineUserId: lineUserId, reminderType,
    status: 'failed', lineApiResult, lastError: `status-${sc}`, templateRendered,
  }));
  return { status: 'failed', error: `client-${sc}` };
}

export default async function handler(req, res) {
  // Auth
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const db = getAdmin();
  const now = new Date();
  const currentHour = bangkokHour(now);
  const tomorrow = tomorrowISO(now);
  const today = bangkokDateISO(now);

  const configsSnap = await db.collection(`${BASE_PATH}/be_line_configs`).get();
  const summary = { branchesProcessed: 0, totalAppts: 0, sent: 0, failed: 0, skipped: 0 };

  for (const cfgDoc of configsSnap.docs) {
    const branchCfg = { branchId: cfgDoc.id, ...cfgDoc.data() };
    if (!branchCfg.enabled || !branchCfg.channelAccessToken) continue;
    const merged = getMergedReminderSettings(branchCfg, TEMPLATE_DEFAULTS);
    if (!merged.enabled) continue;

    const isDayBeforeWindow = currentHour === merged.dayBeforeHour;
    const isDayOfWindow = merged.dayOfHour !== null && currentHour === merged.dayOfHour;
    if (!isDayBeforeWindow && !isDayOfWindow) continue;

    summary.branchesProcessed++;
    const reminderType = isDayBeforeWindow ? 'dayBefore' : 'dayOf';
    const targetDate = isDayBeforeWindow ? tomorrow : today;

    // Get branch info
    const branchSnap = await db.doc(`${BASE_PATH}/be_branches/${branchCfg.branchId}`).get();
    const branch = branchSnap.exists ? { branchId: branchSnap.id, ...branchSnap.data() } : { branchId: branchCfg.branchId };

    // Get appointments for this branch + target date + notifyChannel includes 'line'
    const apptsSnap = await db.collection(`${BASE_PATH}/be_appointments`)
      .where('branchId', '==', branchCfg.branchId)
      .where('appointmentDate', '==', targetDate)
      .get();

    for (const apptDoc of apptsSnap.docs) {
      const appt = { id: apptDoc.id, ...apptDoc.data() };
      summary.totalAppts++;

      // Skip if notifyChannel doesn't include 'line'
      if (!Array.isArray(appt.notifyChannel) || !appt.notifyChannel.includes('line')) continue;

      const custSnap = await db.doc(`${BASE_PATH}/be_customers/${appt.customerId}`).get();
      if (!custSnap.exists) continue;
      const cust = { id: custSnap.id, ...custSnap.data() };

      // Doctor + treatments (best-effort; nulls OK)
      const doctor = appt.doctorId ? await db.doc(`${BASE_PATH}/be_doctors/${appt.doctorId}`).get().then(s => s.exists ? { id: s.id, ...s.data() } : null).catch(() => null) : null;
      const treatments = Array.isArray(appt.treatments) ? appt.treatments : [];

      const result = await runReminderPipeline({
        db, appt, cust, branch, doctor, treatments, branchCfg, reminderType, currentHour,
      });
      if (result.status === 'sent') summary.sent++;
      else if (result.status.startsWith('skipped')) summary.skipped++;
      else summary.failed++;
    }
  }

  // Daily aggregate audit (writes a daily-rollup doc on every tick — idempotent merge)
  const aggregateRef = db.doc(`${BASE_PATH}/be_admin_audit/line-reminder-daily-${today}`);
  await aggregateRef.set({
    date: today,
    lastUpdated: new Date().toISOString(),
    [`hourly.${currentHour}`]: summary,
  }, { merge: true });

  return res.status(200).json({ ok: true, currentHour, tomorrow, today, summary });
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npx vitest run tests/line-reminder-pipeline-idempotency.test.js tests/line-reminder-pipeline-per-branch-credentials.test.js tests/line-reminder-pipeline-customer-branch-link.test.js
```
Expected: 11+ PASS across 3 files.

- [ ] **Step 5: Commit**

```bash
git add api/cron/line-reminder-fire.js tests/line-reminder-pipeline-*.test.js
git commit -m "feat(line-reminder): Task 4 — /api/cron/line-reminder-fire + pipeline (LR-1 + LR-3 invariants locked)"
```

---

## Task 5 — Cron retry endpoint `/api/cron/line-reminder-retry`

**Spec ref:** §8 retry queue.

**Files:**
- Create: `api/cron/line-reminder-retry.js`
- Test: `tests/line-reminder-retry-backoff.test.js` (NEW)

- [ ] **Step 1: Write failing test for backoff schedule**

`tests/line-reminder-retry-backoff.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import { computeBackoffMs } from '../src/lib/lineReminderClient.js';
import { computeNextRetryAt, isRetryEligible } from '../api/cron/line-reminder-retry.js';

describe('T5 retry backoff schedule', () => {
  it('T5.1 backoff schedule matches spec §8', () => {
    expect(computeBackoffMs(0)).toBe(5 * 60 * 1000);
    expect(computeBackoffMs(1)).toBe(30 * 60 * 1000);
    expect(computeBackoffMs(2)).toBe(2 * 60 * 60 * 1000);
    expect(computeBackoffMs(3)).toBe(null);
  });

  it('T5.2 computeNextRetryAt returns null when retryCount exceeds limit', () => {
    expect(computeNextRetryAt(3)).toBe(null);
  });

  it('T5.3 isRetryEligible — retryCount < 3 + nextRetryAt <= now', () => {
    const now = new Date('2026-05-16T10:00:00Z');
    expect(isRetryEligible({ retryCount: 0, nextRetryAt: '2026-05-16T09:00:00Z' }, now)).toBe(true);
    expect(isRetryEligible({ retryCount: 2, nextRetryAt: '2026-05-16T09:00:00Z' }, now)).toBe(true);
    expect(isRetryEligible({ retryCount: 3, nextRetryAt: '2026-05-16T09:00:00Z' }, now)).toBe(false);
    expect(isRetryEligible({ retryCount: 0, nextRetryAt: '2026-05-16T11:00:00Z' }, now)).toBe(false);
    expect(isRetryEligible({ retryCount: 0 }, now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify fail**

```bash
npx vitest run tests/line-reminder-retry-backoff.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `api/cron/line-reminder-retry.js`**

```javascript
// ─── /api/cron/line-reminder-retry — Vercel Cron every 5 min ────────────────
// Spec §8. Re-runs pipeline Step 6+ for failed logs with retryCount<3.

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getLineConfigForBranch } from '../admin/_lib/lineConfigAdmin.js';
import { buildReminderFlex } from '../../src/lib/lineReminderTemplate.js';
import {
  pushLineMessage, getCustomerLineUserIdAtBranch, computeBackoffMs,
  getMergedReminderSettings, buildReminderLogDoc,
} from '../../src/lib/lineReminderClient.js';

const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_APP_ID || 'loverclinic-opd-4c39b';
const BASE_PATH = `artifacts/${APP_ID}/public/data`;

const TEMPLATE_DEFAULTS = {
  templateDayBefore: 'สวัสดี {{customerName}} พรุ่งนี้ {{date}} {{time}} ที่ {{branchName}}',
  templateDayOf: 'สวัสดี {{customerName}} วันนี้ {{time}} ที่ {{branchName}}',
  cancellationPolicyText: 'กรุณาเลื่อน/ยกเลิกล่วงหน้า 24 ชั่วโมง',
};

function getAdmin() {
  if (getApps().length > 0) return getFirestore(getApp());
  const app = initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
  return getFirestore(app);
}

export function computeNextRetryAt(retryCount) {
  const ms = computeBackoffMs(retryCount);
  if (ms === null) return null;
  return new Date(Date.now() + ms).toISOString();
}

export function isRetryEligible(log, nowDate = new Date()) {
  if (!log || typeof log.retryCount !== 'number' || log.retryCount >= 3) return false;
  if (!log.nextRetryAt) return false;
  return new Date(log.nextRetryAt) <= nowDate;
}

export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const db = getAdmin();
  const now = new Date();

  // Firestore allows 1 inequality field per query. Filter retryCount<3 in-memory.
  const failedSnap = await db.collection(`${BASE_PATH}/be_line_reminder_log`)
    .where('status', '==', 'failed')
    .where('nextRetryAt', '<=', now.toISOString())
    .limit(50)
    .get();

  const summary = { retried: 0, succeeded: 0, failed: 0, exhausted: 0, skipped: 0 };

  for (const logDoc of failedSnap.docs) {
    const log = logDoc.data();
    if (!isRetryEligible(log, now)) {
      summary.skipped++;
      continue;
    }

    // Re-fetch appointment + customer (fresh state since first attempt)
    const apptSnap = await db.doc(`${BASE_PATH}/be_appointments/${log.appointmentId}`).get();
    if (!apptSnap.exists || apptSnap.data().status === 'cancelled') {
      await logDoc.ref.update({ status: 'skipped-cancelled', retriedAt: now.toISOString() });
      summary.retried++;
      summary.skipped++;
      continue;
    }
    const apptData = apptSnap.data();

    const custSnap = await db.doc(`${BASE_PATH}/be_customers/${log.customerId}`).get();
    if (!custSnap.exists) {
      await logDoc.ref.update({ status: 'skipped-no-line-this-branch', retriedAt: now.toISOString() });
      summary.retried++;
      summary.skipped++;
      continue;
    }
    const cust = custSnap.data();
    if (cust.notifyOptOut === true) {
      await logDoc.ref.update({ status: 'skipped-optout', retriedAt: now.toISOString() });
      summary.retried++;
      summary.skipped++;
      continue;
    }
    const lineUserId = getCustomerLineUserIdAtBranch(cust, log.branchId);
    if (!lineUserId) {
      await logDoc.ref.update({ status: 'skipped-no-line-this-branch', retriedAt: now.toISOString() });
      summary.retried++;
      summary.skipped++;
      continue;
    }

    // Branch cfg (might be disabled or removed since last attempt)
    const branchCfg = await getLineConfigForBranch(db, log.branchId);
    if (!branchCfg || !branchCfg.enabled || !branchCfg.channelAccessToken) {
      await logDoc.ref.update({ status: 'skipped-branch-no-oa', retriedAt: now.toISOString() });
      summary.retried++;
      summary.skipped++;
      continue;
    }

    // Rebuild flex (templateRendered field might be stale if template changed; re-render)
    const merged = getMergedReminderSettings(branchCfg, TEMPLATE_DEFAULTS);
    const branchSnap = await db.doc(`${BASE_PATH}/be_branches/${log.branchId}`).get();
    const branch = branchSnap.exists ? { branchId: branchSnap.id, ...branchSnap.data() } : { branchId: log.branchId };
    const flex = buildReminderFlex({
      cust, appt: { id: log.appointmentId, ...apptData },
      branch, doctor: null, treatments: apptData.treatments || [],
      branchSettings: merged, reminderType: log.reminderType,
    });

    const apiRes = await pushLineMessage({
      channelAccessToken: branchCfg.channelAccessToken,
      lineUserId,
      flexJson: flex,
    });
    summary.retried++;

    if (apiRes.statusCode === 200) {
      await logDoc.ref.update({ status: 'sent', lineApiResult: apiRes, retriedAt: now.toISOString() });
      summary.succeeded++;
    } else if (apiRes.statusCode === 410) {
      await db.doc(`${BASE_PATH}/be_customers/${log.customerId}`).update({
        [`lineUserId_byBranch.${log.branchId}._lineStale`]: true,
        [`lineUserId_byBranch.${log.branchId}._lineStaleAt`]: now.toISOString(),
      });
      await logDoc.ref.update({ status: 'failed', lineApiResult: apiRes, lastError: 'user-blocked-or-unfollowed', retriedAt: now.toISOString() });
      summary.failed++;
    } else {
      const newRetryCount = (log.retryCount || 0) + 1;
      const nextRetryAt = computeNextRetryAt(newRetryCount);
      const update = {
        retryCount: newRetryCount,
        lineApiResult: apiRes,
        lastError: `status-${apiRes.statusCode}`,
        retriedAt: now.toISOString(),
      };
      if (nextRetryAt === null) {
        update.status = 'failed';
        update.deadAt = now.toISOString();
        // Admin alert audit doc
        await db.doc(`${BASE_PATH}/be_admin_audit/line-alert-${Date.now()}-${log.appointmentId.slice(-6)}`).set({
          type: 'reminder-retry-exhausted',
          severity: 'warn',
          appointmentId: log.appointmentId,
          customerId: log.customerId,
          branchId: log.branchId,
          createdAt: now.toISOString(),
        });
        summary.exhausted++;
      } else {
        update.nextRetryAt = nextRetryAt;
        summary.failed++;
      }
      await logDoc.ref.update(update);
    }
  }

  return res.status(200).json({ ok: true, summary });
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npx vitest run tests/line-reminder-retry-backoff.test.js
```
Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add api/cron/line-reminder-retry.js tests/line-reminder-retry-backoff.test.js
git commit -m "feat(line-reminder): Task 5 — retry queue with exp backoff (5m / 30m / 2hr / DEAD)"
```

---

## Task 6 — Debug fire endpoint `/api/admin/line-reminder-debug-fire`

**Spec ref:** §9 debug endpoint; §5 C.2 UI.

**Files:**
- Create: `api/admin/line-reminder-debug-fire.js`
- Test: `tests/line-reminder-debug-fire-confirmation.test.js` (NEW — server-side branch-name confirm gate)

- [ ] **Step 1: Write failing tests**

`tests/line-reminder-debug-fire-confirmation.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import { validateDebugFireRequest } from '../api/admin/line-reminder-debug-fire.js';

describe('T6 validateDebugFireRequest', () => {
  it('T6.1 valid dry-run request', () => {
    expect(validateDebugFireRequest({ branchId: 'BR-A', reminderType: 'dayBefore', mode: 'dry-run' }, { branchName: 'X' })).toEqual({ valid: true });
  });

  it('T6.2 valid single request requires customerId', () => {
    expect(validateDebugFireRequest({ branchId: 'BR-A', reminderType: 'dayBefore', mode: 'single' }, { branchName: 'X' }).valid).toBe(false);
    expect(validateDebugFireRequest({ branchId: 'BR-A', reminderType: 'dayBefore', mode: 'single', customerId: 'C1' }, { branchName: 'X' }).valid).toBe(true);
  });

  it('T6.3 mode=all requires confirmBranchName === branch.branchName', () => {
    expect(validateDebugFireRequest({ branchId: 'BR-A', reminderType: 'dayBefore', mode: 'all', confirmBranchName: '' }, { branchName: 'นครราชสีมา' }).valid).toBe(false);
    expect(validateDebugFireRequest({ branchId: 'BR-A', reminderType: 'dayBefore', mode: 'all', confirmBranchName: 'wrong' }, { branchName: 'นครราชสีมา' }).valid).toBe(false);
    expect(validateDebugFireRequest({ branchId: 'BR-A', reminderType: 'dayBefore', mode: 'all', confirmBranchName: 'นครราชสีมา' }, { branchName: 'นครราชสีมา' }).valid).toBe(true);
  });

  it('T6.4 invalid mode', () => {
    expect(validateDebugFireRequest({ branchId: 'BR-A', reminderType: 'dayBefore', mode: 'fakemode' }, { branchName: 'X' }).valid).toBe(false);
  });

  it('T6.5 invalid reminderType', () => {
    expect(validateDebugFireRequest({ branchId: 'BR-A', reminderType: 'every-15-min', mode: 'dry-run' }, { branchName: 'X' }).valid).toBe(false);
  });

  it('T6.6 missing branchId', () => {
    expect(validateDebugFireRequest({ reminderType: 'dayBefore', mode: 'dry-run' }, { branchName: 'X' }).valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify fail**

```bash
npx vitest run tests/line-reminder-debug-fire-confirmation.test.js
```
Expected: FAIL.

- [ ] **Step 3: Implement `api/admin/line-reminder-debug-fire.js`**

```javascript
// ─── /api/admin/line-reminder-debug-fire — admin-gated debug push ───────────
// Spec §9 + §5 C.2. 3 modes: dry-run / single / all-with-branch-name-confirm.

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyAdminToken } from './_lib/adminAuth.js';
import { getLineConfigForBranch } from './_lib/lineConfigAdmin.js';
import { buildReminderFlex } from '../../src/lib/lineReminderTemplate.js';
import {
  pushLineMessage, getCustomerLineUserIdAtBranch,
  getMergedReminderSettings, buildReminderLogDoc, getReminderLogKey,
} from '../../src/lib/lineReminderClient.js';
import { runReminderPipeline } from '../cron/line-reminder-fire.js';

const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_APP_ID || 'loverclinic-opd-4c39b';
const BASE_PATH = `artifacts/${APP_ID}/public/data`;

const TEMPLATE_DEFAULTS = {
  templateDayBefore: 'สวัสดี {{customerName}} พรุ่งนี้ {{date}} {{time}} ที่ {{branchName}}',
  templateDayOf: 'สวัสดี {{customerName}} วันนี้ {{time}} ที่ {{branchName}}',
  cancellationPolicyText: 'กรุณาเลื่อน/ยกเลิกล่วงหน้า 24 ชั่วโมง',
};

function getAdmin() {
  if (getApps().length > 0) return getFirestore(getApp());
  const app = initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
  return getFirestore(app);
}

export function validateDebugFireRequest(body, branch) {
  if (!body) return { valid: false, error: 'MISSING_BODY' };
  if (!body.branchId) return { valid: false, error: 'MISSING_BRANCH_ID' };
  if (!['dayBefore', 'dayOf'].includes(body.reminderType)) {
    return { valid: false, error: 'INVALID_REMINDER_TYPE' };
  }
  if (!['dry-run', 'single', 'all'].includes(body.mode)) {
    return { valid: false, error: 'INVALID_MODE' };
  }
  if (body.mode === 'single' && !body.customerId) {
    return { valid: false, error: 'SINGLE_MODE_REQUIRES_CUSTOMER_ID' };
  }
  if (body.mode === 'all') {
    if (!branch || !branch.branchName) {
      return { valid: false, error: 'BRANCH_NOT_FOUND' };
    }
    if (String(body.confirmBranchName || '').trim() !== String(branch.branchName).trim()) {
      return { valid: false, error: 'BRANCH_NAME_CONFIRM_MISMATCH' };
    }
  }
  return { valid: true };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const db = getAdmin();
  const { branchId, reminderType, mode, customerId, confirmBranchName } = req.body || {};

  const branchSnap = await db.doc(`${BASE_PATH}/be_branches/${branchId}`).get();
  const branch = branchSnap.exists ? { branchId: branchSnap.id, ...branchSnap.data() } : null;

  const validation = validateDebugFireRequest({ branchId, reminderType, mode, customerId, confirmBranchName }, branch);
  if (!validation.valid) {
    return res.status(400).json({ ok: false, error: validation.error });
  }

  const cfg = await getLineConfigForBranch(db, branchId);
  if (!cfg || !cfg.enabled || !cfg.channelAccessToken) {
    return res.status(400).json({ ok: false, error: 'BRANCH_NO_OA_CONFIGURED' });
  }

  const merged = getMergedReminderSettings(cfg, TEMPLATE_DEFAULTS);

  // Compute target date — dayBefore = tomorrow, dayOf = today (Bangkok TZ)
  const now = new Date();
  const bkkMs = now.getTime() + 7 * 60 * 60 * 1000;
  const offset = reminderType === 'dayBefore' ? 24 * 60 * 60 * 1000 : 0;
  const d = new Date(bkkMs + offset);
  const targetDate = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

  // Pick candidates
  let candidates = [];
  if (mode === 'single') {
    const apptsSnap = await db.collection(`${BASE_PATH}/be_appointments`)
      .where('branchId', '==', branchId)
      .where('appointmentDate', '==', targetDate)
      .where('customerId', '==', customerId)
      .get();
    candidates = apptsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } else {
    const apptsSnap = await db.collection(`${BASE_PATH}/be_appointments`)
      .where('branchId', '==', branchId)
      .where('appointmentDate', '==', targetDate)
      .get();
    candidates = apptsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(a => Array.isArray(a.notifyChannel) && a.notifyChannel.includes('line'));
  }

  if (mode === 'dry-run') {
    const previews = [];
    for (const appt of candidates.slice(0, 3)) {
      const cs = await db.doc(`${BASE_PATH}/be_customers/${appt.customerId}`).get();
      if (!cs.exists) continue;
      const cust = { id: cs.id, ...cs.data() };
      const lineUid = getCustomerLineUserIdAtBranch(cust, branchId);
      if (!lineUid) continue;
      const flex = buildReminderFlex({ cust, appt, branch, doctor: null, treatments: appt.treatments || [], branchSettings: merged, reminderType });
      previews.push({ apptId: appt.id, customerId: appt.customerId, lineUserId: lineUid, flex });
    }
    return res.status(200).json({ ok: true, mode: 'dry-run', totalEligible: candidates.length, previews });
  }

  // mode = single | all → real push
  const results = { sent: 0, failed: 0, skipped: 0, details: [] };
  const currentHour = new Date(now.getTime() + 7 * 60 * 60 * 1000).getUTCHours();
  for (const appt of candidates) {
    const cs = await db.doc(`${BASE_PATH}/be_customers/${appt.customerId}`).get();
    if (!cs.exists) { results.skipped++; continue; }
    const cust = { id: cs.id, ...cs.data() };
    const doctor = appt.doctorId ? await db.doc(`${BASE_PATH}/be_doctors/${appt.doctorId}`).get().then(s => s.exists ? { id: s.id, ...s.data() } : null).catch(() => null) : null;
    const out = await runReminderPipeline({
      db, appt, cust, branch, doctor, treatments: appt.treatments || [],
      branchCfg: cfg, reminderType, currentHour,
    });
    results.details.push({ apptId: appt.id, status: out.status });
    if (out.status === 'sent') results.sent++;
    else if (out.status.startsWith('skipped')) results.skipped++;
    else results.failed++;
  }

  return res.status(200).json({ ok: true, mode, totalAttempted: candidates.length, results });
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npx vitest run tests/line-reminder-debug-fire-confirmation.test.js
```
Expected: 6/6 PASS.

- [ ] **Step 5: Commit**

```bash
git add api/admin/line-reminder-debug-fire.js tests/line-reminder-debug-fire-confirmation.test.js
git commit -m "feat(line-reminder): Task 6 — admin debug-fire endpoint (3 modes + branch-name confirm)"
```

---

## Task 7 — Extend webhook with postback handler

**Spec ref:** §7 webhook (postback handler).

**Files:**
- Modify: `api/webhook/line.js` (add handlePostback function + route in event loop)
- Test: `tests/line-reminder-webhook-postback-branch-routing.test.js` (NEW)

- [ ] **Step 1: Write failing test**

`tests/line-reminder-webhook-postback-branch-routing.test.js`:
```javascript
import { describe, it, expect, vi } from 'vitest';
import { postbackActionToFlag } from '../api/webhook/line.js';

describe('T7 postbackActionToFlag', () => {
  it('T7.1 confirm → confirmed', () => {
    expect(postbackActionToFlag('confirm')).toBe('confirmed');
  });
  it('T7.2 reschedule → reschedule-requested', () => {
    expect(postbackActionToFlag('reschedule')).toBe('reschedule-requested');
  });
  it('T7.3 contact → contact-requested', () => {
    expect(postbackActionToFlag('contact')).toBe('contact-requested');
  });
  it('T7.4 unknown action → null', () => {
    expect(postbackActionToFlag('fakeaction')).toBe(null);
    expect(postbackActionToFlag('')).toBe(null);
    expect(postbackActionToFlag(null)).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify fail**

```bash
npx vitest run tests/line-reminder-webhook-postback-branch-routing.test.js
```
Expected: FAIL.

- [ ] **Step 3: Implement handlePostback + export postbackActionToFlag**

Open `api/webhook/line.js`. Add helpers (alongside existing helpers near top):

```javascript
import { parsePostbackData } from '../../src/lib/lineReminderTemplate.js';

export function postbackActionToFlag(action) {
  switch (action) {
    case 'confirm':    return 'confirmed';
    case 'reschedule': return 'reschedule-requested';
    case 'contact':    return 'contact-requested';
    default:           return null;
  }
}

async function handlePostback(event, db, resolved) {
  if (!event?.postback?.data) return;
  if (!resolved) return; // unknown OA — silent drop
  const { config, branchId } = resolved;
  const parsed = parsePostbackData(event.postback.data);
  if (!parsed.action || !parsed.appt) return;

  // Defense-in-depth: cross-check postback `br` field with destination-resolved branchId
  if (parsed.br && parsed.br !== branchId) {
    console.warn(`[postback] branch mismatch data=${parsed.br} destination=${branchId}`);
    return;
  }

  const apptRef = db.collection(`artifacts/${APP_ID}/public/data/be_appointments`).doc(parsed.appt);
  const apptSnap = await apptRef.get();
  if (!apptSnap.exists) {
    await reply(event.replyToken, 'ไม่พบนัดหมาย กรุณาติดต่อคลินิก', config.channelAccessToken);
    return;
  }
  const apptData = apptSnap.data();
  if (apptData.branchId !== branchId) {
    console.warn(`[postback] appt.branchId=${apptData.branchId} ≠ event.branchId=${branchId}`);
    await reply(event.replyToken, 'นัดนี้ไม่ตรงกับสาขาที่เชื่อมต่อ กรุณาติดต่อคลินิก', config.channelAccessToken);
    return;
  }

  // Atomic batch: postback_log + appointment update
  const { FieldValue } = await import('firebase-admin/firestore');
  const batch = db.batch();
  const logId = `pb-${Date.now()}-${randomBytes(4).toString('hex')}`;
  batch.set(db.collection(`artifacts/${APP_ID}/public/data/be_line_reminder_postback_log`).doc(logId), {
    appointmentId: parsed.appt,
    customerId: apptData.customerId,
    branchId,
    action: parsed.action,
    receivedAt: FieldValue.serverTimestamp(),
    rawPostbackData: event.postback.data,
  });
  const apptUpdate = {
    'notifyMeta.lastPostbackAction': postbackActionToFlag(parsed.action),
    'notifyMeta.lastPostbackAt': FieldValue.serverTimestamp(),
  };
  if (parsed.action === 'confirm') {
    apptUpdate.status = 'confirmed';
    apptUpdate.confirmedAt = FieldValue.serverTimestamp();
    apptUpdate.confirmedVia = 'line-postback';
  }
  batch.update(apptRef, apptUpdate);
  await batch.commit();

  switch (parsed.action) {
    case 'confirm':
      await reply(event.replyToken, '✓ ยืนยันนัดเรียบร้อย — เจอกันค่ะ', config.channelAccessToken);
      break;
    case 'reschedule':
      await reply(event.replyToken, 'ขอเลื่อนนัดได้รับเรียบร้อย — แอดมินจะติดต่อกลับเร็วๆ นี้ค่ะ', config.channelAccessToken);
      break;
    case 'contact':
      const bSnap = await db.doc(`artifacts/${APP_ID}/public/data/be_branches/${branchId}`).get();
      const phone = bSnap.exists ? (bSnap.data().phoneNumber || 'โปรดติดต่อทาง LINE นี้') : 'โปรดติดต่อทาง LINE นี้';
      const branchName = bSnap.exists ? (bSnap.data().branchName || '') : '';
      await reply(event.replyToken, `ติดต่อคลินิก ${branchName}: ${phone}\nหรือพิมพ์ข้อความที่นี่ — แอดมินจะตอบค่ะ`, config.channelAccessToken);
      break;
  }
}
```

Wire `handlePostback` into the event loop in `default handler`:
```javascript
// Inside the for-each event loop:
if (event.type === 'postback') {
  await handlePostback(event, db, resolvedForThisEvent);
  continue;
}
```

Make sure `reply` helper accepts the per-branch channelAccessToken (refactor if needed).

- [ ] **Step 4: Run test to verify pass**

```bash
npx vitest run tests/line-reminder-webhook-postback-branch-routing.test.js
```
Expected: 4/4 PASS.

- [ ] **Step 5: Commit**

```bash
git add api/webhook/line.js tests/line-reminder-webhook-postback-branch-routing.test.js
git commit -m "feat(line-reminder): Task 7 — webhook postback handler (per-branch routing via resolveLineConfigForWebhook)"
```

---

## Task 8 — Webhook opt-out intents + customer linkage write extension

**Spec ref:** §7 webhook (opt-out intents); §17 customer linkage evolution.

**Files:**
- Modify: `api/webhook/line.js` (add หยุดแจ้งเตือน / เริ่มแจ้งเตือน intents + extend customer-link write)
- Test: `tests/line-reminder-webhook-opt-out-intent.test.js` (NEW)

- [ ] **Step 1: Write failing test**

`tests/line-reminder-webhook-opt-out-intent.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import { detectOptOutIntent } from '../api/webhook/line.js';

describe('T8 detectOptOutIntent', () => {
  it('T8.1 หยุดแจ้งเตือน → optOut=true', () => {
    expect(detectOptOutIntent('หยุดแจ้งเตือน')).toEqual({ matched: true, optOut: true });
  });
  it('T8.2 stop → optOut=true (case-insensitive)', () => {
    expect(detectOptOutIntent('STOP')).toEqual({ matched: true, optOut: true });
    expect(detectOptOutIntent('stop')).toEqual({ matched: true, optOut: true });
  });
  it('T8.3 เริ่มแจ้งเตือน → optOut=false', () => {
    expect(detectOptOutIntent('เริ่มแจ้งเตือน')).toEqual({ matched: true, optOut: false });
  });
  it('T8.4 start → optOut=false', () => {
    expect(detectOptOutIntent('start')).toEqual({ matched: true, optOut: false });
  });
  it('T8.5 unrelated text → matched=false', () => {
    expect(detectOptOutIntent('hello')).toEqual({ matched: false });
    expect(detectOptOutIntent('คอร์ส')).toEqual({ matched: false });
  });
  it('T8.6 trims whitespace', () => {
    expect(detectOptOutIntent('  หยุดแจ้งเตือน  ')).toEqual({ matched: true, optOut: true });
  });
});
```

- [ ] **Step 2: Run test to verify fail**

```bash
npx vitest run tests/line-reminder-webhook-opt-out-intent.test.js
```
Expected: FAIL.

- [ ] **Step 3: Implement detectOptOutIntent + wire into handleMessage**

Open `api/webhook/line.js`. Add export:
```javascript
export function detectOptOutIntent(text) {
  if (!text || typeof text !== 'string') return { matched: false };
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  if (trimmed === 'หยุดแจ้งเตือน' || lower === 'stop') return { matched: true, optOut: true };
  if (trimmed === 'เริ่มแจ้งเตือน' || lower === 'start') return { matched: true, optOut: false };
  return { matched: false };
}

async function setCustomerOptOut(db, customerId, value, by) {
  const ref = db.doc(`artifacts/${APP_ID}/public/data/be_customers/${customerId}`);
  await ref.update({
    notifyOptOut: value,
    notifyOptOutAt: value ? new Date().toISOString() : null,
    notifyOptOutBy: value ? by : null,
  });
}

async function findCustomerByLineUserIdAtBranch(db, lineUserId, branchId) {
  // 1) Try lineUserId_byBranch[branchId].lineUserId === lineUserId
  // 2) Fallback: legacy customer.lineUserId === lineUserId AND customer.branchId === branchId
  const path = `artifacts/${APP_ID}/public/data/be_customers`;
  // The 1st query — we cannot directly query nested map by value in Firestore.
  // Use legacy field as primary search + verify branchId.
  const snap = await db.collection(path).where('lineUserId', '==', lineUserId).limit(5).get();
  for (const d of snap.docs) {
    const data = d.data();
    // Match if legacy linkage at correct branch
    if (data.branchId === branchId) return { id: d.id, ...data };
    // Match if per-branch linkage exists
    if (data.lineUserId_byBranch?.[branchId]?.lineUserId === lineUserId) return { id: d.id, ...data };
  }
  // Last resort: scan recent customers — DEFER if too expensive. For MVP, accept that
  // brand-new per-branch linkages without legacy lineUserId aren't queryable directly.
  return null;
}
```

In `handleMessage`, add BEFORE existing intent dispatcher (right after the `resolveLineConfigForWebhook` resolves):
```javascript
const text = event.message.text;
const optOutIntent = detectOptOutIntent(text);
if (optOutIntent.matched) {
  const customer = await findCustomerByLineUserIdAtBranch(db, event.source.userId, branchId);
  if (customer) {
    await setCustomerOptOut(db, customer.id, optOutIntent.optOut, 'customer-dm');
    const replyText = optOutIntent.optOut
      ? '✓ หยุดแจ้งเตือนผ่าน LINE เรียบร้อยค่ะ\nหากต้องการเปิดอีกครั้ง พิมพ์ "เริ่มแจ้งเตือน"'
      : '✓ เปิดแจ้งเตือนผ่าน LINE เรียบร้อยค่ะ ระบบจะแจ้งเตือนก่อนนัด 1 วัน';
    await reply(event.replyToken, replyText, config.channelAccessToken);
  } else {
    await reply(event.replyToken, 'ยังไม่ผูก LINE กับสาขานี้ค่ะ กรุณาติดต่อแอดมินเพื่อผูกบัญชี', config.channelAccessToken);
  }
  continue;
}
```

For customer linkage extension (V32-tris-ter approval flow):
Find where customer is patched with `lineUserId: event.source.userId` after admin approves link. Add per-branch write:
```javascript
// Existing legacy patch (preserved for backward-compat):
await customerRef.update({
  lineUserId: event.source.userId,
  lineDisplayName: profile.displayName,
  lineLinkedAt: FieldValue.serverTimestamp(),
});
// NEW per-branch patch:
await customerRef.update({
  [`lineUserId_byBranch.${branchId}`]: {
    lineUserId: event.source.userId,
    lineDisplayName: profile.displayName,
    linkedAt: new Date().toISOString(),
    _lineStale: false,
    _lineStaleAt: null,
  },
});
```

- [ ] **Step 4: Run test to verify pass**

```bash
npx vitest run tests/line-reminder-webhook-opt-out-intent.test.js
```
Expected: 6/6 PASS.

- [ ] **Step 5: Commit**

```bash
git add api/webhook/line.js tests/line-reminder-webhook-opt-out-intent.test.js
git commit -m "feat(line-reminder): Task 8 — webhook opt-out intents + customer.lineUserId_byBranch[branchId] write"
```

---

## Task 9 — NEW `CustomerOption.jsx` + migrate 6 callsites

**Spec ref:** §5 A.

**Files:**
- Create: `src/components/CustomerOption.jsx`
- Test: `tests/line-reminder-customer-option.test.jsx` (NEW)
- Test: `tests/line-reminder-customer-option-source-grep.test.js` (NEW — LR-4)
- Modify: 6 callsites (AppointmentFormModal, DepositPanel, AppointmentTab, AdminDashboard, CustomerDetailView, TreatmentFormPage)

- [ ] **Step 1: Write failing tests**

`tests/line-reminder-customer-option.test.jsx`:
```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CustomerOption } from '../src/components/CustomerOption.jsx';

describe('T9 CustomerOption', () => {
  it('T9.1 renders customer name', () => {
    render(<CustomerOption customer={{ name: 'นาย โอ๊ค' }} contextBranchId="BR-A" />);
    expect(screen.getByText('นาย โอ๊ค')).toBeInTheDocument();
  });

  it('T9.2 prefers fullName over name', () => {
    render(<CustomerOption customer={{ name: 'X', fullName: 'นาย โอ๊ค สุภาพ' }} contextBranchId="BR-A" />);
    expect(screen.getByText('นาย โอ๊ค สุภาพ')).toBeInTheDocument();
  });

  it('T9.3 linked at this branch shows 🟢 LINE badge', () => {
    const customer = {
      name: 'X',
      branchId: 'BR-A',
      lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A', lineDisplayName: 'LineX' } },
    };
    render(<CustomerOption customer={customer} contextBranchId="BR-A" />);
    expect(screen.getByTitle(/LINE: LineX/)).toBeInTheDocument();
  });

  it('T9.4 legacy lineUserId at customer.branchId === contextBranchId shows 🟢', () => {
    const customer = { name: 'X', branchId: 'BR-A', lineUserId: 'legacy', lineDisplayName: 'LegacyName' };
    render(<CustomerOption customer={customer} contextBranchId="BR-A" />);
    expect(screen.getByTitle(/LINE: LegacyName/)).toBeInTheDocument();
  });

  it('T9.5 linked elsewhere → ⚪️ LINE chip', () => {
    const customer = { name: 'X', branchId: 'BR-A', lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A' } } };
    render(<CustomerOption customer={customer} contextBranchId="BR-Y" />);
    expect(screen.getByTitle(/ผูก LINE กับสาขาอื่น/)).toBeInTheDocument();
  });

  it('T9.6 not linked anywhere → no badge', () => {
    const customer = { name: 'X', branchId: 'BR-A' };
    const { container } = render(<CustomerOption customer={customer} contextBranchId="BR-A" />);
    expect(container.querySelector('[title*="LINE"]')).toBeNull();
  });

  it('T9.7 showLineBadge=false suppresses badge', () => {
    const customer = { name: 'X', branchId: 'BR-A', lineUserId: 'L' };
    const { container } = render(<CustomerOption customer={customer} contextBranchId="BR-A" showLineBadge={false} />);
    expect(container.querySelector('[title*="LINE"]')).toBeNull();
  });
});
```

`tests/line-reminder-customer-option-source-grep.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

describe('LR-4 — CustomerOption usage in 6 appointment-creating callsites', () => {
  const REQUIRED_SITES = [
    'src/components/backend/AppointmentFormModal.jsx',
    'src/components/backend/DepositPanel.jsx',
    'src/components/backend/AppointmentTab.jsx',
    'src/pages/AdminDashboard.jsx',
    'src/components/backend/CustomerDetailView.jsx',
    'src/components/TreatmentFormPage.jsx',
  ];

  for (const site of REQUIRED_SITES) {
    it(`LR4.${site.split('/').pop()} — imports CustomerOption + uses contextBranchId`, () => {
      const text = fs.readFileSync(path.join(ROOT, site), 'utf8');
      expect(text, `${site} must import CustomerOption`).toMatch(/import\s+\{[^}]*CustomerOption[^}]*\}/);
      expect(text, `${site} must use <CustomerOption ... contextBranchId={...} />`).toMatch(/CustomerOption[\s\S]{0,200}contextBranchId/);
    });
  }
});
```

- [ ] **Step 2: Run tests to verify fail**

```bash
npx vitest run tests/line-reminder-customer-option.test.jsx tests/line-reminder-customer-option-source-grep.test.js
```
Expected: FAIL.

- [ ] **Step 3: Create `src/components/CustomerOption.jsx`**

```jsx
export function CustomerOption({ customer, contextBranchId, showLineBadge = true }) {
  if (!customer) return null;
  const displayName = customer.fullName || customer.name || '';
  const branchLink = customer.lineUserId_byBranch?.[contextBranchId];
  const legacyValid = customer.branchId === contextBranchId && customer.lineUserId;
  const linkedHere = !!(branchLink?.lineUserId || legacyValid);
  const hasAnyLink = customer.lineUserId || Object.keys(customer.lineUserId_byBranch || {}).length > 0;
  const linkedElsewhere = !linkedHere && hasAnyLink;
  const displayLine = branchLink?.lineDisplayName || customer.lineDisplayName || 'linked';

  return (
    <div className="flex items-center gap-2">
      <span>{displayName}</span>
      {showLineBadge && linkedHere && (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/10 text-green-700 dark:text-green-400 text-xs font-medium"
          title={`LINE: ${displayLine}`}
        >
          🟢 LINE
        </span>
      )}
      {showLineBadge && linkedElsewhere && (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-500 text-xs"
          title="ลูกค้าผูก LINE กับสาขาอื่น — ยังไม่ผูกกับสาขานี้"
        >
          ⚪️ LINE
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Migrate 6 callsites — add `import { CustomerOption } from '../CustomerOption.jsx'` + replace customer option JSX**

For each of:
- `src/components/backend/AppointmentFormModal.jsx`
- `src/components/backend/DepositPanel.jsx`
- `src/components/backend/AppointmentTab.jsx`
- `src/pages/AdminDashboard.jsx`
- `src/components/backend/CustomerDetailView.jsx`
- `src/components/TreatmentFormPage.jsx`

Find the place where the customer dropdown renders a customer name. Replace inline `<div>{customer.name}</div>` with `<CustomerOption customer={customer} contextBranchId={selectedBranchId} />`.

Adjust import path per file location (each is at a different depth).

For TreatmentFormPage and other paths, `import { CustomerOption } from '../components/CustomerOption.jsx';` or similar.

- [ ] **Step 5: Run tests to verify pass**

```bash
npx vitest run tests/line-reminder-customer-option.test.jsx tests/line-reminder-customer-option-source-grep.test.js
```
Expected: 7 + 6 = 13/13 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/CustomerOption.jsx \
  src/components/backend/AppointmentFormModal.jsx src/components/backend/DepositPanel.jsx \
  src/components/backend/AppointmentTab.jsx src/pages/AdminDashboard.jsx \
  src/components/backend/CustomerDetailView.jsx src/components/TreatmentFormPage.jsx \
  tests/line-reminder-customer-option.test.jsx tests/line-reminder-customer-option-source-grep.test.js
git commit -m "feat(line-reminder): Task 9 — CustomerOption shared component + 6 callsites migration (LR-4 lock)"
```

---

## Task 10 — Appointment modal auto-tick + backendClient write notifyChannel

**Spec ref:** §5 B (auto-tick); §3 pipeline write contract.

**Files:**
- Modify: `src/lib/backendClient.js` (createAppointment + updateAppointment write notifyChannel + notifyMeta)
- Modify: 5 appointment-creating modals (auto-tick logic + LineNotifyConfirmation block)
- Test: `tests/line-reminder-modal-autotick.test.jsx` (NEW)
- Test: `tests/line-reminder-modal-autotick-source-grep.test.js` (NEW — LR-4 part 2)

- [ ] **Step 1: Write failing tests**

`tests/line-reminder-modal-autotick.test.jsx`:
```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LineNotifyConfirmation } from '../src/components/LineNotifyConfirmation.jsx';

describe('T10 LineNotifyConfirmation', () => {
  it('T10.1 linked-here — checkbox checked + green chip', () => {
    const customer = {
      name: 'X', branchId: 'BR-A',
      lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A', lineDisplayName: 'OakLINE' } },
    };
    render(<LineNotifyConfirmation customer={customer} targetBranchId="BR-A" checked={true} onChange={() => {}} />);
    expect(screen.getByText(/แจ้งเตือนผ่าน LINE/)).toBeInTheDocument();
    expect(screen.getByText(/OakLINE/)).toBeInTheDocument();
  });

  it('T10.2 linked elsewhere — warning + invite-to-link', () => {
    const customer = {
      name: 'X', branchId: 'BR-A',
      lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A' } },
    };
    render(<LineNotifyConfirmation customer={customer} targetBranchId="BR-Y" checked={false} onChange={() => {}} />);
    expect(screen.getByText(/ผูก LINE กับสาขาอื่น/)).toBeInTheDocument();
  });

  it('T10.3 customer.notifyOptOut shows warning chip', () => {
    const customer = { name: 'X', branchId: 'BR-A', lineUserId: 'l', notifyOptOut: true };
    render(<LineNotifyConfirmation customer={customer} targetBranchId="BR-A" checked={false} onChange={() => {}} />);
    expect(screen.getByText(/ลูกค้าปิดแจ้งเตือน/)).toBeInTheDocument();
  });

  it('T10.4 stale chip', () => {
    const customer = {
      name: 'X', branchId: 'BR-A',
      lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A', _lineStale: true } },
    };
    render(<LineNotifyConfirmation customer={customer} targetBranchId="BR-A" checked={false} onChange={() => {}} />);
    expect(screen.getByText(/หมดอายุ/)).toBeInTheDocument();
  });

  it('T10.5 not linked anywhere → component returns null', () => {
    const customer = { name: 'X', branchId: 'BR-A' };
    const { container } = render(<LineNotifyConfirmation customer={customer} targetBranchId="BR-A" checked={false} onChange={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
```

`tests/line-reminder-modal-autotick-source-grep.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

describe('LR-4b — auto-tick + notifyChannel in 5 appointment modals', () => {
  const SITES = [
    'src/components/backend/AppointmentFormModal.jsx',
    'src/components/backend/DepositPanel.jsx',
    'src/components/backend/AppointmentTab.jsx',
    'src/pages/AdminDashboard.jsx',
    'src/components/TreatmentFormPage.jsx',
  ];

  for (const site of SITES) {
    it(`LR4b.${site.split('/').pop()} — imports LineNotifyConfirmation + notifyChannel state`, () => {
      const text = fs.readFileSync(path.join(ROOT, site), 'utf8');
      expect(text, `${site} must import LineNotifyConfirmation`).toMatch(/import\s+\{[^}]*LineNotifyConfirmation[^}]*\}/);
      expect(text, `${site} must set notifyChannel state`).toMatch(/notifyChannel|notifyChannels/);
    });
  }

  it('LR4b.backendClient writes notifyChannel on createAppointment', () => {
    const text = fs.readFileSync(path.join(ROOT, 'src/lib/backendClient.js'), 'utf8');
    expect(text).toMatch(/createAppointment[\s\S]{0,3000}notifyChannel/);
  });
});
```

- [ ] **Step 2: Run tests to verify fail**

```bash
npx vitest run tests/line-reminder-modal-autotick.test.jsx tests/line-reminder-modal-autotick-source-grep.test.js
```
Expected: FAIL.

- [ ] **Step 3: Create `src/components/LineNotifyConfirmation.jsx`**

```jsx
export function LineNotifyConfirmation({ customer, targetBranchId, checked, onChange, onOfferLinkHere }) {
  if (!customer || !targetBranchId) return null;
  const branchLink = customer.lineUserId_byBranch?.[targetBranchId];
  const legacyValid = customer.branchId === targetBranchId && customer.lineUserId;
  const linkedHere = !!(branchLink?.lineUserId || legacyValid);
  const hasAnyLink = customer.lineUserId || Object.keys(customer.lineUserId_byBranch || {}).length > 0;
  const linkedElsewhere = !linkedHere && hasAnyLink;
  if (!linkedHere && !linkedElsewhere) return null;

  const displayName = branchLink?.lineDisplayName || customer.lineDisplayName || 'เชื่อมแล้ว';
  const isStale = branchLink?._lineStale === true ||
    (customer.branchId === targetBranchId && customer._lineStale === true);
  const isOptOut = customer.notifyOptOut === true;

  if (linkedElsewhere) {
    return (
      <div className="rounded border border-yellow-500/30 bg-yellow-500/5 p-3 mt-2 text-sm">
        <div className="font-medium">⚠️ ลูกค้าผูก LINE กับสาขาอื่น — ยังไม่ได้ผูกกับสาขานี้</div>
        {onOfferLinkHere && (
          <button
            type="button"
            onClick={onOfferLinkHere}
            className="mt-2 px-3 py-1 rounded bg-yellow-500/20 hover:bg-yellow-500/30 text-xs font-medium"
          >
            สร้าง QR ผูก LINE สาขานี้
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded border border-green-500/30 bg-green-500/5 p-3 mt-2">
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange?.(e.target.checked)}
          disabled={isOptOut || isStale}
          data-field="notify-line"
        />
        <div>
          <div className="font-medium flex items-center gap-2 flex-wrap">
            <span>🟢 แจ้งเตือนผ่าน LINE</span>
            {isOptOut && <span className="text-xs text-red-500">(ลูกค้าปิดแจ้งเตือน)</span>}
            {isStale && <span className="text-xs text-orange-500">(LINE หมดอายุ — ต้องผูกใหม่)</span>}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            LINE: <strong>{displayName}</strong>
          </div>
        </div>
      </label>
    </div>
  );
}
```

- [ ] **Step 4: Patch `src/lib/backendClient.js` — write notifyChannel + notifyMeta**

Find `createAppointment` (or equivalent). Extend the doc payload:
```javascript
const apptDoc = {
  // ... existing fields ...
  notifyChannel: Array.isArray(input.notifyChannel) ? input.notifyChannel : [],
  notifyMeta: input.notifyMeta || { sentDayBefore: null, sentDayOf: null, lastPostbackAction: null, lastPostbackAt: null },
};
```

In `updateAppointment` allow updating `notifyChannel` field (whitelist).

- [ ] **Step 5: Wire 5 modals — add notifyChannel state + auto-tick effect + render LineNotifyConfirmation**

For EACH of:
- AppointmentFormModal.jsx
- DepositPanel.jsx
- AppointmentTab.jsx (the inline appt-create section)
- AdminDashboard.jsx (the appt-create modal)
- TreatmentFormPage.jsx (book-followup section)

Add after existing imports:
```jsx
import { LineNotifyConfirmation } from '../LineNotifyConfirmation.jsx';
// (Adjust path per file depth)
```

Inside the component:
```jsx
const [notifyChannel, setNotifyChannel] = useState([]);
const { branchId: selectedBranchId } = useSelectedBranch();
const targetBranchId = props.branchId || selectedBranchId;

useEffect(() => {
  if (!selectedCustomer) { setNotifyChannel([]); return; }
  const branchLink = selectedCustomer.lineUserId_byBranch?.[targetBranchId];
  const legacyValid = selectedCustomer.branchId === targetBranchId && selectedCustomer.lineUserId;
  const linkedHere = !!(branchLink?.lineUserId || legacyValid);
  const optedOut = selectedCustomer.notifyOptOut === true;
  const isStale = branchLink?._lineStale === true ||
    (selectedCustomer.branchId === targetBranchId && selectedCustomer._lineStale === true);
  const canAutoTick = linkedHere && !optedOut && !isStale;
  if (canAutoTick) setNotifyChannel(prev => prev.includes('line') ? prev : [...prev, 'line']);
  else setNotifyChannel(prev => prev.filter(c => c !== 'line'));
}, [selectedCustomer?.id, targetBranchId]);

// In the form area:
<LineNotifyConfirmation
  customer={selectedCustomer}
  targetBranchId={targetBranchId}
  checked={notifyChannel.includes('line')}
  onChange={(val) => setNotifyChannel(prev =>
    val ? Array.from(new Set([...prev, 'line'])) : prev.filter(c => c !== 'line')
  )}
/>
```

On submit, pass `notifyChannel` into the createAppointment payload.

- [ ] **Step 6: Run tests to verify pass**

```bash
npx vitest run tests/line-reminder-modal-autotick.test.jsx tests/line-reminder-modal-autotick-source-grep.test.js
```
Expected: 5 + 6 = 11/11 PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/LineNotifyConfirmation.jsx src/lib/backendClient.js \
  src/components/backend/AppointmentFormModal.jsx src/components/backend/DepositPanel.jsx \
  src/components/backend/AppointmentTab.jsx src/pages/AdminDashboard.jsx src/components/TreatmentFormPage.jsx \
  tests/line-reminder-modal-autotick.test.jsx tests/line-reminder-modal-autotick-source-grep.test.js
git commit -m "feat(line-reminder): Task 10 — auto-tick LINE checkbox in 5 modals + backendClient writes notifyChannel"
```

---

## Task 11 — LineSettingsTab — 3 new sub-sections

**Spec ref:** §5 C.

**Files:**
- Create: `src/components/backend/LineReminderSettingsSection.jsx`
- Create: `src/components/backend/LineReminderDebugSection.jsx`
- Create: `src/components/backend/LineReminderHistoryPanel.jsx`
- Modify: `src/components/backend/LineSettingsTab.jsx` (compose 3 sub-sections)
- Test: `tests/line-reminder-settings-tab.test.jsx` (NEW)
- Test: `tests/line-reminder-history-panel.test.jsx` (NEW)

- [ ] **Step 1: Write failing tests**

`tests/line-reminder-settings-tab.test.jsx`:
```jsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LineReminderSettingsSection } from '../src/components/backend/LineReminderSettingsSection.jsx';

describe('T11 LineReminderSettingsSection', () => {
  it('T11.1 renders toggle + time pickers + template editors', () => {
    const form = { lineReminder: { enabled: false, dayBeforeHour: 20, dayOfHour: 9, quietHourStart: 22, quietHourEnd: 8, templateDayBefore: 'x', templateDayOf: 'y', cancellationPolicyText: 'z' } };
    render(<LineReminderSettingsSection form={form} onChange={() => {}} />);
    expect(screen.getByText(/แจ้งเตือนสาขานี้/)).toBeInTheDocument();
    expect(screen.getByDisplayValue(20)).toBeInTheDocument();
    expect(screen.getByDisplayValue(9)).toBeInTheDocument();
  });

  it('T11.2 toggle enabled fires onChange', () => {
    const form = { lineReminder: { enabled: false, dayBeforeHour: 20, dayOfHour: 9, quietHourStart: 22, quietHourEnd: 8, templateDayBefore: '', templateDayOf: '', cancellationPolicyText: '' } };
    const onChange = vi.fn();
    render(<LineReminderSettingsSection form={form} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /แจ้งเตือนสาขานี้/ }));
    expect(onChange).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify fail**

```bash
npx vitest run tests/line-reminder-settings-tab.test.jsx
```
Expected: FAIL.

- [ ] **Step 3: Implement 3 sub-components**

Skip code blocks here for brevity — implement standard React form components using existing project patterns (input/label/textarea + onChange dispatchers writing into the parent `form.lineReminder.*` map).

Key points:
- `LineReminderSettingsSection.jsx` — controlled form, fires `onChange(patch)` per field.
- `LineReminderDebugSection.jsx` — 3-mode radio + customer picker (for single mode) + branch-name confirm input (for "all" mode) + "ทดสอบเลย" button calling `/api/admin/line-reminder-debug-fire` via fetch with admin token.
- `LineReminderHistoryPanel.jsx` — onSnapshot listener to `be_line_reminder_log` where `branchId === selectedBranchId`, last 7 days; renders table with status chips.

- [ ] **Step 4: Wire 3 sub-sections into `LineSettingsTab.jsx`**

Find existing tab body. Add 3 new sections inside the form (between existing sections):
```jsx
<LineReminderSettingsSection form={form} onChange={update} />
<LineReminderDebugSection branchId={branchId} branchName={branchName} />
<LineReminderHistoryPanel branchId={branchId} />
```

- [ ] **Step 5: Run tests to verify pass**

```bash
npx vitest run tests/line-reminder-settings-tab.test.jsx tests/line-reminder-history-panel.test.jsx
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/backend/LineReminderSettingsSection.jsx \
  src/components/backend/LineReminderDebugSection.jsx \
  src/components/backend/LineReminderHistoryPanel.jsx \
  src/components/backend/LineSettingsTab.jsx \
  tests/line-reminder-settings-tab.test.jsx tests/line-reminder-history-panel.test.jsx
git commit -m "feat(line-reminder): Task 11 — 3 new sections in LineSettingsTab (settings + debug + history)"
```

---

## Task 12 — CustomerDetailView opt-out + per-branch linkage display

**Spec ref:** §5 D.

**Files:**
- Modify: `src/components/backend/CustomerDetailView.jsx` (NEW "การแจ้งเตือน LINE" section)
- Test: `tests/line-reminder-customer-detail.test.jsx` (NEW)

- [ ] **Step 1: Write failing test**

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CustomerLineSection } from '../src/components/backend/CustomerLineSection.jsx';

describe('T12 CustomerLineSection', () => {
  it('T12.1 shows per-branch linkages list', () => {
    const c = {
      lineUserId_byBranch: {
        'BR-A': { lineUserId: 'U-A', lineDisplayName: 'OakA', linkedAt: '2026-05-15T00:00:00Z' },
        'BR-B': { lineUserId: 'U-B', lineDisplayName: 'OakB', linkedAt: '2026-05-15T00:00:00Z' },
      },
    };
    const branchesById = { 'BR-A': { branchName: 'Nakhon' }, 'BR-B': { branchName: 'Rama3' } };
    render(<CustomerLineSection customer={c} branchesById={branchesById} onToggleOptOut={() => {}} />);
    expect(screen.getByText(/Nakhon/)).toBeInTheDocument();
    expect(screen.getByText(/Rama3/)).toBeInTheDocument();
    expect(screen.getByText(/OakA/)).toBeInTheDocument();
  });

  it('T12.2 stale branch shows warning chip', () => {
    const c = {
      lineUserId_byBranch: {
        'BR-A': { lineUserId: 'U', _lineStale: true },
      },
    };
    render(<CustomerLineSection customer={c} branchesById={{ 'BR-A': { branchName: 'A' } }} onToggleOptOut={() => {}} />);
    expect(screen.getByText(/หมดอายุ|ถูกบล็อก|unfollow/i)).toBeInTheDocument();
  });

  it('T12.3 opt-out toggle reflects state', () => {
    render(<CustomerLineSection customer={{ notifyOptOut: true }} branchesById={{}} onToggleOptOut={() => {}} />);
    expect(screen.getByRole('checkbox', { name: /ปิดรับแจ้งเตือน/ })).toBeChecked();
  });
});
```

- [ ] **Step 2: Run test → fail**
- [ ] **Step 3: Implement `CustomerLineSection.jsx` + wire into CustomerDetailView**
- [ ] **Step 4: Run tests → pass**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(line-reminder): Task 12 — CustomerDetailView opt-out + per-branch linkage display"
```

---

## Task 13 — vercel.json crons + firestore.rules + Rule B probe extension

**Spec ref:** §13 rollout; §4 firestore rules.

**Files:**
- Modify: `vercel.json` (add 2 crons)
- Modify: `firestore.rules` (add 2 collection rules)
- Modify: `.claude/rules/01-iron-clad.md` (extend Rule B probe list)

- [ ] **Step 1: Add crons to `vercel.json`**

```json
{
  "crons": [
    { "path": "/api/cron/line-reminder-fire",  "schedule": "0 * * * *" },
    { "path": "/api/cron/line-reminder-retry", "schedule": "*/5 * * * *" }
  ]
}
```

(Merge with any existing crons[] array.)

- [ ] **Step 2: Add Firestore rules**

```
match /be_line_reminder_log/{logId} {
  allow read, write: if false;
}
match /be_line_reminder_postback_log/{id} {
  allow read, write: if false;
}
```

(Insert in the appropriate section of `firestore.rules`.)

- [ ] **Step 3: Document probe extension in `.claude/rules/01-iron-clad.md` Rule B**

Add to the probe list:
```
8. NEW (V67-line-reminder, 2026-05-15) — anon write to be_line_reminder_log + be_line_reminder_postback_log → expect 403
```

- [ ] **Step 4: Commit**

```bash
git add vercel.json firestore.rules .claude/rules/01-iron-clad.md
git commit -m "config(line-reminder): Task 13 — vercel.json crons + firestore.rules + Rule B probe extension"
```

---

## Task 14 — AV45 audit invariant + LR-1..LR-5 source-grep regression

**Spec ref:** §18 class-of-bug invariants.

**Files:**
- Modify: `.agents/skills/audit-anti-vibe-code/SKILL.md` (add AV45)
- Create: `tests/line-reminder-class-of-bug-per-branch-audit.test.js`

- [ ] **Step 1: Write the audit test (also the regression bank)**

`tests/line-reminder-class-of-bug-per-branch-audit.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function readFile(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

describe('AV45 / LR-1..LR-5 — per-branch LINE OA discipline', () => {
  describe('LR-1 Push API call uses per-branch channelAccessToken', () => {
    it('LR1.audit — fire endpoint passes channelAccessToken from branchCfg, NOT global', () => {
      const text = readFile('api/cron/line-reminder-fire.js');
      expect(text).toMatch(/channelAccessToken:\s*branchCfg\.channelAccessToken/);
      expect(text).not.toMatch(/process\.env\.LINE_CHANNEL_TOKEN/);
    });
    it('LR1.audit — retry endpoint uses getLineConfigForBranch', () => {
      const text = readFile('api/cron/line-reminder-retry.js');
      expect(text).toMatch(/getLineConfigForBranch/);
      expect(text).toMatch(/channelAccessToken:\s*branchCfg\.channelAccessToken|channelAccessToken:\s*cfg\.channelAccessToken/);
    });
    it('LR1.audit — debug fire endpoint uses getLineConfigForBranch', () => {
      const text = readFile('api/admin/line-reminder-debug-fire.js');
      expect(text).toMatch(/getLineConfigForBranch/);
    });
  });

  describe('LR-2 Webhook signature verification destination-routed', () => {
    it('LR2.audit — line.js uses resolveLineConfigForWebhook', () => {
      const text = readFile('api/webhook/line.js');
      expect(text).toMatch(/resolveLineConfigForWebhook/);
    });
  });

  describe('LR-3 Customer LINE userId branch-scoped helper', () => {
    it('LR3.audit — pipeline uses getCustomerLineUserIdAtBranch', () => {
      const text = readFile('api/cron/line-reminder-fire.js');
      expect(text).toMatch(/getCustomerLineUserIdAtBranch/);
    });
    it('LR3.audit — debug fire uses helper', () => {
      const text = readFile('api/admin/line-reminder-debug-fire.js');
      expect(text).toMatch(/getCustomerLineUserIdAtBranch/);
    });
    it('LR3.audit — retry uses helper', () => {
      const text = readFile('api/cron/line-reminder-retry.js');
      expect(text).toMatch(/getCustomerLineUserIdAtBranch/);
    });
  });

  describe('LR-4 Cross-branch customer detection in modals', () => {
    const SITES = [
      'src/components/backend/AppointmentFormModal.jsx',
      'src/components/backend/DepositPanel.jsx',
      'src/components/backend/AppointmentTab.jsx',
      'src/pages/AdminDashboard.jsx',
      'src/components/TreatmentFormPage.jsx',
    ];
    for (const site of SITES) {
      it(`LR4.audit — ${site.split('/').pop()} uses LineNotifyConfirmation + CustomerOption`, () => {
        const text = readFile(site);
        expect(text).toMatch(/LineNotifyConfirmation/);
        expect(text).toMatch(/CustomerOption/);
      });
    }
  });

  describe('LR-5 Audit log entries include branchId', () => {
    it('LR5.audit — buildReminderLogDoc has branchId field', () => {
      const text = readFile('src/lib/lineReminderClient.js');
      expect(text).toMatch(/branchId,/);
    });
    it('LR5.audit — postback log writes branchId', () => {
      const text = readFile('api/webhook/line.js');
      expect(text).toMatch(/be_line_reminder_postback_log[\s\S]{0,500}branchId/);
    });
  });

  it('AV45 — sanctioned exceptions documented in audit-anti-vibe-code SKILL.md', () => {
    const text = readFile('.agents/skills/audit-anti-vibe-code/SKILL.md');
    expect(text).toMatch(/AV45/);
    expect(text).toMatch(/LINE OA per-branch/);
  });
});
```

- [ ] **Step 2: Add AV45 entry to `.agents/skills/audit-anti-vibe-code/SKILL.md`**

Append to the invariants table:
```
AV45 — LINE OA per-branch credential + linkage discipline (V67-ish, 2026-05-15)
  Class: Per-branch LINE OA infrastructure must be uniformly applied across:
    LR-1: every fetch('https://api.line.me/v2/bot/message/push') uses
          cfg.channelAccessToken from getLineConfigForBranch(db, branchId)
    LR-2: webhook signature + reply uses config from resolveLineConfigForWebhook
    LR-3: customer LINE lookup goes through getCustomerLineUserIdAtBranch helper
    LR-4: appointment modals show 🟢/⚪️ via CustomerOption + LineNotifyConfirmation
    LR-5: be_line_reminder_log + be_line_reminder_postback_log have branchId field
  Sanctioned exceptions:
    - Top-of-line.js signature fallback (Phase BS V3 transition, documented at file head)
    - V32-tris-ter legacy customer.lineUserId writes (backward-compat in transition)
    - CustomerDetailView display of legacy linkage with "(legacy)" label
  Source-grep regression: tests/line-reminder-class-of-bug-per-branch-audit.test.js
```

- [ ] **Step 3: Run test to verify pass**

```bash
npx vitest run tests/line-reminder-class-of-bug-per-branch-audit.test.js
```
Expected: all assertions PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/line-reminder-class-of-bug-per-branch-audit.test.js .agents/skills/audit-anti-vibe-code/SKILL.md
git commit -m "audit(line-reminder): Task 14 — AV45 invariant + LR-1..LR-5 source-grep regression"
```

---

## Task 15 — Rule Q L2 e2e script (8 scenarios)

**Spec ref:** §12 P2.

**Files:**
- Create: `scripts/e2e-line-reminder-real-prod.mjs`

- [ ] **Step 1: Implement the script**

Write `scripts/e2e-line-reminder-real-prod.mjs` following the canonical Rule M pattern (env-pull + admin-SDK + 8 scenarios A-H from spec §12). Each scenario:
1. Seed fixtures (TEST-LINE-CUST-* + TEST-LINE-APPT-* + TEST-BR-*-config docs as needed)
2. Run pipeline logic locally (import runReminderPipeline from api/cron/line-reminder-fire.js)
3. Assert log doc shape + status
4. Cleanup all TEST-* fixtures + emit audit doc

Make scenario A use admin's REAL lineUserId (admin must provide via CLI flag `--admin-line-user-id=Uxxx`). Other scenarios use mock/fake lineUserId for routing-only verification.

- [ ] **Step 2: Run script in dry-run mode**

```bash
node scripts/e2e-line-reminder-real-prod.mjs
```
Expected: DRY-RUN summary printed without writes.

- [ ] **Step 3: Run script with --apply (admin must approve before deploying)**

```bash
node scripts/e2e-line-reminder-real-prod.mjs --apply --admin-line-user-id=Uxxx
```
Expected: All 8 scenarios PASS (or admin-flagged failures with diagnostics).

- [ ] **Step 4: Commit**

```bash
git add scripts/e2e-line-reminder-real-prod.mjs
git commit -m "test(line-reminder): Task 15 — Rule Q L2 e2e script (8 multi-branch scenarios)"
```

---

## Final verification + build

- [ ] **Step 1: Full targeted test sweep**

```bash
npx vitest run \
  tests/line-reminder-*.test.js tests/line-reminder-*.test.jsx \
  tests/lineReminderTemplate.test.js tests/lineReminderTemplate-parse-postback.test.js \
  tests/lineReminderClient.test.js
```
Expected: ALL PASS.

- [ ] **Step 2: Build clean**

```bash
npm run build
```
Expected: green (pre-existing chunk-size warnings unchanged).

- [ ] **Step 3: Full vitest sweep**

```bash
npx vitest run
```
Expected: 9883+ existing + NEW line-reminder tests all PASS.

- [ ] **Step 4: Push (no deploy yet)**

```bash
git push origin master
```

---

## Pre-deploy + Deploy (user-triggered only)

- [ ] **Step 1: Generate CRON_SECRET + provide to user**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```
Hand the output to user → user adds to Vercel env (Production scope).

- [ ] **Step 2: User confirms LINE Premium tier for นครราชสีมา OA**

(Not a code step — out-of-band confirmation.)

- [ ] **Step 3: User types "deploy" verbatim**

(Rule V18 — do NOT deploy without explicit "deploy" verb.)

- [ ] **Step 4: Combined deploy (V18 lock honored)**

```bash
vercel --prod --yes
firebase deploy --only firestore:rules
```

- [ ] **Step 5: Probe-Deploy-Probe (Rule B)**

Pre-probe: anon POST to `be_line_reminder_log` + `be_line_reminder_postback_log` → expect 403
Post-probe: same → expect 403

- [ ] **Step 6: L1 hands-on (spec §12 P3) — user runs**

User clicks Debug Fire in LineSettingsTab → real LINE message arrives → clicks ✓ ยืนยัน → status confirmed.
Send "หยุดแจ้งเตือน" → opt-out confirmed.

- [ ] **Step 7: Enable นครราชสีมา's reminder.enabled=true**

Admin opens LineSettingsTab → toggle ON → save.

- [ ] **Step 8: Monitor 48 hours**

Watch `be_line_reminder_log` filtered to นครราชสีมา.

---

## Self-Review

- ✅ Spec coverage: requirements 1-20 all mapped to tasks 1-15
- ✅ Per-branch architecture threaded through every pipeline + webhook + UI task
- ✅ Class-of-bug invariants LR-1..LR-5 locked via Task 14 + AV45
- ✅ Rule Q L2 multi-branch coverage via Task 15 8 scenarios
- ✅ Backward-compat with V32-tris-ter legacy customer.lineUserId preserved
- ✅ TDD per task (test fails → impl → test passes → commit)
- ✅ File map matches spec §19 exactly
- ⚠️ Task 11 + Task 12 step-3 implementation details brief — subagent should consult spec §5 C + D for exact UI requirements
- ⚠️ Task 9 step-4 6 callsites — subagent must inspect each file's existing pattern; CustomerOption JSX placement varies per modal
