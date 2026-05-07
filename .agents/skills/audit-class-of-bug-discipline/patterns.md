# patterns.md — concrete CB-1..CB-5 grep recipes

Each invariant has a Bash recipe (`git grep` works identically on Windows + Linux + macOS). The Vitest bank in `tests/audit-class-of-bug-discipline.test.js` automates all 5 + a meta block; the recipes below are for interactive investigation.

---

## CB-1 — Every V42+ V-entry maps to an AVxx (or sanctioned exception)

**Description**: Each V-entry in `00-session-start.md § 2` from V42 onward must cite an AVxx invariant in its body OR be documented in the CB-5 sanctioned exception catalog.

### Bash

```bash
# CB-1: extract V-entries V42 onward from compact section
grep -E "^\| V[4-9][0-9]" .claude/rules/00-session-start.md \
  | awk -F'|' '{print $2, $4}' \
  | sort -u
```

```bash
# CB-1: cross-check AV20-AV28 baseline mapping
grep -E "^### AV2[0-8] " .agents/skills/audit-anti-vibe-code/SKILL.md \
  | sort -u
```

```bash
# CB-1: full sweep — for each V42+ V-entry verbose body, check it cites AVxx OR is in CB-5 catalog
for v in V42 V43 V44 V45 V46 V47 V48 V49 V50; do
  echo "--- $v ---"
  grep -E "AV[0-9]+" .claude/rules/00-session-start.md \
    | grep -E "$v\b" \
    | head -3
done
```

### Expected output

Each row in the V-entry table column $4 (Pattern) cites an AVxx — verified against the post-V50 baseline mapping table in SKILL.md.

If a V-entry's body has NO AVxx citation AND no CB-5 catalog entry → **CB-1 violation**.

### Fix recipe

1. Identify the broken pattern at the V-entry's root cause
2. Add an AVxx entry in `.agents/skills/audit-anti-vibe-code/SKILL.md` (or extend an existing AVxx)
3. Update the V-entry compact row in `00-session-start.md § 2` to cite the AVxx
4. Update the V-entry verbose body in `v-log-archive.md` to include "Audit invariant: AVxx"
5. Update the post-V50 baseline mapping table in this skill's SKILL.md
6. Add a regression test (CB-2) AND classifier (CB-3) for the new AVxx

---

## CB-2 — Every AVxx has a regression test file in `tests/`

**Description**: For each AVxx invariant, the AV body must cite a `tests/<name>.test.js` file that exists and contains the AVxx grep (not a stub).

### Bash

```bash
# CB-2: extract AV entries + their cited test files
grep -E "^### AV[0-9]+ " .agents/skills/audit-anti-vibe-code/SKILL.md \
  | sed -E 's/^### (AV[0-9]+) .*/\1/'
```

```bash
# CB-2: for each AV with a "Source-grep regression test pattern" subsection,
# verify the cited test file exists
grep -B0 -A30 "Source-grep regression test pattern" .agents/skills/audit-anti-vibe-code/SKILL.md \
  | grep -E "tests/v[0-9]+-.*\.test\.js" \
  | sort -u \
  | while IFS= read -r path; do
      [ -f "$path" ] && echo "OK $path" || echo "MISSING $path"
    done
```

```bash
# CB-2: verify regression test file actually contains AVxx grep
for f in tests/v44-*.test.js tests/v45-*.test.js tests/v46-*.test.js tests/v47-*.test.js tests/v48-*.test.js tests/v49-*.test.js tests/v50-*.test.js tests/staff-doctor-hide-consumer-sweep.test.js; do
  [ -f "$f" ] || continue
  grep -lE "(AV[0-9]+|V[4-9][0-9])" "$f" || echo "WARN: $f has no AV/V marker"
done
```

### Expected output

Every AV20-AV28 has a `tests/...test.js` file that exists AND contains the AVxx grep.

### Fix recipe

1. Identify the missing test file path from the AV body
2. Create a new test file mirror `tests/audit-anti-vibe-code.test.js` shape (source-grep + assertion + CB-3 classifier section)
3. Add `// AVxx — <description>` marker in the test file head comment
4. Verify GREEN before commit

