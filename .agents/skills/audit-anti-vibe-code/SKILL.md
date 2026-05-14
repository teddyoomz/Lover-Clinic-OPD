---
name: audit-anti-vibe-code
description: "Audit the three Vibe-Code failure modes: hardcode/duplication (violates Rule of 3), security slop (leaked uids, Math.random tokens, open Storage/Firestore rules, world-readable admin fields), and premature schema (orphan collections, parallel docs that should be denormalized). Plus AV13-AV17 institutional-memory invariants (long-lived auth bugs, silent cleanup, silent-swallow, list-spread-order). Use before every release and whenever a PR adds a new collection, rule, or 20+ LOC of form/modal code."
user-invocable: true
allowed-tools: "Read, Grep, Glob"
---

# Audit Anti-Vibe-Code

Named after the vibe-code warning 2026-04-19: AI writes fast, but speed today
= burden tomorrow if the foundation is rotten. Three failure modes to scan:

## Invariants (AV1–AV44)

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

## How to run

1. Run each grep pattern; classify hits.
2. For AV1/AV10 (duplication): use `Read` to diff the candidate duplicates — if bodies match ≥70 %, flag for extraction.
3. For AV6: open `firestore.rules` and `storage.rules` if present. Check match blocks against the "world-readable" contract.
4. For AV5: pick the latest 3 commits that wrote to `clinic_schedules` or `opd_sessions.patientLinkToken` — re-read the payload.
5. For AV7/AV8/AV12: `grep -rE "collection\(db.*'(\w+)'" src/` — list collection names, then check for the paired access patterns.

## Priority

**CRITICAL**: AV4 (leaked credentials), AV5 (admin uid leak), AV6 (open rules), AV13 (long-lived auth), AV15 (silent-swallow + missing token revoke), AV17 (list spread order — silent no-op), AV18 (migrate-fn zero-arity dropping branchId — silent zombie creation).
**HIGH**: AV2 (raw date input), AV3 (Math.random tokens), AV11 (N+1 reads), AV14 (silent cleanup), AV16 (source-grep alone for visual), AV29 (per-branch settings multi-reader-sweep — silent override loss).
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
