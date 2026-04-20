<important if="EVERY turn. Read before any commit, deploy, or firestore-rules change.">
## 🔥 Iron-Clad Rules — NEVER break

### A. Bug-Blast Revert
ถ้าทำ X แล้ว Y พัง → **ถอด X ออกทันที** ไม่ต้องถาม.
**Why:** 2026-04-19 deploy `8fc2ed9` ของ session ก่อนทับ Console rules ที่เปิดไว้ → webhook + sync write 403 → chat + ปฏิทินตาย. Revert (`git reset --hard c0d0ffc` + new commit) เป็น safety net.

### B. Probe-Deploy-Probe สำหรับ `firestore:rules`
ทุกครั้งที่จะ `firebase deploy --only firestore:rules` — ไม่มีข้อยกเว้น:
1. `curl -X POST .../chat_conversations?documentId=test-probe-$(date +%s) -d '{"fields":{"probe":{"booleanValue":true}}}'` → ต้อง 200
2. `curl -X PATCH .../pc_appointments/test-probe?updateMask.fieldPaths=probe -d '{"fields":{"probe":{"booleanValue":true}}}'` → ต้อง 200
3. `curl -X PATCH .../clinic_settings/proclinic_session?updateMask.fieldPaths=probe -d '{"fields":{"probe":{"booleanValue":true}}}'` → ต้อง 200 (cookie-relay extension writes)
4. `curl -X PATCH .../clinic_settings/proclinic_session_trial?updateMask.fieldPaths=probe -d '{"fields":{"probe":{"booleanValue":true}}}'` → ต้อง 200 (cookie-relay trial mode)
5. `firebase deploy --only firestore:rules`
6. รัน probe 1-4 ซ้ำ → ถ้า 403 ตัวไหน = revert deploy ทันที (`git checkout <last-good-commit> -- firestore.rules` + redeploy)
7. ลบ probe docs ทิ้ง + PATCH `clinic_settings/proclinic_session*` ด้วย `{"fields":{}}` เพื่อ strip probe field (sentinel ไม่ให้ปนกับ cookies จริง)

**Why:** Multiple serverless/extension paths เขียน Firestore ผ่าน REST **โดยไม่มี Firebase auth** — ต้องเปิด write rules ไว้ทุกจุดที่ใช้เส้นนี้:
- `chat_conversations` — Webhook FB Messenger / LINE (`api/webhook/*`)
- `pc_*` collection — ProClinic mirror sync (`api/proclinic/courses.js` + อื่นๆ)
- `clinic_settings/proclinic_session` + `_trial` — Cookie Relay Chrome Extension (PATCH via REST ตรง, ไม่มี Bearer token)

ถ้า probe ตัวใดตัวหนึ่ง 403 = ลืมเปิด rule = ระบบพัง. Probe list นี้ต้องเพิ่มขึ้นเมื่อมี unauth-write path ใหม่. Deploy ทุกครั้ง = อ่าน list นี้ก่อน.

**V1 + V9 anti-examples**:
- V1 (2026-04-19, deploy `8fc2ed9`) — ทับ Console rule ที่เปิด `chat_conversations` + `pc_*` → chat + ปฏิทินตาย
- V9 (2026-04-20, deploy `5636eb4` = Phase 11.2) — **ทับ Console rule ที่เปิด `clinic_settings/proclinic_session*` → cookie-relay extension เขียน cookie ไม่ได้ → frontend "ทดสอบการเชื่อมต่อ" fail ทุกครั้ง** (V1 ซ้ำรอบ 2 เพราะ probe list ขาด 2 endpoints). Fix: commit `34ef493` เพิ่ม explicit rules + probe list extended.

**Pattern เข้าใจให้ชัด**: ทุกครั้งที่ `firebase deploy --only firestore:rules` = file-in-repo ทับ live-rules-on-Firebase 100%. Console-side edit ไม่ reflect ใน file = หายหลัง deploy. Fix: ถ้าเห็น Console edit → copy กลับมาลง file ก่อน → ค่อย deploy.

