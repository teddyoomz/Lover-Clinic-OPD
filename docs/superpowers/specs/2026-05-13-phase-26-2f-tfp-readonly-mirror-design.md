# Phase 26.2f — TFP Read-Only Mirror + Vitals-Save Workflow Design

> **Brainstorming-approved**: user locked design in chat 2026-05-13 (post-Task-8 follow-up).
> Successor to Phase 26.2 (8 tasks completed; this spec adds 5 sub-phases for the comprehensive mirror + 3-stage save workflow).

## Background

Phase 26.2 (Tasks 1-8) shipped a split-screen history view on TreatmentFormPage (TFP) using a condensed `TreatmentReadOnlyPanel` (~374 LOC). User feedback during real-UI testing surfaced two limitations:

1. The condensed panel only shows date + chips + meta + CC/DX/Note + items list + image grid. User wants **every field** visible — the same layout as the editable TFP form, but locked.
2. The current `getCustomerTreatments` consumer in TFP passes raw be_treatments docs where `detail.doctor` is sometimes an object `{id, displayName}` — rendering as `[object Object]`. Field shape handling needs to be canonical.

Separately, user requested a NEW workflow stage between create + complete: an **admin vitals-save** that creates a treatment record with only Vital Signs filled, leaving the doctor + admin to complete the remaining fields in subsequent edit cycles.

## User-locked decisions

