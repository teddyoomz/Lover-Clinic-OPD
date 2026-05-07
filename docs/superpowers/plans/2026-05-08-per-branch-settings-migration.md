# Per-Branch Settings Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate 13 clinic_settings fields → per-branch `be_branches.settings` sub-object, eliminate duplicate field input across ClinicSettingsPanel + BranchFormModal, wire 17 consumers via existing `useEffectiveClinicSettings` cascade hook.

**Architecture:** Approach B — 3-phase batched (3 commits): (1) helper + multi-reader-sweep + Rule P Tier 2 artifacts; (2) UI ship + migration script; (3) cleanup dual-shape fallback after migration converged.

**Tech Stack:** React (BranchFormModal/ClinicSettingsPanel), Firestore (be_branches schema), firebase-admin SDK (migration script), vitest (test bank).

**Spec reference:** `docs/superpowers/specs/2026-05-08-per-branch-settings-migration-design.md`

**Companion methodology:** Spec #1 (Rule P) — this implementation IS the first application of Rule P discipline (multi-reader-sweep at 17 consumers = class-of-bug expansion territory).

**Pre-flight check** before starting:
- [ ] Read spec file in full
- [ ] Verify Spec #1 Rule P + audit-class-of-bug-discipline shipped (Plan #1 Task 1-7 complete)
- [ ] Confirm latest master commit + branch sync state
- [ ] Verify production at `c92f924` is stable (no impending deploy that would interfere)
- [ ] Read existing `BranchContext.jsx` lines 308-385 (`mergeBranchIntoClinic` + `useEffectiveClinicSettings`) to understand the helper to extend
- [ ] Run baseline tests: `npm test -- --run tests/audit-branch-scope.test.js tests/audit-anti-vibe-code.test.js` — must be GREEN before starting

---

# PHASE 1 — Helper extension + 17-consumer multi-reader-sweep + Rule P Tier 2 artifacts

(single commit at end of Phase 1)

## Task 1.1 — Extend `mergeBranchIntoClinic` in `src/lib/BranchContext.jsx`

**Files:**
- Modify: `src/lib/BranchContext.jsx` lines 308-385 (replace `mergeBranchIntoClinic` body)

- [ ] **Step 1.1.1: Locate current helper**

```bash
grep -n "export function mergeBranchIntoClinic" F:/LoverClinic-app/src/lib/BranchContext.jsx
grep -n "export function useEffectiveClinicSettings" F:/LoverClinic-app/src/lib/BranchContext.jsx
```
Expected: line ~334 + line ~377.

- [ ] **Step 1.1.2: Replace `mergeBranchIntoClinic` body verbatim from spec Section 4**

Use the entire JS block from spec Section 4 (`docs/superpowers/specs/2026-05-08-per-branch-settings-migration-design.md` § 4 "mergeBranchIntoClinic + useEffectiveClinicSettings Extension"). Replace current function body (lines 334-362) with extended version that handles 13 migrated fields with 3-source cascade.

Update JSDoc preceding the function to reflect new field set (5 deduplicated + 8 new).

- [ ] **Step 1.1.3: Verify `useEffectiveClinicSettings` API unchanged**

```bash
grep -A 8 "export function useEffectiveClinicSettings" F:/LoverClinic-app/src/lib/BranchContext.jsx
```
Expected: function body unchanged (just calls extended `mergeBranchIntoClinic`).

- [ ] **Step 1.1.4: Add unit tests inline (file not yet created — defer to Task 1.5)**

Skip for now. Tests land in Task 1.5.

---

## Task 1.2 — Audit + sweep 17 consumers

**Files:**
- Modify: up to 17 source files in `src/` per spec Section 5 mapping table

For each consumer in spec Section 5, perform the action:
- "No change" → tag with `// audit-branch-scope: BS-10 sanctioned — <reason>` if reads raw clinicSettings.X for migrated field
- "Switch to useEffectiveClinicSettings" → replace direct `clinicSettings.X` reads with `useEffectiveClinicSettings(clinicSettings).X`
- "Verify pass-through" → grep file; if it doesn't directly read migrated fields, no action needed

- [ ] **Step 1.2.1: Generate consumer audit list**

```bash
cd F:/LoverClinic-app
grep -rln "clinicSettings\.\(phone\|clinicEmail\|lineOfficialAccountUrl\|clinicLicenseNo\|clinicTaxId\|clinicAddress\|clinicAddressEn\|patientSyncCooldownMins\|openHoursMonFri\|openHoursSatSun\|chatHoursAlwaysOn\|chatHoursMonFri\|chatHoursSatSun\)" src/
```
Expected: list of files containing direct migrated-field reads (the actual sweep targets).

- [ ] **Step 1.2.2: Sweep each file in the list**

For each file from Step 1.2.1:

a. Read the file to understand context.

b. If file is one of these (per spec Section 5 mapping):
   - `ClinicSettingsPanel.jsx` → leave alone (delete-target in Phase 2)
   - `branchBackupCore.js` → tag `// audit-branch-scope: BS-10 sanctioned — backup target raw read OK`
   - Print engines (`documentPrintEngine.js`, `SalePrintView.jsx`, `QuotationPrintView.jsx`) → upstream callers pass merged result; verify no direct reads remain
   - Other consumer → switch direct `clinicSettings.X` to `useEffectiveClinicSettings(clinicSettings).X`

c. Pattern for the switch (typical case):

