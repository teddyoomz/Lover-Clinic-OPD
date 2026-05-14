# LINE OA Appointment Reminder System — Design Spec

> Created: 2026-05-15
> Status: brainstorming locked Q1=Full / Q2=Two windows / Q3=Flex Message / Q4=Both admin+DM opt-out + Section 2 (reschedule=admin-flag, quiet-hours=22-08, debug=3-mode-safe) + Section 3 locked
> Companion plan: `docs/superpowers/plans/2026-05-15-line-oa-appointment-reminder.md` (to be written by writing-plans skill)

---

## 1 — Problem statement

The clinic wants to push automated appointment reminders to customers via the LINE OA we already integrate with (V32-tris-ter QR-linking + chat-bot infrastructure shipped 2026-04-26).

**Core requirements** (user-stated):
1. Send reminder the day before at branch-configured time (default 20:00) via tab=line-settings per branch
2. Customer-picker dropdowns EVERYWHERE in the app show LINE-linked badge for customers with `lineUserId`
3. When admin picks a LINE-linked customer in any appointment-creating modal, auto-tick "แจ้งเตือนผ่าน LINE" checkbox + show LINE display name as connection-confirmation
4. Debug button in line-settings tab to fire reminders immediately to all customers with appointments tomorrow (dev test path)

**Extensions adopted from world-class research** (Acuity / SimplePractice / Bumrungrad / Mindbody patterns):
5. Two-window reminder (day-before + day-of-morning) — reduces no-show 30–40% vs single
6. Flex Message with action buttons (✓ ยืนยัน / เลื่อนนัด / ติดต่อคลินิก) — TH industry-standard
7. Idempotency keys per `(appointmentId, reminderType)` — retry-safe (Stripe/PagerDuty pattern)
8. Customer opt-out via DM ("หยุดแจ้งเตือน" / "เริ่มแจ้งเตือน") + admin-side toggle
9. Quiet hours (22:00–08:00 default, per-branch customizable)
10. Delivery-status tracking — LINE 410 response → mark `_lineStale=true` + admin alert
11. Retry queue with exp backoff for transient failures
12. Template tokens (`{{customerName}} {{branchName}} {{doctorName}} {{date}} {{time}}`) editable per branch
13. Audit log (per-send + daily aggregate)
14. Cancellation policy text in message footer

---

## 2 — Architecture overview

```
[Vercel Cron 0 * * * *]   ← hourly tick
    └→ POST /api/cron/line-reminder-fire (Bearer ${CRON_SECRET})
          ├─ bangkokNow().getHours() → currentHour
          ├─ Read clinic_settings/chat_config.lineReminder.{enabled, defaults, perBranch}
          ├─ For each branch in perBranch:
          │    ├─ If !merged.enabled → skip
          │    ├─ If currentHour === merged.dayBeforeHour → process tomorrow's appts
          │    ├─ If currentHour === merged.dayOfHour    → process today's appts
          │    └─ For each appt → run pipeline (§3)
          └─ Write be_admin_audit/line-reminder-daily-{YYYY-MM-DD}

[Vercel Cron */5 * * * *] ← retry queue, every 5 min
    └→ POST /api/cron/line-reminder-retry
          ├─ Query be_line_reminder_log WHERE status='failed' AND retryCount<3 AND nextRetryAt<=now
          └─ Re-run pipeline Step 6+ with exp backoff

[Webhook /api/webhook/line] ← existing V32-tris-ter, EXTENDED
    ├─ On postback event:
    │    ├─ action=confirm   → batch update appt.status='confirmed' + postback_log + reply "✓ ยืนยันแล้ว"
    │    ├─ action=reschedule → flag appt.notifyMeta + reply "ขอเลื่อนนัด — แอดมินจะติดต่อกลับ"
    │    └─ action=contact   → reply with branch phoneNumber + invite to chat
    └─ On message event (EXTENDS existing intents):
         ├─ "หยุดแจ้งเตือน" → customer.notifyOptOut=true (by='customer-dm') + reply confirm
         ├─ "เริ่มแจ้งเตือน" → customer.notifyOptOut=false + reply confirm
         └─ (existing intents: ผูก ID / courses / appointments / help)
```

### Why Vercel Cron + not Firebase Functions

- Project is already on Vercel Pro (chat webhooks + admin endpoints all run there)
- Vercel Cron is declarative (`vercel.json crons[]`), free at Pro tier, minute-granular
- Firebase Functions would require enabling Blaze plan + duplicate auth wiring
- Cron endpoint reuses `verifyAdminToken`-style guard via `Bearer ${CRON_SECRET}` env

---

## 3 — Reminder pipeline (per appointment)

