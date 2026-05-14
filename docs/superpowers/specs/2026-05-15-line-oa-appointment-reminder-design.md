# LINE OA Appointment Reminder System — Design Spec (per-branch OA)

> Created: 2026-05-15
> Status: brainstorming locked Q1=Full / Q2=Two windows / Q3=Flex Message / Q4=Both admin+DM opt-out + Section 2 (reschedule=admin-flag, quiet-hours 22-08, debug=3-mode-with-branch-confirm) + Section 3 (retry+audit-only alerts + Rule Q full coverage) + **per-branch OA pivot** (2026-05-15 user directive: "Line OA แยกสาขากันนะจ๊ะ ... สาขาที่เราใช้ได้จริงมีการผูกจริงอยู่ตอนนี้คือสาขานครราชสีมา สาขาอื่นจะตามมาในอนาคต ... ขยายผลหาจุดผิดพลาดที่อาจจะเกิดกับสาขาอื่นได้")
> Companion plan: `docs/superpowers/plans/2026-05-15-line-oa-appointment-reminder.md` (to be written by writing-plans skill)

---

## 1 — Problem statement

The clinic wants automated appointment reminders to customers via LINE OA. The clinic operates a SEPARATE LINE OA per branch (Phase BS V3 architecture, 2026-05-04). Currently only นครราชสีมา has a real OA configured + customers linked; other branches will add OAs in the future. The reminder system must support multi-branch OA from day 1, with class-of-bug expansion to prevent "works on นครราชสีมา, breaks on BRANCH-Y" failures (Rule P).

**Core requirements** (user-stated):
1. Send reminder the day before at branch-configured time (default 20:00) via tab=line-settings per branch
2. Customer-picker dropdowns EVERYWHERE in the app show LINE-linked badge for customers with linkage to that branch's OA
3. When admin picks a LINE-linked customer in any appointment-creating modal, auto-tick "แจ้งเตือนผ่าน LINE" checkbox + show LINE display name as connection-confirmation
4. Debug button in line-settings tab to fire reminders immediately to all customers with appointments tomorrow (dev test path)

**Extensions adopted** (world-class research):
5. Two-window reminder (day-before + day-of-morning)
6. Flex Message with action buttons (✓ ยืนยัน / เลื่อนนัด / ติดต่อคลินิก)
7. Idempotency keys per `(appointmentId, reminderType)`
8. Customer opt-out via DM + admin-side toggle
9. Quiet hours
10. Delivery-status tracking (`_lineStale=true` on 410 response)
11. Retry queue with exp backoff
12. Template tokens editable per branch
13. Audit log per-send + daily aggregate
14. Cancellation policy text

**Per-branch OA requirements** (Critical pivot, 2026-05-15):
15. Each branch has its own LINE OA → its own channelToken/channelSecret/botBasicId/destination
16. Webhook routes by `event.destination` → branchId lookup (existing `resolveLineConfigForWebhook`)
17. Customer LINE userId is OA-scoped (a single person has DIFFERENT lineUserIds across multiple OAs they follow) → support `customer.lineUserId_byBranch[branchId]` indexing
18. Push API uses the appointment's branch's channelToken — never global, never another branch's
19. Cross-branch customer detection: customer at branch X with appt at branch Y → reminder eligible ONLY if customer has lineUserId for branch Y's OA
20. Class-of-bug audit invariants (Section 18) enforce per-branch discipline across every code path

---

## 2 — Architecture overview

```
[Vercel Cron 0 * * * *]   ← hourly tick
    └→ POST /api/cron/line-reminder-fire (Bearer ${CRON_SECRET})
          ├─ bangkokNow().getHours() → currentHour
          ├─ Read all be_line_configs (one doc per configured branch)
          ├─ For each enabled branch:
          │    ├─ Read cfg.lineReminder block (per-branch settings)
          │    ├─ If !cfg.lineReminder.enabled → skip
          │    ├─ If currentHour === cfg.lineReminder.dayBeforeHour → process tomorrow's appts
          │    ├─ If currentHour === cfg.lineReminder.dayOfHour    → process today's appts
          │    └─ For each appt @ branchId → run pipeline (§3) with cfg.channelAccessToken
          └─ Write be_admin_audit/line-reminder-daily-{YYYY-MM-DD}

[Vercel Cron */5 * * * *] ← retry queue, every 5 min
    └→ POST /api/cron/line-reminder-retry
          ├─ Query be_line_reminder_log WHERE status='failed' AND nextRetryAt<=now (in-memory filter retryCount<3)
          └─ Re-run pipeline Step 6+ using per-branch cfg via getLineConfigForBranch(branchId)

[Webhook /api/webhook/line] ← existing V32-tris-ter + Phase BS V3
    ├─ ALREADY routes by event.destination → resolveLineConfigForWebhook(db, event)
    │    → returns {config, branchId, source: 'be_line_configs'|'chat_config'}
    ├─ NEW: On postback event:
    │    ├─ action=confirm   → batch update appt.status='confirmed' + postback_log + reply via cfg.channelToken
    │    ├─ action=reschedule → flag appt.notifyMeta + reply "ขอเลื่อนนัด — แอดมินจะติดต่อกลับ"
    │    └─ action=contact   → reply with branch phoneNumber + invite to chat
    └─ NEW: On message event (EXTENDS existing intents):
         ├─ "หยุดแจ้งเตือน" → customer.notifyOptOut=true (by='customer-dm') + reply confirm
         ├─ "เริ่มแจ้งเตือน" → customer.notifyOptOut=false + reply confirm
         └─ (existing intents from V32-tris-ter — link / courses / appointments / help — already
            scoped per-branch via resolveLineConfigForWebhook)
```

### Why Vercel Cron + leverage existing be_line_configs

- Project on Vercel Pro; cron is declarative (`vercel.json crons[]`), free at Pro tier, minute-granular
- `be_line_configs/{branchId}` infrastructure ALREADY shipped (Phase BS V3, 2026-05-04) — webhook routing + admin endpoints + LineSettingsTab UI all use it. We just add the `lineReminder` block + reminder cron endpoints.
- No duplicate "where to put per-branch credentials" decision — already locked in `be_line_configs`.

---

## 3 — Reminder pipeline (per appointment)

