---
name: audit-anti-vibe-code
description: "Audit the three Vibe-Code failure modes: hardcode/duplication (violates Rule of 3), security slop (leaked uids, Math.random tokens, open Storage/Firestore rules, world-readable admin fields), and premature schema (orphan collections, parallel docs that should be denormalized). Plus AV13-AV17 institutional-memory invariants (long-lived auth bugs, silent cleanup, silent-swallow, list-spread-order). Use before every release and whenever a PR adds a new collection, rule, or 20+ LOC of form/modal code."
user-invocable: true
allowed-tools: "Read, Grep, Glob"
---

# Audit Anti-Vibe-Code

Named after the vibe-code warning 2026-04-19: AI writes fast, but speed today
= burden tomorrow if the foundation is rotten. Three failure modes to scan:

## Invariants (AV1–AV19)

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

## How to run

1. Run each grep pattern; classify hits.
2. For AV1/AV10 (duplication): use `Read` to diff the candidate duplicates — if bodies match ≥70 %, flag for extraction.
3. For AV6: open `firestore.rules` and `storage.rules` if present. Check match blocks against the "world-readable" contract.
4. For AV5: pick the latest 3 commits that wrote to `clinic_schedules` or `opd_sessions.patientLinkToken` — re-read the payload.
5. For AV7/AV8/AV12: `grep -rE "collection\(db.*'(\w+)'" src/` — list collection names, then check for the paired access patterns.

## Priority

**CRITICAL**: AV4 (leaked credentials), AV5 (admin uid leak), AV6 (open rules), AV13 (long-lived auth), AV15 (silent-swallow + missing token revoke), AV17 (list spread order — silent no-op), AV18 (migrate-fn zero-arity dropping branchId — silent zombie creation).
**HIGH**: AV2 (raw date input), AV3 (Math.random tokens), AV11 (N+1 reads), AV14 (silent cleanup), AV16 (source-grep alone for visual).
**MEDIUM**: AV1 (dup components), AV9 (canonical helpers not reused), AV10 (copy-paste UI).
**LOW**: AV7, AV8, AV12 — hygiene over time.

## Example violations from historical commits

- AV1 — DateField had 5 duplicates (SaleTab.DatePickerField, TreatmentFormPage.ThaiDatePicker, AdminDashboard.DatePickerThai + 2 inline). Unified `362da72`.
- AV2 — 5 sites with raw `<input type="date">` fixed in the same commit.
- AV3 — patientLinkToken used `Math.random().toString(36).substr(2,10)` × 2. Crypto upgrade `0d00701`.
- AV5 — `createdBy: user.uid` in schedule doc removed `335cb0e`.
- AV9 — dozens of ad-hoc `new Date().toISOString().slice(0,10)` display sites migrated to `thaiTodayISO()` `71e513f`.
- AV17 — `listProducts` + `listCourses` spread order swapped to `{...d.data(), id: d.id}` in V38 (2026-05-07). 5 พระราม 3 products + 2 courses had stray `data.id` overriding docId → handleDelete silent no-op. **V38-followup mass-sweep** (commit after V39, 2026-05-07) extended the fix to all 85+ callsites across 15 files; full suite 6757/6757 PASS post-sweep.
- AV18 — V39 (2026-05-07) patched 4 migrate fns (promotions/coupons/vouchers/df_staff_rates) + 4 mappers (`buildBe{Promotion,Coupon,Voucher}FromMaster` + `mapMasterToDfStaffRates`) to accept `{branchId}` opt. 479 zombie docs backfilled to พระราม 3 via `scripts/phase-24-0-vicies-novies-decies-backfill-zombie-branchid.mjs --apply`. Audit doc `be_admin_audit/phase-24-0-vicies-novies-decies-backfill-zombie-branchid-1778102599138-4d7618f4`.
