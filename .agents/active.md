---
updated_at: "2026-06-20 (cont.3) — Filler standalone public site SHIPPED + DEPLOYED LIVE (loverclinic.vercel.app) + OPD redeployed."
status: "DONE + DEPLOYED. loverclinic.vercel.app LIVE (isolated). OPD redeployed (filler + 3D fix live). filler 102/0; full vitest 16869/0."
branch: "master"
last_commit: "deploy-script fix + handoff (after 6c40a5d6 OPD 3D fix)"
production_url: "https://loverclinic.vercel.app (standalone) + https://lover-clinic-app.vercel.app (OPD)"
production_commit: "lover-clinic-app: lover-clinic-o5gogdbfp · loverclinic: loverclinic-jwk0jef67 (alias loverclinic.vercel.app)"
firestore_rules_version: "UNCHANGED (filler pure-client; OPD deploy was vercel-only, no rules)"
tests: "filler 102/0; full vitest 16869/0. Not re-run after deploy (no source change)."
---

# Active — 2026-06-20 (cont.3) — Filler standalone SHIPPED + DEPLOYED

## State — DONE + LIVE
- **`loverclinic.vercel.app`** = public filler simulator, SEPARATE Vercel project (`loverclinic`, team `teddyoomz-4523s-projects`). Prebuilt STATIC dist-filler → zero firebase/api/OPD code. LIVE + Rule Q L1-verified on prod.
- **`lover-clinic-app.vercel.app/?play=filler`** = OPD copy, redeployed (3D fix + filler work now live).
- master pushed. Both deploys frontend-only → no firestore.rules → no Probe-Deploy-Probe.

## Verified (Rule Q)
- LIVE L1 (Playwright, real prod): loverclinic.vercel.app renders + math + real logo + 3D (`canvasCount:1` + `filler3dChunkLoaded:true`) + **`offHostRequests:[]` + `firebaseRequests:[]`** (talks to nothing but its own host) + mobile no-overflow + console clean.
- Security: live `/api/*` = `text/html` md5-identical to homepage (SPA fallback, NOT a function) + tight CSP `connect-src 'self'`. No OPD serverless on the public site.
- OPD `?play=filler` LIVE L1: 3D chunk loads (`filler3dChunkLoaded:true`) — OPD obfuscator fix works.
- filler 102/0 · full vitest 16869/0 · build clean.

## Edit-once → deploy-both (convention, rule 02 item 11)
- Edit any filler file → `npm run deploy:filler` (verify → `vercel --prod` OPD → `vercel deploy dist-filler --prod --local-config vercel.filler.json` standalone). Needs `.env.filler-deploy` (VERCEL_ORG_ID/FILLER_PROJECT_ID/SCOPE — gitignored). Still requires explicit "deploy" (V18).
- Obfuscator scope = formula files only (`fillerMath.js` + `FillerGraphic2D.jsx`) — NEVER add FillerSimulator/Filler3D (breaks 3D).

## Outstanding (user-triggered)
- ⚠ Rotate LINE/FB secrets (AV195). · Encode customer id in LINE OA url.
- Spec/plan/checkpoint: `docs/superpowers/{specs,plans}/2026-06-20-filler-standalone-public-site*` · `.agents/sessions/2026-06-20-filler-standalone-public-site.md`.
