---
updated_at: "2026-05-22 EOD — Staff Chat multi-image SHIPPED+DEPLOYED+verified real-prod (a40e77bf). 2 follow-up polish issues PENDING for next chat (lightbox backdrop-no-close + grid-overflow design). Session ended (context full → continue in new chat)."
status: "prod LIVE staff-chat multi-image (a90b6706 deployed). 2 PENDING polish fixes → next chat: /systematic-debugging fix + test + deploy (user pre-authorized)."
branch: "master"
last_commit: "a40e77bf — test(staff-chat): real-prod Rule Q verification harness + AV108 + state docs"
tests: "vitest 14030/0; build clean."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "a90b6706 — vercel --prod (aliased) + firebase deploy --only firestore:rules,storage (P-D-P #9/#10 green)"
firestore_rules_version: "deployed 2026-05-22 — be_staff_chat_messages accepts attachments[] (≤10); storage staff-chat-attachments cap 50MB."
---

# Active Context

## State
- prod = `a90b6706` LIVE — Staff Chat multi-image (V73 ext): ≤10 images/msg, adaptive grid (1/2/3/4/5+ "+N") → swipe lightbox, hybrid thumb+original ≤50MB, 30d auto-retention cron (no orphan "ลบเกลี้ยง"). Verified real-prod (Rule Q L1/L2 + Q-vis, screenshots, no bugs): อัพ/ส่ง/ลบ/preview จริง. Detail: checkpoint `.agents/sessions/2026-05-22-staff-chat-multi-image.md`.
- **2 follow-up polish issues reported by user (screenshot) — NOT yet done** (see Next action). Session ended before doing them (context full).
- AV108 added; full vitest 14030/0; build clean. Commits a90b6706 (feature) + a40e77bf (verify+docs).

## What this session shipped
- Multi-image staff chat end-to-end: `staffChatRetentionCore.js` (NEW pure) + image lib (validate/thumb/resumable) + client (attachments[]) + hook (prepareAndUpload) + composer (multi-pick/preview/progress) + message grid + swipe lightbox.
- `api/cron/staff-chat-retention-sweep.js` (2-pass age-out+orphan) + CLI + `scripts/e2e-staff-chat-image-retention.mjs` (Rule Q L2 proof harness). vercel.json cron. storage.rules 50MB + firestore.rules attachments[]. AV108. spec/plan HTML.
- DEPLOYED + real-prod verified (deletion sweep getFiles=0; real composer send; 5-img grid + full lightbox).

## Next action (NEXT CHAT — /systematic-debugging, 2 issues w/ screenshot)
1. **Lightbox close-button-only**: `src/components/staffchat/StaffChatImageLightbox.jsx` — REMOVE the outer-div `onClick={onClose}` (backdrop-close); close ONLY via ✕ + Esc (like other project modals, AV78). User: accidental backdrop clicks close it = ใช้ยาก. → also flip AV78 sanctioned lightbox-exception (remove StaffChatImageLightbox from the closed list) + update `tests/v83-modal-explicit-close-only.test.js` list + any test asserting lightbox backdrop-close (v73-image-rtl / AV78). Keep Esc + ✕.
2. **Grid overflow / bubble design polish**: `src/components/staffchat/StaffChatMessage.jsx` AttachmentGrid — images overflow the chat bubble (screenshot). Make 1/2/3/4/5+ grids "pro": fit inside bubble OR float w/ shadow + harmonize rounded corners/padding. Diagnose real cause first (Chrome MCP — the "เทสๆ" msg shows it): grid `width:240` fixed vs bubble `max-w-[80%] px-3 py-2 rounded-2xl`. Consider a design-skill pass (polish/critique/arrange).
- THEN deploy + end (user pre-authorized prev turn: "เทส...สวยงามระดับโปร + คลิ๊กว่างแล้วไม่ปิด...ก็สามารถ Deploy แล้ว End session"). Likely vercel-only (no rules change). V18: re-confirm "deploy" in the new chat to be safe.

## Outstanding user-triggered actions
- The 2 polish fixes above → then deploy (pre-authorized) + end.
- (user, optional) hands-on send with own images (feature already real-prod verified).