```
1. Idempotency check
   const logKey = `${appointmentId}_${reminderType}`;
   const log = await getDoc(be_line_reminder_log/{logKey});
   if (log.exists && log.data().status === 'sent') return 'already-sent';

2. Skip if appointment cancelled
   if (appt.status === 'cancelled') {
     write log status='skipped-cancelled';
     return;
   }

3. Customer fetch + opt-out check
   const cust = await getDoc(be_customers/{customerId});
   if (cust.notifyOptOut === true) {
     write log status='skipped-optout';
     return;
   }

4. LINE link check
   if (!cust.lineUserId) {
     write log status='skipped-no-line';
     return;
   }
   if (cust._lineStale === true) {
     write log status='skipped-stale';
     return;
   }

5. Quiet hours defensive guard
   if (nowHour >= quietHourStart || nowHour < quietHourEnd) {
     write log status='skipped-quiet-hours';
     return;
   }

6. Build Flex Message (templateRendered captured for audit)
   const flex = buildReminderFlex({ cust, appt, branch, doctor, treatments, reminderType, template });

7. POST https://api.line.me/v2/bot/message/push
   Headers: { Authorization: `Bearer ${channelToken}` }
   Body: { to: cust.lineUserId, messages: [flex] }

8. Response handling
   200       → log status='sent' + apt.notifyMeta.sentXxx={at, statusCode}
   410       → cust._lineStale=true + cust._lineStaleAt=now + admin alert (audit doc) + log status='failed' (NO retry)
   429       → log status='failed' + retryCount=0 + nextRetryAt=+5min
   5xx       → log status='failed' + retryCount++ + exp backoff (5m / 30m / 2hr)
   4xx other → log status='failed' + admin alert + NO retry
```

---

## 4 — Firestore schema

### Existing collections — additive fields

```
be_customers.{customerId}:
  + notifyOptOut: boolean (default false)
  + notifyOptOutAt: timestamp | null
  + notifyOptOutBy: 'customer-dm' | 'admin-uid-{uid}' | null
  + _lineStale: boolean | null
  + _lineStaleAt: timestamp | null
  (lineUserId + lineDisplayName already exist from V32-tris-ter)

be_appointments.{appointmentId}:
  + notifyChannel: string[]   // ['line'] | [] — auto-set ['line'] if customer.lineUserId
  + notifyMeta:
      sentDayBefore:  { at, messageId, lineApiStatusCode } | null
      sentDayOf:      { at, messageId, lineApiStatusCode } | null
      lastPostbackAction: 'confirmed' | 'reschedule-requested' | 'contact-requested' | null
      lastPostbackAt: timestamp | null

clinic_settings/chat_config (existing — ADD lineReminder block):
  + lineReminder:
      enabled: boolean    // global kill-switch
      defaults: {
        dayBeforeHour: 20
        dayOfHour: 9       // null = day-of disabled
        quietHourStart: 22
        quietHourEnd: 8
        templateDayBefore: "<seed Thai template — see §6>"
        templateDayOf: "<seed Thai template>"
        cancellationPolicyText: "กรุณาเลื่อน/ยกเลิกล่วงหน้า 24 ชั่วโมง"
      }
      perBranch: { [branchId]: { partial overrides → falls back to defaults } }
```

### New collections

```
be_line_reminder_log/{idempotencyKey}:
  // idempotencyKey = `${appointmentId}_${reminderType}` e.g. BA-1778xxx_dayBefore
  appointmentId: string
  customerId: string
  branchId: string
  reminderType: 'dayBefore' | 'dayOf'
  status: 'sent' | 'failed' | 'skipped-optout' | 'skipped-no-line' |
          'skipped-stale' | 'skipped-quiet-hours' | 'skipped-cancelled'
  attemptedAt: timestamp
  lineApiResult: { statusCode, body, retryAfterMs? } | null
  retryCount: number   // 0-3
  nextRetryAt: timestamp | null
  lastError: string | null
  templateRendered: string   // exact text/JSON sent (support debugging)

be_line_reminder_postback_log/{randomId}:
  // 1 doc per ยืนยัน/เลื่อน/ติดต่อ button click
  appointmentId, customerId, branchId
  action: 'confirm' | 'reschedule' | 'contact'
  receivedAt: timestamp
  rawPostbackData: string

be_reschedule_tokens/{token}:
  // OPTIONAL — only if (a)=self-reschedule chosen later. Current MVP: NOT used.
  // Reserved naming for future enhancement.

be_admin_audit/line-reminder-daily-{YYYY-MM-DD}:
  // daily aggregate written by cron at end of day-of window
  date: string (YYYY-MM-DD)
  perBranch: { [branchId]: { sent, failed, skippedOptout, skippedNoLine, skippedStale, postbacks: { confirm, reschedule, contact } } }
  totalSent, totalFailed, totalPostbacks
```

### Firestore rules additions