---

## CB-3 — Every class-of-bug expansion has a classifier doc/test

**Description**: For each AVxx (V41+), there must be a classifier section listing all instances (fixed + sanctioned + ongoing-monitoring). Inline (≤3 instances) or separate `.md` file (>3).

### Bash

```bash
# CB-3: find CAT-style classifier blocks in regression tests
grep -lE "CAT[0-9]+|classifier inline" tests/v[4-5][0-9]-*.test.js tests/staff-doctor-*.test.js 2>/dev/null
```

```bash
# CB-3: for each AV (V41+), verify a classifier exists in cited test
for av in AV20 AV21 AV22 AV23 AV24 AV25 AV26 AV27 AV28; do
  echo "--- $av ---"
  # Find AV's regression test file from SKILL.md
  testfile=$(grep -B0 -A60 "^### $av " .agents/skills/audit-anti-vibe-code/SKILL.md \
    | grep -oE "tests/[a-zA-Z0-9_-]+\.test\.js" | head -1)
  if [ -n "$testfile" ] && [ -f "$testfile" ]; then
    grep -E "(CAT|classifier|describe)" "$testfile" | head -5
  fi
done
```

```bash
# CB-3: verify classifier enumerates fixed/sanctioned/ongoing categories
grep -nE "(VICTIM_FILES|SANCTIONED|FIXED|sanctioned exception)" \
  tests/v49-canonical-shape-multi-reader-sweep.test.js \
  tests/v48-prof-grade-class-of-bug-coverage.test.js \
  tests/staff-doctor-hide-consumer-sweep.test.js 2>/dev/null
```

### Expected output

Every AV20-AV28 cites a test file with either:
- A `CAT[0-9]` classifier block (V49 CAT8 style — universal classifier)
- An inline enumeration with `// classifier inline` annotation
- A separate `docs/classifier-<av>.md` reference

### Fix recipe

1. Identify the AV's regression test file
2. Add a `CAT[N]` describe block (or inline if ≤3 instances) enumerating:
   - **Fixed instances** — files where the broken pattern was repaired
   - **Sanctioned exceptions** — files with annotation comments documenting why the broken pattern is OK there
   - **Ongoing-monitoring sites** — legitimate uses that future commits should preserve

---

## CB-4 — Every architectural class has iron-clad rule + V-entry + verbose archive

**Description**: For every iron-clad rule letter (A-O at start of 2026-05-08; A-P after Rule P landed), verify (a) compact entry in `00-session-start.md § 1`, (b) full body in `01-iron-clad.md`, (c) at least one V-entry citation, (d) verbose archive in `v-log-archive.md` (or descriptive-only carve-out).

### Bash

```bash
# CB-4: extract all iron-clad rule letters from § 1 compact list
grep -E "^- \*\*[A-Z](-[a-z]+)?\.\s" .claude/rules/00-session-start.md \
  | sed -E 's/^- \*\*([A-Z](-[a-z]+)?)\..*/\1/' \
  | sort -u
```

```bash
# CB-4: cross-check that every letter has a body in 01-iron-clad.md
for letter in A B C D E F G H I J K L M N O P; do
  if grep -qE "^### (Rule )?$letter\b|^## \*\*$letter\." .claude/rules/01-iron-clad.md \
     || grep -qE "^- \*\*$letter\." .claude/rules/00-session-start.md; then
    echo "OK Rule $letter"
  else
    echo "WARN Rule $letter — no body found in 01-iron-clad.md"
  fi
done
```

```bash
# CB-4: verbose archive presence in v-log-archive.md
grep -cE "^### V[0-9]+" .claude/rules/v-log-archive.md
```

```bash
# CB-4: V-entry citing each architectural rule
grep -E "Rule [A-P]\b" .claude/rules/00-session-start.md | head -10
```

### Expected output

Every iron-clad rule A-P has:
- Compact entry in 00-session-start.md § 1
- Full body in 01-iron-clad.md (or referenced from 00-session-start §1 with full body inline)
- At least one V-entry in 00-session-start.md § 2 cites the rule (architectural pattern proven by saga)
- Verbose archive entry in v-log-archive.md (or sanctioned `policy-rule` exception in CB-5 catalog — e.g. Rule D)

