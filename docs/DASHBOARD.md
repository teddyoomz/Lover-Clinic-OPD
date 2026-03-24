# AdminDashboard.jsx — Deep Dive

> ไฟล์: `src/pages/AdminDashboard.jsx`
> Component ที่ซับซ้อนที่สุดในโปรเจ็ค — มี Firestore listener, auto-sync, broker logic

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
| `lastAutoSyncedStrRef` | useRef | `{[sessionId]: JSON.stringify(patientData)}` — guard ป้องกัน auto-sync ซ้ำ |
| `brokerPending` | state | `{[sessionId]: true}` — spinner state |
| `pushEnabled` | state | FCM push เปิดอยู่บน device นี้ไหม |

---

## useEffects

| บรรทัด | ทำอะไร |
|--------|---------|
| ~53 | `setInterval` อัพเดท `currentTime` ทุก 10วิ (สำหรับ countdown) |
| ~59 | `onSnapshot` form_templates collection |
| ~66 | `onSnapshot` opd_sessions — **หลัก** (auto-cleanup, broker auto-sync, notification) |
| ~134 | track `viewingSession` vs latest session → set `hasNewUpdate` / auto-update broker fields |

---

## onSnapshot opd_sessions — Logic (บรรทัด ~66-132)

```
forEach session ใหม่:
  1. auto-expire: ถ้า pending + >2ชม → deleteDoc
  2. auto-archive: ถ้า completed + >2ชม → isArchived:true
  3. แยก active vs archived sessions
  4. เปรียบเทียบกับ prevSessionsRef:
     a. Notification sound: newS.isUnread===true AND (!oldS.isUnread OR patientData เปลี่ยน)
     b. Auto-sync: ดูหัวข้อด้านล่าง
  5. prevSessionsRef.current = newSessions
  6. setSessions / setArchivedSessions
```

---

## Auto-sync Trigger (onSnapshot ~line 263)

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
  // → window.postMessage(LC_UPDATE_PROCLINIC, { patient, proClinicId, proClinicHN, sessionId })
}
```

> **⚠️ `lastAutoSyncedStrRef` คือกุญแจสำคัญ** — ป้องกัน false auto-sync
> ดู `docs/BUGS.md` สำหรับ bug ที่เกิดจากตัวนี้ไม่ทำงาน

---

## Banner Logic (useEffect ~line 134)

```js
// ตรวจสอบทุกครั้งที่ sessions หรือ viewingSession เปลี่ยน:
const latestSession = sessions.find(s => s.id === viewingSession?.id);

const brokerFields = ['brokerStatus','brokerProClinicId','brokerProClinicHN',
                      'brokerError','opdRecordedAt','brokerFilledAt','brokerLastAutoSyncAt'];
const brokerChanged = brokerFields.some(k => viewingSession[k] !== latestSession[k]);

if (brokerChanged) {
  setViewingSession(latestSession);  // auto-update ไม่แสดง banner
} else {
  const currentStr = JSON.stringify(viewingSession.patientData || {});
  const latestStr  = JSON.stringify(latestSession.patientData || {});
  const dataOutOfSync = currentStr !== latestStr;  // ⚠️ ไม่เปรียบ updatedAt (serverTimestamp 2x)
  dataOutOfSync ? setHasNewUpdate(true) : setHasNewUpdate(false);
}
```

---

## handleViewSession (บรรทัด ~474)

```js
// เรียกเมื่อ admin คลิกเข้าดู session (Report button)
const handleViewSession = async (session) => {
  setViewingSession(session);
  setHasNewUpdate(false);
  if (session.isUnread) {
    // ⚠️ BUG AREA — ดู docs/BUGS.md
    // FIX ที่ต้องทำ: ก่อน updateDoc ให้ set lastAutoSyncedStrRef ก่อน
    lastAutoSyncedStrRef.current[session.id] = JSON.stringify(session.patientData || {});
    prevSessionsRef.current = prevSessionsRef.current.map(s =>
      s.id === session.id ? { ...session, isUnread: false } : s
    );
    await updateDoc(doc(db, ..., session.id), { isUnread: false });
  }
};
```
> **TODO**: เพิ่ม `lastAutoSyncedStrRef.current[session.id] = JSON.stringify(session.patientData || {})` ก่อน `updateDoc`

---

## OPD Button States (บรรทัด ~590)

```js
isDone    = !isPending && !!session.opdRecordedAt && session.brokerStatus === 'done'
isPending = brokerPending[id] || session.brokerStatus === 'pending'
isFailed  = !isPending && !isDone && session.brokerStatus === 'failed'
// Button disabled={isPending || isDone}
```

### Broker button onClick logic:
```js
if (brokerProClinicId || brokerProClinicHN) {
  // มี record อยู่แล้ว → UPDATE
  postMessage(LC_UPDATE_PROCLINIC, { ..., proClinicId, proClinicHN, sessionId })
} else {
  // ยังไม่มี → CREATE
  postMessage(LC_FILL_PROCLINIC, { ..., sessionId })
}
```

---

## JSX Layout

```
Header (nav bar)
├── หน้าคิว (badge unreadCount) | จัดการแบบฟอร์ม | ตั้งค่า | ประวัติ
adminMode === 'clinicSettings' → <ClinicSettingsPanel>
adminMode === 'formBuilder'   → <CustomFormBuilder>
adminMode === 'history'       → Archive table + Hard Delete modal
adminMode === 'dashboard'     → (default)
  ├── Session list table (รหัสคิว | ข้อมูลผู้ป่วย | สาเหตุ | สถานะ | actions)
  ├── QR panel (selectedQR)
  └── Session detail overlay (viewingSession)
      ├── "มีข้อมูลอัปเดต" banner (hasNewUpdate)
      ├── Patient summary
      └── Clinical summary + print buttons
```

---

## Functions หลัก

| Function | บรรทัด | คำอธิบาย |
|----------|--------|-----------|
| `confirmCreateSession()` | ~177 | สร้าง session ใน Firestore |
| `deleteSession(id)` | ~220 | soft delete (archive ถ้ามีข้อมูล) |
| `hardDeleteSession(id)` | ~238 | deleteDoc ถาวร |
| `handleViewSession(session)` | ~474 | เปิด detail + mark isUnread:false |
| `closeViewSession()` | ~255 | ปิด detail panel |
| `enablePushNotifications()` | ~58 | request permission → getToken → save Firestore |
| `disablePushNotifications()` | ~90 | clear localStorage + reset state |
