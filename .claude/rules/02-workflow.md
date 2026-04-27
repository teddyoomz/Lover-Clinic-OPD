<important if="committing, pushing, deploying, running tests, or editing src/ api/ files">
## Workflow — Commit · Push · Deploy · Test

### 🔥 Pre-Commit Checklist — RUN BEFORE EVERY `git commit` (no exceptions)
Added after 2026-04-19 `handleSyncCoupons is not defined` runtime crash — router cases referenced functions that were never actually defined because an Edit call errored silently and I didn't verify. Mechanical checks only; each takes seconds.

1. **TEST**: `npm test -- --run <focused path>` → ALL PASS for the sub-phase's focused tests. Full `npm test -- --run` (~2900 tests, ~30s) is reserved for end-of-major-phase (13 / 14 / 15 / 16), per `feedback_test_per_subphase`. If you wrote new tests, verify they RAN and passed (not silently skipped).
2. **VERIFY**: `npm run build` → clean. Catches syntax / import / unreachable-code errors the REPL doesn't.
   - **V11 near-miss (2026-04-24)**: `vi.mock(module, () => ({ newName: fn() }))` **creates** the export name in the mock — it does NOT validate that the real module exports it. If you import `newName` from the real module but the real export is `otherName`, focused tests PASS (mock shadows reality), build FAILS (`MISSING_EXPORT`). Always trust build over focused tests for import resolution.
   - **Pre-flight grep for new imports** — before writing `import { foo } from './bar.js'`, grep `^export (async )?function foo` in `./bar.js`. Catches the V11 pattern cheaper than waiting for build.
3. **AUDIT (area-specific)** — run the skill matching what you touched:
   - `src/components/backend/**` or `BackendDashboard.jsx` → `/audit-backend-firestore-only` (BF1-BF7)
   - `api/proclinic/*.js` → grep-pair verify: every `case '<action>':` has matching `async function handle<Action>` definition in same file
   - new collection / rule → `/audit-anti-vibe-code` + `/audit-firestore-correctness`
   - money/stock → `/audit-money-flow` / `/audit-stock-flow`
   - forms → `/audit-frontend-forms`
   - whole-stack pre-release → `/audit-all`
4. **GREP-PAIR for API router files**: after editing `api/proclinic/*.js` with new `case '<x>':` handlers, run:
   ```bash
   grep "case '" api/proclinic/<file>.js  # list cases
   grep "^async function handle" api/proclinic/<file>.js  # list defs
   ```
   Every case must have a matching def. If not → Edit failed silently (possibly via parameter typo). Reopen + fix.
5. **END-TO-END on mutation paths**: if you added/changed a function that writes to Firestore or POSTs to ProClinic, trace at least ONE real caller to verify the shape it receives matches what you write. Grep the function name + look at call sites.

