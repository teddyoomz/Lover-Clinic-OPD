# Phase 26.2 — TFP Split-Screen History Comparison + Customer Note Display

**Date**: 2026-05-13
**Status**: DESIGN (brainstorming approved 2026-05-13)
**Phase**: Same-day follow-up to Phase 26.0 + 26.1
**Rule J HARD-GATE**: brainstorming completed; 4 Qs + Item E addition locked

---

## 1. User intent (verbatim)

> "บริเวณด้านบนที่เป็น Header fix อยู่แบบในรูป อยากให้เป็น Tap ดูการรักษาครั้งล่าสุดได้สัก 4-5 ครั้งล่าสุด โดยเมื่อกดแต่ละ tap ที่เป็นการรักษาเก่า หน้าจอก็จะทำการแบ่งครึ่งจอ ให้หน้าการรักษาใหม่อยู่ทางซ้าย และการรักษาเก่าอยู่ทางขวา ... ส่วนด้านขวาที่เป็นประวัติการรักษาเก่านั้น ก็ข่องให้อ่าน เปิดดูไฟล์ และก๊อปข้อมูลได้อย่างเดียว ไม่อนุญาตให้ edit อะไรใดๆได้"

> "ให้แสดงหมายเหตุทั่วไป ของลูกค้าคนนั้นๆ ที่แสดงในหน้าข้อมูลลูกค้า มาแสดงในหน้า TFP ด้วย เอาไว้เหนือปุ่มบันทึกสำหรับแพทย์ มันมีช่องว่างสวยๆพอดี"

Two related additions to TFP this turn:

1. **Header tabs for 4-5 most recent treatments** → click → split 50/50: new (LEFT, editable) vs old (RIGHT, read-only). Doctor reads history while writing new treatment.
2. **Display `customer.note` on TFP** above the Phase 26.0d doctor-save button — mirrors the CDV Phase 24.0-decies amber box.

---

## 2. Locked decisions (4 brainstorming Qs + scope addition)

| # | Question | Decision |
|---|---|---|
| Q1 | Mobile/tablet behavior? | **Desktop-only** — split-screen fires ≥ lg breakpoint (1024px). Mobile + tablet portrait: tab strip still renders, but tab-click opens existing `TreatmentTimelineModal` popup as a fallback (single-treatment view). |
| Q2 | Tab scope filter? | **All branches latest** — top-5 by `treatmentDate desc`, no branch/status filter. Doctor wants full chronological picture. |
| Q3 | Right panel content depth? | **Full timeline row** — reuse `TreatmentTimelineModal` row JSX (date + chips + meta + CC/DX/Note + treatmentItems card + medications/consumables accordions + 3-image grid + lightbox). Strip edit button; preserve read + file open + lightbox + copy-via-browser. |
| Q4 | Mode + default state? | **Both create + edit modes** + **no auto-select** — TFP opens without any tab selected (split off; current full-width form behavior). User clicks tab → split. Re-click same tab → toggle dismiss. |
| Item E | NEW addition (this turn) | Display `customer.note` (canonical) OR `customer.patientData.note` (legacy fallback) above the doctor-save button — mirrors CDV Phase 24.0-decies amber box. Read-only (edit happens in CDV). Hidden when empty. |

---

## 3. Architecture

```
TFP container (fixed inset-0 z-[80] overflow-y-auto)
├── Sticky header (line ~2939) — back arrow + title + patient name
│
├── NEW Header tab strip (V26.2) — sticky below main header
│   [📅 13/05/2569 · CC: ฟหก · ล่าสุด] [📅 12/05 · ...] [📅 11/05 · ...] [📅 ...] [📅 ...]
│   ↓ click handler: setSelectedHistoryTreatmentId(t.id) (toggle)
│
└── Main content (max-w-6xl mx-auto)
    │
    ├── If `selectedHistoryTreatmentId` truthy AND viewport ≥ lg:
    │   └── Split-screen layout:
    │       ┌─────────────────────┬─────────────────────┐
    │       │ LEFT (50%):         │ RIGHT (50%):        │
    │       │ <TFPFormBody>       │ <TreatmentReadOnly  │
    │       │   (existing form)   │   Panel              │
    │       │   • All sections    │   treatment={fullDoc}│
    │       │   • Doctor-save btn │   isDark={isDark}    │
    │       │   • NEW note display│   onClose={...}      │
    │       │     (Item E)        │ />                   │
    │       │                     │ • Date + chips       │
    │       │                     │ • Meta               │
    │       │                     │ • CC/DX/Note         │
    │       │                     │ • Items + Meds       │
    │       │                     │ • Consumables        │
    │       │                     │ • 3-image grid       │
    │       │                     │ • Lightbox           │
    │       └─────────────────────┴─────────────────────┘
    │
    ├── Else if `selectedHistoryTreatmentId` truthy AND viewport < lg:
    │   └── TreatmentTimelineModal popup (single-treatment view as modal)
    │
    └── Else (no tab selected):
        └── Full-width form (current behavior unchanged)
```

