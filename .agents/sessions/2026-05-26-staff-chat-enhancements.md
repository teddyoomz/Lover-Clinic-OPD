# Checkpoint — 2026-05-26 EOD+4 — Staff-chat enhancements SHIPPED + DEPLOYED

## Summary

Four user-requested staff-chat features built one-surface, via full `brainstorming → spec → writing-plans → executing` (subagent pivoted inline). DEPLOYED to prod (vercel + firebase rules) with Probe-Deploy-Probe #15 PASS. Day-separators, larger reply-quote, own-only unsend (hard-delete), and emoji + 2-tier stickers (bundled Fluent-Emoji MIT + custom IndexedDB).

## Current State

- master/prod = `459a4ea3` LIVE — `vercel --prod` aliased `lover-clinic-app.vercel.app` + `firebase deploy --only firestore:rules,storage`.
- **Probe-Deploy-Probe #15 PASS**: P1 chat-webhook + P5 patient-form open paths = 200 pre+post; P9/P15a/b/c staff-chat anon write/delete/sticker-create = 403 (new rules did NOT open anon).
- This deploy shipped EVERYTHING since prod `65ab6467` (staff-chat + carryover: 4-tab removal · deposit-cancel dialog · appointment-hub all-types button + opd-pending tab · appointment-modal deposit · AV133) — all LIVE.
- Tests: full suite **14746 · 14745 pass + 1 known V50 full-suite-load flake (isolated 64/64)** · staff-chat 289/0 · new bank 33/0 · build clean 4.17s.
- AV134 added; 2 V21 fixups (storage.rules delete contract that Feature 3 changed).

## Architecture (per feature)

- **F1 day-sep** — pure `staffChatDayGroups.js` (`toMs` dual-shape · `bangkokDayKey` GMT+7 shift, machine-TZ-stable · `dayDividerLabel` วันนี้/เมื่อวาน/full พ.ศ. · `groupMessagesByDay`). StaffChatMessageList renders a centered pill divider per day group (static).
- **F2 quote** — quote card + composer reply strip `text-[10px]→[13px]` (name label stays 10px).
- **F3 unsend** — `deleteStaffChatMessage(branchId,messageId)` in backendClient (sweep `staff-chat-attachments/{branchId}/{messageId}/` via listAll+deleteObject, best-effort, THEN deleteDoc) + scopedDataLayer passthrough; useStaffChat.deleteMessage; StaffChatMessage own-only `isOwn && onDelete` 🗑 + AV78 explicit-close confirm; Widget threads onDelete. Own-only is a UI/deviceId gate (no per-user auth) — server rule = clinic-staff delete.
- **F4 emoji+stickers** — StaffChatStickerPicker 3 tabs (emoji unicode insert at caret / bundled grid / custom grid + add file·URL). Bundled = 20 Fluent-Emoji MIT SVGs in `/public/stickers/fluent/` + `src/lib/staffChatStickerManifest.json`, sent `sticker:{kind:'bundled',id}` (0 Firebase). Custom = `stickerLibrary.js` IndexedDB blobs; sendSticker uploads to the per-message attachment prefix → `sticker:{kind:'custom',url,storagePath}` (retention + unsend sweep cover it). `buildMessageDoc` sticker field undefined-safe; a sticker-only message passes the empty guard + the firestore.rules create content-clause.

## Commits

```
459a4ea3 feat(staffchat): day separators + 13px quote + own-only unsend + emoji/stickers (AV134)
```

## Files Touched

