---
title: Wiki Index
type: index
date-created: 2026-05-04
date-updated: 2026-05-04
---

# LoverClinic Wiki — Index

Codebase architecture knowledge base. Bootstrapped 2026-05-04 per Karpathy LLM Wiki pattern.

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
| [scopedDataLayer.js](entities/scoped-data-layer.md) | File / Lib | BSA Layer 2 wrapper. Auto-injects current branchId for all UI reads. Pure JS — V36.G.51 lock. |
| [useBranchAwareListener](entities/use-branch-aware-listener.md) | Hook | BSA Layer 3 — onSnapshot listeners auto-resubscribe on branch switch. Universal-marker bypass. |

## Concepts

| Concept | Summary |
|---|---|
| [LLM Wiki pattern](concepts/llm-wiki-pattern.md) | Compounding knowledge base maintained by LLM, not RAG-on-raw-docs. The pattern THIS wiki implements. |
| [Branch-Scope Architecture](concepts/branch-scope-architecture.md) | 3-layer wrapper that makes branchId default-correct for all UI reads in LoverClinic. Solves the user-reported "branch leak" bug class. |
| [Iron-clad rules A-L](concepts/iron-clad-rules.md) | The 12 mandatory rules that govern every change in this codebase. Lives in `.claude/rules/`; wiki page summarizes. |
| [Rule H-quater (no master_data reads)](concepts/rule-h-quater.md) | Feature code reads only from `be_*`, never from `master_data/*`. Enforced by BSA audit BS-2. |
| [LoverClinic architecture overview](concepts/lover-clinic-architecture.md) | Top-level: React 19 + Firestore + ProClinic mirror + Vercel serverless. Multi-branch via Phase BS V2 + BSA. |

## Analyses

(empty — first analysis page lands when a query produces cross-cutting synthesis worth filing)

---

## Categories yet to populate

These are placeholders — pages will be created as sources are ingested or queries surface gaps:

- **Phase plans** — Phase 7 → 16 series. Currently in `docs/superpowers/plans/`. Wiki source-pages will summarize + link.
- **V-entries** — V1 → V36-quinquies + Phase BSA. Currently in `.claude/rules/v-log-archive.md`. Wiki concept-pages will distill the bug-class lessons.
- **Audit skills** — 23 audit-* skills in `.claude/skills/`. Wiki entity-pages will track which invariants each skill enforces.
- **Major files** — TreatmentFormPage.jsx (4874 LOC), backendClient.js (11k+ LOC), SaleTab.jsx, AppointmentTab.jsx. Each gets its own entity page.
- **Master collections** — be_customers, be_treatments, be_sales, be_products, be_courses, etc. Each gets its own entity page with branch-scope classification.