### State + flow

```js
// NEW state in TFP (near other modal states ~line 489-507):
const [selectedHistoryTreatmentId, setSelectedHistoryTreatmentId] = useState(null);
const [historyTreatments, setHistoryTreatments] = useState([]);       // top-5 summary list
const [historyFullDoc, setHistoryFullDoc] = useState(null);           // lazy-loaded full doc
const [customerNote, setCustomerNote] = useState('');                  // Item E

// In existing load useEffect (~line 737+), after custData = await getBackendCustomer(...):
// Item E
setCustomerNote(
  custData?.note ||
  custData?.patientData?.note ||
  patientData?.note ||
  ''
);

// NEW useEffect for top-5 history fetch (mount-time, customerId-keyed):
useEffect(() => {
  if (!customerId) return;
  let cancelled = false;
  import('../lib/scopedDataLayer.js')
    .then(({ getCustomerTreatments }) => getCustomerTreatments(customerId))
    .then(list => {
      if (cancelled) return;
      const sorted = (list || []).sort((a, b) => {
        const dA = a.detail?.treatmentDate || '';
        const dB = b.detail?.treatmentDate || '';
        return dB.localeCompare(dA);
      });
      // Top-5; exclude current treatment in edit mode (don't show self)
      const filtered = isEdit && treatmentId
        ? sorted.filter(t => (t.treatmentId || t.id) !== treatmentId)
        : sorted;
      setHistoryTreatments(filtered.slice(0, 5));
    })
    .catch(() => {
      if (!cancelled) setHistoryTreatments([]);
    });
  return () => { cancelled = true; };
}, [customerId, treatmentId, isEdit]);

// Tab click handler — toggle off if same tab + lazy load full doc otherwise
const handleHistoryTabClick = (tid) => {
  if (selectedHistoryTreatmentId === tid) {
    // Toggle off
    setSelectedHistoryTreatmentId(null);
    setHistoryFullDoc(null);
    return;
  }
  setSelectedHistoryTreatmentId(tid);
  setHistoryFullDoc(null);  // show loading state until fetch resolves
  import('../lib/scopedDataLayer.js')
    .then(({ getTreatment: getBackendTreatment }) => getBackendTreatment(tid))
    .then(setHistoryFullDoc)
    .catch(() => setHistoryFullDoc(null));
};
```

### Layout impact on existing TFP `lg:grid-cols-2`

Current TFP form has its own `grid grid-cols-1 lg:grid-cols-2` at line ~3003 (form-left + OPD-card-right). Phase 26.2 split adds an OUTER split.

Strategy: when split active, downgrade the INNER form grid from `lg:grid-cols-2` → `xl:grid-cols-2` so the form is 1col at lg (1024-1279px) when the right history panel is consuming 50%. At xl (≥1280px) the form regains 2col.

Concretely:
- Outer wrapper: when split active = `<div className="lg:grid lg:grid-cols-2 lg:gap-4">` (when inactive = no wrapper / full-width)
- Inner form `<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">` becomes `<div className={\`grid grid-cols-1 ${splitActive ? 'xl:grid-cols-2' : 'lg:grid-cols-2'} gap-4\`}>` so form columns adapt to outer-split state.

---

## 4. Components

### 4.1 NEW `src/components/backend/TreatmentReadOnlyPanel.jsx` (~150 LOC)

