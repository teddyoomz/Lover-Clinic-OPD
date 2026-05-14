# 2026-05-14 — Rule Q (V66) Installation — Real-Adversarial Verification Mandate

## Summary

Phase 29 (Recall System) shipped via combined Vercel + Firebase deploy with 8
layers of "tests pass" — then user found **5+ critical user-visible bugs in
<2 min via real-browser inspection**. Trust collapsed. User directive: lock the
lesson permanent across every project, every session, every chat. This session
SHIPPED **Rule Q "Real-Adversarial Verification"** as a 7-layer enforcement
chain — the LOUDEST rule in the project rule set, with mandatory L1 (Playwright
real browser) / L2 (real client SDK with exact compound queries) / L3 (user
walkthrough) verification BEFORE any "verified" claim for user-visible code.

Mock tests = code-shape coverage ONLY. Admin SDK doc-level access = BYPASSES
composite indexes. Both demoted from "verification" to "supplemental". The 8-
layer lie is documented as V66 with verbose entry in v-log-archive.md.

## Current State

- master = `4124105` (V66 Rule Q infra) · prod = `4a552c9` (live but has 5+ Phase 29 bugs already fixed in master c404cb6 + 6c8b72d, awaits Option C deploy)
- Tests: 9605 vitest + 1 skipped + 6 Playwright real-browser e2e (`tests/e2e/phase-29-recall-adversarial.spec.js` 6/6 PASS)
- Build clean
- Rule Q 7-layer enforcement chain SHIPPED (project + user-level files)
- V66 V-entry logged: compact row in `00-session-start.md` § 2 + verbose entry in `v-log-archive.md`

## Commits this session

```
4124105 docs(V66/Rule Q): Real-Adversarial Verification — 7-layer enforcement chain SHIPPED
6c8b72d fix(Phase 29.21-fix2): autoFocus on customer search + UX wording + Playwright spec 6/6 PASS
c404cb6 fix(Phase 29.21-fix2): 5 critical UX bugs — customer picker + auto-suggest + outcome semantics
05710cb fix(Phase 29.21-fix1): UX safety net for index-building error + post-deploy smoke (V14-class gap closed)
0af351a docs(Phase 29.21): DEPLOYED — Phase 29 Recall System SHIPPED LIVE
```

## Files touched (Rule Q infrastructure — commit 4124105)

- `.claude/rules/01-iron-clad.md` — Rule Q at TOP-OF-FILE (every turn)
- `.claude/rules/00-session-start.md` — Step 0 boot + V66 row in § 2
- `.claude/rules/v-log-archive.md` — verbose V66 entry (136 lines, full lessons)
- `CLAUDE.md` — Rule Q top banner
- `SESSION_HANDOFF.md` — Rule Q banner section
- `.agents/active.md` — Rule Q pinned reminder + state update

Out-of-repo (user-level dirs):

- `~/.claude/CLAUDE.md` — mandatory boot chain entry
- `~/.claude/skills/real-adversarial-verification/SKILL.md` — NEW invocable skill
- `~/.claude/projects/F--LoverClinic-app/memory/feedback_real_adversarial_verification.md` — user-memory mirror
- `~/.claude/projects/F--LoverClinic-app/memory/MEMORY.md` — index entry

## Phase 29 bugs found POST-DEPLOY (the 5+ that triggered trust collapse)

| Bug | Surface | Status |
|---|---|---|
| A. Customer picker missing | Backend "+ ตั้ง Recall ใหม่" + Frontend pill | FIXED in c404cb6 |
| B. Auto-suggest never fires | RecallFromTreatmentModal | FIXED in c404cb6 |
| C. Reschedule outcome conflict | recordRecallOutcome | FIXED in c404cb6 |
| D. No closed-no-answer UI | RecallOutcomeModal | FIXED in c404cb6 |
| E. noAnswerCount no reset | recordRecallOutcome | FIXED in c404cb6 |
| +. autoFocus on disabled input | RecallCreateModal | FIXED in 6c8b72d |

ALL FIXES VERIFIED via Playwright 6/6 PASS — but production still has the bugs;
not redeployed (per user directive: Option C next chat).

