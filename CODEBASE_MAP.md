# LoverClinic OPD System — Codebase Map
> อัพเดทล่าสุด: 2026-04-06 (Treatment Records Phase 2, Master Data Sync Phase 1, Chat system FB/LINE, Import from ProClinic)
> Stack: React 19 + Vite 8 + Firebase 12 (Firestore + FCM) + Tailwind CSS 3.4 + Cloud Functions v2
> Firebase Project: `loverclinic-opd-4c39b`

---

## 📁 โครงสร้างไฟล์

```
functions/
├── index.js                    — Cloud Function: onPatientSubmit (Firestore trigger → FCM push)
├── package.json                — node 20, firebase-functions v6, firebase-admin v12
firebase.json                   — Firebase deploy config (functions source)
.firebaserc                     — Firebase project: loverclinic-opd-4c39b
public/
├── firebase-messaging-sw.js    — Service Worker รับ push ขณะ app ปิด/หน้าจอล็อค
├── manifest.json               — PWA manifest สำหรับ iOS "เพิ่มลงหน้าจอ"
src/
├── main.jsx                    — Entry point
├── App.jsx                     — Root routing + auth + clinic settings
├── firebase.js                 — Firebase init, exports: app, auth, db, appId
├── constants.js                — SESSION_TIMEOUT_MS, DEFAULT_CLINIC_SETTINGS, PRESET_COLORS
├── utils.js                    — Helper functions, defaultFormData, clinical logic
├── hooks/
│   └── useTheme.js             — Dark/Light/Auto theme hook
├── components/
│   ├── ClinicLogo.jsx          — Logo component (custom URL / /logo.jpg / text fallback)
│   ├── ThemeToggle.jsx         — Theme toggle button
│   ├── ClinicSettingsPanel.jsx — Admin settings panel (clinic name, color, logo, doctor hours, practitioner settings, ProClinic credential reload, Master Data Sync) — all CSS-var theme-aware
│   ├── CustomFormBuilder.jsx   — Admin form builder for custom templates — all CSS-var theme-aware, responsive layout
│   ├── ChatPanel.jsx           — Chat FB/LINE: reply (FB only), echo, saved replies, history pagination
│   ├── TreatmentTimeline.jsx   — Treatment records: paginated list, expandable detail, inline edit/delete (Phase 2)
│   ├── TreatmentFormPage.jsx   — Full-page treatment create form: mirrors ProClinic layout (Phase 2)
│   └── PrintTemplates.jsx      — OfficialOPDPrint + DashboardOPDPrint components
└── pages/
    ├── AdminLogin.jsx          — Login page
    ├── AdminDashboard.jsx      — Admin main page (queue, history, deposit, appointment, settings nav)
    ├── ClinicSchedule.jsx      — Public schedule page (/?schedule=<token>) — calendar + time slots
    └── PatientForm.jsx         — Patient intake/follow-up form (QR scan target)
api/webhook/                    — Chat webhook endpoints (FB/LINE)
├── facebook.js                 — FB webhook handler + processEchoMessage() for echo events
├── line.js                     — LINE webhook handler
├── send.js                     — Send messages to FB/LINE (Graph API v25)
└── saved-replies.js            — GET endpoint proxying FB saved_message_responses
api/proclinic/                  — Vercel Serverless Functions (7 consolidated endpoints)
├── customer.js                 — actions: create, update, delete, search, fetchPatient (import patient data)
├── deposit.js                  — actions: submit, update, cancel, options (รวมจาก deposit-*.js)
├── connection.js               — actions: login, credentials, clear (รวมจาก login/credentials/clear-session.js)
├── appointment.js              — actions: create, update, delete (ใหม่ — นัดหมาย ProClinic สำหรับจองไม่มัดจำ)
├── courses.js                  — actions: default(courses), sync-appointments, fetch-appointment-months (คงเดิม)
├── master.js                   — actions: syncProducts, syncDoctors, syncStaff, syncCourses (Master Data Sync)
├── treatment.js                — actions: list, get, getCreateForm, create, update, delete (Treatment Records Phase 2)
└── _lib/ (session.js, scraper.js, fields.js, auth.js — fields.js has reverseMapPatient())
```

---

## 🔥 Firestore Collection Path

```
artifacts/{appId}/public/data/
├── opd_sessions/{sessionId}    — Session documents
│     fields: status, patientData, createdAt, updatedAt, submittedAt,
│             isUnread, isArchived, archivedAt, isPermanent,
│             formType, customTemplate, sessionName,
│             depositData, depositSyncStatus, depositSyncError, depositSyncAt,
│             depositProClinicId, serviceCompleted, serviceCompletedAt,
│             appointmentData, appointmentProClinicId, appointmentSyncStatus, appointmentSyncError
├── clinic_settings/main        — Clinic config (clinicName, accentColor, logoUrl, clinicSubtitle)
└── form_templates/{id}         — Custom form templates
```

### Chat Firestore path
```
artifacts/{appId}/public/data/chat_conversations/{recipientId}
  fields: platform (fb|line), displayName, pictureUrl, lastMessage, lastMessageAt, unread (boolean)
artifacts/{appId}/public/data/chat_conversations/{recipientId}/messages/{messageId}
  fields: text, sender (customer|admin|echo), timestamp, platform
```
- Chat history: 20 messages per page (pagination)
- Auto-delete messages older than 7 days
- Badge count = number of conversations with `unread: true` (not total messages)

### Push Notification Firestore path (new)
```
artifacts/{appId}/public/data/push_config/tokens
  fields: tokens: [{token: string, userAgent: string, createdAt: Timestamp}]
```
- เก็บ FCM device token ทุก device ที่เปิด push
- Cloud Function อ่าน tokens นี้แล้วส่ง multicast push
- Auto-clean token ที่หมดอายุ (invalid-registration-token)

### Session lifecycle
- สร้าง → `status:'pending', patientData:null`
- ผู้ป่วยกรอก → `status:'completed', patientData:{...}, isUnread:true, submittedAt`
- แพทย์อ่าน → `isUnread:false`
- ลบ (ไม่มีข้อมูล) → `deleteDoc` ทันที
- ลบ (มีข้อมูล) → `isArchived:true, archivedAt` (soft delete → ประวัติ)
- ลบถาวรจากประวัติ → `deleteDoc`
- หมดอายุ 2 ชม. + ไม่มีข้อมูล → auto `deleteDoc` (ใน onSnapshot)
- หมดอายุ 2 ชม. + มีข้อมูล → auto `isArchived:true` (ใน onSnapshot)
- Deposit: สร้างคิวจอง → `formType:'deposit', isPermanent:true, depositData:{...}`
- Deposit: "ลูกค้าเข้ารับบริการ" → `serviceCompleted:true` → ย้ายเข้าคิว (queue) ด้วย `isPermanent:false, createdAt:serverTimestamp()` (แปลงเป็น 2-hour link)
- Deposit: "ยกเลิกการจอง" → cancel deposit + delete customer in ProClinic → archive
- NoDeposit: สร้างคิวจองไม่มัดจำ → `isPermanent:true, formType:'intake', appointmentData:{...}` + สร้างนัดหมาย ProClinic
- NoDeposit: "แก้ไขนัด" → อัพเดท appointmentData ใน Firestore + ProClinic
- NoDeposit: "ยกเลิกจอง/ลบ" → ลบนัดจาก ProClinic (ถ้ามี appointmentProClinicId) → archive/delete

### Session ID prefixes
- `LC-XXXXXX` — intake ทั่วไป (ใช้ 3 ตัวแรกของ clinicName)
- `PRM-XXXXXX` — permanent link
- `FW-ED-XXXXXX` — Follow-up IIEF
- `FW-AD-XXXXXX` — Follow-up ADAM
- `FW-MR-XXXXXX` — Follow-up MRS
- `CST-XXXXXX` — Custom form
- `DEP-XXXXXX` — Deposit booking
- `ND-XXXXXX` — No-deposit booking (จองไม่มัดจำ + นัดหมาย ProClinic)
- `IMP-XXXXXX` — Imported from ProClinic (นำเข้าจาก ProClinic)

---

## 📄 src/constants.js

| Export | ค่า | ใช้ที่ |
|--------|-----|--------|
| `SESSION_TIMEOUT_MS` | `2 * 60 * 60 * 1000` (2 ชม.) | filter sessions, expire check |
| `DEFAULT_CLINIC_SETTINGS` | `{clinicName:'Lover Clinic', accentColor:'#dc2626', doctorStartTime, doctorEndTime, doctorStartTimeWeekend, doctorEndTimeWeekend, ...}` | fallback ทุกที่ |
| `PRESET_COLORS` | array 10 สี | ClinicSettingsPanel color picker |

---

## 📄 src/utils.js

### Constants/Data
| Export | บรรทัด | คำอธิบาย |
|--------|--------|-----------|
| `hexToRgb(hex)` | 1 | แปลง hex → "r,g,b" string สำหรับ rgba() |
| `applyThemeColor(hex)` | 8 | set CSS vars `--accent`, `--accent-rgb` บน :root |
| `THAI_MONTHS` | 14 | array {value, label} เดือนภาษาไทย |
| `EN_MONTHS` | 21 | array {value, label} เดือนภาษาอังกฤษ |
| `YEARS_BE` | 29 | array ปีพ.ศ. 120 ปีย้อนหลัง |
| `YEARS_CE` | 30 | array ปีค.ศ. 120 ปีย้อนหลัง |
| `COUNTRY_CODES` | 32 | array {code, label} รหัสโทรศัพท์ ~40 ประเทศ |