Extract the per-treatment row from `TreatmentTimelineModal.jsx` lines 276-404 into a reusable component:

```jsx
export default function TreatmentReadOnlyPanel({
  treatment,        // summary entry: { id, date, doctor, branch, cc, dx, status, ... }
  fullDoc,          // full Firestore doc (detail nested); null while loading
  isDark,
  ac,
  acRgb,
  isLatest = false,
  onClose,          // V26.2 split-screen: close button calls this
  showCloseButton = false,  // true only in split-screen mode
}) {
  const detail = fullDoc?.detail || null;
  const beforeImages = detail?.beforeImages || [];
  const afterImages = detail?.afterImages || [];
  const otherImages = detail?.otherImages || [];
  const courseItems = detail?.treatmentItems || [];
  const medications = detail?.medications || detail?.takeHomeMeds || [];
  const consumables = detail?.consumables || [];
  const [lightbox, setLightbox] = useState(null);
  const isLoading = !fullDoc;

  return (
    <div data-testid="treatment-read-only-panel">
      {/* Header: Date + ล่าสุด + status chip + Close button (V26.2) */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <Calendar size={14} style={{ color: '#2EC4B6' }} />
        <span className="text-sm font-bold text-[var(--tx-heading)]">
          {formatThaiDateFull(treatment.date) || '-'}
        </span>
        {isLatest && (
          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ backgroundColor: `rgba(${acRgb},0.15)`, color: ac }}>ล่าสุด</span>
        )}
        {treatment.status === 'doctor-recorded' && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1 border
              bg-amber-100 dark:bg-amber-950 border-amber-200 dark:border-amber-800
              text-amber-900 dark:text-amber-100">
            <Stethoscope size={10} />
            แพทย์ลงบันทึก
          </span>
        )}
        {showCloseButton && (
          <button
            onClick={onClose}
            data-testid="treatment-read-only-panel-close"
            className="ml-auto p-1 rounded hover:bg-[var(--bg-hover)]"
            aria-label="ปิดประวัติการรักษา"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Meta / CC / DX / Dr.Note / treatmentItems / medications / consumables / 3-image grid */}
      {/* ... (full content extracted from TimelineModal.jsx lines 281-404) ... */}

      {/* Lightbox (existing pattern from TimelineModal) */}
      {lightbox && (
        <Lightbox src={lightbox.src} label={lightbox.label} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
```

**Read-only contract** (AV38 invariant):
- ❌ NO `onEditTreatment` prop
- ❌ NO `onDeleteTreatment` prop
- ❌ NO save buttons / form inputs anywhere in the panel
- ✅ Lightbox preserved (image zoom)
- ✅ Standard browser select + copy works (no special copy buttons needed)
- ✅ File-open: existing image rendering OR file-download links from `detail.treatmentFiles`

### 4.2 `TreatmentTimelineModal.jsx` — refactor to use NEW panel (DRY)

Replace the inline row JSX with `<TreatmentReadOnlyPanel>` consumption:

```jsx
{paginated.map((t, pageIndex) => {
  const globalIndex = (page - 1) * pageSize + pageIndex;
  const fullDoc = treatmentsById[t.id] || null;
  const isLatest = globalIndex === 0;
  return (
    <TreatmentReadOnlyPanel
      key={t.id || globalIndex}
      treatment={t}
      fullDoc={fullDoc}
      isDark={isDark}
      ac={ac}
      acRgb={acRgb}
      isLatest={isLatest}
      showCloseButton={false}  // modal has its own close button at top
    />
  );
})}
```

Edit button at line ~367-368 — re-add at modal level (not in panel) since panel is read-only.

**Net effect on TimelineModal**: removed ~120 LOC of row JSX, replaced with ~10 LOC panel consumption + 5 LOC edit-button wrapper. Rule of 3 status: 2nd consumer of `TreatmentReadOnlyPanel` (1st = split-screen, 2nd = modal); future 3rd usage triggers formalization.

### 4.3 `TreatmentFormPage.jsx` — header tab strip + state + layout

**Header tab strip** (new JSX block immediately after the sticky header at line ~2955):