```
match /be_line_reminder_log/{logId} {
  allow read, write: if false;  // admin-SDK + cron only
}
match /be_line_reminder_postback_log/{id} {
  allow read, write: if false;  // admin-SDK + webhook only
}
// be_admin_audit/line-reminder-daily-* uses existing be_admin_audit rule (server-only)
```

**Probe-Deploy-Probe (Rule B) extension**: NEW probes for both collections (anon write → expect 403; admin-SDK write → expect 200).

---

## 5 — UI surfaces

### A. Customer-picker dropdown badge (NEW shared component)

`src/components/CustomerOption.jsx`:
```jsx
export function CustomerOption({ customer, showLineBadge = true }) {
  return (
    <div className="flex items-center gap-2">
      <span>{customer.fullName || customer.name}</span>
      {showLineBadge && customer.lineUserId && (
        <span className="line-badge" title={`LINE: ${customer.lineDisplayName || 'linked'}`}>
          🟢 LINE
        </span>
      )}
    </div>
  );
}
```

Migrate 6 callsites (Rule of 3 — extract shared):
- `AppointmentFormModal.jsx`
- `DepositPanel.jsx` (embedded appt form)
- `AppointmentTab.jsx` (queue quick-add)
- `AdminDashboard.jsx` (frontend queue appt-create)
- `CustomerDetailView.jsx` (book-from-customer)
- `TreatmentFormPage.jsx` (book-followup-from-treatment)

### B. Auto-tick LINE checkbox + display name (every appointment modal)

```jsx
const [notifyChannel, setNotifyChannel] = useState([]);
useEffect(() => {
  if (!selectedCustomer) { setNotifyChannel([]); return; }
  const canAutoTick = selectedCustomer.lineUserId
    && !selectedCustomer.notifyOptOut
    && !selectedCustomer._lineStale;
  if (canAutoTick) setNotifyChannel(prev => prev.includes('line') ? prev : [...prev, 'line']);
}, [selectedCustomer?.id]);

{selectedCustomer?.lineUserId && (
  <LineNotifyConfirmation
    customer={selectedCustomer}
    checked={notifyChannel.includes('line')}
    onChange={(v) => setNotifyChannel(v ? [...notifyChannel, 'line'] : notifyChannel.filter(c => c !== 'line'))}
  />
)}
```

`<LineNotifyConfirmation />` shows:
- ☑ "แจ้งเตือนผ่าน LINE"
- LINE display name (`<strong>นาย โอ๊ค</strong>`)
- Warning chip "(ลูกค้าปิดแจ้งเตือน)" if `notifyOptOut`
- Warning chip "(LINE หมดอายุ — ต้องผูกใหม่)" if `_lineStale`

On submit → appointment.notifyChannel = notifyChannel.

### C. LineSettingsTab — 3 new sections

**C.1 "การแจ้งเตือนนัดหมาย" (per-branch settings)**:
- Branch dropdown (uses `useSelectedBranch` hook — already in line-settings tab)
- Form for selected branch:
  - Toggle: เปิด/ปิด แจ้งเตือนสาขานี้
  - Time picker: วันก่อนนัด (default 20:00; range 06:00-22:00)
  - Time picker: เช้าวันนัด (default 09:00; option = ปิด)
  - Quiet hours start/end (default 22:00-08:00)
  - Template editors (3 textareas):
    - ข้อความวันก่อนนัด ({{tokens}} hint shown above)
    - ข้อความเช้าวันนัด
    - ข้อความนโยบายยกเลิก
  - Save button → updates `clinic_settings/chat_config.lineReminder.perBranch[branchId]`

**C.2 "🔧 Debug ยิงแจ้งเตือน"**:
- Branch dropdown
- Reminder type radio: dayBefore / dayOf
- Mode radio (default Dry-run):
  1. **Dry-run preview** (default) — renders Flex JSON + count of eligible customers + does NOT push
  2. **ยิงเฉพาะลูกค้า** — customer picker + button → Push to 1 customer only
  3. **ยิงทุกคนพรุ่งนี้/วันนี้ (เทสจริง)** — red banner warning + admin must TYPE branch name verbatim into confirm field before button activates
- "ทดสอบเลย" button → calls `/api/admin/line-reminder-debug-fire` (admin-gated)
- Result panel: shows {sent, skipped, failed} counts + clickable log entries

**C.3 "📊 ประวัติแจ้งเตือน 7 วัน"**:
- Read-only audit table from `be_line_reminder_log`
- Filters: branch / status / type / dateRange
- Columns: timestamp / appointment / customer / type / status (color chip) / retryCount
- Click row → detail modal with full `lineApiResult` + `templateRendered`

### D. CustomerDetailView — opt-out toggle