### defaultFormData (บรรทัด 48)
Fields ทั้งหมดใน patient intake form:
- `prefix, firstName, lastName, gender`
- `dobDay, dobMonth, dobYear, age`
- `address, phone, isInternationalPhone, phoneCountryCode`
- `emergencyName, emergencyRelation, emergencyPhone, isInternationalEmergencyPhone, emergencyPhoneCountryCode`
- `visitReasons[], visitReasonOther`
- `hrtGoals[], hrtTransType, hrtOtherDetail`
- `hasAllergies, allergiesDetail`
- `hasUnderlying, ud_hypertension, ud_diabetes, ud_lung, ud_kidney, ud_heart, ud_blood, ud_other, ud_otherDetail`
- `currentMedication, pregnancy`
- `howFoundUs[]` — ช่องทางที่รู้จักคลินิก (required)
- `symp_pe` — อาการหลั่งเร็ว
- `adam_1..adam_10` — ADAM scale checkboxes
- `iief_1..iief_5` — IIEF-5 scale scores
- `mrs_1..mrs_11` — MRS scale scores
- `assessmentDate` — วันที่ประเมิน (สำหรับ follow-up)

### Functions
| Export | บรรทัด | คำอธิบาย |
|--------|--------|-----------|
| `formatPhoneNumberDisplay(phone, isInt, code)` | 69 | format display เบอร์โทร |
| `formatBangkokTime(timestamp)` | 69 | แปลง Firestore Timestamp → string GMT+7 Bangkok เช่น "21 มี.ค. 67 14:30" |
| `getReasons(d)` | 74 | ดึง visitReasons array (รองรับ field เก่า visitReason) |
| `getHrtGoals(d)` | 81 | ดึง hrtGoals array (รองรับ field เก่า hrtGoal) |
| `calculateADAM(d)` | 88 | คำนวณ ADAM score → {positive, total, text, color, bg} |
| `calculateIIEFScore(d)` | 101 | sum iief_1..5 → number |
| `getIIEFInterpretation(score)` | 105 | แปล IIEF score → {text, color, bg} |
| `calculateMRS(d)` | 114 | คำนวณ MRS score → {score, text, color, bg} |
| `generateClinicalSummary(d, formType, customTemplate, lang)` | 123 | สร้าง clinical summary text (TH/EN) ใช้ copy ใน dashboard |
| `renderDobFormat(d)` | 341 | format วันเกิด → "1 มกราคม 2540" |
| `playNotificationSound(volume)` | 351 | เล่นเสียง "ดิ๊ง" สองโน้ต (880Hz + 1108Hz) ด้วย AudioContext |

---

## 📄 src/App.jsx

### State (บรรทัด 16-25)
| State | ใช้ทำอะไร |
|-------|-----------|
| `user` | Firebase auth user |
| `isInitializing` | loading state ก่อน auth ready |
| `printMode` | null / 'official' / 'dashboard' — เปิด print view |
| `viewingSession` | session object ที่กำลังดูอยู่ (ส่งลง AdminDashboard) |
| `adminView` | 'dashboard' / 'simulation' — สลับ AdminDashboard ↔ PatientForm simulation |
| `simulatedSessionId` | sessionId ที่ simulate scan |
| `clinicSettings` | merged clinic settings object |

### Logic
- `sessionFromUrl` — ถ้ามี `?session=` ใน URL → แสดง PatientForm (สำหรับผู้ป่วย)
- `signInAnonymously` — ถ้ามี session URL + ไม่ได้ login → auth anonymous อัตโนมัติ
- `onSnapshot clinic_settings/main` — sync clinic settings realtime
- `afterprint` event → reset `printMode`

### Routing logic
1. `isInitializing` → loading screen
2. `scheduleFromUrl` → `<ClinicSchedule>` (public, ไม่ต้อง login)
3. `patientFromUrl` → `<PatientDashboard>` (ไม่ต้อง login)
4. `sessionFromUrl` → `<PatientForm>` (ไม่ต้อง login)
5. `!user || user.isAnonymous` → `<AdminLogin>`
6. else → `<AdminDashboard>` หรือ `<PatientForm isSimulation>`

---

## 📄 src/pages/AdminDashboard.jsx

### Props
```js
{ db, appId, user, auth, viewingSession, setViewingSession,
  setPrintMode, onSimulateScan, clinicSettings, theme, setTheme }
```

### State (บรรทัด 25-51)
| State | บรรทัด | คำอธิบาย |
|-------|--------|-----------|
| `sessions` | 25 | active sessions array (realtime) |
| `formTemplates` | 26 | custom form templates array |
| `isGenerating` | 27 | กำลังสร้าง session ใหม่ |
| `selectedQR` | 28 | sessionId ที่แสดง QR panel |
| `sessionToDelete` | 29 | sessionId ที่กำลังจะลบ (confirm modal) |
| `currentTime` | 30 | Date.now() อัพเดททุก 10วิ (สำหรับ countdown) |
| `isCopied` | 31 | feedback ปุ่ม copy QR |
| `isLinkCopied` | 32 | feedback ปุ่ม copy link |
| `showSessionModal` | 33 | modal เลือกประเภท session |
| `sessionModalTab` | 34 | 'standard' / 'custom' |
| `showNamePrompt` | 36 | modal ใส่ชื่อ session |
| `pendingConfig` | 37 | config รอสร้าง {isPermanent, formType, customTemplate} |
| `sessionNameInput` | 38 | ชื่อ session ที่กรอก |
| `editingNameId` | 39 | sessionId ที่กำลัง edit ชื่อ inline |
| `editingNameValue` | 40 | ค่าชื่อที่กำลัง edit |
| `adminMode` | 41 | 'dashboard' / 'formBuilder' / 'clinicSettings' / 'history' / 'deposit' / 'depositHistory' / 'appointment' / 'chat' |
| `isNotifEnabled` | 43 | เปิด/ปิดเสียงแจ้งเตือน |
| `notifVolume` | 44 | ระดับเสียง 0-1 |
| `showNotifSettings` | 45 | dropdown ตั้งค่าเสียง |
| `toastMsg` | 46 | ข้อความ toast notification |
| `prevSessionsRef` | 47 | useRef — เก็บ queue+noDeposit sessions ก่อนหน้าสำหรับ detect changes (allNotifData) |
| `hasNewUpdate` | 48 | มีข้อมูลอัพเดทขณะดู session detail |
| `summaryLang` | 49 | 'en' / 'th' ภาษา clinical summary |
| `archivedSessions` | 50 | archived sessions array (ประวัติ) |
| `sessionToHardDelete` | 51 | sessionId ที่จะลบถาวร (confirm modal) |
| `pushEnabled` | ~53 | push เปิดอยู่บน device นี้ไหม (sync กับ localStorage `lc_push_enabled`) |
| `pushLoading` | ~54 | กำลัง request permission / get FCM token |
| `depositSessions` | — | active deposit sessions (formType==='deposit' && !isArchived) |
| `archivedDepositSessions` | — | archived deposit sessions |
| `noDepositSessions` | — | active no-deposit sessions (isPermanent && formType!=='deposit' && !serviceCompleted && !isArchived) |
| `archivedNoDepositSessions` | — | archived no-deposit sessions |
| `depositOptions` | — | ProClinic dropdown options (payment methods, sellers, doctors, rooms) |
| `depositOptionsLoading` | — | loading state for deposit options fetch |
| `depositToDelete` | — | `{ session, action: 'archive'\|'cancel'\|'complete' }` — styled confirm modal (red=delete/cancel, blue=complete) |
| `schedCustomDoctorHours` | — | object: per-day doctor hour overrides `{ 'YYYY-MM-DD': { start, end } }` |
| `doctorSlotDragRef` | — | useRef สำหรับ drag-select doctor hour slots |
| `apptSlotDuration` | ~171 | ช่วงเวลาสำหรับคำนวณ slot ว่างในปฏิทินนัดหมาย (15-120 นาที, default 60) |
| `apptFilterPractitioner` | ~175 | 'all' \| practitioner id string — filter ปฏิทินนัดหมายตามแพทย์/ผู้ช่วย |
| `schedSelectedDoctor` | ~189 | practitioner id \| null — เลือกแพทย์สำหรับสร้างลิงก์ per-doctor |

### Appointment Calendar Computed Values (IIFE inside render)
- `filteredAppointments` — appointments filtered by `apptFilterPractitioner`
- `availByDate` — slot ว่างคำนวณจาก clinic hours (clinicOpenTime/CloseTime) ใช้ filteredAppointments
- `docAvailByDate` — slot ว่างคำนวณเฉพาะ doctor hours (doctorStartTime/EndTime) สำหรับ doctorDays เท่านั้น ใช้ filteredAppointments
- Cell colors: `normalCellBg` (เขียว, default ทุกวัน), `docCellBg` (ฟ้า, หมอเข้า), `closedCellBg` (แดง, ปิด)
- แสดง `ว่าง/หมอ` side-by-side เช่น `8/4` — เขียว=คลินิก, ฟ้า=เวลาหมอ
- 🩺 emoji มุมขวาบนวันหมอเข้า, ส/อา ตัวเลขแดงเสมอ

### Computed (บรรทัด 288-289)
```js
const activeSessionInfo = selectedQR ? sessions.find(s => s.id === selectedQR) : null;
const unreadCount = sessions.filter(s => s.isUnread).length; // ใช้กับ badge บน nav
```

### useEffects
| บรรทัด | ทำอะไร |
|--------|---------|
| 53-56 | `setInterval` อัพเดท `currentTime` ทุก 10วิ |
| 59-64 | `onSnapshot` form_templates collection |
| 66-132 | `onSnapshot` opd_sessions — หลัก: auto-cleanup, set archivedSessions, set sessions, notification logic |
| 134-148 | track `viewingSession` vs latest `sessions` → set `hasNewUpdate` |

### Notification Sound Logic (บรรทัด 107-127)
เสียงดังเมื่อ: `newS.isUnread === true` AND (`!oldS.isUnread` OR `patientData` changed)
- ไม่ดังตอนแพทย์อ่าน (isUnread: true→false)
- ดังเมื่อผู้ป่วยส่งฟอร์มครั้งแรก หรือแก้ไขซ้ำก่อนแพทย์อ่าน

