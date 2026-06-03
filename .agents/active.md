---
updated_at: "2026-06-03 EOD+3 — staff-chat draft-persist-on-minimize + bubble draft-indicator + stock filter relabel SHIPPED; then V160/AV179 fixed the read-cursor regression that draft-persist caused. NOT deployed."
status: "Done + Rule Q L1-verified (Chrome MCP, real browser). systematic-debugging closed V160 (my own same-session regression). full vitest 16071/0 · build clean."
branch: "master"
last_commit: "4c46a154 (fix read-cursor + scroll-on-open, V160/AV179) — 9 commits aa47af52..4c46a154 this session (spec→plan→2 feats→tests→fix)"
tests: "Full vitest 16071/0 (read-cursor-fix run, this session) · build clean. NOT re-run at EOD."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "62593b2c — NOT caught up. This session's draft-persist + indicator + filter + V160 fix all await a deploy."
firestore_rules_version: "UNCHANGED (all client-SDK/UI → vercel-only deploy when authorized; no Probe-Deploy-Probe)."
---

# Active — 2026-06-03 EOD+3 — staff-chat draft persist + indicator + stock filter + V160 fix

## State
- master `4c46a154`; prod `62593b2c` LIVE (this session NOT deployed — awaiting explicit "deploy").
- Working tree clean. No firestore.rules change.
- `/brainstorming`→spec→`/writing-plans`→`/executing-plans` (2 feats) → `/systematic-debugging` (V160 regression fix).

## What this session shipped (detail → checkpoint 2026-06-03-staffchat-draft-persist-and-v160.md)
- **Feature A — staff-chat draft survives minimize** (hide-don't-unmount): `StaffChatWidget` always renders the Panel (`hidden={chat.minimized}` → `display:none`) → Composer text + reply + staged image/file uploads (File + object-URLs) live through minimize→reopen. Clears only on Frontend↔Backend / reload / tab-close (kept across backend sub-tabs).
- **Feature A-bis — draft indicator on minimized bubble**: dark-zinc ✏️ badge top-LEFT (`staff-chat-bubble-draft`) vs white/red unread top-right. Composer reports `hasDraft` (text||files||reply) via `onDraftChange`; color/✏️-on-dark locked via Chrome-MCP visual Q&A.
- **Feature B — stock ยอดคงเหลือ filters**: `หมด (คงเหลือ 0)`→`หมด`, `ติดลบ (ต้องเติมสต็อค)`→`ติดลบ`, reorder `…เกินสต็อก · หมด · ติดลบ`. Pure presentation.
- **V160 / AV179 (systematic-debugging)** — hide-don't-unmount silently broke the MessageList's on-OPEN behaviors (read cursor + scroll-to-bottom + IntersectionObserver) because "open" became a visibility transition, not a remount → chat opened at the TOP + read checkpoint never persisted (user-reported recurrence). Fix: MessageList takes `visible={!chat.minimized}` → on hidden→visible it scrolls to bottom + marks-read directly (ref) + re-creates the observer. **Verified real browser**: distanceFromBottom 0 + cursor advances + persists across reload.
- **Tests**: NEW `staffchat-draft-persist-minimize` (RTL F1/F2 + F1.3 staged-image + source-grep) · `stock-balance-filter-relabel` · `staffchat-read-cursor-on-open` (R1/R2/SG). V21 fixups: v73-widget W1.1 · v144 F1.5/F1.6.

## Next action
- IDLE / await direction. **Deploy pending** — say "deploy" (vercel-only; no rules → no Probe-Deploy-Probe). No deploy without explicit "deploy" this turn (V18).

## Outstanding user-triggered actions
- Deploy this session's 6 feat/fix commits (vercel --prod) when ready.
- Carryover (low-pri): audit-stock-flow S37 + V-log B1/B2 · be_products junk cleanup (V145) · Neuramis merge + junk course "หฟแฟ" · cross-collection reconciliation report · SESSION_HANDOFF head trim <150 KB.
