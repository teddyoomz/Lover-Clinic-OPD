# 2026-05-18 EOD+11 LATE — V87→V92 stack + audit-all 23 skills

## Summary

5 user-driven ship cycles in one session (V87+V88 polish · V89 mobile responsive · V90 bloom auto-close · V91 toggle+search · V92 palette sheet) + 5 combined `vercel --prod` + `firebase --only firestore:rules,storage` deploys + 1 audit-all sweep (23 skills · 238 invariants · 6 parallel subagents · 12 min wall). All ship cycles preserve V82 menu-untouchable lock + cosmetic-shell rule (handler/state/wiring verbatim).

## Current State

- master = prod = `56e25aca` (V92 deploy active.md commit)
- V8x family 158/158 GREEN · full vitest 195s (no V8x regressions)
- Stack DEPLOYED: V84+V85+AV82+V86 v1+V86-followup-2+V87+V88+V89+V90+V91+V92
- Vercel alias: `https://lover-clinic-app.vercel.app` HTTP 200
- Firestore + storage rules unchanged across all 5 deploys (idempotent — V82-Phone baseline)
- Audit-all P0-P3 report delivered in chat. 0 CRITICAL on auth/admin/rules. 10 release-blocking items (8 TZ1 + S18 + A7 + H7) pending user direction.

## Commits (this session, latest first)

```
56e25aca docs(active.md): V92 LIVE — 5th deploy this session
90ebeac3 fix(V92): BackendCmdPalette mobile sheet redesign + visible X close
7ff33ddb docs(active.md): V91 LIVE — 4th deploy this session
4231abc3 fix(V91): DuoPill toggle close + mobile TopBar 3-zone with search center
26ff34dd docs(active.md): V90 LIVE — 3rd deploy this session
7d2f0e84 fix(V90): bloom auto-closes on specific-entity context (mobile customer-detail block)
4777ebb5 docs(active.md): V89 LIVE — 2nd deploy this session
df7611c0 style(V89): CustomerListTab mobile responsive header (cosmetic-shell)
bfc340d9 style(V88): AdminDashboard top-bar harmony + redder menu-tab-active (cosmetic-shell)
e4e62afc feat(V87): Recall glow + CreateQueueModal reorder/rename + link-button OPD-save guard (AV84)
```

## Files Touched

**V87** — `src/components/backend/recall/RecallFrontendView.jsx` · `src/pages/AdminDashboard.jsx` (CreateQueueModal grid + link-button guard) · `.claude/skills/audit-anti-vibe-code/SKILL.md` (AV84) · `tests/v87-link-button-opd-save-guard.test.js` · `tests/v87-create-queue-modal-order.test.js` · `tests/v87-recall-frontend-glow.test.js`

**V88** — `src/index.css` (`.menu-tab-active` + `.menu-dock-tab-active` redder) · `src/pages/AdminDashboard.jsx` (Bell + Online + Signout transparent-base) · `tests/v88-header-cosmetic-harmony.test.js`

**V89** — `src/components/backend/CustomerListTab.jsx` (header bar responsive) · `tests/v89-customer-list-mobile-responsive.test.js`

**V90** — `src/pages/BackendDashboard.jsx` (isSpecificEntityContext prop) · `src/components/backend/shell/BackendShellNew.jsx` (useState init + useEffect auto-close) · `tests/v90-bloom-auto-close-entity-context.test.jsx`

**V91** — `src/components/backend/shell/BackendDuoPill.jsx` (toggle + Menu↔X swap + aria) · `src/components/backend/shell/BackendShellNew.jsx` (toggleBloom callback + DuoPill prop wire) · `src/components/backend/shell/BackendTopBarNew.jsx` (mobile Row 1 3-zone) · `tests/v91-duo-pill-toggle-and-mobile-search.test.jsx` · `tests/v90-bloom-auto-close-entity-context.test.jsx` (S4.2 lock updated)

**V92** — `src/components/backend/nav/BackendCmdPalette.jsx` (X import + mobile sheet classes + X close button) · `tests/v92-cmd-palette-mobile-redesign.test.jsx`

**Active.md commits** — `.agents/active.md` updated after each deploy (5 separate commits)

## Decisions (one line each)

