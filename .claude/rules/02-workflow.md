<important if="committing, pushing, deploying, running tests, or editing src/ api/ files">
## Workflow — Commit · Push · Deploy · Test

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
