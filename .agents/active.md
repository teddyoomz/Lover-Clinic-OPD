---
updated_at: "2026-04-26 (end-of-session 2 — V21 lightbox fix + 14.7.H-D 6-collection wireup + EFG quick wins)"
status: "Pre-Phase-15 baseline complete. All planned items shipped: 14.7.H-D (6 branch-future wireups + tests), V21 fix (lightbox + close-on-edit), EFG quick wins (period enforcement + listenToCustomerFinance + TDZ JSDoc guard). 3 production commits, V15 combined deploy. 4586 → 4679 tests (+93). Production at 791b2de; master 1 commit ahead with EFG quick wins not yet deployed."
current_focus: "Idle. Phase 15 (Central Stock Conditional) is now technically unblocked — all multi-branch infrastructure live, V12.2b deferred items closed (period enforcement done; pick-at-treatment partial-pick reopen is the remaining M-effort polish item). Next decision: ship Phase 15 OR clean up final P1 polish items (partial-pick reopen, listener-cluster extensions for holidays/allSales)."
branch: "master"
project_type: "node (React 19 + Vite 8 + Firebase + Tailwind 3.4)"
last_commit: "7a9c62d"
tests: "4679/4679 full suite"
production_url: "https://lover-clinic-app.vercel.app"
last_deploy: "791b2de (2026-04-26 V15 combined deploy — V21 fix + 14.7.H-D wireup; vercel + firestore:rules; rules idempotent fire). Probe-Deploy-Probe ✅ all 4 endpoints 200 pre + post. EFG quick wins (7a9c62d) pushed but NOT YET deployed."
firestore_rules_deployed: "v10 (be_stock_movements update narrowed in 14.7.F per V19; idempotent fires since)"
---

# Active Context

## Objective

Pre-Phase-15 baseline complete. 3 commits ahead of yesterday's session: multi-branch wireup for 6 branch-future collections (14.7.H-D), V21 lightbox+edit fix for TreatmentTimelineModal, and 3 quick wins (period enforcement / listenToCustomerFinance bundle / hook-order JSDoc guard). Production matches master modulo the EFG quick wins commit.

## What this session shipped (2026-04-26 session 2, 3 production commits, `2ee6eeb` → `7a9c62d`)

| Commit | Phase | One-liner |
|---|---|---|
| `370854a` | 14.7.H-D | wire branchId in 6 branch-future collections (be_quotations / be_vendor_sales / be_online_sales / be_sale_insurance_claims / be_expenses / be_staff_schedules) — 6 form modals + 6 BC2.spread tests + 6 matrix flips |
| `791b2de` | V21 | TreatmentTimelineModal — lightbox replaces blocked `<a href={dataUrl}>` (Chrome anti-XSS), edit button closes modal first so TFP z-80 isn't covered by modal z-100; 15 TL9 tests + V21 V-entry **DEPLOYED** |
| `7a9c62d` | 14.7.H-EFG | pre-Phase-15 quick wins: period+daysBeforeExpire integer/bound enforcement + buffet rule (32 tests), listenToCustomerFinance bundle (22 tests), TFP hook-order TDZ JSDoc guard (14 tests). +68 tests total. |

## Live verification done this session (preview_eval against real Firestore)

- **V21 (customer 2853)**: 122 edit + 69 zoom buttons rendered; lightbox z-110 above modal z-100; Esc closes lightbox only; edit click closes modal + TFP renders ✓
- **listenToCustomerFinance (customer 2853)**: 1 emit (coalesce ✓); shape correct; deposit=5000, wallet=207000, points=699, GOLD active; DOM renders all 4 numbers after page reload ✓
- **Period validator (cache-busted import)**: 12/12 runtime cases pass — buffet+empty-dbe rejected, period=7.5 rejected, period=99999 rejected, valid combos accepted ✓

## Outstanding user-triggered actions (NOT auto-run)

- **`vercel --prod` for `7a9c62d`** — EFG quick wins (period enforcement + listenToCustomerFinance + TDZ guard) committed + pushed but NOT yet deployed. Production stuck at `791b2de` (V21 only). User must say "deploy" THIS turn for next deploy. Per V18 — no roll-over.

## Recent decisions (non-obvious — preserve reasoning)

1. **Period validator widened to daysBeforeExpire too** — V12.2b note flagged "period" but daysBeforeExpire has identical day-count semantics + same failure modes (decimals, over-bound). Same validateDayInteger applied to both. Same effort, more value.

2. **Buffet rule = `daysBeforeExpire > 0`** — chose to enforce buffet has explicit expiry (matches "บุฟเฟต์ใช้ได้จนครบกำหนด" UI hint at CourseFormModal:452). Period stays optional ("ไม่จำกัด" placeholder = empty = no rate limit). Rejecting empty period would be too strict given the UI hint.

3. **listenToCustomerFinance coalesce = block emit until 4/4 ready** — alternative was emit-on-each-snapshot (4 partial-state callbacks during initial mount). Coalesce is simpler downstream (UI sees 1 stable snapshot) at cost of slight latency increase (~ms-level). Worth it for finance card stability.

4. **listenToCustomerFinance does NOT lazy-write expired memberships** — getCustomerMembership lazy-writes status='expired' on expired docs. Listener doesn't (would write on every snapshot fire). UI-side filter (membership.expiresAt < now) handles display correctly. Documented in JSDoc.

5. **V21 lightbox uses `<button>` not `<a>`** — Chrome blocks `<a href="data:...">` top-frame navigation since 2017+ (anti-XSS). dataUrl images render fine in `<img src>` directly inside a button-triggered overlay div.

6. **V21 close-on-edit pattern** — `() => { onClose?.(); onEditTreatment(t.id); }`. Modal yields BEFORE TreatmentFormPage at z-80 renders, otherwise modal at z-100 covers it.

## Detail checkpoint

See `.agents/sessions/2026-04-26-pre-phase15-quickwins.md` (this session's full detail).