- V87 link-button class-of-bug at the SAME family as V12 multi-reader-sweep — both setPatientLinkModal trigger sites must share the OPD-save guard. AV84 codifies the closed sanctioned-exception list (currently empty — both sites guarded).
- V88 active-tab color shift orange-400 → red-500 chosen over deeper red (red-700) to keep the "alive" gradient feel while matching V86 universal palette tokens.
- V89 `พิมพ์ Bulk` hidden on `<md` (768px) instead of moving to overflow ⋮ menu — user explicit "ปีนึงจะใช้สักที" + closed-list test prevents future re-introduction without explicit V-entry.
- V90 entity-context derived from EXISTING state in BackendDashboard (viewingCustomer || treatmentFormMode || editingCustomer) — no new state introduced. Backward-compat prop default = false preserves EOD+5 bloom-open-by-default for any non-migrated consumer.
- V91 DuoPill toggle keeps both onToggleBloom (preferred) + onOpenBloom (back-compat fallback) — chat-segment dispatchEvent UNCHANGED to preserve V82 chat-channel contract.
- V91 mobile TopBar Row 1 chose 3-zone justify-between (LEFT/CENTER/RIGHT) over wrapping to 2 rows — keeps single 44px height matching V85-followup desktop pattern.
- V92 sheet via `mt-12` + `max-h-[calc(100vh-3rem)]` chosen over `items-end` bottom-sheet — preserves visual continuity with where user tapped the search box (top of screen).
- V92 X close button rendered on BOTH mobile + desktop (not mobile-only) — gives consistent affordance + reduces conditional rendering complexity.
- Combined deploy syntax canonicalized: `firebase deploy --only firestore:rules,storage` ✓ (not `storage:rules`). Documented permanently in `.claude/rules/02-workflow.md`.
- audit-all parallelism strategy: 6 general-purpose subagents covering related tier audits (vs 23 separate agents) — balances token cost vs latency. Re-dispatch needed for #2 (cascade+branch-scope ran out of time mid-investigation).
- audit P0-P1 follow-ups (TZ1×8 + S18 + A7 + H7) NOT auto-fixed per audit-all skill rule "Do NOT auto-fix anything — separate session per violation category". User-discretion to invoke fix-loop in next session.

## Next Todo

1. **P0-P1 audit follow-up batch** (~4-5 hrs, single session):
   - TZ1 family × 8 sites: `new Date().toISOString().slice(0,10)` → `thaiTodayISO()` from `src/utils.js` (`src/pages/AdminDashboard.jsx:352` · `src/pages/PatientDashboard.jsx:431` · `src/components/backend/reports/RemainingCourseTab.jsx:150` · `src/lib/backendClient.js:6015` · `src/lib/centralStockOrderValidation.js:119,186` · `src/components/backend/QuotationPrintView.jsx:70` · `src/components/backend/SalePrintView.jsx:152`)
   - S18: wrap `cancelCentralStockOrder` (`backendClient.js:6261-6302`) sequential updateDoc→setDoc→updateDoc in `writeBatch` (mirror V34 sibling fix)
   - A7: add `signal: AbortSignal.timeout(5000)` to every `fetch()` in `api/` (60+ sites — consider shared `apiFetch` helper)
   - H7: port BackendDashboard.jsx:475-493 course-reverse cascade pattern into `src/components/TreatmentTimeline.jsx:118`
2. Rule Q L1 user hands-on across V87-V92 deployed surfaces (mobile customer-detail flow · cmd-palette open+close · DuoPill toggle · menu-tab-active red · customer-list mobile · recall glow)
3. Chat-tab badge crowding (pre-V85 carryover · 2026-04-22 deferred)
4. V82 Menu V2 mobile L1 re-test (pre-V90 carryover)

## Resume Prompt

```
Resume LoverClinic — continue from 2026-05-18 EOD+11 LATE.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=56e25aca, prod=56e25aca LIVE)
3. .agents/active.md (158/158 V8x family GREEN · full vitest 195s)
4. .claude/rules/00-session-start.md (iron-clad A-Q + V-summary + V66 Rule Q at TOP)
5. .agents/sessions/2026-05-18-v87-thru-v92-and-audit-all.md (this checkpoint)

Status: master=56e25aca, V8x 158/158 GREEN, prod=56e25aca LIVE
       (V87+V88+V89+V90+V91+V92 stack DEPLOYED via 5 combined deploys this session)
Next: idle OR (user-discretion) batch-fix audit P0-P1 follow-ups
      (TZ1×8 + S18 cancelCentralStockOrder + A7 fetch-timeout + H7 TreatmentTimeline cascade)
Outstanding (user-triggered):
- TZ1 P0-P1 batch fix (8 sites · single trivial pattern · ~30 min)
- S18 + A7 + H7 P1 batch fix (~3-4 hrs)
- Rule Q L1 multi-device hands-on across V87-V92 surfaces
- Chat-tab badge crowding (pre-V85 carryover)
- V82 Menu V2 mobile L1 re-test

Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe (4 endpoints: chat_conv 200 + be_line_reminder_log 403 + be_fb_configs 403 + be_staff_chat_messages 403); cosmetic-shell — handlers verbatim; V82 menu-untouchable except for user-explicit bug fixes; Rule Q V66 L1 mandatory before claim "verified" for user-visible code; Rule M data ops via local + admin-SDK + pull env (standing auth); firebase deploy syntax: `--only firestore:rules,storage` (NOT `:rules` for storage).

/session-start
```
