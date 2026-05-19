---
name: audit-anti-vibe-code
description: "Audit the three Vibe-Code failure modes: hardcode/duplication (violates Rule of 3), security slop (leaked uids, Math.random tokens, open Storage/Firestore rules, world-readable admin fields), and premature schema (orphan collections, parallel docs that should be denormalized). Use before every release and whenever a PR adds a new collection, rule, or 20+ LOC of form/modal code."
user-invocable: true
allowed-tools: "Read, Grep, Glob"
---

# Audit Anti-Vibe-Code

Named after the vibe-code warning 2026-04-19: AI writes fast, but speed today
= burden tomorrow if the foundation is rotten. Three failure modes to scan:

## Invariants (AV1–AV15, AV80–AV83)

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

### AV80 — Absolute-positioned overlay inside overflow-x-auto container (V84)
**Why**: V84 — `.menu-badge` was `position:absolute; top:-6px; right:-6px;` inside a tab container with `overflow-x-auto`. CSS spec auto-promotes `overflow-y: visible` → `overflow-y: auto` whenever overflow-x is non-visible. Badges that protrude above/below the container are CLIPPED by the implicit overflow-y. Plus right-protrusion overlapped neighbor when container gap < badge offset.
**Grep**:
- `overflow-x-auto` and `overflow-x: auto` in JSX className / CSS — for each, check if the container holds absolutely-positioned children with negative top/right offsets via grep on `.<descendant>:: { position: absolute; (top|right): -\d+px }`.
- Pair-check: any `.menu-badge`-style class with negative top/right inset MUST be inside a container that either has overflow-x visible OR uses padding-margin trick (padding-{top,right,bottom} + matching negative margins). Single anchor: `.menu-tab-scroll` (V84 canonical pattern).
**Fix**: padding-margin trick. Container gets `padding-top: Npx; padding-{right,bottom}: ...; margin-top: -Npx; margin-{right,bottom}: ...;` so the absolute overlay has room within the clipping content box while outer layout net-zero changes. Pair with `gap-{N}` ≥ badge-right-protrusion to prevent neighbor overlap. Source-grep regression in `tests/v84-menu-badge-overflow-y-clip.test.js` locks the contract.

### AV81 — V85 Glow utility application discipline (2026-05-18)
**Why**: V85 — Universal glow effect system applies cosmetic shadows via 20 utility classes (`.fx-glow-v[2-10]` + `.fx-glow-u[1-10]`) across ~50 component files + ~70 modals. Without an invariant, the utilities drift: animated variants forget `prefers-reduced-motion`, light theme overrides go missing, and sanctioned exceptions (menu system + print views) silently get glow classes that break PDF render OR violate the menu user-guardrail (2026-05-18 EOD+9 "ห้ามไปยุ่งกับระบบเมนูที่เราทำนะ ทั้งเมนูแบบเดิมและเมนูแบบใหม่ มันสวยอยู่แล้ว").
**Grep**:
- `\.fx-glow-(v\d+|u\d+|u9-\w+)` in `src/index.css` — every utility class must (a) be defined under the V85 utility block (anchor: `V85 — Universal Glow Effect`), (b) have a `[data-theme="light"]` override, (c) if animated (V4/V5/V6/V7/V9/U6), have a `prefers-reduced-motion: reduce` override turning it off.
- `fx-glow-` in `src/components/backend/shell/BackendArcBloom.jsx`, `BackendSubTabBloom.jsx`, `BackendDuoPill.jsx`, `BackendSidebar.jsx`, `BackendMobileDrawer.jsx`, `BackendCmdPalette.jsx` — must return ZERO matches (menu system user-guardrail).
- `fx-glow-` in `src/components/SalePrintView.jsx`, `QuotationPrintView.jsx`, `BulkPrintModal.jsx`, `DocumentPrintModal.jsx`, `src/lib/documentPrintEngine.js` — must return ZERO matches (PDF render breaks).
- `.menu-` and `.bloom-` CSS rule bodies in `src/index.css` — must NOT contain `box-shadow:` changes vs pre-V85 baseline hash (menu look is locked).
**Fix**: any component importing `fx-glow-*` must keep existing `bg-*` / `border-*` / `rounded-*` tokens (utility is additive). Any sanctioned-exception file violating the grep gets the class removed in the same commit. Source-grep regression: `tests/v85-glow-utility-css.test.js` CG1-CG7 locks the contract.

