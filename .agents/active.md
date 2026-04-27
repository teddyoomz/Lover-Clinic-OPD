---
updated_at: "2026-04-28 (s21 — V15 #2 combined deploy COMPLETE; bug 2 v3 + v4 LIVE — single-tier movement log + counterparty label)"
status: "Production = e46eda2 LIVE (matches master). Movement log architecture corrected: single-tier per movement, counterparty NAME shown via branchIds[] metadata. Pre+Post probe 6/6 + 4/4 negative ✓. Cleanup 4/4 ✓. HTTP smoke 3/3 = 200."
current_focus: "Live QA on the corrected movement log architecture"
branch: "master"
last_commit: "e46eda2"
tests: 2214
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "e46eda2"
firestore_rules_version: 19
storage_rules_version: 2
---

# Active Context

## State
- master = `e46eda2` · **2214/2214** focused vitest pass · build clean (BD ~911 KB)
- Production = `e46eda2` LIVE — fully synced (V15 #2 deploy complete this session)
- Working tree clean (after EOD docs commit)

## V15 #2 deploy results (s21)
- **Vercel**: `lover-clinic-gbhf7r5hv-teddyoomz-4523s-projects.vercel.app` → aliased `lover-clinic-app.vercel.app` (55s)
- **Firestore rules**: released to cloud.firestore (no rule changes; clean redeploy)
- **Pre-probe**: 6/6 positive 200 + 4/4 negative 403 ✓
- **Post-probe**: 6/6 positive 200 + 4/4 negative 403 ✓
- **Cleanup**: 4/4 (pc_appointments DELETE x2 + clinic_settings strip x2)
- **HTTP smoke**: root + /admin + /api/webhook/line = 200 ✓

## What this session shipped (s21 — 2026-04-28)
2 commits:
- `de90130` — bug 2 v3 (legacy-main fallback for default branch ID-mismatch)
- `e46eda2` — bug 2 v4 (single-tier filter + counterparty label correction)

User correction in v4: "stock movement เป็นอันเดียวกัน ซ้ำกันทั้งสองหน้า ซึ่งผิด" — v2/v3 fix accidentally caused 2× duplication via cross-branch alias. v4 reverts the alias; each movement at OWN tier only with counterparty NAME shown in label.

Tests: 2183 → 2214 (+31).

## Architecture lock (institutional memory)
- 4 cross-tier movement types (8/9/10/13) split into 2 docs (EXPORT at source + RECEIVE at destination)
- Each movement visible at OWN tier only — NOT duplicated on both sides
- `branchIds[]` field still written (Phase E) but used as METADATA for counterparty NAME, NOT for filter alias
- Type 8/10 (source-side): label "ส่งออกไป/เบิกโดย {dest.name}"
- Type 9/13 (destination-side): label "รับเข้าจาก/รับเบิกจาก {src.name}"
- Legacy-main fallback STAYS for default-branch ID-mismatch (separate concern from cross-tier)

## Next action
**Live QA verification on the corrected architecture**:
1. Korat → Central transfer:
   - Korat stock-tab MovementLog: ONE row "ส่งออกไป คลังกลาง..."
   - Central tab MovementLog: ONE row "รับเข้าจาก สาขาโคราช"
2. Withdrawal between Central and Branch:
   - Source MovementLog: "เบิกโดย {requester}"
   - Destination MovementLog: "รับเบิกจาก {supplier}"
3. สาขาหลัก (default branch) post-V20 with legacy 'main' data:
   - Stock-tab MovementLog now shows transfers (legacy-main fallback working)

## Outstanding user-triggered actions (NOT auto-run)
- Live QA on corrected movement log + counterparty labels
- Carry-over: admin LineSettings creds + webhook URL · backfill customer IDs · TEST-/E2E- prefix
- Deferred to Phase 15.5+: ActorPicker branchIds[] filter; Phase 15.4 central→branch dispatch flow; Phase 15.5 withdrawal approval admin endpoint
