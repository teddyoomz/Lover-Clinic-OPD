---
name: test-all
description: Run all test suites (Vitest unit + Playwright E2E) and report results.
user-invocable: true
argument-hint: "[vitest|e2e|all]"
---

# Run All Tests

Run the project's test suites and report results.

## Behavior based on $ARGUMENTS:
- **vitest** or **unit**: Run `npm test` only (Vitest unit + integration + RTL)
- **e2e** or **playwright**: Run `npm run test:e2e` only (Playwright E2E)
- **all** or empty: Run both `npm test` AND `npm run test:e2e`

## Steps:
1. Run the specified test suite(s)
2. Report: total tests, passed, failed
3. If any tests fail: show the failure details and suggest fixes
4. If all pass: report success with count

## Rules:
- Tests must ALL PASS before committing
- If tests fail, do NOT stop — fix and re-run until they pass
- Use the `vitest` skill for test-writing guidance
