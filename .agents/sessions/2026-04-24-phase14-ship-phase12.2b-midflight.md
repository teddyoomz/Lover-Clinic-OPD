# 2026-04-24 · Phase 14 shipped + Phase 12.2b mid-flight

## Summary

Marathon continuation of the previous 2026-04-24 session: landed
Phase 14 (DF ↔ Treatment Form wiring + 5 sub-phases + V12 +
regression batch + 10-entity gap close) then pivoted to
Phase 12.2b (retroactive Course form ProClinic parity) after user
spotted missing fields. 3/7 sub-steps shipped; 4 remain.

## Current State

- **Branch**: `master`
- **Last commit**: `cfc59fb test(phase14): catch tests up with Phase 14.x + 12.2b shape changes`
- **Tests**: 3306/3306 PASS (was 2865 at previous session start — net delta ≈ +441 this day)
- **Build**: clean
- **Production**: `148fe0b` via Vercel — **5 commits BEHIND HEAD** (12.2b schema/UI + stock fix + test catchup not yet deployed — user chose local-test-only for remaining Phase 12.2b steps)
- **firestore:rules**: deployed 2026-04-24 with Probe-Deploy-Probe 200×4 both sides. Rules now cover be_wallet_types / be_membership_types / be_medicine_labels from gap-audit batches.

## Decisions

