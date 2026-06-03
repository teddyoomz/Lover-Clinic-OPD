# 2026-06-03 EOD+4 — Staff-chatbox fresh-adversarial bug-hunt LOOP (V161)

## Summary
User "ultrathink" smell directive ("there must be a bug not matching the program's purpose; loop until a fresh hunt finds nothing"). `/systematic-debugging` + an `Explore` adversarial sweep over the staff-chat subsystem surfaced **10 latent bugs** across two architectural classes + singletons; each fixed failing-test-first → green + an AVxx (AV180-188). Looped until a final fresh hunt found nothing purpose-breaking → **converged**. Deployed (Vercel LIVE; officeToPdf Cloud Run in-flight).

## Current State
- master `bff0bde6` (+ session-end docs `15765b52`); prod **`bff0bde6` Vercel LIVE** (aliased `lover-clinic-app.vercel.app`, deployed this turn).
- officeToPdf Cloud Run (S2) DEPLOYED — revision `office-to-pdf-00008-d2p` serving 100% (exit 0).
- Staff-chat test family 648/648 · full vitest 16127/16130 (3 PRE-EXISTING flakes, pass isolated) · build clean.
- No firestore.rules change → no Probe-Deploy-Probe. Working tree clean.

## Commits (this session, 18ad69bb..bff0bde6)
```
bff0bde6 docs(agents): V161 v-log + active.md — loop CONVERGED (10 bugs, AV180-188)
a164b9fd fix(staffchat): clean send-path Storage orphans at the source (D, AV188)
d2344993 fix(staffchat): server-side — officeToPdf late-doc retry (S2/AV187) + retention orphan-sweep pagination (S1/AV186)
e03366ec fix(staffchat): custom-sticker object-URL leak (AV185)
574ff2ad chore(data): Rule M cleanup — delete 3 cancelled test import-orders + cancelled batches
a541ccc6 fix(staffchat): mention-spaces + read-cursor same-ms tie (AV183/AV184)
18ad69bb fix(staffchat): bug-hunt — 3 hide-don't-unmount regressions (V161/AV180-182: H2,H4,H11)
```
(EOD+4 deploy = `vercel --prod` of bff0bde6 + `gcloud run deploy --source functions/officeToPdf` in-flight.)

## Files Touched
- src/hooks/useStaffChat.js (H2 resubscribe clear · D Site A+B orphan cleanup)
- src/components/staffchat/StaffChatWidget.jsx (H2 Composer key) · StaffChatMessageList.jsx (H4+open-gate+H11) · StaffChatComposer.jsx (mention) · StaffChatStickerPicker.jsx (object-URL)
- src/lib/staffChatClient.js (extractMentions) · staffChatReadCursor.js (same-ms tie) · backendClient.js (deleteStaffChatAttachmentFolder extract) · scopedDataLayer.js (re-export)
- api/cron/staff-chat-retention-sweep.js (S1 pagination + mapBounded)
- functions/officeToPdf/{helpers.js,index.js} (S2 patchOfficeAttachment retry)
- .agents/skills/audit-anti-vibe-code/SKILL.md (AV180-188) · .claude/rules/00-session-start.md (V161)
- tests: 10 new (staffchat-{draft-branch-scope,reply-branch-scope-hook,no-yank-while-reading,pause-media-on-minimize,mention-spaces,cursor-same-ms-tie,sticker-objecturl-leak,officetopdf-patch-retry,retention-orphan-pagination,upload-orphan-cleanup}) + 3 V21 fixups (read-cursor SG2, no-yank SG3, office-preview OP-SG.6)

## Decisions (1-line each; full lesson → 00-session-start.md §2 V161 + AVxx)
- Hide-don't-unmount blast-radius is the recurring root (V160 class): changing a mount/lifecycle model silently voids every behavior coupled to the old model → grep all mount-coupled behaviors (AV180/182).
- Upload-before-doc-create ALWAYS needs source-side orphan cleanup, never just the retention backstop (AV188); the backstop (S1/AV186) is now also reliable.
- Event-triggered patch on a doc created by a SEPARATE later write must RETRY on doc-not-yet-exists, not warn-and-drop (S2/AV187).
- A "completeness-guarantee" serverless sweep must paginate the FULL listing (no cap) + bounded-parallel the per-item checks (S1/AV186, V122 class).
- 50-msg listener cap + no load-more = intentional lightweight scope (not a bug); reactions/edit/pin absent by design.
- The 3 full-suite reds are pre-existing execSync/birthday-paradox flakes in untouched files (verified isolated) — NOT this session's regression (Rule Q-honest).

## Next Todo
- **S2 live-conversion L2** (NOT yet run): the canonical `scripts/e2e-staff-chat-office-preview.mjs` is BLOCKED by a stale `import 'dotenv/config'` (dotenv uninstalled; predates the repo's inline `loadEnvLocal()`). Port it to `loadEnvLocal()` (mirror `e2e-stock-realtime-lot-clear.mjs:49`) OR `npm i -D dotenv` + `DOTENV_CONFIG_PATH=.env.local.prod node …`, then run against live revision 00008-d2p. (S2 retry logic IS unit-verified R1-R4; only the live-conversion of the new revision is pending.)
- (optional) S1 cron L2 — or wait for 03:00 cron.
- User L1 hands-on of the staff-chat fixes on prod.
- Carryover (low-pri): audit-stock-flow S37 + V-log B1/B2 · be_products junk cleanup (V145) · Neuramis merge + junk course "หฟแฟ" · cross-collection reconciliation report · SESSION_HANDOFF trim.

## Resume Prompt
Resume LoverClinic — continue from 2026-06-03 EOD+4. Staff-chatbox bug-hunt loop (V161) converged + DEPLOYED (Vercel LIVE bff0bde6; officeToPdf Cloud Run S2 revision 00008-d2p LIVE). Read CLAUDE.md + SESSION_HANDOFF.md + .agents/active.md + .claude/rules/00-session-start.md first. Next: S2 live-conversion L2 still pending — un-block `scripts/e2e-staff-chat-office-preview.mjs` (port stale dotenv→loadEnvLocal) then run vs revision 00008; else idle. No deploy without "deploy" this turn (V18). /session-start
