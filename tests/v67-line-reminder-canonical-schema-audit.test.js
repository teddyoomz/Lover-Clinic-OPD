// V67 (2026-05-15) — AV46 source-grep regression bank.
// Locks the canonical Firestore schema field names across the LINE reminder
// pipeline. Pre-V67 the Wave 1 implementer used invented field names from
// the spec (`appointmentDate`, `branchName`) which DID NOT exist in real
// prod docs — entire pipeline returned 0/0/0 against real prod despite 152
// mock tests + 16 AV45 audit GREEN. EXACT V66 mock-shadow drift replay.
//
// These regression tests lock the CANONICAL contract:
//   - be_appointments queries use `date` field (canonical-first); legacy
//     `appointmentDate` allowed only behind explicit `||` fallback.
//   - be_branches reads use `name` field (canonical-first); legacy `branchName`
//     allowed only behind explicit `||` fallback.
//   - be_customers picker MUST 2-query OR-merge `customerId` + `customerHN`.
//   - customerName/doctorName MUST chain to appt-denorm + real-schema fallbacks.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const read = p => readFileSync(path.join(ROOT, p), 'utf-8');

describe('V67/AV46 — Pipeline canonical schema field names', () => {
  describe('A1. Cron fire endpoint queries canonical `date` field', () => {
    it('A1.1 cron uses `where(\'date\', ...)` in be_appointments query', () => {
      const src = read('api/cron/line-reminder-fire.js');
      // Must contain canonical query
      expect(src).toMatch(/\.where\(['"]date['"]\s*,\s*['"]==['"]/);
    });
    it('A1.2 cron MUST NOT contain raw `where(\'appointmentDate\', ...)` query', () => {
      // V66 mock-shadow drift — real Firestore field is `date`. The invented
      // `appointmentDate` field does not exist on real be_appointments docs.
      const src = read('api/cron/line-reminder-fire.js');
      expect(src).not.toMatch(/\.where\(['"]appointmentDate['"]\s*,\s*['"]==['"]/);
    });
    it('A1.3 cron carries V67 marker explaining the canonical field choice', () => {
      const src = read('api/cron/line-reminder-fire.js');
      expect(src).toMatch(/V67[^\n]*canonical[^\n]*date/i);
    });
  });

  describe('A2. Debug-fire endpoint queries canonical `date` field', () => {
    it('A2.1 debug-fire uses `where(\'date\', ...)` in both single + all modes', () => {
      const src = read('api/admin/line-reminder-debug-fire.js');
      const matches = src.match(/\.where\(['"]date['"]\s*,\s*['"]==['"]/g) || [];
      // single mode: 2 queries (id + HN OR-merge), all mode: 1 query → ≥3 occurrences
      expect(matches.length).toBeGreaterThanOrEqual(3);
    });
    it('A2.2 debug-fire MUST NOT contain raw `where(\'appointmentDate\', ...)` query', () => {
      const src = read('api/admin/line-reminder-debug-fire.js');
      expect(src).not.toMatch(/\.where\(['"]appointmentDate['"]\s*,\s*['"]==['"]/);
    });
  });

  describe('A3. Template resolveTokens reads `appt.date` canonical-first with backward-compat fallback', () => {
    it('A3.1 resolveTokens reads `appt.date || appt.appointmentDate`', () => {
      const src = read('src/lib/lineReminderTemplate.js');
      expect(src).toMatch(/appt\.date\s*\|\|\s*appt\.appointmentDate/);
    });
    it('A3.2 V67 marker comment present in template', () => {
      const src = read('src/lib/lineReminderTemplate.js');
      expect(src).toMatch(/V67[^\n]*canonical[^\n]*date/i);
    });
  });

  describe('A4. Debug-fire validateDebugFireRequest reads `branch.name` canonical-first with backward-compat fallback', () => {
    it('A4.1 validation uses `branch.name || branch.branchName` fallback chain', () => {
      const src = read('api/admin/line-reminder-debug-fire.js');
      expect(src).toMatch(/branch\.name\s*\|\|\s*branch\.branchName/);
    });
    it('A4.2 validation MUST NOT raw-read `branch.branchName` without fallback', () => {
      const src = read('api/admin/line-reminder-debug-fire.js');
      // After V67 fix, all branch.branchName reads should be inside `||` fallback chain.
      // Allow `branch.branchName` only if preceded by `||` OR followed by `||`.
      // Detect ANY `branch.branchName` not in a fallback context.
      const lines = src.split('\n');
      const violations = [];
      lines.forEach((line, idx) => {
        if (!line.includes('branch.branchName')) return;
        // OK if `||` appears in the same line (either side)
        if (/\|\|.*branch\.branchName/.test(line) || /branch\.branchName.*\|\|/.test(line)) return;
        violations.push(`line ${idx + 1}: ${line.trim()}`);
      });
      expect(violations).toEqual([]);
    });
  });

  describe('A5. Single-mode picker 2-query OR-merge for customerId + customerHN (Bug B fix)', () => {
    it('A5.1 single mode contains `customerHN` field query', () => {
      const src = read('api/admin/line-reminder-debug-fire.js');
      expect(src).toMatch(/where\(['"]customerHN['"]\s*,\s*['"]==['"]/);
    });
    it('A5.2 single mode contains Promise.all for parallel id+HN queries', () => {
      const src = read('api/admin/line-reminder-debug-fire.js');
      // Match Promise.all([ ... ]) where the array contains both customerId + customerHN refs
      const promiseAllBlock = src.match(/Promise\.all\(\[[\s\S]*?customerHN[\s\S]*?\]\)/);
      expect(promiseAllBlock).toBeTruthy();
    });
    it('A5.3 V67 marker mentions Bug B / customerHN intent', () => {
      const src = read('api/admin/line-reminder-debug-fire.js');
      expect(src).toMatch(/V67[\s\S]{0,200}Bug B/);
    });
  });

  describe('A6. customerName + doctorName fallback chains read appt-denorm + real schema', () => {
    it('A6.1 customerName chains: cust.fullName → cust.name → appt.customerName → cust.firstname+lastname', () => {
      const src = read('src/lib/lineReminderTemplate.js');
      // Strong shape — exact chain order
      expect(src).toMatch(/cust\.fullName\s*\|\|\s*cust\.name\s*\|\|\s*appt\.customerName/);
      expect(src).toMatch(/cust\.firstname[^\n]*cust\.lastname/);
    });
    it('A6.2 doctorName chain: doctor.name → appt.doctorName → "แพทย์ผู้ดูแล"', () => {
      const src = read('src/lib/lineReminderTemplate.js');
      expect(src).toMatch(/appt\.doctorName\s*\|\|\s*['"]แพทย์ผู้ดูแล['"]/);
    });
  });

  describe('A7. e2e + test fixtures use canonical `date` field (V66 lesson — mocks must match reality)', () => {
    it('A7.1 e2e buildAppointment writes `date` field (NOT `appointmentDate`)', () => {
      const src = read('scripts/e2e-line-reminder-real-prod.mjs');
      // The function should write `date: appointmentDate` (translating param to canonical)
      expect(src).toMatch(/date:\s*appointmentDate/);
      // And NOT raw `appointmentDate,` as a Firestore field
      // (`appointmentDate` may still appear as a function PARAM, that's fine)
      const docShape = src.match(/function buildAppointment[\s\S]{0,500}return\s*\{[\s\S]*?\};/);
      expect(docShape).toBeTruthy();
      // Inside the returned object literal, the field name should be `date:`
      const objBody = docShape[0];
      expect(objBody).toMatch(/^\s*date:\s*/m);
    });
    it('A7.2 lineReminderTemplate.test.js baseInput uses `date` + `name` canonical', () => {
      const src = read('tests/lineReminderTemplate.test.js');
      // baseInput appt should use canonical `date:` not `appointmentDate:`
      // Look for baseInput block
      const baseInputBlock = src.match(/const baseInput = \{[\s\S]*?\n\};/);
      expect(baseInputBlock).toBeTruthy();
      const block = baseInputBlock[0];
      expect(block).toMatch(/appt:\s*\{[^}]*date:\s*['"]2026-05-16['"]/);
      expect(block).toMatch(/branch:\s*\{[^}]*name:\s*['"]นครราชสีมา['"]/);
    });
    it('A7.3 line-reminder-pipeline test fixtures use `date:` canonical', () => {
      const files = [
        'tests/line-reminder-pipeline-idempotency.test.js',
        'tests/line-reminder-pipeline-customer-branch-link.test.js',
        'tests/line-reminder-pipeline-per-branch-credentials.test.js',
      ];
      for (const f of files) {
        const src = read(f);
        // Should NOT contain `appointmentDate:` as fixture field name
        expect(src, `${f} should NOT carry pre-V67 mock-shadow field name`).not.toMatch(/appointmentDate:\s*['"]2026/);
        // Should contain canonical `date:` in fixtures
        expect(src, `${f} should carry V67 canonical fixture field name`).toMatch(/date:\s*['"]2026-05-16['"]/);
      }
    });
  });

  describe('A8. AV46 invariant registered in audit-anti-vibe-code SKILL.md', () => {
    it('A8.1 SKILL.md contains AV46 section heading', () => {
      const src = read('.agents/skills/audit-anti-vibe-code/SKILL.md');
      expect(src).toMatch(/^### AV46 — Pipeline Firestore field name MUST match real schema/m);
    });
    it('A8.2 SKILL.md banner reflects AV1–AV46', () => {
      const src = read('.agents/skills/audit-anti-vibe-code/SKILL.md');
      expect(src).toMatch(/Invariants \(AV1–AV46\)/);
    });
  });
});
