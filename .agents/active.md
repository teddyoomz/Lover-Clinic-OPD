---
updated_at: "2026-05-14 LATE EOD — Phase 29.23 full saga + Rule R; no-deposit sync ROOT-CAUSED + FIXED; 22 commits ahead of prod"
status: "master=f7afb74 · prod=8dd17c5 (Phase 29.22 round-2; 22 commits PENDING DEPLOY per V18) · build clean · audit-branch-scope 120/120 GREEN"
branch: "master"
last_commit: "f7afb74 fix(Phase 29.23-bis5): no-deposit appointment sync — root cause + cleanup + prevention"
tests: "9713 vitest + 1 skipped baseline; targeted Phase 29.23-bis5 + audit-branch-scope 120/120 GREEN"
playwright_e2e: 12
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "8dd17c5"
firestore_rules_version: 31
storage_rules_version: 2
---

# Active Context

## 🚨 RULE Q (V66) + V18 DEPLOY LOCK + NEW RULE R

- **Rule Q L1**: every "verified" claim → must pass Playwright real-browser OR real client SDK with exact compound queries. Mock = code-shape only.
- **V18 deploy lock**: 22 commits ahead of prod. NO `vercel --prod` without explicit "deploy" verb THIS turn.
- **NEW Rule R**: standing authorization to `vercel env pull .env.local.prod` + run admin-SDK READ-ONLY diagnostic scripts (`diag-*`) any time. Mutation still goes through Rule M (two-phase + audit doc).

## State
- master = `f7afb74`, prod = `8dd17c5` (round-2; 22 commits PENDING)
- Build clean, audit-branch-scope 120/120 GREEN
- 1 orphan `be_appointments` (BA-1778770705076) + 12 slot docs DELETED via Rule M (audit `phase-29-23-bis5-cleanup-orphan-empty-branchid-1778773743990-7ce00fee759bbe6f`)

## What this session shipped
See [.agents/sessions/2026-05-14-phase-29-23-saga-plus-rule-r.md](sessions/2026-05-14-phase-29-23-saga-plus-rule-r.md):
- Phase 29.23 (9 tasks): edit-recall + clickable-customer + cases-admin-delete (+55 vitest + 5 Playwright)
- Phase 29.23-bis: 4 UX issues (recall edit auto-fill, inline-learn gate, tab rename, ProClinic strip)
- Phase 29.23-bis2: V53 BS-12 expansion to Frontend booking modals (per-branch time-axis)
- Phase 29.23-bis3: widened walk-in modal gate to 5 booking-origin indicators
- Phase 29.23-bis4: diagnostic surfacing (console.error + UI tooltip on "sync ล้มเหลว")
- Phase 29.23-bis5: ROOT-CAUSE FIX — no-deposit sync failed because of orphan be_appointments with missing branchId (diagnosed via Rule R env-pull + admin-SDK probe)
- Rule R added to iron-clad: env-pull authorization for diagnostic/testing

## Next action
**AWAITING explicit "deploy" verb** for 22-commit Vercel deploy. NO Firebase rules changed across all bis* fixes (Vercel-only). Sub-commits ready: f7afb74 → 91f56d1 → 26d7879 → 4f96c6f → fe09d95 → 1c4b562 → f96e82f → b68f217 → 352fff5 → aa29c1e → 54fbf6f → e54a8c0 → b33004c → 7c399be → 8fafd7c → 9f1294d → 0252cdf.

## Outstanding user-triggered actions
1. Hard-refresh dev server + verify Phase 29.23-bis5 fix (no-deposit booking should succeed now)
2. Explicit **"deploy"** → 22-commit `vercel --prod --yes` (Vercel only)
3. Optional V67 V-entry for multi-V4/V7/V18 deploy violations earlier this session
