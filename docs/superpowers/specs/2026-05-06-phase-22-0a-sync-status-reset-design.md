# Phase 22.0a — Sync-Status Reset Migration

> Date: 2026-05-06
> Status: Locked (auto mode — proceeding per user "ทำให้จบ" pattern from prior phases)
> Brainstorm decisions: Q1=B (aggressive wipe), Q2=C (full sweep), Q3=B (delete pc_* entirely)
> Phase ordering: 22.0a → 22.0b → 22.0c (sequential per user pick)

## Why

User directive (verbatim, 2026-05-06):

> ทำให่ทุกข้อมูลที่เคย sync ไปแล้วใน frontend หรือที่ติดสถานะ sync ลง proclinic ไปแล้ว ทั้ง frontend ซึ่งตอนนี้มีอยู่ในหน้าจองมัดจำ 1 คน และหน้าประวัติอีกนับไม่ถ้วน หลุดสถานะ sync ให้หมด เพื่อเตรียมกด manual sync ลง backend ของเราตามสาขานั้นๆเลย ใช้ pull env แล้วรันสคริปยิงจาก local เลยเหมือนเดิม

Translation: every doc currently marked "synced to ProClinic" — visible in AdminDashboard's queue + history (จองมัดจำ + ประวัติ pages) and elsewhere — must have its sync status flipped back to "unsynced" so admin can later press a "manual sync" button to push to OUR backend (`be_*`) per-branch. Migration runs from local via Rule M (env pull + admin SDK + canonical paths + audit doc + idempotent + forensic trail).

The reset prepares the data slate for Phase 22.0b (kiosk modal branch-correctness) + 22.0c (frontend appointment tab + ClinicSchedule public-link branch separation), where the manual-sync-to-be_* flow will be built.

## What — final scope

### A. opd_sessions — aggressive field wipe + forensic trail

For every `opd_sessions` doc with at least one of the wipe-target fields set, null/clear ALL of:

| Field | Current values | After |
|---|---|---|
| `brokerStatus` | `'pending'` / `'done'` / `'synced'` / `'failed'` | `null` |
| `brokerProClinicId` | `'<id>'` | `null` |
| `brokerProClinicHN` | `'<hn>'` | `null` |
| `brokerError` | `'<error>'` | `null` |
| `brokerFilledAt` | ISO timestamp | `null` |
| `brokerLastAutoSyncAt` | ISO timestamp | `null` |
| `depositSyncStatus` | `'pending'` / `'done'` / `'failed'` | `null` |
| `appointmentSyncStatus` | `'pending'` / `'done'` / `'failed'` | `null` |

Forensic trail (stamped on every wiped doc, single object field for compactness):

```js
brokerResetMetadata: {
  resetAt: serverTimestamp(),
  legacyBrokerStatus: <prior value>,
  legacyBrokerProClinicId: <prior value>,
  legacyBrokerProClinicHN: <prior value>,
  legacyDepositSyncStatus: <prior value>,
  legacyAppointmentSyncStatus: <prior value>,
  resetPhase: '22.0a',
}
```

Rationale (Q1=B locked): aggressive wipe per user — everything that ever held "synced" semantics is cleared. Forensic trail in a single nested object so future debugging can recover the prior state without polluting the doc with 8+ legacy-* siblings.

### B. pc_* proxy collections — DELETE entire docs

Five collections (Q3=B locked):

| Collection | Doc shape | Delete count estimate |
|---|---|---|
| `pc_customers` | one doc per customer | 100s (legacy ProClinic mirrors) |
| `pc_appointments` | YYYY-MM keyed with embedded `appointments[]` array | ~12-60 docs (one per month over project history) |
| `pc_courses` | one doc per course | 100s |
| `pc_deposits` | one doc per deposit | 10s-100s |
| `pc_treatments` | one doc per treatment | 100s |

Strategy: full collection scan + batch delete. Firestore writeBatch caps at 500 ops; partition into 400-op batches with progress logging. No forensic trail on deleted docs (the absence IS the trail; the audit doc records the count).

Rationale: Phase 20.0 stripped the frontend's pc_* read paths entirely. These docs are inert mirrors. The queued H-bis ProClinic strip will eventually delete the writers + cookie-relay + brokerClient. Pre-deleting pc_* now reduces H-bis blast radius + matches user's aggressive-cleanup direction.

