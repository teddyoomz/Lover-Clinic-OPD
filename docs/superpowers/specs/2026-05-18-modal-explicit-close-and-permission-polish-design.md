# 2026-05-18 EOD+8 — Modal explicit-close-only + Permission polish (link-requests perm key + label cleanup)

> User pre-authorized auto-recommendation + sub-agent dispatch + overnight loop ("เอาตามที่นายแนะนำทุกอย่าง Approved ทุกแพลน ... ผมจะไปนอนแล้ว ทำไปยาวๆเลย"). Brainstorming HARD-GATE honored via self-Q&A with locked answers in this spec.

## Problem statement (verbatim user reports)

1. **Modal accidental-close pain** — "พอกรอกข้อมูลใน modal ใกล้จะหมดแล้ว ดันไปเผลอคลิ๊กตรงบริเวณที่ที่ว่างรอบๆ modal แล้ว modal มันปิดไปเอง ทำให้ต้องเริ่มกรอกข้อมูลใหม่ หัวร้อนมากๆ ... user คลิ๊กพลาดปิด modal บ่อยจนอยากจะทุบคอมทิ้ง". Wants UNIVERSAL fix at few touchpoints, not hard-coded per modal.
2. **Add `link_request_management` permission** — currently `tab=link-requests` is `adminOnly: true`; need a per-permission grant so per-branch users can manage their branch's link requests with full access.
3. **Strip `(29.22)` and `(16.3)` numerical tags** from permission labels — both phases done, the tags are noise.
4. **Test per-branch full access** — confirm a user with `link_request_management` in branch A can fully read/edit `tab=link-requests` for branch A only.

## Current-state research (pre-flight Triangle Rule F + Rule P Step 3)

**Modal landscape (greppable — verified post-self-review)**:
- 57 files in `src/components/**/*.jsx` carry `fixed inset-0 ... bg-black` backdrop pattern (complete list captured in plan)
- ~83 distinct backdrop instances (some files render multiple modals — e.g. `DepositPanel` has cancel + refund + detail; ChatPanel + CustomerDetailView + TreatmentFormPage are panels with inline confirm modals)
- 2 dominant patterns:
  - **Pattern A** (`AppointmentFormModal`, `DepositPanel` cancel/refund/detail, `CustomerBackupModal`, ~50 sites): `<div className="fixed inset-0 ..." onClick={onClose} onKeyDown={Escape→onClose}><div onClick={e => e.stopPropagation()}>...</div></div>`
  - **Pattern B** (`RecallCreateModal`, ~10 sites): `<div className="fixed inset-0 ..." onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}><div onClick={e => e.stopPropagation()}>...</div></div>`
- 1 sanctioned exception class: **image lightboxes** (`StaffChatImageLightbox`, `TreatmentTimelineModal` inner Lightbox helper) — click-anywhere-closes IS the expected UX for fullscreen image viewers (Stripe, Linear, etc. follow this convention).
- **No shared `<Modal>` component**, no Headless UI usage. Each modal is ad-hoc.

**Permission landscape**:
- `src/lib/permissionGroupValidation.js` has 134 keys (1 dashboard + 7 customer + 9 appointment + 4 treatment + 9 sale + 6 course + 5 finance + 14 stock + 8 marketing + 4 df + 6 document + 6 analytics + 42 reports + 13 settings). User says "135" — off-by-one is immaterial; +1 lands at 135 or 136 depending on counting.
- `'ตั้งค่าระบบ (16.3)'` at line 242 + `'จัดการเคส Recall (29.22)'` at line 247 carry phase tags slated for cleanup.
- `src/lib/tabPermissions.js:109` has `'link-requests': { adminOnly: true }` — needs change to `{ requires: ['link_request_management'] }` (admin bypass still works via `isAdmin` early-return at line 173 of `canAccessTab`).
- `LinkRequestsTab.jsx` already branch-scoped via `useSelectedBranch` (line 42) + `listLinkRequests({ branchId: selectedBranchId })` (line 57). No per-branch listener wiring change needed.

## Q1-Q5 (self-locked per user pre-authorization)

### Q1 — Modal universal fix: mechanical strip vs new wrapper component?