```
0. Branch OA config lookup (NEW — at top of loop, ONCE per branch tick)
   const cfg = await getLineConfigForBranch(db, branchId);
   if (!cfg || !cfg.enabled || !cfg.channelAccessToken || !cfg.lineReminder?.enabled) {
     return 'skip-branch-no-oa-or-disabled';
   }

1. Idempotency check (per appointment)
   const logKey = `${appointmentId}_${reminderType}`;
   const log = await getDoc(be_line_reminder_log/{logKey});
   if (log.exists && log.data().status === 'sent') return 'already-sent';

2. Skip if appointment cancelled
   if (appt.status === 'cancelled') { write log status='skipped-cancelled'; return; }

3. Customer fetch + opt-out check
   const cust = await getDoc(be_customers/{customerId});
   if (cust.notifyOptOut === true) { write log status='skipped-optout'; return; }

4. LINE link check (BRANCH-SCOPED)
   const linkData = cust.lineUserId_byBranch?.[appt.branchId];
   let lineUserId = linkData?.lineUserId;
   if (!lineUserId) {
     // Backward-compat: legacy customer.lineUserId is valid ONLY when
     // customer.branchId === appt.branchId. The V32-tris-ter linkage
     // was minted via the customer's creation branch's OA.
     if (cust.branchId === appt.branchId && cust.lineUserId) {
       lineUserId = cust.lineUserId;
     } else {
       write log status='skipped-no-line-this-branch';
       return;
     }
   }
   if (linkData?._lineStale === true || cust._lineStale === true) {
     write log status='skipped-stale';
     return;
   }

5. Quiet hours defensive guard
   if (nowHour >= cfg.lineReminder.quietHourStart || nowHour < cfg.lineReminder.quietHourEnd) {
     write log status='skipped-quiet-hours';
     return;
   }

6. Build Flex Message (templateRendered captured for audit)
   const flex = buildReminderFlex({ cust, appt, branch, doctor, treatments, cfg, reminderType });

7. POST https://api.line.me/v2/bot/message/push
   Headers: { Authorization: `Bearer ${cfg.channelAccessToken}` }  // ← per-branch token, NEVER global
   Body: { to: lineUserId, messages: [flex] }                       // ← branch-scoped lineUserId

8. Response handling
   200       → log status='sent' + apt.notifyMeta.sentXxx={at, statusCode}
   410       → mark customer.lineUserId_byBranch[branchId]._lineStale=true + admin alert (audit doc) + log status='failed' (NO retry)
   429       → log status='failed' + retryCount=0 + nextRetryAt=+5min
   5xx       → log status='failed' + retryCount++ + exp backoff (5m / 30m / 2hr)
   4xx other → log status='failed' + admin alert + NO retry
```

---

## 4 — Firestore schema

### Existing collections — additive fields

```
be_customers.{customerId}:
  + notifyOptOut: boolean (default false)          // global opt-out (any branch)
  + notifyOptOutAt: timestamp | null
  + notifyOptOutBy: 'customer-dm' | 'admin-uid-{uid}' | null

  + lineUserId_byBranch: { [branchId]: {           // NEW — multi-branch linkage
      lineUserId: string                            // OA-scoped userId
      lineDisplayName: string
      linkedAt: timestamp
      _lineStale: boolean | null                    // 410 from this branch's OA
      _lineStaleAt: timestamp | null
    } }

  // LEGACY (V32-tris-ter — preserved for backward-compat):
  // lineUserId, lineDisplayName, lineLinkedAt, _lineStale
  //   → treated as the linkage at customer.branchId when
  //     lineUserId_byBranch[customer.branchId] is empty.

be_appointments.{appointmentId}:
  + notifyChannel: string[]   // ['line'] | [] — auto-set ['line'] if customer has linkage to appt.branchId
  + notifyMeta:
      sentDayBefore:  { at, messageId, lineApiStatusCode } | null
      sentDayOf:      { at, messageId, lineApiStatusCode } | null
      lastPostbackAction: 'confirmed' | 'reschedule-requested' | 'contact-requested' | null
      lastPostbackAt: timestamp | null

be_line_configs/{branchId} (EXISTING Phase BS V3 collection — EXTEND):
  // Existing fields (unchanged):
  //   channelId, channelSecret, channelAccessToken, botBasicId, destination, enabled
  //   coursesKeywords, appointmentsKeywords, qaEnabled, ...
  //   linking-related fields
  + lineReminder: {                       // NEW block
      enabled: boolean                     // per-branch reminder kill-switch (default false; admin opts in)
      dayBeforeHour: number 0-23           // default 20
      dayOfHour: number 0-23 | null        // default 9; null = day-of disabled
      quietHourStart: number 0-23          // default 22
      quietHourEnd: number 0-23            // default 8
      templateDayBefore: string            // with {{tokens}}
      templateDayOf: string
      cancellationPolicyText: string       // "กรุณาเลื่อน/ยกเลิกล่วงหน้า 24 ชั่วโมง"
    }
```

### New collections

```
be_line_reminder_log/{idempotencyKey}:
  // idempotencyKey = `${appointmentId}_${reminderType}` e.g. BA-1778xxx_dayBefore
  appointmentId: string
  customerId: string
  branchId: string                  // appointment's branch — drives credential lookup
  customerLineUserId: string        // the OA-scoped userId actually used for push (per-branch)
  reminderType: 'dayBefore' | 'dayOf'
  status: 'sent' | 'failed' | 'skipped-optout' | 'skipped-no-line-this-branch' |
          'skipped-stale' | 'skipped-quiet-hours' | 'skipped-cancelled' |
          'skipped-branch-no-oa'   // NEW — branch has no be_line_configs OR not enabled
  attemptedAt: timestamp
  lineApiResult: { statusCode, body, retryAfterMs? } | null
  retryCount: number   // 0-3
  nextRetryAt: timestamp | null
  lastError: string | null
  templateRendered: string

be_line_reminder_postback_log/{randomId}:
  // 1 doc per ยืนยัน/เลื่อน/ติดต่อ button click
  appointmentId, customerId
  branchId: string                  // resolved from event.destination via lineConfigAdmin
  action: 'confirm' | 'reschedule' | 'contact'
  receivedAt: timestamp
  rawPostbackData: string

be_admin_audit/line-reminder-daily-{YYYY-MM-DD}:
  // daily aggregate written by cron at end of day-of window
  date: string (YYYY-MM-DD)
  perBranch: { [branchId]: {
    sent, failed, skippedOptout, skippedNoLineThisBranch, skippedStale,
    skippedBranchNoOa, postbacks: { confirm, reschedule, contact }
  } }
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
// be_line_configs/* already has rules from Phase BS V3
```

**Probe-Deploy-Probe (Rule B) extension**: NEW probes for both collections (anon write → expect 403; admin-SDK write → expect 200).

---

## 5 — UI surfaces (branch-aware throughout)

### A. Customer-picker dropdown badge (NEW shared component)

`src/components/CustomerOption.jsx`:
```jsx
export function CustomerOption({ customer, contextBranchId, showLineBadge = true }) {
  // contextBranchId = the branch the appt is being created at (from BranchContext OR modal prop)
  const branchLink = customer.lineUserId_byBranch?.[contextBranchId];
  const legacyValid = customer.branchId === contextBranchId && customer.lineUserId;
  const isLinkedHere = !!(branchLink?.lineUserId || legacyValid);
  const isLinkedElsewhere = !isLinkedHere && (
    customer.lineUserId ||
    Object.keys(customer.lineUserId_byBranch || {}).length > 0
  );

  return (
    <div className="flex items-center gap-2">
      <span>{customer.fullName || customer.name}</span>
      {showLineBadge && isLinkedHere && (
        <span className="line-badge-green" title={`LINE: ${branchLink?.lineDisplayName || customer.lineDisplayName || 'linked'}`}>
          🟢 LINE
        </span>
      )}
      {showLineBadge && !isLinkedHere && isLinkedElsewhere && (
        <span className="line-badge-gray" title="ลูกค้าผูก LINE กับสาขาอื่น — ยังไม่ผูกกับสาขานี้">
          ⚪️ LINE
        </span>
      )}
    </div>
  );
}
```

