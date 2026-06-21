# 2026-06-21 EOD+2 — AV198 booking-flow card fix + filler suite (OG · glans · research-credit · PDF)

## Summary
Fixed a real prod bug on the just-shipped AV198 staff-chat card (intake card stuck "รอลงทะเบียน" forever for booking-flow walk-ins) — root-caused via `/systematic-debugging` + Rule R real-prod diag, fixed additively, L2-verified, DEPLOYED. Then a filler-simulator suite: OG share-preview fix (DEPLOYED), head-glans-grows fix (DEPLOYED), and a research-credit footer button + verified-citations modal + a branded math-explainer PDF (committed, NOT deployed).

## Current State
- master `e7954197` (+ this EOD docs commit). 2 commits ahead of prod (ddf30470 + e7954197 = research-credit feature).
- prod OPD = `lover-clinic-cbyvk92s8` (lover-clinic-app.vercel.app) — AV198 booking-flow fix + glans fix LIVE.
- prod filler standalone = `loverclinic-ktnqy3f0o` (loverclinic.vercel.app) — OG fix + glans fix LIVE.
- firestore.rules UNCHANGED all session → every change frontend-only, no Probe-Deploy-Probe.
- Tests: full vitest 16956/0 (glans turn) + filler targeted 147/0; build clean; verify:filler ✅. Not re-run at EOD.

## Commits
```
e7954197 refine(filler): web full paper titles; PDF variables-first
ddf30470 feat(filler): footer research-credit button + references modal (verified citations); PDF refs-first + clickable links
ef758dcd fix(filler): head (glans) visibly grows with injected head-cc — decouple visual from the 2mL medical plateau
42e18dc8 fix(filler): absolute og:image + og:url so LINE/Messenger/WhatsApp render the share preview
006fb322 fix(staff-chat): AV198 intake card resolves booking-flow registration via linked appointment
```

## Files Touched
src/lib/staffChatNotifyResolve.js · src/lib/fillerRefs.js (NEW) · src/lib/fillerStrings.js · src/lib/fillerMath.js (comments) · src/pages/FillerSimulator.jsx · filler.html · scripts/render-filler-pdf.mjs (NEW) · scripts/verify-filler-bundle.mjs · scripts/{diag-system-card-prachya,diag-stuck-intake-cards}.mjs (NEW Rule R) · scripts/e2e-staff-chat-system-notify.mjs · tests/{filler-references(NEW),filler-math,staff-chat-system-notify-*,staff-chat-system-card-rtl}.* · .agents/skills/audit-anti-vibe-code/SKILL.md (AV198 rule 5) · docs/filler-math-explainer.{html,pdf} (artifacts, untracked).

## Decisions (1-line each)
- AV198 root cause: intake card watched only `opd_session.brokerProClinicId` (kiosk flow); booking flow (V118–V125) stamps `appt.customerId` (keyed `linkedOpdSessionId`) + HARD-DELETES the session (handleOpdClick:3730) → card watched a deleted doc + a never-set field.
- AV198 fix: ADDITIVE resolve — hook subscribes to BOTH the session (kiosk) AND the linked `be_appointments` (booking); `pickSystemCardCustomerId(card, sessionData, apptData)`; appointment is the durable signal → existing stuck card heals live on deploy, NO migration.
- AV198 V66 fixture trap: the e2e "register" step stamped `brokerProClinicId` directly (mirrored the code's wrong assumption) → green while prod broke; added a real booking-flow phase (delete session + stamp appt.customerId). AV198 rule 5 amended.
- Filler OG: relative `og:image` is not resolved by LINE/WhatsApp/FB crawlers → absolute https URLs + og:url; verify-filler regression guard; crawler cache must be busted (FB debugger / `?v=`).
- Filler glans: keep the medical ΔØ honest (2mL plateau, drives nothing displayed) but compute the VISUAL Ø from RAW cc via `glansVisualGain = max·(1−e^(−cc/6))` → continuous + saturating; one fillerMath edit fixes 2D + 3D.
- Citations VERIFIED via WebFetch/WebSearch before publishing public medical links — caught 3 inherited errors (Zhang≠Wang · PMC8987147=Ahn girth RCT not flaccid · glans +14.8mm not +10.96mm); fixed at source + in `fillerRefs.js` (single source for modal + PDF).
- Filler tweaks (user): removed per-research→calc chip + footer phone/LINE/FB text line; modal shows full paper titles; PDF leads with variables+sources before formulas, compacted to clean 3 pages.

## Next Todo
- Idle / await. Optional: **"deploy filler"** → ships ddf30470 + e7954197 (research-credit button + full titles) to both sites.
- USER L1: (a) staff browser — open the right-branch chat, confirm the นาย ปรัชญา / LC-26000176 card flipped to a clickable name + HN; (b) filler — drag the split to ส่วนหัว, see the head bulge; (c) after deploy + FB re-scrape, share loverclinic.vercel.app → rich preview.

## Resume Prompt
```text
Resume LoverClinic — continue from 2026-06-21 EOD+2.

Read BEFORE any tool call: CLAUDE.md · SESSION_HANDOFF.md (master=e7954197, prod OPD lover-clinic-cbyvk92s8 + filler loverclinic-ktnqy3f0o) · .agents/active.md · .claude/rules/00-session-start.md · this checkpoint.

Status: master e7954197; full vitest 16956/0 + filler 147/0; AV198 booking-flow fix + filler OG + glans LIVE; research-credit feature (ddf30470 + e7954197) NOT deployed (2 ahead).
Next: idle. Outstanding (user-triggered): "deploy filler" → ships research-credit button + full titles to both sites (frontend-only, no Probe-Deploy-Probe).
Rules: no deploy without "deploy" THIS turn (V18); firestore.rules change → Probe-Deploy-Probe (Rule B); Rule Q L1/L2 before "verified".
/session-start
```
