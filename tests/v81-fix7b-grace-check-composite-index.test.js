// tests/v81-fix7b-grace-check-composite-index.test.js
// AV75 regression — Firestore composite-index direction MUST match query orderBy.
//
// Origin: post-V81-fix7b (2026-05-17 EOD+2 LATE+4). User clicked the 🗑 delete
// button on a per-branch backup row → ⚠ 9 FAILED_PRECONDITION error banner.
// Root cause: checkGracePeriod ran `where('type','==',t).where('performedAt','>=',since)`
// with NO explicit `.orderBy()`. Firestore implicitly ordered ASC; deployed
// composite index is `be_admin_audit (type ASC, performedAt DESC)` — direction
// mismatch → runtime error invisible to mocks + admin-SDK + build.
//
// Fix: add `.orderBy('performedAt', 'desc')` to both grace-check call sites.
// AV75 locks the fix shape; future drift fails build.
//
// Rule P 7-step satisfied:
//   1. Diagnose ✓ — direction mismatch (this V-entry)
//   2. Classify ✓ — composite-index-direction-mismatch class (NEW family)
//   3. Cross-file grep ✓ — only 2 sites in api/admin/* (delete + bulk-delete)
//   4. Fix all in batch ✓ — single commit, both sites
//   5. Regression test ✓ — this file
//   6. AVxx invariant ✓ — AV75 in audit-anti-vibe-code SKILL.md
//   7. Iron-clad escalation — NOT needed (single-class, no architectural rule warranted)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(import.meta.dirname, '..');
const DELETE_FILE = join(REPO_ROOT, 'api/admin/backup-manager-delete.js');
const BULK_FILE = join(REPO_ROOT, 'api/admin/backup-manager-bulk-delete.js');
const INDEXES_FILE = join(REPO_ROOT, 'firestore.indexes.json');

const readFile = (p) => readFileSync(p, 'utf-8');