**Choice A (RECOMMENDED)**: **Mechanical backdrop-onClick strip across all ~56 files** via parallel subagents. Remove the `onClick={onClose}` (Pattern A) and `onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}` (Pattern B) attributes from backdrop `<div className="fixed inset-0 ... bg-black/...">`. KEEP `onKeyDown` Escape handler (ESC still closes — accessibility). KEEP `onClick={e => e.stopPropagation()}` on inner content (no-op after backdrop strip but removing risks Edit regression; harmless to keep).

**Choice B**: Build new `<Modal>` wrapper component + migrate all 56 files. Long-term clean but huge migration risk; each modal has different shape/sizing/sticky-header/etc.

**Choice C**: Global document-level click interceptor at root. Fragile; React inline onClick doesn't compose cleanly with capture-phase.

**LOCKED: Choice A**. Why: ~56 files but only ~83 single-line edits (one Edit per backdrop div per file). Subagent-parallelizable (6 agents × ~9 files). Zero new abstraction. ESC + X button + Cancel button still close. Source-grep regression invariant locks behavior permanently. Sanctioned-exception list (image lightboxes only) explicit + auditable.

### Q2 — Sanctioned exception for image lightboxes?

**Choice A (RECOMMENDED)**: Yes — image lightboxes (fullscreen attachment viewers) keep `onClick={onClose}` because click-anywhere-closes IS expected fullscreen-viewer UX. Sanction with comment marker `// audit-anti-vibe-code: AV67 lightbox-explicit-exception`.

**Choice B**: No — even lightboxes get explicit-close-only treatment.

**LOCKED: Choice A**. Closed exception list (1 file — verified):
1. `src/components/staffchat/StaffChatImageLightbox.jsx` — fullscreen chat image viewer (click-anywhere-closes IS the expected UX)

(Verified during spec self-review: `TreatmentTimelineModal.jsx` had inner Lightbox helper REMOVED already — dead code comment at line 22 confirms — its outer modal goes through standard strip. `ChartCanvas.jsx` has NO `fixed inset-0 bg-black` pattern — not a modal. Sanctioned list is exactly 1 file.)

### Q3 — ESC key behavior: keep / centralize / remove?

**Choice A (RECOMMENDED)**: Keep existing per-modal `onKeyDown={e => Escape → onClose}` as-is. Don't centralize via new shared hook. Why: would require touching all 56 files again; existing code works; ESC closure is standard UX.

**LOCKED: Choice A**. Accessibility preserved; minimal-touch principle.

### Q4 — Permission gate for `link-requests`: bypass-or-replace adminOnly?

**Choice A (RECOMMENDED)**: Replace `'link-requests': { adminOnly: true }` → `'link-requests': { requires: ['link_request_management'] }`. Admin bypass still works (via `isAdmin` early-return at canAccessTab:173). Non-admin user with the permission grant also gets in. Mirror of existing pattern: `'system-settings': { requires: ['system_config_management'] }`.

**Choice B**: Keep adminOnly AND add requires. Result: only admins still see it (adminOnly trumps). Wrong intent.

**LOCKED: Choice A**.

### Q5 — Permission scope: universal or per-branch?

**Choice A (RECOMMENDED)**: Universal permission key. Per-branch visibility happens at the DATA layer (`listLinkRequests({branchId})` already wired). Mirror of every other branch-scoped tab: perm grants visibility; branch context grants which records show.

**LOCKED: Choice A**.

## Architecture

### Item 1 — Modal explicit-close-only

**Mechanical strip via parallel subagents**:

For each modal file, find the OUTER backdrop div matching `<div className="fixed inset-0 ... bg-black/N ...` and:
- **Remove**: `onClick={onClose}` OR `onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}` attribute
- **Keep**: `onKeyDown={e => { if (e.key === 'Escape') onClose(); }}` attribute (accessibility)
- **Keep**: inner `onClick={e => e.stopPropagation()}` on content div (no-op after strip but harmless; removing risks Edit failures)
- **Insert marker comment** ABOVE the outer div: `{/* audit-anti-vibe-code: AV67 explicit-close-only — backdrop click does NOT close (V18+EOD8 user: คลิ๊กพลาดปิด modal) */}`

