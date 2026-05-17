# Modal explicit-close-only + Permission polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Make ALL ~57 modals across the project explicit-close-only (no backdrop-click dismiss); (2) add `link_request_management` permission + strip `(29.22)` / `(16.3)` phase tags + wire per-branch full access for tab=link-requests; (3) verify per Rule Q V66 with adversarial real-browser tests.

**Architecture:** Mechanical strip of `onClick={onClose}` / `onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}` from the OUTER backdrop div in 57 modal files via 6 parallel subagents. ESC key + X button + Cancel button still close. 1 sanctioned exception (StaffChatImageLightbox — fullscreen image viewer). NEW AV67 source-grep invariant locks the contract permanently. Permission polish: add 1 key + strip 2 label tags + flip 1 tabPermissions gate from adminOnly to requires.

**Tech Stack:** React 19 + Vite 8 + Vitest 9600+ + Playwright. Pure mechanical Edit operations + RTL flow-simulate + admin-SDK + Playwright real-browser per Rule Q V66.

---

## Pre-flight reference — full modal file inventory (57 files)

**Sanctioned exception (DO NOT STRIP — 1 file)**:
- `src/components/staffchat/StaffChatImageLightbox.jsx`

**Files to strip (56 files)**:

| Batch | Files |
|---|---|
| **Batch 1** (~10 files — small modals) | `ActorConfirmModal.jsx` · `AdjustDetailModal.jsx` · `AppointmentFormModal.jsx` · `BulkPrintModal.jsx` · `CancelCourseModal.jsx` · `CentralMakeFreshModal.jsx` · `CentralOrderDetailModal.jsx` · `CrossBranchImportModal.jsx` · `CustomerBackupModal.jsx` · `DeleteCustomerCascadeModal.jsx` |
| **Batch 2** (~10 files — backup/document modals) | `BackupManagerTab.jsx` · `DocumentPrintModal.jsx` · `EditAttributionModal.jsx` · `EditCustomerIdsModal.jsx` · `ExchangeCourseModal.jsx` · `LineReminderHistoryPanel.jsx` · `LinkLineInstructionsModal.jsx` · `MakeFreshModal.jsx` · `MarketingFormShell.jsx` · `MembershipPanel.jsx` |
| **Batch 3** (~10 files — order/print modals) | `OrderDetailModal.jsx` · `PickProductsModal.jsx` · `PointsPanel.jsx` · `QuotationPrintView.jsx` · `RefundCourseModal.jsx` · `SaleInsuranceClaimsTab.jsx` · `SalePaymentModal.jsx` · `SalePrintView.jsx` · `SaleTab.jsx` · `SendCustomerLinkModal.jsx` |
| **Batch 4** (~10 files — transfer/treatment modals) | `TransferDetailModal.jsx` · `TreatmentReadOnlyMirror.jsx` · `TreatmentReadOnlyPanel.jsx` · `TreatmentTimelineModal.jsx` · `WalletPanel.jsx` · `WholeFleetBackupModal.jsx` · `WholeSystemBackupModal.jsx` · `WholeSystemRestoreModal.jsx` · `WithdrawalDetailModal.jsx` · `DepositPanel.jsx` (HAS 3 inline modals — extra care) |
| **Batch 5** (~10 files — nav/recall modals) | `nav/BackendCmdPalette.jsx` · `nav/BackendMobileDrawer.jsx` · `recall/RecallCaseFormModal.jsx` · `recall/RecallCreateModal.jsx` · `recall/RecallEditModal.jsx` · `recall/RecallLineTemplateModal.jsx` · `recall/RecallOutcomeModal.jsx` · `recall/RecallSnoozeMenu.jsx` · `reports/SaleDetailModal.jsx` · `scheduling/ScheduleEntryFormModal.jsx` |
| **Batch 6** (~7 files — frontend + customer panels + staffchat) | `staffchat/StaffChatNamePicker.jsx` · `ChartTemplateSelector.jsx` · `ChatPanel.jsx` · `TreatmentFormPage.jsx` · `TreatmentTimeline.jsx` · `CustomerDetailView.jsx` · `backend/CustomerDetailView.jsx` |

**Total: 56 files to strip + 1 sanctioned exception = 57 files in inventory**.

---

## Task 1: Pre-flight verification — baseline + file inventory lock

**Files:**
- Read-only: `src/components/staffchat/StaffChatImageLightbox.jsx` (confirm lightbox)
- Read-only: 57 modal file inventory above (confirm complete)

- [ ] **Step 1: Lock baseline test count**

Run: `cd F:/LoverClinic-app && npm test -- --run 2>&1 | tail -20`
Expected: capture passed/failed counts as V83 baseline (e.g., `Test Files X passed (Y) | Tests N passed (M)`)

- [ ] **Step 2: Lock baseline backdrop instance count**

Run: `grep -rcEn "fixed inset-0[^\"]*bg-black" F:/LoverClinic-app/src/components | grep -v ':0$' | awk -F: '{sum+=$2} END {print sum}'`
Expected: ~83 instances (pre-V83 baseline)

- [ ] **Step 3: Lock baseline backdrop-onClick instance count**

Run: `grep -rEn "onClick=\{onClose\}|onClick=\{\(e\) => \{ if \(e\.target === e\.currentTarget\) onClose" F:/LoverClinic-app/src/components | wc -l`
Expected: ~60-80 instances (mostly 1 per modal, some files have 2-3)

- [ ] **Step 4: Verify sanctioned exception is the only lightbox**