New "การแจ้งเตือน LINE" section:
- Display: LINE display name + linked-at date (if `lineUserId` set)
- Toggle: "ปิดรับแจ้งเตือน" (admin-only; writes `customer.notifyOptOut` + audit)
- Sub-text if `notifyOptOutBy === 'customer-dm'`: "ลูกค้าเลือกปิดเอง เมื่อ {{date}}"
- Warning chip if `_lineStale=true`: "LINE ของลูกค้าไม่ตอบสนอง (ถูกบล็อก/unfollow) — ต้องผูกใหม่"

---

## 6 — Flex Message format

### Bubble layout (Day-Before template)

```json
{
  "type": "flex",
  "altText": "แจ้งเตือนนัดหมาย {{date}} {{time}}",
  "contents": {
    "type": "bubble",
    "header": {
      "type": "box", "layout": "vertical",
      "backgroundColor": "#DC2626",
      "paddingAll": "md",
      "contents": [
        { "type": "text", "text": "🏥 {{clinicName}}", "weight": "bold", "color": "#FFFFFF", "size": "lg" },
        { "type": "text", "text": "📅 แจ้งเตือนนัดหมาย (พรุ่งนี้)", "color": "#FFFFFF", "size": "sm" }
      ]
    },
    "body": {
      "type": "box", "layout": "vertical", "spacing": "md",
      "contents": [
        { "type": "text", "text": "สวัสดีคุณ {{customerName}} ค่ะ", "wrap": true, "size": "md" },
        { "type": "text", "text": "พรุ่งนี้คุณมีนัดหมายค่ะ", "wrap": true, "color": "#666666", "size": "sm" },
        { "type": "separator" },
        { "type": "box", "layout": "vertical", "spacing": "sm",
          "contents": [
            { "type": "box", "layout": "baseline", "spacing": "sm",
              "contents": [
                { "type": "text", "text": "📍 สาขา", "color": "#999999", "size": "sm", "flex": 2 },
                { "type": "text", "text": "{{branchName}}", "weight": "bold", "flex": 5, "wrap": true }
              ]
            },
            { "type": "box", "layout": "baseline", "spacing": "sm",
              "contents": [
                { "type": "text", "text": "👨‍⚕️ แพทย์", "color": "#999999", "size": "sm", "flex": 2 },
                { "type": "text", "text": "{{doctorName}}", "weight": "bold", "flex": 5, "wrap": true }
              ]
            },
            { "type": "box", "layout": "baseline", "spacing": "sm",
              "contents": [
                { "type": "text", "text": "💊 บริการ", "color": "#999999", "size": "sm", "flex": 2 },
                { "type": "text", "text": "{{treatments}}", "weight": "bold", "flex": 5, "wrap": true }
              ]
            },
            { "type": "box", "layout": "baseline", "spacing": "sm",
              "contents": [
                { "type": "text", "text": "📅 วันที่", "color": "#999999", "size": "sm", "flex": 2 },
                { "type": "text", "text": "{{date}}", "weight": "bold", "flex": 5 }
              ]
            },
            { "type": "box", "layout": "baseline", "spacing": "sm",
              "contents": [
                { "type": "text", "text": "🕐 เวลา", "color": "#999999", "size": "sm", "flex": 2 },
                { "type": "text", "text": "{{time}}", "weight": "bold", "flex": 5 }
              ]
            }
          ]
        },
        { "type": "separator" },
        { "type": "text", "text": "{{cancellationPolicyText}}", "size": "xs", "color": "#999999", "wrap": true }
      ]
    },
    "footer": {
      "type": "box", "layout": "horizontal", "spacing": "sm",
      "contents": [
        { "type": "button", "style": "primary", "color": "#16A34A", "height": "sm",
          "action": { "type": "postback", "label": "✓ ยืนยัน",
                      "data": "action=confirm&appt={{appointmentId}}",
                      "displayText": "ยืนยันนัด" } },
        { "type": "button", "style": "secondary", "height": "sm",
          "action": { "type": "postback", "label": "เลื่อน",
                      "data": "action=reschedule&appt={{appointmentId}}",
                      "displayText": "ขอเลื่อนนัด" } },
        { "type": "button", "style": "secondary", "height": "sm",
          "action": { "type": "postback", "label": "ติดต่อ",
                      "data": "action=contact&appt={{appointmentId}}",
                      "displayText": "ติดต่อคลินิก" } }
      ]
    }
  }
}
```

### Day-Of template
- Same structure, header text "📅 นัดหมายวันนี้!" (urgency)
- Greeting "วันนี้คุณมีนัดหมายตอน {{time}} ค่ะ"

### Template token reference