### C. Anti-Vibe-Code — AI ฉลาด แต่คนใช้ต้องฉลาดกว่า AI
ห้ามละเมิด 3 failure modes ของ vibe-code:

**C1. Rule of 3 — Shared-first, never hardcode-first**
- Pattern ปรากฏ ≥ 3 ที่ → extract shared ทันที (2 ที่ OK, 3 ที่ = bug รออยู่)
- ก่อนเขียน helper/component/constant ใหม่ → **grep หา existing ก่อน**ใน `src/utils.js`, `src/lib/**`, `src/components/**`
- ถ้ามี similar แต่ไม่ตรง → ขยาย API ด้วย backward-compat props (ไม่ fork)
- Canonical shared modules (update list นี้เมื่อเพิ่ม):
  - `src/utils.js` — `bangkokNow`, `thaiTodayISO`, `thaiNowMinutes`, `thaiYearMonth`, `THAI_MONTHS`, `YEARS_BE/CE`, `hexToRgb`, `formatBangkokTime`, `defaultFormData`
  - `src/components/DateField.jsx` — date input ทุกตัว (ไม่มี local wrapper, ไม่มี raw `<input type="date">`)
  - `src/lib/scheduleFilterUtils.js` — `shouldBlockScheduleSlot`, `isSlotBooked`, `getDoctorRangesForDate`
  - `src/lib/courseUtils.js` — course qty parse/deduct
  - `src/lib/stockUtils.js` — stock primitives
  - `src/lib/financeUtils.js` — `fmtMoney`, `calcMembershipExpiry`, `parseQtyString`

**C2. Security by default**
- ห้าม secrets ใน `src/` หรือ `api/` — Vercel env vars only. `firebaseConfig` API key ยกเว้น (Firebase public — Firestore rules ต้อง gate จริง)
- ห้าม `Math.random().toString(36)` สำหรับ URL token → ใช้ `crypto.getRandomValues(new Uint8Array(16))` (128 bits)
- ห้าม `user.uid` / admin identifiers ใน world-readable docs (clinic_schedules, patientLinkToken, etc.)
- ห้าม `allow read, write: if true` ใน firestore/storage.rules **ยกเว้น** `pc_*` + `chat_conversations` ที่ comment ไว้ว่า "server REST has no firebase-admin SDK — open until service-account ships"
- Commit history = permanent → leak credential = rotate key ทันที

**C3. Lean schema — no premature collections**
- New Firestore collection ต้องผ่าน 3 criteria: (1) มี feature READ จริง (2) มี feature WRITE จริง (3) shape ใส่ existing doc ไม่ได้
- Denormalize field บน existing doc > สร้าง collection ใหม่. 99% ของคลินิก query ทำได้ client-side filter.
- ห้าม `be_*_log` / `be_*_history` collection ถ้าไม่มี reader จริง — เก็บ array บน parent doc พอ

### D. Continuous Improvement (iron-clad 2026-04-19)
**ยิ่งทำงาน ยิ่งเรียนรู้ ยิ่งเก่งขึ้น** — ทุก session ต้องเหลาเครื่องมือให้คมขึ้น.
- Bug found → fix + **adversarial test** + update/create audit skill invariant + เพิ่ม skill ใน `audit-all`
- New pattern → document ใน rules หรือสร้าง skill greppable
- Tool ที่ป้องกัน bug → install low-risk ทันที, big-risk รอ user ok
- End of session → verify skills ใหม่ fire ได้ + commit `.claude/**` ไปกับโค้ด

### Anti-patterns (all 4 rules)
- Fix bug แต่ไม่เพิ่ม test + skill → regression guaranteed
- Skill ไม่มี grep patterns / invariant numbers → documentation ไม่ใช่ audit
- Parallel rule files แก้ขนานกัน → edit THIS file แทน

### Enforcement
- Audit: `/audit-anti-vibe-code` (AV1–AV12, อยู่ใน `/audit-all`)
- Project rule: this file
- User memory mirrors: `feedback_continuous_improvement.md` + `feedback_anti_vibe_code.md` (don't let diverge)
</important>
