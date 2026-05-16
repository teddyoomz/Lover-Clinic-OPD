---
updated_at: "2026-05-16 NIGHT+2 — V78 chat per-branch completeness + 3-round adversarial bug-hunt (40 bugs found)"
status: "SHIPPED — V77-fix3 (13 deferred) + V77-fix4 (2 hash retro-compat ship-blockers) + V78 chat per-branch completeness (6 CHAT- + 5 XR- fixes). Awaiting Rule Q L1."
branch: "master"
last_commit: "<post-push>"
tests: "V75/V76/V77/V78 chat + whole-fleet: 254/254 PASS. V78 completeness bank: 57/57 PASS. Build clean ✓ 3.34s. Full vitest deferred to end of batch."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "4d0edcd — V77-quater Vercel LIVE @ 2026-05-16T12:41Z; V77-fix3 + V77-fix4 + V78 NOT YET deployed"
firestore_rules_version: "v35 LIVE — V78 ADDS 5 composite indexes pending deploy (XR-3/7/20)"
v75_commits_ahead_of_prod: "MANY (V77-fix3 + V77-fix4 + V78 + index/cron config)"
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

## V78 — Chat per-branch completeness + 3-round adversarial (2026-05-16 NIGHT+2)

User directives:
> "ทำให้แน่ใจด้วยนะว่า Tab chat ของ frontend มึงดึงข้อมูล 'ทุกอย่าง' แยกสาขากันแล้ว"
> "อีก 3 รอบ ถึงจะเชื่อว่าไม่บั๊คแล้ว ใช้เครื่องมือทุกเครื่องมือที่มึงมี"
> "ทำ e2e และ stimulate user flow จริงๆ มาแบบโหดที่สุด"

**3 adversarial agents found ~40 bugs total** across chat tab + V77-fix3 batch + cross-cutting backend.

### V77-fix4 — SHIP-BLOCKERS from Round 2 (my own V77-fix3 regressions)
- **N1** (hash retro-compat): V77-fix3 added `exporterUid` to manifestHash seed UNCONDITIONALLY → would break restore of every legacy V77b/c-era manifest with WHOLE_FLEET_MANIFEST_TAMPERED. **Fix**: gate inclusion — legacy manifests (no exporterUid) compute pre-V77-fix3 hash; post-V77-fix3 includes both fileEntry + exporterUid for stronger seal.
- **N2** (validator back-compat): V77-fix3 added REQUIRED `customers[].fileEntry` validator → would reject legacy manifests that used `backupRef`. **Fix**: accept either via new `resolveCustomerEntryPath` helper; restore endpoint imports + uses it.

### V78 chat per-branch completeness (Round 1 — chat tab)
- **CHAT-1 CRITICAL** (`/api/webhook/send`): hardcoded single-tenant `clinic_settings/chat_config` for LINE/FB tokens → admin in พระราม 3 sent FROM นครราชสีมา's tokens. **Fix**: switched to firebase-admin SDK + `resolveLineConfigForAdmin` / `resolveFbConfigForAdmin`; require `branchId` in req.body; 503 `BRANCH_CONFIG_MISSING` when neither per-branch nor legacy.
- **CHAT-2 CRITICAL** (`/api/webhook/saved-replies`): same single-tenant leak. **Fix**: `?branchId=` query param + resolveFbConfigForAdmin.
- **CHAT-3 HIGH** (`useChatUnread`): badge counter showed CROSS-BRANCH total → triggered cross-branch chime → THE root user complaint "ไม่เห็นจะแยกกันเลย". **Fix**: signature `useChatUnread(db, appId, selectedBranchId)`; per-branch filter via useMemo with legacy fall-through; AdminDashboard caller updated.
- **CHAT-4 HIGH** (`ChatPanel` filter pills + empty state): read single-tenant `chat_config` for LINE/FB enable flags. **Fix**: listenToLineConfig + listenToFbConfig per-branch; lineEnabled/fbEnabled prefer per-branch then legacy fallback.
- **CHAT-5 MED** (`/api/webhook/send` patch): didn't restamp branchId on conv doc post-reply. **Fix**: convPatch includes `branchId` + `branchIdSource: 'send-<platform>-<resolverSource>'` when resolved.branchId truthy.
- **CHAT-6 MED** (`ChatPanel` selectedConv): branch-switch mid-detail-view kept stale conv via `|| selectedConv` fallback. **Fix**: drop fallback to null; useEffect resets selectedConv when its branchId doesn't match new selectedBranchId.

### V78 cross-cutting (Round 3)
- **XR-15+XR-16 SECURITY** (LINE + FB webhook HMAC): `hmac === signature` → timing attack possible. **Fix**: `crypto.timingSafeEqual` after equal-length check.
- **XR-24 REGRESSION** (V77-fix3 S-1 incomplete): `HARDCODED_NAKHON_BR_ID` constant extracted but webhooks still read `process.env.X || ''` directly → V77-bis empty-branchId class re-latent. **Fix**: webhooks now `resolveChatFallbackBranchId(process.env.LOVER_DEFAULT_BRANCH_ID)`; branchIdSource label distinguishes env-fallback vs hardcoded-fallback.
- **XR-3 + XR-7 + XR-20** (missing composite Firestore indexes — V67 cron failing silently + V75/V76 BSA reader queries unindexed + bulk-delete grace scan): **Fix**: 5 new indexes in `firestore.indexes.json`:
  - `be_appointments (branchId, date)` — line-reminder-fire cron
  - `be_line_reminder_log (status, nextRetryAt)` — retry cron (V67 saga FINALLY indexed)
  - `chat_conversations (branchId, lastMessageAt DESC)` — V75 BSA reader
  - `chat_history (branchId, resolvedAt DESC)` — V76 BSA reader
  - `be_admin_audit (type, performedAt DESC)` — backup-manager bulk-delete