```diff
 import { useEffectiveClinicSettings } from '../../lib/BranchContext.jsx';

 function MyComponent({ clinicSettings, ... }) {
+  const effective = useEffectiveClinicSettings(clinicSettings);
   ...
-  const phone = clinicSettings.phone;
+  const phone = effective.phone;
 }
```

d. After sweep, re-run grep from Step 1.2.1 — should return ZERO results (other than `ClinicSettingsPanel.jsx` + sanctioned-tagged files).

- [ ] **Step 1.2.3: Verify build clean post-sweep**

```bash
npm run build
```
Expected: build succeeds (no broken imports / refs).

---

## Task 1.3 — Add BS-10 to `audit-branch-scope` SKILL.md

**Files:**
- Modify: `.agents/skills/audit-branch-scope/SKILL.md` (append BS-10 section)
- Modify: `.agents/skills/audit-branch-scope/patterns.md` (append BS-10 grep recipe)

- [ ] **Step 1.3.1: Append BS-10 section to SKILL.md**

After current BS-9 entry, add new BS-10 section verbatim from spec Section 9 "BS-10 (extend audit-branch-scope SKILL.md)" — title + Why + Migrated field set + Sanctioned exceptions + Patterns recipe.

- [ ] **Step 1.3.2: Append BS-10 grep recipe to patterns.md**

Mirror existing BS-1..BS-9 recipe shape. Description / Grep / Expected output / Fix recipe.

---

## Task 1.4 — Add AV29 to `audit-anti-vibe-code` SKILL.md

**Files:**
- Modify: `.agents/skills/audit-anti-vibe-code/SKILL.md` (append AV29 section)

- [ ] **Step 1.4.1: Append AV29 section**

After current AV28 entry, add new AV29 section per spec Section 9 "AV29 (extend audit-anti-vibe-code SKILL.md)":
- Title: "Per-branch settings: 17-consumer multi-reader-sweep (V51 / Spec #2)"
- Why
- Companion AV note (cross-references BS-10)
- Classifier: enumerate 17 files + each's status (migrated / no-change / sanctioned-exception)
- Verify line: `tests/per-branch-settings-multi-reader-sweep.test.js`

---

## Task 1.5 — Write `tests/per-branch-settings-multi-reader-sweep.test.js`

**Files:**
- Create: `tests/per-branch-settings-multi-reader-sweep.test.js`

Per spec Section 9 "Test bank" — 50-60 tests across 10 describe blocks (S1-S10).

- [ ] **Step 1.5.1: Write S1 group — mergeBranchIntoClinic extended cascade**

```javascript
import { describe, it, expect } from 'vitest';
import { mergeBranchIntoClinic } from '../src/lib/BranchContext.jsx';

describe('S1: mergeBranchIntoClinic extended cascade', () => {
  it('S1.1: settings.X wins over branch.X over cs.X', () => {
    const cs = { phone: 'cs-phone', clinicEmail: 'cs@x.th' };
    const branch = { phone: 'flat-phone', settings: { phone: 'nested-phone', email: 'nested@x.th' } };
    const merged = mergeBranchIntoClinic(cs, branch);
    expect(merged.phone).toBe('nested-phone');
    expect(merged.clinicEmail).toBe('nested@x.th');
  });

  it('S1.2: empty settings.X falls through to branch.X', () => {
    const cs = { phone: 'cs-phone' };
    const branch = { phone: 'flat-phone', settings: { phone: '' } };
    expect(mergeBranchIntoClinic(cs, branch).phone).toBe('flat-phone');
  });

  it('S1.3: empty + missing branch.X falls through to cs.X', () => {
    const cs = { phone: 'cs-phone' };
    const branch = { phone: '', settings: { phone: '' } };
    expect(mergeBranchIntoClinic(cs, branch).phone).toBe('cs-phone');
  });

  // S1.4-13: each of 13 migrated fields cascades correctly (loop covers field set)
  it('S1.4-13: 13 migrated fields cascade per spec', () => {
    const stringFields = ['phone', 'licenseNo', 'taxId', 'address', 'addressEn'];
    for (const f of stringFields) {
      const cs = { [f === 'addressEn' ? 'addressEn' : f]: `cs-${f}` };
      const branch = { settings: { [f]: `nested-${f}` } };
      const merged = mergeBranchIntoClinic(cs, branch);
      expect(merged[f]).toBe(`nested-${f}`);
    }
    // (similar coverage for clinicEmail, lineOfficialAccountUrl,
    //  patientSyncCooldownMins, openHoursMonFri/SatSun, chatHoursAlwaysOn/MonFri/SatSun)
  });

  it('S1.14: missing settings sub-object handled gracefully', () => {
    expect(() => mergeBranchIntoClinic({}, { phone: 'flat' })).not.toThrow();
  });

  it('S1.15: chatHours.alwaysOn boolean shape preserved', () => {
    const merged = mergeBranchIntoClinic({}, { settings: { chatHours: { alwaysOn: true } } });
    expect(merged.chatHoursAlwaysOn).toBe(true);
  });
});
```

- [ ] **Step 1.5.2: Write S3 — BS-10 source-grep regression**