Migrate 6 callsites (Rule of 3 — shared component):
- `AppointmentFormModal.jsx`
- `DepositPanel.jsx` (embedded appt form)
- `AppointmentTab.jsx` (queue quick-add)
- `AdminDashboard.jsx` (frontend queue appt-create)
- `CustomerDetailView.jsx` (book-from-customer)
- `TreatmentFormPage.jsx` (book-followup-from-treatment)

Each callsite passes `contextBranchId={selectedBranchId}` (or the modal's branchId field).

### B. Auto-tick LINE checkbox + display name (every appointment modal)

```jsx
const { branchId: targetBranchId } = useSelectedBranch();
const [notifyChannel, setNotifyChannel] = useState([]);

const branchLink = selectedCustomer?.lineUserId_byBranch?.[targetBranchId];
const legacyValid = selectedCustomer?.branchId === targetBranchId && selectedCustomer?.lineUserId;
const linkedHere = !!(branchLink?.lineUserId || legacyValid);
const linkedElsewhere = !linkedHere && (
  selectedCustomer?.lineUserId ||
  Object.keys(selectedCustomer?.lineUserId_byBranch || {}).length > 0
);

useEffect(() => {
  if (!selectedCustomer) { setNotifyChannel([]); return; }
  const canAutoTick = linkedHere
    && !selectedCustomer.notifyOptOut
    && !(branchLink?._lineStale === true);
  if (canAutoTick) {
    setNotifyChannel(prev => prev.includes('line') ? prev : [...prev, 'line']);
  }
}, [selectedCustomer?.id, targetBranchId]);

{/* CASE 1: linked at this branch → green checkbox */}
{linkedHere && (
  <div className="rounded border border-green-500/30 bg-green-500/5 p-3 mt-2">
    <label className="flex items-start gap-2 cursor-pointer">
      <input type="checkbox" checked={notifyChannel.includes('line')} onChange={...} data-field="notify-line" />
      <div>
        <div className="font-medium flex items-center gap-2">
          🟢 แจ้งเตือนผ่าน LINE
          {selectedCustomer.notifyOptOut && (<span className="text-xs text-red-500">(ลูกค้าปิดแจ้งเตือน)</span>)}
          {branchLink?._lineStale && (<span className="text-xs text-orange-500">(LINE หมดอายุ — ต้องผูกใหม่)</span>)}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          LINE: <strong>{branchLink?.lineDisplayName || selectedCustomer.lineDisplayName || 'เชื่อมแล้ว'}</strong>
        </div>
      </div>
    </label>
  </div>
)}

{/* CASE 2: linked at OTHER branch → gray warning + invite to link here */}
{!linkedHere && linkedElsewhere && (
  <div className="rounded border border-yellow-500/30 bg-yellow-500/5 p-3 mt-2">
    <div className="text-sm">⚠️ ลูกค้าผูก LINE กับสาขาอื่น — ยังไม่ได้ผูกกับสาขานี้</div>
    <button onClick={() => openLinkLineQrModal({ customer: selectedCustomer, targetBranchId })}>
      สร้าง QR ผูก LINE สาขานี้
    </button>
  </div>
)}

{/* CASE 3: no linkage at all → silent (or admin offers link) */}
```

On submit → `appointment.notifyChannel = notifyChannel`.

### C. LineSettingsTab — 3 new sections (per-branch, already branch-scoped via existing tab)

The tab is ALREADY per-branch (uses `useSelectedBranch` + reads `be_line_configs/{branchId}`). Add 3 sections inside the existing form:

**C.1 "การแจ้งเตือนนัดหมาย" (per-branch — extends form schema)**:
- Toggle: เปิด/ปิด แจ้งเตือนสาขานี้ (writes `lineReminder.enabled` field)
- Time picker: วันก่อนนัด (default 20:00; range 06:00-22:00)
- Time picker: เช้าวันนัด (default 09:00; option = ปิด)
- Quiet hours start/end (default 22:00-08:00)
- Template editors (3 textareas):
  - ข้อความวันก่อนนัด ({{tokens}} hint shown above)
  - ข้อความเช้าวันนัด
  - ข้อความนโยบายยกเลิก
- Save button → updates `be_line_configs/{branchId}.lineReminder.*` (single Firestore write, reuses existing `saveLineConfig` helper)

**C.2 "🔧 Debug ยิงแจ้งเตือน"** (per-branch):
- Reminder type radio: dayBefore / dayOf
- Mode radio (default Dry-run):
  1. **Dry-run preview** (default) — renders Flex JSON + count of eligible customers + does NOT push
  2. **ยิงเฉพาะลูกค้า** — customer picker (filtered to LINE-linked-at-this-branch only) + button → Push to 1 customer
  3. **ยิงทุกคนพรุ่งนี้/วันนี้ (เทสจริง)** — red banner warning + admin must TYPE branch name verbatim into confirm field before button activates
- "ทดสอบเลย" button → calls `/api/admin/line-reminder-debug-fire` (admin-gated) with branchId from BranchContext
- Result panel: shows {sent, skipped, failed} counts + per-result detail

**C.3 "📊 ประวัติแจ้งเตือน 7 วัน"** (per-branch — query filtered by selectedBranchId):
- Read-only audit table from `be_line_reminder_log` where `branchId === selectedBranchId`
- Filters: status / type / dateRange
- Columns: timestamp / appointment / customer / type / status (color chip) / retryCount
- Click row → detail modal with full `lineApiResult` + `templateRendered`

### D. CustomerDetailView — opt-out toggle + per-branch linkage display

New "การแจ้งเตือน LINE" section:
- Display: for each branch the customer is linked to:
  - "📍 {{branchName}} — LINE: {{displayName}} (linked {{date}})"
  - Warning chip if `_lineStale=true`: "LINE ของลูกค้าไม่ตอบสนอง (ถูกบล็อก/unfollow) — ต้องผูกใหม่"
  - Button "สร้าง QR ผูกใหม่" — re-mints token for this branch's OA
- Global toggle: "ปิดรับแจ้งเตือน (ทุกสาขา)" — writes `customer.notifyOptOut` + audit
- Sub-text if `notifyOptOutBy === 'customer-dm'`: "ลูกค้าเลือกปิดเอง เมื่อ {{date}}"
- For customers with legacy `customer.lineUserId` but no `lineUserId_byBranch` entries — display as "📍 {{customer.branchId-name}} — LINE: {{lineDisplayName}} (legacy V32-tris-ter linkage)"

---

## 6 — Flex Message format

### Bubble layout (Day-Before template)

Same as before — fire-red header + table body + 3 postback footer buttons.
Postback data still: `action=confirm&appt={{appointmentId}}` etc.

### Branch-scoped postback routing

Postback `event.destination` indicates which branch's OA received the click. Webhook handler uses `resolveLineConfigForWebhook(db, event)` to get `{ config, branchId }` → uses that branch's config for reply API.

Postback data field can ALSO include `branchId` for defense-in-depth: `action=confirm&appt=BA-x&br=BR-y`. Webhook can cross-check `event.destination`-resolved branchId === postback `br` field → mismatch = malformed/spoofed → reject.

### Template tokens

Same as before. NEW token:
| `{{branchPhoneNumber}}` | `cfg.branchPhoneNumber` from be_branches (used in contact reply) |

---

## 7 — Webhook extensions

`api/webhook/line.js` already routes per-branch via `resolveLineConfigForWebhook`. Add:

### handlePostback (NEW)

```js
async function handlePostback(event, db) {
  // Resolve branch from event.destination (existing Phase BS V3 pattern)
  const resolved = await resolveLineConfigForWebhook(db, event);
  if (!resolved) return; // unknown OA — silent drop
  const { config, branchId } = resolved;

  const parsed = parsePostbackData(event.postback.data); // 'action=confirm&appt=BA-...'
  if (!parsed.action || !parsed.appt) return;

  // Defense-in-depth: if postback data carries `br`, verify match
  if (parsed.br && parsed.br !== branchId) {
    console.warn(`[postback] branch mismatch: data=${parsed.br}, destination-resolved=${branchId}`);
    return;
  }

  const apptRef = db.collection(`${BASE_PATH}/be_appointments`).doc(parsed.appt);
  const apptSnap = await apptRef.get();
  if (!apptSnap.exists) {
    await reply(event.replyToken, 'ไม่พบนัดหมาย กรุณาติดต่อคลินิก', config.channelAccessToken);
    return;
  }
  const apptData = apptSnap.data();

  // Verify the appointment's branch matches the OA the event came from.
  // Mismatch = customer clicked button on wrong branch's reminder (shouldn't
  // happen since reminder is sent FROM the appt's branch OA, but defensive).
  if (apptData.branchId !== branchId) {
    console.warn(`[postback] appt.branchId=${apptData.branchId} ≠ event.branchId=${branchId}`);
    await reply(event.replyToken, 'นัดนี้ไม่ตรงกับสาขาที่เชื่อมต่อ กรุณาติดต่อคลินิก', config.channelAccessToken);
    return;
  }

  // Atomic batch: postback_log + appointment update
  const batch = db.batch();
  const logId = `pb-${Date.now()}-${randomBytes(4).toString('hex')}`;
  batch.set(db.collection(`${BASE_PATH}/be_line_reminder_postback_log`).doc(logId), {
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

  // Reply per action (using per-branch channelAccessToken)
  switch (parsed.action) {
    case 'confirm':
      await reply(event.replyToken, `✓ ยืนยันนัดเรียบร้อย — เจอกันค่ะ`, config.channelAccessToken);
      break;
    case 'reschedule':
      await reply(event.replyToken, 'ขอเลื่อนนัดได้รับเรียบร้อย — แอดมินจะติดต่อกลับเร็วๆ นี้ค่ะ', config.channelAccessToken);
      break;
    case 'contact':
      const branch = await fetchBranch(db, branchId);
      const phone = branch?.phoneNumber || 'โปรดติดต่อทาง LINE นี้';
      await reply(event.replyToken, `ติดต่อคลินิก ${branch?.branchName || ''}: ${phone}\nหรือพิมพ์ข้อความที่นี่ — แอดมินจะตอบค่ะ`, config.channelAccessToken);
      break;
  }
}
```

### handleMessage intent extension (per-branch — uses existing routing)

```js
// In handleMessage, AFTER resolveLineConfigForWebhook gives { config, branchId }:
const text = event.message.text.trim();
if (text === 'หยุดแจ้งเตือน' || text.toLowerCase() === 'stop') {
  // Look up customer via lineUserId_byBranch[branchId] (NOT global)
  const customer = await findCustomerByLineUserIdAtBranch(db, event.source.userId, branchId);
  if (customer) {
    await setOptOut(db, customer.id, true, 'customer-dm');
    await reply(event.replyToken, '✓ หยุดแจ้งเตือนผ่าน LINE เรียบร้อยค่ะ\nหากต้องการเปิดอีกครั้ง พิมพ์ "เริ่มแจ้งเตือน"', config.channelAccessToken);
  }
  return;
}
if (text === 'เริ่มแจ้งเตือน' || text.toLowerCase() === 'start') {
  const customer = await findCustomerByLineUserIdAtBranch(db, event.source.userId, branchId);
  if (customer) {
    await setOptOut(db, customer.id, false, 'customer-dm');
    await reply(event.replyToken, '✓ เปิดแจ้งเตือนผ่าน LINE เรียบร้อยค่ะ', config.channelAccessToken);
  }
  return;
}
// (existing intents: ผูก ID / courses / appointments / help)
```

### Customer linkage write (extends V32-tris-ter approval flow)

When admin approves a link request OR webhook receives the "LINK-token" DM:
```js
// Existing customer doc patch (V32-tris-ter):
//   customer.lineUserId = event.source.userId
//   customer.lineDisplayName = profile.displayName
//   customer.lineLinkedAt = serverTimestamp()

// NEW patch (per-branch):
customer.lineUserId_byBranch[branchId] = {
  lineUserId: event.source.userId,
  lineDisplayName: profile.displayName,
  linkedAt: serverTimestamp(),
  _lineStale: false,
  _lineStaleAt: null,
}
// Legacy fields preserved for backward-compat. If branchId === customer.branchId,
// they overlap with lineUserId_byBranch[customer.branchId] — that's fine
// (reads prefer lineUserId_byBranch first).
```

---

## 8 — Retry queue (`/api/cron/line-reminder-retry`)

Same as before, with one tweak — credential lookup MUST go through `getLineConfigForBranch(db, log.branchId)`:

```js
// In retry loop, for each candidate log:
const cfg = await getLineConfigForBranch(db, log.branchId);
if (!cfg || !cfg.enabled || !cfg.channelAccessToken) {
  // Branch's OA was disabled or removed between original send + retry.
  await doc.ref.update({ status: 'skipped-branch-no-oa', retriedAt: now });
  continue;
}
// ... re-fetch customer + appointment ... re-build flex ... push using cfg.channelAccessToken ...
```

Firestore query NOTE: Firestore allows only 1 inequality field per query. Use:
```js
.where('status', '==', 'failed')
.where('nextRetryAt', '<=', now)
.limit(50)
// Then in-memory filter: candidates.filter(log => log.retryCount < 3)
```

---

## 9 — Debug endpoint (`/api/admin/line-reminder-debug-fire`)

Branch-scoped (verifyAdminToken + branchId from request body):

```js
const { branchId, reminderType, mode, customerId, confirmBranchName } = req.body;

if (mode === 'all') {
  const branch = await fetchBranch(db, branchId);
  if (confirmBranchName !== branch?.branchName) {
    return res.status(400).json({ ok: false, error: 'BRANCH_NAME_CONFIRM_MISMATCH' });
  }
}

const cfg = await getLineConfigForBranch(db, branchId);
if (!cfg || !cfg.enabled || !cfg.channelAccessToken) {
  return res.status(400).json({ ok: false, error: 'BRANCH_NO_OA_CONFIGURED' });
}

const candidates = await pickCandidates(db, branchId, reminderType,
  mode === 'single' ? customerId : null);

if (mode === 'dry-run') {
  const rendered = candidates.slice(0, 3).map(c => buildReminderFlex(c, cfg, reminderType));
  return res.status(200).json({ ok: true, mode: 'dry-run', totalEligible: candidates.length, previews: rendered });
}

const results = { sent: 0, failed: 0, skipped: 0 };
for (const c of candidates) {
  const out = await runReminderPipeline(db, c, cfg, reminderType, { isDebug: true });
  results[out.status === 'sent' ? 'sent' : (out.status.startsWith('skipped') ? 'skipped' : 'failed')]++;
}

return res.status(200).json({ ok: true, mode, totalAttempted: candidates.length, results });
```

`pickCandidates` filters appointments to branchId + tomorrow/today + customers that have a per-branch linkage at branchId (uses `lineUserId_byBranch[branchId]` OR legacy fallback per Section 3 Step 4).

---

## 10 — Helper modules

### NEW `src/lib/lineReminderTemplate.js`

Pure ESM. Same as before — `buildReminderFlex`, `resolveTokens`, `renderTemplate`, `parsePostbackData`.

### NEW `src/lib/lineReminderClient.js` (admin-SDK consumers — cron + debug endpoint)

```js
import { getLineConfigForBranch } from '../../api/admin/_lib/lineConfigAdmin.js';

export async function pushLineMessage({ channelAccessToken, lineUserId, flexJson }) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { Authorization: `Bearer ${channelAccessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: lineUserId, messages: [flexJson] }),
  });
  return { statusCode: res.status, body: await res.text() };
}

