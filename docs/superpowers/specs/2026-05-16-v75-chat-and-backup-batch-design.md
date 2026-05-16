# V75 — Chat per-branch + Whole-fleet customer backup + Chat noti mute (+ button polish)

> **Date**: 2026-05-16
> **Status**: BRAINSTORM-LOCKED → spec written → user review → writing-plans → impl
> **Origin**: V74 customer-backup L1 hands-on findings (3 items) + 1 NEW request (chat noti mute) from same session
> **Project**: LoverClinic OPD App · master=`b47a6e6` · prod LIVE
> **Owner**: claude (subagent-driven from plan onward; 2-stage code review per task)
> **Scope**: 4 items (1 polish + 3 features); ~30 tasks estimated; mid-size batch (~10-12 hr execution + tests)

---

## 1. Context + signal

V74 (customer per-customer backup + manager) DEPLOYED 2026-05-16 EOD (master=`b47a6e6`). User started Rule Q L1 hands-on (V66 mandate) on the deployed production UI and surfaced 4 distinct items in one screenshot session:

1. **Item 1 (V74 L1 polish)** — `💾 สำรอง` button + 3 other buttons in CustomerDetailView header row have inconsistent heights (2 buttons single-line, 2 buttons wrapped 2-line). Layout looks unfinished.
2. **Item 2 (NEW feature)** — admin wants a one-click "backup ALL customers as a single file" capability for full disaster-recovery + migration scenarios. V74 per-customer is per-record; this is whole-fleet.
3. **Item 3 (architectural gap)** — Frontend chat tab is currently **universal** (shows every branch's `chat_conversations` regardless of top-right BranchSelector). Each branch has its own LINE OA + FB Page (per Phase BS V3 `be_line_configs/{branchId}` for LINE; FB still global). User wants completely separate per-branch chat history + settings.
4. **Item 4 (NEW feature)** — admin wants a per-device toggle that mutes ONLY the chat tab's noti sound + browser notification on a specific machine (use case: doctor opens Frontend for appt + treatment but doesn't answer chats; other notis still need to ring).

