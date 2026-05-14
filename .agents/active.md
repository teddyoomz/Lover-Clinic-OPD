---
updated_at: "2026-05-14 PHASE-29-DEPLOYED — combined deploy successful, e2e verified"
status: "master=4a552c9 · prod=4a552c9 (DEPLOYED) · 9605 tests + 1 skipped · build clean · firestore rules v30"
branch: "master"
last_commit: "4a552c9 docs(Phase 29.20): SESSION_HANDOFF + active.md + checkpoint — implementation complete"
tests: 9605
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "4a552c9"
firestore_rules_version: 30
storage_rules_version: 2
---

# Active Context

## State

- master = `4a552c9` · prod = `4a552c9` (**DEPLOYED 2026-05-14 — combined Vercel + Firebase rules/indexes**)
- Phase 29 (Recall System) **SHIPPED LIVE** — 22 tasks complete + Probe-Deploy-Probe passed + e2e --apply verified
- Tests: 9176 → 9605 + 1 skipped (**+429 net** across 13 new test files)
- Build clean: BackendDashboard 914.70 → 925.42 KB (+10.72 KB, within +20 KB budget); NEW recall chunk 676.43 KB / 191.49 KB gzip (isolated via manualChunks to sidestep Rolldown char-boundary panic)
- firestore.rules v30: be_recalls match block deployed; Rule B Probe-Deploy-Probe ✅ (pre + post anon POST chat_conversations → HTTP 200 both)
- firestore.indexes.json: +4 composite indexes for be_recalls deployed
- Live admin-SDK e2e ✅: 5 fixtures created/read-back/outcome-flipped/snoozed/cleaned-up; audit doc `phase-29-recall-e2e-1778741706763-846c7a19`
- Prod smoke ✅ HTTP 200 at https://lover-clinic-app.vercel.app

## Phase 29 implementation summary (this session — 22 tasks)

| Task | SHA | Description |
|---|---|---|
| 0 | (baseline) | Pre-flight: 9176 tests + 1 skipped + 914.70 KB BackendDashboard |
| 1 | `6246fe6` | Pure helpers (recallResolvers + Validation + LineTemplateRenderer) — +96 tests TDD |
| 2 | `a3e0414` | backendClient (10 fns) + scopedDataLayer + useRecallListener + rules + 4 indexes — +16 tests |
| 3 | `ca26f61` | Master-data extension (be_products + be_courses 4 nullable fields + form UI) — +33 tests |
| 4 | `18f3e03` | RecallRow + RecallPairBadge (shared atoms for 3 surfaces) — +22 RTL tests |
| 5 | `f649f52` | RecallSectionHeader + RecallEmptyState + RecallList composer — +21 RTL tests |
| 6 | `0a32103` | RecallSlotCard + RecallCreateModal (2-slot + auto-suggest + inline-learn) — +29 RTL tests |
| 7 | `ecddacc` | RecallOutcomeModal (4-category + auto-snooze + manual-review escalation) — +24 RTL tests |
| 8 | `dd1a506` | RecallLineTemplateModal + /api/admin/line-send-recall endpoint — +19 RTL tests |
| 9 | `2a72cc5` | RecallSnoozeMenu (compact date picker + quick-pick chips) — +15 RTL tests |
| 10 | `8024126` | RecallTab + nav + BackendDashboard wire + tab permissions — +18 RTL tests |
| 11 | `ac3fb82` | Frontend RecallFrontendView + RecallTogglePill + AdminDashboard 3-state — +16 tests (manualChunks workaround for Rolldown Thai-char panic) |
| 12 | `856bcf2` | RecallCard (CDV) + TreatmentHistoryRow "+ Recall" chip + CDV wire — +16 RTL tests |
| 13 | `ea154b1` | Source-grep regression bank (Layer 3) — anti-flicker SG3+SG4 + DRY + spec self-review locks — +35 tests |
| 14 | `5da574f` | Rule I full-flow simulate + multi-surface real-time (Layers 4+5 — CRITICAL anti-flicker) — +30 tests |
| 15 | `44002ea` | Adversarial + property-based (Layer 6, seed=42 100 iters) — +39 tests |
| 16 | `4c265f4` | V21 fixups for 6 regressions + IIFE-in-JSX extraction (RecallFromTreatmentModal) — +0 tests, 6 V21 fixes |
| 17 | DEFERRED | Live preview verification (Rule I item b) — user post-deploy hands-on |
| 18 | `2ea43eb` | Live admin-SDK e2e script (Rule M canonical, dry-run default, --apply user-gated) |
| 19 | (verify) | Full vitest 9605 + 1 skipped GREEN; build clean |
| 20 | (this commit) | SESSION_HANDOFF + active.md + checkpoint |
| 21 | PENDING | V15 combined deploy — awaits explicit "deploy" verb per V18 |

## Architecture shipped

- **3 surfaces** with real-time Firestore onSnapshot listeners:
  - Backend RecallTab (`tab=recall`)
  - Frontend Recall sub-tab (AdminDashboard 3-state view-toggle pill with live count badge)
  - CDV RecallCard (per-customer universal — BSA sanctioned exception SG10)
- **2-slot pairing** model (🩹 ติดตามอาการ + 📅 นัดกลับมา) — ≥1 required, atomic batch via `createRecallPair`
- **5-bucket date grouping** (เกินกำหนด / วันนี้ / พรุ่งนี้ / ภายใน 7 วัน / ภายหลัง) per Phase 28 DNA
- **Pair badge** with 5 status suffixes (รอ Recall / เสร็จแล้ว / ติดต่อไม่ได้ครั้งที่ N / เลื่อนไป / เกินกำหนด N วัน) shared across all 3 surfaces via `formatPairBadge` (DRY enforced by SG8)
- **Auto-suggest** modal pre-fill from `be_products`/`be_courses` master-data (no daemon, no draft queue per spec self-review locks)
- **Inline-learn** opt-in: save reasonable defaults back to master-data on first recall
- **LINE template send** via `/api/admin/line-send-recall` (admin-token gated; chat_conversations audit append per V32-tris-ter)
- **Auto-snooze 3-day** on no-answer + **3-strike escalation** (`requiresManualReview = true`)
- **Anti-flicker discipline** locked via SG3 + SG4 + Layer 5 multi-surface real-time tests (CRITICAL per spec §14)

## Outstanding user-triggered actions

(none — Phase 29 fully shipped + verified end-to-end on real prod)

Optional follow-ups:
- **Task 17 live preview hands-on** — admin opens live prod, exercises 3 surfaces with real customer (LC-26000006) to spot-check anti-flicker discipline visually. Test coverage already locks the contract; this is user-confidence verification.

## Next action

- User decides next feature / phase / improvement to ship.
- OR review Phase 29 live in production hands-on.

## Anti-flicker discipline (architectural backstop for future Phase 29+ work)

Per spec §14 institutional memory: "If admin reports 'list flickers when X happens', the bug is class-of-bug 'key instability' or 'useEffect dep churn' — investigate listener setup + memo deps before component logic."

SG3 + SG4 + Layer 5 (MS1-MS11) tests must NEVER be relaxed without understanding consequences. Phase 29 is the project's FIRST feature with 3 simultaneous Firestore listener surfaces; the discipline locked here will compound across future multi-surface features.
