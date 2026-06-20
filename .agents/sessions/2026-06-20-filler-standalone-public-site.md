# 2026-06-20 (cont.3) — Filler standalone public site (loverclinic.vercel.app)

## Summary
Split the public `?play=filler` simulator into a SEPARATE Vercel project so the customer-facing link has ZERO access to the OPD app (max security). Single source, 2 build targets, one `deploy:filler` command. **SHIPPED + DEPLOYED + Rule Q L1-verified on LIVE prod**: standalone `loverclinic.vercel.app` (`loverclinic-jwk0jef67`) + OPD redeployed (`lover-clinic-o5gogdbfp`). Q4 URL confirmed available.

## Current State
- master HEAD `6c40a5d6` (OPD fix) + a docs commit. prod UNCHANGED.
- filler 102/0 (98 + 4 standalone) · full vitest **16869/0** · build clean · `verify:filler` ✅.

## Decisions (Q&A)
- Q1 = repo-single / 2 build targets (no drift). Q2 = one `deploy:filler` deploys both. Q3 = og meta (title/favicon/og:image). Q4 = if `loverclinic.vercel.app` is taken → STOP + ask (no auto-pick).
- og:image = REAL clinic logo only (no AI; `src/assets/hero.png` is NOT a clinic photo → unused).

## Architecture
- NEW `filler.html` → `src/filler-main.jsx` → `<FillerSimulator/>` (root URL; own title/favicon/og). No inline JS → clean CSP. Dark default (no flash).
- NEW `vite.filler.config.js` → `dist-filler`; emits `index.html` (closeBundle rename) so `/` serves everywhere. `publicDir: public-filler`.
- **Obfuscator scope = formula files ONLY** (`fillerMath.js` + `FillerGraphic2D.jsx`). `FillerSimulator.jsx`/`Filler3D.jsx` EXCLUDED.
- NEW `vercel.filler.json`: buildCommand + outputDirectory + tight CSP (`connect-src 'self'`, no firebase) + rewrite `/(.*) → /index.html`.
- NEW `scripts/verify-filler-bundle.mjs` (Rule Q L2), `scripts/build-filler-og.mjs` (Playwright), `scripts/deploy-filler.mjs` + npm `deploy:filler`/`build:filler`/`verify:filler`/`build:filler-og`.

## 🐛 Bug found + fixed (the big one)
Obfuscating `FillerSimulator.jsx` mangles its `import('../components/Filler3D.jsx')` literal into a string-array call → Rollup can't code-split → the `three` 3D lazy chunk NEVER emits → 3D 404s at runtime. The **OPD `vite.config.js` had the identical config** → its `?play=filler` 3D was silently broken in the obfuscated prod build (not yet deployed). Fixed BOTH configs (narrow include); verified OPD build now emits `Filler3D-*.js` 524.9K + three present + formula constants still 0. R9-8 test updated.

## Verified (Rule Q)
- `verify:filler` ✅ (3 files · no firebase/OPD · formula obfuscated · 3D present).
- **Rule Q L1 (Playwright, real obfuscated dist-filler)**: title + hero render · real logo loaded · math runs · `firebaseRequests:[]` (zero firebase network) · 3D: `canvasCount:1` + `filler3dChunkLoaded:true` · mobile 375px no-overflow · console `[]`. (Temp probe deleted per Rule S.)
- full vitest 16869/0.

## Commits
```
96ef5319 docs(spec) · 388c0e15 docs(plan)
b896c6bb entry+config · bf5a7634 lock test · 3527e435 verifier · a780fe7f og · fa5faf2b deploy config · 9a0155cb index.html-emit
6c40a5d6 OPD vite.config 3D fix + R9-8
(+ docs commit: rule02 + active + handoff + this checkpoint)
```

## Deploy — DONE (live + verified)
- Vercel project `loverclinic` created (team `teddyoomz-4523s-projects`, id `prj_hrFkY7DM…`); ids in `.env.filler-deploy` (gitignored, +VERCEL_SCOPE).
- Standalone: `vercel deploy dist-filler --prod --local-config vercel.filler.json` (env-override project) → aliased `loverclinic.vercel.app` (Q4 ✓ available). **Gotcha**: `vercel deploy <dir>` reads vercel.json from the CWD (OPD's, with `functions`) → MUST `--local-config vercel.filler.json` (static, no functions) or the deploy errors / would leak api/.
- OPD: `vercel --prod` → lover-clinic-app.vercel.app (filler + 3D fix live).
- LIVE L1 (Playwright real prod): standalone renders + math + real logo + 3D + `offHostRequests:[]`/`firebaseRequests:[]` + mobile; `/api/*` = static SPA fallback (md5=homepage, no function). OPD `?play=filler` 3D loads.
- Future edits: `npm run deploy:filler` (needs explicit "deploy" per V18).

## Resume Prompt
Resume LoverClinic — filler STANDALONE site built + L1-verified LOCAL (master ~`6c40a5d6` + docs), NOT deployed, Vercel project NOT created. Single source → `vite.filler.config.js` → dist-filler (zero firebase/OPD, 3D works). Found+fixed the obfuscator-breaks-3D bug in BOTH configs. filler 102/0; full vitest 16869/0. Next (user): create `loverclinic` Vercel project (auth + Q4 stop-if-taken) → deploy on "deploy" via `npm run deploy:filler`. Read .agents/active.md + SESSION_HANDOFF top + plan `docs/superpowers/plans/2026-06-20-filler-standalone-public-site.html`. /session-start
