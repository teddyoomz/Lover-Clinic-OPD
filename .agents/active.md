---
updated_at: "2026-05-23 EOD+1 LATE+2 — V115 mobile lightbox fix LOCAL · awaiting deploy"
status: "V115 mobile staff-chat lightbox UX fix SHIPPED local (committed + pushed). Backdrop close + safe-area-inset + 44pt close button + multi-touch bail + double-tap-zoom. Class-of-bug expansion to Treatment lightboxes (safe-area + 44pt). NEW AV114 invariant. NOT deployed."
branch: "master"
last_commit: "<latest> fix(lightbox): V115 — mobile staff-chat lightbox UX [AV114]"
tests: "vitest 14318/14318 PASS · V115 24/24 PASS · build clean ✓ 2.84s"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "9dd176df (V112-A + V113 + V113-C + V114 LIVE; V115 PENDING deploy) · office-to-pdf-00007-tfb (Cloud Run V110-bis)"
firestore_rules_version: "unchanged"
---

# Active Context

## State
- **V115 SHIPPED local** — Mobile staff-chat lightbox UX fix. Pushed to master. NOT yet deployed.
- Origin: user-reported iPhone bug "ใน mobile กดเปิดรูป Preview ในช่องแชท staff chat แล้วปิดพรีวิวไม่ได้ และซูมดูรูปไม่ได้ด้วย ใช้งานยากมาก".
- 2 distinct symptoms compounded by 5 stacked factors (3 close + 2 zoom).
- Class-of-bug "Mobile lightbox UX gaps" — affects 3 lightbox components.

## V115 fix architecture
**Primary (StaffChatImageLightbox.jsx — full mobile gates)**:
1. Backdrop click closes — `onClick={onClose}` on outer div (was missing; AV78 sanctioned-exception per CLAUDE.md was contradicted by AV78-NORMAL ship)
2. `paddingTop: max(0.75rem, env(safe-area-inset-top))` on top bar — fixes iPhone notch / dynamic island overlap
3. Close button bumped `w-9 h-9` (36px) → `w-11 h-11` (44pt iOS HIG)
4. `onTouchStart` bails on `e.touches.length > 1` — defers pinch to native iOS Safari (was misreading 2-finger as single-swipe → triggered spurious prev/next)
5. Double-tap-zoom (1x ↔ 2.5x via CSS transform on `<img>`, reset on idx change, swipe-nav skipped when zoomed)

**Expansion (Treatment lightboxes — safe-area + 44pt only)**:
- TreatmentReadOnlyMirror Lightbox: `w-8 h-8` → `w-11 h-11` + `env(safe-area-inset-top)`
- TreatmentReadOnlyPanel Lightbox: `p-2` → `w-11 h-11` + `env(safe-area-inset-top)`
- Backdrop-close already correct on both (no flip needed)

## NEW AV114 invariant
Fullscreen image lightboxes MUST satisfy:
1. Backdrop tap closes (sanctioned AV78 exception)
2. `env(safe-area-inset-top)` for iPhone notch
3. ≥44pt touch target (iOS HIG)
4. Multi-touch bail in swipe-nav handlers (defer pinch to native)
5. Double-tap-zoom recommended (REQUIRED for staff chat; Treatment sanctioned without)

Sanctioned closed list of 3 consumers (StaffChatImageLightbox + TreatmentReadOnlyMirror + TreatmentReadOnlyPanel). Adding a 4th requires AV114 update.

## Files this session (V115)
- MOD `src/components/staffchat/StaffChatImageLightbox.jsx` (PRIMARY — 5 mobile gates)
- MOD `src/components/backend/TreatmentReadOnlyMirror.jsx` (expansion — 2 gates)
- MOD `src/components/backend/TreatmentReadOnlyPanel.jsx` (expansion — 2 gates)
- NEW `tests/v115-mobile-lightbox.test.jsx` (24 tests: 13 SG + 8 R + 3 AV)
- MOD `tests/staff-chat-any-file.test.js` (V21 fixup AF5 — flipped from AV78-NORMAL to AV114 sanctioned-exception)
- MOD `.agents/skills/audit-anti-vibe-code/SKILL.md` (NEW AV114 entry)

## Verification (Rule Q V66)
- **L2 comprehensive**:
  - 8 SG StaffChat source-grep (backdrop-close + AV78 sanctioned + safe-area + 44pt + multi-touch + zoom state + reset + transform)
  - 5 SG Treatment source-grep (44pt + safe-area on both Mirror + Panel, backdrop-close preserved)
  - 8 R RTL behavioral (backdrop tap closes + close button + image-tap-doesn't-close + top-bar-stop + double-click zoom + reset on next + multi-touch bail + swipe-nav)
  - 3 AV invariant (AV114 entry exists + enumerates 3 consumers + mandates 3 gates)
  - Full vitest: 14318/14318 PASS (was 14294 pre-V115; +24 V115 - 0 net fail with V21 fixups absorbed)
  - Build: clean ✓ 2.84s
- **L1 hands-on deferred to user post-deploy** (matches typical workflow per V114/V113/V111 pattern):
  - Open staff chat on real iPhone
  - Tap an image attachment → lightbox opens
  - Tap dark backdrop → lightbox closes (NEW V115)
  - Tap close button (✕) — easily hittable (44pt, below status bar)
  - Double-tap image → zooms 2.5x → double-tap again → 1x
  - Navigate prev/next → zoom resets to 1x
  - Pinch with 2 fingers → iOS native pinch handles (V115 multi-touch bail)
  - Same fixes apply to Treatment Mirror + Panel lightboxes (Mobile may not commonly use these; desktop unchanged)

## Next action
1. User authorizes deploy → `vercel --prod` (V115 client-only, no rules / no indexes / no Cloud Run).
2. User L1 hands-on test on real iPhone after deploy (acceptance scenarios above).

## Outstanding user-triggered actions
- V115 deploy (when user is ready)
- Post-deploy iPhone L1 hands-on verification
- Optional: report any remaining mobile UX gaps for follow-up (V115 covers the reported symptoms; if other gaps surface, file separately)

## Deployed (prior)
- V112-A + V113 + V113-C + V114 LIVE on prod at `9dd176df`. Receipt-info live-resolve + UI toggle. All Rule Q L1 contract layers green on real prod via Chrome MCP.

## Pre-existing notes
- V111 + V109 + V110 + Office preview + Cloud Run rev 00007-tfb LIVE (V110-bis Word-compat XCU + Thai fonts).
- Snapshot-at-write semantic preserved (V111/V112-A/V113/V114 chain intact). V115 is pure renderer-level UI + UX state.