### Functions
| Function | บรรทัด | คำอธิบาย |
|----------|--------|-----------|
| `formatRemainingTime(session)` | 149 | คำนวณเวลาเหลือ → string |
| `getBadgeForFormType(formType, customTemplate)` | 162 | JSX badge chip ตามประเภท form |
| `openNamePrompt(config)` | 170 | เปิด modal ใส่ชื่อ session |
| `confirmCreateSession()` | 177 | สร้าง session ใน Firestore |
| `deleteSession(sessionId)` | 220 | soft delete (archive ถ้ามีข้อมูล, ลบถ้าไม่มี) |
| `hardDeleteSession(sessionId)` | 238 | ลบถาวรจาก Firestore |
| `handleViewSession(session)` | 245 | เปิด detail + mark isUnread:false (ยกเว้น deposit ที่ sync แล้วแต่ลูกค้าแก้ข้อมูล → ไม่ clear จนกว่า sync) |
| `closeViewSession()` | 255 | ปิด detail panel |
| `getSessionUrl(sessionId)` | 260 | สร้าง URL สำหรับผู้ป่วย |
| `getQRUrl(sessionId)` | 261 | สร้าง QR image URL (qrserver.com API) |
| `handleCopyToClipboard(text, isUrl)` | 263 | copy text ด้วย execCommand |
| `handleEditName(id, currentName)` | 276 | เริ่ม inline edit ชื่อ session |
| `saveEditedName(id)` | 281 | บันทึกชื่อ session ใหม่ |
| `enablePushNotifications()` | ~58 | request permission → getToken → save to Firestore push_config/tokens |
| `disablePushNotifications()` | ~90 | clear localStorage + reset pushEnabled state |
| `handleDepositSync(session)` | — | Two-step: fillProClinic → submitDeposit (first time) หรือ updateProClinic → updateDeposit (re-sync), clears isUnread |
| `handleDepositCancel(session)` | — | Cancel deposit + delete customer in ProClinic → archive + clear patientLink |
| `handleSaveDepositData(data)` | — | Save deposit edits to Firestore + sync to ProClinic if already synced (updateDeposit) |
| `handleResync(session)` | — | Manual resync OPD data → clears isUnread for deposit, clears patientLink if notFound |
| `getDoctorHoursForDate(dateStr)` | — | คืน { start, end } สำหรับวันนั้น (custom override → weekend default → weekday default) |
| `isSlotInDoctorHours(slot, dateStr)` | — | เช็คว่า slot อยู่ในช่วงเวลาแพทย์เข้าหรือไม่ |
| `toggleDoctorSlot(dateStr, slotTime)` | — | toggle slot เข้า/ออกจาก customDoctorHours override |
| `handleDocSlotPointerDown/Enter/Up()` | — | drag-select doctor hour slots (ใช้กับ doctorSlotDragRef) |
| `handleDayPointerMove()` | — | touch drag support: ใช้ elementFromPoint ส่ง data-dayds ไปหา handleDayPointerEnter |
| `handleSlotPointerMove()` | — | touch drag support: ใช้ elementFromPoint + data-slot-info ส่งไป slot/doctor enter handlers |

### JSX Layout (return บรรทัด 291+)
```
<div> wrapper
├── Toast notification (fixed bottom-right)
├── <header> — Nav bar
│   ├── Row 1: Logo + mobile icon buttons (xl:hidden)
│   ├── Row 2: Nav tabs (mobile grid-cols-6, xl:hidden)
│   │   └── คิว (badge) | จอง (badge) | ประวัติ | นัด | จัดการ | ตั้งค่า
│   └── Desktop nav (hidden xl:flex, flex-wrap)
│       └── หน้าคิว (badge) | จองมัดจำ (badge) | ประวัติ | นัดหมาย | จัดการ | ตั้งค่า | + สร้างคิว | 🔔 | logout
├── adminMode === 'clinicSettings' → <ClinicSettingsPanel>
├── adminMode === 'formBuilder' → <CustomFormBuilder>
├── adminMode === 'chat' → <ChatPanel> (FB/LINE chat with reply, echo, saved replies)
├── adminMode === 'history' → Archive table + Hard Delete modal + "นำเข้าจาก ProClinic" collapsible section
├── adminMode === 'deposit' → Deposit booking cards (red glow, inline edit, sync/cancel/service-complete buttons)
├── adminMode === 'depositHistory' → Deposit history (serviceCompleted badge, cancelled badge, hard delete)
├── adminMode === 'appointment' → ProClinic appointment calendar (month view + slot duration selector + "ว่าง X" per day + day detail + doctor hour drag column sky/blue)
└── adminMode === 'dashboard' (default)
    ├── Left: Session list table
    │   ├── Columns: รหัสคิว | ข้อมูลผู้ป่วย | สาเหตุที่มา | สถานะ | actions
    │   └── Modals: sessionModal, namePrompt, deleteConfirm
    ├── Right: QR panel (selectedQR)
    ├── Appointment detail cards: ProClinic ExternalLink button per appointment (customerId + proClinicOrigin)
    └── Bottom overlay: Session detail viewer (viewingSession)
        ├── "มีข้อมูลอัพเดท" banner (hasNewUpdate)
        ├── Patient summary sections
        └── Clinical summary copy + print buttons
```

---

## 📄 src/components/ChatPanel.jsx

### Description
Chat panel สำหรับ FB Messenger + LINE — แสดงรายการสนทนา + ข้อความ + reply (FB only)

### Features
- **Reply input**: FB conversations สามารถตอบกลับได้จากแอป; LINE แสดง "ตอบแชท LINE ผ่าน LINE OA Chat เท่านั้น"
- **Saved Replies dropdown**: Bookmark icon, fetches from FB API (`saved_message_responses`), 5-min cache
- **Echo messages**: Admin/AI replies from FB show as blue bubbles on right side (sender = 'echo')
- **Badge counts**: จำนวนคนที่มี unread (ไม่ใช่ total messages) — ใช้ `unread: true` count
- **selectedConv sync**: `liveSelectedConv` ref synced with realtime Firestore data เพื่อป้องกัน stale closure
- **Chat history pagination**: 20 messages per page, auto-delete messages older than 7 days

### Helper Functions
| Function | คำอธิบาย |
|----------|-----------|
| `chatApiFetch(endpoint, options)` | Wrapper for chat API calls (webhook endpoints) |
| `sendMessage(recipientId, text, platform)` | Send message via `/api/webhook/send` (FB only) |

### UI Layout
```
├── Conversation list (left)
│   ├── Platform icon (FB/LINE) + displayName + lastMessage preview
│   └── Unread dot indicator
└── Message view (right)
    ├── Message bubbles (left = customer, right = echo/admin)
    ├── Pagination (older messages)
    ├── Saved Replies dropdown (Bookmark icon, FB only)
    └── Reply input + Send button (FB only) / LINE disclaimer
```

---

## 📄 api/webhook/ — Chat Webhook Endpoints

### api/webhook/facebook.js
- FB Webhook handler: receives messages + echo events from Facebook
- `processEchoMessage()` — handles `message_echoes` subscription events
  - Dedup via `OUR_APP_ID` check (skip echoes from other apps)
  - Stores echo messages with `sender: 'echo'` in Firestore
  - Updates `lastMessage` on conversation doc
- Uses `firestorePatch()` with `updateMask.fieldPaths` to prevent deleting existing fields

### api/webhook/send.js
- Sends messages to FB (Graph API v25.0) and LINE
- Upgraded from Graph API v21 to v25
- Uses `firestorePatch()` with `updateMask.fieldPaths` to prevent deleting existing fields
- Stores sent messages as echo in Firestore chat history

### api/webhook/saved-replies.js
- NEW file: GET endpoint proxying FB `saved_message_responses` API
- Returns saved replies list for the Saved Replies dropdown in ChatPanel
- Fetched via `chatApiFetch()` from frontend

### api/webhook/line.js
- LINE Webhook handler: receives messages from LINE
- LINE does not support echo or reply from our app

---

## AdminDashboard — Import from ProClinic

### Description
"นำเข้าจาก ProClinic" collapsible section in the history page (`adminMode === 'history'`)

### Flow
1. Admin expands "นำเข้าจาก ProClinic" section
2. Search by HN / phone / ID card / name → calls `searchCustomers(query)` via brokerClient
3. Results show patient preview: name, phone, HN, courses count, appointments count
4. Admin clicks "นำเข้า" → calls `fetchPatientFromProClinic(proClinicId)` via brokerClient
5. Duplicate detection: checks existing sessions for matching HN / phone / ID card
   - If duplicate found with broken sync → auto-resync (update broker fields)
   - If duplicate found with active sync → show warning
6. Creates `IMP-XXXXXX` session with imported patient data

### API
- `api/proclinic/customer.js` action `fetchPatient` — fetches full patient data from ProClinic edit page
- `api/proclinic/_lib/fields.js` `reverseMapPatient()` — maps ProClinic form fields back to app's `patientData` format
- `src/lib/brokerClient.js` `fetchPatientFromProClinic(proClinicId)` — client wrapper

---

## 🔄 Master Data Sync (Phase 1)

### Description
Sync master data (products, doctors, staff, courses) from ProClinic → Firestore สำหรับใช้เป็น dropdown/reference data

### api/proclinic/master.js
Route handler — actions: `syncProducts`, `syncDoctors`, `syncStaff`, `syncCourses`

| Function | คำอธิบาย |
|----------|-----------|
| `scrapePaginated(session, baseUrl, extractFn, maxPages)` | Parallel paginated scraper — batch of 5 pages at a time |
| `handleSyncProducts(req, res)` | Scrapes `/admin/product` → products list |
| `handleSyncDoctors(req, res)` | Scrapes `/admin/doctor` → doctors list |
| `handleSyncStaff(req, res)` | Scrapes `/admin/user` → staff/users list |
| `handleSyncCourses(req, res)` | Scrapes `/admin/course` → courses list |
| `handler(req, res)` | Route dispatcher (verifyAuth + action routing) |

