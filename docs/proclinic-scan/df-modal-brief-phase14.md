# Phase 14 Triangle — DF Modal on Treatment Edit

Captured 2026-04-24 via `opd.js flow + inspect` (new armory commands,
Rule F-bis). Source recipe: `F:\replicated\scraper\recipes\df-modal-capture.json`.
Full trace: `F:\replicated\output\flows\df-modal-capture-*.json`.

## Page + URL pattern

- **Treatment edit URL**: `/admin/treatment/{numericId}/edit` (e.g. `3357`).
  **Not** the display label `MC-69003357` — that's cosmetic.
- Found via: `inspect` — `Array.from(document.querySelectorAll('a[href*=treatment]')).map(a => a.href)` showed both
  numeric `/edit` and `/{specialty-doc}` paths. Pattern: `treatment/{id}/{action}`.

## DF Modals on treatment edit page

Two modals co-exist on `/admin/treatment/{id}/edit`:
- `#addDfModal` — "เพิ่มค่ามือแพทย์ & ผู้ช่วยแพทย์"
- `#editDfModal` — "แก้ไขค่ามือแพทย์ & ผู้ช่วยแพทย์"

No `data-bs-target` trigger buttons — modals opened via JS (`$('#addDfModal').modal('show')`).

## Form shape (captured from live ProClinic)

