# Broker Extension — Chrome Extension MV3

> ไฟล์: `broker-extension/`
> หน้าที่: Bridge ระหว่าง LoverClinic ↔ ProClinic
> **ไม่มี auto-deploy** — ต้อง reload ที่ `chrome://extensions` เอง

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
| `manifest.json` | MV3 config, permissions: tabs/scripting/activeTab/storage |
| `popup.html/js` | UI แสดง session status (pending/done/failed) |

---

## ProClinic URLs

```js
const PROCLINIC_ORIGIN     = 'https://trial.proclinicth.com'
const PROCLINIC_CREATE_URL = 'https://trial.proclinicth.com/admin/customer/create'
const PROCLINIC_LIST_URL   = 'https://trial.proclinicth.com/admin/customer'
// Edit: PROCLINIC_ORIGIN + '/admin/customer/{id}/edit'
// Search: PROCLINIC_LIST_URL + '?search={query}'
```

---

## Message Types

| Type | ทิศทาง | คำอธิบาย |
|------|--------|-----------|
| `LC_FILL_PROCLINIC` | Page → Extension | สร้างลูกค้าใหม่ใน ProClinic |
| `LC_DELETE_PROCLINIC` | Page → Extension | ลบลูกค้า |
| `LC_UPDATE_PROCLINIC` | Page → Extension | แก้ไขข้อมูล (auto-sync) |
| `LC_OPEN_EDIT_PROCLINIC` | Page → Extension | เปิดหน้า edit (manual) |
| `LC_BROKER_RESULT` | Extension → Page | ผล create |
| `LC_DELETE_RESULT` | Extension → Page | ผล delete |
| `LC_UPDATE_RESULT` | Extension → Page | ผล update |
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
```

> ⚠️ Chrome MV3 service workers อาจ restart ระหว่าง session → `syncInFlightSessions` reset → dedup ไม่ guaranteed
> การป้องกันที่น่าเชื่อถือกว่าคือ guard ใน AdminDashboard (`lastAutoSyncedStrRef`)

---

## CREATE Flow (`handleFillRequest`)

```
1. navigateAndWait(createURL)
2. executeScript(fillAndSubmitProClinicForm)  — click submit หลัง 400ms
3. waitForNavAwayFromCreate  — รอ navigation event ถัดไป (NEXT event ไม่ใช่ current state)
4. check !url.includes('/create') → extract proClinicId จาก URL
5. navigateAndWait(editURL)  — เพื่อดึง HN
6. executeScript: document.querySelector('input[name="hn_no"]')?.value
7. reportBack LC_BROKER_RESULT { proClinicId, proClinicHN }
   → AdminDashboard: updateDoc { brokerStatus:'done', brokerProClinicId, brokerProClinicHN }
```

---

## UPDATE Flow (`handleUpdateRequest`) — FETCH-BASED ⚡

```
1. searchAndResolveId(HN → phone → name)
2. navigateAndWait(editURL)  — ดึง CSRF + form values เท่านั้น (ไม่ navigate จริง)
3. executeScript(submitProClinicEditViaFetch):
   → FormData(form) — เก็บ hidden fields ทั้งหมด
   → override: prefix, firstname, lastname, telephone_number, gender, note
   → fetch PUT redirect:'manual'
   → response.type==='opaqueredirect' → SUCCESS ✓ (server ส่ง 302)
   → response.type==='basic' status 200 → FAIL (validation error, no redirect)
4. reportBack LC_UPDATE_RESULT
```

> ⚠️ ProClinic ALWAYS redirects กลับ /edit หลัง save — ตรวจ URL ไม่ได้!
> ใช้ `redirect:'manual'` + ตรวจ `response.type` แทน

---

## DELETE Flow (`handleDeleteRequest`)

```
1. searchAndResolveId (ถ้าไม่มี proClinicId)
2. navigateAndWait(listURL)  — ดึง CSRF
3. executeScript: fetch POST _method=DELETE + check res.ok
4. reportBack LC_DELETE_RESULT
```

---

## Search Flow (`searchAndResolveId`)

```
Round 1: HN search   → searchProClinicCustomers(HN) → เอาตัวแรก (HN unique)
Round 2: Phone       → searchProClinicCustomers(phone) → findBestMatch
Round 3: Name        → searchProClinicCustomers("firstname lastname") → findBestMatch
→ throw ถ้าไม่เจอ

searchProClinicCustomers:
  navigateAndWait(searchURL, 1200ms delay)  — รอ DOM render
  executeScript(extractCustomersFromSearchResults)
  → returns [{id, name, phone}]
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

// Edit form (แรกในหน้า)
'form'
```

---

## ProClinic Form Fields (PUT /admin/customer/{id})

```
Fields ที่เราเขียน: prefix, firstname, lastname, telephone_number, gender, note
Required: _method=PUT, _token={csrf}
ห้ามแตะ: hn_no  — ProClinic กำหนดเอง
ที่เหลือ: อ่านจาก FormData(form) แล้วส่งต่อเลย
```

---

## Tab Management

```js
getOrCreateProclinicTab()       // หา/สร้าง ProClinic tab + รอ login check
navigateAndWait(tabId, url, delayMs=800, timeoutMs=15000)
  // ⚠️ ตั้ง listener ก่อน navigate เสมอ — ป้องกัน race condition
waitForTabReady(tabId)          // รอ tab ที่กำลัง loading
```