## The 8-layer lie (V66 origin — see v-log-archive.md for full breakdown)

1. vitest helpers 96 PASS → mocked Firestore
2. vitest RTL 240+ PASS → mocked listeners
3. source-grep 35 PASS → locks code shape, not outcome
4. Rule I flow-simulate 15 PASS → mocked data
5. Multi-surface real-time 15 PASS → mocked listener responses
6. Adversarial property-based 39 PASS → in-memory only
7. Admin SDK e2e 5 fixtures PASS → BYPASSES composite indexes
8. Post-deploy probe HTTP 200 → anon HTTP POST one collection ≠ compound query

The bug was in CLIENT-SDK compound queries with `where + orderBy`. NONE of the
8 layers exercised that path.

## Key decisions

1. **3-level verification hierarchy** — L1 Playwright (PREFERRED) / L2 real client SDK (ACCEPTABLE) / L3 user walkthrough (LAST RESORT). Mock tests + admin SDK demoted to supplemental.
2. **7-layer enforcement chain** — redundant by design. If one layer fails, 6 remain. User explicitly asked for "ให้ครบให้หลอน 100%".
3. **NO deploy this commit** — Rule Q infrastructure ships LOCAL + COMMIT + PUSH only. Option C (continue adversarial bug hunt) in next chat, then deploy if clean.
4. **Source-grep tests demoted** — they verify code SHAPE, not OUTCOME. V21 lesson amplified by Phase 29's 8-layer uniform lie. Use as REGRESSION lock after L1/L2 confirms; never as primary verification.

## Next action (Option C — next chat)

Per user directive *"แล้ว session end จะไป option C ต่อแชทถัดไป"*:

1. Boot: `Skill(using-superpowers)` + `Skill(llm-wiki)` + `Skill(real-adversarial-verification)` (NEW mandatory)
2. Read SESSION_HANDOFF.md + .agents/active.md + this checkpoint
3. Continue ADVERSARIAL bug hunt via Playwright real browser
4. Create TEST-RECALL-* fixtures (V33-class prefix discipline) for safe real-prod testing
5. Add Playwright tests for Bug C/D/E end-to-end:
   - C: reschedule outcome → recall stays pending + new dueDate set
   - D: closed-no-answer 5th option appears after 3 no-answer rounds
   - E: noAnswerCount resets correctly on non-no-answer outcomes
6. Run full Playwright suite + visual regression on 3 surfaces
7. If clean → explicit "deploy" verb from user → combined Vercel + Firebase deploy + Probe-Deploy-Probe + post-deploy real-client-SDK compound query probe (NOT anon HTTP POST)

## Resume Prompt

Paste in next chat:

```
Resume LoverClinic — continue from 2026-05-14 EOD (Rule Q V66 installation).

Read in order BEFORE any tool call:
1. CLAUDE.md (Rule Q banner)
2. SESSION_HANDOFF.md (master=4124105, prod=4a552c9 with 5+ bugs)
3. .agents/active.md (9605 tests + 6 Playwright)
4. .claude/rules/00-session-start.md (V66 + iron-clad Rule Q)
5. .agents/sessions/2026-05-14-rule-q-v66-installation.md (this checkpoint)
6. .claude/rules/v-log-archive.md (verbose V66 — the 8-layer lie)

Status: master=4124105 (Rule Q infra shipped), 9605 vitest + 6 Playwright e2e GREEN
Prod=4a552c9 has 5+ Phase 29 bugs ALREADY FIXED in master — not yet redeployed

🚨 Rule Q is THE LOUDEST RULE — every "verified" claim MUST pass L1/L2/L3.

Next: Option C — adversarial bug hunt continuation:
- Create TEST-RECALL-* fixtures
- Playwright tests for Bug C/D/E end-to-end (reschedule semantic / close-no-answer 5th card / counter reset)
- If clean → request explicit "deploy" → combined deploy + post-deploy compound-query probe

Outstanding (user-triggered): explicit "deploy" verb for combined Vercel + Firebase
Rules: NO deploy without "deploy" THIS turn (V18); V15 combined; Rule B probe; Rule M data ops local + admin SDK; Rule Q L1/L2 verification before claiming verified

/session-start
```