- NEW src: `staffChatDayGroups.js` · `stickerLibrary.js` · `staffChatStickers.js` · `staffChatStickerManifest.json` · `StaffChatStickerPicker.jsx` · `public/stickers/` (20 SVG + LICENSE + manifest mirror)
- MOD src: `StaffChatMessage.jsx` · `StaffChatMessageList.jsx` · `StaffChatComposer.jsx` · `StaffChatWidget.jsx` · `useStaffChat.js` · `staffChatClient.js` · `backendClient.js` · `scopedDataLayer.js`
- RULES: `firestore.rules` · `storage.rules`
- AUDIT: `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV134) · `.claude/rules/01-iron-clad.md` (Rule S reaffirmation + probe #15)
- TESTS: NEW `staff-chat-enhancements-{helpers,flow-simulate}.test.js` + `-rtl.test.jsx`; V21 fixups `staff-chat-any-file.test.js` · `staff-chat-multi-image.test.js`
- DOCS: spec/plan `docs/superpowers/{specs,plans}/2026-05-26-staff-chat-day-quote-unsend-stickers*`

## Decisions

- Q1=relative+full-BE-date pill dividers (static, no sticky) · Q2=13px · Q3=own-only client-gate + hard-delete vanish + confirm · Q4=2-tier stickers · Q5=Fluent-Emoji MIT (license-safe realization of the user's "CC0 cartoon pack" pick — recommended + accepted via ".").
- Custom-sticker library = IndexedDB only (AV134); only the SENT instance touches Storage (under the attachment prefix → retention + unsend cover it). Cross-device send works; Firebase not bloated with a catalog.
- Subagent-driven chosen, executed inline: T7 subagent died on a 1M-context billing wall; this baseline thrashes subagents (V81/Tablet-Chart) — inline is the documented winner.
- Deploy = combined (V15); rules changed → Probe-Deploy-Probe (Rule B) #15 added + run.

## Lessons

- 8 MB single-line GitHub git-tree → git-bash `grep -o` only matches the earliest entries; use **node fetch + JSON.parse** (reliable). Fluent Emoji folder names ≠ CLDR names + skin-tone emoji nest under `…/Default/Color/…` → keyword-match against the live tree + prefer the `Default` path.
- Subagent `model: sonnet` override hit a 1M-context credits wall → fetched nothing. Don't override subagent model here; inline for fetch/coupled work.
- `THAI_MONTHS` in utils.js is `{value,label}` objects, not strings — the day-group helper inlines its own flat month array (also keeps it pure).
- Rule S reaffirmed: design Q&A = AskUserQuestion preview / inline HTML, NEVER Chrome MCP to "verify" the Visual Companion at ask→plan.

## Rule Q-honest scope

Rules-layer security = real-verified via live HTTP probes (L2-equivalent for the security contract). Code = unit + RTL + flow-simulate + sibling 289/0 + full suite + build. Feature **behavioral** L1 (real-browser staff chat: render dividers, send/delete, sticker round-trip on a 2nd device) = USER post-deploy (auth-gated dashboard + workstyle "ไม่ self-test UI") — disclosed, not driven by me.

## Next Todo

- User L1 on `lover-clinic-app.vercel.app` (hard-refresh): staff-chat day-pill / 13px quote / own-only unsend / emoji + sticker (bundled + custom) send+render on a 2nd device; + carryover L1 (tab-removal · deposit-cancel · appointment-hub · AV133).
- If a bug surfaces → `/systematic-debugging` + Rule P.

## Resume Prompt

```text
Resume LoverClinic — continue from 2026-05-26 EOD+4.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=<docs sha>, prod=459a4ea3 LIVE)
3. .agents/active.md (14746 tests · 1 V50 flake)
4. .claude/rules/00-session-start.md (iron-clad + V-summary; Rule Q/Q-honest/Q-vis)
5. .agents/sessions/2026-05-26-staff-chat-enhancements.md

Status: prod=459a4ea3 LIVE (staff-chat enhancements + all carryover since 65ab6467).
Full suite 14745 pass + 1 known V50 flake (isolated 64/64) · build clean.
Next: USER L1 on lover-clinic-app.vercel.app (staff-chat day-pill/13px-quote/unsend/
emoji+sticker + carryover). Bug → /systematic-debugging + Rule P.
Outstanding (user-triggered): L1 verify. No pending deploy (all LIVE).
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe on rules;
Rule Q + Q-honest + Q-vis (real-adversarial; disclose test-vs-claim gap; verify pixels with eyes).
/session-start
```
