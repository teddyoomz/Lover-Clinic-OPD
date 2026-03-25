# Bug History & Resolved Fixes

> อ่านไฟล์นี้ก่อนแตะ AdminDashboard.jsx หรือ broker-extension/
> อัพเดทล่าสุด: 2026-03-25 (courses cross-device)

---

## ✅ ทุก bug แก้หมดแล้ว — ไม่มี PENDING

---

## ✅ Fixed Bugs (ประวัติทั้งหมด)

### Broker Extension

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Extension ไม่เปิด ProClinic tab | race condition: navigate เร็วกว่า listener | `navigateAndWait` ตั้ง listener ก่อน navigate เสมอ |
| Search ไม่เจอเมื่อชื่อ+เบอร์เปลี่ยน | ไม่มี unique key ค้นหา | ดึง HN หลัง create → store `brokerProClinicHN` → ใช้ search |
| Update → button แดงเสมอแม้ save สำเร็จ | ProClinic redirects กลับ /edit เสมอ → ตรวจ URL ไม่ได้ | เปลี่ยนเป็น fetch + `redirect:'manual'` + ตรวจ `response.type==='opaqueredirect'` |
| ProClinic refresh รัวๆ → CAPTCHA | URL-based detect บังคับ navigate หลายครั้ง | fetch approach → navigate tab แค่ 1 ครั้ง (ดึง CSRF เท่านั้น) |
| Auto-sync fire ซ้ำหลัง create | guard `oldS.brokerProClinicId === newS.brokerProClinicId` ขาด | เพิ่ม guard ใน onSnapshot |
| กดปุ่มแดง retry → สร้างคนใหม่ใน ProClinic | `handleOpdClick` ส่ง `LC_FILL_PROCLINIC` เสมอ | ถ้า `brokerProClinicId \|\| brokerProClinicHN` มีอยู่ → ส่ง `LC_UPDATE_PROCLINIC` แทน |
| กดปุ่มแดง retry → spinner ไม่หาย | `LC_UPDATE_RESULT` handler ไม่ clear `brokerPending` | เพิ่ม `clearTimeout` + `setBrokerPending(...)` ใน `LC_UPDATE_RESULT` |
| Login ไม่ผ่าน — button ไม่ถูกกด | selector `button[type="submit"]` ผิด (ProClinic ใช้ `type="button"`) | เปลี่ยน selector เป็น `button.btn-primary \|\| form button \|\| button` |
| Login ต้อง 2 รอบ | timing เร็วเกินหลัง tick checkbox | เพิ่ม wait 600ms ให้ reCAPTCHA ประมวลผลก่อนกด submit |
| Login "ตรวจพบการส่งข้อมูลที่ผิดปกติ" | ใช้ `btn.removeAttribute('disabled')` ก่อน click | ลบวิธีนั้นออก ใช้ native setter + รอ button enable เองตามธรรมชาติ |
| Service Worker registration failed (status 15) | ขาด `"alarms"` permission ใน manifest.json | เพิ่ม `"alarms"` ใน permissions array |
| Session ProClinic หมดอายุกลางวัน | ไม่มี keepalive | `chrome.alarms` ทุก 20 นาที ping `/admin/api/stat` จาก ProClinic tab |

### LC_GET_COURSES (ดูคอร์สคงเหลือ) — Cross-device

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| กดจาก iPhone → extension ไป edit/fill ProClinic รัวๆ แทนที่จะ query | relay block มี `else` fallback → job type ที่ไม่รู้จักถูกส่งเป็น `LC_FILL_PROCLINIC` ถ้า `brokerStatus==='pending'`; cross-device ทำให้ Cloud PC ไม่มี jobId ใน `forwardedJobsRef` → relay old block fires, ตกไป `else` → fill รัวๆ | เพิ่ม `else if (job.type === 'LC_GET_COURSES')` ก่อน `else` ใน relay block; ใช้ `return` เพื่อข้าม OPD timer; ตั้ง `brokerStatus:'pending'` ด้วยเหมือนปุ่มอื่น |
| กดจาก iPhone → ข้อมูลคอร์สไม่มาแสดงบน iPhone | `coursesJobIdRef.current` เป็น `null` บน Cloud PC (relay device) → เขียน `latestCourses.jobId = null` → iPhone ตรวจ `null === jobId` = false → panel ไม่อัพเดท | ในตัว handler `LC_COURSES_RESULT` บน Cloud PC: ดึง jobId จริงด้วย `getDoc(ref).then(snap => snap.data()?.brokerJob?.id)` ก่อนเขียน `latestCourses` |