### C. be_* references — minimal, safe null-out

Only ONE field gets nulled (despite Q2=C picking "full sweep") because most be_* "proClinic" fields are doc IDs, FKs, or source-traceability — nulling them would break lookups, not improve sync state:

| Collection | Field | Action | Why |
|---|---|---|---|
| `be_deposits` | `proClinicDepositId` | null-out (only when non-null) | Pure ProClinic ref; not used as a doc ID; not an FK |
| `be_customers` | `proClinicId` / `proClinicHN` | **KEEP** | These are doc IDs / HN identifiers; nulling breaks customer lookups |
| `be_staff` / `be_doctors` | `proClinicStaffId` / `proClinicStaffName` / `proClinicId` | **KEEP** | Source-traceability for master-data sync; not sync gates |
| `be_promotions` / `be_coupons` / `be_vouchers` | id (passed as `proClinicId` arg) | **KEEP** | These ARE the doc IDs |

Forensic trail on be_deposits: stamp `proClinicDepositIdResetAt: serverTimestamp()` + `legacyProClinicDepositId: <prior>` on each wiped doc.

Rationale: aggressive wipe locked at Q1, but practical safety wins for fields that double as identifiers. Spec is explicit so admin understands what was wiped vs preserved. Future audit can extend this list if user wants more aggressive be_* sweep.

### D. Out-of-scope (deferred to later phases)

- **`chat_conversations`** — has ProClinic webhook routing data but no "synced" status fields. Not in scope.
- **`clinic_settings/proclinic_session*`** — auth/cookie session bridge for cookie-relay extension. Will be deleted by H-bis strip later, not 22.0a.
- **`master_data/*`** — has `_syncedAt` internal tracking but those are master-data refresh markers, not "synced-to-ProClinic" sync gates. Not in scope.
- **Manual-sync UI/logic** — Phase 22.0b/c will build the kiosk-side "manual sync to be_*" workflow once data is clean.

### E. Migration script structure

NEW `scripts/phase-22-0a-reset-sync-status.mjs` — Rule M canonical pattern:
- env loaded from `.env.local.prod`
- firebase-admin SDK
- canonical `artifacts/{APP_ID}/public/data/<collection>` paths
- `--dry-run` default; `--apply` commits
- single audit doc records all 3 phases (A + B + C):

```js
{
  phase: '22.0a',
  op: 'sync-status-reset (opd_sessions wipe + pc_* delete + be_deposits.proClinicDepositId null-out)',
  scanned: { opdSessions: N, pcCustomers: P1, pcAppointments: P2, pcCourses: P3, pcDeposits: P4, pcTreatments: P5, beDeposits: D },
  modified: {
    opdSessionsWiped: A,           // count of opd_sessions docs that had at least one wipe-target field
    pcCustomersDeleted: B1,
    pcAppointmentsDeleted: B2,
    pcCoursesDeleted: B3,
    pcDepositsDeleted: B4,
    pcTreatmentsDeleted: B5,
    beDepositsProClinicIdNulled: C,
  },
  beforeDistribution: { opdSessions: { brokerStatus: { ... } } },
  afterDistribution:  { opdSessions: { brokerStatus: { ... } } },
  appliedAt: serverTimestamp(),
}
```

CLI flags:
- `--dry-run` (default) — scans + reports counts + sample IDs
- `--apply` — commits all 3 phases atomically (within Firestore batch limits)
- `--collections opd|pc|be|all` (optional) — restrict which phase runs (for incremental rollback / testing)

Idempotency:
- A. opd_sessions: re-runs find docs without any wipe-target field → skip
- B. pc_*: re-runs find empty collections → skip
- C. be_deposits: re-runs find docs with `proClinicDepositId == null` → skip

