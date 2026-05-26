---
name: audit-anti-vibe-code
description: "Audit the three Vibe-Code failure modes: hardcode/duplication (violates Rule of 3), security slop (leaked uids, Math.random tokens, open Storage/Firestore rules, world-readable admin fields), and premature schema (orphan collections, parallel docs that should be denormalized). Plus AV13-AV17 institutional-memory invariants (long-lived auth bugs, silent cleanup, silent-swallow, list-spread-order). Use before every release and whenever a PR adds a new collection, rule, or 20+ LOC of form/modal code."
user-invocable: true
allowed-tools: "Read, Grep, Glob"
---

# Audit Anti-Vibe-Code

Named after the vibe-code warning 2026-04-19: AI writes fast, but speed today
= burden tomorrow if the foundation is rotten. Three failure modes to scan:

## Invariants (AV1–AV49)

### AV1 — No duplicate component >20 LOC across files
**Why**: DateField had 5 local clones until the 2026-04-19 migration. Canonical component means 1 fix propagates everywhere.
**Grep**:
- `function (DatePicker|ThaiDate|Custom[A-Z]|Modal[A-Z])\w*\(` — any locally-defined picker/modal/custom component. Should be in `src/components/**` only.
- Named function inside a page `.jsx` that looks like a reusable primitive → candidate for extraction.
**Check**: if the same function body (or close variant) appears in 2+ files → extract.

### AV2 — No raw `<input type="date">` outside `DateField.jsx`
**Grep**: `type="date"` in `src/` — must match zero except the one inside `DateField.jsx`.
**Fix**: migrate to `<DateField value={...} onChange={...} fieldClassName={oldClass} />`.

### AV3 — No `Math.random()` for security-critical tokens
**Why**: `Math.random` is non-cryptographic. Patient-link / schedule-link / any URL token must use `crypto.getRandomValues`.
**Grep**: `Math\.random\(\)\.toString\(36\)` — audit each site. `shortId` for queue codes is OK; patient/session tokens are NOT.
**Fix**: `Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('')`.

### AV4 — No credentials/tokens hardcoded in `src/` or `api/`
**Grep**: `sk-[A-Za-z0-9]{20,}|pk-[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}` — AWS/API key patterns.
Also grep for `token: '[A-Za-z0-9]{20,}'` and `password:\s*['"][^'"]+['"]`.
**Allowed**: `firebaseConfig` API key in `src/firebase.js` (Firebase public API key — Firestore rules enforce actual access control).
**Fix**: move to Vercel env vars + proxy through a serverless function.

### AV5 — No admin-only fields leaked into world-readable docs
**Why**: `clinic_schedules/{token}` is world-readable by token. Anything stored there is visible to whoever has the URL. User bug 2026-04-19: `createdBy: user.uid` leaked admin UID.
**Grep**: in `handleGenScheduleLink`, `handleGeneratePatientLink`, any `setDoc`/`updateDoc` whose target collection is readable without auth — scan the saved payload for `createdBy`, `user.uid`, `adminId`, `editedBy`, `internal*`.
**Fix**: strip before save, OR move to a parallel admin-only collection.

### AV6 — No `allow read, write: if true` in `firestore.rules` or `storage.rules`
**Grep**: `if true` in both rules files. Each match must have a paired `request.auth` check or token-based gate in the matching `match` block.
**Fix**: add auth requirement + optional resource field gates.

### AV7 — Every new collection has ≥1 reader + ≥1 writer within the same PR
**Check**: when a PR adds `collection(db, ..., 'new_name')`, verify the SAME PR has a `getDoc(...)`/`getDocs(query(...))` on that name AND a `setDoc`/`addDoc`/`updateDoc`. A collection that only one side touches is incomplete.

### AV8 — No "log" / "history" / "events" collection without genuine need
**Why**: append-only logs are expensive. Most "history" is better as an array field on the parent doc (same-transaction writes, no extra listeners).
**Targets**: any new `be_*_log`, `be_*_history`, `be_*_events` collection. Justify: does the data volume exceed 1 MB per parent? Does it need independent TTL? If neither → nested array on parent.

### AV9 — Canonical shared modules reused, not re-implemented
**Grep**:
- `const\s+\w+\s*=\s*(new Date\(\)\.toISOString|\(\)\s*=>\s*.*\.getFullYear)` — ad-hoc today-string code. Must use `thaiTodayISO()` from `utils.js`.
- `function\s+toThaiDate\s*\(|const toThaiDate =` — must be only one (in `AdminDashboard.jsx`). Grep for duplicates.
- `function\s+fmtMoney\s*\(|const fmtMoney =` — should import from `financeUtils.js`, not redefine per-file.
- `function\s+parseQtyString\s*\(` — same.

### AV10 — Rule of 3 enforced via shared subcomponents for copy-paste UI
**Examples**: modal shell, chip/badge, empty state, filter dropdown, customer card. If the same 15+ line JSX block appears in 3+ components → extract.
**How to check**: run a side-by-side diff of large render branches; look for identical `<div>` trees differing only by props.

### AV11 — Firestore document not over-normalized
**Why**: a JOIN equivalent costs a Firestore read per doc. If a page displays customer name + phone + HN + hn-status from 3 separate docs → denormalize at write-time.
**Check**: any UI that needs `Promise.all([getDoc(a), getDoc(b), getDoc(c)])` for one render should have the critical fields denormalized onto one doc.

### AV12 — No orphan collection (written but never read, or vice versa)
**Grep**: for each collection name in `artifacts/{appId}/public/data/X`, verify at least one `getDoc`/`getDocs`/`onSnapshot` AND at least one `setDoc`/`addDoc`/`updateDoc` touch it.
**Common orphans**: experimental / scaffolded-but-unfinished collections left behind.

### AV13 — No long-lived auth-write-blocked silent failures (V23)
**Why**: V23 — opd_sessions update rule was `if isClinicStaff()` since project init (2026-03-23). Anon patients hit PERMISSION_DENIED → "เกิดข้อผิดพลาดของระบบ" alert in PatientForm + 2 silent fail-and-forget paths in PatientDashboard. Bug LIVE for entire project history because tests only verified RENDER, not WRITE.
**Grep**:
- `signInAnonymously\b` — every site that triggers anon-auth. Trace: what writes does the anon user attempt? Are those writes covered by firestore.rules `if isSignedIn()` / `hasOnly([whitelist])` patterns?
- `firestore.rules` `match /<col>/` blocks where `update|create|delete: if isClinicStaff()` — for each, grep code for any anon-reachable writer to that collection. Mismatch = silent-fail-or-alert bug waiting.
**Fix**: narrow rule to `isClinicStaff() OR (isSignedIn() AND request.resource.data.diff(resource.data).affectedKeys().hasOnly([whitelist]))`. Add to Rule B probe list.

### AV14 — No silent cleanup that masks partial failure (V27)
**Why**: V27 — Probe-Deploy-Probe cleanup script DELETE pc_appointments returned 200 → script reported "cleanup OK" → but opd_sessions probe artifacts (different rule shape) were never targeted. Silent partial cleanup left ~10 zombie test docs in production queue.
**Grep**:
- Cleanup scripts (`scripts/**`, `tests/**helpers**`, `api/admin/cleanup-*.js`) — every cleanup must report COUNT of artifacts removed, not just per-call HTTP status.
- `console.log.*cleanup OK\|cleanup complete` — verify the message follows an explicit count assertion.
**Fix**: every cleanup op returns `{ removed: N, failed: M, ids: [...] }`. Caller assertion: `removed > 0` OR `failed === 0 && total === 0`.

### AV15 — No silent-swallow of destructive operations + missing token revoke on credential change (V31)
**Why**: V31 — StaffTab/DoctorsTab `handleDelete` wrapped `deleteAdminUser` in `try { ... } catch (e) { console.warn('continuing with Firestore delete'); }` then proceeded with the second destructive op (Firestore delete). Any Firebase Auth deletion failure left an orphan user (login still worked, email blocked re-creation). Bug LIVE since Phase 12.1 (~Q1 2026). Sister bug: `handleUpdate` and `setCustomUserClaims`-using actions never called `auth.revokeRefreshTokens(uid)` → old session tokens remained valid for ~1h after admin changed credentials or removed claims.
**Grep**:
- `catch.*\{[^}]*console\.warn[^}]*\}` (multiline) — every silent-swallow `console.warn` followed by no rethrow. Each match: classify the swallowed error space. If errors include "real failure that should abort," flag.
- `continuing with Firestore delete\|continuing\|fallthrough` in console.warn messages — same pattern by intent.
- `auth\.updateUser\b|auth\.setCustomUserClaims\b` in `api/admin/**` — every credential/claim mutation must be paired (after success) with `auth.revokeRefreshTokens(uid)` UNLESS the operation is purely additive/granting (e.g. grantAdmin gives MORE access, no revoke needed).
**Fix**:
- Replace silent-swallow with explicit error classification: `try { ... } catch (e) { const allowedErrors = /user-not-found|already gone/i; if (!allowedErrors.test(e.message)) throw e; console.warn('[op] tolerated already-gone case'); }`.
- After `auth.updateUser({email|password|disabled, ...})`: `await auth.revokeRefreshTokens(uid);` — emails/passwords changed = sessions invalidated within 1h.
- After `auth.setCustomUserClaims(uid, claims)` that REMOVES privilege (revokeAdmin, clearPermission, downgrade group): `await auth.revokeRefreshTokens(uid);`.

### AV16 — Source-grep visual tests must be paired with runtime measurement (V32 family)
**Why**: V32 round-1 + round-2 + round-3 + round-4 (2026-04-26) — Bulk PDF alignment war. Each round had passing source-grep tests (`code.includes("pagebreak: 'avoid-all'")` ✓, `getComputedStyle.paddingTop === '6px'` ✓) while the rendered PDF was visibly broken. Source-grep verifies CODE SHAPE; not USER-VISIBLE OUTCOME. For visual outputs (PDF, canvas, screenshot, layout-critical CSS), source-grep is necessary but NOT sufficient.
**Grep**:
- `getComputedStyle\b|toMatch\(/.*pagebreak\|html2canvas\|html2pdf\|jsPDF` — visual-output tests. Each must be paired with at least one runtime/preview_eval check measuring actual rendered geometry (text-vs-line distance, page count, computed colors).
**Fix**: pair source-grep tests with preview_eval that decodes the actual artifact (PDF page count, text geometry, screenshot pixel diff).

### AV17 — `snap.docs.map` spread order: docId must always win (V38)
**Why**: V38 (2026-05-07) — `listProducts`/`listCourses` did `{id: d.id, ...d.data()}`. Baseline-migrated docs (from `branch-merge-apply.mjs` / `customer-branch-baseline.js`) carried a stray `id` data field (legacy ProClinic numeric IDs). Spread order put `data.id` AFTER `id: d.id` → data field OVERRODE the docId. handleDelete fell back to wrong path → silent no-op delete. Bug surfaced 2026-05-07 on พระราม 3 catalog after octies "fix" addressed visibility, not the delete-id resolution.
**Grep**:
- `snap\.docs\.map\(d =>\s*\(\{\s*id:\s*d\.id,\s*\.\.\.d\.data\(\)\s*\}\)\)` — vulnerable pattern. Migrate to `{ ...d.data(), id: d.id }`.
- `\.docs\.map\(d =>\s*\(\{\s*id:\s*d\.id,\s*\.\.\.d\.data\(\)\s*\}\)\)` — same pattern in any context.
- Same risk applies to `onSnapshot` listeners: `snapshot\.docs\.map\(\(d\) =>\s*\(\{\s*id:\s*d\.id,` etc.
**Sanctioned exception** (annotate inline): `// audit-anti-vibe-code: AV17 safe — data has no id field` — only allowed when the collection's docs are KNOWN to never carry a stray `id` field (e.g. system-controlled writes via `setDoc(...,{merge:false})` from a single canonical writer).
**Fix**:
- Default: `snap.docs.map(d => ({ ...d.data(), id: d.id }))` — docId always wins, even with stray data.id.
- For `getDoc` single-doc read: `{ ...snap.data(), id: snap.id }` — same order.
- Pair with handleDelete contract: `const id = obj.<entityId> || obj.id` — works correctly when `obj.id` reliably equals docId.
**Source-grep regression test pattern** (V38 lock):
```js
expect(src).toMatch(/snap\.docs\.map\(d =>\s*\(\{\s*\.\.\.d\.data\(\),\s*id:\s*d\.id\s*\}\)\)/);
expect(srcBlock).not.toMatch(/snap\.docs\.map\(d =>\s*\(\{\s*id:\s*d\.id,\s*\.\.\.d\.data\(\)\s*\}\)\)/);
```
**Mass-sweep status (2026-05-07, V38-followup)**: ✅ **COMPLETE**. Mass-swept 85+ callsites across 15 files (`backendClient.js`, `reportsLoaders.js`, 6 admin endpoints, 5 components, 2 pages). Full suite 6757/6757 PASS post-sweep — zero consumer regressions. Pattern is now universally `{ ...d.data(), id: d.id }` across the codebase. AV17 going forward catches NEW callsites that drift from the safer pattern.

### AV18 — Migrate-fn signature must accept `{branchId}` opt for branch-scoped collections (V39)
**Why**: V39 (2026-05-07) — `migrateMasterPromotionsToBe` / `migrateMasterCouponsToBe` / `migrateMasterVouchersToBe` / `migrateMasterDfStaffRatesToBe` were ZERO-ARITY (line 8133/8202/8279/9549 in `backendClient.js`). `MasterDataTab.handleMigrate` forwarded `{branchId: selectedBranchId || ''}` to ALL targets — but zero-arity wrappers silently dropped it at the JS function-call boundary. Result: imported docs landed with no branchId → invisible in any branch view → user reported 303 product + 174 course + 2 promotion zombies. Octies (e36811f) had patched 7 catalog migrate fns but missed these 4 older Phase 9 paths. Pattern = V12 multi-writer-sweep applied to migrate-fn family.
**Grep**:
- `^export async function migrateMaster\w+ToBe\(\s*\)` — zero-arity migrate wrapper. For each match: classify the destination collection per BSA + COLLECTION_MATRIX (`tests/branch-collection-coverage.test.js`). If branch-scoped → BUG (must accept `{branchId}`). If universal → OK.
- `^export async function migrateMaster\w+ToBe\(\s*\{[^}]*\}` — opt-accepting migrate wrapper. Verify branchId is forwarded to underlying mapper / runMasterToBeMigration.
- `^function mapMasterTo\w+\(src, id, now, existingCreatedAt\)` — 4-arg mapper signature. For branch-scoped collections, MUST be 5-arg `(src, id, now, existingCreatedAt, branchId = '')` and stamp `branchId: branchId || src.branchId || ''` on output.
**Sanctioned exception**: universal collections (be_staff, be_doctors, be_branches, be_permission_groups, be_wallet_types, be_membership_types, be_medicine_labels) — wrapper SHOULD be zero-arity, mapper SHOULD NOT accept branchId. The COLLECTION_MATRIX in `tests/branch-collection-coverage.test.js` is source-of-truth for classification.
**Source-grep regression test pattern** (V39 lock — see `tests/phase-24-0-vicies-novies-decies-migrate-button-coverage.test.js`):
```js
// For each branch-scoped migrate fn:
const re = /export async function migrateMasterXxxToBe\(\s*\{\s*branchId\s*=\s*['"]['"]\s*\}\s*=\s*\{\s*\}\s*\)/;
expect(src).toMatch(re);
// For each universal migrate fn:
expect(src).toMatch(/export async function migrateMasterUniversalToBe\(\s*\)/);
expect(src).not.toMatch(/migrateMasterUniversalToBe\(\s*\{[^}]*branchId/);
```
**Companion AV: AV17** (list spread-order) — same V12 multi-reader-sweep pattern but at READ side. Both MUST hold for branch-scoped collections.

### AV19 — Destructive ops require auto-backup-ref pre-condition (V40)

**Why**: V40 (2026-05-07) — `/api/admin/branch-make-fresh` wipes all branch-scoped collections + per-customer subcollection docs filtered by branchId. Without a pre-call backup, an admin misclick = irreversible production data loss. The fix: server REQUIRES `autoBackupRef` field in request body + verifies the Storage object exists via `bucket.file(autoBackupRef).exists()` BEFORE executing any delete. Pattern generalizes to other destructive bulk ops.

**Grep**:
- `api/admin/.*delete\|cleanup\|wipe\|fresh` — every destructive endpoint. Each must:
  - Accept an `autoBackupRef` (or equivalent prior-state-snapshot) field
  - Verify the snapshot exists in Storage/Firestore BEFORE executing
  - Refuse with 400 on missing

**Sanctioned exception**: cleanup endpoints that delete ONLY test-prefixed docs (per V33.10/11/12) don't need the gate (TEST docs are by definition disposable).

**Source-grep regression**:
```js
expect(code).toMatch(/AUTO_BACKUP_REQUIRED|BACKUP_REF_MISSING/);
expect(code).toMatch(/bucket\.file\(autoBackupRef\)\.exists/);
```

### AV20 — Lookup-map consumers must opt-in `{ includeHidden: true }` (V41)

**Why**: V41 (2026-05-08) — `listStaff()` / `listDoctors()` in `src/lib/backendClient.js` default-filter `!isHidden` so every picker auto-secures (V12 multi-reader-sweep safe pattern). Past records reference staff/doctors by id; if a component's lookup map is built from a default-filtered lister, hidden persons' names render as blank in past records' display labels — silent regression.

**Grep**:
- `listStaff\(\{[^}]*\}\)` — every opt-in callsite. Must be one of: `StaffTab.jsx`, `DoctorsTab.jsx`, `CustomerDetailView.jsx`, `TreatmentFormPage.jsx`, `AdminDashboard.jsx`, `AppointmentCalendarView.jsx`. New callsites need an inline V41/AV20 comment justifying opt-in.
- `listDoctors\(\{[^}]*\}\)` — same.

**Sanctioned exception**: per-flow opt-in is allowed when (1) the component is a known lookup-map consumer (above list), or (2) the component derives a `visibleX` array client-side via `.filter(d => !d.isHidden)` for picker rendering — proving it understands the split pattern.

**Source-grep regression**: `tests/staff-doctor-hide-consumer-sweep.test.js` (CS1 + CS2) locks the consumer-side classification. CS1.* asserts opt-in present in lookup-map consumers; CS2.* asserts opt-in ABSENT in picker-only consumers.

**Anti-pattern (caught by AV20)**:
```js
// ❌ Picker-only file uses opt-in unnecessarily
// (would leak hidden persons into picker dropdown)
const doctors = await listDoctors({ includeHidden: true });

// ✅ Picker-only file uses default
const doctors = await listDoctors();

// ✅ Lookup-map context uses opt-in (with comment)
// V41 — need full map for past-record name display (AV20)
const allDoctors = await listDoctors({ includeHidden: true });
```

### AV28 — No `broker.*` / `cloneOrchestrator` / `/api/proclinic/*` imports in `src/` (V50 ProClinic strip)

**Why**: V50 (2026-05-08) — User-directed full ProClinic strip per "ลบ proclinic ออกอย่างสมบูรณ์". Phase 1 migrated 5 frontend files from `broker.*` runtime calls to `be_*` canonical (TreatmentFormPage saveTarget default flipped `'proclinic'` → `'backend'`, PROCLINIC MODE block deleted -177 LOC, 9 conditional broker.* sites stripped). Phase 2.2 DELETED the entire ProClinic infrastructure (-10,318 LOC): `src/lib/brokerClient.js` + `src/lib/cloneOrchestrator.js` + `src/lib/customerBranchBaselineClient.js` + `src/components/backend/CloneTab.jsx` + `src/components/backend/MasterDataTab.jsx` + `api/proclinic/**` (14 files) + `cookie-relay/**` (5 files). Phase 6 cleaned 2,599 prod docs (`master_data/*`, `broker_jobs/*`, `pc_*` × 10 collections, `clinic_settings/proclinic_session*`). Re-introducing ANY of these = V50 strip regression.

**The rule**: NO file under `src/` (including `src/lib/**`, `src/components/**`, `src/pages/**`, `src/hooks/**`) may:
1. **Import** from `brokerClient` / `cloneOrchestrator` / `customerBranchBaselineClient` (all deleted)
2. **Fetch / axios** any URL matching `/api/proclinic/*` (endpoint dir deleted)
3. **Call** any `broker.<method>(` namespace function (broker object no longer exists)
4. **Read** Firestore paths under `pc_*` / `master_data/*` / `broker_jobs/*` / `clinic_settings/proclinic_session*` at runtime (collections deleted; rules cleanup pending Probe-Deploy-Probe)

Comments referencing the historical migration ARE allowed (institutional memory — e.g. "was master_data via getAllMasterDataItems — stale ProClinic mirror"); only RUNTIME code paths are forbidden.

**Grep**:
```bash
# Imports of deleted modules
grep -rE "from ['\"][^'\"]*brokerClient['\"]" src/ api/                                # MUST be empty
grep -rE "from ['\"][^'\"]*cloneOrchestrator['\"]" src/ api/                           # MUST be empty
grep -rE "from ['\"][^'\"]*customerBranchBaselineClient['\"]" src/ api/                # MUST be empty
# Fetch / axios to deleted endpoint dir
grep -rE "['\"]\/api\/proclinic\/" src/ api/                                           # MUST be empty
# broker namespace calls
grep -rE "\bbroker\.(create|update|delete|get|list|search|sync|find|fetch|post|put)\(" src/ # MUST be empty
# Runtime Firestore reads/writes against deleted collections
grep -rE "(collection|doc|getDoc|getDocs|setDoc|updateDoc|deleteDoc|onSnapshot)\([^)]*['\"](pc_|broker_jobs|master_data|proclinic_session)" src/ api/  # MUST be empty
```

**Sanctioned exceptions (post V50-followup-2, 2026-05-08)**: NONE. The
V50-followup commit deleted scopedDataLayer.js master_data re-exports +
backendClient.js master_data CRUD/read/sync helpers. The V50-followup-2
commit deleted the remaining migrator/mapper family (`migrate*ToBe` +
`mapMasterTo*` + `runMasterToBeMigration` + `masterDataItemsCol`) plus
`src/lib/phase9Mappers.js` (only consumed by deleted migrators).
Institutional-memory comments referencing the historical migration are
allowed (AV28.4 grep operates on stripComments output).

If a future feature genuinely needs ProClinic interop, it must go through a NEW well-defined integration boundary (e.g. an `/api/external/proclinic-sync/*` endpoint with explicit dependency justification + Rule C3 lean-schema review + new audit invariant). Resurrecting `brokerClient.js` is forbidden — start fresh.

**Source-grep regression test pattern** (V50 lock — see `tests/v50-av28-no-proclinic-imports.test.js`):
```js
const FORBIDDEN_IMPORTS = [
  /from ['"][^'"]*brokerClient/,
  /from ['"][^'"]*cloneOrchestrator/,
  /from ['"][^'"]*customerBranchBaselineClient/,
];
const FORBIDDEN_URLS = [/['"]\/api\/proclinic\//];
const FORBIDDEN_RUNTIME_PATHS = [
  /(?:collection|doc|getDoc|getDocs|setDoc|updateDoc|deleteDoc|onSnapshot)\([^)]*['"](?:pc_|broker_jobs|master_data|proclinic_session)/,
];
// Walk every src/**/*.{js,jsx} + api/**/*.{js,mjs} except scripts/ + tests/
// AND assert no match.
```

**Migration on encountering NEW V50-violation**: (1) revert the offending file; (2) replace the call with the be_* equivalent (likely already exists in `src/lib/backendClient.js` + `src/lib/scopedDataLayer.js`); (3) add a comment marker explaining the migration; (4) run AV28 grep to confirm clean; (5) full suite + flow-simulate verify (Rule N exception: structural change + V50 contract).

**Companion AVs**:
- AV20 (V41): default-filter at lister + opt-in (similar pattern — orphaned exports OK if never called)
- AV28 (V50, this entry): the BSA Rule E + Rule H-quater + Rule H-bis ENFORCEMENT — V50 made the strip complete
- (See also iron-clad rules **E** "Backend = Firestore ONLY", **H** "Data Ownership", **H-bis** "Sync = DEV-ONLY scaffolding", **H-quater** "master_data is NOT readable from feature code")

### AV29 — Per-branch settings: 17-consumer multi-reader-sweep (V51 / Spec #2)

**Why**: V51 / Spec #2 (2026-05-08) — per-branch settings migration moves 13
fields from the global `clinic_settings/main` doc to per-branch
`be_branches/{branchId}.settings`. Goal: each branch can override clinic
phone, email, license, tax-ID, address, addressEn, LINE OA URL, patient-sync
cooldown, opening hours (Mon-Fri / Sat-Sun), and chat hours (always-on
flag + Mon-Fri / Sat-Sun) independently. The merger
`mergeBranchIntoClinic` in `src/lib/BranchContext.jsx` is the architectural
backstop — every UI consumer of those 13 fields MUST go through
`useEffectiveClinicSettings(clinicSettings)` (which wraps the merger
reactively) so per-branch overrides apply at read time.

This is a V12 multi-reader-sweep at the **shape boundary** of clinic
settings. After Phase 2 ships UI + migration script, the cs.X fields will
be removed from `clinic_settings/main`; consumers reading raw
`clinicSettings.X` would silently start receiving `undefined` for the 8
NEW fields and the BRANCH-DEFAULT (no override) for the 5 deduplicating
fields.

**Companion AV**: cross-references **BS-10** (audit-branch-scope SKILL.md).
BS-10 is the source-grep boundary in scope of branch-scope; AV29 is the
class-of-bug boundary in scope of the V12 multi-reader-sweep. Both fire
on the same set of files. BS-10's grep is the authoritative one — AV29
duplicates the rule for cross-skill discoverability.

**The rule**: NO file under `src/components/**`, `src/pages/**`,
`src/hooks/**`, or `src/lib/**` (excluding sanctioned exceptions) may
read any of the 13 migrated fields directly off a raw `clinicSettings`
prop / state / object. The 13 fields:

```
phone, clinicEmail, lineOfficialAccountUrl,
clinicLicenseNo, clinicTaxId, clinicAddress, clinicAddressEn,
patientSyncCooldownMins,
openHoursMonFri, openHoursSatSun,
chatHoursAlwaysOn, chatHoursMonFri, chatHoursSatSun
```

Reading via the merged result is mandatory:

```js
// ✅ GOOD — per-branch override applies
const effective = useEffectiveClinicSettings(clinicSettings);
const phone = effective.phone;

// ❌ BAD — bypasses per-branch override
const phone = clinicSettings.phone;
```

**Grep**:
```bash
git grep -nE "clinicSettings\??\\.(phone|clinicEmail|lineOfficialAccountUrl|clinicLicenseNo|clinicTaxId|clinicAddress|clinicAddressEn|patientSyncCooldownMins|openHoursMonFri|openHoursSatSun|chatHoursAlwaysOn|chatHoursMonFri|chatHoursSatSun)\\b" -- "src/" \
  | grep -v ClinicSettingsPanel \
  | grep -v branchBackupCore
# Then for each remaining match, verify file has either:
#   - useEffectiveClinicSettings (correct migration), OR
#   - // audit-branch-scope: BS-10 sanctioned (sanctioned exception)
```

**17-Consumer classifier (Phase 1 sweep result, post-V51 Phase 1)**:

This is the Rule P Tier 2 classifier doc enumerating every consumer +
status. As of V51 Phase 1, the project has 7 confirmed-relevant consumer
files. The "17" in the AV name comes from the spec's projected enumeration
(includes pass-through props + parent components); the actual reader
count is much narrower because most files just forward `clinicSettings`
as a prop.

| File | Reads migrated field? | Status |
|---|---|---|
| `src/components/ClinicSettingsPanel.jsx` | YES — clinicAddress/clinicAddressEn/clinicLicenseNo/clinicTaxId/clinicEmail/patientSyncCooldownMins | DELETE-TARGET Phase 2 (will be reduced to brand fields only) |
| `src/pages/PatientDashboard.jsx` | YES — `clinicSettings?.patientSyncCooldownMins` × 3 sites | SANCTIONED — public-link page outside `<BranchProvider>`; tagged `// audit-branch-scope: BS-10 sanctioned` |
| `src/components/backend/SalePrintView.jsx` | YES — `clinic.address/clinic.phone/clinic.taxId` (merged shape via `useEffectiveClinicSettings`) | MIGRATED already (V40 baseline) |
| `src/components/backend/QuotationPrintView.jsx` | YES — `clinic.address/clinic.phone/clinic.taxId` (merged shape via `useEffectiveClinicSettings`) | MIGRATED already (V40 baseline) |
| `src/components/backend/DocumentPrintModal.jsx` | YES — wraps `useEffectiveClinicSettings(rawClinicSettings)` then passes downstream | MIGRATED already |
| `src/lib/documentPrintEngine.js` | YES — `clinic.{clinicEmail,clinicPhone,clinicAddress,clinicAddressEn,clinicLicenseNo,clinicTaxId}` (`clinic` is the merged result passed in from upstream callers — DocumentPrintModal / SalePrintView / QuotationPrintView) | PASS-THROUGH (downstream consumer) |
| `src/lib/branchBackupCore.js` | NO direct read of fields — but classifies `clinic_settings` as a UNIVERSAL collection for backup tier | SANCTIONED — backup target; tagged `// audit-branch-scope: BS-10 sanctioned — backup target raw read OK` |
| `src/lib/BranchContext.jsx` | YES (self) — source of truth for the merger | LIB DEFINITION |

**Pass-through callers (no migrated-field reads — just forward
`clinicSettings` as a prop)**: `App.jsx`, `AdminDashboard.jsx`,
`BackendDashboard.jsx`, all 50+ backend tab files, all customer-detail
modals. These don't read migrated fields directly so don't need
migration. Audit BS-10 grep above confirms via post-Phase-1 zero-output.

**Source-grep regression test**: `tests/per-branch-settings-multi-reader-sweep.test.js`
groups S3 (BS-10 source-grep regression) + S4 (AV29 consumer classifier)
lock the rule. Future drift fails the build.

**Sanctioned exceptions** (annotation comments):

```js
// audit-branch-scope: BS-10 sanctioned — backup target raw read OK
//   → branchBackupCore.js (universal collection classifier for backups)

// audit-branch-scope: BS-10 sanctioned — public-link page outside BranchProvider
//   → PatientDashboard.jsx, PatientForm.jsx, ClinicSchedule.jsx (only if needed)
```

`ClinicSettingsPanel.jsx` is NOT annotated because it's the
delete-target for Phase 2; the audit specifically excludes it via
`grep -v ClinicSettingsPanel`.

**Phase 2 sequel**: when migration ships (per-branch UI in
BranchFormModal + Rule M migration script), this AV becomes ENFORCEMENT
(the cs.X fields disappear from `clinic_settings/main`; raw reads return
undefined). Phase 3 cleanup removes the dual-shape fallback in the
merger.

### AV27 — UI pickers reading legacy shape MUST use *ForPicker variants (V49)

**Why**: V49 (2026-05-08) — Phase 14.10-tris (2026-04-26) switched 8 UI pickers from `master_data/*` (legacy `{name, price, category, products, unit}` shape) to `be_courses` / `be_products` / `be_promotions` (canonical `{courseName, salePrice, courseCategory, courseProducts, productName, mainUnitName, categoryName, promotion_name, sale_price, category_name}` shape) WITHOUT updating field-name reads. Result: every dropdown rendered EMPTY rows with `+` icon and `0 ฿` because `c.name` / `c.price` / `c.category` / `c.products` / `p.unit` were ALL `undefined` on canonical docs (verified via `scripts/v49-diag-be-courses-products-shape.mjs` against prod). User-reported on PromotionFormModal "ค้นหาคอร์ส" + "ค้นหาสินค้า" search dropdown 2026-05-08.

**8 victim sites confirmed**:
- `PromotionFormModal.jsx` (course + product picker, multi-field misread)
- `DfGroupFormModal.jsx` (course picker — name + category)
- `QuotationFormModal.jsx` (course + product + promotion picker — name + category)
- `ExchangeCourseModal.jsx` (course picker — products[] silently empty → exchange payload qty=1 unit='')
- `CustomerDetailView.jsx` (ProductExchangeModal sub-modal — name + unit + price)
- `MovementLogPanel.jsx` (product dropdown — name)
- `StockSeedPanel.jsx` (product picker + form — name + unit + price multi-line)
- `VendorSalesTab.jsx` (product dropdown — name)

**The rule**: For UI consumers that fetch from `be_courses` / `be_products` / `be_promotions` and read LEGACY shape `{name, price, category, products[], unit}`, the import MUST be the `*ForPicker` variant from `scopedDataLayer.js`:
- `listCoursesForPicker` (auto-applies `beCourseToMasterShape` + optional `productLookup` for unit enrichment)
- `listProductsForPicker` (auto-applies `beProductToMasterShape`)
- `listPromotionsForPicker` (auto-applies `bePromotionToMasterShape` — V49 extended with `price` + `category` fields)

Direct `listCourses` / `listProducts` / `listPromotions` callsites must read CANONICAL fields (`courseName` / `salePrice` / `courseCategory` / `courseProducts` / `productName` / `mainUnitName` / `categoryName` / `promotion_name` / `sale_price` / `category_name`).

**Decision rule**:
- LEGACY shape readers → `*ForPicker` (forms, modals, dropdowns, search pickers)
- CANONICAL shape readers → `list*` (admin tabs, reports, internal aggregators, cross-branch import)

**Grep**:
- `c\.(name|price|category|products|unit)` after `await\s+listCourses\(` in any `src/components/**` file → V49 anti-pattern; switch to `listCoursesForPicker`.
- `p\.(name|price|category|unit)` after `await\s+listProducts\(` in any `src/components/**` file → V49 anti-pattern; switch to `listProductsForPicker`. Defensive `p.productName || p.name` is OK (sanctioned via inline comment).
- `m\.(name|price|category)` after `await\s+listPromotions\(` → V49 anti-pattern; switch to `listPromotionsForPicker`.
- For each UI file importing from `scopedDataLayer.js`, classify as `ForPicker user` / `Canonical user` / `Sanctioned defensive` / `Internal lib`.

**Source-grep regression test pattern** (V49 lock — see `tests/v49-canonical-shape-multi-reader-sweep.test.js` CAT1 + CAT8):
```js
const VICTIM_FILES = [
  'src/components/backend/PromotionFormModal.jsx',
  'src/components/backend/DfGroupFormModal.jsx',
  'src/components/backend/QuotationFormModal.jsx',
  'src/components/backend/ExchangeCourseModal.jsx',
  'src/components/backend/CustomerDetailView.jsx',
  'src/components/backend/MovementLogPanel.jsx',
  'src/components/backend/StockSeedPanel.jsx',
  'src/components/backend/VendorSalesTab.jsx',
];
for (const f of VICTIM_FILES) {
  const src = readFileSync(f, 'utf8');
  // Must use ForPicker variant
  expect(src).toMatch(/list(Courses|Products|Promotions)ForPicker/);
  // Must NOT import legacy list*() from scopedDataLayer
  expect(src).not.toMatch(/import[^}]*\{[^}]*\b(listCourses|listProducts|listPromotions)\b(?![A-Za-z])[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/);
}
```

**Sanctioned exception**: defensive readers that handle BOTH canonical AND legacy via `||` fallback (e.g. `p.productName || p.name`, `composeProductDisplayName(p)` shared helper) are SAFE because they auto-adapt. Annotate inline if needed: `// audit-anti-vibe-code: AV27 safe — defensive on both canonical + legacy field names`.

**Companion AV: AV22** (canonical mapper adoption at buy-fetcher) + **AV24** (productName live-resolve at write) + **AV25** (display-layer grouping). Together with AV27 they lock the entire canonical→legacy shape-mismatch class:
- AV22 (V44): canonical mapper at buy fetcher (mapper-write boundary)
- AV24 (V46): productName live-resolve at stock-movement write (post-write boundary)
- AV25 (V47): display-layer grouping for course cards (post-storage rendering boundary)
- AV27 (V49): canonical→legacy shape adapter at picker fetch (pre-render boundary)

**Architectural pattern**: V49 introduces the `*ForPicker` naming convention for shape-aware variants. Future schema changes can extend the adapter without touching every consumer. Single source of truth: `beXToMasterShape(canonicalDoc) → legacyDoc`. AV27 grep ensures the boundary is honored.

**Migration on encountering NEW canonical→legacy shape mismatch**: (1) verify field names via diag script (`scripts/v49-diag-*.mjs`); (2) export adapter from `backendClient.js` if private; (3) add `*ForPicker` variant in `scopedDataLayer.js`; (4) migrate consumer; (5) lock with source-grep regression test.

### AV26 — Rule O extends UNIVERSALLY: every stock-write productName must live-resolve (V48)

**Why**: V48 (2026-05-08) — V46 audit only fixed 3 productName-write sites in `_deductOneItem`. Phase 1 source-grep sweep found **15+ OTHER stock-write sites** still using `productName: <doc>.productName` patterns (V46-class poisoning vulnerable): `_repayNegativeBalances`, `cancelStockOrder` CANCEL_IMPORT, `createStockAdjustment` movement+adjustment doc, `createStockTransfer` resolvedItems (POISON GATE — propagates downstream to dest batch + RECEIVE), `updateStockTransferStatus` EXPORT_TRANSFER, `createStockWithdrawal` resolvedItems POISON GATE, `updateStockWithdrawalStatus` EXPORT_WITHDRAWAL, central-stock-order CANCEL_IMPORT. ALL fixed in V48 with consistent live-resolve + fallback chain pattern.

**The rule** (extends AV24): for ANY Firestore write of stock_movement / stock_batch / stock_adjustment that emits `productName` field, MUST live-resolve from `be_products[productId]` BEFORE the tx body. Helper: `_resolveProductNameLive(productId)`. Pattern:
```js
const liveName = await _resolveProductNameLive(<productId-source>);
// ... in tx body or setDoc:
productName: liveName || <doc>.productName || ''
```

Or use item.productName fallback (V46-EXEMPT — caller-supplied canonical post-V44):
```js
productName: liveName || item.productName || <doc>.productName || ''
```

**POISON GATE pattern**: when a function builds a `resolvedItems` array that's later consumed by destination-tier batch/movement writers (e.g. transfer, withdrawal), live-resolve AT THE GATE so downstream consumers inherit canonical names. Single live-resolve fixes multiple downstream write sites.

**Comprehensive grep** (V48 CAT8.1):
```js
// Every stockMovementDoc productName write classified into sanctioned categories:
const writes = [...src.matchAll(/(?:tx\.set|setDoc|wb\.set)\(stockMovementDoc\([^)]+\),\s*\{[\s\S]+?productName:\s*([^,]+?),/g)];
for (const m of writes) {
  const expr = m[1].trim();
  const isLiveResolve = /live(?:Name|...|CentralCancelName)/i.test(expr);
  const isItemBased = /\b(?:item|it)\.productName/.test(expr);
  const isReadExisting = /\bm\.productName/.test(expr); // reading existing movement
  const isLineBased = /\b(?:line|p|t|c)\.productName/.test(expr); // sale-side category split
  expect(isLiveResolve || isItemBased || isReadExisting || isLineBased).toBe(true);
}
```

**Companion AV: AV24** (specific to _deductOneItem productName), **AV25** (display-layer grouping). AV26 is the UNIVERSAL stock-writer enforcement.

**Sanctioned exceptions** (item.productName-based — V46-exempt):
- `createCentralStockOrder.persistedItems` — caller-supplied input items
- All `_normalizeStockItems` skip-paths in `_deductOneItem` (course-skip / product-skip / not-tracked)
- Sale-side category split branches in `_normalizeStockItems` (products / medications / consumables / treatmentItems)
- `reverseStockForSale` reading existing movement (m.productName) for INFORMATION purpose only

### AV25 — Every customer.courses[] reader rendering UI cards MUST go through a grouping helper (V47)

**Why**: V47 (2026-05-08) — `customer.courses[]` stores 1 entry PER PRODUCT (post V44/V45 canonical design). CustomerDetailView mapped `activeCourses` 1-to-1 → user saw N CARDS for one logical course (one per per-product entry — main + each sub-product) with FULL course value stamped on each card. TFP "ข้อมูลการใช้คอร์ส" panel correctly groups via `buildCustomerCourseGroups` (form-shape) → 1 card with N nested rows. The display inconsistency confused user: "ต้องเชื่อตรงไหน?". Same V12 multi-reader-sweep family as V44/V45 (storage shape changed → every READER must be audited) but at the rendering layer that wasn't included in the original Phase 12.2b grouping rollout.

**The rule**: For any UI surface that displays courses to users (Customer Detail View, TFP, future course-list panels, search results, etc.), iteration over `customer.courses[]` for CARD RENDERING is FORBIDDEN. Must go through ONE of:
- `groupCustomerCoursesForDetailView(rawCourses)` — operates on raw `be_customers.courses[]` shape (`name` + `product` fields)
- `mapRawCoursesToForm(rawCourses)` + `buildCustomerCourseGroups(formShape)` — form-shape chain (`courseName` + `products[]` fields)

Both helpers use IDENTICAL group key (`name|linkedSaleId|linkedTreatmentId|parentName` + `__addon__|courseId` for buy-this-visit) so all views agree on "one purchase event = one card".

**Grep**:
- `customer\.courses\.map\(` or `(activeCourses|expiredCourses)\.map\(` in component files (excluding helper definitions). V47 anti-pattern when used for card rendering.
- `groupCustomerCoursesForDetailView\(` should appear in any consumer of raw `customer.courses[]` for UI rendering.
- `customer\.courses\.filter\(` is OK for non-rendering operations (badge counts, etc.) but should still go through grouping for any user-facing count.

**Sanctioned exception**: helper internals + tests + scripts are allowed direct iteration. Annotate inline if relevant: `// audit-anti-vibe-code: AV25 safe — helper-internal access`.

**Source-grep regression test pattern** (V47 lock — see `tests/v47-customer-detail-view-grouping.test.js` V47.C):
```js
expect(cdvSrc).toMatch(/import\s*\{\s*groupCustomerCoursesForDetailView/);
expect(cdvSrc).toMatch(/groupCustomerCoursesForDetailView\(activeCourses\)/);
expect(cdvSrc).toMatch(/\(\s*courseTab === 'active' \? activeCourseGroups : expiredCourseGroups\s*\)\.map\(/);
// Anti-regression: badge MUST use group count, not raw entry count
const badgeBlock = cdvSrc.match(/Package size=\{13\}[\s\S]+?<\/span>/);
expect(badgeBlock?.[0]).not.toMatch(/activeCourses\.length/);
```

**Branch-blindness invariant** (V47.D): the grouping helper's `.toString()` MUST NOT contain `branchId` / `SELECTED_BRANCH` / `useSelectedBranch` references — pure JS only. Same input on every branch produces identical output.

**Companion AV: AV20 (V41) + AV21 (V43) + AV22 (V44) + AV23 (V45) + AV24 (V46)**. Together they lock the entire customer-courses-display + skip-stock-deduction class:
- AV20: lookup-map opt-in
- AV21: denormalized-flag live-resolve
- AV22: canonical mapper adoption
- AV23: dedup OR-merge
- AV24: productName live-resolve at write
- AV25: customer.courses[] reader grouping (display parity)

### AV24 — Stock movement productName must come from be_products live-read, NEVER from batch's frozen denormalized field (V46 + Iron-clad Rule O)

**Why**: V46 (2026-05-08) — `_deductOneItem` at `backendClient.js:6889+6952` set movement.productName from `b.productName` (BATCH's denormalized cache field). When the batch was created during older bug rounds (V44-era course-name leak), batch.productName was POISONED with course name. New movements at this batch inherited the poisoned name despite item.productName being correct (Stapple no 22). User's repro (treatment BT-1778169734111) showed productId=38699 deducted but movement displayed "ขลิบไร้เลือด (เบอร์22) 1 ครั้ง" — looking like name-based deduct even though productId resolution was right. This is the 4th round of the skip-stock-deduction class-of-bug; Iron-clad Rule O was added in `00-session-start.md` to lock the architectural invariant permanently.

**The rule**: For ANY stock-related Firestore write (be_stock_movements primarily, but also batch-creating writers like AUTO-NEG synthesis):
1. productName MUST be live-resolved from `be_products[productId]` at WRITE time. Use the `_resolveProductNameLive(productId)` helper which caches per-call.
2. batch.productName / adjustment.productName / similar denormalized fields are DISPLAY CACHE only — NEVER authoritative when generating new movement records.
3. Fallback chain: `liveName || item.productName || batch.productName || ''`. Empty string is the FINAL fallback — better than course-name leak.

**Grep**:
- `productName:\s*[a-zA-Z_]+\.productName,` — bare assignment from any object's productName (no fallback chain). V46 anti-pattern when the value object is a batch/adjustment/similar Firestore-read doc.
- `tx\.set\(stockMovementDoc` followed within ~20 lines by `productName:\s*b\.productName` (or any short-form bare assignment) — V46 anti-pattern in movement emit.
- `setDoc\(stockBatchDoc[^)]+\),\s*\{[^}]*productName:\s*item\.productName(?!\s*\|\|\s*liveProductName)` — AUTO-NEG batch creation without live-resolve. V46 anti-pattern.
- Helper presence: `_resolveProductNameLive` MUST be imported/defined wherever stock_movement writes happen. Audit grep: `_resolveProductNameLive\(` count must be ≥ number of `tx.set(stockMovementDoc` writes that emit productName.

**Source-grep regression test pattern** (V46 lock — see `tests/v46-rule-o-live-product-name.test.js`):
```js
// 1. Helper exists
expect(backendSrc).toMatch(/async function _resolveProductNameLive\(productId\)/);
// 2. Movement productName uses live-resolved variable, not batch field
expect(backendSrc).toMatch(/productName:\s*liveName\s*\|\|\s*item\.productName/);
expect(backendSrc).toMatch(/productName:\s*liveNameNeg\s*\|\|\s*item\.productName/);
// 3. AUTO-NEG batch creation uses live name
expect(backendSrc).toMatch(/productName:\s*liveProductName\s*\|\|\s*item\.productName/);
// 4. Bare batch-name anti-pattern is GONE in movement emits
expect(backendSrc).not.toMatch(/productName:\s*b\.productName,\s*\n\s*qty:\s*-/);
```

**Sanctioned exception**: SKIP-path movements (course-skip / product-skip / trackStock-false / not-tracked) emit productName from `item.productName` directly because they're documenting USER INTENT (item.productName came from TFP post-V44 canonical chain), not the actual stock outcome. These DO NOT need live-resolve. Annotate inline if relevant: `// audit-anti-vibe-code: AV24 safe — skip-path documents user intent, not stock outcome`.

**Companion AV: AV20 + AV21 + AV22 + AV23**. Together with AV24 they lock the entire skip-stock-deduction class-of-bug:
- AV20 (V41): lookup-map opt-in
- AV21 (V43): denormalized-flag live-resolve
- AV22 (V44): canonical mapper adoption
- AV23 (V45): dedup OR-merge
- AV24 (V46): productName live-resolve at write time — the architectural backstop

**Migration on encountering poisoned data**: V46 ships `scripts/v46-backfill-stock-batch-product-name.mjs` (Rule M two-phase). Re-run when admin sees inconsistent batch productName vs current be_products. Idempotent.

### AV23 — Dedup logic in canonical mappers must OR-merge per-row flags before skipping (V45)

**Why**: V45 (2026-05-08) — `beCourseToMasterShape:3193` had `if (pid && pid === mainId) continue;` — silent dedup that dropped per-row sub-row flags when admin had configured the dup-of-main sub-row with `skipStockDeduction=true`. The main entry was pushed first with `skipStockDeduction: !!c.skipStockDeduction` (top-level only), and the dup-of-main sub's TRUE flag was silently lost. User-reported repro on "ขลิบไร้เลือด (เบอร์26) 1 ครั้ง" — admin set top=false + sub-row=true; result: -1 deduction via negativeOverage instead of branch-1 SKIP. 14 courses on prod were affected (PRP + ขลิบ + ปรึกษา clusters).

This is a **3rd-round-class bug** (V43 + V44 + V45 are all skip-stock-deduction class). Phase 4.5 of `/systematic-debugging` triggered architectural review: the architecture is sound; the bug is dedup-as-silent-skip. Fix: BEFORE `continue;`, find the already-pushed kept entry and OR-merge per-row flags from the dup-row into it. Pure mapper fix — propagates to all 3 consumers (TFP buy + SaleTab buy + QuotationFormModal).

**Grep**:
- `if\s*\([^)]*===\s*mainId\)\s*continue;` — bare continue without merge body. V45 anti-pattern. Every match must be paired with a preceding `products.find(...).<flag> = ...` block to OR-merge.
- General pattern: in any canonical mapper that DEDUPs entries, look for `continue;` after equality check on key field. If the kept entry has any per-record flag that the duplicate could meaningfully override, dedup must OR-merge before skipping.
- Specific flag classes to merge: boolean opt-out flags (`skipStockDeduction`, `isHidden`, `isPremium`, `isControlled`, etc.) — OR-semantic. Numeric/text fields generally don't merge well; flag the dup as ambiguous and skip OR pick the higher-priority source explicitly.

**Source-grep regression test pattern** (V45 lock):
```js
// AV23 grep — bare continue is forbidden; OR-merge body required
expect(backendSrc).not.toMatch(/if\s*\(pid\s*&&\s*pid\s*===\s*mainId\)\s*continue;\s*\n\s*const\s+enriched/);
// OR-merge body must reference the kept entry + per-flag merge
expect(backendSrc).toMatch(/if\s*\(pid\s*&&\s*pid\s*===\s*mainId\)\s*\{[\s\S]*?cp\.skipStockDeduction\s*===\s*true[\s\S]*?continue;\s*\}/);
```

**Sanctioned exception**: dedup paths where the kept entry is GUARANTEED to be canonical (the source-of-truth field is identical between dup + kept) — e.g. dedup by document id where both records came from the same source. Annotate inline: `// audit-anti-vibe-code: AV23 safe — dedup keys are canonical, no per-row override semantic`.

**Companion AV: AV22** (canonical mapper adoption — every consumer uses the same mapper). AV22 prevents inline mappers from drifting; AV23 prevents the canonical mapper itself from silently dropping user intent at dedup boundaries.

### AV22 — Every "buy item" fetcher must use the canonical mapper (V44)

**Why**: V44 (2026-05-08) — `TreatmentFormPage.jsx:1558+` buy fetcher did INLINE mapping (`products: c.courseProducts || c.products || []`) bypassing canonical `beCourseToMasterShape` (`backendClient.js:3150`). Two consequences: (a) `courseProducts` field is `productName` not `name` → `buildPurchasedCourseEntry` reads `p.name` → undefined → falls back to `item.name` (course name); (b) main product (`mainProductId/mainProductName`) at TOP LEVEL of be_courses doc gets dropped entirely. Result: customer course panel shows duplicate rows labeled by course name (Image 2); deduct path uses course name as productName → not found in be_products → falls into negative-overage path. SaleTab + QuotationFormModal both correctly use the canonical mapper; TFP was the V12 multi-reader-sweep gap.

**Grep**:
- `c\.courseProducts\s*\|\|\s*c\.products\s*\|\|\s*\[\]` — V44 anti-pattern. Every match in `src/components/**` (excluding `CoursesTab.jsx` admin-edit modal which works on the master directly) is a violation.
- `products:\s*c\.courseProducts\b` — narrower variant. Same fix.
- For each new "buy item" fetcher (any code that produces buyable course items for a UI dropdown / modal), grep for `beCourseToMasterShape` import — must be present.

**Sanctioned exception**: course-master-edit modals (`CoursesTab.jsx`, `CourseFormModal.jsx`) that EDIT the master directly — they work on the raw shape because they ARE the source-of-truth writer. Mark inline: `// audit-anti-vibe-code: AV22 safe — master-edit context, not a buy fetcher`.

**Source-grep regression test pattern** (V44 lock — see `tests/v44-course-buy-product-name-source-fix.test.js` V44.A.4 + V44.F.3):
```js
// Locate the buy-fetcher branch (e.g. TFP `} else if (type === 'course')`)
const courseBranchStart = src.indexOf('} else if (type === \'course\')');
const courseBranchEnd = src.indexOf('} else if (type === \'promotion\')', courseBranchStart);
const block = src.slice(courseBranchStart, courseBranchEnd);
// V44 anti-pattern grep
expect(block).not.toMatch(/c\.courseProducts\s*\|\|\s*c\.products\s*\|\|\s*\[\]/);
// Canonical mapper present
expect(block).toMatch(/beCourseToMasterShape\(c,/);
```

**Defense-in-depth**: even if a future writer drifts back to raw shape, **`buildPurchasedCourseEntry` + `assignCourseToCustomer`** use V44 dual-read fallbacks (`p.name || p.productName || ...`) to prevent course-name leak at the writer layer. The empty-string final fallback (NOT course-name) makes the V44 bug fingerprint impossible to write silently — admin sees blank product, not a phantom course-named product.

**Companion AV: AV20** (lookup-map opt-in) + **AV21** (denormalized-flag live-resolve). Same V12 multi-reader-sweep family but at the **buy-fetcher mapper** layer rather than read-time enrichment or write-time stamping.

### AV21 — Denormalized boolean flags from a master must live-resolve OR have backfill-migration tracking (V43)

**Why**: V43 (2026-05-08) — `customer.courses[i].skipStockDeduction` was denormalized at buy time + frozen against later master edits. Admin set "ไม่ตัดสต็อค" on PRP sub-product in `be_courses` master AFTER customer LC-26000006 had bought a promotion bundle containing that course. Customer's frozen entries kept `skipStockDeduction: false` → treatment deduct path emitted FIFO+negative-overage instead of branch-1 course-skip. Pattern: any boolean flag denormalized from a master into customer-attached / transaction-attached docs is silent-drift-prone if the master can be edited after the copy.

**Grep**:
- For every `setDoc`/`updateDoc` that copies a boolean field from a master doc into customer-attached / sale-attached / treatment-attached subdoc, audit:
  1. Is the master doc EDITABLE post-copy? (Yes for be_courses / be_products / be_promotions / be_coupons / be_vouchers — admin can change anytime)
  2. Is there a live-resolve overlay at the READ site? (Helper-function pattern that queries the master at form-load + overrides the frozen field)
  3. Is there a backfill-migration script in `scripts/v*-backfill-*.mjs` (Rule M two-phase + audit doc + idempotent)?
- A YES on (1) AND a NO on BOTH (2) and (3) = AV21 violation.

**Specific known-resolved fields** (V43 fix):
- `customer.courses[i].skipStockDeduction` ← live-resolved via `overlayCustomerCoursesWithMaster` in `src/components/TreatmentFormPage.jsx` load path; backfilled via `scripts/v43-backfill-customer-courses-skip-stock.mjs`. Single-source resolver: `resolveCustomerCourseSkipFlag` in `src/lib/treatmentBuyHelpers.js`.

**Source-grep regression test pattern** (V43 lock):
```js
// Lib helper exports + matches diag/migration classifier
expect(treatmentBuyHelpersSrc).toMatch(/export function resolveCustomerCourseSkipFlag/);
expect(treatmentBuyHelpersSrc).toMatch(/export function overlayCustomerCoursesWithMaster/);
// TFP load path applies overlay AFTER mapRawCoursesToForm
expect(tfpSrc).toMatch(/overlayCustomerCoursesWithMaster\(\s*customerCoursesForForm,\s*courseItems/);
// Migration script is two-phase + audit-doc-emitting + idempotent
expect(scriptSrc).toMatch(/process\.argv\.includes\('--apply'\)/);
expect(scriptSrc).toMatch(/be_admin_audit\/v43-/);
```

**Sanctioned exception**: short-lived flags that the master never edits post-copy (e.g. `customer.courses[i].assignedAt` is a write-once timestamp; not a sync target). Mark with `// audit-anti-vibe-code: AV21 safe — master-immutable field` annotation.

**Companion AV: AV13** (long-lived auth bug class) + **AV17** (list spread-order V12). Same V12 multi-reader-sweep family but at the **denormalized-master-flag** level rather than read-shape or write-direction.

### AV30 — Schema-vs-consumer drift on optional enum fields (V57, 2026-05-08)

**Pattern**: A schema field that consumers FILTER on but the validation file never declared, the UI never exposed, and existing data never carried. Consumers silently exclude all legacy data because the strict-equality filter `r.kind === 'doctor'` returns false for `kind: undefined`.

**Origin**: Phase 18.0 introduced `be_exam_rooms` collection. `examRoomValidation.js` defined name + nameEn + note + status + sortOrder — NOT `kind`. `ExamRoomFormModal` had no kind picker. Yet V55 added a `r.kind === 'doctor' ? 'doctor' : 'staff'` mapper (AdminDashboard schedule-link), and V56 added 4 more consumers (modal/panel/handleGenScheduleLink) that all filter `r.kind === 'doctor'`. Diagnostic 2026-05-08 confirmed all 6 prod rooms had `kind: undefined` → silently excluded from doctor-mode UIs.

**Fix architecture (V57)**:
1. **Schema** — declare the field at validation level: `KIND_OPTIONS = Object.freeze([...])` + emptyForm default + validate enum + normalize coerce
2. **UI** — expose a picker so admin can set per-doc (radio + Thai labels)
3. **Defensive default in consumers** — `(r.kind ?? 'doctor') === 'doctor'` so legacy data degrades gracefully (treated as the most-common case)
4. **Migration** — Rule M backfill stamps the default value on existing docs (idempotent, audit-emit, dry-run+apply)

**Anti-pattern** (forbidden by AV30): bare `r.kind === 'doctor'` filter without `?? 'doctor'` defensive default in consumer code that reads from a collection where the field could be missing on legacy docs.

**Source-grep regression** (`tests/v57-exam-room-kind.test.js` V57.K2):
```js
// Every consumer site must use defensive default
expect(src).toMatch(/r\.kind\s*\?\?\s*['"]doctor['"]/);
// Bare `r.kind === 'doctor'` strict filter forbidden anywhere outside helper memos
const violations = lines.filter((line) =>
  /\br\.kind\s*===\s*['"]doctor['"]/.test(line)
  && !/r\.kind\s*\?\?\s*['"]doctor['"]/.test(line)
  && !line.trim().startsWith('//'));
expect(violations).toEqual([]);
```

**Sanctioned exceptions**: NONE — every consumer goes through defensive default. The migration script can use bare `kind === 'doctor'` for backfill-skip logic (only applies when reading the doc to decide whether to write).

**Companion AV: AV20** (Staff/Doctor hide-from-lists default-filter pattern — same "missing-flag = default-semantic" architecture; both use empty/missing → the "most permissive" default). **Class-of-bug**: V21 schema-vs-consumer drift family (consumer assumes a field that schema never enforced).

**Lessons**:
1. When introducing a NEW collection, EVERY field consumed downstream must be declared in the validation file at day one — even if "optional" or "default-able". V57 schema gap was a 2-month silent latent bug.
2. Consumer-side defensive defaults are mandatory for fields where legacy docs predate the field's introduction. `?? 'most-common-value'` pattern is the canonical fix.
3. UI form must expose every consumed field. If admin can't set it, default values get baked in at the schema layer + migration backfills existing data.

### AV32 — Per-date set saved verbatim from admin-state without canonical-source derivation (V60, 2026-05-08)

**Pattern**: Admin-managed paint Set (`schedDoctorDays`) dumped verbatim into a customer-facing Firestore doc whose visibility (clickable / disabled) gates per-date. When the admin-state set covers months OTHER than the link's `months[]` window, the customer-facing calendar disables every cell silently — no error, no warning, just "กดดูอะไรไม่ได้เลย".

**Origin**: pre-V60 `handleGenScheduleLink` (`src/pages/AdminDashboard.jsx`) wrote `doctorDays: [...schedDoctorDays]` directly into `clinic_schedules/{token}`. The Set is the union of every date the admin ever painted on the schedule preview (across all months / branches the prefs file ever held). A May 2026 link generated from an admin who painted only March/April produced a doc with zero May `doctorDays` → `ClinicSchedule.jsx isDayDisabled = !noDoctorRequired && !isDoctor === true` for every day → calendar dead.

**Class-of-bug**: V12 multi-reader-sweep family at the schedule-link save boundary. Same architectural family as **V52/BS-11** (reportsLoaders), **V53/BS-12** (TIME_SLOTS), **V54/BS-13** (raw listeners), **V55/BS-14** (modal data sources), **V56/BS-15** (canonical source for room auto-closure but NOT doctorDays). V60 closes the doctorDays surface — the LAST adoption-gap in the schedule-link save path.

**Fix architecture (V60)**:
1. **Pure helper** `derivedDoctorDaysFromSchedules({doctorId, allEntries, datesISO})` in `src/lib/staffScheduleValidation.js` — mirror of `derivedAutoClosedDates` shape; returns dates where the doctor has a working entry (recurring OR per-date `work`/`halfday`); `mergeSchedulesForDate` semantics ensure per-date leave/holiday/sick OVERRIDE recurring weekday → date excluded.
2. **Save handler refactor** — `handleGenScheduleLink` fetches `be_staff_schedules` ONCE (consolidating V56's prior fetch), feeds BOTH `derivedAutoClosedDates` AND `derivedDoctorDaysFromSchedules` from the same `scheduleEntries` variable. `finalDoctorDays = union(derived, manual-scoped-to-months)` — manual paint outside the months window is dropped.
3. **Pre-flight gate** — `if (!schedNoDoctorRequired) { ... }` blocks save with Thai toast `"ยังไม่มีตารางหมอเข้าสำหรับ <month> — แก้ไขตารางคลินิกหรือตารางหมอก่อนสร้างลิงก์"` when ANY month would have zero doctor days. Surfaces gap to admin BEFORE the link goes out.
4. **Customer-side defense in depth** — `ClinicSchedule.jsx` renders an empty-state banner (`data-testid="schedule-empty-doctor-month"` + Thai/EN copy) when `noDoctorRequired !== true && monthDoctorDayCount === 0`. Legacy links still render gracefully.
5. **Rule M data fix** — `scripts/v60-fix-schedule-link-doctor-days.mjs` derives correct doctorDays from canonical source for any in-the-wild link whose admin generated pre-V60. Two-phase dry-run + apply, audit doc, idempotent, forensic-trail (`_v60BackfilledAt` + `_v60LegacyDoctorDays`).

**Anti-pattern** (forbidden by AV32): writing a per-date set to a customer-facing world-readable doc by spreading `[...adminStateSet]` verbatim, when a canonical Firestore source for that data exists AND can be derived for the saved doc's window. Always derive from canonical + UNION with admin-state filtered to window.

**Source-grep regression** (`tests/v60-doctor-days-derive-from-schedules.test.js` X6.1 + X2.4):
```js
// FORBID verbatim spread inside the schedule-link setDoc shape
const setDocBlock = ADMIN_DASHBOARD_SRC.match(
  /await setDoc\(doc\(db,\s*'artifacts',\s*appId,\s*'public',\s*'data',\s*'clinic_schedules'[\s\S]{0,3500}?\}\);/,
);
expect(setDocBlock[0]).not.toMatch(/doctorDays:\s*\[\.\.\.schedDoctorDays\]/);
expect(setDocBlock[0]).toMatch(/doctorDays:\s*finalDoctorDays/);
```

**Sanctioned exceptions**: NONE — any new write of a per-date set into a world-readable doc must go through canonical-derive + scoped-union OR a documented compelling reason. The gate may legitimately be skipped only when `noDoctorRequired === true` (every day is bookable; doctorDays irrelevant).

**Companion AV: AV20** (default-filter at lister + opt-in). **AV24** (Rule O productName live-resolve at write-time — same "derive from canonical at write boundary" architectural family). **Class-of-bug**: V12 multi-reader-sweep at the **save boundary**, where the writer reads from a stale admin-state cache instead of the canonical source.

**Lessons**:
1. **Admin-state Sets are NOT save-time canonical sources.** They're UI scratch state — fine for paint preview, dangerous for verbatim persistence. When a per-date set gets saved into a customer-facing doc, derive from the canonical Firestore source (`be_staff_schedules`) for the doc's window FIRST, then UNION with admin-state filtered to that window.
2. **Pre-flight gates surface latent bugs.** A save handler that just *commits whatever shape it has* turns silent breakage into a noisy bug at link-share time. Adding a "would this doc be functional?" check before commit is cheap insurance.
3. **Defense in depth on the customer side** — even with admin-side gate, legacy in-the-wild links predate the gate. An empty-state banner is a one-screen change that prevents customer confusion forever, regardless of who/what produced the broken doc.
4. **BSA adoption-gap pattern at the WRITE boundary** is the mirror of the READ-boundary gaps (V52-V55). When a canonical Firestore source exists, EVERY writer that derives from admin state must also derive from canonical. V56 introduced `be_staff_schedules` consumption at the auto-closure layer but missed the doctorDays layer for 2 sub-revisions until V60.

### AV33 — Schedule-link modal room dropdown driven by canonical schedule, not `kind` (V61, 2026-05-08)

**Pattern**: Customer-facing schedule-link modal MUST derive its room-dropdown options from `be_staff_schedules` (canonical) for the months window — NOT from the static `be_exam_rooms.kind` filter (V57). Pre-V61 used `r.role === (schedNoDoctorRequired ? 'staff' : 'doctor')` which produced two failure modes: (1) พบแพทย์ mode showed every "kind=doctor" room — including rooms the selected doctor never enters → broken customer link; (2) ไม่พบแพทย์ mode showed every "kind=staff" room — including rooms doctors actually use → wrong availability semantics.

**Class-of-bug**: V12 multi-reader-sweep at the schedule-link MODAL UI boundary. Same family as V52/BS-11 (reportsLoaders), V53/BS-12 (TIME_SLOTS), V54/BS-13 (raw listeners), V55/BS-14 (modal data sources), V56/BS-15 (room auto-closure derived from canonical), V60/AV32 (save-time doctorDays). V61 closes the LAST adoption-gap in the schedule-link path — the MODAL UI dropdown filter source.

**Origin**: User report (verbatim, 2026-05-08): "เพิ่มเงื่อนไขใน Modal สร้างลิงก์ตาราง คือ หากไม่ได้ติ๊กไม่พบแพทย์ … ลิ้งค์พบแพทย์จะแสดงแต่ห้องที่แพทย์คนนั้นๆที่เลือกใน dropdown เข้าตรวจ ตามในระยะเวลาในช่อง 'แสดงทั้งหมด' …". V57 had introduced `kind` field for general categorization, but the schedule-link modal needs SCHEDULE-DRIVEN data, not kind-static.

**Fix architecture (V61)**:
1. **Pure helpers** in `src/lib/staffScheduleValidation.js`:
   - `deriveDoctorRoomIdsForWindow({ doctorIds, allEntries, datesISO })` — union of `roomIds` across working entries (`doctorIds=null` aggregates ALL doctors per "แพทย์ทุกคน" Q1=B refined)
   - `deriveNonDoctorRoomIdsForWindow({ branchExamRooms, allEntries, datesISO })` — rooms in `branchExamRooms` (`status='ใช้งาน'`) that are NOT touched by any working entry in window
2. **Modal UI** (`AdminDashboard.jsx`): replaced V57 kind-filter with `v61EligibleRooms` useMemo derived via the helpers; defensive reset on dep change; updated label copy ("ห้องที่แพทย์เข้าตรวจ" / "ห้องที่ไม่มีแพทย์เข้าตรวจ").
3. **Pre-flight gate (Q2=A)**: when zero eligible rooms → block save with Thai toast (3 variants: ไม่พบแพทย์ / specific doctor / แพทย์ทุกคน). Mirrors V60 doctorDays gate.
4. **Save shape (Q4=A snapshot)**: NEW `selectedRoomIds: string[]` field on `clinic_schedules/{token}` — single-pick = `[room]`; "ทุกห้อง" pick (Q3=B) = full union snapshot. `selectedRoomId` legacy field preserved for backward compat.
5. **Filter helper extension** (`scheduleFilterUtils.js shouldBlockScheduleSlot`): accepts `selectedRoomIds: string[]` alongside legacy `selectedRoomId`. Prefers array when present + non-empty; falls back to single. Pre-V61 saved docs unaffected.
6. **Resync recompute (Q4=A continuation)**: `updateActiveSchedules` detects "ทุกห้อง" saved docs (`selectedRoomId === null` + `selectedRoomIds` non-empty) and recomputes the union from current `be_staff_schedules`. Specific-pick docs are preserved verbatim. Customer link only updates on admin Sync.

**Anti-pattern** (forbidden by AV33):
```js
// ❌ FORBIDDEN — V57 kind-based filter at modal UI
const shownRooms = branchExamRooms.filter(r =>
  r.role === (schedNoDoctorRequired ? 'staff' : 'doctor')
);
```

**Source-grep regression** (`tests/v61-schedule-link-room-from-schedules.test.js`):
```js
// FORBID pre-V61 kind filter
expect(ADMIN_DASHBOARD_SRC).not.toMatch(
  /branchExamRooms\.filter\(\s*r\s*=>\s*[\s\S]{0,80}?r\.role\s*===\s*\(\s*schedNoDoctorRequired\s*\?\s*['"]staff['"]\s*:\s*['"]doctor['"]\s*\)/,
);
// REQUIRE V61 helpers + useMemo + pre-flight gate + saved shape
expect(ADMIN_DASHBOARD_SRC).toMatch(/deriveDoctorRoomIdsForWindow/);
expect(ADMIN_DASHBOARD_SRC).toMatch(/deriveNonDoctorRoomIdsForWindow/);
expect(ADMIN_DASHBOARD_SRC).toMatch(/v61EligibleRoomIds\s*=\s*useMemo/);
expect(ADMIN_DASHBOARD_SRC).toMatch(/v61EligibleRoomIds\.length\s*===\s*0/);
expect(ADMIN_DASHBOARD_SRC).toMatch(/selectedRoomIds:\s*v61SelectedRoomIds/);
```

**Sanctioned exceptions**: NONE — every customer-facing schedule-link modal MUST drive its room dropdown from canonical schedule data. The V57 `kind` field is still a legitimate field on `be_exam_rooms` for OTHER consumers (general categorization, AppointmentTab room picker, etc.), but the schedule-link modal must use schedule-DRIVEN filtering.

**Companion AV: AV30** (V57 kind schema) — same family of "schema field meanings". V57 says "every kind consumer must use defensive default `?? 'doctor'`"; V61/AV33 says "schedule-link modal CANNOT use kind at all — must derive from schedule data". Both AVs are coexistent: kind is for general categorization, schedule data is for actual-use semantics.

**Lessons**:
1. **Static schema fields ≠ behavior-driven semantics**. V57's `kind` field captured "this room is generally a doctor room" but the schedule-link modal needs "is this room being used by a doctor in THIS window". Two different questions; one needs static metadata, the other needs canonical schedule.
2. **Snapshot at save + recompute on Sync** is the canonical pattern for customer-facing public-link docs (V60 doctorDays + V61 selectedRoomIds both use it). Customer link reflects last-Sync state; admin controls when refresh happens.
3. **Backward-compat via dual-field** (`selectedRoomId` legacy + `selectedRoomIds` array) prevents migration risk. shouldBlockScheduleSlot prefers array; falls back to single.
4. **Pre-flight gate at the WRITE boundary** is the canonical defense for save-time data validity. Mirrors V60's doctorDays gate; both prevent silent-broken customer links.
5. **The complete schedule-link adoption-gap series (V52-V61)** demonstrates a single class-of-bug being eliminated layer-by-layer: V52 reports, V53 time-axis, V54 raw listeners, V55 modal data sources, V56 room auto-closure, V60 save-time doctorDays, V61 modal UI room dropdown. Each closed a different boundary; together they form a complete BSA + canonical-source story.

### AV34 — Schedule-link doctorDays + customDoctorHours derived for ALL modes (V62, 2026-05-08)

**Pattern**: Customer-facing schedule-link doc MUST populate `doctorDays` (calendar 🔥-emoji days) AND `customDoctorHours` (per-date `[{start,end}]` ranges) from `be_staff_schedules` for ALL link modes — including ไม่พบแพทย์ + showDoctorStatus mode where admin doesn't pick a specific doctor. Pre-V62 only ran the V60 derivation when `schedSelectedDoctor` was set; ไม่พบแพทย์ links saved `doctorDays: []` + clinic-hours-as-doctor-hours fallback → `isSlotWithinDoctorHours` always returned false → "หมอว่าง / หมอไม่ว่าง" overlay never fired.

**Class-of-bug**: V12 multi-reader-sweep at the schedule-link SAVE boundary, narrowed-derivation gap. V60 closed the WRITE-time derivation for SPECIFIC-doctor mode but did NOT extend to multi-doctor modes (ไม่พบแพทย์ + แพทย์ทุกคน) where the customer overlay still depends on doctor schedule data. V62 closes the gap.

**Origin**: User report (verbatim, 2026-05-08, with 2 screenshots): "ลิ้งนี้ยังไม่แสดงสถานะหมอ ทั้งๆที่เป็นลิ้งที่ติ๊กเลือกว่าจะแสดงสถานะหมอว่าง/ไม่ว่าง ด้วย ทั้ง emoji ไฟลุกในปฏิทินในช่องวันที่หมอเข้าก็ไม่แสดง และในช่องตารางแต่ละวัน ถ้าหมอว่างอยู่ในเวลาเดียวกันนั้น ไม่ว่าหมอจะเข้าตรวจอยู่ห้องไหนในคลินิกนั้นวันนั้นเวลานั้น ก็ให้แสดงว่าหมอว่างด้วย ... และวันที่ 9 ในภาพที่ 2 นอกจากจะแสดงว่าห้องช็อคเวฟไม่ว่างแล้ว ก็ให้แสดงให้ลูกค้ารู้ด้วยว่าหมอก็ไม่ว่างอยู่เหมือนกันในอีกห้องหนึ่ง". Diag of SCH-9c201860e1 confirmed `doctorDays:0`, `doctorStartTime:'11:30'` (clinic), `doctorEndTime:'20:30'` (clinic) — all wrong.

**Fix architecture (V62)**:
1. **NEW pure helpers** in `src/lib/staffScheduleValidation.js`:
   - `derivedDoctorDaysAcrossWindow({ doctorIds, allEntries, datesISO })` — multi-doctor extension of V60. `doctorIds=null` aggregates ALL doctors (ไม่พบแพทย์ + แพทย์ทุกคน modes).
   - `derivedDoctorWorkingHoursPerDate({ doctorIds, allEntries, datesISO })` — returns `{[dateISO]: [{start,end},...]}` from working entries; off-shift types excluded; multi-doctor non-overlapping windows kept as separate ranges.
2. **Save handler** (`AdminDashboard.jsx handleGenScheduleLink`):
   - `v62DoctorIdsForDerivation = schedSelectedDoctor ? [schedSelectedDoctor] : null`
   - V62 derivations called UNCONDITIONALLY (no schedSelectedDoctor gate); `finalDoctorDays = union(V60 specific, V62 multi-doctor, manual paint)` — Set dedup handles overlap.
   - `v62MergedCustomDoctorHours = { ...v62DoctorHoursPerDate, ...(schedCustomDoctorHours || {}) }` — admin's per-day overrides win on collision.
   - Saved doc shape: `customDoctorHours: v62MergedCustomDoctorHours` (was `schedCustomDoctorHours` only).
3. **Customer-side render** (`ClinicSchedule.jsx`):
   - Doctor-status badge JSX condition `slot.doctorSlot && !slot.booked && (` → `slot.doctorSlot && (` — overlay always renders within doctor hours regardless of slot booked state.
   - Outer `opacity-30` dim moved from card to inner time-text wrapper only — badge stays at full opacity when slot busy.
4. **Rule M data fix** (`scripts/v62-fix-schedule-link-doctor-data.mjs`): backfills any in-the-wild link that has `noDoctorRequired=true + doctorDays=[]` (or specific-doctor with stale data). Two-phase dry-run + apply, audit doc, idempotent. SCH-9c201860e1 backfilled to 18 May 2026 days + 22 customDoctorHours keys (18 derived + 4 admin overrides).

**Anti-pattern** (forbidden by AV34):
```js
// ❌ FORBIDDEN — only deriving doctor data when specific doctor picked
let derivedDoctorDays = [];
if (schedSelectedDoctor) {  // ← gate skips noDoctor mode → BUG
  derivedDoctorDays = derivedDoctorDaysFromSchedules({ doctorId: schedSelectedDoctor, ... });
}

// ❌ FORBIDDEN — overlay hidden when slot booked
{slot.doctorSlot && !slot.booked && (
  <Badge>{slot.doctorBusy ? 'หมอไม่ว่าง' : 'หมอว่าง'}</Badge>
)}
```

**Source-grep regression** (`tests/v62-doctor-days-and-hours-from-schedules.test.js` M3.2):
```js
expect(CLINIC_SCHEDULE_SRC).not.toMatch(/slot\.doctorSlot\s*&&\s*!slot\.booked\s*&&\s*\(/);
expect(CLINIC_SCHEDULE_SRC).toMatch(/slot\.doctorSlot\s*&&\s*\(/);
expect(ADMIN_DASHBOARD_SRC).toMatch(/v62MultiDoctorDays\s*=\s*derivedDoctorDaysAcrossWindow/);
expect(ADMIN_DASHBOARD_SRC).toMatch(/v62DoctorHoursPerDate\s*=\s*derivedDoctorWorkingHoursPerDate/);
expect(ADMIN_DASHBOARD_SRC).toMatch(/customDoctorHours:\s*v62MergedCustomDoctorHours/);
```

**Sanctioned exceptions**: NONE — every customer-facing schedule-link save MUST derive doctor data from canonical source for ALL link modes. The derivation is multi-doctor by default; specific doctor is just `doctorIds=[X]` filter.

**Companion AV: AV32** (V60 doctorDays derived from schedules — specific-doctor case). V62 extends V60's pattern to multi-doctor modes. Both AVs coexist: AV32 handles selectedDoctorId-set; AV34 handles selectedDoctorId-null (ไม่พบแพทย์ + แพทย์ทุกคน).

**Lessons**:
1. **A narrow derivation is a future bug magnet** — V60 only fired when `schedSelectedDoctor` was set. The "user might select a doctor" assumption silently broke ไม่พบแพทย์ mode where admin INTENTIONALLY doesn't select. Generalize derivation early; gate the OUTPUT not the INPUT.
2. **Customer overlay needs FULL display matrix** — pre-V62 hid overlay when slot booked. User wanted ALL 4 cells of (slot busy/free × doctor busy/free) visible so customer can pivot from shockwave-link to consultation. Booked + free-doctor is a productive state, not a dead end.
3. **Snapshot at save is the canonical pattern for customer-facing public-link docs** — V60 doctorDays + V61 selectedRoomIds + V62 customDoctorHours all use this. Customer link reflects last-Sync state; admin controls when refresh happens.
4. **CSS opacity placement matters for layered information** — applying `opacity-30` to the OUTER card dimmed the doctor badge along with the slot text. Move the dim to the inner element that should be dimmed; siblings stay at full opacity. Layering the visual hierarchy this way preserves multi-info display when slot has multiple statuses.
5. **The complete schedule-link adoption-gap series (V52-V62)** demonstrates a single class-of-bug eliminated layer-by-layer: V52 reports / V53 time-axis / V54 raw listeners / V55 modal data sources / V56 room auto-closure / V60 save-time doctorDays specific / V61 modal UI room dropdown / V62 save-time doctorDays + customDoctorHours multi-doctor. 8 V-entries, 8 boundaries, one canonical source-of-truth (`be_staff_schedules`).

### AV35 — AdminDashboard calendar fire-emoji + doctor-day cycle driven by canonical `be_staff_schedules` (V63, 2026-05-08)

**Pattern**: AdminDashboard's "Frontend" appointment calendar (image-1, line ~6602) + "ตั้งค่าตารางคลินิก" prefs calendar (image-2, line ~7044) MUST render the 🔥 doctor-day emoji from canonical `be_staff_schedules` data (via `canonicalDoctorDays` useMemo + `derivedDoctorDaysAcrossWindow` helper) — NOT from admin's manual paint Set (`schedDoctorDays`). Admin's "doctor day" toggle in the prefs calendar is REMOVED — `toggleDay` + `handleDayPointerDown` cycle simplified to `closed ↔ normal` only.

**Class-of-bug**: V12 multi-reader-sweep at AdminDashboard CALENDAR RENDER boundary. The schedule-link adoption-gap series (V52-V63) is now 9 V-entries deep; V63 closes the admin-UI rendering gap (admin can no longer paint doctor days; canonical source drives the visual indicator).

**Companion bug fixed (V62-bis)**: `handleGenScheduleLink` pre-V62-bis fetched `scheduleEntries` ONLY when `schedSelectedDoctor` was set. For noDoctor mode without specific doctor (or แพทย์ทุกคน mode), scheduleEntries=[] → V62 derivation ran on empty input → doctorDays still saved as []. User generated SCH-cc3964c023 (noDoctor + showDoctorStatus=false) and 🔥 emoji didn't render. V62-bis: drop the `if (schedSelectedDoctor)` gate; always fetch (ternary: branch-wide when no specific doctor).

**Origin**: User report (verbatim, 2026-05-08): "เปลี่ยน emoji ไฟ ที่หมอเข้า ให้เห็นกับลิ้งที่ไม่ได้ติ๊กให้แสดงสถานะหมอด้วย ... ดึงวันหมอเข้ามาแสดงเป็นอีโมจิไฟในปฏิทิน tab นัดหมายของ frontend อันนี้ด้วย ... ส่วนปฏิทินด้านล่าง ให้ทำได้แค่ปิดวัน ไม่สามารถกำหนดวันหมอเข้าได้แล้ว". Multiple bugs surfaced on `SCH-cc3964c023` (fresh post-V62 link with empty doctorDays).

**Fix architecture (V63 + V62-bis)**:
1. **V63 — canonical doctor days in AdminDashboard render**:
   - NEW state `allBranchScheduleEntries` + useEffect to load `listStaffSchedules({branchId: selectedBranchId})` whenever branch changes
   - NEW useMemo `canonicalDoctorDays = new Set(derivedDoctorDaysAcrossWindow({doctorIds: null, allEntries, datesISO}))` for the apptMonth window
   - Replace `schedDoctorDays.has(...)` → `canonicalDoctorDays.has(...)` at both render sites (image-1 line ~6602, image-2 line ~7044)
2. **V63 — drop "doctor day" toggle from prefs calendar**:
   - `toggleDay` cycle: was `normal → doctor → closed → normal`; now `normal ↔ closed` only
   - `handleDayPointerDown` action ternary: was `schedDoctorDays.has ? 'closed' : schedClosedDays.has ? 'normal' : 'doctor'`; now `schedClosedDays.has ? 'normal' : 'closed'`
   - `setSchedDoctorDays` mutations REMOVED from toggleDay (state remains for legacy prefs-doc backward-compat at load)
3. **V63 — UI legend updates**:
   - Subtitle: `หมอเข้า · ปิดคิว · ปิดช่วงเวลา` → `ปิดคิว · ปิดช่วงเวลา`
   - Legend chip: `หมอเข้า` → `หมอเข้า (จากตารางหมอ)` (read-only hint)
   - Edit button: `แก้ไขตารางหมอเข้า/ปิดคิว` → `แก้ไขปิดคิว`
   - Edit-mode hint: `กดวันที่เพื่อเปลี่ยนสถานะ` → `กดวันที่เพื่อสลับ ปกติ ↔ ปิดคิว`
4. **V62-bis — drop fetch gate in `handleGenScheduleLink`**:
   - Pre-V62-bis: `if (schedSelectedDoctor) { scheduleEntries = await listStaffSchedules({...staffId}); }` ← scheduleEntries=[] when no specific doctor
   - Post-V62-bis: ternary `scheduleEntries = schedSelectedDoctor ? await listStaffSchedules({branchId, staffId}) : await listStaffSchedules({branchId})` ← always fetches; branch-wide when no specific doctor

**Anti-pattern** (forbidden by AV35):
```js
// ❌ FORBIDDEN — admin calendar reads from manual paint Set instead of canonical
const isDoc = schedDoctorDays.has(dateStr);  // pre-V63 admin manual paint

// ❌ FORBIDDEN — toggleDay cycles through 'doctor' action (admin can't paint anymore)
const action = forceAction || (schedDoctorDays.has(dateStr) ? 'closed' : schedClosedDays.has(dateStr) ? 'normal' : 'doctor');

// ❌ FORBIDDEN — fetch scheduleEntries gated on schedSelectedDoctor (V62-bis)
let scheduleEntries = [];
if (schedSelectedDoctor) {
  scheduleEntries = await listStaffSchedules({branchId, staffId: schedSelectedDoctor});
}
```

**Source-grep regression** (`tests/v63-canonical-doctor-days-admin-calendar.test.js`):
```js
// V63 admin calendar uses canonicalDoctorDays
expect(ADMIN_DASHBOARD_SRC).toMatch(/canonicalDoctorDays\s*=\s*useMemo/);
expect(ADMIN_DASHBOARD_SRC).toMatch(/const\s+isDoc\s*=\s*canonicalDoctorDays\.has\(dateStr\)/);
expect(ADMIN_DASHBOARD_SRC).toMatch(/const\s+isDoc\s*=\s*canonicalDoctorDays\.has\(ds\)/);

// toggleDay cycle simplified
expect(ADMIN_DASHBOARD_SRC).not.toMatch(/const\s+action\s*=\s*forceAction\s*\|\|\s*\([\s\S]{0,200}?:\s*'doctor'\s*\)/);
expect(ADMIN_DASHBOARD_SRC).toMatch(/const\s+action\s*=\s*forceAction\s*\|\|\s*\(schedClosedDays\.has\(dateStr\)\s*\?\s*'normal'\s*:\s*'closed'\)/);

// V62-bis fetch ungated
expect(ADMIN_DASHBOARD_SRC).toMatch(/scheduleEntries\s*=\s*schedSelectedDoctor[\s\S]{0,400}?listStaffSchedules\([\s\S]{0,200}?:\s*await listStaffSchedules\(/);
```

**Sanctioned exceptions**: NONE for the canonical-source rule. `schedDoctorDays` state still exists for backward-compat reading from legacy prefs docs at load — but is never mutated by toggle paths post-V63.

**Companion AV: AV32** (V60 doctorDays save-time derivation specific-doctor) + **AV34** (V62 doctorDays save-time multi-doctor) + AV35 (V63 admin-render canonical). Together they form the complete schedule-link canonical-source family.

**Lessons**:
1. **A narrow fetch is a future bug magnet** — V62-bis lesson: even if downstream derivation runs unconditionally, gating the INPUT fetch on `if (schedSelectedDoctor)` produces empty output for non-specific modes. Always fetch the data; let downstream filter.
2. **Admin manual paint vs canonical source** — when the canonical source exists, drop admin's parallel mutation paths. Keep state for legacy doc loading; never mutate it via UI.
3. **Cycle simplification reduces UX surface area** — pre-V63 toggle had 3 states (normal/doctor/closed) → 6 transitions. Post-V63 has 2 states → 1 transition. Less to test, less to misuse.
4. **The complete schedule-link adoption-gap series (V52-V63) is 9 V-entries deep** — V52 reports / V53 time-axis / V54 raw listeners / V55 modal data sources / V56 room auto-closure / V60 save-time doctorDays specific / V61 modal UI room dropdown / V62 save-time doctorDays multi-doctor / V63 admin-UI render canonical. 9 boundaries, one canonical source-of-truth (`be_staff_schedules`).

### AV36 — V64 appointment hub PDF print V32 lock (2026-05-09)

**Pattern**: Every print/PDF helper introduced post-V32 MUST use `html2canvas` + `jsPDF.addImage` directly with explicit dimensions; NEVER use `html2pdf.js` orchestration (V32 blank-2nd-page bug — html2pdf's pagebreak heuristic emits a ghost page even when content fits + `pagebreak:'avoid-all'` is set). The V64 appointment hub print path (`appointmentHubPrintTemplate.js` builders + `AppointmentHubView.jsx` `handlePrint`) is the latest application of the V32 lock — it lazy-imports `html2canvas` + `jspdf` directly, renders the table HTML offscreen, captures via `html2canvas` with `scale:2`, and writes via `pdf.addImage` with paper-sized mm dimensions.

**Anchor**: `src/lib/appointmentHubPrintTemplate.js` (no `html2pdf` import) + `src/components/admin/AppointmentHubView.jsx` (`handlePrint` uses `import('html2canvas')` + `import('jspdf')`).

**Class-of-bug**: V21 source-grep test lock-in family (V32 4-round saga). Source-grep tests can encode broken behavior verbatim — the html2pdf path passed source-grep "uses pagebreak avoid-all" assertions while the real PDF was visibly broken. AV36 anchors on the FORBIDDEN import (`html2pdf`) so future drift fails build.

**Sanctioned exceptions**: NONE.

**Source-grep regression** (`tests/audit-branch-scope.test.js` AV36.1-AV36.2):
```js
// AV36.1 — appointmentHubPrintTemplate.js does NOT import html2pdf
expect(printTemplateSrc).not.toMatch(/import.*html2pdf/i);
expect(printTemplateSrc).not.toMatch(/from ['"]html2pdf/i);

// AV36.2 — AppointmentHubView uses html2canvas + jspdf directly
expect(viewSrc).not.toMatch(/from ['"]html2pdf/i);
expect(viewSrc).toMatch(/import\(['"]html2canvas['"]\)/);
expect(viewSrc).toMatch(/import\(['"]jspdf['"]\)/);
```

**Companion**: AV16 (source-grep visual tests insufficient — pair with runtime measurement). AV36 is the architectural backstop; AV16 is the methodological complement.

### AV37 — TFP doctor-save gate discipline (V26.0, 2026-05-13)

**Pattern**: Every `await deductCourseItems(`, `await createBackendSale(`,
`await assignCourseToCustomer(`, `await applyDepositToSale(`,
`await deductWallet(`, `await earnPoints(` in
`src/components/TreatmentFormPage.jsx` `handleSubmit` MUST be preceded
by `saveMode !== 'doctor'` gate within the enclosing-gate block
(practical window 16000 chars for the edit-mode sale-sync nested chain).

`await deductStockForTreatment(` — the FIRST call (consumables /
treatmentItems, type 6) MUST be saveMode-gated; the SECOND call
(medications, type 7) MUST NOT be saveMode-gated (sanctioned exception
per Phase 26.0 Q2 brainstorming — doctor records meds for the patient).

`status: 'doctor-recorded'` stamping pattern must be present:
- `saveMode === 'doctor'` ternary in v26StatusPatch
- `recordedBy: auth.currentUser?.uid` + `recordedAt: serverTimestamp()` for doctor-save
- `deleteField()` for admin save (clears status; preserves prior recordedBy/At as forensic trail)

Phase 26.0c UI gates: `canAddNewItems = (mode === 'create') || (loadedTreatmentStatus === 'doctor-recorded')`
declared at top of TFP render; replaces every `!isEdit && <AddBtn>` pattern at 5+
UI sites (med add buttons, med grid swap, consumable add, consumable grid swap,
course/purchase picker trigger).

Phase 26.0e: `rebuildTreatmentSummary` in `src/lib/backendClient.js` MUST preserve
`status: t.status || null` in the summary mapper output. CustomerDetailView +
TreatmentTimelineModal chips read from `summary.status` — drift here = chip
silently missing.

**Anchor**: `src/components/TreatmentFormPage.jsx` (handleSubmit gates +
v26StatusPatch + canAddNewItems flag) + `src/lib/backendClient.js`
(rebuildTreatmentSummary status field).

**Class-of-bug**: V12 multi-writer-sweep at handleSubmit boundary. A new
deduction or sale-create call site added to handleSubmit in the future
without the saveMode gate = double-deduct on admin finalize (doctor-save
already deducted; admin's normal save would deduct again).

**Sanctioned exceptions**:
- `deductStockForTreatment` 2nd call (medications, type 7) — KEPT for both
  saveModes per Q2.
- Doctor-save button itself uses `{!isEdit && ...}` — doctor-save semantic
  is create-only (admin finalizes via regular "บันทึก").
- `isEdit` references in save-path branching (handleSubmit's existing
  edit-vs-create logic) — NOT replaced with `canAddNewItems`. Only UI
  add-op sites get the swap.
- `isEdit` references in header banner text ("สร้างการรักษา" vs "แก้ไขการรักษา")
  + save-button label ("ยืนยันการรักษา" vs "บันทึกการแก้ไข") + empty-state
  placeholders — semantically tied to mode, not add-capability.

**Source-grep regression** (`tests/audit-branch-scope.test.js` AV37.1-AV37.8):
8 sub-tests lock the architectural contract. See test file for exact regex
patterns + assertion shape. Cross-references: `tests/phase-26-0-doctor-save-source-grep.test.js`
(G1+G2) + `tests/phase-26-0-status-display-rtl.test.jsx` (D1+D2+D3+D4).

### AV37 extension — Phase 26.1 editor-attribution (2026-05-13)

Phase 26.1 extends AV37 with editor-attribution modal contract:

- `handleSubmit` signature becomes `async (eventOrSaveMode, options = {})`
  with new `options.editorContext` arg. Internal re-invoke via plain object
  `{saveMode, editorContext}` form is recognized when eventOrSaveMode lacks
  `preventDefault`. All Phase 26.0 forms (string / Event / undefined) still
  resolve identically.
- `editedBy / editedByName / editedByRole / editedAt` fields stamped to
  TOP LEVEL of be_treatments doc (not nested in detail). createBackendTreatment
  + updateBackendTreatment extend the Phase 26.0b extraction pattern.
- `rebuildTreatmentSummary` preserves the 4 editor fields in summary array
  for CDV row meta display.
- CDV summary mapper in CustomerDetailView.jsx line 432-442 includes the
  4 fields — V12 multi-reader-sweep miss from Phase 26.0e fixed in
  Phase 26.1a.
- `ROLE_LABEL_TH = { doctor, assistant, staff }` constant at top of CDV
  for inline meta display.

Source-grep regression: AV37.9 (modal exists) + AV37.10 (signature ext)
+ AV37.11 (top-level extraction). All in `tests/audit-branch-scope.test.js`.

Sanctioned exceptions:
- `editorContext` may be null on create-mode staff save (no modal triggered) —
  the spread `...(editorContext ? {} : {})` writes nothing in that branch.
- Legacy treatments without editedBy fields render no inline meta —
  defensive `t.editedByName && ...` gate at CDV row meta.

**Companion**: AV20 (default-filter at lister + opt-in pattern from V41 hide-from-lists).
Phase 26.0 `saveMode` arg is the 4th member of the lockedX/payload-shape-routing
family — see `wiki/concepts/treatment-status-and-doctor-save.md` for the Rule of 3
discussion (saveMode + lockedCustomer + lockedAppointmentType + lockedChannel).

### AV37 extension — Phase 26.2f-pre vitals-save (2026-05-13)

Phase 26.2f-pre extends AV37 with the vitals-save pathway (`saveMode === 'vitals'`),
the 5th member of the saveMode routing family:

- **Coercion** (`handleSubmit`): 3-way ternary — `(=== 'doctor') ? 'doctor' : (=== 'vitals') ? 'vitals' : 'staff'`.
  Both string-arg path and object-arg path (`eventOrSaveMode.saveMode === 'vitals'`)
  must be present.
- **v26StatusPatch vitals branch**: when `saveMode === 'vitals'` → stamps
  `status: 'vitalsigns-recorded'` + `recordedBy: auth.currentUser` + `recordedAt: serverTimestamp()`.
- **Dual gate**: every deduction/sale/stock/course callsite must carry
  `saveMode !== 'doctor' && saveMode !== 'vitals'`. No bare `!== 'doctor'` allowed
  without the vitals extension. Count of `!== 'doctor'` gates MUST equal count of
  dual-gate occurrences (V1.7 regression lock).
- **`canAddNewItems`**: declaration `const canAddNewItems =` must include all three
  conditions: `mode === 'create'`, `'doctor-recorded'`, `'vitalsigns-recorded'`.
- **UI button**: `data-testid="tfp-vitals-save-btn"` + `handleSubmit('vitals')` present
  in TFP JSX.
- **TreatmentReadOnlyPanel**: `data-testid` attribute containing `vitalsigns-recorded`
  for chip RTL queryability.
- **CustomerDetailView**: references `vitalsigns-recorded` status for badge/chip
  display.

3-stage treatment status machine: `undefined` (create) → `vitalsigns-recorded`
(vitals-save) → `doctor-recorded` (doctor-save) → cleared (admin regular save).

Source-grep regression: AV37.12–AV37.17 in `tests/audit-branch-scope.test.js`.
Full flow-simulate: `tests/phase-26-2f-pre-vitals-save-flow-simulate.test.js` (F11.1–F11.5).
Source-grep guards: `tests/phase-26-2f-pre-vitals-save-source-grep.test.js` (V1.1–V1.15).
RTL contract: `tests/phase-26-2f-pre-vitals-save-rtl.test.jsx` (V2.1–V2.3).

Sanctioned exceptions:
- `recordedAt: serverTimestamp()` appearing once covers both doctor and vitals branches
  (a single AV37.3 check for ≥1 occurrence remains valid; vitals branch may share
  the same pattern literal, satisfying the count-based lock).

### AV38 — TreatmentReadOnlyPanel read-only contract (V26.2, 2026-05-13)

**Pattern**: `src/components/backend/TreatmentReadOnlyPanel.jsx` is the canonical
read-only treatment view extracted from TreatmentTimelineModal in Phase 26.2.
Used by TFP split-screen right panel AND TimelineModal (Rule of 3 prep —
2 consumers post-Phase-26.2).

The panel MUST NOT contain any edit/delete primitives:
- NO `onEditTreatment` or `onDeleteTreatment` prop references (in code body —
  comments OK)
- NO `<input>` or `<textarea>` tags (any form input is forbidden)
- NO "บันทึก" inside `<button>` tags (no save buttons; the chip text
  "แพทย์ลงบันทึก" rendered in a `<span>` is permitted)

Permitted:
- Lightbox + setLightbox (image zoom is read interaction, not edit)
- File-open via existing `<img>` rendering / `<a href={dataUrl}>` patterns
- Browser-native select + copy (no special copy buttons needed)
- `<button>` for accordion toggle / close button / lightbox controls (UI-only)
- `<button>` rendering the "แพทย์ลงบันทึก" status chip via `<span>` (display only)

**Anchor**: `src/components/backend/TreatmentReadOnlyPanel.jsx`. Future panels
following this pattern (e.g., "ReadOnlySalePanel" for sale history comparison)
SHOULD mirror the contract — AV38 grep template is reusable.

**Class-of-bug**: V21 source-grep test lock-in family + read-only contract
violation. A future commit that adds an edit button to the panel directly
(instead of wrapping the panel with a modal-level edit button as TimelineModal
does in Phase 26.2c) would violate AV38 — caught at audit-grep.

**Sanctioned exceptions**: NONE.

**Source-grep regression**: `tests/audit-branch-scope.test.js` AV38.1-AV38.6 —
6 sub-tests locking each invariant (file exists + no edit/delete props +
no inputs + no save-button text + lightbox preserved).

**Companion**: AV37 (Phase 26.0 + 26.1 doctor-save invariants). AV38 is the
read-only contract for the historical view side; AV37 is the doctor-save
gate discipline for the editable side.

---

### AV39 — Phase 26.2f TreatmentReadOnlyMirror read-only contract (V26.2f, 2026-05-13)

**Pattern**: `src/components/backend/TreatmentReadOnlyMirror.jsx` is the
comprehensive treatment mirror extracted in Phase 26.2f — a full read-only
replica of the treatment form layout, used by the TFP split-screen left
panel to display the previously-saved treatment alongside the live edit form.

The mirror MUST remain read-only at all times:
- NO `onEditTreatment` prop reference in code body (comments OK) — the mirror
  has no edit callback; edit is triggered at the TFP level, not inside the mirror
- Every `<input>` tag MUST carry the `disabled` attribute (standalone or
  `disabled={true}`) — prevents browser interaction even if CSS is stripped
- Every `<textarea>` tag MUST carry the `disabled` attribute
- Every `<select>` tag MUST carry the `disabled` attribute
- NO "บันทึก" inside `<button>` direct text (no save buttons)
- `onChange` handlers, if any, MUST be no-op lambdas `() => {}`

Permitted:
- Internal `Lightbox` component for image zoom (read interaction, not edit)
- `mirror-img-zoom-*` testid on image zoom trigger buttons
- `<button>` for accordion toggle / close / lightbox controls (UI-only)
- Fully disabled form structure that visually mirrors TFP layout

**Anchor**: `src/components/backend/TreatmentReadOnlyMirror.jsx`. The mirror
uses standalone `disabled` attributes on its own line inside multi-line JSX
tags — the AV39 regex `/<input\b[^>]*>/g` (character class `[^>]*` matches
newlines) correctly captures multi-line tags.

**Class-of-bug**: V21 source-grep test lock-in family + read-only contract
violation. A future commit that adds an editable input to the mirror
(e.g. to make it a "live preview" instead of a static read-only view) would
violate AV39 — caught at audit-grep.

**Sanctioned exceptions**: NONE.

**Source-grep regression**: `tests/audit-branch-scope.test.js` AV39.1-AV39.8 —
8 sub-tests locking each invariant (file exists + no edit props + all inputs
disabled + all textareas disabled + all selects disabled + no save buttons +
onChange handlers are no-ops + internal Lightbox + mirror-img-zoom testid).

**Companion**: AV38 (TreatmentReadOnlyPanel condensed-view contract — no
inputs at all). AV39 is the full-mirror contract that allows disabled inputs
for structural fidelity; AV38 forbids inputs entirely for the minimal panel.
AV37 (Phase 26.0 + 26.1 doctor-save gates) covers the editable counterpart.

### AV40 — `patientData.ud_*` reads centralized via `patientHealthMapping.js` (Phase 26.2g-fillin, 2026-05-13)

**Class-of-bug**: V12 multi-reader-sweep family at TFP create-mode auto-fill
boundary. Pre-Phase 26.2g-fillin, `TreatmentFormPage.jsx:1018-1019` set
`bloodType` + `drugAllergy` from `patientData.*` while `congenitalDisease`
+ `treatmentHistory` were silently dropped despite the patient having
declared chronic + medication in PatientForm. User reported (verbatim):
"TFP create แล้วโรคประจำตัว + ประวัติยา ไม่ขึ้นทั้งที่ลูกค้ากรอกใน PatientForm".

**Pattern**: Direct reads of the following `patientData` keys are forbidden
in `src/components/**` AND `src/pages/**`:

KIOSK-shape fields (live on `opd_session.patientData`; consumed by `src/utils.js` OPD print):
- `patientData.ud_diabetes` / `patientData.ud_hypertension` /
  `patientData.ud_lung` / `patientData.ud_kidney` /
  `patientData.ud_heart` / `patientData.ud_blood` /
  `patientData.ud_other` / `patientData.ud_otherDetail`
- `patientData.hasUnderlying`
- `patientData.currentMedication`
- `patientData.pregnancy`
- `patientData.allergiesDetail`

CANONICAL-shape fields (live on `be_customers.patientData`; consumed by TFP via Phase 26.2g-fillin-bis):
- `patientData.congenitalDisease` (string — admin typed OR kiosk pre-derived)
- `patientData.drugAllergy` (string)
- `patientData.foodAllergy` (string)
- `patientData.beforeTreatment` (string)
- `patientData.pregnanted` (boolean)

Consumers MUST import + use canonical helpers from `src/lib/patientHealthMapping.js`:

For `src/utils.js` OPD print (kiosk-shape consumer — Phase 26.2g-fillin-followup):
- `derivePatientCongenitalDisease(patientData)` → comma-joined Thai labels
- `derivePatientCongenitalDiseaseEnglish(patientData)` → English variant
- `derivePatientTreatmentHistory(patientData)` → pregnancy + medication compose

For TFP create-mode auto-fill (canonical consumer — Phase 26.2g-fillin-bis 2026-05-13):
- `resolvePatientCongenitalDisease(patientData)` → canonical congenitalDisease string
- `resolvePatientDrugAllergy(patientData)` → compose drugAllergy + foodAllergy
- `resolvePatientTreatmentHistory(patientData)` → compose beforeTreatment + pregnanted

Phase 26.2g-fillin (2026-05-13) originally pointed `derivePatient*` at TFP — V21
architectural-error no-op because kiosk-shape fields don't exist on
`be_customers.patientData`. Phase 26.2g-fillin-bis (2026-05-13) corrects with
canonical resolvers.

NOTE: `patientData.bloodType` is NOT in the forbidden list — legitimate canonical
read at `TreatmentFormPage.jsx:1018` + AdminDashboard chips. Identity field,
doesn't need resolver wrapping.

**Anchor regex** (extended Phase 26.2g-fillin-bis 2026-05-13):
`/patientData\.(?:ud_|hasUnderlying|currentMedication|pregnancy|allergiesDetail|congenitalDisease|drugAllergy|foodAllergy|beforeTreatment|pregnanted)/`

**Sanctioned exceptions** (closed list — adding a 3rd file fails the lock test):
- `src/pages/PatientForm.jsx` — writer of these fields (kiosk + admin manual)
- `src/pages/AdminDashboard.jsx` — display chips at lines ~4504-4533
  (`d.ud_*` JSX literals + `d.pregnancy` chip-color logic); pure display,
  not transform
- ~~`src/utils.js`~~ — **REFACTORED Phase 26.2g-fillin-followup (2026-05-13)**.
  Thai + English PMH builders now consume `derivePatientCongenitalDisease`
  + `derivePatientCongenitalDiseaseEnglish` helpers. Output BYTE-IDENTICAL
  for OPD print recipients (formal-clinical EN labels preserved). V12
  multi-reader-sweep class fully closed for `patientData.ud_*` project-wide.
  Future direct `ud_*` reads in `src/utils.js` are forbidden — would fail
  G3.2 anti-regression grep in `tests/phase-26-2g-fillin-followup-source-grep.test.js`.

**Source-grep regression**: `tests/phase-26-2g-fillin-source-grep.test.js`
G2.1 walks `src/components` + `src/pages` and asserts the offender list
is empty (modulo sanctioned set). G1.1-G1.3 also lock TFP wiring (imports
+ call-sites inside the create-mode block + `!isEdit` gate).

**Class-of-bug**: V12 multi-reader-sweep at SINGLE-BLOCK boundary — when
an auto-fill block sets N derived fields and N-2 land, the missing 2 are
the silent bug. Same family as V52 (BS-11 report tabs reportsLoaders),
V36 (multi-call-site), V44 (canonical-mapper bypass). The architectural
fix is centralizing the derivation in `src/lib/patientHealthMapping.js`
so future patient-health additions land in the lib + are auto-discoverable
by consumers.

**Companion**: AV20 (Staff/Doctor hide-from-lists lookup-map sanctioned
exception pattern). AV40 mirrors AV20's "writer + display-chip sanctioned
exception list" pattern at the patientData read boundary.

---

### AV42 — Treatment display resolver discipline (Phase 27.0, 2026-05-14)

Treatment doctor/assistant/branch display names MUST live-resolve via
`src/lib/treatmentDisplayResolvers.js` helpers. Direct fallback chains that
leak raw doc IDs into the UI when the denormalized cache is stale are
**forbidden** outside the sanctioned set.

**Forbidden patterns** (outside sanctioned set):
- `detail.doctorId || '<string-literal>'` — leaks raw doctorId as display text
- `|| doctorId ||` — raw ID in a display fallback chain
- `a.name || a.id` — assistant raw ID as display fallback

**Grep anchors**:
```
grep -rn "detail\.doctorId\s*||\s*['\"]" src/
grep -rn "a\.name\s*||\s*a\.id" src/
```

**Sanctioned set** (closed list — add only via Rule P class-of-bug expansion):
1. `src/lib/treatmentDisplayResolvers.js` — the resolver module itself
2. `src/components/backend/TreatmentReadOnlyMirror.jsx` — read-only display consumer
3. `src/components/backend/TreatmentReadOnlyPanel.jsx` — read-only display consumer
4. `src/components/backend/EditAttributionModal.jsx` — attribution edit modal
5. `src/components/TreatmentFormPage.jsx` — treatment form create/edit
6. `src/lib/clinicReportAggregator.js` — **sanctioned exception**: uses
   `detail.doctorId || ''` as an internal key for building a `saleToDoctor`
   Map (ID extraction for report keying, never displayed raw to users).
   Annotate with `// audit-anti-vibe-code: AV42 sanctioned — ID key extraction, not display`.

**Resolver fallback chain** (correct pattern):
```js
// LIVE map (from listDoctors({includeHidden:true})) → cached name (save-time
// denormalized snapshot) → '' (caller renders '—' or placeholder).
// NEVER returns a raw doc ID.
resolveDoctorDisplayName(detail.doctorId, doctorMap, detail.doctorName)
resolveBranchDisplayName(detail.branchId, branchMap, detail.branchName)
resolveAssistantsDisplay(detail.assistants, doctorMap, staffMap)
```

**Anti-pattern (forbidden)**:
```js
// ❌ BAD — leaks raw doctorId when cache is stale
const doctorDisplay = detail.doctorName || detail.doctorId || '—';
// ❌ BAD — a.id leaks raw staff ID when a.name is empty
assistants.map(a => a.name || a.id).join(', ')
```

**Mirror**: Rule O (V46/AV24) applies at the stock-movement WRITE layer;
AV42 applies at the treatment-attribution READ/DISPLAY layer. Both enforce
live-resolve over frozen denormalized caches.

**Regression test**: `tests/phase-27-0-av42-source-grep.test.js` (AV42.1–AV42.4)
**Flow-simulate**: `tests/phase-27-0-treatment-branch-flow-simulate.test.js` (FB1–FB5)

### AV43 — Destructive selective-scope ops MUST go through bucket schema + assertNotT1 + hash verify (Selective-Make-Fresh, 2026-05-14)

**Trigger**: Any destructive endpoint that accepts user-selectable scope (currently `/api/admin/branch-make-fresh`) AND any UI that calls it (currently `MakeFreshModal.jsx`).

**Pattern**: V40's atomic-tier-wipe replaced by selective bucket-level wipe. The UI must NOT send raw collection/tier names; it MUST send `bucketIds: string[]` resolved server-side via `resolveBucketScope`. The server MUST `assertNotT1(resolved.collections)` to defense-in-depth-reject T1 (master) even if UI sends malformed input. The server MUST verify `computeBodyHash(backup.collections) === backup.meta.bodyHash` BEFORE any wipe; mismatch aborts with `BACKUP_INTEGRITY_FAIL`.

**Why architectural**: AV19 (V40, 2026-05-07) already required auto-backup-ref. AV43 extends with cryptographic integrity (hash verification) for round-trip safety. Per user directive 2026-05-14: "ระบบ backup ต้องเทสให้แน่ใจที่สุดว่า Backup ออกมาแล้ว สามารถ restore เข้าไปได้แล้วเหมือนเดิม เป็นเรื่องที่ serious มาก".

**Grep targets**:
- `api/admin/branch-make-fresh.js` MUST contain `assertNotT1(` + `computeBodyHash(` + `BACKUP_INTEGRITY_FAIL`
- The string index of `BACKUP_INTEGRITY_FAIL` MUST be LESS THAN the string index of the first `batch.delete(` (hash check happens BEFORE any delete)
- `api/admin/branch-backup-export.js` MUST contain `assertNotT1(` when bucket mode active
- UI files (`MakeFreshModal.jsx`) MUST send `bucketIds:` (not `tiers:` or `collections:`) in API request bodies
- UI MUST import `BUCKETS` from `src/lib/branchBackupBuckets.js` (single source of truth)
- `branchBackupBuckets.BUCKETS.customerActivity.defaultChecked` MUST be `false` (Q4-B opt-in lock — customer-visible state requires explicit admin opt-in)

**Sanctioned exceptions**: NONE. Every selective-destructive endpoint must follow the pattern.

**Companion AV**: AV19 (V40 auto-backup precondition — base layer); AV43 extends with integrity verification.

**Source-grep regression** (`tests/branch-make-fresh-selective-source-grep.test.js`):
```js
// SG2.4 — hash compare BEFORE batch.delete (CRITICAL ordering)
const hashIdx = makeFreshCode.indexOf('BACKUP_INTEGRITY_FAIL');
const wipeIdx = makeFreshCode.indexOf('batch.delete');
expect(hashIdx).toBeLessThan(wipeIdx);

// SG3.2 — customerActivity defaultChecked is FALSE (Q4-B opt-in)
const match = code.match(/customerActivity:\s*Object\.freeze\(\{[\s\S]*?defaultChecked:\s*(true|false)/);
expect(match[1]).toBe('false');
```

**Origin**: Brainstorming Q1-Q6 (2026-05-14) + spec `docs/superpowers/specs/2026-05-14-selective-make-fresh-and-backup-integrity-design.md`. Verified via Rule Q L2: `scripts/e2e-backup-restore-roundtrip-real-prod.mjs --apply` on real prod, 10/10 scenarios PASS with hash byte-equal at every phase boundary.

**Lesson**: When V40 introduced "destructive op needs auto-backup" (AV19), the contract assumed the backup file was internally consistent. Real-world Storage uploads can bit-flip, schema can drift, file can be tampered. Hash verification at the read-side (recompute + compare with file.meta.bodyHash) closes the integrity gap. The 10-scenario round-trip e2e proved the contract holds across adversarial inputs (Thai/Unicode/Timestamps/refs/large/nested/non-finite/empty).

### AV44 — Central-stock destructive ops MUST go through bucket schema + assertWarehouseMasterProtected + hash verify (Central-Stock Make-Fresh, 2026-05-15)

**Trigger**: Any destructive endpoint accepting warehouseIds + bucketIds (currently `/api/admin/central-stock-make-fresh`) AND UI calling it (`CentralMakeFreshModal`).

**Pattern**: UI MUST send `warehouseIds[]` (OR `allWarehouses:true`) + `bucketIds[]` — NOT raw collection names. Server MUST `resolveCentralBucketScope` + `assertWarehouseMasterProtected` (defense-in-depth) BEFORE any wipe. Server MUST `computeBodyHash` + verify against `file.meta.bodyHash` BEFORE `batch.delete`. Hash mismatch aborts with `BACKUP_INTEGRITY_FAIL`. `be_central_stock_warehouses` (warehouse master) is PERMANENTLY exempt — never in any bucket.

**Why architectural**: Mirror of AV43 for branch make-fresh. Same architectural backstop applied to warehouse scope. Combined with V40 AV19 (auto-backup precondition) the contract guarantees byte-equal round-trip integrity.

**Grep targets**:
- `api/admin/central-stock-make-fresh.js` MUST contain `assertWarehouseMasterProtected(` + `computeBodyHash(` + `BACKUP_INTEGRITY_FAIL` + `SCOPE_MISMATCH` + `WAREHOUSE_MISMATCH`
- The string index of `error: 'BACKUP_INTEGRITY_FAIL'` (return statement) MUST be LESS THAN the string index of the first `batch.delete(` call (hash check happens BEFORE any delete)
- `api/admin/central-stock-backup-export.js` MUST contain `assertWarehouseMasterProtected(` + emit `file.meta.scopeKind = 'central'` + `file.meta.warehouseIds`
- UI files (`CentralMakeFreshModal.jsx`) MUST send `warehouseIds:` or `allWarehouses:` (not `collections:`) in API request bodies
- UI MUST import `CENTRAL_BUCKETS` from `src/lib/centralStockBuckets.js` (single source of truth)
- `centralStockBuckets.CENTRAL_BUCKETS.<bucket>.defaultChecked` MUST all be `true` (no opt-in-only in central — distinct from branch Bucket 7 customerActivity)
- No bucket in CENTRAL_BUCKETS may include `be_central_stock_warehouses` (verified via CSG3 source-grep)

**Sanctioned exceptions**: NONE. Every selective-destructive central-stock endpoint must follow the pattern.

**Companion AV**: AV19 (V40 auto-backup precondition — base layer); AV43 (branch make-fresh hash verify); AV44 extends to central scope.

**Source-grep regression** (`tests/central-stock-make-fresh-source-grep.test.js`):
```js
// CSG2.4 — hash compare BEFORE batch.delete (CRITICAL ordering)
const hashErrIdx = makeFreshCode.indexOf("error: 'BACKUP_INTEGRITY_FAIL'");
const wipeIdx = makeFreshCode.indexOf('batch.delete(');
expect(hashErrIdx).toBeLessThan(wipeIdx);

// CSG3.2 — all 4 central buckets defaultChecked=true
const matches = [...code.matchAll(/defaultChecked:\s*(true|false)/g)];
expect(matches.length).toBe(4);
for (const m of matches) expect(m[1]).toBe('true');
```

**Origin**: Brainstorming Q1-Q3 (2026-05-15) + spec `docs/superpowers/specs/2026-05-15-central-stock-make-fresh-and-integrity-design.md`. Verified via Rule Q L2: `scripts/e2e-central-stock-roundtrip-real-prod.mjs --apply` on real prod, 5/5 scenarios PASS with hash byte-equal + warehouse master intact across all scenarios.

**Lesson**: V40 introduced "destructive op needs auto-backup" (AV19). AV43 added cryptographic integrity for branch scope. AV44 closes the central stock surface with the same architectural backstop. The 5-scenario round-trip e2e proved the contract holds across adversarial inputs (Thai/Unicode/Timestamps/cross-warehouse refs/large/nested/counter doc preservation).

**AV44 extension (2026-05-15 V66 incident) — filter field verification mandate**:

After initial AV44 shipped, user reported "กดคลังใหม่ไปแล้ว... แม่งข้อมูลอยู่ครบเลย" — clicked Make-Fresh but ALL data still there. Root cause: `CENTRAL_BUCKETS` invented filterField names (`warehouseId`, `locationId`, `destLocationId`) that DID NOT exist in production write-side code. Test e2e seeded with same invented names + filter used same invented names → 5/5 PASS but real prod filter matched 0 docs.

**THE V66 ANTI-PATTERN EXACTLY**: tests using self-consistent fake names pass while production reality differs.

**Extension rule**: Every `filterField` + `orFilterField` in any selective-make-fresh bucket schema (CENTRAL_BUCKETS, future bucket schemas) MUST be grep-verified against the actual write-side code BEFORE shipping. Static regression test `tests/central-stock-buckets-filter-field-prod-verification.test.js` enforces this contract — if a NEW bucket uses a NEW filterField, the test fails unless that field name appears as a `<field>:` setDoc value OR a `where('<field>', ...)` query in the codebase.

**Verified field names (2026-05-15 V66 fix, via `scripts/diag-central-stock-prod-field-names.mjs` + grep of `backendClient.js`)**:
- `be_central_stock_orders.centralWarehouseId` (was wrongly `warehouseId`)
- `be_stock_batches.branchId` (was wrongly `locationId`)
- `be_stock_movements.branchId` (was wrongly `locationId`)
- `be_stock_transfers.sourceLocationId` + `destinationLocationId` (was wrongly `destLocationId`)
- `be_stock_withdrawals.sourceLocationId` + `destinationLocationId`
- `be_stock_adjustments.branchId` (was wrongly `locationId`)
- REMOVED `be_central_stock_movements` from any bucket (empty in prod — stale from `branchBackupCore.UNIVERSAL`)

**Forbidden invented field names** (regression locked):
- `destLocationId` (use `destinationLocationId`)
- `warehouseId` for `be_central_stock_orders` (use `centralWarehouseId`)
- `locationId` for `be_stock_movements`/`be_stock_adjustments`/`be_stock_batches` filter (use `branchId` for filter — locationId exists in subset of docs but is NOT universal)

**Class-of-bug regression test**: `tests/central-stock-buckets-filter-field-prod-verification.test.js` — V66.1 through V66.7 lock all field name corrections + anti-regression on invented names. Future bucket schema additions MUST extend this test.

**Companion lesson**: Rule Q V66 — mock/synthetic tests can hide reality mismatch when seed + filter use the same (wrong) names. Always grep prod write-side code + run `diag-*` script (Rule R) before claiming any selective-scope feature is "verified".

### AV45 — LINE OA per-branch credential + linkage discipline (LINE Reminder Phase, 2026-05-15)

**Trigger**: Any code in the LINE OA reminder/webhook/customer-linkage path — push messaging, webhook signature verification, customer LINE-userId lookup, appointment-modal LINE-status surfacing, audit-log writes.

**Class**: Per-branch LINE OA infrastructure must be uniformly applied across:
  - **LR-1**: every `fetch('https://api.line.me/v2/bot/message/push')` uses `cfg.channelAccessToken` from `getLineConfigForBranch(db, branchId)` — NEVER a global env token, NEVER hardcoded
  - **LR-2**: webhook signature + reply uses config from `resolveLineConfigForWebhook(db, event)` — destination-routed per LINE event, not single-tenant
  - **LR-3**: customer LINE lookup goes through `getCustomerLineUserIdAtBranch(customer, branchId)` helper — branch-scoped, never raw `customer.lineUserId` direct read in new code
  - **LR-4**: appointment-creating modals (AppointmentFormModal + DepositPanel + AppointmentCalendarView + AdminDashboard + TreatmentFormPage) show 🟢/⚪️ LINE status via `CustomerOption` + per-modal LINE-notify confirmation card via `LineNotifyConfirmation`
  - **LR-5**: `be_line_reminder_log` + `be_line_reminder_postback_log` audit docs MUST carry `branchId` field for per-branch audit reads

**Sanctioned exceptions**:
  - Top-of-`line.js` signature fallback (Phase BS V3 transition, documented at file head) — webhook envelope before per-event resolution
  - V32-tris-ter legacy `customer.lineUserId` writes (backward-compat retained during transition; do NOT extend to new write paths)
  - CustomerDetailView display of legacy linkage explicitly labelled "(legacy V32-tris-ter linkage)" — display-only, no behaviour relies on it

**Why architectural**: The LINE OA reminder system is multi-branch — each clinic branch may have its own LINE Official Account (separate channel secret + token + destination ID). A single global token would either (a) route all branches through one OA (defeats per-branch identity) or (b) silently drop messages when admin switches branches. Per-branch resolution + per-branch customer lookup + per-branch audit log is the contract that makes the whole system work. Drift at ANY layer (push call uses wrong token, webhook resolves wrong branch, customer lookup hits wrong key, audit log misses branchId) causes silent data corruption that takes weeks to detect — same V66 trust-collapse class.

**Grep targets**:
  - `api/cron/line-reminder-fire.js` MUST contain `channelAccessToken: branchCfg.channelAccessToken` AND MUST NOT contain `process.env.LINE_CHANNEL_TOKEN`
  - `api/cron/line-reminder-retry.js` MUST contain `getLineConfigForBranch` + `channelAccessToken: (branchCfg|cfg)\.channelAccessToken`
  - `api/admin/line-reminder-debug-fire.js` MUST contain `getLineConfigForBranch` + `getCustomerLineUserIdAtBranch`
  - `api/webhook/line.js` MUST contain `resolveLineConfigForWebhook`
  - `api/cron/line-reminder-fire.js` + `api/cron/line-reminder-retry.js` + `api/admin/line-reminder-debug-fire.js` MUST contain `getCustomerLineUserIdAtBranch`
  - `api/admin/link-requests.js` MUST contain `lineUserId_byBranch` (per-branch write on admin approve)
  - All 5 appointment-modal sites MUST import `LineNotifyConfirmation` + `CustomerOption`
  - `src/lib/lineReminderClient.js` `buildReminderLogDoc` MUST include `branchId,` field
  - `api/webhook/line.js` postback log write MUST include `branchId` in the same setDoc payload

**Source-grep regression test**: `tests/line-reminder-class-of-bug-per-branch-audit.test.js` — LR1-LR5 audit groups + AV45 marker assertion.

**Origin**: LINE OA Appointment Reminder Phase (2026-05-15), spec `docs/superpowers/specs/2026-05-15-line-oa-appointment-reminder.md` §18 class-of-bug invariants. Wave 1-3 implementation tasks shipped per-branch infrastructure; Task 14 locks the regression discipline.

**Lesson**: Per-tenant credentials are a recurring V12 multi-reader-sweep family — when a feature adds branch-scoped resources (LINE OA, payment gateways, SMS providers), every consumer of the credential / lookup / audit-write must be migrated uniformly. AV45 source-grep at 5 distinct boundaries (push fetch / webhook resolve / customer lookup / modal UI / audit log) catches drift at the natural seams. Same pattern as AV29 (per-branch settings 17-consumer sweep) and BS-11/BS-12 (report-tab + time-axis branch-scope audits).

### AV46 — Pipeline Firestore field name MUST match real schema (V67 mock-shadow drift, 2026-05-15)

**Trigger**: Any new server-side / cron / endpoint code that issues Firestore queries (`where('<field>', '==', ...)`) OR reads denormalized fields from documents (`doc.X`) for `be_appointments` / `be_branches` / `be_customers` collections.

**Class**: Mock-shadow field-name drift (V66 family). Mock fixtures invent a field name that doesn't exist in real prod; production code reads the invented name; queries return 0 / reads return undefined; pipeline silently no-ops; tests pass against mocks. Surfaces as user complaints "ยิงไม่ได้ซักอัน" / "ไม่มีข้อมูล" with all-zeros telemetry.

**Canonical schema (source of truth — `backendClient.js` writers)**:
  - `be_appointments`: field is `date` (NOT `appointmentDate`). Writer at `src/lib/backendClient.js:2077,2107` writes `date: targetDate`. Real prod sample shows `appointmentDate=undefined` on every doc.
  - `be_branches`: field is `name` (NOT `branchName`). All 3 branch docs in real prod have `name`, `nameEn`; `branchName` does not exist as a stored field.
  - `be_customers`: real customer doc.id may differ from displayed HN — e.g. doc.id=`2853` (legacy ProClinic ID) with `customerHN="000004"` (HN code). UI single-mode pickers MUST accept either.
  - `be_customers` name fields: real schema is `firstname` + `lastname` (snake-case from ProClinic legacy). Phase BS clones add `patientData.firstNameTh`. NO top-level `fullName` or `name` field. Appointments denormalize to `customerName` field — prefer that as primary fallback.
  - `be_doctors`: appointments denormalize `doctorName` — prefer `appt.doctorName` as primary fallback over fetching doctor doc.

**Sanctioned exceptions**:
  - Backward-compat fallback chain (e.g. `appt.date || appt.appointmentDate || ''`) — explicit OR-chain that prefers canonical field but tolerates legacy shape. Mirrors `lineBotResponder.js:407-421` defensive pattern (V32-tris-ter era).
  - Form-state field names in UI components (e.g. `AdminDashboard.jsx` deposit form has `appointmentDate` form-state key — gets transformed to `date` at write-time via `confirmCreateAppointment`). NOT a Firestore query field; allowed.
  - Test fixtures explicitly testing backward-compat: must carry `// AV46 backward-compat test fixture — do not migrate to canonical-only` marker comment.

**Why architectural**: Field-name drift is invisible to mock-based tests by definition (the mock data uses the same invented name as the production code that reads it). The ONLY catch is real-prod schema verification (Rule R diag scripts) or real-client-SDK queries (Rule Q L2). Wave 1 LINE-reminder shipped 152 mock tests + 16 audit GREEN with this exact bug — entire pipeline returned 0/0/0 against real prod despite all "tests pass" signals. V66 origin was Phase 29 with the same failure mode at the index/query boundary.

**Grep targets** (pipeline must read canonical name OR via `||` fallback chain):
  - `api/cron/line-reminder-fire.js` MUST contain `where\(['"]date['"]\s*,\s*'=='` AND MUST NOT contain `where\(['"]appointmentDate['"]\s*,\s*'=='` (canonical field at query layer).
  - `api/admin/line-reminder-debug-fire.js` MUST contain `where\(['"]date['"]\s*,\s*'=='` AND MUST NOT contain `where\(['"]appointmentDate['"]\s*,\s*'=='`.
  - `src/lib/lineReminderTemplate.js` `resolveTokens` MUST read `appt\.date\s*\|\|\s*appt\.appointmentDate` (canonical-first OR-fallback).
  - `api/admin/line-reminder-debug-fire.js` validateDebugFireRequest MUST read `branch\.name\s*\|\|\s*branch\.branchName` (canonical-first OR-fallback).
  - `api/admin/line-reminder-debug-fire.js` single-mode picker MUST emit 2 queries OR-merging `customerId` + `customerHN` (Bug B fix).
  - `src/lib/lineReminderTemplate.js` `resolveTokens` `customerName` MUST chain `cust.fullName || cust.name || appt.customerName || \`\${cust.firstname || ''} \${cust.lastname || ''}\``.
  - All pipeline test fixtures (`tests/line-reminder-pipeline-*.test.js`, `tests/lineReminderTemplate.test.js`, `scripts/e2e-line-reminder-real-prod.mjs`) MUST primarily use `date:` (canonical); legacy `appointmentDate:` only behind explicit `// AV46 backward-compat` marker.

**Source-grep regression test**: `tests/v67-line-reminder-canonical-schema-audit.test.js` — V67.A1-A8 audit groups locking each grep target.

**Companion**: V67 V-entry in `.claude/rules/v-log-archive.md`. Also see Rule R (env-pull standing auth for diag scripts that verify pipeline ⊆ real-schema).

**Origin**: V67 (2026-05-15) — user report "ยิงไม่ได้ซักอัน นัดผมก็สร้างถูกแล้วนะ" with screenshots showing Sent/Skipped/Failed all 0 in Debug Fire UI (dry-run + single + all modes). Rule R diag against real prod revealed: tomorrow's appointment EXISTS correctly but pipeline queries `where('appointmentDate', '==', target)` against real schema where field is `date`. 152 LINE tests + 16 AV45 GREEN locked the WRONG field name as canonical. EXACT V66 replay one day after Rule Q infrastructure shipped — proving the meta-lesson: even with 7-layer enforcement, mock-only tests STILL slip if no real-prod schema match check is added at PR boundary. AV46 grep + Rule R diag close the gap.

**Lesson**: Mock fixtures should DERIVE from real-prod sample schemas, not be hand-written from spec. Better: add a Rule R "schema-match" diag script (one-shot read + pretty-print of every collection's field set) → reference it in PR template → developer compares mock fixture against current diag output before merge. AV46 grep is the ongoing enforcement; the diag script is the upstream prevention.

### AV47 — Appointment-row LINE badge MUST go through `<AppointmentLineBadge>` shared component (V68 Rule of 3 lock, 2026-05-15)

**Trigger**: Any new code rendering an appointment row in admin surfaces (backend appt grid + hub + customer-detail appts tab + frontend queue calendar).

**Class**: V67-class continuation — Rule of 3 enforcement at the appt-row badge layer. Inline-pasted `🟢 LINE` chips create drift risk: each callsite could diverge in color / label / behavior over time. Single shared component import = greppable + style-change = 1 file edit.

**Sanctioned files** (closed list — adding a 5th surface MUST extend this list):
  - `src/components/AppointmentLineBadge.jsx` (the component itself)
  - `src/components/CustomerOption.jsx` (CustomerLineBadge sibling export — same chip rendered for picker callsites)
  - `src/components/backend/AppointmentCalendarView.jsx` (backend canonical grid)
  - `src/components/admin/AppointmentHubView.jsx` (admin appt hub)
  - `src/components/backend/CustomerDetailView.jsx` (per-customer appts tab)
  - `src/pages/AdminDashboard.jsx` (frontend queue calendar; AV47-sanctioned skip annotation at the 8px schedule-day-preferences slot grid which is too tight for the chip)
  - `src/components/backend/CustomerCard.jsx` (consumes `<CustomerLineBadge>` from CustomerOption — different component, different surface, same visual chip)

**Why architectural**: After V67 mock-shadow drift saga, the canonical pattern is "ONE shared component per badge concern, defensive `||` fallback chains, source-grep regression locks". V68 closes the appt-row badge layer. Future per-tab status badges (e.g. recall pill, no-show flag) follow the same architecture.

**Grep targets**:
  - Each of the 4 admin appt-list surfaces MUST contain `import.*AppointmentLineBadge` AND `<AppointmentLineBadge`
  - NO file outside the sanctioned list contains literal `🟢 LINE` JSX text (comments are fine — strip-comments-then-grep). Inline JSX `<span>🟢 LINE</span>` in non-sanctioned files = drift = audit fail.
  - `AppointmentLineBadge.jsx` MUST contain `notifyChannel.*\.includes\(['"]line['"]\)` AND `appt.lineNotify === true` defensive fallback (V67 mock-shadow lesson)
  - `CustomerOption.jsx` MUST export `CustomerLineBadge` as named export
  - `CustomerCard.jsx` MUST import `CustomerLineBadge` from `CustomerOption.jsx` AND use `useSelectedBranch()` for `contextBranchId`
  - `AppointmentFormModal.jsx` + `appointmentDepositBatch.js` MUST NOT contain any `lineNotify:` payload key or `formData.lineNotify` reference (V68 strip; V32-tris-ter legacy field gone)

**Source-grep regression test**: `tests/v68-line-badge-surfacing-audit.test.js` — V68 A1-F2 audit groups locking each grep target.

**Origin**: V68 (2026-05-15) — user requested LINE badge across 4 admin appt-list surfaces + duplicate checkbox cleanup + LINE badge on customer cards. Brainstormed via /brainstorming + visual companion (4 customer-card variants × dark+light themes); locked V5 Editorial + meta stacked vertically + 4-layer shadow depth. Single commit batch under V18 lock; no firestore/storage rules changes.

**Lesson**: V67 lesson generalizes — every shared UI status badge MUST be a single component with defensive fallback chain, source-grep locked at each consumer site. AV47 closes the appt-row badge surface; pattern replicates for any future cross-cutting status badge (recall / no-show / VIP / membership tier). Inline copy-paste of chip JSX = future drift = future user-visible inconsistency = future Rule Q L1 failure.

### AV48 — UI ↔ endpoint contract discipline for LINE reminder debug-fire (V69 V67-class mock-shadow drift, 2026-05-15)

**Trigger**: Any UI ↔ serverless endpoint pair where payload keys and response shape MUST agree (LINE reminder debug-fire UI ↔ `/api/admin/line-reminder-debug-fire`).

**Class**: V67 mock-shadow drift extended — Wave 1 LINE reminder shipped 3 contract drifts between `LineReminderDebugSection.jsx` UI and `api/admin/line-reminder-debug-fire.js` endpoint, none caught by mock tests because UI tests + endpoint tests each used self-consistent mock shapes that never met each other.

**Specific contracts locked**:
  - **Response counter path**: endpoint returns `{ ok, mode, totalAttempted, results: { sent, skipped, failed, details } }` for single|all modes AND `{ ok, mode, totalEligible, previews }` for dry-run. UI MUST read `result.results.sent` (NOT `result.sent`).
  - **All-mode payload key**: UI MUST send `confirmBranchName` (NOT `branchNameConfirm`). Endpoint destructures `confirmBranchName` at `line-reminder-debug-fire.js:70`.
  - **Customer name rendering**: `resolveTokens` in `lineReminderTemplate.js` MUST sanitize Thai title prefix (นาย/นาง/นางสาว/เด็กชาย/เด็กหญิง/ไม่ระบุ) via `stripCustomerNamePrefix` helper. Denormalized `appt.customerName` field can carry a title prefix; template already includes "คุณ" — combining produces duplicate ("คุณ นางสาว แพรพร").
  - **Regex alternation order for Thai title strip**: longest-first (`นางสาว|เด็กชาย|เด็กหญิง|ไม่ระบุ|นาย|นาง`) — putting `นาง` first leaves trailing `สาว` because regex alternation is greedy left-to-right.

**Sanctioned exceptions**: NONE. Both UI + endpoint code are project-internal; contract drift is always a bug.

**Why architectural**: V67 mock-shadow drift class continues to manifest at every contract boundary. Each integration point between UI and endpoint is a fresh opportunity for mock-test-consistent + reality-broken drift. AV48 codifies the discipline for THIS pair (LINE reminder debug-fire) and serves as a template for any future admin-only debug/management endpoint added to the project.

**Grep targets**:
  - `src/components/backend/LineReminderDebugSection.jsx` MUST contain `result.results` or `results.sent` somewhere in the response-handling block (NOT `result.sent` reading from root). Allowed: defensive `result.results || {}` pattern.
  - `src/components/backend/LineReminderDebugSection.jsx` MUST contain `payload.confirmBranchName` (NOT `payload.branchNameConfirm`).
  - `api/admin/line-reminder-debug-fire.js` MUST contain destructure `confirmBranchName` (matching UI sender).
  - `src/lib/lineReminderTemplate.js` MUST contain `stripCustomerNamePrefix` helper.
  - `src/lib/lineReminderTemplate.js` MUST contain `customerName: stripCustomerNamePrefix(...)` in resolveTokens (sanitized output, not raw fallback chain).

**Source-grep regression test**: `tests/v69-line-reminder-debug-contract-fixes.test.jsx` — A1-C1 audit groups locking each contract.

**Origin**: V69 (2026-05-15) — user reported 3 bugs post-V68 deploy: (A) "{{customerName}} ขึ้นนางสาว แพรพร พรแพร" — title prefix duplicates "คุณ" in template; (B) "ยิงเฉพาะลูกค้า ขึ้น 0 sent" — UI showed Sent: 0 even though LINE message arrived per history panel; (C) "ยิงทุกคนพรุ่งนี้/วันนี้ ขึ้น BRANCH_NAME_CONFIRM_MISMATCH" — typed exact branch name but rejected. Phase 1 root cause: A = no title strip in template; B = UI reads response shape `result.sent` but endpoint returns `result.results.sent`; C = UI sends payload key `branchNameConfirm` but endpoint destructures `confirmBranchName`.

**Lesson**: When introducing UI ↔ endpoint integration, write a SINGLE source-of-truth for the contract (e.g. shared TypeScript interface OR a fixture file both sides import). Mock tests on each side WILL match their own self-consistent shape. The integration test (real fetch in UI render OR e2e with running endpoint) is the only test that catches drift. AV48 source-grep locks the post-V69 shapes; future drift fails build at the grep boundary.

### AV49 — Inline LINE badge discipline in admin appt-list (V71, 2026-05-15)

**Trigger**: Any admin appointment-list / appointment-hub UI surface that renders `<AppointmentLineBadge>` (the AV47 shared component) — placement must stay inline next to the status chip, never wrapped in an absolute-positioned overlay div.

**Class**: V21 comment-vs-code drift family + visual-overlap regression. Pre-V71 `AppointmentHubView.jsx` wrapped the badge in `<div className="absolute top-2 right-2 z-10 pointer-events-none">` so the LINE chip floated over the card and visually overlapped the status chip ("ซ้อน" — user-reported). V71 moved the badge inline beside the status chip in `AppointmentHubRowCard.jsx`. AV49 prevents accidental drift back to the absolute-wrapper pattern in any admin appt-list surface.

**Specific contracts locked**:
  - No `<div className="… absolute …"><AppointmentLineBadge` pattern within 200 chars in `src/components/admin/AppointmentHubView.jsx`, `src/components/admin/AppointmentHubRowCard.jsx`, or `src/pages/AdminDashboard.jsx`.
  - Inline placement only — badge sits in the same flex row as the status chip, NOT in a corner overlay.

**Sanctioned exceptions**: NONE. Calendar micro-cells in `AdminDashboard.jsx` already render the badge inline; the AV47 sanctioned-skip for those is about chip omission, not absolute-wrapper placement.

**Why architectural**: The LINE-badge surface has 3+ consumers (AV47 Rule of 3 lock). Without AV49, any of those consumers could re-introduce an overlay wrapper at any time, recreating the V71 user-reported overlap. The grep is cheap; the recurrence cost is user-visible visual regression. Lock at source-grep boundary, not at code-review boundary.

**Grep targets**:
  - `src/components/admin/AppointmentHubView.jsx` MUST NOT match `<div[^>]*className=["'][^"']*\babsolute\b[^"']*["'][^>]*>[\s\S]{0,200}<AppointmentLineBadge`.
  - `src/components/admin/AppointmentHubRowCard.jsx` — same.
  - `src/pages/AdminDashboard.jsx` — same.

**Source-grep regression test**: `tests/v71-av49-line-badge-no-absolute.test.js` — AV49.1–AV49.3 audit groups locking each admin appt-list surface.

**Origin**: V71 (2026-05-15) — user reported the LINE chip "ซ้อน" (overlapping) with the status chip in the Frontend appointment list. Root cause: `AppointmentHubView.jsx` had a row-level `<div className="absolute top-2 right-2 …">` wrapping `<AppointmentLineBadge>`, which floated the badge over the card content regardless of card layout. V71 Tasks 5–6 removed the absolute wrapper and moved the badge inline next to the status chip via `AppointmentHubRowCard.jsx`. Task 8 (this AV49) locks the inline placement permanently.

**Lesson**: Floating overlays (`absolute top-2 right-2`) are a tempting "always visible regardless of card content" pattern, but they break visual coexistence with sibling chips that share the same corner. When a status badge co-occupies a region with other chips, inline placement (flex row, gap-1) is the correct default; absolute overlay is the exception that requires explicit justification AND a sanctioned-exception annotation. AV49 closes the admin appt-list surface; future cross-cutting status badges (no-show / VIP / membership tier) should follow the same inline-first contract.

### AV50 — setTreatmentFormMode customerId discipline (V71.A, 2026-05-15)

**Trigger**: Any JSX prop / handler that opens `<TreatmentFormPage>` via `setTreatmentFormMode({...})` payload — payload MUST include `customerId` because TFP's V35.2-sexies guard rejects null/undefined customerId with the "ไม่พบ customerId" placeholder.

**Class**: V12 multi-reader-sweep at single-call-site boundary + V21 partial-object-shape drift. Pre-V71.A `AdminDashboard.jsx:onEditTreatmentForAppt` dropped customerId in the payload (`setTreatmentFormMode({ mode:'edit', treatmentId: appt.linkedTreatmentId })`) — users hit the "ไม่พบ customerId" placeholder anytime they clicked "แก้ไขบันทึกการรักษา" from the appt-list row (any tab, especially V71's "เสร็จแล้ว" sub-pill). All other 5 callsites already passed customerId correctly; this was an isolated single-site bug that V71's mark-complete flow surfaced visibly.

**Specific contracts locked**:
  - Every `setTreatmentFormMode({mode:'edit',...})` call MUST include `customerId:` in the payload object.
  - Every `setTreatmentFormMode({mode:'create',...})` call MUST include `customerId:` too (symmetric — TFP guard applies in both modes).
  - The 6 known callsites:
    1. `BackendDashboard.jsx:onCreateTreatment` (viewingCustomer.id)
    2. `BackendDashboard.jsx:onEditTreatment` (viewingCustomer.id)
    3. `AdminDashboard.jsx:onOpenCreateForm` (OPD session cid)
    4. `AdminDashboard.jsx:onOpenEditForm` (OPD session cid)
    5. `AdminDashboard.jsx:onCreateTreatmentForAppt` (appt.customerId)
    6. `AdminDashboard.jsx:onEditTreatmentForAppt` (appt.customerId — V71.A fix)

**Sanctioned exceptions**: NONE. All 6 callsites must pass customerId; the source-grep test U4.2 asserts exactly 6 setTreatmentFormMode blocks exist project-wide and U4.1 asserts each one includes `customerId:`.

**Why architectural**: TFP's V35.2-sexies guard renders an error placeholder when customerId is falsy — this protects against `be_customers/null` writes (V35 lesson) but silently hides UI behind the placeholder if any caller forgets the field. Without AV50, future callsites can drop customerId again and break edit-treatment / create-treatment flows. The grep is cheap; the recurrence cost is user-visible broken edit UX (V71.A user report: "ไม่สามารถกด แก้ไขบันทึกการรักษา ได้").

**Grep targets**:
  - For every file matching `setTreatmentFormMode\s*\(\s*\{[\s\S]{0,1500}?\}\s*\)`, every block MUST contain `customerId\s*:`.
  - Total block count across all files MUST equal 6 (locks against adding a 7th callsite without including customerId).
  - The pre-V71.A short-shape pattern `setTreatmentFormMode\(\s*\{\s*mode:\s*['"]edit['"]\s*,\s*treatmentId:\s*appt\.linkedTreatmentId\s*\}\s*\)` MUST NOT appear (anti-regression).

**Source-grep regression test**: `tests/v71a-edit-fix-and-unmark.test.jsx` — U3.1-U3.3 (single-site bug fix) + U4.1-U4.2 (project-wide invariant + classifier).

**Origin**: V71.A (2026-05-15) — user reported post-V71 deploy: clicking "ลูกค้ารับบริการเรียบร้อย" → row moves to "เสร็จแล้ว" sub-pill → clicking "แก้ไขบันทึกการรักษา" → "ไม่พบ customerId / proClinicId ว่างเปล่า. ติดต่อดูแลระบบหรือ clone ลูกค้าให้สมบูรณ์ก่อน". Root cause: pre-existing bug at `AdminDashboard.jsx:6788-6790` — `onEditTreatmentForAppt` handler ONLY passed `mode` + `treatmentId` to `setTreatmentFormMode`, never `customerId`. TFP's V35.2-sexies guard short-circuited to placeholder. Pre-existing because the button appears for ANY appt-list row with `hasTreatmentForDay`; V71 just made it more visible by surfacing the "completed" sub-pill where admins click edit. Also the placeholder copy still referenced ProClinic post-V50 strip (stale "clone / proClinicId" language) — V71.A refreshed to mention customerId + generic remediation.

**Lesson**: When a destination component (TFP) requires field X for correctness, lock the requirement at the SOURCE callsite via grep, not at the destination. Destination guards are necessary (silent null-write prevention) but they're a fallback; the grep prevents the fallback from ever firing. Mirror of V52/AV44 "every loader callsite must pass branchId" pattern but at a smaller boundary (single setter, one component). When a setter accepts a partial object (no TypeScript), the source-grep invariant IS the type system.

## How to run

1. Run each grep pattern; classify hits.
2. For AV1/AV10 (duplication): use `Read` to diff the candidate duplicates — if bodies match ≥70 %, flag for extraction.
3. For AV6: open `firestore.rules` and `storage.rules` if present. Check match blocks against the "world-readable" contract.
4. For AV5: pick the latest 3 commits that wrote to `clinic_schedules` or `opd_sessions.patientLinkToken` — re-read the payload.
5. For AV7/AV8/AV12: `grep -rE "collection\(db.*'(\w+)'" src/` — list collection names, then check for the paired access patterns.

### AV52 — Customer backup file integrity contract (V74, 2026-05-16)

**Trigger**: Any new backup-export endpoint OR any modification of an existing backup file's body — `meta.bodyHash` MUST equal `computeBodyHash(file.collections + file.subcollections + file.chatConversations)` and `meta.storageManifestHash` MUST equal `computeStorageManifestHash(file.meta.storageManifest)`. Both hashes MUST exclude `meta.userNote` from input so admin can rename labels without breaking integrity (Q5b=Y label-edit). Every `storageManifest[].sha256` MUST match the actual object bytes at `backups/.../storage/{path}`.

**Sanctioned exception**: `meta.userNote` is the ONLY mutable meta field that must NOT affect hashes.

**Grep targets**:
  - Every `setDoc(.../backup.json)` and `bucket.file(backupRef).save(...)` block must precede with `buildCustomerBackupFile` or `buildBackupFile` (V40 variant) call — never hand-construct.
  - Source-grep regression: `tests/v74-customer-backup-adversarial.test.js` T8.1-T8.3 + T10.1-T10.3.

### AV53 — AV19 elevation for customer wipe (V74, 2026-05-16)

**Trigger**: `/api/admin/delete-customer-cascade` with `action: 'delete'` MUST integrity-verify `req.body.autoBackupRef` BEFORE any DELETE write when provided. 6-step verify: Storage file exists + JSON body parses + `validateCustomerBackupFile` passes + recomputed `bodyHash` matches + recomputed `storageManifestHash` matches + every per-Storage-object SHA-256 matches. ANY mismatch → 400 BACKUP_*_FAIL → BLOCK wipe. BACKWARD COMPAT preserved: without autoBackupRef, V74 extension still cascades 16 collections + 8 subcoll + Storage + chat but skips integrity gate.

**Sanctioned exception**: WITHOUT autoBackupRef, integrity gate skipped (Phase 24.0 backward compat — local-dev workflow).

**Grep targets**:
  - `delete-customer-cascade.js` must import `verifyAutoBackupIntegrity` + invoke when `autoBackupRef` is provided.
  - Source-grep regression: helper export + integration test in `tests/v74-customer-backup-adversarial.test.js` T7.1-T7.3 + T8.

### AV54 — Customer wipe MUST iterate all 8 T4_SUBCOLLECTIONS (V74, 2026-05-16)

**Trigger**: Any customer-wipe path MUST recursively delete every doc in all 8 customer-attached subcollections (treatments / sales / appointments / deposits / wallets / memberships / points / courseChanges). Pre-V74 Phase 24.0 cascade ONLY deleted top-level docs → subcollections became orphans → admin saw stale data in CustomerDetailView after re-creating a customer with same id.

**Sanctioned exception**: NONE. All 8 subcoll must be in the cascade list.

**Grep targets**:
  - `delete-customer-cascade.js` + `customer-delete-with-backup.mjs` must reference `T4_SUBCOLLECTIONS` from `customerBackupCore.js`.
  - Source-grep regression: `tests/v74-customer-backup-adversarial.test.js` T5.1 (all 8 present) + T7 (no AI tier in cascade).

### AV55 — Backup-manager delete MUST honor 72h AV19 grace (V74, 2026-05-16)

**Trigger**: `/api/admin/backup-manager-delete` + `/api/admin/backup-manager-bulk-delete` MUST query `be_admin_audit` for any doc in the last 72 hours where `autoBackupRef === backupRef` OR `v74BackupRef === backupRef` AND `type` in `['customer-delete-cascade', 'branch-make-fresh', 'central-stock-make-fresh']`. If found → BLOCK delete with `AV19_GRACE_PERIOD` error + show admin the audit ref + hours-remaining. Admin can force-override via `forceOverrideGrace: true` (logged in audit doc as `forceOverrideGrace: true`).

**Sanctioned exception**: `forceOverrideGrace: true` allows skipping (admin-acknowledged risk).

**Grep targets**:
  - Both endpoints contain `checkGracePeriod` function + query `be_admin_audit` with the 3 type filters + 72h time window.
  - Audit docs MUST record `forceOverrideGrace` flag.

### AV56 — Whole-fleet customer backup integrity (V75 Item 2, 2026-05-16)

**Trigger**: every whole-fleet backup invocation (CLI `--all-customers`
mode or future endpoint) MUST:
- emit `manifest.json` at `backups/whole-fleet-customers/{ts-rand}/manifest.json`
  with `manifestHash` computed via `computeWholeFleetManifestHash` helper;
- per-customer files written via the same V74 single-customer pipeline
  (`exportSingleCustomer` in `scripts/customer-backup-export.mjs`) so every
  entry has its own `bodyHash` + `storageManifestHash`;
- manifest seed INCLUDES every customer fileHash + storageManifestHash +
  failedCustomers list (tampering detection);
- manifest seed EXCLUDES `userNote` (Q5b=Y precedent from V74);
- per-customer failures isolated into `failedCustomers[]` — one failure
  does NOT abort the batch;
- audit doc emitted to `be_admin_audit/whole-fleet-backup-export-{ts}-{rand}`
  with manifestPath + manifestHash + counts + caller info.

**Why**: whole-fleet is the disaster-recovery + migration tool. Without
integrity contract, a tampered manifest can mislead admin into restoring
mismatched data. AV52 (single-customer integrity) + AV56 (whole-fleet
integrity) together guarantee end-to-end trust chain.

**Sanctioned exceptions**: NONE.

**Grep targets**:
  - `scripts/customer-backup-export.mjs` contains `exportWholeFleet`
    function + imports `buildWholeFleetManifest` +
    `computeWholeFleetManifestHash` from `wholeFleetBackupCore.js`.
  - `wholeFleetBackupCore.js` `computeWholeFleetManifestHash` seed does
    NOT reference `manifest.userNote`.

**Source-grep test**: `tests/v75-whole-fleet-backup-av56.test.js`
**Pure-helper test**: `tests/v75-whole-fleet-backup-core.test.js`
**Priority**: CRITICAL.

### AV58 — Chat noti mute scope (V75 Item 4, 2026-05-16)

**Trigger**: the `src/lib/chatNotificationMute.js` helper (isChatTabMuted /
setChatTabMuted / toggleChatTabMute) MAY ONLY be imported by
`src/components/ChatPanel.jsx`. Other sound-trigger sites — V73 staff-chat
widget at `src/components/staffchat/**`, appointment-due chimes, recall
pings, system alerts — MUST NOT import this helper. Cross-surface sound
gating is done via the SAFE wrapper `playChatNotificationSound` exported
from ChatPanel.jsx, which encapsulates the mute check.

**Why**: V12 multi-reader-sweep prevention — chat tab mute MUST NOT bleed
into other notification surfaces. Doctor's machine use case requires
appointments / recalls / staff-chat to KEEP ringing while chat goes silent.
Per user explicit V75 constraint: "ปิดแค่ของ tab chat ... noti อื่นยังดัง
เหมือนเดิม".

**Sanctioned exceptions**: NONE for direct chatNotificationMute import.
ChatPanel.jsx is the SOLE importer; callers consume the safe wrapper
`playChatNotificationSound` instead.

**Grep targets**:
  - `chatNotificationMute` import in src/: only ChatPanel.jsx
  - `playAlertSound()` direct calls outside ChatPanel.jsx for CHAT context:
    must migrate to `playChatNotificationSound()`

**Source-grep test**: `tests/v75-chat-noti-mute-scope-av58.test.js`
**Priority**: CRITICAL.

### AV57 — Chat webhook MUST stamp branchId + branchIdSource (V75 Item 3, 2026-05-16)

**Trigger**: every `chat_conversations` write in `api/webhook/line.js` + `api/webhook/facebook.js` MUST spread `branchId` + `branchIdSource` fields. branchId resolved via `resolveChatBranchIdFromLineEvent` / `resolveChatBranchIdFromFbEvent` helpers (lookup against `be_line_configs` / `be_fb_configs` reverse-key). Fallback path stamps `LOVER_DEFAULT_BRANCH_ID` env (typically นครราชสีมา) with `*-fallback-*` source label so admin can spot unrouted hits in audit.

**Why**: pre-V75 `chat_conversations` had no branch field — universe of chats was global. Phase BS V3 per-branch LINE OA + V75 per-branch FB Page require chat history to be branch-scoped at read time (BS-16 invariant). NEVER omit branchId — creates unfilterable orphan invisible to admin per-branch view.

**Sanctioned exceptions**: NONE.

**Grep targets**:
  - `api/webhook/{line,facebook}.js` chat_conversations writes contain `branchId: { stringValue: chatBranchId }` + `branchIdSource: { stringValue: chatBranchIdSource }` inline.
  - Resolver helpers `api/webhook/_lib/{lineChatBranchResolver,fbChatBranchResolver}.js` exist + are imported by their respective webhooks.
  - Fallback labels follow standardized format: `webhook-{line,fb}-fallback-{nakhonratchasima,legacy,empty}`.

**Source-grep test**: `tests/v75-chat-webhook-branchid-stamp-av57.test.js`
**Flow-simulator test**: `tests/v75-chat-webhook-branchid-stamp-flow.test.js`

### AV59 — chat_history MUST stamp + read branchId via BSA (V76, 2026-05-16 EOD+1)

**Trigger**: every `chat_history` write in `src/components/ChatPanel.jsx` (admin-resolve path) MUST spread `branchId` + `branchIdSource` fields. branchId resolved via fallback chain `conv.branchId || selectedBranchId || ''`; source attribution = `'inherited-from-conv'` (V75 chat_conversations webhook stamp present) OR `'resolved-by-admin-branch'` (admin's selectedBranchId at resolve time) OR `'unstamped'` (last resort — should never occur post-V76 backfill).

**Reader contract**: every `chat_history` reader in UI code MUST go through `listenToChatHistoryByBranch` from `src/lib/scopedDataLayer.js` (Layer 2 auto-inject). Raw `onSnapshot(query(collection(db, '.../chat_history')))` outside the sanctioned helpers is forbidden.

**Why**: V75 wired chat_conversations BSA (BS-17 + AV57) but completely missed the SIBLING `chat_history` reader + writer. Result: 3,281 legacy chat_history docs unstamped, ChatPanel history view leaked across branches (user-reported "เปลี่ยนสาขาแล้วเห็นเหมือนกันหมด"). Class-of-bug V12 multi-reader-sweep — V75 fixed live conversations only. AV59 prevents recurrence by enforcing BSA discipline at both write AND read boundaries.

**Sanctioned exceptions**:
- `src/lib/backendClient.js` — Layer 1 helper home (`listenToChatHistoryByBranch` definition)
- `src/lib/scopedDataLayer.js` — Layer 2 wrapper home
- `src/components/ChatPanel.jsx` — sanctioned consumer (V76-migrated)

**Grep targets**:
- `src/lib/backendClient.js` exports `listenToChatHistoryByBranch` with `where('branchId','==',X)` Firestore filter when branch-scoped + safe-by-default empty-onChange when no branchId.
- `src/lib/scopedDataLayer.js` exports wrapper that auto-injects `resolveSelectedBranchId()` when caller passes `{}`.
- `src/components/ChatPanel.jsx` history listener imports from scopedDataLayer (NOT raw onSnapshot) + handleResolve `historyData.branchId` + `historyData.branchIdSource`.

**Source-grep test**: `tests/v76-chat-history-branch-scope.test.js`
**Backfill script (Rule M)**: `scripts/v76-backfill-chat-history-branchid.mjs` stamps `branchId: นครราชสีมา` + `branchIdSource: 'backfill-v76-sole-active'` on legacy unstamped docs.
**Priority**: CRITICAL — user-visible cross-branch leak.

### AV60 — Every React hook used MUST be imported (V80 P0a, 2026-05-16 NIGHT+4)

**Trigger**: every React hook call site (`useState(`, `useEffect(`, `useMemo(`, `useCallback(`, `useRef(`, `useLayoutEffect(`, `useId(`, `useTransition(`, `useDeferredValue(`, `useSyncExternalStore(`, `useContext(`, `useReducer(`, `useImperativeHandle(`, `useDebugValue(`, `useInsertionEffect(`) in any `.jsx`/`.js`/`.tsx` file under `src/` or `api/` MUST be imported from `'react'` via the line-1 `import { ... } from 'react'` statement (or via `React.X` namespace if `import React from 'react'` form).

**Why**: V78 added `useMemo()` calls inside `useChatUnread` (ChatPanel.jsx) but did NOT add `useMemo` to the line-1 React import. Vite/Rolldown build PASSED (identifiers resolved at runtime, not build time). 70 V79 source-grep tests + 57 V78 source-grep tests all GREEN because they verified code SHAPE not runtime MOUNT. Production user opened admin page → React renders AdminDashboard → AdminDashboard imports + renders ChatPanel → `useChatUnread()` invoked → `useMemo()` reference → `ReferenceError: useMemo is not defined` → React unmounts entire tree → **whole frontend black screen**.

**Class-of-bug**: V11 (mock-shadowed export) family at the React-hook-import boundary. Same family also as V21 (source-grep tests can lock broken code shape). Combination of build-doesn't-static-check-identifiers + tests-don't-mount-runtime is the gap.

**Sanctioned exceptions**: NONE. Every hook call must be paired with its import — no whitelisting.

**Grep target**: `scripts/diag-react-hook-import-drift.mjs` scans both `src/` and `api/` for any drift. Output `0` means clean; non-zero = build-failing class-of-bug.

**Source-grep test**: `tests/v80-chat-fall-through-nakhon-gated.test.js` group D verifies ChatPanel.jsx imports `useMemo` from react + the diag script file exists.

**Priority**: CRITICAL — runtime crash takes down entire React tree.

### AV61 — Chat fall-through filters MUST be NAKHON-gated (V80 P0b, 2026-05-16 NIGHT+4)

**Trigger**: every fall-through filter for missing-branchId chat docs (`chat_conversations` + `chat_history`) in `src/components/ChatPanel.jsx` (3 sites: chat_conversations setConversations effect + chat_history listenToChatHistoryByBranch callback + useChatUnread.branchScopedConvs) MUST gate the `!item.branchId` continuity path via `isLegacyNakhonBranch(selectedBranchId)`. Non-NAKHON branches strictly require stamped branchId; missing-branchId docs are EXCLUDED for those branches.

**Writer contract** (V77-bis mirror): `handleResolve` last-resort branchId stamp MUST use `HARDCODED_NAKHON_BR_ID` (not empty string). Pre-V80 the chain `conv.branchId || selectedBranchId || ''` could write empty branchId when both upstream sources were unset → future reads fell through universally.

**Why**: V76 + V77-bis closed the WRITE side (webhook resolvers + backfill 3,281 docs). V79 closed the lineEnabled/fbEnabled gate. V80 closes the LAST sibling READER family. User-reported NIGHT+4: 7 chat_history docs created in the V76 deploy race window had missing branchId → ChatPanel filter `!item.branchId || item.branchId === selectedBranchId` fall-through INCLUDED them in EVERY branch view → "พระราม 3 และ ทดลอง 1 มีประวัติแชทเก่าของนครราชสีมา". Rule M backfill (`scripts/v80-backfill-chat-history-missing-branchid.mjs`) stamped the 7 stragglers; V80 code fix prevents future cross-branch fall-through.

**Class-of-bug**: V12 multi-reader-sweep at fall-through-filter boundary. Mirrors V79 CHAT-9 strict-isolation pattern at the read layer.

**Sanctioned exceptions**: NONE. All 3 reader sites must NAKHON-gate; writer must hardcoded-fallback.

**Grep target** (source-grep contract):
- `src/components/ChatPanel.jsx` imports `isLegacyNakhonBranch` + `HARDCODED_NAKHON_BR_ID` from `chatBranchDefaults.js`.
- 3 reader sites use `!c.branchId && isLegacyNakhonBranch(selectedBranchId)` (or `!item.branchId` form).
- handleResolve uses `conv.branchId || selectedBranchId || HARDCODED_NAKHON_BR_ID` last-resort.
- Anti-regression: NO bare `!c.branchId || String(c.branchId)` or `!item.branchId || String(item.branchId)` patterns remain.

**Source-grep test**: `tests/v80-chat-fall-through-nakhon-gated.test.js` groups A + B.
**Backfill script (Rule M)**: `scripts/v80-backfill-chat-history-missing-branchid.mjs` (7 chat_history docs → NAKHON, idempotent).
**Diag script (Rule R)**: `scripts/diag-v76-chat-history-branchid-state.mjs` + `scripts/diag-v76-chat-conversations-branchid-state.mjs` enumerate branchId distribution.
**Priority**: CRITICAL — user-visible cross-branch leak even AFTER V76 + V77-bis.

### AV62 — Whole-system backup manifestHash integrity (V81, 2026-05-16 NIGHT+4 → 17 EOD+5)

**Trigger**: every `/api/admin/whole-system-restore.js` endpoint MUST verify
`computeWholeSystemManifestHash(manifest) === manifest.manifestHash` BEFORE
any wipe or restore op. Mismatch → 409 `WHOLE_SYSTEM_MANIFEST_TAMPERED` + Thai
error "ไฟล์ backup เสียหายหรือถูกแก้ไข — ยกเลิกการ restore".

**Hash inputs** (canonical JSON ordered):
- All `collections[*].fileHash` sorted by collection name
- `storageManifestHash` (= SHA-256 of `storageObjects[*].fileHash` sorted by path — two-tier seal)
- `authUsers.fileHash`
- `name`, `createdAt`, `schemaVersion`, `totalDocCount`, `totalStorageBytes`, `totalAuthUsers`

**EXCLUDED from hash** (mutable for admin convenience):
- `createdBy`, `manifestHash` (self), `elapsedSec`, `_v81Marker`, `scope` (constant)

**Sanctioned exceptions**: NONE — every restore verifies.
**Source-grep test**: `tests/v81-source-grep.test.js` (V81 — restore endpoint).
**Priority**: CRITICAL — tampered backup could write arbitrary attacker data.

### AV63 — Whole-system cron CRON_SECRET gate + concurrency lock (V81)

**Trigger**: `/api/cron/whole-system-backup-daily.js` MUST verify
`Authorization: Bearer ${CRON_SECRET}` (or x-cron-secret header) AND acquire
+ release `be_admin_audit/whole-system-backup-running` lock via Firestore
transaction. Lock TTL 60 min; refuse 409 LOCK_BUSY if existing lock < 60 min old.
Manual export endpoint shares the SAME lock (`api/admin/whole-system-backup-export.js`).

**Sanctioned exceptions**: NONE.
**Source-grep test**: `tests/v81-source-grep.test.js` AV63 group.
**Priority**: CRITICAL — concurrent backups corrupt audit + waste resources.

### AV64 — Whole-system retention discipline (V81)

**Trigger**: cleanup logic in `wholeSystemBackupExecutor.runCleanup` MUST follow
`shouldCleanupBackup(name, ageMs)` from `src/lib/wholeSystemBackupCore.js`:
- `auto-*`       > 5d → delete
- `pre-restore-*` > 7d → delete
- `manual-*`     → keep (∞ — admin's responsibility)
- `__archive.tar.gz` > 24h → delete (handled separately in download endpoint)
- Unknown name pattern → log + preserve (forward-compat safety)

**Sanctioned exceptions**: NONE — every cleanup site uses the canonical helper.
**Source-grep test**: `tests/v81-whole-system-backup-core.test.js` Group D.
**Priority**: HIGH — incorrect cleanup loses data OR balloons Storage cost.

### AV19 elevation (V81-specific) — whole-system Replace MUST autoBackupRef

**Trigger**: `/api/admin/whole-system-restore` with `mode='replace'` MUST trigger
auto-pre-backup via internal call to backup-executor with `type='pre-restore'`
BEFORE wipe. Verify pre-restore folder exists in Storage via
`bucket.file('backups/whole-system/pre-restore-{ts}/manifest.json').exists()`.
Refuse 500 `AUTO_PRE_BACKUP_FAILED` if either step fails. Stamp
`autoBackupRef: 'pre-restore-{ts}'` on restore audit doc.

**Lineage**: V40 introduced AV19 (autoBackupRef mandatory for delete-many).
V74 AV53 elevated for customer cascade. V81 extends to whole-system Replace.
**Sanctioned exceptions**: Fresh-only mode (no wipe → no pre-backup needed).
**Priority**: CRITICAL — without elevation, admin click loses entire system.

### AV66 — Whole-system Replace mode MUST gate on password-reset acknowledgment + force reset emails (V81-fix2, 2026-05-17 EOD+1)

**Trigger**: `/api/admin/whole-system-restore` with `mode='replace'` MUST require
`ackPasswordResetRequired: true` in request body. The restore executor + the
endpoint BOTH validate the flag (defense-in-depth). UI modal MUST display a
warning panel + force a separate "I understand" checkbox before submit is
enabled. Executor MUST override `sendPasswordResetEmails` to `true` whenever
mode is replace, regardless of caller value.

**Why**: V81 backup design strips `passwordHash` + `passwordSalt` per Rule C2
security (sanitizeAuthUser). After Replace mode wipes + restores Firebase Auth,
all users have NO password set → unable to login. Origin 2026-05-17 EOD+1:
real-prod wipe-restore test executed `sendPasswordResetEmails: false` →
353 users locked out → admin had to manually recover. V81-fix2 closes this
silent-lockout vector with a 3-layer gate (UI checkbox + endpoint validation
+ executor validation) plus auto-forced reset emails.

**Source-grep patterns**:
- `runWholeSystemRestore` parameters include `ackPasswordResetRequired`
- Executor throws `REPLACE_ACK_REQUIRED` if `mode === 'replace' && ackPasswordResetRequired !== true`
- Executor computes `effectiveSendResetEmails = mode === 'replace' ? true : !!sendPasswordResetEmails`
- Endpoint `whole-system-restore.js` extracts `ackPasswordResetRequired` from req.body + returns 400 with `REPLACE_ACK_REQUIRED` error if missing for replace
- UI `WholeSystemRestoreModal.jsx` shows `data-testid="v81-fix2-ack-password-reset"` checkbox + disables submit on `canSubmit = ... && (!replaceAckRequired || ackPasswordReset)`

**Sanctioned exceptions**: NONE. Fresh mode doesn't need the ack (no wipe).
Replace mode is the only destructive path; ack is unconditional.

**Companion**: AV62 (manifestHash content integrity) + AV65 (Firestore-native
type fidelity) + AV66 (password-reset acknowledgment). Together AV62 + AV65 +
AV66 cover content + type + access integrity for the V81 backup-restore contract.

**Priority**: CRITICAL — silent staff lockout = system-wide outage until each
user runs forgot-password. Far worse than rejected restore attempt.

**Lesson** (V81-fix2 codified): "data preserved" ≠ "system usable". Auth is a
separate fidelity dimension that needs its own acknowledgment gate. V81 design
chose security-over-convenience (strip passwords); the consequence is admin
must explicitly acknowledge the convenience cost before triggering destructive
restore. UI warning + checkbox + server-side double-validation = 3-layer
defense against accidental destruction.

### AV65 — Firestore-native types MUST encode through encodeFirestoreData before JSON.stringify (V81-fix1, 2026-05-17 EOD+1)

**Trigger**: ANY backup/clone/migration code that serializes Firestore data
via `JSON.stringify` MUST first pass the data through `encodeFirestoreData`
from `src/lib/wholeSystemBackupCore.js`. The restore-side path MUST pass
the parsed JSON through `decodeFirestoreData(value, { Timestamp, GeoPoint })`
with Firebase admin SDK constructors BEFORE `batch.set`.

**Why**: Firebase admin SDK Timestamp.toJSON() outputs
`{_seconds, _nanoseconds}` (plain object, not a Timestamp instance).
JSON.parse on a backup file gives the same plain object. `batch.set(doc, that)`
writes it as a Map field, NOT a Timestamp. Same applies to GeoPoint and
Buffer/Bytes. The data values are preserved numerically but the TYPE is lost,
which silently breaks every Timestamp consumer post-restore (`doc.createdAt.toMillis()`
throws, Firestore range queries fail, composite indexes broken, cron
`WHERE nextRetryAt <= now` returns nothing, every report ordered by
`performedAt` broken).

**Bug invisible to**:
- Mock unit tests (no Timestamp instances)
- Property-based tests on plain JS objects
- e2e tests that verify hash + counts (not field shapes)
- AV62 hash validation (hashes match both sides because JSON serialization
  is consistent — but type fidelity is a SEPARATE contract that hashes can't see)

**Source-grep pattern**:
```
grep -rn "snap.docs.map(d => ({.*d.data().*id: d.id" api/ scripts/ src/
```
Any match found MUST be wrapped in `encodeFirestoreData(...)` OR carry a
sanctioned-exception annotation `// audit-anti-vibe-code: AV65 — non-backup
context, no JSON serialization`.

**Sanctioned exceptions**:
- `wholeSystemBackupExecutor.js` (4 sites — all already wrapped post-V81-fix1)
- One-shot diagnostic / dry-run scripts that read but don't write (`scripts/diag-*.mjs`)
- Tests that compare in-memory shapes without round-trip (`tests/*.test.js`)

**Detection**: backup-side encode + restore-side decode. Look for:
- Backup write path: `JSON.stringify(snap.docs.map(...))` MUST pass through
  `encodeFirestoreData` (`snap.docs.map(d => encodeFirestoreData({...d.data(), id: d.id}))`)
- Restore read path: `JSON.parse(buf)` MUST be followed by
  `decodeFirestoreData(parsed, FB_TYPE_OPTS)` before any `batch.set`

**Lineage**: V81-fix1 (2026-05-17 EOD+1) added the helpers + wired all 4
backup sites + 1 restore site. Real-prod diagnostic (`scripts/diag-v81-timestamp-roundtrip.mjs`)
confirmed pre-fix degradation on 4 field paths (`chat_history._v76BranchBackfilledAt` ×
3,281, `chat_history._v77quinquiesBackfilledAt` × 818, `be_recalls.createdAt/updatedAt`).
Post-fix real-prod verify (`scripts/diag-v81-fix1-roundtrip-verify.mjs`):
backup file contains 31 `__type:timestamp` markers in be_customers.json;
decode re-hydrates as `Timestamp` instance with `.toMillis()` matching seed.

**Companion AV**: AV62 (manifestHash integrity — content tamper).
AV65 covers TYPE integrity. Together they guarantee byte-and-type-equal
round-trip.

**Priority**: CRITICAL — without AV65 enforcement, any new backup/clone
code path that serializes Firestore data has a hidden type-degradation
bug that mock + hash tests cannot catch. Same class of failure as V81
restore would have caused on first use (every Timestamp field broken).

**Source-grep test**: `tests/v81-fix1-firestore-type-roundtrip.test.js`
Group J source-grep regression locks at all 4 backup sites + restore decode
ordering. Mirror for future backup additions.

**Lesson** (V66 lived twice): real-data introspection beats hash verification
for type-preservation contracts. Mock tests = code-shape coverage; AV62
hash = content-fidelity; AV65 = type-fidelity. All three required.

### AV68 — Whole-System Replace mode MUST preserve Auth by default (V81-fix4, 2026-05-17 EOD+2)

**Trigger**: ANY Whole-System restore in Replace mode MUST default to preserving
all Auth users (no Auth wipe + no Auth import from backup). Cross-project clone
is an OPT-IN advanced case (`replaceAuthFromBackup: true`) that requires the
AV66/V81-fix2 ack-gate (passwords will be lost per Rule C2).

**Why**: V81-fix2 ack-gate prevented silent staff lockout post-restore but the
default behavior still wiped Auth + lost passwords. User directive 2026-05-17
EOD+2: "ถ้าเป็น vercel เดิมจะไม่ศุนย์เสีย รหัส หรือ email login ไป แม้แต่
อันเดียว ทุกตำแหน่งต้องสามารถใช้รหัสเดิม login เดิม หรือแม้กระทั่งไม่หลุด login เลย".

Default Replace mode now:
- Skips Auth wipe (passwords + emails + sessions + refresh tokens preserved)
- Skips Auth restore (no churn against existing Auth state)
- Skips password-reset emails (not needed since passwords aren't lost)
- Skips ack-gate (no lockout risk to acknowledge)

`replaceAuthFromBackup: true` is the legacy V81 behavior — only meaningful for
cross-project clone (loses passwords because Rule C2 strips passwordHash from
backup files). Still required ack-gate + reset emails in that case.

**Source-grep pattern**:
```
grep -n "replaceAuthFromBackup" api/admin/_lib/wholeSystemRestoreExecutor.js
grep -n "wipeAuth" api/admin/_lib/wholeSystemRestoreExecutor.js
```

**Sanctioned exceptions**: NONE. Default MUST be preserve.

**Detection**: regression test `tests/v81-fix4-auth-preserve-and-size.test.js`
Group AV68 (11 assertions) — locks default behavior + ack-gate scope + UI shape.

**Priority**: CRITICAL — silent staff lockout is the most user-hostile bug
class possible (admin physically can't recover from outside the system).

**Lineage**: V81 shipped Auth wipe + restore as default → V81-fix2 added ack-gate
to surface the password-loss → V81-fix4 changed default to preserve.

### AV69 — Whole-System backups list MUST display real folder size on disk (V81-fix4, 2026-05-17 EOD+2)

**Trigger**: The whole-system-backups-list endpoint MUST return `totalBytes`
(sum of all file sizes in the backup folder) per backup row. UI MUST prefer
`totalBytes` over the misleading `stats.totalStorageBytes` (which is 0 when
the clinic has no patient photos but the backup body is actually MB of JSON).

**Why**: User screenshot 2026-05-17 EOD+2 showed all V81 backups as "0 MB"
even though they contained 5,065 docs each. Root: `BackupManagerTab` displayed
`stats.totalStorageBytes` only — represents NON-backup Storage files (customer
photos / signature pads). Clinic had 0 such files → 0 MB display. Real backup
size = collections JSON + storage payloads + auth/users.json + manifest.json.

**Source-grep pattern**:
```
grep -n "totalBytes" api/admin/whole-system-backups-list.js
grep -n "b.totalBytes" src/components/backend/BackupManagerTab.jsx
```

**Sanctioned exceptions**: legacy backups created pre-V81-fix4 don't have
`totalBytes` in their manifest — UI falls back to `(totalCollectionFileBytes +
totalStorageBytes)` for backward compat.

**Detection**: regression test `tests/v81-fix4-auth-preserve-and-size.test.js`
Group AV69 (5 assertions).

**Priority**: HIGH — misleading display erodes user trust (looks like the
backup is empty when it isn't).

### AV70 — Per-customer backup model DEPRECATED (V81-fix4, 2026-05-17 EOD+2)

**Trigger**: NO active code path may import/render the per-customer backup
UI (V74 `💾 สำรอง` button in CustomerDetailView, V77 `📦 สำรองลูกค้าทุกคน`
button in BackupManagerTab, `WholeFleetBackupModal`, `CustomerBackupModal`).
The V81 Whole-System Backup is the canonical replacement.

**Why**: User directive 2026-05-17 EOD+2: "ไม่ต้องเก็บข้อมูล Backup ลูกค้า
แบบแยกคน รกเหี้ยๆ ต้องการ Backup ลูกค้าทุกคนพร้อมข้อมูลทุกอย่างออกมาเป็น
ไฟล์เดียว เหมือนกับ backup อื่นๆ". 359 backup files on prod (most per-customer)
flagged as visual noise. V81 whole-system backup ALREADY includes ALL
be_customers + subcollections + Storage + (V81-fix4) Auth preserved.

**Source-grep pattern** (must return zero matches):
```
grep -rn "data-testid=\"customer-detail-backup-button\"" src/
grep -rn "data-testid=\"whole-fleet-backup-trigger\"" src/
grep -rn "^import WholeFleetBackupModal" src/
```

**Sanctioned exceptions**: archival files preserved but unreferenced —
`WholeFleetBackupModal.jsx`, `CustomerBackupModal.jsx`, `CustomerDataRecoveryTab.jsx`
plus backend endpoints `api/admin/customer-backup-export.js` +
`whole-fleet-customer-backup-export.js` + `whole-fleet-customer-restore.js`
remain on disk for archival / future re-introduction. They are dead code from
the UI's perspective.

**Mass cleanup**: `scripts/v81-fix4-purge-customer-backups.mjs --apply` deletes
all `backups/customers/**` + `backups/whole-fleet-customers/**` Storage files
in one pass. Rule M two-phase (dry-run + --apply) + audit doc + crypto-secure
random id.

**Detection**: regression test `tests/v81-fix4-auth-preserve-and-size.test.js`
Group AV70 (7 assertions) + Group FD (7 assertions for the cleanup script).

**Priority**: MEDIUM — UI cleanup + storage cleanup. Not a runtime bug; a UX +
data-hygiene improvement.

### AV67 — Vercel serverless endpoints (api/**) MUST import only runtime dependencies (2026-05-17 EOD+2)

**Trigger**: ANY file under `api/**` that imports a third-party package via
`import X from 'pkg'` MUST have that package listed in `package.json`
`dependencies` (NOT `devDependencies`). Vercel runs `npm install --production`
on serverless build, which SKIPS `devDependencies` — any import resolving
to a devDep crashes at module-load with a generic Vercel error page
("A server error has occurred…" — HTML, NOT JSON).

**Why**: Vercel's serverless runtime mirrors production Node — devDeps are
build/test-only. The runtime cannot find the package → module-load throws
→ Vercel wraps in a generic 500 HTML page → client `await res.json()` parses
"A server e…" → `SyntaxError: Unexpected token 'A', "A server e"... is not
valid JSON`. The actual import error is invisible to the client.

**Origin**: V81 backup Download button shipped 2026-05-17 with `archiver`
in `devDependencies`. User clicked Download → 500 with the cryptic JSON
parse error. Endpoint code was correct; package placement was wrong.
Vercel build succeeded (devDeps install at build time for type-checking);
runtime failed (production install skips devDeps).

**Source-grep pattern**:
```
grep -rn "^import.*from\s*['\"]\(archiver\|jsdom\|fast-check\|@playwright\|@testing-library\|@stryker\|@vitest\|knip\|eslint\|vite\|vitest\|autoprefixer\|postcss\|tailwindcss\|@vitejs\|firebase-tools\)['\"]" api/
```
Any match found MUST move the package to `dependencies`.

**Sanctioned exceptions**: NONE. Every devDep import in `api/**` is a bug.

**Detection**: regression test `tests/v81-fix3-archiver-runtime-dependency.test.js`
parses `package.json` + walks `api/**/*.{js,mjs}` import statements; for each
import resolving to a known devDep family, asserts the package is in
`dependencies`. Fails build on drift.

**Priority**: HIGH — every new serverless endpoint addition is a potential
trigger. Catches silently-broken endpoints at build time (cheaper than
post-deploy 500 + user-rage round).

**Lineage**: V81-fix3 (2026-05-17 EOD+2) moved `archiver@^8.0.0` from
`devDependencies` to `dependencies`. Single import site
(`api/admin/whole-system-backup-download.js:9`). No other devDeps imports
in `api/**` confirmed via cross-file grep. AV67 codifies the invariant
permanently.

### AV75 — Firestore composite-index direction MUST match query orderBy direction (post-V81-fix7b, 2026-05-17 EOD+2)

**Trigger**: ANY Firestore query of the shape
`where(eqField, '==', x).where(rangeField, opIneq, y).get()` (where `opIneq`
is one of `>=`, `>`, `<=`, `<`, `!=`) MUST include an explicit
`.orderBy(rangeField, <direction>)` whose direction matches the deployed
composite index direction for `rangeField`. Without the explicit orderBy,
Firestore implicitly orders by `rangeField` ASC; if the deployed index has
DESC direction for `rangeField`, the query throws `FAILED_PRECONDITION:
The query requires an index` at runtime.

**Why**: Composite indexes encode per-field direction. A query with an
implicit ASC orderBy CANNOT use a DESC composite index even when both
fields match — Firestore requires direction alignment. The error is invisible
to unit tests (mocks don't enforce index policy) and to admin-SDK doc-level
access (admin SDK bypasses composite indexes entirely — Rule Q V66 lesson).
Only real-client-SDK runs against real prod surface the bug.

**Origin**: V81-fix7b post-deploy (2026-05-17 EOD+2 LATE+4) — user clicked
the 🗑 delete button on a per-branch backup row in BackupManagerTab. The
endpoint's `checkGracePeriod` ran `where('type','==',t).where('performedAt','>=',since)`
against `be_admin_audit`. Deployed index `(type ASC, performedAt DESC)` was
correct for the manager-LIST query (which orders newest-first), but the
grace-check had no orderBy → implicit ASC → mismatch → user-visible error
banner: "⚠ 9 FAILED_PRECONDITION: The query requires an index". Two
identical sites: `api/admin/backup-manager-delete.js:checkGracePeriod` +
`api/admin/backup-manager-bulk-delete.js:checkGracePeriod`. Fixed by adding
`.orderBy('performedAt', 'desc')` to both.

**Source-grep pattern** (catches future drift):
```
# Find any .where('X', '==', ...) followed by .where('Y', '>=|>|<=|<', ...)
# without a subsequent .orderBy() — class-of-bug regression catcher.
grep -nE "\.where\(['\"][^'\"]+['\"], ?['\"](>=|>|<=|<)['\"]" api/admin/*.js
# Cross-reference each match against firestore.indexes.json to verify the
# query has an explicit .orderBy() matching the deployed index direction.
```

**Sanctioned exceptions**: queries with NO matching deployed composite index
(use single-field index only) — Firestore handles those without composite.
But adding `.orderBy()` defensively is always safe.

**Detection**: regression test `tests/v81-fix7b-grace-check-composite-index.test.js`
parses both `checkGracePeriod` functions + asserts both contain
`.orderBy('performedAt', 'desc')`. Future removal fails build.

**Priority**: HIGH — the bug surfaces ONLY at runtime against real Firestore;
mock tests + admin-SDK e2e + build all GREEN while the user clicks → 500.
Every new composite-index-backed query in api/** needs this audit pass.

**Lineage**: post-V81-fix7b (2026-05-17 EOD+2 LATE+4). Two sites fixed in
single commit per Rule P 7-step class-of-bug expansion. Plus removal of
orphan `customer-data-recovery` tab in same commit (independent fix, same
user-report turn).

### AV76 — In-memory dedup for Firestore listener results crashes on remount (V82, 2026-05-17)

**Trigger**: Any component that subscribes to a Firestore listener AND uses
`useRef(new Set())` to track "seen IDs" for unread/sound dedup. The Set is
in-memory — it resets every component remount (parent re-render, route change,
tab toggle). On resubscribe, the listener fires with the full result set, all
docs look "new", duplicate sound + unread events fire.

**Why**: Cross-remount dedup needs PERSISTENT state, not in-memory ref. Per
Rule of 3 / per-device patterns:
- **Per-device** (most common): localStorage cursor with `{branchId}` keying
- **Cross-device** (rare): Firestore doc per-(uid, scope)

**Origin**: V73 useStaffChat shipped with `lastSeenIdsRef = useRef(new Set())`.
After V81-fix7b deploy, user reported chat badge count growing + noti spam on
every Frontend↔Backend tab switch — same device, same name, same color, but
unread state reset every remount. V82 introduced `staffChatReadCursor.js`
(localStorage per-(deviceId, branchId)) to close the gap permanently.

**Source-grep pattern** (catches future drift):
```
grep -rn "useRef\s*(\s*new Set\s*(" src/ | grep -v node_modules
```
For each match, verify whether cross-remount dedup is required. If YES →
migrate to persistent cursor (localStorage or Firestore). If NO (per-mount
dedup is intentional, e.g. modal open-close) → annotate with comment
`// AV76 safe — per-mount dedup intentional` so the audit skips.

**Sanctioned exceptions**: short-lived modal components where the user is
expected to see all listener events fresh on each open; one-shot toast
notifications.

**Detection**: regression test `tests/v82-staff-chat-cursor-and-badge.test.js`
Group H assertions (H.1-H.8) lock the post-fix shape: cursor module imported,
markScrolledToBottom wired, no `lastSeenIdsRef = useRef(new Set())` remains.

**Priority**: HIGH — listener-consuming components are common; missed dedup
manifests as user-visible noti/badge spam (Rule Q V66 trust collapse risk).

**Lineage**: V82 (2026-05-17 post-V81-fix7b) — single migration of useStaffChat.
Cross-file grep (Rule P Step 3) confirmed no other listener consumers in src/
currently use `useRef(new Set())` for cross-remount dedup. AV76 codifies the
pattern permanently.

### AV77 — Transient workflow opt-out flags MUST be respected by ALL sibling tab-routing filters (V82-fix2, 2026-05-17 EOD+3 LATE+3)

**Trigger**: A transient state flag (e.g. `_v82FollowupOpdResetAt`) is added to
ONE filter site to override default tab-routing — but its semantic is NOT
propagated to sibling filters that share the same routing decision matrix.
When other state combinations (manual restore, deposit-tab assignment, etc.)
also trigger early-rejects placed BEFORE the opt-out, the flag is silently
overridden and the session lands in an unexpected tab.

**Why**: A tab-routing decision is a MULTI-FILTER concern — queue, archive,
deposit, and permanent tabs each have their own filter. Adding an opt-out at
one filter without sweeping the siblings creates a combinatorial state where
the opt-out semantic is REACHABLE for some state combos but UNREACHABLE for
others. User reports "X disappeared from BOTH tabs" because the session is
routed to a THIRD tab the user wasn't expecting.

**Origin**: V82-fix2 (2026-05-17 EOD+3 LATE+3) — `_v82FollowupOpdResetAt`
opt-out was added at `AdminDashboard.jsx:2282` AFTER the `isPermanent`-non-
deposit early-reject at line 2275. When user clicked "กลับเข้าคิว → ลิงก์ดูข้อมูล"
on a reset session (sets `isPermanent: true`), line 2275 won and the opt-out
was unreachable → 2 customers (LOV-1F5QNL, LOV-5PG74T) silently routed to
จองไม่มัดจำ tab. The state-machine test `v82-followup-state-machine-test.mjs`
missed this because it tested State D (restore-permanent) and State E (reset
stamp) IN ISOLATION — never the D+E combination.

**Source-grep pattern** (catches future drift): every transient workflow opt-
out flag added to one filter MUST also appear at sibling filters in the same
file:

```
# Identify opt-out flags introduced for workflow overrides
grep -E "if \(session\._v[0-9]+\w*\) return (true|false);" src/pages/*.jsx src/components/**/*.jsx | sort -u

# Confirm each appears in MULTIPLE filter sites (queue + noDeposit + archive)
# for any tab-routing component (AdminDashboard.jsx, BackendDashboard.jsx)
```

For each opt-out flag, verify:
1. It appears at TOP of the primary tab filter (right after `isArchived` check)
2. It appears as an EXCLUDE clause in any sibling tab filter that would
   otherwise match the same session state (to avoid double-appearance)
3. There's a paired test combining the flag with each early-reject state
   (intake+permanent, deposit+serviced, etc.)

**Sanctioned exceptions**: Deposit-tab assignment may have priority for
formType-specific routing (e.g. `formType === 'deposit'` short-circuits even
with opt-out). Document the exception with an inline comment near the
filter site.

**Detection**: regression test `tests/v82-fix2-permanent-restore-reset-stamp.test.js`
Groups C + D lock the post-fix shape: opt-out branch at top, noDepositSessions
exclusion, sibling filter ordering check, state-combination matrix.

**Priority**: HIGH — silently routes user-visible data to the wrong tab
without throwing any error. User reads it as "data lost" → trust collapse
(Rule Q V66 risk). Combinatorial state-machine testing gap MUST be filled at
every new opt-out introduction.

**Lineage**: V82-fix2 (2026-05-17 EOD+3 LATE+3). Companion test bank locks
both the queue filter ordering AND the noDepositSessions exclusion. Pair-
edit discipline: any future opt-out at queue filter MUST be paired with the
same opt-out at noDepositSessions filter to prevent double-appearance.

### AV79 — Perm/Tab mapping completeness (V83-followup-3, 2026-05-18 EOD+8)

**Trigger**: A perm key in `permissionGroupValidation.js` is granted (checkbox
ticked in PermissionGroupFormModal) but the corresponding tab does not become
accessible. Root cause: tab's `TAB_PERMISSION_MAP` gate uses `adminOnly:true`
which short-circuits `canAccessTab` BEFORE the `requires` array is checked.
Perm grant is DEAD code.

**Why**: `canAccessTab` order:
```js
if (isAdmin) return true;
if (gate.adminOnly) return false;  // ← short-circuits HERE
const reqs = gate.requires || [];
return reqs.some(k => perms[k] === true);
```
A tab declared `{ requires: ['exam_room_management'], adminOnly: true }` will
**always deny** non-admin even with the perm — the `requires` is dead code.

**Source-grep pattern** (catches future drift):

```bash
# Every tab in TAB_PERMISSION_MAP that has adminOnly:true MUST be in the
# sanctioned list (no specific perm OR destructive op). Otherwise the perm
# grant is dead.
grep -nE "['\"][a-z-]+['\"]:\s*\{[^}]*adminOnly:\s*true" src/lib/tabPermissions.js
```

After this grep, cross-check each match against the canonical `PERM_TO_TAB`
mapping in `tests/v83-followup-3-perm-tab-mapping-completeness.test.js`. If
a perm key in `permissionGroupValidation.js` settings module maps to that
tab, the gate is broken — flip to `{ requires: ['<perm_key>'] }`.

**Sanctioned adminOnly tabs** (closed list — adding requires V-entry):
1. `masterdata` — stale entry, tab removed in V50
2. `finance-master` — umbrella, no specific perm declared
3. `document-templates` — no perm declared for templates admin
4. `line-settings` — LINE OA channel + bot config (admin)
5. `fb-settings` — Per-branch FB Page settings (admin)
6. `backup-manager` — destructive op (admin claim is the intended gate)
7. `branch-backup` — destructive op (admin claim is the intended gate)

**Detection**: regression test `tests/v83-followup-3-perm-tab-mapping-completeness.test.js`
(C1-C6: every-perm-grants-tab + 11-affected-tabs-locks + 4-persona-matrix +
sanctioned-list-explicit + source-grep + settings-perm-completeness).

**Class-of-bug**: V12 multi-reader-sweep at permission-mapping boundary.
`permissionGroupValidation.js` (perm catalog) and `tabPermissions.js` (gate
map) are two readers of "what permission allows access" — they drifted. V83
fixed link_request_management; V83-followup-3 batch-fixes the 11 remaining
master-data tabs.

**Priority**: HIGH — silent permission grant. Admin grants a perm via UI
(checkbox ticked, saved to Firestore), expects user can access the tab, but
gate denies. User loses trust ("ทำไมตั้งสิทธิ์ให้แล้ว user เข้าไม่ได้").

**Lineage**: V83-followup-3 (2026-05-18 EOD+8). User report (verbatim, locked
permanent): "คนที่มีสิทธิ์ในการตั้งค่า จัดการสินค้า จัดการกลุ่มสินค้า เครื่องหัตถการ
จัดการหน่วยสินค้า หรืออื่นๆ แต่ sub tab ทั้งแบบเดิมและใหม่ กลับปรากฎไม่ครบ ...
ฝากเช็คว่าสิทธิ์กับสิ่งที่ app เราอนุญาติมันตรงกันทั้งหมดจริงๆ".

Pair-edit discipline: any new perm key added to `permissionGroupValidation.js`
settings module MUST be paired with a `requires` gate entry in
`tabPermissions.js` OR added to the C6 NO_TAB_PERMS intentional-tab-less list
in the regression test.

### AV78 — Modal backdrop click MUST NOT close (V83, 2026-05-18 EOD+8)

**Trigger**: A user fills in a long modal form and accidentally clicks the
darkened backdrop outside the modal content box → modal dismisses → all
form input lost. User has to restart from scratch. Repeated occurrences
cause user trust + workflow damage ("ใกล้จะหมดแล้ว ดันไปเผลอคลิ๊ก ... หัวร้อน
มากๆ ... อยากจะทุบคอมทิ้ง").

**Why**: Modal backdrop dismiss is a default React/Tailwind pattern (single
line `onClick={onClose}` on the outer `<div className="fixed inset-0 ...">`)
copied across ~57 ad-hoc modal files. Backdrop-click dismissal is a UX
anti-pattern for FORMS (vs. simple confirm dialogs). Even brief slip-clicks
destroy work. Modern UX (Stripe, Linear, etc.) only dismisses on explicit
affordances: X button, Cancel button, ESC key.

**Source-grep pattern** (catches future drift):

```bash
# Every modal backdrop in src/components/**/*.jsx MUST NOT carry these:
grep -rEn "onClick=\{onClose\}|onClick=\{\(e\) => \{ if \(e\.target === e\.currentTarget\)" src/components/ | grep -v StaffChatImageLightbox

# Pattern A: `onClick={onClose}` directly on backdrop
# Pattern A-alt: `onClick={() => setSomeState(null|false)}` on backdrop
# Pattern A-alt2: `onClick={() => stage !== 'running' && onClose?.()}` (WholeSystem)
# Pattern B: `onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}`
# All FORBIDDEN on backdrop divs (not on X/Cancel buttons inside the modal)
```

After this audit pattern, the source-grep regression test
`tests/v83-modal-explicit-close-only.test.js` (M1-M4 groups) enforces:
- M1: closed sanctioned exception list (lightboxes only)
- M2: ZERO offending backdrop onClick patterns in src/components/
- M3: ESC OR X-button close affordance still present (positive check)
- M4: AV78 marker comment present where strip happened

**Sanctioned exceptions** (closed list — adding another requires extending
both the test file AND filing a V-entry justifying the UX deviation):
1. `src/components/backend/TreatmentReadOnlyMirror.jsx` (inner
   ImageLightbox helper) — same pattern for treatment image zoom

(2026-05-22, any-file ship) `StaffChatImageLightbox.jsx` LEFT this closed list —
it is now a NORMAL modal (✕/Esc only, no backdrop close); the NEW
`StaffChatPdfOverlay.jsx` also follows explicit-close (NOT an exception). Reason:
accidental outside-clicks closing a viewer mid-look = ใช้ยาก. List 2 → 1.

Annotated with `// audit-anti-vibe-code: AV78 lightbox-explicit-exception`.

**Detection**: regression test `tests/v83-modal-explicit-close-only.test.js`
(M1-M4) + Rule I flow-simulate `tests/v83-modal-explicit-close-flow-simulate.test.jsx`
(F1-F6) lock the post-V83 contract permanently.

**Class-of-bug**: V12 multi-reader-sweep at UI-affordance boundary. 57
ad-hoc modals all shared the same anti-pattern. Mechanical strip via
batch Edit + source-grep regression at file-level boundary is the only
sustainable fix. AV78 grep prevents new modals from re-introducing the
pattern at PR time.

**Priority**: HIGH — silent user-data destruction. Form work lost without
any error or warning. Trust damage compounds with repetition.

**Lineage**: V83 (2026-05-18 EOD+8). User pain locked permanent in this
entry; marker comment `AV78 (EOD8): backdrop click does NOT close — explicit
close only (X / Cancel / ESC)` placed above 80+ backdrop divs across 40+
modal files (some files have multiple backdrops). Pair-edit discipline:
any new modal added to src/components MUST follow explicit-close-only
contract OR be added to sanctioned lightbox list.

### AV97 — Skip-stock filter discipline on balance readers (V43-followup, 2026-05-19)

**Pattern**: every "stock balance reader" (component that renders
`be_products` + `be_stock_batches` as a balance table) MUST route products
through `filterOutSkippedProducts` from `src/lib/skipStockFilter.js` so
`skipStockDeduction:true` products don't appear in the table.

**Grep target (regression)**:
- File `src/components/backend/StockBalancePanel.jsx` MUST import
  `filterOutSkippedProducts`.
- Any NEW balance-reader file must also import OR be added to the closed
  sanctioned-exception list below.

**Sanctioned exceptions (closed list)**:
- `src/components/backend/ProductsTab.jsx` — master CRUD list; admin needs
  to see ALL products to edit them. Filter would hide rows the admin must
  reach. Exempted by design.
- `src/components/backend/MovementLogPanel.jsx` — history audit; immutable
  per Rule D. Showing historical movements for now-skipped products is
  required.

Adding a 3rd exception requires a V-entry + this list extension (Rule P).

**Cross-link**: spec
`docs/superpowers/specs/2026-05-19-skip-stock-hide-from-balance-design.html`
· tests `tests/av97-balance-reader-filter-discipline.test.js`.

### AV98 — Fixed-position modal rendered inside a glow card MUST portal to document.body (2026-05-20)

**Pattern**: the V86 auto-glow (`src/index.css` ~3909-3933) applies
`transition: transform` + `:hover { transform: translateY(-3px) }` to EVERY
`rounded-xl`/`rounded-2xl` element inside
`[data-backend-menu-mode="new"] [data-testid="backend-content"]`. A non-`none`
`transform` on an element makes it the **containing block** for any
`position: fixed` descendant. So a `fixed inset-0` modal rendered as a
DESCENDANT of a rounded card (e.g. RecallCard's `rounded-xl` wrapper) is
confined to that card's box on hover — and because the full-screen overlay is
itself the card's descendant, hovering it keeps the card `:hover` true →
transform → confine → mouse leaves the shrunk modal → transform releases →
overlay re-expands → re-hover: a self-sustaining flicker → repaint-storm freeze.
Reported 2026-05-20 (recall modal "in a box" + กระพริบรัวๆ จนค้าง, new menu only).

**Rule**: any `fixed inset-0` modal/overlay that may be rendered as a
descendant of a glow card (i.e. NOT at page/tab root) MUST `createPortal(...,
document.body)` so the fixed overlay escapes ANY transformed/filtered ancestor.

**Grep target (regression)**: ALL 6 recall modals (`RecallCreateModal`,
`RecallEditModal`, `RecallOutcomeModal`, `RecallSnoozeMenu`,
`RecallLineTemplateModal`, `RecallCaseFormModal`) MUST
`import { createPortal } from 'react-dom'` + `return createPortal(<div
className="fixed inset-0 ...">, ..., document.body)`. **The grep must span the
whole recall-modal SET, not one rendering component** — round 1 (2026-05-20)
portaled only the 4 modals `RecallCard` renders and the user re-reported the
SAME bug on the Frontend Recall tab (`.admin-frontend-zone` → `RecallFrontendView`
renders a 5th, `RecallLineTemplateModal`; `RecallCaseFormModal` is a 6th). The
V86 glow has TWO scopes — `[data-backend-menu-mode="new"] [data-testid="backend-content"]`
AND `.admin-frontend-zone` — so BOTH the backend-new-menu and the frontend
admin zone trigger the hijack. Class-completeness locked by test group D
(every `fixed inset-0` file in the recall dir must portal).

**Sanctioned exceptions (closed list)**: modals rendered at PAGE/TAB ROOT (not
inside a rounded card) need not portal — CustomerDetailView's
AddQty/Exchange/Share/AppointmentList/Timeline modals (rendered at the CDV root
`</div>`, siblings of the layout), and SaleTab / DepositPanel tab-root modals.
These have no transformed rounded-card ancestor → safe without portal. Adding a
new modal INSIDE a glow card requires portal (or this list extension) per Rule P.

**Why not remove the V86 hover-transform instead**: user chose to KEEP the V86
hover-lift micro-interaction (2026-05-20) → fix at the modal layer (portal), not
the glow layer. A future modal rendered inside a glow card MUST portal or regress.

**Cross-link**: tests `tests/recall-modal-portal-and-header-dedup.test.js`
(A portal + B breadcrumb-dedup + C this invariant). Companion fix: BackendDashboard
viewing-customer breadcrumbSlot controls gated `menuMode === 'classic'`
(duplicate-header bug, same commit).

### AV99 — Stock-movement deletion MUST be archive-gated (V106, 2026-05-20)

`be_stock_movements` are the MOPH audit/legal record (V34) — `firestore.rules`
blocks client delete (`allow delete: if false`). The ONLY permitted deleter is
the retention cron `api/cron/stock-movement-retention.js`, and it MUST:

1. write the (branchId, month) archive JSON to Storage AND confirm the write
   BEFORE deleting any doc of that group (archive-before-delete /
   capture-before-destroy — same lineage as AV19/V40/V74/V81);
2. compare age via `normalizeCreatedAtForCompare` (normalized ISO string),
   NEVER rely on the raw Firestore string range query alone — a stray
   Timestamp-typed `createdAt` sorts BEFORE every string in Firestore type
   ordering, so a `where createdAt < <isoString>` would always match it; the
   in-memory normalized re-gate prevents wrong deletion;
3. be idempotent (`mergeArchive` dedups by `movementId`; deleted docs do not
   re-appear) — no concurrency lock needed (cron-only + 300s cap = no overlap).

**Grep target (regression)**: any new `.delete()` / `deleteDoc(` / `batch.delete(`
targeting `be_stock_movements` OUTSIDE the retention cron = violation.
`api/cron/stock-movement-retention.js` must contain `.save(` BEFORE
`batch.delete(` in source order, gate delete on `archivedKeys.has(...)`, and
call `normalizeCreatedAtForCompare`. `src/lib/backendClient.js` REVERSES
movements (creates a compensating movement + sets `reversedByMovementId`) — it
must NEVER hard-delete a `be_stock_movements` doc.

**Sanctioned deleter (closed list of 1)**: `api/cron/stock-movement-retention.js`.
Adding a 2nd deleter requires a V-entry + this list extension (Rule P).

**Cross-link**: spec
`docs/superpowers/specs/2026-05-20-stock-movement-retention-design.html` ·
plan `docs/superpowers/plans/2026-05-20-stock-movement-retention.html` ·
tests `tests/v106-av99-archive-before-delete.test.js`.

### AV100 — Sale customerName/HN resolved at the write chokepoint + list resolver fed (V108, 2026-05-20)

`be_sales` rows display `sale.customerName || resolve-from-customers || '-'` (V105).
Two failure modes produced persistent "-" on the SaleTab list (user report
2026-05-20, INV-20260520-0010, real prod — `customerName=<empty>` while
`be_customers/LC-26000074` resolved fine):

1. **Write (root)**: `createBackendSale` callers (TFP auto-sale ×2,
   CustomerDetailView ×3, SaleTab form, online-sale) derive `customerName` from
   props/state that can be EMPTY even when the customer doc resolves (V105's TFP
   fix read the `{patientData}` PROP, not the doc). Empty name → `clean()` strips
   it → sale doc has no name → "-".
2. **Display**: SaleTab's V105 fallback resolves via the `customers` lookup, but
   `customers` was loaded ONLY in `loadOptions` (form-open), never on list mount
   → empty on the list → fallback dead.

**Rule (chokepoint, resolve-at-writer — Rule O / V102 lineage)**:
- `createBackendSale` MUST resolve `customerName`/`customerHN` from the
  authoritative `be_customers` doc (`resolveCustomerDisplayName` /
  `resolveCustomerHN`) when the passed value is empty, via
  `_resolveSaleCustomerIdentity`. One guard protects ALL callers. Set AFTER the
  `_normalizeSaleData` spread so resolved values win.
- SaleTab MUST eager-load `customers` on mount (not only on form-open) so the
  V105 list fallback can resolve. `loadOptions` MUST load-only-missing (per-
  resource gate) so `medProducts` still loads for the buy modal.

**Grep target (regression)**: `createBackendSale` body must reference
`_resolveSaleCustomerIdentity`; the helper must call `resolveCustomerDisplayName`
+ `resolveCustomerHN` on a `customerDoc(...)` read. SaleTab must contain an eager
`getAllCustomers()` in a mount `useEffect`, and `loadOptions` must NOT guard on
`customers.length && sellers.length` alone (must include `medProducts`).

**Sanctioned exceptions**: NONE — every `createBackendSale` write flows through
the chokepoint. Cross-link: tests `tests/v108-sale-customer-name-chokepoint.test.js`.

### AV101 — Tablet Chart Editor pairing boundaries (2026-05-20)

The tablet chart editor pairs a PC (TFP chart modal) with a standby tablet via two
ephemeral branch-scoped collections (`be_chart_tablet_presence`,
`be_chart_edit_sessions`) + Storage transport. To keep it isolated + safe:

1. **TFP-untouched**: `src/components/TreatmentFormPage.jsx` MUST NOT import any
   chart-edit module (`useChartEditSession` / `chartEditSession` / `PcPairingModal` /
   `TabletChartEditorPage` / `chartEditSessionCore`). The whole feature lives in new
   files + `ChartSection.jsx`; one `patientLabel` prop is the only TFP-render touch.
2. **Result funnels through `ChartSection.handleSave`**: the tablet drawing merges
   into the TFP `charts[]` (`{dataUrl, fabricJson:null, templateId, source:'tablet'}`)
   — the tablet path MUST NOT write `be_treatments` directly (works in TFP create
   mode where no treatment doc exists yet).
3. **Closed writer list**: the two pairing collections are written ONLY by
   `src/lib/backendClient.js` (UI/hooks call its exported wrappers) + the
   `api/cron/chart-edit-session-sweep.js` orphan reaper. No other
   `setDoc`/`updateDoc`/`tx.set` on `be_chart_*` anywhere in `src/`.
4. **Images via Storage, never the doc**: the session doc carries only URLs; PNGs
   travel through `uploads/chart-edit-sessions/{sessionId}/` (1 MB doc-cap protection).
   Presence stays `busy` while editing (heartbeat-driven, never an unmount-free flip).

**Grep target (regression)**: TFP free of chart-edit imports; `ChartSection` has
`onSaved:...handleSave` + no `be_treatments`; no `(setDoc|updateDoc|tx.set)(...be_chart_*`
outside backendClient.js. **Sanctioned exceptions**: NONE. Cross-link: tests
`tests/tablet-chart-av.test.js` + `tests/tablet-chart-editor-flow-simulate.jsx`.

### AV102 — Image transport MUST normalize to a data URL + tablet MUST load a late template (2026-05-21 bugfix)

The chart-editor relay transports image bytes via Storage with
`uploadString(ref, x, 'data_url')`, which **throws `storage/invalid-format` if `x`
is not a `data:` URL**. Two boundaries were wrong (user-reported "ไม่ขึ้นรูป" + PC
"เริ่มการเชื่อมต่อไม่สำเร็จ"):

1. **A model `imageUrl` is NOT a data URL.** `defaultChartTemplates` store public-asset
   PATHS (`/chart-templates/face-female.svg`). Every image transported via
   `uploadTransportImage` MUST go through `resolveToDataUrl` (data: → passthrough /
   fetchable path → fetch+convert / blank → null). NEVER pass a model `imageUrl`
   straight to `uploadString('data_url')`.
2. **Instant-pop race.** The tablet's Q4 listener fires on the `requested` doc BEFORE the
   PC finishes the template upload, so `templateImageUrl` arrives a moment later. The
   tablet's ongoing `listenToChartEditSession` callback MUST load a late-arriving /
   changed `templateImageUrl` (read-once-at-open = silent blank canvas).

3. **The PC saved-merge MUST NOT hang.** The `useChartEditSession` SAVED handler awaits a
   result download; an un-guarded `await` there left the PC stuck on "รอการบันทึกจากแท็บเล็ต"
   forever after the tablet had already saved (download throw → callback rejects → phase
   never leaves 'waiting'; the doc is never deleted). Wrap the download in try/catch →
   surface a failure phase + ALWAYS teardown + free the tablet; only `setPhase('idle')` when
   the merge actually completed.
4. **The requested-session listener MUST pick the NEWEST session**, not an arbitrary
   `snap.docs[0]` (the query has no orderBy). A stale 'requested' doc must not be opened
   instead of the PC's just-created one (→ PC waits on a session the tablet never touches).
6. **The pen canvas MUST render the template at its TRUE aspect ratio.** `PenCanvas` sizes
   its drawing buffer to the image's real `naturalWidth/Height` and the element uses CSS
   `max-width/max-height:100%` (contain) — NEVER a fixed buffer + `width/height:100%` (which
   stretches every template to the screen ratio; body templates are 1:2, faces 4:5). The
   working reference is `ChartCanvas` (PC edit-here) which already fits-to-ratio. Buffer
   ratio == display ratio keeps pointer coords uniform.
5. **The Storage bucket MUST have a CORS config allowing the app origin (or `*`) for GET.**
   `downloadTransportImageAsDataUrl` browser-`fetch()`es a `firebasestorage.googleapis.com`
   download URL — with `cors:null` (the default), the browser BLOCKS it → iPad template
   blank + PC "รับรูปจากแท็บเล็ตไม่สำเร็จ". This is the FIRST app feature to browser-fetch
   Storage (everything else stored data URLs in Firestore), so CORS was never configured.
   The download TOKEN is the access control; CORS only governs which origins may read the
   response, so `origin:['*']` for GET/HEAD is safe. **The Node L2 e2e CANNOT catch this**
   (Node has no CORS) — verify in a real browser. Set/verify via `scripts/set-storage-cors.mjs`.

**Grep target (regression)**: `uploadTransportImage` body references `resolveToDataUrl`;
`TabletChartEditorPage` openSession listener checks `live.templateImageUrl !== loadedUrl`;
no `uploadString(.*'data_url')` is fed a `*.imageUrl`/path directly; the SAVED handler in
`useChartEditSession` wraps `downloadTransportImageAsDataUrl` in try/catch + always
`teardown()`; `listenToRequestedSessionForTablet` sorts by `createdAt` desc (no bare
`snap.docs[0].data()`).
**Sanctioned exception**: the result upload passes a canvas `toDataURL()` (already a
data: URL → `resolveToDataUrl` passthrough, no fetch). Cross-link: tests
`tests/tablet-chart-template-transport.test.js`. **Class**: V66 mock-shadow (fixtures used
data URLs; the real producer supplied paths) + read-once-vs-live (instant-pop race).

### AV103 — Tablet chart result MUST transport fabricJson (lossless object data), never `fabricJson: null` (2026-05-21 more-tools)

The more-tools tablet editor (Fabric v7 object model) saves a flattened PNG **and** the full
`fabricJson` so the merged `charts[]` entry is lossless / re-editable-ready — not a flat
throwaway image. Two boundaries enforce it:

1. **The tablet `onSave` MUST upload BOTH** the PNG (`uploadTransportImage`) AND
   `canvas.toJSON()` via `uploadTransportJson(sessionId, 'result', ...)`, and set
   `resultFabricJsonUrl` on the session doc (alongside `resultImageUrl`).
2. **The PC `useChartEditSession` SAVED handler MUST download `resultFabricJsonUrl`** (guarded —
   returns null on failure, never hangs) and pass the **real** `fabricJson` to `onSaved`. It MUST
   NOT hard-code `fabricJson: null` for a tablet result (that throws away every object the
   clinician drew → the chart can't carry per-tool edits to the PC).

**Grep target (regression)**: `TabletChartEditorPage` `onSave` references `exportFabricJson` +
`uploadTransportJson` + `resultFabricJsonUrl`; `useChartEditSession` references
`downloadTransportJson` + `resultFabricJsonUrl` and does NOT match `/fabricJson:\s*null/`; the
page imports `TabletChartCanvas` (not `PenCanvas`); `TabletChartCanvas` exposes `exportFabricJson`
+ `deleteSelected` and rides Fabric `mouse:*` via `getScenePoint` (no raw upperCanvasEl
listeners). **Sanctioned exception**: `downloadTransportJson` returns null when
`resultFabricJsonUrl` is absent OR the fetch fails → `fabricJson` stays null (a blank/legacy
result legitimately has no object data; the PNG still merges). Cross-link: tests
`tests/tablet-chart-more-tools.test.js` (U3) + `tests/tablet-chart-more-tools-flow-simulate.test.jsx`
(F1/F2). **Class**: lossless-transport — every drawing tool's object must survive the relay to
the PC (user mandate "ไม่มีเครื่องมือไหน ... ส่งไป pc แล้วไม่ติดการ edit").

**AV103 follow-up (2026-05-21 more-tools-fix5 — object-level RE-EDIT completion)**: transporting
the fabricJson is pointless if re-edit ignores it. Three more boundaries: (1) BOTH canvases export
via `serializeFabricCanvas` (in `tabletChartTools.js`) which embeds `canvasWidth`/`canvasHeight` —
fabric objects carry absolute coords, so re-edit MUST recreate the SAME-sized canvas or objects
misplace; (2) `ChartCanvas` re-edit MUST consume the fabricJson object-level (`isObjectLevelReeditable`
→ `loadFromJSON(reeditJson)` at the saved dims, re-lock object[0] template) when present, falling
back to the PNG-background raster path ONLY when there's no re-editable json (legacy / pre-storage-
deploy null); (3) the OPD persist MUST go through `chartEntryForPersist` (size guard) — the chart
PNG dataUrl + fabricJson are BOTH inlined into the `be_treatments` Firestore doc (~1MB cap), so an
oversized fabricJson (big embedded template) is DROPPED (PNG always kept → the treatment save NEVER
breaks; that chart re-edits as raster). **Grep**: `ChartCanvas.jsx` has `isObjectLevelReeditable` +
`loadFromJSON(reeditJson)`; `serializeFabricCanvas(canvas)` in ChartCanvas + `serializeFabricCanvas(fcRef.current)`
in TabletChartCanvas; `TreatmentFormPage.jsx` persists via `.map(chartEntryForPersist)`. Cross-link:
`tests/chart-relay-roundtrip.test.js` (U1-U3 + SG1-SG3 + F1) + `scripts/e2e-chart-relay-roundtrip.mjs`
(real-prod 14/0). **Known limit (pre-existing, NOT this feature)**: a single chart PNG dataUrl that
ALONE exceeds ~1MB still risks the Firestore doc cap — inlining chart images in the doc is the
pre-existing design; Storage-ref is the architectural follow-up (see V-log). The size guard prevents
the NEW fabricJson from compounding it.

### AV104 — Fabric canvas editor components MUST paint via SYNCHRONOUS renderAll, never the rAF-deferred request-render path (2026-05-21 more-tools-fix3)

A Fabric canvas/editor component that paints via the rAF-deferred request-render path
(`fc.requestRenderAll()`) can render NOTHING on screen on devices/contexts where
`requestAnimationFrame` is unreliable — throttled, a stuck `nextRenderHandle`, or simply not
firing (backgrounded/throttled tab, some iOS-Safari editor states, headless browsers). The
object model stays correct, so `toDataURL()` save (which renders to a FRESH canvas, bypassing the
on-screen render) still produces the right image — masking the bug. Net symptom: **blank live
canvas (template + every stroke invisible) but a correct save** — the EXACT user report.

**Rule**: in `src/components/**/*Canvas*.jsx` (Fabric editor components), every on-screen paint
MUST be a synchronous `renderAll()`. The rAF-deferred `requestRenderAll` is FORBIDDEN — sync
render is rAF-independent so it always reaches the screen. Mirror the proven PC `ChartCanvas`.

**Grep target (regression)**: no `requestRenderAll` token (call OR prose) in
`TabletChartCanvas.jsx`; `fc.renderAll(` appears ≥15×; `ChartCanvas.jsx` (the reference) has 0
`requestRenderAll` + ≥4 sync `.renderAll(`. **Sanctioned exception**: NONE — perf-sensitive
high-frequency renders (pen-move) still use sync renderAll (the chart is light; correctness >
micro-perf; optimize the path, never re-introduce rAF). Cross-link: tests
`tests/tablet-chart-more-tools-flow-simulate.test.jsx` (RC6/RC7/RC8). **Class**: rAF-dependent
on-screen render (object-model-correct + save-correct masks a never-painting live canvas) —
verified at the rendered-pixel level in a real browser at dpr=2 (V66: pixels, not object model).

### AV105 — A Fabric-wrapped canvas element MUST NOT set an inline CSS `background` (Fabric copies it to the opaque upper-canvas) (2026-05-21 more-tools-fix4)

Fabric v7 wraps the React-owned `<canvas>` in a `.canvas-container` and creates an **upper-canvas
(interaction layer) absolutely positioned ON TOP of the lower-canvas — and it COPIES the lower
canvas element's inline `style` (including `background`) to that upper-canvas**. So an inline
`background:#fff` (or any opaque color) on the canvas element becomes an **opaque upper-canvas that
covers everything painted on the lower-canvas** → blank-color screen, while the lower-canvas backing
+ `toDataURL()` save stay correct (the on-device "blank live canvas + correct save" symptom).

**Rule**: a Fabric-managed canvas element (in `src/components/**/*Canvas*.jsx`) MUST NOT set an
inline CSS `background`. The canvas fill comes from Fabric `backgroundColor` (paints the LOWER
canvas backing), never a CSS background on the element. Mirror the proven PC `ChartCanvas`
(`<canvas className="shadow-lg" />`, no inline background).

**Grep target (regression)**: the `return <canvas ... />` element in `TabletChartCanvas.jsx` has no
`background`; `new fabric.Canvas(... backgroundColor: '#fff' ...)` present; `ChartCanvas.jsx` canvas
element has no inline background. **Sanctioned exception**: NONE. Cross-link: tests
`tests/tablet-chart-more-tools-flow-simulate.test.jsx` (RC9/RC10/RC11). **Class**: CSS-on-the-
Fabric-element leaks to the upper-canvas cover (object-model-correct + save-correct masks an
on-screen cover) — proven in a real browser (WITH inline bg → upper-canvas computed white = cover;
WITHOUT → transparent). Companion to AV104 (both = "live canvas blank, save correct", different
mechanism: AV104 = never-painted, AV105 = painted-but-covered).

### AV106 — Tablet chart shape commit MUST use the DRAG DELTA (not object-type geometry introspection); text creation MUST leave the object selectable-with-handles (not auto-enter editing) (2026-05-21 tool-bugs)

`TabletChartCanvas.commitShape` decides "tiny" (discard) per shape. The line/arrow branch MUST use the
drag delta `Math.hypot((s.ex ?? s.sx) - s.sx, (s.ey ?? s.sy) - s.sy)` — NOT `o.x1/o.x2` (fabric.Line
props): the arrow is a `fabric.Group` with no x1/x2/y1/y2 → introspecting them yields 0 → every arrow is
wrongly "tiny" → removed on mouse:up (shows during drag, vanishes on release). Drag-delta is
geometry-agnostic across the Line AND the arrow Group. **Class-of-bug**: a polymorphic shape set must
not commit/measure via type-specific geometry introspection — measure the GESTURE, not the object.
Also: `addText` MUST leave the new textbox SELECTED with handles (mirror the proven PC `ChartCanvas`),
NOT auto-`enterEditing` — editing mode sets `hasControls=false` → no resize/move handles → the user
cannot set the box width or reposition it. Grep: `commitShape` has `dragDist` + NOT `Math.hypot((o.x2`;
`addText` has no `enterEditing`/`selectAll`. Sanctioned exceptions: NONE. Regression:
`tests/tablet-chart-tool-bugs.test.jsx` TB1/TB2. Verified L1 (real browser, fc.fire driving handlers).

### AV107 — Tablet chart gesture (pinch/pan) listeners MUST be CAPTURE-phase on the OWNED wrapper, NEVER raw listeners on `fc.upperCanvasEl` (iPad black-screen) (2026-05-21 zoom re-ship)

The reverted `e36a73e9` zoom feature attached `fc.upperCanvasEl.addEventListener('pointerdown/move/up/cancel', …)` — **raw pointer listeners on Fabric's OWN interaction canvas**. On iPad/WebKit those conflict with Fabric's native trusted-touch pipeline → **black screen on 2-finger zoom** (reverted, Rule A; desktop could NOT repro — a mouse skips Fabric's touch path, so "verified in a real browser" was desktop-only = a V66 gap).

**Rule**: the tablet canvas pinch/pan gesture listeners MUST live CAPTURE-phase on an element WE OWN — the wrapper `surf = wrapRef.current` (the page flex container, an ancestor of Fabric's elements) — with `surf.style.touchAction='none'` and `ev.stopPropagation()` during a pinch/1-finger-pan so the multitouch NEVER reaches Fabric (Fabric stays in a clean single/no-touch state while we drive `viewportTransform`). Single touch / pen are NOT stopped → they fall through to Fabric's `mouse:*` pipeline (draw/select/erase). NEVER `addEventListener` on `fc.upperCanvasEl` (or `fc.wrapperEl`). `getScenePoint` keeps tool coords correct under zoom.

**Grep target (regression)**: `TabletChartCanvas.jsx` has `const surf = wrapRef.current;` + `surf.addEventListener('pointerdown', …, { capture: true })` + `surf.style.touchAction = 'none'` + `ev.stopPropagation()`; MUST NOT match `upperCanvasEl.addEventListener` or `const elc = fc.upperCanvasEl`. **Sanctioned exception**: NONE. Cross-link: `tests/tablet-canvas-zoom-palm-flow-simulate.test.js` F4. **Class**: never attach raw listeners to a library's OWN element when that library runs a trusted-input pipeline on it (Fabric on iPad) — use an owned ancestor + capture-phase + selective stopPropagation. (Defensive — the upperCanvasEl-listener conflict was the original *unconfirmed lead*; PART B below is the *confirmed* cause.)

**PART B — the CONFIRMED iPad black-screen cause (React/Fabric `insertBefore` crash, reproduced + fixed on desktop 2026-05-21):** any conditional React sibling of a Fabric-wrapped `<canvas>` (e.g. the ⤢ fit button, shown when `zoomed`) MUST render AFTER the canvas (last child) so React APPENDS it — NEVER before it. Fabric wraps the React-owned `<canvas>` in a `.canvas-container`, so the canvas is no longer a direct child of the flex div. With the button BEFORE the canvas, React calls `surf.insertBefore(button, canvasNode)` when `zoomed` flips true → **`NotFoundError: ... not a child of this node`** → React unmounts the whole tree → BLANK SCREEN. This is the actual iPad "black screen on 2-finger zoom" (the zoom flips `zoomed` true → the button mounts → crash). **Reproduced on DESKTOP via a synthetic 2-touch pinch** (Chrome MCP — the gesture layer doesn't gate on `isTrusted`, so it drives the real zoom → real onZoomChange → real button mount → the crash), and the fix (button last child → append) **verified the same way** (pinch → 4× zoom + fit button + NO crash + reset). **Grep**: in `TabletChartEditorPage.jsx`, `indexOf('<TabletChartCanvas') < indexOf('data-testid="zoom-fit"')`. Cross-link: `tests/tablet-canvas-zoom-palm-flow-simulate.test.js` F5. **Class** (same family as the §followup init-once fix): React must not be left managing siblings positioned *before* a DOM node a library has re-parented — append-only, or wrap the canvas in a stable React-owned host div. **A synthetic-input repro of YOUR OWN gesture layer (which doesn't check isTrusted) is a legit desktop L1 for the zoom logic + the React-mount crash — the only piece still needing on-device L1 is the Fabric *trusted-touch pipeline* itself (PART A).**

### AV108 — Staff-chat images MUST live under the per-message Storage folder + retention/orphan sweep MUST prefix-delete (no orphan; admin-SDK-only delete) (2026-05-22 multi-image)

Multi-image staff chat (Q1 auto-retention-only, Q3 delete whole message+images, Q4 30d, ≤10/msg). Each image's thumbnail + original live under `staff-chat-attachments/{branchId}/{messageId}/{imgId}-{t|o}.{ext}` (per-message folder), so deletion is a PREFIX-SWEEP that CANNOT leave a stray file behind (user mandate "ลบให้เกลี้ยง … make sure ลบจริงหายจริง").

**Rule**: (a) every staff-chat image write goes under `{branchId}/{messageId}/` via `staffChatImagePaths` (root from the shared `STAFF_CHAT_STORAGE_ROOT`); (b) the retention cron `sweepStaffChatRetention` deletes a message's images via `bucket.getFiles({ prefix: storagePrefixForMessage(...) })` (Pass A age-out >30d) + sweeps doc-less folders older than the grace window (Pass B orphan = abandoned uploads); (c) legacy scalar `attachmentUrl` files are cleaned via `extractStoragePathFromUrl`; (d) deletes are ADMIN-SDK ONLY — `storage.rules` + `firestore.rules` keep `update,delete: if false` for the client (defense-in-depth). `buildMessageDoc` normalizes attachments Firestore-undefined-safe (V14) + caps at `STAFF_CHAT_MAX_IMAGES`.

**Grep target (regression)**: `staffChatImageResize.js` builds `${branchId}/${messageId}/`; `api/cron/staff-chat-retention-sweep.js` uses `getFiles({prefix`, `storagePrefixForMessage`, `isOrphanFolder`, `extractStoragePathFromUrl`, `CRON_SECRET`; `storage.rules` staff-chat-attachments `< 50 * 1024 * 1024` + `allow update, delete: if false`; `firestore.rules` `get('attachments', []) is list … <= 10`; NO `deleteObject` in any staff-chat client file. **Sanctioned exception**: NONE. Cross-link: `tests/staff-chat-multi-image.test.js` (G5 source-grep) + `scripts/e2e-staff-chat-image-retention.mjs` (Rule Q L2 real-prod deletion proof). **Class**: when files are deleted by a cascade, group them under ONE deletable prefix so the sweep can't miss one; never trust the client to delete (admin-SDK only). **VERIFIED real prod 2026-05-22 (Rule Q L1/L2 + Q-vis)**: sweep `deletedFiles:12 → getFiles=0 + doc gone`; real client multi-image send + grid + full lightbox all screenshot-confirmed; NO bugs.

**(2026-05-22 any-file extension)**: staff chat now sends ANY file type ≤1GB (images ≤50MB). `storage.rules` uses a SPLIT cap (`image/* < 50 * 1024 * 1024` OR `!image/* < 1024 * 1024 * 1024`) — the per-message folder + prefix-sweep retention is UNCHANGED + file-type-agnostic (a 1GB video is swept exactly like a thumbnail). Render kind is derived client-side via `attachmentKindFor(mime)` (`staffChatRetentionCore.js`): image→grid+lightbox · `video/*`→inline `<video>` · `audio/*`→inline `<audio>` · `application/pdf`→PDF overlay · else→download card. `image` is limited to jpeg/png/webp/gif so a HEIC/SVG never produces a broken `<img>`. The attachment record gains a `name` field (download filename); `normalizeStaffChatAttachment` defaults missing mime to `application/octet-stream` + omits thumb/w/h for non-image kinds. Upload via `uploadStaffChatFile` (resumable + `registerTask` for per-file cancel + retry; Q3). NEW grep: `attachmentKindFor` in `StaffChatMessage.jsx` + `StaffChatAttachmentCard.jsx`; `storage.rules` split `contentType.matches('image/.*') … < 50 * 1024 * 1024` + `!…matches('image/.*') … < 1024 * 1024 * 1024`; shared `downloadUrlAsFile` (`staffChatDownload.js`, Rule of 3: lightbox + card + overlay; >100MB → new-tab to avoid a 1GB in-memory blob). Cross-link: `tests/staff-chat-any-file.test.js` (AF1-AF5) + `scripts/e2e-staff-chat-any-file.mjs` (Rule Q L2). **AV78 update**: `StaffChatImageLightbox` left the AV78 sanctioned-lightbox list (now ✕/Esc-only normal modal); NEW `StaffChatPdfOverlay` also explicit-close.

**(2026-05-22 office = DOWNLOAD-ONLY; preview = pdf + image/video/audio)**: in-browser Word/Excel/PPT preview was attempted (MS Office Online viewer → then client-side SheetJS/mammoth) and REVERTED per user — office files are DOWNLOAD-ONLY (no 👁). The MS viewer failed for Firebase URLs ("เอกสารไม่สามารถเข้าถึงได้แบบสาธารณะ" even though server-fetch = 200) + would transmit patient files to Microsoft; the client-side render path was dropped to keep the surface lean. PDF previews via native `<iframe>` (CORS-exempt, local); image → lightbox, video/audio → inline. **INVARIANT**: NO 3rd-party document viewer in staff-chat (`view.officeapps` / `docs.google.com/viewer` / `gview`) — patient files must NOT leave to a 3rd party; office preview stays download-only unless a PRIVATE client-side renderer is added. Source-grep: `StaffChatAttachmentCard.jsx` preview is gated to `isPdf`; neither it nor `StaffChatPdfOverlay.jsx` may match `officeapps|docs\.google\.com\/(viewer|gview)`. Cross-link: `tests/staff-chat-any-file.test.js` (AF5).

**(2026-05-22 EOD+2 — Office preview SHIPPED via in-project Gotenberg Cloud Function — sanctioned exception #1)**: The "office = download-only" baseline (above) is now amended with ONE sanctioned exception: a Firebase Cloud Function 2nd Gen running `gotenberg/gotenberg:8` Docker image (bundles LibreOffice 24.x + Chromium) — located at `functions/officeToPdf/` — converts Word / Excel / PowerPoint / CSV to PDF on Storage `onObjectFinalized`, caches the PDF at the same `staff-chat-attachments/{branchId}/{messageId}/` prefix as the original (so V73 30d retention sweep cleans both files together — zero new cron), then patches `be_staff_chat_messages/{messageId}.attachments[i].pdfPreview*` fields. The card UI (`StaffChatAttachmentCard.jsx`) shows ⏳ while `pdfPreviewStatus === 'pending'`, then 👁 once `'ready'` (opens the EXISTING `StaffChatPdfOverlay` with `pdfPreviewUrl` — our cached PDF, NOT the original Office file), or ⚠ with Thai-language tooltip on `'failed'`. **PHI never leaves the GCP project**: LibreOffice runs LOCALLY on `localhost:3000` inside the Cloud Run container; NO external HTTP call during conversion (no MS Office Online / Google Docs Viewer / Aspose Cloud / ConvertAPI / CloudConvert / MS Graph DriveItem convert). The "no 3rd-party doc viewer" rule continues to apply EVERYWHERE ELSE.

**Sanctioned exceptions (closed list of 1)**:
- `functions/officeToPdf/` — the bundled Gotenberg Cloud Function, the ONLY code path allowed to invoke any conversion service, AND only via `http://localhost:3000/forms/libreoffice/convert` (the in-container Gotenberg). External hosts in `functions/officeToPdf/index.js` = AV108 violation.

**Source-grep regression** (`tests/audit-av108-office-preview-exception.test.js`):
- Client `src/` MUST NOT match `/officeapps|docs\.google\.com\/(viewer|gview)/`, `/mammoth|docx-preview|docx2html/`, `xlsx` import/require, `/(aspose|cloudconvert|convertapi)\.com/`, `/graph\.microsoft\.com\/v1\.0\/.+\/convert/`
- Cloud Function `functions/officeToPdf/index.js` MUST match `http://localhost:3000/forms/libreoffice/convert` AND MUST NOT match any external doc-converter host

**Rule of 3 NOTE**: `OFFICE_CONVERTIBLE_MIMES` + `OfficePreviewStatus` exist in TWO places — the canonical `src/lib/staffChatOfficePreviewCore.js` (used by client UI + send-path stamp) AND the duplicated `functions/officeToPdf/helpers.js` (used by the Cloud Function gate + status constants). Duplication is sanctioned at the deploy boundary (the Cloud Function deploys as a self-contained npm package and cannot reach `../../src/lib/...`). Both files MUST stay in lock-step — any change to the 7 MIMEs or the 4 status constants requires updating BOTH.

**Cross-link**: spec `docs/superpowers/specs/2026-05-22-staff-chat-office-preview-design.html` + plan `docs/superpowers/plans/2026-05-22-staff-chat-office-preview.html` + tests `tests/staff-chat-office-preview-core.test.js` (T1) + `tests/staff-chat-office-pending-stamp.test.js` (T2) + `tests/staff-chat-office-card-rtl.test.jsx` (T3) + `tests/staff-chat-office-cloud-function-helpers.test.js` (T4) + `tests/staff-chat-office-preview-flow-simulate.test.jsx` (T6) + `tests/audit-av108-office-preview-exception.test.js` (T7) + `tests/staff-chat-office-preview-source-grep.test.js` (T8). Rule Q L1 + L2 verification gated on deploy (`scripts/e2e-staff-chat-office-preview.mjs` — T9 ready-to-run).

### AV109 — Cloud Functions + admin-SDK test fixtures touching `be_staff_chat_messages` MUST use the Rule M canonical path (NOT bare collection name) — silent Firestore-patch no-op when bare (2026-05-23 V108 office-preview stuck-pending)

**Root bug**: the new office-preview Cloud Function (`functions/officeToPdf/index.js`) used `db.collection('be_staff_chat_messages').doc(messageId)` — bare collection name. But the client writes to the Rule M canonical path `artifacts/${APP_ID}/public/data/be_staff_chat_messages` (`backendClient.js:2704`). The Cloud Function ran successfully — Gotenberg/LibreOffice converted the .docx, the cached PDF was saved at the correct Storage path with `contentType=application/pdf` — but `tx.get(messageRef)` returned `!snap.exists` on every real message → silent `console.warn('message not found')` → returned without patching → status stayed `pending` forever → 60s Path B fired → user-visible ⚠. 4 attachments confirmed stuck in real prod; 2 had cached PDFs already (proving the function ran, just couldn't patch).

**V66 mirror amplifier**: the L2 verify scripts (`diag-office-preview-comprehensive.mjs`, `diag-office-preview-deploy-verify.mjs`, `e2e-staff-chat-office-preview.mjs`) ALL wrote their test fixtures at the SAME bare path → they agreed with the function's bug → reported "11/11 verified" while real-prod user uploads stuck pending. Classic test-vs-code-shared-wrong-assumption (V66 family).

**Reference (correct)**: pre-existing `functions/index.js` (FCM push) uses `BASE_PATH = artifacts/${APP_ID}/public/data` — the right pattern existed in the same repo and was not followed.

**Rule**: (a) every Cloud Function read/write that targets a `be_*` collection (and especially `be_staff_chat_messages`) MUST construct the doc path as `artifacts/${PROJECT_ID}/public/data/{collection}/{id}` (NOT bare collection name); (b) every admin-SDK test fixture script that writes a fixture message MUST use the SAME canonical path — if the fixture lives at the wrong path, passing tests prove nothing; (c) the canonical path constant should be named with `_PATH` suffix (not `_COLLECTION`) to signal it's a doc-path, not a collection-name (`MESSAGES_COLLECTION_PATH`, not `MESSAGES_COLLECTION`).

**Grep target (regression — `tests/v108-office-preview-canonical-path.test.js`)**: `functions/officeToPdf/index.js` MUST match `artifacts/\$\{PROJECT_ID\}/public/data/be_staff_chat_messages` AND MUST NOT match `db\.collection\(['"]be_staff_chat_messages['"]\)|db\.doc\(['"]be_staff_chat_messages\/`. Same applies to all 3 L2 verify scripts.

**Sanctioned exception**: NONE. Cloud Functions that touch production data MUST use canonical path.

**Class**: V15 #22 Phase 19.0 bare-collection-path bug at the Cloud-Function-boundary + V66 mirror at the L2-test-boundary. Both fixes ship together because either alone is insufficient: the code fix without the test fix means future L2 verifies could re-introduce the V66 mirror.

**Cross-link**: V109 V-entry in `.claude/rules/00-session-start.md` § 2 + verbose `.claude/rules/v-log-archive.md`. Tests `tests/v108-office-preview-canonical-path.test.js` (V108.A1-A4 + B1-B3 + C1-C3). Diag `scripts/diag-2-8mb-stuck-attachments.mjs` (Rule R, read-only, shows current Firestore + Storage state). Rule M one-shot heal `scripts/v108-heal-stuck-office-attachments.mjs` (patches docs that already have cached PDFs).

### AV110 — Office preview Cloud Function MUST install free Thai fonts + Cordia/Browallia/Angsana fontconfig alias + LibreOffice Word-compat XCU (2026-05-23 V110 font-fidelity)

User reported (side-by-side screenshots, ours-vs-Word): "การจัดเรียงเกือบจะเหมือน word แต่ขาดนิดนึง". Root cause: user's docx theme1.xml declares `<a:font script="Thai" typeface="Cordia New"/>` (Cordia is the default Word Thai theme font); Gotenberg base ships only Noto Sans Thai → LibreOffice substitutes → different character widths → line-wrap doesn't match Word.

**Rule**: every redeploy of `functions/officeToPdf/` Dockerfile MUST:
1. `apt-get install -y fonts-thai-tlwg fonts-thai-tlwg-otf fontconfig` (TH Sarabun PSK + Loma + Garuda + Norasi + 7 more free Thai fonts)
2. `COPY fontconfig-thai.conf /etc/fonts/conf.d/99-thai-substitute.conf` (strong-binding aliases: Cordia/Browallia/Angsana + UPC variants → Loma/Garuda/Norasi metric-equivalents)
3. `RUN fc-cache -f` after the COPY so LibreOffice picks up aliases
4. `COPY libreoffice-compat.xcu /home/gotenberg/.config/libreoffice/4/user/registrymodifications.xcu` (16 Word-compat flags: UsePrinterMetrics, AddSpacing, UseLineSpacing, NoExtLeading, MsWordCompTrailingBlanks, CTLFont default-on, etc.) + `chown gotenberg:gotenberg`
5. `functions/officeToPdf/fontDetector.js` MUST be imported by `index.js` and called pre-conversion to log `declared/theme/installed/missing/aliased` for observability

**Honest scope** (must communicate to user): 100% pixel-perfect match between LibreOffice + MS Word is **engine-bound**, not font-bound — different render algorithms for Thai CTL even with identical fonts. Best achievable ~85-95% visual similarity. Cordia New / Browallia New / Angsana New / UPC family cannot be installed (Microsoft proprietary). Industry-wide limit (every Slack/Discord/Box/etc. Office preview pipeline hits the same wall). For Word-exact formatting, the ⬇ download remains source-of-truth.

**Grep target (regression — `tests/v110-font-detector.test.js`)**: `functions/officeToPdf/Dockerfile` MUST match `fonts-thai-tlwg`, `fontconfig-thai.conf`, `libreoffice-compat.xcu`, `fc-cache`, `chown.*gotenberg`. `functions/officeToPdf/fontconfig-thai.conf` MUST map `Cordia New → Loma`, `Browallia New → Garuda`, `Angsana New → Norasi` with `binding="strong"`. `functions/officeToPdf/libreoffice-compat.xcu` MUST set `UsePrinterMetrics + AddSpacing + UseLineSpacing + NoExtLeading + MsWordCompTrailingBlanks + CTLFont = true` with `oor:op="fuse"`. `functions/officeToPdf/index.js` MUST import `analyzeFontRequirements` + call it pre-conversion in a try/catch (non-fatal observability).

**Sanctioned exception**: NONE. Removing any of fonts-thai-tlwg / fontconfig-thai.conf / libreoffice-compat.xcu / fontDetector wiring is an AV110 violation.

**Cross-link**: V110 V-entry in `.claude/rules/00-session-start.md` § 2. Spec discussion + user choices in chat transcript 2026-05-23 EOD+1 LATE. Tests `tests/v110-font-detector.test.js` (23/0: A1-A5 Dockerfile + B1-B4 fontconfig + C1-C3 fontDetector + D1-D5 index.js wiring + E1 package.json + F1-F5 compat XCU). Diag scripts `scripts/diag-docx-font-inspect.mjs` (Rule R: extract font specs from any docx) + `scripts/diag-v110-convert-user-docx.mjs` (post-deploy real-prod verify) + `scripts/diag-compare-pre-post-v110.mjs` (md5 diff). Rule M heal NOT needed (V110 affects future conversions only; past stuck docs healed via V109).

### AV111 — Course buy-fetchers MUST propagate `receipt_course_name` → `receiptCourseName` onto purchasedItem; receipt renderer MUST prefer `receiptCourseName` over `name` (2026-05-23 EOD+1 LATE V111 receipt name override)

User reported (screenshot, INV-20260520-0010): admin set `receiptCourseName="ขลิบเลเซอร์ Sleeve เทคนิค (ไม่ดมยาสลบ)"` in the course edit modal (field "ชื่อคอร์ส (แสดงในใบเสร็จ)"), but the receipt still printed the original `courseName`. Bug class: data-stored-but-consumer-ignores at the snapshot boundary — V47 family display-layer multi-reader-sweep at the RECEIPT-RENDER boundary.

**Rule**: every COURSE buy-fetcher mapper (a function that builds a picker item OR a purchasedItem from the canonical course shape) MUST:
1. Read `shape.receipt_course_name` (snake_case canonical mapper output from `beCourseToMasterShape`, V44).
2. Write it onto the mapped item as `receiptCourseName` (camelCase client convention).
3. Carry it verbatim through every downstream mapper (confirmBuy → grouped → createBackendSale spread) without normalization (an empty string `''` IS the no-override sentinel; falsy fallback handles it).

Every RECEIPT renderer (`SalePrintView`, `QuotationPrintView`, and any future customer-facing print of sale/quotation course lines) MUST:
1. Place `c.receiptCourseName` FIRST in the `name` fallback chain.
2. Fall back to `c.name || c.courseName || c.courseId || ''` (sale) or `x.courseName || x.courseId` (quotation) for legacy sales pre-V111 + courses without the override.

**Architecture (Option β — receipt-only, snapshot-at-write)**:
- Parallel field — `name` stays original for non-receipt consumers (customer.courses[] admin display, treatment dropdowns, reports). Only the 2 receipt renderers prefer the override.
- Snapshot at write time — admin renaming the override later does NOT change historical receipts (legal-record integrity, analogous to sale `price` snapshot).
- Rejected: Option α (replace `name` outright) would change customer.courses admin display. Option γ (live-resolve at render) would retro-change historical receipts.

**Grep target (regression — `tests/v111-receipt-course-name-override.test.js`)**:
- `src/components/backend/SaleTab.jsx` loadOptions buy mapper MUST match `V111[\s\S]{0,500}receiptCourseName:\s*shape\.receipt_course_name`.
- `src/components/backend/SaleTab.jsx` confirmBuy MUST match `V111[\s\S]{0,400}receiptCourseName:\s*i\.receiptCourseName`.
- `src/components/TreatmentFormPage.jsx` loadOptions buy mapper MUST match `V111[\s\S]{0,500}receiptCourseName:\s*shape\.receipt_course_name`.
- `src/components/TreatmentFormPage.jsx` confirmBuyModal MUST match `V111[\s\S]{0,400}receiptCourseName:\s*i\.receiptCourseName`.
- `src/components/backend/QuotationFormModal.jsx` course entry builder MUST match `V111[\s\S]{0,500}receiptCourseName:\s*item\.receipt_course_name`.
- `src/components/backend/SalePrintView.jsx` grouped reader MUST match `c\.receiptCourseName\s*\|\|\s*c\.name`.
- `src/components/backend/SalePrintView.jsx` legacy flat reader MUST match `it\.receiptCourseName\s*\|\|\s*it\.name`.
- `src/components/backend/QuotationPrintView.jsx` course reader MUST match `x\.receiptCourseName\s*\|\|\s*x\.courseName`.

**Anti-regression**:
- `name: c.name || c.courseName || c.courseId || ''` (the exact pre-V111 SalePrintView line) MUST NOT match.
- `name: x.courseName || x.courseId, ...x` (the exact pre-V111 QuotationPrintView line) MUST NOT match.

**Sanctioned exception**: NONE. Every new course buy-fetcher OR receipt renderer added going forward MUST honor this rule. Adding a new customer-facing print of a course line item (e.g. an online-sale invoice, a tax receipt addendum) is a NEW renderer that MUST go through the same fallback chain — extend AV111's renderer list when that happens.

**Class-of-bug**: V47 family — display-layer multi-reader-sweep where the canonical shape carries a field that ALL consumers should honor but each consumer was wired separately. Same root cause family as Phase 28 chart fabricJson (transported but consumer ignored) and the §followup-5 ChartCanvas re-edit ignoring `existingData.fabricJson`. The fix pattern is universal: carry the parallel field through every mapper + add the override to the FRONT of the consumer's fallback chain + lock with source-grep regression.

**Cross-link**: V111 V-entry in `.claude/rules/00-session-start.md` § 2 + this AV111 entry + `tests/v111-receipt-course-name-override.test.js` (A1-A10 source-grep + B1-B3 canonical mapper contract + C1-C11 fallback chain + D1-D6 Rule I flow-simulate + E1 AV111 presence).

### AV112 — Sale write-paths MUST resolve customer identity at BOTH create + update chokepoints; empty caller-side customerName/HN with valid customerId MUST NEVER reach Firestore (2026-05-23 V112 update-path resolver + historical backfill)

User reported (INV-20260520-0010, with screenshot): receipt rendered "—" under ลูกค้า even though the sale's customerId resolves cleanly to a real customer doc. Rule R diag: `customerName="" customerHN=""` with `customerId="LC-26000074"` → `firstname="นิรุต" lastname="ชำนาญปรุ"` on the customer doc. createdAt === updatedAt → never edited; empty name was written at CREATE time (pre-V108 deploy window) AND would have been re-written empty by any subsequent edit because `updateBackendSale` was the missed sibling chokepoint.

**Rule**: every sale write path that accepts user-supplied customer identity (`customerName`, `customerHN`) MUST run a defensive resolver chokepoint:

1. **createBackendSale chokepoint** (V108, `backendClient.js:3115-3132`): when caller-side `customerName`/`HN` is empty AND `customerId` is present → resolve from `be_customers[customerId]` via `resolveCustomerDisplayName` / `resolveCustomerHN` (V105 canonical helpers) → stamp resolved value AFTER `_normalizeSaleData` spread so resolved wins.

2. **updateBackendSale chokepoint** (V112, `backendClient.js:3174-3243` — `_resolveSaleCustomerForUpdate`): same resolution as V108, plus a stricter contract: when caller-side is empty AND no `customerId` resolves (neither in patch nor existing doc), the helper MUST `delete patch.customerName` and `delete patch.customerHN` so `updateDoc` preserves the existing on-disk value rather than overwriting with empty string. This mirrors the V102 `branchId` defensive delete pattern at the same write-path.

3. **Both chokepoints are non-fatal**: a missing or unreadable customer doc leaves the patch as-is (try/catch swallow); the helper never breaks the write. V108's contract preserved verbatim in V112.

**Grep target (regression — `tests/v112-update-sale-customer-resolver-and-backfill.test.js`)**:
- `src/lib/backendClient.js` `updateBackendSale` body MUST contain `_resolveSaleCustomerForUpdate(` (A1).
- `src/lib/backendClient.js` MUST define `async function _resolveSaleCustomerForUpdate(saleId, data, patch)` (A2).
- The helper body MUST reference `customerDoc(cid)` AND `resolveCustomerDisplayName` (A3).
- The helper body MUST contain `delete patch.customerName` AND `delete patch.customerHN` for the no-customerId branch (A4 — protects against the empty-string clobber).
- The V112 marker comment "chokepoint extension of V108" MUST exist (A5).
- The helper invocation MUST happen BEFORE `updateDoc(saleDoc(saleId), patch)` (A6 — order matters; otherwise patch is committed with un-resolved empties).

**Anti-regression**: a future commit that removes `_resolveSaleCustomerForUpdate(` from `updateBackendSale`, or that drops the `delete patch.customerName/HN` branch, fails the test bank.

**Historical artifact backfill (V112 one-time Rule M)**: every sale doc with empty customerName/HN + valid customerId is backfilled via `scripts/v112-backfill-receipt-course-name-and-customer.mjs`. Forensic stamps `_v112BackfilledAt` + `_v112BackfilledFrom` + audit doc + idempotent (re-run with `--apply` yields 0 writes once stamped). Same script piggy-backs the V111 receipt-course-name backfill (Bug 2 — user explicit one-time override of snapshot semantic).

**Class-of-bug**: V12 multi-writer-sweep at sale-write-path family — V108 fixed one writer; V112 closes the sibling. Same class as V36-quater (multi-call-site) + V44 (canonical-mapper-bypass at buy-fetcher) + V49 (canonical-shape-mapper at picker-fetch) + V111 (display-layer multi-reader-sweep at receipt-render-boundary). The architectural backstop pattern: **every write-path chokepoint that accepts identity fields MUST run the resolver, AND the resolver MUST delete-rather-than-clobber when the resolution fails**. Without the delete, the resolver's safety becomes its own footgun (empty-string overwrites still happen for the failing branch).

**Sanctioned exception**: NONE. New sale-write paths added going forward (e.g. `convertQuotationToSale`, bulk-import endpoints, admin SDK ops) MUST follow the same chokepoint pattern. Extend AV112 enforcement when new write paths land.

**Cross-link**: V112 V-entry in `.claude/rules/00-session-start.md` § 2 + this AV112 entry + `tests/v113-receipt-live-resolve-and-update-resolver.test.jsx` § A+B (V112-A source-grep + resolver decision matrix; V112-B backfill tests DELETED with the script per V113 reset) + Rule R diag `scripts/diag-v112-sale-and-course-override.mjs` (read-only prod inspector — preserved as Rule R tool).

**HONEST CORRECTION (V113, 2026-05-23 EOD+1 LATE+1)**: V112 also shipped a Rule M backfill script `scripts/v112-backfill-receipt-course-name-and-customer.mjs` (V112-B) that admin-SDK-stamped `receiptCourseName` + `customerName` directly onto sale docs. User caught this as a Rule Q V66 / Q-vis violation ("ค** เข้าข้างตัวเองเหี้ยๆ ... ให้มึงใช้ระบบที่แก้ เจนใหม่ ไม่ใช่ dry run ไปแปะทีหลังแบบโกง") — the backfill produced "fixed-looking" receipts without changing the SYSTEM code path. **V113 superseded V112-B**: deleted the backfill script, reverted the stamps via `scripts/v113-revert-v112-backfill.mjs`, and implemented live-resolve at the renderer (V113-A SalePrintView, V113-B QuotationPrintView) per AV113. **V112-A code fix (updateBackendSale chokepoint) is PRESERVED** — it's a legitimate write-path snapshot-on-write resolver that keeps the doc data correct for non-renderer consumers (reports, exports, audit). V113 live-resolve handles the renderer concern separately.

### AV113 — Receipt + Quotation renderers MUST live-resolve master at render time; snapshot is fallback only (deleted-master defense) (2026-05-23 V113 live-resolve mandate)

Origin: V112-B Rule Q V66 / Q-vis violation. Admin-SDK backfill scripts that stamp display values onto persisted docs to "fix the display" are FORBIDDEN as the primary fix for any display bug. The system's RENDERER must do the work.

**Rule**: every customer-facing receipt / quotation / invoice / print-view renderer that displays a course name (or any other field that admin can rename on the master) MUST:

1. **Fetch the master at render time** via the canonical exported helper (`getCourse(id)` from `scopedDataLayer.js`, `getCustomer(id)`, etc.). Use `useState` + `useEffect` with a cancelled-flag guard to avoid late updates on unmount.

2. **Prefer LIVE over snapshot** in the fallback chain:
   - Priority 1: live master's field (e.g. `master.receiptCourseName`)
   - Priority 2: snapshot on the doc (V111 buy-fetcher write + V112-A update-resolver write)
   - Priority 3: original / id / empty
   - The snapshot survives ONLY as defensive fallback for the deleted-master case (master doc gone → renderer cannot live-resolve → falls through to what was stamped at write time → preserves display fidelity).

3. **Render snapshot synchronously on initial render** (before useEffect fires) so the receipt opens immediately. Switch to live value on next render once the master arrives. No skeleton/loading flash needed because snapshot is usually correct.

4. **Re-derive memoized rows** when liveCourses state updates (include `liveCourses` in the `useMemo` deps).

**Grep target (regression — `tests/v113-receipt-live-resolve-and-update-resolver.test.jsx`)**:
- `src/components/backend/SalePrintView.jsx` MUST import `{ getCourse, getCustomer }` from `scopedDataLayer.js` (C1).
- MUST import `{ resolveCustomerDisplayName, resolveCustomerHN }` from `customerDisplayName.js` (C2).
- MUST declare `[liveCourses, setLiveCourses]` + `[liveCustomer, setLiveCustomer]` useState (C3).
- MUST have a useEffect that calls `getCourse(...)` (C4) and `getCustomer(s.customerId)` (C5).
- MUST define `function liveReceiptName(courseLine)` that references `liveCourses` + `receiptCourseName` (C6).
- Grouped course row MUST use `name: liveReceiptName(c)` (C7).
- `rows` useMemo MUST include `liveCourses` in deps (C8).
- Customer header MUST chain `s.customerName || resolveCustomerDisplayName(liveCustomer) || ...` (C9).
- MUST NOT reference any V112-B backfill script (C10).
- Same shape mirrored to `QuotationPrintView.jsx` (D1-D6).

**Anti-regression (Rule Q V66 / Q-vis enforcement)**:
- An admin-SDK backfill script `scripts/v***-backfill-*.mjs` that writes display values onto a doc to "fix" a display bug is FORBIDDEN as the primary fix. Such scripts are caught by `tests/v113-*.F2` (V112-B script DELETED) and the AV113 grep above.
- New customer-facing renderers added going forward MUST use the live-resolve pattern. Adding a renderer that reads only from the sale snapshot without fetching the master = AV113 violation.

**Sanctioned exception**: NONE. The snapshot-only fallback is preserved IN-CHAIN, not as a separate code path. There is no scenario where a renderer can skip live-resolve and use snapshot exclusively (that's V112-B re-introduction).

**When snapshot semantic IS required** (separate from this rule): money fields (sale.billing.netTotal, sale.payment.channels[].amount, course price at time of purchase) MUST snapshot at write time and the renderer MUST NOT live-resolve. Those preserve accounting/audit integrity regardless of master changes. AV113 covers display-name fields only; money fields are out of scope.

**Class-of-bug**: Rule Q V66 / Q-vis violation family. Admin-SDK data patches to fix display = "เข้าข้างตัวเอง" / "โกง". The architectural answer is always to fix the RENDERER (system fix), not patch the data. AV113 codifies this discipline at the renderer-implementation boundary.

**Cross-link**: V113 V-entry in `.claude/rules/00-session-start.md` § 2 + this AV113 entry + `tests/v113-receipt-live-resolve-and-update-resolver.test.jsx` (A-G covering V112-A preservation + V113 live-resolve source-grep + pure helper unit + RTL with mocked fetch) + `scripts/v113-revert-v112-backfill.mjs` (one-time revert of the V112-B cheat) + user-memory `feedback_no_admin_sdk_backfill_to_fix_display.md` (lesson lock).

## Priority

**CRITICAL**: AV4 (leaked credentials), AV5 (admin uid leak), AV6 (open rules), AV13 (long-lived auth), AV15 (silent-swallow + missing token revoke), AV17 (list spread order — silent no-op), AV18 (migrate-fn zero-arity dropping branchId — silent zombie creation), **AV52 (backup file integrity — admin trusts the file before restore)**, **AV53 (autoBackupRef integrity gate — prevents wipe with stale/tampered backup)**, **AV54 (subcoll cascade — prevents orphan subcoll docs)**, **AV55 (72h-grace — prevents accidental safety-net deletion)**, **AV60 (React hook import drift — runtime crash takes down entire tree)**, **AV61 (chat fall-through MUST be NAKHON-gated — cross-branch user-visible leak)**, **AV62 (whole-system backup manifestHash integrity — tampered backup detection)**, **AV63 (whole-system cron CRON_SECRET gate + concurrency lock)**, **AV64 (whole-system retention discipline)**, **AV19 elevation V81 (whole-system Replace MUST autoBackupRef)**, **AV65 (V81-fix1: Firestore-native types MUST encode through encodeFirestoreData before JSON.stringify — silent Timestamp degradation in restore)**, **AV66 (V81-fix2: whole-system Replace mode MUST gate on password-reset ack + force reset emails — silent staff lockout prevention)**.
**HIGH**: AV2 (raw date input), AV3 (Math.random tokens), AV11 (N+1 reads), AV14 (silent cleanup), AV16 (source-grep alone for visual), AV29 (per-branch settings multi-reader-sweep — silent override loss), **AV77 (V82-fix2: transient workflow opt-out flag MUST be respected by ALL sibling tab-routing filters — silent wrong-tab routing)**, **AV78 (V83: modal backdrop click MUST NOT close — silent form-data loss / user trust damage)**, **AV79 (V83-followup-3: perm/tab mapping completeness — silent permission grant when adminOnly:true short-circuits requires)**, **AV101 (tablet chart editor isolation — TFP-untouched + closed writer list + images-via-Storage)**, **AV102 (image transport MUST normalize via resolveToDataUrl — model imageUrl is NOT a data URL; tablet MUST load a late templateImageUrl — instant-pop race)**, **AV103 (tablet chart result MUST transport fabricJson — never fabricJson:null; lossless per-tool round-trip to PC)**, **AV104 (Fabric canvas editor MUST paint via synchronous renderAll, never the rAF-deferred request-render path — blank live canvas + correct save when rAF is unreliable)**, **AV105 (Fabric-wrapped canvas element MUST NOT set an inline CSS background — Fabric copies it to the opaque upper-canvas which covers the lower-canvas → blank live + correct save)**, **AV106 (tablet shape commit MUST use the drag-delta, not object-type geometry — the arrow is a Group; text creation MUST leave resize/move handles, not auto-enter editing)**, **AV107 (tablet gesture listeners MUST be capture-phase on the OWNED wrapper + stopPropagation isolation, NEVER raw listeners on fc.upperCanvasEl — iPad black-screen on 2-finger zoom)**, **AV108 (staff-chat multi-image: per-message Storage folder + retention/orphan prefix-sweep + admin-SDK-only delete — no orphan, "ลบให้เกลี้ยง")**, **AV111 (V111: course buy-fetchers MUST propagate receipt_course_name → receiptCourseName onto purchasedItem; receipt renderer MUST prefer receiptCourseName — silent override loss on receipts / quotations)**, **AV112 (V112: sale write-paths MUST resolve customer identity at BOTH create + update chokepoints; empty caller-side customerName/HN with valid customerId MUST NEVER reach Firestore — silent name-loss on edit / pre-V108 historical artifacts)**, **AV113 (V113: receipt + quotation renderers MUST live-resolve master at render time; snapshot is fallback only — admin-SDK backfill scripts to "fix display" are FORBIDDEN per Rule Q V66 / Q-vis)**.
**MEDIUM**: AV1 (dup components), AV9 (canonical helpers not reused), AV10 (copy-paste UI), AV40 (patientData.ud_* multi-reader-sweep).
**LOW**: AV7, AV8, AV12 — hygiene over time.

## Example violations from historical commits

- AV1 — DateField had 5 duplicates (SaleTab.DatePickerField, TreatmentFormPage.ThaiDatePicker, AdminDashboard.DatePickerThai + 2 inline). Unified `362da72`.
- AV2 — 5 sites with raw `<input type="date">` fixed in the same commit.
- AV3 — patientLinkToken used `Math.random().toString(36).substr(2,10)` × 2. Crypto upgrade `0d00701`.
- AV5 — `createdBy: user.uid` in schedule doc removed `335cb0e`.
- AV9 — dozens of ad-hoc `new Date().toISOString().slice(0,10)` display sites migrated to `thaiTodayISO()` `71e513f`.
- AV17 — `listProducts` + `listCourses` spread order swapped to `{...d.data(), id: d.id}` in V38 (2026-05-07). 5 พระราม 3 products + 2 courses had stray `data.id` overriding docId → handleDelete silent no-op. **V38-followup mass-sweep** (commit after V39, 2026-05-07) extended the fix to all 85+ callsites across 15 files; full suite 6757/6757 PASS post-sweep.
- AV18 — V39 (2026-05-07) patched 4 migrate fns (promotions/coupons/vouchers/df_staff_rates) + 4 mappers (`buildBe{Promotion,Coupon,Voucher}FromMaster` + `mapMasterToDfStaffRates`) to accept `{branchId}` opt. 479 zombie docs backfilled to พระราม 3 via `scripts/phase-24-0-vicies-novies-decies-backfill-zombie-branchid.mjs --apply`. Audit doc `be_admin_audit/phase-24-0-vicies-novies-decies-backfill-zombie-branchid-1778102599138-4d7618f4`.
- AV40 — Phase 26.2g-fillin (2026-05-13) NEW `src/lib/patientHealthMapping.js` with `derivePatientCongenitalDisease` + `derivePatientTreatmentHistory` pure helpers. TFP create-mode auto-fill at `TreatmentFormPage.jsx:1024-1034` extended to call both helpers gated by `!isEdit`. Sanctioned exceptions: `PatientForm.jsx` (writer) + `AdminDashboard.jsx:4504-4533` (display chips). Source-grep regression: `tests/phase-26-2g-fillin-source-grep.test.js` G1+G2.
- AV40 follow-up — Phase 26.2g-fillin-followup (2026-05-13) extended `patientHealthMapping.js` with `derivePatientCongenitalDiseaseEnglish` + `UD_LABELS_EN` frozen map (formal clinical labels preserved verbatim from `src/utils.js`). Refactored both `src/utils.js` OPD print builders (Thai + English) to consume helpers — 20 inline lines → 4 (2 per builder). `src/utils.js` dropped from AV40 sanctioned list. Anti-regression locks: `tests/phase-26-2g-fillin-followup-source-grep.test.js` G3.1-G3.4. V12 multi-reader-sweep class fully closed for `patientData.ud_*` project-wide.

### AV114 — Fullscreen image lightboxes MUST satisfy mobile UX gates (2026-05-23 V115 mobile lightbox class)

Origin: user-reported mobile bug on iPhone — "ใน mobile กดเปิดรูป Preview ในช่องแชท staff chat แล้วปิดพรีวิวไม่ได้ และซูมดูรูปไม่ได้ด้วย ใช้งานยากมาก". Root cause investigation (Phase 1+2 of `/systematic-debugging`) found 3 stacked factors for "can't close" + 2 factors for "can't zoom":

**Can't close** (3 factors compounded):
1. StaffChatImageLightbox shipped as AV78-NORMAL ("backdrop does NOT close") — but the AV78 sanctioned-exception list in CLAUDE.md explicitly lists it as one of 2 fullscreen image viewers where click-anywhere-closes IS expected UX (Stripe/Linear/WhatsApp/Slack/Photos convention). Code contradicted spec.
2. Close button `w-9 h-9` (36px) — below iOS HIG 44pt minimum touch target.
3. Top bar `top-0` with no `env(safe-area-inset-top)` padding — partially obscured by iPhone notch / dynamic island.

**Can't zoom** (2 factors):
1. No zoom implementation at all — `<img object-contain>` with no pinch handler, no double-tap-to-zoom, no transform state.
2. `onTouchStart` read only `touches[0]?.clientX` — pinch gesture's 2nd finger was ignored and the resulting horizontal delta on release was misinterpreted as a single-finger swipe, falsely triggering prev/next navigation.

**Rule**: every fullscreen image lightbox in `src/components/**/*Lightbox*.jsx` AND every inline `function Lightbox` declaration in `src/components/**/*.jsx` MUST satisfy ALL of:

1. **Backdrop tap closes** — outer fixed-overlay div MUST have `onClick={onClose}` (sanctioned AV78 exception). Children (top-bar, image wrapper, filmstrip) MUST carry `onClick={(e) => e.stopPropagation()}` (or equivalent `stop` helper) so taps on them don't bubble.

2. **iOS notch safe-area** — close button positioning MUST include `env(safe-area-inset-top)` via `style={{ paddingTop: 'max(...rem, env(safe-area-inset-top))' }}` on the top-bar OR `style={{ top: 'max(...rem, env(safe-area-inset-top))' }}` on an absolute-positioned close button. Notched iPhone (X / 11 / 12 / 13 / 14 / 15 / 16) reserves ~47pt for status bar / dynamic island.

3. **44pt touch target** — close button MUST be ≥ `w-11 h-11` (44px = iOS HIG minimum). Tailwind `w-8/h-8` (32px) and `w-9/h-9` (36px) are forbidden on lightbox close buttons.

4. **Multi-touch bail** (where touch swipe-nav is implemented) — `onTouchStart` MUST check `e.touches?.length > 1` and skip swipe-state tracking on pinch gestures. Otherwise iOS Safari's native pinch-zoom is interpreted as a swipe and triggers spurious nav.

5. **Zoom support (recommended, REQUIRED for staff chat)** — double-tap-zoom (1x ↔ 2.5x via CSS `transform: scale()`) + reset on idx change. Treatment lightboxes are sanctioned WITHOUT zoom (admin desktop-primary usage; class-of-bug expansion scoped to mobile gates 1-4 only).

**Grep targets (`tests/v115-mobile-lightbox.test.jsx`)**:
- `StaffChatImageLightbox.jsx`: outer div `onClick={onClose}` (SG1) + AV78 sanctioned-exception annotation (SG1b) + `env(safe-area-inset-top)` (SG2) + `w-11 h-11` close button (SG3) + multi-touch bail `e.touches.length > 1` (SG4) + `[zoom, setZoom]` state (SG5) + `useEffect setZoom(1)` on `[idx]` (SG6) + `transform: scale(${zoom})` on image (SG7).
- `TreatmentReadOnlyMirror.jsx`: 44pt close button + `env(safe-area-inset-top)` + backdrop-close preserved.
- `TreatmentReadOnlyPanel.jsx`: 44pt close button + `env(safe-area-inset-top)` + backdrop-close preserved.

**Sanctioned consumer list (closed set of 3)**:
- `src/components/staffchat/StaffChatImageLightbox.jsx` — staff chat attachment viewer; ALL 5 gates required (incl. zoom).
- `src/components/backend/TreatmentReadOnlyMirror.jsx` — Treatment read-only mirror inner `function Lightbox`; gates 1-4 (no zoom).
- `src/components/backend/TreatmentReadOnlyPanel.jsx` — Treatment read-only panel inner `function Lightbox`; gates 1-4 (no zoom).

Adding a 4th fullscreen image lightbox component requires explicit AV114 entry update + the new file must implement ALL 5 gates (or gates 1-4 with documented zoom-exception rationale).

**Cross-link**: V115 saga in `.claude/rules/00-session-start.md` § 2 (mobile lightbox UX class, 2026-05-23) + `tests/v115-mobile-lightbox.test.jsx` (SG1-SG7 + SG-T1-T5 + R1-R8 + AV1-AV3) + this AV114 entry.

### AV116 — opd_sessions hard-delete sites MUST preserve linked-booking sessions; provisionOpdLinkForBookingPair MUST verify existence before idempotent short-circuit (2026-05-23 V116 link-survives-queue-delete)

Origin: user-reported `/systematic-debugging` bug 2026-05-23 LATE+2 — admin clicks "ดูลิ้งค์ที่ส่งไป" in the pickLater edit-appointment modal → SendCustomerLinkModal opens with URL → customer opens link but doesn't fill → opd_sessions doc appears in clinic queue (status:'pending') → admin clicks 🗑 to delete from queue → `deleteSession` (AdminDashboard.jsx:3287 no-patientData branch) HARD-DELETES the opd_sessions doc WITHOUT clearing the reverse-FK (`linkedOpdSessionId`) on the linked be_appointments + be_deposits → `provisionOpdLinkForBookingPair`'s idempotent short-circuit (appointmentDepositBatch.js:902) returns a URL pointing to a missing doc → customer hits "ลิงก์ไม่ถูกต้อง" / dead URL. Image-2 victims (มนทวัฒน์ มาดหนู + สันติสุข เพ็ชรไพฑูร) demonstrate exactly this state.

**Class-of-bug**: 3 opd_sessions hard-delete sites in `src/pages/AdminDashboard.jsx` (line 2251 auto-2hr-expire, line 3293/3314 deleteSession no-patientData, line 3353 hardDeleteSession) NEVER cleared the reverse-FK on linked appt/dep. Sibling site at line 3345 (`handleNoDepositCancel`) self-heals because it cascades to `deleteBackendAppointment`. The provision helper's unconditional short-circuit converted stale FKs into dead URLs.

**Rule** (two complementary guarantees):

1. **Preserve linked sessions on user-facing queue-delete** — `deleteSession` (and the auto-2hr-expire useEffect) MUST conditionally branch the no-patientData path:
   - IF `session.linkedAppointmentId || session.linkedDepositId` → set `isHiddenFromQueue: true` + `hiddenFromQueueAt: serverTimestamp()` (preserve session doc; URL stays alive; customer can come back and fill).
   - ELSE → existing hard-delete (standalone session, no booking → safe to nuke; "เหมือนกดผิด" per user).
   - Queue listeners MUST filter `(!isHiddenFromQueue || patientData)` — auto-restore via READ-side override when customer fills the form (no write needed at customer-fill time).
   - The PatientForm.jsx:78 isArchived rejection IS NOT a synonym — never overload `isArchived` for the hide semantic; PatientForm will reject the load → defeats "URL still works".

2. **Architectural backstop in provisionOpdLinkForBookingPair** — the idempotent short-circuit MUST verify `getDoc(opdSessionDoc(existingSessionId))` exists before returning. If missing, fall through to mint a fresh session + overstamp reverse-FK on appt/dep. This heals legacy victims (whose `linkedOpdSessionId` already points to a deleted doc) on the next click — no migration script needed; admin clicks "ดูลิ้งค์ที่ส่งไป" and the URL auto-regenerates.

3. **Un-hide on re-engagement (V116-followup, 2026-05-23)** — when the existing session DOES exist AND is hidden (`isHiddenFromQueue:true`), the helper MUST clear the hide flag as part of the re-send action. Stamps `isHiddenFromQueue:false` + `unhiddenFromQueueAt: serverTimestamp()` + `unhiddenFromQueueReason: 're-engage-provision'`. URL is unchanged (no need to re-share QR). Queue entry reappears immediately so admin has a Review surface for the outstanding link. User report (verbatim, V116 catch): *"พอลบแล้วสร้างลิ้งรอบที่ 2 จากลูกค้าคนที่นัดแล้ว ... มันไม่มาแสดงในหน้าคิวหน้าคลินิกแล้ว แล้ว Admin จะ Review ก่อนกดบันทึกลง OPD ได้ยังไง?"*. Admin's act of clicking the link button IS the re-engagement signal; the queue must reflect that intent. Idempotent: re-engaging a non-hidden session is a no-op.

**Walk-in modal gate companion** (defense-in-depth Q3 lock): the `isFromBookingFlow` check in AdminDashboard's `_maybeOpenWalkInModal` (line ~3489) MUST include `session?.createdFromBackendBooking === true` as the 6th indicator (alongside the pre-existing 5: linkedAppointmentId, linkedDepositId, appointmentProClinicId, formType==='deposit', appointmentData.appointmentDate/StartTime). `provisionOpdLinkForBookingPair` stamps `createdFromBackendBooking:true` on the opd_sessions doc — using it as a direct gate indicator catches future drift if any of the other 5 indicators ever drop.

**Grep targets (`tests/v116-link-survives-queue-delete.test.js`)**:
- `src/lib/appointmentDepositBatch.js`: `V116 architectural backstop` marker + `if (existingSessionId) { const existingSessionSnap = await getDoc(opdSessionDoc(existingSessionId))` (SG1) + anti-regression: pre-V116 unconditional pattern `if (existingSessionId) { const url = _buildOpdSessionUrl` MUST NOT match (SG1.2) + `V116 self-heal` warn (SG1) + `stale linkedOpdSessionId` log text.
- `src/pages/AdminDashboard.jsx`: `else if (session?.linkedAppointmentId || session?.linkedDepositId)` + `isHiddenFromQueue: true,\n*hiddenFromQueueAt: serverTimestamp()` in deleteSession (SG2) + `V116 (2026-05-23) — linked to a real booking` marker + `V116:เหมือนกดผิด` marker on hard-delete branch.
- AdminDashboard auto-expire (line ~2246): `V116 (2026-05-23) — mirror deleteSession conditional` + same `if (s.linkedAppointmentId || s.linkedDepositId) { ... isHiddenFromQueue: true` shape (SG3).
- AdminDashboard queue filters (3 sites): `!s.isHiddenFromQueue || s.patientData` for deposit + noDeposit queues; `session.isHiddenFromQueue && !session.patientData` early-reject in main queue filter (SG4) + `V116 (2026-05-23) — isHiddenFromQueue gate` marker.
- AdminDashboard walk-in gate: `session?.createdFromBackendBooking ||` (SG5) + 5 pre-existing indicators still present (anti-regression on accidentally dropping one).

**Sanctioned exceptions**:
- `handleNoDepositCancel` (AdminDashboard.jsx:3345) is sanctioned BECAUSE it already cascades to `deleteBackendAppointment` → the linked appt is gone too → no orphan FK to heal. Annotated `// V116: sanctioned — self-heals via deleteBackendAppointment cascade`.
- `hardDeleteSession` (AdminDashboard.jsx:3353) is sanctioned as a history-view safety-net (admin explicitly knows they're nuking a record); covered by V116 architectural backstop at the provision helper layer — any post-hard-delete click on a stale FK auto-regens.

**Class-of-bug classifier (`tests/v116-link-survives-queue-delete.test.js` G1-G3)**: enumerates all 4 opd_sessions delete sites + classifies each as fixed / self-healing / architecturally-covered. Test G3 asserts every site is handled — adding a 5th delete site without updating the classifier fails the lock.

**Cross-link**: V116 saga in `.claude/rules/00-session-start.md` § 2 (link-survives-queue-delete + auto-regen, 2026-05-23) + `tests/v116-link-survives-queue-delete.test.js` (SG1-SG5 + D1-D9 + F1-F6 + G1-G3) + this AV116 entry.

### AV117 — Fullscreen lightboxes MUST createPortal to document.body (2026-05-23 V117 portal mandate)

Origin: user-reported `/systematic-debugging` bug 2026-05-23 LATE+3 — after V115 mobile lightbox UX fix shipped + deployed, user re-tested on real iPhone and reported: *"มันยังปิดรูป preview ในช่อง chat ใน mobile ไม่ได้เลย เหมือนมันไป full screen ในช่องแชท เลยไม่เห็นปุ่มปิดอะไรเลย"*. V115's safe-area-inset + 44pt close button + backdrop-close were all correct in source code, but on real iOS Safari the lightbox got bounded to the StaffChatPanel area (panel is itself `position:fixed; z-9000; overflow:hidden`). Result: nested position:fixed → iOS Safari quirk → lightbox `inset-0` measured from panel box, not viewport. Close button landed BEHIND the chat panel header or outside touchable area.

**Class-of-bug**: every fullscreen image/PDF/chart lightbox that uses `position:fixed inset-0` WITHOUT createPortal is latent for the same bug class. Triggers when the lightbox is rendered as a child of ANY container with a containing-block-creating CSS property (transform, filter, will-change, backdrop-filter, contain, or a position:fixed parent + iOS Safari quirk). Safest architectural fix: render via `ReactDOM.createPortal(<jsx>, document.body)` so the lightbox is appended directly under `<body>`, bypassing ALL ancestor CSS effects + escaping all stacking contexts.

**Rule**: every fullscreen image/PDF/chart lightbox in `src/components/**` MUST satisfy ALL of:

1. **Import `createPortal` from `'react-dom'`** at module top.
2. **Wrap the entire return JSX in `createPortal(<jsx>, document.body)`** — NOT as inline `{lightbox && <Lightbox/>}` JSX. The portal mount MUST be inside the lightbox component itself (not the caller) so all callsites benefit automatically.
3. **`document.body`** is the canonical target. Sub-targets (e.g. `document.getElementById('lightbox-root')`) are forbidden — body is always present + has no ancestor CSS to inherit from.

This rule pairs with AV114 (mobile gates) — AV117 is the structural fix, AV114 is the visual-UX fix. Both required for production-quality fullscreen overlays.

**Grep targets (`tests/v117-lightbox-portal.test.js`)**:
- Each V117 file imports `createPortal` from `'react-dom'` (SG1-SG5).
- Each V117 file has `return createPortal(` followed by JSX + `document.body)` (SG1-SG5).
- Anti-regression: no V117 file returns a bare `<div className="fixed inset-0 ...">` without portal wrapping (AV1).
- Class-of-bug classifier (G1-G3) enumerates 5 fullscreen lightboxes + locks each as portalled.

**Sanctioned consumer list (closed set of 5)**:
- `src/components/staffchat/StaffChatImageLightbox.jsx` — image attachment viewer in staff chat.
- `src/components/staffchat/StaffChatPdfOverlay.jsx` — PDF preview viewer in staff chat.
- `src/components/backend/TreatmentReadOnlyMirror.jsx` — inner `function Lightbox` for treatment image zoom.
- `src/components/backend/TreatmentReadOnlyPanel.jsx` — inner `function Lightbox` for timeline image zoom.
- `src/components/ChartSection.jsx` — inner `function ChartLightbox` for chart fullscreen view.

Adding a 6th fullscreen lightbox requires explicit AV117 entry update + the new file must implement portal-mount via createPortal(jsx, document.body). Test G1 hard-locks the count = 5; adding a 6th lightbox without updating the classifier fails the test.

**Why portal is the canonical fix** (not "find the ancestor with transform and remove it"):
- Bullet-proof: works regardless of ancestor CSS evolution.
- Universal: all modal/lightbox libraries (Radix, HeadlessUI, Chakra, MUI) use portal-mount by default for the same reason.
- Future-proof: adding a `transform: animate` to ANY ancestor in the chain won't break the lightbox.
- Self-contained: each lightbox component manages its own portal-mount; callers don't need to know.

**Cross-link**: V117 saga in `.claude/rules/00-session-start.md` § 2 (lightbox-portal mandate, 2026-05-23) + `tests/v117-lightbox-portal.test.js` (SG1-SG5 + AV1-AV3 + G1-G3) + this AV117 entry. Pairs with AV114 (mobile UX gates) — together they form the complete fullscreen-lightbox contract.

### AV118 — Card-level OPD state derivation MUST use opdSessionState helpers (2026-05-23 V118 card OPD lifecycle row)

**Class-of-bug**: V12 multi-reader-sweep at the OPD-save-state predicate boundary. Pre-V118, the predicate `(session.opdRecordedAt && session.brokerStatus === 'done')` was inlined at ≥3 sites (`AdminDashboard.jsx:3475` handleOpdClick early-return, `AdminDashboard.jsx:5747` viewingSession-modal button label, `tests/v87-link-button-opd-save-guard.test.js` AV84 regression). When the state model evolves (e.g. a new "partial-save" intermediate state, or a `brokerStatus='retry'`), inline callsites drift silently and the card-level view diverges from the คิวหน้าคลินิก view.

**Rule**: every derivation of "OPD session saved" / "customer filled" / "card OPD lifecycle state" in `src/components/admin/**` + `src/pages/AdminDashboard.jsx` MUST go through `src/lib/opdSessionState.js`:

- `isOpdSessionSaved(session)` — replaces inline `session.opdRecordedAt && session.brokerStatus === 'done'`
- `hasPatientData(session)` — replaces inline `session.patientData && Object.keys(...).length`
- `resolveCardOpdState({appt, linkedSession})` — single source for the 5-state machine (A=has customer / B=no link / C=link sent, waiting / D=filled, ready to save / E=just saved)
- `synthesizeSessionFromCustomer(customer, appt)` — single source for the read-only "synth" session shape used when a State A card has no real `linkedOpdSessionId`

**Sanctioned exceptions** (closed list — adding a 4th = AV118 violation):

1. `src/lib/opdSessionState.js` itself — defines the helpers, contains the literal `'done'` string + the predicate
2. `tests/v118-opd-session-state-helpers.test.js` — tests the helpers, asserts the predicate
3. `tests/v87-link-button-opd-save-guard.test.js` — V87 source-grep regression that locks the V87 patient-link guard literal text (different concern: AV84 trigger-site closed list)
4. `src/pages/AdminDashboard.jsx:3475` — `handleOpdClick` early-return literal predicate (preserved per V87/AV84 + because `handleOpdClick` is its own canonical source of the predicate's intent at the action site).

**Synth-session marker discipline (paired with AV118)**: every modal-internal write/mutation operation triggered from the existing "ประวัติผู้ป่วย OPD" modal (`setViewingSession` consumer) MUST gate on `!viewingSession.__synthetic` if the operation issues a Firestore write to an `opd_sessions` doc (`updateDoc(doc(db, ...'opd_sessions', id), ...)`). Synth sessions have no underlying doc — writes would 404 / no-op + leave admin confused. Read-only consumers (print + customer-navigation) do NOT need the gate. Sanctioned write callsites currently gated: AdminDashboard.jsx lines ~4721 (แก้ไขข้อมูล) + ~4727 (renderResyncButton) + ~4816 (Resync OPD button).

**Source-grep regression test**: `tests/v118-card-opd-lifecycle-row-source-grep.test.js` AV118 group.

**Origin**: V118 (2026-05-23) — card-level OPD lifecycle row introduced 4 new callsites of the saved-predicate (AppointmentHubView per-row state derivation + AdminDashboard 3 handlers). Centralizing prevents future drift when the state model evolves. Pairs with AV84 (V87 patient-link trigger closed list) — different concern, same multi-reader-sweep family.

### AV118 — V121 amendment (2026-05-23 card-flow notification bubbles)

V121 adds 2 helpers to the AV118-sanctioned source `src/lib/opdSessionState.js`:
- `isCardFlowSession(session)` — V120 hidden card-flow predicate
- `isCardFlowUnread(session)` — pending review state for the bubble filter

**Updated sanctioned-callsite list (closed list of 6 entries)**:

1. `src/lib/opdSessionState.js` — defines the helpers
2. `tests/v118-opd-session-state-helpers.test.js` — V118 helper tests
3. `tests/v87-link-button-opd-save-guard.test.js` — V87 regression
4. `src/pages/AdminDashboard.jsx:3475` — handleOpdClick early-return literal predicate (preserved per V87/AV84)
5. **NEW** `tests/v121-opd-session-state-card-flow-unread.test.js` — V121 helper tests
6. **NEW** `src/components/admin/AppointmentHubView.jsx` — sub-pill count derivation (sanctioned use of isCardFlowUnread via the V121 cardFlowSubPillCounts memo)

**Source-grep regression test**: `tests/v121-card-flow-notifications-source-grep.test.js` AV118 group locks the V121 amendment + the 6 sanctioned consumers.

**Origin**: V121 (2026-05-23) — card-flow notification bubbles need a single source for "session needs admin attention". 4 callsites of the new predicate (2 in AdminDashboard memos + 1 modal-open gate + 1 helper definition) + 1 HubView use. Centralizing prevents future drift when the bubble semantics evolve.

**Cross-link**: V121 saga in `.claude/rules/00-session-start.md` § 2 (card-flow notifications, 2026-05-23) + `tests/v121-*` (helper + source-grep + flow-simulate) + V120 latent gap close in the 3 queue filters at AdminDashboard.jsx lines ~2301, ~2321, ~2340.

### AV124 — Bubble↔badge predicate parity ("ลูกค้ากรอกแล้ว · รอบันทึก")

**Why**: V121 shipped purple bubble surfaces (desktop sidebar + mobile dock + sub-pills) using `isCardFlowUnread` which requires V118/V120 markers (`createdFromBackendBooking + isHiddenFromQueue`). Regular จองไม่มัดจำ/มัดจำ bookings minted via `provisionOpdLinkForBookingPair` WITHOUT `{hideFromQueue:true}` don't carry those markers — so the bubble count was 0 even though the row badge "📥 ลูกค้ากรอกแล้ว · รอบันทึก" (AppointmentHubRowCard:172) rendered for the same booking. Predicate scope mismatch between the rendering surface (`resolveCardOpdState === 'D'`) and the counting surface (`isCardFlowUnread`). User caught 2026-05-24 EOD+1 with screenshot of BA-1779590375471 → ND-68FA49.

**Invariant**: any UI surface that COUNTS or BUBBLES a row badge MUST share the same predicate as the rendering surface. For the "📥 ลูกค้ากรอกแล้ว · รอบันทึก" badge (state D) the canonical predicate is `isAppointmentPendingOpdSave({appt, linkedSession})` from `src/lib/opdSessionState.js` (= `resolveCardOpdState({appt, linkedSession}) === 'D'`). Bubble count and badge render MUST derive from the same single source of truth.

**Sanctioned consumers** (closed list — 3 entries):
1. `src/lib/opdSessionState.js` — defines `isAppointmentPendingOpdSave`
2. `src/pages/AdminDashboard.jsx:4625` — `cardFlowUnreadCount` memo (desktop sidebar + mobile dock bubbles)
3. `src/components/admin/AppointmentHubView.jsx:291` — `cardFlowSubPillCounts` memo (sub-pill bubbles)

**Forbidden anti-patterns** (V124 violations):
- ❌ Defining a per-surface predicate that approximates state D ("isUnread + patientData + …") instead of using `isAppointmentPendingOpdSave` — drift guaranteed when `resolveCardOpdState` evolves.
- ❌ Iterating session state arrays to count state-D items — V120 hides card-flow sessions from those arrays, AND non-card-flow bookings already living there can't carry the appt context needed for state-D evaluation. Iterate `apptData?.appointments` (already branch-scoped via `listenToAppointmentsByMonth({branchId: selectedBranchId})`) + join to linked sessions via `resolveLinkedSession`.

**Source-grep regression test**: `tests/v124-bubble-pending-opd-save.test.js` SG-A group.

**Origin**: V124 (2026-05-24 EOD+1) — user reported bubble missing on นัดหมาย tab for ND-68FA49 despite the row badge being visible. Rule R diag exposed predicate scope mismatch. V121's narrow predicate retained for any future Card-flow-specific surface; bubble surfaces broadened to align with row badge.

**Cross-link**: V124 row in `.claude/rules/00-session-start.md` § 2 (bubble↔badge parity, 2026-05-24 EOD+1) + `tests/v124-*` + V121 commit `00410f93` (introduced the narrow predicate) + AppointmentHubRowCard:172 (canonical state-D badge render).

### AV125 — Cancel-cascade integrity (status guard + linked-session archive)

**Why**: V124 closed the bubble-vs-badge predicate gap but assumed the underlying state machine was complete. It wasn't — `resolveCardOpdState` didn't consider `appt.status`. A cancelled appt with linkedOpdSessionId + patientData + !saved still returned state 'D' → bubble counter held a stale "1" after ยกเลิก click. Past sub-pill (`defaultStatusFilterForTab('past').exclude=[]`) also let cancelled appts through → row badge rendered for them. Plus the cancel handler only wrote `appt.status='cancelled'` — no cascade to the linked opd_session → the จองไม่มัดจำ / จองมัดจำ / คิวหน้า Clinic tabs (filters all read opd_sessions directly with no awareness of linked appt) still rendered the row. User-reported 2026-05-24 EOD+1: "กดยกเลิก แต่ bubble ไม่หายไป + ยังมีนัดค้างอยู่ในระบบนัดหมาย และหน้าจองไม่มัดจำด้วย".

**Invariant (3 surfaces)**:

1. **Predicate guard** — `isAppointmentPendingOpdSave({appt, linkedSession})` in `src/lib/opdSessionState.js` MUST short-circuit to `false` when `appt?.status === 'cancelled'`. The state machine semantic stays clean (returns 'D' if the data shape matches); the predicate is bubble+badge-specific and carries the extra guard.

2. **Per-row render guard** — `hideOpdLifecycle` in `src/components/admin/AppointmentHubView.jsx` MUST be `true` when EITHER `activeTab === 'cancelled'` OR `a?.status === 'cancelled'`. The per-row check is the only thing stopping the state-D badge from rendering on a cancelled appt that lives in past sub-pill (defaultStatusFilterForTab admits cancelled there).

3. **Cancel cascade** — every `onCancelAppt`-shaped writer in `src/pages/AdminDashboard.jsx` (or future appt-cancel surfaces) MUST cascade-archive the linked opd_session when present: `updateDoc(opd_sessions/{linkedOpdSessionId}, { isArchived: true, archivedAt: serverTimestamp(), archivedReason: 'appt-cancelled', archivedFromApptId: appt.id })`. The session-archive write is best-effort (wrap in try/catch — appt cancel must not roll back on session failure). Forensic stamps `archivedReason` + `archivedFromApptId` are MANDATORY so admin can trace the trigger in be_admin_audit / via diag.

**Sanctioned consumers** (closed list — 4 entries):
1. `src/lib/opdSessionState.js` — defines `isAppointmentPendingOpdSave` with the status guard
2. `src/components/admin/AppointmentHubView.jsx` — `hideOpdLifecycle` per-row check
3. `src/pages/AdminDashboard.jsx:onCancelAppt` — cascade-archive linked opd_session
4. `tests/v125-cancel-cascade.test.js` — Tier 2 regression bank (predicate + render + cascade)

**Forbidden anti-patterns** (V125 violations):
- ❌ Re-introducing a "cancel writes only appt.status" handler — every appt-cancel surface MUST cascade-archive the linked opd_session (or document an explicit reason to skip).
- ❌ Adding a new bubble/badge surface that uses `resolveCardOpdState === 'D'` directly without going through `isAppointmentPendingOpdSave` — bypasses the status guard.
- ❌ Filtering opd_sessions in a queue tab without `!s.isArchived` — V125's cascade relies on the existing filter convention.

**Source-grep regression test**: `tests/v125-cancel-cascade.test.js` SG-A group (4 lock tests covering all 3 surfaces).

**Origin**: V125 (2026-05-24 EOD+1) — same systematic-debugging session as V124. V124 surfaced the predicate scope-mismatch; V125 surfaced the next-layer gap (status awareness + cross-tab cascade). User explicitly flagged strategic direction: นัดหมาย tab to become the primary surface; future deprecation of คิวหน้า Clinic / จองไม่มัดจำ / จองมัดจำ tabs. The cascade fix aligns with that direction by ensuring cancel in นัดหมาย propagates to the other 3 tabs through the existing `isArchived` filter convention.

**Cross-link**: V125 row in `.claude/rules/00-session-start.md` § 2 + `tests/v125-cancel-cascade.test.js` + V124 (predicate scope) + AppointmentHubView:537 (hideOpdLifecycle defense) + AdminDashboard:7045 (onCancelAppt cascade).

### AV126 — Customer patient-link anon-safety (endpoint-only reads + field-minimized)

**Why**: 2026-05-25 customer patient-link feature — an anon customer (no login) opens `?patient=<token>` to view their appointments + remaining courses on the existing PatientDashboard view. `be_customers` / `be_appointments` / `be_branches` are clinic-staff-only (firestore.rules) → anon CANNOT read them client-side. The data MUST flow through the public token-gated `/api/patient-view` endpoint (admin SDK), NEVER via direct client-SDK reads of those collections. Opening anon-read on `be_customers` would expose the ENTIRE customer PII database — a serious security regression (Firestore rules can't gate a collection query on secret-token knowledge).

**Invariant**:
1. The anon patient view reads customer data ONLY via `api/patient-view` (admin SDK). PatientDashboard customer-mode fetches the endpoint; it MUST NOT call `fetchCoursesViaApi`/`getCustomer`/`getCustomerAppointments` when `sessionData.__customerMode` (those hit anon-denied be_* reads). The auto-sync effect is guarded by `if (sessionData?.__customerMode) return;`.
2. `api/patient-view` MUST be field-minimized: response keys ⊆ `{ok, patientName, hn, patientData(prefix/firstName/lastName/phone), courses, expiredCourses, appointments, fetchedAt}`. NO national-ID / sensitive PII identifier in the response.
3. `firestore.rules` `be_customers`/`be_appointments`/`be_branches` MUST stay `isClinicStaff` (no anon-read rule added).
4. The token = `crypto.getRandomValues` 128-bit (Rule C2 — no Math.random).

**Sanctioned consumers** (closed list — 3 entries):
1. `api/patient-view.js` — admin SDK endpoint (the ONLY anon data path; unified resolve be_customers OR opd_session).
2. `src/lib/backendClient.js` — `generateCustomerPatientLink`/`setCustomerPatientLinkEnabled`/`revokeCustomerPatientLink` (clinic-staff write of the token on be_customers).
3. `src/pages/PatientDashboard.jsx` — customer-mode fetches the endpoint (gated by `__customerMode`; never reads be_* directly).

**Forbidden anti-patterns** (AV126 violations):
- ❌ Adding `allow read: if isSignedIn()` (or anon) to be_customers/be_appointments/be_branches → exposes the PII DB.
- ❌ Calling `getCustomer`/`getCustomerAppointments` client-side in PatientDashboard `__customerMode` (anon-denied → silent empty appointments).
- ❌ Returning national-ID / full patientData in the endpoint response.

**Source-grep regression test**: `tests/customer-patient-link-helpers.test.js` (E7 no-PII + E8 no-admin-gate) + `tests/customer-patient-link-flow-simulate.test.js` (F3 render shape + F5 __customerMode guard).

**Origin**: 2026-05-25 — customer patient-link. Spec `docs/superpowers/specs/2026-05-25-customer-patient-link-design.html`. The auth reality (be_* clinic-staff-only, verified via firestore.rules grep) forced the server-endpoint design — NOT anon-read rules.

**Cross-link**: spec + plan `docs/superpowers/plans/2026-05-25-customer-patient-link.html` + `api/patient-view.js` + `tests/customer-patient-link-*.test.js`.

### AV127 — Customer-facing course list MUST filter by effective status (not expiry-only)

**Why**: 2026-05-25 — user L1 on the deployed customer patient-link caught the view showing **used-up courses (qty "0 / 1 ครั้ง", remaining 0) as "กำลังใช้งาน"**. The stored `course.status` does NOT auto-flip to "ใช้หมดแล้ว" when qty hits 0 (ProClinic-era data + our deduction don't restamp the status string). The patient-view course filter (`api/patient-view.js` + legacy `fetchCoursesViaApi`) filtered by **EXPIRY DATE only** → depleted-but-not-date-expired courses leaked into the active "คอร์สคงเหลือ" list. The LINE bot (`formatCoursesReply` V33.8) + `RemainingCourseTab` (`deriveEffectiveStatus`) already filtered correctly — the patient view was the outlier (V12 multi-reader-sweep: a new/parallel reader missing the canonical filter).

**Invariant**: any CUSTOMER-FACING list of "remaining / usable courses" MUST gate each course through `deriveEffectiveStatus(parseStatusFromCourse(c), total, remaining) === STATUS_ACTIVE` (from `remainingCourseUtils.js`), NOT a bare expiry-date filter. `deriveEffectiveStatus` flips finite+depleted (`total>0 && remaining<=0`) → ใช้หมดแล้ว (excluded), KEEPS buffet (`total === 0`) + `remaining>0`, and preserves refunded/cancelled (excluded). Used-up + terminal courses stay in `customer.courses[]` for audit but MUST NOT appear in customer-facing usable lists.

**Sanctioned consumers** (customer-facing usable-course lists):
1. `api/patient-view.js` — `isUsableActive` gate (anon patient endpoint).
2. `src/pages/PatientDashboard.jsx` `fetchCoursesViaApi` — `isUsableActive` gate (legacy opd_session path).
3. `src/lib/lineBotResponder.js` `formatCoursesReply` — V33.8 status+remaining filter (reference; already correct).
4. `src/lib/remainingCourseUtils.js` — `deriveEffectiveStatus` (canonical helper + RemainingCourseTab; reference).

**Forbidden anti-patterns** (AV127 violations):
- ❌ filtering customer-facing courses by `!c.expiryDate || expiryDate >= today` ALONE (misses depleted).
- ❌ trusting `course.status === 'กำลังใช้งาน'` without the qty-remaining numeric guard (status is stale).
- ❌ excluding buffet (`qtyTotal === 0`) as if depleted — `deriveEffectiveStatus` only flips when `total > 0`.

**Source-grep regression test**: `tests/customer-patient-link-flow-simulate.test.js` F6 (uses the REAL helpers + locks both patient-view sites + anti-regression on the old `allCourses.filter(c => !c.expiryDate` pattern).

**Origin**: 2026-05-25 — user L1 on the deployed customer patient-link. Same canonical helper the report + LINE bot already used; the patient view was missing it. Class-of-bug = 2 instances fixed in one commit (endpoint + fetchCoursesViaApi).

**Cross-link**: AV126 (patient-link anon-safety) + `remainingCourseUtils.deriveEffectiveStatus` + `lineBotResponder.formatCoursesReply` (V33.8).

### AV128 — Patient-view "upcoming appointments" MUST exclude completed/serviced

**Why**: 2026-05-25 user L1 — a "done" (serviced) appointment showed under "นัดหมายครั้งต่อไป" (upcoming). The list filtered future-date + not-cancelled ONLY → already-serviced appts leaked into the customer's "next appointments."

**Invariant**: customer-facing "upcoming appointments" lists MUST exclude completed/serviced appts. An appt is upcoming iff: status NOT cancelled AND status NOT in `{done, completed, มาตามนัด, ชำระเงิน}` (mirrors `didAttend`, appointmentAnalysisAggregator.js) AND NOT `serviceCompletedAt` AND NOT `wasServiceCompleted` (AppointmentHub canonical, appointmentHubFilters.js). Keeps pending/confirmed not-yet-serviced future appts.

**Sanctioned consumers**: `api/patient-view.js` (`isUpcomingAppt`) + `src/pages/PatientDashboard.jsx` `fetchCoursesViaApi`.

**Source-grep regression**: `tests/customer-patient-link-flow-simulate.test.js` F7.

**Cross-link**: AV126 + AV127 (same patient-link turn) + `didAttend` (appointmentAnalysisAggregator) + `serviceCompletedAt` (appointmentHubFilters).

### AV129 — Treatment blobs (images + PDFs) MUST upload to Firebase Storage, never inline base64 in the be_treatments doc

**Why**: 2026-05-25 user L1 — "รูปภาพการรักษา บันทึกได้บ้างไม่ได้บ้าง / ช้า / ติด". Root cause (Rule R diag `diag-treatment-image-doc-size.mjs` on real prod): `be_treatments.detail` stored Before/After/Other photos + lab images + lab `pdfBase64` + treatment-file `pdfBase64` as INLINE base64. A single 1920px JPEG ≈ 0.3-0.5 MB base64 (real prod: one Before photo = 541 KB), a PDF up to ~13 MB. The 1 MiB Firestore doc cap was hit at ~2 photos (prod docs at 95%/86%/80% of cap) → the WHOLE treatment save was intermittently REJECTED ("invalid nested entity"). The per-file FileReader→decode→canvas-resize→toDataURL burst also janked the main thread. Charts were migrated to Storage on 2026-05-22 (AV103-family) but the photo/lab/PDF blobs were NOT — a latent Rule P class-of-bug gap closed here.

**Invariant**: every treatment blob (chart / Before / After / Other photo / lab image / lab PDF / treatment-file PDF) MUST upload to Firebase Storage via `uploadTreatmentBlob` (or its wrappers `processAndUploadTreatmentImage` / `uploadTreatmentPdf` in `src/lib/treatmentImageUpload.js`, or `uploadChartImage`). State + the persisted `be_treatments.detail` hold a Storage URL + `storagePath`/`pdfStoragePath` — NEVER inline base64 for a NEW upload. Readers (`<img src>` / pdf truthiness) accept BOTH `data:` (legacy) and `http` (new) so loaded legacy treatments still display. `deleteBackendTreatment` MUST cascade-delete every blob's storagePath. Save MUST be gated while `pendingUploads > 0`.

**Forbidden**:
- ❌ `FileReader.readAsDataURL` / `canvas.toDataURL(...)` feeding a base64 string into TFP image/PDF state or the persist map (the pre-AV129 inline pattern). TFP must contain ZERO `readAsDataURL` / `toDataURL` (resize lives only in `treatmentImageUpload.js`).
- ❌ persisting `dataUrl: '<data:...>'` or `pdfBase64: '<data:...>'` for a NEW upload.
- ❌ adding a blob field without a matching `storagePath`/`pdfStoragePath` + a `deleteBackendTreatment` cascade entry.
- ❌ eagerly deleting a blob's Storage object on remove in EDIT mode — the saved doc still references it until save, so cancelling-without-saving would 404 the image. Delete on remove ONLY in CREATE mode (true orphan) via `removeTreatmentBlob` (TFP) / `onBlobRemoved` (ChartSection); removed-in-edit blobs become harmless orphans (negligible Storage cost). Found by the 2026-05-25 stress test.

**Sanctioned consumers**: `src/lib/treatmentImageUpload.js` + `src/lib/chartImageStorage.js` (upload/delete) · `src/components/TreatmentFormPage.jsx` (4 upload sites + persist + remove) · `src/components/ChartCanvas.jsx` (chart) · `src/lib/backendClient.js` `deleteBackendTreatment` (cascade). storage.rules `uploads/{collection}/{docId}/{fileName}` already allows image/* + application/pdf (≤10MB, clinic-staff) — NO rules change.

**Source-grep regression**: `tests/treatment-blob-storage-ref.test.js` (A-E: helper guard + computeResizeDims + persist/cascade flow-simulate + TFP zero-inline lock + ChartSection cap 2→10).

**Cross-link**: chart Storage-ref 2026-05-22 (`chartImageStorage.js`) + AV103 (chart fabricJson transport) + Rule P class-of-bug expansion + `feedback_no_quality_degradation_for_data.md` (Storage-ref, never compress, for clinical images).

### AV130 — Appointment-modal deposit gate (effective-type) + single-source visit purpose + deposit-mutation discipline (2026-05-25)

The shared `AppointmentFormModal.jsx` auto-shows the deposit ("รายละเอียดมัดจำ") section + the chip "นัดมาเพื่อ" picker. Three invariants:

- **(a) Deposit gate = EFFECTIVE appointment type** — the deposit section MUST gate on the effective type (`safeLockedType || formData.appointmentType`), NOT `isLockedDepositType` alone. Anchor: the render gate is `{showDepositSection && (` where `showDepositSection = isDepositBooking = (safeLockedType || formData.appointmentType) === 'deposit-booking'`. The pre-AV130 locked-only gate `{isLockedDepositType && mode === 'create' && (` MUST NOT reappear. So picking "จองมัดจำ" via radio (create OR edit) shows the section everywhere, not only in the locked appointment-deposit tab.
- **(b) Single-source visit-purpose options** — the `visitReasonOptions` list lives ONLY in `src/lib/visitReasonOptions.js` (Rule C1). No inline `['สมรรถภาพทางเพศ','โรคระบบทางเดินปัสสาวะ',…]` array anywhere in `src/` (PatientForm / AdminDashboard / VisitPurposePicker all import it). Adding a new clinic service = edit the constant only.
- **(c) Deposit-mutation discipline** — AppointmentFormModal mutates a deposit ONLY via sanctioned helpers: `createDepositBookingPair` / `createDepositForExistingAppointment` / `updateDeposit` / `cancelDepositBookingPair` / `deleteDepositBookingPair`. NEVER a raw `deleteDoc(depositDoc(...))`. Flip-away delete (edit: leaving จองมัดจำ with a linked deposit) routes through `cancelDepositBookingPair` (audit + money reversal + usedAmount>0 guard) behind an explicit confirm dialog — the modal never deletes a money record silently.

**Forbidden**:
- ❌ `{isLockedDepositType && mode === 'create' && (` render gate (re-introduces the locked-only bug — radio-picked จองมัดจำ would show no section).
- ❌ a new inline `['สมรรถภาพทางเพศ',…]` array in any component (drift from the single source).
- ❌ `deleteDoc(depositDoc(...))` inside AppointmentFormModal (bypasses audit + money reversal).

**Sanctioned consumers**: `src/lib/visitReasonOptions.js` (constant) · `src/components/VisitPurposePicker.jsx` (chip UI) · `src/components/backend/AppointmentFormModal.jsx` (gate + deposit reconcile + flip-away) · `src/lib/appointmentDepositBatch.js` (`createDepositForExistingAppointment` + the existing pair helpers).

**Source-grep regression**: `tests/av130-appointment-deposit-purpose.test.js` + `tests/appointment-modal-deposit-gate.test.js` + `tests/appointment-modal-edit-deposit.test.js` + `tests/appointment-modal-flip-away.test.js` + `tests/visit-reason-options.test.js`.

**Cross-link**: Q1=A (auto deposit + required + atomic pair) · Q2=A (chip required multi-select + อื่นๆ) · Rule C1 (single source) · audit-cascade-logic C16 (deposit cancel cascade) · Rule Q-honest (real-prod e2e for the deposit paths).

### AV131 — OPD link lifecycle: opd-pending tab + appt-date-passed cleanup + delete-on-save (2026-05-26)

The Frontend "นัดหมาย" (AppointmentHubView) "รอ/ยังไม่ลง OPD" tab + the patient-fill-link (opd_sessions) cleanup. Three invariants:

- **(a) Tab membership single-source** — the "รอ/ยังไม่ลง OPD" pill (state B+C+D, present+future) MUST derive membership via `isAppointmentOpdPending({appt, linkedSession})` (which wraps `resolveCardOpdState`). No inline OPD-state-string comparison for the tab. Grep: `isAppointmentOpdPending(` present in `AppointmentHubView.jsx`; the pill key is `'opd-pending'` in `AppointmentHubTabBar.jsx` `TABS`; `dateRangeForTab`/`defaultStatusFilterForTab` carry the `opd-pending` case (`today..today+30`, exclude cancelled).
- **(b) Date-passed hard delete** — `decideCleanupAction` MUST delete an opd_session whose linked appointment date has passed (`reason: 'appt-date-passed'`), placed ABOVE the 2h-age check, overriding the V116 `hide` AND firing even with `patientData` (Q3=A). The cron (`sweepOpdSessionCleanup`) joins `be_appointments` by `linkedAppointmentId` for the date (sessions don't store it) + passes Bangkok `todayISO`. Backward-compat: no `todayISO` → branch is a no-op.
- **(c) Delete-on-save gated** — the post-OPD-save session delete in `_attachLinkedBookings` (handleOpdClick) MUST be gated on the hoisted `isFromBookingFlow` predicate (kiosk walk-in sessions are NEVER deleted — the walk-in modal needs them; mutual exclusion with `_maybeOpenWalkInModal`'s early-return) and best-effort (a delete failure never rolls back the save; the cron sweep catches it).

**Forbidden**:
- ❌ inline OPD-state comparison for the opd-pending tab instead of `isAppointmentOpdPending`.
- ❌ `decideCleanupAction` date-passed branch placed BELOW the age check (would let a fresh-but-expired-date session linger), or omitting it (V116 hide would keep date-passed linked sessions forever).
- ❌ an UNGATED `deleteDoc(opd_sessions/{sessionId})` on OPD-save (would delete kiosk walk-in sessions the walk-in modal still needs) or a throwing (non-best-effort) delete (would roll back a successful save).

**Sanctioned consumers**: `src/lib/opdSessionState.js` (`isAppointmentOpdPending`) · `src/lib/appointmentHubFilters.js` (opd-pending cases) · `src/components/admin/{AppointmentHubTabBar,AppointmentHubView}.jsx` (pill + filter + count) · `src/lib/opdSessionCleanupCore.js` (date-passed branch) · `api/cron/opd-session-cleanup-sweep.js` (be_appointments join) · `src/pages/AdminDashboard.jsx` (gated delete).

**Source-grep regression**: `tests/av131-opd-link-lifecycle.test.js` + `tests/opd-pending-tab.test.js` + `tests/opd-session-date-passed-cleanup.test.js` + `tests/opd-session-delete-on-save.test.js` + `tests/appt-hub-opd-lifecycle-flow-simulate.test.js`. Real-prod L2: `scripts/e2e-opd-link-lifecycle.mjs`.

**Cross-link**: Q1=B+C+D · Q2=hard-delete · Q3=delete-all-date-passed (override V116) · Q4=single all-types button (reuse AppointmentFormModal) · Rule Q-honest (real-prod e2e for the cleanup/save paths).

### AV132 — Deposit-aware cancel dialog: shared component + decision helper + all-surface routing (2026-05-26)

Cancelling/deleting a deposit-booking that has BOTH an appointment AND a deposit MUST ask the admin "ลบมัดจำด้วย / เก็บไว้" — never silently cascade or silently orphan. Three invariants:

- **(a) Single shared dialog + decision (Rule C1)** — every cancel/delete surface that touches a deposit↔appointment pair MUST route through the shared `src/components/admin/DepositAwareCancelDialog.jsx`, whose state derives from the pure `resolveDepositCancelState(deposit)` in `src/lib/depositCancelDecision.js`. No inline per-surface cancel-choice dialog; no inline `usedAmount > 0` gate. The dialog emits `'both' | 'this-only' | 'cancel'`.
- **(b) Hard-delete via the canonical helper + used-block** — the "both" choice MUST route to `deleteDepositBookingPair` (hard — both docs gone; Q3). The "this-only" choice preserves the OTHER entity (appt-orientation → cancel appt, keep deposit; deposit-orientation → `deleteDeposit`, keep appt). When `resolveDepositCancelState(deposit).blocked` (usedAmount>0), the dialog disables the delete option(s) — the helpers throw on a partially-used deposit, so the UI must never offer it.
- **(c) All-3-surface coverage** — the dialog is wired into ALL live deposit-booking cancel surfaces: Frontend นัดหมาย appt-cancel (`AppointmentHubView` → `AdminDashboard.onCancelAppt(appt,{deleteDeposit})`), Backend `AppointmentCalendarView` appt-delete, Backend Finance·มัดจำ `DepositPanel` hard-delete. A new cancel surface for a deposit-booking pair MUST adopt it. (Sanctioned exception: `AppointmentFormModal` flip-away `flipAwayDecisionRef` — that's a type-CHANGE confirm, not a cancel, with its own dialog.)

**Forbidden**:
- ❌ silently cascading a deposit-booking cancel (no "keep the other half?" ask) OR silently orphaning the linked entity (e.g. bare `deleteDeposit` on a `linkedAppointmentId` deposit, or bare appt-cancel leaving an active deposit).
- ❌ a per-surface inline cancel dialog instead of the shared `DepositAwareCancelDialog`.
- ❌ offering the hard-delete choice when `usedAmount > 0` (the helper throws).

**Sanctioned consumers**: `src/lib/depositCancelDecision.js` (`resolveDepositCancelState`) · `src/components/admin/DepositAwareCancelDialog.jsx` · `src/components/admin/AppointmentHubView.jsx` + `src/pages/AdminDashboard.jsx` (นัดหมาย) · `src/components/backend/AppointmentCalendarView.jsx` · `src/components/backend/DepositPanel.jsx`.

**Source-grep regression**: `tests/frontend-tab-removal-source-grep.test.js` (SG8-SG11 dialog wiring) + `tests/deposit-cancel-decision.test.js` (helper) + `tests/deposit-cancel-dialog-rtl.test.jsx` (3 states) + `tests/deposit-cancel-flow-simulate.test.js` (choice→helper mapping). Real-prod L2: `scripts/e2e-deposit-cancel-dialog.mjs` (decision on real deposit shapes + both/keep/used-block cascade outcomes, 31/0).

**Cross-link**: Q3=hard-delete (`deleteDepositBookingPair`) · Q4=ทุกที่ที่ยกเลิกได้ (all 3 surfaces) · Rule C1 (shared component + helper) · Rule Q-honest (real-prod e2e runs the REAL decision helper on REAL prod deposit shapes — V66 mirror-risk).

### AV133 — Appointment date-nav + open-hours default + cancel-hard-delete (2026-05-26)

Three /systematic-debugging fixes in the appointment area. Three invariants:

- **(a) Deep-link `?date=` derived SYNCHRONOUSLY (no late-prop today-lock)** — a component rendered on the FIRST render (e.g. `AppointmentCalendarView` via the default `activeTab='appointment-all'`) that seeds `selectedDate`/`calMonth` from an `initial*` prop in a `useState(() => ...)` initializer MUST receive that prop CORRECTLY at first mount. The parent (`BackendDashboard`) MUST derive `initialApptDate` synchronously in its OWN `useState` initializer from `window.location.search` (`?date=`, regex `^\d{4}-\d{2}-\d{2}$`), NOT only in a post-render `useEffect` — otherwise the child mounts with `''`, its `useState` initializer locks to today, and the later prop change never re-runs it (same element, no remount). Defense-in-depth: the child adds a prop-sync `useEffect` keyed on `[initialSelectedDate]` (NOT `selectedDate`, which would fight nav). Class: derived-state-from-prop-initializes-once (same family as the tablet-chart `initialFabricJson` late-arrival).
- **(b) Appointment start-time default = branch OPEN hours, never hardcoded '10:00'** — every CREATE-mode appointment start-time default MUST resolve from `getOpenHoursForDate(date, cs)?.open` (or `visibleTime.openRange?.open`) with `'10:00'` ONLY as the last-resort fallback. The re-apply effect MUST be keyed on `[..., date, cs.openHoursMonFri, cs.openHoursSatSun]` — NOT on the start-time state (keying on it would override a manual pick). An explicit `initialStartTime` (calendar slot click) always wins; pass `''` (not `'10:00'`) when no slot was clicked so the open-hours default applies.
- **(c) Frontend นัดหมาย cancel HARD-DELETES (consistent with Backend)** — the Frontend `AppointmentHubView` → `AdminDashboard.onCancelAppt` cancel MUST `deleteBackendAppointment(appt.id)` (mirrors the Backend `AppointmentCalendarView` delete), NOT `updateBackendAppointment(appt.id, {status:'cancelled'})`. The V125 linked-`opd_session` archive cascade is PRESERVED (reason `'appt-deleted'`) so the queue tabs + bubble still clear + a trace is kept; the deposit 'both' path still routes to `deleteDepositBookingPair`.

**Forbidden**:
- ❌ `useState('')` for a deep-link `initial*` value that a first-render child consumes in its own `useState` initializer (the late-prop today-lock bug). Derive it synchronously.
- ❌ a hardcoded appointment start-time default (`'10:00'`) that ignores branch open hours; a re-apply effect keyed on the start-time state (overrides manual picks); passing `'10:00'` (vs `''`) as the no-slot `initialStartTime`.
- ❌ the Frontend นัดหมาย cancel writing `status:'cancelled'` instead of `deleteBackendAppointment` (re-introduces the appointment-all clutter the user wanted gone); dropping the V125 session-archive cascade (orphans the queue session / re-leaves the bubble).

**Sanctioned consumers**: `src/pages/BackendDashboard.jsx` (synchronous `?date=` derive) · `src/components/backend/AppointmentCalendarView.jsx` (prop-sync effect + `openCreate` `time || ''`) · `src/components/backend/AppointmentFormModal.jsx` (initializer + re-apply effect via `getOpenHoursForDate`) · `src/components/backend/DepositPanel.jsx` (deposit-appt sub-form via `visibleTime.openRange`) · `src/pages/AdminDashboard.jsx` (`onCancelAppt` hard-delete) · `src/components/admin/AppointmentHubView.jsx` (confirm copy).

**Source-grep regression**: `tests/finance-goto-default-time-cancel-delete.test.js` (I1/I2/I3 source-grep + pure-logic flow-simulate; I2 runs the REAL `getOpenHoursForDate`) + `tests/v125-cancel-cascade.test.js` SG-A3 (hard-delete + `appt-deleted` reason).

**Cross-link**: Issue-1 (deep-link date-nav) · Issue-2 (branch open-hours default) · Issue-3 (cancel = hard-delete, mirrors Backend `deleteBackendAppointment`) · V125 (cascade preserved) · Rule Q-honest (logic L2 via real helper + source-grep; UI render-timing + real hard-delete round-trip = user/L1 post-deploy, disclosed).

### AV134 — Staff-chat enhancements: day-separators · 13px quote · own-only unsend · 2-tier stickers (2026-05-26)

Four staff-chat features on one surface. Invariants:

- **(a) Unsend = own-only CLIENT gate (deviceId); hard-delete doc + Storage folder, no orphan** — the 🗑 affordance renders ONLY when `isOwn && onDelete` (`message.deviceId === ownDeviceId`). `deleteStaffChatMessage(branchId, messageId)` MUST sweep the Storage folder `staff-chat-attachments/{branchId}/{messageId}/` (best-effort, tolerate missing) THEN `deleteDoc`. Server rule = clinic-staff delete (staff chat has no per-user auth — deviceId is localStorage; own-only is a UX gate, NOT a security boundary). Confirm dialog is AV78 explicit-close (no backdrop-close).
- **(b) Custom-sticker LIBRARY = IndexedDB only — NEVER a Firebase catalog** — `stickerLibrary.js` stores custom sticker blobs in IndexedDB per device; the library MUST NOT be written to Firestore/Storage. Only the SENT instance uploads — to the per-message attachment prefix (`staff-chat-attachments/{branchId}/{messageId}/sticker.<ext>`) so retention + the unsend folder-sweep cover it (30-day auto-clean).
- **(c) Bundled sticker send = ID reference, 0 Storage / 0 Firebase blob** — bundled stickers ship in `/public/stickers/fluent/` (Microsoft Fluent Emoji, MIT — `/public/stickers/LICENSE` kept in-repo). A bundled message carries `sticker:{kind:'bundled', id}` only; recipients render from their own bundled asset via `bundledStickerSrc(id)`. No Storage write on send.
- **(d) sticker field undefined-safe + sticker-only message is valid content** — `buildMessageDoc` emits `sticker` with only known sub-fields (V14, no `undefined` leaves); a sticker-only message (empty text, no attachments) passes the empty-message guard AND the firestore.rules create content-clause (`sticker.kind` non-empty).
- **(e) day-separators from a pure Bangkok-TZ helper (dual-shape createdAt)** — `bangkokDayKey`/`groupMessagesByDay` shift to GMT+7 then read UTC parts (machine-TZ-stable, V53); `toMs` handles number / Timestamp / `{seconds}` / ISO (V82 dual-shape). Quote preview is `text-[13px]` (was `text-[10px]`).

**Forbidden**:
- ❌ a delete affordance on another user's message (gate MUST be `isOwn && onDelete`); unsend that deletes the doc but leaks the Storage folder (or vice-versa).
- ❌ writing the custom-sticker library/catalog to Firestore or Storage; rendering a bundled sticker from a Storage URL (it is an ID ref).
- ❌ `buildMessageDoc` writing a `sticker` with `undefined` leaves; a firestore.rules create-clause that rejects a sticker-only message.
- ❌ `new Date()` / local-TZ day bucketing for the divider (must be GMT+7 shift); assuming `THAI_MONTHS[i]` is a string (it is a `{value,label}` object — the helper inlines its own month array).

**Sanctioned consumers**: `src/lib/staffChatDayGroups.js` · `src/lib/stickerLibrary.js` (IndexedDB) · `src/lib/staffChatStickers.js` + `/public/stickers/` (bundled) · `src/lib/staffChatClient.js` (`buildMessageDoc` sticker) · `src/lib/backendClient.js` + `src/lib/scopedDataLayer.js` (`deleteStaffChatMessage`) · `src/hooks/useStaffChat.js` (`deleteMessage` + `sendSticker`) · `src/components/staffchat/{StaffChatMessage,StaffChatMessageList,StaffChatComposer,StaffChatStickerPicker}.jsx`.

**Rules**: `firestore.rules be_staff_chat_messages` (sticker-only create clause + `allow delete: if isClinicStaff()`) + `storage.rules staff-chat-attachments` (`allow delete` clinic-staff). Supersedes the AV108 "client delete locked" premise for `staff-chat-attachments` — delete is now allowed for clinic-staff (Feature 3 unsend); the retention cron still uses admin SDK. Probe-Deploy-Probe #15 (anon delete `be_staff_chat_messages` → 403; anon Storage delete → 401/403; clinic-staff sticker-only create → 200).

**Source-grep regression**: `tests/staff-chat-enhancements-helpers.test.js` (day-groups + buildMessageDoc sticker + bundled accessors) + `tests/staff-chat-enhancements-flow-simulate.test.js` (Rule I) + V21 fixups in `staff-chat-any-file.test.js` + `staff-chat-multi-image.test.js` (storage.rules delete now clinic-staff).

**Cross-link**: spec/plan `docs/superpowers/{specs,plans}/2026-05-26-staff-chat-day-quote-unsend-stickers*` · AV78 (explicit-close dialog) · AV108 (attachment append-only — delete premise updated) · Rule Q-honest (unit + sibling + flow-simulate; real-browser UI + rule-gated client paths = user/L1 post-deploy, disclosed).

### AV135 — Patient-link: single-source "empty" · true-delete cleanup · customer-mode-only hide-empty (2026-05-26)

The customer patient-link page (`?patient=<token>` → `api/patient-view.js` → `PatientDashboard` `__customerMode`) shows ONLY boxes with data, and stale links auto-delete after 30 days empty. Invariants:

- **(a) "What does this link show" is single-sourced in `src/lib/customerLinkPayloadCore.js` (pure, NO firebase import)** — `computeUsableCourses` / `isAppointmentUpcoming` / `isCustomerLinkEmpty`. BOTH `api/patient-view.js` (render payload) AND `api/cron/patient-link-cleanup-sweep.js` (isEmpty) MUST consume these helpers — never re-inline the usable-course or upcoming-appt filter. (Rule of 3 — the endpoint + cron + the Rule-M script all agree on "empty".)
- **(b) "empty" = no usable non-expired course AND no upcoming appt; EXPIRED courses do NOT count** — `isCustomerLinkEmpty` ignores the expired bucket (literal "ไม่มีคอร์สคงเหลือ"). An expired-only customer is empty → eligible for cleanup. (Flagged decision; if reversed, require `expired.length===0` too.)
- **(c) auto-delete = CLEAR TOKEN (true delete), never a hard `deleteDoc` of the customer** — `decidePatientLinkCleanup` 'delete' patch = `{patientLinkToken:null, patientLinkEnabled:false, patientLinkEmptySince:null, patientLinkAutoDeleteReason}`; the cron applies it via `batch.update(ref, ...)` + a `FieldValue.serverTimestamp()` `patientLinkAutoDeletedAt` stamp. The cron MUST NOT `batch.delete` the customer doc. Empty-since state machine: stamp on first-empty → delete after `PATIENT_LINK_EMPTY_GRACE_MS` (30d) → clear stamp when data returns (clock resets).
- **(d) hide-empty is gated to customer-mode ONLY** — `PatientDashboard` derives `isCustomerMode = !!sessionData?.__customerMode`; the "ไม่มีคอร์สคงเหลือ" empty box renders `{!isCustomerMode && courses.length === 0 && ...}` (admin/sync view KEEPS it as feedback). When customer-mode + all-empty (appts==0 && courses==0 && expired==0) → one subtle `tx.noneYet` line (Q2=B), not a bare page.

**Forbidden**:
- ❌ re-inlining the usable-course / upcoming-appt filter in the endpoint or cron (drift between "what the link shows" and "what the cron calls empty").
- ❌ `batch.delete` / `deleteDoc` of the customer doc in the cleanup cron (it's a link cleanup, not a customer wipe — clear the token only).
- ❌ hiding the empty courses box outside customer-mode (would remove the admin/sync "synced, 0 courses" feedback).
- ❌ counting expired courses as "remaining" in `isCustomerLinkEmpty` (would keep dead links alive).

**Sanctioned consumers**: `src/lib/customerLinkPayloadCore.js` (the core) · `api/patient-view.js` (computeUsableCourses + isAppointmentUpcoming) · `api/cron/patient-link-cleanup-sweep.js` + `scripts/patient-link-cleanup-sweep.mjs` (isCustomerLinkEmpty + decidePatientLinkCleanup) · `src/pages/PatientDashboard.jsx` (isCustomerMode gate + subtle line).

**Cron**: daily `30 21 * * *` (vercel.json) · CRON_SECRET-gated · admin SDK · canonical `artifacts/{APP_ID}/public/data` · audit doc `be_admin_audit/patient-link-cleanup-sweep-<ts>-<rand>`. NO firestore.rules / index change (`be_appointments where customerId==` already used by the endpoint; admin SDK bypasses rules) → no Probe-Deploy-Probe.

**Source-grep regression**: `tests/patient-link-cleanup-and-hide-empty.test.js` (real-core unit A-D + flow-simulate E + AV135 source-grep F1-F8).

**Cross-link**: spec/plan `docs/superpowers/{specs,plans}/2026-05-26-patient-link-hide-empty-boxes-auto-cleanup*` · Customer Patient-Link feature (2026-05-25, AV126-128) · Rule Q-honest (real-core unit + flow-simulate; UI = L1 real-browser on the anon link; cron = L2 real-prod DRY-RUN, `--apply` user-authorized post-deploy per Rule M — disclosed).

### AV136 — Appointment card cosmetic-shell redesign: theme-matched OPD pills + 5-band layout + stepper OFF-LIMITS (2026-05-26 EOD+6)

The appointment-hub card (`AppointmentHubRowCard.jsx`) is a COSMETIC-SHELL 5-band layout (header / finance / detail / OPD-footer / actions), theme-correct in BOTH Dark + Light. Invariants:

- **(a) OPD lifecycle pills MUST use the shared `OPD_PILL` tokens (`_apptHubStyles.js`: blue / emerald / wait / save) — light base + `dark:` override, mirroring `STATUS_CHIP_CLS`.** Unconditional dark-only semantic classes in `OpdLifecycleRow.jsx` are FORBIDDEN (they caused the Light-theme green-on-green: light-coloured text on a translucent dark bg with no light base). Grep: `bg-(emerald|blue|slate|red)-(900|950|800)/\d+` inside `OpdLifecycleRow.jsx` (excluding comments) → ZERO.
- **(b) the round-circle `สถานะ OPD` stepper (`AppointmentOpdStepperRow` / `TreatmentLifecycleStepper`) is OFF-LIMITS** — re-parented VERBATIM into the footer band, NEVER restyled/recolored (Q4). It is a SHARED Phase 28 component (also rendered by the Backend treatment-history `CustomerDetailView`); recoloring would propagate there. This redesign edits neither file.
- **(c) the re-layout is cosmetic-shell** — every `data-testid` (26 on the card + 6 on the row), every `onClick`/handler prop, every render conditional (`hasTreatmentForDay` / `rawStatus` / `isPastDate` / `showMarkCompleteBtn` / `showUnmarkBtn` / `opdLifecycle` gates / `effectiveStatus`), and every button/chip/field label preserved byte-for-byte — EXCEPT the two sanctioned label changes: Q5 removed the "⚙ OPD lifecycle" header span; Q6 renamed the save button `บันทึกลง OPD` → `บันทึกเข้าระบบ` (label text only; `onSaveOpd` + `data-testid="opd-save-btn-active"` unchanged).
- **(d) patient name stays sky-blue, never red** (Thai-culture iron-clad) — `row-name` uses `text-sky-700 dark:text-sky-300`. The rose save-CTA pill is a BUTTON, not a name/HN, so red there is allowed.

**Forbidden**:
- ❌ unconditional dark-only semantic classes on OPD pills (no light base) — the green-on-green bug.
- ❌ editing / restyling / recoloring `AppointmentOpdStepperRow` or `TreatmentLifecycleStepper` (shared, OFF-LIMITS).
- ❌ dropping any `data-testid` / handler / conditional during a card re-layout (cosmetic-shell — markup may move, behavior may not).
- ❌ red on the patient name / HN.
- ❌ `{(() => …)()}` IIFE inside the card JSX (Vite OXC crash — Rule 03-stack).

**Sanctioned consumers**: `src/components/admin/_apptHubStyles.js` (`OPD_PILL` token source) · `src/components/admin/OpdLifecycleRow.jsx` (consumes `OPD_PILL`) · `src/components/admin/AppointmentHubRowCard.jsx` (5-band layout; re-parents the stepper). The `บันทึกลง OPD` string in AdminDashboard (kiosk `handleOpdClick` OPD-save + its toast) is a DIFFERENT button — NOT renamed by this redesign.

**Source-grep regression**: `tests/appointment-card-redesign.test.jsx` (T1 tokens · T2 OpdLifecycleRow theme-match + Q5 + Q6 · T3 cosmetic-shell invariant: every testid + handler + sky-name). v118-rtl R3.4 V21-fixed for the removed header.

**Cross-link**: spec/plan `docs/superpowers/{specs,plans}/2026-05-26-appointment-card-redesign*` · Rule Q-vis (rendered pixels verified by eye in a real browser, Dark + Light) · cosmetic-shell-redesign-constraint + mockup-depict-offlimits-verbatim user-memories.
