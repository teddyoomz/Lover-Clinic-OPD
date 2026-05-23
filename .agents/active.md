---
updated_at: "2026-05-23 EOD+1 LATE+2 — V114 SHIPPED LOCAL · V112+V113+V113-C+V114 batch pending deploy"
status: "V114 receipt-info toggle SHIPPED local (committed + pushed). Joins the existing batch (V112-A + V113 + V113-C + V114) awaiting explicit user deploy authorization. Vercel prod still on 1305d040 (V111 only)."
branch: "master"
last_commit: "<latest> feat(receipt): V114 T5 — V21 fixup + state finalize"
tests: "vitest 14294/14294 PASS · V114 34/34 PASS · V111 31/31 PASS post-fixup · build clean ✓ 2.94s"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "1305d040 (Vercel — V111 only; V112+V113+V113-C+V114 PENDING deploy) · office-to-pdf-00007-tfb (Cloud Run, V110-bis)"
firestore_rules_version: "unchanged"
---

# Active Context

## State
- V114 — Receipt-info toggle in preview header (LOCAL, awaiting deploy).
  Spec: `docs/superpowers/specs/2026-05-23-receipt-info-toggle-design.html`
  Plan: `docs/superpowers/plans/2026-05-23-receipt-info-toggle.html`
- Joins the existing pending-deploy batch: V112-A (updateBackendSale customer resolver) + V113 (renderer live-resolve) + V113-C (receiptInfo block live-resolve) + V114 (UI toggle over V113-C). All renderer-level changes; no rules / no migration.

## V114 architecture
- NEW `src/hooks/useReceiptInfoToggle.js` (~50 LOC) — shared localStorage hook (key `lover_receipt_show_address`, default `false` per Q3=B PDPA-friendly, cross-tab `storage` event sync, graceful private-mode fallback).
- SalePrintView + QuotationPrintView both consume the same hook (Q5=A shared key) — toggling in either preview affects both.
- 4 surfaces per PrintView: import + body hook call + header switch (inside existing `print:hidden` sticky bar so it NEVER appears on printed PDF) + HN-line phone-append when OFF + receipt-info block wrapped in `{showAddress && ...}`.
- Switch UI: iOS-style + label "ที่อยู่" + `role="switch"` + `aria-checked` + red accent when ON.
- Compact mode (default OFF): customer block = name + `HN LC-xxx · โทร. 0xxxxxxxxx` single line.
- Full mode (ON): preserves existing V113-C `mergedReceiptInfo` block (taxId + address + phone + name-if-different).
- Edge case: no phone → HN line alone (no trailing middle-dot or empty "โทร." label).

## Files this session
- NEW `src/hooks/useReceiptInfoToggle.js`
- MOD `src/components/backend/SalePrintView.jsx` (4 surfaces)
- MOD `src/components/backend/QuotationPrintView.jsx` (4 surfaces)
- NEW `tests/v114-receipt-info-toggle.test.jsx` (34 tests: 11 H + 10 SG + 10 R + 3 F)
- NEW `docs/superpowers/plans/2026-05-23-receipt-info-toggle.html`
- MOD `tests/v111-receipt-course-name-override.test.js` (V21 fixup A6+A8 — V113 refactored grouped reader to `liveReceiptName(courseLine)` helper; tests were locked to the pre-V113 inline shape and failed when full-suite ran. V14 marker comment added explaining the lineage; V111 contract preserved at the helper layer.)

## Verification (Rule Q V66 discipline)
- **L2 verified** (mock-based + RTL + source-grep + flow-simulate):
  - 11 hook unit tests (H1-H6: default OFF, localStorage R/W, cross-tab storage event, type coercion, invalid value fallback, private-mode graceful)
  - 10 source-grep regression locks (SG1-SG6: imports + hook call + showAddress conditional + HN+phone append + role=switch inside print:hidden)
  - 10 RTL render tests (R1-R10: default compact + click ON → full block + click OFF → compact returns + no-phone edge + a11y aria-checked) for both SalePrintView and QuotationPrintView
  - 3 Rule I cross-view flow-simulate (F1-F3: Sale→Quotation state inheritance + reverse direction + cross-receipt persistence)
- **L1 partial** (Rule S Chrome MCP localhost): browser-level localStorage R/W + storage-event mechanism verified working in real browser via `preview_eval`.
- **L1 hands-on deferred to user post-deploy** (typical workflow per V111/V113-C pattern in session_handoff): on prod, open a sale receipt → confirm default OFF compact line → click switch → confirm full block appears → confirm cross-view shared state with quotation preview → confirm print preview hides switch chrome.
- **Full suite**: 14294/14294 PASS (was 14215 pre-V114; +79 = 34 V114 + 11 + 31 V111 post-fixup overlap; net +34 V114 with V111 A6+A8 V21 fixups absorbed).
- **Build**: clean ✓ 2.94s; BackendDashboard chunk 943.75 → 945.49 KB (+1.74 KB for hook + 2 switch JSX blocks; within budget).

## Next action
1. User authorizes deploy → `vercel --prod` (V112-A + V113 + V113-C + V114 batch, client-only, no rules). Smoke-check INV-20260520-0010 receipt on prod via Rule S Chrome MCP after deploy (live-resolve customer + course override + receipt-info block + V114 toggle all live).
2. After deploy: user hands-on L1 — open any sale receipt, toggle switch, verify behavior matches mockup (compact ↔ full); open quotation preview, verify shared state.

## Outstanding user-triggered actions
- L1 hands-on (optional, not blocking): full UI walkthrough of toggle behavior. The L2 + Rule I bank exhaustively covers the contract.
- Snapshot-at-write semantic preserved (V111 + V112-A + V113 design intact). V114 is pure renderer-level UI state — toggle off / on doesn't mutate any sale doc.
- No PDPA / audit work needed — toggle is per-device localStorage only.
