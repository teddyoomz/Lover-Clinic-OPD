# Session Handoff — LoverClinic OPD Cross-Session State

> **This file is read FIRST every new session.** Updated by `/session-end` skill.
> Link out to `.agents/sessions/*` for detail.

---

## Current State

- **Date last updated**: 2026-04-25 (mid-session — Phase 14.2.D/E ProClinic side-by-side Doc 1-9/16 + theme + F13-F16 banks)
- **Branch**: `master`
- **Last commit**: `aed5f0b feat(phase14.2.E): Docs 3-9/16 ProClinic side-by-side replication`
- **Test count**: 256 in phase14-flow-simulate (F1-F16 all green); 4254/4254 full suite
- **Build**: clean
- **Deploy state**:
  - **firestore:rules**: v3 deployed. v9 in code. be_vendors + be_vendor_sales rules added but NOT deployed.
  - **Vercel prod**: `ec567fd` (Phase 14.1 + V14 fix). **NOT up-to-date** — 7+ commits queued waiting deploy auth (Phase 14.2.D theme + Phase 14.2.E Docs 2-9 replication).
- **Production URL**: https://lover-clinic-app.vercel.app
- **Remote sync**: master = origin/master ✅
- **Chrome MCP**: Browser 1 connected (Windows, deviceId `8bdc85cc-b6e5-47d9-b3cd-56957264819d`)

---

## What's Done

