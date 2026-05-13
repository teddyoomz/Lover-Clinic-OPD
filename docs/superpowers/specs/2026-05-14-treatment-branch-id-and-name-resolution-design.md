# Treatment branchId stamping + doctor/assistant/branch name live-resolution

**Date**: 2026-05-14
**Phase**: 27.0 (treatment branch attribution + display name resolution)
**Triggers**: user screenshot showing `DOC-mov2p9c0-a79c20370455d9f9` raw ID leak in TreatmentReadOnlyMirror's แพทย์ผู้รักษา + ผู้ช่วยแพทย์ + empty สาขา field; verbatim "เพิ่มระบบบันทึกลงการรักษาด้วยว่ารักษาจากสาขาไหน แล้วก็แก้เรื่องการแสดงผลแพทน์ กับ ผู้ช่วยมั่วๆ"

## Locked design decisions (4 brainstorming Qs)

| Q | Decision | Why |
|---|---|---|
| **Q1** branchId source at save | Top-right BranchSelector | Canonical pattern matching sales/appointments/deposits. Admin context wins. |
| **Q2** Display fallback chain | Live-resolve → cache → **never raw ID** | Mirror of Rule O for productName (V46). Drift-safe, defense-in-depth. |
| **Q3** Existing records backfill | Rule M migration with `branchId = customer.branchId` heuristic | Most treatments at home branch; admin can override later via Q4 edit. |
| **Q4** EditAttributionModal change | Add branchId field | Historical mis-tags happen; need admin override path with audit trail. |

## Problem statement

**Issue A — branchId not recorded**: `TreatmentFormPage.jsx:2254-2310` builds `backendDetail` and writes via `createBackendTreatment/updateBackendTreatment`. The detail object has NO `branchId` field. Treatments shipped LIVE on master since branch architecture rolled out (Phase BSA, 2026-05-04) have been silently dropping this field. Mirror panel at `TreatmentReadOnlyMirror.jsx:362` (`branchName = detail.branchName || detail.branchId || '—'`) shows `'—'` for every existing treatment.

**Issue B — raw doc-ID display leak**: When `options.doctors` lookup at save time fails to find the chosen doctorId (deleted-then-reinstated; renamed; sync timing; or options array empty mid-render), `doctorName` is denormalized as `''`. Display fallback at `TreatmentReadOnlyMirror.jsx:361` (`doctorName = detail.doctorName || doctorId || '—'`) then shows the raw `DOC-...` doc ID. Same defect in `assistantsDisplay` (line 374: `a.name || a.id || a`). User-visible bug.

**Why this matters**: Sales/appointments/deposits already record + display branch correctly. Treatment is the LAST major transaction collection without branch attribution. Reports tabs already filter by branch — treatment list reports currently show ALL branches for any admin, regardless of selector.

## Architecture — 3 layers + migration

### Layer 1 — Write-side (TreatmentFormPage.jsx)

`TreatmentFormPage.jsx` consumes `useSelectedBranch` (already imported elsewhere in the file). At submit handler, add to `backendDetail`:

```js
const { branchId: selectedBranchId } = useSelectedBranch();
// ...inside submit handler, after build of backendDetail...
backendDetail.branchId = selectedBranchId || '';
backendDetail.branchName = (allBranches || []).find(b => b.branchId === selectedBranchId)?.name || '';
```

Per Q1, the BranchSelector value is the canonical source. The denormalized `branchName` is a display CACHE only — Layer 2 always live-resolves first.

**Edge case**: when the user is on "ทุกสาขา" (no specific branch selected — `selectedBranchId === ''`), `branchId` saves as `''`. The display layer treats `''` the same as missing field: show `'—'` and let admin edit-attribute later. Per Rule O class-discipline, never silently default to "main" or any other guess.

### Layer 2 — Read-side live-resolve helper (NEW `src/lib/treatmentDisplayResolvers.js`)

NEW pure JS module with 3 resolvers:

