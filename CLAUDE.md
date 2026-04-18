# LoverClinic App — Claude Master Index

> อัพเดท: 2026-04-19 | Stack: React 19 + Vite 8 + Firebase + Tailwind 3.4 | Deploy: Vercel
> Tests: Vitest 1054+ | Playwright E2E 40+ | RTL 40+ | Phase: 8/12 DONE + audit clean

---

## 🔥 META-RULE — NEVER FORGET (2026-04-19, iron-clad)

**ยิ่งทำงาน ยิ่งเรียนรู้ ยิ่งเก่งขึ้น.** Every session must sharpen the toolkit:
- Bug found → fix + add adversarial test + add/update an audit skill invariant
- New pattern/convention → document in CLAUDE.md or `.claude/rules/` + make a skill if greppable
- Tool would've prevented it → propose + install low-risk cheap wins
- End of session → verify new skills fire + commit `.claude/**` alongside code

Full rule: `.claude/rules/07-continuous-improvement.md`.
Memory mirror: `~/.claude/projects/F--LoverClinic-app/memory/feedback_continuous_improvement.md`.
Survives context compaction because it's at the TOP of both index files (always-loaded).

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
> ยกเว้น:
> - `broker-extension/` → commit เฉยๆ ไม่ต้อง vercel --prod (เป็น Chrome Extension)
> - **หน้า Backend (`src/components/backend/`, `src/pages/BackendDashboard.jsx`)** → **commit อย่างเดียว ไม่ต้อง deploy** (ประหยัด Vercel cost, ทดสอบ local แทน)

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
| Cookie Relay Extension (Chrome Extension) | `docs/EXTENSION.md` |
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
- แก้ `cookie-relay/*.js` แล้วต้อง reload ที่ `chrome://extensions` ด้วยตัวเอง
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
- **429 Rate Limit**: ถ้าเจอ `API Error: Request rejected (429)` → รอ 5-10 วินาทีแล้ว retry อัตโนมัติ หรือ refresh หน้า (ProClinic/Vercel มี rate limit)

### 10. Backend ใช้ข้อมูลจาก Firestore เท่านั้น (กฎเหล็ก)
- หน้า Backend Dashboard **ห้าม fetch ข้อมูลจาก ProClinic โดยตรง** ระหว่างใช้งาน
- ข้อมูลทั้งหมด (สินค้า, คอร์ส, แพทย์, ลูกค้า) ต้อง **ดูดมาเก็บใน Firestore ก่อน** (clone/sync)
- แล้ว**ใช้จาก Firestore** (`be_*`, `master_data/*`) เท่านั้น
- ถ้าข้อมูลไม่มี → ไปดูดมาเก็บก่อน → แล้วค่อยใช้จากที่ดูดมา
- Flow: ProClinic → sync/clone → Firestore → Backend UI (**ทางเดียว**)
- **ถ้าเจอข้อมูลที่ยังไม่มี** → ไปสร้างปุ่ม sync ใหม่ใน **หน้าข้อมูลพื้นฐาน** → sync มาเก็บ → แล้วค่อยใช้
- **ห้าม fetch จาก ProClinic นอกหน้าข้อมูลพื้นฐาน** — ทุก sync/clone ต้องผ่านหน้านี้หน้าเดียว

### 6. Stale closure pattern
- useEffect ที่ขึ้นกับ async-loaded props → ใช้ ref หรือ `clinicSettingsLoaded` flag

### 7. Firestore REST API — ต้องใส่ updateMask เสมอ
- `firestorePatch()` ใน serverless functions ต้องใส่ `updateMask.fieldPaths` ใน query string
- ถ้าไม่ใส่ → Firestore REST API จะ **ลบ field ทั้งหมด** ที่ไม่ได้ส่งไป (PATCH = replace entire doc)
- Pattern ที่ถูกต้อง:
  ```js
  const mask = Object.keys(fields).map(f => `updateMask.fieldPaths=${f}`).join('&');
  fetch(`${FIRESTORE_BASE}/${path}?${mask}`, { method: 'PATCH', body: JSON.stringify({ fields }) });
  ```

