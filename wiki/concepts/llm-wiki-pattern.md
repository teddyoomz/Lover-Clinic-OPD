---
title: LLM Wiki Pattern
type: concept
date-created: 2026-05-04
date-updated: 2026-05-04
tags: [pattern, knowledge-management, foundation, karpathy, memex]
source-count: 1
---

# LLM Wiki Pattern

> A pattern for building personal knowledge bases where the LLM **incrementally builds and maintains** a persistent markdown wiki rather than retrieving from raw documents at every query. Distinct from RAG. The pattern THIS wiki implements.

## Core insight

> "The wiki is a persistent, compounding artifact. The cross-references are already there. The contradictions have already been flagged. The synthesis already reflects everything you've read." — Karpathy gist

RAG re-derives knowledge per query. The LLM Wiki compiles knowledge once, keeps it current. Cross-references and synthesis are persistent state, not per-query work.

## Three layers

| Layer | Path (this wiki) | Owner |
|---|---|---|
| Raw sources | `raw/` (not yet populated; gist text in `~/.claude/skills/llm-wiki/reference.md`) | Human curates; LLM read-only |
| The wiki | `wiki/` | LLM owns entirely; human reads + curates direction |
| Schema | `wiki/CLAUDE.md` | Co-evolved by user + LLM |

## Three operations

### Ingest

User drops source → LLM reads → discusses takeaways → writes source-page → updates 10-15 entity/concept pages → updates `index.md` → appends `log.md` → commit. One source at a time by default; batch is opt-in.

### Query

LLM reads `index.md` first → drills into candidate pages → synthesizes answer with citations to wiki pages. Cross-cutting answers may be filed back as new analysis pages so explorations compound.

### Lint

Periodic health check. Surfaces: contradictions, stale claims, orphan pages, unwritten concepts, missing cross-references, data gaps. Doesn't auto-fix — user prioritizes.

## Index + Log convention (mandatory)

- `wiki/index.md` — content-oriented catalog. Categories: Sources, Entities, Concepts, Analyses.
- `wiki/log.md` — chronological, append-only. Entries `## [YYYY-MM-DD] <op> | <title>` so it's greppable: `grep "^## \[" wiki/log.md | tail -10`.

## Why it works

> "The tedious part of maintaining a knowledge base is not the reading or the thinking — it's the bookkeeping. ... LLMs don't get bored, don't forget to update a cross-reference, and can touch 15 files in one pass. The wiki stays maintained because the cost of maintenance is near zero." — Karpathy gist

Humans abandon wikis because the maintenance burden grows faster than the value. LLMs do the bookkeeping at near-zero marginal cost.

## Comparison to RAG

| RAG-on-docs | LLM Wiki |
|---|---|
| Retrieves raw chunks per query | Reads pre-synthesized wiki pages |
| LLM rediscovers knowledge each time | LLM compiled it once, just reads |
| Cross-references re-found per query | Cross-references already filed |
| Synthesis re-derived | Synthesis is a persistent artifact |
| Embedding infrastructure | Markdown + index.md (no infra needed at moderate scale) |

## Comparison to Memex (Bush 1945)

> "The idea is related in spirit to Vannevar Bush's Memex (1945) — a personal, curated knowledge store with associative trails between documents. ... The part he couldn't solve was who does the maintenance. The LLM handles that." — Karpathy gist

Memex envisioned a personal-knowledge desk that linked documents by associative trails (proto-hyperlinks). LLM Wiki is what Memex tries to be when the maintenance bottleneck is solved by automation.

## Comparison to graphify (sibling skill in this project)

| graphify | llm-wiki |
|---|---|
| **One-shot** snapshot of an existing folder | **Continuous** — wiki stays current as new sources arrive |
| Output: knowledge-graph (graph.json + HTML viz + Obsidian vault) | Output: markdown wiki maintained over time |
| Best for: archival snapshots, codebase audit | Best for: research that compounds, reading queues, ongoing knowledge accumulation |

Use both: graphify when you want a frozen graph; llm-wiki when accumulating sources over time.

## Quality bar (per skill)

A healthy wiki at moderate scale (~100 sources, ~hundreds of pages):
- Every page has at least one inbound link (no orphans)
- Every claim has a source citation
- `log.md` shows activity within the last 7 days when active
- `index.md` is parseable: every category has a heading; every page-link has a one-line summary
- Lint passes show <5 contradictions / <10 orphans

## Anti-patterns

- Answer queries from your own training memory when a wiki exists — always read the wiki first, cite pages
- Rewrite raw sources — `raw/` is immutable
- Auto-fix lint findings — surface, let user prioritize
- Skip `index.md` / `log.md` updates after an ingest — those files ARE the navigation
- Treat wiki pages as RAG chunks — they are documents the LLM reads end-to-end
- Let pages grow unbounded — split when a page exceeds ~500 lines

## Cross-references

- Source (seminal): [Karpathy — LLM Wiki gist](../sources/karpathy-llm-wiki.md)
- Person: [Andrej Karpathy](../entities/andrej-karpathy.md)
- Skill (operational): `~/.claude/skills/llm-wiki/SKILL.md` — codifies this pattern at the agent level
- Reference (verbatim gist): `~/.claude/skills/llm-wiki/reference.md`
- Project decision: this wiki uses standard markdown links (NOT Obsidian `[[wiki-link]]`) per `wiki/CLAUDE.md` Q2=A choice

## History

- 2026-05-04 — Concept page created during BSA wiki bootstrap. Pattern formally adopted as project base skill ("ใช้เป็นหลักเหมือนอากาศหายใจ" — like breathing air) per user-level CLAUDE.md SESSION BOOT addition.
