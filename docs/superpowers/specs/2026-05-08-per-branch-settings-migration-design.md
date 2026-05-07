# Per-Branch Settings Migration

> **Status**: DESIGN locked 2026-05-08. Awaiting user spec review → writing-plans → executing-plans.
> **Author**: Claude (sonnet/opus 4.7) under user `/brainstorming` invocation 2026-05-08 EOD #4 Spec #2.
> **Spec**: `docs/superpowers/specs/2026-05-08-per-branch-settings-migration-design.md` (this file).
> **Companion**: `docs/superpowers/specs/2026-05-08-rule-p-class-of-bug-expansion-design.md` (Spec #1 Rule P methodology).

---

## 1. Problem Statement

Post-V50 (ProClinic strip complete, 2026-05-08), the LoverClinic app supports
multi-branch operation (Phase 17.x BSA + Phase 17.2 branch-equality). Each branch
has its own physical address, phone, license, tax ID, and operating hours. **But
the data model still mixes branch-specific config into the global
`clinic_settings/main` document**, which:

1. Forces all branches to share the SAME phone / address / license / tax / open
   hours (incorrect for multi-branch operation)
2. Creates duplicate fields between `BranchFormModal` (which already has flat
   `phone` / `licenseNo` / `taxId` / `address` / `addressEn`) and
   `ClinicSettingsPanel` (which has the same fields globally) — admin must input
   the same data twice in different places
3. Some user-facing surfaces (DocumentPrintModal / SalePrintView /
   QuotationPrintView) already use `useEffectiveClinicSettings` (a partial cascade
   helper) for SOME fields, but the cascade only handles 7 of the 13 fields that
   should be per-branch

User directive (verbatim, 2026-05-08 EOD #4):

> "นำข้อมูลเหล่านี้ในภาพ ซึ่งอยู่ในหน้าตั้งค่าของ Frontend ไปไว้ในการสร้าง/แก้ไข
> ของแต่ละสาขา ยกเว้น เวลาแพทย์เข้า (เพราะจะไม่ได้ใช้แล้วเนื่องจากจะออกแบบให้ใน
> tab นัดหมายของ Frontend ไปดึงเวลาจริงจากตารางแพทย์ของแต่ละสาขาแล้ว) หลังจากนั้น
> ก็ wiring ให้ Frontend ไปดูดข้อมูลตรงนั้นของแต่ละสาขามาใช้เลย ลดการซ้ำซ้อนของการ
> กรอกข้อมูล อันไหนซ้ำก็ไม่ต้องไปสร้าง field ซ้ำใน modal สร้าง/แก้ไข สาขานะ ก็
> wiring ให้ frontend ของสาขานั้นๆไปดูดมาเลย"

Translation: "Take this data in the image (Frontend settings page) and put it in
each branch's create/edit, except 'doctor hours' (will not be used because the
appointment tab of frontend is being designed to pull real time from each branch's
staff schedule). After that, wire frontend to suck that branch's data. Reduce
duplicate input. If duplicate, don't create duplicate field in branch
create/edit modal. Wire that branch's frontend to suck data from there."

## 2. Brainstorming Decisions Locked

Per `/brainstorming` Q1-Q4 + approach choice (2026-05-08 EOD #4):

| Q | Topic | Decision | Rationale |
|---|-------|----------|-----------|
| Q1 | Schema shape | **Nested `settings` sub-object on `be_branches`** | Cleaner separation between identification fields (top-level) and operational settings (nested). Consistent with future per-branch config additions. |
| Q2 | Migration strategy | **Single Rule M one-shot script** | One commit landing → one `--apply` cycle → cleanup. Matches V42-V49 saga commit cadence. |
| Q3 | ClinicSettingsPanel post-migration | **Delete 7 migrated sections; no hint** | Most aggressive — admin discovers per-branch in BranchesTab. Matches user "ลบ sections ทิ้งไม่มี hint". |
| Q4 | Audit invariant placement | **Extend audit-branch-scope BS-10 + AV29 in audit-anti-vibe-code** | BS family already covers BSA; this is a per-branch read-side invariant. AV29 satisfies Rule P Tier 2 companion. |
| App | Implementation approach | **Approach B — 3-phase batched (3 commits)** | (1) helper + 17 consumers + Rule P Tier 2 artifacts; (2) UI + migration script; (3) cleanup |

## 3. Schema Delta on `be_branches`

```js
be_branches/{branchId}: {
  // ─── Identification (top-level — UNCHANGED from current shape) ───
  branchId, name, code, nameEn, status, note,
  googleMapUrl, latitude, longitude,
  isHidden, hiddenAt, hiddenBy,
  createdAt, createdBy, updatedAt, updatedBy,

  // ─── Settings (NEW nested sub-object) ───
  settings: {
    // ── 5 fields MIGRATING from flat top-level (deduplication move) ──
    phone: string,                       // 9-15 digit Thai format
    licenseNo: string,                   // free-text
    taxId: string,                       // 13-digit
    address: string,                     // multi-line TH
    addressEn: string,                   // multi-line EN

    // ── 8 NEW fields from clinic_settings (migration) ──
    email: string,                       // valid email
    lineOaUrl: string,                   // valid https URL
    patientSyncCooldownMins: number,     // 0-99999, default 10
    openHours: {
      monFri: { open: 'HH:MM', close: 'HH:MM' },   // default "10:00" / "20:30"
      satSun: { open: 'HH:MM', close: 'HH:MM' },   // default "10:00" / "19:30"
    },
    chatHours: {
      alwaysOn: boolean,                 // default false
      monFri: { open: 'HH:MM', close: 'HH:MM' },   // default "10:00" / "20:45"
      satSun: { open: 'HH:MM', close: 'HH:MM' },   // default "10:00" / "19:45"
    },

    // ── Forensic trail (Rule M migration script stamps these) ──
    _migratedAt?: timestamp,
    _migratedFromCs?: object,            // snapshot of cs values pre-migration
  },
}
```

### Validation rules (in `branchValidation.js`)

- Top-level `name` → REQUIRED (current behavior)
- `settings.phone` → REQUIRED (currently `phone` is required at top-level; moves to settings + stays required)
- All other `settings.*` → OPTIONAL; empty values fall back through cascade
- `settings.email` → must match basic email regex if present
- `settings.lineOaUrl` → must start with `https://` if present
- `settings.patientSyncCooldownMins` → clamped to [0, 99999] on save
- `settings.openHours.X.{open,close}` → "HH:MM" pattern (regex `/^([01][0-9]|2[0-3]):(00|15|30|45)$/` matching the existing `TimeSelect24` 15-min step)
- `settings.chatHours.alwaysOn === true` → open/close fields IGNORED (not validated)

### Default values for new branches (`emptyBranchForm()` in `branchValidation.js`)

Pulled from `DEFAULT_CLINIC_SETTINGS` in `src/constants.js` + image-shown values for current global state:
- `settings.phone/licenseNo/taxId/address/addressEn/email/lineOaUrl` → empty string
- `settings.patientSyncCooldownMins` → 10
- `settings.openHours.monFri` → `{ open: '10:00', close: '20:30' }`
- `settings.openHours.satSun` → `{ open: '10:00', close: '19:30' }`
- `settings.chatHours.alwaysOn` → false
- `settings.chatHours.monFri` → `{ open: '10:00', close: '20:45' }`
- `settings.chatHours.satSun` → `{ open: '10:00', close: '19:45' }`

## 4. `mergeBranchIntoClinic` + `useEffectiveClinicSettings` Extension

`src/lib/BranchContext.jsx` lines 334-385 already provide cascade for 7 fields
(clinicName/nameEn/address/phone/taxId/licenseNo/website). Extend to handle the 13
migrated fields with 3-source cascade priority: `settings.X > flat branch.X > clinicSettings.X`.

```js
// src/lib/BranchContext.jsx — extended mergeBranchIntoClinic
export function mergeBranchIntoClinic(clinicSettings, branch) {
  const cs = clinicSettings || {};
  if (!branch || typeof branch !== 'object') return cs;
  const settings = branch.settings || {};

  const pickStr = (settingsVal, branchVal, csVal) => {
    if (typeof settingsVal === 'string' && settingsVal.trim()) return settingsVal;
    if (typeof branchVal === 'string' && branchVal.trim()) return branchVal;
    return csVal;
  };
  const pickNum = (settingsVal, csVal) => {
    if (Number.isFinite(settingsVal)) return settingsVal;
    return csVal;
  };
  const pickObj = (settingsVal, csVal) =>
    settingsVal && typeof settingsVal === 'object' ? settingsVal : csVal;

  // Brand fields (logo/accentColor/clinicSubtitle) STAY from cs (unchanged).
  // Clinic name composite: "<brand> <branch>" pattern (V40 convention preserved).
  const brandName = (typeof cs.clinicName === 'string' && cs.clinicName.trim())
    ? cs.clinicName.trim() : '';
  const branchName = (typeof branch.name === 'string' && branch.name.trim())
    ? branch.name.trim() : '';
  const effectiveClinicName = brandName && branchName
    ? `${brandName} ${branchName}`
    : (branchName || brandName || cs.clinicName);

  return {
    ...cs,
    clinicName: effectiveClinicName,
    clinicNameEn: pickStr(undefined, branch.nameEn, cs.clinicNameEn),  // nameEn stays at top-level
    // 5 migrated fields — read settings.X > branch.X > cs.X
    phone:        pickStr(settings.phone,     branch.phone,     cs.phone),
    licenseNo:    pickStr(settings.licenseNo, branch.licenseNo, cs.licenseNo),
    taxId:        pickStr(settings.taxId,     branch.taxId,     cs.taxId),
    address:      pickStr(settings.address,   branch.address,   cs.address),
    addressEn:    pickStr(settings.addressEn, branch.addressEn, cs.addressEn),
    website:      pickStr(undefined,          branch.website,   cs.website),  // unchanged from V40
    // 8 NEW fields — read settings.X > cs.X (no flat fallback; cs.X is migration source)
    clinicEmail:             pickStr(settings.email,     undefined, cs.clinicEmail),
    lineOfficialAccountUrl:  pickStr(settings.lineOaUrl, undefined, cs.lineOfficialAccountUrl),
    patientSyncCooldownMins: pickNum(settings.patientSyncCooldownMins, cs.patientSyncCooldownMins),
    openHoursMonFri:         pickObj(settings.openHours?.monFri, cs.openHoursMonFri),
    openHoursSatSun:         pickObj(settings.openHours?.satSun, cs.openHoursSatSun),
    chatHoursAlwaysOn:       typeof settings.chatHours?.alwaysOn === 'boolean'
                               ? settings.chatHours.alwaysOn
                               : !!cs.chatHoursAlwaysOn,
    chatHoursMonFri:         pickObj(settings.chatHours?.monFri, cs.chatHoursMonFri),
    chatHoursSatSun:         pickObj(settings.chatHours?.satSun, cs.chatHoursSatSun),
  };
}
```

`useEffectiveClinicSettings` API surface unchanged — already wraps `mergeBranchIntoClinic` reactively.
Just gets the new fields automatically through the merge output.

**Backward-compat property**: during transition (between Phase 1 commit and Phase 3 cleanup), reads work for ALL 3 shapes:
- New (post-migration): `branch.settings.X` → wins
- Mid (flat-already-existed): `branch.X` flat → wins (for the 5 deduplicating fields)
- Legacy (clinic_settings only): `cs.X` → fallback (for the 8 new fields)

After Phase 3 cleanup, the `branch.X` flat-fallback path is removed (only post-migration cleanup; reads simplify to `settings.X || cs.X`).

## 5. 17-Consumer Migration Map (Rule P Tier 2 classifier)

Per Rule P, the multi-reader-sweep needs an enumeration of all consumers + their migration action:

| File | Migrated field(s) read | Action |
|------|------------------------|--------|
| `src/App.jsx` | `clinicName` only | Likely no change — verify pass-through |
| `src/pages/AdminDashboard.jsx` | `clinicName` (composite) | No change (already through useEffectiveClinicSettings; verify) |
| `src/pages/BackendDashboard.jsx` | `clinicName` + `clinicSubtitle` | No change (global brand fields stay in cs) |
| `src/components/ClinicSettingsPanel.jsx` | All migrated fields (deletion target) | **DELETE 7 sections (Section 6)** |
| `src/components/TreatmentFormPage.jsx` | `phone`, `address` (header strip) | Switch to `useEffectiveClinicSettings` |
| `src/pages/PatientDashboard.jsx` | `clinicName`, `phone`, `lineOfficialAccountUrl` | Switch to `useEffectiveClinicSettings` |
| `src/lib/backendClient.js` | server-layer reads — none direct | Verify; likely no change |
| `src/components/backend/VendorSalesTab.jsx` | header strip — `clinicName` | Verify; minimal |
| `src/components/backend/QuotationFormModal.jsx` | passes `clinicSettings` to print | Verify pass-through; print engine handles |
| `src/components/backend/PromotionFormModal.jsx` | passes `clinicSettings` to MarketingFormShell | Verify pass-through |
| `src/components/backend/MovementLogPanel.jsx` | clinicSettings prop pass-through | Verify pass-through |
| `src/components/backend/DfGroupFormModal.jsx` | pass-through | Verify |
| `src/components/backend/CustomerDetailView.jsx` | `phone`, `lineOfficialAccountUrl` for contact buttons | Switch to `useEffectiveClinicSettings` |
| `src/components/backend/ProductFormModal.jsx` | likely pass-through | Verify |
| `src/components/backend/SaleTab.jsx` | passes to print | Verify pass-through |
| `src/components/backend/VoucherTab.jsx` / `CouponTab.jsx` / `PromotionTab.jsx` | pass-through to modals | Verify |
| `src/components/backend/AppointmentCalendarView.jsx` | `openHours*`, `chatHours*` for blocking logic | Switch to `useEffectiveClinicSettings` |
| `src/components/backend/DoctorsTab.jsx` / `StaffTab.jsx` / `DoctorFormModal.jsx` / `StaffFormModal.jsx` | pass-through | Verify |
| `src/components/backend/BranchesTab.jsx` | `clinicName` for header | No change (global) |
| `src/lib/tabPermissions.js` | config-level reads only | No change |
| `src/lib/branchBackupCore.js` | backup target — reads cs for archive | **No change** (backup includes cs as-is); tag `// audit-branch-scope: BS-10 sanctioned — backup target raw read OK` |

**Phase 1 commit task**: grep each file's `clinicSettings.X` reads where X ∈ {`phone`,
`clinicEmail`, `lineOfficialAccountUrl`, `clinicLicenseNo`, `clinicTaxId`,
`clinicAddress`, `clinicAddressEn`, `patientSyncCooldownMins`, `openHoursMonFri`,
`openHoursSatSun`, `chatHoursAlwaysOn`, `chatHoursMonFri`, `chatHoursSatSun`} and
switch to `useEffectiveClinicSettings(clinicSettings)`. Print engines
(`documentPrintEngine.js`, `SalePrintView.jsx`, `QuotationPrintView.jsx`) already
accept the merged result via `useEffectiveClinicSettings` upstream — no change
needed inside them.

## 6. BranchFormModal UI Extension

Add 4 new visual sections after the existing "Map" section (line 162-200) of
`src/components/backend/BranchFormModal.jsx`:

```jsx
{/* ── Settings: Contact (additional) ── */}
<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
  <div data-field="settings.email">
    <label>อีเมลคลินิก (Clinic Email)</label>
    <input type="email" value={form.settings.email} onChange={(e) => updateSettings({ email: e.target.value })} ... />
  </div>
  <div data-field="settings.lineOaUrl">
    <label>LINE Official Account URL</label>
    <input type="url" placeholder="https://lin.ee/..."
           value={form.settings.lineOaUrl}
           onChange={(e) => updateSettings({ lineOaUrl: e.target.value })} ... />
  </div>
</div>

{/* ── Settings: Patient Sync Cooldown ── */}
<div data-field="settings.patientSyncCooldownMins">
  <label>Patient Sync Cooldown (นาที)</label>
  <input type="number" min={0} max={99999}
         value={form.settings.patientSyncCooldownMins}
         onChange={(e) => updateSettings({ patientSyncCooldownMins: parseInt(e.target.value, 10) || 0 })} ... />
  <span className="text-xs text-[var(--tx-muted)]">0 = ไม่จำกัด</span>
</div>

{/* ── Settings: เวลาเปิด-ปิดคลินิก ── */}
<div data-field="settings.openHours">
  <label>เวลาเปิด-ปิดคลินิก</label>
  <div>จ-ศ (วันธรรมดา)</div>
  <TimeSelect24 value={form.settings.openHours.monFri.open}
                onChange={(v) => updateOpenHoursMonFri({ open: v })} /> —
  <TimeSelect24 value={form.settings.openHours.monFri.close}
                onChange={(v) => updateOpenHoursMonFri({ close: v })} />
  {/* ส-อา mirrors */}
</div>

{/* ── Settings: เวลาทำการระบบแชท ── */}
<div data-field="settings.chatHours">
  <label>เวลาทำการระบบแชท</label>
  <input type="checkbox" checked={form.settings.chatHours.alwaysOn}
         onChange={(e) => updateChatHours({ alwaysOn: e.target.checked })} />
  <span>เปิดตลอด 24 ชม. (Always On)</span>
  {!form.settings.chatHours.alwaysOn && (
    <>
      {/* mon-fri + sat-sun rows */}
    </>
  )}
</div>
```

**Implementation notes**:

- `update(...)` helper (line 25 of BranchFormModal.jsx) gets a sibling `updateSettings(patch)` that shallow-merges into `form.settings`
- `updateOpenHoursMonFri(patch)` / `updateChatHoursMonFri(patch)` deep-merge into `form.settings.openHours.monFri` / `chatHours.monFri`
- Reuse `TimeSelect24` component from `ClinicSettingsPanel.jsx:15-29`. **Extract to shared `src/components/ui/TimeSelect24.jsx`** per Rule of 3 — currently inline in ClinicSettingsPanel; this becomes a shared component now that 2+ callers exist
- Existing top-level fields (`phone`, `licenseNo`, `taxId`, `address`, `addressEn`) UI stays at current location (lines 89-160) but **save handler** maps `form.X` → `form.settings.X` to write nested
- `emptyBranchForm()` in `branchValidation.js` extended with full `settings: { ... }` defaults

## 7. ClinicSettingsPanel Post-Deletion

Delete these 7 sections from `src/components/ClinicSettingsPanel.jsx` (per user "ลบ sections ทิ้งไม่มี hint"):

1. LINE OFFICIAL ACCOUNT (entire `<section>` block + state + handlers)
2. เบอร์โทรคลินิก (`clinicPhone` input + state)
3. ข้อมูลคลินิก (`clinicNameEn` / `clinicLicenseNo` / `clinicTaxId` / `clinicAddress` / `clinicAddressEn` / `clinicEmail` 6-field block)
4. PATIENT SYNC COOLDOWN (number input + cooldown ref + reset logic)
5. เวลาเปิด-ปิดคลินิก (`openHoursMonFri` + `openHoursSatSun` selects)
6. เวลาทำการระบบแชท (`chatHoursAlwaysOn` checkbox + Mon-Fri + Sat-Sun selects)
7. เวลาแพทย์เข้า (`doctorHoursMonFri` + `SatSun`) — **DELETE entirely** (per user — deprecated; use staff schedule)

**Keep these existing ClinicSettingsPanel sections**:
- Theme toggle / preset color palette
- Logo upload (Dark + Light variants)
- Clinic Name (Thai) — `clinicName` (chain brand name; stays global)
- Clinic Subtitle — `clinicSubtitle` (chain tagline; stays global)
- Save button

`handleSave` simplified — only writes `clinicName`, `clinicSubtitle`, `accentColor`, `logoUrl`, `logoUrlLight` to `clinic_settings/main`. The cooldown reset logic + 7-section state all removed.

**Estimated LOC reduction**: 610 → ~280-300 (50% reduction).

## 8. Rule M Migration Script

`scripts/v51-migrate-clinic-settings-to-branch.mjs`:

```js
// V51 — Per-branch settings migration (Rule M canonical pattern)
// Per Spec #2 docs/superpowers/specs/2026-05-08-per-branch-settings-migration-design.md
// Two-phase: dry-run by default; --apply commits.
//
// Reads:
//   1. clinic_settings/main (12 fields to migrate)
//   2. all be_branches docs
//
// Writes (per branch, atomic batch):
//   - settings.phone:     branch.phone (flat)     || cs.clinicPhone   || ''
//   - settings.licenseNo: branch.licenseNo (flat) || cs.clinicLicenseNo || ''
//   - settings.taxId:     branch.taxId (flat)     || cs.clinicTaxId   || ''
//   - settings.address:   branch.address (flat)   || cs.clinicAddress || ''
//   - settings.addressEn: branch.addressEn (flat) || cs.clinicAddressEn || ''
//   - settings.email:                                cs.clinicEmail   || ''
//   - settings.lineOaUrl:                            cs.lineOfficialAccountUrl || ''
//   - settings.patientSyncCooldownMins:              cs.patientSyncCooldownMins || 10
//   - settings.openHours.monFri:                     cs.openHoursMonFri || {open:'10:00',close:'20:30'}
//   - settings.openHours.satSun:                     cs.openHoursSatSun || {open:'10:00',close:'19:30'}
//   - settings.chatHours.alwaysOn:                   !!cs.chatHoursAlwaysOn
//   - settings.chatHours.monFri:                     cs.chatHoursMonFri || {open:'10:00',close:'20:45'}
//   - settings.chatHours.satSun:                     cs.chatHoursSatSun || {open:'10:00',close:'19:45'}
//   - DELETE flat branch.{phone, licenseNo, taxId, address, addressEn} (after verify settings.X has them)
//
// Forensic-trail: settings._migratedAt + settings._migratedFromCs (snapshot of cs values)
//
// After all branches written:
//   - DELETE clinic_settings.main fields {clinicEmail, lineOfficialAccountUrl,
//     patientSyncCooldownMins, openHoursMonFri/SatSun, chatHoursAlwaysOn,
//     chatHoursMonFri/SatSun, doctorHoursMonFri/SatSun}
//
// Audit doc: be_admin_audit/v51-migrate-clinic-settings-{ts}-{rand}
//
// Idempotent: re-run with --apply yields 0 writes (skip if settings.X already populated)
// Invocation guard: if (process.argv[1] === fileURLToPath(import.meta.url)) main();
```

Per Rule M canonical pattern:
- `vercel env pull` reuse
- firebase-admin SDK
- canonical `artifacts/{APP_ID}/public/data/` paths
- forensic-trail fields (`_migratedAt`, `_migratedFromCs`)
- idempotent (skip on `settings._migratedAt` set)
- audit doc emit
- crypto-secure random for audit-doc ID

## 9. Audit Invariants + Tests + Rule P Artifacts

### BS-10 (extend `audit-branch-scope` SKILL.md)

- **Title**: "Migrated clinic_settings fields read via useEffectiveClinicSettings"
- **Why**: per-branch settings migration (V51) moved 13 fields from global `clinic_settings/main` to per-branch `be_branches.settings`. Every UI consumer that previously read `clinicSettings.X` for a migrated field MUST now use `useEffectiveClinicSettings(clinicSettings)` to get the merged + cascaded result.
- **Migrated field set**: phone / clinicEmail / lineOfficialAccountUrl / clinicLicenseNo / clinicTaxId / clinicAddress / clinicAddressEn / patientSyncCooldownMins / openHoursMonFri / openHoursSatSun / chatHoursAlwaysOn / chatHoursMonFri / chatHoursSatSun
- **Sanctioned exceptions**:
  - `ClinicSettingsPanel.jsx` (writes back to clinic_settings — global brand fields only post-migration; no merge needed)
  - `branchBackupCore.js` (backup target — reads raw `clinic_settings` doc as archive content; tag `// audit-branch-scope: BS-10 sanctioned — backup target raw read OK`)
  - Print engines (`documentPrintEngine.js` / `SalePrintView.jsx` / `QuotationPrintView.jsx`) receive merged result from upstream callers; reads inside engine are after merge applied
- **Patterns recipe**:
  ```bash
  grep -rn "clinicSettings\.\(phone\|clinicEmail\|lineOfficialAccountUrl\|clinicLicenseNo\|clinicTaxId\|clinicAddress\|clinicAddressEn\|patientSyncCooldownMins\|openHoursMonFri\|openHoursSatSun\|chatHoursAlwaysOn\|chatHoursMonFri\|chatHoursSatSun\)" src/ \
    | grep -v ClinicSettingsPanel \
    | grep -v branchBackupCore \
    | grep -v "audit-branch-scope: BS-10 sanctioned"
  # Expected: zero output post-Phase-1.
  ```

### AV29 (extend `audit-anti-vibe-code` SKILL.md)

- **Title**: "Per-branch settings: 17-consumer multi-reader-sweep (V51 / Spec #2)"
- **Companion AV note**: cross-references BS-10 (per AV20-AV24 cluster pattern)
- **Classifier**: enumerates the 17 files + each's status (migrated / no-change / sanctioned-exception)
- **Why per Rule P**: V51 is a multi-reader-sweep (V12 family) class-of-bug expansion; Rule P Tier 2 mandates AVxx + classifier doc

### Test bank `tests/per-branch-settings-multi-reader-sweep.test.js`

Test groups (estimated 50-60 tests):

```js
describe('S1: mergeBranchIntoClinic extended cascade', () => {
  it('S1.1: settings.X wins over branch.X over cs.X', ...);
  it('S1.2: empty settings.X falls through to branch.X', ...);
  it('S1.3: empty + missing branch.X falls through to cs.X', ...);
  it('S1.4-13: each of 13 migrated fields cascades correctly', ...);
  it('S1.14: missing settings sub-object handled gracefully', ...);
  it('S1.15: chatHours.alwaysOn boolean shape preserved', ...);
});

describe('S2: useEffectiveClinicSettings reactive', () => {
  it('S2.1: branch switch refreshes consumer reads', ...);
  it('S2.2: useMemo deps include settings sub-object changes', ...);
});

describe('S3: BS-10 source-grep regression', () => {
  it('S3.1: zero raw clinicSettings.<migrated-field> reads outside sanctioned exceptions', ...);
  it('S3.2: ClinicSettingsPanel + branchBackupCore are tagged sanctioned', ...);
});

describe('S4: AV29 consumer classifier', () => {
  it('S4.1: 17-consumer enumeration matches actual src/ inventory', ...);
  it('S4.2: each consumer has explicit classification (migrated / no-change / sanctioned)', ...);
});

describe('S5: BranchFormModal renders new sections', () => {
  it('S5.1: 4 new sections render with proper data-field attrs', ...);
  it('S5.2: TimeSelect24 reused from shared module', ...);
  it('S5.3: emptyBranchForm has full settings defaults', ...);
});

describe('S6: ClinicSettingsPanel post-deletion', () => {
  it('S6.1: 7 migrated sections gone', ...);
  it('S6.2: 7 deprecated state hooks removed', ...);
  it('S6.3: handleSave only writes brand fields', ...);
});

describe('S7: Migration script (Rule M)', () => {
  it('S7.1: dry-run output validates field mapping', ...);
  it('S7.2: idempotent — re-apply yields 0 writes', ...);
  it('S7.3: forensic-trail _migratedAt + _migratedFromCs present', ...);
  it('S7.4: audit doc emitted', ...);
});

describe('S8: Rule I full-flow simulate', () => {
  it('S8.1: branch switch → useEffectiveClinicSettings recomputes → consumer updates', ...);
  it('S8.2: 3-source cascade verified end-to-end', ...);
});

describe('S9: Adversarial inputs', () => {
  it('S9.1: null branch handled', ...);
  it('S9.2: empty settings object handled', ...);
  it('S9.3: missing nested keys (settings.openHours undefined)', ...);
  it('S9.4: Thai text in address', ...);
  it('S9.5: 10K-char address truncated/preserved', ...);
});

describe('S10: V51 markers', () => {
  it('S10.1: V51 migration script invocation guard', ...);
  it('S10.2: BS-10 + AV29 cross-references coherent', ...);
});
```

## 10. 3-Phase Commit Plan

### Phase 1 — Multi-reader-sweep + helper extension + Rule P Tier 2 artifacts (single commit)

**Files modified**:
- `src/lib/BranchContext.jsx` (extended `mergeBranchIntoClinic`)
- 17 consumer files (Section 5 mapping — most are pass-through verify; ~5 actual switches)
- `.agents/skills/audit-branch-scope/SKILL.md` (BS-10 + classifier)
- `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV29 + companion AV note)
- NEW `tests/per-branch-settings-multi-reader-sweep.test.js`

**Verify**: targeted test suite GREEN:
```bash
npm test -- --run tests/audit-branch-scope.test.js tests/audit-anti-vibe-code.test.js tests/per-branch-settings-multi-reader-sweep.test.js
```

### Phase 2 — UI ship + migration script (single commit)

**Files modified**:
- `src/components/backend/BranchFormModal.jsx` (4 new sections)
- `src/lib/branchValidation.js` (extended `emptyBranchForm` + validation rules)
- NEW `src/components/ui/TimeSelect24.jsx` (extract from ClinicSettingsPanel — Rule of 3)
- `src/components/ClinicSettingsPanel.jsx` (delete 7 sections; handleSave simplified; ~50% LOC reduction)
- NEW `scripts/v51-migrate-clinic-settings-to-branch.mjs` (Rule M canonical pattern)

**Verify**:
- `npm run build` clean
- Targeted tests on BranchFormModal + branchValidation + TimeSelect24 + ClinicSettingsPanel
- Rule M migration script: `node scripts/v51-migrate-clinic-settings-to-branch.mjs` (dry-run; verify output)
- After commit lands: user runs `node scripts/v51-migrate-clinic-settings-to-branch.mjs --apply` LOCALLY (per Rule M)

### Phase 3 — Cleanup dual-shape fallback (single commit)

**Trigger**: after migration `--apply` confirmed converged on prod (admin runs locally; verifies all branches have `settings._migratedAt` set)

**Files modified**:
- `src/lib/BranchContext.jsx` — remove `branch.X` flat-fallback from `mergeBranchIntoClinic` (now only `branch.settings.X || cs.X`)
- Targeted regression test addition: assert flat-fallback removed
- AV29 update: classifier marked "post-cleanup; flat-fallback removed"

**Verify**: full `npm test -- --run` GREEN

## 11. Acceptance Criteria

The implementation is complete when ALL of:

1. ✅ `mergeBranchIntoClinic` handles 13 migrated fields with 3-source cascade (settings > flat > cs)
2. ✅ `useEffectiveClinicSettings` reactive — branch switch refreshes consumer reads
3. ✅ All 17 consumers either (a) use `useEffectiveClinicSettings` for migrated fields, or (b) tagged `// audit-branch-scope: BS-10 sanctioned`
4. ✅ BranchFormModal renders 4 new sections + persists `settings.{...}` on save
5. ✅ ClinicSettingsPanel reduced to ~280 LOC; 7 migrated sections removed
6. ✅ Migration script dry-run shows planned writes; `--apply` executes; idempotent re-run = 0 writes
7. ✅ All branches post-migration have `settings.{phone, licenseNo, taxId, address, addressEn, email, lineOaUrl, patientSyncCooldownMins, openHours, chatHours}` populated
8. ✅ `clinic_settings/main` post-migration has migrated fields DELETED (only brand/theme remain)
9. ✅ BS-10 + AV29 invariants GREEN
10. ✅ Test bank ~50-60 tests GREEN
11. ✅ Full `npm test -- --run` GREEN (no regressions)
12. ✅ Build clean (`npm run build`)
13. ✅ Cleanup commit removes dual-shape fallback after migration converged

## 12. Migration / Rollout

**No deploy required for code changes** — all 3 commits push to master and are picked up by next prod deploy (V18 user-authorized).

**Rule M migration `--apply` runs LOCALLY** post-Phase-2 commit landing (not deploy-coupled per Rule M).

**Rollout order** (safest):
1. Phase 1 commit lands → master + push (no user-visible UI change yet)
2. Phase 2 commit lands → master + push (admin sees new BranchFormModal sections + simplified ClinicSettingsPanel)
3. Admin runs `node scripts/v51-migrate-clinic-settings-to-branch.mjs --apply` locally (Rule M two-phase: dry-run → apply)
4. Verify all branches have `settings._migratedAt` set + `clinic_settings/main` migrated fields cleared
5. Phase 3 commit lands → master + push (cleanup; reads simplified to `settings.X || cs.X`)
6. Bundle Phase 1+2+3 + V49 + V50 (existing 9 commits ahead) into single `vercel --prod` when user authorizes

**Each phase rollback is independent**:
- Phase 1 rollback: revert helper + consumers (no data state change)
- Phase 2 rollback: revert UI + migration script (data already migrated → must run reverse-migration script)
- Phase 3 rollback: re-add flat-fallback to mergeBranchIntoClinic (1-line change)

## 13. Open Questions / Sanctioned Exceptions

### Open question 1: chatHours.alwaysOn vs ChatPanel logic

`ChatPanel.jsx` currently checks `chatHoursAlwaysOn` from `clinic_settings/main`. Post-migration, when admin switches branches, ChatPanel must re-evaluate against the SELECTED branch's `chatHours.alwaysOn`. This is a Phase 1 consumer migration (covered by Section 5; flagged for explicit verification).

**Resolution**: Phase 1 consumer audit covers ChatPanel; if it currently reads `clinicSettings.chatHoursAlwaysOn`, migrate to `useEffectiveClinicSettings(clinicSettings).chatHoursAlwaysOn`.

### Open question 2: AppointmentCalendarView open-hours blocking

`AppointmentCalendarView.jsx` uses `openHoursMonFri/SatSun` to determine which hours of which days are bookable. Post-migration, when admin switches branches, calendar must show the SELECTED branch's hours.

**Resolution**: Phase 1 consumer audit covers AppointmentCalendarView; switches to `useEffectiveClinicSettings`. The reactive hook ensures branch switch triggers re-render with new hours.

### Open question 3: PatientSyncCooldown reset behavior on global change

Pre-migration, ClinicSettingsPanel had logic to reset cooldown on save (line 33-34, line 109). Post-migration, the cooldown is per-branch — what should happen when admin saves in BranchFormModal with a different cooldown?

**Resolution**: Per-branch save = per-branch cooldown. No global reset. Each patient form's cooldown check reads SELECTED branch's value via `useEffectiveClinicSettings`.

### Open question 4: New branch creation defaults vs current global value

When admin adds a NEW branch post-migration, should the new branch inherit current global `clinic_settings` values (which by then are emptied for migrated fields), or use hardcoded defaults from Section 3?

**Resolution**: Use hardcoded defaults from Section 3 (consistent for all new branches; admin customizes per branch). The migration cleared `clinic_settings/main` for migrated fields; there's no "global value" to inherit by Phase 3.

### Open question 5: Migration of branches with empty flat fields

Some branches may have empty `phone` / `address` / etc. (e.g. recently-created branches). Migration logic: settings.X = `branch.X (flat) || cs.X || ''`. If both are empty, settings.X = ''.

**Resolution**: Empty values OK; admin fills via BranchFormModal post-migration if needed. No forced backfill.

## 14. References

- `src/components/ClinicSettingsPanel.jsx` — current 610-LOC global settings panel
- `src/components/backend/BranchFormModal.jsx` — current 234-LOC branch CRUD modal
- `src/lib/BranchContext.jsx` — existing 484-LOC BSA Layer 2 wrapper + `mergeBranchIntoClinic` helper (lines 334-385)
- `src/lib/branchValidation.js` — `emptyBranchForm()` + `validateBranch()` helpers
- `src/constants.js` — `DEFAULT_CLINIC_SETTINGS` definitions
- `.agents/skills/audit-branch-scope/SKILL.md` — BS-1..BS-9 invariants (BS-10 added by this spec)
- `.agents/skills/audit-anti-vibe-code/SKILL.md` — AV1..AV28 invariants (AV29 added by this spec)
- `docs/superpowers/specs/2026-05-08-rule-p-class-of-bug-expansion-design.md` — companion Spec #1 (Rule P methodology)
- V41 staff/doctor hide-from-lists pattern (AV20) — analogous default-filter + opt-in helper pattern
- V49 canonical-shape multi-reader-sweep — analogous mass-consumer migration pattern (AV27 + ForPicker variants)

---

**End of design spec.** Awaiting user spec review → writing-plans → executing-plans (across both Spec #1 + Spec #2 once both locked).
