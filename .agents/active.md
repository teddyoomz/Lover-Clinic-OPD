---
updated_at: "2026-06-20 (cont.3) — Filler standalone DEPLOYED LIVE (loverclinic.vercel.app); v7/v7.1 visual polish committed, NOT deployed."
status: "Standalone site LIVE. 3 filler-polish commits pending deploy. filler 103/0; full vitest 16870/0; build clean."
branch: "master"
last_commit: "df2f277f — feat(filler-sim v7.1): condom hero card + red line breathing full-disappear"
production_url: "https://loverclinic.vercel.app (standalone) + https://lover-clinic-app.vercel.app (OPD)"
production_commit: "BOTH live at ~5742f73a (PRE v7-polish) — loverclinic-jwk0jef67 + lover-clinic-o5gogdbfp"
firestore_rules_version: "UNCHANGED (filler pure-client; OPD deploy was vercel-only, no rules)"
tests: "full vitest 16870/0 (this turn) + build clean; filler 103/0 targeted. Not re-run after — reuse."
---

# Active — 2026-06-20 (cont.3) — Filler standalone deployed + v7/v7.1 polish

## State
- **`loverclinic.vercel.app`** = public filler simulator, SEPARATE Vercel project, prebuilt STATIC dist-filler → zero firebase/api/OPD. LIVE + Rule Q L1-verified. OPD `?play=filler` redeployed too.
- **3 filler visual-polish commits (`6f78c45d` `c63fd2cb` `df2f277f`) committed+pushed but NOT deployed** → both live sites still show the PRE-polish version.
- master `df2f277f`; full vitest 16870/0; build clean.

## What this session shipped (detail → checkpoints)
- **Standalone site** (`2026-06-20-filler-standalone-public-site.md`): `filler.html`→`src/filler-main.jsx`→`<FillerSimulator/>` + `vite.filler.config.js`→`dist-filler` (obfuscator scope = formula files only); `verify-filler-bundle.mjs`; og:image from REAL logo (Playwright); `vercel.filler.json` tight CSP; `deploy:filler` dual-deploy; Vercel project `loverclinic` (Q4 URL available). DEPLOYED + LIVE L1 (zero firebase network, 3D loads, /api=SPA-fallback).
- 🐛 **Found+fixed obfuscator-breaks-3D bug in BOTH vite configs** (obfuscating FillerSimulator mangled its `import('Filler3D')` → three chunk never emitted). OPD build now emits Filler3D 524.9K.
- **v7 polish** (`2026-06-20-filler-v7-polish.md`): red "หลังฉีด" line BOLD + glow (was barely visible) · mobile controls-on-top · red line default OFF · condom card = HERO (top+most prominent, แนะนำ badge) · breathing full-disappear (bold→GONE→bold for before↔after contrast).

## Next action
- Idle / await. **Deploy the 3 filler-polish commits on explicit "deploy"** → `npm run deploy:filler` (both OPD + standalone; frontend-only, no Probe-Deploy-Probe).

## Outstanding (user-triggered)
- Deploy filler v7/v7.1 polish (3 commits) → loverclinic.vercel.app + OPD.
- ⚠ Rotate LINE/FB secrets (AV195). · Encode customer id in LINE OA url.
