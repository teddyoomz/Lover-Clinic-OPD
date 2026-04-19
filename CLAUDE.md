# LoverClinic App — Claude Master Index

> อัพเดท: 2026-04-19 | Stack: React 19 + Vite 8 + Firebase + Tailwind 3.4 | Deploy: Vercel
> Tests: Vitest 1054+ | Playwright E2E 40+ | RTL 40+ | Phase: 8/12 DONE

---

## 🔥 Rules — อ่านก่อนทำอะไรเสมอ (START HERE)

**⭐ MANDATORY FIRST READ**: [`.claude/rules/00-session-start.md`](.claude/rules/00-session-start.md) — character, expectations, all iron-clad rules, past violations, tool/skill decision tree, workflow checklist. Read every new session + after any compaction.

| ไฟล์ | ใช้เมื่อ |
|---|---|
| [`00-session-start.md`](.claude/rules/00-session-start.md) | **ทุก session start** — single-source summary of everything |
| [`01-iron-clad.md`](.claude/rules/01-iron-clad.md) | ทุก turn — A/B/C/D (+ E backend-firestore-only referenced from 00) |
| [`02-workflow.md`](.claude/rules/02-workflow.md) | Commit / push / deploy / test |
| [`03-stack.md`](.claude/rules/03-stack.md) | Firestore / Vite / React / Backend / ProClinic / Chat gotchas |
| [`04-thai-ui.md`](.claude/rules/04-thai-ui.md) | UI / colors / dates / Thai culture |

**Iron-clad ย่อ (6 ข้อ ห้ามลืม):**
- **A.** ทำ X แล้ว Y พัง → ถอด X ทันที ไม่ต้องถาม
- **B.** `firebase deploy --only firestore:rules` ต้อง probe webhook + sync writes ก่อน/หลัง — 403 = revert ทันที
- **C.** Rule of 3 / crypto tokens / ห้าม uid ใน public doc / ห้าม `allow:if true` ยกเว้น pc_* + chat_conversations
- **D.** ทุก bug → adversarial test + audit skill invariant + register ใน `audit-all`
- **E. 🆕 Backend = Firestore ONLY** — `src/components/backend/**` + `BackendDashboard.jsx` ห้าม import `brokerClient` หรือใช้ `/api/proclinic/*` ยกเว้น `MasterDataTab.jsx` (sanctioned one-way sync). `be_*` = OUR data, ไม่ mirror เป็น `pc_*`. **ละเมิดใน Phase 9 2026-04-19 — anti-example ใน `00-session-start.md`**
- **F. Triangle Rule** — ก่อน/ระหว่างทุก feature: (1) ProClinic จริงผ่าน `opd.js intel|click|fill|network` (2) plan memory (3) grep โค้ดเรา. ขาด 1 = drift. ห้ามเดา URL/method ถ้าไม่ได้ capture.

---

## 🗂️ สารบัญ docs/ — อ่านไฟล์ไหนเมื่อไหร่

| งาน | ไฟล์ |
|-----|------|
| ภาพรวมระบบ, Firestore schema, session lifecycle | `docs/ARCH.md` |
| AdminDashboard state/functions/broker logic | `docs/DASHBOARD.md` |
| Cookie Relay Extension (Chrome) | `docs/EXTENSION.md` |
| API layer (Vercel serverless → ProClinic) | `docs/API.md` |
| PatientDashboard (ผู้ป่วย, courses, sync) | `docs/PATIENT_DASHBOARD.md` |
| Bug เจอมา + fix + design patterns | `docs/BUGS.md` |
| Component details (utils, PatientForm, etc.) | `CODEBASE_MAP.md` (อ่านเฉพาะ section ที่ต้องการ) |

---

## 📁 โครงสร้างไฟล์หลัก

```
src/
├── App.jsx                    — Root routing + auth + clinic settings
├── firebase.js                — Firebase init
├── constants.js               — SESSION_TIMEOUT_MS, DEFAULT_CLINIC_SETTINGS
├── utils.js                   — Thai TZ helpers, defaultFormData, clinical calcs
├── lib/
│   ├── brokerClient.js        — /api/proclinic/* wrapper
│   ├── backendClient.js       — be_* Firestore CRUD
│   ├── cloneOrchestrator.js   — Smart clone
│   ├── courseUtils.js         — Course qty parse/deduct
│   ├── stockUtils.js          — Stock primitives
│   ├── financeUtils.js        — fmtMoney, calcMembershipExpiry
│   └── scheduleFilterUtils.js — shouldBlockScheduleSlot, getDoctorRangesForDate
├── hooks/useTheme.js
├── pages/
│   ├── AdminDashboard.jsx     — หน้าหลัก admin (→ docs/DASHBOARD.md)
│   ├── AdminLogin.jsx
│   ├── PatientForm.jsx
│   ├── PatientDashboard.jsx   — (→ docs/PATIENT_DASHBOARD.md)
│   └── BackendDashboard.jsx   — 5 tabs: Clone, CustomerList, MasterData, Appointment, Sale
├── components/
│   ├── DateField.jsx          — ⭐ canonical date input (ทุก picker ใช้ตัวนี้)
│   ├── CustomFormBuilder.jsx, PrintTemplates.jsx
│   ├── ClinicSettingsPanel.jsx, ChatPanel.jsx
│   ├── ClinicLogo.jsx, ThemeToggle.jsx
│   └── backend/
│       ├── CloneTab.jsx, CustomerListTab.jsx, CustomerCard.jsx
│       ├── CustomerDetailView.jsx, MasterDataTab.jsx
│       └── AppointmentTab.jsx, SaleTab.jsx
api/
├── webhook/                   — Chat: facebook.js, line.js, send.js, saved-replies.js
├── proclinic/                 — 5 consolidated endpoints (→ docs/API.md)
│   ├── customer.js, deposit.js, connection.js, appointment.js
│   ├── courses.js, treatment.js, master.js
│   └── _lib/ (session, scraper, fields, auth)
cookie-relay/                  — MV3 Chrome Extension (→ docs/EXTENSION.md)
functions/index.js             — Cloud Function: onPatientSubmit → FCM push
```

