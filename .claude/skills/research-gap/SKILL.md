---
name: research-gap
description: Autonomous research when you detect you're about to guess. Triggers a structured 5-tier search (local code → project docs → official docs via WebFetch → WebSearch → MCP/skill registry) before invoking any tool that would write based on assumed knowledge. Prevents the "confident hallucination" failure mode. Invoke this when you catch yourself inventing a URL, method name, field shape, config key, library API, or system behavior without having verified it.
---

# /research-gap

**Input**: a one-line description of the knowledge gap ("I need to know X to do Y").
**Output**: a research report with verified facts + source citations, OR an
explicit "still unknown, need to ask user" if research exhausted.

**This skill does NOT execute the original task.** It researches. The caller
then acts on the research result.

## Why this exists

AI's #1 failure mode is **confident hallucination**: inventing a plausible-
looking URL / field / method / config and writing code that depends on it.
Code looks right. Tests pass (because they mock the invention). Production
fails.

Triangle Rule (`docs/triangle-rule.md`) says "capture before writing".
`/research-gap` operationalizes that — a structured search protocol the
agent runs autonomously when it catches itself guessing, before the guess
becomes code.

**Golden trigger:** if you notice yourself mentally completing a phrase
with "I think..." or "probably..." or "the standard way is..." — STOP.
Invoke this skill.

---

## RG1 — Gap detection (trigger the skill)

Invoke `/research-gap` when ANY of these fire:

- About to write a URL/endpoint you haven't verified exists
- About to use a library method/option you haven't read documented
- About to name a field/property the external system expects
- About to configure something based on "that's how it usually is"
- About to rely on a file/tool/MCP/skill you believe exists but haven't
  confirmed loaded
- About to assert a fact about the user's project ("the project uses X")
  without grepping
- User asks a how-to question and you're answering from general model
  knowledge without checking current docs

**Anti-pattern the trigger catches (RG1-AP):** AI writes the guess first,
then "verifies" by re-reading its own guess. That's confirmation bias,
not verification. Research MUST precede writing.

---

## RG2 — Tier 1: Local codebase (highest-trust source)

Before any external search, grep the local codebase. Someone may have
already solved this.

```bash
# Grep for the symbol / keyword
grep -rn "<keyword>" src/ api/ lib/ scripts/ tests/ docs/

# Look for existing helpers
find . -name "*.{js,ts,py,go,rs}" -path "*utils*" -o -path "*lib*" -o -path "*helpers*"

# Check project docs
find docs/ -name "*.md" | xargs grep -l "<keyword>"

# Check .claude/rules/
grep -rn "<keyword>" .claude/rules/
```

**If found:** use the existing solution. STOP. Do not continue to other
tiers.

**Why first:** local code is the highest-authority source because (a) it
already runs in this project, (b) it follows this project's conventions,
(c) no network needed.

## RG3 — Tier 2: Project docs + CLAUDE.md + V-log

The project's own documentation and violation catalog may answer directly.
The V-log (`.claude/rules/00-session-start.md`) may document a past
attempt at this exact problem.

Read, in order:
1. `CLAUDE.md` — the master index; often links to the relevant doc
2. `.claude/rules/00-session-start.md` — V-log for past pitfalls
3. `.claude/rules/03-stack.md` (or equivalent) — stack-specific gotchas
4. `docs/<relevant>.md` — any docs matched by keyword

**If found:** cite the doc section in your result. STOP.

**Why second:** project docs beat generic docs because they capture *this
project's* version + config + conventions.

## RG4 — Tier 3: Official external docs (verified source)

If the gap is about an external library / API / protocol, fetch the
official docs.

Tools in priority order:
1. `WebFetch` — if you know the exact doc URL (official site)
2. `WebSearch` — if you need to find the doc URL first
3. `Bash` — for `man <cmd>`, `<cmd> --help`, `npm docs <pkg>`

**Quality filter:**
- Official vendor docs (e.g. `nodejs.org`, `firebase.google.com`,
  `docs.python.org`) > SO answers > random blogs
- Check doc version matches installed version (`package.json` / `go.mod`
  / etc.)
- Beware **model-training-cutoff staleness**: if docs look older than
  your training data, cross-check WebSearch for recent changes

**Cite the source URL in your result.** Future sessions grep for the URL.

## RG5 — Tier 4: WebSearch for the specific failure/question

If Tiers 1-3 didn't resolve, the question is genuinely open. WebSearch
with precise phrasing.

**Query construction:**
- Include **version numbers** where relevant (`"firebase-admin v12"`)
- Quote exact error messages (`"ENOENT: no such file"`)
- Include the language/framework (`"React 19 useEffect stale closure"`)
- Avoid over-broad queries (`"how do I deploy"` returns junk)

**Source evaluation:**
- Prefer: GitHub issue threads, vendor blog posts, SO answers with high
  vote count AND recent edit
- Skip: SEO-farm blogs, content mills, out-of-date tutorials
- If multiple sources disagree: fetch the one closest to official (e.g.
  GitHub repo README) and side with that

## RG6 — Tier 5: Capability registries (for tool/skill gaps)

If the gap is "I need a tool/skill to do X and I don't have it":

1. **Deferred-tool list** (system-reminder) — search with `ToolSearch
   query:"<keyword>"`. Claude Code may already have the capability
   deferred; loading is free.
2. **MCP registry** — call `mcp__mcp-registry__list_connectors` (via
   ToolSearch first if deferred) to list public MCP servers. Evaluate by
   relevance + trust (official vendor > community with ≥ 50 stars).
