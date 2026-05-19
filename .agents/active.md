---
updated_at: "2026-05-19 LATE+3 NIGHT+5 — V104→V107 mega-session: 5 V-entries shipped + 4 Rule M backfills + light-theme universal fix"
status: "🚀 V104→V107 ALL LIVE on prod · canonical URL aliased to deploy 85pg892xe · 4/4 probes IDENTICAL pre+post"
branch: "master"
last_commit: "f076a45d fix(V107): light-theme text visibility — narrow accent exception + form-element safety net + AV96"
tests: "V101 18 + V102 29 + V103 27 + V104 13 + V104-followup 9 + V105 14 + V105-followup 13 + V107 8 + course-skip 64 = 195 GREEN · 39/39 E2E stress · 24/24 V107 L2 verify"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "f076a45d (V107) LIVE — deploy 85pg892xe aliased canonical 2026-05-19 NIGHT+5"
firestore_rules_version: "unchanged (idempotent since V82-Phone)"
storage_rules_version: "unchanged"
---

# Active Context

## State

- master = `f076a45d` (V107 light-theme fix). 5 commits ahead of original session start `1b51bdf6`
- 4 Rule M backfills --apply'd on real prod: V104-followup (11 garbage be_course_changes→canonical), V105 (1 sale customerName + 7 stock re-deducts), V105-followup (7 RE-DEDUCT createdAt Timestamp→ISO), V101 victim sweep (all 0/N decrements)
- 6 new AV invariants codified: AV91 (param shadow), AV92 (audit shape), AV93 (customer name resolver), AV94 (atomic rollback), AV95 (stock movement ISO createdAt), AV96 (light-theme exception narrowing)

## What this session shipped

- **V104** (`f3b0706a`) — TFP handleSubmit param shadow `options`→`submitOpts` + TFP:3134 silent-swallow rip + atomic rollback. AV91. Live since 14:13 UTC
- **V104-followup** (`96535012`) — be_course_changes canonical buildChangeAuditEntry shape + migration + AV92
- **V105** (`1a16e98b`) — customerDisplayName.js canonical resolver + SaleTab cancel atomic-rollback + AV93+AV94
- **V105-followup** (`cb88770c`) — stock movement createdAt ISO contract + MovementLogPanel defensive normalize + AV95 + e2e-stress 39/39 PASS
- **V107** (`f076a45d`) — light-theme universal fix: narrow `[class*="bg-[var"]` exception + extend 7 missing palettes + form-element safety net + bg-white border + AV96. **24/24 L2 verify PASS**

## Next action

- User L1 hands-on Rule Q V66: hard-refresh https://lover-clinic-app.vercel.app on iPhone Safari + verify modal text dark in light mode + CTA buttons preserve white + bg-white button has border (the original Light-theme bug report)

## Outstanding user-triggered actions

- **V106 stock-movement 30-day retention** — brainstorming locked (Q1=C hard-delete, Q2=A cron 03:00 BKK, Q3=A rolling 30d, Q4=A all types). Design presented. Awaiting user approval to write spec → invoke writing-plans skill
- L1 Rule Q V66 hands-on: verify all V104-V107 fixes on user's iPhone Safari (the original Light-theme bug report came from there)