export async function getMergedBranchReminderSettings(db, branchId) {
  // Read be_line_configs/{branchId}.lineReminder; apply DEFAULTS for missing fields.
  const cfg = await getLineConfigForBranch(db, branchId);
  if (!cfg) return null;
  return {
    enabled: cfg.lineReminder?.enabled === true,
    dayBeforeHour: cfg.lineReminder?.dayBeforeHour ?? 20,
    dayOfHour: cfg.lineReminder?.dayOfHour ?? 9,
    quietHourStart: cfg.lineReminder?.quietHourStart ?? 22,
    quietHourEnd: cfg.lineReminder?.quietHourEnd ?? 8,
    templateDayBefore: cfg.lineReminder?.templateDayBefore || DEFAULT_TEMPLATE_DAY_BEFORE,
    templateDayOf: cfg.lineReminder?.templateDayOf || DEFAULT_TEMPLATE_DAY_OF,
    cancellationPolicyText: cfg.lineReminder?.cancellationPolicyText || 'กรุณาเลื่อน/ยกเลิกล่วงหน้า 24 ชั่วโมง',
  };
}

export async function listEligibleAppointments(db, { branchId, dateISO, reminderType }) {
  // be_appointments where branchId=X + appointmentDate=dateISO + status not in ['cancelled','no-show']
  // + notifyChannel includes 'line'
  // Caller does final per-customer filtering (opt-out + lineUserId_byBranch lookup) in pipeline.
}

