---
title: Wiki Index
type: index
date-created: 2026-05-04
date-updated: 2026-05-05
---

# LoverClinic Wiki — Index

Codebase architecture knowledge base. Bootstrapped 2026-05-04 per Karpathy LLM Wiki pattern. Backfilled 2026-05-05 (Phase 17.0/17.1 prep cycle). Re-backfilled 2026-05-05 EOD (Phase 17.2 quinquies/sexies/septies/octies + Phase 18.0 Branch Exam Rooms cycle).

**Schema**: see [CLAUDE.md](CLAUDE.md) for conventions.
**Activity log**: see [log.md](log.md) for chronological history.

## Sources

| Source | Date | Summary |
|---|---|---|
| [Karpathy — LLM Wiki gist](sources/karpathy-llm-wiki.md) | 2026-04 (ingested 2026-05-04) | The pattern this wiki implements. 3-layer architecture + 3 ops + index/log convention. |
| [BSA design spec](sources/bsa-spec.md) | 2026-05-04 | Branch-Scope Architecture spec — eliminate branch-leak bug class via 3-layer wrapper + audit. |
| [BSA implementation plan](sources/bsa-plan.md) | 2026-05-04 | 12-task TDD plan that shipped BSA over a single session. |

## Entities

| Entity | Type | Summary |
|---|---|---|
| [Andrej Karpathy](entities/andrej-karpathy.md) | Person | Computer scientist; LLM Wiki pattern originator. |
| [scopedDataLayer.js](entities/scoped-data-layer.md) | File / Lib | BSA Layer 2 wrapper. Auto-injects current branchId for all UI reads. Pure JS — V36.G.51 lock. Extended 2026-05-05 with full function reference. |
| [useBranchAwareListener](entities/use-branch-aware-listener.md) | Hook | BSA Layer 3 — onSnapshot listeners auto-resubscribe on branch switch. Universal-marker bypass. |
| [BranchContext + useSelectedBranch](entities/branch-context.md) | Hook / Context | React Context + hook for `selectedBranchId`. Source-of-truth for top-right BranchSelector. localStorage-mirrored for pure-JS layer. |
| [TreatmentFormPage (TFP)](entities/treatment-form-page.md) | Component | The biggest UI file (3000+ LOC). Treatment create/edit form. 4 modal openers with cache early-return that Phase 17.0 will fix. |
| [listProductGroupsForTreatment](entities/list-product-groups-for-treatment.md) | Function | Joins `be_product_groups` + `be_products` for TFP modal. Currently branch-blind; Phase 17.0 fixes opts + auto-inject. |
| [PromotionTab](entities/promotion-tab.md) | Component | `be_promotions` CRUD. Phase 17.0 closes branch-switch-refresh gap. |
| [CouponTab](entities/coupon-tab.md) | Component | `be_coupons` CRUD. Phase 17.0 closes branch-switch-refresh gap. |
| [VoucherTab](entities/voucher-tab.md) | Component | `be_vouchers` CRUD. Phase 17.0 closes branch-switch-refresh gap. |
| [ProductGroupsTab](entities/product-groups-tab.md) | Component | `be_product_groups` CRUD (Phase 11.2). Phase 17.1 cross-branch import target. |
| [ProductUnitsTab](entities/product-units-tab.md) | Component | `be_product_unit_groups` CRUD (Phase 11.3). Phase 17.1 target. |
| [MedicalInstrumentsTab](entities/medical-instruments-tab.md) | Component | `be_medical_instruments` CRUD (Phase 11.4). Phase 17.1 target. |
| [HolidaysTab](entities/holidays-tab.md) | Component | `be_holidays` CRUD (Phase 11.5). Listener-driven (BS-9 sanctioned exception). Phase 17.1 target. |
| [ProductsTab](entities/products-tab.md) | Component | `be_products` CRUD (Phase 11.7). Phase 17.1 target. |
| [CoursesTab](entities/courses-tab.md) | Component | `be_courses` CRUD (Phase 11.8). Phase 17.1 target. |
| [DfGroupsTab](entities/df-groups-tab.md) | Component | `be_df_groups` CRUD (Phase 13.x). Phase 17.1 target. |
| [be_exam_rooms](entities/be-exam-rooms.md) | Firestore collection | Branch-scoped exam-room master (Phase 18.0). Each doc: examRoomId / branchId / name / status / sortOrder. Standard BSA pattern. |
| [ExamRoomsTab](entities/exam-rooms-tab.md) | Component | `be_exam_rooms` CRUD (Phase 18.0). Backend tab `tab=exam-rooms` under "ข้อมูลพื้นฐาน". BS-9 compliant. Soft-confirm delete with auto-routing to ไม่ระบุห้อง. |
| [appointmentRoomColumns](entities/appointment-room-columns.md) | Helper / Lib | Pure render-side helpers for AppointmentTab grid columns (`effectiveRoomId`, `buildRoomColumnList`, `UNASSIGNED_ROOM_ID`). 16 unit tests. |

