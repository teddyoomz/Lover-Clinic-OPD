# Broker Extension — Chrome Extension MV3

> ไฟล์: `broker-extension/`
> หน้าที่: Bridge ระหว่าง LoverClinic ↔ ProClinic
> **ไม่มี auto-deploy** — ต้อง reload ที่ `chrome://extensions` เอง
> อัพเดทล่าสุด: 2026-03-25

---

## ⚠️ Extension Reload Rules

| เปลี่ยนไฟล์ | ต้อง reload chrome://extensions? |
|------------|----------------------------------|
| `background.js` | ✅ ต้อง reload |
| `manifest.json` | ✅ ต้อง reload |
| `content-loverclinic.js` | ✅ ต้อง reload |
| `popup.html` / `popup.js` | ❌ ไม่ต้อง |

---

## Files

| ไฟล์ | หน้าที่ |
|------|--------|
| `background.js` | Service Worker หลัก — logic ทั้งหมด |
| `content-loverclinic.js` | Bridge บน lover-clinic-app.vercel.app — forward postMessage ↔ extension |
| `manifest.json` | MV3 config, permissions: `tabs, scripting, activeTab, storage, alarms` |
| `popup.html/js` | UI แสดง session status (pending/done/failed) |

---

## ProClinic URLs

```js
PROCLINIC_DEFAULT_ORIGIN = 'https://trial.proclinicth.com'  // เปลี่ยนได้ใน popup settings
PROCLINIC_CREATE_URL = ORIGIN + '/admin/customer/create'
PROCLINIC_LIST_URL   = ORIGIN + '/admin/customer'
PROCLINIC_LOGIN_URL  = ORIGIN + '/login'
// Edit:   ORIGIN + '/admin/customer/{id}/edit'
// Search: ORIGIN + '/admin/customer?search={query}'
```

---

## Session Keepalive

```js
// chrome.alarms ทุก 20 นาที — ป้องกัน ProClinic session หมดอายุ
// Chrome จะปลุก Service Worker เมื่อ alarm ดัง แม้ SW หลับอยู่
chrome.alarms.create('pcKeepalive', { periodInMinutes: 20 });
// → executeScript ping '/admin/api/stat' จาก ProClinic tab (ใช้ credentials ของ tab)
// ⚠️ ต้องมี permission "alarms" ใน manifest.json
```

---

## Auto-login Flow

```
ensureLoggedIn(tabId):
  1. ตรวจ URL — ถ้ามี '/login' → navigateAndWait(PROCLINIC_LOGIN_URL) (clean URL ป้องกัน 404)
  2. doAutoLogin(tabId):
     a. อ่าน pc_email, pc_password จาก chrome.storage.local
     b. fillInput(email) → wait 100ms → fillInput(password) → wait 100ms
     c. tick checkbox (native setter + input/change events)
     d. wait 600ms (reCAPTCHA ต้องใช้เวลา)
     e. click button.btn-primary (ProClinic ใช้ type="button" ไม่ใช่ type="submit")
     f. wait 500ms → waitForTabReady (timeout 10s)
     g. ตรวจ URL: ยังอยู่ /login → throw error
     h. dispatch Escape key (ลอง dismiss Chrome "Change your password" dialog)
```

> **Chrome "Change your password" dialog**: Chrome native UI — dispatch Escape อาจช่วยได้บางกรณี
> วิธีแน่ชัดกว่า: ปิดใน `chrome://password-manager/settings` → "Warn you about password breaches"

---

## Message Types

| Type | ทิศทาง | คำอธิบาย |
|------|--------|-----------|
| `LC_FILL_PROCLINIC` | Page → Extension | สร้างลูกค้าใหม่ใน ProClinic |
| `LC_DELETE_PROCLINIC` | Page → Extension | ลบลูกค้า |
| `LC_UPDATE_PROCLINIC` | Page → Extension | แก้ไขข้อมูล (auto-sync หรือ manual resync) |
| `LC_OPEN_EDIT_PROCLINIC` | Page → Extension | เปิดหน้า edit (ปุ่ม ProClinic icon) |
| `LC_BROKER_RESULT` | Extension → Page | ผล create |
| `LC_DELETE_RESULT` | Extension → Page | ผล delete |
| `LC_UPDATE_RESULT` | Extension → Page | ผล update |
| `LC_GET_COURSES` | Page → Extension | ดึงคอร์ส/บริการคงเหลือจาก ProClinic |
| `LC_COURSES_RESULT` | Extension → Page | ผล courses (courses[], expiredCourses[], patientName) |
| `LC_GET_STATUS` | Popup → Extension | ขอ statusMap |
| `LC_CLEAR_STATUS` | Popup → Extension | clear statusMap |

---

## Serial Queue (ป้องกัน race condition)

