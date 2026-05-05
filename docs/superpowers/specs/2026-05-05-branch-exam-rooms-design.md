# Phase 18.0 — Branch Exam Rooms

**Date**: 2026-05-05
**Status**: Design approved (brainstorming complete)
**Predecessor**: Phase 17.2-ter — TodaysDoctorsPanel branch leak fix (commit `281c871`, awaiting V15 #19 deploy)

## User directive (verbatim, 2026-05-05)

> "ตั้งสาขาของเราต้องเพิ่ม การเพิ่มลดห้องตรวจ แบบ https://trial.proclinicth.com/admin/branch ซึ่งจะมีผลกับการนัดหมายคือไปโผล่อยู่ในทุกการนัดหมายที่เลือกห้องได้ และตรง ตารางแพทย์ ผู้ช่วยด้วย และตรงตารางในหน้า tab=appointments ก็จะต้องปรับตารางตามห้องตรวจของแต่ละสาขาที่เลือกเพิ่มลดไว้ด้วย ซึ่งแต่ละสาขาจะมีห้องตรวจไม่เหมือนกันและไม่เท่ากันดังนั้น ข้อมูลห้องตรวจจะต้องเก็บแยกเป็นสาขาไว้ และแต่ละสาขาใช้กันต่างหากไม่เกี่ยวข้องกัน และทำให้สาขา นครราชสีมามีทั้งหมด 3 ห้องคือ ห้องแพทย์/ห้องผ่าตัด, ห้องช็อคเวฟ, ห้องดริป เสร็จแล้วย้ายข้อมูลการนัดหมายทั้งหมดของสาขานครราชสีมาในปัจจุบัน ที่ไม่มีห้องตรวจนั้นอยู่แล้ว ไปที่ ไม่ระบุห้อง แทน ข้อมูลจะได้อยู่ครบไม่หายไปไหน หรือทำให้ออโต้ไปเลยก็ได้เผื่ออนาคตมีการลบห้องตรวจ คือทำให้ไอ้การนัดหมายหรือตารางแพทย์ ผู้ช่วย ที่มีห้องที่ไม่มีอยู่แล้วในสาขานั้นๆ ไปอยู่ในหมวด ไม่ระบุห้อง อัตโนมัติ เพื่อป้องกันข้อมูลมั่ว"

Translation: add branch-scoped exam-room CRUD (modeled on ProClinic `/admin/branch`). Rooms surface in the appointment booking dropdown and the AppointmentTab calendar grid (column layout follows each branch's own room list). Each branch has independent rooms — different counts, different names, no cross-branch leak. Seed นครราชสีมา with 3 rooms (ห้องแพทย์/ห้องผ่าตัด, ห้องช็อคเวฟ, ห้องดริป). Existing นครราชสีมา appointments without rooms route to "ไม่ระบุห้อง" automatically. Make this auto for future room deletions too — appointments referencing a deleted/non-existent room fall into "ไม่ระบุห้อง" automatically to prevent data corruption.

## Approved decisions (locked from brainstorming Q1-Q5)

- **Q1 — Storage shape**: NEW `be_exam_rooms` collection with `branchId` field. Standard BSA pattern (matches `be_products` / `be_courses` / `be_holidays` / `be_df_groups`). Audit-branch-scope BS-1..BS-9 covers it; one new entry in `firestore.rules` + `branch-collection-coverage.test.js`.
- **Q2 — Appointment ↔ room reference**: Both `roomId` (FK string) AND `roomName` (snapshot string) written on every appt save. Matches the project's universal denormalization pattern (sales store productName alongside productId). Print/PDF/Report readers (which already use `roomName` today) need no join. Deletion-safe: historical prints keep "ห้องดริป" text even after the master is deleted.
- **Q3 — Schedule entry integration**: NO change to `be_staff_schedules` shape. DoctorSchedulesTab + EmployeeSchedulesTab stay room-agnostic. Only AppointmentTab grid + AppointmentFormModal dropdown source from the new master.
- **Q4 — AppointmentTab column layout**: Columns = ALL rooms in current branch (sorted by `sortOrder` then `name`) + a virtual "ไม่ระบุห้อง" column for orphan/blank/cross-branch/stale appts. Branch switch → columns swap to that branch's rooms immediately. Empty rooms still render as columns (admin can drag-create even if no booking yet today).
- **Q5 — Migration shape**: Seed-and-smart-backfill (B-soft variant). One-shot script seeds 3 rooms for นครราชสีมา + audits + backfills `roomId` on appts whose existing `roomName` exact-matches (case-insensitive trim) one of the three seeded names. Non-matching appts keep their `roomName` text and route to "ไม่ระบุห้อง" at render. Soft-confirm dialog on room delete (count attached appts, warn, allow proceed; runtime fallback handles routing — no writes to appts on delete).

## Architecture

Phase 18.0 = the canonical branch-scoped master entity. Surfaces:

1. **Data**: `be_exam_rooms/{examRoomId}` — branch-scoped, follows existing be_products / be_courses pattern. `be_appointments` gains `roomId` field on writes (existing `roomName` snapshot retained).
2. **Backend layer**: `backendClient.js` adds `listExamRooms` / `listenToExamRoomsByBranch` / `saveExamRoom` / `deleteExamRoom`. All branchId-stamped via `_resolveBranchIdForWrite`. `scopedDataLayer.js` re-exports for UI consumption.
3. **Master CRUD UI**: NEW `ExamRoomsTab.jsx` under "ข้อมูลพื้นฐาน". NEW `ExamRoomFormModal.jsx`. NEW `examRoomValidation.js` pure helpers.
4. **Appointment integration**:
   - `AppointmentFormModal.jsx` — replace `FALLBACK_ROOMS` array + localStorage `appt-rooms-seen` cache with `listExamRooms({branchId: selectedBranchId, status: 'ใช้งาน'})`. On save, write both `roomId` (selected examRoomId) + `roomName` (snapshot from selected room).
   - `AppointmentTab.jsx` — column derivation pulls rooms via `useBranchAwareListener(listenToExamRoomsByBranch)`. Append "ไม่ระบุห้อง" virtual column iff any day-appt has blank or stale `roomId`.
5. **Permission**: NEW `exam_room_management` permission key (separate from `branch_management` for finer ACL — admin can grant "edit rooms" without "edit branches").
6. **Migration**: `scripts/phase-18-0-seed-exam-rooms.mjs` (one-shot, dry-run by default).
7. **Rules**: NEW `match /be_exam_rooms/{roomId}` block — standard `isClinicStaff()` read+write gate.

## Out of scope (locked, do not touch)

- **Schedule entry shape** — Q3 lock. `be_staff_schedules` keeps its current schema; no `roomId` field added. DoctorSchedulesTab + EmployeeSchedulesTab unchanged.
- **AppointmentTab column toggle UX** — Q4=A locked "always show all branch rooms"; no admin-side toggle to switch to per-day-only column mode.
- **Cross-branch room sharing** — by design rooms are independent per branch. No "shared" or "global" rooms.
- **Frontend `AdminDashboard.jsx` references to `roomId` (numeric, ProClinic legacy)** — different concept; lines 328/625/734 use ProClinic-imported numeric room IDs from `pc_*` schedule docs. NOT touched by this phase. Phase 18.0 only changes the backend `be_appointments` doc shape and the backend UI surfaces.
- **`pc_*` mirror collections** — frontend patient-form / admin-dashboard schedule grid (`pc_appointments` etc.) outside scope. This phase only changes `be_*`.
- **DepositPanel.jsx** appointment.roomName display (line 1044) — read-only, sources from existing appt doc snapshot; works without modification because `roomName` snapshot is preserved.
- **CustomerDetailView.jsx** treatment.roomName display (line 2195) — same; read-only via snapshot.

## Data shape

### `be_exam_rooms/{examRoomId}` (branch-scoped)

```js
{
  examRoomId: "EXR-<ts>-<hex>",      // doc id; matches generateMarketingId('EXR') pattern
  branchId: "BR-...",                 // FK; immutable post-create; stamped via _resolveBranchIdForWrite on save
  name: "ห้องดริป",                    // required, ≤ 80 chars, unique within branch (case-insensitive trim)
  nameEn: "Drip room",                // optional, ≤ 80 chars
  note: "",                           // optional, ≤ 200 chars
  status: "ใช้งาน" | "พักใช้งาน",      // enum, default "ใช้งาน"
  sortOrder: 0,                       // integer ≥ 0; AppointmentTab column order; default 0
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
}
```

### `be_appointments` doc shape additions

```js
{
  ...existing,
  roomId: "EXR-..." | "",              // NEW — examRoomId FK; "" allowed for "no room"
  roomName: "ห้องดริป",                // EXISTING — snapshot for historical display
}
```

`roomId` is best-effort: write-time the modal sets it from the selected examRoom; legacy appts have it as `""` or missing entirely. Render-time fallback (below) handles both.

### Runtime fallback contract

```js
const UNASSIGNED_ROOM_ID = '__UNASSIGNED__';

function effectiveRoomId(appt, branchRoomIds /* Set<string> */) {
  if (!appt.roomId) return UNASSIGNED_ROOM_ID;          // blank or missing
  if (!branchRoomIds.has(appt.roomId)) return UNASSIGNED_ROOM_ID; // stale/cross-branch/deleted
  return appt.roomId;
}
```

- AppointmentTab column mapping uses this on every appt for the visible day
- Deleting a room → next render routes its N appts to ไม่ระบุห้อง column. Zero writes to appt docs on delete.
- The virtual column appears iff at least one appt resolves to UNASSIGNED for the visible day

## Files touched

### NEW

| Path | Purpose | LOC est. |
|---|---|---|
| `src/lib/examRoomValidation.js` | Pure helpers: `validateExamRoom`, `emptyExamRoomForm`, `normalizeExamRoom`, `STATUS_OPTIONS`, `NAME_MAX_LENGTH`, `NOTE_MAX_LENGTH` | ~120 |
| `src/components/backend/ExamRoomFormModal.jsx` | MarketingFormShell-shaped modal — fields: name (req) / nameEn / note / status / sortOrder | ~150 |
| `src/components/backend/ExamRoomsTab.jsx` | MarketingTabShell tab — list grid · search · status filter · CRUD wired via scopedDataLayer | ~180 |
| `scripts/phase-18-0-seed-exam-rooms.mjs` | One-shot admin SDK script — seed 3 rooms + audit + backfill | ~250 |
| `tests/phase-18-0-exam-rooms-flow-simulate.test.js` | Rule I full-flow simulate F1-F7 | ~250 |
| `tests/phase-18-0-exam-rooms-helpers.test.js` | Pure helpers + adversarial inputs | ~150 |
| `tests/phase-18-0-exam-rooms-tab.test.jsx` | RTL CRUD coverage | ~150 |
| `tests/phase-18-0-appointment-form-rooms.test.jsx` | RTL — dropdown swap + roomId/roomName write contract | ~150 |
| `tests/phase-18-0-appointment-tab-columns.test.jsx` | Column rebuild logic + virtual ไม่ระบุห้อง column | ~150 |

### MOD

| Path | Change |
|---|---|
| `src/lib/backendClient.js` | Add `examRoomsCol`, `examRoomDoc`, `listExamRooms({branchId, allBranches, status})`, `listenToExamRoomsByBranch`, `saveExamRoom(id, data, opts)`, `deleteExamRoom(id)`. Stamp branchId via `_resolveBranchIdForWrite`. ~80 LOC delta. |
| `src/lib/scopedDataLayer.js` | Re-export 4 helpers. ~10 LOC delta. |
| `src/components/backend/AppointmentFormModal.jsx` | Drop `FALLBACK_ROOMS` const + `ROOMS_CACHE_KEY` + localStorage cache lines. Load `examRooms` via `listExamRooms({branchId, status: 'ใช้งาน'})`. Dropdown options = examRooms.map → `<option value={room.examRoomId}>{room.name}</option>`. State holds `roomId` (selected examRoomId) + derived `roomName` snapshot. Submit writes both. ~30 LOC delta. |
| `src/components/backend/AppointmentTab.jsx` | Column derivation: replace `roomSet` (built from appt strings) with `branchRooms` from `useBranchAwareListener(listenToExamRoomsByBranch)` sorted by `sortOrder` then `name`. Build `branchRoomIds: Set<string>` for fallback check. Append `UNASSIGNED_ROOM_ID` virtual column iff any appt resolves to it. ~40 LOC delta. |
| `src/components/backend/DepositPanel.jsx` | Deposit→appointment flow currently writes `roomName: apptRoomName` (line 321) without `roomId`. Add `apptRoomId` state + listExamRooms-driven dropdown sourced from selected branch; on save, write both `roomId` + `roomName`. ~30 LOC delta. |
| `src/lib/permissionGroupValidation.js` | Add `exam_room_management` to `ALL_PERMISSION_KEYS` under "ตั้งค่า / ข้อมูลพื้นฐาน" section. |
| `nav/navConfig.js` | Add `'exam-rooms'` entry in master section. |
| `src/pages/BackendDashboard.jsx` | Lazy import `ExamRoomsTab` + render case for `tab='exam-rooms'`. |
| `firestore.rules` | New match block: `match /artifacts/{appId}/public/data/be_exam_rooms/{roomId} { allow read, write: if isClinicStaff(); }`. Bumps rules version. |
| `tests/branch-collection-coverage.test.js` | Add `be_exam_rooms: { scope: 'branch' }` to `COLLECTION_MATRIX` (BC1.1 enforces). |
| `tests/audit-branch-scope.test.js` | Confirm BS-1..BS-9 cover `be_exam_rooms` (likely automatic — listExamRooms goes through scopedDataLayer wrapper). |
| Stale tests | Update `phase11-master-data-scaffold.test.jsx` M2 master section count + `backend-nav-config.test.js` I4 if either asserts a count. |

## Migration script — `scripts/phase-18-0-seed-exam-rooms.mjs`

One-shot admin SDK script. Run via `node scripts/phase-18-0-seed-exam-rooms.mjs [--dry-run|--apply]`. Default `--dry-run`.

### Pseudo-flow

```
1. Init firebase-admin via FIREBASE_ADMIN_* env vars.

2. Resolve นครราชสีมา branchId:
   - Query be_branches.where('name','==','นครราชสีมา').limit(1)
   - If 0 docs → exit 1 with "branch 'นครราชสีมา' not found — please create it via BranchesTab first"
   - If >1 docs → log warning + use the oldest by createdAt (deterministic)

3. Build seed list:
   const SEED_ROOMS = [
     { name: 'ห้องแพทย์/ห้องผ่าตัด', sortOrder: 0 },
     { name: 'ห้องช็อคเวฟ',           sortOrder: 1 },
     { name: 'ห้องดริป',              sortOrder: 2 },
   ];

4. Survey existing be_exam_rooms for the target branchId (idempotency via NAME lookup, not ID):
   - Read all be_exam_rooms.where('branchId','==', target.branchId)
   - Build name → existing-room map: { normalize(r.name): r, ... } where normalize = String(s||'').trim().toLowerCase()
   - For each SEED_ROOM:
     - If normalize(SEED_ROOM.name) exists in map: capture existing examRoomId (skip CREATE; reuse for backfill mapping); record in existingRoomsSkipped audit list
     - Else: queue CREATE with examRoomId = `EXR-${ts}-${randomHex8}` (matches generateMarketingId('EXR') pattern); update name→id map with the new id

   This name-keyed idempotency means re-runs are safe even if the script's ID-generation strategy changes; the source of truth for "does this room already exist" is its NAME within the target branch.

5. Survey be_appointments at target branch for backfill candidates:
   - Read be_appointments.where('branchId','==', target.branchId)
   - For each appt: skip if roomId already set + non-empty
   - Compute normalize(roomName) = String(roomName||'').trim().toLowerCase()
   - Build seed-name lookup: { 'ห้องแพทย์/ห้องผ่าตัด' → seedRoomId, ... }
   - If normalize(roomName) matches a seed name (case-insensitive trim): queue UPDATE { roomId: seedRoomId }
   - Else: leave alone

6. Print preview:
   - "Branch: นครราชสีมา (id={target.branchId})"
   - "Rooms to create: [list of {name, examRoomId}]"
   - "Rooms already exist: [list, will skip]"
   - "Appts to backfill: { 'ห้องดริป': N, 'ห้องช็อคเวฟ': M, 'ห้องแพทย์/ห้องผ่าตัด': K }"
   - "Appts unmatched: U (will stay in ไม่ระบุห้อง column at render)"

7. If --dry-run: stop. Print "DRY RUN — re-run with --apply to commit."

8. If --apply:
   - Chunk all writes into batches of <=500 ops via chunkOps500()
   - Per-batch:
     - For each new room: tx.set(examRoomDoc(id), { branchId, name, status: 'ใช้งาน', sortOrder, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
     - For each backfill appt: tx.update(appointmentDoc(id), { roomId: matchedSeedId })
   - Final batch: tx.set(audit doc with V14 maybeTruncate)
   - Sequential commits

9. Audit doc: be_admin_audit/phase-18-0-seed-exam-rooms-{ts}-{uuid}
   {
     phase: 'phase-18-0-seed-exam-rooms',
     branchId: target.branchId,
     branchName: 'นครราชสีมา',
     seededRooms: [{ examRoomId, name, sortOrder }, ...],
     existingRoomsSkipped: [{ examRoomId, name, reason }, ...],
     backfillCounts: { 'ห้องดริป': N, ... },
     unmatchedAppts: U,
     ranAt: serverTimestamp(),
     ranBy: process.env.USER || 'admin-script',
     mode: 'apply',
   }

10. Idempotent — re-run with --apply produces zero new writes (every seed exists, every backfill already has roomId).
```

## UI surfaces — detail

### `ExamRoomsTab.jsx`

Mirrors `HolidaysTab` / `BranchesTab` shape (MarketingTabShell). Branch-scoped via `useSelectedBranch`. Search box (filters name/nameEn/note). Status filter dropdown.

Card layout per room:
- Icon (DoorOpen or similar from lucide-react)
- name (bold) + nameEn (smaller muted)
- status badge (ใช้งาน green / พักใช้งาน gray)
- sortOrder
- Edit + Delete buttons (Delete gated on `exam_room_management` permission)

Delete flow:
1. Click Delete → query `be_appointments.where('branchId','==',branchId).where('roomId','==',examRoomId)` count
2. Confirm dialog: "ลบ ห้อง X — มีนัดหมาย N รายการ จะถูกย้ายไป ไม่ระบุห้อง อัตโนมัติ — ยืนยันลบ?"
3. On confirm → `deleteExamRoom(id)` (deletes the master doc only; runtime fallback handles routing on next render)
4. No writes to appt docs on delete

### `ExamRoomFormModal.jsx`

Fields:
- `name` (required, Thai input, ≤ 80 chars, unique within branch)
- `nameEn` (optional, ≤ 80 chars)
- `note` (optional textarea, ≤ 200 chars)
- `status` (select: ใช้งาน / พักใช้งาน, default ใช้งาน)
- `sortOrder` (number input, default 0, integer ≥ 0)

Validation runs `validateExamRoom` (pure helper) before `saveExamRoom`. Uniqueness check: query `be_exam_rooms.where('branchId','==',branchId).where('name','==',normalized name)` — if found and id ≠ current → reject with `'ชื่อห้องซ้ำในสาขานี้'`.

### `AppointmentFormModal.jsx` modifications

- Remove `FALLBACK_ROOMS` const (line ~70)
- Remove `ROOMS_CACHE_KEY` const + localStorage init (lines 65, 227-232)
- Remove the localStorage cache write on save (lines 425-430)
- Add `examRooms` state + load via `useEffect`:
  ```js
  const [examRooms, setExamRooms] = useState([]);
  useEffect(() => {
    listExamRooms({ branchId: selectedBranchId, status: 'ใช้งาน' })
      .then(rs => setExamRooms((rs || []).slice().sort((a,b) =>
        (a.sortOrder||0) - (b.sortOrder||0) || String(a.name).localeCompare(String(b.name), 'th'))))
      .catch(() => setExamRooms([]));
  }, [selectedBranchId]);
  ```
- Form state changes:
  - `formData.roomId` (NEW; default '')
  - `formData.roomName` (existing; default '')
- Dropdown:
  ```jsx
  <select value={formData.roomId} onChange={e => {
    const room = examRooms.find(r => r.examRoomId === e.target.value);
    update({ roomId: e.target.value, roomName: room ? room.name : '' });
  }}>
    <option value="">— ไม่ระบุห้อง —</option>
    {examRooms.map(r => <option key={r.examRoomId} value={r.examRoomId}>{r.name}</option>)}
  </select>
  ```
- Submit payload writes both `roomId` + `roomName`
- Edit mode: load appt's `roomId`; if `examRooms.find(r=>r.examRoomId===appt.roomId)` returns null → display "(ห้องที่ลบแล้ว: appt.roomName)" hint and let user re-pick

### `AppointmentTab.jsx` modifications

- Add `examRooms` state + listener via `useBranchAwareListener(listenToExamRoomsByBranch)`
- Replace `roomSet` derivation (which scans monthAppts/dayAppts for unique roomName strings) with:
  ```js
  const branchRoomIds = useMemo(() => new Set(examRooms.map(r => r.examRoomId)), [examRooms]);
  const orderedColumnRooms = useMemo(() =>
    examRooms.slice().sort((a,b) =>
      (a.sortOrder||0) - (b.sortOrder||0) ||
      String(a.name).localeCompare(String(b.name), 'th')
    ), [examRooms]);
  ```
- Build column list: `orderedColumnRooms.map(r => ({ id: r.examRoomId, label: r.name }))`. Append `{ id: UNASSIGNED_ROOM_ID, label: 'ไม่ระบุห้อง' }` iff `dayAppts.some(a => effectiveRoomId(a, branchRoomIds) === UNASSIGNED_ROOM_ID)`.
- Appt-to-column mapping uses `effectiveRoomId(appt, branchRoomIds)` — mismatched/blank/stale roomIds → UNASSIGNED column

## Tests (Rule K work-first-test-last; Rule I full-flow simulate mandatory)

Build all source files first → review structure → write test bank in single pass before commit.

### `tests/phase-18-0-exam-rooms-flow-simulate.test.js` — Rule I

- F1: seed migration script idempotency (dry-run reports → apply writes → re-run apply zero ops)
- F2: list scopedDataLayer.listExamRooms with branchId injection (selected branch only) + allBranches opt-out
- F3: AppointmentFormModal saves appt with roomId + roomName snapshot; both visible in stored doc
- F4: room delete → next render of AppointmentTab routes its appts to ไม่ระบุห้อง column without writes to appt docs (runtime fallback)
- F5: cross-branch isolation — branch A's rooms invisible to branch B's AppointmentFormModal/AppointmentTab; switch branch in BranchSelector → columns swap
- F6: unmatched-name appointment after migration (`roomName: 'ห้องอื่นๆ'`) lands in ไม่ระบุห้อง column on render
- F7: source-grep regression guards — every appointment writer (createBackendAppointment / updateBackendAppointment / DepositPanel deposit→appointment / cloneOrchestrator) writes both `roomId` + `roomName`; AppointmentFormModal has NO `FALLBACK_ROOMS` constant; AppointmentTab uses `effectiveRoomId` helper

### `tests/phase-18-0-exam-rooms-helpers.test.js`

- Validation: required name; length bounds; status enum; sortOrder integer ≥ 0
- Adversarial: empty/null/undefined/array/object inputs; whitespace-only name; Thai+EN mix; very long strings
- Uniqueness pure helper (case-insensitive trim across same-branch room list)
- `normalizeExamRoom` strips whitespace + defaults

### `tests/phase-18-0-exam-rooms-tab.test.jsx`

- RTL: render → list rooms → search filters → status filter → click create → form modal opens → fill → save → list refreshes
- Edit + Delete buttons gated on `exam_room_management` permission
- Delete flow: confirm dialog with attached-appts count visible; cancel preserves master; confirm deletes

### `tests/phase-18-0-appointment-form-rooms.test.jsx`

- RTL: AppointmentFormModal renders dropdown sourced from listExamRooms (mocked)
- "— ไม่ระบุห้อง —" default option present
- Selecting a room writes both `roomId` + `roomName` snapshot to submit payload
- Edit mode with stale roomId (room deleted) shows "(ห้องที่ลบแล้ว: name)" hint + lets user re-pick
- No `FALLBACK_ROOMS` reference in source (regression guard)

### `tests/phase-18-0-appointment-tab-columns.test.jsx`

- Pure unit: `effectiveRoomId(appt, Set)` → 5 cases (valid, blank, missing, stale, cross-branch)
- Column derivation: orderedColumnRooms sort by sortOrder then name
- Virtual ไม่ระบุห้อง column appears iff at least one orphan appt
- Branch switch changes column list

### Updated tests

- `tests/branch-collection-coverage.test.js` BC1.1 — add `be_exam_rooms: { scope: 'branch' }`
- `tests/phase11-master-data-scaffold.test.jsx` M2 — bump master section count if asserted
- `tests/backend-nav-config.test.js` I4 — same

## Permission key

NEW `exam_room_management` (per Q5 brainstorm — separate from `branch_management` for finer ACL).

- Added to `ALL_PERMISSION_KEYS` in `src/lib/permissionGroupValidation.js` under section "ตั้งค่า / ข้อมูลพื้นฐาน"
- Gates: ExamRoomFormModal save (create + update) + ExamRoomsTab delete button
- ExamRoomsTab read = `isClinicStaff()` (any logged-in staff can VIEW the list)
- Admin claim bypasses (existing pattern)

## Branch-Scope contract

`be_exam_rooms` is BRANCH-SCOPED. Per Rule L:

- BS-1: UI consumers must import via `scopedDataLayer.js` (not raw `backendClient.js`). ExamRoomsTab + AppointmentFormModal + AppointmentTab follow this.
- BS-4: Listener `listenToExamRoomsByBranch` wired via `useBranchAwareListener` in AppointmentTab + ExamRoomsTab.
- BS-5: Classified in `branch-collection-coverage.test.js` COLLECTION_MATRIX as `branch`-scoped.
- BS-8: `saveExamRoom` writer stamps branchId via `_resolveBranchIdForWrite`.
- BS-9: ExamRoomsTab includes `selectedBranchId` in `useCallback`/`useEffect` deps.

## Deploy boundary

Source-only deploy + firestore.rules new match block → Probe-Deploy-Probe Rule B (5 endpoints).

- No data mutation in deploy itself
- Migration script run separately by user (`node scripts/phase-18-0-seed-exam-rooms.mjs --dry-run` first → review counts → `--apply` on confirmation)
- Phase 18.0 commit lands in V15 #19 OR V15 #20 (after the pending V15 #19 leak-fix deploy completes)

## File footprint estimate

- 4 NEW source files (~700 LOC)
- 8 MOD source files (~180 LOC delta — adds DepositPanel)
- 1 NEW migration script (~250 LOC)
- 5 NEW test files + 3 EXT (~850 LOC)
- 1 firestore.rules block

## Risks + mitigations

- **Risk**: existing AdminDashboard.jsx (`pc_*` ProClinic legacy) uses `roomId` as a numeric string from ProClinic — collision with our new `EXR-...` strings. Mitigation: scope is explicit per Out-of-Scope — only `be_appointments` writers/readers change. `pc_appointments` writers are not touched.
- **Risk**: `cloneOrchestrator.js:198` writes `roomName: appt.room || ''` from clone — does NOT write `roomId`. Mitigation: clone path is dev-only (Rule H-bis); `roomId: ''` blank is a valid value (runtime fallback routes to ไม่ระบุห้อง). Document in commit message.
- **Risk**: DepositPanel.jsx writes appointment data with `roomName: apptRoomName` (line 321) without `roomId`. Mitigation: included in MOD list above — DepositPanel deposit→appointment form gets the same listExamRooms-driven dropdown + writes both `roomId` + `roomName` on save.
- **Risk**: AppointmentTab existing UNASSIGNED_ROOM constant ('ไม่ระบุห้อง') is a STRING used as key. Mitigation: introduce `UNASSIGNED_ROOM_ID = '__UNASSIGNED__'` (sentinel) for ID-keyed grouping; UI label remains 'ไม่ระบุห้อง'.

## Open follow-ups (non-blocking)

- ExamRoomsTab inline cross-branch import button (Phase 17.1 pattern) — optional v2; copies rooms from another branch as starting templates.
- Schedule-entry roomId field (Q3 was deferred) — if user changes mind later, schema additive (add `roomId?` to `be_staff_schedules`); audit BS-8 will catch unstamped writers.
- Frontend AdminDashboard `pc_*` schedule-grid alignment — separate scope; would need its own brainstorming round if user wants the patient-form schedule grid to also use be_exam_rooms data.
