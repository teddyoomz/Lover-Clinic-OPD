# LoverClinic App — Claude Master Index

> อัพเดท: 2026-03-28 | Stack: React 19 + Vite + Firebase + Tailwind | Deploy: Vercel

---

## ⚡ Deploy Workflow (ทำตามลำดับเสมอ)
```
git add <files>
git commit -m "..."
npm run build
vercel --prod
```
**ห้าม deploy โดยไม่ commit ก่อน**
**ทุกครั้งที่แก้โค้ดเสร็จ → commit + deploy ให้อัตโนมัติเลย ไม่ต้องรอให้ user สั่ง**
> ยกเว้น broker-extension/ อย่างเดียว → commit เฉยๆ ไม่ต้อง vercel --prod (เป็น Chrome Extension ไม่ใช่ web app)

## 🌿 Branch
- Production: `master`
- Development: `develop`
- Merge develop → master ก่อน deploy เสมอ

---

## 🗂️ สารบัญ — อ่านไฟล์ไหนเมื่อไหร่

| งาน | ไฟล์ที่ต้องอ่าน |
|-----|----------------|
| ภาพรวมระบบ, Firestore schema, session lifecycle | `docs/ARCH.md` |
| AdminDashboard state/functions/broker logic | `docs/DASHBOARD.md` |
| Broker Extension (Chrome Extension) | `docs/EXTENSION.md` |
| API layer (Vercel serverless → ProClinic scraping) | `docs/API.md` |
| PatientDashboard (ข้อมูลผู้ป่วย, courses, sync) | `docs/PATIENT_DASHBOARD.md` |
| Bug ที่เจอมา + fix + design patterns | `docs/BUGS.md` |
| Component details (utils, PatientForm, etc.) | `CODEBASE_MAP.md` (อ่านแค่ section ที่ต้องการ) |

---

## 🚨 CRITICAL — อ่านก่อนทำทุกอย่าง

### 1. Firestore snapshot fires 2x
- write ที่มี `serverTimestamp()` → snapshot fires 2 ครั้ง (local estimate + server confirm)
- ห้าม compare timestamps → ใช้ JSON.stringify(patientData) แทน

### 2. Vite OXC parser
- ห้ามใช้ IIFE `{(() => {...})()}` ใน JSX → crash
- ใช้ pre-computed variable แทน

### 3. Extension ไม่ auto-deploy
- แก้ `broker-extension/*.js` แล้วต้อง reload ที่ `chrome://extensions` ด้วยตัวเอง
- **ไม่ต้อง reload**: `popup.html`, `popup.js`
- **ต้อง reload**: `background.js`, `manifest.json`, `content-loverclinic.js`

### 4. Thai cultural sensitivity
- สีแดงห้ามใช้กับตัวอักษรชื่อ/HN ผู้ป่วย (สีแดง = ชื่อคนตาย ในวัฒนธรรมไทย)
- Avatar initials + HN badge ใช้ white/gray เท่านั้น
- สีทองไม่ใช้ (user ไม่ชอบ)
- Palette: แดง ดำ ขาว ไฟ + LINE green accent

### 5. API layer (Vercel Serverless)
- `/api/proclinic/*` ทำงานบน production (Vercel) เท่านั้น
- localhost จะ error `fetchCoursesViaApi` เป็นเรื่องปกติ ไม่ต้องแก้
- Credentials อยู่ใน Vercel env vars

### 6. Stale closure pattern
- useEffect ที่ขึ้นกับ async-loaded props → ใช้ ref หรือ `clinicSettingsLoaded` flag

---

## 📁 โครงสร้างไฟล์หลัก
```
src/
├── App.jsx                  — Root routing + auth + clinic settings
├── firebase.js              — Firebase init (app, auth, db, appId)
├── constants.js             — SESSION_TIMEOUT_MS, DEFAULT_CLINIC_SETTINGS
├── utils.js                 — Helpers, defaultFormData, clinical calcs
├── lib/
│   └── brokerClient.js      — API client wrapper for /api/proclinic/*
├── hooks/
│   └── useTheme.js          — Dark/Light/Auto theme hook
├── pages/
│   ├── AdminDashboard.jsx   — หน้าหลัก admin (COMPLEX — ดู docs/DASHBOARD.md)
│   ├── AdminLogin.jsx       — Login page
│   ├── PatientForm.jsx      — หน้ากรอกฟอร์มผู้ป่วย
│   └── PatientDashboard.jsx — หน้าข้อมูลผู้ป่วย (ดู docs/PATIENT_DASHBOARD.md)
├── components/
│   ├── CustomFormBuilder.jsx — Admin form template builder
│   ├── PrintTemplates.jsx   — OfficialOPDPrint + DashboardOPDPrint
│   ├── ClinicSettingsPanel.jsx — Admin settings (name, color, logo, phone, cooldown)
│   ├── ClinicLogo.jsx       — Logo component
│   └── ThemeToggle.jsx      — Dark/light mode toggle
api/proclinic/               — Vercel Serverless Functions (ดู docs/API.md)
├── create.js, update.js, delete.js, courses.js, search.js, login.js
└── _lib/ (session.js, scraper.js, fields.js)
broker-extension/             — Chrome Extension MV3 (ดู docs/EXTENSION.md)
├── background.js, content-loverclinic.js, manifest.json, popup.*
functions/
└── index.js                 — Cloud Function: onPatientSubmit → FCM push
```

---

## 🔑 Environment / Config
- Firebase project: `loverclinic-opd-4c39b`
- Vercel: deploy จาก root → `vercel --prod`
- Production URL: https://lover-clinic-app.vercel.app
- VAPID Key: อยู่ใน AdminDashboard.jsx constant `VAPID_KEY`
- Cloud Functions deploy: `firebase deploy --only functions` จาก root
- ProClinic credentials: Vercel env vars (`PROCLINIC_ORIGIN`, `PROCLINIC_EMAIL`, `PROCLINIC_PASSWORD`)

---

## 🎨 UI/UX Design Direction
- Dark theme: แดง ดำ ขาว ไฟ — เข้ากับ brand คลินิก (dark, premium, masculine)
- Glowing effects: avatar red ring, card borders, section headers, course cards
- Light theme: CSS var mapping (`--bg-card`, `--tx-heading` etc.) ใน index.css
- Contact buttons: LINE (green #06C755) + Call (red accent) separated by divider
- Sync success button: สีเขียว เข้มพอมองเห็นทั้ง dark/light