6. **🆕 FULL-FLOW SIMULATE mandatory at end of every sub-phase** (added 2026-04-25 after the buffet-expiry + shadow-course + LipoS-pick rounds — each took 3 iterations because helper-only tests passed while the UI was still broken):
   - **Definition**: a full-flow simulate test chains EVERY step the user exercises — master data read → openBuyModal whitelist → confirmBuy builder → handleSubmit filter routing → assignCourseToCustomer → deductCourseItems/deductStock → customer.courses post-state → re-render. Helper-output-in-isolation is NOT enough.
   - **Trigger**: end of every sub-phase that touches a user-visible flow (courses, sales, treatments, stock, DF, payment, appointments). Not just "when a bug is reported".
   - **Required elements in the test**:
     (a) **Pure simulate mirrors** of inline React logic (e.g. TFP pre-validation, courseItems builder, filter split) so the test can chain 4+ steps without mounting
     (b) **Runtime verify via preview_eval** on real Firestore data whenever the dev server is live — call the real exported functions against real data + assert shape (catches whitelist-strips that grep can't)
     (c) **Source-grep regression guards** that lock the fix pattern — e.g. "all N filter sites use `isPurchasedSessionRowId`", "no raw `rowId.startsWith('purchased-')` remains"
     (d) **Adversarial inputs** — null, empty, zero, negative, Thai text, commas, snake_case vs camelCase, duplicate entries, concurrent mutations
     (e) **Lifecycle assertions** — after save, what does the stored doc look like? Parse qty, check remaining, check flags
   - **Anti-pattern (locked by violation log)**: "tests pass → ship" when tests only cover helper OUTPUT. V11 (mock-shadowed export), V12 (shape-migration half-fix), 2026-04-25 rounds 1-3 all share this pattern. Helper-only tests are a necessary but NOT sufficient condition for "done".
   - **File naming**: `tests/<phase>-<feature>-flow-simulate.test.js` (e.g. `phase12.2b-flow-simulate.test.js`). ONE file per sub-phase's feature domain, NOT one per function.
   - **Structure inside file**: `describe` blocks F1, F2, … each targeting a flow dimension (rowId contract, mapper branches, buy path × course type × use path matrix, lifecycle, adversarial, source-grep guards).
   - **When the simulate test catches a bug the unit test missed**: log it as a V-entry in `.claude/rules/00-session-start.md` § 2 so the pattern becomes permanent institutional memory.

Anti-pattern (caught in Phase 9 session 2026-04-19): claiming "checked" after only reading the diff. `claude tracks the intent not the output` — Edit tool can silently fail on param typos. Treat every "Edit succeeded" as unverified until grep confirms both sides of a pair exist.

### Commit + Push
1. `git add <files>` → `git commit` → `git push origin master` → **stop**
2. **ทุก commit ต้อง push ทันที** — ห้ามค้าง local. User ทำงานหลายเครื่อง, unpushed = invisible work.
3. Push direct to `master` ตามแบบ repo นี้ (ไม่มี PR workflow สำหรับ owner). Branch: `develop` → merge → `master` ก่อน deploy.
4. ห้าม `--no-verify` / `--no-gpg-sign` ยกเว้น user สั่ง

### Deploy — `vercel --prod` + `firebase deploy --only firestore:rules` รวมเป็นคำสั่งเดียว
**กฎใหม่ 2026-04-25** (user directive "ต่อไป vercel --prod กับ deploy rules ให้ทำด้วยกันไม่ต้องแยก ใส่ไว้ในกฎ"):

1. **"deploy" = combined workflow** — เมื่อ user สั่ง "deploy" / "push + deploy" / "deploy เลย" → รัน **ทั้งคู่**ใน turn เดียว:
   - `vercel --prod --yes` (ฝั่ง frontend bundle)
   - **AND** `firebase deploy --only firestore:rules` ห่อด้วย Probe-Deploy-Probe (Rule B iron-clad — ห้ามข้าม)
2. **ทำงาน parallel**: vercel deploy + firestore probe-deploy-probe ไม่ชนกัน. Run ใน background พร้อมกัน, รอ both สำเร็จ.
3. **Probe-Deploy-Probe sequence ต้องครบ** (Rule B):
   - **Pre-probe**: curl POST `chat_conversations` + PATCH `pc_appointments` + PATCH `clinic_settings/proclinic_session` + PATCH `clinic_settings/proclinic_session_trial` → ทุกตัว 200
   - `firebase deploy --only firestore:rules`
   - **Post-probe**: curl ซ้ำทั้ง 4 → ถ้า 403 ตัวใด revert ทันที
   - **Cleanup**: ลบ probe docs + strip probe field จาก clinic_settings
4. **Even if firestore.rules ไม่ได้แก้** — ยัง deploy ทุกครั้งที่ user สั่ง "deploy" (idempotent + ป้องกัน Console-side drift V1/V9)
5. `vercel --prod` **รอ user สั่งทุกครั้ง** — push ≠ deploy. Prior authorization ไม่ roll over (V4/V7).
6. **ห้าม deploy โดยไม่ commit ก่อน**
7. Backend files = commit + push อย่างเดียว, **ไม่ deploy** (ประหยัด Vercel cost, ทดสอบ local):
   - `src/components/backend/**`
   - `src/pages/BackendDashboard.jsx`
   - **ยกเว้น**: ถ้า user สั่ง "deploy" → ก็ deploy ตามคำสั่ง (override default-no-deploy)
8. `cookie-relay/` = commit อย่างเดียว (Chrome Extension, reload ที่ `chrome://extensions` เอง)
9. **Deploy ส่วนเดียว (ไม่รวม)** — ถ้า user สั่งเฉพาะอย่างใดอย่างหนึ่ง:
   - "deploy vercel only" → vercel เท่านั้น
   - "deploy rules only" → firestore:rules เท่านั้น (probe-deploy-probe เต็ม)
   - "deploy" (ไม่ระบุ) → **combined ทั้งคู่**
10. **Deploy fail แบบไหนก็ตาม** → revert immediately, รายงาน user, รอคำสั่งต่อ.

### Testing
1. **`npm test` ALL PASS ก่อน commit** เสมอ — test fail แก้โค้ดไม่ใช่แก้ test
2. Integration tests ที่ฟ้อง `PERMISSION_DENIED` = **known limitation at master** (tests/setup.js ไม่มี Firebase signin). Focus pure unit:
   - `tests/dateFormat.test.js`
   - `tests/utils.test.js`
   - `tests/pdpa-helpers.test.js` (ถ้ามี)
   - รวม ~109+ pure tests at master
3. ทุก bug/feature → **adversarial test** (หลายรูปแบบ — race conditions, edge cases, boundaries; ไม่ใช่ happy-path เดียว)
4. ห้าม mock database ใน integration — ใช้ real emulator หรือ skip
5. **ไม่ self-test UI** — user ทดสอบเอง. Focus: เขียน → test → commit → push → สรุป.
6. เครื่องมือที่ถูก:
   | สิ่งที่เปลี่ยน | ใช้ |
   |---|---|
   | Pure function (utils, calc, parse) | Vitest |
   | Firestore CRUD | Vitest integration |
   | Component render + click | RTL (@testing-library/react) |
   | Modal, form validation, nav | Playwright E2E |
   | CSS/visual | Preview screenshot (ไม่บ่อย) |

### 🆕 Test customer doc-id prefix (V33.10 — V33.2 directive codified)
- **Every test that writes a real Firestore customer doc** (preview_eval scripts,
  integration tests via firebase-admin SDK, E2E playwright fixtures) MUST use
  a doc-id with prefix `TEST-` or `E2E-`. Mock-only tests don't need it.
- Use the canonical helper:
  ```js
  import { createTestCustomerId } from 'tests/helpers/testCustomer.js';
  const customerId = createTestCustomerId();                    // 'TEST-<ts>'
  const customerId = createTestCustomerId({ prefix: 'E2E' });   // 'E2E-<ts>'
  const customerId = createTestCustomerId({ suffix: 'sale' });  // 'TEST-<ts>-sale'
  ```
- `isTestCustomerId(id)` + `getTestCustomerPrefix(id)` — admin-side cleanup
  helpers; safe-by-default identification of test docs eligible for batch
  deletion.
- **Why**: V33.2 cleaned 53 untagged test customers out of production data.
  Without the prefix convention, future test pollution is invisible until
  it accumulates again.
- **Anti-pattern**: hardcoding doc IDs like `'CUST-test-1234'` or
  `'preview-customer-abc'` in tests that hit Firestore. Drift catcher:
  `tests/v33-10-test-customer-prefix.test.js` E1+E2 assert the rule + helper
  file are present.

### CODEBASE_MAP.md
อัพเดท `F:\LoverClinic-app\CODEBASE_MAP.md` ทุกครั้งที่เพิ่ม/ลบ/rename/restructure ไฟล์ใน `src/` หรือ `api/` — source of truth สำหรับ onboarding + future sessions.

### Git safety
- ห้ามแก้ git config / force-push master / reset --hard published commits ยกเว้น user สั่งชัดเจน
- Merge conflict → resolve, ห้าม discard changes
- Lock file → investigate, ห้ามลบ
</important>