User-locked constraints (verbatim, 2026-05-16):
- **Continuity**: "สาขาที่แชทใช้ได้อยู่ตอนนี้คือสาขานครราชสีมานะ ... ต้องใช้ได้แบบต่อเนื่อง ผมไม่ต้องไป setting อะไรใหม่เลยนะ เพราะมันใช้ได้อยู่แล้ว" → zero-downtime; นครราชสีมา admin does ZERO action; existing chat flow keeps working through migration.
- **Other branches**: "สาขาอื่นยังไม่ได้เซ็ตแชท แต่ทำให้รองรับไว้" → schema + settings UI ready; populated when admin sets up later.
- **Noti mute scope**: "ที่ปิดแค่ของ tab chat นะ ... tab อื่นๆ หรือระบบ chat ใน frontend ไม่มีผลกับปุ่มนี้นะ noti อื่นยังดังเหมือนเดิม" → mute applies ONLY to chat tab; appts / staff-chat (V73) / recall pings / other surfaces unaffected.
- **Noti mute device**: "ไว้สำหรับเครื่องของแพทย์ที่ต้องเปิด frontend ... แพทย์ไม่จำเป็นต้องได้รับฟังเสียงหรือตอบแชทใน tab chat" → per-device toggle (doctor's machine), not per-user-account.

---

## 2. Brainstorming decisions locked (Q1–Q4 per item)

User approved all picks via "ok all" + 3 constraint adds.

### Item 1 — Button row polish

- **Q1=A**: normalize all 4 buttons to single-line icon-inline `inline-flex items-center gap-2 px-3 py-2 whitespace-nowrap text-sm`. Compact, consistent, mobile fall-back via `flex-wrap` to 2×2.

### Item 2 — Whole-fleet customer backup

- **Q2a=A**: scope = ALL `be_customers` × V74 per-customer cascade (CD + C11 + CG + CS + CF + CH; AI preserved). Does NOT include branch-level master data (be_branches / be_products / etc.) — V40 BRANCH backup covers that.
- **Q2b=C**: format = ZIP of per-customer V74 JSONs + top-level `manifest.json`. One file per customer (reuses V74 export pipeline 1:1, integrity hash per file); scales to N customers without single-file size limits; restore resumable mid-failure.
- **Q2c=standard-path**: storage = `gs://.../backups/whole-fleet-customers/{ts-rand}/{backup.zip, manifest.json}`. Existing `match /backups/{prefix}/{file=**}` Storage rule already covers this admin-only — NO rule change.
- **Q2d=Q3=B-SAFE-per-customer**: restore = manifest-driven loop; each customer entry runs V74 `customer-restore` flow with Q3=B SAFE semantics (BLOCK customerId-exists + HN-collision; STRIP lineUserId conflicts; ALLOW stale FKs). Returns aggregate `{restored: N, skipped: M, blocked: [{cid, reason}]}`. Idempotent: re-run = 0 writes.

### Item 3 — Chat per-branch (continuity-preserving)

- **Q3a=A**: schema = add `branchId` field on `chat_conversations` documents. Additive (old readers ignore; new readers filter). Undefined → "ไม่ระบุสาขา" UI bucket.
- **Q3b=A**: webhook routing = resolve `branchId` at ingest. LINE: reuse existing `getLineConfigForBranch` (LR-1) reverse-lookup. FB: NEW `be_fb_configs/{branchId}` collection (parallel to be_line_configs); match by Page ID. Legacy unmatched (no per-branch config yet) → fall back to นครราชสีมา branchId (preserves existing flow).
- **Q3c=Rule-M-3-step**: existing chat_conversations migration = Rule M two-phase script. Strategy: (1) stamp `branchId = <นครราชสีมา-id>` on ALL existing rows (this is the only active chat branch per user); forensic `_v75BranchBackfilledAt: serverTimestamp()` + `_v75BranchBackfilledFrom: null` + `_v75BackfillReason: 'sole-active-branch-snapshot'`. (2) Idempotent skip-on-already-stamped. (3) Audit doc to `be_admin_audit/v75-chat-conversation-branch-backfill-{ts}-{rand}`.
- **Q3d=be_fb_configs**: settings split. LineSettingsTab already per-branch via be_line_configs ✓ (no change). NEW FbSettingsTab (parallel structure) + NEW `be_fb_configs/{branchId}` collection. Auto-seed นครราชสีมา's `be_fb_configs/{นครราชสีมา-id}` from existing `clinic_settings/chat_config` on first read (silent migration; admin sees no diff in settings panel). Other branches: empty FB config until admin sets explicitly.

### Item 4 — Chat tab noti mute

- **Q4a=A**: persistence = per-device via `localStorage` key `loverclinic.chatTabMuted.{deviceId}` (reuse V73 `staffChatIdentity` deviceId helper).
- **Q4b=A**: scope = chat tab ONLY. Gates the chat sound trigger + browser `Notification` constructor inside `ChatPanel.jsx`. Untouched: V73 staff-chat widget sound, appointment-due sounds, recall pings, system alerts.
- **Q4c=A**: UI location = chat tab header area (next to existing 🕐 history + ⚙ settings buttons). Icon: 🔔 ↔ 🔕 toggle. ARIA `aria-pressed`.
- **Q4d=A**: visual indicator when muted = icon flip + subtle banner below header `🔕 เครื่องนี้ปิดเสียงแชทอยู่ — แท็บอื่นยังดังปกติ`.

---

## 3. Item 1 — Button row polish (small)

**File**: `src/components/backend/CustomerDetailView.jsx` (button row near top of detail card; ~15 lines).

**Change**: normalize all 4 buttons (`แก้ไข`, `ผูก LINE`, `💾 สำรอง`, `ลบลูกค้า`) to identical Tailwind class:

```jsx
className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium whitespace-nowrap rounded-md border ..."
```

Each button: `<Icon size={16} /><span>{label}</span>` inline. No icon-above-text vertical wrapping. Row uses `flex flex-wrap gap-2` so on narrow viewports (<375px) row collapses to 2×2 grid naturally.

**Verify**: `preview_eval` measures all 4 button `offsetHeight` are equal (within ±2px tolerance for sub-pixel rendering). Visual screenshot captured + attached to PR. No new vitest needed; existing RTL tests for CustomerDetailView re-pass.

**Risk**: minimal. Pure CSS-class change. No behavior diff. Rule N targeted-only.

---

## 4. Item 2 — Whole-fleet customer backup (NEW endpoint + UI + CLI)

### 4.1 Architecture

Parallels V74 single-customer flow; loops over all `be_customers`. Reuses V74 helpers:
- `customerBackupCore.js` — cascade definitions (CD/C11/CG/CS/CF/CH + 8 subcoll + AI-preserved)
- `customerBackupSchema.js` — `buildCustomerBackupFile` + `validateCustomerBackupFile`
- `customerBackupConflict.js` — `scanRestoreConflicts` + `stripLineConflicts`

NEW glue layer: `src/lib/wholeFleetBackupCore.js` — wraps V74 per-customer build + adds:
- `buildWholeFleetManifest({customers, options})` — emits manifest.json shape
- `streamCustomersToZip({customers, zipStream, onProgress})` — async iterator that pipes each customer's V74-built JSON into a ZIP entry; size-limit per zip 4GB (well above 6,500-customer projection).

### 4.2 Endpoints (NEW × 2)

**`POST /api/admin/whole-fleet-customer-backup-export`** (admin-gated via `verifyAdminToken`):
- Request: `{userNote?, includeStorageObjects?: boolean}` (default true)
- Server flow:
  1. Verify admin token + perm gate `customer_management` (mirror V74).
  2. List ALL be_customers via admin SDK (no branch filter — whole-fleet by definition).
  3. For each customer (chunked 50/batch to control memory): call V74 single-customer build → push JSON into ZIP entry `customers/{cid}.json` + Storage objects into `storage/{cid}/{path}`.
  4. Emit `manifest.json` with `{schemaVersion:1, type:'whole-fleet-customers', exportedAt, customerCount, customers:[{cid, hn, displayName, fileEntry, fileHash, storageManifestHash}], totals:{appointmentCount, saleCount, treatmentCount}}`.
  5. Upload ZIP to `gs://.../backups/whole-fleet-customers/{ts-rand}/backup.zip` + manifest to `gs://.../backups/whole-fleet-customers/{ts-rand}/manifest.json`.
  6. Generate 24h signed URLs (both ZIP + manifest).
  7. Emit audit doc `be_admin_audit/whole-fleet-backup-{ts}-{rand}` with full counts + manifest hash + caller uid.
  8. Return `{backupRef, manifestRef, signedUrlZip, signedUrlManifest, customerCount, durationMs, manifestHash}`.
- Errors: per-customer failure isolated (logged in manifest.failedCustomers[]); zip continues. Partial success allowed; admin can re-run for failed entries only.
- Size cap: 5GB Storage object limit; abort with `WHOLE_FLEET_SIZE_EXCEEDED` if exceeds.

**`POST /api/admin/whole-fleet-customer-restore`** (admin-gated):
- Request modes:
  - `{action:'preview', backupRef}` → returns per-customer conflict summary `{wouldRestore:N, wouldSkipBlocked:[{cid,reason}], wouldStripLine:M, wouldAllowStaleFk:K}` WITHOUT writing
  - `{action:'restore', backupRef, confirmManifestHash}` → executes (confirmManifestHash must match server-side recomputed hash; mismatch = tampering, refuse)
- Server flow (restore mode):
  1. Verify admin token + perm gate.
  2. Download backup.zip from Storage; verify ZIP integrity (manifest hash recomputed = client-provided).
  3. Loop manifest.customers: per entry → unzip → V74 `customer-restore` flow with Q3=B SAFE → record `{cid, outcome: 'restored'|'skipped-conflict'|'failed', detail}`.
  4. Emit aggregate audit doc + return `{restored:N, skippedConflict:M, failed:K, durationMs, perCustomer:[{cid, outcome}]}`.
- Resumable: re-running with same backupRef detects already-restored cids (existing customer + matching docHash) → skip silently. Idempotent.

### 4.3 UI

**`BackupManagerTab.jsx`** (V74's existing manager tab):
- NEW button at top: `📦 สำรองลูกค้าทุกคน` (orange/amber border to distinguish from per-customer 💾)
- Opens NEW `WholeFleetBackupModal.jsx`:
  - Section 1: customer count preview (`be_customers` count + total cascade size estimate)
  - Section 2: optional `userNote` textarea (label "หมายเหตุ (เช่น 'สำรองก่อน migration')")
  - Section 3: confirm button "สำรองทั้งระบบ" → POST to export endpoint
  - Section 4: progress bar (uses streaming response chunks; estimated 30sec–2min for ~6,500 customers)
  - Section 5: result panel — count + size + download link + signed URL
- NEW row in BackupManagerTab list: whole-fleet backups listed with type badge `📦 whole-fleet` (distinct from `💾 customer`); same rename / delete / bulk-delete modals as customer backups (reuse).
- NEW restore button per whole-fleet backup row: 🔄 → opens `WholeFleetRestoreModal.jsx` (preview → confirm → progress → result).

**Permission**: admin-only via existing `TAB_PERMISSION_MAP` (BackupManagerTab is already admin-only; no change).

### 4.4 CLI

NEW `scripts/whole-fleet-customer-backup-export.mjs` + `scripts/whole-fleet-customer-restore.mjs` (Rule M canonical pattern: env-load + admin-SDK + invocation guard + dry-run-by-default + --apply commit + audit doc).

### 4.5 Testing

T1–T10 categories mirror V74:
- T1: schema validator (buildWholeFleetManifest shape + integrity hash chain)
- T2: cross-branch identity preservation (manifest.customers[].branchId stamps correctly per record)
- T3: subcollection round-trip (per-customer T4 subcoll cascade intact)
- T4: conflict resolution at scale (preview returns correct aggregate counts)
- T5: audit-immutable preservation (AI rows pass through unchanged)
- T6: tampering detection (manifest hash mismatch → restore aborts)
- T7: per-customer failure isolation (1 failure does not abort the batch)
- T8: idempotency (re-run = 0 writes after success)
- T9: concurrency (export + new customer add mid-export → manifest sees consistent snapshot via single Firestore query)
- T10: manager-tab UI (whole-fleet backups appear with correct badge + rename/delete/bulk work)

Plus consolidated adversarial bank (mirror V74's 22-test bank):
- 6,500-customer fixture (mock be_customers list) → manifest builds in <30sec
- Empty fleet (0 customers) → empty backup with valid manifest
- Unicode customer names (Thai full-width + NFC vs NFD) → preserved in zip entries
- 20-MB-customer (worst-case with full image cascade) → still zips correctly

Plus 1 live admin-SDK e2e on real prod (`scripts/e2e-v75-whole-fleet-backup-real-prod.mjs`) with TEST-V75-WF-* fixture customers (≤10 fixtures, isolated cleanup at end).

### 4.6 AV56 invariant (NEW)

```
AV56 — Whole-fleet customer backup integrity (V75, 2026-05-17)
       Every whole-fleet backup export MUST:
       (a) emit manifest.json with computed manifestHash covering all
           customer file hashes + Storage manifest hashes (NOT including
           userNote — V74 Q5b=Y precedent);
       (b) per-customer file integrity hash mirrors V74 file format
           (bodyHash + storageManifestHash);
       (c) restore endpoint MUST recompute manifestHash server-side and
           reject mismatched confirmManifestHash with
           WHOLE_FLEET_MANIFEST_TAMPERED error;
       (d) per-customer restore failures MUST be isolated (one failure
           does not abort the batch).
       Sanctioned exceptions: NONE.
```

Source-grep regression at `tests/v75-whole-fleet-backup-av56.test.js`.

---

## 5. Item 3 — Chat per-branch (architectural · BSA gap-close · Rule M migration)

### 5.1 Architecture

Phase BS V3 extended LINE webhook to per-branch via `be_line_configs/{branchId}`. Chat HISTORY surface (Frontend chat tab) lagged adoption — `chat_conversations` collection stays universal, reader unfiltered. V75 closes this with parallel approach for FB + Rule M migration for existing data + BS-16 invariant.

### 5.2 Schema changes

**`chat_conversations` document** (additive):
- NEW `branchId: string` field (kebab-case branch id, e.g. `BR-1777095572005-ae97f911` for นครราชสีมา)
- NEW `branchIdSource: 'webhook-line'|'webhook-fb'|'backfill-v75-sole-active'|'manual-admin'` (forensic trail; helps debug routing issues)
- Existing fields untouched

**`be_fb_configs/{branchId}` collection** (NEW; parallel to be_line_configs):
- Fields: `pageId, pageAccessToken, verifyToken, appSecret, displayName, enabled, createdAt, updatedAt, createdBy, updatedBy`
- Auto-seed: when admin opens FbSettingsTab for นครราชสีมา branch the FIRST TIME, missing `be_fb_configs/{นครราชสีมา-id}` → server-side seed from existing `clinic_settings/chat_config` (silent migration — admin sees existing creds pre-populated; no admin action needed).
- Permission: admin-write only (mirror be_line_configs); clinic-staff read for FbSettingsTab.

**`clinic_settings/chat_config`**: PRESERVED as legacy fallback. Webhook fallback chain: `be_fb_configs/{branchId-by-page-id}` → `clinic_settings/chat_config` (nominal นครราชสีมา). After full migration + admin removes legacy, fallback retired.

### 5.3 Webhook routing (continuity-preserving)

**`api/webhook/line.js`** (already has `getLineConfigForBranch` reverse-lookup from LR-1):
- Extract destination userId from `events[].source.userId` OR LINE signature → match against `be_line_configs/{branchId}.channelId`
- Found → stamp `chat_conversations.branchId = matchedBranchId` + `branchIdSource: 'webhook-line'`
- Not found (multi-branch with mismatched channel) → log warning + stamp นครราชสีมา branchId fallback + `branchIdSource: 'webhook-line-fallback-noratchasima'` (visible in admin audit for debugging)
- **Continuity contract**: existing นครราชสีมา LINE webhook hits → matched via existing be_line_configs/{นครราชสีมา-id} that the admin already has set up → branchId correctly stamped → admin sees new chats in นครราชสีมา branch view AS BEFORE

**`api/webhook/facebook.js`** (currently global via `clinic_settings/chat_config`):
- NEW: read pageId from incoming webhook payload (`entry[].id` = FB Page ID)
- Match against `be_fb_configs/{branchId}.pageId` (Firestore `where('pageId','==', pid)`)
- Found → stamp `chat_conversations.branchId = matchedBranchId` + `branchIdSource: 'webhook-fb'`
- Not found → fall back to `clinic_settings/chat_config` (legacy global) + stamp นครราชสีมา branchId + `branchIdSource: 'webhook-fb-fallback-legacy'`
- **Continuity contract**: existing FB Page hits → fall through legacy path → stamp นครราชสีมา branchId → admin sees new FB chats in นครราชสีมา branch view AS BEFORE
- After admin auto-seeds นครราชสีมา's `be_fb_configs/{นครราชสีมา-id}` (happens silently on FbSettingsTab first open), subsequent FB hits match the new doc cleanly + retire the fallback path eventually

**`api/webhook/send.js`** (admin-side outbound message): no branchId stamp needed — replies write to existing chat_conversation doc which already has branchId from inbound webhook. Verified via `chat_conversations` field-preservation pattern.

### 5.4 Rule M migration (one-shot, local + admin-SDK)

NEW `scripts/v75-backfill-chat-conversations-branchid.mjs`:
1. Pull env: `vercel env pull .env.local.prod --environment=production`
2. Init admin SDK + use canonical path `artifacts/{APP_ID}/public/data/chat_conversations`
3. Scan ALL `chat_conversations` documents (paginated 500/batch).
4. Dry-run report: count missing-branchId + count already-stamped + sample 10 doc IDs.
5. `--apply` mode: stamp `branchId = <นครราชสีมา-id>` + `branchIdSource: 'backfill-v75-sole-active'` + `_v75BranchBackfilledAt: serverTimestamp()` + `_v75BranchBackfilledFrom: null` on every doc missing branchId.
6. Idempotent: re-run skips already-stamped (where exists `branchId`).
7. Audit doc to `be_admin_audit/v75-chat-conversation-branch-backfill-{ts}-{rand}` with full counts + sample (10 stamped + 10 skipped) + caller info.

**The นครราชสีมา ID**: looked up at script start via `be_branches` query `where('name','==','นครราชสีมา')` OR admin passes `--branch-id=<id>` flag to be explicit. Script aborts if zero or >1 match.

### 5.5 UI (Frontend chat tab)

**Reader migration** (`src/components/ChatPanel.jsx`):
- Existing `onSnapshot(query(chat_conversations, orderBy('lastMessageAt','desc')))` → migrate to NEW `listenToChatConversationsByBranch(onChange, onError)` in `scopedDataLayer.js`
- Layer 2 (scopedDataLayer): auto-injects `where('branchId','==',resolveSelectedBranchId())` (BSA Layer 2 canonical pattern; mirrors `listenToAppointmentsByDate`)
- Layer 3 (useBranchAwareListener hook): auto re-subscribes on branch switch (Phase BS V2 canonical)
- Backendclient.js (Layer 1): NEW `listenToChatConversationsByBranch({branchId, allBranches})` parametrized listener (V54 BS-13 safe-by-default — empty branchId + !allBranches → empty result + noop unsub)

**Empty-state UX**: when admin switches to a branch with no chats yet (e.g. ทดลอง 1 in the user's screenshot), chat tab shows:
```
ยังไม่มีการสนทนาในสาขานี้

[ตั้งค่าแชท LINE OA →] [ตั้งค่าแชท FB Page →]
```
Both links navigate to respective settings tabs scoped to current branch.

**Optional admin override** (V75-bis polish, NOT in initial ship): admin can re-stamp a legacy chat to a different branch via 1-click in chat header. Out of scope for V75 initial; tracked for follow-up.

### 5.6 Settings (LineSettingsTab + NEW FbSettingsTab)

**`LineSettingsTab.jsx`**: already per-branch via `be_line_configs/{branchId}` (Phase BS V3). NO change in V75. Branch switch via top-right selector → tab re-reads matching be_line_configs doc.

**`FbSettingsTab.jsx`** (NEW; ~250 LOC; copy LineSettingsTab structure):
- Section 1: Channel credentials (pageId / pageAccessToken / appSecret / verifyToken) — password-toggle on secrets
- Section 2: Auto-seed indicator (when first opened for นครราชสีมา branch, banner "🔄 ดึงค่าจาก clinic_settings/chat_config — กดบันทึกเพื่อยืนยัน")
- Section 3: Test connection button (calls `/api/admin/fb-test`)
- Section 4: Enable/disable toggle (per-branch)
- Section 5: webhook URL with copy (`https://<vercel-url>/api/webhook/facebook?branchId={branchId}` — query param optional; webhook prefers Page ID match)

**NEW endpoint**: `POST /api/admin/fb-config-by-branch` (GET + PUT modes; admin-gated; validates required fields; idempotent for unchanged).
**NEW endpoint**: `POST /api/admin/fb-test` (admin-gated; mirrors LINE test endpoint pattern; pings FB Graph API `/me` with provided token; returns success / failure + error reason).

**Nav wiring**: NEW tab `fb-settings` added to navConfig.js next to existing `line-settings`. Admin-only via TAB_PERMISSION_MAP. Icon: 📘 (FB Messenger blue) / label "ตั้งค่า FB Page".

### 5.7 BS-16 invariant (NEW)

```
BS-16 — chat_conversations branch-scope discipline (V75, 2026-05-17)
        Every chat_conversations document write (via webhook or admin tool)
        MUST stamp `branchId` resolved from `be_line_configs/{branchId}` or
        `be_fb_configs/{branchId}` reverse-lookup, OR fall back to legacy
        นครราชสีมา branchId with `branchIdSource: '*-fallback-*'`.
        Every UI reader of chat_conversations MUST go through
        `listenToChatConversationsByBranch` from scopedDataLayer.js
        (Layer 2 auto-inject) OR be annotated
        `// audit-branch-scope: BS-16 admin-cross-branch-tool` (sanctioned:
        future admin re-stamp tool — currently NONE).
        Sanctioned exceptions list: closed (no callers today).
```

Source-grep regression at `tests/audit-branch-scope.test.js` (+BS-16.x block). audit-branch-scope SKILL.md: 15 → 16 invariants.

### 5.8 AV57 invariant (NEW)

```
AV57 — Chat webhook branchId stamp (V75, 2026-05-17)
       Every `api/webhook/*.js` that writes `chat_conversations` MUST:
       (a) resolve branchId from credential lookup (LINE channel /
           FB Page ID) before write;
       (b) stamp `branchId` + `branchIdSource` field on every set/update;
       (c) fall back to นครราชสีมา + 'fallback-*' source label on miss
           (NEVER omit branchId entirely — would create unfilterable orphan);
       (d) emit warning log on fallback path for admin visibility.
       Sanctioned exceptions: NONE.
```

Source-grep regression at `tests/v75-chat-webhook-branchid-stamp-av57.test.js`. audit-anti-vibe-code SKILL.md: AV55 → AV58 (this entry + AV56 from Item 2 + AV58 from Item 4).

### 5.9 Probe-Deploy-Probe extension

Rule B current list (6 endpoints incl. V74 #11). V75 changes:
- **Firestore rules**: NEW match for `be_fb_configs/{branchId}` (clinic-staff read, admin write — mirror be_line_configs)
- **Probe #12 (NEW)**: anon WRITE to `be_fb_configs/{any}` → expect 403 (admin-only)

NO storage rule changes (no new Storage paths).

### 5.10 Testing (Item 3)

**Continuity tests** (CRITICAL — proves zero-downtime promise):
- C1: existing นครราชสีมา chat_conversations after migration → admin opens chat tab → all chats visible (count + content identical)
- C2: existing LINE webhook payload → still creates chat_conversations correctly + new doc has branchId=นครราชสีมา-id stamped
- C3: existing FB webhook payload (pre-be_fb_configs setup) → falls through legacy `clinic_settings/chat_config` + new doc has branchId=นครราชสีมา-id via fallback path
- C4: admin opens LineSettingsTab for นครราชสีมา → existing creds visible (no diff)
- C5: admin opens FbSettingsTab for นครราชสีมา (first time) → auto-seed banner + pre-populated form from clinic_settings/chat_config

**New-branch tests**:
- N1: admin switches to ทดลอง 1 branch → chat tab shows empty + 2 setup links
- N2: admin sets up be_line_configs/{ทดลอง-1-id} → webhook receives ทดลอง 1 LINE OA message → stamps correct branchId → admin sees new chat under ทดลอง 1 branch view
- N3: admin sets up be_fb_configs/{ทดลอง-1-id} → FB webhook receives → stamps correct branchId → admin sees under ทดลอง 1
- N4: admin switches back to นครราชสีมา → ทดลอง 1 chats NOT visible (branch isolation)

**BS-16 audit invariant tests** (8 sub-tests in tests/audit-branch-scope.test.js)

**AV57 source-grep regression**: NEW `tests/v75-chat-webhook-branchid-stamp-av57.test.js`

**Live admin-SDK e2e**: NEW `scripts/e2e-v75-chat-per-branch-real-prod.mjs` (creates TEST-V75-CHAT-* fixture chat_conversations with explicit branchId stamps; verifies branch filter; cleans up).

**Rule M migration tests**: dry-run on real prod scans actual chat_conversations count; --apply on TEST-V75-CHAT-* fixtures only (NOT real chats; user runs --apply on real data manually after spec review).

---

## 6. Item 4 — Chat tab noti mute (per-device localStorage)

### 6.1 Helper module

NEW `src/lib/chatNotificationMute.js` (pure JS, ~50 LOC). **DISTINCT from** V73 staff-chat-widget mute (`src/lib/staffChatIdentity.js` `getMuted/setMuted` — different surface, different storage key, separate AV58 invariant guard):

```javascript
// Per-device chat-tab (Frontend chat tab) notification mute (V75 Item 4).
// localStorage key per deviceId so doctor's machine can mute without
// affecting other staff devices.
//
// NOT to be confused with V73 staffChatIdentity.getMuted/setMuted — those
// mute the V73 staff-chat widget overlay (src/components/staffchat/),
// a separate surface with its own storage key. AV58 enforces no
// cross-import between the two helpers.

import { getDeviceId } from './staffChatIdentity.js';

const KEY_PREFIX = 'loverclinic.chatTabMuted.';

export function isChatTabMuted(deviceId = getDeviceId()) {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    return window.localStorage.getItem(KEY_PREFIX + deviceId) === '1';
  } catch { return false; }
}

export function setChatTabMuted(muted, deviceId = getDeviceId()) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (muted) window.localStorage.setItem(KEY_PREFIX + deviceId, '1');
    else window.localStorage.removeItem(KEY_PREFIX + deviceId);
  } catch { /* swallow quota errors */ }
}

