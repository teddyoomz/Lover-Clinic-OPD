---
updated_at: "2026-04-26 (end-of-session — Phase 14.7.C through 14.7.H multi-branch infrastructure shipped + deployed)"
status: "All planned P0/P1 items shipped this session: P0 cleanup + Follow-up B (listener cluster) + Follow-up C (VendorSalesTab route) + Follow-up A (multi-branch infrastructure Option 1). 11 production commits. 4318 → 4586 tests. Three V15 combined deploys. Production matches master (a6ddc6c LIVE)."
current_focus: "Idle. Awaiting next user direction. If clinic opens 2nd branch → wire the 6 branch-future collections (be_quotations + be_vendor_sales + be_online_sales + be_sale_insurance_claims + be_expenses + be_staff_schedules; each is 30-60min). Otherwise P1 polish: partial-pick reopen / period enforcement."
branch: "master"
project_type: "node (React 19 + Vite 8 + Firebase + Tailwind 3.4)"
last_commit: "2ee6eeb"
tests: "4586/4586 full suite"
production_url: "https://lover-clinic-app.vercel.app"
last_deploy: "a6ddc6c (2026-04-26 third V15 combined deploy — vercel + firestore:rules; rules idempotent fire, no diff). Probe-Deploy-Probe ✅ all 4 endpoints 200 pre + post."
firestore_rules_deployed: "v10 (be_stock_movements update narrowed in 14.7.F; idempotent fires since)"
---

# Active Context

## Objective

Pre-Phase-15 punch list complete. Multi-branch infrastructure shipped. Production matches master. No code task in flight.

## What this session shipped (2026-04-26, 11 production commits, `0735a50` → `2ee6eeb`)

| Commit | Phase | One-liner |
|---|---|---|
| `5897b59` | 14.7.C | AppointmentTab → shared AppointmentFormModal |
| `4f9e13e` | 14.7.D | Treatment-history redesign + 5/page pagination + ProClinic colors |
| `f16cce2` | 14.7.E | TreatmentTimelineModal full ProClinic ดูไทม์ไลน์ replica |
| `93fffca` | 14.7.F | Image-only edit stock-reverse permission fix + V19 |
| `fc8125b` | V19 | Comprehensive firestore-rules audit doc + entry |
| `772ee8a` | 14.7.G | Real-time treatment listener (no F5 needed) |
| `8eec8dd` | P0 | window.__auth gated by import.meta.env.DEV |
| `d34d03b` | 14.7.H-B | Listener cluster — 3 staleness gaps closed |
| `73fc75e` | 14.7.H-C | VendorSalesTab route wiring |
| `39ab33b` | 14.7.H-A | Multi-branch infrastructure Option 1 + 73 tests |
| `a6ddc6c` | docs | V20 architecture-decision entry |
| `2ee6eeb` | docs | Final handoff sync after V15 deploy |

## Live integration testing (preview_eval against real Firestore)

User authorized "Generate อะไรจริงๆขึ้นมาเทสใน backend ได้ไม่จำกัด":
- **Treatment listener (14.7.G)**: image edit propagated to timeline modal in <1s, no F5 needed
- **Multi-branch isolation (14.7.H-A)**: 2 sales written on different branches → query returns each tagged with correct branchId; zero cross-branch leak
- **Cross-branch stock transfer A→B**: 10 source units → 7 source / 3 dest after 0→1→2 state machine. EXPORT_TRANSFER (type 8) movement.branchId = source ✓; RECEIVE (type 9) movement.branchId = destination ✓
- All test data cleaned up (sales + branch deleted; selector auto-hides at <2)

## Outstanding user-triggered actions (NOT auto-run)

_None._ Production is up-to-date with master.

## Recent decisions (non-obvious — preserve reasoning)

1. **Multi-branch = Option 1 forever** — V20 locks the rationale. Single project + branchId field. Don't re-debate when adding new collections; classify them in `branch-collection-coverage.test.js COLLECTION_MATRIX` (BC1.1 fails if you forget).

2. **be_stock_movements update narrowed (V19)** — rule allows `update` only when `affectedKeys().hasOnly(['reversedByMovementId'])`. Audit-immutable for everything else. Future code that tries to update other fields will 403 — by design.

3. **6 branch-future collections deferred** — be_quotations, be_vendor_sales, be_online_sales, be_sale_insurance_claims, be_expenses, be_staff_schedules. Their `firestore.rules` permit `branchId` filtering but their CRUD UIs don't yet thread it. Wireup is per-feature when clinic actually uses multi-branch (~30-60min per collection).

4. **Listener cluster pattern locked** — drop dep array to scoped key (e.g. `[customer?.proClinicId]`), subscribe in useEffect, return cleanup. Legacy reload callbacks kept as no-op shims for backwards compat. Apply same pattern to `listenToCustomerFinance` etc. in future polish phases.

5. **Cross-branch transfer was already correct** — `createStockTransfer` already validates source-batch-belongs-to-source-branch (`b.branchId !== src` throws). Movements properly attribute. Tests now pin the contract; no refactor needed.

## Detail checkpoint

See `.agents/sessions/2026-04-26-phase14.7H-multi-branch-isolation.md` (this session's full detail).
