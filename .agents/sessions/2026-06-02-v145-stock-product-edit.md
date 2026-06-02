# Checkpoint — 2026-06-02 EOD+2 · V145 stock product-edit + V146 staff-chat reply (DEPLOYED + L1/L2 verified)

## Summary
Two features in one session, both DEPLOYED (frontend-only). **V145** (`/brainstorming`→spec→plan→impl): the tab=stock "แก้ไขสินค้า" modal loaded the aggregated balance ROW (not the real `be_products` doc) → blank/default fields + a `setDoc(merge:false)` overwrite-corruption risk; the balance table's unit was the frozen `batch.unit`. Fixed: full-doc load + `normalizeProduct` whitelist + live unit/category/type + new หมวดหมู่/ประเภท columns. **V146** (earlier `/systematic-debugging`): staff-chat reply quote now shows image/file/sticker + click-to-scroll + bounce. A LIVE-app L1 + Rule R diag surfaced a real pre-existing **branch-refresh bug** (BS-9) that V145's columns exposed.

## Current State
- master = prod = `85063e5d` LIVE @ lover-clinic-app.vercel.app (`vercel --prod`, frontend-only; NO rules change → no Probe-Deploy-Probe, V125–V127 precedent).
- Full vitest **15836/0** (this session) · build clean · Rule Q L2 **18/0** real prod · Rule Q L1 real app (screenshots).
- firestore.rules UNCHANGED (V144 narrow-delete still live). V145+V146 added no rules change.
- Honest scope: data-integrity (the millions-risk) = L2-PROVEN on real prod (609 docs). UI = L1-verified in the REAL authed app (columns + live fields + full-doc modal + branch-switch re-subscribe).
- **B (be_products data cleanup) DEFERRED by user → next session.** Dry-run done (read-only, nothing written).

## Commits (this session)
```
85063e5d feat(stock+chat): V145 stock product-edit full-load + real-time table; V146 staff-chat reply attachment preview & jump-scroll
```

## Files Touched
- src/lib/productValidation.js (normalizeProduct whitelist + __proto__ guard)
- src/components/backend/StockBalancePanel.jsx (full-doc map + canonicalUnit/Category/Type + columns swap + lot-row realign + **deps [selectedBranchId]** branch-refresh fix + onEditProduct(fullProduct))
- src/components/backend/StockTab.jsx + CentralStockTab.jsx (handleEditProduct getProduct fallback)
- src/components/staffchat/{StaffChatClient(lib),Message,MessageList,Composer,Widget}.jsx + NEW StaffChatReplyPreview.jsx + src/index.css (bounce keyframe)
- tests: NEW v145-stock-product-edit-{realtime,rtl} + staff-chat-reply-{attachment-preview,scroll-rtl}; repurposed phase15.6-capacity-tooltip (removal anti-regression); V21 fixups phase15.1/phase15.5/v43
- scripts: NEW diag-be-products-schema · diag-v145-stock-category-resolution · e2e-v145-product-edit-roundtrip · v145-cleanup-polluted-product-junk (for B)
- docs/superpowers/{specs,plans}/2026-06-02-stock-product-edit-* · audit-anti-vibe-code AV174+AV175

## Decisions (1-line each)
- V145 fix = full-doc load (StockBalancePanel listenToProducts map carries `.full`) + StockTab getProduct fallback (never feed a partial object to the modal).
- Q2 = whitelist `normalizeProduct` (no `...form` spread); whitelist field set enumerated from ALL 610 real prod docs (Rule R) — NOT guessed.
- Q1 = remove มูลค่าทุน + ความจุ columns, add หมวดหมู่ + ประเภท (live). มูลค่าต้นทุนรวม header summary kept.
- Branch-refresh: products effect deps `[]`→`[selectedBranchId]` (re-subscribe on switch). The single fix also restored canonical-name + skip-stock-filter (both were stale after switch).
- Adversarial find: forensic `_`-loop copied `__proto__` → guard `__proto__`/`constructor`/`prototype`.
- A+B bundled for next session (B's corruption detection keys on the junk signature A would strip).
- V-numbers: V145 = stock, V146 = staff-chat reply (de-collided AV174 heading).

## Next Todo
- **B (user-deferred)**: run `node scripts/v145-cleanup-polluted-product-junk.mjs` (dry-run) → review → build the restore phase (28 auto cat/unit/type from clean cross-branch copies + 1 same-branch + 7 manual/ProClinic) + dedup 3 true same-branch dups (FK-check which doc stock batches reference BEFORE deleting) → `--apply` (Rule M two-phase + audit doc).
- CentralStockTab navigate-bounce (carryover, V144 CB1). Prior V-log entries (sales/EOD+5/+6) unwritten (carryover).

## Resume Prompt
See SESSION_HANDOFF.md Current State (top) + .agents/active.md. master=85063e5d=prod LIVE, 15836/0. V145 stock product-edit + V146 staff-chat reply DEPLOYED + L1/L2 verified. Next: idle, OR run B (be_products cleanup dry-run → restore).
