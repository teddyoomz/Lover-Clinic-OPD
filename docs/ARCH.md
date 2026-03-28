# Architecture — LoverClinic OPD System

> Stack: React 19 + Vite 8 + Firebase 12 (Firestore + FCM) + Tailwind 3.4 + Cloud Functions v2
> Firebase Project: `loverclinic-opd-4c39b` | Deploy: Vercel
> อัพเดทล่าสุด: 2026-03-28

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
│   └── proclinic_session       — ProClinic cookies cache (origin, cookies[], source)
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
| `LC-XXXXXX` | intake ทั่วไป (prefix ตาม clinic name) |
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

## 🤖 Broker (ProClinic Auto-sync) Flow

```
PatientForm submit / admin กดปุ่ม / แก้ข้อมูล
  → AdminDashboard: broker.fillProClinic(patient) / broker.updateProClinic(...)
  → brokerClient.js: apiFetch → POST /api/proclinic/{action}
  → Vercel Serverless: createSession() → scrape ProClinic with cheerio
  → return JSON { success, proClinicId, proClinicHN }
  → AdminDashboard: updateDoc { brokerStatus:'done', ... }
```

### Cookie Relay (เมื่อ server login ล้มเหลว)
```
API returns extensionNeeded:true (ProClinic reCAPTCHA)
  → brokerClient: send credentials to cookie-relay extension
  → extension: autoLogin (minimized window → fill form → click submit → sync cookies)
  → brokerClient: retry API call → server uses synced cookies → success
```

ดูรายละเอียดใน `docs/EXTENSION.md` (Cookie Relay) และ `docs/API.md`

---

## 🌐 API Layer (Vercel Serverless)

```
brokerClient.js → fetch /api/proclinic/{action} → Vercel Serverless Function
  → createSession() (HTTP login + Firestore cookie cache)
  → scrape ProClinic with cheerio
  → return JSON { success, notFound?, sessionExpired? }
```

| Endpoint | คำอธิบาย |
|----------|-----------|
| `create` | สร้าง customer ใหม่ → return proClinicId + HN |
| `update` | แก้ไข customer (resolve by ID/HN/phone/name) |
| `delete` | ลบ customer (verify existence → notFound if deleted) |
| `courses` | ดึง courses + appointments |
| `search` | ค้นหา customers |
| `login` | ทดสอบ connection |

> ⚠️ ทำงานบน Vercel production เท่านั้น — localhost dev server จะ error (expected)

ดูรายละเอียดใน `docs/API.md`

---

## 🗝️ Key Design Decisions

1. **Soft delete** — session ที่มี patientData → archive (isArchived:true), ไม่ deleteDoc
2. **Auto-cleanup** — ทำใน onSnapshot AdminDashboard (ไม่มี background job)
3. **Notification sound** — ดังเฉพาะ `isUnread: false→true` หรือ patientData เปลี่ยนขณะ isUnread:true
4. **QR/Link** — `window.location.origin + ?session=ID`, QR ผ่าน qrserver.com API
5. **Bilingual** — PatientForm รองรับ TH/EN
6. **isClosed vs isExpired** — PatientForm ใช้ 2 state แยก: `isClosed` (admin archive); `isExpired` (2ชม.)
7. **howFoundUs** — required field สุดท้ายใน intake form, multi-select array
8. **Timestamps** — Queue table: QR time; History: 4 timestamps
9. **AdminDashboard always mounted** — ระหว่าง simulation PatientForm แสดง AdminDashboard ซ่อนด้วย `display:none` เพื่อ Firestore listener ยังทำงาน
10. **Simulation suppressNotif** — simulation จาก QR = `isUnread:true` (แจ้ง + sync); Report edit = `isUnread:false` (ไม่แจ้ง แต่ยัง sync)

---

## ⚠️ Known Quirks

| Quirk | รายละเอียด |
|-------|-----------|
| Vite OXC parser | ห้าม IIFE `{(() => {...})()}` ใน JSX → ใช้ pre-computed var |
| Firestore snapshot 2x | write ที่มี `serverTimestamp()` fires 2 ครั้ง (local + server confirm) — ห้าม compare timestamps |
| Phone validation | Thai: `/^0\d{9}$/`, international: กรอง non-digit เท่านั้น |
| DOB year | BE ถ้า year > 2400, CE ถ้า year < 2400 — background.js แปลงเอง |
| Missing icon import | → JS runtime error → component crash → จอดำ; ตรวจ lucide-react imports ก่อน |
| logo.jpg | เก็บที่ `/public/logo.jpg` |
| Chrome Extension reload | แก้ background.js/manifest.json/content script → reload ที่ chrome://extensions เสมอ |
| ProClinic button type | `type="button"` ไม่ใช่ `type="submit"` → click ปุ่มแทน form.submit() |
| Cookie origin mismatch | cookie domain `.proclinicth.com` ≠ `trial.proclinicth.com` → ใช้ origin จาก credentials |
| Chrome minimized window | `state:'minimized'` ใน windows.create ไม่ work ทุกที → สร้างแล้ว update minimize |
| API extensionNeeded | เมื่อ server login ล้มเหลว → extension auto-login + sync cookies → retry |

---

## 📄 src/utils.js — Functions สำคัญ

| Function | คำอธิบาย |
|----------|-----------|
| `formatBangkokTime(ts)` | Firestore Timestamp → string GMT+7 |
| `calculateADAM(d)` | → {positive, total, text, color, bg} |
| `calculateIIEFScore(d)` | sum iief_1..5 |
| `getIIEFInterpretation(score)` | → {text, color, bg} |
| `calculateMRS(d)` | → {score, text, color, bg} |
| `generateClinicalSummary(d, formType, customTemplate, lang)` | clinical summary text TH/EN — ใช้ generate patient.clinicalSummary ส่งไป ProClinic |
| `getReasons(d)` | แปลง visitReasons[] + other → array of strings |
| `playNotificationSound(volume)` | เล่นเสียง "ดิ๊ง" ด้วย AudioContext |

### defaultFormData fields (utils.js)
```
prefix, firstName, lastName, gender,
dobDay, dobMonth, dobYear, age,
address, phone, isInternationalPhone, phoneCountryCode,
emergencyName, emergencyRelation, emergencyPhone, isInternationalEmergencyPhone, emergencyPhoneCountryCode,
visitReasons[], visitReasonOther,
hrtGoals[], hrtTransType, hrtOtherDetail,
hasAllergies, allergiesDetail,
hasUnderlying, ud_hypertension, ud_diabetes, ud_lung, ud_kidney, ud_heart, ud_blood, ud_other, ud_otherDetail,
currentMedication, pregnancy,
howFoundUs[],
symp_pe, adam_1..10, iief_1..5, mrs_1..11,
assessmentDate
```

---

## 📄 src/App.jsx — Routing Logic

```
isInitializing          → loading screen
sessionFromUrl (?session=) → <PatientForm> (ไม่ต้อง login)
!user || user.isAnonymous  → <AdminLogin>
else                    →
  adminView === 'simulation':
    <div style="display:none"> <AdminDashboard/> </div>   ← always mounted
    <PatientForm isSimulation suppressNotif={simulationSuppressNotif}/>
  else:
    <AdminDashboard onSimulateScan={(id, opts) => ...}/>
```
- `signInAnonymously` อัตโนมัติเมื่อมี session URL + ยังไม่ได้ login
- `onSnapshot clinic_settings/main` → sync clinic settings realtime
- `simulationSuppressNotif` — false = simulation จาก QR (แจ้ง), true = Report edit (ไม่แจ้ง)
