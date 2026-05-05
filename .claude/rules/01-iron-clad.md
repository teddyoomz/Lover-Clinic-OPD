<important if="EVERY turn. Read before any commit, deploy, or firestore-rules change.">
## 🔥 Iron-Clad Rules — NEVER break

### A. Bug-Blast Revert
ถ้าทำ X แล้ว Y พัง → **ถอด X ออกทันที** ไม่ต้องถาม.
**Why:** 2026-04-19 deploy `8fc2ed9` ของ session ก่อนทับ Console rules ที่เปิดไว้ → webhook + sync write 403 → chat + ปฏิทินตาย. Revert (`git reset --hard c0d0ffc` + new commit) เป็น safety net.

### B. Probe-Deploy-Probe สำหรับ `firestore:rules`

**🚨 CRITICAL URL CONVENTION (2026-05-06 lesson lock — Phase 19.0 V15 #22)**:
ALL probe URLs MUST include the `artifacts/{APP_ID}/public/data/` prefix.
Production data lives at this canonical path; bare `/{collection}` URLs
hit the default-deny limbo and return spurious 403s that look like rule
drift. Phase 19.0 V15 #22 wasted 30 min on a false alarm because the
simplified `.../chat_conversations` shorthand below was interpreted as
a literal URL.

```
APP_ID="loverclinic-opd-4c39b"
BASE="https://firestore.googleapis.com/v1/projects/loverclinic-opd-4c39b/databases/(default)/documents"
PREFIX="artifacts/$APP_ID/public/data"
# All probe URLs use $BASE/$PREFIX/<collection>/<doc-id> — never $BASE/<collection>/<doc-id>.
```

**Per local-only directive 2026-05-06**: deploys are now user-triggered only;
this rule applies when an explicit rules deploy is authorized (rare). The
default workflow is local-only (per `feedback_local_only_no_deploy.md`).

ทุกครั้งที่จะ `firebase deploy --only firestore:rules` — ไม่มีข้อยกเว้น:
1. `curl -X POST $BASE/$PREFIX/chat_conversations?documentId=test-probe-$(date +%s) -d '{"fields":{"probe":{"booleanValue":true}}}'` → ต้อง 200
2. `curl -X PATCH $BASE/$PREFIX/pc_appointments/test-probe?updateMask.fieldPaths=probe -d '{"fields":{"probe":{"booleanValue":true}}}'` → ต้อง 200
3. `curl -X PATCH $BASE/$PREFIX/clinic_settings/proclinic_session?updateMask.fieldPaths=probe -d '{"fields":{"probe":{"booleanValue":true}}}'` → ต้อง 200 (cookie-relay extension writes)
4. `curl -X PATCH $BASE/$PREFIX/clinic_settings/proclinic_session_trial?updateMask.fieldPaths=probe -d '{"fields":{"probe":{"booleanValue":true}}}'` → ต้อง 200 (cookie-relay trial mode)
5. **V23 (2026-04-26) + V27 refinement (2026-04-26)** — anon Firebase auth + CREATE+PATCH opd_sessions:
   ```
   # Step A: provision anonymous ID token
   ANON_TOKEN=$(curl -s -X POST \
     "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$FIREBASE_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"returnSecureToken":true}' | jq -r .idToken)
   # Step B: CREATE probe doc with isArchived=true + status=completed
   #         CRITICAL (V27 lesson): MUST set isArchived:true OR status:'completed'
   #         on CREATE. Old pattern (status:'pending') made probes appear in
   #         the patient queue UI as "ไม่ระบุชื่อ" entries.
   curl -X POST "$BASE/$PREFIX/opd_sessions?documentId=test-probe-anon-$(date +%s)" \
     -H "Authorization: Bearer $ANON_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"fields":{"status":{"stringValue":"completed"},"isArchived":{"booleanValue":true},"patientData":{"mapValue":{"fields":{}}}}}'
   # Step C: PATCH a whitelisted field — proves V23 hasOnly path works
   curl -X PATCH "$BASE/$PREFIX/opd_sessions/test-probe-anon-$(date +%s)?updateMask.fieldPaths=isUnread" \
     -H "Authorization: Bearer $ANON_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"fields":{"isUnread":{"booleanValue":true}}}'
   # → ต้อง 200 (patient form submit + dashboard course-refresh path)
   # FIREBASE_API_KEY = web API key from Firebase Console → Project Settings
   ```
6. **Phase 18.0 (2026-05-05)** — `be_exam_rooms` CREATE probe (clinic-staff only):
   ```
   curl -X POST "$BASE/$PREFIX/be_exam_rooms?documentId=test-probe-$(date +%s)" \
     -H "Authorization: Bearer $STAFF_TOKEN" \
     -d '{"fields":{"probe":{"booleanValue":true}}}'
   # → 200 (clinic-staff). Anon → 403 (expected; rule allows staff only).
   ```
7. `firebase deploy --only firestore:rules`
8. รัน probe 1-6 ซ้ำ → ถ้า 403 ตัวไหน = revert deploy ทันที (`git checkout <last-good-commit> -- firestore.rules` + redeploy)
9. ลบ probe docs ทิ้ง:
   - DELETE `$BASE/$PREFIX/pc_appointments/test-probe-{TS}` x 2 (anon allowed)
   - PATCH `$BASE/$PREFIX/clinic_settings/proclinic_session*` ด้วย `{"fields":{}}` เพื่อ strip probe field
   - DELETE `$BASE/$PREFIX/chat_conversations/test-probe-{TS}` x 2 (BLOCKED for anon — staff only; legacy noise OK)
   - DELETE `$BASE/$PREFIX/opd_sessions/test-probe-anon-{TS}` x 2 (BLOCKED for anon — staff only)
   - DELETE `$BASE/$PREFIX/be_exam_rooms/test-probe-{TS}` x 2 (clinic-staff)
     → For periodic admin cleanup: PermissionGroupsTab "ลบ test-probe ค้าง" button
     → Calls `/api/admin/cleanup-test-probes` (admin-only, firebase-admin Firestore SDK)
   - V27 fix: CREATE step now uses isArchived=true so docs hide from queue UI even before cleanup

**Why:** Multiple serverless/extension paths + anon-auth client paths เขียน Firestore ผ่าน REST **โดยไม่มี clinic-staff auth token** — ต้องเปิด write rules ไว้ทุกจุดที่ใช้เส้นนี้:
- `chat_conversations` — Webhook FB Messenger / LINE (`api/webhook/*`)
- `pc_*` collection — ProClinic mirror sync (`api/proclinic/courses.js` + อื่นๆ)
- `clinic_settings/proclinic_session` + `_trial` — Cookie Relay Chrome Extension (PATCH via REST ตรง, ไม่มี Bearer token)
- `opd_sessions/{id}` whitelisted-field updates — PatientForm submit + PatientDashboard course-refresh from anon-auth (signInAnonymously) reachable via `?session=` / `?patient=` QR/link routes

ถ้า probe ตัวใดตัวหนึ่ง 403 = ลืมเปิด rule = ระบบพัง. Probe list นี้ต้องเพิ่มขึ้นเมื่อมี unauth-write หรือ anon-auth-write path ใหม่. Deploy ทุกครั้ง = อ่าน list นี้ก่อน.

**V1 + V9 + V23 anti-examples**:
- V1 (2026-04-19, deploy `8fc2ed9`) — ทับ Console rule ที่เปิด `chat_conversations` + `pc_*` → chat + ปฏิทินตาย
- V9 (2026-04-20, deploy `5636eb4` = Phase 11.2) — **ทับ Console rule ที่เปิด `clinic_settings/proclinic_session*` → cookie-relay extension เขียน cookie ไม่ได้ → frontend "ทดสอบการเชื่อมต่อ" fail ทุกครั้ง** (V1 ซ้ำรอบ 2 เพราะ probe list ขาด 2 endpoints). Fix: commit `34ef493` เพิ่ม explicit rules + probe list extended.
- V23 (2026-04-26) — opd_sessions update rule shipped as `if isClinicStaff()` since the initial commit (2026-03-23). Patients submitting form via QR/link (anon auth) hit PERMISSION_DENIED for the entire history of the project. The probe list never tested anon-auth paths because the V1/V9 lessons focused on unauth REST, not anon-auth client. Fix: probe list extended to cover anon-auth paths (this step 5).

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

### H-quater. master_data is NOT readable from feature code (V36-tris extension, 2026-04-29)
User directive (verbatim): "ห้ามใช้ master_data ใน backend ไม่ว่าจะใช้ทำอะไร ห้ามใช้ master_data ประมวลผลเด็ดขาด ต้องใช้ be_database เท่านั้น ป้องกันโดยลบ masterdata ดิบที่ sync มาทั้งหมดในโปรแกรม ให้มีแค่ data จาก be data เท่านั้น".

This extends iron-clad H beyond "no write-back to ProClinic" → **NO READS from `master_data/*` in feature code AT ALL**:
- Feature code (treatment / sale / stock deduct + ensure / ANY backend tab) reads ONLY from `be_*` collections.
- The ONLY exceptions remain MasterDataTab.jsx (sanctioned sync UI per H-bis) and the migrator helpers (one-shot DEV scaffolding that copies master_data → be_*).
- All other reads of `master_data/*` are violations even if "just for fallback / safety / legacy compat".
- Wipe endpoint `/api/admin/wipe-master-data` (V36-tris) deletes the raw sync artifacts so they can't accidentally be read at runtime — admin runs this once master-data → be_* migration is complete.

**Anti-pattern**: "fall back to master_data when be_* is empty" / "master_data fallback retained as a read-through safety". Both are violations of H-quater. If be_* doesn't have the data, run the migrator (one-shot, DEV-only, then wipe). Don't silently degrade to master_data reads at runtime.

**Audit trigger**: every `master_data` read in `src/lib/**` and `src/components/**` (outside MasterDataTab + migrator paths) is a violation. Grep target:
```
grep -rn "master_data" src/lib src/components | grep -v MasterDataTab | grep -v "// " | grep -v migrator
```

### D. Continuous Improvement (iron-clad 2026-04-19)
**ยิ่งทำงาน ยิ่งเรียนรู้ ยิ่งเก่งขึ้น** — ทุก session ต้องเหลาเครื่องมือให้คมขึ้น.
- Bug found → fix + **adversarial test** + update/create audit skill invariant + เพิ่ม skill ใน `audit-all`
- New pattern → document ใน rules หรือสร้าง skill greppable
- Tool ที่ป้องกัน bug → install low-risk ทันที, big-risk รอ user ok
- End of session → verify skills ใหม่ fire ได้ + commit `.claude/**` ไปกับโค้ด

### M. Data ops via local + admin SDK + pull env (iron-clad 2026-05-06)
User directive (verbatim, 2026-05-06): **"ถ้ามีการสั่งให้แก้ข้อมูล ย้ายข้อมูล ลบข้อมูล สร้างข้อมูล หรือจัดการต่างๆเกี่ยวกับข้อมูล ให้ pull env แล้วทำเลยจาก local ไม่ต้องรอ deploy"**.

When the user authorizes ANY data manipulation against production Firestore — edit / migrate / delete / create / cascade-cleanup / bulk-update / counter-reset / reclassify — execute it from LOCAL via firebase-admin SDK + pulled Vercel env. **Do NOT wait for a deploy cycle**. Data-only ops belong in scripts/ or one-shot node commands, not in shipped code.

**Required workflow**:
1. **Pull env**: `vercel env pull .env.local.prod --environment=production` (or use existing if recent — pulled-within-this-session is fine)
2. **Use admin SDK** (firebase-admin) — bypasses rules + reaches all paths. Never use unauth REST or client SDK for data ops.
3. **Use the canonical paths**: production data lives at `artifacts/{APP_ID}/public/data/{collection}` — `APP_ID = 'loverclinic-opd-4c39b'`. Bare `/{collection}` writes go to default-deny limbo.
4. **PEM key conversion**: `.env.local.prod` stores `FIREBASE_ADMIN_PRIVATE_KEY` with literal `\n` escapes — convert via `key.split('\\n').join('\n')` before passing to `cert(...)`.
5. **Two-phase**: every data-op script defaults to dry-run; commits writes only when invoked with `--apply`. Phase 18.0 + Phase 19.0 migration scripts are the canonical templates.
6. **Audit doc**: every batch op writes a doc to `artifacts/{APP_ID}/public/data/be_admin_audit/<phase>-<op>-<ts>-<rand>` with `{scanned, migrated/deleted/created, skipped, beforeDistribution, afterDistribution, appliedAt}`.
7. **Idempotency**: re-run with `--apply` must yield 0 writes. Build the skip-on-already-migrated check into the script.
8. **Forensic-trail fields** when mutating existing docs: stamp `<field>MigratedAt: serverTimestamp()` + `<field>LegacyValue: <prior>` so admin can audit + rollback if needed.

**Anti-patterns**:
- ❌ Adding a one-shot data-fix to a UI component as "do it on next page-load if state is missing X" — that's deploy-coupled + race-prone. Build a script + run from local.
- ❌ Embedding ID lists / collection paths directly in admin endpoints expecting users to invoke them via the UI — admin endpoints are for runtime ops the staff actually clicks; data migration is a developer concern, runs from local.
- ❌ Modifying production data via Firebase Console manually — leaves no audit trail + zero re-run safety. Always use a script.
- ❌ Deploying code that contains a one-shot migration → 1st-load auto-trigger. The deploy churn + rollback complexity is unjustified vs running the script from local.
- ❌ Using `db.collection('foo')` (root path) instead of `db.collection('artifacts/{APP_ID}/public/data/foo')` — surfaced live during V15 #22 (Phase 19.0) when migration script scanned 0 docs against the wrong path.

**When this rule does NOT apply**:
- Pre-deploy migration script scaffolding shipped to scripts/ before the V-deploy is OK (the *script* ships, the *--apply* runs from local later).
- Schema/rule changes that REQUIRE deploy coupling (e.g. tightening a Firestore rule) — those go through Probe-Deploy-Probe (Rule B), not data ops.
- Test-fixture scaffolding for adversarial tests — those use mock Firestore, not real prod data.

**Verify locally first**: every data op gets a dry-run on prod data BEFORE the --apply. Capture distribution; sanity-check counts; only then commit writes.

**Lesson lock**: V15 #22 Phase 19.0 (2026-05-06) — the migration script had two latent bugs (PEM-parse + bare-collection-path) that ONLY surfaced at LIVE execution time. Both were caught + fixed in <10 minutes because the run was local + admin-SDK (not deploy-coupled). Had this been a UI-triggered migration, the fix would have required a redeploy + new probe cycle. Local-first wins on iteration speed AND blast-radius control.

### Anti-patterns (all 4 rules)
- Fix bug แต่ไม่เพิ่ม test + skill → regression guaranteed
- Skill ไม่มี grep patterns / invariant numbers → documentation ไม่ใช่ audit
- Parallel rule files แก้ขนานกัน → edit THIS file แทน

### Enforcement
- Audit: `/audit-anti-vibe-code` (AV1–AV12, อยู่ใน `/audit-all`)
- Project rule: this file
- User memory mirrors: `feedback_continuous_improvement.md` + `feedback_anti_vibe_code.md` (don't let diverge)
</important>