## Concepts

| Concept | Summary |
|---|---|
| [LLM Wiki pattern](concepts/llm-wiki-pattern.md) | Compounding knowledge base maintained by LLM, not RAG-on-raw-docs. The pattern THIS wiki implements. |
| [Branch-Scope Architecture](concepts/branch-scope-architecture.md) | 3-layer wrapper that makes branchId default-correct for all UI reads in LoverClinic. Solves the user-reported "branch leak" bug class. |
| [Iron-clad rules A-L](concepts/iron-clad-rules.md) | The 12 mandatory rules that govern every change in this codebase. Lives in `.claude/rules/`; wiki page summarizes. |
| [Rule H-quater (no master_data reads)](concepts/rule-h-quater.md) | Feature code reads only from `be_*`, never from `master_data/*`. Enforced by BSA audit BS-2. |
| [LoverClinic architecture overview](concepts/lover-clinic-architecture.md) | Top-level: React 19 + Firestore + ProClinic mirror + Vercel serverless. Multi-branch via Phase BS V2 + BSA. |
| [Branch-switch refresh discipline (BS-9)](concepts/branch-switch-refresh-discipline.md) | Every branch-scoped tab MUST re-fetch on top-right BranchSelector switch. Phase 17.0 invariant. 3-place lock (audit + memory + Rule L). |
| [Cross-branch import pattern](concepts/cross-branch-import-pattern.md) | Phase 17.1 anticipation — admin-only "ดึง / Copy ข้อมูลจากสาขาอื่น" feature on 7 master-data tabs. |
| [Marketing collections](concepts/marketing-collections.md) | `be_promotions` / `be_coupons` / `be_vouchers` — branch-scoped with `allBranches:true` doc-field OR-merge. Phase 9. |
| [Master-data tabs pattern](concepts/master-data-tabs-pattern.md) | 7 backend tabs (Phase 11+) sharing a near-identical structure. Targets for Phase 17.1 cross-branch import. |
| [Branch equality — no "main" branch](concepts/branch-equality-no-main.md) | Phase 17.2 anticipation. Per user directive 2026-05-05: remove `isDefault` / `'main'` / star UI. ~20 files affected. |
| [Branch Exam Rooms (Phase 18.0)](concepts/branch-exam-rooms.md) | Per-branch exam-room CRUD master. Replaces `appt-rooms-seen` localStorage cumulative cache. Shipped V15 #19 + V15 #20. Migration `--apply` ran 2026-05-05 (3 rooms seeded for นครราชสีมา). |
| [Runtime fallback for orphan roomIds](concepts/runtime-fallback-orphan-room.md) | Phase 18.0 render-time pattern: blank/missing/stale/cross-branch `roomId` → virtual ไม่ระบุห้อง column. Zero writes on room delete. |
| [V12 shape-drift bug class](concepts/v12-shape-drift.md) | When writer schema changes, every reader becomes a bug-magnet until swept. Original V12 (2026-04-24) + Phase 17.2-quinquies/septies/octies recurrences (2026-05-05). |

## Analyses

(empty — first analysis page lands when a query produces cross-cutting synthesis worth filing)

---

## Categories yet to populate

These are placeholders — pages will be created as sources are ingested or queries surface gaps:

- **Phase plans** — Phase 7 → 16 series. Currently in `docs/superpowers/plans/`. Wiki source-pages will summarize + link. *Phase 17.0 spec + plan filed 2026-05-05.*
- **V-entries** — V1 → V36-quinquies + Phase BSA. Currently in `.claude/rules/v-log-archive.md`. Wiki concept-pages will distill the bug-class lessons.
- **Audit skills** — 23 audit-* skills in `.claude/skills/`. Wiki entity-pages will track which invariants each skill enforces.
- **Major files (remaining)** — backendClient.js (11k+ LOC, partial coverage in 17 entity pages), SaleTab.jsx, AppointmentTab.jsx, App.jsx, AdminDashboard.jsx, BackendDashboard.jsx, MasterDataTab.jsx (sanctioned ProClinic-bridge tab).
- **Master collections** — be_customers, be_treatments, be_sales, be_appointments, be_stock_*, etc. Each gets its own entity page with branch-scope classification.
