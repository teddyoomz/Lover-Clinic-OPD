// V68 (2026-05-15) — AV47 source-grep regression bank.
// Locks the LINE badge surfacing discipline:
//   - 4 admin appt-list surfaces import + render <AppointmentLineBadge>
//   - NO file outside the sanctioned set contains literal `🟢 LINE` (Rule of 3)
//   - <AppointmentLineBadge> reads notifyChannel + has lineNotify defensive fallback
//   - <CustomerLineBadge> sibling-exported from CustomerOption.jsx
//   - lineNotify field stripped from AppointmentFormModal + appointmentDepositBatch.js
//
// Companion: AV47 invariant in audit-anti-vibe-code/SKILL.md.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const read = p => readFileSync(path.join(ROOT, p), 'utf-8');

describe('V68/AV47 — LINE badge surfacing discipline', () => {

  describe('A. 4 admin appt-list surfaces import + render <AppointmentLineBadge>', () => {
    const SURFACES = [
      'src/components/backend/AppointmentCalendarView.jsx',
      'src/components/admin/AppointmentHubView.jsx',
      'src/components/backend/CustomerDetailView.jsx',
      'src/pages/AdminDashboard.jsx',
    ];

    it.each(SURFACES)('A.1 — %s imports AppointmentLineBadge', (file) => {
      const src = read(file);
      expect(src).toMatch(/import\s*\{[^}]*AppointmentLineBadge[^}]*\}\s*from\s*['"][^'"]+AppointmentLineBadge\.jsx?['"]/);
    });

    it.each(SURFACES)('A.2 — %s renders <AppointmentLineBadge', (file) => {
      const src = read(file);
      expect(src).toMatch(/<AppointmentLineBadge\b/);
    });
  });

  describe('B. Universal classifier — NO inline 🟢 LINE in JSX outside sanctioned files', () => {
    it('B.1 — only sanctioned files render literal `🟢 LINE` JSX (comments OK)', () => {
      // Sanctioned: the 2 component files where the badge JSX literally renders
      // `🟢 LINE`. Other files may MENTION `🟢 LINE` in comments (V68 markers,
      // ASCII layout diagrams) — that's fine. The discipline we lock is that
      // no INLINE JSX `<span>🟢 LINE</span>` sneaks into a non-sanctioned file
      // (which would defeat the shared-component pattern).
      const SANCTIONED = new Set([
        'src/components/AppointmentLineBadge.jsx',
        'src/components/CustomerOption.jsx', // CustomerLineBadge renders the chip
      ]);
      const filesToCheck = [
        'src/components/AppointmentLineBadge.jsx',
        'src/components/CustomerOption.jsx',
        'src/components/backend/CustomerCard.jsx',
        'src/components/backend/AppointmentCalendarView.jsx',
        'src/components/admin/AppointmentHubView.jsx',
        'src/components/backend/CustomerDetailView.jsx',
        'src/pages/AdminDashboard.jsx',
        'src/components/backend/AppointmentFormModal.jsx',
      ];
      // Strip comments before matching so doc-marker text in `//`, `/* */`,
      // and `{/* */}` JSX comments doesn't false-positive. Single-pass regex
      // (V67-canonical pattern from phase-20-0-task-6 STRIPPED helper).
      const stripComments = (src) => src
        .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '') // JSX block comments {/* ... */}
        .replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ''); // JS line + block comments
      const offenders = [];
      for (const f of filesToCheck) {
        const src = stripComments(read(f));
        if (/🟢\s*LINE/.test(src) && !SANCTIONED.has(f)) {
          offenders.push(f);
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  describe('C. <AppointmentLineBadge> contract', () => {
    it('C.1 — reads notifyChannel.includes("line")', () => {
      const src = read('src/components/AppointmentLineBadge.jsx');
      expect(src).toMatch(/notifyChannel[\s\S]*\.includes\(['"]line['"]\)/);
    });
    it('C.2 — has appt.lineNotify defensive fallback (V67 lesson)', () => {
      const src = read('src/components/AppointmentLineBadge.jsx');
      expect(src).toMatch(/appt\.lineNotify\s*===\s*true/);
    });
    it('C.3 — returns null when neither channel-line nor lineNotify true', () => {
      const src = read('src/components/AppointmentLineBadge.jsx');
      expect(src).toMatch(/if\s*\(!isLineNotify\)\s*return\s*null/);
    });
  });

  describe('D. <CustomerLineBadge> sibling export from CustomerOption', () => {
    it('D.1 — CustomerLineBadge is a named export from CustomerOption.jsx', () => {
      const src = read('src/components/CustomerOption.jsx');
      expect(src).toMatch(/export function CustomerLineBadge\b/);
    });
    it('D.2 — CustomerCard imports CustomerLineBadge from CustomerOption', () => {
      const src = read('src/components/backend/CustomerCard.jsx');
      expect(src).toMatch(/import\s*\{[^}]*CustomerLineBadge[^}]*\}\s*from\s*['"][^'"]+CustomerOption\.jsx?['"]/);
    });
    it('D.3 — CustomerCard uses useSelectedBranch for contextBranchId', () => {
      const src = read('src/components/backend/CustomerCard.jsx');
      expect(src).toMatch(/useSelectedBranch\s*\(\s*\)/);
      expect(src).toMatch(/<CustomerLineBadge[\s\S]{0,100}contextBranchId/);
    });
  });

  describe('E. lineNotify field stripped (Q3 full strip)', () => {
    it('E.1 — AppointmentFormModal MUST NOT contain formData.lineNotify', () => {
      const src = read('src/components/backend/AppointmentFormModal.jsx');
      expect(src).not.toMatch(/formData\.lineNotify/);
    });
    it('E.2 — AppointmentFormModal MUST NOT contain `lineNotify:` payload key', () => {
      // Allow only V68 marker comment mentioning lineNotify
      const src = read('src/components/backend/AppointmentFormModal.jsx');
      const lines = src.split('\n');
      const offenders = lines.filter(line => /lineNotify:/.test(line));
      expect(offenders).toEqual([]);
    });
    it('E.3 — appointmentDepositBatch MUST NOT contain `lineNotify:` payload key or `lineNotify` allow-list entry', () => {
      const src = read('src/lib/appointmentDepositBatch.js');
      const lines = src.split('\n');
      const offenders = lines.filter(line => /lineNotify:/.test(line) || /'lineNotify'/.test(line));
      expect(offenders).toEqual([]);
    });
    it('E.4 — both files carry V68 marker comment', () => {
      const modalSrc = read('src/components/backend/AppointmentFormModal.jsx');
      const batchSrc = read('src/lib/appointmentDepositBatch.js');
      expect(modalSrc).toMatch(/V68[^\n]*lineNotify/);
      expect(batchSrc).toMatch(/V68[^\n]*lineNotify/);
    });
  });

  describe('F. AV47 invariant registered in audit-anti-vibe-code SKILL.md', () => {
    it('F.1 — SKILL.md contains AV47 section heading', () => {
      const src = read('.agents/skills/audit-anti-vibe-code/SKILL.md');
      expect(src).toMatch(/^### AV47 — /m);
    });
    it('F.2 — SKILL.md banner reflects AV1–AV47', () => {
      const src = read('.agents/skills/audit-anti-vibe-code/SKILL.md');
      expect(src).toMatch(/Invariants \(AV1[–-]AV47\)/);
    });
  });
});