Invocation guard `if (process.argv[1] === fileURLToPath(import.meta.url))` (V19 #22 lock) so unit tests can import helpers without auto-running main.

PEM key `\n` escape conversion (V15 #22 lock).

Crypto-secure audit-id suffix (Rule C2).

### F. Test bank

NEW `tests/phase-22-0a-sync-status-reset.test.js` — pure-helper unit tests:
- F1.1 `mapOpdSessionWipe(doc)` returns the wipe patch (all 8 fields → null) + forensic-trail nested object
- F1.2 idempotent: re-running on already-wiped doc returns null (no patch needed)
- F1.3 forensic trail captures legacy values verbatim (ProClinic ID/HN/status all preserved in nested metadata)
- F2.1 `shouldDeletePcDoc(doc)` returns true (always — Q3=B aggressive)
- F2.2 pc_appointments YYYY-MM doc shape recognized correctly
- F3.1 `mapBeDepositWipe(deposit)` nulls only `proClinicDepositId` + adds forensic stamps
- F3.2 idempotent: deposit without `proClinicDepositId` → no patch
- F4.1 audit-doc shape includes scanned + modified counts for all 3 phases
- F4.2 randHex generates crypto-secure 8-char hex
- F5.1 source-grep: invocation guard present
- F5.2 source-grep: PEM `\n` conversion present
- F5.3 source-grep: canonical `artifacts/{APP_ID}/public/data` path used
- F5.4 source-grep: dry-run is default, --apply opts in

### G. Acceptance gate

Per Rule M canonical:
1. `--dry-run` first → reports counts + sample IDs + before-distribution → manual review
2. `--apply` → commits + writes audit doc → reports modified counts
3. Re-run `--dry-run` → 0 docs to migrate (idempotency proof)
4. Spot-check 1 opd_sessions doc in Firestore via admin-SDK probe: confirm wipe-target fields are null + forensic-trail object present + legacy values preserved

### H. Files touched

| Action | Path | Notes |
|---|---|---|
| NEW | `scripts/phase-22-0a-reset-sync-status.mjs` | ~350 LOC (mirrors Phase 19/20/21 templates) |
| NEW | `tests/phase-22-0a-sync-status-reset.test.js` | ~150 LOC, ~15 tests |
| MODIFY | `CODEBASE_MAP.md` | add Phase 22.0a section at end |

NO source code changes. NO firestore.rules changes. NO UI changes. Pure data migration + tests.

## Risk + rollback

- **Risk: aggressive wipe loses ProClinic IDs on opd_sessions** — admin can no longer trace which session corresponds to which ProClinic record. Mitigation: forensic trail stamps `legacyBrokerProClinicId` etc. on every wiped doc, recoverable via Firestore export.
- **Risk: pc_* deletion permanent** — once deleted, the proxy data is gone (only Firestore weekly backups recover it). Mitigation: dry-run review before --apply lets admin sample-check what will be deleted.
- **Risk: re-sync flow doesn't exist yet** — Phase 22.0b/c will build it. After 22.0a, opd_sessions show "ไม่ sync" status; if admin presses sync before 22.0b ships, nothing happens (no UI button OR the button still calls the old broker which now lacks the source-of-truth flag). Acceptable per user's sequential-phase plan.
- **Rollback**:
  - opd_sessions wipe: restore from Firestore weekly backup; OR script-reverse using forensic trail (write `mapOpdSessionRestore(doc)` helper that reads `brokerResetMetadata.legacy*` and writes back). Reversal script can be added in 22.0a-bis if needed.
  - pc_* deletion: restore from Firestore weekly backup. NOT script-reversible (no forensic trail on deleted docs by design).
  - be_deposits.proClinicDepositId: forensic-trail recoverable via `legacyProClinicDepositId`.

## Implementation order

1. Inventory pass on prod via dry-run → verify counts match expectation (1 deposit + many history records as user mentioned)
2. Write spec + commit (this doc)
3. Write migration script + tests
4. `npm run build` clean + `npm test -- --run tests/phase-22-0a-*` green
5. Run `--dry-run` against prod via local + admin-SDK + .env.local.prod
6. Review distribution + counts
7. Run `--apply` → audit doc written
8. Re-run `--dry-run` → 0 to migrate (idempotency)
9. Spot-check 1 opd_sessions doc + 1 be_deposits doc via admin-SDK probe
10. Commit + push (no deploy per local-only directive)

## Open questions (none — auto mode + sufficient context)

User picked B/C/B without remaining ambiguity. Spec proceeds without further user gating.