### 8. Chat system — Echo & Reply
- **FB echo**: subscribe `message_echoes` ทั้งใน App Webhook Settings และ `POST /{PAGE_ID}/subscribed_apps` ด้วย
- **Reply**: FB เท่านั้นที่ตอบจากแอปเราได้ (มี echo เห็นว่าใครตอบแล้ว)
- **LINE**: ตอบจากแอปเราไม่ได้ (ไม่มี echo) → แสดง "ตอบแชท LINE ผ่าน LINE OA Chat เท่านั้น"
- **lastMessage**: อัพเดทตามข้อความล่าสุดไม่ว่าใครส่ง (customer, echo, admin)
- **displayName/pictureUrl**: แสดงของลูกค้าเสมอ ห้ามอัพเดทตามคนตอบ
- **Chat history**: หน้าละ 20 รายการ + auto-delete เก่ากว่า 7 วัน

### 9. Import from ProClinic
- ค้นหาลูกค้าจาก HN / เบอร์โทร / เลขบัตร ปชช → ดึงข้อมูลทั้งหมด + คอร์ส + นัดหมาย
- `customer.js` action `fetchPatient` → ดึง edit page + `reverseMapPatient()` แปลง ProClinic fields → patientData
- **Duplicate check**: ตรวจ HN / เบอร์ / เลขบัตร ซ้ำกับ sessions ที่มีอยู่
  - ซ้ำ + sync ปกติ → เตือน + บล็อก
  - ซ้ำ + หลุด sync (`brokerStatus !== 'done'`) → auto resync
  - ไม่ซ้ำ → สร้าง session `IMP-XXXXXX`
- **ห้ามใส่ `isPermanent: true`** ใน imported session → จะถูก filter ออกจากหน้าประวัติ

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
│   ├── ChatPanel.jsx        — แชท FB/LINE: reply (FB only), echo, saved replies, history
│   ├── ClinicLogo.jsx       — Logo component
│   └── ThemeToggle.jsx      — Dark/light mode toggle
api/webhook/                 — Chat webhook endpoints
├── facebook.js (webhook handler + echo), line.js, send.js (ส่งข้อความ FB/LINE)
└── saved-replies.js (proxy FB saved_message_responses)
api/proclinic/               — Vercel Serverless Functions — 5 consolidated endpoints (ดู docs/API.md)
├── customer.js (create/update/delete/search/fetchPatient/list), deposit.js (submit/update/cancel/options)
├── connection.js (login/credentials/clear), appointment.js (create/update/delete), courses.js
├── treatment.js (list/get/create/update/delete/listItems), master.js (syncProducts/Doctors/Staff/Courses)
└── _lib/ (session.js, scraper.js, fields.js, auth.js)
cookie-relay/                — Cookie Relay Extension MV3 (ดู docs/EXTENSION.md)
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
- Facebook App ID: `959596076718659`
- Facebook Page ID: `431688823362798`
- Graph API version: `v25.0`

---

