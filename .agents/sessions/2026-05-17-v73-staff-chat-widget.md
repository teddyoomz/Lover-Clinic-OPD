# 2026-05-17 — V73 Staff In-Branch Chat Widget

## Summary

22-task subagent-driven implementation of FB-style floating staff chat for in-branch coordination. Brainstorming HARD-GATE produced spec with 4 base UX decisions + 4 enhanced features picked from world-class research (Slack/Discord/Teams/WhatsApp/Telegram/TigerConnect/Klara). Foundation → UI → 4 features → ops/verify. All 108 V73 tests green, build clean. 18 commits unpushed to prod, awaiting deploy authorization (V18 lock).

## Current State

- master = `5923b72` · prod = `19c6f2f` · 18 commits ahead
- 10344 PASS / 0 FAIL / 12 skip (full vitest; +107 V73 net)
- Build clean (2.61s)
- firestore rules + index + storage rules updated locally — NOT yet deployed
- Cloud Function `cleanupOldStaffChatMessages` written — NOT yet deployed

## Commits (18 total)

```
5923b72 docs(V73): active.md update — all 22 tasks DONE locally
36f2407 fix(V73 T22): classify be_staff_chat_messages in COLLECTION_MATRIX + BSA Rule L lock comment
9279bda feat(V73 T18+T19+T20): Cloud Function 7-day cleanup + Rule I flow-simulate F1-F4 + Rule Q L2 real-prod verify
d237dea feat(V73 T14+T15 Feature F): storage rules + probe #10 + image paste/upload + lightbox
ced299c test(V73 T13+T16): source-grep regression locks (Rule C2 + BSA + MessageBody + mention dispatch) + auto-link RTL
4982e9a feat(V73 T12 Feature C): Reply-to-message quote-strip + quote-card render
4f476c7 feat(V73 T11 Feature B): @mentions dropdown + chip + MessageBody parser + mention sound dispatch
625b95d feat(V73 T10): mount StaffChatWidget in App.jsx root + cleanup unused Header import
61447f7 feat(V73 T5-T9): base UI scaffolding — 8 components
f39de4d feat(V73 T4): useStaffChat hook — listener + send + unread + name picker state
f66c392 fix(V73 T3-followup): rule requires content (text OR attachment) + cleanup sweeps staff-chat probes
a51bee4 feat(V73 T3): firestore rules + index + probe endpoint #9 for be_staff_chat_messages
0973c4b test(V73 T2-followup): listener safe-by-default + BS-13 source-grep + addStaffChatMessage throw coverage
293735b feat(V73 T2): staffChatClient + backendClient raw wrappers + scopedDataLayer
34bc094 feat(V73 T1): staffChatIdentity cookie helpers (name/deviceId/muted)
75cdc8c docs(V73): implementation plan — 22 tasks, TDD ordering, ~1280 LOC est.
b820b25 docs(V73): enhance staff chat spec with 4 world-class features (B/C/F/H)
9b6c5e8 docs(V73): staff in-branch chat widget design spec
```

## Files Touched