export function toggleChatTabMute(deviceId = getDeviceId()) {
  const next = !isChatTabMuted(deviceId);
  setChatTabMuted(next, deviceId);
  return next;
}
```

### 6.2 ChatPanel.jsx integration

- Import `isChatTabMuted` + `toggleChatTabMute` from helper.
- NEW state: `const [muted, setMuted] = useState(isChatTabMuted())`
- Wrap existing sound trigger (Web Audio API double-beep at line 44+) in `if (!muted)` gate.
- Wrap existing browser `Notification` constructor (if any) in same gate.
- NEW button in chat header: `<button onClick={() => setMuted(toggleChatTabMute())} aria-pressed={muted} title={muted ? 'เปิดเสียงแจ้งเตือนแชท (เครื่องนี้)' : 'ปิดเสียงแจ้งเตือนแชท (เครื่องนี้)'}>{muted ? '🔕' : '🔔'}</button>`
- When `muted`: render subtle banner below chat header: `<div className="text-xs text-amber-400 bg-amber-950/30 px-3 py-1 rounded">🔕 เครื่องนี้ปิดเสียงแชทอยู่ — แท็บอื่นยังดังปกติ</div>`

### 6.3 V12 multi-reader-sweep guard

Audit grep ensures ONLY ChatPanel.jsx sound-trigger is gated. Other sound-triggers (V73 staff-chat widget at `src/components/staffchat/StaffChatWidget.jsx` + `StaffChatHeader.jsx`, appointment-due chimes, recall pings) MUST NOT import or check `isChatTabMuted` — they have their own V73 mute via `staffChatIdentity.getMuted/setMuted` (separate storage key). Source-grep regression at `tests/v75-chat-noti-mute-scope-av58.test.js`.

### 6.4 AV58 invariant (NEW)

```
AV58 — Chat noti mute scope discipline (V75, 2026-05-17)
       The chatNotificationMute helper (isChatTabMuted) MAY ONLY be
       imported by ChatPanel.jsx (Frontend chat tab). Other sound-trigger
       sites (staff-chat widget, appointment pings, recall pings, system
       alerts) MUST NOT import this helper — would violate the user's
       explicit scope: "ปิดแค่ของ tab chat ... noti อื่นยังดังเหมือนเดิม".
       Sanctioned exceptions: NONE (closed list).
