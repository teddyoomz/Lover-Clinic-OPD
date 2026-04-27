# 2026-04-28 (session 21) — Bug 2 v3 + v4 + V15 #2 deploy

## Summary

User reported via QA on the s20 V15 deploy:
1. "Movement log สาขาหลักไม่ขึ้นเหี้ยไรเลย" → Bug 2 v3 fix (legacy-main fallback)
2. "stock movement เป็นอันเดียวกัน ซ้ำกันทั้งสองหน้า ซึ่งผิด" → Bug 2 v4 fix (single-tier + counterparty label)

Single-session arc: 2 commits + V15 #2 combined deploy.
**2214/2214 tests pass · prod=e46eda2 LIVE**.

## Current State

- master = `e46eda2` · 2214/2214 vitest green · build clean
- Production = `e46eda2` LIVE — V15 #2 combined deploy complete
- Working tree clean

## 2 Commits (this session)

```
e46eda2 fix(stock): bug 2 v4 — single-tier movement log + counterparty label
de90130 fix(stock): bug 2 v3 — listStockMovements legacy-main fallback for default branch
```

## Bug 2 v3: legacy-main fallback (de90130)

**User report**: "โอนย้ายหรือเบิกของระหว่างสาขาหลักกับคลังกลาง แล้ว movement log ของสาขาหลักไม่ขึ้นเหี้ยไรเลย ยังเป็นอยู่"

**Root cause**: ID-mismatch between BranchContext (post-V20 returns `BR-XXX`) and stock data (`branchId='main'` because `listStockLocations()` line 5510 hardcodes `id:'main'` for the main branch). Default branch view at BR-XXX never matched 'main' data → invisible.