```jsx
{/* Phase 26.2 (V26.2, 2026-05-13) — History tab strip below main header.
    Shows top-5 recent treatments (cross-branch). Click → split-screen
    (lg+) or modal popup (<lg). Re-click same tab → dismiss. */}
{historyTreatments.length > 0 && (
  <div className={`sticky top-[52px] z-[9] border-b backdrop-blur-sm ${isDark ? 'bg-[#0a0a0a]/95 border-[#222]' : 'bg-white/95 border-gray-200'}`}>
    <div className="max-w-6xl mx-auto px-4 py-2">
      <div className="flex items-center gap-2 overflow-x-auto">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--tx-muted)] whitespace-nowrap">
          ประวัติ:
        </span>
        {historyTreatments.map((t, i) => {
          const active = selectedHistoryTreatmentId === (t.treatmentId || t.id);
          return (
            <button
              key={t.treatmentId || t.id}
              onClick={() => handleHistoryTabClick(t.treatmentId || t.id)}
              data-testid={`tfp-history-tab-${t.treatmentId || t.id}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                active
                  ? 'bg-purple-700 text-white shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                  : 'text-[var(--tx-muted)] hover:text-purple-400 hover:bg-[var(--bg-hover)] border border-[var(--bd)]'
              }`}
            >
              <Calendar size={11} />
              <span>{formatThaiDateShort(t.detail?.treatmentDate || t.date || '')}</span>
              {i === 0 && <span className="text-[9px] opacity-70">· ล่าสุด</span>}
              {t.detail?.symptoms && (
                <span className="text-[10px] opacity-60 max-w-[100px] truncate">
                  · {t.detail.symptoms}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  </div>
)}
```

**Conditional split-screen wrapper** (replace existing `<div className="max-w-6xl mx-auto px-4 py-4">` at line ~3000):

```jsx
{/* Phase 26.2 split-screen wrapper. When `selectedHistoryTreatmentId` set
    AND lg+ viewport: 2-column outer (form 50% / history 50%).
    When no selection OR <lg: full-width form (existing behavior). */}
<div className={`mx-auto px-4 py-4 ${selectedHistoryTreatmentId ? 'max-w-[2000px] lg:flex lg:gap-4' : 'max-w-6xl'}`}>
  {/* LEFT — TFP form (existing content unchanged structurally, but inner grid breakpoint adjusted) */}
  <div className={selectedHistoryTreatmentId ? 'lg:w-1/2 lg:min-w-0' : ''}>
    {/* existing left-panel content + OPD card content */}
    {/* inner grid: `grid grid-cols-1 ${selectedHistoryTreatmentId ? 'xl:grid-cols-2' : 'lg:grid-cols-2'} gap-4` */}
  </div>

  {/* RIGHT — read-only history panel (lg+ only; mobile uses modal fallback) */}
  {selectedHistoryTreatmentId && (
    <aside className="hidden lg:block lg:w-1/2 lg:min-w-0 lg:sticky lg:top-[100px] lg:self-start lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto">
      <div className={`rounded-xl p-4 ${isDark ? 'bg-[var(--bg-card)]' : 'bg-white shadow-sm'} border border-[var(--bd)]`}>
        <TreatmentReadOnlyPanel
          treatment={historyTreatments.find(t => (t.treatmentId || t.id) === selectedHistoryTreatmentId)}
          fullDoc={historyFullDoc}
          isDark={isDark}
          ac={accent}
          acRgb={accentRgb}
          isLatest={historyTreatments.indexOf(historyTreatments.find(t => (t.treatmentId || t.id) === selectedHistoryTreatmentId)) === 0}
          showCloseButton={true}
          onClose={() => {
            setSelectedHistoryTreatmentId(null);
            setHistoryFullDoc(null);
          }}
        />
      </div>
    </aside>
  )}
</div>
```

**Mobile fallback** (popup): when `selectedHistoryTreatmentId` set AND viewport `< lg`, render the existing `<TreatmentTimelineModal>` mounted with a single-treatment filter. Implementation:

