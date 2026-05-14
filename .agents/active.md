---
updated_at: "2026-05-14 RULE-Q-INSTALLED — V66 enforcement chain shipped; Option C next chat"
status: "master=4a552c9 + Rule Q infra · prod=4a552c9 (DEPLOYED — but has 5+ Phase 29 bugs already fixed locally, awaits Option C deploy) · 9605 tests + 6 Playwright e2e · build clean · firestore rules v30"
branch: "master"
last_commit: "<pending Rule Q commit>"
tests: 9605
playwright_e2e: 6
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "4a552c9"
firestore_rules_version: 30
storage_rules_version: 2
---

# Active Context

## 🚨🚨🚨 RULE Q — REAL-ADVERSARIAL VERIFICATION (V66, 2026-05-14)

**THE LOUDEST RULE. READ BEFORE EVERY "VERIFIED" CLAIM.**

Mock tests = code-shape coverage ONLY, NOT verification. Admin SDK doc-level access = NOT verification.

**Before claiming "verified" / "shipped" / "done" / "complete" / "ready to deploy" for ANY user-visible code, satisfy ≥1:**
- L1 — Playwright real browser w/ real auth + real DOM + real Firestore
- L2 — Real client SDK w/ exact compound queries / listener subscriptions
- L3 — User walkthrough with written confirmation (LAST RESORT)

Self-check: REAL browser/client? + EXACT UI query? + ACTIVE break-attempt? + <5min/0bugs → retest? + screenshot+log proof?

Any "no" → DO NOT CLAIM. Re-verify at higher level.

Full skill: `~/.claude/skills/real-adversarial-verification/SKILL.md`
Full rule: `.claude/rules/01-iron-clad.md` Rule Q (top-of-file)
V-entry: V66 in `.claude/rules/00-session-start.md` + verbose in `v-log-archive.md`

---

## State

- master = `4a552c9` + Rule Q infrastructure (pending commit) · prod = `4a552c9` (DEPLOYED but has 5+ Phase 29 bugs already fixed locally)
- Phase 29 (Recall System) **DEPLOYED LIVE** but found **5+ user-visible bugs** post-deploy via user real-browser inspection — ALL FIXED LOCALLY, **NOT YET REDEPLOYED**
- Tests: 9605 vitest + 1 skipped + NEW **6 Playwright real-browser e2e** in `tests/e2e/phase-29-recall-adversarial.spec.js` (A1-A4 backend + F1-F2 frontend)
- Build clean
- Rule Q enforcement chain SHIPPED across 7 layers (user-level CLAUDE.md + project CLAUDE.md + 00-session-start.md + 01-iron-clad.md + V66 V-entry + verbose v-log-archive entry + user-memory feedback file)

## Phase 29 — 5+ critical bugs found POST-DEPLOY (real-browser inspection)

| Bug | Surface | Status |
|---|---|---|
| A. Customer picker missing in 2/4 launch paths | Backend "+ ตั้ง Recall ใหม่" + Frontend pill bottom button | **FIXED** (RecallCreateModal customer search + autoFocus useRef) |
| B. Auto-suggest never fires across all 4 entry points | RecallFromTreatmentModal | **FIXED** (be_products fetch + masterDataSuggestions populate) |
| C. Reschedule outcome semantic conflict (status=done + snoozedUntil) | recordRecallOutcome | **FIXED** (reschedule branch keeps pending) |
| D. No UI to mark closed-no-answer (3-strike resolution missing) | RecallOutcomeModal | **FIXED** (conditional 5th CLOSE_OPTION card) |
| E. noAnswerCount doesn't reset on non-no-answer outcomes | recordRecallOutcome | **FIXED** (counter reset on done/reschedule) |
| +. autoFocus on disabled input doesn't trigger | RecallCreateModal | **FIXED** (useRef + useEffect manual focus on disabled→enabled) |

**ALL FIXES VERIFIED via Playwright real browser** — `tests/e2e/phase-29-recall-adversarial.spec.js` 6/6 PASS.

## Why the original "8-layer test stack" lied

| # | Layer | Why it lied |
|---|---|---|
| 1 | vitest helpers 96 | Mocked Firestore → no index issues |
| 2 | vitest RTL 240+ | Mocked listeners → no real race |
| 3 | source-grep 35 | Locks code shape, not outcome (V21-class) |
| 4 | Rule I flow-simulate 15 | Mocked data |
| 5 | Multi-surface real-time 15 | Mocked listener responses |
| 6 | Adversarial property-based 39 | In-memory only |
| 7 | Admin SDK e2e 5 fixtures | `doc.set/get` BYPASSES composite indexes |
| 8 | Post-deploy probe (anon POST chat_conversations → HTTP 200) | Not a compound query |

The bug was in CLIENT-SDK compound queries with `where + orderBy`. NONE of the 8 layers exercised that path.

## Next action — OPTION C (next chat)

Per user directive *"แล้ว session end จะไป option C ต่อแชทถัดไป"*:

1. Continue ADVERSARIAL bug hunt via Playwright real browser
2. Create TEST-RECALL-* fixtures (V33-class prefix discipline) to safely exercise Bug C/D/E end-to-end on real prod data
3. Add Playwright tests for:
   - C: reschedule outcome → recall stays pending + new dueDate set
   - D: closed-no-answer 5th option appears after 3 no-answer rounds
   - E: noAnswerCount resets correctly on non-no-answer outcomes
4. Run full Playwright suite + visual regression on 3 surfaces (RecallTab + RecallFrontendView + CDV RecallCard)
5. If clean → request explicit "deploy" verb → combined Vercel + Firebase deploy (Probe-Deploy-Probe + post-deploy real-client-SDK compound query probe)

## Anti-flicker discipline (architectural backstop — UNCHANGED)

Per spec §14: "If admin reports 'list flickers when X happens', the bug is class-of-bug 'key instability' or 'useEffect dep churn' — investigate listener setup + memo deps before component logic."

SG3 + SG4 + Layer 5 (MS1-MS11) tests must NEVER be relaxed without understanding consequences.

## Rule Q enforcement chain (7 layers — DON'T REMOVE ANY)

1. `~/.claude/CLAUDE.md` — mandatory boot chain
2. `F:\LoverClinic-app\CLAUDE.md` — project banner
3. `F:\LoverClinic-app\.claude\rules\00-session-start.md` — Step 0 boot + V66 in §2
4. `F:\LoverClinic-app\.claude\rules\01-iron-clad.md` — Rule Q top-of-file
5. `F:\LoverClinic-app\.claude\rules\v-log-archive.md` — verbose V66 entry
6. `~/.claude/skills/real-adversarial-verification/SKILL.md` — invocable skill
7. `~/.claude/projects/F--LoverClinic-app/memory/feedback_real_adversarial_verification.md` — user-memory mirror