**Fix**: legacy-main fallback in `listStockMovements` (mirrors Phase F's `listStockBatches` pattern).
- Reader: when `includeLegacyMain=true` AND `branchIdStr !== 'main'`, expand match set to `[branchIdStr, 'main']`
- MovementLogPanel: gates `includeLegacyMain` on stock-tab + default-branch detection (no override + branches has matching isDefault entry OR BRANCH_ID === 'main')
- Central tier + non-default branches stay strict

## Bug 2 v4: single-tier + counterparty label (e46eda2)

**User correction**: "stock movement มึงเป็นอันเดียวกัน ซ้ำกันทั้งสองหน้าแล้ว ซึ่งผิด"

**Root cause**: My v2/v3 fix added cross-branch alias via `m.branchIds.some(b => aliases.includes(b))` → each movement visible from BOTH endpoints → 2× duplication. WRONG.

**Correct architecture per user spec**:
- Each movement at OWN tier only (NOT duplicated)
- Korat → Central transfer:
  - Korat sees ONE row: "ส่งออกไป คลังกลาง" (EXPORT_TRANSFER, type 8)
  - Central sees ONE row: "รับเข้าจาก สาขาโคราช" (RECEIVE, type 9)
- Withdrawal:
  - Source sees: "เบิกโดย {requester}" (EXPORT_WITHDRAWAL, type 10)
  - Destination sees: "รับเบิกจาก {supplier}" (WITHDRAWAL_CONFIRM, type 13)

**Fix**:
- Reader (`listStockMovements`): drop `branchIds.some(...)` check; filter by `branchId === alias` only (with legacy-main fallback retained)
- UI (`MovementLogPanel`):
  - NEW const `COUNTERPARTY_TEMPLATES = { 8: 'ส่งออกไป', 9: 'รับเข้าจาก', 10: 'เบิกโดย', 13: 'รับเบิกจาก' }`
  - NEW `getCounterpartyId(m)`: picks branchIds entry NOT equal to m.branchId
  - NEW `resolveCounterpartyName(id)`: locations → branches → fallback to id
  - Render: cross-tier types use `"{template} {counterpartyName}"`, legacy/single-tier falls back to TYPE_LABELS
  - `data-testid="movement-type-label"` for preview_eval
  - `listStockLocations()` fetched on mount

**Why `branchIds[]` field still written** (Phase E preserved):
- Used by UI for counterparty NAME, NOT for branch matching
- Removing the cross-branch alias from reader is the architectural fix

**Tests**:
- ML.A.3 + ML.G.4 flipped: assert NO `branchIds.some()` in source (V21 anti-regression)
- ML.B simulate updated to single-tier semantics
- ML.B.1/.2/.3/.6/.8/.12 expectations flipped: each branch sees its OWN tier only
- ML.I (NEW, 8 source-grep tests): COUNTERPARTY_TEMPLATES + getCounterpartyId + resolveCounterpartyName + label rendering
- ML.I-sim (NEW, 7 functional tests): label resolution simulate covering type 8/9/10/13 + legacy fallback + non-cross-tier + V14 lock
- AU.E flipped: V4 single-tier audit, 6 tests verify each tier sees only own movements
- AU.E.6 NEW: cross-tier RECEIVE NOT visible from source side

## V15 #2 combined deploy (this session — explicit "deploy" auth)

**Pre-probe** (6 positive + 4 negative): all ✓
- chat_conversations POST → 200
- pc_appointments PATCH → 200
- clinic_settings/proclinic_session PATCH → 200
- clinic_settings/proclinic_session_trial PATCH → 200
- opd_sessions anon CREATE → 200 (V23/V27)
- opd_sessions anon PATCH whitelisted → 200
- be_customer_link_tokens (negative) → 403
- be_link_requests (negative) → 403
- be_course_changes (negative) → 403
- be_central_stock_orders (negative) → 403

**Deploy** (parallel):
- `vercel --prod --yes` → 55s · `lover-clinic-gbhf7r5hv-teddyoomz-4523s-projects.vercel.app` aliased `lover-clinic-app.vercel.app`
- `firebase deploy --only firestore:rules` → released to cloud.firestore (no rule changes; clean redeploy)

**Post-probe**: 6/6 positive 200 + 4/4 negative 403 ✓ (matches pre-probe)

**Cleanup**:
- DELETE pc_appointments/test-probe-{TS_PRE}: 200 ✓
- DELETE pc_appointments/test-probe-{TS_POST}: 200 ✓
- PATCH clinic_settings/proclinic_session strip probe: 200 ✓
- PATCH clinic_settings/proclinic_session_trial strip probe: 200 ✓

**HTTP smoke**:
- `https://lover-clinic-app.vercel.app/` → 200 ✓
- `https://lover-clinic-app.vercel.app/admin` → 200 ✓
- `https://lover-clinic-app.vercel.app/api/webhook/line` → 200 ✓

## Decisions (1-line each)

1. **v3 first, v4 next** — split into 2 commits because v3 was correct (legacy-main fallback for ID-mismatch) but v4 needed a course correction (cross-branch alias was wrong). Each commit ships independently green.
2. **Keep `branchIds[]` written** despite reader not using for filter — UI uses it for counterparty NAME resolution.
3. **Counterparty templates inline** — no shared module. The 4 entries are clinic-domain-specific, unlikely to be reused elsewhere.
4. **resolveCounterpartyName lookup chain**: locations (covers 'main' + WH-*) → branches (be_branches BR-*) → fallback to id. Future-proof for multi-branch.
5. **Tests flipped per V21 lesson**: when refactoring, flip the regression guard to assert NEW pattern; don't keep it locked to OLD shape. Applied to ML.A.3/.G.4 + AU.E.

## V-entries to lock

(none new — all existing V-lessons applied as guards)

- **V11 (mock-shadowed export)**: re-export-from doesn't create local binding (s20 fix preserved)
- **V14 (no-undefined leaves)**: counterparty resolution returns string never undefined (ML.I-sim.7)
- **V21 (source-grep can lock broken behavior)**: Phase E branchIds dual-query → flipped to single-tier in v4. ML.A.3 + ML.G.4 + AU.E.1-6 flipped.
- **V31 (no silent-swallow)**: legacy-main fallback uses `console.warn`, not `'continuing'`.

## Next Todo

**Live QA verification needed**:
- Korat → Central transfer: ONE row each tier with correct counterparty label
- Withdrawal between Central and Branch: same one-side semantics
- สาขาหลัก (default branch) post-V20 with legacy 'main' data: now shows transfers via legacy-main fallback

**Deferred**:
- ActorPicker branchIds[] filter (Phase 15.5)
- Phase 15.4 central→branch dispatch flow
- Phase 15.5 withdrawal approval admin endpoint (types 15/16 emit)

**Admin tasks (carry-over)**:
- LineSettingsTab credentials + webhook URL paste
- Backfill customer IDs (V33.4 admin-mediated linking)
- TEST-/E2E- customer ID prefix convention adoption

## Resume Prompt

```
Resume LoverClinic — continue from 2026-04-28 s21 (post V15 #2 deploy).

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=e46eda2, prod=e46eda2 LIVE)
3. .agents/active.md (2214 tests pass; bug 2 v3 + v4 deployed)
4. .claude/rules/00-session-start.md
5. .agents/sessions/2026-04-28-session21-bug2-v3-v4-deploy.md

Status: master=e46eda2 == prod=e46eda2 LIVE. 2214/2214 tests pass.
Movement log architecture corrected: single-tier per movement, counterparty
NAME shown via branchIds[] metadata. NOT duplicated on both sides.

Next: Live QA verification of single-tier + counterparty labels.

/session-start
```
