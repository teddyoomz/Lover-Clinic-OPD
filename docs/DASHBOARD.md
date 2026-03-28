# AdminDashboard.jsx — Deep Dive

> ไฟล์: `src/pages/AdminDashboard.jsx`
> Component ที่ซับซ้อนที่สุดในโปรเจ็ค — มี Firestore listener, auto-sync, broker logic
> อัพเดทล่าสุด: 2026-03-28

---

## Props

```js
{ db, appId, user, auth, viewingSession, setViewingSession,
  setPrintMode, onSimulateScan, clinicSettings, theme, setTheme }
```

---

## State & Refs สำคัญ

| State/Ref | ประเภท | คำอธิบาย |
|-----------|--------|-----------|
| `sessions` | state | active sessions array (realtime) |
| `archivedSessions` | state | archived sessions array (ประวัติ) |
| `viewingSession` | prop state | session ที่กำลังดูอยู่ |
| `hasNewUpdate` | state | banner "มีข้อมูลอัปเดต" |
| `adminMode` | state | 'dashboard' / 'formBuilder' / 'clinicSettings' / 'history' |
| `prevSessionsRef` | useRef | sessions ก่อนหน้าสำหรับ detect changes ใน onSnapshot |
| `lastAutoSyncedStrRef` | useRef | `{[sessionId]: jsonStr}` — guard ป้องกัน auto-sync ซ้ำ |
| `lastViewedStrRef` | useRef | `{[sessionId]: jsonStr}` — guard ป้องกัน banner false positive จาก isUnread→false transition |
| `brokerPending` | state | `{[sessionId]: true}` — spinner state |
| `brokerTimers` | useRef | `{[sessionId]: timeoutId}` — 10s timeout สำหรับ broker |
| `pushEnabled` | state | FCM push เปิดอยู่บน device นี้ไหม |

> **⚠️ lastViewedStrRef vs lastAutoSyncedStrRef**:
> - `lastViewedStrRef` — stamp เมื่อ admin เห็น session แล้ว → ป้องกัน banner false positive
> - `lastAutoSyncedStrRef` — stamp เมื่อ auto-sync ส่งแล้ว → ป้องกัน sync ซ้ำ
> - ทั้งคู่ stamp พร้อมกันใน `handleViewSession` และ cut-the-wire guard

---

## useEffects

| ประมาณบรรทัด | ทำอะไร |
|--------|---------|
| ~53 | `setInterval` อัพเดท `currentTime` ทุก 10วิ (สำหรับ countdown) |
| ~59 | `onSnapshot` form_templates collection |
| ~66 | `onSnapshot` opd_sessions — **หลัก** (auto-cleanup, broker auto-sync, notification) |
| ~360 | track `viewingSession` vs latest session → set `hasNewUpdate` / auto-update broker fields |

---

## onSnapshot opd_sessions — Logic

```
forEach session ใหม่:
  1. auto-expire: pending + >2ชม → deleteDoc
  2. auto-archive: completed + >2ชม → isArchived:true
  3. แยก active vs archived sessions
  4. เปรียบเทียบกับ prevSessionsRef:
     a. Notification (isNotifEnabled only): newS.isUnread===true AND (!oldS.isUnread OR patientData เปลี่ยน)
     b. Cut-the-wire guard: oldS.isUnread→!newS.isUnread → stamp both refs → SKIP sync (forEach return)
     c. Auto-sync: ดูหัวข้อด้านล่าง
  5. prevSessionsRef.current = newSessions
  6. setSessions / setArchivedSessions
```

---

## Cut-the-Wire Guard (isUnread transition)

```js
// ใน onSnapshot forEach — หัวใจสำคัญป้องกัน false auto-sync + false banner
if (oldS.isUnread && !newS.isUnread) {
  lastViewedStrRef.current[newS.id]     = newStr; // banner: admin เห็นแล้ว
  lastAutoSyncedStrRef.current[newS.id] = newStr; // auto-sync: อย่า trigger
  return; // forEach return = skip ทุกอย่างสำหรับ session นี้
}
```

> ทำไมต้อง stamp ก่อน write isUnread:false ใน handleViewSession ด้วย?
> เพราะ LOCAL snapshot อาจ fire ก่อนที่ forEach จะ reach บรรทัดนี้ใน next snapshot
> double-stamp ทั้งใน handleViewSession + onSnapshot guard = safe ทุกกรณี

---

## Auto-sync Trigger (onSnapshot)

