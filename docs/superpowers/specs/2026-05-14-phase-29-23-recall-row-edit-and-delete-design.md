# Phase 29.23 — Recall Row Edit Button + Clickable Customer + Cases-Admin Delete

> **Status**: Approved (2026-05-14)
> **Author**: Claude Code (autonomous)
> **Approver**: user (via brainstorming HARD-GATE — Q1=New RecallEditModal, Q2=date+reason only)
> **Phase**: 29.23 (continuation of Phase 29.22 — recall cases universal collection)
> **Parent specs**: `2026-05-14-recall-system-design.md` · `2026-05-14-phase-29-22-recall-cases-collection-design.md`

---

## 1. Origin

User report (verbatim, 2026-05-14):
> 1. เพิ่มปุ่มแก้ไข recall ด้วยตอนนี้มีแต่ปุ่มลบ ทุกที่ทั้ง BE, FE
> 2. ทำให้ชื่อลูกค้าใน list recall ทุกที่สามารถกดเข้าไปแล้วเด้ง new tab หน้าข้อมูลลูกค้าได้ เหมือนกับนัดหมาย
> 3. tab ย่อย จัดการเคส Recall นอกจากแก้ไขและซ่อน ให้เพิ่มปุ่ม ลบ เข้าไปด้วย

3 UX additions on existing Phase 29.22 surface. No new collections, no rules change, no migration.

---

## 2. Scope

| Feature | Lines of change est. | New components / lib |
|---|---|---|
| F1 — ✏️ Edit Recall button + RecallEditModal | ~280 LOC | NEW `RecallEditModal.jsx` |
| F2 — Clickable customer-name `<a target="_blank">` | ~20 LOC | None — pattern mirror |
| F3 — 🗑️ Delete case button in RecallCasesAdminPanel | ~50 LOC | NEW `deleteRecallCase` lib fn |

**Total**: 1 new component + 1 new lib function + 7 modified files.

---

## 3. Locked decisions (from brainstorming Q1-Q2)

| # | Question | Locked answer |
|---|---|---|
| Q1 | Edit modal approach? | New RecallEditModal component (~150 LOC). RecallCreateModal stays at 522 LOC unchanged. Lightweight single-recall edit. |
| Q2 | Editable fields scope? | `recallDate` + `reason` only. Customer + source = forensic trail, immutable post-create. Outcome → outcome modal. Status → auto-managed. |

Implicit decisions (locked in design review):
- Customer-name pattern = bare `<a target="_blank">` (NOT `openCustomerInNewTab` helper) — `<a>` enables Ctrl+Click + middle-click + browser-native context menu.
- Delete case = hard-delete, no audit doc (consistent with `setRecallCaseHidden`; recalls store `reason` as snapshot string, no FK cascade).
- Edit button shown always (even on done/closed status — admin fixes typos).
- All 3 surfaces wired identically (RecallRow is shared atom).

---

## 4. Architecture

### 4.1 RecallEditModal

NEW file `src/components/backend/recall/RecallEditModal.jsx` (~150 LOC).

**Props**:
```ts
{
  recall: object;                      // existing recall doc (required)
  recallCases?: Array<{                // typeahead source (universal cache)
    caseId: string;
    caseName: string;
    defaultDays: number;
  }>;
  onClose: () => void;
  onSaved?: (id: string) => void;
}
```

**Layout**:
```
┌─────────────────────────────────────────────┐
│ ✏️ แก้ไข Recall                         [X] │
├─────────────────────────────────────────────┤
│ ┌─ Customer (read-only) ─────────────────┐ │
│ │ 👤 [name]      [L] LC-26000006  HN 8001 │ │
│ │ 📞 0812345678                            │ │
│ │ จากการรักษา 12/05/2569 · Botox 100u     │ │
│ └─────────────────────────────────────────┘ │
│                                              │
│ วันที่ Recall *                              │
│ [DateField]                                  │
│                                              │
│ เหตุผล / เคส Recall *                       │
│ [RecallCaseSelectField — typeahead]         │
│                                              │
│ ⚠ Validation banner (if any)                │
│                                              │
├─────────────────────────────────────────────┤
│              [ยกเลิก]        [บันทึก]      │
└─────────────────────────────────────────────┘
```

