// Phase 24.0 — customer_delete permission key declaration + dual UI gate.
// Adaptation 1 (Tasks 12-16 contract): useHasPermission + useTabAccess are
//   NAMED exports from src/hooks/useTabAccess.js (not default exports from
//   useHasPermission.js as plan originally assumed).
// Adaptation 2: perm-key shape is { key, label } only — no destructive/default
//   fields exist in this codebase. Documentation discipline locked via comment
//   block above the entry instead of structured fields.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const PERM_FILE = fs.readFileSync(
  path.join(process.cwd(), 'src/lib/permissionGroupValidation.js'),
  'utf-8',
);
const CARD_FILE = fs.readFileSync(
  path.join(process.cwd(), 'src/components/backend/CustomerCard.jsx'),
  'utf-8',
);
const DETAIL_FILE = fs.readFileSync(
  path.join(process.cwd(), 'src/components/backend/CustomerDetailView.jsx'),
  'utf-8',
);
const MODAL_FILE = fs.readFileSync(
  path.join(process.cwd(), 'src/components/backend/DeleteCustomerCascadeModal.jsx'),
  'utf-8',
);

describe('Phase 24.0 / P — customer_delete perm key + dual gate', () => {
  it('P.1 perm key declared in ALL_PERMISSION_KEYS', () => {
    expect(PERM_FILE).toMatch(/key:\s*['"]customer_delete['"]/);
  });

  it('P.2 perm key has documentation comment (destructive / cascade / default-OFF discipline)', () => {
    // Adaptation 2 — no `destructive: true` field in this codebase's perm-key
    // schema. Lock the documentation discipline via a comment block within
    // the ~5 lines BEFORE the entry that mentions destructive/cascade/default-OFF.
    const idx = PERM_FILE.indexOf("key: 'customer_delete'");
    expect(idx).toBeGreaterThan(0);
    const window = PERM_FILE.slice(Math.max(0, idx - 400), idx);
    expect(window).toMatch(/destructive|cascade|irreversible|ลบประวัติ|default[-\s]*OFF/i);
  });

  it('P.3 perm key has explicit destructive label (cascade ลบประวัติ 11 collections)', () => {
    // Adaptation 2 — label itself carries the destructive language.
    expect(PERM_FILE).toMatch(/key:\s*['"]customer_delete['"][\s\S]{0,200}label:\s*['"]ลบลูกค้าถาวร \(cascade ลบประวัติ 11 collections\)['"]/);
  });

  it('P.4 CustomerCard imports useHasPermission + useTabAccess (named exports from useTabAccess.js)', () => {
    // Adaptation 1 — named imports from a single useTabAccess.js module.
    expect(CARD_FILE).toMatch(/import\s*\{[^}]*useHasPermission[^}]*\}\s*from\s*['"][^'"]*useTabAccess/);
    expect(CARD_FILE).toMatch(/import\s*\{[^}]*useTabAccess[^}]*\}\s*from\s*['"][^'"]*useTabAccess/);
  });

  it('P.5 CustomerCard has dual gate (perm OR admin)', () => {
    expect(CARD_FILE).toMatch(/useHasPermission\(['"]customer_delete['"]\)/);
    expect(CARD_FILE).toMatch(/(\|\|\s*tabAccess[\s\S]{0,40}isAdmin|isAdmin[\s\S]{0,40}\|\|\s*useHasPermission)/);
  });

  it('P.6 CustomerDetailView has dual gate', () => {
    expect(DETAIL_FILE).toMatch(/useHasPermission\(['"]customer_delete['"]\)/);
    expect(DETAIL_FILE).toMatch(/(\|\|\s*tabAccess[\s\S]{0,40}isAdmin|isAdmin[\s\S]{0,40}\|\|\s*useHasPermission)/);
  });

  it('P.7 DeleteCustomerCascadeModal does NOT have its own gate (parent gates rendering)', () => {
    // Anti-regression: the modal MUST render unconditionally when mounted —
    // gating happens at the parent level (Card / DetailView). Otherwise a
    // perm change mid-flow could orphan an open modal.
    expect(MODAL_FILE).not.toMatch(/useHasPermission\(['"]customer_delete['"]\)/);
  });

  it('P.8 No file outside the expected sites references customer_delete perm', () => {
    // Anti-regression: catches accidental hardcoded checks elsewhere that
    // would diverge from the canonical gate pattern.
    const allowed = new Set([
      'src/lib/permissionGroupValidation.js',
      'src/components/backend/CustomerCard.jsx',
      'src/components/backend/CustomerDetailView.jsx',
      'api/admin/delete-customer-cascade.js',
      'tests/phase-24-0-permission-customer-delete.test.js',
      'tests/phase-24-0-customer-delete-server.test.js',
      'tests/phase-24-0-customer-delete-modal.test.jsx',
      'tests/phase-24-0-customer-delete-flow-simulate.test.js',
      'tests/customer-delete-rule-probe.test.js',
      // Legitimate fixture use (perm-group validator extended tests).
      'tests/extended/permissionGroup.test.jsx',
    ]);
    function walk(dir, results = []) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git'
            || e.name === 'graphify-out' || e.name === '.agents'
            || e.name === 'docs' || e.name === 'memory' || e.name === '.claude'
            || e.name === 'cookie-relay' || e.name === 'broker_jobs'
            || e.name === 'functions' || e.name === '.vercel') continue;
          walk(p, results);
        } else if (/\.(js|jsx|ts|tsx)$/.test(e.name)) {
          results.push(p);
        }
      }
      return results;
    }
    const root = process.cwd();
    const files = walk(root);
    const violators = files.filter((f) => {
      const rel = path.relative(root, f).replace(/\\/g, '/');
      if (allowed.has(rel)) return false;
      const txt = fs.readFileSync(f, 'utf-8');
      return /customer_delete/.test(txt);
    });
    expect(violators).toEqual([]);
  });
});