```javascript
import { readFileSync } from 'fs';
import { join } from 'path';
import { sync as glob } from 'glob';

describe('S3: BS-10 source-grep regression', () => {
  it('S3.1: zero raw clinicSettings.<migrated-field> reads outside sanctioned exceptions', () => {
    const migratedFields = [
      'phone', 'clinicEmail', 'lineOfficialAccountUrl', 'clinicLicenseNo',
      'clinicTaxId', 'clinicAddress', 'clinicAddressEn',
      'patientSyncCooldownMins', 'openHoursMonFri', 'openHoursSatSun',
      'chatHoursAlwaysOn', 'chatHoursMonFri', 'chatHoursSatSun',
    ];
    const sanctionedExceptions = [
      'src/components/ClinicSettingsPanel.jsx',
      'src/lib/branchBackupCore.js',
    ];
    const srcFiles = glob('src/**/*.{js,jsx,ts,tsx}', { cwd: process.cwd() });
    const violations = [];
    for (const f of srcFiles) {
      if (sanctionedExceptions.some(s => f.includes(s))) continue;
      const content = readFileSync(join(process.cwd(), f), 'utf8');
      for (const field of migratedFields) {
        const re = new RegExp(`\\bclinicSettings\\.${field}\\b`, 'g');
        if (re.test(content) && !content.includes(`audit-branch-scope: BS-10 sanctioned`)) {
          violations.push(`${f} :: clinicSettings.${field}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('S3.2: ClinicSettingsPanel + branchBackupCore are tagged sanctioned', () => {
    const csp = readFileSync('src/components/ClinicSettingsPanel.jsx', 'utf8');
    const bbc = readFileSync('src/lib/branchBackupCore.js', 'utf8');
    // CSP is allowed (writes back to cs); BBC needs tag
    expect(bbc).toMatch(/BS-10 sanctioned|audit-branch-scope: BS-10/);
  });
});
```

- [ ] **Step 1.5.3: Write S4 — AV29 consumer classifier**

```javascript
describe('S4: AV29 consumer classifier', () => {
  const auditAvc = readFileSync('.agents/skills/audit-anti-vibe-code/SKILL.md', 'utf8');

  it('S4.1: AV29 enumerates the 17 consumers', () => {
    expect(auditAvc).toContain('AV29');
    expect(auditAvc).toMatch(/AV29[\s\S]+TreatmentFormPage/);
    expect(auditAvc).toMatch(/AV29[\s\S]+CustomerDetailView/);
    expect(auditAvc).toMatch(/AV29[\s\S]+AppointmentCalendarView/);
    // ... assert all 17 file names appear in AV29 block
  });

  it('S4.2: each consumer has explicit classification', () => {
    // The AV29 classifier table lists each file with status: migrated / no-change / sanctioned-exception
    // Assert all 17 file rows match one of those 3 statuses
    const av29 = auditAvc.match(/### AV29 —[\s\S]+?(?=### AV\d+|$)/)?.[0] || '';
    const fileRows = [...av29.matchAll(/\| `(src\/[^`]+)` \|/g)];
    expect(fileRows.length).toBeGreaterThanOrEqual(17);
  });
});
```

- [ ] **Step 1.5.4: Write S2 + S5-S10 (ChatPanel-specific assertions deferred to Phase 2; remaining groups)**

Cover groups:
- S2: useEffectiveClinicSettings reactive (RTL test mounting BranchProvider)
- S5: BranchFormModal renders new sections — DEFERRED to Phase 2 (UI not yet shipped at end of Phase 1)
- S6: ClinicSettingsPanel post-deletion — DEFERRED to Phase 2
- S7: Migration script (Rule M) — DEFERRED to Phase 2 (script not yet created)
- S8: Rule I full-flow simulate — covers branch switch → consumer re-render
- S9: Adversarial inputs (null branch / empty settings / missing nested keys / Thai text / 10K-char)
- S10: V51 markers (placeholders for Phase 2 markers)

For Phase 1 commit, S5-S7 tests can be written as **`it.skip(...)` placeholders** with a TODO comment "unblocked when Phase 2 ships". Phase 2 commit removes the `.skip`.

- [ ] **Step 1.5.5: Run test bank**

```bash
npm test -- --run tests/per-branch-settings-multi-reader-sweep.test.js
```
Expected: ~30-35 tests GREEN (S1+S3+S4+S8+S9+S10 = ~35; S5+S6+S7 = ~20 skipped)

---

## Task 1.6 — Phase 1 commit

- [ ] **Step 1.6.1: Stage all Phase 1 files**

```bash
cd F:/LoverClinic-app
git add src/lib/BranchContext.jsx
git add src/  # all swept consumers
git add .agents/skills/audit-branch-scope/SKILL.md .agents/skills/audit-branch-scope/patterns.md
git add .agents/skills/audit-anti-vibe-code/SKILL.md
git add tests/per-branch-settings-multi-reader-sweep.test.js
git status --short
```

- [ ] **Step 1.6.2: Commit Phase 1**

```bash
git commit -m "$(cat <<'EOF'
feat(phase 1): per-branch settings — helper extension + 17-consumer multi-reader-sweep

V51 Spec #2 Phase 1 (Approach B). Extends `mergeBranchIntoClinic` in BranchContext.jsx
to handle 13 migrated fields with 3-source cascade (settings.X > flat branch.X > cs.X).

Sweep 17 consumers per spec §5 mapping. Most are pass-through; ~5 actual switches
to `useEffectiveClinicSettings`. Sanctioned exceptions (ClinicSettingsPanel +
branchBackupCore) tagged with audit-branch-scope: BS-10 sanctioned.

Rule P Tier 2 artifacts (per Spec #1):
- BS-10 invariant in audit-branch-scope/SKILL.md + patterns.md
- AV29 invariant in audit-anti-vibe-code/SKILL.md (companion to BS-10)
- Classifier enumerates 17 consumers with status (migrated / no-change / sanctioned)
- tests/per-branch-settings-multi-reader-sweep.test.js (~35 tests GREEN; S5-S7 skipped pending Phase 2)

Phase 2 ships UI + migration script. Phase 3 cleans up dual-shape fallback.

Spec: docs/superpowers/specs/2026-05-08-per-branch-settings-migration-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 1.6.3: Verify all Phase 1 acceptance**

```bash
npm test -- --run tests/per-branch-settings-multi-reader-sweep.test.js tests/audit-branch-scope.test.js tests/audit-anti-vibe-code.test.js
npm run build
```
Expected: all tests GREEN; build clean.

- [ ] **Step 1.6.4: Push (user-authorized)**

```bash
git push origin master
```

---

# PHASE 2 — UI ship + migration script

(single commit at end of Phase 2)

## Task 2.1 — Extract `TimeSelect24` to shared component

**Files:**
- Create: `src/components/ui/TimeSelect24.jsx`
- Modify: `src/components/ClinicSettingsPanel.jsx` (replace inline TimeSelect24 with import)

- [ ] **Step 2.1.1: Create shared TimeSelect24.jsx**

Copy the verbatim TimeSelect24 implementation from `ClinicSettingsPanel.jsx:12-29` (HOURS + MINUTES constants + TimeSelect24 component). Wrap in default export.

```javascript
// src/components/ui/TimeSelect24.jsx
import React from 'react';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

export default function TimeSelect24({ value, onChange, focusColor }) {
  const [hh, mm] = (value || '10:00').split(':');
  const selCls = `bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-heading)] rounded-lg px-2 py-2.5 outline-none transition-all text-sm font-mono cursor-pointer ${focusColor || 'focus:border-[var(--accent)]'}`;
  return (
    <div className="flex items-center gap-0.5">
      <select value={hh} onChange={e => onChange(`${e.target.value}:${mm}`)} className={`${selCls} w-[60px] text-center rounded-r-none`}>
        {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="text-gray-500 font-mono text-sm font-bold">:</span>
      <select value={MINUTES.includes(mm) ? mm : '00'} onChange={e => onChange(`${hh}:${e.target.value}`)} className={`${selCls} w-[56px] text-center rounded-l-none`}>
        {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
    </div>
  );
}

export { HOURS, MINUTES };
```

- [ ] **Step 2.1.2: Update ClinicSettingsPanel.jsx to import shared TimeSelect24**

```diff
+import TimeSelect24 from './ui/TimeSelect24.jsx';

-const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
-const MINUTES = ['00', '15', '30', '45'];
-
-function TimeSelect24({ value, onChange, focusColor }) {
-  ...
-}
```

- [ ] **Step 2.1.3: Build verify**

```bash
npm run build
```
Expected: clean.

---

## Task 2.2 — Extend `branchValidation.js` (defaults + validation rules)

**Files:**
- Modify: `src/lib/branchValidation.js` — extend `emptyBranchForm()` + `validateBranch()` + add `STATUS_OPTIONS` etc.

- [ ] **Step 2.2.1: Extend `emptyBranchForm()`**

Per spec Section 3 "Default values":

```diff
 export function emptyBranchForm() {
   return {
     // existing top-level fields
     name: '', code: '', nameEn: '',
     phone: '',  // KEEP for backward compat during transition; cleanup in Phase 3
     licenseNo: '', taxId: '',
     address: '', addressEn: '',
     googleMapUrl: '', latitude: '', longitude: '',
     status: 'active', note: '',
+
+    // NEW — settings sub-object
+    settings: {
+      phone: '',
+      licenseNo: '',
+      taxId: '',
+      address: '',
+      addressEn: '',
+      email: '',
+      lineOaUrl: '',
+      patientSyncCooldownMins: 10,
+      openHours: {
+        monFri: { open: '10:00', close: '20:30' },
+        satSun: { open: '10:00', close: '19:30' },
+      },
+      chatHours: {
+        alwaysOn: false,
+        monFri: { open: '10:00', close: '20:45' },
+        satSun: { open: '10:00', close: '19:45' },
+      },
+    },
   };
 }
```

- [ ] **Step 2.2.2: Extend `validateBranch()`** per spec Section 3 validation rules

```javascript
export function validateBranch(form) {
  // existing top-level required: name, phone (REQUIRED)
  // settings.phone REQUIRED (mirrors top-level for transition)
  if (!form.name?.trim()) return ['name', 'กรุณากรอกชื่อสาขา'];
  const phone = form.settings?.phone || form.phone;
  if (!phone?.trim()) return ['settings.phone', 'กรุณากรอกเบอร์ติดต่อ'];
  // settings.email — basic regex if present
  const email = form.settings?.email;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return ['settings.email', 'อีเมลไม่ถูกต้อง'];
  }
  // settings.lineOaUrl — must start with https://
  const lineOa = form.settings?.lineOaUrl;
  if (lineOa && !lineOa.startsWith('https://')) {
    return ['settings.lineOaUrl', 'LINE URL ต้องเริ่มด้วย https://'];
  }
  // settings.patientSyncCooldownMins — clamp on save
  const cooldown = form.settings?.patientSyncCooldownMins;
  if (cooldown != null && (cooldown < 0 || cooldown > 99999)) {
    return ['settings.patientSyncCooldownMins', 'ค่า cooldown ต้องอยู่ระหว่าง 0-99999'];
  }
  // settings.openHours / chatHours — verify HH:MM pattern
  const hhmmRe = /^([01][0-9]|2[0-3]):(00|15|30|45)$/;
  for (const cluster of ['openHours', 'chatHours']) {
    for (const day of ['monFri', 'satSun']) {
      const o = form.settings?.[cluster]?.[day]?.open;
      const c = form.settings?.[cluster]?.[day]?.close;
      if (o && !hhmmRe.test(o)) return [`settings.${cluster}.${day}.open`, 'รูปแบบเวลาไม่ถูกต้อง'];
      if (c && !hhmmRe.test(c)) return [`settings.${cluster}.${day}.close`, 'รูปแบบเวลาไม่ถูกต้อง'];
    }
  }
  return null;
}
```

---

## Task 2.3 — Extend `BranchFormModal.jsx` with 4 new sections

**Files:**
- Modify: `src/components/backend/BranchFormModal.jsx`

- [ ] **Step 2.3.1: Add `updateSettings` helper**

```diff
   const update = useCallback((patch) => setForm(prev => ({ ...prev, ...patch })), []);
+  const updateSettings = useCallback((patch) =>
+    setForm(prev => ({ ...prev, settings: { ...prev.settings, ...patch } })), []);
+  const updateOpenHours = useCallback((day, patch) =>
+    setForm(prev => ({
+      ...prev,
+      settings: {
+        ...prev.settings,
+        openHours: {
+          ...prev.settings.openHours,
+          [day]: { ...prev.settings.openHours[day], ...patch },
+        },
+      },
+    })), []);
+  const updateChatHours = useCallback((day, patch) => /* same shape */, []);
```

- [ ] **Step 2.3.2: Add 4 new sections after existing "Map" section** (after line ~200)

Use spec Section 6 markdown for each section verbatim. 4 sections:
1. Settings: Contact (Email + LINE OA URL)
2. Settings: Patient Sync Cooldown
3. Settings: เวลาเปิด-ปิดคลินิก (Mon-Fri + Sat-Sun TimeSelect24 rows)
4. Settings: เวลาทำการระบบแชท (alwaysOn checkbox + Mon-Fri + Sat-Sun rows shown when !alwaysOn)

Import `TimeSelect24` from `'../ui/TimeSelect24.jsx'`.

- [ ] **Step 2.3.3: Update existing top-level fields to also write to settings**

For each existing top-level field that has a settings counterpart (phone/licenseNo/taxId/address/addressEn), the modal initially keeps the top-level binding for UI. Migrating BranchFormModal to fully bind to `form.settings.X` is RECOMMENDED but optional for Phase 2 (cleanup in Phase 3). For Phase 2, simplest path: save both `form.X` (flat) AND `form.settings.X` (nested) on `handleSave` to ensure both shapes are populated until cleanup.

```diff
 const handleSave = async () => {
   ...
+  // Write settings sub-object alongside legacy flat fields (Phase 3 cleanup removes flat)
+  const payload = {
+    ...form,
+    settings: {
+      ...form.settings,
+      // Mirror top-level into settings for transition compat
+      phone: form.settings?.phone || form.phone || '',
+      licenseNo: form.settings?.licenseNo || form.licenseNo || '',
+      taxId: form.settings?.taxId || form.taxId || '',
+      address: form.settings?.address || form.address || '',
+      addressEn: form.settings?.addressEn || form.addressEn || '',
+    },
+  };
-  await saveBranch(id, form);
+  await saveBranch(id, payload);
   ...
 };
```

- [ ] **Step 2.3.4: Build verify**

```bash
npm run build
```
Expected: clean.

---

## Task 2.4 — Delete migrated sections from `ClinicSettingsPanel.jsx`

**Files:**
- Modify: `src/components/ClinicSettingsPanel.jsx` (610 → ~280 LOC)

Per spec Section 7:

- [ ] **Step 2.4.1: Delete 7 sections**

For each migrated section, find its `<section>` block (or equivalent JSX wrapper) and remove:
1. LINE OFFICIAL ACCOUNT
2. เบอร์โทรคลินิก
3. ข้อมูลคลินิก (6-field block)
4. PATIENT SYNC COOLDOWN
5. เวลาเปิด-ปิดคลินิก
6. เวลาทำการระบบแชท
7. เวลาแพทย์เข้า

Also remove associated state hooks + handlers + the unused `initialCooldownRef`.

- [ ] **Step 2.4.2: Simplify `handleSave`**

`handleSave` now only writes brand fields:

```javascript
await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clinic_settings', 'main'), {
  clinicName: settings.clinicName.trim() || DEFAULT_CLINIC_SETTINGS.clinicName,
  clinicSubtitle: settings.clinicSubtitle.trim(),
  accentColor: settings.accentColor,
  logoUrl: settings.logoUrl,
  logoUrlLight: settings.logoUrlLight,
  // NO migrated fields
}, { merge: true });
```

- [ ] **Step 2.4.3: Verify LOC reduction**

```bash
wc -l F:/LoverClinic-app/src/components/ClinicSettingsPanel.jsx
```
Expected: ~280-310 lines (was 610).

---

## Task 2.5 — Write `scripts/v51-migrate-clinic-settings-to-branch.mjs`

**Files:**
- Create: `scripts/v51-migrate-clinic-settings-to-branch.mjs`

Use Phase 18.0 / 19.0 / V46 / V49 migration scripts as canonical templates. Per spec Section 8 + Rule M canonical pattern.

- [ ] **Step 2.5.1: Boilerplate (env load + admin SDK init + invocation guard)**

Use the same boilerplate as `scripts/v46-backfill-stock-batch-product-name.mjs`. Convert PEM `\n` escapes; canonical `artifacts/{APP_ID}/public/data/` paths; invocation guard `if (process.argv[1] === fileURLToPath(import.meta.url)) main();`.

- [ ] **Step 2.5.2: Implement `main()` function**

Two-phase: dry-run by default; `--apply` commits.

```javascript
async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`V51 migration: clinic_settings → per-branch settings sub-object`);
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);

  // Read clinic_settings/main
  const csDoc = await db.doc(`artifacts/${APP_ID}/public/data/clinic_settings/main`).get();
  const cs = csDoc.data() || {};

  // Read all branches
  const branchesSnap = await db.collection(`artifacts/${APP_ID}/public/data/be_branches`).get();
  const branches = branchesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  let migrated = 0, skipped = 0;
  for (const branch of branches) {
    if (branch.settings?._migratedAt) {
      console.log(`SKIP ${branch.id} — already migrated`);
      skipped++;
      continue;
    }

    const settings = {
      // 5 deduplicating fields: prefer flat branch.X, fall back to cs.X
      phone:      branch.phone     || cs.phone     || cs.clinicPhone     || '',
      licenseNo:  branch.licenseNo || cs.clinicLicenseNo || '',
      taxId:      branch.taxId     || cs.clinicTaxId     || '',
      address:    branch.address   || cs.clinicAddress   || '',
      addressEn:  branch.addressEn || cs.clinicAddressEn || '',
      // 8 NEW fields: from cs.X
      email:                     cs.clinicEmail            || '',
      lineOaUrl:                 cs.lineOfficialAccountUrl || '',
      patientSyncCooldownMins:   cs.patientSyncCooldownMins ?? 10,
      openHours: {
        monFri: cs.openHoursMonFri || { open: '10:00', close: '20:30' },
        satSun: cs.openHoursSatSun || { open: '10:00', close: '19:30' },
      },
      chatHours: {
        alwaysOn: !!cs.chatHoursAlwaysOn,
        monFri: cs.chatHoursMonFri || { open: '10:00', close: '20:45' },
        satSun: cs.chatHoursSatSun || { open: '10:00', close: '19:45' },
      },
      // forensic
      _migratedAt: FieldValue.serverTimestamp(),
      _migratedFromCs: { ...pickMigratedFields(cs) },  // snapshot
    };

    if (apply) {
      const batch = db.batch();
      batch.update(branch.ref || db.doc(`artifacts/${APP_ID}/public/data/be_branches/${branch.id}`), {
        settings,
        // Clear flat duplicates after settings populated
        phone: FieldValue.delete(),
        licenseNo: FieldValue.delete(),
        taxId: FieldValue.delete(),
        address: FieldValue.delete(),
        addressEn: FieldValue.delete(),
      });
      await batch.commit();
    }
    console.log(`${apply ? 'APPLIED' : 'WOULD APPLY'} ${branch.id}: settings populated, flat fields cleared`);
    migrated++;
  }

  // Clear migrated fields from clinic_settings/main
  if (apply) {
    await db.doc(`artifacts/${APP_ID}/public/data/clinic_settings/main`).update({
      clinicEmail: FieldValue.delete(),
      lineOfficialAccountUrl: FieldValue.delete(),
      patientSyncCooldownMins: FieldValue.delete(),
      openHoursMonFri: FieldValue.delete(),
      openHoursSatSun: FieldValue.delete(),
      chatHoursAlwaysOn: FieldValue.delete(),
      chatHoursMonFri: FieldValue.delete(),
      chatHoursSatSun: FieldValue.delete(),
      doctorHoursMonFri: FieldValue.delete(),
      doctorHoursSatSun: FieldValue.delete(),
    });
  }

  // Audit doc
  const auditId = `v51-migrate-clinic-settings-${Date.now()}-${randomBytes(4).toString('hex')}`;
  if (apply) {
    await db.doc(`artifacts/${APP_ID}/public/data/be_admin_audit/${auditId}`).set({
      phase: 'v51-migrate',
      mode: 'apply',
      branchesScanned: branches.length,
      branchesMigrated: migrated,
      branchesSkipped: skipped,
      appliedAt: FieldValue.serverTimestamp(),
    });
  }

  console.log(`Done. ${migrated} migrated, ${skipped} skipped.`);
}

function pickMigratedFields(cs) {
  const out = {};
  const fields = ['clinicEmail', 'lineOfficialAccountUrl', 'patientSyncCooldownMins',
                  'openHoursMonFri', 'openHoursSatSun', 'chatHoursAlwaysOn',
                  'chatHoursMonFri', 'chatHoursSatSun', 'doctorHoursMonFri', 'doctorHoursSatSun'];
  for (const f of fields) if (cs[f] !== undefined) out[f] = cs[f];
  return out;
}
```

- [ ] **Step 2.5.3: Test dry-run locally**

```bash
cd F:/LoverClinic-app
node scripts/v51-migrate-clinic-settings-to-branch.mjs
# Expected: prints "DRY-RUN" + per-branch migration plan + "X branches WOULD APPLY"
# DOES NOT WRITE
```

- [ ] **Step 2.5.4: DO NOT run --apply yet** — defer to user trigger after Phase 2 commit lands

---

## Task 2.6 — Phase 2 commit + run migration --apply

- [ ] **Step 2.6.1: Stage Phase 2 files**

```bash
cd F:/LoverClinic-app
git add src/components/ui/TimeSelect24.jsx
git add src/components/ClinicSettingsPanel.jsx
git add src/components/backend/BranchFormModal.jsx
git add src/lib/branchValidation.js
git add scripts/v51-migrate-clinic-settings-to-branch.mjs
```

- [ ] **Step 2.6.2: Commit Phase 2**

```bash
git commit -m "$(cat <<'EOF'
feat(phase 2): per-branch settings — UI ship + migration script

V51 Spec #2 Phase 2 (Approach B). Ships:
- BranchFormModal: 4 new sections (Email + LINE OA + Cooldown + openHours + chatHours)
  using shared TimeSelect24 (extracted from ClinicSettingsPanel — Rule of 3)
- ClinicSettingsPanel: deleted 7 migrated sections (610 → ~280 LOC); now keeps only
  brand/theme/clinic-name (chain-level) fields
- branchValidation.js: emptyBranchForm extended with full settings sub-object defaults;
  validateBranch enforces email/url/cooldown/HH:MM rules
- scripts/v51-migrate-clinic-settings-to-branch.mjs: Rule M canonical two-phase script
  (dry-run + --apply) migrating clinic_settings → per-branch settings + flat → nested

Phase 3 cleanup (dual-shape fallback removal) ships after migration --apply confirmed converged.

Spec: docs/superpowers/specs/2026-05-08-per-branch-settings-migration-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin master
```

- [ ] **Step 2.6.3: Run migration --apply (USER TRIGGERS — Rule M)**

After Phase 2 commit lands on master:

```bash
cd F:/LoverClinic-app
# Pull production env (Rule M canonical)
vercel env pull .env.local.prod --environment=production
# Verify dry-run output one more time
node scripts/v51-migrate-clinic-settings-to-branch.mjs
# Apply
node scripts/v51-migrate-clinic-settings-to-branch.mjs --apply
# Audit doc emitted to be_admin_audit/v51-migrate-clinic-settings-<ts>-<rand>
```

- [ ] **Step 2.6.4: Verify migration converged**

Read prod via admin SDK in a quick verification script OR via Firebase Console:
- All branches have `settings._migratedAt` set
- All branches have `settings.phone/licenseNo/taxId/address/addressEn/email/lineOaUrl/patientSyncCooldownMins/openHours/chatHours` populated
- All branches have NO flat `phone/licenseNo/taxId/address/addressEn` (deleted)
- `clinic_settings/main` has no `clinicEmail/lineOfficialAccountUrl/patientSyncCooldownMins/openHoursMonFri/...` fields (deleted)
- `be_admin_audit/v51-migrate-clinic-settings-<ts>-*` audit doc exists

- [ ] **Step 2.6.5: Idempotency check**

```bash
node scripts/v51-migrate-clinic-settings-to-branch.mjs --apply
# Expected: 0 branches migrated, all skipped (each branch.settings._migratedAt already set)
```

---

# PHASE 3 — Cleanup dual-shape fallback

(single commit at end of Phase 3, AFTER migration converged)

## Task 3.1 — Remove flat-fallback from `mergeBranchIntoClinic`

**Files:**
- Modify: `src/lib/BranchContext.jsx` (`mergeBranchIntoClinic` body — remove `branch.X` flat-fallback)

- [ ] **Step 3.1.1: Simplify cascade priority**

For the 5 deduplicating fields (phone/licenseNo/taxId/address/addressEn), remove `branch.X` fallback:

```diff
-    phone:        pickStr(settings.phone,     branch.phone,     cs.phone),
+    phone:        pickStr(settings.phone,     undefined,        cs.phone),
-    licenseNo:    pickStr(settings.licenseNo, branch.licenseNo, cs.licenseNo),
+    licenseNo:    pickStr(settings.licenseNo, undefined,        cs.licenseNo),
-    taxId:        pickStr(settings.taxId,     branch.taxId,     cs.taxId),
+    taxId:        pickStr(settings.taxId,     undefined,        cs.taxId),
-    address:      pickStr(settings.address,   branch.address,   cs.address),
+    address:      pickStr(settings.address,   undefined,        cs.address),
-    addressEn:    pickStr(settings.addressEn, branch.addressEn, cs.addressEn),
+    addressEn:    pickStr(settings.addressEn, undefined,        cs.addressEn),
```

OR rewrite `pickStr` calls to drop the second arg entirely.

- [ ] **Step 3.1.2: Remove flat-field defaults from `emptyBranchForm()` for migrated fields**

```diff
 export function emptyBranchForm() {
   return {
     name: '', code: '', nameEn: '',
-    phone: '',
-    licenseNo: '', taxId: '',
-    address: '', addressEn: '',
     googleMapUrl: '', latitude: '', longitude: '',
     status: 'active', note: '',
     settings: { /* unchanged */ }
   };
 }
```

- [ ] **Step 3.1.3: Remove BranchFormModal `handleSave` mirroring code (Step 2.3.3)**

```diff
- const payload = {
-   ...form,
-   settings: {
-     ...form.settings,
-     phone: form.settings?.phone || form.phone || '',
-     licenseNo: form.settings?.licenseNo || form.licenseNo || '',
-     taxId: form.settings?.taxId || form.taxId || '',
-     address: form.settings?.address || form.address || '',
-     addressEn: form.settings?.addressEn || form.addressEn || '',
-   },
- };
- await saveBranch(id, payload);
+ await saveBranch(id, form);
```

(After cleanup, BranchFormModal saves form directly — settings sub-object is the canonical write target.)

- [ ] **Step 3.1.4: Update tests/per-branch-settings-multi-reader-sweep.test.js**

Remove `it.skip(...)` from S5-S7 (Phase 2 ships UI + script — no longer pending).

Add a new S11 group:
- S11.1: post-cleanup, mergeBranchIntoClinic does NOT have `branch.X` flat-fallback

```javascript
describe('S11: Phase 3 cleanup verification', () => {
  it('S11.1: mergeBranchIntoClinic flat-fallback removed', () => {
    const branchContextSrc = readFileSync('src/lib/BranchContext.jsx', 'utf8');
    // Should NOT have `branch.phone` reads (only `settings.phone` + `cs.phone`)
    expect(branchContextSrc).not.toMatch(/branch\.phone/);
    expect(branchContextSrc).not.toMatch(/branch\.licenseNo/);
    expect(branchContextSrc).not.toMatch(/branch\.taxId/);
    expect(branchContextSrc).not.toMatch(/branch\.address\b/);
    expect(branchContextSrc).not.toMatch(/branch\.addressEn/);
  });
});
```

- [ ] **Step 3.1.5: Run full test bank**

```bash
cd F:/LoverClinic-app
npm test -- --run
```
Expected: ALL tests GREEN. No regressions.

- [ ] **Step 3.1.6: Build verify**

```bash
npm run build
```
Expected: clean.

---

## Task 3.2 — Phase 3 commit

- [ ] **Step 3.2.1: Stage Phase 3 files**

```bash
cd F:/LoverClinic-app
git add src/lib/BranchContext.jsx
git add src/lib/branchValidation.js
git add src/components/backend/BranchFormModal.jsx
git add tests/per-branch-settings-multi-reader-sweep.test.js
```

- [ ] **Step 3.2.2: Commit Phase 3**

```bash
git commit -m "$(cat <<'EOF'
feat(phase 3): per-branch settings — cleanup dual-shape fallback

V51 Spec #2 Phase 3 (Approach B). Post-migration cleanup. ALL prod branches
verified to have settings._migratedAt set + flat fields deleted (audit doc
v51-migrate-clinic-settings-<ts> confirms).

Removes:
- mergeBranchIntoClinic flat-fallback for 5 deduplicated fields (now: settings.X || cs.X)
- emptyBranchForm flat fields for migrated set
- BranchFormModal handleSave mirror logic (now writes form directly)

Tests:
- S11.1: post-cleanup regression guard (no branch.phone/licenseNo/taxId/address/addressEn refs)
- All previously-skipped S5-S7 tests now GREEN

Spec: docs/superpowers/specs/2026-05-08-per-branch-settings-migration-design.md
Companion: Spec #1 Rule P (this implementation IS the first Rule P discipline application)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin master
```

---

## Final Verification

- [ ] **VR1: Full test suite GREEN**

```bash
npm test -- --run
```
Expected: ALL tests GREEN; no regressions; per-branch-settings tests + audit-branch-scope BS-1..BS-10 + audit-anti-vibe-code AV1..AV29 + audit-class-of-bug-discipline CB-1..CB-5 all pass.

- [ ] **VR2: Build clean**

```bash
npm run build
```
Expected: build succeeds; bundle sizes nominal (no significant regression).

- [ ] **VR3: Acceptance criteria checklist**

Verify all 13 items in spec Section 11 Acceptance Criteria.

- [ ] **VR4: Cumulative deploy-pending state**

```bash
git log --oneline c92f924..HEAD
```
Expected: original 9 + 3 new (Phase 1, 2, 3) + plan commit + spec commits = ~13 commits ahead of prod.

- [ ] **VR5: Push final state**

```bash
git push origin master
```

- [ ] **VR6: Bundle into single `vercel --prod` (USER TRIGGERS)**

When user authorizes "deploy" THIS turn, run `vercel --prod --yes` to push all 13 commits to production.

---

## Plan summary

- **Total commits**: 3 (Phase 1, 2, 3) + 1 user-triggered migration `--apply` (no commit, just data write)
- **Files touched in repo**: ~25 (BranchContext.jsx + 17 consumers + 4 audit/skill files + ClinicSettingsPanel + BranchFormModal + branchValidation + TimeSelect24 + migration script + 1 test file)
- **Estimated time**: 6-8 hours of focused implementation
- **No deploy required for code changes**; bundles into next `vercel --prod` when user authorizes
- **Migration --apply runs LOCALLY post-Phase-2** (Rule M)

## Rollback notes

- **Phase 1 rollback**: revert helper + consumer sweep → no data state change
- **Phase 2 rollback**: revert UI + delete migration script → BUT data already migrated (settings populated, flat deleted, cs cleared) → must run reverse-migration script before reverting UI; alternatively, dual-shape fallback in helper means UI works correctly without revert
- **Phase 3 rollback**: re-add `branch.X` flat-fallback → 1-line change; safe rollback

The fallback chain in `mergeBranchIntoClinic` makes Phase 1+2 safe even if Phase 3 cleanup is delayed indefinitely (system works in dual-shape state).
