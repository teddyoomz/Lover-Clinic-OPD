---
updated_at: "2026-06-03 EOD+4 — Staff-chatbox fresh-adversarial bug-hunt LOOP (V161): 10 latent bugs fixed across hide-don't-unmount blast-radius + send-path-orphan + server classes; looped until a fresh hunt found nothing. NOT deployed."
status: "LOOP CONVERGED. Each fix = failing-test-first→green+AVxx (AV180-188). Staff-chat family 648/648 · full vitest 16127/16130 (3 PRE-EXISTING flakes in untouched files, all pass isolated) · build clean. H2+client surface L1-verified (Chrome MCP)."
branch: "master"
last_commit: "a164b9fd (D — send-path orphan cleanup, AV188). This session: 6 staff-chat fix commits 18ad69bb..a164b9fd (+1 Rule M data cleanup 574ff2ad)."
tests: "Full vitest 16127/16130 (this turn). 3 reds = PRE-EXISTING flakes (bsa-task7 execSync git-grep matches a comment in TFP:913 · v85-glow cmd.exe grep not on PATH · genShortId birthday-paradox) — all pass isolated, none touch changed files. Staff-chat family 648/648."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "62593b2c — NOT caught up. EOD+3 (draft-persist/V160) + this EOD+4 loop all await a deploy."
firestore_rules_version: "UNCHANGED. Client-SDK/UI + cron + Cloud Function → vercel/gcloud deploy when authorized; no firestore.rules change → no Probe-Deploy-Probe."
---

# Active — 2026-06-03 EOD+4 — Staff-chatbox bug-hunt loop CONVERGED (V161)

## State
- master `a164b9fd`; prod `62593b2c` LIVE (EOD+3 + this EOD+4 loop NOT deployed — awaiting explicit "deploy").
- Working tree clean. No firestore.rules change.
- `/systematic-debugging` + `Explore` adversarial sweep → fix-loop until a fresh hunt found nothing (user's "ผมมีกลิ่น" smell directive).

## What this session's loop fixed (10 bugs → V161; detail in `.claude/rules/00-session-start.md` §2 V161 + AV180-188)
- **Hide-don't-unmount blast-radius** (V160 class): **H2** draft+reply leaked across a BranchSelector switch (always-mounted widget) → `<StaffChatComposer key={selectedBranchId}>` + hook `setReplyingTo(null)` (AV180); **H11** inline `<video>/<audio>` not paused on `display:none` (AV182); **open-gate** scroll/mark-read off the visibility transition.
- **Send-path orphan** (D, AV188): mint-id→upload→create-doc leaks blobs on partial-upload OR doc-create failure → shared `deleteStaffChatAttachmentFolder` (extracted from `deleteStaffChatMessage`) at both sites.
- **Singletons**: H4 conditional auto-scroll (AV181) · mention-spaces longest-match (AV183) · cursor same-ms tiebreak by id (AV184) · sticker object-URL once-per-item (AV185) · **S2** officeToPdf late-doc retry `patchOfficeAttachment` (AV187) · **S1** retention orphan-sweep pageToken pagination + `mapBounded` (V122 class; AV186).
- **Tests**: 10 dedicated files (`staffchat-{draft-branch-scope,reply-branch-scope-hook,no-yank-while-reading,pause-media-on-minimize,mention-spaces,cursor-same-ms-tie,sticker-objecturl-leak,officetopdf-patch-retry,retention-orphan-pagination,upload-orphan-cleanup}`). V21 fixups: read-cursor SG2 · no-yank SG3 · office-preview OP-SG.6.

## Next action
- IDLE / await direction. **Loop converged** — fresh hunt over rules/ordering/drafts/reactions/unsend/50-cap found nothing purpose-breaking.
- **Deploy pending** — say "deploy" → vercel --prod (frontend) + S1 cron + S2 Cloud Function (gcloud run, `scripts/deploy-office-to-pdf-cloud-run.sh`). No firestore.rules change → no Probe-Deploy-Probe. No deploy without explicit "deploy" this turn (V18).
- **Server L2 gap (Rule Q-honest)**: S1 cron + S2 Cloud Function are local-verified (real-shape mocks + source-grep); their real-prod L2 needs the deploy.

## Outstanding user-triggered actions
- Deploy: EOD+3 6 commits + this EOD+4 loop (vercel + gcloud-run office-to-pdf) when ready.
- Carryover (low-pri): audit-stock-flow S37 + V-log B1/B2 · be_products junk cleanup (V145) · Neuramis merge + junk course "หฟแฟ" · cross-collection reconciliation report · SESSION_HANDOFF head trim <150 KB.