```js
/**
 * Live-resolve doctor name from doctorId. Reads from passed `doctorMap`
 * (built upstream by component subscribing to listDoctors({includeHidden:true})
 * — V41 pattern for past-record name display).
 *
 * Returns trimmed name string. Never returns the raw ID.
 * Fallback chain:
 *   1. doctorMap.get(doctorId).name (LIVE resolution from be_doctors)
 *   2. cachedName (from denormalized detail.doctorName)
 *   3. '' (empty — caller decides display, e.g. '—' placeholder)
 *
 * Pure JS — branch-blind.
 */
export function resolveDoctorDisplayName(doctorId, doctorMap, cachedName) {
  if (doctorId && doctorMap) {
    const live = doctorMap.get(String(doctorId))?.name;
    if (typeof live === 'string' && live.trim()) return live.trim();
  }
  if (typeof cachedName === 'string' && cachedName.trim()) return cachedName.trim();
  return '';
}

/**
 * Live-resolve a single assistant entry. Same fallback chain — cross-collection
 * lookup: try doctorMap first (doctors can be assistants), then staffMap.
 */
export function resolveAssistantDisplayName(entry, doctorMap, staffMap) {
  if (!entry) return '';
  const id = typeof entry === 'string' ? entry : entry.id;
  if (id && doctorMap) {
    const live = doctorMap.get(String(id))?.name;
    if (typeof live === 'string' && live.trim()) return live.trim();
  }
  if (id && staffMap) {
    const live = staffMap.get(String(id))?.name;
    if (typeof live === 'string' && live.trim()) return live.trim();
  }
  const cached = (entry && typeof entry === 'object') ? entry.name : '';
  if (typeof cached === 'string' && cached.trim()) return cached.trim();
  return '';
}

/**
 * Live-resolve branch name from branchId. Reads from `branchMap` built upstream
 * by component subscribing to listBranches({includeHidden:true}).
 */
export function resolveBranchDisplayName(branchId, branchMap, cachedName) {
  if (branchId && branchMap) {
    const live = branchMap.get(String(branchId))?.name;
    if (typeof live === 'string' && live.trim()) return live.trim();
  }
  if (typeof cachedName === 'string' && cachedName.trim()) return cachedName.trim();
  return '';
}

/** Compose assistant list display: comma-joined live-resolved names. */
export function resolveAssistantsDisplay(assistants, doctorMap, staffMap) {
  if (!Array.isArray(assistants)) return '';
  return assistants
    .map(a => resolveAssistantDisplayName(a, doctorMap, staffMap))
    .filter(Boolean)
    .join(', ');
}
```

**Consumer migration**:
- `TreatmentReadOnlyMirror.jsx` — subscribes to `listDoctors`, `listStaff`, `listBranches` (already `{includeHidden:true}` for lookup-map use per V41 pattern). Builds 3 Maps. Replaces lines 361-362 + 374 with resolver calls.
- `TreatmentReadOnlyPanel.jsx` — same migration.
- `TreatmentTimelineModal.jsx` — same migration (also has doctor display per Phase 14.7.E).
- `CustomerDetailView.jsx` — if it renders treatment doctor/branch summaries, same migration.

**Display contract**: resolver returns `''` when truly unresolvable. Components render `'—'` placeholder for empty. Raw ID display is FORBIDDEN — guarded by V55-style source-grep regression in audit.

### Layer 3 — Audit invariant (AV42)

NEW invariant in `audit-anti-vibe-code` SKILL.md:

```
AV42 — Treatment doctor/assistant/branch display MUST live-resolve, never raw ID
       (Phase 27.0, 2026-05-14, V46 Rule O class extension)

Every component displaying a treatment doc's doctorId / assistants[].id /
branchId field MUST use the canonical resolveDoctor/Assistant/BranchDisplayName
helpers from src/lib/treatmentDisplayResolvers.js — fallback chain LIVE →
CACHE → empty, never raw ID. Direct reads (detail.doctorId || '—' /
detail.doctorName || detail.doctorId / a.name || a.id) outside the resolver
module are forbidden.

Sanctioned exceptions: NONE.
Grep anchor: forbid `detail\.doctorId \|\|` + `\|\| doctorId` + `a\.name \|\| a\.id`
patterns project-wide outside the resolver module.
```

