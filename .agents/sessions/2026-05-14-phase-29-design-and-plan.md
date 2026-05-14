# Session 2026-05-14 LATE-EOD continued+2 — Phase 29 Recall System (design + plan)

## Summary

After Phase 28 deploy this same session, user requested NEW feature: **ระบบ Recall** (customer follow-up tracking — call/LINE customers when treatment cycle is due). Brainstormed via Visual Companion (4 Qs + 2-round addition + pair-label refinement), wrote 880-line spec, then 2010-line implementation plan with 21 bite-sized tasks. Did NOT execute — context full, user chose to switch chats. Execution starts in NEW chat via subagent-driven-development.

## Current State

- master = `686e84a` · prod = `0389e23` (Phase 28 deployed earlier; Phase 29 docs-only ahead)
- 9176 tests + 1 skipped + 0 fail (Phase 29 NOT YET implemented — test count unchanged from Phase 28 deploy)
- Build clean
- Phase 29 spec + plan committed + pushed; brainstorming mockups gitignored at `.superpowers/brainstorm/379-1778731938/`

## Commits this session (post-Phase-28-deploy)

```
686e84a docs(Phase 29): implementation plan with 21 bite-sized tasks (subagent-driven, heavy testing)
02114e2 docs(Phase 29): recall system design spec — 3-surface + 2-slot + LINE templates
```

## Files Touched

- `docs/superpowers/specs/2026-05-14-recall-system-design.md` (NEW, ~880 lines, 14 sections)
- `docs/superpowers/plans/2026-05-14-phase-29-recall-system.md` (NEW, ~2010 lines, 21 tasks)
- `.superpowers/brainstorm/379-1778731938/content/01-07.html` (gitignored — visual companion mockups)

## Key Decisions

- **Q1**: scope = B + LINE templates (smart features baseline + 1-click LINE)
- **Q2**: master-data field + inline-learn opt-in (admin can save recall interval to be_products/be_courses while creating recall — never forced)
- **Q3**: date-grouped sections (Phase 28 DNA, 5 buckets: เกินกำหนด/วันนี้/พรุ่งนี้/สัปดาห์/ภายหลัง)
- **Q4**: Frontend = Today + Overdue focused; Backend = full management; CDV card = mirror appointment-card pattern
- **2-round pairing**: Modal has 2 independent optional slots (🩹 ติดตามอาการ + 📅 นัดกลับมา) — filler = both, ขลิบ = slot 1 only, validation: ≥1 slot
- **Pair-label format**: full reason + date + status suffix (รอ Recall / เสร็จแล้ว / ติดต่อไม่ได้ครั้งที่ N / เลื่อนไป / เกินกำหนด N วัน) — same template across 3 surfaces
- **Real-time refresh discipline** (user demand): Firestore onSnapshot + stable React keys + optimistic local mutation = NO FLICKER. Source-grep tests SG3 + SG4 enforce.
- **Spec self-review** caught: removed RecallAutoSuggestBanner + RecallSuggestReviewModal + draft-suggested status — auto-suggest is modal pre-fill only (admin always explicitly clicks save). Added "+ Recall" quick-action chip on Phase 28 TreatmentHistoryRow as from-treatment entry point. SG11 prevents drift-back.
- **Test methodology**: 6-layer (helper unit / RTL components / source-grep / flow-simulate / multi-surface real-time / adversarial) + L7 admin-SDK e2e + L8 live preview = 13 new test files, ~362 net assertions

## Architecture Snapshot

- 16 new files (12 backend/recall components + 1 customer-recall + 3 helpers + 1 hook + 1 server endpoint)
- 12 modified files (backendClient, scopedDataLayer, navConfig, BackendDashboard, AdminDashboard, CustomerDetailView, TreatmentHistoryRow, ProductFormModal, CourseFormModal, productValidation, courseValidation, firestore.rules + indexes)
- New collection `be_recalls` (branch-scoped per BSA Rule L)
- Master-data extension: 4 new optional fields on be_products + be_courses (followUpAfterDays / followUpReason / recallAfterDays / recallReason)
- Real-time across 3 surfaces (Backend tab + Frontend sub-tab + CDV card) via Firestore onSnapshot per surface

## Lessons (Rule D)

- **Visual Companion brainstorming converged 4 Qs + 2 refinements in single session** — visual mockups (7 HTML screens) made design decisions much faster than text-only would have. User's edits ("เพิ่ม CDV card", "2-round pairing", "pair-label show full status") arrived as text but user could see context immediately because mockups were on screen.
- **Spec self-review caught architectural drift** — initial spec assumed background daemon for auto-suggest (creating draft-suggested recalls automatically on treatment save). User actually only approved modal-pre-fill behavior. Removed 2 components + 1 status enum value + 1 helper fn during self-review. SG11 source-grep test prevents drift-back.
- **Heavy testing emphasis is a feature requirement, not gold-plating** — user explicitly said "เขียนจับผิดตัวเอง stimulate แบบใช้จริง พยายามทำให้มันพังทำให้มันบั๊คดู". Multi-surface real-time integration tests (Layer 5) are CRITICAL for Phase 29 since it's the first feature with 3 simultaneous Firestore listener surfaces — anti-flicker discipline must be locked permanently.
- **Switch-chat-for-execution is the right call** — context strain in this chat after Phase 28 deploy + Phase 29 design + plan is real. Plan written while spec fresh-in-memory + execute in new chat with full context capacity = best of both. Phase 28 worked exactly this way (spec + plan + execute distributed across sessions).

## Next Todo (NEW CHAT)

- /session-start in new chat (auto-loads CLAUDE.md + SESSION_HANDOFF + active.md + 00-session-start)
- Read Phase 29 spec (`docs/superpowers/specs/2026-05-14-recall-system-design.md`)
- Read Phase 29 plan (`docs/superpowers/plans/2026-05-14-phase-29-recall-system.md`)
- (optional) User spec review pass — request user approval before executing
- Invoke `Skill(subagent-driven-development)` → execute Task 0 onwards
- Final: V15 combined deploy after Task 21 (V18 user-authorized THIS turn in new chat — explicit "deploy" required per session)

## Resume Prompt

See SESSION_HANDOFF.md "Session 2026-05-14 LATE-EOD continued+2 — Phase 29 design+plan" block.