export function getCustomerLineUserIdAtBranch(customer, branchId) {
  // Canonical helper for Step 4 of pipeline.
  const linkData = customer.lineUserId_byBranch?.[branchId];
  if (linkData?.lineUserId && linkData._lineStale !== true) return linkData.lineUserId;
  if (customer.branchId === branchId && customer.lineUserId && customer._lineStale !== true) {
    return customer.lineUserId;
  }
  return null;
}
```

### EXISTING `api/admin/_lib/lineConfigAdmin.js`

Already provides:
- `getLineConfigForBranch(db, branchId)` — read by branchId (USED by reminder cron + debug + retry)
- `findLineConfigByDestination(db, destination)` — webhook routing
- `resolveLineConfigForWebhook(db, event)` — full webhook resolution
- `resolveLineConfigForAdmin(db, {branchId})` — admin endpoint resolution

NO changes needed. Reminder code reuses these directly.

---

## 11 — Edge cases + error handling

| Case | Handling |
|---|---|
| Appt cancelled AFTER reminder sent | No-op (message already out) |
| Appt cancelled BEFORE reminder time | Cron skips `status='cancelled'` |
| Confirmed appt at dayOf | STILL send dayOf reminder (final ping) |
| Multi-appt same day same customer | 1 push per appt (idempotency keyed on `appointmentId_type`) |
| Customer linked to นครราชสีมา OA but appt at BRANCH-Y | Step 4: lineUserId_byBranch[BRANCH-Y] missing → SKIP status='skipped-no-line-this-branch'. Admin sees in audit panel → can offer link-to-BRANCH-Y QR via CustomerDetailView. |
| Customer un-follows nครราชสีมา OA but still followed BRANCH-Y | Step 4: lineUserId_byBranch[นครราชสีมา]._lineStale=true (set on 410) → SKIP for นครราชสีมา appts. Appts at BRANCH-Y continue normally. |
| Customer NEVER linked any branch's OA | Step 4: lineUserId_byBranch empty + legacy null → SKIP status='skipped-no-line-this-branch' |
| Branch's `be_line_configs` doc missing | Step 0: cfg null → SKIP entire branch with log status='skipped-branch-no-oa' per appointment |
| Branch's `cfg.lineReminder.enabled = false` | Step 0: SKIP entire branch — admin opt-in default false |
| Reminder time falls in quiet hours | Defensive log skip (admin misconfig signal) |
| Holiday day-of | ProClinic blocks bookings on holidays; defensive `holidayCheck()` |
| LINE channel token rotated for a branch | Admin updates in line-settings tab → cron picks up on next read (no restart needed) |
| Postback event.destination doesn't match any be_line_configs | Webhook drops silently (unknown OA — defense against spoofed events) |
| Postback's appt.branchId ≠ webhook-resolved branchId | Webhook replies "นัดนี้ไม่ตรงกับสาขาที่เชื่อมต่อ" + logs warn (likely a bug, audit later) |
| Vercel cron miss during 20:00 hour | retry queue doesn't auto-fire missed-window. NEW Phase 2 addition: `nextRetryAt` for "missed appointment" scenario — see §17. |

---

## 12 — Testing strategy (Rule Q full coverage + multi-branch class-of-bug)

### P1 — Unit + RTL + source-grep

- `tests/lineReminderTemplate.test.js` — buildReminderFlex token sub + adversarial inputs (empty/Thai/Unicode/null/numeric)
- `tests/lineReminderTemplate-parse-postback.test.js` — parsePostbackData edge cases + br field handling
- `tests/line-reminder-pipeline-idempotency.test.js` — pipeline gating logic (mocked Firestore)
- `tests/line-reminder-pipeline-per-branch-credentials.test.js` — verify Step 0 lookup uses getLineConfigForBranch + Step 6/7 push uses that branch's channelAccessToken (NOT global)
- `tests/line-reminder-pipeline-customer-branch-link.test.js` — verify Step 4 prefers lineUserId_byBranch[branchId]; legacy fallback only when customer.branchId === branchId; cross-branch customer correctly skipped
- `tests/line-reminder-customer-option-source-grep.test.js` — 6 callsites use `<CustomerOption customer={c} contextBranchId={...} />`
- `tests/line-reminder-modal-autotick-source-grep.test.js` — every appointment modal wires auto-tick + branch-scoped link check
- `tests/line-reminder-webhook-intent.test.js` — RTL test of webhook handleMessage + handlePostback intents (mocked LINE event with multiple destination values for branch routing test)
- `tests/line-reminder-webhook-postback-branch-routing.test.js` — verify postback handler uses resolveLineConfigForWebhook + cross-checks appt.branchId
- `tests/line-reminder-settings-tab.test.jsx` — RTL test of C.1/C.2/C.3 UI sections
- `tests/line-reminder-debug-fire-confirmation.test.jsx` — RTL test that "ยิงทุกคน" mode requires branch-name confirm
- **NEW** `tests/line-reminder-class-of-bug-per-branch-audit.test.js` — **AV45 source-grep**: every Push API call site uses per-branch cfg.channelAccessToken; every webhook event handling uses resolveLineConfigForWebhook; every customer LINE lookup uses getCustomerLineUserIdAtBranch helper. Locks LR-1 through LR-5 invariants permanently.

### P2 — Rule Q L2 admin-SDK e2e (REAL prod)

`scripts/e2e-line-reminder-real-prod.mjs --apply` — multi-branch test bank:

**Scenario A — Real นครราชสีมา OA + real Push**:
- Seed TEST-LINE-CUST-A with admin's REAL lineUserId in lineUserId_byBranch[นครราชสีมา-ID]
- Seed TEST-LINE-APPT-A tomorrow at นครราชสีมา with notifyChannel=['line']
- Run cron logic at mocked time = นครราชสีมา's dayBeforeHour
- Verify: log status='sent' + REAL LINE message arrives on admin's phone via นครราชสีมา OA
- Admin clicks ✓ ยืนยัน → verify postback received + appt.status='confirmed' + reply via นครราชสีมา OA

**Scenario B — Fake BRANCH-Y OA config (multi-branch routing test)**:
- Seed `be_line_configs/TEST-BR-Y-{ts}` with FAKE-but-shape-valid credentials (e.g. channelAccessToken='FAKE-TOKEN-Y') + lineReminder.enabled=true
- Seed TEST-LINE-CUST-Y with mock lineUserId_byBranch[TEST-BR-Y]={lineUserId:'U-FAKE-Y',...}
- Seed TEST-LINE-APPT-Y tomorrow at TEST-BR-Y with notifyChannel=['line']
- Run cron logic at mocked time
- Verify: pipeline calls getLineConfigForBranch(TEST-BR-Y) → uses FAKE-TOKEN-Y for Push (will fail at LINE API with 401 since fake token, but the ROUTING is correct — that's what we test)
- Verify: log records branchId='TEST-BR-Y' + status='failed' + lineApiResult.statusCode=401 (or 4xx)
- **Critical assertion**: log.customerLineUserId === 'U-FAKE-Y' (NOT taken from any other customer)

**Scenario C — Cross-branch customer (LR-3 invariant)**:
- TEST-LINE-CUST-C: lineUserId_byBranch only contains นครราชสีมา; customer.branchId=นครราชสีมา; customer.lineUserId=legacy
- TEST-LINE-APPT-C: at TEST-BR-Y (different branch)
- Run cron for TEST-BR-Y window
- Verify: log status='skipped-no-line-this-branch' (NO legacy fallback used because customer.branchId ≠ TEST-BR-Y)

**Scenario D — Multi-branch linked customer (LR-3 positive case)**:
- TEST-LINE-CUST-D: lineUserId_byBranch={นครราชสีมา: {U-A}, TEST-BR-Y: {U-Y}}
- 2 appts: one at นครราชสีมา (uses U-A), one at TEST-BR-Y (uses U-Y)
- Run cron for both windows
- Verify: 2 separate logs, each with correct customerLineUserId

**Scenario E — Missing branch OA (LR-1 invariant)**:
- TEST-LINE-APPT-E at TEST-BR-Z (NO be_line_configs/TEST-BR-Z exists)
- Run cron
- Verify: log status='skipped-branch-no-oa'

**Scenario F — Branch OA disabled (LR-1 invariant)**:
- Seed be_line_configs/TEST-BR-F with enabled=false
- TEST-LINE-APPT-F at TEST-BR-F
- Run cron
- Verify: log status='skipped-branch-no-oa' (or skipped-branch-disabled — name TBD; pipeline classifies)

**Scenario G — opt-out path**:
- Send "หยุดแจ้งเตือน" via real LINE DM to นครราชสีมา OA
- Verify customer.notifyOptOut=true + notifyOptOutBy='customer-dm'
- Re-run cron for any of customer's appts → status='skipped-optout'

**Scenario H — Stale path simulation**:
- Manually set TEST-LINE-CUST-A.lineUserId_byBranch[นครราชสีมา]._lineStale=true
- Re-run cron → status='skipped-stale'

**Cleanup**: delete all TEST-LINE-* fixtures + TEST-BR-Y/Z/F config docs + audit doc emitted

### P3 — Rule Q L1 hands-on (post-deploy)

User confirms (real prod, single real OA at นครราชสีมา):
1. Open https://lover-clinic-app.vercel.app + select นครราชสีมา branch
2. Open LineSettingsTab → "การแจ้งเตือนนัดหมาย" section → configure dayBeforeHour=currentHour+1 (so reminder fires soon for testing) → Save
3. Set debug-fire mode=single + pick admin's customer record → "ทดสอบเลย" → real LINE message arrives on admin's LINE via นครราชสีมา OA
4. Click ✓ ยืนยัน → appointment.status='confirmed' verified in backend
5. Send "หยุดแจ้งเตือน" → opt-out confirmed
6. Send "เริ่มแจ้งเตือน" → re-enabled
7. **Multi-branch L1 (when 2nd branch's OA configured)**: repeat steps 1-6 at BRANCH-Y → confirm both branches' reminders run independently

### P4 — Playwright (optional, after P3)

- `tests/e2e/line-reminder-settings.spec.js` — LineSettingsTab CRUD flow per branch
- `tests/e2e/line-reminder-modal-autotick.spec.js` — AppointmentFormModal auto-tick on LINE customer + cross-branch warning

---

## 13 — Rollout plan

1. **Phase 1** (Ship code): commit + push (NO deploy)
2. **Phase 2** (Local verification): P1 unit tests + build clean + P2 admin-SDK e2e ALL 8 scenarios (A-H) on real prod with TEST fixtures
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
   - User confirms LINE Premium tier active for นครราชสีมา's OA (Push API quota)
4. **Phase 4** (Deploy): user types "deploy" → `vercel --prod`
5. **Phase 5** (Probe-Deploy-Probe per Rule B):
   - Pre-probe: anon POST to be_line_reminder_log + be_line_reminder_postback_log → expect 403
   - Deploy firestore.rules
   - Post-probe: same → expect 403
6. **Phase 6** (L1 hands-on): user runs P3 on real prod — นครราชสีมา OA only (the sole real OA)
7. **Phase 7** (Gradual enable):
   - Enable `be_line_configs[นครราชสีมา-ID].lineReminder.enabled=true`
   - Monitor `be_line_reminder_log` filtered to นครราชสีมา for 48 hours
8. **Phase 8** (Multi-branch later — out of scope NOW but PATH IS READY):
   - When BRANCH-Y adds its own real LINE OA:
     1. Admin fills be_line_configs/{BRANCH-Y-ID} with real channelToken/Secret/destination
     2. Admin enables `lineReminder.enabled=true`
     3. Run debug-fire dry-run to verify config wiring
     4. Existing customers at BRANCH-Y need to RE-LINK via QR through BRANCH-Y's OA (new lineUserId_byBranch entry)
     5. Monitor 48 hours; expand from there

---

## 14 — Risks + open questions

| Risk | Mitigation |
|---|---|
| LINE Push API monthly quota exceeded (200 free) | **REQUIRED: LINE Premium tier (~$60/mo for 5K msgs)** per OA — confirm นครราชสีมา OA is on Premium before P4 deploy |
| Vercel cron Hobby tier limits | Project on Pro tier (confirmed) |
| Multiple cron invocations race | Idempotency-key gate at pipeline Step 1 |
| Customer changes LINE display name | Refresh `lineDisplayName` on every webhook event (existing V32-tris-ter behavior) |
| Misconfigured quiet hours wipe out reminders | Defensive log emit + admin can spot via 7-day audit panel |
| Template rendering bug | Adversarial unit test catches |
| LINE API outage | Retry queue + admin audit alert on ≥5 5xx in same hour |
| Admin accidentally clicks "ยิงทุกคน" debug | Branch-name-verbatim confirmation gate |
| Cross-branch customer confusion | UI shows ⚪️ LINE chip + warning in modal "ลูกค้าผูก LINE กับสาขาอื่น" + invite to link |
| **NEW: code path uses global channelToken instead of per-branch** | **AV45 source-grep regression (LR-1) catches at build time** |
| **NEW: customer LINE lookup uses legacy field cross-branch** | **getCustomerLineUserIdAtBranch helper enforces fallback contract; AV45 LR-3 grep** |
| **NEW: webhook routes by destination but reads global creds** | **resolveLineConfigForWebhook is the single resolution path; AV45 LR-2 grep** |
| LINE Premium tier needed per branch's OA | Each OA needs its own Premium plan when activated; flag in admin runbook for future branch onboarding |

---

## 15 — Out of scope (deferred)

- Self-reschedule deep-link page (current MVP: เลื่อน button just flags admin)
- SMS fallback for non-LINE customers
- Email reminders
- Customer view of `notifyOptOut` toggle in customer-facing portal
- Per-treatment reminder time customization
- Three-window reminders
- Multi-language templates (TH only per Rule 04)
- ML-based no-show prediction
- Open-rate analytics dashboard

---

## 16 — Glossary

- **Reminder type**: `dayBefore` (sent day before appointment, default 20:00) | `dayOf` (sent morning of appointment, default 09:00)
- **Notify channel**: array on appointment doc listing channels — currently only `'line'`
- **Opt-out**: global per-customer flag (covers all branches' reminders)
- **Stale lineUserId**: per-branch flag in `lineUserId_byBranch[branchId]._lineStale` — set when that branch's OA returns 410 (user blocked/unfollowed that specific OA)
- **Idempotency key**: `${appointmentId}_${reminderType}` — `be_line_reminder_log` doc ID
- **Quiet hours**: window during which NO reminders push (default 22:00-08:00, per-branch configurable)
- **Postback**: LINE event when user clicks a Flex Message button → webhook receives `event.postback.data` + `event.destination`
- **OA destination**: each LINE OA has a unique bot userId. The `event.destination` field on every webhook event = that OA's userId. Used to route webhook events to the correct branch.
- **Cross-branch customer**: customer linked to OA-A but has appointment at branch B (different OA-B). Reminder requires linkage at branch B's OA.
- **Per-branch LINE OA**: each branch operates its own LINE Official Account (own Channel Access Token, Channel Secret, basic ID, destination). Customers must follow each OA separately to receive reminders for that branch's appointments.

---

## 17 — Per-branch OA architecture details

### Customer linkage evolution

**V32-tris-ter (2026-04-26)** — single LINE OA:
- `customer.lineUserId` (single field)
- `customer.lineDisplayName`
- `customer.lineLinkedAt`
- All linkages mint via the ONE OA (currently configured at clinic_settings/chat_config.line OR be_line_configs/{customer.branchId} if Phase BS V3 migrated)

**This phase** — multi-branch via `lineUserId_byBranch`:
- New linkages write to `customer.lineUserId_byBranch[branchId]`
- Legacy `customer.lineUserId` retained for backward-compat
- Reader contract via `getCustomerLineUserIdAtBranch(customer, branchId)`:
  1. Prefer `lineUserId_byBranch[branchId]` (if exists + not stale)
  2. Fall back to legacy `customer.lineUserId` ONLY when `customer.branchId === branchId` (legacy linkage was minted via creation-branch's OA)
  3. Return null otherwise

**Migration path** (no immediate migration needed):
- Existing V32-tris-ter linkages remain functional for their original branch (นครราชสีมา customers)
- New linkages (any future re-link via QR) populate `lineUserId_byBranch`
- Eventually: admin can run a one-time migration script to copy legacy `customer.lineUserId` → `customer.lineUserId_byBranch[customer.branchId]` (NOT required for launch; nice-to-have for unified data model)

### Adding a new branch's OA (admin runbook)

1. Admin creates a new LINE OA in LINE Console (or uses existing OA for that branch)
2. Admin gets: Channel ID, Channel Secret, Channel Access Token, Bot Basic ID, Destination (bot userId)
3. In LoverClinic admin → tab=line-settings → select new branch → fill all 5 fields → Save
4. Admin clicks "ทดสอบการเชื่อมต่อ" → verifies LINE API responds 200 with bot info
5. Admin clicks lineReminder.enabled toggle ON + configures dayBeforeHour / dayOfHour / templates
6. Run debug-fire dry-run for that branch → verify 0 eligible customers (none linked yet)
7. Existing customers at that branch must RE-LINK via QR (V32-tris-ter flow already supports re-link → new `lineUserId_byBranch` entry)
8. New customers naturally link via that branch's OA from day 1
9. Monitor `be_line_reminder_log` for 48 hours

### Cron miss + missed-window detection (Phase 2 nice-to-have)

Current spec: cron runs hourly; if Vercel cron misses (e.g. deploy during exact hour) → that hour's reminders missed entirely.

Enhancement: add `/api/cron/line-reminder-backfill` (daily at 23:55) that scans for tomorrow's appointments that should have received dayBefore reminder but `be_line_reminder_log[apptId_dayBefore]` is missing → fire them. Same for today's appointments missing dayOf reminders (after dayOfHour passed).

Defer to Phase 2 enhancement; current spec doesn't include backfill cron.

---

## 18 — Class-of-bug invariants (Rule P discipline + AV45 audit)

Per user directive 2026-05-15: "ขยายผลหาจุดผิดพลาดที่อาจจะเกิดกับสาขาอื่นได้". These invariants are LOCKED via source-grep regression bank (`tests/line-reminder-class-of-bug-per-branch-audit.test.js`) + audit-anti-vibe-code AV45.

**LR-1 — Push API call uses per-branch channelAccessToken**
- Every `fetch('https://api.line.me/v2/bot/message/push'...)` call site MUST set `Authorization: Bearer ${cfg.channelAccessToken}` where `cfg = await getLineConfigForBranch(db, branchId)`.
- Sanctioned exceptions: NONE.
- Grep pattern: `api.line.me/v2/bot/message/push` → all hits must show `getLineConfigForBranch` (or `resolveLineConfigForAdmin`) within 50 lines upward.
- Anti-pattern lock: no hardcoded channelToken, no chat_config.line direct read in push paths.

**LR-2 — Webhook signature verification uses destination-matched config**
- `verifySignature(body, signature, channelSecret)` MUST use the secret resolved via `resolveLineConfigForWebhook(db, event)`.
- Sanctioned exception: top-of-handler signature check uses legacy chat_config fallback during Phase BS V3 transition — DOCUMENTED in line.js lines 80-100 + commented as transition-only.
- Future state (post-Phase BS V3 complete): legacy fallback removed; every signature check is destination-routed.

**LR-3 — Customer LINE userId lookup uses branch-scoped helper**
- `getCustomerLineUserIdAtBranch(customer, branchId)` is the canonical reader.
- Any direct `customer.lineUserId` read in reminder/push paths is forbidden.
- Sanctioned exceptions:
  - V32-tris-ter customer linking flow (legacy field writes during transition) — DOCUMENTED
  - CustomerDetailView display of legacy linkage — DOCUMENTED with "(legacy)" label
- Grep pattern: `customer\.lineUserId(\s*=|\s*!=|\s*===)` in `/api/cron/` + `/api/admin/line-reminder-*` + `/src/lib/lineReminder*` → forbidden

**LR-4 — Cross-branch customer detection in modals**
- Every appointment-creating modal MUST distinguish:
  - linked at THIS branch (green ☑️ checkbox + auto-tick)
  - linked at OTHER branch (yellow ⚠️ warning + invite-to-link CTA)
  - not linked anywhere (silent — admin can offer link)
- `<CustomerOption customer={c} contextBranchId={...} />` is canonical UI helper.
- Source-grep: every appt-create modal imports CustomerOption + passes contextBranchId.

**LR-5 — Audit log entries include branchId**
- Every `be_line_reminder_log` doc MUST have `branchId` field populated.
- Every `be_line_reminder_postback_log` MUST have `branchId` (resolved via destination).
- Daily aggregate `be_admin_audit/line-reminder-daily-*` MUST have `perBranch` breakdown.
- Test: assert log doc shape has branchId field non-empty.

**AV45 audit** — `audit-anti-vibe-code/SKILL.md` extended with:
> AV45 — LINE OA per-branch credential + linkage discipline (V67-ish, post-2026-05-15)
> Sanctioned exceptions: top-of-line.js signature fallback (Phase BS V3 transition); V32-tris-ter legacy customer.lineUserId writes (transition); CustomerDetailView legacy-linkage display.
> Source-grep classifier in `tests/line-reminder-class-of-bug-per-branch-audit.test.js`.

---

## 19 — File map (preview for writing-plans)

```
NEW:
  api/cron/line-reminder-fire.js
  api/cron/line-reminder-retry.js
  api/admin/line-reminder-debug-fire.js
  src/lib/lineReminderTemplate.js
  src/lib/lineReminderClient.js
  src/components/CustomerOption.jsx
  src/components/backend/LineReminderSettingsSection.jsx (extends LineSettingsTab — sub-component for organization)
  src/components/backend/LineReminderDebugSection.jsx
  src/components/backend/LineReminderHistoryPanel.jsx
  tests/lineReminderTemplate.test.js
  tests/lineReminderTemplate-parse-postback.test.js
  tests/line-reminder-pipeline-idempotency.test.js
  tests/line-reminder-pipeline-per-branch-credentials.test.js
  tests/line-reminder-pipeline-customer-branch-link.test.js
  tests/line-reminder-customer-option.test.jsx
  tests/line-reminder-customer-option-source-grep.test.js
  tests/line-reminder-modal-autotick-source-grep.test.js
  tests/line-reminder-webhook-postback-branch-routing.test.js
  tests/line-reminder-webhook-intent.test.js
  tests/line-reminder-settings-tab.test.jsx
  tests/line-reminder-debug-fire-confirmation.test.jsx
  tests/line-reminder-class-of-bug-per-branch-audit.test.js
  scripts/e2e-line-reminder-real-prod.mjs