### AdminDashboard

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Banner "มีข้อมูลอัปเดต" false positive | compare `updatedAt.toMillis()` → serverTimestamp fires 2x | ลบ updatedAt comparison ออก เปรียบแค่ `patientData` |
| Banner ขึ้นทันทีหลังกด Report บน Unread | isUnread→false write → LOCAL snapshot แนบ V2 patientData มา → oldStr≠newStr | cut-the-wire guard: stamp `lastViewedStrRef` + `lastAutoSyncedStrRef` ก่อน write `isUnread:false` |
| Banner หายทันทีหลังขึ้นมา | `lastAutoSyncedStrRef` ทำหน้าที่สองอย่าง — stamp หลัง auto-sync เสร็จทำให้ banner check clear | แยก `lastViewedStrRef` (banner only) กับ `lastAutoSyncedStrRef` (sync dedup) |
| Banner หายเองหลัง broker sync เสร็จ | `brokerChanged` path เรียก `setViewingSession` → useEffect คำนวณใหม่ → `dataOutOfSync=false` → clear banner | `brokerChanged` path อัพเดท session เงียบๆ ไม่แตะ `hasNewUpdate` |
| Auto-sync ไม่ทำงานระหว่าง simulation | AdminDashboard unmount ระหว่าง simulation → Firestore listener ถูกทำลาย | keep AdminDashboard mounted ตลอด ด้วย `display:none` wrapper ตอน simulation |
| Auto-sync ทำงานเฉพาะตอน isNotifEnabled=true | auto-sync block อยู่ใน `if (isNotifEnabled)` | ย้าย auto-sync ออกมาข้างนอก — notification sound/toast เท่านั้นที่ check isNotifEnabled |

---

## 🧠 Design Patterns ที่ใช้แก้ปัญหา

### lastViewedStrRef + lastAutoSyncedStrRef pattern
```js
// useRef แยกกัน 2 ตัว:
const lastViewedStrRef     = useRef({}); // { [sessionId]: jsonStr } — guard banner false positive
const lastAutoSyncedStrRef = useRef({}); // { [sessionId]: jsonStr } — guard auto-sync dedup

// เมื่อ admin เปิด session ที่ isUnread:
lastViewedStrRef.current[id]     = JSON.stringify(session.patientData || {});
lastAutoSyncedStrRef.current[id] = JSON.stringify(session.patientData || {});
// → write isUnread:false → LOCAL snapshot fires → guard บล็อกทั้ง banner และ sync

// Banner check ใน useEffect:
if (lastViewedStrRef.current[id] === latestStr) {
  setViewingSession(latestSession); setHasNewUpdate(false); // stale — ไม่โชว์ banner
} else {
  setHasNewUpdate(true); // patient edit จริง → โชว์ banner
}
```

### navigateAndWait pattern (extension)
```js
// ตั้ง listener ก่อน navigate เสมอ ป้องกัน race condition:
const result = await navigateAndWait(tabId, url);
// ไม่ใช่: chrome.tabs.update() แล้วค่อย addListener
```

### Firestore serverTimestamp 2-snapshot rule
```
write ที่มี serverTimestamp() → Firestore fires snapshot 2 ครั้ง:
  1. LOCAL: timestamp = estimated (local clock)
  2. SERVER: timestamp = actual server time
ห้าม compare timestamps ระหว่าง 2 snapshots → false positive
เปรียบเทียบเฉพาะ patientData (JSON.stringify) แทน
```

### กฎทองของ Firestore relay block (ห้ามลืม)

```
1. ทุก job type ใหม่ต้องมี explicit else-if ใน relay block ก่อน else fallback เสมอ
   else fallback = LC_FILL_PROCLINIC → สร้างคนใหม่ใน ProClinic ผิดทันที

2. job ที่ไม่ต้องการ OPD spinner หรือ fail-timer → ใช้ return เพื่อ early exit
   return ใน forEach callback = ข้ามแค่ iteration นั้น ไม่ออกจาก loop

3. forwardedJobsRef ใช้ dedup ต่อ device เท่านั้น
   cross-device: device A add jobId → device B ไม่รู้จัก jobId นั้น
   → relay block บน device B จะยิง (ถ้า condition อื่นผ่าน) → ต้องออกแบบให้ถูกต้อง

4. brokerStatus: 'pending' ต้องเขียนก่อนทุกครั้งที่ใช้ relay block เป็น gate
   ถ้าไม่เขียน → relay gate ไม่ผ่าน → cross-device ไม่ทำงาน
```

### coursesJobIdRef pattern (cross-device result delivery)

```js
// ปัญหา: ref ที่ set บน device ที่กดปุ่ม ≠ ref บน relay device
// device กดปุ่ม (iPhone): coursesJobIdRef.current = jobId
// relay device (Cloud PC): coursesJobIdRef.current = null

// ❌ Wrong: ใช้ ref โดยตรง → jobId = null บน Cloud PC
latestCourses: { jobId: coursesJobIdRef.current }  // null!

// ✅ Correct: ดึง jobId จาก Firestore ก่อนเขียน result
getDoc(ref).then(snap => {
  const firestoreJobId = snap.data()?.brokerJob?.id || localJobId;
  updateDoc(ref, { latestCourses: { jobId: firestoreJobId, ... } });
});
// → iPhone onSnapshot: lc.jobId === coursesJobIdRef.current → match ✓
```

### fetch + redirect:'manual' pattern (ProClinic save)
```js
const res = await fetch(url, { method:'POST', ..., redirect:'manual' });
// response.type === 'opaqueredirect' → server ส่ง 302 = บันทึกสำเร็จ ✓
// response.type === 'basic' status 200 → validation error (server ไม่ redirect)
// ProClinic ALWAYS redirects กลับ /edit หลัง save → ตรวจ URL ไม่ได้ → ต้องใช้วิธีนี้
```
