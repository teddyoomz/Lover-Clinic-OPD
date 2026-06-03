---
updated_at: "2026-06-03 EOD+4 — Staff-chatbox fresh-adversarial bug-hunt LOOP (V161) CONVERGED: 10 latent bugs fixed (AV180-188). DEPLOYED (Vercel LIVE; officeToPdf Cloud Run in-flight)."
status: "Loop converged + deployed. Vercel prod LIVE (aliased). Staff-chat family 648/648 · full vitest 16127/16130 (3 PRE-EXISTING flakes, pass isolated) · build clean. H2+client L1-verified (Chrome MCP)."
branch: "master"
last_commit: "bff0bde6 (docs: V161 v-log + active.md). This session: 6 staff-chat fixes 18ad69bb..a164b9fd + Rule M data cleanup 574ff2ad + docs bff0bde6."
tests: "Full vitest 16127/16130 (this session). 3 reds = PRE-EXISTING flakes (bsa-task7 execSync git-grep matches a comment in TFP:913 · v85-glow cmd.exe grep PATH · genShortId birthday-paradox) — all pass isolated, none touch changed files. Staff-chat family 648/648. NOT re-run at EOD."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "bff0bde6 — Vercel CAUGHT UP (deployed EOD+4, aliased lover-clinic-app.vercel.app). officeToPdf Cloud Run (S2) deploy IN-FLIGHT (task bv6qto72h, ~10-15min Cloud Build) — outcome pending."
firestore_rules_version: "UNCHANGED. No firestore.rules change → no Probe-Deploy-Probe."
---

# Active — 2026-06-03 EOD+4 — Staff-chatbox bug-hunt loop CONVERGED + DEPLOYED (V161)

## State
- master `bff0bde6`; prod `bff0bde6` Vercel LIVE (deployed this turn). officeToPdf Cloud Run S2 deploy in-flight (bv6qto72h).
- Working tree clean. No firestore.rules change.
- `/systematic-debugging` + `Explore` adversarial sweep → fix-loop until a fresh hunt found nothing (user's "ผมมีกลิ่น" smell).

## What this session shipped (detail → checkpoint 2026-06-03-staffchat-bughunt-loop-v161.md)
- **10 bugs, each failing-test-first→green+AVxx (AV180-188).** Hide-don't-unmount blast-radius: H2 draft/reply cross-branch leak (AV180) · H11 media not paused on hide (AV182) · open-gate. Send-path orphan D: mint-id→upload→create-doc leaks blobs → `deleteStaffChatAttachmentFolder` at both sites (AV188). Singletons: H4 conditional scroll (AV181) · mention-spaces (AV183) · cursor same-ms tie (AV184) · sticker object-URL once-per-item (AV185) · **S2** officeToPdf late-doc retry (AV187) · **S1** retention orphan-sweep pagination+mapBounded (AV186).
- **Tests**: 10 dedicated files + 3 V21 fixups. Staff-chat family 648/648.
- **Deployed**: Vercel (frontend + S1 cron) LIVE. officeToPdf Cloud Run (S2) in-flight via `gcloud run deploy --source functions/officeToPdf`.

## Next action
- IDLE / await direction. Loop converged.
- **Pending verify (Rule Q-honest)**: (1) confirm officeToPdf Cloud Run revision lands (task bv6qto72h) → then L2 `node scripts/e2e-staff-chat-office-preview.mjs`. (2) S1 cron live but un-triggered — optional L2 `node scripts/diag-trigger-...` or wait for 03:00 cron.

## Outstanding user-triggered actions
- Confirm officeToPdf Cloud Run deploy outcome (in-flight) + L1 hands-on of staff-chat fixes on prod.
- Carryover (low-pri): audit-stock-flow S37 + V-log B1/B2 · be_products junk cleanup (V145) · Neuramis merge + junk course "หฟแฟ" · cross-collection reconciliation report · SESSION_HANDOFF head trim <150 KB.
