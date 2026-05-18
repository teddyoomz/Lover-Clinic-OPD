---
name: audit-all
description: "Run all LoverClinic audits sequentially and produce a consolidated violation report. Covers money, stock, cascade, referential integrity, Firestore correctness, treatment form, clone/sync, React patterns, API layer, appointments, UI/culture/a11y, performance, frontend-specific timezone/links/forms, and anti-vibe-code (duplication + security + schema hygiene)."
user-invocable: true
argument-hint: "[--quick | --full]"
allowed-tools: "Read, Grep, Glob, Skill"
---

# Audit All — LoverClinic full stack

Meta-runner that chains every `audit-*` skill and aggregates output.

## Execution flow

Run these in order (17 total):

**Tier 1 — backend integrity (money/stock/cascade/branch, 53 invariants)**:
1. `/audit-money-flow` (M1–M15)
2. `/audit-stock-flow` (S1–S28) — V34 (2026-04-28) added S16-S20: per-tier conservation, time-travel replay, concurrent-write atomicity, listener alignment, test-prefix discipline. Phase 15.5 (2026-04-28) added S21-S25: per-product warning thresholds, anti-hardcoded-threshold, ActorPicker branchIds[] filter (5 panels), withdrawal approval admin endpoint, unit dropdown enrichment. V35 / Phase 15.6 (2026-04-28) added S26-S28: default-branch view passes includeLegacyMain, FK validation via _assertProductExists at every batch creator, ProductSelectField extracted (Rule C1 lock)
3. `/audit-cascade-logic` (C1–C15)
4. `/audit-branch-scope` (BS1–BS8) — BSA Task 9 (2026-05-04): UI imports only scopedDataLayer (not backendClient direct), no master_data/* reads in feature code (Rule H-quater), getAllMasterDataItems gone from UI (BSA Task 7 lock), branch-scoped listenTo* wired through useBranchAwareListener, COLLECTION_MATRIX classification, scopedDataLayer universal re-exports point to raw, _resolveBranchIdForWrite stamps preserved on every writer

**Tier 2 — data + system integrity (47 invariants)**:
5. `/audit-referential-integrity` (R1–R11) — FK / orphan detection
6. `/audit-firestore-correctness` (F1–F10) — rules, updateMask, snapshot 2x, counters
7. `/audit-clone-sync` (CL1–CL9) — Phase 1-2 races + dedup
8. `/audit-api-layer` (A1–A9) — Vercel serverless + webhooks

**Tier 3 — UI + user-facing (40 invariants)**:
9. `/audit-treatment-form` (TF1–TF10) — Phase 3 (3200 LOC)
10. `/audit-appointment-calendar` (AP1–AP8) — Phase 4 slot conflicts + TZ
11. `/audit-react-patterns` (RP1–RP10) — IIFE JSX, stale closure, listeners
12. `/audit-ui-cultural-a11y` (UC1–UC8) — Thai rules + WCAG 2.2
13. `/audit-performance` (P1–P8) — N+1, bundle, pagination

**Tier 4 — frontend-specific (28 invariants — session 2026-04-19)**:
14. `/audit-frontend-timezone` (TZ1–TZ8) — Thai GMT+7 correctness (naked `new Date()`, `.toISOString()` drifts, `.getDay()` TZ-fragile)
15. `/audit-frontend-links` (LK1–LK10) — schedule/patient/QR link persisted-filter + resync consistency + legacy-doc defaults
16. `/audit-frontend-forms` (FF1–FF10) — DateField, scrollToError, submit-disable, edit-mode restore, Thai error copy

**Tier 5 — hygiene / anti-vibe-code (51 invariants — session 2026-04-19, extended 2026-04-20)**:
17. `/audit-anti-vibe-code` (AV1–AV12) — Rule of 3 duplication, `Math.random` tokens, leaked uids in world-readable docs, open Firestore/Storage rules, orphan collections, over-normalized schema
18. `/audit-backend-firestore-only` (BF1–BF7) — backend UI ห้าม import brokerClient หรือเรียก /api/proclinic/* ยกเว้น MasterDataTab (rule 03-stack.md). Phase 9 violation 2026-04-19.
19. `/audit-firebase-admin-security` (FA1–FA12) — privileged api/admin/** endpoints: private-key hygiene, token verification with checkRevoked, admin gate (custom claim OR bootstrap UID), self-protection on delete/revoke-admin, input validation, CORS + method gates, no `firebase-admin` imports in src/. Phase 12.0 infrastructure.
20. `/audit-finance-completeness` (FC1–FC20) — every Phase 12 entity has validator + CRUD + Firestore rule + tests + Rule E cleanliness. 5-seller + 3-payment-method limits enforced. Claims aggregator + P&L reconcile. State machines present. Production vs @dev-only separation. Required before Phase 13 ships.

**Tier 6 — Phase 10 Reports & Analytics (15 invariants — session 2026-04-19)**:
21. `/audit-reports-accuracy` (AR1–AR15) — date-range inclusivity, cancelled-row exclusion, roundTHB consistency, refund/VAT separation, footer reconciliation, CSV-table parity, RFM stability, defensive field access, idempotency. Required for any Phase 10 report tab change.

**Tier 7 — Chat notification pipeline (8 invariants — session 2026-04-22 phantom-noti fix)**:
22. `/audit-chat-notifications` (AN1–AN8) — sound trigger wires to `chatUnread` not `chatConvCount`, `ChatDetailView` mount effect zeros `unreadCount`, `api/webhook/send.js` zeros `unreadCount`, shared `countUnreadPeople` / `shouldRingChatAlert` / `shouldRingChatInterval` helpers enforced via Rule of 3, Firestore REST string `integerValue` coerced, PHANTOM-NOTI REPRO tests present. User-reported 2026-04-22 "noti เตือนค้างแต่ไม่มีแชทค้าง".

**Total: 238 invariants**. Do NOT write report to disk — chat output only.

## Consolidated report format

```
# Audit All Report — <YYYY-MM-DD HH:MM>

## Overall Summary
- Total invariants checked: 135
- ✅ PASS: X
- ⚠️  WARN: Y
- ❌ VIOLATION: Z
- Scope: {--quick | --full}

## Violations by severity

### CRITICAL — money creation/loss, audit chain broken, orphaned data, credential leak
- {list from all 13 skills}

### HIGH — cascade incompleteness, concurrent race, slot double-book, memory leak
- {list}

### MEDIUM — audit-field gaps, silent catches, small data drift
- {list}

### LOW — accessibility, polish, performance micro-improvements
- {list}

## Warnings (aggregated from all tiers)
- {list}

## Passing (counts per skill)
- audit-money-flow: X/15
- audit-stock-flow: Y/25
- audit-cascade-logic: Z/15
- ... etc.

## Top-N recommended fixes (ranked by blast radius)
1. ...
2. ...

## Marketplace skills to invoke as follow-up
- /harden — for the longest files after WARN fixes
- /firestore-security-rules-auditor — if F2-F4 flagged
- /security-review — if A4 (credential leak) flagged
- /audit (generic) — for UC5 axe-core contrast scan
- /vercel-react-best-practices — if P4 memo issues found
- /polish — final pre-release pass

## Meta
- Skills invoked: 13
- Files read: {summary}
- Grep patterns run: ~135
- Known limitations: static audit only; concurrency/race bugs inferred, not execution-verified
```

## Severity mapping

- **CRITICAL**: money can be created/lost, audit chain broken, orphaned data in production, credential leak (MOPH + financial audit failures)
- **HIGH**: cascade incomplete, concurrency corruption under normal usage, memory leak bounded by working hours, slot double-booking
- **MEDIUM**: silent failures, audit-field gaps, small data drift, stale UI state
- **LOW**: accessibility polish, performance micro-gains, cosmetic consistency

## Do NOT
- Write the report to disk — chat only
- Auto-fix anything — separate session per violation category
- Skip any skill — the 13 cover complementary dimensions; skipping one leaves holes