1. **Rule H-tris codified** (commit `25c6b31`) — new iron-clad rule alongside H + H-bis. Backend reads ONLY from be_*. When a feature needs data not yet in be_*, stop feature work → add sync+migrate pair → resume. Guards against the V12 pattern (wiring against `master_data/*` because be_* wasn't populated). User directive: "ข้อมูลดิบที่ต้องใช้ในการจำลองต้องมีครบก่อน".

2. **V12 logged** (commit `5a1ce97`) — Shape-migration half-fix. Quotation→sale items shape changed in commit `6bda5d2` (writer only). SalePrintView + dfPayoutAggregator still expected flat array → `.map()` on object threw → print-after-convert crashed. Rule A revert to `d56b5cf`; round-2 fix `471b1b8` shipped writer + 2 readers + regression tests in a single commit. Lesson: before changing a shape used by N readers, grep ALL readers + fix together.

3. **TDZ hot-fix** (commit `2a25e99` → crash → commit `148fe0b`) — auto-populate useEffect in TreatmentFormPage (4000+ LOC) was declared BEFORE `treatmentCoursesForDf` + `treatmentPeopleForDf` memos. React render evaluates the useEffect's dependency array at declaration time → TDZ ReferenceError → entire TreatmentFormPage crashes on mount → black screen on create + edit paths. `npm run build` + focused tests didn't catch because the crash requires an actual React render. Fix: move useEffect past the memo declarations. Deployed immediately to unblock prod.

4. **Phase 12.2b elevated** — user spotted that CourseFormModal shipped Phase 12.2 (Apr-20) as "core-only" (7 scalars + sub-items), missing ProClinic's full feature surface: 4 course types (ระบุสินค้าและจำนวน / บุฟเฟต์ / เหมาตามจริง / เลือกสินค้าตามจริง), deduct_cost, main product picker, qty_per_time / min / max, days_before_expire / period, usage_type, is_df + df_editable_global + is_hidden flags, secondary products with per-row flags. Declared a new phase "12.2b" (retroactive gap-close) BEFORE Phase 15 — per Rule H-tris. Triangle-captured `/admin/course/1067/edit` via opd.js forms + inspect; 3/7 steps shipped this session.

5. **Stock coverage audit** — user reported "quotation→convert→paid sale doesn't deduct stock". Grep for `deductStockForSale` callers across all sale creation paths: SaleTab ✅, TreatmentFormPage auto-sale ✅, CustomerDetailView 3 calls ⚠️ (intentionally skipped — audit-trail sales with `items.products: []`), convertQuotationToSale ❌. Fix: added `deductStockForSale(saleId, flattenPromotionsForStockDeduction(items), {...})` right after `createBackendSale` in the converter. Non-fatal on failure.

6. **CourseFormModal rewrite — reactive helpers**:
   - VAT checkbox + base price auto-compute `salePriceInclVat` via ×1.07 rounded to 2dp
   - Course type radio toggles downstream block visibility (main product hidden for pick-at-treatment; qty fields hidden for real-qty + pick-at-treatment; info banners per type)
   - Double picker — main product vs secondary — to mirror ProClinic's 2-tier product model

7. **Gap-audit batches** — full Triangle scan across 72 ProClinic admin routes: closed 5 entity gaps (DF groups + DF staff rates + wallet migrate + membership migrate + medicine labels) + 1 enrichment (doctor.defaultDfGroupId from treatment-create JSON blob). Remaining: 11 single-doc templates (consent/treatment/chart/sale-cancel + 7 cert types) — deferred to Phase 16 (no current consumer, not list-based).

## Blockers

None. Phase 12.2b Step 3 (sync mapper) is the next action.

## Files Touched (this session)

**Phase 14 ship** (mostly from earlier turns, summarized):
- `src/lib/doctorValidation.js` / `staffValidation.js` — defaultDfGroupId field
- `src/lib/dfEntryValidation.js` (NEW, 200+ LOC) — entry schema + buildDefaultRows + dup-guard
- `src/components/backend/DfEntryModal.jsx` (NEW, 270+ LOC) — per-doctor-per-course DF UI
- `src/components/TreatmentFormPage.jsx` — massive wiring (dfEntries state, masterCourses load, masterCourseIdByName memo, treatmentCoursesForDf memo, treatmentPeopleForDf memo, auto-populate useEffect, DfEntryModal mount, 3 save payload sites)
- `src/lib/treatmentValidation.js` — TR-11 + TR-12 invariants + normalize
- `src/lib/dfPayoutAggregator.js` — treatments[] arg + explicit-entry priority + rateSource tagging
- `src/lib/reportsLoaders.js` — loadTreatmentsByDateRange
- `src/components/backend/reports/DfPayoutReportTab.jsx` — wire treatments[]

**Phase 14 bug fixes**:
- `src/lib/backendClient.js` — convertQuotationToSale grouped-items (round 2), syncDoctors defaultDfGroupId enrichment, BE_BACKED_MASTER_TYPES additions, mapMasterToWalletType/MembershipType/MedicineLabel + 3 migrate functions
- `src/components/backend/SalePrintView.jsx` — dual-shape (flat + grouped) reader
- `src/lib/dfPayoutAggregator.js` — same dual-shape reader at line 75
- `firestore.rules` — be_wallet_types + be_membership_types + be_medicine_labels
- `src/components/backend/MasterDataTab.jsx` — 3 new SYNC_TYPES (df_groups, df_staff_rates, medicine_labels) + 5 new MIGRATE_TARGETS + 3 new COLUMNS
- `src/lib/dfGroupValidation.js` — courseName preserved in normalize + GROUP_ID_RE relaxed for numeric ProClinic ids
- `src/components/backend/DfGroupFormModal.jsx` — courseName rehydration useEffect
- `api/proclinic/_lib/scraper.js` — extractDfGroupList + extractDfGroupRates + extractDfStaffList + extractDfStaffRates + extractMedicineLabelList
- `api/proclinic/master.js` — handleSyncDfGroups + handleSyncDfStaffRates + handleSyncMedicineLabels + doctor enrichment

**Phase 12.2b**:
- `src/lib/courseValidation.js` — COURSE_TYPE_OPTIONS + USAGE_TYPE_OPTIONS + 10+ new fields + validators + normalize + gate helpers (isRealQtyCourse / isBuffetCourse / isPickAtTreatmentCourse / isSpecificQtyCourse)
- `tests/courseValidation.test.js` — +20 tests (CV12-22, CN3-7, CT1-4)
- `src/components/backend/CourseFormModal.jsx` — FULL REWRITE 232→520 LOC to match ProClinic's form
- `src/lib/backendClient.js` (convertQuotationToSale) — deductStockForSale call

**Tests catchup**:
- `tests/phase12-11-be-shape-adapters.test.js` BE1 — 13→16 types
- `tests/phase12-catalog-tabs.test.jsx` CM3 — aria-label regex

**Docs + rules**:
- `.claude/rules/00-session-start.md` — Rule H-tris + V12 entry

## Commands Run (replay-friendly)

```bash
# Triangle captures:
node F:/replicated/scraper/quick-login.js   # session refresh
node F:/replicated/scraper/opd.js forms /admin/course/1067/edit
node F:/replicated/scraper/opd.js inspect "/admin/df/df-group" "..."
node F:/replicated/scraper/opd.js inspect "/admin/df/doctor" "..."

# Rule B deploy sequence:
curl -X POST ".../chat_conversations?documentId=test-probe-$(date +%s)" -d '...' # × 4 pre
firebase deploy --only firestore:rules
curl -X POST ... # × 4 post, plus strip
vercel --prod   # × 2 this session (5c071c5 then 148fe0b TDZ hot-fix)

# Test sweeps:
npm test -- --run tests/<focused>.test.{js,jsx}    # per sub-commit
npm test -- --run                                   # end-of-session full (3306/3306)
npm run build                                       # after every commit
```

## Commit list (this session, 21 commits on master)

```
cfc59fb test(phase14): catch tests up with Phase 14.x + 12.2b shape changes
1ab8b21 fix(phase14): convertQuotationToSale deducts stock on create
60b7b5a feat(phase12.2b): CourseFormModal full ProClinic parity rewrite
3a6f8e1 feat(phase12.2b): course schema full ProClinic parity
148fe0b fix(phase14): relocate auto-populate useEffect past memo declarations (TDZ crash)
5c071c5 feat(phase14): syncDoctors enriches defaultDfGroupId from ProClinic
eabac10 feat(phase14): medicine label preset sync + migrate
2889aa4 feat(phase14): wallet + membership types migrate to be_*
25c6b31 docs(rules): codify Rule H-tris — missing-data-first, feature-second
bac7e64 feat(phase14): sync DF staff rate overrides
2a25e99 feat(phase14.4): auto-populate DF entries on doctor pick
2ce6bea feat(phase14): sync DF groups + rates matrix from ProClinic
cffd511 fix(phase14): DF modal auto-populate + DF group edit shows course names
67493f3 feat(phase14.5): validator TR-11/12 + aggregator consumes explicit dfEntries
821d812 feat(phase14.4): TreatmentFormPage wires dfEntries + DfEntryModal
65f95e0 feat(phase14.3.2): DfEntryModal component + UI tests
5a1ce97 docs(rules): log V12 — shape-migration half-fix crashed sibling reader
471b1b8 fix(phase14): quotation→sale grouped items + SalePrintView handles both shapes
d56b5cf Revert "fix(phase14): quotation→sale convert produces grouped items (not flat)"
ea6482f feat(phase14.3.1): DF entry validator + generator + default-row resolver
9e7e132 feat(phase14.1): defaultDfGroupId required for doctors + assistant filter fix
```

## Next Todo (ranked by risk vs value)

1. **Phase 12.2b Step 3** (30-60min, Low risk) — syncCourses mapper + scraper pull new ProClinic fields. Unblocks end-to-end parity: UI already accepts them, sync needs to populate them.
2. **Phase 12.2b Step 5** (30min-1h, Low risk) — DfEntryModal bug: repro "เลือก 10% → เปลี่ยน group อื่น ค่ามือกลุ่มอื่นไม่แสดง". Suspect stale closure in `handleGroupChange` or async resolveRows. Add explicit log + console test.
3. **Phase 12.2b Step 6** (1-2h, Medium risk) — TreatmentFormPage course list layout: migrate "ซื้อเพิ่ม" entries from bottom-list to parent-course-header (ProClinic Image 1 style). Requires refactor of course rendering loop, probably ~80 LOC.
4. **Phase 12.2b Step 7** (1h, Low risk) — courseType-aware treatment flow: when `courseType === 'เหมาตามจริง'` skip qty prompt at buy time; DfEntryModal row value disabled until treatment qty known.
5. (Optional) Re-deploy Vercel after Phase 12.2b steps 3-7 ship — ONE clean deploy vs 4 separate (user chose local-test-only during iteration).
6. (Optional) Resume `/audit-anti-vibe-code` + 3 other audits deferred earlier.

## Resume Prompt

(See SESSION_HANDOFF.md for the paste-ready block.)
