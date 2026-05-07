// V50 (2026-05-08) — AV28 audit invariant: no broker.* / cloneOrchestrator /
// /api/proclinic/* / pc_* / master_data / broker_jobs / proclinic_session
// runtime references in src/ or api/ post-strip.
//
// Locks the V50 ProClinic-strip contract permanently. Re-introducing ANY of
// the forbidden patterns = V50 regression that must be reverted (Rule A
// bug-blast revert).
//
// Sanctioned exceptions: comments referencing the historical migration
// (e.g. "was X via broker..." / "replaces pc_appointments mirror") are OK
// — institutional memory. Only RUNTIME code paths are forbidden.
//
// See also: .agents/skills/audit-anti-vibe-code/SKILL.md AV28 + iron-clad
// rules E / H / H-bis / H-quater.

import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { execSync } from 'node:child_process';

// ─── Walk helpers ──────────────────────────────────────────────────────────

function listFilesGitTracked(prefix) {
  // Use `git ls-files` so we don't accidentally walk node_modules / .git /
  // dist / etc. Covers JS + JSX + MJS extensions only — config files (.json)
  // and markdown are out of scope.
  try {
    const out = execSync(`git ls-files "${prefix}"`, {
      cwd: resolve(process.cwd()),
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    return out
      .split('\n')
      .filter(Boolean)
      .filter((p) => /\.(js|jsx|mjs|cjs|ts|tsx)$/.test(p));
  } catch {
    return [];
  }
}

function readSrc(rel) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

// Strip line-comments + block-comments so source-grep doesn't false-flag on
// historical-memory comments. Preserves strings (so `'/api/proclinic/'` still
// trips even if used in a Thai-localized error message — would also be a real
// runtime usage anyway).
function stripComments(src) {
  let out = '';
  let i = 0;
  let inString = null;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (inString) {
      out += ch;
      if (ch === '\\' && i + 1 < src.length) {
        out += src[i + 1];
        i += 2;
        continue;
      }
      if (ch === inString) inString = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      out += ch;
      i++;
      continue;
    }
    if (ch === '/' && next === '/') {
      // line comment — skip to next \n
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      // block comment — skip to closing */
      i += 2;
      while (i < src.length - 1 && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

// ─── Forbidden pattern catalog ─────────────────────────────────────────────

const FORBIDDEN_IMPORTS = [
  { re: /from\s+['"][^'"]*brokerClient['"]/, label: 'brokerClient' },
  { re: /from\s+['"][^'"]*cloneOrchestrator['"]/, label: 'cloneOrchestrator' },
  { re: /from\s+['"][^'"]*customerBranchBaselineClient['"]/, label: 'customerBranchBaselineClient' },
];

const FORBIDDEN_URLS = [
  { re: /['"]\/api\/proclinic\//, label: '/api/proclinic/* fetch URL' },
];

const FORBIDDEN_NAMESPACE_CALLS = [
  // broker.<method>( — covers create/update/delete/get/list/search/sync/find/
  // fetch/post/put namespace methods
  { re: /\bbroker\.(create|update|delete|get|list|search|sync|find|fetch|post|put)[A-Za-z]*\(/, label: 'broker.<method>() call' },
];

const FORBIDDEN_FIRESTORE_PATHS = [
  // collection() / doc() / etc. with first arg matching deleted collections
  {
    re: /(?:collection|doc|getDoc|getDocs|setDoc|updateDoc|deleteDoc|onSnapshot|query)\(\s*db\s*,\s*[^)]*['"](pc_(?:appointments|customers|customer_appointments|courses|doctors|treatments|treatment_history|chart_templates|form_options|inventory)|broker_jobs|master_data)['"]/,
    label: 'Firestore call against deleted collection',
  },
  // basePath()-style path via spread + doc/collection
  {
    re: /\.\.\.basePath\(\)\s*,\s*['"](pc_(?:appointments|customers|customer_appointments|courses|doctors|treatments|treatment_history|chart_templates|form_options|inventory)|broker_jobs|master_data|proclinic_session|proclinic_session_trial)['"]/,
    label: 'basePath() spread referencing deleted collection',
  },
];

// ─── Files to scan ─────────────────────────────────────────────────────────
//
// V50 STRIP SCOPE: every git-tracked JS/JSX/MJS file under src/ + api/.
// EXCLUDES:
//   - tests/ (these tests reference forbidden patterns IN STRINGS to assert
//     the contract; that's an intended exception)
//   - scripts/ (one-shot data-ops mirror old patterns intentionally for
//     migration / cleanup workflows; Rule M canonical pattern)
//
// Build the file list once at top-level so each test reuses it.

const SRC_FILES = listFilesGitTracked('src/');
const API_FILES = listFilesGitTracked('api/');
const ALL_FILES = [...SRC_FILES, ...API_FILES];

// Sanity: the post-V50 file count should be > 100. If close to 0, the git
// ls-files command failed and the audit gives a false GREEN. Catch that.

describe('V50 AV28 — file enumeration sanity', () => {
  it('AV28.0 — git ls-files returned a plausible count (≥ 100 files)', () => {
    expect(ALL_FILES.length).toBeGreaterThanOrEqual(100);
  });
});

// ─── AV28.1 — forbidden imports ────────────────────────────────────────────

describe('V50 AV28 — forbidden imports of deleted modules', () => {
  for (const { re, label } of FORBIDDEN_IMPORTS) {
    it(`AV28.1 — no ${label} import in src/ or api/`, () => {
      const violators = [];
      for (const f of ALL_FILES) {
        const src = stripComments(readSrc(f));
        if (re.test(src)) violators.push(f);
      }
      expect(violators, `${label} import found in: ${violators.join(', ')}`).toEqual([]);
    });
  }
});

// ─── AV28.2 — forbidden URL fetches ────────────────────────────────────────

describe('V50 AV28 — no /api/proclinic/* fetches', () => {
  for (const { re, label } of FORBIDDEN_URLS) {
    it(`AV28.2 — no ${label} in src/ or api/`, () => {
      const violators = [];
      for (const f of ALL_FILES) {
        const src = stripComments(readSrc(f));
        if (re.test(src)) violators.push(f);
      }
      expect(violators, `${label} found in: ${violators.join(', ')}`).toEqual([]);
    });
  }
});

// ─── AV28.3 — forbidden broker.<method>() calls ────────────────────────────

describe('V50 AV28 — no broker.<method>() namespace calls', () => {
  for (const { re, label } of FORBIDDEN_NAMESPACE_CALLS) {
    it(`AV28.3 — no ${label} in src/ or api/`, () => {
      const violators = [];
      for (const f of ALL_FILES) {
        const src = stripComments(readSrc(f));
        if (re.test(src)) violators.push(f);
      }
      expect(violators, `${label} found in: ${violators.join(', ')}`).toEqual([]);
    });
  }
});

// ─── AV28.4 — forbidden Firestore paths in runtime code ────────────────────

describe('V50 AV28 — no Firestore reads/writes against deleted collections', () => {
  for (const { re, label } of FORBIDDEN_FIRESTORE_PATHS) {
    it(`AV28.4 — no ${label} in src/ or api/ runtime code`, () => {
      const violators = [];
      for (const f of ALL_FILES) {
        const src = stripComments(readSrc(f));
        if (re.test(src)) violators.push(f);
      }
      // V50-followup (2026-05-08) — scopedDataLayer.js cleaned of all
      // master_data re-exports. backendClient.js cleaned of CRUD/read helpers
      // (createMasterCourse/Item, update*, delete*, getMasterDataMeta,
      // getAllMasterDataItems, clearMasterDataItems, BE_BACKED_MASTER_TYPES,
      // readBeForMasterType, getBeBackedMasterTypes, runMasterDataSync,
      // masterDataDoc). REMAINING sanctioned exception: backendClient.js
      // retains `masterDataItemsCol` + the `migrate*ToBe` family (one-shot
      // dev migration helpers) + their `mapMasterTo*` mappers. These are
      // dead at runtime (no UI callers; master_data Firestore rules removed
      // in this commit) but kept as inert dead code for now — future
      // cleanup can delete them outright. Log the path so the deviation is
      // visible.
      const sanctioned = ['src/lib/backendClient.js'];
      const real = violators.filter((f) => !sanctioned.includes(f));
      expect(real, `${label} found in non-sanctioned files: ${real.join(', ')}`).toEqual([]);
    });
  }
});

// ─── AV28.5 — deleted files MUST NOT exist ─────────────────────────────────

describe('V50 AV28 — deleted V50 Phase 2.2 files must NOT exist', () => {
  const DELETED_FILES = [
    'src/lib/brokerClient.js',
    'src/lib/cloneOrchestrator.js',
    'src/lib/customerBranchBaselineClient.js',
    'src/components/backend/CloneTab.jsx',
    'src/components/backend/MasterDataTab.jsx',
    'api/proclinic/master.js',
    'api/proclinic/customer.js',
    'api/proclinic/appointment.js',
    'api/proclinic/treatment.js',
    'api/proclinic/courses.js',
    'api/proclinic/deposit.js',
    'api/proclinic/connection.js',
    'api/proclinic/explore.js',
    'cookie-relay/manifest.json',
    'cookie-relay/background.js',
  ];
  for (const f of DELETED_FILES) {
    it(`AV28.5 — ${f} does NOT exist (V50 Phase 2.2 strip)`, () => {
      let exists = false;
      try {
        statSync(resolve(process.cwd(), f));
        exists = true;
      } catch {
        exists = false;
      }
      expect(exists, `Deleted V50 file resurrected: ${f}`).toBe(false);
    });
  }
});

// ─── AV28.6 — V50 marker present in code (institutional memory) ────────────

describe('V50 AV28 — V50 marker present in TFP + key files', () => {
  it('AV28.6 — TreatmentFormPage.jsx contains V50 marker', () => {
    const tfp = readSrc('src/components/TreatmentFormPage.jsx');
    expect(tfp).toMatch(/V50/);
  });

  it('AV28.6 — AV28 invariant documented in audit-anti-vibe-code SKILL.md', () => {
    const skill = readSrc('.agents/skills/audit-anti-vibe-code/SKILL.md');
    expect(skill).toMatch(/AV28/);
    expect(skill).toMatch(/ProClinic strip/i);
  });

  it('AV28.6 — V50 V-entry referenced in 00-session-start.md or active.md', () => {
    const a = readSrc('.claude/rules/00-session-start.md');
    const b = readSrc('.agents/active.md');
    const combined = a + '\n' + b;
    expect(combined).toMatch(/V50/);
  });
});
