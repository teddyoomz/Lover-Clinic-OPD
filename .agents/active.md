---
updated_at: "2026-06-02 EOD+2 — V145 stock product-edit + V146 staff-chat reply DEPLOYED + verified (L1 real app + L2 real prod). B data-cleanup deferred → next session."
status: "DEPLOYED LIVE. No open bugs on tested paths. One data-cleanup (B) deferred by user to next session."
branch: "master"
last_commit: "85063e5d (V145+V146 code) — EOD docs commit follows."
tests: "Full suite 15836/0 (this session). V145 Rule Q L2 18/0 real prod (609-doc whitelist completeness). NOT re-run at session-end (per directive)."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "85063e5d — vercel --prod (frontend-only: V145 stock + V146 chat). NO firestore.rules change this session → no Probe-Deploy-Probe (V125–V127 frontend-only precedent)."
firestore_rules_version: "UNCHANGED — V144 rules still live (be_stock_batches narrow-delete). V145 + V146 added NO rules change (be_staff_chat_messages create rule tolerates replyTo sub-fields; be_products writes via existing path)."
---

# Active — 2026-06-02 EOD+2

## State
- **V145 + V146 DEPLOYED LIVE** (`vercel --prod`, frontend-only). master=85063e5d=prod.
- V145 stock product-edit: full-doc load + whitelist + real-time หมวดหมู่/ประเภท columns + branch-switch re-subscribe — all verified in the REAL app (L1) + real prod (L2).
- V146 staff-chat reply: image/file/sticker preview in the quote + click-to-scroll + bounce.

## What this session shipped (detail → checkpoint 2026-06-02-v145-stock-product-edit.md)
- **V145** (AV175): stock-tab แก้ไข loads the FULL be_products doc (was the aggregated row → blank/default + overwrite-corruption risk); `normalizeProduct` whitelists (drops stock junk + __proto__ guard; preserves stockConfig/createdBy/forensic); StockBalancePanel live unit/category/type + new columns (replaced ความจุ/มูลค่าทุน); StockTab/CentralStockTab getProduct fallback.
- **🐛 BIG bug found via L1+diag**: products-map effect had `[]` deps → stale after branch switch → every row "-" for cat/type (BS-9/Rule L). Fixed: deps `[selectedBranchId]`. Pre-existing (canonical name + skip-filter were stale too); my columns exposed it.
- **V146** (AV174): buildReplySnapshot + shared StaffChatReplyPreview + quote-card scroll+bounce.
- Verified: full suite 15836/0 · Rule Q L2 18/0 real prod (whitelist completeness 609 docs, zero loss + branchId preserved + corruption round-trip) · Rule Q L1 real app (columns + live fields + full-doc edit modal + branch-switch re-subscribe, screenshots).

## Next action
- Idle — await user direction. (User: do B next session.)

## Outstanding (user-triggered)
- **B (next session — user-deferred)**: be_products data cleanup. 36 junk/corrupted docs in นครราชสีมา. Dry-run done (read-only). Script `scripts/v145-cleanup-polluted-product-junk.mjs` — bundles A(junk-strip)+B(restore cat/unit/type: 28 auto from clean cross-branch copies + 1 same-branch + 7 manual/ProClinic) + dedup of 3 true same-branch dups (FK-check first). Run dry-run → review → `--apply`.
- CentralStockTab navigate-bounce (carryover, V144 test CB1).
- Prior-session V-log entries (sales/EOD+5/+6) still unwritten (carryover).
