---
title: Data ops via local + admin SDK + pull env (Rule M)
type: concept
date-created: 2026-05-06
date-updated: 2026-05-06
tags: [iron-clad, rule-m, migration, admin-sdk, deployment]
source-count: 2
---

# Data ops via local + admin SDK + pull env (Rule M)

> Whenever the user authorizes ANY data manipulation against production Firestore — edit / migrate / delete / create / cascade-cleanup / bulk-update / counter-reset / reclassify — execute it from LOCAL via firebase-admin SDK + pulled Vercel env. Do NOT wait for a deploy cycle. Data-only ops live in `scripts/` or one-shot node commands, not in shipped code.

## Overview

Codified 2026-05-06 per user directive: *"ถ้ามีการสั่งให้แก้ข้อมูล ย้ายข้อมูล ลบข้อมูล สร้างข้อมูล หรือจัดการต่างๆเกี่ยวกับข้อมูลให้ pull env แล้วทำเลยจาก local ไม่ต้องรอ deploy"*. The pattern formalizes what Phase 18.0 (Branch Exam Rooms seed) and Phase 19.0 (appointment-type migration) already did successfully.

**Why local-first wins**: when migration script bugs surface (and they do — V15 #22 caught two latent ones in <10min), the iteration loop is `edit script → re-run --dry-run`. Compare to a deploy-coupled migration where each fix requires `commit → push → vercel build → wait → re-probe → re-trigger`. Same failure mode = 30-60min vs 30-60s.

## Required workflow (10 steps)

1. **Pull env**: `vercel env pull .env.local.prod --environment=production` (refresh creds; pulled-within-this-session is fine).
2. **Use admin SDK** (firebase-admin) — bypasses rules + reaches all paths. Never use unauth REST or client SDK for data ops.
3. **Use canonical paths**: production data lives at `artifacts/{APP_ID}/public/data/{collection}` where `APP_ID = 'loverclinic-opd-4c39b'`. Bare `/{collection}` writes go to default-deny limbo. (Both Phase 18.0 + Phase 19.0 had this bug; lesson is now permanent.)
4. **PEM key conversion**: `.env.local.prod` stores `FIREBASE_ADMIN_PRIVATE_KEY` with literal `\n` escapes — convert via `key.split('\\n').join('\n')` before passing to `cert(...)`.
5. **Two-phase**: every script defaults to dry-run; commits writes only when invoked with `--apply`. Phase 18.0 + 19.0 migration scripts are the canonical templates.
6. **Audit doc**: every batch op writes `artifacts/{APP_ID}/public/data/be_admin_audit/<phase>-<op>-<ts>-<rand>` with `{scanned, migrated/deleted/created, skipped, beforeDistribution, afterDistribution, appliedAt}`.
7. **Idempotency**: re-run with `--apply` must yield 0 writes. Build the skip-on-already-migrated check into the script.
8. **Forensic-trail fields** when mutating existing docs: stamp `<field>MigratedAt: serverTimestamp()` + `<field>LegacyValue: <prior>`.
9. **Invocation guard**: every `.mjs` script wraps its `main()` call in `if (process.argv[1] === fileURLToPath(import.meta.url))` so unit-test imports don't auto-trigger Firebase init.
10. **Crypto-secure random**: audit-doc IDs use `randomBytes(...).toString('hex')` (not `Math.random`).

## Anti-patterns (each surfaced as a real bug)

- ❌ Adding a one-shot data-fix to a UI component as "do it on next page-load if state is missing X" — deploy-coupled + race-prone.
- ❌ Embedding ID lists / collection paths directly in admin endpoints expecting users to invoke them via the UI — admin endpoints are for staff-clicked runtime ops; data migration is a developer concern.
- ❌ Modifying production data via Firebase Console manually — leaves no audit trail + zero re-run safety.
- ❌ Deploying code that contains a one-shot migration → 1st-load auto-trigger. Deploy churn + rollback complexity unjustified.
- ❌ Using `db.collection('foo')` (root path) instead of `db.collection('artifacts/{APP_ID}/public/data/foo')` — surfaced live during V15 #22 (Phase 19.0).

## When this rule does NOT apply

- Pre-deploy migration script scaffolding shipped to `scripts/` BEFORE the V-deploy is OK (the *script* ships, the *--apply* runs from local later).
- Schema/rule changes that REQUIRE deploy coupling (e.g. tightening a Firestore rule) — those go through [Probe-Deploy-Probe](iron-clad-rules.md) (Rule B), not data ops.
- Test-fixture scaffolding for adversarial tests — uses mock Firestore, not real prod data.

## Lesson lock — V15 #22 Phase 19.0 (2026-05-06)

The migration script had two latent bugs:
1. PEM-parse failure — env loader's `\n` literal not converted before `cert(...)`.
2. Bare-collection-path — `db.collection('be_appointments')` instead of `db.collection('artifacts/.../be_appointments')` → scanned 0 docs.

Both surfaced ONLY at LIVE execution time. Both fixed in <10min because the run was local + admin-SDK. Had this been a UI-triggered migration, fix would have required redeploy + new probe cycle. **Local-first wins on iteration speed AND blast-radius control.**

## Cross-references

- Iron-clad: [Iron-clad rules A-M](iron-clad-rules.md) — Rule M canonical body in `.claude/rules/01-iron-clad.md` Rule M (line ~119)
- Related concept: [V12 shape-drift](v12-shape-drift.md) — when readers + writers diverge, migration scripts close the gap
- Canonical templates: `scripts/phase-18-0-seed-exam-rooms.mjs` + `scripts/phase-19-0-migrate-appointment-types.mjs`

## History

- 2026-05-06 — Created during /session-end after Phase 19.0 ship + Rule M codification. User directive verbatim filed in `.claude/rules/01-iron-clad.md`.
