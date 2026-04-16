---
name: full-deploy
description: Full deploy workflow for frontend changes. Test + commit + build + vercel --prod.
user-invocable: true
argument-hint: "[commit message]"
---

# Full Deploy Workflow

For frontend changes that need to go live on Vercel.

## Steps (follow exactly in order):

1. **Run tests**: `npm test` — ALL must pass. Fix any failures.
2. **Update CODEBASE_MAP.md**: If applicable.
3. **Stage files**: `git add` specific files (never `git add -A`).
4. **Commit**: Use $ARGUMENTS as message or generate one. Include `Co-Authored-By`.
5. **Build**: `npm run build` — must succeed with no errors.
6. **Deploy**: `vercel --prod` — wait for deployment URL.
7. **Report**: Show the deployment URL to the user.

## IMPORTANT
- NEVER deploy backend-only changes (src/components/backend/, BackendDashboard.jsx)
- NEVER deploy cookie-relay/ changes
- If build fails, fix and retry. Do not skip.
