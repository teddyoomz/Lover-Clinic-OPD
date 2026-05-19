---
updated_at: "2026-05-19 LATE+3 EOD+1 — V104 SHADOW BUG fixed (param rename + silent-swallow rip) · backfill+deploy pending user auth"
status: "🔥 V104 fix LOCAL ONLY · 2 prod victims still stuck (BT-1779195907349 + BT-1779196388660) · NOT YET DEPLOYED · awaiting user auth for Rule M backfill + combined deploy"
branch: "master"
last_commit: "(pending V104 commit)"
tests: "V104 13 + V101 18 + V102 29 + V103 27 + course-skip 64 = 151 GREEN · build clean · dev-server L2 verify PASS"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "V103 LIVE (4b1e3d8e) — V104 NOT yet deployed; live save chain still broken"
firestore_rules_version: "unchanged"
storage_rules_version: "unchanged"
---

# Active Context

## State

- master = `4b1e3d8e` (V103) ahead of pending V104 commit; prod still on V103
- V104 ROOT CAUSE found via systematic-debugging Phase 1-4: parameter shadowing at `TreatmentFormPage.jsx:2085` — `const handleSubmit = async (eventOrSaveMode, options = {}) => {` SHADOWED React state `options` (declared line 461). 9 `options?.X` reads inside handleSubmit body all silently resolved to empty `{}` instead of React state
- Critical impact: V101 IIFE at ~line 2405 read `options?.customerCourses` → undefined → liveCustomerCourses=[] → Pass 1+2 both no-op → `courseItems=[]` → existingDeductions + purchasedDeductions both empty → `deductCourseItems` NEVER called → `customer.courses[].qty.remaining` NEVER decremented
- V101 backfill (`scripts/v101-backfill-treatment-course-link.mjs`) wrote `_v101AutoLinked:true + _v101BackfilledAt:true` retroactively on rescued treatments, MASKING the live bug for 4 days (since Phase 26.1 added the shadow param on 2026-05-13)
- User-visible report (verbatim): "บั๊ค ซื้อคอร์สใน TFP แล้วตัดการรักษาเลยใน TFP แต่มันไม่ตัด กดออกมา คอร์สแม่งยังเหลือเต็ม แบบไม่เคยตัดสักครั้ง"
- Plus silent-swallow at TFP:3134 (`catch (e) { console.warn(...); }`) hid the error → "บันทึกสำเร็จ" surface while data corrupted

## What this turn shipped (LOCAL only)

- **V104 Part A** — TFP:2085 param `options` → `submitOpts`; TFP:2101 read updated
- **V104 Part B** — TFP:3134 silent-swallow ripped, atomic-rollback (mirror existingDeductions at TFP:2599-2618). Throws `ตัดคอร์สที่ซื้อในการรักษาไม่สำเร็จ: ...` + deletes orphan treatment if create-mode
- **V104 Part C** — `tests/v104-handle-submit-options-shadow.test.js` (13 tests: SG1-SG6 source-grep + F1-F7 pure-function flow-simulate including F7 exact victim BT-1779196388660 repro)
- **V104 Part D** — AV91 invariant in `.claude/skills/audit-anti-vibe-code/SKILL.md` (function-parameter-shadow ban for React-state names; sanctioned exceptions: NONE)
- **V104 diag tools** — `scripts/diag-v104-buy-and-use-deduction.mjs` + `scripts/diag-v104-all-today-treatments.mjs` (read-only Rule R)

## Verification done

- Rule N targeted: V104 13/13 + V101 18/18 + V102 29/29 + V103 27/27 + course-skip 64/64 = **151/151 PASS**
- `npm run build` clean (3.02s, BackendDashboard chunk 952.25 KB)
- Rule Q L2: Pure V101 IIFE logic verified on dev-server eval against exact victim shape → returns 2 entries with deductQty=12 + 2 (matching expected post-V104 behavior). Pre-V104 simulation (empty liveCustomerCourses) returns [] as expected
- JS scoping shadow proven empirically via `node -e "const x={};const f=(_,x={})=>console.log(x);f()" → {}`

## Outstanding (USER-TRIGGERED, NOT auto)

1. **Rule M backfill** — `node scripts/v101-backfill-treatment-course-link.mjs --apply` (DENIED by auto-mode classifier; needs explicit user authorization). 2 stuck victims:
   - LC-26000079 BT-1779195907349 → 3 courses (ขลิบเลเซอร์ + ตัดเส้น + ผ่าตัดทำหมัน 1/1 → 0/1 each)
   - LC-26000078 BT-1779196388660 → 2 courses (Shock wave 12/12 → 0/12 + ติดตามอาการ 2/2 → 0/2) **[USER'S REPORTED BUG]**
   - Dry-run output proves exact decrements; idempotent via `_v101BackfilledAt` stamp
2. **Combined deploy** (V15) — pending user verb "deploy" THIS turn for `vercel --prod` + `firebase deploy --only firestore:rules,storage` (rules+storage idempotent — no V104 rule change)
3. **Rule Q L1 hands-on** (gold standard) — user hard-refresh (Ctrl+Shift+R) https://lover-clinic-app.vercel.app + buy course in TFP + tick + save + verify customer.courses[] decrement
4. **Post-deploy verify** — Probe-Deploy-Probe Rule B (chat_conv 200 + 3× admin-only 403) + repeat dev-test scenarios on prod

## Next action

User authorizes one of:
- `"backfill"` → run `node scripts/v101-backfill-treatment-course-link.mjs --apply` to repair the 2 stuck victims (independent of deploy; safe right now)
- `"deploy"` → combined vercel + firebase deploy (idempotent rules; V104 code goes live)
- `"both"` → backfill then deploy (recommended sequence per Rule M+V15 patterns)

## Files modified

```
M  src/components/TreatmentFormPage.jsx        (param rename + silent-swallow rip)
M  .claude/skills/audit-anti-vibe-code/SKILL.md (AV91 invariant)
A  tests/v104-handle-submit-options-shadow.test.js (13 regression tests)
A  scripts/diag-v104-buy-and-use-deduction.mjs (read-only diag)
A  scripts/diag-v104-all-today-treatments.mjs  (read-only diag)
```
