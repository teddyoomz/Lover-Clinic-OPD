---
name: skill-autoinstall
description: Find + install a public skill, MCP server, or tool to fill a capability gap — autonomously when the gap is safe, with user gate for anything paid / external-write / unfamiliar source. Covers 4 install paths — Anthropic bundled skills (already loaded), deferred tools (ToolSearch), MCP registry (mcp__mcp-registry), and public skill repos (git clone into ~/.claude/skills/). Invoke when /research-gap RG6 indicates "capability missing, install required".
---

# /skill-autoinstall

**Input**: the capability gap — what you need to do ("extract tables from
PDF", "query a Postgres DB", "upload to S3").

**Output**: an install plan with a chosen source + command + safety
review. Then execute if SA5 passes, or ask user if SA6 fires.

**This skill DOES execute low-risk installs** (built-in Anthropic skills,
deferred-tool loads) because those are zero-risk and Rule G authorizes
them. It asks for user confirmation on anything that writes shared state
or touches an external registry.

---

## SA1 — Gap classification

Classify the capability gap:

| Class | Example |
|---|---|
| **Built-in Claude Code tool** | file read, bash, grep, glob |
| **Deferred Claude Code tool** | WebFetch, NotebookEdit, computer-use, Chrome MCP |
| **Anthropic-bundled skill** | pdf, docx, xlsx, pptx, skill-creator, schedule |
| **MCP server** (public registry) | Slack, GitHub, Notion, Linear, any OAuth-able service |
| **Community skill** | GitHub-hosted skill repo |
| **Project-specific** | needs to be built, not installed → use `/skill-creator` |

Classification determines which of SA2–SA5 applies.

## SA2 — Path 1: Anthropic-bundled skills (zero install)

Check the system-prompt available-skills list for `anthropic-skills:*`
entries. Common ones:

| Need | Skill |
|---|---|
| Read/write PDF | `anthropic-skills:pdf` |
| Read/write Word docs | `anthropic-skills:docx` |
| Read/write Excel | `anthropic-skills:xlsx` |
| Read/write PowerPoint | `anthropic-skills:pptx` |
| Create new skill from scratch | `anthropic-skills:skill-creator` |
| Compact memory files | `anthropic-skills:consolidate-memory` |
| Cron-like scheduled task | `anthropic-skills:schedule` |
| Install matching skill bundle | `anthropic-skills:setup-cowork` |

**If the need matches one listed:** use `Skill(skill:"anthropic-skills:X")`
directly. No install needed.

## SA3 — Path 2: Deferred Claude Code tools (one-step load)

Deferred tools live in the system-reminder; their schemas aren't loaded
until requested. Common categories:

| Task family | ToolSearch query |
|---|---|
| Web research | `query:"web" max_results:5` → WebFetch, WebSearch |
| Scheduling | `query:"schedule" max_results:10` |
| Browser automation | `query:"Claude_in_Chrome" max_results:30` |
| Desktop automation | `query:"computer-use" max_results:30` |
| Notebook edit | `select:NotebookEdit` |
| Todo list | `select:TodoWrite` |
| MCP registry | `select:mcp__mcp-registry__list_connectors` |

**If need matches:** `ToolSearch query:"<keywords>" max_results:<N>`.
Bulk-load over select-by-one (see capability-scout CS3).

## SA4 — Path 3: MCP server from public registry

For capabilities that need an external service (Slack, GitHub, Notion,
etc.), check the MCP registry:

```
# Load the registry tool first if deferred
ToolSearch query:"select:mcp__mcp-registry__list_connectors"

# List available connectors matching the need
mcp__mcp-registry__list_connectors
# or if a search variant is available
mcp__mcp-registry__search_mcp_registry query:"<keyword>"
```

**Evaluate the candidate** before recommending install:
- **Official vendor** (e.g. Slack's own MCP) > community
- **Star count / activity** — prefer maintained
- **Permission surface** — what does it read/write?
- **Auth flow** — OAuth vs. API key vs. no-auth
- **Install side-effects** — does it store tokens? where?

**Install requires user consent** because MCPs almost always touch shared
state (user's Slack workspace, GitHub org, etc.). Return the install
plan with auth scopes explicit — do NOT auto-install.

## SA5 — Path 4: Community skill (git clone or copy)

For general-purpose workflows someone has packaged as a skill:

```
# Search GitHub via WebSearch
WebSearch query:"site:github.com claude skill <keyword> SKILL.md"

# Evaluate the hit (same filters as SA4)
# Then install at user scope (reusable across projects):
git clone <repo-url> /tmp/skill-candidate
# Review the SKILL.md for safety
# If approved:
cp -r /tmp/skill-candidate/<name> ~/.claude/skills/<name>
```

**Safety review before copy:**
- Does SKILL.md have numbered invariants? (Quality signal)
- Does it execute any code on invocation? (Higher-risk)
- Does it cite sources / show evidence? (Credibility)
- Is it a recent fork/mirror with no history? (Supply-chain risk)

**Install with user consent only** if the skill runs code (`Bash`
commands, shell scripts). Pure-reporting skills (grep + print) can be
auto-installed under Rule G (they're analyze-only).

## SA6 — User-consent gate

**ALWAYS ask user before:**
- Installing an MCP that requires OAuth (delegating your account)
- Installing a community skill that calls Bash with network access
- Installing anything that adds a paid-API dependency
- Installing to the user's home directory if they haven't opted in to
  user-scope skills

**Never ask for:**
- Loading deferred Claude Code tools (Rule G)
- Invoking an already-installed skill (Rule G)
- Using an Anthropic-bundled skill (pre-authorized)

Template for user consent:
```
Need capability: <X>
Recommended source: <Y>
Install command: <Z>
Permissions it gets: <list>
Reversal if wrong: <how to uninstall>
Proceed? (yes / try different source / skip)
```

## SA7 — Post-install verification

After any install:
1. **Invoke once with a safe no-op** (read-only) to verify it loaded
2. **Grep `.claude/settings.json`** (or equivalent) for the new
   registration
3. **Document in `docs/installed-capabilities.md`** — what, why, when,
   source URL
4. **Add to V-log if the install replaced a guess** — PRE-SHIP entry:
   "Would have hallucinated X; installed Y instead"

If verification fails → uninstall cleanly. Don't leave a half-installed
skill that'll cause confusion later.

---

## Decision flow

```
Gap detected
    │
    ▼
[SA1] Classify
    │
    ├── Built-in? ─────────── Use directly (zero install)
    │
    ├── Deferred Claude tool?  Rule G auto-allows ──► SA3 ToolSearch
    │
    ├── Anthropic-bundled?     pre-authorized ──────► SA2 Skill tool
    │
    ├── MCP server?            user consent ────────► SA4 registry
    │
    ├── Community skill?       review + consent ────► SA5 git clone
    │
    └── Nothing exists?        use /skill-creator to build
```

---

## Invocation examples

### Example 1 — PDF extraction (zero install)

```
/skill-autoinstall "extract tables from a PDF document"
→ SA2 match: anthropic-skills:pdf is pre-bundled
→ Return: "No install needed. Use Skill(skill:'anthropic-skills:pdf')."
```

### Example 2 — Web research (deferred-tool load)

```
/skill-autoinstall "fetch and summarize a blog post"
→ SA3 match: WebFetch is deferred
→ Return: "Auto-load via ToolSearch query:'web' max_results:5. 
  Rule G authorizes. Executing now."
→ Execute ToolSearch, then WebFetch in the next turn.
```

### Example 3 — Slack integration (user consent required)

```
/skill-autoinstall "send a message to a Slack channel"
→ SA4 match: Slack MCP in registry
→ Return: "User consent required. Install plan:
   Source: Official Slack MCP (github.com/slack/claude-mcp, 1200★)
   Install: configure in ~/.claude/settings.json with OAuth scope: chat:write
   Permissions: post to any channel user authorizes
   Reversal: remove from settings.json, revoke OAuth in Slack admin
   Proceed?"
```

### Example 4 — Unknown community skill (review + consent)

```
/skill-autoinstall "generate OpenAPI specs from code comments"
→ SA5 match: found github.com/someone/openapi-claude-skill (30★)
→ Safety review: SKILL.md has numbered invariants (good), runs node 
  script (risk), no history before last month (supply-chain flag)
→ Return: "User consent required, FLAG: recent repo, runs node script. 
  Recommend: review source first, test in sandbox project, then copy to 
  ~/.claude/skills/ if OK. Or: use /skill-creator to build safer 
  in-project version."
```

### Example 5 — Build from scratch

```
/skill-autoinstall "enforce our company's specific lint rules as an audit"
→ SA1 classifies as project-specific → no public install fits
→ Return: "Build in-project. Use Skill(skill:'anthropic-skills:skill-creator')
  or copy .claude/skills/_template/SKILL.md → fill in invariants 
  (reference audit-anti-vibe-code as example)."
```

---

## Report format

```
### /skill-autoinstall — "<capability gap>"

Classification: <built-in | deferred | anthropic-bundled | MCP | community | build>
Recommended source: <specific skill/tool/repo>
Install cost: <zero | auto-load | user-consent-required>
Auth scope: <none | OAuth X | API key>
Install command: <literal command>
Reversal: <how to uninstall>
Next action: <Execute | Ask user | Skip>
```

---

## How to grow this skill

- **New registry discovered** → add SA8 with its query pattern
- **Common pattern of "install X via path Y"** repeated 3+ times → add
  a canned example to the matching SA section
- **Install blew up** (broke auth, corrupted settings) → add a V-entry
  + extend SA7 verification

**Anti-pattern to catch (SA-AP):** installing speculatively ("might be
useful later"). Only install when a real gap triggers. Speculative
installs accumulate settings cruft and increase attack surface.

## Integration

- **Rule G.3 (Research before guessing)** uses `/research-gap` → which
  delegates here when Tier 5 (registry/skill) is the answer
- **`/capability-scout`** Tier 5 now points here for install paths
- **V-log correlation:** every successful install that prevented a
  hallucination = PRE-SHIP V-entry. After 3 such prevents in the same
  category, consider making that skill a default in `install.sh`.