### AV82 — Shell-level handleNavigate must collapse all menu overlays (V85-followup, 2026-05-18 EOD9+1)
**Why**: V85-followup — `BackendShellNew.handleNavigate(tabId)` is the single coordination point through which BOTH the Cmd-palette and the ArcBloom orb-click route their navigation calls. Pre-fix it only did `onNavigate?.(tabId)` and left both overlay states (`bloomOpen` defaults `true`, `paletteOpen`) untouched. ArcBloom's own `handleOrbClick` / `handlePickerNavigate` paths called `onClose?.()` explicitly so bloom collapsed — but the Cmd-palette path went through `handleNavigate` only and never closed bloom → user picked a menu item in the palette → tab switched + palette closed itself via `onOpenChange(false)` → BUT bloom backdrop + orbs stayed mounted behind, dimming the page. Bug visible in the 2026-05-18 user screenshot: "menu UI space ข้างหลังมันไม่ปิด". Class-of-bug: "shell-owned overlay state leak on navigation through the central handleNavigate handler" — same family as AV59 (chat sibling-reader-sweep) at the shell-handler boundary.
**Grep**:
- `const handleNavigate = useCallback\([\s\S]*?\[onNavigate\]\)` in `src/components/backend/shell/BackendShellNew.jsx` — the body MUST contain BOTH `setBloomOpen(false)` and `setPaletteOpen(false)` alongside `onNavigate?.(tabId)`.
- Any shell component that owns ≥1 overlay state (e.g. future `BackendShellV3`) and exposes a `handleNavigate` to children MUST collapse ALL its owned overlay states inside `handleNavigate`. Pattern: every `useState(... true | false)` whose name ends in `Open` (`bloomOpen`, `paletteOpen`, `drawerOpen`, `sheetOpen`) and whose state lives in the same shell as a `handleNavigate` callback MUST be reset to `false` in that callback.
- Sanctioned exceptions: NONE. Drawer/sheet/palette/bloom all collapse on nav per the uniform contract.
**Fix**: every navigation handler at the shell layer = `onNavigate?.(tabId); setXxxOpen(false); setYyyOpen(false); ...`. Children (ArcBloom, SubTabBloom, CmdPalette) may keep their own `onClose?.()` calls — they become redundant but are harmless (React batches same-value setters). Source-grep regression: `tests/backend-menu-d-shell-rtl.test.jsx` T6.13 + T6.14 lock the contract.