### api/proclinic/_lib/scraper.js — Master Data Extraction Functions
| Function | คำอธิบาย |
|----------|-----------|
| `extractProductList(html)` | Extract products table rows (id, name, unit, price, category, type, status) |
| `extractDoctorList(html)` | Extract doctors table rows (id, name, position, branches, color) |
| `extractStaffList(html)` | Extract staff/users table rows (id, name, email, role, branches) |
| `extractCourseList(html)` | Extract courses table rows (id, name, type, category, price, status) |
| `extractListPagination(html)` | Detect max page from pagination links |

### Client (brokerClient.js)
- `syncProducts()` — calls master API action syncProducts
- `syncDoctors()` — calls master API action syncDoctors
- `syncStaff()` — calls master API action syncStaff
- `syncCourses()` — calls master API action syncCourses

### UI (ClinicSettingsPanel.jsx)
- Master Data Sync section (between Practitioners and ProClinic Integration sections)
- 4 individual sync buttons (products, doctors, staff, courses) with per-item loading/result states
- "Sync ทั้งหมด" button to sync all sequentially
- States: `syncStatus` (per-item loading), `syncResults` (per-item success/error/count)

---

## 🏥 Treatment Records (Phase 2)

### Description
ดู/สร้าง/แก้ไข/ลบ treatment records จาก ProClinic ผ่าน LoverClinic app — ระบบ OPD Card ที่สำคัญที่สุด

### api/proclinic/treatment.js
Route handler — actions: `list`, `get`, `getCreateForm`, `create`, `update`, `delete`

| Function | คำอธิบาย |
|----------|-----------|
| `handleList(req, res)` | Scrapes `/admin/customer/{id}?treatment_page=N` → treatment cards + pagination |
| `handleGet(req, res)` | Scrapes `/admin/treatment/{id}/edit` → full treatment detail (OPD, vitals, items, fees) |
| `handleGetCreateForm(req, res)` | Scrapes `/admin/treatment/create?customer_id={id}` → form options (doctors, health info, CSRF) |
| `handleCreate(req, res)` | GET create page for CSRF + defaults, build URLSearchParams, POST `/admin/treatment`. Payment fields match ProClinic exactly: `status` (0/2/4), `payment_method`, `paid_amount`, `hasPaymentMethod1`, `hasSeller1-5`, `sale_percent_1-5`, `ref_no`, `note` |
| `handleUpdate(req, res)` | GET edit page for CSRF + existing values, overlay new values with `??`, POST with `_method=PUT`. Includes payment/seller/insurance fields |
| `handleDelete(req, res)` | GET edit page for CSRF, POST with `_method=DELETE` |
| `handler(req, res)` | Route dispatcher (verifyAuth + action routing) |

### api/proclinic/_lib/scraper.js — Treatment Extraction Functions
| Function | คำอธิบาย |
|----------|-----------|
| `extractTreatmentList(html)` | Parse customer detail page center column → treatment cards (date, doctor, assistants, CC, DX, products) |
| `extractTreatmentPagination(html)` | Detect max page from `?treatment_page=N` pagination links |
| `extractTreatmentDetail(html)` | Parse treatment edit page → all fields: doctorId, vitals, OPD textareas, items, fees, consent, medCert |
| `extractTreatmentCreateOptions(html)` | Parse create form → doctors, assistants, healthInfo, paymentChannels, CSRF token |

### src/components/TreatmentTimeline.jsx
Shared component used in AdminDashboard + PatientDashboard

| Component | คำอธิบาย |
|-----------|-----------|
| `TreatmentTimeline` | Main: paginated list, expandable cards, refresh, create button. Props: customerId, isDark, onOpenCreateForm. States: treatments, page, totalPages, expandedId, detailCache, editingId, deletingId |
| `TreatmentEditForm` | Inline edit form pre-filled from detail, saves via `broker.updateTreatment` |
| `VitalBadge` | Small display for vital sign values (BT, PR, RR, BP, O2sat, weight, height) |
| `OPDField` | Labeled text field display for OPD card sections (CC, PE, DX, Dr.Note, Plan) |

### src/components/TreatmentFormPage.jsx
Full-page treatment create form — mirrors ProClinic `/admin/treatment/create` layout

| Section | Fields |
|---------|--------|
| ข้อมูลการรักษา | doctor select, assistant multi-select (max 5), treatment date |
| ข้อมูลสุขภาพลูกค้า | blood type, congenital disease, drug allergy, treatment history |
| Vital Signs | weight, height, BMI (auto), BT, PR, RR, SBP, DBP, O₂sat |
| ใบรับรองแพทย์ | med cert checkboxes (actually came, rest period, other) |
| OPD Card | CC, PE, DX, Dr.Note, Plan, Note, Additional Note (7 textareas) |
| สั่งยากลับบ้าน | 3 buttons (กลุ่มยากลับบ้าน, ยากลับบ้าน, Remed) + dynamic medication table (name, dosage, qty, unit price). Real ProClinic product search via JSON API |
| ข้อมูลการใช้คอร์ส | customer course display + checkbox item selection |
| เบิกประกัน | benefit type select, insurance company select |
| การชำระเงิน | payment status (0=ภายหลัง/2=เต็ม/4=แบ่ง), channel, paid amount, time, ref_no, note, sale_note — matches ProClinic field names exactly |

**Data loading:** `broker.getTreatmentCreateForm(customerId)` → doctors, assistants, healthInfo, vitalsDefaults, bloodTypeOptions, customerCourses, benefitTypes, insuranceCompanies, paymentChannels, sellers, dosageUnits, wallets, medicationGroups, remedItems

**Navigation:** AdminDashboard `treatmentFormMode` state → renders as z-[80] full-screen overlay. Props include `db`, `appId` for Firestore backup.

**Firestore backup:** On submit, saves raw treatment data to `artifacts/{appId}/public/data/treatments/{proClinicId}`. On group modal open, saves medication groups → `master_data/medication_groups/items/{id}` and consumable groups → `master_data/consumable_groups/items/{id}`

### Client (brokerClient.js) — Treatment Functions
- `listTreatments(customerId, page)` — list treatments for a customer (paginated)
- `getTreatment(treatmentId)` — get full treatment detail
- `getTreatmentCreateForm(customerId)` — get create form options (enhanced: courses, insurance, blood types, sellers)
- `createTreatment(customerId, treatment)` — create new treatment (enhanced: courseItems, medications, insurance, payment)
- `updateTreatment(treatmentId, treatment)` — update existing treatment
- `deleteTreatment(treatmentId)` — delete/cancel treatment
- `listItems(itemType, query)` — list purchasable items (course/promotion/product) from ProClinic `/admin/api/item/{type}`

### Integration
- **AdminDashboard.jsx**: TreatmentTimeline rendered in patient detail view (after Clinical Summary), conditioned on `viewingSession.brokerProClinicId`. Create button triggers `treatmentFormMode` state → opens TreatmentFormPage overlay
- **PatientDashboard.jsx**: TreatmentTimeline rendered for admin view (`isAdminView && sessionData.brokerProClinicId`)
- Purple accent color: dark `#a78bfa`, light `#7c3aed`

---

## 📄 src/pages/ClinicSchedule.jsx

### Props
```js
{ token, clinicSettings, theme, setTheme }
```

### Description
Public schedule page ที่ลูกค้าเปิดผ่าน `/?schedule=<token>` — ไม่ต้อง login

### Data
- อ่านจาก Firestore: `clinic_schedules/{token}` ผ่าน onSnapshot (live update)
- Fields: `months`, `doctorDays`, `closedDays`, `bookedSlots`, `manualBlockedSlots`, `clinicOpenTime/CloseTime`, `clinicOpenTimeWeekend/CloseTimeWeekend`, `doctorStartTime/EndTime`, `doctorStartTimeWeekend/EndTimeWeekend`, `customDoctorHours`, `slotDurationMins`, `noDoctorRequired`, `enabled`, `createdAt`
- Merge bookedSlots + manualBlockedSlots สำหรับคำนวณว่าง

