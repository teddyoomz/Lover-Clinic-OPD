---
name: skill-relevant
description: Given a file path, directory, or task description, return the audit/workflow skills most likely to apply. Reduces "which audit should I run?" from "remember all 15" to "ask the tool." Use before editing an unfamiliar area, before a commit, or during a pre-release audit-all sweep.
---

# /skill-relevant

**Input**: a file path, directory, OR a one-line task description.
**Output**: ranked list of skills with confidence score + why it matches.

**This skill does NOT run the recommended skills.** It suggests. The
caller invokes.

## SR1 — Exact file-path match

Match against declared file-path patterns in each skill's description:

```bash
path_to_match="$1"  # e.g. "src/components/backend/MasterDataTab.jsx"

for skill_file in .claude/skills/*/SKILL.md; do
  # Read the description frontmatter
  desc=$(awk '/^description:/{flag=1; sub(/^description: */, ""); print; next} flag && /^[a-z]+:/{flag=0} flag{print}' "$skill_file")

  # Does the skill description reference the file path pattern?
  # (Skills should declare file patterns in their descriptions for discoverability.)
  case "$path_to_match" in
    *backend*)  grep -lE "backend|Backend" "$skill_file" ;;
    *api/*)     grep -lE "api/|router|endpoint" "$skill_file" ;;
    *.rules)    grep -lE "firestore.rules|rules file" "$skill_file" ;;
    *FormModal*|*Form.jsx) grep -lE "form|FormModal" "$skill_file" ;;
    *)          ;;
  esac
done
```

**Output**: skill names that matched a path keyword.

## SR2 — File-extension match

Different extensions trigger different skills:

| Extension | Likely skills |
|---|---|
| `.js`, `.ts`, `.jsx`, `.tsx` | audit-anti-vibe-code, audit-rule-of-3, audit-react-patterns (if React) |
| `.rules`, `firestore.rules` | audit-firestore-correctness, run Probe-Deploy-Probe |
| `.env`, `.env.*` | audit-anti-vibe-code (AV3 — secret leaks) |
| `Dockerfile`, `*.yaml` (CI) | audit-anti-vibe-code (AV3), audit-rules |
| `*.test.js`, `*.spec.ts` | audit-anti-vibe-code (AV8 — adversarial coverage) |
| `.md` in `.claude/rules/` | audit-rules |
| `package.json` | audit-anti-vibe-code (AV3 — secrets in scripts), Rule of 3 |

## SR3 — Directory-based match

| Directory | Likely skills |
|---|---|
| `src/components/**` | audit-rule-of-3 (R4 — modal/form chrome), audit-react-patterns |
| `src/lib/**` | audit-anti-vibe-code, audit-rule-of-3 |
| `src/components/backend/**` | [FILL-IN: your data-boundary audit, e.g. audit-backend-firestore-only] |
| `api/**` | audit-rule-of-3 (R5 — handler shape), audit-anti-vibe-code (AV3 — secrets) |
| `tests/**` | audit-anti-vibe-code (AV8 — adversarial test coverage) |
| `.claude/rules/**` | audit-rules |
| `.claude/skills/**` | audit-rules (indirectly — skill quality) |

## SR4 — Task-keyword match

For task descriptions, extract keywords and match:

| Keyword | Skill |
|---|---|
| "deploy", "firebase deploy", "vercel --prod" | Check Rule B (Probe-Deploy-Probe), run audit-rules first |
| "add new collection", "firestore schema" | audit-anti-vibe-code (AV6, AV7 — orphan / premature) |
| "new API endpoint", "add route" | audit-rule-of-3 (R5), Triangle Rule artifact required |
| "refactor", "extract helper" | audit-rule-of-3 (R1-R3) |
| "fix bug", "investigate" | /violation-log (after fix), audit-anti-vibe-code |
| "optimize", "performance" | audit-performance (if exists), audit-react-patterns |
| "review before commit" | /audit-all |
| "release", "ship", "pre-release" | /audit-all + /audit-health + /audit-rules |
| "session start", "new chat" | /session-start |
| "session end", "wrap up" | /session-end |

## SR5 — Recent-commit match

If user is editing after a specific commit type, suggest matching skill:

```bash
last_commit=$(git log -1 --format=%s 2>/dev/null)
case "$last_commit" in
  "fix("*)     echo "Suggest: /violation-log (if bug was real), audit for recurrence class" ;;
  "feat("*)    echo "Suggest: /audit-rule-of-3 (new code often duplicates); Triangle Rule check" ;;
  "refactor("*) echo "Suggest: /audit-rule-of-3, /audit-rules" ;;
  "perf("*)    echo "Suggest: audit-performance (if exists), audit-react-patterns" ;;
  "docs("*)    echo "Suggest: /audit-rules if the docs were rules" ;;
  "chore("*)   echo "Lower priority — audit-anti-vibe-code if touching src" ;;
esac
```

## SR6 — Confidence score

For each matched skill, compute confidence:

```
High    (exact match on 2+ dimensions: path + extension + keyword)
Medium  (match on 1 primary dimension)
Low     (weak keyword match only)
```

Report high first, then medium. Skip low unless user asks for full list.

## SR7 — Default fallback

If no match → suggest the meta-skills that always apply:

- `/audit-rules` — if the edit touched `.claude/rules/`
- `/audit-anti-vibe-code` — for any substantive source edit
- `/violation-log` — if the edit was a bug fix
- `/audit-health` — for periodic check-ins

---

## Invocation examples

### Example 1 — given a backend file

```
/skill-relevant "src/components/backend/SaleTab.jsx"
```

→
- **High**: [YOUR-DATA-BOUNDARY-AUDIT] (backend directory pattern)
- **High**: audit-rule-of-3 (R4 — modal chrome duplication)
- **High**: audit-react-patterns (React component)
- **Medium**: audit-anti-vibe-code (general source hygiene)

### Example 2 — given a task

```
/skill-relevant "add a new Firestore collection for audit logs"
```

→
- **High**: audit-anti-vibe-code (AV6 orphan — does it have a reader?,
  AV7 premature `*_log`)
- **Medium**: audit-rule-of-3 (new query pattern)
- **Low**: audit-rules (if this affects a rule file)

### Example 3 — given an abstract task

```
/skill-relevant "pre-release check"
```

→
- **High**: /audit-all (wraps all tier-1 audits)
- **High**: /audit-health (methodology adoption snapshot)
- **High**: /audit-rules (meta-quality check)

---

## Report format

```
### /skill-relevant — input: "<path or task>"

🎯 High confidence (exact multi-dimension match)
  [skill-name] — why: "backend directory + data-layer rule"

🟡 Medium confidence (single-dimension match)
  [skill-name] — why: "general React hygiene applies to any .jsx file"

⚪ Default fallback
  [skill-name] — why: "meta-audit applies to any substantive edit"
```

---

## How to grow this skill

When a new skill is added to the project, add its discovery rules here
(which path patterns, which keywords, which commit types → match it).

**Anti-pattern to catch:** skill is created but `/skill-relevant`
doesn't know how to surface it → skill becomes invisible = wasted work.

## Integration

Invoke before every substantial edit. Pair with `/audit-health` in
quarterly reviews: "which skills haven't fired this quarter? Are they
still relevant?"
