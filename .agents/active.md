---
updated_at: "2026-06-20 (cont.3) — Filler standalone public site (loverclinic.vercel.app) — built + L1-verified local, NOT deployed; Vercel project NOT yet created."
status: "Tasks 1–5 + 7-pre + 8 DONE (local). Task 6 (create Vercel project) + deploy PENDING user. filler 102/0; full vitest 16869/0."
branch: "master"
last_commit: "6c40a5d6 — fix(filler): OPD vite.config obfuscator broke the 3D lazy chunk — narrow to formula files (+ docs commit after)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "UNCHANGED — neither filler-sim nor the standalone deployed"
firestore_rules_version: "UNCHANGED (filler is pure-client, no rules)"
tests: "filler 102/0 (98 + 4 standalone); full vitest 16869/0 @ post-OPD-fix. Not re-run after docs commit (docs only)."
---

# Active — 2026-06-20 (cont.3) — Filler standalone public site

## State
- Separating `?play=filler` into a SECOND Vercel project `loverclinic.vercel.app` — single source, 2 build targets, one `deploy:filler`. Goal: public link to customers with ZERO access to OPD (max security).
- Built + Rule Q L1-verified LOCAL. **NOT deployed. Vercel project NOT yet created.**
- master HEAD ~`6c40a5d6` (+ docs commit). prod UNCHANGED.

## Shipped this session (Tasks 1–5, 7-pre, 8 — detail → plan + checkpoint)
- NEW `filler.html` → `src/filler-main.jsx` → `<FillerSimulator/>` (root URL, own title/favicon/og meta).
- NEW `vite.filler.config.js` → `dist-filler` (emits `index.html`). Obfuscator scope = **formula files only** (`fillerMath.js` + `FillerGraphic2D.jsx`) — `FillerSimulator.jsx`/`Filler3D.jsx` EXCLUDED (obfuscating the dynamic-import host broke the 3D lazy chunk).
- NEW `scripts/verify-filler-bundle.mjs` (Rule Q L2: no firebase/OPD + formula obfuscated + 3D present), `scripts/build-filler-og.mjs` (og:image from REAL logo, Playwright), `public-filler/{logos,favicon,og-image}`.
- NEW `vercel.filler.json` (tight CSP: `connect-src 'self'`, no firebase domains; rewrite → /index.html) + `scripts/deploy-filler.mjs` + npm `deploy:filler`/`build:filler`/`verify:filler`/`build:filler-og`.
- 🐛 **Found + fixed: OPD `vite.config.js` had the SAME 3D-obfuscation bug** → narrowed its include too (R9-8 updated). OPD build now emits `Filler3D-*.js` 524.9K.
- Rule Q L1 (Playwright, real obfuscated build): renders + math + real logo + **3D lazy chunk loads** + **zero firebase network** + mobile no-overflow. verify:filler ✅. full vitest 16869/0.
- Docs: rule 02 item 11 (dual-deploy convention).

## Next action
- **Task 6 (user-authorized): create Vercel project `loverclinic`** — needs `vercel` CLI auth + Q4 hard-gate (if `loverclinic.vercel.app` is taken → STOP + ask). Then capture VERCEL_ORG_ID + VERCEL_FILLER_PROJECT_ID → `.env.filler-deploy`.
- **Deploy on explicit "deploy"** → `npm run deploy:filler` (both OPD + standalone; frontend-only, no Probe-Deploy-Probe).

## Outstanding (user-triggered)
- Create Vercel project + deploy filler (both).
- ⚠ Rotate LINE/FB secrets (AV195). · Encode customer id in LINE OA url.
- Spec/plan: `docs/superpowers/{specs,plans}/2026-06-20-filler-standalone-public-site*`.
