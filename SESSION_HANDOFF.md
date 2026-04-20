# Session Handoff — LoverClinic OPD Cross-Session State

> **This file is read FIRST every new session.** Updated by `/session-end` skill.
> Link out to `.agents/sessions/*` for detail.

---

## Current State

- **Date last updated**: 2026-04-21 (end-of-session)
- **Branch**: `master`
- **Last commit**: `783ee4b feat(skills): cherry-pick /session-start + /session-end + /violation-log from claude-guardrails`
- **Test count**: 2865 / 2865 passing
- **Build**: clean
- **Deploy state**: production = `c72fd0e` (via `lover-clinic-eg6mk2cgd`, 2026-04-21)
  - HEAD is 3 docs/skills-only commits ahead — **no deploy needed**
- **Production URL**: https://lover-clinic-app.vercel.app
- **Remote sync**: master = origin/master ✅

---

## What's Done (recent phases)

- ✅ **Phase 1-10** — base app + reports (historical)
- ✅ **Phase 11.1-11.8** — Master Data Suite scaffold + 6 entity CRUDs + wiring
- ✅ **Phase 11.9 fix** (2026-04-21) — Product Groups full rewrite (V10 correction): 2-type schema, products[] with pivot.qty, full-field JSON API sync, removed master_data fallback, BE_BACKED_MASTER_TYPES 4→13. See `.agents/sessions/2026-04-21-phase11.9-guardrails-mvp.md`
- ✅ **Phase 12.0-12.11** — Financial completeness + adapter bridge + Firebase Admin SDK
- ✅ **claude-guardrails v0.1 MVP** (2026-04-21) — methodology extracted to `F:/claude-guardrails` sibling repo (local only)
- ✅ **Handoff skills** (2026-04-21) — `/session-start` + `/session-end` + `/violation-log` installed in both repos

---

## What's Next

**Phase 13.1 Quotations** (Friday 2026-04-24, ~4h, +40 tests, Medium risk)

Full breakdown in `.agents/sessions/2026-04-24-phase13-prep.md`:

- **13.1.1** Validator + normalizer at `src/lib/quotationValidation.js` (~45min, +15 tests)
- **13.1.2** backendClient CRUD (~30min, +5 tests)
- **13.1.3** `src/components/backend/QuotationTab.jsx` + `QuotationFormModal.jsx` (~1.5h, +10 tests)
- **13.1.4** Convert-to-sale handler (~45min, +8 tests) — OUR addition (not a ProClinic feature)
- **13.1.5** Nav + BackendDashboard wiring (~15min, +2 tests)

Triangle artifacts pre-scanned in `docs/proclinic-scan/admin-quotation-*-phase13_1.json`
+ `docs/proclinic-scan/detailed-adminquotationcreate.json`.

Success criteria: +40 tests (2865 → 2905), all adversarial cases pass, form
field parity with ProClinic modal.

---

## Outstanding User Actions (NOT auto-run)

- [ ] **Test Phase 11.9 end-to-end** — MasterDataTab → Sync สินค้า + คอร์ส
      → นำเข้า be_products + be_courses → สร้างการรักษาใหม่ → verify
      ราคา + สินค้าหน้าร้าน dropdown + ยากลับบ้าน label ครบ
- [ ] **Deploy** (vercel --prod) — only needed if next session ships new code
      changes. Current HEAD is docs/skills only.
- [ ] **GitHub push** F:/claude-guardrails — if you want to publish or share;
      currently local only (commit `d8ea1a5`, 2 commits)
- [ ] **firestore:rules deploy** — none pending

---

## Blockers

None. Ready to proceed with Phase 13.1 on Friday.

---

## Known Limitations / Technical Debt

- `membership_types` + `wallet_types` still master_data-only (no be_*) —
  Phase 16 migration candidates. UI reads via `getAllMasterDataItems()`
  adapter, so migration is zero-code-change when be_ backing added.
- Legacy master_data/medication_groups + consumable_groups caches still
  exist as fallback data — no UI reads them after Phase 11.9. Safe to
  clear via MasterDataTab [A3] debug panel (all 13 types marked be_* now).

---

## Violations This Session

**V10** (2026-04-21) — Phase 11.2 Product Groups shipped with schema-drift:
4-option productType instead of ProClinic's 2-option. Triangle Rule failed
(no `opd.js forms /admin/product-group/create` artifact). Fix: Phase 11.9
full rewrite + new validator invariant + re-Triangle scan. See commit
`ed56924` + `.claude/rules/00-session-start.md` section 2.

---

## Resume Prompt

Paste this block into the next Claude session (or just invoke `/session-start`):

```
Resume LoverClinic OPD — continue from 2026-04-21 end-of-session.

/session-start

Context snapshot:
- master = 783ee4b, 2865 tests passing
- Production = c72fd0e (https://lover-clinic-app.vercel.app)
- claude-guardrails v0.1 at F:/claude-guardrails (commit d8ea1a5, local only)
- Phase 13.1 Quotations = next major task (Friday 2026-04-24)

After /session-start, suggested next actions:
A. Phase 13.1 Quotations (validator first — .agents/sessions/2026-04-24-phase13-prep.md)
B. Verify Phase 11.9 via MasterDataTab Sync+Import
C. Port 5 feedback entries to F:/claude-guardrails
D. Push F:/claude-guardrails to GitHub
E. Something else

Rules to remember:
- No deploy without explicit THIS-turn authorization
- Probe-Deploy-Probe 4 endpoints before firestore:rules deploy
- Triangle Rule: 3 sources before replicating any ProClinic feature
- Rule D: every bug → test + rule + audit invariant
- Backend = Firestore ONLY, except MasterDataTab bridge
```

---

## How to use this file

- `/session-end` skill auto-updates it. If editing manually, keep under ~200 lines.
- Detail lives in `.agents/sessions/YYYY-MM-DD-*.md` checkpoints.
- Resume Prompt block is the KEY output — user pastes into new chat to boot.
- Committed to repo (not memory-only) → team-visible + cross-machine synced.
