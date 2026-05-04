# Wiki Schema — LoverClinic Codebase Architecture Knowledge

This is the **schema file** for `F:/LoverClinic-app/wiki/`. Per Karpathy LLM Wiki pattern, the schema tells the LLM how to maintain this wiki.

**Scope** (locked at bootstrap 2026-05-04, user choice Q1=B): codebase architecture knowledge — replace `CODEBASE_MAP.md` over time. Sources = code modules, Phase plans, specs, V-entries. Entities = files / components / hooks / endpoints / collections. Concepts = patterns (BSA, Phase BS, Rule H-quater, etc.) and workflows.

**Out of scope**:
- Hot session state — lives in `.agents/active.md` and `.agents/sessions/*`
- Iron-clad rules — live in `.claude/rules/00-session-start.md`
- ProClinic intel dumps — live in `docs/proclinic-scan/`
- Code knowledge graph — `graphify-out/` is the structural-graph artifact (complementary)

The wiki captures **synthesis + cross-references + lessons** that don't have a natural home in the above. When `CODEBASE_MAP.md` becomes outdated, the wiki is the replacement.

---

## Linking convention

Use **standard markdown** (Q2=A) with relative paths from the wiki root:

```
[Branch-Scope Architecture](concepts/branch-scope-architecture.md)
[andrej-karpathy](entities/andrej-karpathy.md)
[BSA spec](sources/bsa-spec.md)
```

NOT Obsidian `[[wiki-link]]` style. Standard markdown works on GitHub + any markdown viewer.

## Page categories

Every page lives in one of 4 directories:

| Dir | Purpose | Examples |
|---|---|---|
| `sources/` | One page per ingested source (gist / paper / spec / Phase plan) | `karpathy-llm-wiki.md`, `bsa-spec.md`, `phase16-3-system-settings-design.md` |
| `entities/` | One page per file / component / hook / endpoint / collection | `treatment-form-page.md`, `scoped-data-layer.md`, `andrej-karpathy.md` |
| `concepts/` | One page per pattern / abstraction / cross-file idea | `branch-scope-architecture.md`, `phase-bs-multi-branch.md`, `iron-clad-rules.md` |
| `analyses/` | Cross-cutting comparisons / decisions / write-ups born from queries | `wiki-vs-rag.md`, `bsa-vs-per-callsite.md` |

## Naming convention

- **Slugs**: kebab-case, ascii only, ≤ 5 words.
- **Disambiguation**: when two things share a name, prefix the type:
  - `entities/file-treatment-form-page.md` vs `concepts/treatment-flow.md`
- Avoid acronyms in slugs unless the acronym is the canonical name (`bsa`, `tfp` OK in body, prefer full form in slug)

## Page format (frontmatter + structure)

Every wiki page starts with YAML frontmatter:

```yaml
---
title: <page title>
type: source | entity | concept | analysis
date-created: YYYY-MM-DD
date-updated: YYYY-MM-DD
tags: [bsa, refactor, phase-bsa]
source-count: 3   # how many source pages cite this (entities/concepts only)
---
```

Body structure (target — adapt as needed):

```markdown
# <Title>

> One-paragraph TL;DR. What this thing IS and why we care.

## Overview

3-5 paragraphs explaining the thing.

## Key facts / claims

- Bullet 1 (with source citation `[bsa-spec.md](../sources/bsa-spec.md)`)
- Bullet 2

## Cross-references

- Related concept: [...](../concepts/...)
- Related entity: [...](../entities/...)
- Sources: [...](../sources/...)

## History

- 2026-05-04 — Created during BSA bootstrap. Seed page.
- 2026-05-XX — Updated after ingesting Phase XX plan.
```

## Ingest workflow specifics (LoverClinic-tuned)

When user runs **ingest** for this codebase wiki:

1. **Read the source fully**. For Phase plans / specs, this is straightforward (markdown). For code modules, read the full file + grep for cross-references.
2. **Discuss** — surface 3-5 entities/concepts the source touches; ask user which to emphasize. (Skip in batch mode.)
3. **Source page** at `sources/<slug>.md`. For Phase plans/specs already in `docs/superpowers/specs/` or `docs/superpowers/plans/`, the source page is a SUMMARY + LINK back, not a duplicate of the doc.
4. **Update entities + concepts** — for every file/pattern the source touches, extend or create the page. Aim for 5-10 cross-references per ingest.
5. **Update `index.md`** — new source-page link + any new entity/concept links.
6. **Append `log.md`** — `## [YYYY-MM-DD] ingest | <source-title>` + 2-3 line change summary.
7. **Don't auto-commit** — per project iron-clad "NEVER commit unless user asks". Stage changes; tell user the wiki update is ready.

## Domain-specific rules

- **All claims about code state must cite a file:line** (e.g. `src/lib/scopedDataLayer.js:37-38`) so future readers can verify.
- **Phase / V-entry cross-references mandatory** — when describing a pattern, link to the Phase that introduced it AND any V-entries that improved it. Example: BSA links to V36 (phantom-branch defensive) + Phase BS V2 (pre-BSA writer-stamp pattern).
- **Don't restate iron-clad rules verbatim** — the rule files in `.claude/rules/` are the canonical source. Wiki concepts ABOUT rules link back: `concepts/rule-h-quater.md` summarizes + cites `[rules/01-iron-clad.md L171-L194](../../.claude/rules/01-iron-clad.md)`.
- **Code module pages should track API surface** — list exported functions + signatures. When a function changes signature, update the entity page in the same commit.
- **V-entries are NOT sources** — V-entries are LESSONS distilled from sources. They live in `.claude/rules/v-log-archive.md` and are referenced by concept pages (`concepts/v36-stock-bug-class.md` cites the V36 archive entry).

## Lint priorities for this wiki

Order of issues to surface (most impactful first):

1. **Stale code claims** — entity page says `listProducts({branchId})` but code has different signature now
2. **Missing concept pages** — pattern mentioned across 3+ entity pages but no canonical page
3. **Orphan pages** — entity has no inbound links from concepts/analyses
4. **Phase drift** — Phase plan cited but plan file moved/renamed
5. **Cross-file consistency** — concept A cited by entities X+Y but X says "BSA owns this", Y says "Phase BS owns this"

## Tools (optional)

- **Obsidian** — open this `wiki/` folder as a vault. Graph view shows cross-references nicely.
- **graphify** — already installed at `graphify-out/` for code structure. Wiki concepts can cite graph node ids.

## Co-evolution

This schema is co-evolved. When a pattern repeats 3+ times across pages (Rule of 3), propose extending this file. Don't unilaterally add sections — surface to user first.

---

**Source for this pattern**: [Karpathy LLM Wiki](sources/karpathy-llm-wiki.md) (gist `442a6bf555914893e9891c11519de94f`, Apr 2026).
**Bootstrapped**: 2026-05-04 by Claude Opus 4.7 (1M ctx) per user directive "ใช้เป็นหลักเหมือนอากาศหายใจ".
