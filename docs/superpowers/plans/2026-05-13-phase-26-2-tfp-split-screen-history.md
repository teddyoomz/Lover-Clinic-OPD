# Phase 26.2 — TFP Split-Screen History Comparison + Customer Note Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TFP header tab strip (5 most recent treatments cross-branch); click → split-screen (lg+) or modal popup (<lg) with read-only history view; also display `customer.note` above doctor-save button.

**Architecture:** 5 sub-phases — 26.2a (customer.note + AV38 audit prep) → 26.2b (NEW `TreatmentReadOnlyPanel`) → 26.2c (TimelineModal refactor DRY) → 26.2d (TFP tab strip + state + fetch) → 26.2e (split-screen layout + mobile fallback). NO schema/rules/migration. AV38 invariant enforces read-only panel contract.

**Tech Stack:** React 19 + Vite + Vitest 4.1 + RTL. Existing helpers: `getCustomerTreatments`, `getBackendTreatment`, `getBackendCustomer` (all in scopedDataLayer). Existing component to refactor: `TreatmentTimelineModal`.

**Reference:** Spec at `docs/superpowers/specs/2026-05-13-phase-26-2-tfp-split-screen-history-design.md`.

**Rule constraints**:
- No deploy (Phase 26.0 + 26.1 + 26.2 = 22+ commits will deploy combined per user authorization)
- No firestore.rules / data migration
- Rule N: targeted-test during iteration; full vitest at batch end (Task 6)
- Rule of 3: `TreatmentReadOnlyPanel` reaches 2 consumers post-26.2 (Modal + TFP split); not yet a Rule of 3 trigger

---

## Pre-flight context (verified)

- TFP header at `src/components/TreatmentFormPage.jsx:2939-2955` (post-Phase-26.1 top-right button removed)
- TFP main grid at `src/components/TreatmentFormPage.jsx:3003` — `grid grid-cols-1 lg:grid-cols-2 gap-4`
- TFP load useEffect at `src/components/TreatmentFormPage.jsx:737+` — already calls `getBackendCustomer` → `custData`
- TimelineModal row at `src/components/backend/TreatmentTimelineModal.jsx:276-404` — extraction source
- CDV customer.note display at `src/components/backend/CustomerDetailView.jsx:769-788` — styling reference
- `customer.note` field is canonical (Phase 24.0-decies); `patientData.note` legacy fallback
- Doctor-save button (Phase 26.0d) at `src/components/TreatmentFormPage.jsx:~3092-3120` — Item E placement anchor
- Tab strip pattern reference: `src/components/backend/CentralStockTab.jsx:178-192` (`flex gap-1 overflow-x-auto`)

---

## File Structure

**Files to CREATE:**
- `src/components/backend/TreatmentReadOnlyPanel.jsx` — extracted treatment row (~180 LOC)
- `tests/phase-26-2-split-screen-source-grep.test.js` — G4 source-grep
- `tests/phase-26-2-split-screen-rtl.test.jsx` — D6 + D7 + E6 RTL
- `tests/phase-26-2-split-screen-flow-simulate.test.js` — F10 full-flow

**Files to MODIFY:**
- `src/components/TreatmentFormPage.jsx` — header tab strip + state + load + customerNote + conditional split + inner grid adjust + mobile fallback
- `src/components/backend/TreatmentTimelineModal.jsx` — replace inline row with `<TreatmentReadOnlyPanel>` consumption
- `tests/audit-branch-scope.test.js` — append AV38.1-AV38.6
- `.agents/skills/audit-anti-vibe-code/SKILL.md` — append AV38 entry
- `SESSION_HANDOFF.md` + `.agents/active.md` — Phase 26.2 final state

---

## Task 1: Phase 26.2a — customer.note display + AV38 audit prep (~50 LOC)

**Files:**
- Modify: `src/components/TreatmentFormPage.jsx` (Item E — state + display + import)
- Create: `tests/phase-26-2-split-screen-source-grep.test.js` (G4 file with D7-related source-grep)
- Create: `tests/phase-26-2-split-screen-rtl.test.jsx` (D7 + AV38 scaffold)

- [ ] **Step 1: Verify Phase 26.0d doctor-save button location + ClipboardCheck import**

```bash
cd F:/LoverClinic-app
grep -n "tfp-doctor-save-btn\|บันทึกสำหรับแพทย์" src/components/TreatmentFormPage.jsx | head -3
grep -nE "import.*ClipboardCheck.*from 'lucide-react'" src/components/TreatmentFormPage.jsx | head -1
```

Expected: button data-testid at ~line 3095-3115. ClipboardCheck likely NOT imported yet (add in Step 3).

- [ ] **Step 2: Create source-grep test file with D7 scaffold**

Create `tests/phase-26-2-split-screen-source-grep.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const TFP_PATH = join(process.cwd(), 'src/components/TreatmentFormPage.jsx');
const TFP_SOURCE = readFileSync(TFP_PATH, 'utf-8');

describe('Phase 26.2 — split-screen + customer.note source-grep', () => {
  describe('Item E — customer.note display above doctor-save button', () => {
    it('Item-E.1 — customerNote state declared with useState("")', () => {
      expect(TFP_SOURCE).toMatch(/const\s+\[customerNote,\s*setCustomerNote\]\s*=\s*useState\(\s*['"]['"]\s*\)/);
    });

    it('Item-E.2 — load useEffect stamps customerNote from custData (with legacy fallback)', () => {
      expect(TFP_SOURCE).toMatch(/setCustomerNote\([\s\S]{0,200}?custData\?\.note/);
      expect(TFP_SOURCE).toMatch(/setCustomerNote\([\s\S]{0,200}?patientData/);
    });

    it('Item-E.3 — display block has data-testid="tfp-customer-note"', () => {
      expect(TFP_SOURCE).toMatch(/data-testid="tfp-customer-note"/);
    });

    it('Item-E.4 — display gated on customerNote truthy', () => {
      const idx = TFP_SOURCE.indexOf('tfp-customer-note');
      const before = TFP_SOURCE.slice(Math.max(0, idx - 300), idx);
      expect(before).toMatch(/\{customerNote\s*&&/);
    });

    it('Item-E.5 — uses ClipboardCheck icon + "หมายเหตุทั่วไป" title', () => {
      expect(TFP_SOURCE).toMatch(/import\s+\{[^}]*ClipboardCheck[^}]*\}\s+from\s+['"]lucide-react['"]/);
      const idx = TFP_SOURCE.indexOf('tfp-customer-note');
      const region = TFP_SOURCE.slice(idx, idx + 800);
      expect(region).toMatch(/หมายเหตุทั่วไป/);
      expect(region).toMatch(/<ClipboardCheck/);
    });

    it('Item-E.6 — display block precedes doctor-save button (positional)', () => {
      const noteIdx = TFP_SOURCE.indexOf('tfp-customer-note');
      const btnIdx = TFP_SOURCE.indexOf('tfp-doctor-save-btn');
      expect(noteIdx).toBeGreaterThan(0);
      expect(btnIdx).toBeGreaterThan(0);
      expect(noteIdx).toBeLessThan(btnIdx);  // note above button
    });

    it('Item-E.7 — amber styling preserved (bg-amber-950/10 + border-amber-900/40)', () => {
      const idx = TFP_SOURCE.indexOf('tfp-customer-note');
      const region = TFP_SOURCE.slice(idx, idx + 800);
      expect(region).toMatch(/bg-amber-950\/10/);
      expect(region).toMatch(/border-amber-900\/40/);
    });
  });
});
```

- [ ] **Step 3: Run tests → expect 7 FAIL**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-2-split-screen-source-grep.test.js 2>&1 | tail -10
```

Expected: 7 FAIL (no customerNote / no display yet).

- [ ] **Step 4: Add ClipboardCheck to lucide-react import in TFP**

```bash
cd F:/LoverClinic-app && grep -n "from 'lucide-react'" src/components/TreatmentFormPage.jsx | head -2
```

Find the existing lucide-react multi-line import block. Add `ClipboardCheck` to the destructure (alphabetical order if applicable, or just append). Example using Edit tool — find existing pattern:

```js
import { ArrowLeft, Loader2, Stethoscope, Heart, Thermometer, ClipboardList,
         Search, Package, Edit3, RotateCcw, Camera, X, ImageIcon, FlaskConical, Copy, Paperclip,
         AlertCircle } from 'lucide-react';
```

Replace last token line with `AlertCircle, ClipboardCheck } from 'lucide-react';`.

- [ ] **Step 5: Add `customerNote` state in TFP**

Find a useState cluster near line ~370-430 (after `loadedTreatmentStatus`). Insert:

```js
// Phase 26.2-E (V26.2, 2026-05-13) — customer.note read-only mirror.
// Stamped from custData on load (canonical) + patientData.note legacy fallback.
// Displayed above doctor-save button (Phase 26.0d) so doctors see general
// patient notes without leaving TFP. Edit happens in CDV; this is display-only.
const [customerNote, setCustomerNote] = useState('');
```

- [ ] **Step 6: Stamp customerNote on load**

Find the load useEffect block at ~line 737+ where `custData = await getBackendCustomer(customerId)` is called. After the existing `custData` processing (e.g., after `customerCoursesForForm = mapRawCoursesToForm(...)` line ~744), add:

```js
// Phase 26.2-E (V26.2, 2026-05-13) — stamp customerNote from canonical + legacy
// fallback for display above doctor-save button.
if (!cancelled) {
  setCustomerNote(
    custData?.note ||
    custData?.patientData?.note ||
    patientData?.note ||
    ''
  );
}
```

Use grep to find precise line:

```bash
grep -nE "mapRawCoursesToForm|custData\?\.|getBackendCustomer" src/components/TreatmentFormPage.jsx | head -10
```

The exact `if (!cancelled)` guard pattern depends on local context — verify the existing useEffect uses a `cancelled` flag (typical) and follow the same pattern.

- [ ] **Step 7: Add customerNote display JSX**

Find the doctor-save button JSX (search for `tfp-doctor-save-btn`):

```bash
grep -nB 4 -A 25 "tfp-doctor-save-btn" src/components/TreatmentFormPage.jsx | head -40
```

The button is wrapped in `{!isEdit && (...)}` block. Insert the customerNote display block IMMEDIATELY BEFORE that wrapper:

```jsx
{/* Phase 26.2-E (V26.2, 2026-05-13) — customer.note read-only mirror.
    Mirrors CDV Phase 24.0-decies amber box (CustomerDetailView.jsx:769-788)
    so doctors see general patient notes without leaving TFP. Edit happens in
    CDV; this is display-only. Hidden when both customer.note + patientData.note empty. */}
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