## 🎨 UI/UX Design Direction
- Dark theme: แดง ดำ ขาว ไฟ — เข้ากับ brand คลินิก (dark, premium, masculine)
- Glowing effects: avatar red ring, card borders, section headers, course cards
- Light theme: CSS var mapping (`--bg-card`, `--tx-heading` etc.) ใน index.css
- Contact buttons: LINE (green #06C755) + Call (red accent) separated by divider
- Sync success button: สีเขียว เข้มพอมองเห็นทั้ง dark/light

---

## 🧪 Testing Infrastructure
- **Vitest 4.1.3**: 214+ unit/integration tests (`npm test`)
  - Firestore CRUD, billing calc, course deduction, Thai date, clean()
  - RTL component tests (CustomerCard, course index, remove item, badges)
- **Playwright**: 40+ E2E tests (`npm run test:e2e`)
  - Real browser: tab nav, modal open/close, form validation, buy-deduct
  - Auth: Firebase REST API → token inject via addInitScript
- **Config**: vite.config.js `test.include: ['tests/*.test.js', 'tests/*.test.jsx']`
- **E2E dir**: `tests/e2e/` (excluded from Vitest)

---

## 📦 Backend Files (Phase 1-6)
```
src/lib/
├── backendClient.js     — Firestore CRUD for be_* collections + course deduction
├── brokerClient.js      — API client for /api/proclinic/* + listAllCustomers
├── cloneOrchestrator.js — Smart clone (detect changes + incremental + bulk)
└── courseUtils.js        — Pure functions: parseQty, deductQty, reverseQty, buildQty

src/components/backend/
├── CloneTab.jsx          — Search + clone + bulk clone all customers
├── CustomerListTab.jsx   — Card grid of cloned customers
├── CustomerCard.jsx      — Reusable card (search/cloned modes)
├── CustomerDetailView.jsx — 3-column detail + ExchangeModal + ShareModal + AddQtyModal
├── MasterDataTab.jsx     — Sync + display + course CRUD
├── AppointmentTab.jsx    — Resource time grid + CRUD
└── SaleTab.jsx           — Sale CRUD + buy modal + auto-assign courses

src/pages/
└── BackendDashboard.jsx  — Container: 5 tabs + saleMode + deep link
```

---

## 🐛 Major Bugs Fixed (2026-04-09)
1. **Invoice race condition** — 2 sales same second → same INV number → overwrite. Fix: atomic runTransaction
2. **Course index mismatch** — Form dedup 156→unique but validation used raw Firestore index. Fix: name+product lookup
3. **Purchased course not deducted** — Buy in form → assign full qty → forgot to deduct used. Fix: deduct AFTER assign
4. **Payment status mismatch** — Treatment sends '2' but SaleTab expects 'paid'. Fix: statusMap
5. **IIFE click handlers** — Nested (() => {})() blocked button clicks. Fix: extract to proper component
6. **overflow-hidden** — 128 courses clipped by card overflow. Fix: max-h + overflow-y-auto
7. **removePurchasedItem** — number id vs string id. Fix: String() coercion
8. **scrollToError** — Missing data-field attributes. Fix: added to seller/payment sections
9. **syncCourses** — HTML scraper lost product qty. Fix: switched to JSON API endpoint

---

## 📋 Onboarding สำหรับ Claude แชทใหม่

**⭐ ต่องานจากแชทก่อน → อ่าน `SESSION_HANDOFF.md` เป็นอันดับแรก (มี next action ชัดเจน)**

ลำดับการอ่าน memory:
1. **Memory: `SESSION_HANDOFF.md`** ⭐ — สถานะล่าสุด + commits + next action
2. **ไฟล์นี้** (`CLAUDE.md`) — กฎเหล็ก + stack + deploy workflow
3. **Memory: `project_phase7_plan.md`** — Phase 7 detail plan (สำหรับ implement Phase 7)
4. **Memory: `project_phase7to12_replan_v2.md`** — Phase 7-12 God-level (API endpoints + validation)
5. **`CODEBASE_MAP.md`** — แผนที่โค้ด (อ่านเฉพาะ section ที่เกี่ยวกับงาน)

> Memory files อยู่ที่: `~/.claude/projects/F--LoverClinic-app/memory/`
> ดู index ทั้งหมด: `MEMORY.md` ใน memory folder

## OPD System Inspector

<important if="ต้องการดูระบบต้นฉบับ ProClinic OPD">
คุณมีเครื่องมือ opd.js เข้าดูระบบ OPD ต้นฉบับได้ทุกเมื่อ
ใช้มันก่อนสร้างทุกหน้า ทุก API ทุก form เพื่อให้ตรงกับต้นฉบับ 100%

คำสั่งหลัก:
- `node F:\replicated\scraper\opd.js intel /admin/xxx` — **GOD MODE** ได้ทุกอย่างในคำสั่งเดียว
- `node F:\replicated\scraper\opd.js look /admin/xxx` — ถ่ายหน้าจออัจฉริยะ (แล้ว Read รูปได้)
- `node F:\replicated\scraper\opd.js routes` — ดู menu ทั้งระบบ
- `node F:\replicated\scraper\opd.js forms /admin/xxx` — ดู form fields + validation
- `node F:\replicated\scraper\opd.js api GET /admin/api/xxx` — ยิง API ตรง ดู response จริง
- `node F:\replicated\scraper\opd.js network /admin/xxx` — ดักจับ API เบื้องหลัง
- `node F:\replicated\scraper\opd.js map /admin/xxx` — ดูความเชื่อมโยงข้าม module
- `node F:\replicated\scraper\opd.js dump /admin/xxx` — ดึง master data จาก dropdowns
- `node F:\replicated\scraper\opd.js trace /admin/A /admin/B` — ทำ action ที่ A ดู B เปลี่ยนไหม
- `node F:\replicated\scraper\opd.js fill /admin/xxx` — กรอก + submit + จับ API + validation
- `node F:\replicated\scraper\opd.js click /admin/xxx "ปุ่ม"` — กดปุ่ม ดูผล

ทุกคำสั่ง output JSON | ดูรูป: Read screenshots path | session หมดอายุ → `node F:\\replicated\\scraper\\quick-login.js`
</important>
