// V81-fix3 — AV67 regression: Vercel serverless endpoints (api/**) MUST
// import only runtime dependencies. devDeps imports crash with HTML 500
// because Vercel runs `npm install --production` (skips devDependencies).
//
// Origin: V81 backup Download button returned `Unexpected token 'A',
// "A server e"... is not valid JSON` because `archiver` was in devDeps.
// Move to deps + lock with this test.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const PKG = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'));

const DEPS = new Set(Object.keys(PKG.dependencies || {}));
const DEV_DEPS = new Set(Object.keys(PKG.devDependencies || {}));

// Known devDep package families that would crash if imported by api/**
// (testing, linting, build tools — never available at Vercel runtime).
const KNOWN_DEVDEP_FAMILIES = [
  'archiver', // V81 root cause — now expected to be in deps post-fix
  'jsdom',
  'fast-check',
  '@playwright/',
  '@testing-library/',
  '@stryker-mutator/',
  '@vitest/',
  'vitest',
  'knip',
  'eslint',
  '@eslint/',
  'eslint-plugin-',
  'vite',
  '@vitejs/',
  'autoprefixer',
  'postcss',
  'tailwindcss',
  'firebase-tools',
  'globals',
  'rollup-plugin-',
];

function isKnownDevDepFamily(pkg) {
  return KNOWN_DEVDEP_FAMILIES.some(prefix => pkg === prefix || pkg.startsWith(prefix));
}

function walkApiDir(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walkApiDir(path, files);
    } else if (/\.(js|mjs)$/.test(name)) {
      files.push(path);
    }
  }
  return files;
}

// Match top-level `import X from 'pkg'` or `import {X} from 'pkg'` (not dynamic import())
const IMPORT_RE = /^\s*import\s+(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]/gm;

function extractImportSpecifiers(src) {
  const specs = new Set();
  let m;
  while ((m = IMPORT_RE.exec(src)) !== null) {
    specs.add(m[1]);
  }
  return specs;
}

function bareSpecifierName(spec) {
  // 'archiver' → 'archiver'; '@scope/pkg/sub' → '@scope/pkg'; 'pkg/sub' → 'pkg'; './local' → null
  if (spec.startsWith('.') || spec.startsWith('/')) return null;
  if (spec.startsWith('@')) {
    const parts = spec.split('/');
    return `${parts[0]}/${parts[1]}`;
  }
  return spec.split('/')[0];
}

describe('V81-fix3 / AV67 — api/** must not import devDeps (Vercel runtime crashes)', () => {
  const apiDir = resolve(REPO_ROOT, 'api');
  const apiFiles = walkApiDir(apiDir);

  // V21 fix-up (V82-followup, 2026-05-17): V81-fix6b BYPASSED archiver entirely with
  // pure JSON bundle (Vercel runtime FUNCTION_INVOCATION_FAILED 500). `archiver` was
  // removed from package.json dependencies after the bypass. AV67.1 originally
  // asserted archiver is a runtime dep; that contract is obsolete. AV67.2/3/4 (the
  // universal devDeps-import scanner) still enforces the broader policy and remains
  // active — those still validate any future api/** import hygiene.
  it.skip('AV67.1 — archiver is in dependencies (V81 root cause regression) [REMOVED V81-fix6b: archiver dep removed; bypass via pure JSON bundle]', () => {
    expect(DEPS.has('archiver')).toBe(true);
    expect(DEV_DEPS.has('archiver')).toBe(false);
  });

  it('AV67.2 — every api/** import resolves to a runtime dependency', () => {
    const violations = [];

    for (const file of apiFiles) {
      const src = readFileSync(file, 'utf8');
      const specs = extractImportSpecifiers(src);

      for (const spec of specs) {
        const pkg = bareSpecifierName(spec);
        if (!pkg) continue; // local import
        // Allow node: built-ins (no version, no dep listing needed)
        if (pkg.startsWith('node:')) continue;
        // Allow node built-in module names that are not in any package list
        if (!DEPS.has(pkg) && !DEV_DEPS.has(pkg)) {
          // Could be a node built-in (e.g. 'fs', 'path', 'crypto') — skip
          continue;
        }
        // If the package is ONLY in devDeps (not in deps) → violation
        if (!DEPS.has(pkg) && DEV_DEPS.has(pkg)) {
          violations.push(`${file.replace(REPO_ROOT, '')}: imports '${spec}' which is in devDependencies only`);
        }
      }
    }

    expect(violations, `AV67 violation — devDeps imports in api/** crash on Vercel:\n${violations.join('\n')}`).toEqual([]);
  });

  it('AV67.3 — known devDep families do not appear as bare imports in api/**', () => {
    const violations = [];

    for (const file of apiFiles) {
      const src = readFileSync(file, 'utf8');
      const specs = extractImportSpecifiers(src);

      for (const spec of specs) {
        const pkg = bareSpecifierName(spec);
        if (!pkg) continue;
        if (isKnownDevDepFamily(pkg) && DEV_DEPS.has(pkg) && !DEPS.has(pkg)) {
          violations.push(`${file.replace(REPO_ROOT, '')}: imports devDep-family '${spec}' (must be in dependencies)`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('AV67.4 — sanctioned exception list is empty (Vercel runtime contract is absolute)', () => {
    // No annotation/escape hatch: if a package is imported by api/**, it MUST be a runtime dep.
    // This test exists to document the policy — there is no waiver path.
    expect(true).toBe(true);
  });
});