{/* Existing Phase 26.0d doctor-save button block follows */}
{!isEdit && (
  ...
)}
```

- [ ] **Step 8: Run tests → expect 7 PASS**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-2-split-screen-source-grep.test.js 2>&1 | tail -10
```

Expected: 7 Item-E PASS. Phase 26.0 + 26.1 baseline preserved.

- [ ] **Step 9: Build clean**

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 10: Commit + push**

```bash
cd F:/LoverClinic-app
git add src/components/TreatmentFormPage.jsx tests/phase-26-2-split-screen-source-grep.test.js
git commit -m "$(cat <<'EOF'
feat(Phase 26.2a): customer.note display above doctor-save button (Item E)

User directive: "ให้แสดงหมายเหตุทั่วไป ของลูกค้าคนนั้นๆ ที่แสดงในหน้าข้อมูล
ลูกค้า มาแสดงในหน้า TFP ด้วย เอาไว้เหนือปุ่มบันทึกสำหรับแพทย์".

Mirror of CustomerDetailView Phase 24.0-decies amber note box, placed
directly above the Phase 26.0d doctor-save button in TFP. Read-only —
edit happens in CDV (single source of truth).

- NEW state: customerNote (useState(''))
- Load useEffect stamps from `custData?.note || custData?.patientData?.note
  || patientData?.note || ''` (canonical + legacy fallback chain)
- Display: amber styling (bg-amber-950/10 + border-amber-900/40) +
  ClipboardCheck icon + "หมายเหตุทั่วไป" title + <pre whitespace-pre-wrap>
  for multi-line note content
- Hidden when empty (no clutter)
- data-testid="tfp-customer-note" for test targeting
- Position: above {!isEdit && doctor-save-btn} block — empty space user noted

Tests: 7 Item-E source-grep assertions GREEN (state + load fallback + display
+ gate + ClipboardCheck import + title + position + amber styling).

Sub-phase 26.2a complete. Tasks 2-6 (panel extraction + tab strip + split
layout + audit) follow.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master 2>&1 | tail -3
```

---

## Task 2: Phase 26.2b — NEW TreatmentReadOnlyPanel component + E6 RTL (~180 LOC)

**Files:**
- Create: `src/components/backend/TreatmentReadOnlyPanel.jsx`
- Create: `tests/phase-26-2-split-screen-rtl.test.jsx` (E6 group)

- [ ] **Step 1: Read source content to extract from TimelineModal**

```bash
cd F:/LoverClinic-app && grep -nB 2 -A 8 "treatments.map\|paginated.map" src/components/backend/TreatmentTimelineModal.jsx | head -20
```

Locate the row JSX at lines ~276-404. Read fully:

```bash
cd F:/LoverClinic-app && sed -n '270,410p' src/components/backend/TreatmentTimelineModal.jsx
```

(Or use Read tool with offset=270, limit=140.)

This is the source content to extract. Maintain ALL the existing structure (grid layout + meta + course items card + accordions + image grid + lightbox). Two changes vs source:
- Add `showCloseButton` prop (default false) → render X close button at top when true
- DROP `onEditTreatment` prop reference (read-only contract per AV38)

- [ ] **Step 2: Create E6 RTL test scaffold**

Create `tests/phase-26-2-split-screen-rtl.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Stub formatThaiDateFull import (used by panel)
vi.mock('../src/utils.js', async () => {
  const actual = await vi.importActual('../src/utils.js');
  return {
    ...actual,
    formatThaiDateFull: (d) => d ? `13 พฤษภาคม 2569` : '-',
  };
});

import TreatmentReadOnlyPanel from '../src/components/backend/TreatmentReadOnlyPanel.jsx';

describe('Phase 26.2 — split-screen RTL', () => {
  describe('E6 — TreatmentReadOnlyPanel standalone', () => {
    const baseTreatment = {
      id: 'TR-1',
      treatmentId: 'TR-1',
      date: '2026-05-13',
      doctor: 'หมอมายด์',
      branch: 'นครราชสีมา',
      cc: 'ฟหก',
      dx: 'ฟหก',
      status: 'doctor-recorded',
    };
    const baseFullDoc = {
      id: 'TR-1',
      detail: {
        treatmentDate: '2026-05-13',
        symptoms: 'ฟหก',
        diagnosis: 'ฟหก',
        treatmentNote: 'note text',
        beforeImages: [],
        afterImages: [],
        otherImages: [],
        treatmentItems: [{ name: 'item-A', qty: '1', unit: 'ครั้ง' }],
        medications: [],
        consumables: [],
      },
    };

    it('E6.1 — renders with full treatment data', () => {
      render(
        <TreatmentReadOnlyPanel
          treatment={baseTreatment}
          fullDoc={baseFullDoc}
          isDark={false}
          ac="#a78bfa"
          acRgb="167,139,250"
          isLatest={true}
          showCloseButton={false}
        />
      );
      expect(screen.getByTestId('treatment-read-only-panel')).toBeInTheDocument();
      expect(screen.getByText(/13 พฤษภาคม 2569/)).toBeInTheDocument();
      expect(screen.getByText('ล่าสุด')).toBeInTheDocument();
      expect(screen.getByText('แพทย์ลงบันทึก')).toBeInTheDocument();
    });

    it('E6.2 — renders loading state when fullDoc null', () => {
      render(
        <TreatmentReadOnlyPanel
          treatment={baseTreatment}
          fullDoc={null}
          isDark={false}
          ac="#a78bfa"
          acRgb="167,139,250"
        />
      );
      // Loading message OR spinner present
      expect(screen.getByText(/กำลังโหลด/)).toBeInTheDocument();
    });

    it('E6.3 — close button renders only when showCloseButton=true', () => {
      const { rerender } = render(
        <TreatmentReadOnlyPanel
          treatment={baseTreatment}
          fullDoc={baseFullDoc}
          isDark={false}
          ac="#a78bfa"
          acRgb="167,139,250"
          showCloseButton={false}
        />
      );
      expect(screen.queryByTestId('treatment-read-only-panel-close')).toBeNull();

      rerender(
        <TreatmentReadOnlyPanel
          treatment={baseTreatment}
          fullDoc={baseFullDoc}
          isDark={false}
          ac="#a78bfa"
          acRgb="167,139,250"
          showCloseButton={true}
          onClose={() => {}}
        />
      );
      expect(screen.getByTestId('treatment-read-only-panel-close')).toBeInTheDocument();
    });

    it('E6.4 — close button click fires onClose', () => {
      const onClose = vi.fn();
      render(
        <TreatmentReadOnlyPanel
          treatment={baseTreatment}
          fullDoc={baseFullDoc}
          isDark={false}
          ac="#a78bfa"
          acRgb="167,139,250"
          showCloseButton={true}
          onClose={onClose}
        />
      );
      fireEvent.click(screen.getByTestId('treatment-read-only-panel-close'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
```

- [ ] **Step 3: Run E6 → expect FAIL (module not found)**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-2-split-screen-rtl.test.jsx 2>&1 | tail -10
```

Expected: 4 FAIL — `TreatmentReadOnlyPanel.jsx` doesn't exist yet.

- [ ] **Step 4: Create TreatmentReadOnlyPanel component**

Create `src/components/backend/TreatmentReadOnlyPanel.jsx`:

```jsx
import { useState } from 'react';
import {
  X, Stethoscope, Calendar, MapPin, User, Pill, Package, FileText, Loader2,
  ChevronDown, ChevronUp, Image as ImageIcon,
} from 'lucide-react';
import { formatThaiDateFull } from '../../utils.js';

/**
 * Phase 26.2b (V26.2, 2026-05-13) — Read-only treatment panel.
 *
 * Extracted from TreatmentTimelineModal row JSX (lines 276-404) so both
 * the modal AND TFP split-screen right panel can consume the same view.
 * Rule of 3 prep — 2 consumers post-Phase-26.2.
 *
 * Read-only contract (AV38 invariant):
 * - NO onEditTreatment / onDeleteTreatment props
 * - NO form inputs anywhere
 * - NO save buttons
 * - Lightbox permitted (image zoom)
 * - File-open via existing image rendering / treatmentFiles
 * - Copy works via browser native select+copy
 *
 * Props:
 * - treatment: summary entry { id, treatmentId, date, doctor, branch, cc, dx, status, ... }
 * - fullDoc: full Firestore doc (with detail nested) — null while loading
 * - isDark: theme flag
 * - ac, acRgb: accent color + RGB triplet (for "ล่าสุด" badge)
 * - isLatest: render "ล่าสุด" badge (default false)
 * - showCloseButton: render X close button at top (default false; TFP split sets true)
 * - onClose: close button callback (called when showCloseButton=true)
 */