| Token | Source | Sample |
|---|---|---|
| `{{clinicName}}` | `clinic_settings/clinic_settings.clinicName` | "LoverClinic" |
| `{{customerName}}` | `cust.fullName || cust.name` | "คุณ โอ๊ค" |
| `{{branchName}}` | `branch.branchName` | "นครราชสีมา" |
| `{{doctorName}}` | `appt.doctorName` | "นพ. สมชาย" |
| `{{treatments}}` | `appt.treatments.map(t => t.name).join(', ')` | "ฉีดผิว, เลเซอร์" |
| `{{date}}` | formatted dd/mm/yyyy พ.ศ. (Rule 04) | "16/05/2569" |
| `{{time}}` | HH:MM (24hr, Rule 04) | "14:30" |
| `{{cancellationPolicyText}}` | branch override or defaults | "กรุณาเลื่อน/ยกเลิกล่วงหน้า 24 ชม." |
| `{{appointmentId}}` | appt.id (postback only) | "BA-1778..." |

---

## 7 — Webhook extensions

`api/webhook/line.js` extends V32-tris-ter handlers:

### handlePostback (NEW)

```js
async function handlePostback(event, db) {
  const parsed = parsePostbackData(event.postback.data); // 'action=confirm&appt=BA-...'
  if (!parsed.action || !parsed.appt) return;

  const apptRef = db.collection(`${BASE_PATH}/be_appointments`).doc(parsed.appt);
  const apptSnap = await apptRef.get();
  if (!apptSnap.exists) {
    await reply(event.replyToken, 'ไม่พบนัดหมาย กรุณาติดต่อคลินิก');
    return;
  }

  const apptData = apptSnap.data();
  const batch = db.batch();

  // Postback log
  const logId = `pb-${Date.now()}-${randomBytes(4).toString('hex')}`;
  batch.set(db.collection(`${BASE_PATH}/be_line_reminder_postback_log`).doc(logId), {
    appointmentId: parsed.appt,
    customerId: apptData.customerId,
    branchId: apptData.branchId,
    action: parsed.action,
    receivedAt: FieldValue.serverTimestamp(),
    rawPostbackData: event.postback.data,
  });

  // Appointment update
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

  // Reply per action
  switch (parsed.action) {
    case 'confirm':
      await reply(event.replyToken, `✓ ยืนยันนัดเรียบร้อย — เจอกันค่ะ`);
      break;
    case 'reschedule':
      await reply(event.replyToken, 'ขอเลื่อนนัดได้รับเรียบร้อย — แอดมินจะติดต่อกลับเร็วๆ นี้ค่ะ');
      break;
    case 'contact':
      const branch = await fetchBranch(db, apptData.branchId);
      const phone = branch?.phoneNumber || 'โปรดติดต่อทาง LINE นี้';
      await reply(event.replyToken, `ติดต่อคลินิก: ${phone}\nหรือพิมพ์ข้อความที่นี่ — แอดมินจะตอบค่ะ`);
      break;
  }
}

function postbackActionToFlag(action) {
  return {
    confirm: 'confirmed',
    reschedule: 'reschedule-requested',
    contact: 'contact-requested',
  }[action] || null;
}
```

### handleMessage intent extension

```js
const text = event.message.text.trim();
// NEW intents (BEFORE existing intent dispatcher)
if (text === 'หยุดแจ้งเตือน' || text.toLowerCase() === 'stop') {
  await setOptOut(db, customerByLineUserId, true, 'customer-dm');
  await reply(event.replyToken, '✓ หยุดแจ้งเตือนผ่าน LINE เรียบร้อยค่ะ\nหากต้องการเปิดอีกครั้ง พิมพ์ "เริ่มแจ้งเตือน"');
  return;
}
if (text === 'เริ่มแจ้งเตือน' || text.toLowerCase() === 'start') {
  await setOptOut(db, customerByLineUserId, false, 'customer-dm');
  await reply(event.replyToken, '✓ เปิดแจ้งเตือนผ่าน LINE เรียบร้อยค่ะ ระบบจะแจ้งเตือนก่อนนัด 1 วัน');
  return;
}
// (existing intents: ผูก ID / courses / appointments / help)
```

---

## 8 — Retry queue (`/api/cron/line-reminder-retry`)