### Fix recipe

1. Identify the missing piece (a/b/c/d)
2. For (a): add compact bullet to 00-session-start.md § 1 with date + saga reference
3. For (b): add full rule body to 01-iron-clad.md with workflow + anti-patterns + audit hook
4. For (c): if no V-entry exists, the rule may be policy-only — add to CB-5 catalog with rationale
5. For (d): add verbose entry to v-log-archive.md with full bug history + lessons

---

## CB-5 — Sanctioned exception catalog maintained

**Description**: The catalog in `audit-class-of-bug-discipline/SKILL.md` "Sanctioned exception catalog" section must have an entry for every CB-1..CB-4 expected miss with WHICH/WHY/REVIEW-DATE fields.

### Bash

```bash
# CB-5: extract catalog rows
grep -E "^\| (AV[0-9]+|V[4-9][0-9]|Rule [A-P]) \| CB-[1-5]" \
  .agents/skills/audit-class-of-bug-discipline/SKILL.md
```

```bash
# CB-5: verify each catalog row has WHICH (skipped invariant) + WHY + REVIEW DATE
grep -E "^\| .+ \| CB-[1-5][^|]*\| .+ \| [0-9]{4}-[0-9]{2}-[0-9]{2}" \
  .agents/skills/audit-class-of-bug-discipline/SKILL.md \
  | wc -l
```

```bash
# CB-5: cross-check catalog covers AV1-AV19 + V42 + Rule D
expected_count=21
actual=$(grep -cE "^\| (AV[0-9]+|V42|Rule D) \| CB-[1-5]" \
  .agents/skills/audit-class-of-bug-discipline/SKILL.md)
echo "expected $expected_count; got $actual"
```

### Expected output

Catalog has rows for:
- AV1-AV19 (19 pre-saga AV invariants)
- V42 (folded into AV21-AV23 cluster — no own AV)
- Rule D (policy-rule, no triggering V)

Total: 21 sanctioned exceptions.

### Fix recipe

1. If catalog is missing an expected entry, add a row with:
   - **WHICH** invariant skipped (CB-1 / CB-2 / CB-3 / CB-4)
   - **WHY** 1-line rationale (e.g. "Pre-saga descriptive guidance — no triggering V-entry")
   - **REVIEW DATE** typically 6 months out (e.g. `2026-11-08`)
2. On review date, re-check rationale — extend if still valid; remove + fix if no longer holds

---

## Run all 5 + meta in one shot

```bash
npm test -- --run tests/audit-class-of-bug-discipline.test.js
```

Expected: ~18-22 tests across 6 describe blocks (CB-1, CB-2, CB-3, CB-4, CB-5, CB-meta) all GREEN.

---

## Investigation tips

| Symptom | Likely violator |
|---|---|
| New V-entry has no AVxx | CB-1 — add AVxx invariant + regression test + classifier |
| AVxx test file missing or stub | CB-2 — write the regression test (mirror existing `tests/v*.test.js` shape) |
| "Expansion done" claim with no enumeration | CB-3 — add CAT classifier to the regression test |
| Saga returns despite earlier "fix" | CB-4 — escalate to iron-clad rule + V-entry; the pattern was architectural |
| Audit becomes "well, that one's fine" | CB-5 — every miss must be in catalog with rationale OR fix it |

## Cross-references

- Rule P body: `.claude/rules/01-iron-clad.md` "Rule P"
- AVxx invariants: `.agents/skills/audit-anti-vibe-code/SKILL.md`
- V-entry catalog: `.claude/rules/00-session-start.md § 2` (compact) + `v-log-archive.md` (verbose)
- Companion audits: `/audit-anti-vibe-code` (the AVxx repository this audit cross-checks against)
- Companion skills (user-level): `systematic-debugging` Phase 2 Step 5 (cross-file grep) + Phase 4 Sub-step 6 (Tier 2 artifacts gate); `verification-before-completion` Rule P gate
