# LoverClinic App — Claude Master Index

> อัพเดท: 2026-03-25 | Stack: React 19 + Vite + Firebase + Tailwind | Deploy: Vercel

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
| Bug ที่เจอมา + fix + สิ่งที่ยังค้างอยู่ | `docs/BUGS.md` |
| Component details (utils, PatientForm, etc.) | `CODEBASE_MAP.md` (อ่านแค่ section ที่ต้องการ) |

---

## 🚨 CRITICAL — อ่านก่อนทำทุกอย่าง

### 1. Bug ที่ยังค้างอยู่ (UNRESOLVED)
**กด Report ตอน Unread → extension submit ProClinic รัวๆ**
- root cause + fix plan อยู่ใน `docs/BUGS.md`
- ยังไม่ได้ implement fix จริง

### 2. Firestore snapshot fires 2x
- write ที่มี `serverTimestamp()` → snapshot fires 2 ครั้ง (local estimate + server confirm)
- ดู pattern ใน `docs/BUGS.md`

### 3. Vite OXC parser
- ห้ามใช้ IIFE `{(() => {...})()}` ใน JSX → crash
- ใช้ pre-computed variable แทน

### 4. Extension ไม่ auto-deploy
- แก้ `broker-extension/*.js` แล้วต้อง reload ที่ `chrome://extensions` ด้วยตัวเอง
- **ไม่ต้อง reload**: `popup.html`, `popup.js`
- **ต้อง reload**: `background.js`, `manifest.json`, `content-loverclinic.js`

---

## 📁 โครงสร้างไฟล์หลัก
```
src/
├── App.jsx                  — Root routing + auth + clinic settings
├── firebase.js              — Firebase init (app, auth, db, appId)
├── constants.js             — SESSION_TIMEOUT_MS, DEFAULT_CLINIC_SETTINGS
├── utils.js                 — Helpers, defaultFormData, clinical calcs
├── pages/
│   ├── AdminDashboard.jsx   — หน้าหลัก admin (COMPLEX — ดู docs/DASHBOARD.md)
│   └── PatientForm.jsx      — หน้ากรอกฟอร์มผู้ป่วย
├── components/
│   ├── CustomFormBuilder.jsx
│   ├── PrintTemplates.jsx
│   ├── ClinicSettingsPanel.jsx
│   └── ClinicLogo.jsx
broker-extension/
├── background.js            — Service Worker หลัก (COMPLEX — ดู docs/EXTENSION.md)
├── content-loverclinic.js   — Bridge script บน vercel app
├── manifest.json
└── popup.html / popup.js
functions/
└── index.js                 — Cloud Function: onPatientSubmit → FCM push
```

---

## 🔑 Environment / Config
- Firebase project: `loverclinic-opd-4c39b`
- Vercel: deploy จาก root → `vercel --prod`
- VAPID Key: อยู่ใน AdminDashboard.jsx constant `VAPID_KEY`
- Cloud Functions deploy: `firebase deploy --only functions` จาก root
