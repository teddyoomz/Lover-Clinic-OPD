---
name: backend-commit
description: Commit backend changes (no deploy). Runs npm test first, updates CODEBASE_MAP.md, then commits.
user-invocable: true
argument-hint: "[commit message]"
---

# Backend Commit Workflow

Backend files (src/components/backend/, BackendDashboard.jsx, TreatmentFormPage.jsx) must NOT be deployed to Vercel. This command ensures the correct workflow.

## Steps (follow exactly):

1. **Run tests**: `npm test` — ALL must pass. If any fail, fix them first.
2. **Update CODEBASE_MAP.md**: If any backend files were changed, update the relevant sections.
3. **Stage files**: `git add` the changed files (NEVER use `git add -A`).
4. **Commit**: Use the provided message or generate one. Include `Co-Authored-By`.
5. **DO NOT deploy**: No `npm run build`, no `vercel --prod`. Backend = commit only.

## Argument
If the user provides $ARGUMENTS, use it as the commit message. Otherwise, generate an appropriate one.