3. **Anthropic skills bundle** — skills prefixed `anthropic-skills:*`
   (pdf, docx, xlsx, pptx, skill-creator, consolidate-memory, schedule,
   setup-cowork) ship with Claude Code; check the available-skills list.
4. **Community skills** — search `site:github.com claude skill <keyword>`
   via WebSearch.
5. **User-level skills** — if the same gap recurs across projects, this
   is a `/skill-autoinstall` candidate (see that skill). Install at
   `~/.claude/skills/` so every project inherits.

## RG7 — Synthesize + cite

Your output MUST have:
1. **Answer** (1-3 sentences — the verified fact)
2. **Source tier** (1 / 2 / 3 / 4 / 5)
3. **Source citation** (file path + line, doc URL, or skill name)
4. **Confidence** (High / Medium / Low)

Example:
```
Answer: Firestore REST PATCH without updateMask replaces the entire doc.
Source tier: 3 (official docs)
Source: https://firebase.google.com/docs/firestore/use-rest-api#update_a_document
Confidence: High
```

**Low confidence?** Say so. Ask the user or do a probe.

## RG8 — Escalate to user only if all 5 tiers fail

Before asking the user, you MUST have tried:
- Tier 1 grep (show what you grepped)
- Tier 2 doc-read (show what you read)
- Tier 3 official-docs fetch (show the URL)
- Tier 4 WebSearch (show the query)
- Tier 5 registry/skill search (show what you checked)

Then ask with context: "I couldn't find X via tiers 1-5 because Y. Can
you confirm Z?" — not just "what should I do?"

**Why this matters:** asking the user without researching first = lazy.
The user has less context than you do (they haven't been looking at the
code all session). Your research output helps them answer.

---

## The "admit ignorance" principle

The goal of this skill is to make **admitting ignorance cheap** and
**guessing expensive**.

In the default AI loop, admitting ignorance feels like failure so models
guess to stay "helpful". Guessing ships bugs that the V-log catalogs
forever. The trade:
- Cost of admitting ignorance + researching: ~30 seconds, zero bugs.
- Cost of guessing: 30 seconds to write, hours to debug, entry in V-log.

Research-gap flips the incentive — the skill gives you a scripted path
so you don't have to pretend you know.

---

## Integration with other rules

- **Rule F (Triangle Rule)**: research-gap IS the capture step. Use it
  before and during any feature that depends on external reference.
- **Rule G (Dynamic Capability)**: if research reveals a missing
  tool/skill, G authorizes loading/building it. Pair with
  `/capability-scout` for the decision tree, `/skill-autoinstall` for
  installing external ones.
- **Rule G.3 (Research before guessing)** — this skill is the
  implementation of G.3.
- **Rule D (Continuous Improvement)**: every time research-gap saves
  you from a bug, add a V-entry (PRE-SHIP marker) documenting the
  pattern. The more entries, the less frequently the agent guesses.

---

## Invocation examples

### Example 1 — guessing an API shape

```
agent: "I'll call PATCH /api/users/{id}?action=deactivate..."
(self-check: have I verified this endpoint exists?)
→ /research-gap "verify PATCH /api/users/{id}?action=deactivate endpoint"
→ RG2 grep api/: no such route → RG4 WebFetch project API docs → 
  endpoint is actually POST /api/users/{id}/deactivate
→ write the correct code
```

### Example 2 — library method

```
agent: "useEffect cleanup should return a function that..."
(self-check: do I remember or am I guessing?)
→ /research-gap "React useEffect cleanup function signature and timing"
→ RG4 WebFetch react.dev → return callback runs before next effect or 
  unmount → confirmed
→ write with high confidence
```

### Example 3 — unknown tool capability

```
agent: "I need to extract tables from a PDF"
→ /research-gap "extract tables from PDF"
→ RG6 skill registry → anthropic-skills:pdf exists → 
  use Skill(skill:"anthropic-skills:pdf") directly
→ no need to install anything
```

### Example 4 — nothing found, escalate

```
agent: "What retry-backoff policy should the webhook use?"
→ /research-gap: Tier 1 no code, Tier 2 no doc, Tier 3 no vendor spec
  (domain-specific decision), Tier 4 WebSearch general guidance, Tier 5
  no skill
→ Ask user: "Default to exponential 1s/2s/4s/8s with 4 retries? Your
  webhook's downstream has [X] SLA, so the retry budget should be [Y]."
```

---

## Report format

```
### /research-gap — "<gap question>"

Tier reached: <1-5>
Answer: <verified fact>
Source: <file:line | URL | skill name>
Confidence: <High | Medium | Low>

Searched:
- Tier 1 (local): <what was grepped + result>
- Tier 2 (project docs): <what was read + result>
- Tier 3 (official docs): <URL + result>  [if reached]
- Tier 4 (WebSearch): <query + top result>  [if reached]
- Tier 5 (registry): <what was checked + result>  [if reached]
```

---

## How to grow this skill

When a new research source becomes reliable (e.g. a new MCP registry, a
new vendor docs API), add RG9 with its query pattern. When a class of
"I guessed" V-entry lands, add a trigger example to RG1.

**Anti-pattern to catch:** agent uses research-gap as a delay tactic —
researches "just in case" when the answer is obvious from context. The
gap must be **real** (you would actually guess) not performative. Rule
G.2 tracks real gaps; invoking this skill when nothing's missing is
wasted context.

## Integration

Register in `CLAUDE.md` onboarding checklist: "when unsure, invoke
`/research-gap` before writing." Pair with `/capability-scout` (which
classifies) + `/skill-autoinstall` (which installs external tooling).