```jsx
{/* V26.2 mobile fallback: when tab clicked on <lg viewport, render
    TimelineModal as popup. Tailwind `lg:hidden` ensures it's only rendered
    below 1024px (matching the aside's `hidden lg:block` gate). */}
{selectedHistoryTreatmentId && (
  <div className="lg:hidden">
    <TreatmentTimelineModal
      isOpen={true}
      customerId={customerId}
      treatmentsFilter={(t) => (t.treatmentId || t.id) === selectedHistoryTreatmentId}
      onClose={() => {
        setSelectedHistoryTreatmentId(null);
        setHistoryFullDoc(null);
      }}
    />
  </div>
)}
```

NOTE: `treatmentsFilter` prop may not exist on TimelineModal yet — pass `singleTreatmentId={selectedHistoryTreatmentId}` instead OR a `customStartTreatments={[selected]}` array prop. Implementation pick at execution time.

**Item E — customer.note display** above doctor-save button (existing Phase 26.0d block at TFP ~line 3092-3120):

```jsx
{/* V26.2 Phase 26.2-E (2026-05-13) — customer.note read-only mirror.
    Mirrors CustomerDetailView Phase 24.0-decies amber box so doctors see
    general patient notes without leaving TFP. Edit happens in CDV; this
    is display-only. Hidden when both customer.note + patientData.note empty. */}
{customerNote && (
  <div
    data-testid="tfp-customer-note"
    className="bg-amber-950/10 border border-amber-900/40 rounded-xl overflow-hidden mb-3"
  >
    <div className="px-4 py-3 border-b border-amber-900/40 flex items-center gap-2">
      <ClipboardCheck size={14} className="text-amber-400" />
      <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">
        หมายเหตุทั่วไป
      </h3>
    </div>
    <div className="p-3">
      <pre className="text-xs text-[var(--tx-secondary)] whitespace-pre-wrap font-sans leading-relaxed">
        {customerNote.trim()}
      </pre>
    </div>
  </div>
)}

{/* Existing Phase 26.0d doctor-save button block (untouched) */}
{!isEdit && (
  <div className="mt-3 flex flex-col sm:flex-row ...">
    ...
  </div>
)}
```

Import additions:
- `ClipboardCheck` from `lucide-react` (verify if already imported)

---

## 5. Files touched (estimate)

| File | Change | LOC |
|---|---|---|
| `src/components/TreatmentFormPage.jsx` | header tab strip + state (4 new) + lazy fetch + customerNote state + customerNote display + conditional split wrapper + inner grid breakpoint adjust + mobile fallback wiring | ~125 |
| `src/components/backend/TreatmentReadOnlyPanel.jsx` (NEW) | Extracted from TimelineModal row (full content + read-only contract + showCloseButton prop) | ~180 |
| `src/components/backend/TreatmentTimelineModal.jsx` | Refactor: replace inline row JSX with TreatmentReadOnlyPanel consumption + retain modal edit-button wrapper | ~−100/+30 net |
| `tests/phase-26-2-split-screen-source-grep.test.js` (NEW) | G4 source-grep regression (header tab strip + state + layout + customerNote) | ~80 |
| `tests/phase-26-2-split-screen-rtl.test.jsx` (NEW) | D6 + D7 RTL (tab render + click toggle + customerNote display + read-only-panel render) | ~150 |
| `tests/phase-26-2-split-screen-flow-simulate.test.js` (NEW) | F10 full-flow simulate (mount → fetch → tab click → lazy load → split render → toggle off) | ~110 |
| `tests/audit-branch-scope.test.js` | NEW AV38 sub-tests (TreatmentReadOnlyPanel read-only contract source-grep) | ~30 |
| `.agents/skills/audit-anti-vibe-code/SKILL.md` | NEW AV38 entry (read-only panel contract) | ~25 |
| `tests/treatment-timeline-modal-rtl.test.jsx` (if exists) | Update for refactor (use TreatmentReadOnlyPanel mount) | ~−20/+10 |

**Total**: ~660 LOC delta.

---

## 6. Data schema impact

**NO schema changes.** Phase 26.2 is a read-only feature:
- `getCustomerTreatments` — existing helper, no signature change
- `getBackendTreatment` — existing helper, no signature change
- `customer.note` — existing field (Phase 24.0-decies)
- `be_treatments` — no new fields

No firestore.rules change. No Rule B Probe-Deploy-Probe trigger. No Rule M data ops.