```js
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
  }

  const db = getAdmin();
  const now = new Date();
  const candidates = await db.collection(`${BASE_PATH}/be_line_reminder_log`)
    .where('status', '==', 'failed')
    .where('retryCount', '<', 3)
    .where('nextRetryAt', '<=', now)
    .limit(50)  // batch size
    .get();

  const results = { retried: 0, succeeded: 0, failed: 0, exhausted: 0 };
  for (const doc of candidates.docs) {
    const log = doc.data();
    // Re-fetch fresh appointment + customer (might have changed since failure)
    const apptSnap = await db.doc(`${BASE_PATH}/be_appointments/${log.appointmentId}`).get();
    if (!apptSnap.exists || apptSnap.data().status === 'cancelled') {
      await doc.ref.update({ status: 'skipped-cancelled', retriedAt: now });
      results.retried++;
      continue;
    }
    const custSnap = await db.doc(`${BASE_PATH}/be_customers/${log.customerId}`).get();
    if (custSnap.data().notifyOptOut || custSnap.data()._lineStale) {
      await doc.ref.update({ status: custSnap.data().notifyOptOut ? 'skipped-optout' : 'skipped-stale', retriedAt: now });
      results.retried++;
      continue;
    }

    // Re-attempt Push
    const apiRes = await pushLineMessage(custSnap.data().lineUserId, log.templateRendered);
    results.retried++;
    if (apiRes.statusCode === 200) {
      await doc.ref.update({ status: 'sent', lineApiResult: apiRes, sentAt: now });
      results.succeeded++;
    } else if (apiRes.statusCode === 410) {
      await markLineStale(db, log.customerId);
      await doc.ref.update({ status: 'failed', lineApiResult: apiRes, lastError: 'user-blocked-or-unfollowed' });
      results.failed++;
    } else {
      const newRetryCount = log.retryCount + 1;
      const backoff = computeBackoffMs(newRetryCount); // 5m / 30m / 2hr
      const update = { retryCount: newRetryCount, lineApiResult: apiRes, lastError: `status-${apiRes.statusCode}` };
      if (newRetryCount >= 3) {
        update.status = 'failed';
        update.deadAt = now;
        await writeAdminAlert(db, 'reminder-retry-exhausted', { logId: doc.id });
        results.exhausted++;
      } else {
        update.nextRetryAt = new Date(now.getTime() + backoff);
        results.failed++;
      }
      await doc.ref.update(update);
    }
  }

  return res.status(200).json({ ok: true, results });
}
```

Backoff: `retryCount=0`→+5min, `=1`→+30min, `=2`→+2hr, `=3`→dead.

---

## 9 — Debug endpoint (`/api/admin/line-reminder-debug-fire`)

```js
// Admin-token gated via verifyAdminToken
export default async function handler(req, res) {
  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const { branchId, reminderType, mode, customerId, confirmBranchName } = req.body;
  // mode: 'dry-run' | 'single' | 'all'

  if (mode === 'all') {
    // Safety: require branch name verbatim
    const branch = await fetchBranch(db, branchId);
    if (confirmBranchName !== branch?.branchName) {
      return res.status(400).json({ ok: false, error: 'BRANCH_NAME_CONFIRM_MISMATCH' });
    }
  }

  const candidates = await pickCandidates(db, branchId, reminderType, mode === 'single' ? customerId : null);

  if (mode === 'dry-run') {
    // Render template for first 3 + count rest
    const rendered = candidates.slice(0, 3).map(c => buildReminderFlex(c, reminderType));
    return res.status(200).json({
      ok: true,
      mode: 'dry-run',
      totalEligible: candidates.length,
      previews: rendered,
    });
  }

  // Real Push (single or all)
  const results = { sent: 0, failed: 0, skipped: 0 };
  for (const c of candidates) {
    const out = await runReminderPipeline(db, c, reminderType, { isDebug: true });
    results[out.status === 'sent' ? 'sent' : (out.status.startsWith('skipped') ? 'skipped' : 'failed')]++;
  }

  return res.status(200).json({ ok: true, mode, totalAttempted: candidates.length, results });
}
```

---

## 10 — Helper modules (NEW)

### `src/lib/lineReminderTemplate.js`

Pure ESM, no Firebase deps. Tested in isolation.

```js
export function buildReminderFlex(input) {
  const tokens = resolveTokens(input);
  const flexJson = renderTemplate(input.template, tokens);
  return JSON.parse(flexJson);
}

export function resolveTokens({ cust, appt, branch, doctor, treatments, branchSettings }) {
  return {
    clinicName: branch.clinicName || 'LoverClinic',
    customerName: cust.fullName || cust.name || '',
    customerDisplayName: cust.lineDisplayName || '',
    branchName: branch.branchName || '',
    doctorName: doctor?.name || 'แพทย์ผู้ดูแล',
    treatments: (treatments || []).map(t => t.name).join(', ') || '-',
    date: formatThaiDate(appt.appointmentDate),  // dd/mm/yyyy พ.ศ.
    time: appt.startTime || '00:00',
    cancellationPolicyText: branchSettings.cancellationPolicyText,
    appointmentId: appt.id,
  };
}

export function renderTemplate(template, tokens) {
  // Replace {{token}} occurrences; missing tokens render as empty
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => tokens[key] != null ? String(tokens[key]) : '');
}

export function parsePostbackData(rawData) {
  // 'action=confirm&appt=BA-123' → { action: 'confirm', appt: 'BA-123' }
  const params = new URLSearchParams(rawData);
  return { action: params.get('action'), appt: params.get('appt') };
}
```

### `src/lib/lineReminderClient.js`

