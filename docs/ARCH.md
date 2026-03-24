# Architecture — LoverClinic OPD System

> Stack: React 19 + Vite 8 + Firebase 12 (Firestore + FCM) + Tailwind 3.4 + Cloud Functions v2
> Firebase Project: `loverclinic-opd-4c39b` | Deploy: Vercel

---

## 🔥 Firestore Collection Path

```
artifacts/{appId}/public/data/
├── opd_sessions/{sessionId}    — Session docs
│     fields: status, patientData, createdAt, updatedAt, submittedAt,
│             isUnread, isArchived, archivedAt, isPermanent,
│             formType, customTemplate, sessionName,
│             brokerStatus, brokerProClinicId, brokerProClinicHN,
│             brokerError, opdRecordedAt, brokerFilledAt, brokerLastAutoSyncAt
├── clinic_settings/main        — Clinic config (clinicName, accentColor, logoUrl, clinicSubtitle)
├── form_templates/{id}         — Custom form templates
└── push_config/tokens          — FCM device tokens [{token, userAgent, createdAt}]
```

### appId
- มาจาก `firebase.js` → `app.options.appId`
- ใช้ใน collection path ทุกที่

---

## 📋 Session Lifecycle

```
สร้าง      → status:'pending', patientData:null, isUnread:false
ผู้ป่วยกรอก → status:'completed', patientData:{...}, isUnread:true, submittedAt
แพทย์อ่าน  → isUnread:false
ผู้ป่วยแก้ → patientData:{...new}, isUnread:true, updatedAt
แพทย์อ่าน  → isUnread:false

ลบ (ไม่มีข้อมูล)  → deleteDoc ทันที
ลบ (มีข้อมูล)    → isArchived:true, archivedAt (soft delete → ประวัติ)
ลบถาวรจากประวัติ → deleteDoc
หมดอายุ 2ชม. + ไม่มีข้อมูล → auto deleteDoc (ใน onSnapshot AdminDashboard)
หมดอายุ 2ชม. + มีข้อมูล   → auto isArchived:true
```

### Session ID Prefixes
| Prefix | ประเภท |
|--------|--------|
| `LC-XXXXXX` | intake ทั่วไป |
| `PRM-XXXXXX` | permanent link |
| `FW-ED-XXXXXX` | Follow-up IIEF |
| `FW-AD-XXXXXX` | Follow-up ADAM |
| `FW-MR-XXXXXX` | Follow-up MRS |
| `CST-XXXXXX` | Custom form |

---

## 🔔 Push Notification Flow

```
1. ผู้ป่วย submit form
2. Firestore: isUnread false→true
3. Cloud Function (functions/index.js) triggers on update
4. อ่าน FCM tokens จาก push_config/tokens
5. sendEachForMulticast → admin device รับ push
6. auto-clean invalid tokens
```
- iOS: ต้องติดตั้ง PWA ก่อน (iOS 16.4+, Safari → Share → "เพิ่มลงหน้าจอ")

---

## 🗝️ Key Design Decisions

1. **Soft delete** — session ที่มี patientData → archive (isArchived:true), ไม่ deleteDoc
2. **Auto-cleanup** — ทำใน onSnapshot AdminDashboard (ไม่มี background job)
3. **Notification sound** — ดังเฉพาะ `isUnread: false→true` หรือ patientData เปลี่ยนขณะ isUnread:true
4. **QR/Link** — `window.location.origin + ?session=ID`, QR ผ่าน qrserver.com API
5. **Bilingual** — PatientForm รองรับ TH/EN
6. **isClosed vs isExpired** — PatientForm ใช้ 2 state แยก: `isClosed` (admin archive) แสดง Lock icon; `isExpired` (2ชม.) แสดง TimerOff; render isClosed ก่อน
7. **howFoundUs** — required field สุดท้ายใน intake form, multi-select
8. **Timestamps** — Queue table: QR time (col1); submit/edit time (status col). History: 4 timestamps

---

## ⚠️ Known Quirks

| Quirk | รายละเอียด |
|-------|-----------|
| Vite OXC parser | ห้าม IIFE `{(() => {...})()}` ใน JSX → ใช้ pre-computed var |
| Firestore snapshot 2x | write ที่มี `serverTimestamp()` fires 2 ครั้ง (local + server confirm) |
| Phone validation | Thai: `/^0\d{9}$/`, international: กรอง non-digit เท่านั้น |
| DOB year | BE ถ้า year > 2400, CE ถ้า year < 2400 |
| Missing icon import | → JS runtime error → component crash → จอดำ; ตรวจ lucide-react imports ก่อน |
| logo.jpg | เก็บที่ `/public/logo.jpg` |

---

## 📄 src/utils.js — Functions สำคัญ

| Function | คำอธิบาย |
|----------|-----------|
| `formatBangkokTime(ts)` | Firestore Timestamp → string GMT+7 |
| `calculateADAM(d)` | → {positive, total, text, color, bg} |
| `calculateIIEFScore(d)` | sum iief_1..5 |
| `getIIEFInterpretation(score)` | → {text, color, bg} |
| `calculateMRS(d)` | → {score, text, color, bg} |
| `generateClinicalSummary(d, formType, customTemplate, lang)` | clinical summary text TH/EN |
| `playNotificationSound(volume)` | เล่นเสียง "ดิ๊ง" ด้วย AudioContext |

### defaultFormData fields (utils.js line 48)
`prefix, firstName, lastName, gender, dobDay, dobMonth, dobYear, age, address, phone, isInternationalPhone, phoneCountryCode, emergencyName, emergencyRelation, emergencyPhone, visitReasons[], visitReasonOther, hrtGoals[], hrtTransType, hasAllergies, allergiesDetail, hasUnderlying, ud_*, currentMedication, pregnancy, howFoundUs[], symp_pe, adam_1..10, iief_1..5, mrs_1..11, assessmentDate`

---

## 📄 src/App.jsx — Routing Logic

```
isInitializing          → loading screen
sessionFromUrl (?session=) → <PatientForm> (ไม่ต้อง login)
!user || user.isAnonymous  → <AdminLogin>
else                    → <AdminDashboard> หรือ <PatientForm isSimulation>
```
- `signInAnonymously` อัตโนมัติเมื่อมี session URL + ยังไม่ได้ login
- `onSnapshot clinic_settings/main` → sync clinic settings realtime
