# Session Handoff — LoverClinic OPD Cross-Session State

> **This file is read FIRST every new session.** Updated by `/session-end` skill.
> Link out to `.agents/sessions/*` for detail.

---

## Current State

- **Date last updated**: 2026-04-24 (end-of-session)
- **Branch**: `master`
- **Last commit**: `647e2a1 fix(chat): stop phantom notification when no unread remains`
  (LoverClinic unchanged today — this session was guardrails-only)
- **Test count**: 2865 / 2865 passing (unchanged — no source touched)
- **Build**: clean (unchanged)
- **Deploy state**: production = `c72fd0e` (via `lover-clinic-eg6mk2cgd`, 2026-04-21)
  - HEAD unchanged since deploy — **no deploy needed**
- **Production URL**: https://lover-clinic-app.vercel.app
- **Remote sync**: master = origin/master ✅ (verify before wrapping)

**Guardrails companion repo (`F:/claude-guardrails`):**
- HEAD: `f780430 feat(compounding): automate growth loop — 10 leverage points`
- 2 new commits today (`5894b02` + `f780430`) — still **local only** per user directive

---

## What's Done (recent phases)

- ✅ **Phase 1-10** — base app + reports (historical)
- ✅ **Phase 11.1-11.8** — Master Data Suite scaffold + 6 entity CRUDs + wiring
- ✅ **Phase 11.9 fix** (2026-04-21) — Product Groups full rewrite (V10 correction): 2-type schema, products[] with pivot.qty, full-field JSON API sync, removed master_data fallback, BE_BACKED_MASTER_TYPES 4→13
- ✅ **Phase 12.0-12.11** — Financial completeness + adapter bridge + Firebase Admin SDK
- ✅ **claude-guardrails v0.1 MVP** (2026-04-21) — methodology extracted to `F:/claude-guardrails`
- ✅ **Handoff skills** (2026-04-21) — `/session-start` + `/session-end` + `/violation-log` in both repos
- ✅ **Claude-guardrails compounding-loop shipment** (2026-04-24) — 6 new skills + 3 new docs + Rule G.3 + evidence-required template + 2 new hooks. Guardrails upgraded from passive catalog to self-compounding system. See `.agents/sessions/2026-04-24-guardrails-compounding-loop.md`

---

## What's Next

**Phase 13.1 Quotations** (next active work session, ~4h, +40 tests, Medium risk)

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
      changes. Current HEAD is unchanged since last deploy.
- [ ] **Optional: copy new guardrails skills into LoverClinic** if wanted
      locally:
      ```bash
      cp -r F:/claude-guardrails/.claude/skills/{audit-rules,audit-health,skill-relevant,research-gap,skill-autoinstall} F:/LoverClinic-app/.claude/skills/
      ```
- [ ] **Optional: git push F:/claude-guardrails** — if publishing or sharing;
      currently local only (commits `5894b02` + `f780430`, 4 commits total)
- [ ] **Optional: run `/audit-health`** against LoverClinic to see current
      methodology adoption tier (once copied in)
- [ ] **firestore:rules deploy** — none pending

---

## Blockers

None. Ready to proceed with Phase 13.1.

---

## Known Limitations / Technical Debt

- `membership_types` + `wallet_types` still master_data-only (no be_*) —
  Phase 16 migration candidates. UI reads via `getAllMasterDataItems()`
  adapter, so migration is zero-code-change when be_ backing added.
- Legacy master_data/medication_groups + consumable_groups caches still
  exist as fallback data — no UI reads them after Phase 11.9. Safe to
  clear via MasterDataTab [A3] debug panel (all 13 types marked be_* now).
- LoverClinic `.claude/skills/` does NOT yet have the 5 new guardrails
  skills (`audit-rules`, `audit-health`, `skill-relevant`, `research-gap`,
  `skill-autoinstall`). They live in `F:/claude-guardrails/.claude/skills/`
  only. Copy if you want them LoverClinic-invokable.

---

## Violations This Session

**None** — no LoverClinic source changes this session, so no new V-entries.

Prior session V10 (2026-04-21, Phase 11.2 schema drift) remains the most
recent entry in `.claude/rules/00-session-start.md`.

---

## Resume Prompt

Paste this block into the next Claude session (or just invoke `/session-start`):

```
Resume LoverClinic OPD — continue from 2026-04-24 end-of-session.

/session-start

Context snapshot:
- master = 647e2a1, 2865 tests passing (LoverClinic unchanged this session)
- Production = c72fd0e (https://lover-clinic-app.vercel.app), no deploy needed
- claude-guardrails at F:/claude-guardrails commit f780430 — compounding-loop
  shipment (6 new skills + 3 new docs + Rule G.3 + evidence-required template)
  Still local-only.
- This session shipped to guardrails only. LoverClinic source untouched.

After /session-start, suggested next actions:
A. Phase 13.1 Quotations (validator first — see .agents/sessions/2026-04-24-phase13-prep.md)
B. Copy new guardrails skills into LoverClinic (audit-rules/audit-health/
   skill-relevant/research-gap/skill-autoinstall)
C. Test Phase 11.9 end-to-end via MasterDataTab Sync+Import
D. Try Research Mode live on a real LoverClinic question (test G.3 prevents guess)
E. Something else

Rules to remember:
- No deploy without explicit THIS-turn authorization
- Probe-Deploy-Probe 4 endpoints before firestore:rules deploy
- Triangle Rule (universal form) — Evidence + Intention + Existing code
  before writing anything that depends on external reference
- Rule D: every bug → test + rule + audit invariant
- Rule G.3 (NEW in guardrails, not yet copied into LoverClinic):
  "I think / probably / usually" = gap signal → research-gap + skill-autoinstall
- Backend = Firestore ONLY, except MasterDataTab bridge
```

---

## How to use this file

- `/session-end` skill auto-updates it. If editing manually, keep under ~200 lines.
- Detail lives in `.agents/sessions/YYYY-MM-DD-*.md` checkpoints.
- Resume Prompt block is the KEY output — user pastes into new chat to boot.
- Committed to repo (not memory-only) → team-visible + cross-machine synced.
