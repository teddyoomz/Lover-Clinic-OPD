---
updated_at: "2026-05-16 NIGHT+1 — Outstanding closed (Rule N full vitest + verbose V76/V77 + 4 V21 fixups)"
status: "SHIPPED — V76+V77 saga + post-batch V21 fixups + v-log-archive verbose. Awaiting Rule Q L1."
branch: "master"
last_commit: "66995f6 docs+test(V76+V77 outstanding-batch): verbose v-log + V21 contract fixups"
tests: "Full vitest 10844 total: 10826 PASS / 12 skip / 6 FAIL → 4 V21-class fixed inline (V77-bis hardcoded-fallback contract + BC1.1 be_fb_configs entry) + 2 pre-existing RTL non-flakes flagged below (NOT V76/V77-caused). Build clean ✓."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "4d0edcd — V77-quater Vercel LIVE @ 2026-05-16T12:41Z; V77-quinquies (11044de) data-only no deploy"
firestore_rules_version: "v35 LIVE"
v75_commits_ahead_of_prod: 2
---

# Active Context

## State

- **V76 + V77 (a/b/c/-bis/-ter/-quater/-quinquies) all SHIPPED**. 2 prod deploys this session (Vercel + Firebase rules).
- **4 Rule M backfills applied**: V76 (3,281 chat_history → นครราชสีมา), V77-bis (1 chat_conv empty), V77-quater (69 offHours flip), V77-quinquies (818 responseTimeMs recompute).
- master `11044de` = `4d0edcd` (V77-quater LIVE) + V77-quinquies data-only.

## What this session shipped

- **V76** (chat_history BSA) + AV59 invariant + Rule M backfill (3,281 docs → นครราชสีมา)
- **V77a** (ConnectionSettings sub-view RIPPED -180 LOC)
- **V77b/c** (📦 "สำรองลูกค้าทุกคน" button + endpoint + WholeFleetBackupModal + vercel.json maxDuration:300)
- **V77-bis** (webhook hardcoded BR-NAKHON fallback + backfill 1 chat doc)
- **V77-ter** (AdminDashboard isChatActive V51 cs.chatHours* field migration)
- **V77-quater** (ChatPanel.isWithinChatHours V51 sibling reader — same class as V77-ter, missed cross-file grep) + backfill 69 offHours-wrongly-tagged docs
- **V77-quinquies** (818 chat_history docs responseTimeMs recomputed — "ตอบล่าสุด" badge fix)
- Checkpoint: `.agents/sessions/2026-05-16-v76-v77-saga.md`

## Class-of-bug lesson (Rule P)

V51 per-branch settings migration created 3 readers of pre-V51 field names. V77-ter fixed 1; V77-quater fixed 2 more after user found "นอกเวลา" tag bug. Cross-file grep at V77-ter would have caught all 3. Rule P 7-step Step 3 (cross-file grep) MUST run BEFORE fix-and-ship. My omission cost user 2 extra rounds.

## Next action (user Rule Q L1 on prod — multi-device)

1. **V76 history filter**: ทดลอง 1 / พระราม 3 + ⏰ history → empty; นครราชสีมา → 3,281 chats
2. **V77a**: chat tab header → ⚙ button gone; empty-state CTA → Backend tabs
3. **V77b/c**: Backend → จัดการ Backup → 📦 modal → start → manifest.json download
4. **V77-ter + quater**: chime continuous sound within 11:15-20:45 (Mon-Fri) / 10:15-19:45 (Sat-Sun) AND chat_history NO "ลูกค้าทักนอกเวลา" tag for chats within hours AND "ตอบล่าสุด: <X นาที" badge present for resolved chats
5. **V77-quinquies**: every old chat_history (818 backfilled) now shows ตอบล่าสุด badge

If any fail → /systematic-debugging Phase 1 (cross-file grep MANDATORY this time).

## Outstanding user-triggered actions

- Rule Q L1 hands-on by user multi-device (5 scenarios above)

## Closed this turn (Outstanding ให้ครบ batch)

- ✅ **Rule N full vitest batch-end**: 10826 PASS / 12 skip / 6 FAIL across 5 files (489 total). 4 V21-class fixed inline:
  - `tests/v75-chat-webhook-branchid-stamp-flow.test.js` LW1.5 + FW1.6 — locked post-V77-bis hardcoded-นครราชสีมา fallback contract (replaces pre-V77-bis empty-fallback assertion)
  - `tests/v75-chat-webhook-branchid-stamp-av57.test.js` AV57.9 — replaced `-empty` label assertion with `-hardcoded-nakhonratchasima`; negative regression guard omitted because V77-bis institutional-memory comments in resolver legitimately reference the old label
  - `tests/branch-collection-coverage.test.js` BC1.1 — added `be_fb_configs` (V75 Item 3) to COLLECTION_MATRIX with structural-doc-id rationale mirroring `be_line_configs`
- ✅ **Verbose V76 + V77 entries** appended to `.claude/rules/v-log-archive.md` (V76 = chat_history BSA sibling-reader/writer; V77 = 5-round saga V77a + V77b/c + V77-bis + V77-ter + V77-quater + V77-quinquies with class-of-bug lessons + Rule M backfill details + plan-vs-reality adaptations)

## Pre-existing failures surfaced (NOT V76/V77-caused — separate investigation)

These failures persisted in isolation (not just under full-suite load). active.md from V73 session 2026-05-18 had flagged them "intermittent under full-suite load"; isolated re-run today shows consistent fail. Out of scope for this turn (different bug class).