| # | Question | Locked answer |
|---|---|---|
| Q1 | Mirror approach | A — NEW `TreatmentReadOnlyMirror` component that mirrors TFP layout (faster + plot-safety) |
| Q2 | CHART canvas handling | Render saved chart images zoomable via lightbox; no editor canvas |
| Q3 | Vitals-save button color | Teal `#2EC4B6` (clinic accent; distinct from doctor-save's sky) |
| Q4 | Vitals-save scope | Create-only (mirrors doctor-save's create-only pattern) |
| Q5 | Vitals chip color | Teal (distinct from amber `doctor-recorded` chip) |
| Q6 | Status transition | vitals → doctor → null (admin's final regular-save clears status via deleteField) |
| Q7 | Doctor-save in edit-mode | Enabled when `loadedTreatmentStatus === 'vitalsigns-recorded'` (NEW transition) |
| Q8 | หมายเหตุทั่วไป position | LEFT column, between "ข้อมูลการรักษา" and "ข้อมูลสุขภาพลูกค้า" |
| Q9 | Vitals-save button position | OLD slot of หมายเหตุทั่วไป (RIGHT column, above doctor-save button) — visually adjacent to Vital Signs box |

## Architecture (5 sub-phases)

### Phase 26.2f-pre — Layout reorder + Vitals-Save button + 3-stage status workflow

**Files modified**:
- `src/components/TreatmentFormPage.jsx` — section reorder + new button + handleSubmit `saveMode='vitals'` branch + status enum extension + canAddNewItems extension + doctor-save edit-mode enablement
- `src/components/backend/CustomerDetailView.jsx` — chip "บันทึกข้อมูลซักประวัติ" rendering for `status === 'vitalsigns-recorded'`
- `src/components/backend/TreatmentTimelineModal.jsx` — same chip rendering
- `src/lib/backendClient.js` — `rebuildTreatmentSummary` preserves `status` (already done Phase 26.0e; verify no regression)
- `.agents/skills/audit-anti-vibe-code/SKILL.md` — AV37 extension (saveMode='vitals' as 5th locked-X family member)
- `tests/audit-branch-scope.test.js` — append AV37.12-AV37.17 (6 new sub-tests covering vitals-save invariants)
- `tests/phase-26-2f-pre-vitals-save-source-grep.test.js` — NEW G5 group (5-7 source-grep assertions)
- `tests/phase-26-2f-pre-vitals-save-rtl.test.jsx` — NEW V1 group (3-5 RTL assertions for button visibility + chip rendering)
- `tests/phase-26-2f-pre-vitals-save-flow-simulate.test.js` — NEW F11 Rule I full-flow (status state machine + 3-stage workflow)

**Behavior**:

1. **Layout reorder**: TFP LEFT column section order becomes:
   1. `<FormSection icon={Stethoscope} title="ข้อมูลการรักษา">` — doctor + assistants + date
   2. `<FormSection icon={ClipboardCheck} title="หมายเหตุทั่วไป">` — **MOVED HERE** from RIGHT column; same `customerNote` state + amber styling
   3. `<FormSection icon={Heart} title="ข้อมูลสุขภาพลูกค้า">` — blood + history
   4. `<FormSection icon={Activity} title="ข้อมูลซักประวัติ (Vital Signs)">` — weight/height/BMI/BT/PR/RR/SBP/DBP/O2 Sat
   5. `<FormSection title="ใบรับรองแพทย์">` — 3 checkboxes

2. **NEW vitals-save button** at the OLD slot of หมายเหตุทั่วไป (RIGHT column, ABOVE doctor-save button):
   - Teal styling (`bg-[#2EC4B6] hover:bg-[#26a89c] text-white` — full-width or proportional)
   - `Activity` icon
   - `data-testid="tfp-vitals-save-btn"`
   - Label: "บันทึกข้อมูลซักประวัติ"
   - Subtitle (small text, similar to doctor-save): "บันทึกแค่ Vital Signs / Admin / ไม่ต้องเลือกแพทย์"
   - Gate: `{!isEdit && (...)}` — create-only
   - `onClick={() => handleSubmit('vitals')}` (passes string `'vitals'` per handleSubmit signature `(eventOrSaveMode, options)`)

3. **handleSubmit `saveMode='vitals'` branch**:
   - Defensive coercion: same pattern as Phase 26.0b — `const saveMode = (typeof eventOrSaveMode === 'string') ? eventOrSaveMode : '';`
   - **No required-field validation** — short-circuit the validation block when `saveMode === 'vitals'` OR `saveMode === 'doctor'`
   - **Skip deductions / sale creation / stock writes** — extend all 8 Phase 26.0b gates from `saveMode !== 'doctor'` to `saveMode !== 'doctor' && saveMode !== 'vitals'` (skip both gated modes)
   - **Meds (type 7) sanctioned exception**: stays unconditional — but vitals-save has no meds, so effectively no-op
   - **Status stamping**: when `saveMode === 'vitals'`:
     ```js
     v26StatusPatch = {
       status: 'vitalsigns-recorded',
       recordedBy: auth.currentUser?.uid || null,
       recordedAt: serverTimestamp(),
     };
     ```
     (mirror Phase 26.0e doctor-save pattern; reuses same forensic fields; transitions overwrite — single forensic trail per save)

4. **Status state machine**:

   ```
   create  ──vitals-save──▶ 'vitalsigns-recorded'
   create  ──doctor-save──▶ 'doctor-recorded'
   create  ──regular─────▶ null/complete

   edit + status='vitalsigns-recorded' ──doctor-save──▶ 'doctor-recorded'  (NEW transition)
   edit + status='vitalsigns-recorded' ──regular─────▶ null/complete       (admin shortcut)
   edit + status='doctor-recorded'     ──regular─────▶ null/complete       (Phase 26.0e — deleteField)
   ```

5. **Status chip "บันทึกข้อมูลซักประวัติ"**:
   - Renders when `treatment.status === 'vitalsigns-recorded'`
   - Visual: teal pill `bg-teal-100 border-teal-200 text-teal-900` (light) / `bg-teal-950 border-teal-800 text-teal-100` (dark)
   - Icon: `Activity` (size 10-12)
   - data-testid pattern: `treatment-status-chip-vitalsigns-recorded-${t.id}` (mirror Phase 26.0e pattern)
   - Render sites (all 3): CustomerDetailView treatment cards + TreatmentTimelineModal row headers (via panel) + Mirror panel

6. **canAddNewItems extension** (TFP):
   ```js
   const canAddNewItems = (mode === 'create')
     || (loadedTreatmentStatus === 'doctor-recorded')
     || (loadedTreatmentStatus === 'vitalsigns-recorded');  // NEW
   ```

7. **Doctor-save gate extension** (TFP):
   ```jsx
   {(!isEdit || loadedTreatmentStatus === 'vitalsigns-recorded') && (
     <DoctorSaveButton ... />
   )}
   ```
   (Doctor can complete a vitals-only treatment without admin's prior complete-save.)

8. **AV37 extension** (audit-anti-vibe-code SKILL.md + tests/audit-branch-scope.test.js):
   - AV37.12: `saveMode === 'vitals'` referenced in TFP handleSubmit
   - AV37.13: status='vitalsigns-recorded' stamping pattern present
   - AV37.14: vitals-save button exists with `data-testid="tfp-vitals-save-btn"` + create-only gate `{!isEdit && ...}`
   - AV37.15: canAddNewItems references both `'doctor-recorded'` AND `'vitalsigns-recorded'`
   - AV37.16: doctor-save gate accepts `loadedTreatmentStatus === 'vitalsigns-recorded'` (edit-mode enablement)
   - AV37.17: chip "บันทึกข้อมูลซักประวัติ" rendering present in CDV + TimelineModal

9. **Tests Rule I full-flow** (`tests/phase-26-2f-pre-vitals-save-flow-simulate.test.js`):
   - F11.1: Create mode → vitals-save → status stamped → record created with vital signs only
   - F11.2: Edit mode + status='vitalsigns-recorded' → doctor-save → status transitions to 'doctor-recorded' + recordedBy/At overwritten
   - F11.3: Edit mode + status='doctor-recorded' → regular save → status cleared via deleteField
   - F11.4: Edit mode + status='vitalsigns-recorded' → regular save → status cleared (admin shortcut)
   - F11.5: canAddNewItems gate truthy for both 'vitalsigns-recorded' + 'doctor-recorded' edit states
   - F11.6: 3-stage workflow chain: admin vitals → doctor doctor → admin regular → complete

### Phase 26.2f — TreatmentReadOnlyMirror component

**File created**: `src/components/backend/TreatmentReadOnlyMirror.jsx` (~600-800 LOC)

**Props**:
```js
{
  treatmentDoc,        // full Firestore doc (with detail nested) — null OR fullDoc
  theme,               // 'dark' | 'light'
  accentColor,         // hex color for accent
  isLatest,            // boolean for "ล่าสุด" badge
  showCloseButton,     // boolean (TFP split-screen sets true)
  onClose,             // function called on close button click
}
```

**Layout** (mirrors TFP form section structure inside the 50% split-screen aside):

```jsx
<div data-testid="treatment-read-only-mirror" className="space-y-4">
  {/* Header — Date + isLatest badge + status chip + close button */}
  <HeaderRow ... />

  {/* Status badge BAR — "อ่านอย่างเดียว · บันทึกการรักษานี้" replaces save buttons */}
  <ReadOnlyBanner ... />

  {/* Section 1: ข้อมูลการรักษา */}
  <FormSection icon={Stethoscope} title="ข้อมูลการรักษา">
    <DisabledSelect label="แพทย์" value={doctor.displayName || ''} />
    <DisabledChipStrip label="ผู้ช่วยแพทย์" values={assistants.map(a => a.displayName || a)} />
    <DisabledDateInput label="วันที่รักษา" value={treatmentDate} />
  </FormSection>

  {/* Section 2: หมายเหตุทั่วไป */}
  {customerNote && (
    <FormSection icon={ClipboardCheck} title="หมายเหตุทั่วไป">
      <DisabledTextarea value={customerNote} />
    </FormSection>
  )}

  {/* Section 3: ข้อมูลสุขภาพลูกค้า */}
  <FormSection icon={Heart} title="ข้อมูลสุขภาพลูกค้า">
    <DisabledSelect label="กรุ๊ปเลือด" value={bloodType} />
    <DisabledTextarea label="โรคประจำตัว" value={chronicDisease} />
    <DisabledTextarea label="ประวัติแพ้ยา" value={drugAllergy} />
    <DisabledTextarea label="ประวัติการรักษาอื่นๆ" value={otherHistory} />
  </FormSection>

  {/* Section 4: ข้อมูลซักประวัติ (Vital Signs) */}
  <FormSection icon={Activity} title="ข้อมูลซักประวัติ (Vital Signs)">
    <VitalSignsGrid disabled values={vitalSigns} />
  </FormSection>

  {/* Section 5: ใบรับรองแพทย์ */}
  <FormSection title="ใบรับรองแพทย์">
    <DisabledCheckbox label="ผู้ป่วยมารักษาวันนี้จริง" checked={cert.confirmVisit} />
    <DisabledCheckbox label="ให้หยุดพัก" checked={cert.giveSickLeave} />
    <DisabledCheckbox label="อื่นๆ" checked={cert.other} />
  </FormSection>

  {/* Section 6: OPD Card */}
  <FormSection icon={ClipboardList} title="OPD Card">
    <DisabledTextarea label="CC — อาการ (Chief Complaint)" value={cc} />
    <DisabledTextarea label="PE — ตรวจร่างกาย (Physical Exam)" value={pe} />
    <DisabledTextarea label="DX — วินิจฉัยโรค (Diagnosis)" value={dx} />
    <DisabledTextarea label="Tx — รักษา / Dr. Note" value={tx} />
    <DisabledTextarea label="Plan — แผนการรักษา" value={plan} />
    <DisabledTextarea label="Note — หมายเหตุการรักษา" value={note} />
  </FormSection>

  {/* Section 7: CHART images */}
  {chartImages.length > 0 && (
    <FormSection icon={FileText} title="CHART">
      <ImageGrid label="Charts" images={chartImages} onZoom={setLightbox} />
    </FormSection>
  )}

  {/* Section 8-10: Items / Meds / Consumables */}
  {courseItems.length > 0 && (
    <FormSection title="รายการรักษา">
      <ItemList items={courseItems} />
    </FormSection>
  )}
  {medications.length > 0 && (
    <FormSection title="ยากลับบ้าน">
      <ItemList items={medications} />
    </FormSection>
  )}
  {consumables.length > 0 && (
    <FormSection title="สินค้าสิ้นเปลือง">
      <ItemList items={consumables} />
    </FormSection>
  )}

  {/* Section 11: รูปภาพการรักษา */}
  {(otherImages.length > 0 || beforeImages.length > 0 || afterImages.length > 0) && (
    <FormSection title="รูปภาพการรักษา">
      <ImageGridColumn label="OPD/อื่นๆ" images={otherImages} onZoom={setLightbox} />
      <ImageGridColumn label="Before" images={beforeImages} onZoom={setLightbox} />
      <ImageGridColumn label="After" images={afterImages} onZoom={setLightbox} />
    </FormSection>
  )}

  {/* Lightbox (self-contained) */}
  {lightbox && <Lightbox src={lightbox.src} label={lightbox.label} onClose={() => setLightbox(null)} />}
</div>
```

**Field rendering helpers** (local to Mirror, NOT exported):

```js
function DisabledInput({ label, value, type = 'text' }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        type={type}
        disabled
        value={value || ''}
        className={`${disabledInputCls} disabled:cursor-not-allowed disabled:opacity-90`}
      />
    </div>
  );
}

function DisabledTextarea({ label, value }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <textarea
        disabled
        value={value || ''}
        rows={3}
        className={`${disabledTextareaCls} disabled:cursor-not-allowed disabled:opacity-90`}
      />
    </div>
  );
}

function DisabledSelect({ label, value }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <select disabled value={value || ''} className={`${disabledSelectCls} disabled:cursor-not-allowed disabled:opacity-90`}>
        <option value={value || ''}>{value || '—'}</option>
      </select>
    </div>
  );
}

function DisabledCheckbox({ label, checked }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" disabled checked={!!checked} className="disabled:cursor-not-allowed disabled:opacity-90" />
      <span>{label}</span>
    </label>
  );
}
```

**Object/array value extraction** (fixes the `[object Object]` bug):

```js
function extractDisplayString(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return value.displayName || value.name || value.id || '';
  }
  return String(value);
}

// Usage:
const doctorName = extractDisplayString(detail.doctor);
const assistantNames = (detail.assistants || []).map(extractDisplayString).join(', ');
```

**Lightbox + ImageGridColumn**: copied/imported from current `TreatmentReadOnlyPanel.jsx` (DRY — extract to a shared `_readOnlyImageGrid.jsx` helper OR inline duplicate; decision in plan).

### Phase 26.2g — Wire Mirror into TFP split-screen call-sites

**Files modified**:
- `src/components/TreatmentFormPage.jsx` — both call-sites (desktop aside line ~5010 + mobile fallback line ~5159) switch from `<TreatmentReadOnlyPanel>` to `<TreatmentReadOnlyMirror>`. Props change accordingly:
  - `treatmentSummary` → DROP (Mirror takes only `treatmentDoc`)
  - `treatmentFull` → `treatmentDoc`
  - Other props unchanged

The IIFE that derives summary in TFP (currently lines 5011-5024) is DROPPED — Mirror reads everything from `treatmentDoc` directly.

`TreatmentReadOnlyPanel` STAYS in TimelineModal (its condensed shape suits the scrollable per-row list).

### Phase 26.2h — AV39 audit invariant (Mirror read-only contract)

**Files modified**:
- `.agents/skills/audit-anti-vibe-code/SKILL.md` — append AV39 entry
- `tests/audit-branch-scope.test.js` — append AV39 describe block with 8 sub-tests

**AV39 invariants**:
- AV39.1: `TreatmentReadOnlyMirror.jsx` exists at canonical path
- AV39.2: NO `onEditTreatment` / `onDeleteTreatment` prop references (code body — comments OK)
- AV39.3: Every `<input>` element has `disabled` attribute (no editable inputs)
- AV39.4: Every `<textarea>` has `disabled` attribute
- AV39.5: Every `<select>` has `disabled` attribute
- AV39.6: NO save / submit button text ("บันทึก" / "Save" inside `<button>` tags)
- AV39.7: NO `onChange` handlers on form fields (or only no-op `() => {}` patterns)
- AV39.8: Lightbox + setLightbox state preserved (image zoom permitted)

Companion to AV37 (Phase 26.0 doctor-save invariants) + AV38 (Phase 26.2b condensed-panel invariants).

### Phase 26.2i — Full-suite verify + wiki + handoff

**Activities**:
- Run full `npm test -- --run` (Rule N end-of-batch)
- Confirm 8356 + ~30-40 NEW tests = ~8390-8400 PASS, 1 skip (pre-existing flake), 0 fail
- Build clean
- Wiki concept page extension: `wiki/concepts/treatment-status-and-doctor-save.md` (extend with 3-stage status workflow + Mirror + Vitals-Save)
- New wiki concept: `wiki/concepts/tfp-readonly-mirror.md` (Mirror architecture + AV39)
- Append `wiki/log.md` Phase 26.2f entry
- Update `SESSION_HANDOFF.md` + `.agents/active.md` with Phase 26.2f final state (commit count + test count + deploy-pending status)

## File inventory summary

**Created**:
- `src/components/backend/TreatmentReadOnlyMirror.jsx` (~700 LOC)
- `tests/phase-26-2f-pre-vitals-save-source-grep.test.js`
- `tests/phase-26-2f-pre-vitals-save-rtl.test.jsx`
- `tests/phase-26-2f-pre-vitals-save-flow-simulate.test.js`
- `tests/phase-26-2f-mirror-source-grep.test.js`
- `tests/phase-26-2f-mirror-rtl.test.jsx`
- `wiki/concepts/tfp-readonly-mirror.md`

**Modified**:
- `src/components/TreatmentFormPage.jsx` — section reorder + vitals-save button + handleSubmit branch + canAddNewItems + doctor-save gate + Mirror import + 2 call-sites
- `src/components/backend/CustomerDetailView.jsx` — chip "บันทึกข้อมูลซักประวัติ"
- `src/components/backend/TreatmentTimelineModal.jsx` — same chip (via panel)
- `src/lib/backendClient.js` — verify rebuildTreatmentSummary status preservation
- `tests/audit-branch-scope.test.js` — AV37.12-AV37.17 + AV39.1-AV39.8 = 14 new audit assertions
- `.agents/skills/audit-anti-vibe-code/SKILL.md` — AV37 extension + AV39 entry
- `wiki/concepts/treatment-status-and-doctor-save.md` — 3-stage workflow extension
- `wiki/log.md` — Phase 26.2f entry
- `SESSION_HANDOFF.md` — Phase 26.2f state block
- `.agents/active.md` — final state

## Rule constraints

- Rule J brainstorming HARD-GATE honored (this spec written after user-approved design)
- Rule I full-flow simulate mandatory at sub-phase end (F11 covers Phase 26.2f-pre; existing F10 covers Mirror integration)
- Rule N targeted-test-only during iteration; full suite at end of batch (Phase 26.2i)
- Rule K work-first test-last for multi-sub-phase batch (Phase 26.2f-pre → Mirror → AV39 → verify — write code first across all sub-phases, then test bank in single pass before commit)
- Rule of 3: panel + Mirror co-exist (2 consumers each) — not yet Rule of 3 trigger (3rd consumer would be e.g., print preview)
- No deploy this sub-phase (combined Phase 26.0 + 26.1 + 26.2 + 26.2f = ~50+ commits ahead of prod; user-triggered combined deploy per Rule V15)

## Test count estimate

- AV37 extension: +6 (audit-branch-scope.test.js)
- Phase 26.2f-pre source-grep: +5-7 (G5 group)
- Phase 26.2f-pre RTL: +3-5 (V1 group)
- Phase 26.2f-pre flow-simulate: +6 (F11.1-F11.6)
- Phase 26.2f Mirror source-grep: +10-15 (M1-M2 groups)
- Phase 26.2f Mirror RTL: +5-8 (every section renders + disabled state)
- Phase 26.2h AV39: +8 sub-tests
- **Total estimate**: +43-55 NEW tests (8356 → ~8400 PASS)

## Rollout decision

- Sub-phase 26.2f-pre + 26.2f + 26.2g + 26.2h + 26.2i = 5 commits minimum (more if spec/quality fix-ups iterate per subagent discipline)
- Estimated execution: 1 session via subagent-driven discipline (~3-4 hours)
- Local-only — no deploy authorization in this scope

## Self-review notes

- **OPD Card field set**: spec enumerates CC/PE/DX/Tx/Plan/Note as the canonical 6. If TFP introduces additional OPD fields (e.g., "หมายเหตุเพิ่มเติม" already present in current TFP — verify in implementation), Mirror MUST render them too. Implementation step in the plan will grep TFP's OPD card section for the complete field list.
- **`ReadOnlyBanner` placeholder**: the layout pseudocode mentions a "ReadOnlyBanner" element ("อ่านอย่างเดียว · บันทึกการรักษานี้"). Concrete spec: a small div directly below the header (`bg-[var(--bg-card)] border border-[var(--bd)] rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--tx-muted)] inline-flex items-center gap-1.5`) with a `Lock` icon + Thai copy. Replaces the save-button footer.
- **Lightbox + ImageGridColumn extraction**: implementation plan will choose between (a) extract to `src/components/backend/_readOnlyImageGrid.jsx` shared helper (used by both Panel + Mirror) OR (b) inline duplicate in Mirror. Default recommendation = (a) — but defer to plan based on actual call-site comparison.
- **No contradictions** detected: section reorder + button position + status state machine + AV37 extension all consistent.
- **Scope**: 5 sub-phases × 1 session estimate. Plan will decompose into ~7-10 tasks (Phase 26.2f-pre = 3-4 tasks, Mirror = 2-3 tasks, AV39 = 1 task, verify+docs = 1-2 tasks).