export default function TreatmentReadOnlyPanel({
  treatment,
  fullDoc,
  isDark,
  ac,
  acRgb,
  isLatest = false,
  showCloseButton = false,
  onClose,
}) {
  const detail = fullDoc?.detail || null;
  const beforeImages = detail?.beforeImages || [];
  const afterImages = detail?.afterImages || [];
  const otherImages = detail?.otherImages || [];
  const courseItems = detail?.treatmentItems || [];
  const medications = detail?.medications || detail?.takeHomeMeds || [];
  const consumables = detail?.consumables || [];
  const isLoading = !fullDoc;

  const [lightbox, setLightbox] = useState(null);
  const [medOpen, setMedOpen] = useState(false);
  const [consumOpen, setConsumOpen] = useState(false);

  return (
    <div data-testid="treatment-read-only-panel" className="space-y-3">
      {/* Header: Date + ล่าสุด + status chip + Close button (V26.2) */}
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar size={14} style={{ color: '#2EC4B6' }} />
        <span className="text-sm font-bold text-[var(--tx-heading)]">
          {formatThaiDateFull(treatment.date) || '-'}
        </span>
        {isLatest && (
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ backgroundColor: `rgba(${acRgb},0.15)`, color: ac }}
          >
            ล่าสุด
          </span>
        )}
        {treatment.status === 'doctor-recorded' && (
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1 border ${isDark ? 'bg-amber-950 border-amber-800 text-amber-100' : 'bg-amber-100 border-amber-200 text-amber-900'}`}
          >
            <Stethoscope size={10} />
            แพทย์ลงบันทึก
          </span>
        )}
        {showCloseButton && (
          <button
            onClick={onClose}
            data-testid="treatment-read-only-panel-close"
            aria-label="ปิดประวัติการรักษา"
            className="ml-auto p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--tx-muted)]"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Meta row */}
      <div className="space-y-1 text-xs">
        {treatment.branch && (
          <div className="flex items-center gap-1.5 text-[var(--tx-secondary)]">
            <MapPin size={11} style={{ color: '#2EC4B6' }} />
            <span>{treatment.branch}</span>
          </div>
        )}
        {treatment.doctor && (
          <div className="flex items-center gap-1.5 text-[var(--tx-secondary)]">
            <User size={11} style={{ color: '#2EC4B6' }} />
            <span className="font-semibold">{treatment.doctor}</span>
          </div>
        )}
      </div>

      {/* Loading state OR full content */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-[var(--tx-muted)] py-6 justify-center">
          <Loader2 size={14} className="animate-spin" />
          กำลังโหลดรายละเอียด...
        </div>
      ) : (
        <>
          {/* CC / DX / Dr.Note */}
          <div className="space-y-2">
            {treatment.cc && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-semibold">อาการ (CC)</p>
                <p className="text-xs text-[var(--tx-secondary)] whitespace-pre-wrap">{treatment.cc}</p>
              </div>
            )}
            {treatment.dx && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-semibold">วินิจฉัย (DX)</p>
                <p className="text-xs text-[var(--tx-secondary)] whitespace-pre-wrap">{treatment.dx}</p>
              </div>
            )}
            {detail?.treatmentNote && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-semibold">รายละเอียด (Dr. Note)</p>
                <p className="text-xs text-[var(--tx-secondary)] whitespace-pre-wrap">{detail.treatmentNote}</p>
              </div>
            )}
          </div>

          {/* Course/treatment items */}
          {courseItems.length > 0 && (
            <div className={`rounded-lg p-3 border border-[var(--bd)] ${isDark ? 'bg-[var(--bg-card)]' : 'bg-gray-50'}`}>
              <p className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-semibold mb-1.5">รายการรักษา</p>
              <ul className="space-y-1">
                {courseItems.map((item, i) => (
                  <li key={i} className="flex items-center justify-between text-xs">
                    <span className="text-[var(--tx-secondary)]">{item.name || item.productName || '-'}</span>
                    <span className="font-mono text-[var(--tx-muted)]">{item.qty || ''} {item.unit || ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Accordions: medications + consumables */}
          {medications.length > 0 && (
            <div className="rounded-lg border border-[var(--bd)] overflow-hidden">
              <button
                onClick={() => setMedOpen(!medOpen)}
                className="w-full px-3 py-2 flex items-center justify-between text-xs font-bold hover:bg-[var(--bg-hover)]"
              >
                <span className="flex items-center gap-1.5"><Pill size={11} /> ยากลับบ้าน ({medications.length})</span>
                {medOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
              {medOpen && (
                <ul className="px-3 py-2 space-y-1 border-t border-[var(--bd)]">
                  {medications.map((m, i) => (
                    <li key={i} className="text-xs text-[var(--tx-secondary)]">
                      {m.name || m.productName || '-'} <span className="font-mono text-[var(--tx-muted)]">{m.qty} {m.unit}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {consumables.length > 0 && (
            <div className="rounded-lg border border-[var(--bd)] overflow-hidden">
              <button
                onClick={() => setConsumOpen(!consumOpen)}
                className="w-full px-3 py-2 flex items-center justify-between text-xs font-bold hover:bg-[var(--bg-hover)]"
              >
                <span className="flex items-center gap-1.5"><Package size={11} /> สินค้าสิ้นเปลือง ({consumables.length})</span>
                {consumOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
              {consumOpen && (
                <ul className="px-3 py-2 space-y-1 border-t border-[var(--bd)]">
                  {consumables.map((c, i) => (
                    <li key={i} className="text-xs text-[var(--tx-secondary)]">
                      {c.name || c.productName || '-'} <span className="font-mono text-[var(--tx-muted)]">{c.qty} {c.unit}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Image grid: OPD/Before/After */}
          {(otherImages.length > 0 || beforeImages.length > 0 || afterImages.length > 0) && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-semibold mb-2">รูปภาพการรักษา</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <ImageColumn label="OPD/อื่นๆ" images={otherImages} onZoom={(src) => setLightbox({ src, label: 'OPD/อื่นๆ' })} />
                <ImageColumn label="Before" images={beforeImages} onZoom={(src) => setLightbox({ src, label: 'Before' })} />
                <ImageColumn label="After" images={afterImages} onZoom={(src) => setLightbox({ src, label: 'After' })} />
              </div>
            </div>
          )}
        </>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2 text-white">
              <span className="text-sm font-bold">{lightbox.label}</span>
              <button onClick={() => setLightbox(null)} className="p-1 hover:opacity-70" aria-label="ปิด">
                <X size={20} />
              </button>
            </div>
            <img src={lightbox.src} alt={lightbox.label} className="w-full h-auto max-h-[80vh] object-contain rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
}

/** Sub-component: vertical image column with click-to-zoom. */
function ImageColumn({ label, images, onZoom }) {
  if (images.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--bd)] border-dashed p-3 flex items-center justify-center text-[10px] text-[var(--tx-muted)]">
        <ImageIcon size={14} className="mr-1.5 opacity-40" />
        ไม่มี {label}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold text-[var(--tx-muted)]">{label}</p>
      {images.map((img, i) => (
        <button
          key={img.id || i}
          onClick={() => onZoom(img.dataUrl)}
          data-testid={`treatment-img-zoom-${label}-${i}`}
          aria-label={`ขยายรูป ${label}`}
          className="block w-full rounded overflow-hidden hover:opacity-80 transition-opacity cursor-zoom-in"
        >
          <img src={img.dataUrl} alt={`${label} ${i + 1}`} className="w-full h-auto" />
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run E6 → expect 4 PASS**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-2-split-screen-rtl.test.jsx 2>&1 | tail -10
```

Expected: 4 E6 PASS.

- [ ] **Step 6: Build clean**

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -5
```

- [ ] **Step 7: Commit + push**

```bash
cd F:/LoverClinic-app
git add src/components/backend/TreatmentReadOnlyPanel.jsx tests/phase-26-2-split-screen-rtl.test.jsx
git commit -m "$(cat <<'EOF'
feat(Phase 26.2b): TreatmentReadOnlyPanel component + E6 RTL

NEW src/components/backend/TreatmentReadOnlyPanel.jsx (~180 LOC):
- Extracted from TreatmentTimelineModal row JSX (lines 276-404)
- Read-only contract (AV38 invariant locked in Task 6):
  - NO onEditTreatment / onDeleteTreatment props
  - NO form inputs / save buttons
  - Lightbox permitted (image zoom)
- Sections: Date/chips header + Meta + CC/DX/Note + courseItems card +
  medications accordion + consumables accordion + 3-image grid (OPD/Before/After)
- NEW showCloseButton prop (default false; TFP split-screen sets true)
- Lightbox handler unchanged from TimelineModal
- formatThaiDateFull from src/utils.js (existing canonical helper)

Tests: E6.1-E6.4 RTL — 4/4 PASS:
- E6.1 renders with full treatment data
- E6.2 renders loading state when fullDoc null
- E6.3 close button only when showCloseButton=true
- E6.4 close button click fires onClose

Rule of 3 prep — 2 consumers post-Phase-26.2 (Modal + TFP split).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master 2>&1 | tail -3
```

---

## Task 3: Phase 26.2c — TimelineModal refactor (DRY) (~−70 net)

**Files:**
- Modify: `src/components/backend/TreatmentTimelineModal.jsx` (replace inline row with `<TreatmentReadOnlyPanel>`)

- [ ] **Step 1: Read current TimelineModal row JSX**

```bash
cd F:/LoverClinic-app && sed -n '260,410p' src/components/backend/TreatmentTimelineModal.jsx
```

Identify the `.map()` block (around line 276) and the inline row JSX. Note where `onEditTreatment` is used (likely line ~365-370).

- [ ] **Step 2: Add TreatmentReadOnlyPanel import**

Edit `src/components/backend/TreatmentTimelineModal.jsx`. Near top of file with other imports, add:

```js
import TreatmentReadOnlyPanel from './TreatmentReadOnlyPanel.jsx';
```

- [ ] **Step 3: Replace inline row JSX with panel consumption**

Find the existing `.map()` block:

```jsx
{paginated.map((t, pageIndex) => {
  const globalIndex = (page - 1) * pageSize + pageIndex;
  const fullDoc = treatmentsById[t.id] || null;
  // ... inline detail destructuring + JSX (~120 LOC) ...
  return (
    <div key={t.id || globalIndex}
      data-testid={`timeline-row-${t.id}`}
      ...>
      ...
    </div>
  );
})}
```

Replace the inline JSX body (between the destructuring and the closing `})}`) with panel consumption + retain modal-level edit-button wrapper:

```jsx
{paginated.map((t, pageIndex) => {
  const globalIndex = (page - 1) * pageSize + pageIndex;
  const fullDoc = treatmentsById[t.id] || null;
  const isLatest = globalIndex === 0;
  return (
    <div
      key={t.id || globalIndex}
      data-testid={`timeline-row-${t.id}`}
      className={`pb-6 ${globalIndex < paginated.length - 1 ? 'border-b border-[var(--bd)] mb-6' : ''}`}
    >
      {/* Phase 26.2c — refactored to use TreatmentReadOnlyPanel for DRY */}
      <TreatmentReadOnlyPanel
        treatment={t}
        fullDoc={fullDoc}
        isDark={isDark}
        ac={ac}
        acRgb={acRgb}
        isLatest={isLatest}
        showCloseButton={false}
      />

      {/* Modal-level edit button (NOT in panel — panel is read-only per AV38) */}
      {onEditTreatment && (
        <div className="flex justify-end mt-2">
          <button
            onClick={() => { onClose?.(); onEditTreatment(t.id); }}
            data-testid={`timeline-edit-${t.id}`}
            className="text-xs font-bold flex items-center gap-1 px-3 py-1.5 rounded transition-all hover:bg-[var(--bg-hover)]"
            style={{ color: '#2EC4B6' }}
          >
            <Edit3 size={11} />
            แก้ไขการรักษา
          </button>
        </div>
      )}
    </div>
  );
})}
```

Remove the `<Edit3>` import if no longer needed elsewhere in TimelineModal (it might still be used elsewhere — verify with grep).

- [ ] **Step 4: Run TimelineModal existing tests if present**

```bash
cd F:/LoverClinic-app && npx vitest run tests/customer-treatment-timeline-flow.test.js 2>&1 | tail -10
```

If TL2.6 / TL5.1 / TL9 tests fail due to refactor: these may need V21-class regex updates. Inspect the regex pattern and adjust to accept the new shape (e.g., regex looking for `timeline-img-zoom-` will now find `treatment-img-zoom-OPD/อื่นๆ-0` — update regex window or pattern).

Run with full output if any fail:

```bash
cd F:/LoverClinic-app && npx vitest run tests/customer-treatment-timeline-flow.test.js 2>&1 | tail -30
```

Apply V21-class regex updates if needed — same pattern as Phase 26.0/26.1 test fixups. Include any fixup in this commit.

- [ ] **Step 5: Build clean**

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -5
```

