<important if="every non-trivial change; before ending any multi-edit session">
## Continuous Self-Improvement (iron-clad, set 2026-04-19)

**ยิ่งทำงาน ยิ่งเรียนรู้ ยิ่งเก่งขึ้น** — every session must leave the toolkit
sharper than it was at the start. Not optional.

### When a bug is found
1. **Fix the bug** (normal flow).
2. **Add a test** that would have caught it (iron-clad rule — test-equal-to-code).
3. **Check existing audit skills in `.claude/skills/audit-*`** — did any catch this class of bug? If yes, update its invariants if thin. If no, **create a new audit skill** with numbered invariants + grep patterns + priority tier.
4. **Update `audit-all`** to include the new skill + adjust the total invariant count.

### When a new pattern / convention emerges
1. **Document it** in `CLAUDE.md` or `.claude/rules/`.
2. **Create a skill** that checks it if it's auditable (pattern has a greppable signal).
3. **Add a feedback memory** at `~/.claude/projects/F--LoverClinic-app/memory/feedback_*.md` so it survives session resets.

### When a tool would have prevented the bug
1. **Propose the tool** (lint plugin, bundle analyzer, dead-code detector, MCP server) with scope and cost.
2. **Install the low-risk cheap wins immediately** (dev-dependency + config flag).
3. **Flag big-risk ones for user review** before install.

### Before ending any multi-edit session
1. Summarize what was learned — fixed bugs, new patterns, new skills/tools added.
2. Verify the new skills appear in the skill registry (system-reminder lists them).
3. Commit + push the `.claude/skills/**` + `.claude/rules/**` changes in the same workflow as the code.

### Anti-patterns
- Fixing the bug but leaving the class of bug uncaught → guarantees regression.
- Writing "nice to have" skills without wiring them into `audit-all` → they rust.
- Creating a new skill without grep patterns / invariant numbers → it's documentation, not an audit.

### Meta-rule
**This rule itself improves.** If a better way to learn/audit emerges, edit
THIS file + the matching feedback memory. Don't accumulate parallel copies.
</important>
