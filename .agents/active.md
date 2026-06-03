---
updated_at: "2026-06-03 EOD+3 — staff-chat draft-persist on minimize + bubble draft indicator + stock balance filter relabel/reorder. SHIPPED local + L1-verified. NOT deployed."
status: "Done + Rule Q L1-verified (Chrome MCP). full vitest 16063/0 (+1 perf-budget flake → isolated 10/0) · build clean · RTL flow-sim + source-grep + real-app L1 all green."
branch: "master"
last_commit: "5f201738 (stock filter relabel/reorder) — 3 commits 9a76a8ca..5f201738 this session (plan + staffchat + stock)"
tests: "Full vitest 16063/0 (subtab-filters-stress S4.2 perf flake = isolated pass; unrelated to changes). build clean."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "62593b2c (V158→V159 + dropdown + B1/B2/B3/B5). NOT YET caught up — this session's 2 feat commits await a deploy."
firestore_rules_version: "UNCHANGED (all changes client-SDK/UI → vercel-only deploy, no Probe-Deploy-Probe)."
---

# Active — 2026-06-03 EOD+3 — staff-chat draft persist + stock filter relabel

## State
- master `5f201738`; prod `62593b2c` LIVE (this session NOT deployed — awaiting explicit "deploy").
- Working tree clean. No firestore.rules change.
- Flow: `/brainstorming` (2 features + draft-indicator added in spec-review) → `/writing-plans` → `/executing-plans` inline (5 tasks).

## What this session shipped (detail → checkpoint 2026-06-03-staffchat-draft-stock-filter.md if created)
- **Feature A — staff-chat draft survives minimize** (hide-don't-unmount): `StaffChatWidget` always renders the Panel (`hidden={chat.minimized}` → inline `display:none`) so the Composer's text + reply + staged image/file uploads (live File objects + object-URLs) live through a minimize→reopen. `StaffChatPanel` body-scroll-lock keyed on visible-state. Clears only on Frontend↔Backend / reload / tab-close (Q2: kept across backend sub-tabs).
- **Feature A-bis — draft indicator on minimized bubble**: Composer reports `hasDraft` (text||files||reply) up via `onDraftChange` (boolean only; draft stays in composer); Widget relays to `StaffChatBubble` → **dark-zinc ✏️ badge top-LEFT** (`staff-chat-bubble-draft`), distinct from white/red unread (top-right). Color/side/✏️-on-dark locked via visual Q&A (Chrome MCP mockups).
- **Feature B — stock ยอดคงเหลือ filters**: `หมด (คงเหลือ 0)`→`หมด`, `ติดลบ (ต้องเติมสต็อค)`→`ติดลบ`, reordered `…เกินสต็อก · หมด · ติดลบ`. Pure presentation (predicates/testids/row-badges untouched).
- **Additive only** (cosmetic-shell): no upload-pipeline / hook / filter-predicate logic touched.
- **Tests**: NEW `staffchat-draft-persist-minimize` (RTL flow-sim F1/F2 + source-grep SG1-5) · `stock-balance-filter-relabel`. V21 fixups: v73-widget-rtl W1.1 (panel hidden≠absent) · v144 F1.5/F1.6 (label + order).
- **Rule Q L1 (Chrome MCP, real authed app)**: typed draft → minimize → **bubble shows dark-zinc ✏️ top-left** → reopen → draft text intact (no send/no mutation). Stock filter order/labels confirmed live.

## Next action
- IDLE / await direction. **Deploy pending** — say "deploy" to ship (vercel-only; no rules → no Probe-Deploy-Probe). Per V18 no deploy without explicit "deploy" this turn.

## Outstanding user-triggered actions
- Deploy this session's 2 commits (vercel --prod) when ready.
- Carryover (low-pri): Rule P closure audit-stock-flow S37 + V-log B1/B2 · be_products junk cleanup (V145) · Neuramis merge + junk course "หฟแฟ" · cross-collection reconciliation report · SESSION_HANDOFF head trim <150 KB.