- **XR-2** (Vercel cron 10s default → silent timeout): **Fix**: `vercel.json` adds `maxDuration: 300` for line-reminder-fire + line-reminder-retry.

### Test bank
- `tests/v78-chat-per-branch-completeness.test.js` (57 assertions across 12 describe blocks): source-grep regression locks for CHAT-1..6 + XR-15/16/24/3/7/20/2 + N1/N2 hash retro-compat + Rule I behavioral simulate for `useChatUnread` filter logic + V78 marker checks at 7 critical files.
- `tests/e2e/v78-chat-per-branch-adversarial.spec.js` Playwright stub (skip-by-default; run-on-demand for L1).

**Targeted regression run**: 254/254 PASS across V75/V76/V77/V78 chat + whole-fleet. Build clean ✓ 3.34s.

### Deferred (P2/P3 from 3-round agents)
- XR-1 FCM push tokens global (architectural — needs per-branch design)
- XR-4 per-branch admin scoping (architectural — needs spec; admin claim is currently global)
- XR-5 delete-customer-cascade chat scan loads ALL chats (scalability — pre-filter by customer.branchId)
- XR-6 Storage cleanup best-effort silent fail (needs retry cron)
- XR-8 unlink doesn't clear `lineUserId_byBranch[*]` (V75 outbound miss)
- XR-9 line-send-recall uses Math.random for msgId (replace with crypto.randomBytes)
- XR-12 send.js msgId millisecond-uniqueness (low blast — concurrent admin replies same conv same ms)
- XR-14 link-requests collision check legacy-only field (V75-class)
- XR-17 branch-make-fresh loads ALL be_customers (scalability)
- XR-18 customer-restore conflict scan loads ALL customers (scalability)
- XR-19 OWNER_EMAILS bootstrap-self privilege-escalation vector (security review — needs user)
- XR-21 stack truncation in audit doc (cosmetic)
- XR-22 storage.rules order-sensitivity (refactor)
- XR-23 backups storage-rule cross-branch deletion (architectural — needs XR-4 first)
- L1 chatHours alwaysOn close:'24:00' fragility + L2 ICU-data dependence (chatHours.js robustness)
- L5/L6 V38 spread-order sweep at scripts/diag-* + backendClient single-doc getDoc (separate cleanups)
- ~25 one-shot scripts (diag/e2e/phase) with V38 broken spread (NOT runtime; low priority)
- ChatPanel chat_history `allBranches:true` + client-filter (V76 transition; flip to default branch-scoped post-soak)
- CHAT-8 chatNotificationMute per-device vs per-branch (design decision — user clarification needed)

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

**Fix batch 3 (V77-fix3 — commit `<post-push-3>`)** — 13 deferred bugs all SHIPPED:
- **Batch A (audit hash integrity)**: SP-1 canonical JSON (manifestHash now uses canonicalJson from branchBackupSchema.js — single source of truth across V40/V74/V75); P1-6 exporterUid added to hash seed (was undocumented gap); P1-5 validateWholeFleetManifest now checks every customer.fileEntry exists + starts with `backups/customers/` (defense-in-depth + path-traversal guard)
- **Batch B (endpoint defense)**: P1-3 structured failedCustomers reason (now {reason, code, type, stack-head-400ch}); P1-4 exporterLabel `(())` → 'unknown-admin'; P1-9 branchIdFilter capped to 64ch; P1-10 maxCustomers strict numeric validation (400 INVALID_MAX_CUSTOMERS on non-numeric)
- **Batch C (restore polish)**: P2-2 jsonReplacerForNonFinite for manifest serialization; P2-3 jsonReviverForNonFinite for parse; P2-7 String(undefined) guard (skip+audit instead of writing literal "undefined" docId); P1-8 Storage copy overwrite tracker (returns storageOverwrites[])
- **Batch D (frontend Rule of 3)**: P2-6 ChatPanel chat_conversations subscribe-once + useMemo (was tearing down + re-subscribing on every branch switch); P2-8 Intl.DateTimeFormat replaces locale-string round-trip; **S-1** HARDCODED_NAKHON_BR_ID extracted to `api/webhook/_lib/chatBranchDefaults.js`; **S-2** isWithinChatHours + isChatHoursActiveNow extracted to `src/lib/chatHours.js` (the duplicate IS what caused V77-quater to be a separate fix after V77-ter)
- **Batch E (audit invariant)**: **S-4** NEW `tests/v77-fix2-v38-spread-order-regression.test.js` — project-wide sweep regression catcher. Caught 7 MORE broken-spread sites the adversarial agent missed: api/admin/customer-backup-export.js (V74 endpoint) + customer-restore.js + delete-customer-cascade.js + line-reminder-debug-fire.js (V67) + 2 more in whole-fleet-customer-backup-export.js (exportSingleCustomer collections + subcollections) + backendClient.js:4374 + AdminDashboard.jsx:2208. All FIXED in this batch.

**Build clean ✓ 2.81s. Targeted tests 134/134 PASS + V75 chat 63/63 PASS.**

**Still DEFERRED (next session)** — lower-priority + larger-scope:
- S-3 chat_history `allBranches:true` + client-side filter rollback (V76 transition; flip to default branch-scoped post-Rule-M-backfill-soak)
- backendClient.js single-doc `{ id: snap.id, ...snap.data() }` sweep (50+ sites — same V38 class but at getDoc level; lower blast radius because we control be_* writes; separate cleanup)
- ~25 diag/e2e/phase one-shot scripts with same V38 broken spread (NOT production runtime; low priority)
- SP-3 preview-action info disclosure (by design — preview leaks structure, not data)
- P2-10 CORS `*` → explicit allowlist (defense-in-depth; minor)

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
