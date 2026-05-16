---
updated_at: "2026-05-16 — V73 Staff Chat ALL 22 tasks DONE (local), awaiting deploy + sound assets + L1"
status: "master=`36f2407` · prod=`19c6f2f` · 17 commits ahead of prod (V73 T1-T22) · firestore rules+index+storage rules updated locally (NOT yet deployed)"
branch: "master"
last_commit: "36f2407 fix(V73 T22): classify be_staff_chat_messages in COLLECTION_MATRIX (branch-scope) + BSA Rule L lock comment"
tests: "10344 PASS / 0 FAIL / 12 skip (full vitest +107 V73 net); build clean 2.61s"
playwright_e2e: 14
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "19c6f2f"
firestore_rules_version: 32
storage_rules_version: 2
---

# Active Context

## State

- master 17 commits ahead of prod with V73 staff in-branch chat widget
- All 22 plan tasks DONE locally; pushed to origin/master
- 0 deploys this session (Vercel + Firebase rules + Cloud Function pending)
- Working tree clean except `.claude/settings.local.json` + untracked skill dirs

## What this session shipped — V73 Staff In-Branch Chat Widget

### Architecture
- Single global mount via `App.jsx` root (dual-mount: backend `?backend=1` + Frontend admin `/`)
- Gates on `user && selectedBranchId && !needsPublicAuth` (auto-skips `?session=`/`?patient=`/`?schedule=`)
- New collection `be_staff_chat_messages` (BSA branch-scoped per Rule L; safe-by-default listener mirrors V54 BS-13)
- Cookie identity (`localStorage.staffChatName` + `staffChatDeviceId` crypto-secure + `staffChatMuted`)
- Firebase Storage `staff-chat-attachments/{branchId}/{file}` (1MB cap, clinic-staff-only)

### Features shipped (22 tasks across 17 commits)
- **Base** (T1-T10): cookie identity helpers · staffChatClient + raw Firestore wrappers + scopedDataLayer · firestore.rules + index + probe #9 · useStaffChat hook · 8 UI components (Bubble + Widget + Panel + Header + Message + MessageList + Composer + NamePicker) · App.jsx mount
- **Feature B** (T11): @mentions dropdown + rose chip + mention sound dispatch + recentMentionCandidates memo
- **Feature C** (T12): Reply-to-message quote-strip + quote-card render with replyTo field
- **Feature F** (T14+T15): Storage rules + probe #10 · image paste/drag/file-picker · client-side resize 1024×1024 JPEG q=0.85 · upload to Firebase Storage · attachment thumbnail in bubble · fullscreen lightbox
- **Feature H** (T16): customer LC-{8} + appointment BA-{N} auto-link chips (parser already in T11 MessageBody)
- **Tests + ops** (T13/T18/T19/T20/T22): source-grep regression locks (SG1-SG7, Rule C2/BSA/MessageBody/mention dispatch) · Cloud Function daily 7-day cleanup (CJS) · Rule I flow-simulate F1-F4 · Rule Q L2 real-prod verify script · BC1 COLLECTION_MATRIX classification

### Test bank (108 V73 tests across 10 files)
- v73-staff-chat-identity (5) · v73-staff-chat-client (15) · v73-staff-chat-listener (13) · v73-use-staff-chat (7) · v73-staff-chat-widget-rtl (26) · v73-staff-chat-mentions-rtl (5) · v73-staff-chat-reply-rtl (6) · v73-staff-chat-image (2) · v73-staff-chat-image-rtl (2) · v73-staff-chat-source-grep (17) · v73-staff-chat-auto-link-rtl (5) · v73-staff-chat-flow-simulate (4)

Checkpoint: previous session at [`.agents/sessions/2026-05-16-v70-v71-v71a-v71b-saga.md`](sessions/2026-05-16-v70-v71-v71a-v71b-saga.md)

## Next action

User-triggered (controller does NOT deploy without explicit "deploy" verb per V18):

1. **Source notification sounds (T17 deferred)** — drop two MP3s in `public/sounds/`:
   - `staff-chat-notif.mp3` (~3KB single ding, default sound, mute-respects)
   - `staff-chat-mention.mp3` (~6KB louder 2-beep, mention-only, mute-respects)
   - Free CC0 sources: freesound.org / pixabay
   - Widget gracefully handles 404 via `.catch(() => {})` so MP3 absence doesn't break — auto-expand still works on mention
2. **Deploy** when authorized:
   - `firebase deploy --only firestore:rules,firestore:indexes,storage:rules` (probe #1+5+9+10 wraps; Rule B gate)
   - `firebase deploy --only functions:cleanupOldStaffChatMessages` (T18 scheduled function)
   - `vercel --prod` (frontend bundle including widget)
3. **Rule Q L1 hands-on** — open https://lover-clinic-app.vercel.app on 2 devices (1 desktop + 1 mobile), test:
   - Bubble appears bottom-right after login (NOT on patient public links)
   - Click → expand → name picker → send message → real-time delivery to other device
   - @mention other user → red sound + auto-expand
   - Reply quote → renders + scroll-to-original
   - Paste image → resize → upload → thumbnail → click → lightbox
   - Customer/appt auto-link → click → opens correct page
   - Mute toggle → silence next message
   - Branch switch → chat history switches
   - Wait 8 days OR manual cleanup verify → Cloud Function deletes old msgs

## Outstanding user-triggered actions

### From this V73 work (above):
- T17 sound assets sourcing
- Combined deploy: rules + indexes + storage + functions + vercel
- L1 hands-on multi-device test

### Pre-existing from prior session (not yet closed):
- L1 hands-on confirm: next LINE reminder shows "Lover Clinic" (space) + bold vars + "บริการ: botox" instead of "-"
- L1 hands-on: V71 today-tab mark-complete → sub-pill move → click "↩ กลับไปคิวรอ" → row returns to "กำลังรอ"; edit-treatment in "เสร็จแล้ว" now works