- `tests/v64-appointment-hub-rtl.test.jsx` V64.R6.1 — past pending + same-day treatment → status auto-flips to เสร็จแล้ว (AppointmentHubRowCard, NOT chat-related)
- `tests/v71-row-card-integration.test.jsx` RC3.2 — service-completed button HIDDEN when no treatment (RowCard component, NOT chat-related)

## 🔥 USER-REPORTED P0 BUGS (Rule Q L1 hands-on found these mid-session)

### P0-A — V77b/c 📦 whole-fleet backup button crashes (THIS session — 2-commit fix: defensive client + 5-bug adversarial batch)

User reports across 2 rounds:
1. "backup ลูกค้าไม่ได้ ไอ้สัส" + screenshot "Unexpected token 'A', "An error o"... is not valid JSON"
2. "มึงเทสแล้วจริงเหรอ กูไม่เชื่อ ยังไงก็บั๊ค มึงหาบั๊คต่อได้เลย"

**Confirmed Rule Q V66 violation** — V77 shipped on mock tests only; user L1 found the crash instantly. I owe an apology and the adversarial bug-hunt; both shipped this session.

**Fix batch 1 (commit `<post-push-1>`)** — Tier 2 mitigations:
- Defensive JSON parse — modal now reads response as text, try JSON.parse, on fail surface HTTP status + body head 240 chars instead of generic SyntaxError mask
- `maxCustomers` input added to modal (admin can preview 5-20 first)
- CLI fallback hint inline in modal

**Fix batch 2 (commit `<post-push-2>`)** — Adversarial code-review found 18+ bugs; 5 most critical P0/P1 fixed:
- **P1-1 (CRITICAL V38 lesson regression at 6 sites)**: `{ id: d.id, ...d.data() }` re-introduced in V77 endpoint + restore + 4 CLI scripts. Stray data.id (baseline-migrated cohort) silently poisons customer.id → cascade query targets wrong customer. Flipped to `{ ...d.data(), id: d.id }` everywhere.
- **P0-8 (root cause of user crash)**: sequential for-loop × N customers exceeds Vercel 300s. Endpoint now caps at 50 customers without `force:true` flag (HTTP 413 + Thai CLI hint).
- **P0-5**: modal NO_CUSTOMERS_FOUND no longer renders broken `<a href={undefined}>` download link; amber empty-state banner instead.
- **SP-2**: restore endpoint rejects `fileEntry` not under `backups/customers/` prefix (path-traversal guard).
- **P2-4**: `randHex` default 8 → 16 hex chars (32 → 64 bits) to prevent ts+rand collision in fast iteration.
- **P1-2 + P1-7**: restore precedence flipped (server-stamped meta.customerId > data.id); `restoredLive` mutable copy detects same-batch HN-collision.

**Playwright L1 spec written + skipped-by-default**: `tests/e2e/v77-whole-fleet-backup-adversarial.spec.js` — 5 scenarios W1-W5. Run on demand after next deploy.

**DEFERRED (next session)** — 13 lower-priority bugs from adversarial review:
- P1-3/P1-4/P1-9 (cosmetic + audit-trail polish)
- SP-1 (`computeWholeFleetManifestHash` should reuse canonicalJson — fix mirror of `computeBodyHash`)
- S-1 HARDCODED_NAKHON_BR_ID Rule of 3 trigger (2 sites; +1 = extract to shared module)
- S-2 isWithinChatHours duplicate (ChatPanel + AdminDashboard — V12 risk)
- S-3 chat_history `allBranches:true` + client-side filter (V76 transition; flip to default branch-scoped post-soak)
- S-4 AV17 audit-coverage extension (catch V77-class spread regressions)
- ~25 diag/e2e/phase scripts with same V38 broken spread (sweep separately)

**Per Rule Q V66 — STILL NOT CLAIMING VERIFIED**. User MUST L1 hands-on:
1. Click 📦 → set "ทดสอบเฉพาะ N ลูกค้าแรก: 5" → ใส่ branchId="พระราม 3 id" (5 customers) → check if backup succeeds + download works
2. If still crashes → adversarial pass needed
3. If succeeds at 5 → escalate to 50, then CLI for full fleet

### P0-B — V67 cron `/api/cron/line-reminder-retry` missing composite Firestore index

Surfaced via `vercel logs` stream during this debugging session (unrelated to user's whole-fleet click):

```
Error: 9 FAILED_PRECONDITION: The query requires an index.
collection: be_line_reminder_log, fields: status + nextRetryAt + __name__
```

Cron `*/5 * * * *` (every 5 min) is failing silently — no retries for failed LINE reminders are being processed. Index URL captured in the error message (one-click create in Firebase console). Need to add to `firestore.indexes.json` + deploy.

**Not V76/V77-caused** (V67 saga from 2026-05-15). Flagged here for next-session.

### P0-B — V67 cron `/api/cron/line-reminder-retry` missing composite Firestore index

Surfaced via `vercel logs` stream during this debugging session (unrelated to user's whole-fleet click):

```
Error: 9 FAILED_PRECONDITION: The query requires an index.
collection: be_line_reminder_log, fields: status + nextRetryAt + __name__
```

Cron `*/5 * * * *` (every 5 min) is failing silently — no retries for failed LINE reminders are being processed. Index URL captured in the error message (one-click create in Firebase console). Need to add to `firestore.indexes.json` + deploy.

**Not V76/V77-caused** (V67 saga from 2026-05-15). Flagged here for next-session.