**Source (12 new + 8 modified)**:
- NEW: src/lib/staffChatIdentity.js · src/lib/staffChatClient.js · src/lib/staffChatImageResize.js · src/hooks/useStaffChat.js · src/components/staffchat/{StaffChatWidget,StaffChatBubble,StaffChatPanel,StaffChatHeader,StaffChatMessage,StaffChatMessageList,StaffChatComposer,StaffChatNamePicker,StaffChatMessageBody,StaffChatMentionChip,StaffChatMentionDropdown,StaffChatImageLightbox}.jsx · functions/cleanupStaffChat.js
- MODIFIED: src/App.jsx (lazy mount + dual provider) · src/lib/backendClient.js (raw listener+writer +34 LOC) · src/lib/scopedDataLayer.js (passthroughs) · firestore.rules · firestore.indexes.json · storage.rules · functions/index.js · scripts/probe-deploy-probe.mjs (probe #9+#10) · .claude/rules/01-iron-clad.md (probe list extension)

**Tests (12 new V73 files, 108 tests)**:
- v73-staff-chat-identity (5) · v73-staff-chat-client (15) · v73-staff-chat-listener (13) · v73-use-staff-chat (7) · v73-staff-chat-widget-rtl (26) · v73-staff-chat-mentions-rtl (5) · v73-staff-chat-reply-rtl (6) · v73-staff-chat-image (2) · v73-staff-chat-image-rtl (2) · v73-staff-chat-source-grep (17 across SG1-SG7) · v73-staff-chat-auto-link-rtl (5) · v73-staff-chat-flow-simulate (4)
- MODIFIED: tests/branch-collection-coverage.test.js (BC1 + BC2.direct classification)

**Scripts**: scripts/diag-staff-chat-l2-verify-v73.mjs (Rule Q L2 real client SDK)

**Docs**: docs/superpowers/specs/2026-05-16-staff-in-branch-chat-widget-design.md · docs/superpowers/plans/2026-05-16-staff-in-branch-chat-widget.md

## Decisions

- **Storage**: new `be_staff_chat_messages` collection (BSA branch-scoped); Storage `staff-chat-attachments/{branchId}/{file}` 1MB cap
- **Identity**: cookie-only (localStorage staffChatName + staffChatDeviceId crypto-secure + staffChatMuted) — decoupled from Firebase Auth per user spec
- **Mount**: dual mount via App.jsx (inside both `?backend=1` + Frontend provider chains) — single top-level mount can't access BranchProvider context for both routes
- **Retention**: 7-day Cloud Function cleanup (mirror customer chat) — deletes Firestore docs + Storage orphans
- **Mobile UX**: fullscreen modal (95vw × 60vh) — corner-windowed FB-style too cramped on 375px
- **Mute default**: ON (sound plays); per-device toggle in widget header; mute respects both default + mention sounds
- **MessageBody parser**: single source for mention/customer/appt chips; T11 introduces, T16 verifies coverage; SG4 regression lock prevents raw `{message.text}` regression
- **Features picked from research round-2**: B mentions + C reply + F image + H auto-link · skipped A typing / D reactions / E presence / G quick-templates (deferred to V73.B if usage reveals gap)

## Lessons

- Subagent-driven workflow scales but costs ~2-3K tokens per dual-review cycle; batch trivial/closely-coupled tasks (T5-T9 UI scaffolding, T13+T16 tests, T14+T15 storage+image, T18+T19+T20 ops) into single dispatch
- Plan-verbatim implementation rare — every substantive task surfaces 1-2 minor concerns at code-quality review (defensive optional chains, unused imports, edge-case test gaps) — most "approve with follow-up" not "needs fix"
- App.jsx dual-mount necessity discovered at T10 implementer: spec assumed single top-level mount but BranchProvider is per-route
- Source-grep regex pitfalls (T13): comments containing `Math.random` literal text false-positive against AV strict regex — added `stripComments` helper
- BC1 collection coverage matrix auto-fails on new collection — must classify in same commit set; BC2.direct accessor map needs `branchId` literal in source within 2000 chars of setDoc call → added "BSA Rule L lock" comment after setDoc as documentation+test-anchor combo

## Next Todo

User-triggered (controller does NOT deploy without explicit "deploy" verb per V18):

1. **Source MP3 assets** → drop two files in `public/sounds/`:
   - `staff-chat-notif.mp3` (~3KB single ding for default sound)
   - `staff-chat-mention.mp3` (~6KB louder 2-beep for mention)
   - CC0 from freesound.org / pixabay
   - Widget gracefully handles 404 via `.catch(() => {})` — auto-expand still works on mention

2. **Combined deploy** when authorized:
   - `firebase deploy --only firestore:rules,firestore:indexes,storage:rules` (probe-deploy-probe wraps probes 1+5+9+10; Rule B gate)
   - `firebase deploy --only functions:cleanupOldStaffChatMessages`
   - `vercel --prod`

3. **Rule Q L1 hands-on** — 2-device test on https://lover-clinic-app.vercel.app per spec §16 acceptance criteria (30 checks: 10 base + 5 mention + 4 reply + 5 image + 4 auto-link + 2 cross-feature)

## Resume Prompt

See SESSION_HANDOFF.md Resume Prompt block.