**Sanctioned exceptions** (DON'T strip — closed list of 1 file):
- `StaffChatImageLightbox.jsx` — fullscreen chat image viewer
- Marked with `// audit-anti-vibe-code: AV67 lightbox-explicit-exception` annotation

**NEW AV67 invariant** in `audit-anti-vibe-code` SKILL.md:
```
AV67 — Modal backdrop click MUST NOT close (EOD8, 2026-05-18)
       Every `<div className="fixed inset-0 ... bg-black/...">` backdrop
       in src/components/**/*.jsx MUST NOT have an `onClick={onClose}`
       or `onClick={(e) => { ... onClose ... }}` attribute. ESC key,
       X button, Cancel button, or other explicit close affordance ONLY.
       Sanctioned exceptions: image lightboxes (closed list of 3 files).
       User report (verbatim, locked permanent): "คลิ๊กพลาดปิด modal
       บ่อยจนอยากจะทุบคอมทิ้ง".
```

**Source-grep regression test** at `tests/v83-modal-explicit-close-only.test.js`:
- Scan every `*.jsx` under `src/components/`
- Find lines matching `fixed inset-0[^"]*bg-black`
- Within the same JSX block (next ~3 lines), assert NO `onClick=\{onClose\}` or `onClick=\{\(e\) =>.*onClose`
- Allow exceptions only if file is in closed list OR file contains the AV67 lightbox-explicit-exception annotation
- Lock the sanctioned exception list explicitly (closed list — adding a 4th lightbox needs a test fix + V-entry)

### Item 2 — Add `link_request_management` permission key

**Edit** `src/lib/permissionGroupValidation.js` `settings` module (line 224-249) — append between `recall_management` and the module closing:
```js
// EOD8 (2026-05-18) — Per-branch link request management. Owner can grant
// to branch manager so they can approve/reject LINE link requests for
// their branch without needing the full admin claim. Tab itself remains
// branch-scoped via useSelectedBranch; this perm grants visibility.
{ key: 'link_request_management',      label: 'จัดการคำขอผูก LINE' },
```

**Edit** `src/lib/tabPermissions.js` line 109:
```diff
- 'link-requests':       { adminOnly: true },  // V32-tris-quater — LINE link approval queue
+ 'link-requests':       { requires: ['link_request_management'] },  // EOD8 — admin bypass implicit; per-branch user with perm gets access (LinkRequestsTab already branch-scoped via useSelectedBranch)
```

### Item 3 — Strip `(29.22)` and `(16.3)` from labels

**Edit** `src/lib/permissionGroupValidation.js`:
- Line 242: `'ตั้งค่าระบบ (16.3)'` → `'ตั้งค่าระบบ'`
- Line 247: `'จัดการเคส Recall (29.22)'` → `'จัดการเคส Recall'`

(Phase 16.3 + 29.22 are complete — tags are residual phase markers.)

### Item 4 — Per-branch full-access verification

**Test pyramid**:
1. **Unit** (`tests/v83-link-request-permission.test.js`):
   - `canAccessTab('link-requests', { link_request_management: true }, false)` → `true`
   - `canAccessTab('link-requests', {}, true)` → `true` (admin bypass)
   - `canAccessTab('link-requests', {}, false)` → `false` (no perm, no admin)
   - `ALL_PERMISSION_KEYS.includes('link_request_management')` → `true`
   - `PERMISSION_MODULES.find(m => m.id === 'settings').items.some(i => i.key === 'link_request_management')` → `true`

2. **Source-grep regression** (same file):
   - `permissionGroupValidation.js` contains `'link_request_management'` key entry
   - `tabPermissions.js` `link-requests` entry contains `requires: ['link_request_management']` AND does NOT contain `adminOnly: true`
   - No string `'(29.22)'` or `'(16.3)'` remains anywhere in `src/lib/permissionGroupValidation.js`

3. **Rule I flow-simulate** (`tests/v83-modal-explicit-close-flow-simulate.test.jsx`):
   - Render AppointmentFormModal with onClose spy
   - Simulate click on backdrop div → assert `onClose` NOT called
   - Simulate keydown Escape → assert `onClose` IS called
   - Simulate click on X button → assert `onClose` IS called
   - Repeat for 3 different modals (AppointmentFormModal + CustomerBackupModal + RecallCreateModal) to cover both Pattern A and Pattern B
   - Permission test: render BackendDashboard with user `{permissions: {link_request_management: true}}` + non-admin → assert `link-requests` tab appears in sidebar

4. **Rule Q V66 verification (PER PROJECT RULE Q — MANDATORY)**:
   - **L1 PREFERRED** (Playwright real-browser): `tests/e2e/v83-modal-no-backdrop-close.spec.js` — open 5 representative modals on running dev → click 4 corners + center of backdrop → assert modal stays open → click X → assert modal closes
   - **L2 ACCEPTABLE** (real client SDK admin-test-fixture): admin SDK script seeds TEST-LINKREQ-V83 fixture in branch BR-A + branch BR-B → fake-auth as test-user with `link_request_management:true` in BR-A → call `listLinkRequests({branchId:'BR-A'})` → assert only BR-A docs returned + count > 0 → switch branch context → call again with BR-B → assert only BR-B docs returned
   - **L3 USER WALKTHROUGH**: deferred to user wake-up (multi-device hands-on)

### Item 5 — Process directive (autonomous loop)

- Subagent dispatch authorized for mechanical work (Task A modal strip × 6 agents parallel; Task B is single-file; Task C+D unit tests; Task E flow-simulate)
- Code reviewer agent on each batch (spec compliance + Rule Q V66 contract check)
- Loop test → fix → loop until ALL GREEN + full vitest at batch end (Rule N override at batch end)
- NO DEPLOY — joins existing ~20-commit queue per V18; user authorizes `vercel --prod` separately

## Risk + mitigation

| Risk | Mitigation |
|---|---|
| Subagent over-narrowing (V82-class) | Spec EXPLICITLY enumerates Pattern A + B + lightbox exception list; agents instructed to verify against both shapes |
| Sanctioned exception drift (4th lightbox added later silently) | Source-grep test locks closed list; adding a new lightbox fails build until test extended + V-entry filed |
| Edit fails silently (V6 family) | Each subagent must run `git diff --stat` after batch + post-grep regression check before reporting done |
| Test mocks lie (V66 Rule Q) | Flow-simulate uses RTL real DOM event dispatch; L1/L2 mandatory before "verified" claim |
| Breaking existing modal close functionality | Keep ESC key handler + X button click handler + Cancel button click handler intact in every file; ONLY remove backdrop-onClick |
| AppointmentFormModal `e.stopPropagation()` removal regression | DO NOT remove inner-content stopPropagation; it becomes no-op but doesn't break anything (V21 leave-it-alone principle) |
| Permission test against real prod data accidentally | All Rule Q L2 fixtures use TEST-LINKREQ-V83 prefix per V33 lineage; cleanup zero-orphan verification mandatory |
| Cosmetic-shell rule violation (V18-EOD3-LATE) | This change touches behavioral wiring (onClick handler), NOT cosmetic shell. NOT a redesign — a bug fix. Cosmetic-shell rule doesn't apply. |

## Out of scope

- Building a new `<Modal>` shared component (Q1-B rejected — Choice A is sufficient)
- Centralizing ESC key handler (Q3-A locked — current per-file pattern works)
- Touching dropdown/popover components (NOT modals — different UX paradigm)
- Migrating to Headless UI / Radix Dialog (would require all-or-nothing migration; YAGNI)
- Adding per-branch permission key (Q5-A locked — perm is universal, branch context is data-layer)
- Pre-launch H-bis cleanup (USER-TRIGGERED ONLY per feedback locked 2026-04-29)
- Deploying any of this (USER-TRIGGERED ONLY per V18)

## Acceptance criteria

- All ~56 modal files (~83 backdrop instances) stripped of backdrop-onClick except 3 sanctioned lightboxes
- AV67 invariant added + source-grep regression test green
- `link_request_management` perm key added to `permissionGroupValidation.js`; visible in PermissionGroupFormModal UI (auto-renders from catalog)
- `tabPermissions.js` `'link-requests'` gate switched from adminOnly → requires
- 2 phase-tag strings `(29.22)` + `(16.3)` removed from labels; no remaining occurrences
- Unit + source-grep + Rule I flow-simulate + Rule Q L1 (or L2 if Playwright admin creds unavailable) ALL GREEN
- Full vitest at batch end: 0 FAIL
- Build clean
- 0 new console errors in dev preview
- Commits pushed; SESSION_HANDOFF + active.md + V-entry updated; NO deploy authorized this turn