```

### 6.5 Testing

- Helper unit: `tests/v75-chat-noti-mute-helper.test.js` — toggle + persist + read across reload-simulation + invalid deviceId fallback + localStorage quota-exceed graceful
- ChatPanel RTL: `tests/v75-chat-panel-mute-rtl.test.jsx` — click mute button → sound fn not invoked on next message + visual indicator + click unmute → sound fires again
- Multi-reader-sweep: `tests/v75-chat-noti-mute-scope-av58.test.js` — grep proves StaffChatWidget + appt-due + recall sound-triggers do NOT import helper

---

## 7. Cross-cutting invariants + V-entries

### 7.1 New AV / BS invariants summary

| Code | Title | File | Test |
|---|---|---|---|
| AV56 | Whole-fleet backup integrity | audit-anti-vibe-code | v75-whole-fleet-backup-av56.test.js |
| AV57 | Chat webhook branchId stamp | audit-anti-vibe-code | v75-chat-webhook-branchid-stamp-av57.test.js |
| AV58 | Chat noti mute scope | audit-anti-vibe-code | v75-chat-noti-mute-scope-av58.test.js |
| BS-16 | chat_conversations branch-scope | audit-branch-scope | audit-branch-scope.test.js (+BS-16.x block) |

### 7.2 V75 V-entry composition

V75 V-entry in `.claude/rules/00-session-start.md` § 2 PAST VIOLATIONS table covers all 4 items as a coherent batch:

```
V75 — V74 L1 polish + chat per-branch + chat noti mute + whole-fleet backup
     (2026-05-17, 4-item batch from V74 L1 hands-on)