---

## 7. Tests

### G4 — source-grep regression (TFP + ReadOnlyPanel)

- G4.1 — `historyTreatments` state declared with useState([])
- G4.2 — `selectedHistoryTreatmentId` state declared with useState(null)
- G4.3 — `customerNote` state declared with useState('')
- G4.4 — Tab strip JSX has `data-testid="tfp-history-tab-${id}"` pattern
- G4.5 — Split wrapper: `selectedHistoryTreatmentId ? 'max-w-[2000px] lg:flex` pattern
- G4.6 — Right panel `<aside className="hidden lg:block` (mobile gate)
- G4.7 — Mobile fallback: `<div className="lg:hidden">` containing TreatmentTimelineModal
- G4.8 — `<TreatmentReadOnlyPanel` referenced in TFP + TimelineModal (Rule of 3 prep, 2 consumers)
- G4.9 — customerNote display has `data-testid="tfp-customer-note"` + ClipboardCheck import

### D6 — TFP tab strip + split-screen RTL

- D6.1 — Tab strip renders 0 tabs when historyTreatments empty (mount: no fetch resolved)
- D6.2 — Tab strip renders 5 tabs after fetch (mock 8 treatments → top-5 shown)
- D6.3 — First tab has "· ล่าสุด" inline label
- D6.4 — Click tab → `selectedHistoryTreatmentId` updates + right panel renders
- D6.5 — Re-click same tab → toggle dismiss (state null, panel unmounts)
- D6.6 — Edit mode: TFP's own treatmentId filtered from tab list (don't show self)

### D7 — customerNote display

- D7.1 — Hidden when customer.note + patientData.note both empty
- D7.2 — Renders with amber styling when customer.note present
- D7.3 — Renders ClipboardCheck icon + "หมายเหตุทั่วไป" title
- D7.4 — Renders multi-line note via `whitespace-pre-wrap`
- D7.5 — Positioned above doctor-save button block (source-grep order check)
- D7.6 — Read-only (no input, no edit button, no save action) — Item E contract

### F10 — full-flow simulate

- F10.1 — TFP mount → useEffect fires → getCustomerTreatments called with customerId
- F10.2 — list sorted desc by treatmentDate; sliced to 5
- F10.3 — Tab click → setSelectedHistoryTreatmentId + lazy getBackendTreatment fires
- F10.4 — Right panel renders only when historyFullDoc resolved (loading state while pending)
- F10.5 — Toggle off: state cleared, historyFullDoc reset to null
- F10.6 — Layout: split wrapper applied only when selectedHistoryTreatmentId truthy
- F10.7 — Mobile gate (<lg): aside hidden, modal renders instead

### AV38 — read-only panel contract (NEW audit invariant)

- AV38.1 — `TreatmentReadOnlyPanel.jsx` exists at canonical path
- AV38.2 — Source does NOT contain `onEditTreatment` prop reference
- AV38.3 — Source does NOT contain `onDeleteTreatment` prop reference
- AV38.4 — Source does NOT contain `<input` or `<textarea` (any form input)
- AV38.5 — Source does NOT contain "บันทึก" or "Save" button text
- AV38.6 — Lightbox preserved (image zoom is permitted)

### E6 — TreatmentReadOnlyPanel standalone RTL (extract from TimelineModal tests)

- E6.1 — Renders with full treatment data (mock fullDoc)
- E6.2 — Renders loading state when fullDoc null
- E6.3 — Close button renders only when showCloseButton=true
- E6.4 — Close button click fires onClose callback

**Total NEW assertions**: ~50 across 3 NEW test files + 1 audit extension.

---

## 8. Rule of 3 status

`TreatmentReadOnlyPanel` reaches 2 consumers post-Phase-26.2:
1. `TreatmentTimelineModal` (refactored to use it)
2. TFP split-screen right panel (NEW consumer)

**Not yet Rule of 3 trigger** (need 3+ for formal extraction discussion). Future 3rd consumer (e.g., print-preview, customer-app patient view) would formalize.

Phase 26.2 is itself an instance of the "split-screen-comparison" UX pattern. No existing parallel in codebase yet; this is the 1st.