```js
// background.js — ทุก handler ต้องผ่าน enqueueProClinic()
const syncInFlightSessions = new Set();  // ⚠️ resets เมื่อ service worker restart

function enqueueProClinic(fn, sessionId = null) {
  if (sessionId && syncInFlightSessions.has(sessionId)) return Promise.resolve();
  if (sessionId) syncInFlightSessions.add(sessionId);
  return new Promise((resolve, reject) => {
    proclinicQueue.push(() => fn().then(resolve, reject)
      .finally(() => { if (sessionId) syncInFlightSessions.delete(sessionId); }));
    drainQueue();
  });
}
// LC_UPDATE_PROCLINIC → enqueueProClinic(fn, msg.sessionId)  // deduplicate by sessionId
// LC_FILL_PROCLINIC   → enqueueProClinic(fn)                 // no sessionId
// LC_GET_COURSES      → enqueueProClinic(fn)                 // no sessionId (read-only)
```

> ⚠️ Chrome MV3 SW อาจ restart ระหว่าง session → `syncInFlightSessions` reset → dedup ไม่ guaranteed
> Guard หลักคือ `lastAutoSyncedStrRef` ใน AdminDashboard (persistent ตลอด session React)

---

## CREATE Flow (`handleFillRequest`)

```
1. getOrCreateProclinicTab() → ensureLoggedIn()
2. navigateAndWait(createURL)
3. executeScript(fillAndSubmitProClinicForm)  — click submit หลัง 400ms
4. waitForNavAwayFromCreate  — รอ navigation event ถัดไป (NEXT event ไม่ใช่ current state)
5. check !url.includes('/create') → extract proClinicId จาก URL
6. navigateAndWait(editURL)  — เพื่อดึง HN
7. executeScript: document.querySelector('input[name="hn_no"]')?.value
8. reportBack LC_BROKER_RESULT { proClinicId, proClinicHN }
   → AdminDashboard: updateDoc { brokerStatus:'done', brokerProClinicId, brokerProClinicHN, opdRecordedAt }
```

---

## UPDATE Flow (`handleUpdateRequest`) — FETCH-BASED ⚡

```
1. ensureLoggedIn()
2. searchAndResolveId(HN → phone → name)
3. navigateAndWait(editURL)  — ดึง CSRF + form values
4. executeScript(submitProClinicEditViaFetch):
   → FormData(form) — เก็บ hidden fields ทั้งหมด (hn_no, customer_id ฯลฯ)
   → override ด้วย patient data (ดู Field Mapping ด้านล่าง)
   → fetch PUT redirect:'manual'
   → response.type==='opaqueredirect' → SUCCESS ✓ (server ส่ง 302)
   → response.type==='basic' status 200 → FAIL (validation error)
5. reportBack LC_UPDATE_RESULT
   → AdminDashboard: updateDoc { brokerStatus:'done', brokerLastAutoSyncAt }
```

> ⚠️ ProClinic ALWAYS redirects กลับ /edit หลัง save — ตรวจ URL ไม่ได้!
> ใช้ `redirect:'manual'` + ตรวจ `response.type` แทน

---

## GET_COURSES Flow (`handleGetCoursesRequest`) — READ-ONLY ⚡

```
1. getOrCreateProclinicTab() → ensureLoggedIn()
2. navigateAndWait('/admin/customer/${proClinicId}')  — หน้าโปรไฟล์ (ไม่ใช่ /edit)
3. executeScript(scrapeProClinicCourses):
   → extractCourses('#course-tab')      — คอร์สคงเหลือ
   → extractCourses('#expired-course-tab') — คอร์สหมดอายุ
   → return { patientName, courses[], expiredCourses[] }
4. reportBack LC_COURSES_RESULT
   → Cloud PC AdminDashboard: getDoc(session) → write latestCourses.jobId = brokerJob.id
   → Firestore onSnapshot บน iPhone: match latestCourses.jobId → update coursesPanel
```

> ⚠️ read-only — ไม่มีการ submit form หรือแก้ไขข้อมูลใดๆ ใน ProClinic
> ⚠️ ต้องอ่าน jobId จาก Firestore (getDoc) ก่อนเขียน latestCourses — ไม่ใช่จาก ref local

### scrapeProClinicCourses selectors

```js
// Tabs
'#course-tab'           // คอร์สคงเหลือ
'#expired-course-tab'   // คอร์สหมดอายุ

// ภายในแต่ละ .card
'li:first-child h6'                         // ชื่อคอร์ส (text node แรก)
'li:first-child p.small.text-gray--2.mb-0'  // วันหมดอายุ
'li:first-child .text-gray-2.small.mt-1'    // มูลค่าคงเหลือ
'li:first-child .badge'                     // สถานะ (active/expired ฯลฯ)
'li:nth-child(2)'                           // ประเภทสินค้า/จำนวน
'li:nth-child(2) .float-end'                // จำนวนคงเหลือ
```