```js
import { getFilterSpecForCollection } from './branchBackupBuckets.js'; // not used here, just reference

export async function listEligibleAppointments(db, { branchId, dateISO, reminderType }) {
  // Returns appointments where:
  //  - branchId matches
  //  - appointmentDate === dateISO (tomorrow for dayBefore, today for dayOf)
  //  - status not in ['cancelled', 'no-show']
  //  - notifyChannel includes 'line'
  // Caller filters by customer.lineUserId + opt-out + stale
}

export async function getMergedBranchSettings(db, branchId) {
  // Read clinic_settings/chat_config + merge defaults + perBranch[branchId] (override)
}

export async function pushLineMessage(channelToken, lineUserId, flexJson) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${channelToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to: lineUserId, messages: [flexJson] }),
  });
  return { statusCode: res.status, body: await res.text() };
}
```

---

## 11 — Edge cases + error handling

| Case | Handling |
|---|---|
| Appt cancelled AFTER reminder sent | No-op (message already out) |
| Appt cancelled BEFORE reminder time | Cron skips `status='cancelled'` |
| Confirmed appt at dayOf | STILL send dayOf reminder (final ping; safer than silent) |
| Multi-appt same day same customer | 1 push per appt (idempotency keyed on `appointmentId_type`) |
| lineUserId stale + re-linked | V32-tris-ter QR re-link clears `_lineStale=false` automatically (in customer-link endpoint) |
| Quiet hours overlap with reminder time | Defensive skip + log `skipped-quiet-hours` (admin can spot misconfig) |
| Holiday day-of | ProClinic blocks bookings on holidays; defensive `holidayCheck()` anyway |
| Reschedule deep-link invalid (token expired/missing) | Reply "ลิงก์หมดอายุ — กรุณาติดต่อคลินิก" (future: token system; MVP: no link, admin handles) |
| Customer un-follows OA between link + reminder | LINE returns 410 → mark `_lineStale=true` → admin alert (audit doc) |
| LINE channel token rotated | Admin updates in line-settings tab; cron picks up on next read |
| Vercel cron miss (e.g. deploy during 20:00) | retry queue catches via missed-window cleanup (NEW Phase 2 addition: detect appts where window passed without log entry) |
| Customer changes branch | appt.branchId stamped at write time (BSA); reminder uses appt.branchId — correct even if customer moved |

---

## 12 — Testing strategy (Rule Q full coverage)

### P1 — Unit + RTL + source-grep

- `tests/lineReminderTemplate.test.js` — buildReminderFlex token sub + adversarial inputs (empty/Thai/Unicode/null/numeric)
- `tests/lineReminderTemplate-parse-postback.test.js` — parsePostbackData edge cases
- `tests/line-reminder-pipeline-idempotency.test.js` — pipeline gating logic (mocked Firestore)
- `tests/line-reminder-customer-option-source-grep.test.js` — 6 callsites use `<CustomerOption />`
- `tests/line-reminder-modal-autotick-source-grep.test.js` — every appointment modal wires auto-tick
- `tests/line-reminder-webhook-intent.test.js` — RTL test of webhook handleMessage + handlePostback intents
- `tests/line-reminder-settings-tab.test.jsx` — RTL test of C.1/C.2/C.3 UI sections
- `tests/line-reminder-debug-fire-confirmation.test.jsx` — RTL test that "ยิงทุกคน" mode requires branch-name confirm

### P2 — Rule Q L2 admin-SDK e2e (REAL prod)

`scripts/e2e-line-reminder-real-prod.mjs --apply`:

```
Seed: TEST-LINE-CUST-{ts}     — customer with admin's REAL lineUserId
      TEST-LINE-APPT-{ts}-T   — appt tomorrow at branch X, notifyChannel=['line']
      TEST-LINE-APPT-{ts}-D   — appt today at branch X (for dayOf test)

Phase 1: dayBefore window simulation
  - Mock currentHour=branchSettings.dayBeforeHour
  - Call cron logic (NOT via HTTP — direct admin-SDK invocation matching endpoint)
  - Verify: be_line_reminder_log/{appointmentId}_dayBefore status='sent'
  - Verify: be_appointments/{id}.notifyMeta.sentDayBefore populated
  - Verify: REAL LINE message arrives on admin's phone (manual confirmation via reply: "received")
  - ★ Admin clicks ✓ ยืนยัน button → verify postback received + appt.status='confirmed'

Phase 2: dayOf window simulation
  - Mock currentHour=branchSettings.dayOfHour
  - Same flow + appt for TODAY

Phase 3: opt-out path
  - Send "หยุดแจ้งเตือน" via real LINE DM
  - Verify customer.notifyOptOut=true + notifyOptOutBy='customer-dm'
  - Re-run cron → status='skipped-optout'

Phase 4: stale path simulation
  - Manually set customer._lineStale=true
  - Re-run cron → status='skipped-stale'

Phase 5: cleanup
  - Delete TEST-LINE-* fixtures
  - Audit doc emitted
```

### P3 — Rule Q L1 hands-on (post-deploy)

