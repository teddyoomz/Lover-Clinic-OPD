# PatientDashboard.jsx — Deep Dive

> ไฟล์: `src/pages/PatientDashboard.jsx`
> หน้าแสดงข้อมูลผู้ป่วย: courses, appointments, contact, sync
> อัพเดทล่าสุด: 2026-03-28

---

## เปิดได้ 2 แบบ

| แบบ | URL | ใช้เมื่อ |
|-----|-----|---------|
| Patient view | `/?patient=TOKEN` | ผู้ป่วยเปิดดูข้อมูลตัวเอง |
| Admin view | `/?patient=TOKEN&admin=1` | Admin ดูข้อมูลผู้ป่วย (ไม่มี cooldown) |
| Admin iframe | เปิดใน iframe modal จาก AdminDashboard | กดปุ่ม แว่นขยาย หรือ "คอร์สและนัดหมาย ↗" |

---

## Key Features

### 1. Patient Card
- Avatar: glowing red ring, white initials (ห้ามสีแดงบนตัวอักษร — วัฒนธรรมไทย)
- HN badge: neutral white/gray
- Phone number display
- Contact buttons: LINE (green) + Call clinic (red accent)

### 2. Courses Display
- Active courses: teal glow cards
- Expired courses: red glow cards
- Data source: Firestore `latestCourses` field (synced via API/extension)

### 3. Appointments
- Violet glow cards
- Data: date, time, doctor, branch, room, notes

### 4. Sync System
- Auto-sync on page load (if no cooldown active)
- Manual resync button with cooldown countdown
- `syncStatus` states: `requesting`, `syncing`, `inCooldown`, `timeout/error`, `idle`, `done`
- Sync success button: green color

### 5. Admin iframe back button
- ใน iframe: ปุ่มกลับส่ง `window.parent.postMessage({ type: 'close-patient-view' }, '*')`
- AdminDashboard: `useEffect` listens for message → `setPatientViewUrl(null)`

---

## Sync Architecture

### Cooldown System
- Config: `clinicSettings.patientSyncCooldownMins` (0 = unlimited)
- Storage: Firestore `lastCoursesAutoFetch` timestamp on session doc
- Display: countdown timer "ลอง Sync ใหม่ — XX:XX น."
- Fix: `Math.min(Math.ceil(remainingMs / 60000), configuredMins)` — ป้องกัน serverTimestamp clock skew +1 minute

### clinicSettingsLoaded Pattern
```
Problem: useEffect closes over DEFAULT clinicSettings (cooldown=0) before Firestore loads
Solution: clinicSettingsLoaded flag → wait for Firestore before running sync logic
```

### Stale Closure Fix
```js
// Refs that sync every render:
cooldownMsRef.current = clinicSettings?.patientSyncCooldownMins * 60000 || 0;
sessionDataRef.current = sessionData;
// useEffect uses refs instead of stale state
```

### Timer-driven Auto-sync
- Schedule based on `lastCoursesAutoFetch` when page stays open
- Respects cooldown period

---

## API Flow (fetchCoursesViaApi)

```
1. Call brokerClient.getCourses(proClinicId)
2. API /api/proclinic/courses → scrape ProClinic
3. Return { courses, expiredCourses, appointments, patientName }
4. Write to Firestore: latestCourses field on session doc
5. PatientDashboard reads from Firestore (realtime listener)
```

> ⚠️ fetchCoursesViaApi errors on localhost are EXPECTED (no API routes on dev server)

---

## UI Design

### Dark Theme
- Hero header: radial glow with accent color (rgba 0.30)
- Section headers: icon drop-shadow + badge glow
- Course cards: teal glow (active), red glow (expired)
- Appointment cards: violet glow

### Light Theme
- Uses CSS var mapping from index.css
- Backgrounds: `bg-[#0f0f0f]` maps to `--bg-card`
- Text contrast: must be readable on light backgrounds
- Sync button green: must be visible on both themes

### Contact Section
- Horizontal layout: LINE (left) | divider | Call (right)
- Single button if only one configured
- Grid: `gridTemplateColumns: '1fr auto 1fr'` (two) or `'1fr'` (one)
- LINE icon: green (#06C755), Call icon: accent red
- Phone icon: wiggle animation on hover (keyframes in index.css)
