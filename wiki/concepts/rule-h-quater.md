---
title: Rule H-quater — No master_data reads in feature code
type: concept
date-created: 2026-05-04
date-updated: 2026-05-04
tags: [iron-clad-rule, rule-h, h-quater, h-bis, master-data, dev-only, bsa]
source-count: 1
---

# Rule H-quater — No `master_data/*` reads in feature code

> Iron-clad rule (added 2026-04-29 V36-tris extension): feature code reads ONLY from `be_*` collections. No fallbacks to `master_data/*`. The wipe endpoint physically deletes the dev-only sync mirror so it can't accidentally be read at runtime.

## Statement (canonical)

User directive (verbatim, 2026-04-29):
> "ห้ามใช้ master_data ใน backend ไม่ว่าจะใช้ทำอะไร ห้ามใช้ master_data ประมวลผลเด็ดขาด ต้องใช้ be_database เท่านั้น ป้องกันโดยลบ masterdata ดิบที่ sync มาทั้งหมดในโปรแกรม ให้มีแค่ data จาก be data เท่านั้น"

Translation: "DON'T use master_data in backend for anything. DON'T process master_data, ever. Use be_database only. Prevention: delete all the raw master_data sync output from the program; have only be data."

## Why this rule exists

`master_data/*` is the DEV-ONLY mirror of ProClinic data — populated by the `MasterDataTab.jsx` "ดูด ProClinic" buttons (Rule H-bis sanctioned). It exists for INITIAL SEED of `be_*` collections during development. Once `be_*` is populated, `master_data/*` should never be read again.

The temptation (caught + fixed multiple times during Phase 12-15):
1. "be_* is empty for category X, fall back to master_data" → silent dependency on dev-only data
2. `getAllMasterDataItems('products')` used in TFP → branch-unaware (pre-Phase BS V2 + pre-BSA)
3. Reader-side compatibility code "in case master_data has fresher data than be_*"

All three are anti-patterns. They keep the legacy `master_data/*` collection alive in the runtime path, which:
- Defeats the H-bis dev-only strip plan (production should NOT have master_data reads)
- Loses branch-scoping (master_data has no branchId; not designed to)
- Creates 2 sources of truth (which version wins when they disagree?)

## Sanctioned exceptions (the ONLY 2)

1. **`MasterDataTab.jsx`** — the dev-only sync UI. Sanctioned per Rule H-bis. Reads + writes `master_data/*` for the seed flow.
2. **One-shot migrators** — `migrateMasterXToBe()` helpers in `backendClient.js` that copy `master_data/* → be_*`. Run once per category during initial setup; idempotent re-run safe.

Every other read of `master_data/*` is a violation, even if "just for fallback / safety / legacy compat".

## Detection (audit BS-2 + BS-3)

```bash
# BS-2: feature code master_data reads
git grep -nE "master_data/" -- "src/components/**" "src/pages/**" \
  | grep -v MasterDataTab \
  | grep -v "// migrator" \
  | grep -v "audit-branch-scope:"
# Expected: empty

# BS-3: getAllMasterDataItems references in UI
git grep -nE "getAllMasterDataItems\(" -- "src/components/**" "src/pages/**" "src/hooks/**" \
  | grep -v MasterDataTab \
  | grep -v "audit-branch-scope: BS-3"
# Expected: empty
```

Both invariants live in [`/audit-branch-scope`](branch-scope-architecture.md) Tier 1. Build-blocking.

## Wipe endpoint

`api/admin/wipe-master-data.js` (V36-tris) deletes the entire `master_data/*` collection. Admin runs this once master-data → be_* migration is complete and verified. After wipe, runtime cannot accidentally read it (collection doesn't exist).

DO NOT auto-trigger wipe — explicit user invocation only (per `feedback_no_prelaunch_cleanup_without_explicit_ask` lock 2026-04-29).

## Anti-pattern locked-in lessons

- **"Fall back to master_data when be_* is empty"** = violation. If be_* doesn't have it, run the migrator (one-shot, dev-only, then wipe). Don't degrade to master_data reads at runtime.
- **"master_data fallback retained as a read-through safety"** = violation. Same.

## Concrete fixes shipped under this rule

| Fix | Commit | What was wrong |
|---|---|---|
| TFP H-quater (Phase BSA Task 7) | `6f76ec6` | TFP load path used `getAllMasterDataItems('products'/'courses'/'staff'/'doctors')` — silent + branch-unaware. Replaced with `listProducts/listCourses/listStaff/listDoctors` from scopedDataLayer. |
| Task 11 lockdown | `0d02260` | Removed master-data sync re-exports from `scopedDataLayer.js` so they can't be re-imported by feature code. They stay in `backendClient.js` for `MasterDataTab` only. |

## Cross-references

- Related rule: [Rule H-bis](iron-clad-rules.md#h-bis) — sync = DEV-ONLY scaffolding (the umbrella rule)
- Related rule: [Rule H](iron-clad-rules.md#h) — data ownership: be_* canonical, master_data mirror initial-seed
- Audit: [Branch-Scope Architecture](branch-scope-architecture.md) BS-2 + BS-3
- Source: [BSA design spec](../sources/bsa-spec.md) §1 problem statement (TFP H-quater bug used as the canonical example)
- File reference: `src/components/backend/MasterDataTab.jsx` (sanctioned reader)
- File reference: `api/admin/wipe-master-data.js` (cleanup endpoint)

## History

- 2026-04-29 — Rule extended to "no reads" (V36-tris) per user directive. Wipe endpoint shipped.
- 2026-05-04 — Phase BSA Task 7 closed the last live violation (TFP load path).
- 2026-05-04 — Phase BSA Task 11 removed master-data sync helpers from scopedDataLayer to prevent re-introduction.
- 2026-05-04 — Wiki concept page created.