- ✅ **Phase 1-13.6** — base app + master data + finance + quotations + staff/schedule/DF (historical)
- ✅ **Phase 14 + 14.x** — DF modal + medicine-label migrate (historical)
- ✅ **Phase 12.2b COMPLETE** (2026-04-24) — Course form ProClinic parity, Rule I established, V13 logged
- ✅ **Phase 12.3** (this session, e6ff4e6) — Sale Insurance Claim UI + SaleReport "เบิกประกัน" col wiring (+40 tests)
- ✅ **Phase 14.1** (this session, ec567fd) — Document Templates System: 13 seeds + CRUD + print engine + per-treatment integration
- ✅ **V14 + V15 logged** (this session, e2528b1) — Firestore-undefined-reject lesson + combined-deploy rule
- ✅ **Phase 14.2** (this session, 0398171) — Toggles + bilingual + 13 ProClinic-fidelity rewrites
- ✅ **Phase 14.2.B** (this session, bcf6e3b) — Per-treatment dual dropdowns ("พิมพ์ใบรับรองแพทย์ ▾" + "พิมพ์การรักษา ▾") + auto cert# generator (runTransaction-safe) + 3 NEW docTypes (treatment-history, treatment-referral, course-deduction) — total 16 docTypes
- ✅ **Phase 14.2.C** (this session, df556f6) — Doc 1/16 (Medical History) **100% replication** verified end-to-end. Raw-HTML placeholder `{{{key}}}` syntax added (treatment record + home medication tables now render as actual tables, not escaped text). Schema mapping verified via preview_eval on real be_treatments docs.
- ✅ **F12 test bank** (cb2bdb6) — 32 automated tests
- ✅ **Phase 14.3 G6 scaffolding** (bcf6e3b + cb2bdb6) — vendor scaffolding committed, not wired
- ✅ **Phase 14.2.D Theme + F13/F14/F15/F16 test banks** (5846e05) — black+red theme on all 16 docs + +118 tests for wiring/empty-field/cross-doc/color invariants
- ✅ **Phase 14.2.E Doc 2-9 ProClinic replication** (b186971 + aed5f0b) — side-by-side Chrome MCP DOM extraction on each ProClinic /admin/* page, full match for medical-cert + driver-license + medical-opinion + PT + thai-traditional + chinese-traditional + fit-to-fly + patient-referral. SCHEMA_VERSION 6→9.

---

## What's Next

### Primary: per-doc verification (16 docs, Doc 1 done, 15 left)

User directive: "ทำแบบนี้ทีละหน้าจนครบ" — ONE doc at a time:
1. Run F12 tests, fix failures
2. Use Chrome MCP `javascript_tool` to extract ProClinic exact DOM
3. Update template + prefill mapping
4. Bump SCHEMA_VERSION
5. preview_eval verify in browser
6. Mark doc done, move to next

### Doc verification queue

- [x] Doc 1/16 — treatment-history Medical History ✅ df556f6
- [x] Doc 2/16 — medical-certificate (5 โรค) ✅ b186971
- [x] Doc 3/16 — medical-certificate-for-driver-license ✅ aed5f0b
- [x] Doc 4/16 — medical-opinion (ลาป่วย) ✅ aed5f0b
- [x] Doc 5/16 — physical-therapy-certificate ✅ aed5f0b
- [x] Doc 6/16 — thai-traditional-medicine-cert ✅ aed5f0b
- [x] Doc 7/16 — chinese-traditional-medicine-cert ✅ aed5f0b
- [x] Doc 8/16 — fit-to-fly ✅ aed5f0b
- [x] Doc 9/16 — patient-referral ✅ aed5f0b
- [ ] Doc 10/16 — treatment-referral A5 (no ProClinic equivalent — our own A5 design)
- [ ] Doc 11/16 — course-deduction (no ProClinic equivalent — our own design)
- [ ] Doc 12/16 — medicine-label (no ProClinic equivalent — small label printer 57x32mm, our design)
- [ ] Doc 13/16 — chart **DEFER Phase 16** (graphical face/body chart drawing tool)
- [ ] Doc 14/16 — consent (5846e05 — F12 fix landed; ProClinic equivalent is doc-template editor not print preview)
- [ ] Doc 15/16 — treatment template **DEFER Phase 16** (graphical dental chart tool)
- [ ] Doc 16/16 — sale-cancelation (5846e05 — F12 fix landed; ProClinic /admin/document/sale-cancelation is editor not template)

After all docs done:
- Phase 14.3 G6 vendor-sale wire to nav + tests + ship
- Phase 14.4 G5 customer-product-change (NOT STARTED — complex)
- Phase 15 Central Stock Conditional

---

## Outstanding User Actions (NOT auto-run)

1. **`vercel --prod` deploy of `aed5f0b`** — current prod stuck on `ec567fd`. Pending: Phase 14.2.B/C + Doc 1 fix + F12 + Phase 14.2.D theme + Phase 14.2.E Docs 2-9 ProClinic replication. 7+ commits queued.
2. **`firebase deploy --only firestore:rules`** with full Probe-Deploy-Probe per Rule B (4 endpoints curl-probe pre + post). Rules added: `be_vendors`, `be_vendor_sales`.

Per V15 combined-deploy rule, these can run together when user says "deploy".

---

## Blockers

- 3 F12 test failures need investigation + fix (chart, consent, +1)
- Production lagging by 5 commits (Phase 14.2.B/C work invisible until deploy)
- firestore.rules be_vendors / be_vendor_sales not yet deployed

---

## Known Limitations / Tech Debt (carry over)

- **Doc 13-15** likely DEFER — chart (canvas drawing) / consent (PDF library) / treatment-template (graphical) are entirely new feature surfaces beyond seed templates.
- **Phase 14.3 G6 incomplete** — Tab + validators committed, but BackendDashboard.jsx route + tests + preview verify still pending.
- **Phase 14.4 G5 customer-product-change NOT STARTED** — bigger feature (course exchange + refund).
- **Pick-at-treatment partial-pick reopen** (V12.2b note) — user picks subset, can't reopen to add more.
- **Period enforcement** (V12.2b) — schema preserves field, no save-time validation.

---

## Violations This Session

No new V-entries. V14 (Firestore undefined reject) and V15 (combined-deploy rule) logged in previous turn (commit e2528b1).

---

## Resume Prompt

Paste this into the next Claude session (or invoke `/session-start`):

```
Resume LoverClinic OPD — continue from 2026-04-25 end-of-session.

Read in order BEFORE any tool call:
1. CLAUDE.md (stack + env + rule index including Rule I + V14/V15)
2. SESSION_HANDOFF.md (cross-session state of truth — this file)
3. .agents/active.md (hot state — master=cb2bdb6, 135/138 phase14 tests)
4. .claude/rules/00-session-start.md (iron-clad A-I + V1-V15)
5. .agents/sessions/2026-04-25-phase14.2-replication-doc1of16.md (detail checkpoint)

Status summary:
- master = cb2bdb6
- Production: ec567fd (Phase 14.2.B/C + Doc 1 + F12 NOT yet deployed)
- 138 tests in phase14-flow-simulate, 3 FAIL (F12 caught — next action)
- Schema v5 live in Firestore (auto-upgraded)
- Chrome MCP browser connected (Browser 1, deviceId 8bdc85cc-b6e5-47d9-b3cd-56957264819d)
- 7 commits this session: 12.3 insurance + 14.1 docs + V14/V15 + 14.2 toggles
  + 14.2.B per-treatment dropdowns + 14.2.C Medical History fix + F12 test bank
- Vendor scaffolding (G6) committed but not wired/deployed

Next action (per user "ทำแบบนี้ทีละหน้าจนครบ"):
Doc 1/16 ✅ DONE. Continue:
(1) `npm test -- --run tests/phase14-documents-flow-simulate.test.js`
    → identify 3 failing docTypes (likely chart/consent/+1).
(2) Fix each failure (likely missing {{{key}}} for raw-HTML rows).
(3) For Docs 2-12, verify pixel-close via Chrome MCP DOM extraction:
    `mcp__Claude_in_Chrome__javascript_tool` on
    https://trial.proclinicth.com/admin/<route>
(4) Update templates + CustomerDetailView prefill per real schema.
(5) Bump SCHEMA_VERSION on each batch.
(6) F12.full:<docType> + F12.empty:<docType> must pass before mark done.
(7) preview_eval browser-verify before mark done.

DEFER docs 13-15 (chart/consent PDF/treatment graphical) — Phase 16.

Outstanding user-triggered (NOT auto):
- vercel --prod deploy of cb2bdb6 (Phase 14.2.B/C + Doc 1 fix + F12)
- firebase deploy --only firestore:rules with full P-D-P (be_vendors +
  be_vendor_sales rules added cb2bdb6)
- V15 combined-deploy: "deploy" runs both together

Rules:
- No deploy unless user says "deploy" THIS turn (V4/V7)
- V15 combined-deploy: "deploy" = vercel + rules in parallel
- Probe-Deploy-Probe 4 endpoints (V1/V9 — chat_conversations,
  pc_appointments, clinic_settings/proclinic_session, _trial)
- Schema mapping MUST be verified via preview_eval on real Firestore
  data — NEVER guess field names (V13/V14 lesson)
- Raw-HTML rows MUST use {{{key}}} (3-brace), NOT {{key}} (escaped)
- Per-doc methodology: ONE doc, F12 + Chrome MCP + preview_eval, mark done

Invoke /session-start to boot context.
```

---

## How to use this file

- `/session-end` skill auto-updates it. If editing manually, keep under ~250 lines.
- Detail lives in `.agents/sessions/YYYY-MM-DD-*.md` checkpoints.
- Resume Prompt block is the KEY output — user pastes into new chat to boot.
- Committed to repo (not memory-only) → team-visible + cross-machine synced.