Mirror Rule O scope expansion (V48 universal extension) — the entire doctor/assistant/branch identity display surface now flows through ONE module. Live-resolve at render time is non-negotiable.

### Migration — Rule M two-phase script

`scripts/phase-27-0-backfill-treatment-branch-id.mjs`:

```
1. Pull env (vercel env pull .env.local.prod --environment=production)
2. Admin SDK + canonical path: artifacts/{APP_ID}/public/data/be_treatments
3. Dry-run (default): scan every be_treatments doc
4. For each doc:
   - If detail.branchId present + non-empty: SKIP (idempotent)
   - Else: look up customer.branchId via be_customers/{customerId}
     - If customer.branchId present: queue update {detail.branchId = customer.branchId, detail.branchName = <live-resolved>}
     - Else: queue skip (no heuristic available)
5. --apply commits writes in batches of 200 + audit doc + forensic-trail:
   - `detail._branchIdBackfilledAt: serverTimestamp()`
   - `detail._branchIdBackfilledFrom: 'customer.branchId'`
   - `detail._branchIdBackfilledLegacyValue: null` (was missing)
6. Idempotent: re-run with --apply yields 0 writes
7. Audit doc to be_admin_audit/phase-27-0-backfill-treatment-branch-id-{ts}-{rand}
   with {scanned, backfilled, skipped, beforeDistribution, afterDistribution}
```

**Heuristic risk**: a patient from Korat treated at Rama 3 during a visit will get mis-tagged as Korat. Admin can correct via Q4 EditAttributionModal addition. Mismatch report shipped in audit doc so admin can review.

### Q4 — EditAttributionModal branchId field

`src/components/backend/EditAttributionModal.jsx` already supports historical attribution edits (treatmentDate, doctorId, additional notes per Phase 17.x). Extend to:
- NEW row "สาขาที่รักษา" with branch-picker dropdown
- Save handler stamps `detail.branchId` + `detail.branchName` (live-resolved) + audit field `editedAt`/`editedBy`
- Test cases: edit flips branchId; preserves other detail fields; emits be_admin_audit edit entry

## Components touched

NEW:
- `src/lib/treatmentDisplayResolvers.js` — pure JS resolver module
- `scripts/phase-27-0-backfill-treatment-branch-id.mjs` — Rule M migration
- `tests/phase-27-0-treatment-branch-attribution.test.js` — unit + source-grep
- `tests/phase-27-0-resolver-helpers-property-based.test.js` — fast-check property tests (apply V55 methodology to new helpers)
- `tests/phase-27-0-treatment-branch-flow-simulate.test.js` — Rule I full-flow
- `tests/phase-27-0-edit-attribution-branch-rtl.test.jsx` — RTL for EditAttributionModal branchId field

MODIFIED:
- `src/components/TreatmentFormPage.jsx:2254-2310` — write-side branchId/branchName stamping
- `src/components/backend/TreatmentReadOnlyMirror.jsx:355-380` — read-side resolver migration
- `src/components/backend/TreatmentReadOnlyPanel.jsx` — same migration
- `src/components/backend/TreatmentTimelineModal.jsx` — same migration (Phase 14.7.E doctor display)
- `src/components/backend/EditAttributionModal.jsx` — branchId picker + save handler
- `.agents/skills/audit-anti-vibe-code/SKILL.md` — AV42 entry

## Data flow

```
USER selects branch in top-right BranchSelector
  ↓
useSelectedBranch().branchId reaches TreatmentFormPage
  ↓
Submit handler builds backendDetail with branchId + branchName (denorm cache)
  ↓
createBackendTreatment writes detail.branchId + detail.branchName to be_treatments
  ↓
TreatmentReadOnlyMirror / Panel / TimelineModal renders
  ↓
Component subscribes listDoctors({includeHidden:true}) + listStaff + listBranches
  ↓
Builds doctorMap + staffMap + branchMap
  ↓
Resolver helpers consume maps + detail.doctorId/assistants/branchId
  ↓
Render: live name (preferred) → cached name (fallback) → empty + '—' placeholder
  ↓
Raw doc-ID NEVER shown
```

## Error handling

