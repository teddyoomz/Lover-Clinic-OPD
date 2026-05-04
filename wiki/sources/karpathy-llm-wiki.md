---
title: "Karpathy — LLM Wiki gist"
type: source
date-created: 2026-05-04
date-updated: 2026-05-04
date-ingested: 2026-05-04
original-url: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
source-type: gist
author: Andrej Karpathy
date-published: 2026-04 (approximate)
tags: [llm-wiki, knowledge-management, pattern, memex, foundation]
---

# Karpathy — LLM Wiki gist

> Andrej Karpathy's pattern for building personal knowledge bases by having the LLM **incrementally build and maintain** a persistent markdown wiki — distinct from RAG-on-raw-docs. The seminal source for the pattern this wiki implements.

## Key claims (verbatim from gist)

- "Most people's experience with LLMs and documents looks like RAG: ... LLM is rediscovering knowledge from scratch on every question. There's no accumulation."
- "The LLM **incrementally builds and maintains a persistent wiki** — a structured, interlinked collection of markdown files that sits between you and the raw sources."
- "The wiki is a **persistent, compounding artifact.** The cross-references are already there. The contradictions have already been flagged. The synthesis already reflects everything you've read."
- "Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase."
- Pattern is related in spirit to **Vannevar Bush's Memex (1945)** — the part Bush couldn't solve was "who does the maintenance"; the LLM handles that.

## 3-layer architecture

| Layer | What it is | Who owns it |
|---|---|---|
| Raw sources | `raw/` immutable docs | Human curates; LLM reads-only |
| Wiki | `wiki/` LLM-generated markdown | LLM owns entirely |
| Schema | per-wiki config (`CLAUDE.md`/`AGENTS.md`/`WIKI.md`) | Co-evolved by user + LLM |

## 3 operations

- **Ingest** — drop source → LLM reads → discusses takeaways → writes source-page → updates 10-15 entity/concept pages → updates index → appends log → commit. Single source at a time by default; batch is opt-in.
- **Query** — read `index.md` first → drill into pages → synthesize answer with citations → optionally file the answer back as a new analysis page.
- **Lint** — health-check periodic. Surfaces: contradictions, stale claims, orphans, unwritten concepts, missing cross-references, data gaps. Doesn't auto-fix — user prioritizes.

## Index + Log convention

- `wiki/index.md` — content-oriented catalog
- `wiki/log.md` — chronological append-only, entries start `## [YYYY-MM-DD] <op> | <title>` so they're greppable

## Why it works (key quote)

> "The tedious part of maintaining a knowledge base is not the reading or the thinking — it's the bookkeeping. ... Humans abandon wikis because the maintenance burden grows faster than the value. LLMs don't get bored, don't forget to update a cross-reference, and can touch 15 files in one pass. The wiki stays maintained because the cost of maintenance is near zero."

## Use-case examples Karpathy lists

- Personal (goals/health/journal)
- Research (deep on a topic over weeks)
- Reading a book (chapter-by-chapter ingest, build a fan-wiki-like companion)
- Business/team (Slack threads, meeting transcripts → maintained internal wiki)
- Competitive analysis, due diligence, course notes, hobby deep-dives

## Optional tooling Karpathy mentions

- Obsidian + Web Clipper + Graph view + Dataview plugin
- `qmd` (https://github.com/tobi/qmd) — local markdown search engine, hybrid BM25/vector + LLM rerank, on-device, has both CLI + MCP server
- Marp (markdown slides)

## Cross-references

- Concept: [LLM Wiki pattern](../concepts/llm-wiki-pattern.md) — distillation of this gist into actionable steps
- Person: [Andrej Karpathy](../entities/andrej-karpathy.md) — author
- Skill: `~/.claude/skills/llm-wiki/SKILL.md` — operational skill that codifies this pattern at the agent level
- Reference (verbatim): `~/.claude/skills/llm-wiki/reference.md` — full gist text preserved

## Verbatim caveat

The gist explicitly says: "This document is intentionally abstract. It describes the idea, not a specific implementation. ... pick what's useful, ignore what isn't." Our LoverClinic wiki picks: 3-layer architecture (yes, all three) + index/log convention (yes) + standard markdown links (NOT Obsidian double-bracket per project Q2 choice).

## History

- 2026-05-04 — Ingested as the seminal source. Bootstrap of LoverClinic wiki.
