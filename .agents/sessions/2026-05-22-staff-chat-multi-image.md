# Checkpoint — 2026-05-22 — Staff Chat multi-image attachments (SHIPPED + DEPLOYED + real-prod verified)

## Summary
Extended V73 staff chat to send up to 10 images/message with an adaptive grid + swipe lightbox + hybrid thumb/original (≤50MB) + 30-day auto-retention that deletes the whole message + all its Storage files with no orphan ("ลบเกลี้ยง"). Full cycle brainstorming(Visual Companion)→spec→plan→executing-plans inline. Deployed (user "deploy เพื่อเทส") + verified on REAL prod via Chrome MCP (Rule Q L1/L2 + Q-vis, every step screenshot-confirmed, no bugs). 2 follow-up polish issues reported at end (pending next chat).

## Current State
- master/prod = `a90b6706` (feature) + `a40e77bf` (verify harness + AV108 + docs) LIVE.
- Deployed: `vercel --prod` (aliased) + `firebase deploy --only firestore:rules,storage` (Probe-Deploy-Probe #9 be_staff_chat_messages anon→403 + #10 staff-chat-attachments anon→403, green pre+post).
- vitest 14030/0; build clean.
- Architecture: per-message Storage folder `staff-chat-attachments/{branchId}/{messageId}/{imgId}-{t|o}.{ext}` → retention prefix-sweep (no orphan). `attachments[]` on doc (legacy `attachmentUrl` scalar still renders). Shared pure `staffChatRetentionCore.js` (cron+CLI+components). Admin-SDK-only delete (client `update,delete: if false`).
- **2 PENDING (next chat, /systematic-debugging)** — see Next Todo.

## Commits (this session)
```
a90b6706 feat(staff-chat): multi-image attachments + swipe lightbox + 30d auto-retention
a40e77bf test(staff-chat): real-prod Rule Q verification harness + AV108 + state docs
```

## Files Touched
- NEW: src/lib/staffChatRetentionCore.js · api/cron/staff-chat-retention-sweep.js · scripts/staff-chat-retention-sweep.mjs · scripts/e2e-staff-chat-image-retention.mjs · tests/staff-chat-multi-image.test.js · docs/superpowers/{specs,plans}/2026-05-22-staff-chat-image-attachments*.html
- MOD: src/lib/staffChatImageResize.js · staffChatClient.js · hooks/useStaffChat.js · components/staffchat/{StaffChatComposer,StaffChatMessage,StaffChatImageLightbox,StaffChatWidget}.jsx · vercel.json · storage.rules · firestore.rules · .agents/skills/audit-anti-vibe-code/SKILL.md (AV108)

## Decisions (1-line)
- Q1 auto-retention only · Q2 hybrid thumb+original · Q3 delete whole msg+images · Q4 30d · Q5 ≤10 images/msg.
- Per-message folder → prefix-sweep guarantees no orphan; deletion admin-SDK-only (client delete rule-blocked).
- Real-client send proven by injecting real File objects onto the composer input (synthetic file SELECTION, real upload+setDoc+rule path) — file_upload sandbox rejects arbitrary paths.

## Real-prod verification (Rule Q L1/L2 + Q-vis — screenshots, no bugs)
- ลบจริงหายจริง: uploaded 6 files+doc → sweep --apply → `deletedFiles:12, getFiles(prefix)=0, doc gone`.
- preview จริง: admin-seeded 5-img → real client rendered 2×2+"+1" grid → lightbox (counter 1/5..5/5, next/prev, filmstrip jump, end-clamp, close, download).
- อัพ/ส่งจริง: real composer multi-pick (3/10 preview) → real Storage upload (authed) + real client setDoc attachments[] (deployed rule accepted) → 3-img grid (firstBig 1+2) rendered real-time.
- fixtures cleaned (0 residue; left user's own "เทสๆ" message).

## Next Todo (NEXT CHAT)
1. **Lightbox close-button-only** — `StaffChatImageLightbox.jsx`: remove outer-div `onClick={onClose}` (backdrop-close); close only via ✕ + Esc (AV78 normal-modal behavior). User: accidental backdrop click closes it = ใช้ยาก. Flip AV78 sanctioned-exception (remove StaffChatImageLightbox) + `tests/v83-modal-explicit-close-only.test.js` closed list + any backdrop-close test (v73-image-rtl / AV78).
2. **Grid overflow / bubble design polish** — `StaffChatMessage.jsx` AttachmentGrid: images overflow the bubble (screenshot). Make 1/2/3/4/5+ grids pro (fit OR float+shadow + harmonize rounded/padding). Diagnose via Chrome MCP first (grid `width:240` vs bubble `max-w-[80%] px-3 rounded-2xl`). Maybe design-skill (polish/critique).
3. THEN deploy + end (user pre-authorized prev turn). Likely vercel-only (no rules change). V18: re-confirm "deploy" THIS turn.

## Resume Prompt
> /session-start, then: master=`a40e77bf` (prod LIVE, staff-chat multi-image DEPLOYED + real-prod verified). NEXT (/systematic-debugging, 2 issues w/ screenshot): (1) `StaffChatImageLightbox.jsx` remove backdrop-click-close → ✕+Esc only (AV78; flip sanctioned-exception + tests); (2) `StaffChatMessage.jsx` AttachmentGrid images overflow bubble → pro design (fit/float+shadow), diagnose via Chrome MCP. THEN test + deploy + end (user pre-authorized; V18 re-confirm "deploy"). vitest 14030/0.
