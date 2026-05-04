# Wiki Log

Chronological, append-only. Every entry starts `## [YYYY-MM-DD] <op> | <title>` so it's greppable: `grep "^## \[" wiki/log.md | tail -10`.

## [2026-05-04] bootstrap | LoverClinic codebase wiki
Created scaffold per Karpathy LLM Wiki pattern. Schema = `CLAUDE.md` (standard markdown links, kebab-case slugs, frontmatter mandatory, file:line citations for code claims). Categories: sources/ entities/ concepts/ analyses/. User chose Q1=B (codebase architecture knowledge), Q2=A (standard markdown), Q3=A (separate schema), Q4=B (seed ingest). 3 source pages + 3 entity pages + 5 concept pages seeded.

## [2026-05-04] ingest | Karpathy — LLM Wiki gist (gist 442a6bf)
Source page: `sources/karpathy-llm-wiki.md`. Created entity page `entities/andrej-karpathy.md` (person). Created concept page `concepts/llm-wiki-pattern.md` (the pattern this wiki implements). Cross-referenced from index.

## [2026-05-04] ingest | BSA spec + plan
Source pages: `sources/bsa-spec.md`, `sources/bsa-plan.md`. Created concept page `concepts/branch-scope-architecture.md` (the 3-layer pattern). Created entity pages `entities/scoped-data-layer.md` (Layer 2) + `entities/use-branch-aware-listener.md` (Layer 3). Cross-referenced with `concepts/rule-h-quater.md` (BS-2 invariant).

## [2026-05-04] ingest | Iron-clad rules + LoverClinic top-level architecture
Concept pages: `concepts/iron-clad-rules.md` (A-L summary, links to canonical `.claude/rules/`), `concepts/rule-h-quater.md` (the H-quater rule that BSA enforces), `concepts/lover-clinic-architecture.md` (top-level system overview).