describe('AV75 — Firestore composite-index direction matches query orderBy (post-V81-fix7b)', () => {
  describe('AV75.A — Single-delete grace-check has explicit orderBy', () => {
    const src = readFile(DELETE_FILE);

    it('A.1 — checkGracePeriod function exists', () => {
      expect(src).toMatch(/async function checkGracePeriod/);
    });

    it('A.2 — query uses .where("type", "==", t)', () => {
      expect(src).toMatch(/\.where\(['"]type['"],\s*['"]==['"]/);
    });

    it('A.3 — query uses .where("performedAt", ">=", since)', () => {
      expect(src).toMatch(/\.where\(['"]performedAt['"],\s*['"]>=['"]/);
    });

    it('A.4 — query has explicit .orderBy("performedAt", "desc") matching deployed index direction', () => {
      expect(src).toMatch(/\.orderBy\(['"]performedAt['"],\s*['"]desc['"]\)/);
    });

    it('A.5 — AV75 marker comment present (institutional memory)', () => {
      expect(src).toMatch(/AV75/);
    });
  });

  describe('AV75.B — Bulk-delete grace-check has explicit orderBy (mirror site)', () => {
    const src = readFile(BULK_FILE);

    it('B.1 — checkGracePeriod function exists', () => {
      expect(src).toMatch(/async function checkGracePeriod/);
    });

    it('B.2 — query uses .where("type", "==", t) + .where("performedAt", ">=", since)', () => {
      expect(src).toMatch(/\.where\(['"]type['"],\s*['"]==['"]/);
      expect(src).toMatch(/\.where\(['"]performedAt['"],\s*['"]>=['"]/);
    });

    it('B.3 — query has explicit .orderBy("performedAt", "desc")', () => {
      expect(src).toMatch(/\.orderBy\(['"]performedAt['"],\s*['"]desc['"]\)/);
    });

    it('B.4 — AV75 marker comment present', () => {
      expect(src).toMatch(/AV75/);
    });
  });

  describe('AV75.C — Deployed composite index direction matches the orderBy direction', () => {
    const indexes = JSON.parse(readFile(INDEXES_FILE));
    const auditIdx = indexes.indexes.find(
      (i) =>
        i.collectionGroup === 'be_admin_audit' &&
        i.fields.some((f) => f.fieldPath === 'type') &&
        i.fields.some((f) => f.fieldPath === 'performedAt')
    );

    it('C.1 — be_admin_audit (type, performedAt) composite index exists', () => {
      expect(auditIdx).toBeTruthy();
    });

    it('C.2 — type field is ASCENDING (equality filter)', () => {
      const typeField = auditIdx.fields.find((f) => f.fieldPath === 'type');
      expect(typeField.order).toBe('ASCENDING');
    });

    it('C.3 — performedAt field is DESCENDING (matches grace-check orderBy desc)', () => {
      const perfField = auditIdx.fields.find((f) => f.fieldPath === 'performedAt');
      expect(perfField.order).toBe('DESCENDING');
    });
  });

  describe('AV75.D — Class-of-bug cross-file grep (Rule P Step 3)', () => {
    it('D.1 — NO sibling composite (eq + ineq on different fields) without orderBy in api/admin/*.js', async () => {
      const { readdirSync } = await import('fs');
      const apiAdminDir = join(REPO_ROOT, 'api/admin');
      const jsFiles = readdirSync(apiAdminDir).filter((f) => f.endsWith('.js'));

      const offenders = [];
      for (const f of jsFiles) {
        const src = readFile(join(apiAdminDir, f));
        // The AV75 class-of-bug fires ONLY when a query combines:
        //   (a) one or more equality filters: .where('X', '==', ...)
        //   (b) an inequality on a DIFFERENT field: .where('Y', '>=|>|<=|<|!=', ...)
        // Without explicit .orderBy('Y', dir), Firestore implicit ASC order may
        // mismatch the deployed composite index direction → FAILED_PRECONDITION.
        //
        // Auto-indexed cases (skipped):
        //   • Single-field inequality (no equality on different field) — auto index
        //   • __name__ range queries (cleanup-test-probes pattern) — auto-indexed by docId
        const ineqRe = /\.where\(['"]([^'"]+)['"],\s*['"](>=|>|<=|<|!=)['"][^)]*\)/g;
        let m;
        while ((m = ineqRe.exec(src))) {
          const ineqField = m[1];
          if (ineqField === '__name__') continue; // auto-indexed by docId
          // Look BEHIND up to 500 chars for an equality where on a DIFFERENT field
          const head = src.slice(Math.max(0, m.index - 500), m.index);
          const eqRe = /\.where\(['"]([^'"]+)['"],\s*['"]==['"]/g;
          let eqMatch;
          let hasCompositeNeed = false;
          while ((eqMatch = eqRe.exec(head))) {
            if (eqMatch[1] !== ineqField) {
              hasCompositeNeed = true;
              break;
            }
          }
          if (!hasCompositeNeed) continue;
          // Composite query confirmed — now check orderBy presence in next 400 chars
          const tail = src.slice(m.index, m.index + 400);
          const hasOrderBy = new RegExp(`\\.orderBy\\(['"]${ineqField}['"]`).test(tail);
          if (!hasOrderBy) {
            offenders.push(`${f}: composite where(eq) + where('${ineqField}', ineq) → missing .orderBy('${ineqField}', ...)`);
          }
        }
      }

      expect(offenders).toEqual([]);
    });
  });

  describe('AV75.E — Orphan tab removal anti-regression', () => {
    it('E.1 — CustomerDataRecoveryTab.jsx removed from disk', async () => {
      const { existsSync } = await import('fs');
      const filePath = join(REPO_ROOT, 'src/components/backend/CustomerDataRecoveryTab.jsx');
      expect(existsSync(filePath)).toBe(false);
    });

    it('E.2 — BackendDashboard.jsx no longer imports CustomerDataRecoveryTab', () => {
      const src = readFile(join(REPO_ROOT, 'src/pages/BackendDashboard.jsx'));
      expect(src).not.toMatch(/import\s+CustomerDataRecoveryTab/);
      expect(src).not.toMatch(/CustomerDataRecoveryTab\s*=\s*lazy/);
      expect(src).not.toMatch(/<CustomerDataRecoveryTab\s*\/>/);
    });

    it('E.3 — navConfig.js no longer has customer-data-recovery item', () => {
      const src = readFile(join(REPO_ROOT, 'src/components/backend/nav/navConfig.js'));
      expect(src).not.toMatch(/id:\s*['"]customer-data-recovery['"]/);
    });

    it('E.4 — tabPermissions.js no longer has customer-data-recovery key', () => {
      const src = readFile(join(REPO_ROOT, 'src/lib/tabPermissions.js'));
      expect(src).not.toMatch(/['"]customer-data-recovery['"]\s*:/);
    });
  });
});