```js
// เงื่อนไขที่จะส่ง LC_UPDATE_PROCLINIC ไปยัง extension:
if (
  oldStr !== newStr                                    // patientData เปลี่ยน
  && newStr !== '{}'
  && newS.patientData
  && newS.brokerStatus === 'done'                      // มี ProClinic record แล้ว
  && newS.brokerProClinicId
  && oldS.brokerStatus === 'done'                      // ป้องกัน pending→done trigger
  && oldS.brokerProClinicId === newS.brokerProClinicId // ป้องกัน ID ตั้งใหม่ trigger
  && lastAutoSyncedStrRef.current[newS.id] !== newStr  // ป้องกัน re-trigger ด้วย data เดิม
) {
  lastAutoSyncedStrRef.current[newS.id] = newStr;
  brokerSyncSessions.push(newS);
  // → window.postMessage(LC_UPDATE_PROCLINIC, { patient, proClinicId, proClinicHN, sessionId })
}
// ⚠️ ทำงานเสมอ — ไม่ขึ้นกับ isNotifEnabled
```

---

## Banner Logic (useEffect ~line 360)

```js
const latestSession = sessions.find(s => s.id === viewingSession?.id);
const brokerFields = ['brokerStatus','brokerProClinicId','brokerProClinicHN',
                      'brokerError','opdRecordedAt','brokerFilledAt','brokerLastAutoSyncAt'];
const brokerChanged = brokerFields.some(k => viewingSession[k] !== latestSession[k]);

if (brokerChanged) {
  setViewingSession(latestSession); // อัพเดท broker fields เงียบๆ — ไม่แตะ hasNewUpdate
} else if (dataOutOfSync) {
  if (lastViewedStrRef.current[viewingSession.id] === latestStr) {
    setViewingSession(latestSession);
    setHasNewUpdate(false); // stale จาก isUnread transition → ไม่โชว์ banner
  } else {
    setHasNewUpdate(true);  // patient edit จริง → โชว์ banner
  }
}
// else: ไม่แตะ hasNewUpdate → banner ยังอยู่ถ้าเคยขึ้นแล้ว

// banner หายได้เฉพาะเมื่อ:
// 1. user กดปุ่ม "✓ รับทราบ" (setHasNewUpdate(false) + setViewingSession(latestSession))
// 2. user ปิด session (closeViewSession → setHasNewUpdate(false))
// 3. กด X แล้วมี confirm dialog ถ้า hasNewUpdate=true
```

---

## handleViewSession

```js
const handleViewSession = async (session) => {
  setViewingSession(session);
  setHasNewUpdate(false);
  if (session.isUnread) {
    // stamp ทั้งสอง ref ก่อน write — ป้องกัน LOCAL snapshot false trigger
    lastViewedStrRef.current[session.id]     = JSON.stringify(session.patientData || {});
    lastAutoSyncedStrRef.current[session.id] = JSON.stringify(session.patientData || {});
    await updateDoc(..., { isUnread: false });
  }
};
```

---

## Patient Object (ส่งไป ProClinic)

```js
const patient = {
  prefix, firstName, lastName, phone, age, reasons,
  dobDay, dobMonth, dobYear,   // วันเกิดจริง (BE หรือ CE — background.js แปลงเอง)
  address,
  howFoundUs,                  // array — ['Facebook', 'Google', ...]
  allergies,
  underlying,                  // pmh string: 'ความดัน, เบาหวาน, ...'
  emergencyName, emergencyRelation, emergencyPhone,
  clinicalSummary,             // generateClinicalSummary(d, formType, customTemplate, 'th')
};
```

> patient object นี้ build ใน 2 ที่:
> 1. `handleOpdClick` / `handleResync` — กดปุ่ม manual
> 2. auto-sync forEach ใน onSnapshot — trigger อัตโนมัติเมื่อ patientData เปลี่ยน

---

## OPD / Broker Button States

```js
isDone    = !isPending && !!session.opdRecordedAt && session.brokerStatus === 'done'
isPending = brokerPending[id] || session.brokerStatus === 'pending'
isFailed  = !isPending && !isDone && session.brokerStatus === 'failed'
// OPD button: disabled={isPending || isDone}
// Resync button: disabled={isPending} — ทำงานได้แม้ isDone
```

### Broker message ที่ส่ง:
```js
if (brokerProClinicId || brokerProClinicHN) {
  postMessage('LC_UPDATE_PROCLINIC', { proClinicId, proClinicHN, sessionId, patient })
} else {
  postMessage('LC_FILL_PROCLINIC', { sessionId, patient })
}
```