MODIFY:
  api/webhook/line.js (add postback handler + opt-out intents)
  src/lib/lineConfigClient.js (add lineReminder to DEFAULT_LINE_CONFIG + validateLineConfig)
  src/components/backend/LineSettingsTab.jsx (compose 3 new sub-sections)
  src/components/backend/AppointmentFormModal.jsx (auto-tick + CustomerOption + branch-warning)
  src/components/backend/DepositPanel.jsx (same)
  src/components/backend/AppointmentTab.jsx (same)
  src/pages/AdminDashboard.jsx (same)
  src/components/backend/CustomerDetailView.jsx (opt-out toggle + per-branch linkage list)
  src/components/TreatmentFormPage.jsx (book-followup auto-tick)
  src/lib/backendClient.js (createAppointment + updateAppointment: write notifyChannel + notifyMeta)
  vercel.json (crons[])
  firestore.rules (new collections)
  .agents/skills/audit-anti-vibe-code/SKILL.md (AV45 entry)
  .claude/rules/01-iron-clad.md (Rule B probe list extension)
```

---

## 20 — Spec self-review notes

- ✅ All requirements 1-20 mapped to architecture sections
- ✅ Per-branch discipline threaded through every section (3, 4, 5, 7, 8, 9, 10, 11, 12, 17, 18)
- ✅ Backward-compat with V32-tris-ter legacy customer.lineUserId preserved + documented
- ✅ Existing Phase BS V3 infrastructure (`be_line_configs`, `resolveLineConfigForWebhook`, `getLineConfigForBranch`) leveraged — no duplicate work
- ✅ Class-of-bug invariants LR-1..LR-5 with AV45 audit lock
- ✅ Testing P2 covers 8 scenarios incl. multi-branch routing + cross-branch customer
- ✅ Rollout phased: นครราชสีมา-only launch; future branch onboarding runbook in §17
- ⚠️ Firestore inequality limit: retry queue uses in-memory filter on retryCount<3 — documented in §8
- ⚠️ Missed-window backfill (§17) deferred to Phase 2 enhancement
- ⚠️ Migration script for legacy → lineUserId_byBranch deferred (not required for launch)
