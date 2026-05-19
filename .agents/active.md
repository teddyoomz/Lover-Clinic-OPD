---
updated_at: "2026-05-19 LATE+3 NIGHT+1 — V104 + V104-followup BOTH LOCAL · V104-followup MIGRATION --apply'd on prod (11 garbage → canonical) · V101 backfill --apply still pending user verb"
status: "🔥 V104 + V104-followup local · V104-followup migration APPLIED to prod (11 audit entries fixed) · V101 backfill --apply for 2 stuck victims still pending explicit user `backfill` verb · NOT YET DEPLOYED"
branch: "master"
last_commit: "(pending V104-followup commit)"
tests: "V104 13 + V104-followup 9 + V101 18 + V102 29 + V103 27 + course-skip 64 = 160 GREEN · build clean · real-prod diag confirms 0 garbage"
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

### V104 (committed `~~~` pushed)
- **Part A** — TFP:2085 param `options` → `submitOpts`; TFP:2101 read updated
- **Part B** — TFP:3134 silent-swallow ripped, atomic-rollback (mirror existingDeductions at TFP:2599-2618). Throws `ตัดคอร์สที่ซื้อในการรักษาไม่สำเร็จ: ...` + deletes orphan treatment if create-mode
- **Part C** — `tests/v104-handle-submit-options-shadow.test.js` (13 tests: SG1-SG6 source-grep + F1-F7 pure-function flow-simulate including F7 exact victim BT-1779196388660 repro)
- **Part D** — AV91 invariant in `.claude/skills/audit-anti-vibe-code/SKILL.md` (function-parameter-shadow ban for React-state names; sanctioned exceptions: NONE)
- **Diag tools** — `scripts/diag-v104-buy-and-use-deduction.mjs` + `scripts/diag-v104-all-today-treatments.mjs` (read-only Rule R)

### V104-followup (pending commit this turn)
User report (image, 2026-05-19 NIGHT+1): "ประวัติการใช้คอร์ส" tab shows 11+ entries all "(ไม่ระบุคอร์ส) -". Root cause: V101 backfill script wrote NON-CANONICAL audit shape — top-level `courseName, qty, treatmentId, unit, performedAtIso` instead of canonical `fromCourse:{name,...}, qtyDelta:-N, linkedTreatmentId, productUnit, createdAt` from `buildChangeAuditEntry`. Display reader `CourseHistoryTab.jsx:66` reads `entry.fromCourse?.name || '(ไม่ระบุคอร์ส)'` → falls back to placeholder. 11 entries on LC-26000078 affected (all `_v101Backfill:true`).
- **Part A** — `scripts/v101-backfill-treatment-course-link.mjs` now uses NEW local `buildCanonicalUseAudit` helper that mirrors `buildChangeAuditEntry` shape verbatim. Writes nested `fromCourse:{courseId,name,status,value,courseType}` + signed `qtyDelta:-deductQty` + `linkedTreatmentId`. Forensic `_v101LegacyMeta` preserves original metadata.
- **Part B** — NEW `scripts/v104-migrate-broken-course-change-audits.mjs` migrates the 11 existing garbage entries to canonical shape. Loss-free conversion (all data present in legacy). Two-phase + audit doc + idempotent via `_v104Migrated:true` flag. **--apply EXECUTED 2026-05-19 NIGHT+1** (audit doc `be_admin_audit/v104-followup-migrate-course-audits-1779199488818-7f9673a0`). Real-prod diag confirms 0 garbage remaining (109/109 canonical).
- **Part C** — `tests/v104-followup-course-audit-canonical-shape.test.js` 9/9 PASS (SG1-SG7 + U1-U2).
- **Part D** — NEW **AV92 invariant** in `.claude/skills/audit-anti-vibe-code/SKILL.md` — every writer to `be_course_changes` MUST use canonical `buildChangeAuditEntry` shape (or local mirror in admin-SDK scripts). Sanctioned exceptions: NONE. Source-grep regression catches future drift.
- **Diag tool** — `scripts/diag-v104-followup-course-changes-shape.mjs` (read-only shape distribution audit).