---

## DELETE Flow (`handleDeleteRequest`)

```
1. searchAndResolveId (ถ้าไม่มี proClinicId)
2. navigateAndWait(listURL)  — ดึง CSRF
3. executeScript: fetch POST _method=DELETE
4. reportBack LC_DELETE_RESULT
   → AdminDashboard: updateDoc { brokerProClinicId:null, brokerProClinicHN:null, brokerStatus:null, ... }
```

---

## Search Flow (`searchAndResolveId`)

```
Round 1: HN search   → searchProClinicCustomers(HN) → เอาตัวแรก (HN unique)
Round 2: Phone       → searchProClinicCustomers(phone) → findBestMatch(score)
Round 3: Name        → searchProClinicCustomers("firstname lastname") → findBestMatch(score)
→ throw ถ้าไม่เจอ

findBestMatch scoring:
  phone match = +100 (most reliable)
  name token match = +10 each
  fallback: customers[0] ถ้า score > 0
```

---

## ProClinic Form Field Mapping (ครบทุกช่อง)

> ใช้ทั้ง `fillAndSubmitProClinicForm` (CREATE) และ `submitProClinicEditViaFetch` (UPDATE)

| ProClinic field | name attribute | ที่มา (patient object) | หมายเหตุ |
|----------------|---------------|----------------------|----------|
| คำนำหน้า | `prefix` | `patient.prefix` | validate กับ VALID_PREFIXES ก่อน |
| ชื่อ | `firstname` | `patient.firstName` | |
| นามสกุล | `lastname` | `patient.lastName` | |
| เบอร์ติดต่อ | `telephone_number` | `patient.phone` | |
| เพศ | `gender` | derive จาก prefix (นาย→ชาย, นาง→หญิง ฯลฯ) | |
| วันเกิด | `birthdate` | `patient.dobDay/Month/Year` | BE→CE auto-convert (year>2400 → -543); fallback: age |
| ที่อยู่ | `address` | `patient.address` | |
| ที่มาของลูกค้า | `source` (select) | `patient.howFoundUs[0]` + HOW_MAP | |
| รายละเอียดที่มา | `source_detail` | `patient.howFoundUs.join(', ')` | ทุกค่าที่เลือก |
| อาการที่ต้องรักษา | `symptoms` | `patient.reasons.join(', ')` | |
| โรคประจำตัว | `congenital_disease` | `patient.underlying` | pmh string |
| ประวัติแพ้ยา | `history_of_drug_allergy` | `patient.allergies` | |
| หมายเหตุ | `note` | `patient.clinicalSummary` | Clinical Summary ภาษาไทยเต็มๆ |
| ผู้ติดต่อ ชื่อ | `contact_1_firstname` | `patient.emergencyName` | |
| ผู้ติดต่อ นามสกุล | `contact_1_lastname` | `patient.emergencyRelation` | ใส่ความสัมพันธ์ (ProClinic ไม่มีช่อง relation) |
| ผู้ติดต่อ เบอร์ | `contact_1_telephone_number` | `patient.emergencyPhone` | |

### HOW_MAP (howFoundUs → source dropdown value)
```js
'Facebook'         → 'Facebook'
'Google'           → 'Google'
'Line'             → 'Line'
'AI'               → 'ChatGPT'
'ป้ายตามที่ต่างๆ' → 'อื่นๆ'
'รู้จักจากคนรู้จัก' → 'เพื่อนแนะนำ'
// fallback: ส่ง value ตรงๆ ถ้าไม่มีใน map
```

---

## ProClinic DOM Selectors

```js
// Customer ID จาก list
'button.btn-delete[data-url]'    // data-url="/admin/customer/{id}"

// HN (อยู่ที่ edit page เท่านั้น)
'input[name="hn_no"]'            // value เช่น "000485"

// CSRF
'meta[name="csrf-token"]'

// Login
'input[name="email"]'
'input[name="password"]'
'input[type="checkbox"]'   // remember me / captcha confirm
'button.btn-primary'       // ปุ่ม login (type="button" ไม่ใช่ type="submit")

// Edit form
'form'  // FormData(form) ดึงทุก field
'input.flatpickr-input[name="birthdate"]'  // flatpickr — ใช้ ._flatpickr.setDate()
```

---

## Tab Management

```js
getOrCreateProclinicTab()       // หา/สร้าง ProClinic tab + รอ login check
navigateAndWait(tabId, url, delayMs=800, timeoutMs=15000)
  // ⚠️ ตั้ง listener ก่อน navigate เสมอ — ป้องกัน race condition
waitForTabReady(tabId)          // รอ tab ที่กำลัง loading
ensureLoggedIn(tabId)           // ตรวจ /login → navigate + doAutoLogin
```