---

## 9. Rule compliance

- **NO firestore.rules change** → Rule B Probe-Deploy-Probe NOT triggered
- **NO data migration** → Rule M not triggered
- **NO deploy this turn** → combined Phase 26.0 + 26.1 + 26.2 awaits user `deploy` authorization
- **Rule N**: targeted-test during iteration; full vitest at batch end
- **Rule I**: F10 full-flow simulate covers mount → fetch → click → lazy load → render → toggle round-trip
- **Rule P**: NEW class-of-bug (V12 multi-reader-sweep at component-level memo) already locked in Phase 26.1 AV37 ext; AV38 here is for the read-only contract enforcement

---

## 10. Non-goals (YAGNI)

- **NO diff-view** between new + old (just visual side-by-side)
- **NO per-field copy buttons** (browser select+copy works)
- **NO drag-to-resize divider** (fixed 50/50)
- **NO multi-history view** (one history panel at a time)
- **NO pin/unpin tabs** (always last 5 by date)
- **NO history search/filter** (top-5 only)
- **NO edit-from-history** (read-only contract; admin edits via CDV → returns to TFP)
- **NO customer.note edit in TFP** (display only; CDV is the source of truth — Item E)

---

## 11. Implementation plan (deferred to writing-plans skill)

5 logical sub-phases:

- **Phase 26.2a — Item E + AV38 audit prep** (~50 LOC): customer.note state + display + ClipboardCheck import + D7 tests + AV38 entry (without panel content yet — sets up the architectural anchor)
- **Phase 26.2b — TreatmentReadOnlyPanel component** (~180 LOC): NEW component + E6 RTL tests
- **Phase 26.2c — TimelineModal refactor (DRY)** (~−70 net): replace inline row with panel consumption + verify TimelineModal tests still GREEN
- **Phase 26.2d — TFP header tab strip + state + fetch** (~70 LOC): tab strip JSX + state declarations + load useEffect + G4 source-grep tests + D6 RTL tab tests
- **Phase 26.2e — TFP split-screen layout + mobile fallback** (~55 LOC): conditional outer wrapper + inner grid breakpoint adjust + aside (lg+) + modal fallback (<lg) + F10 flow-simulate

writing-plans skill will detail bite-sized tasks per sub-phase.

---

## 12. Risks + mitigations

| Risk | Mitigation |
|---|---|
| TFP inner `lg:grid-cols-2` (form sections) clashes with outer split | Conditional breakpoint: `lg:grid-cols-2` → `xl:grid-cols-2` when split active. Tested in D6.4 visually. |
| Lazy load creates flash of empty content | Show `<Loader2>` spinner in right panel when `historyFullDoc === null && selectedHistoryTreatmentId !== null`. |
| Mobile fallback opens modal — conflicts with TFP's own modal `z-[80]` | TreatmentTimelineModal uses `z-[100]` (already higher) per existing usage. No conflict. |
| TimelineModal refactor breaks existing tests | Run TimelineModal RTL bank pre + post refactor. Match snapshot count. |
| customerNote field may have legacy structure (note string vs object) | Triple fallback `custData?.note || custData?.patientData?.note || patientData?.note || ''` covers all known shapes. |
| Top-5 fetch on every TFP open is slow for customers with many treatments | `getCustomerTreatments` already paginates via ordering; client-side sort + slice is fine at ≤100 treatments. Defer optimization until issue. |

---

## 13. Test plan summary

| Test file | Groups | NEW assertions |
|---|---|---|
| `tests/phase-26-2-split-screen-source-grep.test.js` | G4.1-G4.9 | 9 |
| `tests/phase-26-2-split-screen-rtl.test.jsx` | D6.1-D6.6 + D7.1-D7.6 + E6.1-E6.4 | 16 |
| `tests/phase-26-2-split-screen-flow-simulate.test.js` | F10.1-F10.7 | 7 |
| `tests/audit-branch-scope.test.js` | AV38.1-AV38.6 | 6 |
| (existing) `tests/treatment-timeline-modal-rtl.test.jsx` | Verify refactor (no behavior change) | 0 net |

**Total NEW assertions**: 38.

---

**END OF SPEC** — awaiting user review.