**Behavior**:
- Initial state = `{recallDate: recall.recallDate, reason: recall.reason}`
- DateField uses `min={null}` so admin can backdate (e.g. mark earlier date)
- RecallCaseSelectField same as RecallSlotCard — typeahead from `recallCases` prop
- On case-pick: auto-fill `reason` only (NO auto-update of recallDate; admin controls date explicitly per Q2 lock — date only changes from DateField click)
- Save → `updateRecall(id, {recallDate, reason})` → modal closes → parent's listener auto-refreshes the list
- Cancel: ESC + click outside + ยกเลิก button all close
- Validation: both `recallDate` non-empty + `reason` non-empty; otherwise banner shows + save disabled
- Error: save failure → `setError(ex.message)` banner; save button re-enabled

**Anti-flicker**:
- Modal close = optimistic (parent's onSnapshot picks up the change within 1 frame; no manual reload)
- Modal re-uses same React instance if parent's `editingRecall` ref stays same — but normally each open creates fresh instance with new `recall` prop

### 4.2 RecallRow.jsx changes

Two changes:

**(a) Customer-name link** at line 121 — current:
```jsx
<span className="text-[12px] font-bold text-[var(--tx-primary)]">{recall.customerName || '—'}</span>
```

Becomes:
```jsx
{recall.customerId ? (
  <a
    href={`/?backend=1&customer=${encodeURIComponent(String(recall.customerId))}`}
    target="_blank"
    rel="noopener noreferrer"
    onClick={(e) => e.stopPropagation()}
    className="text-[12px] font-bold text-[var(--tx-primary)] hover:underline underline-offset-2 hover:text-sky-300"
    title={`เปิดข้อมูล ${recall.customerName || ''} ในแท็บใหม่`}
    data-testid={`recall-customer-link-${recall.id}`}
  >
    {recall.customerName || '—'}
  </a>
) : (
  <span className="text-[12px] font-bold text-[var(--tx-primary)]" data-testid={`recall-customer-name-plain-${recall.id}`}>
    {recall.customerName || '—'}
  </span>
)}
```

**(b) Edit button** inserted between snooze and delete in action column (around line 217-229):
```jsx
{onEdit && (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); onEdit(recall.id); }}
    data-testid={`recall-edit-${recall.id}`}
    className="w-6 h-6 rounded bg-sky-500/10 border border-sky-500/30 text-sky-600 dark:text-sky-300 hover:bg-sky-500/20 hover:border-sky-500/60 flex items-center justify-center"
    aria-label="แก้ไข Recall"
    title="✏️ แก้ไข Recall"
  >
    <Pencil size={11} />
  </button>
)}
```

Import `Pencil` from `lucide-react`.

Props signature gains `onEdit?: (recallId: string) => void`.

### 4.3 RecallList.jsx changes

Mirror existing `onDelete` pass-through pattern. Add `onEdit` to:
- destructure from props
- pass to `<RecallRow onEdit={onEdit} ... />`
- update JSDoc props list

### 4.4 Three surface wirings (RecallTab + RecallFrontendView + CDV)

Each surface adds `editingRecall` state + `RecallEditModal` render:

```jsx
const [editingRecall, setEditingRecall] = useState(null);

// in props:
<RecallList
  recalls={recalls}
  todayISO={todayISO}
  onRowClick={handleRowClick}
  onRecordOutcome={handleRecordOutcome}
  onLineSend={handleLineSend}
  onSnooze={handleSnooze}
  onDelete={handleDelete}
  onEdit={(recallId) => setEditingRecall(recalls.find(r => r.id === recallId))}  // NEW
  onPairClick={handlePairClick}
/>

// at bottom render:
{editingRecall && (
  <RecallEditModal
    recall={editingRecall}
    recallCases={recallCases}
    onClose={() => setEditingRecall(null)}
    onSaved={() => setEditingRecall(null)}
  />
)}
```

CDV's RecallCard already manages local state for outcome/snooze/etc modals — same pattern.

### 4.5 deleteRecallCase lib + RecallCasesAdminPanel

NEW function in `src/lib/backendClient.js`:

```js
/**
 * Phase 29.23 (2026-05-14) — hard delete a be_recall_cases doc.
 * Safe because recalls store reason as STRING SNAPSHOT (no FK to caseId);
 * existing recalls are unaffected by deleting the master case.
 *
 * @param {string} id be_recall_cases doc id
 * @param {object} [ctx] reserved for future audit (unused now)
 */
export async function deleteRecallCase(id, ctx = {}) {
  if (!id) return;
  await deleteDoc(recallCaseDoc(id));
}
```

Pure delete. No audit doc (consistent with `setRecallCaseHidden` which only updates `isHidden`). No cascade — `reason` is a string snapshot on recall docs, not a foreign key.

Universal pass-through in `scopedDataLayer.js`:
```js
export const deleteRecallCase = (...args) => raw.deleteRecallCase(...args);
```

**RecallCasesAdminPanel.jsx** changes:

Import:
```js
import { listRecallCases, saveRecallCase, setRecallCaseHidden, deleteRecallCase } from '../../../lib/scopedDataLayer.js';
```

Handler:
```js
async function handleDelete(c) {
  const msg = `ลบเคส "${c.caseName}" ถาวร?\n(Recall ที่ใช้ค่าเดิมไม่ได้รับผลกระทบ; เก็บ snapshot ของชื่อไว้แล้ว)`;
  if (!window.confirm(msg)) return;
  try {
    await deleteRecallCase(c.id, { uid: getUid() });
    await reload();
    onCasesChanged?.();
  } catch (e) {
    setError(e?.message || 'ลบไม่สำเร็จ');
  }
}
```

Button (3rd in action cell, after แก้ + ซ่อน/คืน):
```jsx
<button
  type="button"
  onClick={() => handleDelete(c)}
  className="text-[11px] font-medium text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 hover:underline"
  data-testid={`recall-case-delete-${c.id}`}
>
  ลบ
</button>
```

---

## 5. Data flow

### 5.1 Edit recall flow

```
admin clicks ✏️ on row r
    ↓
RecallRow onClick(e) → e.stopPropagation() + onEdit(r.id)
    ↓
parent (RecallTab/FrontendView/CDV) → setEditingRecall(r)
    ↓
RecallEditModal renders with recall=r
    ↓
admin edits date/reason → handleSave
    ↓
await updateRecall(r.id, {recallDate, reason})
    → backendClient.js:11230 → updateDoc(recallDoc(r.id), {...patch, updatedAt, updatedBy})
    ↓
modal closes → setEditingRecall(null)
    ↓
Firestore onSnapshot fires → parent's recalls state updates
    ↓
RecallList re-renders with stable keys; only edited row's DOM changes
```

**Anti-flicker guarantee**: stable `key={r.id}` on RecallRow (spec §5.6) means React reuses the DOM node; only inner text changes. No layout shift.

### 5.2 Click customer-name flow

```
admin Ctrl+Click on customer name in row r
    ↓
<a href="/?backend=1&customer={r.customerId}" target="_blank">
    ↓
browser opens new tab
    ↓
BackendDashboard mount → URL useEffect → setActiveTab('customers') + setViewingCustomer(r.customerId)
    ↓
CDV renders for that customer
```

Plain click (no modifier): browser opens new tab via `target="_blank"` (same end state).
e.stopPropagation prevents the parent row's onClick (which would open detail modal — undesirable when navigating).

### 5.3 Delete case flow

```
admin clicks ลบ on case c
    ↓
window.confirm(msg) → if cancelled, return
    ↓
await deleteRecallCase(c.id) → deleteDoc(recallCaseDoc(c.id))
    ↓
await reload() → listRecallCases({includeHidden:true}) re-fetches → setCases([...without c])
    ↓
onCasesChanged?.() → parent's useRecallCases hook re-fetches → typeahead source updated
```

After this, RecallSlotCard's typeahead in RecallCreateModal will no longer offer this case as a pick option (Rule Q L1 RB5 fix pattern preserved).

---

## 6. Error handling

| Scenario | Behavior |
|---|---|
| Edit save fails (network / rules) | `setError(ex.message)` banner; save button re-enabled |
| Edit with empty reason or empty date | Inline validation banner; save button disabled |
| customerId is null/empty (legacy data) | Render plain `<span>` (no link); preserves text display |
| deleteRecallCase fails | `setError('ลบไม่สำเร็จ')`; admin can retry |
| Concurrent edit (admin A edits while admin B edits same recall) | Firestore last-write-wins; `updatedAt` stamps both. Not a Phase 29.23 concern — Phase 29 baseline assumption |

---

## 7. Anti-flicker discipline (per recall-system spec §5.6)

All 3 surfaces use Firestore `onSnapshot` listeners (already in place from Phase 29 baseline). Mutations fire → listener auto-refreshes → React diff updates only changed rows.

**Stable keys**: `RecallList.jsx:91` uses `key={r.id}` (NEVER index). SG3 source-grep regression already locks this. Phase 29.23 changes don't touch keys.

**Modal close → list re-render**: parent's `setEditingRecall(null)` doesn't force-remount RecallList; list's keys are unchanged so React reuses DOM nodes.

---

## 8. Edge cases

| # | Case | Handling |
|---|---|---|
| 1 | customerId missing on recall | Plain `<span>` fallback in RecallRow |
| 2 | Edit done/closed-no-answer recall | Allowed — admin can fix typos |
| 3 | Delete case while live recalls reference its name | Safe — recalls keep `reason` snapshot string; no DB FK |
| 4 | Empty reason or empty date in edit modal | Validation banner + save disabled |
| 5 | Edit via Ctrl+Click on edit button | Same as click — browser doesn't treat ✏️ button click specially |
| 6 | Customer name click in CDV (already viewing this customer) | New tab opens with same customer page; redundant but not broken |
| 7 | Concurrent typeahead pick + manual reason typing | RecallCaseSelectField onChange + onPick both fire `set({reason})`; last fires wins |
| 8 | Delete case → typeahead immediately stale | `onCasesChanged?.()` triggers parent's useRecallCases hook to re-fetch |

---

## 9. Testing — 5 layers, ~55 net assertions

### Layer 1: helper unit
**`tests/phase-29-23-delete-recall-case-helper.test.js`** (~6 tests):
- Exports check (deleteRecallCase available on backendClient + scopedDataLayer)
- Calls deleteDoc with `recallCaseDoc(id)` path
- Validates id (empty/null → early return, no Firestore call)
- ctx param accepted but ignored (forward compat)

### Layer 2: RTL component
**`tests/phase-29-23-recall-row-edit-button.test.jsx`** (~12 tests):
- Edit button renders when `onEdit` prop provided
- Click → `onEdit(recall.id)` called
- stopPropagation works (parent onClick NOT fired)
- Customer name renders as `<a target="_blank">` when customerId present
- href includes `?backend=1&customer={encoded id}`
- Customer name renders as plain `<span>` when customerId missing
- Hover underline class applied
- data-testid present on `<a>` link
- Edit button not rendered when `onEdit` undefined
- Customer-name click → e.stopPropagation called

**`tests/phase-29-23-recall-edit-modal.test.jsx`** (~10 tests):
- Renders with existing recall (date + reason pre-filled)
- DateField + RecallCaseSelectField both visible
- Save → updateRecall called with patch
- Save success → onClose called
- Cancel button + ESC + click-outside all close
- Validation banner on empty reason
- Validation banner on empty date
- Save button disabled while validation fails
- Save error → setError displayed + save button re-enabled
- Customer header is read-only (no editable inputs)

**`tests/phase-29-23-recall-cases-admin-delete.test.jsx`** (~8 tests):
- Delete button renders in action cell
- Click → confirm dialog shown
- Confirm yes → deleteRecallCase called with c.id
- Confirm cancel → no call
- After delete → reload + onCasesChanged invoked
- Error → setError banner

### Layer 3: source-grep regression
**`tests/phase-29-23-source-grep.test.js`** (~8 tests):
- RecallRow.jsx uses `<a` + `target="_blank"` for customerName (anti-regression)
- RecallRow.jsx has `onEdit` prop in JSDoc + handler
- RecallRow.jsx imports `Pencil` from `lucide-react`
- RecallCasesAdminPanel.jsx imports `deleteRecallCase` from `scopedDataLayer.js`
- RecallEditModal.jsx exists + exports `RecallEditModal` named + default
- deleteRecallCase exported from backendClient.js + scopedDataLayer.js
- 3 wire callers (RecallTab + RecallFrontendView + CustomerDetailView OR RecallCard) pass `onEdit` to RecallList
- Customer-name `<a>` has rel="noopener noreferrer" (security defense-in-depth)

### Layer 4: Rule I flow simulate
**`tests/phase-29-23-flow-simulate.test.js`** (~6 tests):
- F1: edit recall round-trip — render row + onEdit captures id + edit modal opens with prefilled values + save invokes updateRecall
- F2: delete case round-trip — render admin panel + click delete + confirm + deleteRecallCase invoked + reload called + onCasesChanged fired
- F3: customer-name click → assertion that `<a href>` contains backend deep-link URL pattern
- F4: edit on done recall (status='done') — modal opens + save works (admin can edit any status)
- F5: customerId missing → plain span fallback (no <a>)
- F6: onEdit prop wired through RecallList → RecallRow

### Layer 5: Rule Q L1 Playwright real-browser
**`tests/e2e/phase-29-23-recall-edit-real-browser.spec.js`** (~5 tests):

Per Rule Q (V66) — Real-Adversarial Verification:
- PB1: Edit recall in BackendDashboard recall tab — full round-trip with real prod (TEST-RECALL-* fixture). Auth via REST → idToken → localStorage inject. Click edit → change date → save → assert listener updates DOM with new date. Cleanup fixture.
- PB2: Click customer name → assert `page.context().waitForEvent('page')` opens new tab with `?backend=1&customer={id}` URL.
- PB3: Delete case in admin panel — open jัดการเคส tab → click ลบ → confirm → assert deleteRecallCase succeeded (case row disappears from table).
- PB4: Edit on done recall (status='done') — admin should still be able to edit; assert save works.
- PB5: Edit with empty reason → assert validation banner + save button disabled.

Fixtures use `TEST-RECALL-` prefix (V33-class discipline).
Cleanup script removes fixtures + audit doc per Rule M.

---

## 10. Files touched

### NEW (7)
- `src/components/backend/recall/RecallEditModal.jsx` (~150 LOC)
- `tests/phase-29-23-delete-recall-case-helper.test.js`
- `tests/phase-29-23-recall-row-edit-button.test.jsx`
- `tests/phase-29-23-recall-edit-modal.test.jsx`
- `tests/phase-29-23-recall-cases-admin-delete.test.jsx`
- `tests/phase-29-23-source-grep.test.js`
- `tests/phase-29-23-flow-simulate.test.js`
- `tests/e2e/phase-29-23-recall-edit-real-browser.spec.js`

### MODIFIED (8)
- `src/lib/backendClient.js` (+ `deleteRecallCase` function ~10 LOC)
- `src/lib/scopedDataLayer.js` (+ universal export for deleteRecallCase ~3 LOC)
- `src/components/backend/recall/RecallRow.jsx` (+ Pencil import + onEdit prop + edit button + customer `<a>` wrap)
- `src/components/backend/recall/RecallList.jsx` (+ onEdit pass-through ~2 LOC)
- `src/components/backend/recall/RecallTab.jsx` (+ editingRecall state + RecallEditModal render + onEdit wire)
- `src/components/backend/recall/RecallFrontendView.jsx` (+ same pattern)
- `src/components/backend/customer-recall/RecallCard.jsx` (+ same pattern)
- `src/components/backend/recall/RecallCasesAdminPanel.jsx` (+ delete button + handleDelete + deleteRecallCase import)

### Bundle delta target
- BackendDashboard chunk: < +5 KB (RecallEditModal small, no new deps)

---

## 11. Test count delta

- Baseline: 9644 vitest + 12 Playwright e2e (master = `f2103e7`)
- Phase 29.23 target: +50 vitest + 5 Playwright = **9694 vitest + 17 Playwright e2e**

---

## 12. Deploy plan

Per V18 deploy lock (4× violation this session): **NO deploy until user types "deploy" verbatim THIS turn**.

When user authorizes:
- Vercel-only deploy (NO rules / indexes change in Phase 29.23 — pure UI + lib)
- No Firebase rules deploy → no Probe-Deploy-Probe needed
- Standalone `vercel --prod --yes`

If round-3 + Phase 29.23 deployed together: combined commits `1ff2de8` → end-of-29.23 in one Vercel deploy.

---

## 13. Implementation order

Per subagent-driven-development methodology, 9 tasks (per writing-plans skill, populated separately):

1. **Task 1**: Add `deleteRecallCase` lib function (backendClient.js + scopedDataLayer.js) + unit test (Layer 1)
2. **Task 2**: Create RecallEditModal.jsx + Layer 2 RTL tests
3. **Task 3**: RecallRow.jsx — add edit button + customer-name `<a>` wrap + Layer 2 RTL tests
4. **Task 4**: RecallList.jsx — onEdit pass-through
5. **Task 5**: Wire RecallTab.jsx → editingRecall state + RecallEditModal render
6. **Task 6**: Wire RecallFrontendView.jsx → same
7. **Task 7**: Wire CustomerDetailView (RecallCard) → same
8. **Task 8**: RecallCasesAdminPanel.jsx — delete button + handler + Layer 2 RTL tests
9. **Task 9**: Source-grep regression bank (Layer 3) + flow simulate (Layer 4) + Playwright Rule Q L1 (Layer 5)

Final batch: full vitest + Playwright run + build verify per Rule N.

---

## 14. Anti-patterns avoided

| # | Anti-pattern | Mitigation |
|---|---|---|
| 1 | Refactor RecallCreateModal to dual-mode (Q1 alternative B) | Rejected — would balloon to ~700 LOC + complicate save handler |
| 2 | Inline edit in detail modal (Q1 alternative C) | Rejected — semantic confusion (read-only modal vs editable) |
| 3 | Editing customer/source fields (Q2 alternatives B/C) | Rejected — forensic trail must stay immutable |
| 4 | Edit button only on pending status | Rejected — admin must fix typos on done/closed too |
| 5 | Using `openCustomerInNewTab(...)` helper vs bare `<a>` | Bare `<a>` chosen — enables Ctrl+Click / middle-click |
| 6 | Soft-delete or hide for case delete | Hard-delete chosen — case is reference data, recalls keep snapshot |
| 7 | Audit doc for every case delete | None — consistent with setRecallCaseHidden (no audit either) |
| 8 | Edit button shown only on hover | Always-shown — round-3 lesson (hover-only fails discoverability) |

---

## 15. Rule Q (V66) compliance

Per `.claude/rules/01-iron-clad.md` Rule Q: every "verified" claim for user-visible code MUST pass L1 (Playwright real-browser) or L2 (real client SDK).

**L1 plan**:
- `tests/e2e/phase-29-23-recall-edit-real-browser.spec.js` PB1-PB5 driving real browser against real prod Firestore
- Auth via REST `signInWithPassword` → idToken → `firebase:authUser:*` localStorage inject
- TEST-RECALL-* fixtures (V33-class prefix discipline)
- Cleanup script post-suite

**L2 supplement**: source-grep + flow-simulate cover regression but L1 is the primary verification per Rule Q.

Claim of "Phase 29.23 verified" requires:
- All vitest GREEN
- Build clean
- Playwright PB1-PB5 PASS via `npx playwright test tests/e2e/phase-29-23-*.spec.js` against deployed URL (preview OR prod-after-deploy)
- Screenshot of edit flow + new-tab customer page

Without all 4 → DO NOT CLAIM. Re-verify per Rule Q.

---

## 16. Rollback plan

If Phase 29.23 deploy breaks production:
1. `git revert <Phase 29.23 commits>` (clean — no rules/indexes change, no migration)
2. `vercel --prod --yes` → prod reverts to `f2103e7` (round-3 polish — current baseline)
3. No data cleanup needed (no schema change, no documents written by Phase 29.23 itself)

Low-risk deploy: pure UI + 1 lib function. Rollback is a single git revert + redeploy.

---

## End of spec