---

## Simulation vs Report Edit

| | Simulation (ปุ่มจำลองหน้าจอ) | Report Edit (ปุ่มแก้ไขข้อมูล) |
|---|---|---|
| `suppressNotif` | false | true |
| `isUnread` ที่เขียน | true | false |
| Notification | ✅ ส่ง | ❌ ไม่ส่ง |
| ProClinic auto-sync | ✅ (isUnread:true → onSnapshot ตรวจ patientData เปลี่ยน) | ✅ (patientData เปลี่ยน + brokerStatus:done) |
| AdminDashboard mounted | ✅ (display:none, Firestore listener ยังทำงาน) | ✅ |

---

## JSX Layout (Session Detail / Report)

```
Report Header
├── ปุ่ม "แก้ไขข้อมูล" (blue) — เปิด simulation suppressNotif
├── ปุ่ม "Resync ProClinic" (teal) — handleResync, ทำงานแม้ isDone
├── ปุ่ม "พิมพ์สรุป A4" / "พิมพ์ฟอร์มมาตรฐาน" (intake/custom only)
├── ปุ่ม "บันทึกลง OPD" — handleOpdClick, disabled ถ้า done
└── ปุ่ม X (ปิด) — confirm dialog ถ้า hasNewUpdate

Banner (hasNewUpdate)
├── ข้อความ "มีข้อมูลอัปเดตใหม่"
└── ปุ่ม "✓ รับทราบ" — setViewingSession(latest) + setHasNewUpdate(false)

OPD Info bar (opdRecordedAt)
└── แสดง ProClinic ID, HN, sync time

Error bar (brokerStatus==='failed')
└── ปุ่ม retry → handleOpdClick
```

---

## Functions หลัก

| Function | คำอธิบาย |
|----------|-----------|
| `confirmCreateSession()` | สร้าง session ใน Firestore |
| `deleteSession(id)` | soft delete (archive ถ้ามีข้อมูล) |
| `hardDeleteSession(id)` | deleteDoc ถาวร |
| `handleViewSession(session)` | เปิด report + mark isUnread:false + stamp refs |
| `closeViewSession()` | ปิด report panel |
| `handleOpdClick(session)` | ส่งไป ProClinic (บล็อกถ้า done แล้ว) |
| `handleResync(session)` | ส่งไป ProClinic ซ้ำ (ไม่บล็อกถ้า done — manual resync) |
| `handleProClinicEdit(session)` | เปิดหน้า edit ProClinic (LC_OPEN_EDIT_PROCLINIC) |
| `handleProClinicDelete(session)` | ลบจาก ProClinic + ล้าง HN/ID (notFound → ถอด HN/OPD เตรียมบันทึกใหม่) |
| `handleOpenPatientView(session)` | เปิด PatientDashboard ใน iframe modal (admin view) |
| `closePatientViewIframe()` | ปิด iframe + stamp refs + clear banner |
| `closeViewSession()` | ปิด report + restore adminMode (prevAdminModeRef) |
| `enablePushNotifications()` | request permission → getToken → save Firestore |
| `generateClinicalSummary(d, formType, tpl, lang)` | import จาก utils.js |

---

## Iframe Patient View Modal

### เปิด
- ปุ่ม "คอร์สและนัดหมาย ↗" ใน report → `handleOpenPatientView(session)`
- ปุ่มแว่นขยาย ใน queue/history list → `handleOpenPatientView(session)` (ไม่เปิด report ซ้อน)
- สร้าง `patientLinkToken` ถ้ายังไม่มี → เปิด iframe `/?patient=TOKEN&admin=1`

### ปิด
- ทุกจุดเรียก `closePatientViewIframe()`:
  - ปุ่ม X บน "Admin View" bar
  - คลิก backdrop
  - postMessage `close-patient-view` จาก iframe back button
- Function stamp `lastViewedStrRef` + `lastAutoSyncedStrRef` → ป้องกัน banner false positive

### prevAdminModeRef
- เก็บ `adminMode` ก่อนเปิด report จากหน้าประวัติ
- `closeViewSession()` restore `adminMode` กลับ → ป้องกันกลับไปหน้าคิว

### notFound handling (delete/resync)
- API `update.js` + `delete.js` verify customer existence via edit page
- ถ้าไม่เจอ → return `{ notFound: true }`
- `handleResync`: ถอด HN/OPD → พร้อมบันทึกใหม่
- `handleProClinicDelete`: treat `notFound` = success → ถอด HN/OPD เหมือนกัน
