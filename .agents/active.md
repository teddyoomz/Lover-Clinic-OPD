---
updated_at: "2026-05-18 EOD+11 LATE+1 — V1.0 LIVE: V93/V94/V95 audit-all batch deployed + 3-iter audit-fix-audit converged GREEN"
status: "🎉 VERSION 1.0 LIVE. master = prod = `31368682`. Combined deploy complete (Vercel + Firebase rules/storage). Pre+post probes 4/4 IDENTICAL."
branch: "master"
last_commit: "31368682 fix(audit-iter3): TZ1 family expansion — validity-date arithmetic"
tests: "V93 35 + V94 41 + V95 21 + bsa-task6 1 = 116/116 audit batch GREEN · V8x 158/158 GREEN · full vitest ~12,000 PASS (17 pre-existing menu-d V90 test-debt + 1 Java-gated emulator unchanged)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "V1.0 LIVE — lover-clinic-94ywl4274-... aliased 2026-05-18 EOD+11 LATE+1 (V84+V85+AV82+V86 v1+V86-followup-2+V87+V88+V89+V90+V91+V92 + V93/V94/V95 audit batch + 3-iter audit-fix-audit GREEN)"
firestore_rules_version: "unchanged (idempotent — V82-Phone baseline; iter-all batch contains zero rule changes)"
storage_rules_version: "unchanged (idempotent)"
---

# Active Context

## 🎉 V1.0 MILESTONE
User declared (2026-05-18 EOD+11 LATE): "เรามาพักกัน โปรแกรมเราเริ่มที่ Version 1.0 แล้ว". V93/V94/V95 audit-all batch closes the pre-1.0 audit gap; iter-3 audit confirmed 0 P0-P1 remaining. Production live + alias serving. See `~/.claude/projects/F--LoverClinic-app/memory/project_v1_0_milestone.md` for full V1.0 baseline summary.

## What this session shipped (post-V92)

- **V93 — TZ1 family × 11 sites**: `new Date().toISOString().slice(0,10)` → `thaiTodayISO()`. 9 files (AdminDashboard / PatientDashboard / backendClient / centralStockOrderValidation×2 / QuotationPrintView / SalePrintView / RemainingCourseTab / CustomerCreatePage / lineBotResponder×2 inlined). audit-all flagged 8; Rule P Step 3 cross-file grep caught 3 more.
- **V94.S — S18 atomicity**: `cancelCentralStockOrder` writeBatch wraps cascade (batch.update + movement.set + order.update). Mirror of V34 cancelStockOrder pattern.
- **V94.H — H7 cascade port**: TreatmentTimeline.confirmCancel adds course-reverse cascade via scopedDataLayer.js (BS-1 compliant). Mirrors BackendDashboard:475-493. Safe fallback (try/catch + customerId-gated).
- **V94.A — A7 apiFetch helper**: NEW `api/_lib/apiFetch.js` (5s default timeout, AbortSignal.timeout). 18 sites in 9 api/ files migrated.
- **Iter-1 fix — clinicReportAggregator.js:298**: `slice(0,7)` → `thaiYearMonth()`. AV85 invariant added to audit-anti-vibe-code SKILL.md (TZ1 family lock).
- **Iter-3 fix — validity-date arithmetic × 2 sites**: backendClient.js:1523 + courseExchange.js:81 use NEW `thaiDateNDaysFromNow(days)` helper in utils.js. AV85 expanded with 5-entry closed sanctioned-exception list.
- **Test bank**: V93 (35) + V94 (41) + V95 (21) + bsa-task6 (1) = 116 assertions GREEN.
- **3 iterations audit-all** × 6 parallel general-purpose subagents → iter-3 confirmed 0 NEW P0-P1.

## Commits deployed this turn

```
31368682 fix(audit-iter3): TZ1 family expansion — validity-date arithmetic
79cf6fb6 fix(audit-iter2): V93 missed 12th TZ1 site + AV85 invariant lock
820601b1 fix(audit-batch): V93+V94 audit P0-P1 batch — TZ1×11 + S18 + H7 + A7
```

## Deploy

- **Vercel** `lover-clinic-94ywl4274-teddyoomz-4523s-projects.vercel.app` → aliased `lover-clinic-app.vercel.app` HTTP 200 ✓
- **Firebase** `firebase deploy --only firestore:rules,storage` ✓ (rules + storage both up-to-date — idempotent; iter-all has zero rule changes)
- **Probe-Deploy-Probe** 4/4 IDENTICAL pre+post (chat_conv 200 / be_line_reminder_log 403 / be_fb_configs 403 / be_staff_chat_messages 403)
- **Build clean** (BackendDashboard 952.14 KB unchanged)

## Next action

**Idle until user direction.** V1.0 is the production baseline. Options:
1. Fix 17× backend-menu-d V90 test-debt (pre-existing fails — older V21-T6 tests don't account for V90 entity-context auto-close).
2. New v1.0.x patch / v1.1.0 minor / v2.0.0 work.
3. L1 Rule Q hands-on multi-device verification across V93/V94/V95 surfaces.

## Outstanding user-triggered

- 17× backend-menu-d V90 test-debt fix (separate session — not blocking V1.0)
- v81 emulator Java-gated skip (intentional)
- L1 multi-device hands-on across V87-V95 surfaces (audit + visual verify on mobile)
- Chat-tab badge crowding (pre-V85 carryover)
- V82 Menu V2 mobile L1 re-test (carryover)