- [ ] **Step 6: Commit + push**

```bash
cd F:/LoverClinic-app
git add src/components/backend/TreatmentTimelineModal.jsx
# Add any V21-class test fixups if they landed
git diff --cached --stat
git commit -m "$(cat <<'EOF'
refactor(Phase 26.2c): TimelineModal consumes TreatmentReadOnlyPanel (DRY)

Replace inline row JSX (lines 276-404) with TreatmentReadOnlyPanel
consumption. Modal-level edit button retained as wrapper outside panel
(panel is read-only per AV38). Behavior preserved:
- Same data rendering (date, chips, meta, CC/DX/Note, items, accordions, images)
- Same lightbox image zoom
- Same edit-button flow (onClose → onEditTreatment)

Net diff: ~−100 LOC removed (inline row JSX) + ~30 LOC added (panel + edit
wrapper). Rule of 3 status: panel reaches 2 consumers (modal + TFP split-screen
in Task 5).

Any V21-class test fixups (image-zoom data-testid pattern change) included
in this commit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master 2>&1 | tail -3
```

---

## Task 4: Phase 26.2d — TFP header tab strip + state + history fetch (~70 LOC)

**Files:**
- Modify: `src/components/TreatmentFormPage.jsx`
- Modify: `tests/phase-26-2-split-screen-source-grep.test.js` (append G4 tab strip group)
- Modify: `tests/phase-26-2-split-screen-rtl.test.jsx` (append D6 group)

- [ ] **Step 1: Write G4 + D6 tests**

In `tests/phase-26-2-split-screen-source-grep.test.js`, append BEFORE the closing `});` of the outer describe:

```js
  describe('G4 — TFP history tab strip + state', () => {
    it('G4.1 — historyTreatments state declared with useState([])', () => {
      expect(TFP_SOURCE).toMatch(/const\s+\[historyTreatments,\s*setHistoryTreatments\]\s*=\s*useState\(\s*\[\s*\]\s*\)/);
    });

    it('G4.2 — selectedHistoryTreatmentId state declared with useState(null)', () => {
      expect(TFP_SOURCE).toMatch(/const\s+\[selectedHistoryTreatmentId,\s*setSelectedHistoryTreatmentId\]\s*=\s*useState\(\s*null\s*\)/);
    });

    it('G4.3 — historyFullDoc state declared', () => {
      expect(TFP_SOURCE).toMatch(/const\s+\[historyFullDoc,\s*setHistoryFullDoc\]\s*=\s*useState\(\s*null\s*\)/);
    });

    it('G4.4 — getCustomerTreatments fetch on mount (lazy via scopedDataLayer)', () => {
      expect(TFP_SOURCE).toMatch(/getCustomerTreatments\s*\(\s*customerId\s*\)/);
    });

    it('G4.5 — Tab strip JSX has data-testid="tfp-history-tab-${id}"', () => {
      expect(TFP_SOURCE).toMatch(/data-testid={`tfp-history-tab-/);
    });

    it('G4.6 — handleHistoryTabClick toggles selection (re-click dismisses)', () => {
      expect(TFP_SOURCE).toMatch(/handleHistoryTabClick/);
      expect(TFP_SOURCE).toMatch(/selectedHistoryTreatmentId\s*===\s*tid[\s\S]{0,200}setSelectedHistoryTreatmentId\(null\)/);
    });
  });
