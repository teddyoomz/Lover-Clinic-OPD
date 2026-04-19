<important if="committing, pushing, deploying, running tests, or editing src/ api/ files">
## Workflow — Commit · Push · Deploy · Test

### 🔥 Pre-Commit Checklist — RUN BEFORE EVERY `git commit` (no exceptions)
Added after 2026-04-19 `handleSyncCoupons is not defined` runtime crash — router cases referenced functions that were never actually defined because an Edit call errored silently and I didn't verify. Mechanical checks only; each takes seconds.

1. **TEST**: `npm test -- --run` → ALL PASS (41+ known PERMISSION_DENIED integration fails are OK per tests/setup.js limitation). If you wrote new tests, verify they RAN and passed (not silently skipped).
2. **VERIFY**: `npm run build` → clean. Catches syntax / import / unreachable-code errors the REPL doesn't.
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

Anti-pattern (caught in Phase 9 session 2026-04-19): claiming "checked" after only reading the diff. `claude tracks the intent not the output` — Edit tool can silently fail on param typos. Treat every "Edit succeeded" as unverified until grep confirms both sides of a pair exist.

### Commit + Push
1. `git add <files>` → `git commit` → `git push origin master` → **stop**
2. **ทุก commit ต้อง push ทันที** — ห้ามค้าง local. User ทำงานหลายเครื่อง, unpushed = invisible work.
3. Push direct to `master` ตามแบบ repo นี้ (ไม่มี PR workflow สำหรับ owner). Branch: `develop` → merge → `master` ก่อน deploy.
4. ห้าม `--no-verify` / `--no-gpg-sign` ยกเว้น user สั่ง

### Deploy (Vercel)
1. `vercel --prod` **รอ user สั่งทุกครั้ง** — push ≠ deploy. Prior authorization ไม่ roll over.
2. **ห้าม deploy โดยไม่ commit ก่อน**
3. Backend files = commit + push อย่างเดียว, **ไม่ deploy** (ประหยัด Vercel cost, ทดสอบ local):
   - `src/components/backend/**`
   - `src/pages/BackendDashboard.jsx`
4. `cookie-relay/` = commit อย่างเดียว (Chrome Extension, reload ที่ `chrome://extensions` เอง)
5. ถ้า user สั่ง "deploy" / "push + deploy" / "deploy เลย" → ได้. ยกเว้น authorization ของ deploy ครั้งนั้น ครั้งเดียว.

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

### CODEBASE_MAP.md
อัพเดท `F:\LoverClinic-app\CODEBASE_MAP.md` ทุกครั้งที่เพิ่ม/ลบ/rename/restructure ไฟล์ใน `src/` หรือ `api/` — source of truth สำหรับ onboarding + future sessions.

### Git safety
- ห้ามแก้ git config / force-push master / reset --hard published commits ยกเว้น user สั่งชัดเจน
- Merge conflict → resolve, ห้าม discard changes
- Lock file → investigate, ห้ามลบ
</important>