---

## 🔑 Environment / Config

- **Firebase project**: `loverclinic-opd-4c39b`
- **Production URL**: https://lover-clinic-app.vercel.app
- **VAPID Key**: `AdminDashboard.jsx` const `VAPID_KEY`
- **Cloud Functions deploy**: `firebase deploy --only functions` จาก root
- **ProClinic credentials**: Vercel env vars (`PROCLINIC_ORIGIN`, `PROCLINIC_EMAIL`, `PROCLINIC_PASSWORD`)
- **Facebook**: App ID `959596076718659`, Page ID `431688823362798`, Graph API `v25.0`
- **Branches**: `master` (prod), `develop` (dev) — merge develop → master ก่อน deploy

---

## 🧪 Testing Infrastructure

- **Vitest 4.1.3**: unit + integration (`npm test`)
- **Playwright**: E2E (`npm run test:e2e`), `tests/e2e/` dir
- **Config**: `vite.config.js` `test.include: ['tests/*.test.js', 'tests/*.test.jsx']`
- **At master**: integration tests with `be_*` collections → `PERMISSION_DENIED` (setup.js ไม่มี Firebase signin). Focus pure unit: `dateFormat.test.js`, `utils.test.js` (109+ PASS).

---

## 🐛 Major Bugs Fixed (historical reference)

1. **Invoice race (2026-04-09)** — 2 sales same second → same INV → overwrite. Fix: `runTransaction`
2. **Course index mismatch** — form dedup 156→unique, validation ใช้ raw Firestore index. Fix: name+product lookup
3. **Purchased course not deducted** — assign full qty, forgot deduct used. Fix: deduct AFTER assign
4. **Payment status mismatch** — Treatment ส่ง `'2'` SaleTab คาด `'paid'`. Fix: statusMap
5. **IIFE click handlers** — nested `(() => {})()` block clicks. Fix: extract component
6. **overflow-hidden** — 128 courses clipped. Fix: `max-h + overflow-y-auto`
7. **removePurchasedItem** — number id vs string id. Fix: `String()`
8. **scrollToError** — missing `data-field`. Fix: added to seller/payment
9. **syncCourses** — HTML scraper lost qty. Fix: switched to JSON API
10. **Firestore rules regression (2026-04-19)** — strict rules deploy blocked webhook + sync writes → chat + calendar dead. Fix: `git reset --hard c0d0ffc` + commit `0d74957` restoring relaxed rules for `pc_*` + `chat_conversations`. **ต้นเหตุรูล B.**

---

## 📋 Onboarding สำหรับ Claude แชทใหม่

⭐ **ต่องานจากแชทก่อน → อ่าน `SESSION_HANDOFF.md` เป็นอันดับแรก** (next action ชัดเจน)

ลำดับ:
1. **Memory `SESSION_HANDOFF.md`** ⭐ — สถานะล่าสุด + commits + next action
2. **ไฟล์นี้** — stack / paths / env
3. **`.claude/rules/01-04`** — กฎเหล็ก (auto-load ตาม context)
4. **`CODEBASE_MAP.md`** — เฉพาะ section ที่เกี่ยวกับงาน
5. **Memory `project_phase*.md`** — ถ้าทำ feature ใน phase นั้น

> Memory: `~/.claude/projects/F--LoverClinic-app/memory/` (ดู `MEMORY.md` index)

---

## OPD System Inspector

<important if="ต้องการดูระบบต้นฉบับ ProClinic OPD">
ใช้ `opd.js` **ก่อนสร้างหน้า/API/form ทุกครั้ง** — Triangle Rule: ProClinic + plan + code.

```bash
node F:\replicated\scraper\opd.js intel /admin/xxx      # GOD MODE
node F:\replicated\scraper\opd.js look /admin/xxx        # screenshot
node F:\replicated\scraper\opd.js routes                 # menu ทั้งระบบ
node F:\replicated\scraper\opd.js forms /admin/xxx       # form fields + validation
node F:\replicated\scraper\opd.js api GET /admin/api/xxx
node F:\replicated\scraper\opd.js network /admin/xxx     # capture bg APIs
node F:\replicated\scraper\opd.js map /admin/xxx         # cross-module refs
node F:\replicated\scraper\opd.js dump /admin/xxx        # dropdown master data
node F:\replicated\scraper\opd.js trace /admin/A /admin/B  # action flow
node F:\replicated\scraper\opd.js fill /admin/xxx        # submit + capture API
node F:\replicated\scraper\opd.js click /admin/xxx "ปุ่ม"
```

Output = JSON | รูป: Read screenshots path | session หมด → `node F:\replicated\scraper\quick-login.js`
</important>