Inside `#addDfModal form`:
- Action: form.action = `/admin/treatment/{id}/edit` (shared outer form)
- Method: `get` (outer form is a get — actual save is XHR to calculate2 + another POST)
- Fields:
  - `doctor_id` (select-one, **pre-filled from treatment's main doctor**)
  - `df_group_id` (select-one, **pre-filled from doctor's default group**)
  - Per-course row: checkbox (include flag) + `number` input (DF amount) + "บาท" unit label
  - Row count matches treatment's `items.courses[]` — filtered, not all courses

Doctor options (partial, 8 of 30+):
```
85  → หมอ น้ำตาล
308 → นาสาว An เอ
462 → In
511 → namfon nam
400 → Wee 523
609 → กภ ก้อง
794 → คุณบี
```
List mixes "doctors" + "assistants" — position discriminator on be_doctors
identifies which is which.

DF Group options (all 9 visible):
```
28 → ตัดไหม
26 → ตอกเส้น
25 → นวด
19 → เอ
18 → ผู้ช่วยประจำ
17 → กลุ่มหมอฟรีแลน
16 → กลุ่มหมอประจำ    ← default for doctor 85
6  → ค่ามือหมอ 10% ทุกคอร์ส
```

## 🔑 Hidden API — `/admin/df/calculate2`

**The critical wiring that visual inspection would miss.**

Captured in the flow's `apiLog`:
```
POST /admin/df/calculate2?doctor_id=85&df_group_id=16&treatment_id=3357
```

Fires:
1. When modal opens (to populate initial DF rows)
2. When user changes `doctor_id` (recompute)
3. When user changes `df_group_id` (recompute)

Returns (assumed based on modal behaviour — response body not yet dumped):
```json
{ "rows": [{ "courseId": "...", "dfAmount": 400, "type": "baht" }, ...] }
```

**This is why ProClinic's auto-populate works**. The backend resolver computes
per-course DF (staff override > group rate > 0) and ships the values to the
modal. Our Phase 13.3 resolver `getRateForStaffCourse` mirrors this — so our
Phase 14 implementation can call it client-side instead of needing a server
endpoint.

## Save flow — captured 2026-04-24 via HAR + flow

Recipe: `F:\replicated\scraper\recipes\df-save-capture.json`
HAR: `F:\replicated\output\har\har-*_treatment_3357_edit-*.har`
Flow trace: `F:\replicated\output\flows\df-save-capture-*.json`

**Findings:**

1. **Modal form FormData contains only 2 named fields**: `doctor_id` + `df_group_id`.
   All the per-course rows use `<input type=number>` and `<input type=checkbox>`
   WITHOUT `name` attributes. ProClinic's JS harvests the row DOM nodes
   at submit time + assembles the payload before XHR.

2. **Client-side uniqueness guard**: clicking "ยืนยัน" when `doctor_id`
   already has an existing DF entry on this treatment shows a toast
   "แพทย์/ผู้ช่วยแพทย์คนดังกล่าวถูกเลือกแล้ว" and blocks submission.
   No network call fires. So ADD modal is "new doctor only" — editing
   an existing entry must use `#editDfModal`.

3. **Submit flow** (blocked by dup-guard in our test run, inferred from
   the JS files loaded — `treatment-edit.js`, `treatment-draft.js`):
   - Collect checked rows → build payload `[{courseId, value, type}, ...]`
   - XHR POST (likely to `/admin/treatment/{id}/df-entry` or similar)
   - On success, close modal + refresh the DF section inline

4. **TODO — follow-up capture** when time permits:
   - Test on a treatment WITHOUT existing DF entries to trigger real POST
   - Capture response shape (does it return the saved entry? the full list?)
   - Probe `#editDfModal` with same flow pattern (open → inspect → fill → submit)

## Design implication for Phase 14

Since ProClinic doesn't expose the row inputs by name, our replica can
freely design the `dfEntries[]` shape however makes sense for Firestore
without worrying about ProClinic parity at the field-name level. The
KEY behaviours to mirror are:

1. Auto-populate on doctor+group change (via client-side resolver)
2. Dup-guard: can't add DF for a doctor who already has an entry —
   instead, opening that doctor loads `#editDfModal` with existing values
3. Inline refresh after save (no page reload)

## Mapping to Phase 14 design

| ProClinic | LoverClinic Phase 14 |
|---|---|
| `/admin/treatment/{id}/edit` modal | `DfEntryModal` on `TreatmentFormPage` |
| `doctor_id` (outer treatment form) | `doctorId` on form + `assistantIds[]` |
| `df_group_id` pre-filled from doctor | `defaultDfGroupId` on `be_doctors` (14.1 task) |
| `/admin/df/calculate2` server API | Client-side `getRateForStaffCourse` + `computeDfAmount` (Phase 13.3, shipped) |
| Per-course rows filtered to treatment items | Walk `formData.items.courses[]` |
| baht vs % toggle per row | `type: 'baht'|'percent'` in dfEntries |
| Checkbox = include in final save | `enabled: bool` on each dfEntry |
| "ยืนยัน" submit | saveTreatment → stores `detail.dfEntries[]` |

## Auto-populate logic confirmed

Pick doctor → DF group auto-updates:
- In the flow, initial state: `doctor_id=85, df_group_id=16 (กลุ่มหมอประจำ)`
- Selecting doctor=85 again (no-op) still shows df_group=16 (confirmed stable)
- API `/admin/df/calculate2` refires on each doctor select (confirmed via apiLog)

**Rule**: doctor has a `defaultDfGroupId`; picking them sets the group
dropdown accordingly. If the user later changes the group, keep their
override (don't auto-reset).

## What's still unknown / to capture next

- [ ] Response body shape of `/admin/df/calculate2` — for reference only (we compute client-side)
- [ ] Save endpoint when "ยืนยัน" clicked — Phase 14.2 follow-up
- [ ] Edit modal behaviour — loads existing `dfEntries[]` into rows, allows override (verified visually from user's Screenshot 2)
- [ ] What happens if doctor has NO defaultDfGroupId — does df_group stay on "ไม่ระบุกลุ่ม"? need to test
- [ ] Multiple doctors/assistants on a single treatment — one DF entry per person? ProClinic allows multiple?

## Phase 14 design decisions informed by this scan

1. **`defaultDfGroupId` on `be_doctors`** — required (14.1). Without it,
   the DF modal can't pre-populate the group dropdown correctly.
2. **DF entries scoped to treatment** — modal shows only courses already
   in the treatment, not all courses. Our form walks `formData.items.courses[]`.
3. **Client-side DF resolution** — we have `getRateForStaffCourse` already.
   Call it on doctor/group change, populate rows, allow override per row.
   No server endpoint needed.
4. **DfEntries schema** — stored on `be_treatments.detail.dfEntries[]`:
   ```js
   dfEntries: [{
     id: 'DFE-<ts>-<hex>',
     doctorId: '85',
     doctorName: 'หมอ น้ำตาล',
     dfGroupId: '16',          // resolved group at entry creation
     rows: [{
       courseId: 'C1',
       courseName: 'Allergan 100 U',
       enabled: true,
       value: 400,
       type: 'baht'            // 'baht' | 'percent'
     }]
   }]
   ```