### AV83 — V86 Neon Glow consumes CSS vars (universal red, admin-tunable) (2026-05-18 EOD+10 V86-followup-2)
**Why**: V86-followup-2 pivot — drop per-section dual-tone (V86 v1 design), use universal red (c1=#dc2626 border + c2=#ef4444 halo) with intensity multiplier (--neon-intensity, default 0.45). Admin tunes via SystemSettingsTab "เอฟเฟกต์แสงเรือง" section, persisted to clinic_settings/system_config.v86Glow. Per-section [data-section] CSS-vars blocks DROPPED (dead code under universal color).
**Grep**:
- `.v86-glow-` rules + V86 auto-glow rules in `src/index.css` MUST reference `var(--neon-c1)` / `var(--neon-c2)` for color AND wrap alphas in `calc(<base> * var(--neon-intensity))` — NO hardcoded RGB, NO bare alphas outside the factor.
- `:root` MUST define all 3 vars with V86-followup-2 defaults: `--neon-c1: 220, 38, 38;` + `--neon-c2: 239, 68, 68;` + `--neon-intensity: 0.45;`.
- `useV86GlowApply` hook (`src/hooks/useV86GlowApply.js`) + SystemSettingsTab `NeonGlowSection` (live-preview useEffect) are the ONLY 2 sanctioned callers of `document.documentElement.style.setProperty('--neon-c1' | '--neon-c2' | '--neon-intensity', ...)`.
- `.admin-frontend-zone` auto-glow selectors MUST exclude menu via triple `:not()` chain — `:not([data-testid="admin-top-menu"]):not([data-testid="admin-top-menu"] *):not([class*="menu-"])` — defense-in-depth against menu glow leak (per user reminder "ห้ามแตะเมนู").
- Menu files (BackendArcBloom + BackendSubTabBloom + BackendDuoPill + BackendSidebar + BackendMobileDrawer + BackendCmdPalette) MUST contain ZERO `v86-glow-` references.
- Print files (SalePrintView + QuotationPrintView + BulkPrintModal + DocumentPrintModal + documentPrintEngine) MUST contain ZERO `v86-glow-` references.
- Customer-facing files (PatientForm + PatientDashboard + ClinicSchedule) MUST contain ZERO `v86-glow-` + ZERO `data-section` + ZERO `admin-frontend-zone` references.
- Sanctioned exceptions: per-section `[data-section]` blocks DROPPED in V86-followup-2 (universal color now); the `data-section` attribute on BackendDashboard + AdminDashboard wrappers REMAINS as cosmetic display-metadata (future-proof for re-introducing per-section override).
**Fix**: V86 rules with hardcoded section RGB → consume `var(--neon-c1/c2)`. Alphas → wrap in `calc(<base> * var(--neon-intensity))`. Settings UI changes → flow through `validateV86Glow` → `saveSystemConfig` → `useV86GlowApply` (or the SystemSettingsTab live-preview useEffect). Source-grep regression: `tests/v86-neon-glow-css.test.js` CG1-CG9 + `tests/v86-followup-2-settings.test.jsx` VS1-VS6 lock the contract.

### AV84 — Patient-link button MUST be wrapped in OPD-save guard (V87, 2026-05-18 EOD+11)
**Why**: V87 — every "สร้างลิงก์ดูข้อมูล" / patient-link trigger (`setPatientLinkModal(session.id)`) renders a button that promises a customer-view of the saved OPD data. Before save there is no data to link to — the button must NOT appear. Pre-V87, only the history-view site (AdminDashboard.jsx:6080) had the guard; the sibling walk-in queue site (AdminDashboard.jsx:7967) rendered the button unconditionally on `กำลังรอ` rows. Class-of-bug: V12 multi-reader-sweep at the action-button boundary — same family as V36 (multi-call-site) / V47 (display-layer multi-reader-sweep) / V76 (chat_history sibling reader/writer). User directive (2026-05-18 EOD+11): "ไม่ว่าจะอยู่ Tab จองมัดจำ หรือ จองไม่มัดจำ หรือหน้าวอคอิน หรือหน้าประวัติ ถ้าไม่ได้บันทึกลง OPD ... ห้ามปรากฎขึ้นมาเด็ดขาด".
**Grep**:
- Every `setPatientLinkModal\(session\.id\)` callsite in `src/pages/AdminDashboard.jsx` (and any future file) MUST live inside a JSX branch gated by `session\.opdRecordedAt && session\.brokerStatus === 'done'`. The canonical "OPD saved" condition matches the visible "บันทึกลง OPD Card เรียบร้อย" badge.
- Closed sanctioned-exception list: NONE. The PatientLinkModal itself (5144-5191) can call `setPatientLinkModal(null)` to close — only trigger-OPEN sites (`setPatientLinkModal(session.id)`) need the guard.
- Total link-button trigger sites currently: 2 (history-view + walk-in queue). Adding a 3rd elsewhere REQUIRES the same OPD-save guard wrap.
**Fix**: any trigger-OPEN site without the guard gets wrapped immediately with `{session.opdRecordedAt && session.brokerStatus === 'done' && (` ... `)}` mirroring AdminDashboard.jsx:6080 verbatim. Source-grep regression: `tests/v87-link-button-opd-save-guard.test.js` G1-G3 locks both sites + the closed-list invariant.

### AV85 — TZ1 family: NO raw `new Date().toISOString().slice/substring/split` for date arithmetic (V93+iter2+iter3, 2026-05-18 EOD+11 LATE)
**Why**: V93 batch migrated 11 sites from `new Date().toISOString().slice(0,10)` → `thaiTodayISO()`. Class-of-bug = TZ off-by-one: UTC string truncation during Bangkok 00:00-07:00 returns the PREVIOUS day. Money records, deposit dates, report exports, document signature dates, **and forward-projected validity dates (course/coupon/membership expiry)** all drift. Audit iters caught:
- iter-2: `src/lib/clinicReportAggregator.js:298` using `.slice(0,7)` for month default (different slice width).
- iter-3: `src/lib/backendClient.js:1523` + `src/lib/courseExchange.js:81` using `new Date(Date.now() + N*86400000).toISOString().split('T')[0]` for validity-end calc → drifts course/exchange expiry by 1 day at Bangkok 00:00-07:00.

AV85 locks the FAMILY of TZ-unsafe truncation patterns including future-date arithmetic. **Rule P Step 6 — regression tests lock specific sites; AV85 grep covers EVERY future code path globally**.

**Grep** (any of these in `src/` outside `tests/` / `.claude/` / `.agents/` / `docs/` / sanctioned `tests/extended/audit-2026-04-26-tz1-fixes.test.js`):
- `new Date\(\)\.toISOString\(\)\.slice\(\s*0\s*,\s*10\s*\)` — day default (use `thaiTodayISO()`)
- `new Date\(\)\.toISOString\(\)\.slice\(\s*0\s*,\s*7\s*\)` — month default (use `thaiYearMonth()`)
- `new Date\(\)\.toISOString\(\)\.substring\(\s*0\s*,\s*(7|10)\s*\)` — alt syntax (same fix)
- `new Date\(\)\.toISOString\(\)\.split\(['"]T['"]\)\[0\]` — alt syntax (same fix)
- `new Date\(Date\.now\(\)\s*\+[^)]*\)\.toISOString\(\)\.split\(['"]T['"]\)\[0\]` — future-date arithmetic (use `thaiDateNDaysFromNow(days)`)
- `new Date\(Date\.now\(\)\s*\+[^)]*\)\.toISOString\(\)\.slice\(0,?\s*10\)` — same as above with slice instead of split

**Fix**: use canonical helpers from `src/utils.js`:
- Day default (today): `thaiTodayISO()` returns `'YYYY-MM-DD'`
- Month default: `thaiYearMonth()` returns `'YYYY-MM'`
- Now-minutes-of-day: `thaiNowMinutes()`
- **Future date N days from now**: `thaiDateNDaysFromNow(days)` returns `'YYYY-MM-DD'` Bangkok-anchored (added iter-3)
- For pure-helper modules consumed by api/ AND src/ (e.g. `lineBotResponder.js`): inline a `_thaiTodayISO()` byte-equivalent to keep the module dependency-free.

**Closed sanctioned exception list** (5 entries — adding a 6th requires V-entry):
1. `src/lib/backendClient.js:10366` — INV / ID timestamp compaction (`new Date().toISOString().slice(0,16).replace(...).slice(0,12)`) — ID generator, NOT user-visible display.
2. `src/components/backend/DocumentPrintModal.jsx:231` — filename timestamp (same pattern as above; file label only).
3. `src/lib/documentPrintEngine.js:450` — same filename timestamp pattern accepting `date` Date param.
4. `src/lib/lineBotResponder.js:_thaiTodayISO()` — inlined Bangkok helper for Vercel serverless (api/webhook/line.js + api/admin/link-requests.js consumers); byte-equivalent to canonical `thaiTodayISO()`.
5. Vercel serverless `api/**` modules — may inline the same Bangkok helper to stay dependency-free; MUST emit a comment crosslinking to `src/utils.js` for verification.

**Source-grep regression**:
- `tests/v93-tz1-batch-2026-05-18.test.js` (9 files V93 + iter-2 clinicReportAggregator + AV85 SKILL.md = 95 assertions)
- `tests/v95-tz1-iter3-validity-date.test.js` (NEW iter-3 — locks backendClient.js:1523 + courseExchange.js:81 + thaiDateNDaysFromNow helper unit + AV85 sanctioned list growth)

### AV86 — Firestore sentinel `deleteField()` requires `updateDoc()` OR `setDoc({merge:true})` (V96, 2026-05-19)
**Why**: V96 — TFP `v26StatusPatch` set `status: deleteField()` for staff/admin save (Phase 26.0b spec — clear status when admin finalizes treatment). In CREATE mode this payload was passed to `createBackendTreatment` which used `setDoc()` WITHOUT `{merge:true}` → Firestore client SDK throws: "deleteField() cannot be used with set() unless you pass {merge:true}". The throw blocked the WHOLE treatment save → cascade failures: auto-sale chain skipped (Bug A), database error visible (Bug B), course deduction skipped (Bug C). Phase 27.2-bis (2026-05-14) removed save-button gates → allowed direct staff-create → surfaced the latent bug. User report 2026-05-19: "ขึ้นแบบในภาพ" with screenshot of `setDoc() called with invalid data ... in document be_treatments/BT-1779181253570`.

**Grep** (any of these = AV86 violation):
- `setDoc\([^)]+,\s*\{[^}]*deleteField\(\)[^}]*\}\s*\)` — setDoc with deleteField inline (no merge option)
- Any helper that accepts arbitrary `detail` / `data` / `payload` and forwards to `setDoc()` without `{merge:true}` → defensive `{merge:true}` required (architectural backstop)
- TFP-style v26StatusPatch: `status: deleteField()` MUST be gated on `isEdit` (write happens via `updateDoc()` only, never `setDoc()`)

**Canonical replacements**:
- `updateDoc(docRef, { field: deleteField() })` — always valid; only on existing docs
- `setDoc(docRef, { field: deleteField() }, { merge: true })` — valid for create-or-update; deleteField is no-op for new docs (no field to delete)
- Pre-filter sentinels at caller: `if (status !== deleteFieldSentinel) topLevelPatch.status = status;` — keeps non-merge setDoc semantics

**Closed sanctioned exception list** (1 entry — adding a 2nd requires V-entry):
1. `src/components/TreatmentFormPage.jsx:2451-2462` — `status: deleteField()` is GATED on `isEdit` so it only reaches `updateBackendTreatment` (which uses `updateDoc()`). CREATE-mode skips the field entirely. Defense-in-depth at `src/lib/backendClient.js:createBackendTreatment` uses `setDoc({merge:true})` regardless — catches any future caller smuggling sentinels through `detail`.

**Source-grep regression**: `tests/v96-tfp-create-treatment-deletefield-fix.test.js` A-F groups (TFP isEdit gate + backendClient merge:true + updateBackendTreatment intact + post-fix shape simulation + AV86 SKILL.md presence + cross-file deleteField count = 1 + setDoc external-data must merge:true).

### AV87 — Firestore numeric writes MUST be finite (V100, 2026-05-19)
**Why**: V99 e2e (2026-05-19) found 2 latent defense gaps — admin SDK with `ignoreUndefinedProperties: true` accepts `NaN` + `Infinity` + `-Infinity` as values in numeric fields. Once persisted, reads return these poisoned values which break arithmetic everywhere downstream (balance comparisons fail, sums become NaN, aggregation queries return wrong totals). The common `Number(x) || fallback` pattern is FRAGILE because `Infinity || 1 === Infinity` (Infinity is truthy). AV87 mandates explicit `Number.isFinite()` checking via the canonical `safeNumber()` helper from `api/_lib/safeNumber.js`.

**Grep** (any of these = AV87 violation):
- `Number\(req\.body\?\..*\)\s*\|\|\s*\d` — bare `|| fallback` pattern in api/ writes (use `safeNumber()` instead)
- `parseFloat\(.*\)\.toString` writing to Firestore without `Number.isFinite()` guard
- Any Firestore `setDoc`/`update` receiving a freshly-computed numeric without finite-check
- Any admin SDK init missing the AV87 sanitization layer

**Canonical replacements**:
- Replace `Number(x) || 0` → `safeNumber(x, 0)` from `api/_lib/safeNumber.js`
- Replace `Number(x) || 1` → `safeNumber(x, 1, { min: 1 })`
- Use `strictNumber(x, 'fieldName')` when a transaction MUST receive a valid number (throws on non-finite)
- Use `isFiniteNumber(x)` as predicate before writes

**Closed sanctioned exception list** (3 entries):
1. `api/admin/backup-manager-list.js:85-86` — migrated to safeNumber (was the only `|| 1`/`|| 50` pattern in api/)
2. `api/admin/whole-fleet-customer-backup-export.js:218-232` — explicit `Number.isFinite()` + 400 response (defense already correct; not migrated to safeNumber because it returns HTTP 400 instead of silent fallback)
3. `api/admin/stock-withdrawal-approve.js:93,149` — `Number(data.status) !== 0` enum comparison, not arithmetic (NaN !== 0 returns true — correct rejection semantics)

**Source-grep regression**: future `Number(req.body?...)` patterns in api/ must use `safeNumber` from `api/_lib/safeNumber.js` OR explicit `Number.isFinite()` + 400 return.

### AV88 — TFP treatmentItems↔courseItems link MUST be auto-rescued at save boundary (V101, 2026-05-19 LATE+2)
**Why**: System-wide audit 2026-05-19 LATE+2 found **4 of 4 auditable treatments (100% bug rate)** where `treatment.detail.treatmentItems[].productId` matched a `customer.courses[].productId` BUT `treatment.detail.courseItems[]` saved as empty array → `customer.courses[].qty.remaining` NEVER decremented + `be_course_changes` audit log emitted ZERO 'use' events for those treatments. User-reported (วันเพ็ญ LC-26000078): "ตัดช็อคเวฟไปตั้งหลายรอบ ทำไมไม่เห็นตัดคอร์สเลย".

3 desync channels: (a) **edit-load self-perpetuating loop** at TFP:991 — `t.treatmentItems` load assigned `id=existing-${i}` while `selectedCourseItems` Set stayed empty (gate on `t.courseItems?.length` at line 1054 never fired when prior save had empty courseItems) → every subsequent edit save reproduced empty courseItems. (b) **State-sync race** between `selectedCourseItems` Set, `options.customerCourses` array, and `treatmentItems` array at save time. (c) **Purchase + use-immediately mismatch** where rowId lookup against post-buy customerCourses missed.

V100/V99/V96 missed it because every test layered admin-SDK on top of a synthesized `backendDetail` object — **never chained the React state lifecycle** (toggleCourseItem → setSelectedCourseItems → setTreatmentItems → handleSubmit → serialization). Mock-shadowed exactly per Rule Q V66 anti-pattern.

**Grep** (forbidden):
- `courseItems:\s*Array\.from\(selectedCourseItems\)\.map\([^)]+\)\.filter\(Boolean\)` — single-pass rowId-only serialization. Must use V101 two-pass `(() => { ... Pass 1 ... Pass 2 productId fallback ... })()` IIFE.

**Required pattern** (canonical V101):
- Pass 1: rowId-based lookup against `options.customerCourses[].products[].rowId` (preserves explicit selection)
- Pass 2: productId-based fallback for every `treatmentItem` with `productId` NOT covered by Pass 1 — finds first `customer.courses[].products[]` entry with matching productId + remaining > 0 (or fillLater / buffet) + stamps `_v101AutoLinked: true` forensic marker
- Edit-load (TFP:991): when restoring `t.treatmentItems`, prefer rebind to current `customerCoursesForForm[].products[].productId` (assigns matched `rowId` + populates `selectedCourseItems`). Falls back to `existing-${i}` ID only when no match.

**Closed sanctioned exception list** (0 entries — every TFP save MUST run V101 two-pass + edit-load rebind).

**Source-grep regression**:
- `tests/v101-treatment-course-link-desync.test.js` locks V101 source markers (`_v101AutoLinked` + two-pass IIFE shape + edit-load rebind productId match)
- Rule I flow-simulate via RTL mount of TreatmentFormPage with mock customer.courses[] state — verify save emits non-empty courseItems even when selectedCourseItems Set is stale OR when treatmentItems loaded via existing-N IDs.

**Rule M backfill required**: any prod treatment with `treatmentItems[].productId` + `courseItems[]` empty + matching customer.courses entry → retroactively (a) decrement customer.courses[].qty, (b) emit be_course_changes kind='use' with treatmentId, (c) stamp `_v101BackfilledAt` + `_v101BackfilledFrom` forensic fields.

### AV89 — Primary writers to branch-scoped collections MUST stamp top-level `branchId` (V102, 2026-05-19 LATE+2)
**Why**: System-wide audit 2026-05-19 LATE+2 (scripts/diag-system-wide-branchid-stamp-audit.mjs) found **51 docs across 7 collections missing top-level branchId** despite BSA Rule L declaring them branch-scoped. Worst offenders:
- `be_treatments`: 5/5 missing → BSA listener `where('branchId','==',selectedBranchId)` returned 0 rows → per-branch treatment timeline empty
- `be_sales`: 5/5 missing → per-branch SaleTab invisible → user-reported "ใบเสร็จในหน้าใบขายก็ไม่ไปสร้าง" (wanphen, LC-26000078)
- `be_stock_*` (orders/movements/batches): 37 missing `locationId` (stock-tier scope analog)
- `be_link_requests` + `be_df_staff_rates`: minor edge cases

Class-of-bug: **V12 multi-writer-sweep at Phase BS V2/V3 BSA migration**. 24 sibling writers (saveProduct, saveCourse, savePromotion, createDeposit, createBackendAppointment, createRecall, etc.) adopted `_resolveBranchIdForWrite()` via Phase BS V2/V3. `createBackendSale` + `createBackendTreatment` were missed.

**Graphify-confirmed** (post-update): `_resolveBranchIdForWrite` has 24 EXTRACTED `--calls→` edges in graphify-out/graph.json. createBackendSale + createBackendTreatment have ZERO incoming edges from this helper. Audit-via-graph caught the gap that grep-only would have missed.

**Grep** (forbidden — any of these = AV89 violation):
- New `export async function (create|save|add)[A-Z]\w*` in `src/lib/backendClient.js` that writes to a BSA branch-scoped collection (be_treatments, be_sales, be_appointments, etc.) but does NOT contain `_resolveBranchIdForWrite` call in the function body
- New write site that hardcodes `branchId` to a literal string OR omits the field entirely on `setDoc(...)`/`tx.set(...)` to a branch-scoped collection

**Canonical pattern** (mirror V102 in createBackendSale at backendClient.js:2915+):
```js
await setDoc(saleDoc(finalId), {
  saleId: finalId,
  branchId: _resolveBranchIdForWrite(data),  // V102 — BEFORE the spread
  ..._normalizeSaleData(data),
  ...
});
```
Spread AFTER the branchId line so caller-provided `data.branchId` (when set) overrides via the `_resolveBranchIdForWrite` early-return path. update writers should preserve existing branchId unless caller explicitly passes (cross-branch admin edit).

**Closed sanctioned exception list** (zero entries — every primary writer to a branch-scoped collection must stamp).

**Source-grep regression**: `tests/v102-sale-treatment-branchid-stamp.test.js` locks createBackendSale + createBackendTreatment to contain `_resolveBranchIdForWrite` call + V102 marker.

**Rule M backfill required**: any prod doc missing branchId in branch-scoped collection → retroactively resolve via linkedTreatmentId / detail.branchId / nakhonratchasima fallback + stamp `_v102BackfilledAt` forensic field. Canonical script: `scripts/v102-backfill-branchid-stamp.mjs`.

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

## How to run

1. Run each grep pattern; classify hits.
2. For AV1/AV10 (duplication): use `Read` to diff the candidate duplicates — if bodies match ≥70 %, flag for extraction.
3. For AV6: open `firestore.rules` and `storage.rules` if present. Check match blocks against the "world-readable" contract.
4. For AV5: pick the latest 3 commits that wrote to `clinic_schedules` or `opd_sessions.patientLinkToken` — re-read the payload.
5. For AV7/AV8/AV12: `grep -rE "collection\(db.*'(\w+)'" src/` — list collection names, then check for the paired access patterns.

## Priority

**CRITICAL**: AV4 (leaked credentials), AV5 (admin uid leak), AV6 (open rules).
**HIGH**: AV2 (raw date input), AV3 (Math.random tokens), AV11 (N+1 reads).
**MEDIUM**: AV1 (dup components), AV9 (canonical helpers not reused), AV10 (copy-paste UI).
**LOW**: AV7, AV8, AV12 — hygiene over time.

## Example violations from historical commits

- AV1 — DateField had 5 duplicates (SaleTab.DatePickerField, TreatmentFormPage.ThaiDatePicker, AdminDashboard.DatePickerThai + 2 inline). Unified `362da72`.
- AV2 — 5 sites with raw `<input type="date">` fixed in the same commit.
- AV3 — patientLinkToken used `Math.random().toString(36).substr(2,10)` × 2. Crypto upgrade `0d00701`.
- AV5 — `createdBy: user.uid` in schedule doc removed `335cb0e`.
- AV9 — dozens of ad-hoc `new Date().toISOString().slice(0,10)` display sites migrated to `thaiTodayISO()` `71e513f`.
