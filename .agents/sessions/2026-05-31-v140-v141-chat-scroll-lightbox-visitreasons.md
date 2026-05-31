# 2026-05-31 EOD+3 — V140 (staff-chat scroll + lightbox nav) + V141 (kiosk visitReasons preserve)

## Summary
Two `/systematic-debugging` rounds after V139 deploy. **V140**: staff-chat Enter doesn't auto-scroll to bottom (root: effect on `[messages.length]` frozen at the 50-msg listener cap) + lightbox nav arrows invisible on white images (faint `bg-white/15`). **V141**: PatientForm visit-reason ("สาเหตุที่มาพบแพทย์") shows BLANK in the intake view — proven via Rule R to be a CONVERSION bug (not customers skipping): the kiosk→be_customers conversion folded `visitReasons`→`symptoms` + dropped the rest. All DONE + fully verified, **UNCOMMITTED/HELD** (user ran /session-end without authorizing commit/deploy/heal).

## Current State
- master HEAD = this EOD docs commit; prod UNCHANGED = `3342a9f0` (V138+V139, deployed earlier this session).
- V140 + V141 source = uncommitted in working tree (6 mod + 4 new). Frontend/lib only → no Probe-Deploy-Probe.
- Full vitest **15336/0** (700 files) + build clean. V140 8/0 + V141 9/0.
- V141 heal dry-run: **109/113** be_customers recoverable from `symptoms`; `--apply` GATED.

## V140 — root causes (Phase 1)
- **Bug1**: `useStaffChat` listener `limitCount:50` → `messages` array frozen at length 50; `StaffChatMessageList` auto-scroll `useEffect(..., [messages.length])` never re-fires past the cap. Fix = `lastMessageId` (ChatPanel `[messages]` = working reference). AV160.
- **Bug2**: `StaffChatImageLightbox` nav arrow circles `bg-white/15`+white icon, NO dark backing → white-on-white invisible. Fix = `bg-black/55 ring-1 ring-white/40 shadow-lg` (prev+next; `ImageLightbox bg-black/80` = ref). Top-bar X/download + PdfOverlay buttons gradient-protected (sanctioned, not changed). AV161. Rule Q-vis screenshot: visible on white/dark/blue/green/skin-tone.

## V141 — root cause (Phase 1 — Rule R decisive)
- opd_sessions visitReasons **100%** present; be_customers **0/113** (incl. screenshot LC-26000115). Form validation (PatientForm:354 `isIntake`) ALREADY requires visitReasons for intake/deposit → customers DID fill it. NOT a fill-bug.
- `kioskPatientToCanonical:153` maps `visitReasons`(array)→`symptoms`(joined string) + drops visitReasonOther/hrtGoals/hrtTransType/hrtOtherDetail. Intake view (AdminDashboard:5039) + `generateClinicalSummary` (utils:455) read `visitReasons` → blank. Phase 26.2g / V12 multi-reader-sweep class.
- Fix = the 3-mapper triangle: `kioskPatientToCanonical` (out, **snake_case** `visit_reasons` to avoid camelCase-on-root per Phase 23.0) → `buildPatientDataFromForm` (snake form → camelCase pd) → `buildFormFromCustomer` (pd → snake form, edit no-clobber). AV162.

## Commits
```
(none for V140/V141 source — held/gated)
EOD docs commit only: docs(agents): EOD 2026-05-31 EOD+3 — V140 + V141 DONE+verified (held)
```

## Files Touched (V140+V141 — all uncommitted/held)
- V140: `src/components/staffchat/StaffChatMessageList.jsx` · `StaffChatImageLightbox.jsx` · `tests/v140-staff-chat-scroll-and-lightbox.test.jsx` (new)
- V141: `src/lib/kioskPatientToCanonical.js` · `src/lib/backendClient.js` (buildPatientDataFromForm + buildFormFromCustomer) · `tests/v55-1-snapshot-byte-identical.test.js` (snapshot update) · `tests/v141-visit-reason-preserve-through-conversion.test.js` (new) · `scripts/diag-visit-reason-empty.mjs` (new, Rule R) · `scripts/heal-visit-reason-from-symptoms.mjs` (new, Rule M)
- Shared: `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV160 + AV161 + AV162)

## Decisions (1-line each)
- V140 Bug1: key on `lastMessageId` not `[messages]` — precise (no redundant scroll on same-last-id re-render); ChatPanel `[messages]` is the ref.
- V140 Bug2: dark circle + white ring = visible on ANY image; only the 2 over-image nav arrows (gradient-backed buttons sanctioned).
- V141: snake_case canonical keys (`visit_reasons`) — Phase 23.0 contract (no camelCase on root be_customers doc); camelCase only in patientData.
- V141: backfill from `symptoms` validated vs VISIT_REASON_VALUES so admin free-text symptoms aren't corrupted (109/113; 4 skipped).
- V141: force-fill ALREADY enforced (intake/deposit) — no PatientForm change; the "ชอบไม่กรอก" was this display bug.
- Held uncommitted (matches EOD+1/EOD+4 precedent) — user gated commit/deploy/heal.

## Next Todo (user-triggered)
1. Commit + push V140 + V141 source.
2. Deploy (`vercel --prod`, frontend-only, no Probe-Deploy-Probe; V18 needs "deploy").
3. V141 heal `--apply` (109 customers restore visitReasons).
4. L1 hands-on prod: V140 chat 50+ thread auto-scroll + lightbox nav on white image; V141 intake visit-reason bullets after heal.

## Resume Prompt
Resume LoverClinic — continue from 2026-05-31 EOD+3. V140 + V141 DONE+verified, UNCOMMITTED/HELD. Read CLAUDE.md · SESSION_HANDOFF.md (master=docs-HEAD, prod=3342a9f0) · .agents/active.md · this checkpoint. When authorized: commit V140+V141 → vercel --prod → V141 heal `--apply` (109). No commit/deploy/heal without explicit word THIS turn (V18 + Rule M).
