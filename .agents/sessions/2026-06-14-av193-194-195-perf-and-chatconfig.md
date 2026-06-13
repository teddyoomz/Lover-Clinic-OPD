# 2026-06-14 — AV193 branch-count + AV194 perf-assessment projection + Rule M backfill + AV195 chat_config cleanup

## Summary
Four user-reported/derived fixes, all DEPLOYED + verified. (1) Staff branch-count showed "4 สาขา" with 3 branches; (2) kiosk perf/hormone assessment (ADAM/IIEF-5/MRS/symp_pe) blank in saved-customer intake view; (3) recovered 28 customers' lost perf data; (4) post-hoc blast-radius audit of the WS1 security work found + cleaned its one collateral (dead client reads of the secret chat_config). Closed with a full verification pass → suite now 16386/0 (fixed 3 long-standing flakes).

## Current State
- prod LIVE: frontend `201bd106` (vercel, lover-clinic-app.vercel.app HTTP 200) + firestore.rules `e5418722` (UNCHANGED — all today's work frontend-only). master HEAD `201bd106`. Tree clean.
- Full vitest **16386 / 0** (first fully-green; 3 prior flakes made deterministic this session).
- Prod data ops (2 mutations) idempotent + stable on re-run: orphan-branchIds cleanup (2 staff) + perf backfill (28 customers). 0 drift.

## Commits
```
201bd106 test: 3 flakes deterministic (16386/0) + backup-search diag
f1a97cbe chore(security/AV195): remove dead client chat_config reads (WS1-C2-bis collateral)
d65c00cf chore(data): Rule M perf-assessment backfill — 28 customers
bb74016d fix(intake): carry perf assessment (ADAM/IIEF-5/MRS/symp_pe) thru projection (AV194)
fde86c01 fix(staff/doctors): branch count live-resolves vs be_branches (AV193)
```

## Files Touched (names only)
- AV193: src/lib/branchScopeUtils.js (countLiveBranchMemberships) + StaffTab.jsx + DoctorsTab.jsx + scripts/{diag-staff-branch-count,cleanup-orphan-staff-branchids}.mjs + test
- AV194: src/lib/kioskAssessmentFields.js (NEW) + kioskPatientToCanonical.js + backendClient.js (buildPatientDataFromForm + buildFormFromCustomer) + scripts/{diag-perf-*,e2e-perf-*,backfill-perf-assessment}.mjs + test
- AV195: src/lib/fbConfigClient.js + src/components/ChatPanel.jsx + src/components/backend/FbSettingsTab.jsx + test (+ 6 V21 fixups: v75-fb-config/v75-fb-settings/v75-continuity/v78/v79)
- Test-infra: tests/{phase16.3-firestore-rules-gate,bsa-task7-h-quater-fix,v85-glow-utility-css}.test.js + scripts/diag-find-deleted-session-in-backups.mjs
- audit-anti-vibe-code SKILL.md (AV193/194/195)

## Decisions (1-line each)
- AV193: branch-count must live-resolve vs be_branches (branchIds carry orphan ids of deleted branches — Rule H soft-keep). V47/AV25 display-orphan-FK class.
- AV194: same class as V141/AV162 — canonical projection (kioskPatientToCanonical+buildPatientDataFromForm) dropped 27 assessment fields; fix = the 3-mapper triangle + shared pickKioskAssessmentFields. MRS was doubly-latent. Root-doc pollution safe (V141 precedent; customerValidation doesn't whitelist-reject).
- Backfill match = STRONG only (national-id OR firstName+lastName+phone); meaningful answers only; ambiguous SKIPPED (LC-26000082); idempotent. ภูดิท LC-26000151 unrecoverable (session deleted + not in any of 7 backups).
- AV195: chat_config holds LINE/FB SECRETS; C2-bis denies client read; 2 legacy client reads (fbConfig auto-seed + ChatPanel fallback) failed graceful but were dead+noisy → removed (per-branch configs are primary; chat_config held OLD rotating secrets). 4/5 WS1 tightenings clean.
- Score bug did NOT come from the security work — git -S proves perf never in projection; predates it ~5 weeks.
- 3 suite flakes = test-infra (stale regex window + comment-matching grep + cmd.exe-grep-not-on-PATH), not real bugs; made deterministic.

## Honest gaps (Rule Q)
- Adversarial-review workflow rate-limited (twice) → review done inline by me, not independent agents.
- L1 real-browser for the user-visible bits (intake perf render for 28 backfilled customers + staff count + chat panel) = user hands-on; data+logic+tests verified.
- AV194 perf-on-ROOT-doc for a NEW addCustomer verified by logic (V141 precedent + no validator reject), not a live addCustomer e2e (patientData path — what the reader needs — fully L2-verified).

## Next Todo
- IDLE / await direction.
- USER: rotate LINE channelSecret/accessToken + FB appSecret/pageAccessToken (chat_config held OLD secrets — AV195 reinforces).
- Optional: ภูดิท re-assessment (only way to recover his per-item data). LC-26000082 ambiguous backfill (pick a session if wanted).

## Resume Prompt
Resume LoverClinic — continue from 2026-06-14 EOD. master=201bd106=prod LIVE. AV193+194+195 + perf backfill deployed; suite 16386/0. Next: idle. ⚠ user must rotate LINE/FB secrets. /session-start
