# Bug History & Pending Fixes

> อ่านไฟล์นี้ก่อนแตะ AdminDashboard.jsx หรือ broker-extension/

---

## 🔴 PENDING — ยังไม่ได้ Fix (2026-03-25)

### Bug: กด Report ตอน Unread → Extension submit ProClinic รัวๆ

**อาการ**: admin คลิก Report บน session ที่มีสถานะ Unread (แดง+New) → extension เปิดหน้า ProClinic edit และ submit รัวๆ + banner "มีข้อมูลอัปเดตใหม่" ขึ้นทันที

**Root Cause**:
```
1. handleViewSession(session) เรียก updateDoc({ isUnread: false })
2. Firestore SDK เก็บ write ใน local cache ก่อน → fires LOCAL snapshot ทันที
3. local snapshot นี้ include ข้อมูล V2 จาก cache (patientData version ล่าสุด)
4. แต่ prevSessionsRef.current ยังเป็น V1 (listener ยังไม่ได้ process V2 snapshot)
5. → oldStr (V1) !== newStr (V2) → guard ผ่าน → LC_UPDATE_PROCLINIC ถูกส่ง
6. extension รับ message → submit ProClinic form → รัวๆ
```

**Fix ที่ต้องทำ** (ยังไม่ได้ implement):
```js
// ใน handleViewSession และ banner button onClick
// ก่อน updateDoc({ isUnread: false }) ให้เพิ่ม:
lastAutoSyncedStrRef.current[session.id] = JSON.stringify(session.patientData || {});
// บรรทัดนี้บอกว่า "เรารู้จัก patientData version นี้แล้ว → อย่า sync"
// แม้ prevRef จะ stale แค่ไหน guard lastAutoSyncedStr ก็จะบล็อก
```

**ทำไม prevRef update ไม่พอ**:
- การ update `prevSessionsRef.current` ก่อน `updateDoc` ไม่ช่วย เพราะ
- Firestore SDK local snapshot อาจ include V2 ที่มาจาก server ก่อนหน้า (ที่ทำให้ isUnread=true)
- prevRef update แค่เปลี่ยน isUnread field แต่ patientData ใน prevRef ยังเป็น V1 เหมือนเดิม

**ไฟล์ที่ต้องแก้**: `src/pages/AdminDashboard.jsx`
- `handleViewSession` (~line 474)
- banner button onClick (ปุ่ม "คลิกเพื่อโหลดข้อมูลล่าสุด" ~line 1217)

**หลังแก้ต้อง**: commit + build + `vercel --prod`

---

## ✅ Fixed Bugs (ประวัติ)

### Broker Extension

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Extension ไม่เปิด ProClinic tab | race condition: navigate เร็วกว่า listener | `navigateAndWait` ตั้ง listener ก่อน navigate |
| Search ไม่เจอเมื่อชื่อ+เบอร์เปลี่ยน | ไม่มี unique key ค้นหา | ดึง HN หลัง create → store `brokerProClinicHN` → ใช้ search |
| Update → button แดงเสมอแม้ save สำเร็จ | ProClinic redirects กลับ /edit เสมอ → ตรวจ URL ไม่ได้ | เปลี่ยนเป็น fetch + `redirect:'manual'` + ตรวจ `response.type==='opaqueredirect'` |
| ProClinic refresh รัวๆ → CAPTCHA | URL-based detect บังคับ navigate หลายครั้ง | fetch approach → navigate tab แค่ 1 ครั้ง (ดึง CSRF เท่านั้น) |
| Auto-sync fire ซ้ำหลัง create | guard `oldS.brokerProClinicId === newS.brokerProClinicId` ขาด | เพิ่ม guard ใน onSnapshot |
| กดปุ่มแดง retry → สร้างคนใหม่ใน ProClinic | `handleOpdClick` ส่ง `LC_FILL_PROCLINIC` เสมอ | ถ้า `brokerProClinicId \|\| brokerProClinicHN` มีอยู่ → ส่ง `LC_UPDATE_PROCLINIC` แทน |
| กดปุ่มแดง retry → spinner ไม่หาย | `LC_UPDATE_RESULT` handler ไม่ clear `brokerPending` | เพิ่ม `clearTimeout` + `setBrokerPending(...)` ใน `LC_UPDATE_RESULT` |

### AdminDashboard

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Banner "มีข้อมูลอัปเดต" false positive | compare `updatedAt.toMillis()` → serverTimestamp fires 2x → timestamp ต่างกัน | ลบ updatedAt comparison ออก เปรียบแค่ `patientData` |
| Banner "มีข้อมูลอัปเดต" ไม่หายหลัง auto-sync | ไม่มีโค้ด clear banner | brokerChanged → `setViewingSession(latestSession)` → render ถัดไป recalculate dataOutOfSync |
| Auto-sync รัวๆ หลังกด Report (UNRESOLVED) | Firestore local snapshot + stale prevRef | ดูหัวข้อ PENDING ด้านบน |

---

## 🧠 Design Patterns ที่ใช้แก้ปัญหา

### lastAutoSyncedStrRef pattern
```js
// useRef ใน AdminDashboard:
const lastAutoSyncedStrRef = useRef({});  // { [sessionId]: JSON.stringify(patientData) }

// ใน onSnapshot guard:
if (lastAutoSyncedStrRef.current[newS.id] !== newStr) {
  lastAutoSyncedStrRef.current[newS.id] = newStr;
  // → trigger auto-sync
}
// ถ้า data เหมือนเดิม → ข้าม (ป้องกัน re-trigger)
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
```