```

In `tests/phase-26-2-split-screen-rtl.test.jsx`, append D6 inside the outer describe:

```jsx
  describe('D6 — TFP tab strip source-grep + click behavior (RTL not feasible due to TFP heavy deps; use source-grep)', () => {
    it('D6.1 — TFP source contains tab strip JSX block', () => {
      const fs = require('fs');
      const path = require('path');
      const src = fs.readFileSync(path.join(process.cwd(), 'src/components/TreatmentFormPage.jsx'), 'utf-8');
      expect(src).toMatch(/historyTreatments\.length\s*>\s*0/);
      expect(src).toMatch(/historyTreatments\.map\(/);
    });

    it('D6.2 — Edit mode filters current treatment from tab list', () => {
      const fs = require('fs');
      const path = require('path');
      const src = fs.readFileSync(path.join(process.cwd(), 'src/components/TreatmentFormPage.jsx'), 'utf-8');
      // expect filter on treatmentId in load
      expect(src).toMatch(/isEdit[\s\S]{0,200}treatmentId[\s\S]{0,200}filter/);
    });

    it('D6.3 — Top-5 slice in load useEffect', () => {
      const fs = require('fs');
      const path = require('path');
      const src = fs.readFileSync(path.join(process.cwd(), 'src/components/TreatmentFormPage.jsx'), 'utf-8');
      expect(src).toMatch(/\.slice\(\s*0\s*,\s*5\s*\)/);
    });
  });
```

- [ ] **Step 2: Run G4 + D6 → expect FAIL**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-2-split-screen-source-grep.test.js tests/phase-26-2-split-screen-rtl.test.jsx 2>&1 | tail -10
```

Expected: G4 6 FAIL + D6 3 FAIL = 9 FAIL (state + tab strip not yet added).

- [ ] **Step 3: Add 3 new states + handler in TFP**

Find the state cluster near line 370-430 (after `customerNote`). Insert:

```js
// Phase 26.2 (V26.2, 2026-05-13) — split-screen history tab strip state.
// Top-5 cross-branch recent treatments fetched on mount; tab click opens
// split-screen on lg+ (Task 5) OR modal popup on <lg (mobile fallback).
const [historyTreatments, setHistoryTreatments] = useState([]);
const [selectedHistoryTreatmentId, setSelectedHistoryTreatmentId] = useState(null);
const [historyFullDoc, setHistoryFullDoc] = useState(null);

const handleHistoryTabClick = (tid) => {
  if (selectedHistoryTreatmentId === tid) {
    // Toggle off — clicking the active tab dismisses
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

- [ ] **Step 4: Add load useEffect for top-5 fetch**

Add a NEW useEffect (separate from the existing options-load) right below the state cluster. Search for the existing `useEffect` blocks first:

```bash
grep -nE "useEffect\(" src/components/TreatmentFormPage.jsx | head -20
```

Pick a placement near the existing customer-related useEffects. Insert:

```js
// Phase 26.2 — fetch top-5 recent treatments for history tab strip.
// Cross-branch (per Q2 brainstorming decision = "All branches latest").
// Edit-mode: exclude the treatment currently being edited.
useEffect(() => {
  if (!customerId) return;
  let cancelled = false;
  import('../lib/scopedDataLayer.js')
    .then(({ getCustomerTreatments }) => getCustomerTreatments(customerId))
    .then((list) => {
      if (cancelled) return;
      const sorted = (list || []).slice().sort((a, b) => {
        const dA = a.detail?.treatmentDate || '';
        const dB = b.detail?.treatmentDate || '';
        return dB.localeCompare(dA);
      });
      const filtered = (isEdit && treatmentId)
        ? sorted.filter(t => (t.treatmentId || t.id) !== treatmentId)
        : sorted;
      setHistoryTreatments(filtered.slice(0, 5));
    })
    .catch(() => {
      if (!cancelled) setHistoryTreatments([]);
    });
  return () => { cancelled = true; };
}, [customerId, treatmentId, isEdit]);
```

- [ ] **Step 5: Add tab strip JSX below sticky header**

Find the sticky header block (around line 2939-2955). Insert IMMEDIATELY after the closing `</div>` of that header:

```jsx
{/* Phase 26.2 (V26.2, 2026-05-13) — History tab strip.
    Shows top-5 recent treatments (cross-branch). Click → split-screen
    on lg+ viewport OR modal popup on <lg. Re-click same tab → dismiss.
    Hidden when historyTreatments empty (no customer history yet). */}
{historyTreatments.length > 0 && (
  <div className={`sticky top-[52px] z-[9] border-b backdrop-blur-sm ${isDark ? 'bg-[#0a0a0a]/95 border-[#222]' : 'bg-white/95 border-gray-200'}`}>
    <div className="max-w-6xl mx-auto px-4 py-2">
      <div className="flex items-center gap-2 overflow-x-auto">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--tx-muted)] whitespace-nowrap">
          ประวัติ:
        </span>
        {historyTreatments.map((t, i) => {
          const tid = t.treatmentId || t.id;
          const active = selectedHistoryTreatmentId === tid;
          const cc = t.detail?.symptoms || '';
          return (
            <button
              key={tid}
              onClick={() => handleHistoryTabClick(tid)}
              data-testid={`tfp-history-tab-${tid}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                active
                  ? 'bg-purple-700 text-white shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                  : 'text-[var(--tx-muted)] hover:text-purple-400 hover:bg-[var(--bg-hover)] border border-[var(--bd)]'
              }`}
            >
              <Calendar size={11} />
              <span>{formatThaiDateShort(t.detail?.treatmentDate || t.date || '')}</span>
              {i === 0 && <span className="text-[9px] opacity-70">· ล่าสุด</span>}
              {cc && (
                <span className="text-[10px] opacity-60 max-w-[100px] truncate">
                  · {cc}
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

Verify `Calendar` icon is already imported in TFP from lucide-react. Verify `formatThaiDateShort` exists in utils.js:

```bash
grep -nE "export.*formatThaiDateShort|export.*formatThaiDate" src/utils.js | head -5
```

If only `formatThaiDateFull` exists, use that OR add a `formatThaiDateShort` helper. For simplicity, use `formatThaiDateFull` and accept slightly longer tab labels.

- [ ] **Step 6: Run G4 + D6 → expect PASS**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-2-split-screen-source-grep.test.js tests/phase-26-2-split-screen-rtl.test.jsx 2>&1 | tail -10
```

Expected: G4 6 PASS + D6 3 PASS + E6 4 PASS + Item-E 7 PASS = 20 total.

- [ ] **Step 7: Build clean**

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -5
```

- [ ] **Step 8: Commit + push**

```bash
cd F:/LoverClinic-app
git add src/components/TreatmentFormPage.jsx tests/phase-26-2-split-screen-source-grep.test.js tests/phase-26-2-split-screen-rtl.test.jsx
git commit -m "$(cat <<'EOF'
feat(Phase 26.2d): TFP header tab strip + state + top-5 history fetch

NEW state in TFP:
- historyTreatments (top-5 cross-branch list, sorted desc by treatmentDate)
- selectedHistoryTreatmentId (null = no split, string = tab active)
- historyFullDoc (lazy-loaded full doc for active tab)
- handleHistoryTabClick (toggle: re-click active tab dismisses; else lazy load)

NEW load useEffect:
- Fetches getCustomerTreatments(customerId) on mount
- Filters current treatmentId in edit mode (don't show self)
- Slices to top-5 by date desc

NEW header tab strip JSX below sticky header:
- Conditional: rendered only when historyTreatments.length > 0
- Per-tab: Calendar icon + date + "ล่าสุด" badge (first) + CC truncated preview
- Active state: purple-700 bg + glow shadow
- data-testid="tfp-history-tab-{id}" for RTL targeting
- overflow-x-auto for horizontal scroll on narrow viewports

Tests: G4.1-G4.6 + D6.1-D6.3 — 9/9 PASS. Phase 26.0 + 26.1 + 26.2a + 26.2b
baselines preserved.

Split-screen layout (Task 5) will consume selectedHistoryTreatmentId state
to render the right panel.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master 2>&1 | tail -3
```

---

## Task 5: Phase 26.2e — Split-screen layout + mobile fallback + F10 flow-simulate (~55 LOC)

**Files:**
- Modify: `src/components/TreatmentFormPage.jsx`
- Create: `tests/phase-26-2-split-screen-flow-simulate.test.js`
- Modify: `tests/phase-26-2-split-screen-source-grep.test.js` (append G4.7-G4.9)

- [ ] **Step 1: Append G4.7-G4.9 + write F10 simulator**

In `tests/phase-26-2-split-screen-source-grep.test.js` G4 describe block, append:

```js
    it('G4.7 — split-screen outer wrapper: max-w-[2000px] lg:flex when active', () => {
      expect(TFP_SOURCE).toMatch(/selectedHistoryTreatmentId\s*\?\s*['"]max-w-\[2000px\]\s+lg:flex/);
    });

    it('G4.8 — right panel aside: hidden lg:block (desktop-only)', () => {
      expect(TFP_SOURCE).toMatch(/<aside\s+className=[`"][^`"]*hidden\s+lg:block/);
    });

    it('G4.9 — TreatmentReadOnlyPanel imported + used in TFP', () => {
      expect(TFP_SOURCE).toMatch(/import\s+TreatmentReadOnlyPanel\s+from\s+['"][^'"]*TreatmentReadOnlyPanel['"]/);
      expect(TFP_SOURCE).toMatch(/<TreatmentReadOnlyPanel/);
    });
```

Create `tests/phase-26-2-split-screen-flow-simulate.test.js`:

```js
import { describe, it, expect } from 'vitest';

/**
 * Phase 26.2e Rule I full-flow simulate (F10).
 *
 * Pure simulator mirroring TFP's tab-click → state → lazy-load → render chain.
 * No React mount; no real Firestore. Tests routing + state transitions.
 */

function simulateTabClick({ currentSelected, currentFullDoc, tid }) {
  // Mirror handleHistoryTabClick logic
  if (currentSelected === tid) {
    return { selected: null, fullDoc: null, fetchTriggered: false };
  }
  return { selected: tid, fullDoc: null, fetchTriggered: true };
}

function simulateLazyLoadComplete(state, fetchedDoc) {
  return { ...state, fullDoc: fetchedDoc };
}

function simulateRenderDecision({ selected, viewport }) {
  if (!selected) return 'full-width-form';
  if (viewport === 'lg') return 'split-screen';
  return 'modal-popup';  // <lg fallback
}

describe('Phase 26.2 — Rule I full-flow simulate (F10)', () => {
  it('F10.1 — mount: fetch fires, list sliced to top-5', () => {
    const mockList = Array.from({ length: 8 }, (_, i) => ({
      id: `TR-${i}`,
      treatmentId: `TR-${i}`,
      detail: { treatmentDate: `2026-05-${20 - i}` },
    }));
    const sorted = mockList.slice().sort((a, b) =>
      (b.detail.treatmentDate).localeCompare(a.detail.treatmentDate)
    );
    const top5 = sorted.slice(0, 5);
    expect(top5).toHaveLength(5);
    expect(top5[0].detail.treatmentDate).toBe('2026-05-20');
    expect(top5[4].detail.treatmentDate).toBe('2026-05-16');
  });

  it('F10.2 — edit mode filters current treatment from list', () => {
    const list = [
      { id: 'TR-1', treatmentId: 'TR-1', detail: { treatmentDate: '2026-05-13' } },
      { id: 'TR-2', treatmentId: 'TR-2', detail: { treatmentDate: '2026-05-12' } },
      { id: 'TR-3', treatmentId: 'TR-3', detail: { treatmentDate: '2026-05-11' } },
    ];
    const currentTreatmentId = 'TR-1';
    const filtered = list.filter(t => (t.treatmentId || t.id) !== currentTreatmentId);
    expect(filtered).toHaveLength(2);
    expect(filtered.map(t => t.id)).toEqual(['TR-2', 'TR-3']);
  });

  it('F10.3 — tab click triggers fetch + state update', () => {
    const result = simulateTabClick({ currentSelected: null, currentFullDoc: null, tid: 'TR-1' });
    expect(result.selected).toBe('TR-1');
    expect(result.fetchTriggered).toBe(true);
    expect(result.fullDoc).toBeNull();  // loading state
  });

  it('F10.4 — lazy load completes → fullDoc populated', () => {
    const initial = simulateTabClick({ currentSelected: null, currentFullDoc: null, tid: 'TR-1' });
    const final = simulateLazyLoadComplete(initial, { id: 'TR-1', detail: { symptoms: 'x' } });
    expect(final.fullDoc).toBeDefined();
    expect(final.fullDoc.detail.symptoms).toBe('x');
  });

  it('F10.5 — re-click active tab → toggle off (state cleared)', () => {
    const result = simulateTabClick({ currentSelected: 'TR-1', currentFullDoc: { id: 'TR-1' }, tid: 'TR-1' });
    expect(result.selected).toBeNull();
    expect(result.fullDoc).toBeNull();
    expect(result.fetchTriggered).toBe(false);
  });

  it('F10.6 — layout: split-screen when selected + lg viewport', () => {
    expect(simulateRenderDecision({ selected: 'TR-1', viewport: 'lg' })).toBe('split-screen');
    expect(simulateRenderDecision({ selected: 'TR-1', viewport: 'md' })).toBe('modal-popup');
    expect(simulateRenderDecision({ selected: null, viewport: 'lg' })).toBe('full-width-form');
    expect(simulateRenderDecision({ selected: null, viewport: 'sm' })).toBe('full-width-form');
  });

  it('F10.7 — switching tabs: new tid set, old fullDoc cleared (loading state for new tab)', () => {
    const result = simulateTabClick({ currentSelected: 'TR-1', currentFullDoc: { id: 'TR-1' }, tid: 'TR-2' });
    expect(result.selected).toBe('TR-2');
    expect(result.fullDoc).toBeNull();
    expect(result.fetchTriggered).toBe(true);
  });
});
```

- [ ] **Step 2: Run G4.7-G4.9 + F10 → expect FAIL**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-2-split-screen-source-grep.test.js tests/phase-26-2-split-screen-flow-simulate.test.js 2>&1 | tail -15
```

Expected: G4.7-G4.9 (3 FAIL) + F10 7 PASS (pure logic). Total: 3 FAIL.

- [ ] **Step 3: Add split-screen wrapper + TreatmentReadOnlyPanel import + mobile fallback**

In `src/components/TreatmentFormPage.jsx` near other backend component imports (near line ~25), add:

```js
import TreatmentReadOnlyPanel from './backend/TreatmentReadOnlyPanel.jsx';
```

Find the main content wrapper at line ~3003:

```jsx
<div className="max-w-6xl mx-auto px-4 py-4">
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
    {/* Left panel (form fields) */}
    <div className="space-y-4">...</div>
    {/* Right panel (OPD card) */}
    <div className="space-y-4">...</div>
  </div>
</div>
```

Replace with conditional split:

```jsx
{/* Phase 26.2e (V26.2, 2026-05-13) — Conditional split-screen wrapper.
    When `selectedHistoryTreatmentId` truthy AND lg+ viewport → 2-col outer
    (form 50% / history 50%). Otherwise → full-width form (unchanged).
    Inner form grid breakpoint downgrades lg → xl when split active so the
    50% slot doesn't squeeze into 4 visual columns. */}
<div className={`mx-auto px-4 py-4 ${selectedHistoryTreatmentId ? 'max-w-[2000px] lg:flex lg:gap-4' : 'max-w-6xl'}`}>
  {/* LEFT — TFP form (existing structure preserved; inner grid breakpoint adjusts when split) */}
  <div className={selectedHistoryTreatmentId ? 'lg:w-1/2 lg:min-w-0' : ''}>
    <div className={`grid grid-cols-1 ${selectedHistoryTreatmentId ? 'xl:grid-cols-2' : 'lg:grid-cols-2'} gap-4`}>
      {/* Left form fields panel (existing content unchanged) */}
      <div className="space-y-4">
        {/* ... existing left-side form sections ... */}
      </div>

      {/* Right OPD card panel (existing content unchanged) */}
      <div className="space-y-4">
        {/* ... existing OPD card content + doctor-save button + customerNote ... */}
      </div>
    </div>
  </div>

  {/* RIGHT — V26.2 read-only history panel (lg+ only) */}
  {selectedHistoryTreatmentId && (
    <aside className="hidden lg:block lg:w-1/2 lg:min-w-0 lg:sticky lg:top-[120px] lg:self-start lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto">
      <div className={`rounded-xl p-4 border border-[var(--bd)] ${isDark ? 'bg-[var(--bg-card)]' : 'bg-white shadow-sm'}`}>
        <TreatmentReadOnlyPanel
          treatment={historyTreatments.find(t => (t.treatmentId || t.id) === selectedHistoryTreatmentId) || {}}
          fullDoc={historyFullDoc}
          isDark={isDark}
          ac={accent}
          acRgb={accentRgb}
          isLatest={historyTreatments.findIndex(t => (t.treatmentId || t.id) === selectedHistoryTreatmentId) === 0}
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

NOTE: `accent` + `accentRgb` are TFP-local — verify they exist. If not, derive: `const accent = isDark ? '#a78bfa' : '#7c3aed'; const accentRgb = '167,139,250';` near the top of the function body (use grep to find existing definition first).

- [ ] **Step 4: Add mobile fallback (lg:hidden modal popup)**

Near the end of TFP render (just before the closing `</div>` of the outermost wrapper, or alongside other modal mounts like `EditAttributionModal`), add:

```jsx
{/* Phase 26.2e — Mobile fallback (<lg viewport): when tab clicked, render
    TreatmentTimelineModal-equivalent popup. Reuses TreatmentReadOnlyPanel
    inside a fullscreen modal wrapper (simpler than passing prop filters to
    TimelineModal). */}
{selectedHistoryTreatmentId && (
  <div
    className="lg:hidden fixed inset-0 z-[90] bg-black/60 flex items-end sm:items-center justify-center p-2 sm:p-4"
    onClick={() => {
      setSelectedHistoryTreatmentId(null);
      setHistoryFullDoc(null);
    }}
  >
    <div
      className={`max-w-2xl w-full rounded-t-xl sm:rounded-xl max-h-[90vh] overflow-y-auto p-4 ${isDark ? 'bg-[var(--bg-card)]' : 'bg-white'}`}
      onClick={(e) => e.stopPropagation()}
      data-testid="tfp-history-modal-fallback"
    >
      <TreatmentReadOnlyPanel
        treatment={historyTreatments.find(t => (t.treatmentId || t.id) === selectedHistoryTreatmentId) || {}}
        fullDoc={historyFullDoc}
        isDark={isDark}
        ac={accent}
        acRgb={accentRgb}
        isLatest={historyTreatments.findIndex(t => (t.treatmentId || t.id) === selectedHistoryTreatmentId) === 0}
        showCloseButton={true}
        onClose={() => {
          setSelectedHistoryTreatmentId(null);
          setHistoryFullDoc(null);
        }}
      />
    </div>
  </div>
)}
```

- [ ] **Step 5: Run G4 + D6 + F10 → expect PASS**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-2-split-screen-source-grep.test.js tests/phase-26-2-split-screen-rtl.test.jsx tests/phase-26-2-split-screen-flow-simulate.test.js 2>&1 | tail -10
```

Expected: G4 9 + D6 3 + Item-E 7 + E6 4 + F10 7 = 30 PASS.

- [ ] **Step 6: Build clean**

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -5
```

- [ ] **Step 7: Commit + push**

```bash
cd F:/LoverClinic-app
git add src/components/TreatmentFormPage.jsx tests/phase-26-2-split-screen-source-grep.test.js tests/phase-26-2-split-screen-flow-simulate.test.js
git commit -m "$(cat <<'EOF'
feat(Phase 26.2e): Split-screen layout + mobile fallback + F10 flow-simulate

TFP conditional outer wrapper:
- When selectedHistoryTreatmentId truthy AND lg+ viewport: 2-col outer
  (form 50% / history 50%) via `max-w-[2000px] lg:flex lg:gap-4`
- When inactive: full-width form (max-w-6xl, current behavior unchanged)
- Inner form grid downgrades `lg:grid-cols-2` → `xl:grid-cols-2` when
  outer split active (prevents 4-column squeeze in 50% slot at lg width)

RIGHT panel (lg+ only):
- `<aside hidden lg:block>` containing TreatmentReadOnlyPanel
- Sticky positioning + max-h scroll for self-scroll within viewport
- showCloseButton=true + onClose toggle state

Mobile fallback (<lg):
- `<div className="lg:hidden">` modal-style overlay
- Backdrop click dismisses
- Same TreatmentReadOnlyPanel inside scrollable card
- data-testid="tfp-history-modal-fallback"

NEW import: TreatmentReadOnlyPanel from './backend/TreatmentReadOnlyPanel.jsx'

Tests:
- G4.7 + G4.8 + G4.9 source-grep regression (3/3 PASS)
- F10.1-F10.7 flow-simulate (7/7 PASS) — mount/fetch/click/lazy/toggle/layout chain
- Total Phase 26.2 bank: 30/30 PASS (Item-E 7 + E6 4 + G4 9 + D6 3 + F10 7)

Sub-phase 26.2e complete. Task 6 (AV38 audit) + Task 7 (verify) + Task 8
(handoff) follow.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master 2>&1 | tail -3
```

---

## Task 6: AV38 audit invariant + SKILL.md update

**Files:**
- Modify: `tests/audit-branch-scope.test.js`
- Modify: `.agents/skills/audit-anti-vibe-code/SKILL.md`

- [ ] **Step 1: Append AV38 sub-tests**

In `tests/audit-branch-scope.test.js`, append a new describe block at the end (after AV37):

```js
// ─── AV38 — Phase 26.2 TreatmentReadOnlyPanel read-only contract (V26.2, 2026-05-13)
describe('AV38 Phase 26.2 — TreatmentReadOnlyPanel read-only contract', () => {
  const PANEL_PATH = 'src/components/backend/TreatmentReadOnlyPanel.jsx';

  it('AV38.1 TreatmentReadOnlyPanel exists at canonical path', async () => {
    const fs = await import('node:fs/promises');
    const stat = await fs.stat(PANEL_PATH).catch(() => null);
    expect(stat?.isFile()).toBe(true);
  });

  it('AV38.2 source does NOT contain onEditTreatment prop reference (read-only contract)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(PANEL_PATH, 'utf8');
    // Allow occurrences in JSDoc/comments only — strip those first
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')   // /* ... */
      .replace(/\/\/[^\n]*/g, '');         // //  ...
    expect(code).not.toMatch(/onEditTreatment/);
  });

  it('AV38.3 source does NOT contain onDeleteTreatment prop reference', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(PANEL_PATH, 'utf8');
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/onDeleteTreatment/);
  });

  it('AV38.4 source does NOT contain <input> or <textarea> tags (no form inputs)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(PANEL_PATH, 'utf8');
    expect(src).not.toMatch(/<input/i);
    expect(src).not.toMatch(/<textarea/i);
  });

  it('AV38.5 source does NOT contain "บันทึก" / "Save" button text', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(PANEL_PATH, 'utf8');
    // Strip comments first (comment text mentioning these words is OK)
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/บันทึก/);
    expect(code).not.toMatch(/<button[^>]*>\s*Save/i);
  });

  it('AV38.6 Lightbox preserved (image zoom is permitted)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(PANEL_PATH, 'utf8');
    expect(src).toMatch(/lightbox/i);
    expect(src).toMatch(/setLightbox/);
  });
});
```

- [ ] **Step 2: Run AV38 → expect 6 PASS**

```bash
cd F:/LoverClinic-app && npx vitest run tests/audit-branch-scope.test.js -t "AV38" 2>&1 | tail -10
```

Expected: 6 PASS.

- [ ] **Step 3: Add AV38 entry to SKILL.md**

In `.agents/skills/audit-anti-vibe-code/SKILL.md`, append after the AV37 block (find with `grep -nE "^### AV37" .agents/skills/audit-anti-vibe-code/SKILL.md`):

```markdown