User confirms:
1. Open https://lover-clinic-app.vercel.app/?tab=line-settings
2. Configure dayBeforeHour=current+1 (so reminder fires soon for testing)
3. Set debug-fire mode=single + pick admin's customer record
4. Click "ทดสอบเลย" → real LINE message arrives on admin's LINE
5. Click ✓ ยืนยัน → appointment.status='confirmed' verified in backend
6. Send "หยุดแจ้งเตือน" → opt-out confirmed
7. Send "เริ่มแจ้งเตือน" → re-enabled

### P4 — Playwright (optional, after P3)

- `tests/e2e/line-reminder-settings.spec.js` — LineSettingsTab CRUD flow
- `tests/e2e/line-reminder-modal-autotick.spec.js` — AppointmentFormModal auto-tick on LINE customer

---

## 13 — Rollout plan

1. **Phase 1** (Ship code): commit + push (NO deploy)
2. **Phase 2** (Verification local): P1 unit tests + build clean + P2 admin-SDK e2e on TEST fixtures
3. **Phase 3** (Pre-deploy prep): 
   - Add to `vercel.json`:
     ```json
     "crons": [
       { "path": "/api/cron/line-reminder-fire",  "schedule": "0 * * * *" },
       { "path": "/api/cron/line-reminder-retry", "schedule": "*/5 * * * *" }
     ]
     ```
   - Generate `CRON_SECRET` via `crypto.randomBytes(32).toString('base64url')` (Claude provides value)
   - User adds `CRON_SECRET` to Vercel env (Production scope)
   - User confirms LINE Premium tier active (Push API quota)
4. **Phase 4** (Deploy): user types "deploy" → `vercel --prod`
5. **Phase 5** (Probe-Deploy-Probe):
   - Pre-probe: anon POST to `be_line_reminder_log` → expect 403
   - Pre-probe: anon POST to `be_line_reminder_postback_log` → expect 403
   - Deploy firestore.rules (combined with vercel deploy)
   - Post-probe: same → expect 403 (rules locked)
6. **Phase 6** (L1 hands-on): user runs P3 hands-on suite (Section 12)
7. **Phase 7** (Gradual rollout):
   - Enable `lineReminder.perBranch[BR-1777873556815-26df6480].enabled=true` (นครราชสีมา first)
   - Monitor `be_line_reminder_log` for 48 hours
   - Enable remaining 2 branches if clean
8. **Phase 8** (Stable): admin watches daily aggregate audit docs; flags `_lineStale` customers for re-link campaign

---

## 14 — Risks + open questions

| Risk | Mitigation |
|---|---|
| LINE Push API monthly quota exceeded (200 free) | **REQUIRED: LINE Premium tier (~$60/mo for 5K msgs)** — confirm before P4 deploy |
| Vercel cron Hobby tier limits | Project on Pro tier (confirmed via existing webhook usage) |
| Multiple cron invocations race | Idempotency-key gate at pipeline Step 1 — safe |
| Customer changes LINE display name | Refresh `lineDisplayName` on every webhook event (existing V32-tris-ter behavior) |
| Misconfigured quiet hours wipe out reminders | Defensive log emit + admin can spot via 7-day audit panel |
| Template rendering bug | `tests/lineReminderTemplate.test.js` adversarial inputs catch |
| LINE API outage | Retry queue + admin audit alert on ≥5 5xx in same hour |
| User accidentally clicks "ยิงทุกคน" debug | Branch-name-verbatim confirmation gate |
| Cancellation policy text translation drift | Single Thai canonical text in defaults — admin can override per branch |

---

## 15 — Out of scope (deferred)

- Self-reschedule deep-link page (current MVP: เลื่อน button just flags admin)
- SMS fallback for non-LINE customers
- Email reminders
- Customer view of `notifyOptOut` toggle in customer-facing portal
- Per-treatment reminder time customization
- Three-window reminders (3-day-before + day-before + day-of)
- Multi-language templates (TH only per Rule 04)
- ML-based no-show prediction
- Open-rate analytics dashboard

---

## 16 — Glossary

- **Reminder type**: `dayBefore` (sent day before appointment, default 20:00) | `dayOf` (sent morning of appointment, default 09:00)
- **Notify channel**: array on appointment doc listing channels — currently only `'line'` (future: `'sms'`, `'email'`)
- **Opt-out**: customer-side or admin-side flag stopping reminders for that customer
- **Stale lineUserId**: customer's LINE has blocked or unfollowed the OA (410 response) — needs re-linking via V32-tris-ter QR flow
- **Idempotency key**: `${appointmentId}_${reminderType}` — used as `be_line_reminder_log` doc ID to prevent double-send
- **Quiet hours**: window during which NO reminders push (default 22:00-08:00)
- **Postback**: LINE event when user clicks a Flex Message button → webhook receives `event.postback.data`
