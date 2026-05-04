---
title: Iron-Clad Rules A-L
type: concept
date-created: 2026-05-04
date-updated: 2026-05-04
tags: [iron-clad, rules, methodology, governance]
source-count: 1
---

# Iron-Clad Rules A-L

> The 12 mandatory rules that govern every change in LoverClinic. Live in `.claude/rules/` (canonical source). This wiki page summarizes + links — does NOT restate verbatim because the rule files are themselves the source of truth.

## Where the canonical text lives

- [`.claude/rules/00-session-start.md`](../../.claude/rules/00-session-start.md) — full rule text + past violations (V1-V36 + Phase BSA)
- [`.claude/rules/01-iron-clad.md`](../../.claude/rules/01-iron-clad.md) — Rules A-D detail
- [`.claude/rules/02-workflow.md`](../../.claude/rules/02-workflow.md) — commit/push/deploy/test workflow
- [`.claude/rules/03-stack.md`](../../.claude/rules/03-stack.md) — Firestore + Vite + React + Backend + ProClinic + Chat gotchas
- [`.claude/rules/04-thai-ui.md`](../../.claude/rules/04-thai-ui.md) — UI/colors/dates/Thai culture
- [`.claude/rules/v-log-archive.md`](../../.claude/rules/v-log-archive.md) — verbose V-entries

## The 12 rules (one-line each)

| Rule | One-line summary | Cross-ref |
|---|---|---|
| **A** | Bug-Blast Revert — change X breaks Y → revert X immediately | rules/01 |
| **B** | Probe-Deploy-Probe — every `firestore:rules` deploy = 5-endpoint probes BEFORE + AFTER | rules/01, V1, V9, V23 |
| **C** | Anti-Vibe-Code — Rule of 3 / crypto tokens not Math.random / lean schema | rules/01 |
| **D** | Continuous Improvement — every bug → fix + adversarial test + audit invariant | rules/01 |
| **E** | Backend = Firestore ONLY — `src/components/backend/**` no brokerClient/api/proclinic except MasterDataTab | rules/03, V2 |
| **F** | Triangle Rule — ProClinic intel + plan + code, all 3 before/during every replication | rules/03, V3, F-bis |
| **G** | Dynamic capability expansion — load deferred tools / build skills via /skill-creator | rules/00 |
| **H** | Data Ownership — be_* canonical, master_data mirror = initial seed only | rules/00 |
| **H-bis** | Sync = DEV-ONLY scaffolding — strip MasterDataTab/brokerClient/api/proclinic/cookie-relay before production | rules/00 |
| **H-tris** | Missing-data-first, feature-second — every backend read wires ONLY against be_* | rules/00 |
| **H-quater** | NO reads from master_data/* in feature code — see [Rule H-quater concept](rule-h-quater.md) | rules/00 |
| **I** | Full-Flow Simulate at sub-phase end — chain master→whitelist→builder→filter→write→post-state | rules/00, V13, V34 |
| **J** | Superpowers Auto-Trigger — using-superpowers skill at session boot; brainstorming HARD-GATE | rules/00 |
| **K** | Work-first, Test-last — for multi-stream cycles, write test bank in final pass before commit | rules/00 |
| **L** | Branch-Scope Architecture (BSA) — see [BSA concept](branch-scope-architecture.md) | rules/00 |

(Rules H, H-bis, H-tris, H-quater nested under data-ownership umbrella — count as 4 distinct rules but share the H prefix.)

## Why this concept page is short

The rule files are the canonical source. Restating them here would create drift (V21 lesson — comments-vs-code drift). This page ONLY:
1. Lists the rules (one-liners)
2. Links to canonical text
3. Links to related concept pages (Rule H-quater, BSA)
4. Acknowledges the V-entry archive for past violations

If a rule changes, edit the rule file in `.claude/rules/` — NOT this wiki page. The wiki page may need a one-line update if a new rule (M, N, ...) is added.

## Past violations (V-entries)

Full archive: `.claude/rules/v-log-archive.md`. Headlines:

- V1, V9, V23 — firestore.rules deploys broke unauth/anon write paths → Rule B probe list extended
- V2, V3 — Phase 9 backend tabs called ProClinic → Rule E + Rule F
- V4, V7, V18 — `vercel --prod` without per-turn authorization (3 offenses)
- V11 — mock-shadowed missing export → `npm run build` mandatory pre-commit
- V12 — shape-migration half-fix → multi-reader sweep before changing writer
- V13 — buffet expiry helper-only tests passing while UI broken → Rule I full-flow simulate
- V14 — `options:undefined` rejected by setDoc → preview_eval mandatory for stock + sensitive paths
- V32 family — Bulk PDF alignment 4 rounds; source-grep tests can encode broken behavior
- V34 — ADJUST_ADD silent qty-cap on full-capacity batch (production-affecting since stock system shipped)
- V35 — 5 user-reported stock bugs after Phase 15.5 (orphan products, stale balance reader, sale delete black-screen, etc.)
- V36 family — phantom-branch defensive fallback + tracked-stock fail-loud + course-history audit emit; multi-reader-sweep at consumer-hook level
- **Phase BSA** — full architectural shift; 12 tasks; locked as Rule L

## Cross-references

- Concept: [Branch-Scope Architecture](branch-scope-architecture.md) — Rule L codified
- Concept: [Rule H-quater](rule-h-quater.md) — no master_data reads
- Concept: [LoverClinic architecture](lover-clinic-architecture.md) — top-level system context

## History

- 2026-05-04 — Wiki concept page created. Restating rules summary; canonical text remains in `.claude/rules/`.