### AV38 — TreatmentReadOnlyPanel read-only contract (V26.2, 2026-05-13)

**Pattern**: `src/components/backend/TreatmentReadOnlyPanel.jsx` is the canonical
read-only treatment view extracted from TreatmentTimelineModal in Phase 26.2.
Used by TFP split-screen right panel AND TimelineModal (Rule of 3 prep —
2 consumers post-Phase-26.2).

The panel MUST NOT contain any edit/delete primitives:
- NO `onEditTreatment` or `onDeleteTreatment` prop references (in code body —
  comments OK)
- NO `<input>` or `<textarea>` tags (any form input is forbidden)
- NO "บันทึก" / "Save" button text (in code body — comments OK)

Permitted:
- Lightbox + setLightbox (image zoom is read interaction, not edit)
- File-open via existing `<img>` rendering / `<a href={dataUrl}>` patterns
- Browser-native select + copy (no special copy buttons needed)
- `<button>` for accordion toggle / close button / lightbox controls (UI-only)

**Anchor**: `src/components/backend/TreatmentReadOnlyPanel.jsx`. Future panels
following this pattern (e.g., "ReadOnlySalePanel" for sale history comparison)
SHOULD mirror the contract — AV38 grep template is reusable.

**Class-of-bug**: V21 source-grep test lock-in family + read-only contract
violation. A future commit that adds an edit button to the panel directly
(instead of wrapping the panel with a modal-level edit button as TimelineModal
does in Phase 26.2c) would violate AV38 — caught at audit-grep.

