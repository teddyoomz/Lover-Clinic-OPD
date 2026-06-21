---
updated_at: "2026-06-21 EOD+2 — AV198 booking-flow card fix (DEPLOYED) + filler suite (OG/glans DEPLOYED · research-credit + full-titles + PDF NOT deployed)."
status: "AV198 booking-flow fix + filler OG + glans-grows LIVE. Filler research-credit feature (ddf30470 + e7954197) committed, NOT deployed (2 commits ahead of prod). firestore.rules UNCHANGED all session → frontend-only, no Probe-Deploy-Probe."
branch: "master"
last_commit: "e7954197 — refine(filler): web full paper titles; PDF variables-first"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "OPD lover-clinic-cc...? = lover-clinic-cbyvk92s8 (lover-clinic-app.vercel.app, AV198+glans LIVE) + filler loverclinic-ktnqy3f0o (loverclinic.vercel.app, OG+glans LIVE). BOTH lack the research-credit feature (ddf30470 + e7954197 not deployed)."
firestore_rules_version: "UNCHANGED this session (all changes frontend-only → vercel-only, no Probe-Deploy-Probe)"
tests: "full vitest 16956/0 (glans-fix turn) + filler targeted 147/0 (latest); build clean; verify:filler ✅. Not re-run after (per no-tests-at-session-end)."
---

# Active — 2026-06-21 EOD+2 — AV198 booking-flow card + filler suite

## State
- AV198 staff-chat intake card now resolves the BOOKING-FLOW registration (was stuck "รอลงทะเบียน" forever) — DEPLOYED + L2-verified real prod.
- Filler simulator: OG share-preview fixed (absolute URLs, LINE/FB/WhatsApp now unfurl) + head (glans) now visibly grows with cc — both DEPLOYED. Research-credit footer button + verified-citations modal + math-explainer PDF — committed, NOT deployed.
- master `e7954197`; 2 commits (ddf30470 + e7954197) ahead of prod.

## What this session shipped (detail → checkpoint 2026-06-21-av198-bookingflow-and-filler.md)
- **AV198 booking-flow fix** (`006fb322`, DEPLOYED): intake card watched only `opd_session.brokerProClinicId` (kiosk flow); the V118–V125 booking flow stamps `appt.customerId` + HARD-DELETES the session → card stuck. Fix = additive resolve via `be_appointments` `linkedOpdSessionId`. Heals live, no migration. e2e fixture mirrored the wrong assumption (V66 trap) → added booking-flow phase. AV198 amended.
- **Filler OG** (`42e18dc8`, DEPLOYED): relative `og:image` → absolute https; +og:url/site_name/etc.; verify:filler regression guard.
- **Filler glans** (`ef758dcd`, DEPLOYED): visual Ø decoupled from the 2mL medical plateau → head grows continuously+saturating with head-cc (was frozen). One math edit fixes 2D+3D. Rendered-pixel verified.
- **Filler research-credit** (`ddf30470` + `e7954197`, NOT deployed): footer "📚 งานวิจัยอ้างอิง" button → modal of 5 VERIFIED citations (full paper titles, clickable PMC/Oxford/ISO links). Removed per-research→calc chip + footer phone-line. NEW `src/lib/fillerRefs.js` single-source (modal + PDF). Corrected 3 inherited citation errors (Zhang≠Wang · Ahn=girth RCT · glans +14.8mm).
- **Math-explainer PDF** (`docs/filler-math-explainer.pdf`, regen via `node scripts/render-filler-pdf.mjs`): branded, real `estimate()` numbers, variables+sources first, clickable refs, 3 pages.

## Next action
- Idle / await. (Optional: `deploy filler` to ship the research-credit feature to both sites.)

## Outstanding user-triggered actions
- **"deploy filler"** → ships ddf30470 + e7954197 (research-credit button + full titles) to lover-clinic-app.vercel.app + loverclinic.vercel.app (frontend-only, no Probe-Deploy-Probe).