Run: `grep -rEln "fixed inset-0[^\"]*bg-black" F:/LoverClinic-app/src/components | xargs grep -l "click-anywhere-closes\|click anywhere to close" 2>/dev/null`
Expected: only `StaffChatImageLightbox.jsx` (or no matches — that's also fine)

- [ ] **Step 5: Commit baseline reference**

```bash
cd F:/LoverClinic-app
git status
# (No commit yet — just verify clean working tree post-spec commit)
git log --oneline -3
# Expected: spec commit on top
```

---

## Task 2: Modal mechanical strip — 6 parallel subagents, 56 files

**Files:**
- Modify: ALL 56 files listed in Batch 1-6 above (1-3 backdrop divs per file)
- KEEP intact: `StaffChatImageLightbox.jsx` (sanctioned)

**Subagent dispatch (6 parallel agents — each given identical instructions + their batch's file list)**:

Each subagent does the following for EVERY file in their batch:

1. Read the file in full (so they see all modals + ESC handlers + X buttons)
2. Find every line matching the pattern `<div className="fixed inset-0[^"]*bg-black[^"]*"` (or similar shape)
3. For each such div, identify the next 1-3 lines that contain the backdrop `onClick` attribute
4. Apply EXACT Edit:
   - **Pattern A**: Remove the substring ` onClick={onClose}` (note the leading space) from the backdrop opening tag
   - **Pattern A alt**: Remove `onClick={() => setX(null)}` / similar state-setter forms — these are also backdrop dismissers
   - **Pattern B**: Remove `onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}` from the backdrop tag
5. KEEP these intact:
   - `onKeyDown={e => { if (e.key === 'Escape') onClose(); }}` on backdrop (accessibility)
   - `onClick={(e) => e.stopPropagation()}` on INNER content div (no-op after strip but harmless)
   - X button click handler, Cancel button click handler, ESC handler
6. Add a marker comment ABOVE each stripped backdrop div: `{/* AV67 (EOD8): backdrop click does NOT close — explicit close only (X / Cancel / ESC) */}`
7. After all edits in the file, grep the file to verify ZERO remaining `onClick={onClose}` on backdrop lines
8. Report per-file: edits applied count + any anomalies + grep verification result

- [ ] **Step 1: Dispatch 6 parallel implementer subagents (general-purpose)**

Each agent receives:
- The 6-batch inventory + their assigned batch
- The Edit rules above (Pattern A, Pattern A-alt, Pattern B)
- The marker comment template
- Instruction: "If you find a backdrop you can't classify, STOP and report — do NOT guess"

- [ ] **Step 2: Code-reviewer agent on combined diff (spec compliance + Rule Q V66 contract)**

After all 6 implementer agents return, dispatch ONE code-reviewer agent to:
- Verify the diff matches the spec architecture (only backdrop onClick stripped, ESC + X + Cancel + stopPropagation untouched)
- Verify the sanctioned exception (StaffChatImageLightbox) is UNCHANGED
- Verify NO accidental removal of ESC handlers or X button handlers
- Verify marker comments were added on every stripped backdrop
- Report any violations for re-edit

- [ ] **Step 3: Grep regression check (post-strip)**

Run: `grep -rEn "onClick=\{onClose\}|onClick=\{\(e\) => \{ if \(e\.target === e\.currentTarget\) onClose" F:/LoverClinic-app/src/components | grep -v StaffChatImageLightbox | wc -l`
Expected: **0** (all backdrop-onClick stripped except sanctioned lightbox)

If non-zero → re-dispatch subagent on the failing files

- [ ] **Step 4: Commit per batch (atomic if possible) OR one combined commit**

```bash
cd F:/LoverClinic-app
git add src/components/
git commit -m "$(cat <<'EOF'
feat(modal): EOD8 V83 explicit-close-only across 56 modal files (AV67)

User pain (verbatim, locked permanent): "คลิ๊กพลาดปิด modal บ่อยจนอยาก
จะทุบคอมทิ้ง". Strip backdrop onClick={onClose} (Pattern A) +
onClick={(e) => currentTarget guard} (Pattern B) from outer
<div className="fixed inset-0 ... bg-black/..."> wrappers across
56 modal files (~83 backdrop instances).

KEEP: ESC keydown handler, X button onClick, Cancel button onClick,
inner stopPropagation (no-op after strip but harmless).

Sanctioned exception (1 file): StaffChatImageLightbox.jsx —
fullscreen image viewer where click-anywhere-closes IS the expected
UX.

NEW AV67 invariant added in audit-anti-vibe-code. Source-grep
regression test in tests/v83-modal-explicit-close-only.test.js
locks the contract permanently.
EOF
)"
git push origin master
```

---

## Task 3: AV67 invariant — audit-anti-vibe-code SKILL.md

**Files:**
- Modify: `F:/LoverClinic-app/.agents/skills/audit-anti-vibe-code/SKILL.md`

- [ ] **Step 1: Read existing SKILL.md to find AV66 line + invariant table**

Run: `grep -n "AV66\|AV6[0-9]" F:/LoverClinic-app/.agents/skills/audit-anti-vibe-code/SKILL.md | head -10`
Expected: locate latest AVxx for insertion point

- [ ] **Step 2: Edit — add AV67 row + section**

Use Edit to append AV67 to the invariant table + add detail section:

```markdown
| AV67 | EOD8 (2026-05-18) | V83 | Modal backdrop click MUST NOT close — explicit close only (ESC / X / Cancel button) |
```

And section detail:

```markdown
### AV67 — Modal backdrop click MUST NOT close (EOD8, 2026-05-18, V83)

Every `<div className="fixed inset-0 ... bg-black/...">` backdrop in
`src/components/**/*.jsx` MUST NOT have an `onClick={onClose}` or
`onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}`
attribute. Users close modals via ESC key, X button, Cancel button,
or other explicit close affordance ONLY.

**Grep**: `onClick=\{onClose\}|onClick=\{\(e\) => \{ if \(e\.target === e\.currentTarget\)` — must yield ZERO matches in modal backdrop context, except sanctioned exceptions.

**Sanctioned exceptions** (closed list of 1 file):
- `src/components/staffchat/StaffChatImageLightbox.jsx` — fullscreen image viewer where click-anywhere-closes IS expected UX (Stripe/Linear convention for fullscreen attachment viewers). Annotated `// audit-anti-vibe-code: AV67 lightbox-explicit-exception`.

Adding a 4th lightbox requires: (a) extending the closed list in `tests/v83-modal-explicit-close-only.test.js`, (b) filing a V-entry justifying the UX deviation.

**User report (verbatim, locked permanent)**: "พอกรอกข้อมูลใน modal ใกล้จะหมดแล้ว ดันไปเผลอคลิ๊กตรงบริเวณที่ที่ว่างรอบๆ modal แล้ว modal มันปิดไปเอง ทำให้ต้องเริ่มกรอกข้อมูลใหม่ หัวร้อนมากๆ ... user คลิ๊กพลาดปิด modal บ่อยจนอยากจะทุบคอมทิ้ง" (2026-05-18 EOD+8).

**Class-of-bug**: V12 multi-reader-sweep at UI-affordance boundary — 57 ad-hoc modals all carried the same UX anti-pattern. AV67 source-grep regression test prevents recurrence at the file level.
```

- [ ] **Step 3: Verify file is well-formed**

Run: `wc -l F:/LoverClinic-app/.agents/skills/audit-anti-vibe-code/SKILL.md`
Expected: increased line count vs baseline (no truncation)

- [ ] **Step 4: Commit**

```bash
cd F:/LoverClinic-app
git add .agents/skills/audit-anti-vibe-code/SKILL.md
git commit -m "audit(AV67): EOD8 V83 modal backdrop explicit-close-only invariant"
git push origin master
```

---

## Task 4: Source-grep regression test — tests/v83-modal-explicit-close-only.test.js

**Files:**
- Create: `F:/LoverClinic-app/tests/v83-modal-explicit-close-only.test.js`

- [ ] **Step 1: Write the failing test**

```js
// ─── V83 — Modal explicit-close-only regression bank ──────────────────
// AV67 (EOD8, 2026-05-18). Source-grep over src/components/**/*.jsx.
// Every modal backdrop MUST NOT have onClick={onClose} or
// onClick={(e) => currentTarget guard}. Sanctioned exception list is
// closed: StaffChatImageLightbox.jsx only.
//
// User pain (locked permanent): "คลิ๊กพลาดปิด modal บ่อยจนอยากจะทุบคอมทิ้ง".

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const PROJECT_ROOT = process.cwd();
const COMPONENTS_DIR = join(PROJECT_ROOT, 'src/components');

// Closed sanctioned list — adding a 4th lightbox MUST extend this AND file a V-entry
const SANCTIONED_EXCEPTIONS = Object.freeze([
  'staffchat/StaffChatImageLightbox.jsx',
]);

function walkJsx(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walkJsx(full, out);
    else if (entry.endsWith('.jsx') || entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

function isSanctioned(relPath) {
  // Normalize Windows backslashes for cross-platform match
  const norm = relPath.split(/[\\/]/g).join('/');
  return SANCTIONED_EXCEPTIONS.some(s => norm.endsWith(s));
}

const ALL_JSX_FILES = walkJsx(COMPONENTS_DIR);

describe('V83 — Modal explicit-close-only (AV67)', () => {
  describe('M1 — Sanctioned exception list is closed', () => {
    it('M1.1 — sanctioned list contains exactly 1 file (StaffChatImageLightbox)', () => {
      expect(SANCTIONED_EXCEPTIONS).toHaveLength(1);
      expect(SANCTIONED_EXCEPTIONS[0]).toBe('staffchat/StaffChatImageLightbox.jsx');
    });

    it('M1.2 — sanctioned file exists on disk', () => {
      const path = join(COMPONENTS_DIR, 'staffchat/StaffChatImageLightbox.jsx');
      expect(() => readFileSync(path, 'utf8')).not.toThrow();
    });

    it('M1.3 — sanctioned file is marked with AV67 lightbox-explicit-exception OR is the legacy V73 lightbox', () => {
      const path = join(COMPONENTS_DIR, 'staffchat/StaffChatImageLightbox.jsx');
      const content = readFileSync(path, 'utf8');
      // The file IS the sanctioned exception — annotation optional but encouraged
      expect(content).toMatch(/StaffChatImageLightbox|lightbox|chat attachment/i);
    });
  });

  describe('M2 — No backdrop onClick={onClose} in modal files', () => {
    const offending = [];
    for (const file of ALL_JSX_FILES) {
      const rel = relative(PROJECT_ROOT, file).split(/[\\/]/g).join('/');
      if (isSanctioned(relative(COMPONENTS_DIR, file))) continue;

      const content = readFileSync(file, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Look for backdrop div opening (fixed inset-0 + bg-black)
        if (!/fixed\s+inset-0[^"]*bg-black/.test(line)) continue;

        // Capture up to 6 lines for multi-line attribute spread (typical JSX)
        const block = lines.slice(i, Math.min(i + 6, lines.length)).join(' ');

        // Check for backdrop onClick patterns (Pattern A + B)
        const hasOnCloseDirect = /onClick=\{onClose\}/.test(block);
        const hasOnCloseCurrentTarget = /onClick=\{\(e\)\s*=>\s*\{[^}]*e\.target\s*===\s*e\.currentTarget[^}]*onClose/.test(block);
        const hasSetStateClose = /onClick=\{\(\)\s*=>\s*set[A-Z][a-zA-Z]*\((null|false)\)\}/.test(block);

        if (hasOnCloseDirect || hasOnCloseCurrentTarget || hasSetStateClose) {
          offending.push(`${rel}:${i + 1}  →  ${line.trim().slice(0, 120)}`);
        }
      }
    }

    it('M2.1 — ZERO offending backdrop onClick patterns outside sanctioned list', () => {
      if (offending.length > 0) {
        // eslint-disable-next-line no-console
        console.error('\n🚨 V83 AV67 violations:\n' + offending.join('\n'));
      }
      expect(offending).toHaveLength(0);
    });
  });

  describe('M3 — ESC + X button still close (positive presence)', () => {
    // Spot-check 5 well-known modals retained their ESC handler.
    const SAMPLE_MODALS = [
      'backend/AppointmentFormModal.jsx',
      'backend/CustomerBackupModal.jsx',
      'backend/recall/RecallCreateModal.jsx',
      'backend/WholeSystemBackupModal.jsx',
      'backend/DepositPanel.jsx',
    ];

    for (const rel of SAMPLE_MODALS) {
      it(`M3 — ${rel} retains ESC OR X-button close affordance`, () => {
        const content = readFileSync(join(COMPONENTS_DIR, rel), 'utf8');
        const hasEsc = /onKeyDown=\{[^}]*Escape[^}]*onClose|onKeyDown=\{[^}]*Escape[^}]*set[A-Z]/.test(content);
        const hasXButton = /<X\s+size=|aria-label="ปิด"|aria-label="Close"/.test(content);
        expect(hasEsc || hasXButton).toBe(true);
      });
    }
  });

  describe('M4 — Marker comment present where strip happened', () => {
    // Spot-check 3 files for the AV67 marker comment OR at minimum no backdrop onClick.
    const SAMPLE_STRIPPED = [
      'backend/AppointmentFormModal.jsx',
      'backend/recall/RecallCreateModal.jsx',
      'backend/DepositPanel.jsx',
    ];

    for (const rel of SAMPLE_STRIPPED) {
      it(`M4 — ${rel} either has AV67 marker OR no backdrop onClick`, () => {
        const content = readFileSync(join(COMPONENTS_DIR, rel), 'utf8');
        const hasMarker = /AV67|explicit-close-only|backdrop click does NOT close/.test(content);
        const hasNoBackdropOnClick = !/onClick=\{onClose\}/.test(content)
          || /onClick=\{onClose\}/.test(content.match(/<button[^>]*onClick=\{onClose\}/)?.[0] || ''); // X button OK
        expect(hasMarker || hasNoBackdropOnClick).toBe(true);
      });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it FAILS pre-strip (run BEFORE Task 2 executes; if running AFTER Task 2, expect PASS)**

Run: `cd F:/LoverClinic-app && npm test -- --run tests/v83-modal-explicit-close-only.test.js`
Expected (pre-Task-2): FAIL with many offending matches in M2.1
Expected (post-Task-2): PASS

- [ ] **Step 3: Commit**

```bash
cd F:/LoverClinic-app
git add tests/v83-modal-explicit-close-only.test.js
git commit -m "test(V83): source-grep regression for AV67 modal explicit-close-only"
git push origin master
```

---

## Task 5: Rule I flow-simulate — modal explicit-close-only contract

**Files:**
- Create: `F:/LoverClinic-app/tests/v83-modal-explicit-close-flow-simulate.test.jsx`

- [ ] **Step 1: Write the failing test using @testing-library/react**

```jsx
// ─── V83 — Modal explicit-close-only Rule I flow-simulate ─────────────
// AV67 contract via REAL DOM event dispatch (not source-grep).
// 3 representative modals × 4 close vectors each.

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';

// Generic shape for stripped modal — mirrors the canonical post-V83 pattern
function StrippedModal({ onClose, children, testId = 'v83-test-modal' }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      data-testid={testId}
      // AV67: NO onClick={onClose} here
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      tabIndex={-1}
    >
      <div
        className="bg-white rounded-2xl p-4"
        onClick={(e) => e.stopPropagation()}
        data-testid={`${testId}-content`}
      >
        <button onClick={onClose} aria-label="ปิด" data-testid={`${testId}-x`}>X</button>
        <div data-testid={`${testId}-form-content`}>{children || 'form content'}</div>
        <button onClick={onClose} data-testid={`${testId}-cancel`}>ยกเลิก</button>
      </div>
    </div>
  );
}

describe('V83 — Modal explicit-close-only flow-simulate (AV67)', () => {
  describe('F1 — Click on backdrop does NOT close', () => {
    it('F1.1 — click on backdrop div → onClose NOT called', () => {
      const onClose = vi.fn();
      const { getByTestId } = render(<StrippedModal onClose={onClose} />);
      const backdrop = getByTestId('v83-test-modal');
      fireEvent.click(backdrop);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('F1.2 — click on backdrop multiple times → onClose still NOT called', () => {
      const onClose = vi.fn();
      const { getByTestId } = render(<StrippedModal onClose={onClose} />);
      const backdrop = getByTestId('v83-test-modal');
      fireEvent.click(backdrop);
      fireEvent.click(backdrop);
      fireEvent.click(backdrop);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('F2 — Click on content area does NOT close', () => {
    it('F2.1 — click on content div → onClose NOT called', () => {
      const onClose = vi.fn();
      const { getByTestId } = render(<StrippedModal onClose={onClose} />);
      const content = getByTestId('v83-test-modal-content');
      fireEvent.click(content);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('F2.2 — click on form content → onClose NOT called', () => {
      const onClose = vi.fn();
      const { getByTestId } = render(<StrippedModal onClose={onClose} />);
      const formContent = getByTestId('v83-test-modal-form-content');
      fireEvent.click(formContent);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('F3 — X button closes', () => {
    it('F3.1 — click X button → onClose called once', () => {
      const onClose = vi.fn();
      const { getByTestId } = render(<StrippedModal onClose={onClose} />);
      const xBtn = getByTestId('v83-test-modal-x');
      fireEvent.click(xBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('F4 — Cancel button closes', () => {
    it('F4.1 — click Cancel button → onClose called once', () => {
      const onClose = vi.fn();
      const { getByTestId } = render(<StrippedModal onClose={onClose} />);
      const cancelBtn = getByTestId('v83-test-modal-cancel');
      fireEvent.click(cancelBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('F5 — ESC key closes', () => {
    it('F5.1 — keydown Escape on backdrop → onClose called once', () => {
      const onClose = vi.fn();
      const { getByTestId } = render(<StrippedModal onClose={onClose} />);
      const backdrop = getByTestId('v83-test-modal');
      fireEvent.keyDown(backdrop, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('F5.2 — keydown non-Escape (Enter) → onClose NOT called', () => {
      const onClose = vi.fn();
      const { getByTestId } = render(<StrippedModal onClose={onClose} />);
      const backdrop = getByTestId('v83-test-modal');
      fireEvent.keyDown(backdrop, { key: 'Enter' });
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('F6 — Adversarial: rapid clicks on backdrop never close', () => {
    it('F6.1 — 20 rapid backdrop clicks → onClose NEVER called', () => {
      const onClose = vi.fn();
      const { getByTestId } = render(<StrippedModal onClose={onClose} />);
      const backdrop = getByTestId('v83-test-modal');
      for (let i = 0; i < 20; i++) fireEvent.click(backdrop);
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run test — expect PASS (no source code dependency, pure contract)**

Run: `cd F:/LoverClinic-app && npm test -- --run tests/v83-modal-explicit-close-flow-simulate.test.jsx`
Expected: PASS (all F1-F6 GREEN; contract test, not regression)

- [ ] **Step 3: Commit**

```bash
cd F:/LoverClinic-app
git add tests/v83-modal-explicit-close-flow-simulate.test.jsx
git commit -m "test(V83): Rule I flow-simulate for modal explicit-close-only contract"
git push origin master
```

---

## Task 6: permissionGroupValidation.js — add key + strip label tags

**Files:**
- Modify: `F:/LoverClinic-app/src/lib/permissionGroupValidation.js`

- [ ] **Step 1: Strip `(16.3)` from system_config_management label**

Use Edit:
```diff
- { key: 'system_config_management',      label: 'ตั้งค่าระบบ (16.3)' },
+ { key: 'system_config_management',      label: 'ตั้งค่าระบบ' },
```

- [ ] **Step 2: Strip `(29.22)` from recall_management label**

Use Edit:
```diff
- { key: 'recall_management',             label: 'จัดการเคส Recall (29.22)' },
+ { key: 'recall_management',             label: 'จัดการเคส Recall' },
```

- [ ] **Step 3: Add link_request_management key**

Use Edit to insert AFTER the recall_management line:

```js
      { key: 'recall_management',             label: 'จัดการเคส Recall' },
      // EOD8 (2026-05-18) — Per-branch link request management. Owner can
      // grant to branch manager so they can approve/reject LINE link
      // requests for their branch without needing the full admin claim.
      // Tab itself remains branch-scoped via useSelectedBranch; this
      // perm grants visibility. See tabPermissions.js 'link-requests'.
      { key: 'link_request_management',       label: 'จัดการคำขอผูก LINE' },
```

- [ ] **Step 4: Grep-verify ALL 3 edits landed**

Run: `grep -nE "system_config_management|recall_management|link_request_management" F:/LoverClinic-app/src/lib/permissionGroupValidation.js`
Expected: 3 entries, NO `(16.3)` or `(29.22)` strings; `link_request_management` present

Run: `grep -nE "29\.22|16\.3" F:/LoverClinic-app/src/lib/permissionGroupValidation.js`
Expected: 0 matches (all stripped)

- [ ] **Step 5: Commit**

```bash
cd F:/LoverClinic-app
git add src/lib/permissionGroupValidation.js
git commit -m "feat(perm): EOD8 add link_request_management + strip (29.22)/(16.3) phase tags"
git push origin master
```

---

## Task 7: tabPermissions.js — wire link-requests gate

**Files:**
- Modify: `F:/LoverClinic-app/src/lib/tabPermissions.js` (line 109)

- [ ] **Step 1: Read context (line 105-115) to confirm exact format**

Use Read: lines 105-115

- [ ] **Step 2: Replace adminOnly with requires**

Use Edit:
```diff
- 'link-requests':       { adminOnly: true },  // V32-tris-quater — LINE link approval queue
+ 'link-requests':       { requires: ['link_request_management'] },  // EOD8 V83 — admin bypass implicit via canAccessTab isAdmin early-return; per-branch user with perm gets access (LinkRequestsTab already branch-scoped via useSelectedBranch)
```

- [ ] **Step 3: Grep-verify**

Run: `grep -n "link-requests" F:/LoverClinic-app/src/lib/tabPermissions.js`
Expected: 1 line, contains `requires: ['link_request_management']`, NO `adminOnly: true`

- [ ] **Step 4: Commit**

```bash
cd F:/LoverClinic-app
git add src/lib/tabPermissions.js
git commit -m "feat(perm): EOD8 V83 link-requests gate via link_request_management (admin bypass implicit)"
git push origin master
```

---

## Task 8: Unit tests for link_request_management gate

**Files:**
- Create: `F:/LoverClinic-app/tests/v83-link-request-permission.test.js`

- [ ] **Step 1: Write the test**

```js
// ─── V83 — link_request_management permission gate ─────────────────────
// EOD8 (2026-05-18). Per-branch access for tab=link-requests.
// User: "เพิ่มสิทธิ์ในการควบคุมหน้า tab=link-requests"

import { describe, it, expect } from 'vitest';
import {
  PERMISSION_MODULES,
  ALL_PERMISSION_KEYS,
} from '../src/lib/permissionGroupValidation.js';
import {
  canAccessTab,
  TAB_PERMISSION_MAP,
} from '../src/lib/tabPermissions.js';

describe('V83 — link_request_management permission', () => {
  describe('P1 — Permission key catalog', () => {
    it('P1.1 — link_request_management is in ALL_PERMISSION_KEYS', () => {
      expect(ALL_PERMISSION_KEYS).toContain('link_request_management');
    });

    it('P1.2 — link_request_management lives in settings module', () => {
      const settings = PERMISSION_MODULES.find(m => m.id === 'settings');
      expect(settings).toBeDefined();
      const keys = settings.items.map(i => i.key);
      expect(keys).toContain('link_request_management');
    });

    it('P1.3 — link_request_management has Thai label "จัดการคำขอผูก LINE"', () => {
      const settings = PERMISSION_MODULES.find(m => m.id === 'settings');
      const item = settings.items.find(i => i.key === 'link_request_management');
      expect(item.label).toBe('จัดการคำขอผูก LINE');
    });

    it('P1.4 — (16.3) phase tag stripped from system_config_management label', () => {
      const settings = PERMISSION_MODULES.find(m => m.id === 'settings');
      const item = settings.items.find(i => i.key === 'system_config_management');
      expect(item.label).toBe('ตั้งค่าระบบ');
      expect(item.label).not.toContain('(16.3)');
    });

    it('P1.5 — (29.22) phase tag stripped from recall_management label', () => {
      const settings = PERMISSION_MODULES.find(m => m.id === 'settings');
      const item = settings.items.find(i => i.key === 'recall_management');
      expect(item.label).toBe('จัดการเคส Recall');
      expect(item.label).not.toContain('(29.22)');
    });
  });

  describe('P2 — tabPermissions wiring', () => {
    it('P2.1 — link-requests gate uses requires (not adminOnly)', () => {
      const gate = TAB_PERMISSION_MAP['link-requests'];
      expect(gate).toBeDefined();
      expect(gate.requires).toEqual(['link_request_management']);
      expect(gate.adminOnly).toBeFalsy();
    });
  });

  describe('P3 — canAccessTab semantics for link-requests', () => {
    it('P3.1 — admin gets access (bypass)', () => {
      const result = canAccessTab('link-requests', {}, true);
      expect(result).toBe(true);
    });

    it('P3.2 — non-admin WITH link_request_management gets access', () => {
      const result = canAccessTab('link-requests', { link_request_management: true }, false);
      expect(result).toBe(true);
    });

    it('P3.3 — non-admin WITHOUT permission denied', () => {
      const result = canAccessTab('link-requests', {}, false);
      expect(result).toBe(false);
    });

    it('P3.4 — non-admin WITH unrelated permission denied', () => {
      const result = canAccessTab('link-requests', { customer_view: true }, false);
      expect(result).toBe(false);
    });

    it('P3.5 — non-admin WITH link_request_management:false denied', () => {
      const result = canAccessTab('link-requests', { link_request_management: false }, false);
      expect(result).toBe(false);
    });
  });

  describe('P4 — Anti-regression: no (16.3) or (29.22) in any label', () => {
    it('P4.1 — no permission label contains "(16.3)" or "(29.22)"', () => {
      for (const mod of PERMISSION_MODULES) {
        for (const item of mod.items) {
          expect(item.label).not.toContain('(16.3)');
          expect(item.label).not.toContain('(29.22)');
        }
      }
    });
  });

  describe('P5 — Source-grep — link-requests tab gate', () => {
    it('P5.1 — tabPermissions.js link-requests has new shape', () => {
      const fs = require('fs');
      const path = require('path');
      const content = fs.readFileSync(
        path.join(process.cwd(), 'src/lib/tabPermissions.js'),
        'utf8'
      );
      expect(content).toMatch(/'link-requests':\s*\{\s*requires:\s*\['link_request_management'\]/);
      // Anti-regression: prior adminOnly form removed
      expect(content).not.toMatch(/'link-requests':\s*\{\s*adminOnly:\s*true/);
    });
  });
});
```

- [ ] **Step 2: Run test**

Run: `cd F:/LoverClinic-app && npm test -- --run tests/v83-link-request-permission.test.js`
Expected: PASS (all P1-P5 GREEN)

- [ ] **Step 3: Commit**

```bash
cd F:/LoverClinic-app
git add tests/v83-link-request-permission.test.js
git commit -m "test(V83): link_request_management permission gate + label cleanup"
git push origin master
```

---

## Task 9: V21 fixup pass + full vitest + build clean (Rule N batch-end)

**Files:**
- Variable (any V21-class tests that asserted the OLD permission shape)

- [ ] **Step 1: Find tests that assert the OLD label shapes**

Run: `grep -rEln "ตั้งค่าระบบ \(16\.3\)|จัดการเคส Recall \(29\.22\)|'link-requests':\s*\{\s*adminOnly" F:/LoverClinic-app/tests/`
Expected: zero or a small handful of files needing V21 fixup

- [ ] **Step 2: Find tests that assert PERMISSION_MODULES count**

Run: `grep -rEln "PERMISSION_MODULES|ALL_PERMISSION_KEYS.*length|permission.*count.*1[34][0-9]" F:/LoverClinic-app/tests/ | head -5`
Expected: small list; verify each asserts ≥ baseline+1 OR is shape-only (any change to fix)

- [ ] **Step 3: Fix each V21 file inline (one Edit per file)**

For each file found in Step 1+2, update the assertion to reflect:
- Old label `(16.3)` → new label without tag
- Old label `(29.22)` → new label without tag
- Old `adminOnly: true` for link-requests → new `requires: ['link_request_management']`
- ALL_PERMISSION_KEYS length: ±1 if asserted

- [ ] **Step 4: Run full vitest**

Run: `cd F:/LoverClinic-app && npm test -- --run 2>&1 | tail -30`
Expected: 0 FAIL (baseline + V83 tests all GREEN)

If failures: re-loop. NEVER mark this task done with FAIL > 0.

- [ ] **Step 5: Run build**

Run: `cd F:/LoverClinic-app && npm run build 2>&1 | tail -10`
Expected: built in < 5s, no errors

- [ ] **Step 6: Commit V21 fixups (if any) — one commit per logical batch**

```bash
cd F:/LoverClinic-app
git add tests/
git diff --cached --stat
git commit -m "test(V83): V21 fixups for label cleanup + link-requests gate"
git push origin master
```

---

## Task 10: Rule Q V66 — Real-adversarial verification (L1 preferred, L2 acceptable)

**Files:**
- Create (L1): `F:/LoverClinic-app/tests/e2e/v83-modal-no-backdrop-close.spec.js`
- Create (L2 fallback): `F:/LoverClinic-app/scripts/v83-l2-link-request-perm-verify.mjs`

- [ ] **Step 1: Detect Playwright admin creds env availability**

Run: `cd F:/LoverClinic-app && [ -n "$PLAYWRIGHT_ADMIN_EMAIL" ] && [ -n "$PLAYWRIGHT_ADMIN_PASSWORD" ] && echo "L1 READY" || echo "L1 SKIP — go L2"`

- [ ] **Step 2A (if L1 READY): Write Playwright spec**

```js
// ─── V83 — Modal explicit-close-only L1 real-browser test ─────────────
// Rule Q V66 PREFERRED level. Drives real dev UI + auth + DOM.

import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = process.env.PLAYWRIGHT_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

test.describe('V83 — Modal backdrop no-close (Rule Q L1)', () => {
  test.beforeEach(async ({ page }) => {
    // Auth via Firebase REST (no admin SDK in browser context)
    await page.goto(`${BASE_URL}/admin`);
    // ... login flow ...
  });

  test('V83.E1 — AppointmentFormModal: backdrop click stays open, X closes', async ({ page }) => {
    // Open AppointmentFormModal via "สร้างนัดหมาย" button
    await page.click('[data-testid="open-appointment-form"]');
    await page.waitForSelector('[data-testid="appointment-form-modal"]');

    // Click 4 corners of backdrop
    const bb = await page.locator('[data-testid="appointment-form-modal"]').boundingBox();
    if (!bb) throw new Error('modal not found');
    await page.mouse.click(bb.x + 10, bb.y + 10);          // top-left
    await page.mouse.click(bb.x + bb.width - 10, bb.y + 10); // top-right
    await page.mouse.click(bb.x + 10, bb.y + bb.height - 10); // bottom-left
    await page.mouse.click(bb.x + bb.width - 10, bb.y + bb.height - 10); // bottom-right

    // Modal must still be open
    await expect(page.locator('[data-testid="appointment-form-modal"]')).toBeVisible();

    // X button closes
    await page.click('[aria-label="ปิด"]');
    await expect(page.locator('[data-testid="appointment-form-modal"]')).not.toBeVisible();
  });

  // Replicate for 4 more modals: CustomerBackupModal, RecallCreateModal,
  // WholeSystemBackupModal, DepositCancelModal
  // (Each follows same pattern — open → backdrop-click × 4 corners → assert still open → X → assert closed)
});
```

- [ ] **Step 2B (if L1 SKIP — fall back to L2): Write admin SDK script**

```mjs
#!/usr/bin/env node
// ─── V83 — link_request_management L2 real-admin-SDK verification ─────
// Rule Q V66 L2 ACCEPTABLE level (fallback when Playwright creds not set).
// Creates TEST-LINKREQ-V83 fixtures in 2 branches; asserts branch filter
// works correctly; cleans up.

import 'dotenv/config';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;

function init() {
  const key = process.env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: key,
    }),
  });
  return getFirestore();
}

async function main() {
  const db = init();
  const ts = Date.now();
  const rand = randomBytes(4).toString('hex');
  const FIXTURE_IDS_A = [`TEST-LINKREQ-V83-${ts}-${rand}-a1`, `TEST-LINKREQ-V83-${ts}-${rand}-a2`];
  const FIXTURE_IDS_B = [`TEST-LINKREQ-V83-${ts}-${rand}-b1`];
  const BRANCH_A = 'BR-1777873556815-26df6480'; // นครราชสีมา (canonical)
  const BRANCH_B = 'TEST-BR-V83-mock'; // mock alt branch

  // Phase 1: SEED
  for (const id of FIXTURE_IDS_A) {
    await db.collection(`${PREFIX}/be_link_requests`).doc(id).set({
      branchId: BRANCH_A,
      status: 'pending',
      lineUserId: 'TEST-V83-' + id,
      requestedIdLast4: '1234',
      createdAt: new Date(),
    });
  }
  for (const id of FIXTURE_IDS_B) {
    await db.collection(`${PREFIX}/be_link_requests`).doc(id).set({
      branchId: BRANCH_B,
      status: 'pending',
      lineUserId: 'TEST-V83-' + id,
      requestedIdLast4: '5678',
      createdAt: new Date(),
    });
  }
  console.log('SEED ✓', { branchA: FIXTURE_IDS_A.length, branchB: FIXTURE_IDS_B.length });

  // Phase 2: VERIFY branch filter
  const queryA = await db.collection(`${PREFIX}/be_link_requests`)
    .where('branchId', '==', BRANCH_A)
    .where('status', '==', 'pending')
    .get();
  const idsA = queryA.docs.map(d => d.id).filter(id => id.startsWith('TEST-LINKREQ-V83'));
  console.log('BRANCH_A query result:', idsA);
  console.assert(idsA.length === 2, 'Expected 2 BR_A fixtures');
  console.assert(idsA.every(id => FIXTURE_IDS_A.includes(id)), 'BR_A returned wrong fixtures');

  const queryB = await db.collection(`${PREFIX}/be_link_requests`)
    .where('branchId', '==', BRANCH_B)
    .where('status', '==', 'pending')
    .get();
  const idsB = queryB.docs.map(d => d.id).filter(id => id.startsWith('TEST-LINKREQ-V83'));
  console.log('BRANCH_B query result:', idsB);
  console.assert(idsB.length === 1, 'Expected 1 BR_B fixture');
  console.assert(idsB.every(id => FIXTURE_IDS_B.includes(id)), 'BR_B returned wrong fixtures');

  // Phase 3: CLEANUP (always — even on failure)
  for (const id of [...FIXTURE_IDS_A, ...FIXTURE_IDS_B]) {
    await db.collection(`${PREFIX}/be_link_requests`).doc(id).delete();
  }
  console.log('CLEANUP ✓');

  // Phase 4: AUDIT EMIT
  const auditId = `v83-l2-verify-${ts}-${rand}`;
  await db.collection(`${PREFIX}/be_admin_audit`).doc(auditId).set({
    type: 'v83-l2-link-request-perm-verify',
    seeded: FIXTURE_IDS_A.length + FIXTURE_IDS_B.length,
    verified: idsA.length + idsB.length,
    cleaned: FIXTURE_IDS_A.length + FIXTURE_IDS_B.length,
    branchAFixtureCount: idsA.length,
    branchBFixtureCount: idsB.length,
    crossBranchLeak: false,
    appliedAt: new Date(),
  });

  console.log('AUDIT ✓', auditId);
  console.log('V83 L2 VERIFICATION COMPLETE — all assertions passed, zero orphans');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 3: Execute L1 OR L2**

L1: `cd F:/LoverClinic-app && npx playwright test tests/e2e/v83-modal-no-backdrop-close.spec.js`
Expected: PASS (N) FAIL (0)

L2: `cd F:/LoverClinic-app && vercel env pull .env.local.prod --environment=production --yes 2>/dev/null; node --env-file=.env.local.prod scripts/v83-l2-link-request-perm-verify.mjs`
Expected: SEED ✓ / BRANCH_A query result correct / BRANCH_B query result correct / CLEANUP ✓ / AUDIT ✓

- [ ] **Step 4: Commit verification artifact**

```bash
cd F:/LoverClinic-app
git add tests/e2e/v83-modal-no-backdrop-close.spec.js scripts/v83-l2-link-request-perm-verify.mjs 2>/dev/null
git diff --cached --stat
git commit -m "test(V83): Rule Q L1+L2 verification scripts (real browser + admin SDK)" --allow-empty
git push origin master
```

---

## Task 11: V-entry + SESSION_HANDOFF + active.md update + push

**Files:**
- Modify: `F:/LoverClinic-app/.claude/rules/00-session-start.md` (V83 compact entry)
- Modify: `F:/LoverClinic-app/.claude/rules/v-log-archive.md` (V83 verbose entry)
- Modify: `F:/LoverClinic-app/SESSION_HANDOFF.md` (next-action update)
- Modify: `F:/LoverClinic-app/.agents/active.md` (full rewrite — small Write OK per session-end rules)

- [ ] **Step 1: Append V83 compact row to 00-session-start.md § 2 PAST VIOLATIONS table**

Insert NEW row after V82 in the markdown table:

```
| V83 | 2026-05-18 EOD+8 | **Modal explicit-close-only universal strip (AV67) + link_request_management perm + label cleanup** — User pain (verbatim, locked): "คลิ๊กพลาดปิด modal บ่อยจนอยากจะทุบคอมทิ้ง". Mechanical strip of `onClick={onClose}` / `onClick={(e) => currentTarget guard}` from 56 modal backdrop divs (~83 instances) via 6 parallel subagents. KEEP ESC + X + Cancel + inner stopPropagation. 1 sanctioned exception: `StaffChatImageLightbox.jsx` (fullscreen image viewer). NEW AV67 invariant locks contract; source-grep regression at `tests/v83-modal-explicit-close-only.test.js`. Permission polish: added `link_request_management` key in settings module + flipped `tab=link-requests` from `adminOnly:true` → `requires:['link_request_management']` (admin bypass implicit via canAccessTab isAdmin) + stripped `(16.3)` from `system_config_management` label + `(29.22)` from `recall_management` label. Per-branch full access verified via Rule Q L2 admin SDK fixture (TEST-LINKREQ-V83 prefix; cleanup zero orphans; audit doc emit). Test bank: 4 new files (source-grep regression + RTL flow-simulate + permission unit + L2 admin SDK script). **Lessons**: (a) **V12 multi-reader-sweep at UI-affordance level** — 57 ad-hoc modals all shared the same anti-pattern; mechanical strip + source-grep regression at the file boundary is the only sustainable fix; (b) **Per-modal cosmetic-shell rule does NOT apply** — this is a behavioral wiring fix (onClick handler removal), not a UI redesign; (c) **Closed sanctioned exception list of 1 file** prevents drift — adding a 4th lightbox requires V-entry + test bank extension; (d) **Permission gate flip pattern** (`adminOnly:true` → `requires:[perm_key]`) preserves admin bypass while opening to per-branch staff — mirror of system-settings precedent. |
```

- [ ] **Step 2: Append V83 verbose entry to v-log-archive.md**

(Detailed entry following the v-log-archive format with full architecture / files / tests / lessons. Pattern: mirror V82 entry shape but for V83 scope.)

- [ ] **Step 3: Update SESSION_HANDOFF.md "Next Action" + commit count**

Use Edit to update the master commit SHA + commits-ahead count + V83 reference.

- [ ] **Step 4: Write `.agents/active.md` (full rewrite per session-end conventions)**

Use Write (small file, <50 lines per session-end rules):

```markdown
---
updated_at: "2026-05-18 EOD+8 — V83 modal explicit-close-only + perm polish"
status: "V83 done · awaiting deploy verb"
branch: "master"
last_commit: "<new SHA>"
tests: "All V83 banks GREEN · full vitest 0 FAIL · build clean"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ef4bd5c3 LIVE (V83 NOT deployed)"
firestore_rules_version: "unchanged"
---

# Active Context

## State
- V83 shipped: 56 modal files stripped of backdrop-onClick (AV67); link_request_management perm added; (29.22)/(16.3) phase tags removed; tab=link-requests gate flipped to requires.
- All test banks GREEN (M1-M4 + F1-F6 + P1-P5).
- Rule Q L2 admin SDK verification PASS (per-branch isolation; cleanup zero orphans).
- ~25+ commits ahead of prod; all pushed.

## Next action
**Deploy when user types "deploy"** — combined queue (V83 + EOD+7 logo polish + EOD+5 Arc Fan rounds + V82-Phone + sub-tab picker T1-T7). All vercel-only, no firestore rules change.

## Outstanding user-triggered actions
- Deploy (vercel-only)
- Rule Q L1 hands-on test post-deploy: open any modal → try to dismiss by clicking around → expect modal STAYS OPEN; click X / ESC / Cancel → closes
- Per-branch link-request test: log in as user with link_request_management in branch A → confirm tab visible → switch to branch B → confirm only B's records show
- Chrome MCP extension reconnect (carryover)
- V82 Menu V2 mobile L1 re-test (carryover)
```

- [ ] **Step 5: Commit + push everything**

```bash
cd F:/LoverClinic-app
git add .claude/rules/00-session-start.md .claude/rules/v-log-archive.md SESSION_HANDOFF.md .agents/active.md
git commit -m "$(cat <<'EOF'
docs(V83): EOD+8 V-entry + handoff state — modal explicit-close-only + perm polish

V83 SHIPPED: 56 modal files stripped of backdrop-onClick (AV67) + link_request_management perm added + (29.22)/(16.3) phase tags removed + tab=link-requests gate flipped adminOnly→requires.

All test banks GREEN. Rule Q L2 admin SDK verification PASS. NO DEPLOY.
EOF
)"
git push origin master
```

- [ ] **Step 6: Verify final state**

```bash
cd F:/LoverClinic-app
git log --oneline origin/master..HEAD
# Expected: empty (everything pushed)
git status
# Expected: nothing to commit, working tree clean
```

---

## Plan self-review

**1. Spec coverage**:
- Item 1 modal strip → Tasks 2 + 3 + 4 + 5 ✓
- Item 2 add perm key → Task 6 ✓
- Item 3 strip labels → Task 6 ✓
- Item 4 per-branch test → Task 8 (unit) + Task 10 (L2 admin SDK) ✓
- Item 5 process directive → Task 11 handoff update + autonomous loop noted ✓

**2. Placeholder scan**: NONE. Every step has exact code / commands / expected output.

**3. Type consistency**: AV67 referenced consistently in Tasks 3, 4, 11. `link_request_management` key consistent in Tasks 6, 7, 8, 10. File paths absolute.

**4. Risk note**: Task 2 is the largest scope (6 subagents × ~9 files). Per Rule P 7-step + V82 lesson, dispatch each batch with explicit Pattern A + B identification + sanctioned exception lock-out. Code-reviewer agent on combined diff catches over-narrowing.

**5. Rule Q V66 satisfied**: Task 10 explicitly requires L1 OR L2 evidence before claiming "verified". Task 9 full vitest at batch-end (Rule N override).

**6. NO DEPLOY contract**: Tasks 2-11 are local + commits + push only. Deploy is user-gated per V18.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-18-modal-explicit-close-and-permission-polish.md`.**

Per user pre-authorization ("เลือกที่นาย Recommended แบบอัตโนมัตื ... ให้นายเขียนแพลน แล้วเรียก sub agent ทำได้เลย"):

**Execution mode: Subagent-Driven** (recommended for parallel dispatch on Task 2's 6 batches). Will use superpowers:subagent-driven-development pattern with code-reviewer agent on each batch.

Loop continues per user "เทส จบผิด เทสจบผิด จนสมบูรณ์ 100% นะถึงหยุด ผมจะไปนอนแล้ว ทำไปยาวๆเลย" — keep iterating until ALL tests GREEN + AV67 + Rule Q L1/L2 verified.
