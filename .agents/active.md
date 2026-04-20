---
updated_at: "2026-04-21 (end-of-session via /session-end)"
status: "session closed — Phase 11.9 + claude-guardrails v0.1 + handoff skills shipped"
current_focus: "Phase 13.1 Quotations — START Friday 2026-04-24 (Triangle pre-scanned)"
branch: "master"
project_type: "node (React 19 + Vite 8 + Firebase + Tailwind 3.4)"
last_commit: "783ee4b"
tests: 2865
production_url: "https://lover-clinic-app.vercel.app"
last_deploy: "c72fd0e (2026-04-21, lover-clinic-eg6mk2cgd) — HEAD ahead by 3 docs-only commits, no deploy needed"
guardrails_repo: "F:/claude-guardrails v0.1 MVP (commit d8ea1a5, local only)"
---

# Active Context

## Objective

Continue Phase 13 sequential build starting from Phase 13.1 Quotations on
Friday 2026-04-24. Triangle artifacts pre-scanned, sub-task breakdown
ready at `.agents/sessions/2026-04-24-phase13-prep.md`.

## Current State (end of 2026-04-21 session)

- **Phase 11.9 DONE + deployed** — product-group rewrite (2-type + products[] with qty + wiring), full-field JSON API sync, adapter expansion 4→13, buy-modal NaN guard, treatment med-group wiring to be_product_groups
- **claude-guardrails v0.1 MVP shipped** at `F:/claude-guardrails` (commit `d8ea1a5`, local only, NOT pushed to GitHub)
- **Handoff skills installed** — `/session-start`, `/session-end`, `/violation-log` in both repos
- **Methodology docs** imported into LoverClinic (5 docs in `docs/` + PostToolUse hook in `.claude/hooks/`)
- **Tests**: 2865 passing (last run this session)
- **Build**: clean (last run this session)
- **firestore.rules**: unchanged
- **Vercel**: deployed at `c72fd0e` — HEAD ahead by `5a7687e` (docs) + `258e2fe` (active.md) + `783ee4b` (skills) + this commit. None require deploy (all docs/skills).
- **Env vars on Vercel**: ✅ Phase 12 complete

## Blockers

None. Friday Phase 13.1 ready to start.

## Next Action (Friday 2026-04-24)

**Phase 13.1 Quotations** — start with validator at
`src/lib/quotationValidation.js`. Full breakdown in
`.agents/sessions/2026-04-24-phase13-prep.md`:
- 13.1.1 Validator + normalizer (~45min, +15 tests)
- 13.1.2 backendClient CRUD (~30min, +5 tests)
- 13.1.3 QuotationTab + FormModal UI (~1.5h, +10 tests)
- 13.1.4 Convert-to-sale (~45min, +8 tests)
- 13.1.5 Nav + wiring (~15min, +2 tests)

Triangle artifacts already captured in `docs/proclinic-scan/admin-quotation-*-phase13_1.json`
+ `docs/proclinic-scan/detailed-adminquotationcreate.json`.

## Recent Decisions (this session, 2026-04-21)

1. **product-group schema 4→2 types** — ProClinic has only ยากลับบ้าน / สินค้าสิ้นเปลือง (re-Triangle after V10 drift). Legacy 4-option data auto-normalized via `normalizeProductType` helper on read.
2. **products[] with qty** replaces `productIds[]` — pivot.qty from ProClinic JSON API is per-group-product data (the "(12 เม็ด)" shown in list). Kept productIds[] as derived index for legacy grep compatibility.
3. **Removed master_data fallback** from TreatmentFormPage med/consumable modals — delete-in-tab must propagate (Rule H). User complained "ลบหมดแล้วยังเห็นครบ" = fallback silently hides state.
4. **Full-field sync** via JSON API replaced HTML scrape for products + courses — HTML scrape mis-coded fields from cell index (fragile). User directive "เอามาให้ครบ ทุกไส้ใน".
5. **claude-guardrails self-use only** — not publishing, not chasing v1.0 brand. User's phrase: "ใช้เองไปเลย". Growth via manual Rule D — feedback loop memory tracks insights to port back.
6. **Session handoff as SKILLS** — not just docs. `/session-start` + `/session-end` + `/violation-log` commands enforce the protocol actively instead of hoping users manually follow it.

## Notes

- `.agents/` layer + iron-clad rules + V-log = core institutional memory. Never AI-compress.
- Feedback loop file: `project_claude_guardrails_feedback.md` has 5 pending insights to batch-port to F:/claude-guardrails when ≥5 more accumulate.
- "God Brain" pattern: every project that uses claude-guardrails contributes back → template compounds over time without AI summarization drift.