### Features
- **i18n**: ระบบแปลภาษา TH/EN ผ่าน `LANG` object + `lang` state + ปุ่ม Globe toggle
- **Theme-aware**: ใช้ `isDark` boolean คำนวณสีแทน Tailwind `dark:` prefix (เพราะ theme ใช้ `data-theme` attribute)
- **Dark mode: Fire/Ember theme** — `fireGlow` object มี inline styles สำหรับ normal/doctor/avail/selected/disabled cells: gradient backgrounds (#0a0a0a→#2d0f00), inset box-shadow glow effects, red-orange metallic borders (#4a1a0a), premium gaming aesthetic. Header/legend/slots/contact cards ทั้งหมดใช้ fire palette. Light mode ใช้ Tailwind classes ปกติ
- Calendar view แบ่งตามเดือน (month tabs) — gap-px grid borders, trailing cells fill incomplete rows
- วันหมอเข้า (sky highlight / dark: blue glow) / วันปิด (muted disabled) / วันว่าง (green badge "ว่างX" / dark: emerald glow)
- `noDoctorRequired=false`: วันที่ไม่ใช่หมอเข้า disabled + ไม่แสดงเลขคิวว่าง
- `noDoctorRequired=true`: ทุกวันคลิกได้ยกเว้นวันปิด, วันหมอเข้ามี 🩺 emoji (มุมขวาบน)
- กดวันที่ → แสดง time slots (horizontal list + CheckCircle2/XCircle icons) — free/total count
- Today indicator: dot above date number + "วันนี้"/"Today" label below
- 24hr expiry: ลิงก์อายุ 24 ชม. จาก `createdAt` → แสดง "ลิงก์หมดอายุ"
- `enabled === false` → แสดง "ไม่พบตารางนัดหมาย"
- Contact buttons (LINE + Phone) with hover scale animation
- Sticky header with backdrop blur
- Loading state with spinning circle, error states with icon container
- Legend inside calendar card at bottom
- Mobile-first layout (max-w-lg container, responsive padding)

### Helper functions
- `generateTimeSlots(open, close, duration)` — สร้าง array ของ time slots
- `getSlotsForDate(dateStr)` — เลือก weekday/weekend hours แล้ว generate slots
- `isSlotBooked(date, start, end, bookedSlots)` — เช็คว่า slot ซ้อนกับ booking ไหม
- `isDayDisabled(dateStr)` — เช็คว่าวันนี้ disabled (ปิด หรือ ไม่ใช่วันหมอเข้าเมื่อต้องพบแพทย์)
- `getDoctorHoursForDate(dateStr)` — คืน { start, end } จาก customDoctorHours override หรือ weekend/weekday default
- `isSlotOutsideDoctorHours(slot, dateStr)` — blocks slots นอกเวลาแพทย์สำหรับ พบแพทย์ links
- Availability count + selected slots exclude doctor-hour-blocked slots
- `showFrom` — อ่านจาก schedule doc ('today'/'tomorrow') → วันก่อน cutoff = disabled เหมือนวันหมอไม่เข้า
- `endDate` — อ่านจาก schedule doc ('YYYY-MM-DD') → วันหลัง endDate = disabled + ไม่นับ avail
- `isDark` — computed boolean จาก theme prop + matchMedia สำหรับ auto mode
- Theme color helpers: `docCellBg`, `availCellBg`, `availColor`, `closedCellBg` etc.

---

## AdminDashboard — Schedule Link Modal

### State (บรรทัด ~170-186)
| State | ใช้ทำอะไร |
|-------|-----------|
| `showScheduleModal` | เปิด/ปิด modal สร้างลิงก์ |
| `schedStartMonth` | เดือนเริ่มต้น (YYYY-MM) |
| `schedAdvanceMonths` | จำนวนเดือนทั้งหมด (1-4) |
| `schedDoctorDays` | Set ของวันที่หมอเข้า (persist ใน Firestore schedule_prefs) |
| `schedClosedDays` | Set ของวันปิด (persist ใน Firestore schedule_prefs) |
| `schedGenLoading` | boolean กำลัง gen |
| `schedGenResult` | { token, url, qrUrl } หลัง gen สำเร็จ |
| `schedSlotDuration` | ช่วงเวลาละกี่นาที (15-120) เลือกตอน gen |
| `schedNoDoctorRequired` | checkbox "ไม่ต้องพบแพทย์" |
| `schedShowFrom` | 'today' หรือ 'tomorrow' — แสดงคิวตั้งแต่วันนี้/พรุ่งนี้ |
| `schedEndDay` | 'YYYY-MM-DD' วันสิ้นสุดของลิงก์ (default = วันสุดท้ายของเดือนสุดท้าย) |
| `schedManualBlocked` | array ของ { date, startTime, endTime } slots ที่ปิด manual |
| `schedBlockingDay` | วันที่กำลังเลือก block slots (null = ไม่ได้เลือก) |
| `schedList` | array ของ schedule docs ทั้งหมด (subscribe) |
| `schedPrefsLoaded` | boolean โหลด prefs จาก Firestore แล้ว |
| `apptAutoSyncedRef` | ref: auto-sync ±1 เดือนแล้วหรือยัง |
| `apptSyncedMonthsRef` | ref Set: เดือนที่ lazy sync แล้ว |

### Flow
1. Admin กดปุ่ม "สร้างลิงก์" ใน appointment tab header
2. Modal: เลือกเดือน + จำนวนเดือน + toggle วันหมอเข้า/ปิด (cycle: ปกติ→หมอเข้า→ปิด, save ทันที)
3. เลือก slot interval (15min-2hr) + checkbox "ไม่ต้องพบแพทย์"
4. Manual block: กดวันที่ → เลือก 15-min slots ที่ต้องการปิด
5. กด "Sync + สร้างลิงก์" → sync appointments ทุกเดือน → สร้าง clinic_schedules/{token}
6. แสดง QR + URL ให้ copy
7. Schedule list แสดงนอก modal: copy/toggle enable/delete

### Key Functions
- `toggleDay(dateStr)` — cycle ปกติ→หมอเข้า→ปิด + save to Firestore immediately
- `saveSchedulePrefs()` — save prefs including `customDoctorHours` to Firestore
- `handleGenScheduleLink()` — sync all months + create schedule doc (saves doctorStartTime/End + customDoctorHours + selectedDoctorId/Name). bookedSlots filtered: พบแพทย์→per-doctor, ไม่พบแพทย์→all assistants combined
- `updateActiveSchedules()` — refresh bookedSlots in all active non-expired schedule docs (called after sync)
- `handleToggleSchedule(id)` / `handleDeleteSchedule(id)` — จัดการลิงก์

---

## 📄 src/pages/PatientForm.jsx

### Theme: Fire/Ember Dark + Sakura Light
- **isDark** computed boolean (เหมือน PatientDashboard/ClinicSchedule)
- **Hero**: red-black gradient `#1a0000 → #0a0a0a → #200000` (dark) / sakura pink (light)
- **Form body**: ember gradient `#0a0a0a → #0d0500` (dark) / pink-white (light)
- **Sections**: glassmorphism-inspired with `backdrop-filter: blur(12px)`, ember/sakura glass tints
- **Status screens** (invalid/expired/closed/success): themed backgrounds matching fire/sakura
- **CSS classes**: `pf-hero`, `pf-body`, `pf-section`, `pf-reason-card`, `pf-radio-card`, `pf-submit` — all in index.css

### Props
```js
{ db, appId, user, sessionId, isSimulation, onBack, clinicSettings, theme, setTheme }
```

### State (บรรทัด 19-29)
| State | คำอธิบาย |
|-------|-----------|
| `formData` | form values ทั้งหมด (defaultFormData) |
| `language` | 'th' / 'en' — ภาษา UI |
| `isSubmitting` | กำลัง submit |
| `sessionExists` | session มีอยู่ใน Firestore ไหม |
| `isExpired` | session หมดอายุ (2 ชม.) — แสดง UI "หมดอายุ" |
| `isClosed` | session ถูก admin archive — แสดง UI "คลินิกปิดคิวนี้แล้ว" (Lock icon) |
| `isSuccess` | submit สำเร็จ |
| `isEditing` | กำลัง edit หลัง submit |
| `sessionType` | 'intake' / 'followup_ed' / 'followup_adam' / 'followup_mrs' / 'custom' |
| `customTemplate` | template object สำหรับ custom form |

### useEffects
| บรรทัด | ทำอะไร |
|--------|---------|
| 30-38 | แปลงปีเกิด BE↔CE เมื่อ language เปลี่ยน |
| 40-73 | `onSnapshot` session doc — load data, check expire, check isArchived → setIsClosed, set sessionType |

### Functions
| Function | บรรทัด | คำอธิบาย |
|----------|--------|-----------|
| `handleInputChange(e)` | 76 | generic input handler (กรอง non-digit สำหรับ phone) |
| `handleCustomCheckboxChange(qId, option)` | 88 | toggle checkbox สำหรับ custom form |
| `handleReasonToggle(reason)` | 96 | toggle visitReasons array |
| `handleHowFoundUsToggle(channel)` | 103 | toggle howFoundUs array |
| `handleGoalToggle(goal)` | 110 | toggle hrtGoals array |
| `handleDobChange(e)` | 117 | update DOB + auto-calculate age |
| `handleSubmit(e)` | 137 | validate + updateDoc Firestore |

### handleSubmit validation order (บรรทัด 141-180)
1. (intake only) `howFoundUs` ต้องเลือก ≥1
2. (intake only) `visitReasons` ต้องเลือก ≥1
3. (intake only) ถ้าเลือก HRT ต้องมี `hrtGoals` ≥1
4. (intake only) validate เบอร์โทร (Thai 10 digit หรือ international)
5. (intake/custom) validate อายุตรงกับวันเกิด
6. `updateDoc` → `{status:'completed', patientData:formData, submittedAt/updatedAt: serverTimestamp(), isUnread:true}`

### Firestore write on submit (บรรทัด 184-186)
```js
updateDoc(sessionRef, {
  status: 'completed',
  patientData: formData,
  [isEditing ? 'updatedAt' : 'submittedAt']: serverTimestamp(),
  isUnread: true
})
```

### Form sections rendered (intake)
1. ข้อมูลส่วนตัว (prefix, name, gender, DOB, age, address)
2. ข้อมูลการติดต่อ (phone, emergency contact)
3. สาเหตุที่มา (visitReasons multi-select)
4. HRT goals (ถ้าเลือก HRT)
5. โรคประจำตัว (hasUnderlying + checkboxes)
6. ยาที่ใช้ / การตั้งครรภ์
7. แบบคัดกรอง (ADAM/IIEF/PE ถ้าเลือก ED; MRS ถ้าเลือก HRT female)
8. **รู้จักคลินิกได้อย่างไร** (howFoundUs multi-select — REQUIRED)
9. Submit button

### LanguageToggle component (บรรทัด 195)
Inline component ด้านบนขวา — สลับ TH/EN

---

## 📄 src/components/ClinicLogo.jsx

### Props
| Prop | Default | คำอธิบาย |
|------|---------|-----------|
| `className` | `"py-4"` | class สำหรับ img/div wrapper |
| `showText` | `true` | แสดง subtitle |
| `forceLight` | `false` | ใช้ใน dark overlay → invert logo |
| `printMode` | `false` | ใช้ใน print → ไม่ filter |
| `clinicSettings` | `null` | ถ้า null ใช้ DEFAULT |
| `center` | `false` | center text logo |

### Logic
1. ถ้า `logoUrl` ตั้งไว้ → แสดง custom logo
2. ถ้าไม่มี → ลอง `/logo.jpg`
3. ถ้า error → แสดง text logo จาก clinicName

---

## 📄 src/hooks/useTheme.js

- `THEME_KEY` = `'app-theme'` (localStorage key)
- `THEMES` = [{value:'dark'|'light'|'auto', label, icon}]
- `useTheme()` → `{theme, resolvedTheme, setTheme}`
- set `data-theme` attribute บน `<html>` เมื่อเปลี่ยน

---

## 🎨 Theme & Color System

- CSS var `--accent` = accent color hex (เช่น `#dc2626`)
- CSS var `--accent-rgb` = "220,38,38"
- CSS var `--bg-base`, `--tx-heading` etc. — defined ใน index.css ตาม `data-theme`
- `applyThemeColor(hex)` ใน utils.js — set CSS vars
- ถูกเรียกจาก App.jsx ทุกครั้งที่ clinic_settings เปลี่ยน

---

## 🗝️ Key Design Decisions

0. **Push Notification flow** — Patient submits → Firestore `isUnread: false→true` → Cloud Function triggers → sends FCM multicast → admin device receives push (แม้หน้าจอล็อค). Admin กด push → เปิดแอป. iOS ต้องติดตั้ง PWA ก่อน (iOS 16.4+, Add to Home Screen in Safari)
1. **Soft delete** — sessions ที่มี patientData → archive (isArchived:true), ไม่ deleteDoc
2. **Auto-cleanup** — ทำใน onSnapshot callback ของ AdminDashboard (ไม่มี background job)
3. **Notification sound** — ดังเฉพาะ `isUnread: false→true` หรือ patientData เปลี่ยนขณะ isUnread:true
4. **isUnread badge** — แสดงบน "หน้าคิว" nav tab (ไม่แสดงบน "ประวัติ")
5. **QR/Link** — ใช้ `window.location.origin + ?session=ID`, QR ผ่าน qrserver.com API
6. **No IIFE in JSX** — Vite OXC parser ไม่รองรับ IIFE ใน JSX → ใช้ pre-computed variables แทน
7. **howFoundUs** — required field สุดท้ายใน intake form, multi-select; แสดงใน session detail viewer (Globe icon, blue chips)
8. **Bilingual** — PatientForm รองรับ TH/EN, default EN สำหรับแพทย์
9. **isClosed vs isExpired** — PatientForm ใช้ 2 state แยก: `isClosed` (admin archive) แสดง Lock icon + "คลินิกปิดคิวนี้แล้ว"; `isExpired` (2 ชม.) แสดง TimerOff + "หมดอายุ"; render isClosed ก่อน isExpired
10. **Timestamps in tables** — Queue table: QR time (QrCode icon, gray) ใน col 1; submit/edit time (CheckCircle2/Edit3, green/blue) ใน status col. History table: 4 timestamps (Gen/กรอก/แก้ไข/เก็บ) ด้วย icons+colors
11. **Deposit isUnread persistence** — deposit sessions: isUnread ไม่ clear เมื่อแค่กดปุ่มตา/edit → clear เฉพาะเมื่อ handleDepositSync หรือ handleResync สำเร็จ (guard: `isDepositKeepUnread = session.formType === 'deposit' && session.isUnread`)
12. **PatientLink cleanup** — เมื่อ OPD หลุด sync (delete, notFound, cancel) → ลบ patientLinkToken ถาวร ลิงก์ใช้ไม่ได้อีก
13. **PatientLink requires OPD** — ปุ่มสร้างลิงก์ดูข้อมูลในหน้าประวัติ แสดงเฉพาะเมื่อ opdRecordedAt + brokerStatus=done
14. **DatePickerThai** — custom component: แสดง DD/MM/YYYY + ไอคอนปฏิทิน, กดแล้วเปิด native calendar picker, value เก็บเป็น YYYY-MM-DD (compatible กับ ProClinic)
15. **API Security (Firebase Auth)** — ทุก `/api/proclinic/*` endpoint ต้องมี `Authorization: Bearer <firebaseIdToken>` header. ตรวจสอบผ่าน `_lib/auth.js` → `verifyAuth()` (เรียก Firebase `accounts:lookup` REST API). brokerClient.js แนบ token อัตโนมัติทุก request
16. **ProClinic credential reload** — เปลี่ยน env vars ใน Vercel แล้วกดปุ่ม "โหลด Credentials ใหม่" ใน ClinicSettingsPanel → เรียก `/api/proclinic/clear-session` → ลบ session cache จาก Firestore → ครั้งถัดไป API จะ login ใหม่ด้วย credentials ใหม่ (ไม่ต้อง redeploy)
17. **Practitioner settings** — ClinicSettingsPanel: ดึงรายชื่อจาก ProClinic (via getDepositOptions) → admin กำหนด role (doctor/assistant/hidden) → save ลง `clinicSettings.practitioners[]`. ใช้สำหรับ filter ปฏิทินนัดหมาย + สร้างลิงก์ตารางรายแพทย์
18. **Chat system** — FB Messenger: full reply + echo support (admin replies show as blue bubbles). LINE: receive only, no reply from app. Saved Replies from FB API with 5-min cache. Badge = unread people count. History 20/page + auto-delete > 7 days
19. **Import from ProClinic** — Search by HN/phone/ID card/name, preview patient data + courses + appointments, duplicate detection with auto-resync for broken sync, creates `IMP-XXXXXX` sessions. Uses `reverseMapPatient()` to map ProClinic fields back to app format
20. **Firestore REST API updateMask** — All `firestorePatch()` calls must include `updateMask.fieldPaths` query params to prevent PATCH from deleting unmentioned fields (REST API quirk: PATCH = replace entire doc without mask)
21. **Per-doctor schedule links** — สร้างลิงก์: พบแพทย์→เลือกแพทย์→bookedSlots เฉพาะคนนั้น, ไม่พบแพทย์→bookedSlots รวมผู้ช่วยทุกคน. ClinicSchedule.jsx ไม่ต้องแก้ (filter ที่ต้นทาง)

---

## ⚠️ จุดระวัง / Known Quirks

- **Vite OXC parser** — ห้ามใช้ `{(() => { ... })()}` IIFE ใน JSX → ใช้ pre-computed var แทน
- **Firestore snapshot fires 2x** สำหรับ write ที่มี `serverTimestamp()` (local estimate + server confirm) → notification logic ต้องตรวจ isUnread ไม่ใช่แค่ patientData
- **isNotifEnabled/notifVolume** ใน dependency array ของ sessions useEffect → ถ้าเปลี่ยน จะ re-subscribe onSnapshot (prevSessionsRef ยังคงเดิม)
- **Notification detection** ครอบคลุม queue + noDeposit sessions ผ่าน `allNotifData = [...data, ...ndData]` → prevSessionsRef เก็บทั้ง 2 tab
- **Phone validation** — Thai domestic: `/^0\d{9}$/`, international: แค่กรอง non-digit
- **DOB year** — BE (พ.ศ.) ถ้า year > 2400, CE (ค.ศ.) ถ้า year < 2400
- **logo.jpg** — เก็บไว้ที่ `/public/logo.jpg`
- **Missing icon import → black screen** — ถ้า import lucide-react icon ขาด จะเกิด JS runtime error → component crash → จอดำ; ตรวจ import ก่อนเสมอ
- **Archive link fix** — PatientForm ตรวจ `data.isArchived` ใน onSnapshot → setIsClosed(true) และ return ทันที ป้องกันการกรอกซ้ำ
- **VAPID Key** — ต้อง generate ใน Firebase Console → Project Settings → Cloud Messaging → Web Push certificates → Generate key pair แล้วใส่ใน `VAPID_KEY` constant ใน AdminDashboard.jsx
- **API Auth required** — ทุก `/api/proclinic/*` endpoint ต้องมี Firebase Auth token. ถ้าเพิ่ม endpoint ใหม่ต้อง import `verifyAuth` จาก `_lib/auth.js` เสมอ
- **Firestore REST API updateMask** — `firestorePatch()` ใน serverless functions (facebook.js, send.js) ต้องใส่ `updateMask.fieldPaths` ใน query string เสมอ ไม่งั้น PATCH จะลบ field ที่ไม่ได้ส่งไป (REST API PATCH = replace entire doc)
- **Chat echo dedup** — facebook.js webhook ใช้ `OUR_APP_ID` เช็ค echo events เพื่อ skip echoes จาก app อื่น
- **Chat LINE limitation** — LINE ไม่มี echo API และตอบจากแอปเราไม่ได้ → ChatPanel แสดง disclaimer + ซ่อน reply input
- **Chat saved replies cache** — 5-min cache ใน ChatPanel เพื่อลด API calls ไปยัง FB saved_message_responses
- **Import duplicate detection** — Import from ProClinic ตรวจ HN/phone/ID card ซ้ำก่อนสร้าง session ใหม่ ถ้าเจอ broken sync → auto-resync แทนสร้างใหม่
- **Cloud Functions deploy** — `cd F:\LoverClinic-app\functions && npm install` แล้ว `firebase deploy --only functions` จาก root
- **iOS Push** — ต้องใช้ iOS 16.4+, เปิดจาก Safari แล้ว Share → "เพิ่มลงหน้าจอ (Add to Home Screen)" ก่อนถึงจะรับ push ได้
- **FCM token lifecycle** — token เก็บใน Firestore `push_config/tokens`, auto-cleanup เมื่อ invalid (Cloud Function ทำ)

---

## 🔌 Cookie Relay Extension (cookie-relay/)

### ภาพรวม
Chrome Extension MV3 ที่ sync ProClinic httpOnly cookies → Firestore + auto-login เมื่อ session หมดอายุ
- ProClinic มี reCAPTCHA v3 → server login ทำไม่ได้ → ต้องใช้ browser จริง
- **ไม่มี auto-deploy** — ต้อง reload ที่ `chrome://extensions` เอง
- **Reload เมื่อแก้**: `background.js`, `manifest.json`, `content-loverclinic.js`
- **ไม่ต้อง reload เมื่อแก้**: `popup.html`, `popup.js`

### Files
| ไฟล์ | หน้าที่ |
|------|--------|
| `manifest.json` | MV3 config, permissions: cookies/scripting/tabs/storage |
| `background.js` | Service Worker — syncCookies(), autoLogin(), doLogin(), message handlers |
| `content-loverclinic.js` | Bridge webapp ↔ extension (postMessage ↔ chrome.runtime.sendMessage) |
| `popup.html/js` | UI ตั้ง credentials + manual sync |

### Credentials (อัตโนมัติ)
```
Vercel env vars → /api/proclinic/credentials → webapp → LC_SET_CREDENTIALS → chrome.storage.local
```

### Cookie Sync
```
syncCookies():
  chrome.cookies.getAll({ domain: '.proclinicth.com' })
  → ใช้ origin จาก credentials (ไม่ใช่ cookie domain!)
  → PATCH Firestore: clinic_settings/proclinic_session
```

### Auto-login
```
autoLogin():
  1. chrome.windows.create({ type: 'popup' }) → chrome.windows.update({ state: 'minimized' })
  2. waitForTabLoad → executeScript(doLogin) → click #form-submit button
  3. waitForLoginRedirect (non-/login URL) → syncCookies()
```

## 🔌 Legacy: Broker Extension (broker-extension/) — ⚠️ DEPRECATED
ไม่ใช้แล้ว — ถูกแทนที่ด้วย API layer + cookie-relay/ ห้ามอ้างอิง

### ProClinic URL
```
const PROCLINIC_ORIGIN     = 'https://trial.proclinicth.com'
const PROCLINIC_CREATE_URL = ORIGIN + '/admin/customer/create'
const PROCLINIC_LIST_URL   = ORIGIN + '/admin/customer'
```

### Firestore broker fields (เพิ่มใน opd_sessions)
```
brokerStatus: null | 'pending' | 'done' | 'failed'
brokerProClinicId: string | null    // ProClinic customer ID (numeric)
brokerProClinicHN: string | null    // HN เช่น "000485" — ไม่เปลี่ยน ใช้ค้นหา
brokerError: string | null
opdRecordedAt: ISO string | null    // เวลาบันทึก OPD ครั้งแรก
brokerFilledAt: ISO string | null   // เวลา fill ล่าสุด
brokerLastAutoSyncAt: ISO string | null  // เวลา auto-sync ล่าสุด
```

### Message Types
| Type | ทิศทาง | คำอธิบาย |
|------|--------|-----------|
| `LC_FILL_PROCLINIC` | Page → Extension | สร้างลูกค้าใหม่ใน ProClinic |
| `LC_DELETE_PROCLINIC` | Page → Extension | ลบลูกค้าออกจาก ProClinic |
| `LC_UPDATE_PROCLINIC` | Page → Extension | แก้ไขข้อมูลลูกค้าใน ProClinic (auto-sync) |
| `LC_OPEN_EDIT_PROCLINIC` | Page → Extension | เปิดหน้า edit ProClinic (manual) |
| `LC_BROKER_RESULT` | Extension → Page | ผล create |
| `LC_DELETE_RESULT` | Extension → Page | ผล delete |
| `LC_UPDATE_RESULT` | Extension → Page | ผล update |
| `LC_GET_STATUS` | Popup → Extension | ขอ statusMap |
| `LC_CLEAR_STATUS` | Popup → Extension | clear statusMap |

### background.js — Architecture

**Serial Queue** (ป้องกัน race condition บน shared ProClinic tab)
```js
enqueueProClinic(fn)  // ทุก handler ต้องผ่านนี้
```

**Tab Management**
```js
getOrCreateProclinicTab()      // หา/สร้าง ProClinic tab + รอ login check
navigateAndWait(tabId, url, delayMs=800, timeoutMs=15000)
  // ⚠️ ตั้ง listener ก่อน navigate เสมอ — ป้องกัน race condition
waitForTabReady(tabId)         // รอ tab ที่กำลัง loading
```

**CREATE Flow** (`handleFillRequest`)
```
1. navigateAndWait(createURL)
2. executeScript(fillAndSubmitProClinicForm)  ← click submit หลัง 400ms
3. waitForNavAwayFromCreate  ← รอ navigation event ถัดไป (NEXT event, ไม่ใช่ current state)
4. check !url.includes('/create') → extract proClinicId จาก URL
5. navigateAndWait(editURL)  ← เพื่อดึง HN
6. executeScript: document.querySelector('input[name="hn_no"]')?.value
7. reportBack LC_BROKER_RESULT { proClinicId, proClinicHN }
```

**UPDATE Flow** (`handleUpdateRequest`) — ⚠️ FETCH-BASED (ไม่ navigate tab!)
```
1. searchAndResolveId(HN → phone → name)
2. navigateAndWait(editURL)  ← แค่ดึง CSRF + form values
3. executeScript(submitProClinicEditViaFetch)
   → FormData(form) เพื่อเก็บ hidden fields ทั้งหมด
   → override: prefix, firstname, lastname, telephone_number, gender, note
   → fetch PUT redirect:'manual'
   → type==='opaqueredirect' → SUCCESS ✓ (server sent 302)
   → type==='basic' status 200 → FAIL (validation error, no redirect)
4. reportBack LC_UPDATE_RESULT
```
> ⚠️ ProClinic ALWAYS redirects กลับ /edit หลัง save สำเร็จ — ตรวจ URL ไม่ได้!
> ใช้ `redirect:'manual'` + ตรวจ response.type แทน

**DELETE Flow** (`handleDeleteRequest`)
```
1. searchAndResolveId ถ้าไม่มี proClinicId
2. navigateAndWait(listURL)  ← ดึง CSRF
3. executeScript: fetch POST _method=DELETE + check res.ok
4. reportBack LC_DELETE_RESULT
```

**Search Flow** (`searchAndResolveId`)
```
Round 1: HN search  → searchProClinicCustomers(HN) → เอาตัวแรก (HN unique)
Round 2: Phone      → searchProClinicCustomers(phone) → findBestMatch
Round 3: Name       → searchProClinicCustomers("firstname lastname") → findBestMatch
→ throw ถ้าไม่เจอ

searchProClinicCustomers:
  navigateAndWait(searchURL, 1200ms)  ← 1200ms รอ DOM render
  executeScript(extractCustomersFromSearchResults)
  → returns [{id, name, phone}]
```

### ProClinic DOM Selectors (สำคัญ)
```js
// Customer ID จาก list
'button.btn-delete[data-url]'  // data-url="/admin/customer/{id}"

// HN (อยู่ที่ edit page เท่านั้น)
'input[name="hn_no"]'  // value เช่น "000485"

// CSRF
'meta[name="csrf-token"]'

// Edit form
'form'  // form แรกในหน้า
```

### ProClinic Form Fields (PUT /admin/customer/{id})
ดูจาก FormData(form) จริงๆ มี fields เยอะมาก key ที่เราแตะ:
```
prefix, firstname, lastname, telephone_number, gender, note
_method=PUT, _token={csrf}  ← ต้องมีเสมอ
hn_no  ← ห้ามแตะ! ProClinic กำหนดเอง
```
ที่เหลือ (address, citizen_id ฯลฯ) → อ่านจาก FormData(form) แล้วส่งต่อเลย

### AdminDashboard.jsx — Broker Logic (Server API only, no Extension)

**Auto-sync Trigger** (ใน Firestore onSnapshot ~line 263)
```js
if (
  oldStr !== newStr              // patientData เปลี่ยน
  && newS.brokerStatus === 'done'
  && newS.brokerProClinicId
  && oldS.brokerStatus === 'done'          // ป้องกัน sync ตอน pending→done
  && oldS.brokerProClinicId === newS.brokerProClinicId  // ป้องกัน sync ตอน ID set ใหม่
  && lastAutoSyncedStrRef.current[newS.id] !== newStr  // ป้องกัน re-trigger ด้วย data เดิม
) {
  lastAutoSyncedStrRef.current[newS.id] = newStr;
  → broker.updateProClinic(proClinicId, proClinicHN, patient)  // Server API
}
```
> `lastAutoSyncedStrRef` = `useRef({})` → sessionId → JSON.stringify(patientData) ที่ sync ล่าสุด
> ป้องกัน snapshot ที่ Firestore batch เข้าด้วยกัน (เช่น `isUnread=false` + broker update)
> ทำให้ prevRef มี patientData เก่า → guard oldStr !== newStr ผ่าน → re-trigger

**Banner Logic** (useEffect ~line 332) — ⚠️ ต้องไม่ evaluate banner ขณะ brokerChanged
```js
const brokerChanged = brokerFields.some(k => viewingSession[k] !== latestSession[k]);
if (brokerChanged) {
  setViewingSession(latestSession);  // รอ render ถัดไป (ป้องกัน flash + banner ค้าง)
} else {
  dataOutOfSync ? setHasNewUpdate(true) : setHasNewUpdate(false);
}
// → Banner หายอัตโนมัติหลัง auto-sync สำเร็จ
```

**brokerFields ที่ sync อัตโนมัติ**:
```js
['brokerStatus','brokerProClinicId','brokerProClinicHN','brokerError',
 'opdRecordedAt','brokerFilledAt','brokerLastAutoSyncAt','depositProClinicId']
```

**OPD Button States**
```js
isDone    = !isPending && !!session.opdRecordedAt && session.brokerStatus === 'done'
isPending = brokerPending[id] || session.brokerStatus === 'pending'
isFailed  = !isPending && !isDone && session.brokerStatus === 'failed'
// disabled={isPending || isDone}  ← ป้องกัน double-click

// Deposit hasOPD (ใช้ brokerProClinicId แทน opdRecordedAt เพราะ serverTimestamp null ใน first snapshot):
hasOPD = !!session.brokerProClinicId && session.brokerStatus === 'done'
```

### Deposit Booking System (จองมัดจำ)

**Flow**: สร้างคิวจอง → ลูกค้าสแกน QR กรอกประวัติ → Admin ตรวจสอบ → กดบันทึกลง ProClinic (manual only)

**Session filtering** (onSnapshot handler):
```
allDocs → filter:
├── sessions         → !isArchived && !deposit-pending && !noDeposit-pending (+ timeout check)
├── archivedSessions → isArchived && !(deposit && !serviceCompleted) && !(isPermanent && !deposit && !serviceCompleted)
├── depositSessions  → formType === 'deposit' && !isArchived && !serviceCompleted
├── archivedDepositSessions → formType === 'deposit' && isArchived
├── noDepositSessions → isPermanent && formType !== 'deposit' && !serviceCompleted && !isArchived
└── archivedNoDepositSessions → isPermanent && formType !== 'deposit' && !serviceCompleted && isArchived
```
> Note: deposit sessions ที่ serviceCompleted แสดงในคิว (sessions) ไม่ใช่ deposit tab
> Note: noDeposit sessions ที่ "ลูกค้าเข้ารับบริการ" → serviceCompleted=true, isPermanent=false → ย้ายไปคิวเป็น 2hr timed

**Auto-sync guard**: `newS.formType !== 'deposit'` — ป้องกัน auto-sync สำหรับ deposit sessions

**"บันทึกลงการจอง" (handleDepositSync)** — Two-step manual:
```
First time:
  Step 1: fillProClinic(patient) → ได้ proClinicId + HN → set brokerStatus:'done'
  Step 2: submitDeposit(proClinicId, proClinicHN, deposit) → set depositSyncStatus:'done' + depositProClinicId
Re-sync (ลูกค้าแก้ข้อมูล):
  Step 1: updateProClinic(proClinicId, proClinicHN, patient) → update OPD data
  Step 2: updateDeposit(proClinicId, proClinicHN, depositProClinicId, deposit) → update deposit
  → clears isUnread after success
```

**Deposit re-sync trigger**: `dataUpdated = hasOPD && hasDeposit && session.isUnread`
- `hasOPD = !!session.brokerProClinicId && session.brokerStatus === 'done'` (ไม่ใช้ opdRecordedAt เพราะ serverTimestamp null ใน first snapshot)
- ปุ่มเปลี่ยนเป็นสีเหลือง + animate-pulse เมื่อ dataUpdated
- isUnread ไม่ clear เมื่อกดดูข้อมูล (ตา/edit) → clear เฉพาะเมื่อ handleDepositSync หรือ handleResync สำเร็จ

**"ยกเลิกการจอง" (handleDepositCancel)**:
```
cancelDeposit(proClinicId, proClinicHN) → cancel deposit + delete customer in ProClinic → archive + clear patientLink
```

**"ลูกค้าเข้ารับบริการ"**: sets `serviceCompleted:true, isPermanent:false, createdAt:serverTimestamp()` → ย้ายจาก deposit tab เข้า queue (แปลงเป็น 2-hour link) พร้อม QR code + tag "จองมัดจำ"

**Deposit eye/edit button**:
- แสดง Edit3 icon เมื่อรอ patient data, Eye icon เมื่อ data submitted
- สามารถดู/แก้ deposit data ได้แม้ patient ยังไม่กรอกฟอร์ม
- Viewer: "รอลูกค้ากรอกข้อมูล..." เมื่อไม่มี patientData, toolbar+grid+clinical summary ซ่อน
- ใช้ `d = viewingSession.patientData || {}` ป้องกัน crash + grid ซ่อนด้วย `style={display:'none'}` (OXC workaround)

**Deposit data editing**: When admin edits deposit data in viewing modal and session already synced → auto calls `updateDeposit()` to sync changes to ProClinic via `#editDepositModal` PUT
- Archived deposit sessions: ซ่อนปุ่ม "แก้ไขข้อมูล", "Resync ProClinic", "แก้ไข" ในส่วน deposit info

**Deposit confirm modal**: ทุกปุ่ม action (ลบ/ยกเลิก/เข้ารับบริการ) ใช้ styled modal แทน `window.confirm()`
- State: `depositToDelete = { session, action }` — red สำหรับ archive/cancel, blue สำหรับ complete
- แสดงชื่อลูกค้า + matching style กับ queue delete modal

**PatientLink cleanup**: เมื่อ OPD หลุด sync → clear `patientLinkToken: null, patientLinkEnabled: false`
- Flows ที่ trigger: handleOpdClick notFound, handleResync notFound, delete ProClinic, deposit cancel

**DatePickerThai component**: `function DatePickerThai({ value, onChange, className, placeholder })`
- แสดง DD/MM/YYYY readonly + Calendar icon, hidden `<input type="date">` opens on click
- value เก็บเป็น YYYY-MM-DD → compatible กับ ProClinic
- ใช้ใน deposit form (สร้าง + แก้ไข) ทั้ง depositDate และ appointmentDate

**brokerClient** (`src/lib/brokerClient.js`):
- `apiFetch(endpoint, body)` — internal helper, auto-attaches Firebase Auth token (`Authorization: Bearer`)
- ถ้า user ไม่ได้ login หรือ token หมดอายุ → return `{ success: false, error }` ไม่ยิง request
- **Auto-retry via extension**: เมื่อ `extensionNeeded:true` → send credentials + request sync → retry (timeout 30s)

```js
// CRUD
fillProClinic(patient)                                 // POST create customer
updateProClinic(proClinicId, proClinicHN, patient)     // POST update customer
deleteProClinic(proClinicId, proClinicHN, patient)     // POST delete customer
searchCustomers(query)                                 // POST search
getCourses(proClinicId)                                // POST get courses
testLogin()                                            // POST test login
// Import
fetchPatientFromProClinic(proClinicId)                   // POST fetchPatient → full patient data
// Deposit
getDepositOptions()                                    // GET dropdown options
submitDeposit(proClinicId, proClinicHN, deposit)       // POST new deposit
updateDeposit(proClinicId, proClinicHN, depositProClinicId, deposit) // PUT existing
cancelDeposit(proClinicId, proClinicHN)                // POST cancel + DELETE customer
// Appointments
syncAppointments(month)                                // POST sync appointments for YYYY-MM → Firestore
fetchAppointmentMonths(year)                           // POST get appointment counts per month
// Master Data Sync
syncProducts()                                         // POST sync products from ProClinic
syncDoctors()                                          // POST sync doctors from ProClinic
syncStaff()                                            // POST sync staff from ProClinic
syncCourses()                                          // POST sync courses from ProClinic
// Admin
clearProClinicSession()                                // POST clear session cache
getProClinicCredentials()                              // GET credentials for extension
// Extension helpers
sendMessageToExtension(type, extra)                    // postMessage bridge (timeout 30s)
requestExtensionSync(forceLogin)                       // LC_SYNC_COOKIES
ensureExtensionHasCredentials()                        // fetch credentials → send to extension
```

**ProClinic deposit endpoints** (discovered via debug scraping):
- Create: POST `/admin/deposit` — `#createDepositModal` (62 fields)
- Edit: POST `/admin/deposit` with `_method=PUT` — `#editDepositModal` (12 fields)
- Cancel: POST `/admin/deposit/cancel` — `#cancelDepositModal` (deposit_id + cancel_note)

### Bug History (Broker Extension)
| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Extension ไม่เปิด ProClinic tab ได้ | race condition: navigate เร็วกว่า listener | `navigateAndWait` ตั้ง listener ก่อน navigate |
| Search ไม่เจอเมื่อชื่อ+เบอร์เปลี่ยน | ไม่มี unique key ค้นหา | ดึง HN หลัง create, store `brokerProClinicHN`, ใช้ search |
| Update → button แดงเสมอแม้ save สำเร็จ | ProClinic redirects กลับ /edit เสมอ | เปลี่ยนเป็น fetch + `redirect:'manual'` + ตรวจ `type==='opaqueredirect'` |
| ProClinic refresh รัวๆ → CAPTCHA | URL-based detect บังคับ navigate 3 ครั้ง | fetch approach → navigate tab แค่ 1 ครั้ง (ดึง CSRF เท่านั้น) |
| Banner "มีข้อมูลอัปเดต" ไม่หาย | ไม่มีโค้ด clear banner | brokerChanged → skip → render ถัดไป clear อัตโนมัติ |
| Auto-sync fire ซ้ำหลัง create | guard `oldS.brokerProClinicId === newS.brokerProClinicId` ขาด | เพิ่ม guard ใน onSnapshot |
| Auto-sync รัวๆ หลังกด Report | Firestore อาจ batch snapshot (isUnread=false + broker update) ทำให้ prevRef stale | `lastAutoSyncedStrRef` track patientData ที่ sync แล้ว → skip ถ้า data เดิม |
| กดปุ่มแดง (retry) → สร้างคนใหม่ใน ProClinic | `handleOpdClick` ส่ง `LC_FILL_PROCLINIC` เสมอ แม้ผู้ป่วยมี HN อยู่แล้ว | ถ้า `brokerProClinicId \|\| brokerProClinicHN` มีอยู่ → ส่ง `LC_UPDATE_PROCLINIC` แทน |
| กดปุ่มแดง retry → spinner ไม่หาย | `LC_UPDATE_RESULT` handler ไม่ clear `brokerPending` / timeout | เพิ่ม `clearTimeout` + `setBrokerPending(...)` ใน `LC_UPDATE_RESULT` handler |