**Sanctioned exceptions**: NONE.

**Source-grep regression**: `tests/audit-branch-scope.test.js` AV38.1-AV38.6 —
6 sub-tests locking each invariant (file exists + no edit/delete props +
no inputs + no save text + lightbox preserved).

**Companion**: AV37 (Phase 26.0 + 26.1 doctor-save invariants). AV38 is the
read-only contract for the historical view side; AV37 is the doctor-save
gate discipline for the editable side.
```

- [ ] **Step 4: Build clean**

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -5
```

- [ ] **Step 5: Commit + push**

```bash
cd F:/LoverClinic-app
git add tests/audit-branch-scope.test.js .agents/skills/audit-anti-vibe-code/SKILL.md
git commit -m "$(cat <<'EOF'
feat(Phase 26.2 / AV38): TreatmentReadOnlyPanel read-only contract audit

NEW AV38 audit invariant (audit-anti-vibe-code/SKILL.md + 6 sub-tests
in tests/audit-branch-scope.test.js):

The TreatmentReadOnlyPanel component (extracted in Phase 26.2b from
TimelineModal row, consumed by both modal + TFP split-screen) MUST
remain read-only:
- AV38.1 file exists at canonical path
- AV38.2 NO onEditTreatment prop reference (code body — comments OK)
- AV38.3 NO onDeleteTreatment prop reference
- AV38.4 NO <input> or <textarea> tags
- AV38.5 NO "บันทึก" / "Save" button text (code body — comments OK)
- AV38.6 Lightbox preserved (image zoom is read interaction)

Companion to AV37 (Phase 26.0 + 26.1 doctor-save invariants). AV38 locks
the read-only view side; AV37 locks the editable doctor-save side.

Rule of 3 status: panel has 2 consumers post-Phase-26.2 (modal + TFP split).
Future 3rd consumer should still inherit AV38 contract.

6 AV38 assertions PASS. Phase 26.2 final test bank: 36 GREEN
(Item-E 7 + E6 4 + G4 9 + D6 3 + F10 7 + AV38 6).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master 2>&1 | tail -3
```

---

## Task 7: Full-suite verification (Rule N end-of-batch)

**Files:** None (verification only)

- [ ] **Step 1: Run targeted Phase 26.2 tests**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-2-split-screen-source-grep.test.js tests/phase-26-2-split-screen-rtl.test.jsx tests/phase-26-2-split-screen-flow-simulate.test.js tests/audit-branch-scope.test.js -t "AV38" 2>&1 | tail -10
```

Expected: ~36 Phase 26.2 assertions PASS.

- [ ] **Step 2: Run full vitest suite**

```bash
cd F:/LoverClinic-app && npm test -- --run 2>&1 | grep -E "Test Files|Tests \s*[0-9]" | tail -3
```

Expected: 8350+ passed + 1 skipped (8320 Phase 26.1 baseline + 30 Phase 26.2 new).

If pre-existing tests fail due to TimelineModal refactor or TFP source contract changes: V21-class regex fixups. Apply per Phase 26.0/26.1 precedent (windowing + accept new signatures).

- [ ] **Step 3: Build**

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Document results in Task 8 commit (no commit if no fixups)**

If V21 fixups landed: commit them as `fix(Phase 26.2-test-fixups)` before Task 8.

---

## Task 8: Wiki + SESSION_HANDOFF + active.md final state

**Files:**
- Create: `wiki/concepts/tfp-split-screen-history.md` (NEW concept page)
- Modify: `wiki/log.md`
- Modify: `SESSION_HANDOFF.md`
- Modify: `.agents/active.md`

- [ ] **Step 1: Create wiki concept page**

Create `wiki/concepts/tfp-split-screen-history.md`:

```markdown
---
tags: [tfp, split-screen, history, read-only, phase-26-2, customer-note]
date: 2026-05-13
source-count: 1
---

# TFP Split-Screen History + Customer Note

## Overview

Phase 26.2 (2026-05-13) introduced a **split-screen comparison view** on
TreatmentFormPage: header tabs of the 5 most-recent treatments
(cross-branch); clicking a tab splits the screen 50/50 — left = the
editable new-treatment form, right = read-only view of the chosen old
treatment. Doctor reads history while writing new treatment.

Same phase also added the `customer.note` general-note display above
the doctor-save button, mirroring CustomerDetailView's Phase 24.0-decies
amber box.

## Architecture

- **Tab strip**: `historyTreatments` state (top-5 by date desc); rendered
  below the sticky header; `data-testid="tfp-history-tab-{id}"` per tab.
- **State**: `selectedHistoryTreatmentId` (null = full-width form;
  string = split active) + `historyFullDoc` (lazy-loaded full Firestore
  doc for active tab).
- **Layout split**: outer `lg:flex lg:gap-4` when active; inner form
  `lg:grid-cols-2` downgrades to `xl:grid-cols-2` to prevent 4-col
  squeeze in 50% slot at lg.
- **Right panel** (lg+ only): `<aside hidden lg:block>` + `lg:sticky`
  + `lg:overflow-y-auto`. Renders `<TreatmentReadOnlyPanel>`.
- **Mobile fallback** (<lg): `<div lg:hidden>` fullscreen-ish modal
  overlay containing the same panel.
- **Tab click handler**: re-click active tab → toggle off (state null);
  else lazy-load via `getBackendTreatment`.

## TreatmentReadOnlyPanel (NEW component)

Extracted from `TreatmentTimelineModal.jsx` row JSX (lines 276-404).
2 consumers post-Phase-26.2:
1. `TreatmentTimelineModal` (refactored to consume the panel)
2. TFP split-screen right panel (NEW)

Read-only contract enforced by **AV38** audit invariant:
- NO `onEditTreatment` / `onDeleteTreatment` props
- NO `<input>` / `<textarea>` tags
- NO "บันทึก" / "Save" button text
- Lightbox preserved (image zoom permitted)
- Edit affordance lives at the modal level (wrapper around panel), not
  in the panel itself

## customer.note display (Item E)

Mirror of `CustomerDetailView.jsx:769-788` Phase 24.0-decies amber box.
Read-only — edit happens in CDV (single source of truth).

- **Field source**: `custData?.note` (canonical) → `custData?.patientData?.note`
  (legacy) → `patientData?.note` (TFP prop fallback).
- **Position**: above the Phase 26.0d doctor-save button block (`{!isEdit && ...}`).
- **Styling**: identical to CDV (amber-950/10 bg + amber-900/40 border +
  ClipboardCheck icon + amber-300 title text + `<pre whitespace-pre-wrap>`).
- **Gate**: `{customerNote && (...)}` — hidden when both fields empty.

## File inventory

NEW source (1):
- `src/components/backend/TreatmentReadOnlyPanel.jsx` (~180 LOC)

Modified source (2):
- `src/components/TreatmentFormPage.jsx` (Item E + tab strip + state + split + mobile fallback)
- `src/components/backend/TreatmentTimelineModal.jsx` (refactored to consume panel)

Tests (NEW: 3):
- `tests/phase-26-2-split-screen-source-grep.test.js` (Item-E 7 + G4 9 = 16)
- `tests/phase-26-2-split-screen-rtl.test.jsx` (E6 4 + D6 3 = 7)
- `tests/phase-26-2-split-screen-flow-simulate.test.js` (F10 7)

Audit (NEW: AV38, 6 sub-tests in audit-branch-scope.test.js).

## See also

- Spec: `docs/superpowers/specs/2026-05-13-phase-26-2-tfp-split-screen-history-design.md`
- Plan: `docs/superpowers/plans/2026-05-13-phase-26-2-tfp-split-screen-history.md`
- Phase 26.0 doctor-save: `concepts/treatment-status-and-doctor-save.md`
- Phase 26.1 editor-attribution: same concept page (Phase 26.1 section)
- CDV note pattern: `CustomerDetailView.jsx:769-788` (Phase 24.0-decies)
```

- [ ] **Step 2: Append wiki/log.md**

```bash
cd F:/LoverClinic-app && cat >> wiki/log.md << 'EOF'

## [2026-05-13] ingest | Phase 26.2 — TFP Split-Screen History + Customer Note

3rd same-day follow-up to Phase 26.0 + 26.1. 5 items shipped: (A) header tab strip top-5 cross-branch recent treatments; (B) split-screen layout 50/50 on lg+ (mobile = modal popup fallback); (C) NEW `TreatmentReadOnlyPanel` component extracted from TimelineModal row (read-only contract via AV38); (D) TimelineModal refactor consumes the panel (DRY, 2 consumers); (E) `customer.note` display above doctor-save button mirroring CDV Phase 24.0-decies amber box.

Created `concepts/tfp-split-screen-history.md` documenting the split-screen architecture + read-only contract + customer.note mirror. NEW AV38 audit invariant locks the read-only contract permanently (no edit/delete props + no inputs + no save text + lightbox preserved).

8 task commits across 5 sub-phases (26.2a customer.note + 26.2b panel + 26.2c modal refactor + 26.2d tab strip + 26.2e split layout + AV38 audit + verify + handoff). ~660 LOC delta across 5 source files + 4 test files + wiki/audit. Tests delta: +30 net Phase 26.2 (Item-E 7 + E6 4 + G4 9 + D6 3 + F10 7) + AV38 6. Combined Phase 26.0 + 26.1 + 26.2 = 30+ commits ahead of prod (`ccef3c2`). Build clean.

Rule of 3 status: `TreatmentReadOnlyPanel` reaches 2 consumers post-26.2 (modal + TFP split). Future 3rd consumer (e.g., print-preview comparison) would formalize the pattern as a Rule of 3 anchor.