## Verification done

- Rule N targeted: V104 13/13 + V104-followup 9/9 + V101 18/18 + V102 29/29 + V103 27/27 + course-skip 64/64 = **160/160 PASS**
- `npm run build` clean (both runs)
- Rule Q L2 (V104): Pure V101 IIFE logic verified on dev-server eval against exact victim shape → returns 2 entries with deductQty=12 + 2 (matching expected post-V104 behavior). Pre-V104 simulation (empty liveCustomerCourses) returns [] as expected
- Rule Q L2 (V104-followup): Real-prod admin-SDK diag pre+post migration. Pre: 109 docs / 98 canonical / 11 garbage on LC-26000078 (_v101Backfill:true). Post: 109 docs / 109 canonical / 0 garbage. Migration loss-free (all 11 entries preserved courseName, qty, productName, treatmentId via _v104MigratedFrom forensic trail).
- JS scoping shadow proven empirically via `node -e "const x={};const f=(_,x={})=>console.log(x);f()" → {}`

## Outstanding (USER-TRIGGERED, NOT auto)

1. **V101 backfill --apply** for the 2 stuck course-balance victims (DENIED by auto-mode classifier per active.md flag; needs explicit "backfill" verb THIS turn):
   - LC-26000079 BT-1779195907349 → 3 courses (ขลิบเลเซอร์ + ตัดเส้น + ผ่าตัดทำหมัน 1/1 → 0/1 each)
   - LC-26000078 BT-1779196388660 → 2 courses (Shock wave 12/12 → 0/12 + ติดตามอาการ 2/2 → 0/2) **[ORIGINAL V104 USER-REPORTED BUG]**
   - Script now writes CANONICAL audit shape thanks to V104-followup Part A — `_v101Backfill:true` emits will display correctly post-apply
2. **Combined deploy** (V15) — pending user verb "deploy" for `vercel --prod` + `firebase deploy --only firestore:rules,storage` (rules+storage idempotent — no V104 rule change)
3. **Rule Q L1 hands-on** (gold standard) — user hard-refresh (Ctrl+Shift+R) on running prod / dev server + open LC-26000078 customer detail view → "ประวัติการใช้คอร์ส" tab → verify 11 entries now display proper course names + signed qty deltas (NOT "(ไม่ระบุคอร์ส) -")
4. **Post-deploy verify** — Probe-Deploy-Probe Rule B (chat_conv 200 + 3× admin-only 403) + buy-this-visit + use save flow on prod

## Next action

User authorizes one of:
- `"backfill"` → run `node scripts/v101-backfill-treatment-course-link.mjs --apply` to repair the 2 stuck victims' course balances (safe immediately; will also write 5 NEW canonical audit entries thanks to V104-followup Part A)
- `"deploy"` → combined vercel + firebase deploy (V104 + V104-followup code goes live; rules idempotent)
- `"both"` → backfill then deploy (recommended sequence)

## Files modified

V104 (already committed + pushed):
```
M  src/components/TreatmentFormPage.jsx          (param rename + silent-swallow rip)
M  .claude/skills/audit-anti-vibe-code/SKILL.md  (AV91 invariant)
A  tests/v104-handle-submit-options-shadow.test.js (13 regression tests)
A  scripts/diag-v104-buy-and-use-deduction.mjs   (read-only diag)
A  scripts/diag-v104-all-today-treatments.mjs    (read-only diag)
```

V104-followup (pending commit this turn):
```
M  scripts/v101-backfill-treatment-course-link.mjs (canonical buildCanonicalUseAudit helper + signed qtyDelta)
M  .claude/skills/audit-anti-vibe-code/SKILL.md  (AV92 invariant)
A  scripts/v104-migrate-broken-course-change-audits.mjs (--apply'd on prod; 11 garbage → canonical)
A  scripts/diag-v104-followup-course-changes-shape.mjs (read-only shape diag)
A  tests/v104-followup-course-audit-canonical-shape.test.js (9 regression tests)
```