| Path | Failure mode | Behavior |
|---|---|---|
| Layer 1 write | `selectedBranchId === ''` (ทุกสาขา selected) | Save as empty; display shows '—'; edit-attribute fills in later |
| Layer 1 write | `allBranches` lookup misses | `branchName` saves as ''; live-resolve handles |
| Layer 2 read | doctorMap not loaded yet | Resolver falls back to cached name; if cache empty, returns '' |
| Layer 2 read | Doctor deleted from be_doctors | Resolver falls back to cached name (denormalized snapshot from save time) |
| Layer 2 read | Both maps + cache empty | Returns ''; component renders '—' |
| Migration | customer.branchId missing | Skipped; logged in mismatch report; admin handles via Q4 |
| EditAttributionModal | Save fails | Toast error; doc not modified; admin retries |

## Test strategy (8-layer V55 methodology applied)

1. **Helper unit** — resolveDoctor/Assistant/Branch return correct value for each fallback level
2. **Source-grep** — TreatmentReadOnlyMirror/Panel/TimelineModal imports + calls resolver; NO raw `detail.doctorId ||`/`|| doctorId` patterns remain
3. **Rule I flow-simulate** — full chain TFP submit → write → read → resolver → display, including post-save with missing/stale cache
4. **Property-based via fast-check** — random doctorMap/staffMap/cachedName combinations; assert resolver invariants (never returns raw ID; never returns undefined; never returns object)
5. **Adversarial fuzz** — Thai NFC/NFD, NUL bytes, frozen maps, prototype pollution probe (reuse `tests/helpers/adversarialFixtures.js`)
6. **Snapshot byte-identical** — branchName rendering across 6 canonical scenarios; lock the resolver output format
7. **Stress** — 50-iter Map mutation while rendering (concurrent doctor edit during treatment view)
8. **Live admin-SDK e2e** — `scripts/e2e-phase-27-0-treatment-branch-resolution.mjs` runs dry-run on real prod treatment + customer data; verifies Map-driven resolver matches actual be_doctors[id].name; cleanup TEST-prefixed fixtures

## Migration verification (Rule M canonical)

1. Dry-run on real prod
2. Count scanned + backfillable + skipped
3. Sample 10 random docs from backfillable set; verify customer.branchId lookup is sensible
4. --apply with `--limit 5` first (caution); verify backfilled docs render correctly in admin UI
5. --apply rest in batches of 200
6. Audit doc emitted; idempotency confirmed via re-run

## Backward compatibility

- New `branchId` field on treatment.detail is purely additive. Existing readers (reports, customer history, timeline modal) keep functioning. Old code paths show '—' for branch — no crash.
- Resolver fallback chain ensures pre-2e95696-era treatment records with empty `doctorName` cache STILL get correct display from live `be_doctors` lookup (treatments older than this change continue showing the correct doctor name as long as the doctor wasn't deleted).
- AV42 audit rule is grep-based + flags only direct `detail.X` reads outside the resolver module. Refactor lands in one batch (Tier 5+6 test discipline).

## Deploy plan

1. Code lands in master via single commit
2. Rule M migration script ships LOCAL ONLY (per `feedback_local_only_no_deploy.md`)
3. User runs `--apply` from local with admin SDK after dry-run review
4. UI changes deploy via combined V15 (`vercel --prod` + `firebase deploy --only firestore:rules`)
5. Probe-Deploy-Probe — rules unchanged this phase; combined deploy is for vercel only effectively
6. Post-deploy: smoke verify any random old treatment now renders branch via backfilled value + doctor name via live-resolve

## Out of scope

- Multi-branch treatment audit reports (different feature; Phase 28.0 candidate)
- Per-branch DF computation re-attribution (depends on Phase 13.4 follow-up; separate feature)
- Notification on cross-branch treatments (e.g. "doctor X from Korat treated at Rama 3 today" — admin alert feature; not requested)
- Live-resolve for OTHER denormalization caches (sale.staffName, appointment.staffName) — separate Phase if needed, follows same AV42-class pattern
- Stryker mutation testing on new resolver helpers — blocked by Windows symlink tooling issue (V55 documented blocker)