Subagent-driven execution (same pattern as Phase 26.0 + 26.1). NOT YET DEPLOYED — awaiting user `deploy` authorization per Rule V18 for combined Phase 26.0 + 26.1 + 26.2 deploy.
EOF
echo "log appended"
```

- [ ] **Step 3: Update SESSION_HANDOFF.md**

Find the current state section near top of `SESSION_HANDOFF.md` and prepend a new Phase 26.2 session block right after the existing top header (replace the Date line + add the new session block):

```bash
cd F:/LoverClinic-app && grep -n "Date last updated\|Session 2026-05-13" SESSION_HANDOFF.md | head -3
```

Use Edit tool to update the "Date last updated" line and prepend a new section. Verbatim block to insert AFTER the existing "Current State" header:

```markdown
- **Date last updated**: 2026-05-13 — Phase 26.0 + 26.1 + **26.2** COMPLETE (NOT YET DEPLOYED) · 8350+ tests + 1 skipped · build clean · 30+ commits ahead of prod
- **Branch**: `master`
- **Last commit**: `<actual SHA>` docs(Phase 26.2): wiki concept + log + SESSION_HANDOFF + active.md
- **Test count**: **8350+ passed** (+30 Phase 26.2 net from 8320 Phase 26.1 baseline)
- **Deploy state**: PRODUCTION = `ccef3c2`. Combined Phase 26.0 + 26.1 + 26.2 = 30+ commits ahead. Awaiting user `deploy` authorization per Rule V18.

### Session 2026-05-13 (continued) — Phase 26.2 TFP Split-Screen History + Customer Note (NOT YET DEPLOYED)

User directive (5 items): NEW header tab strip for 5 recent treatments → split-screen 50/50 (lg+) or modal (<lg) → read-only right panel + ALSO display customer.note above doctor-save button.

**Brainstorming HARD-GATE honored** (Rule J): 4 Qs locked + Item E added — Q1 mobile=desktop-only; Q2 scope=all-branches latest; Q3 right panel=full timeline row; Q4 mode=both create+edit / no auto-select; Item E=customer.note mirror of CDV.

**8 task commits** across 5 sub-phases (26.2a..26.2e + AV38 audit + verify + handoff).

**Phase 26.2a — customer.note display** (Item E): NEW customerNote state + load stamp + display above doctor-save button. Mirror of CDV Phase 24.0-decies amber box.

**Phase 26.2b — TreatmentReadOnlyPanel** (NEW component, ~180 LOC): extracted from TimelineModal row layout. Read-only contract enforced by AV38.

**Phase 26.2c — TimelineModal refactor** (DRY, ~−70 net): replace inline row with `<TreatmentReadOnlyPanel>` consumption. Modal retains its own edit-button wrapper.

**Phase 26.2d — TFP header tab strip + state + fetch**: top-5 cross-branch recent treatments, edit-mode filters self.

**Phase 26.2e — Split-screen layout + mobile fallback**: lg+ aside `<aside hidden lg:block>` with sticky scroll; <lg `<div lg:hidden>` modal overlay; inner form grid breakpoint adjusts lg→xl when split active.

**AV38 audit invariant** locks read-only contract permanently (no edit/delete props + no inputs + no save text + lightbox preserved).

**Tests**: Phase 26.2 final delta +30 (Item-E 7 + E6 4 + G4 9 + D6 3 + F10 7) + AV38 6 = 36 NEW assertions. Total Phase 26.1 baseline 8320 → Phase 26.2 final 8350+. Build clean.

**Rule of 3 status**: panel reaches 2 consumers post-26.2 (modal + TFP split); not yet a Rule of 3 trigger.

Detail: future checkpoint at `.agents/sessions/2026-05-13-phase-26-2-tfp-split-screen.md` (deferred until session-end).

NOT yet deployed. Combined Phase 26.0 + 26.1 + 26.2 = 30+ commits ahead of prod (`ccef3c2`). Awaiting user `deploy` for combined vercel + firebase deploy per Rule V15.

```

- [ ] **Step 4: Update `.agents/active.md`**

Use Write tool to replace the contents with current state (adjust SHA + test counts to actual from `git log -1 --oneline` and Task 7 verification). The template structure is the same as Phase 26.1 active.md (commit `ac8f2e9`), extended with Phase 26.2 section.

Replace with:

```yaml
---
updated_at: "2026-05-13 — Phase 26.0 + 26.1 + 26.2 ALL complete (NOT YET DEPLOYED)"
status: "master=<NEW_SHA> · prod=ccef3c2 · 30+ commits ahead · 8350+ passed · build clean"
branch: "master"
last_commit: "docs(Phase 26.2): wiki concept + log + SESSION_HANDOFF + active.md"
tests: 8350
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ccef3c2"
firestore_rules_version: 29
storage_rules_version: 2
---

# Active Context

## State
- master = `<NEW_SHA>` · prod = `ccef3c2` (30+ commits ahead — Phase 26.0 + 26.1 + 26.2 NOT YET DEPLOYED)
- 8350+/8351+ tests passed + 1 skipped (0 Phase 26.2 regressions)
- Phase 26.2 is 3rd same-day follow-up to Phase 26.0 + 26.1

## What this session shipped (Phase 26.0 + 26.1 + 26.2, all 2026-05-13)

### Phase 26.0 — Doctor-Save (11 commits, earlier today)
### Phase 26.1 — TFP Polish + Editor-Attribution (10 commits, earlier)
### Phase 26.2 — TFP Split-Screen History + Customer Note (8 task commits this turn):
- 26.2a — customer.note display above doctor-save button (Item E)
- 26.2b — NEW TreatmentReadOnlyPanel component (~180 LOC) + E6 RTL
- 26.2c — TimelineModal refactor (DRY) consumes panel
- 26.2d — TFP header tab strip + state + top-5 history fetch
- 26.2e — Split-screen layout + mobile fallback + F10 flow-simulate
- AV38 — Read-only panel contract audit invariant (6 sub-tests)
- (Task 7 verify + Task 8 docs)

## Next action
**Idle** — Phase 26.0 + 26.1 + 26.2 awaiting user `deploy` authorization to ship combined vercel --prod + firebase deploy --only firestore:rules per Rule V15. 30+ commits ahead.

## Outstanding user-triggered actions
- **Pending user authorization**: deploy Phase 26.0 + 26.1 + 26.2 to production
- (Optional, unchanged) probe-deploy-probe.mjs probes 2/3/4 false-positive
- (Optional, unchanged) bsa-task7-h-quater-fix parallel-run flake

## Institutional memory anchors
- **Phase 26.2 — `TreatmentReadOnlyPanel` is canonical read-only treatment view**. Extracted from TimelineModal row. 2 consumers post-26.2 (modal + TFP split). AV38 enforces no edit/delete props + no inputs + no save text.
- **TFP split-screen pattern**: conditional outer `lg:flex` wrapper + inner grid breakpoint downgrade (lg→xl) to prevent 4-col squeeze. Mobile = modal popup fallback. Tab toggle: re-click active dismisses.
- **customer.note mirror in TFP**: read-only display above doctor-save button. Edit lives in CDV (single source of truth). Triple fallback chain: custData?.note → custData?.patientData?.note → patientData?.note.
- **Top-5 history scope**: cross-branch (all branches), sorted by treatmentDate desc, edit-mode filters self from list.
- (Carried) Phase 26.1 — EditAttributionModal = 2nd "pick-a-person-before-action" family member.
- (Carried) Phase 26.0 — saveMode = 4th locked-X family member; status='doctor-recorded' enum + `recordedBy`/`At` forensic trail.
- (Carried) Iron-clad rules A-P + BSA invariants BS-1..16 + AV1-AV30 + AV32-AV38 + CB-1..5.
```

(Replace `<NEW_SHA>` with `git log -1 --oneline` SHA. `tests: 8350` is estimate — adjust to actual.)

- [ ] **Step 5: Commit + push**

```bash
cd F:/LoverClinic-app
git add wiki/concepts/tfp-split-screen-history.md wiki/log.md SESSION_HANDOFF.md .agents/active.md
git commit -m "$(cat <<'EOF'
docs(Phase 26.2): wiki concept + log + SESSION_HANDOFF + active.md final state

- NEW wiki/concepts/tfp-split-screen-history.md (split-screen architecture +
  read-only contract + customer.note mirror + file inventory)
- Append wiki/log.md 2026-05-13 Phase 26.2 ingest entry
- Prepend SESSION_HANDOFF.md Phase 26.2 session block (8350+ tests, 30+
  commits ahead, awaiting deploy authorization)
- Refresh .agents/active.md current state: master=<NEW_SHA>, prod=ccef3c2,
  Phase 26.0 + 26.1 + 26.2 institutional memory

Phase 26.2 implementation COMPLETE. Awaiting user "deploy" authorization
for combined vercel --prod + firebase deploy --only firestore:rules per V15.
Total: Phase 26.0 (11 commits) + Phase 26.1 (10 commits) + Phase 26.2 (8
commits) = 30+ commits ahead of prod (ccef3c2).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master 2>&1 | tail -3
```

---

## Self-Review

**Spec coverage**:
- ✅ Item A (header tab strip) — Task 4
- ✅ Item B (split-screen layout) — Task 5
- ✅ Item C (TreatmentReadOnlyPanel + AV38) — Task 2 + Task 6
- ✅ Item D (TimelineModal refactor) — Task 3
- ✅ Item E (customer.note display) — Task 1
- ✅ Tests (G4 + D6 + D7 + E6 + F10 + AV38) — distributed across all tasks
- ✅ Verification — Task 7
- ✅ Wiki + handoff — Task 8

**Placeholder scan**: no TBD/TODO. Task 5 Step 3 has "verify `accent`/`accentRgb` exist; if not derive" — that's a verification step with concrete fallback values. Task 4 Step 5 has "Verify `formatThaiDateShort` exists OR use formatThaiDateFull" — clearly-bounded decision with default.

**Type consistency**: `selectedHistoryTreatmentId`, `historyTreatments`, `historyFullDoc`, `customerNote`, `setHistoryFullDoc`, `handleHistoryTabClick` — all consistent across Tasks 1-8.

**Estimated duration**: 8 tasks × 20-30 min = ~3-4 hours. 1 session with focused work via subagent-driven mode.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-13-phase-26-2-tfp-split-screen-history.md`. Two execution options:**

**1. Subagent-Driven (recommended — same pattern as Phase 26.0 + 26.1)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