- Item 1: 4 buttons in CustomerDetailView normalized to inline-flex single-line
- Item 2: whole-fleet customer backup ZIP + manifest (AV56)
- Item 3: chat_conversations.branchId schema + 2 webhook updates +
         be_fb_configs/{branchId} + FbSettingsTab + Rule M backfill
         (BS-16 + AV57 + Probe #12)
- Item 4: per-device chat tab noti mute via localStorage (AV58)
- Continuity: นครราชสีมา admin does ZERO action; existing chat flow uninterrupted
- Class-of-bug: V12 multi-reader-sweep at chat_conversations reader (closed by BS-16)
```

Verbose entry in `.claude/rules/v-log-archive.md` with full lessons + test catalog + file inventory.

### 7.3 Test prefix discipline

Per V33.10–V33.14 prefix conventions, V75 fixtures:
- `TEST-V75-WF-CUST-*` / `E2E-V75-WF-CUST-*` — whole-fleet backup fixtures
- `TEST-V75-CHAT-*` / `E2E-V75-CHAT-*` — chat_conversations fixtures
- `TEST-V75-FB-*` — be_fb_configs fixtures

### 7.4 Rule N — targeted-test-only during iteration

Per Rule N: small fixes use targeted vitest runs during iteration. Full `npm test -- --run` mandatory at batch end (before commit + deploy). Estimated full-suite ~90sec; one run at end is acceptable.

### 7.5 Rule Q (V66) — adversarial verification mandate

Per Rule Q: NO claim "verified / shipped / done" for user-visible code without L1 (real-browser Playwright) or L2 (real client SDK) evidence. V75 includes:
- L2 evidence via admin-SDK e2e scripts (`scripts/e2e-v75-*.mjs`) with TEST-prefixed fixtures
- L1 evidence DEFERRED to user (post-deploy Rule Q L1 hands-on per § 8 acceptance criteria below)

---

## 8. Acceptance criteria (Rule Q L1 hands-on by user post-deploy)

After deploy, user walks through these 8 scenarios on the real production UI:

### Item 1 — Button polish
1. Open any customer detail page (e.g. `LC-26000001` or `นาย นิรุต`) → 4 buttons (`แก้ไข` / `ผูก LINE` / `💾 สำรอง` / `ลบลูกค้า`) appear in single row, equal heights, no text wrap.

### Item 2 — Whole-fleet backup
2. Open BackupManagerTab → click `📦 สำรองลูกค้าทุกคน` → confirm modal → progress bar → result panel shows customer count + zip size + download link → download verifies as valid ZIP with `manifest.json` + `customers/{cid}.json` × N + `storage/{cid}/...`.
3. Click 🔄 restore on a whole-fleet backup → preview shows expected conflict counts → confirm → progress bar → result panel shows `{restored: N, skippedConflict: M, failed: 0}`.

### Item 3 — Chat per-branch
4. **Continuity**: switch to นครราชสีมา branch → open chat tab → all existing chats visible (count + content identical to pre-V75). Open LineSettingsTab → existing creds visible. Open FbSettingsTab → auto-seed banner + pre-populated form from `clinic_settings/chat_config` → click save → verify no broken state.
5. **New branch**: switch to ทดลอง 1 branch → open chat tab → empty state + 2 setup links visible. Click LineSettings link → empty form (no existing creds). Set up LINE creds → save → simulate LINE OA message → verify chat appears under ทดลอง 1 only (NOT นครราชสีมา).
6. **FB setup**: switch to ทดลอง 1 → FbSettingsTab → set up FB creds → save → simulate FB Page message → chat appears under ทดลอง 1 only.

### Item 4 — Noti mute
7. Doctor's machine: open Frontend chat tab → click 🔔 → flips to 🔕 + banner appears. Send test LINE message → no chat sound + no browser noti. Open appointment list → due-appointment chime STILL rings (separate scope). V73 staff-chat widget: send test message in staff chat → STILL rings. Click 🔕 → reverts to 🔔 → chat sound resumes.
8. **Per-device isolation**: front desk machine → chat tab unmuted; doctor machine muted; send test LINE → only front desk hears sound.

---

## 9. Out of scope (V75)

- **Bulk admin re-stamp tool** for chat_conversations to a different branch (V75 stamps via webhook + Rule M backfill; manual re-classification is V75-bis)
- **Multi-channel-per-branch LINE** (LINE allows 1 channel per branch in current architecture)
- **FB webhook tokens rotation UI** (admin uses Vercel env for now; UI is V76)
- **Whole-fleet backup retention policy** (V40 AV19 grace works at per-backup level; whole-fleet uses same 72h grace)
- **Per-branch chat history retention policy** (FB+LINE chats currently 7-day cleanup via Cloud Function; not changing)

---

## 10. Risks + mitigations

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Webhook branchId resolution misses → orphan chat_conversations | LOW | MEDIUM (chat invisible to admin) | Fallback to นครราชสีมา branchId + `*-fallback-*` source label; admin sees in audit log; AV57 enforces stamp |
| Whole-fleet backup exceeds 5GB Storage object limit | LOW-MEDIUM (depends on customer count + image cascade) | HIGH (export fails) | Pre-check via customer count + cascade size estimate; emit `WHOLE_FLEET_SIZE_EXCEEDED` cleanly with admin guidance to use per-customer backups |
| Migration backfill stamps wrong branchId for legacy chats | LOW (only 1 active branch = นครราชสีมา) | MEDIUM (admin re-stamps via V75-bis tool when shipped) | Dry-run before --apply; forensic-trail fields enable rollback via inverse update |
| `be_fb_configs` auto-seed clobbers existing custom config | LOW | LOW | Only seeds when doc is missing; existing doc preserved; admin sees banner; explicit save confirms |
| Chat tab mute leaks to other surfaces (V12 multi-reader-sweep) | LOW | MEDIUM | AV58 source-grep regression + explicit RTL test asserting StaffChatWidget/appt/recall sound triggers unchanged |
| FbSettingsTab UI breaks existing FB webhook flow | LOW | HIGH (FB chat dead) | Legacy `clinic_settings/chat_config` fallback retained; FbSettingsTab only writes to NEW `be_fb_configs/{branchId}`; webhook reads both sources |

---

## 11. Deploy plan

All work LOCAL until user explicit "deploy" THIS turn (V18 lock). Estimated batch deploy:
1. `vercel --prod --yes` (frontend + new endpoints)
2. `firebase deploy --only firestore:rules` (NEW match for be_fb_configs/{branchId})
3. Probe-Deploy-Probe with NEW Probe #12 (anon write be_fb_configs/{any} → expect 403)
4. After deploy: admin manually runs `scripts/v75-backfill-chat-conversations-branchid.mjs --apply` on real prod (Rule M local + admin-SDK; user authorizes)
5. Rule Q L1 hands-on per § 8

NO storage.rules change (no new Storage paths).

---

## 12. Open questions (none — all decisions locked in § 2)

All design decisions locked via "ok all" + 3 constraint adds + Item 4 picks approved. Proceeding to writing-plans.

---

## 13. References

- V74 spec: `docs/superpowers/specs/2026-05-16-customer-backup-restore-design.md`
- V73 staff-chat widget (deviceId helper): `src/lib/staffChatIdentity.js`
- Phase BS V3 LINE Reminder (per-branch precedent): `.claude/rules/00-session-start.md` § "BSA Phase 22.0c"
- Phase BS V2 Branch-Scope Architecture: `src/lib/scopedDataLayer.js` + `src/hooks/useBranchAwareListener.js`
- Rule M data ops: `.claude/rules/01-iron-clad.md` Rule M
- Rule Q V66 real-adversarial verification: `.claude/rules/01-iron-clad.md` Rule Q
- audit-branch-scope skill: `.agents/skills/audit-branch-scope/SKILL.md`
- audit-anti-vibe-code skill: `.agents/skills/audit-anti-vibe-code/SKILL.md`
