---
updated_at: "2026-05-22 — Staff Chat multi-image attachments SHIPPED + DEPLOYED + verified real-prod (commit a90b6706). ≤10 images/msg, swipe lightbox, 30d auto-retention (ลบเกลี้ยง). Rule Q L1/L2 + Q-vis: อัพ/ส่ง/ลบ/preview จริง — all screenshot-confirmed, no bugs."
status: "prod LIVE with staff-chat multi-image (a90b6706). vercel + firestore/storage rules deployed (P-D-P #9/#10 green). Verified real prod. Awaiting user hands-on + next task."
branch: "master"
last_commit: "a90b6706 — feat(staff-chat): multi-image attachments + swipe lightbox + 30d auto-retention"
tests: "vitest 14030/0; build clean."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "a90b6706 — vercel --prod (aliased) + firebase deploy --only firestore:rules,storage"
firestore_rules_version: "deployed 2026-05-22 — be_staff_chat_messages accepts attachments[] (≤10); storage staff-chat-attachments cap 50MB. P-D-P #9/#10 green pre+post."
---

# Active Context

## State
- prod = `a90b6706` LIVE — Staff Chat multi-image attachments (V73 extension). Send up to 10 images/message; adaptive grid (1/2/3/4/5+ "+N"); swipe lightbox; hybrid thumb + original ≤50MB; auto-retention cron (daily, 30d) deletes whole message + images with NO orphan ("ลบเกลี้ยง").
- DEPLOYED (user "deploy เพื่อเทส"): `vercel --prod` (aliased) + `firebase deploy --only firestore:rules,storage` (Probe-Deploy-Probe #9/#10 green pre+post).
- Verified on REAL prod via Chrome MCP (Rule Q L1/L2 + Q-vis, every step by SCREENSHOT, NO bugs):
  - **ลบจริงหายจริง**: retention sweep --apply → `deletedFiles:12`, `getFiles(prefix)=0`, doc gone.
  - **อัพจริง + ส่งจริง**: real composer multi-pick → real Storage upload (authed, 50MB rule) → `setDoc` attachments[] (firestore rule accepted) → 3-image grid rendered real-time.
  - **preview จริง**: 5-image grid (2×2 + "+1") + lightbox (counter 1/5..5/5, next/prev, filmstrip jump, end-clamp, close, download).

## What this session shipped
- NEW `src/lib/staffChatRetentionCore.js` (pure: paths/isExpired/isOrphanFolder/gridLayoutFor) + extend `staffChatImageResize.js` (validate/thumb/resumable-upload/paths) + `staffChatClient.js` (newStaffChatMessageId + attachments[]) + `useStaffChat.js` (prepareAndUpload) + `StaffChatComposer.jsx` (multi-pick/preview/progress) + `StaffChatMessage.jsx` (adaptive grid) + `StaffChatImageLightbox.jsx` (swipe).
- NEW `api/cron/staff-chat-retention-sweep.js` (2-pass age-out+orphan; admin SDK; CRON_SECRET) + `vercel.json` cron (daily 19:45 UTC) + `scripts/staff-chat-retention-sweep.mjs` (Rule M CLI) + `scripts/e2e-staff-chat-image-retention.mjs` (Rule Q L2 harness + cleanup).
- `storage.rules` cap 1MB→50MB; `firestore.rules` accepts attachments[] (≤10). **AV108** invariant.
- `tests/staff-chat-multi-image.test.js` (23: unit + Rule I flow-simulate + AV108 source-grep). full vitest **14030/0**.
- spec + plan HTML (`docs/superpowers/{specs,plans}/2026-05-22-staff-chat-image-attachments*`).

## Next action
- (user) hands-on: open staff chat → send your own images → confirm (your "ทดลองเอง" — feature is real-prod verified).
- (carryover) none pending.

## Outstanding user-triggered actions
- none.

## Decisions (1-line)
- Q1 auto-retention only · Q2 hybrid thumb+original · Q3 delete whole msg+images · Q4 30d · Q5 ≤10 images/msg.
- Deletion = admin-SDK cron only (client delete rule-blocked); per-message Storage folder → prefix-sweep guarantees no orphan.
- Real-client send proven via injected File objects (synthetic selection, real upload+setDoc+rule path) — file_upload sandbox blocked arbitrary paths.
