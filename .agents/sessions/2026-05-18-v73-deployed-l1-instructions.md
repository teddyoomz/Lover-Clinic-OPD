# 2026-05-18 — V73 Deployed + L1 Hands-On Instructions

## Summary

V73 Staff In-Branch Chat Widget went LIVE on production this session along with V66 BRANCH closure annotation + MP3 sounds (T17 deferred-task closure). All 3 deploys (firebase rules+indexes+storage / Cloud Function / vercel --prod) green; pre-probes 4/4 + post-probes 4/4 green per Rule B. Master = prod = `aff149e`, 0 commits ahead.

This file consolidates Rule Q L1 hands-on test plan — user-driven, on real prod (https://lover-clinic-app.vercel.app) with 2+ devices.

## Current State

- master = `aff149e` · prod = `aff149e` · 0 commits ahead
- 10344 PASS / 0 FAIL / 12 skip
- Firestore rules v33 LIVE (be_staff_chat_messages clinic-staff-only)
- Storage rule LIVE (staff-chat-attachments/{branchId}/{file} clinic-staff-only)
- Cloud Function `cleanupOldStaffChatMessages` v2 LIVE in asia-southeast1 (scheduled, nodejs20, 256MB)
- MP3 sounds: `public/sounds/staff-chat-notif.mp3` (1.9KB) + `public/sounds/staff-chat-mention.mp3` (3.3KB) — ffmpeg-synthesized CC0 mono MP3s

## V73 — Rule Q L1 Multi-Device Test Plan (30 acceptance checks)

### Setup

- **Device A** (desktop): https://lover-clinic-app.vercel.app/?backend=1 → sign in as Staff #1 → select Branch X
- **Device B** (mobile, ≤375px width — DevTools or real phone): same URL + same branch → sign in as Staff #2

Both devices: open the floating chat bubble bottom-right. Confirm widget mounts in BOTH Frontend (`/`) and Backend (`/?backend=1`) provider chains (App.jsx dual-mount).

### §16.1 Base MVP — 10 checks

- [ ] **1.** Open Frontend `/` on Device A → see floating bubble bottom-right
- [ ] **2.** Click bubble → panel expands with last messages (or empty state)
- [ ] **3.** Type "hello" + send → name modal pops up (no prior `staffChatName` cookie)
- [ ] **4.** Type "ดร.วี" + Save → message sends, displays right-aligned
- [ ] **5.** Open Backend `/?backend=1` on Device B (mobile) → see same bubble
- [ ] **6.** Tap bubble → fullscreen modal (95vw × 60vh) with same message history
- [ ] **7.** Reply "got it" on Device B → message appears on Device A in real-time (~1s via Firestore onSnapshot)
- [ ] **8.** Switch branch via top selector on Device A → chat history switches (branch-scoped BSA)
- [ ] **9.** Click Mute toggle in widget header on Device A → next incoming message from Device B → NO sound on Device A
- [ ] **10.** [DEFERRED — needs 8 days elapsed] Wait 8 days → message disappears (Cloud Function `cleanupOldStaffChatMessages` cleanup)

### §16.2 Feature B (@mentions) — 5 checks

- [ ] **11.** Type `@` in composer → dropdown of recent-active names appears
- [ ] **12.** Click dropdown entry "ดร.วี" → composer reads `@ดร.วี ` (with trailing space)
- [ ] **13.** Send → message renders with rose-tinted "@ดร.วี" chip
- [ ] **14.** Device B has `localStorage.staffChatName === 'ดร.วี'` → hears MENTION sound (1200Hz 2-beep, different from default 1000Hz ding) + red badge auto-expand
- [ ] **15.** Device C (or change Device B name to "นางอื่น") → hears no special alert (default unread badge only)

### §16.3 Feature C (Reply-to-message) — 4 checks

- [ ] **16.** Hover any message bubble → "Reply" action appears (desktop) / long-press shows it (mobile)
- [ ] **17.** Click reply → quote strip `↩ Reply to ดร.วี: 'รอลูกค้า 5 นาที'...` appears above composer; × button clears it
- [ ] **18.** Send while quote active → new message has `replyTo` field; bubble renders mini quote-card on top
- [ ] **19.** Click the quote-card on a rendered reply → smooth-scroll to original message in list (or graceful "expired" toast)

### §16.4 Feature F (Image paste/upload) — 5 checks

- [ ] **20.** Focus composer on Device A → Ctrl+V from clipboard (paste image) → preview thumbnail appears above textarea
- [ ] **21.** Drag image file onto panel → same preview behavior
- [ ] **22.** Click 📎 icon → file picker opens, accepts image/* only; try >10MB file → rejected with toast (Storage rule 1MB cap = client-side resize before upload)
- [ ] **23.** Send → image uploads to Firebase Storage at `staff-chat-attachments/{branchId}/{file}`; message renders as ~200px thumbnail; click → lightbox full-size
- [ ] **24.** Send with caption "ดูยานี้" → both image + caption render in same bubble

### §16.5 Feature H (Customer/appt auto-link) — 4 checks

- [ ] **25.** Send "ลูกค้า LC-26000022 รออยู่ห้อง 3" → rendered with rose-tinted chip on LC-26000022, clickable
- [ ] **26.** Click chip → opens `/?backend=1&customer=LC-26000022` in new tab (browser opens customer detail directly)
- [ ] **27.** Send "ดูนัด BA-1778868832454" → sky-tinted chip on BA-1778868832454
- [ ] **28.** Hover desktop chip → tooltip resolves customer name (lazy-fetched, cached 5min in sessionStorage)

### §16.6 Cross-feature combinations — 2 checks

- [ ] **29.** Reply to a message that contains LC-26000022 with @mention to another user — all 3 features render correctly in same composer + sent bubble
- [ ] **30.** Image upload + @mention + reply combined in one message → all stored in single Firestore doc with `mentions: [...], replyTo: {...}, attachmentUrl: '...'`

**Total: 30 checks. Check #10 is time-deferred (8 days). Checks #14, #19, #22 require either a second device OR DevTools localStorage tampering on the same device.**

## V70/V71/V71.A/V71.B Carry-over L1 Confirms

These shipped in prior session (2026-05-16) but lack hands-on multi-device confirmation:

### V70 — LINE reminder body variables bolded
- [ ] Wait for next scheduled hourly cron-fire (or use admin Debug Fire) → real LINE message arrives at lineUserId-linked customer's LINE OA
- [ ] Verify variables (e.g. customer name, date, time, branch name) render in **bold** via Flex `contents:[span]` weight=bold
- [ ] Verify "Lover Clinic" header has SPACE between words (not "LoverClinic")

### V71 — OPD lifecycle badge + sub-pill bar
- [ ] Frontend appt row → see new `<AppointmentOpdStepperRow>` with lifecycle badge (วิตอลส์ → กำลังตรวจ → เสร็จ)
- [ ] Hover/click "✓ ปิดการรักษา" (mark-complete) → appt moves out of queue; sub-pill bar update at top
- [ ] Click "↩ กลับไปคิวรอ" (un-mark) → symmetric reversal

### V71.A — edit-treatment customerId fix
- [ ] Frontend appt row → click "แก้ไขการรักษา" → TFP opens WITHOUT "ไม่พบ customerId" placeholder error
- [ ] Verify customer is auto-loaded (name displays correctly, courses tab populated)
- [ ] Test from at least 2 different launch paths in HubView + AppointmentManager

### V71.B — treatments fallback to appointmentTo
- [ ] LINE reminder for an appt with empty `treatments[]` array BUT non-empty `appointmentTo` string → `{{treatments}}` token resolves to the `appointmentTo` value (not "-")

## L1 Failure Protocol

If ANY check above fails:

1. Capture: screenshot + console errors + network tab (relevant request)
2. Report immediately (do NOT continue checks past the failure)
3. Investigation per Rule Q + Rule P:
   - Rule R env-pull diag if data-state issue
   - systematic-debugging Phase 1 to root-cause
   - Class-of-bug expansion per Rule P 7-step

## Resume Prompt

```
Resume LoverClinic — continue from 2026-05-18.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=prod=`aff149e`)
3. .agents/active.md (V73 DEPLOYED, 0 commits ahead)
4. .claude/rules/00-session-start.md (Rule Q V66 + iron-clad A-R)
5. .agents/sessions/2026-05-18-v73-deployed-l1-instructions.md (THIS FILE — 30 L1 checks)

Status: V73 Staff Chat Widget LIVE on prod. Master = prod = `aff149e`.
10344 PASS / 0 FAIL. All 3 deploys + post-probes green.

Outstanding (user hands-on):
- V73 Rule Q L1: 30 checks per spec §16 on https://lover-clinic-app.vercel.app
- V70/V71/V71.A/V71.B L1 catch-up confirms

No deploy without "deploy" verb THIS turn (V18 lock).
```

## References

- Spec §16 (verbatim): `docs/superpowers/specs/2026-05-16-staff-in-branch-chat-widget-design.md`
- V73 saga checkpoint: `.agents/sessions/2026-05-17-v73-staff-chat-widget.md`
- Prior V70/V71/V71.A/V71.B checkpoint: `.agents/sessions/2026-05-16-v70-v71-v71a-v71b-saga.md`
- Rule Q full text: `.claude/rules/01-iron-clad.md` Rule Q (top-of-file)
