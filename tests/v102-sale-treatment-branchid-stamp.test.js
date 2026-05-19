// V102 (2026-05-19 LATE+2) — primary writers MUST stamp top-level branchId
// regression bank.
//
// Class-of-bug: BSA Phase BS V2/V3 added _resolveBranchIdForWrite to 24
// sibling writers but MISSED createBackendSale + createBackendTreatment.
// Result: 5/5 prod sales + 5/5 prod treatments had branchId=(none).
// Per-branch BSA listeners (`where('branchId','==',X)`) returned 0 rows →
// invisible in SaleTab / per-branch treatment lists.
//
// User-reported (วันเพ็ญ LC-26000078): "ใบเสร็จในหน้าใบขายก็ไม่ไปสร้าง".
//
// Graphify confirmed architecturally: _resolveBranchIdForWrite has 24
// EXTRACTED --calls→ edges; createBackendSale + createBackendTreatment
// have ZERO incoming edges from this helper pre-V102. AV89 invariant
// locks both functions to call it.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BC_PATH = resolve(__dirname, '../src/lib/backendClient.js');
const BC_SRC = readFileSync(BC_PATH, 'utf8');

// Helper: extract function body by name (best-effort regex)
function extractFunctionBody(src, fnName) {
  const re = new RegExp(`export async function ${fnName}\\s*\\([^)]*\\)\\s*\\{`, 'g');
  const match = re.exec(src);
  if (!match) return null;
  const start = match.index + match[0].length;
  let depth = 1;
  let i = start;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  return src.slice(start, i - 1);
}

// ─── A. createBackendSale ─────────────────────────────────────────
describe('V102.A — createBackendSale stamps top-level branchId', () => {
  const body = extractFunctionBody(BC_SRC, 'createBackendSale');

  it('A1: function body extracted', () => {
    expect(body).toBeTruthy();
    expect(body).toContain('setDoc(saleDoc');
  });

  it('A2: contains _resolveBranchIdForWrite call', () => {
    expect(body).toMatch(/_resolveBranchIdForWrite\(/);
  });

  it('A3: branchId field placed BEFORE _normalizeSaleData spread (so caller-provided branchId via _resolveBranchIdForWrite early-return wins)', () => {
    const branchIdIdx = body.indexOf('branchId: _resolveBranchIdForWrite');
    const spreadIdx = body.indexOf('..._normalizeSaleData(data)');
    expect(branchIdIdx).toBeGreaterThan(-1);
    expect(spreadIdx).toBeGreaterThan(-1);
    expect(branchIdIdx).toBeLessThan(spreadIdx);
  });

  it('A4: V102 marker comment present', () => {
    expect(body).toMatch(/V102/);
  });
});

// ─── B. updateBackendSale ─────────────────────────────────────────
describe('V102.B — updateBackendSale preserves explicit branchId on update', () => {
  const body = extractFunctionBody(BC_SRC, 'updateBackendSale');

  it('B1: function body extracted', () => {
    expect(body).toBeTruthy();
  });

  it('B2: only patches branchId when data.branchId is non-empty string (preserves cross-branch admin edits)', () => {
    expect(body).toMatch(/typeof\s+data\.branchId\s*===\s*['"]string['"]/);
    expect(body).toMatch(/data\.branchId\.trim\(\)/);
  });

  it('B3: V102 marker comment present', () => {
    expect(body).toMatch(/V102/);
  });

  it('B4: does NOT auto-fill via _resolveBranchIdForWrite (avoid cross-branch corruption)', () => {
    // Critical: explicit-only stamping for update. _resolveBranchIdForWrite
    // would fall back to resolveSelectedBranchId() which is admin's current
    // branch — could overwrite a sale that belongs to a different branch.
    expect(body).not.toMatch(/branchId:\s*_resolveBranchIdForWrite/);
  });
});

// ─── C. createBackendTreatment ────────────────────────────────────
describe('V102.C — createBackendTreatment stamps top-level branchId', () => {
  const body = extractFunctionBody(BC_SRC, 'createBackendTreatment');

  it('C1: function body extracted', () => {
    expect(body).toBeTruthy();
    expect(body).toContain('setDoc(treatmentDoc');
  });

  it('C2: contains _resolveBranchIdForWrite call', () => {
    expect(body).toMatch(/_resolveBranchIdForWrite\(/);
  });

  it('C3: V102 marker present', () => {
    expect(body).toMatch(/V102/);
  });

  it('C4: stamps via topLevelPatch.branchId (consistent with sibling patches)', () => {
    expect(body).toMatch(/topLevelPatch\.branchId\s*=\s*_resolveBranchIdForWrite/);
  });
});

// ─── D. updateBackendTreatment ────────────────────────────────────
describe('V102.D — updateBackendTreatment preserves explicit branchId', () => {
  const body = extractFunctionBody(BC_SRC, 'updateBackendTreatment');

  it('D1: function body extracted', () => {
    expect(body).toBeTruthy();
  });

  it('D2: only patches branchId when detail.branchId is non-empty string', () => {
    expect(body).toMatch(/typeof\s+detail\.branchId\s*===\s*['"]string['"]/);
    expect(body).toMatch(/detail\.branchId\.trim\(\)/);
  });

  it('D3: V102 marker present', () => {
    expect(body).toMatch(/V102/);
  });
});

// ─── E. AV89 cross-link ───────────────────────────────────────────
describe('V102.E — AV89 invariant exists in SKILL.md', () => {
  it('E1: AV89 entry present', () => {
    const skill = readFileSync(resolve(__dirname, '../.claude/skills/audit-anti-vibe-code/SKILL.md'), 'utf8');
    expect(skill).toMatch(/### AV89\b/);
    expect(skill).toContain('V102');
    expect(skill).toContain('_resolveBranchIdForWrite');
  });

  it('E2: AV89 documents BSA branch-scoped writers must stamp', () => {
    const skill = readFileSync(resolve(__dirname, '../.claude/skills/audit-anti-vibe-code/SKILL.md'), 'utf8');
    expect(skill).toMatch(/Primary writers.*branch-scoped.*MUST stamp/i);
  });
});

// ─── F. Pure simulator — V102 stamp behavior ─────────────────────
// Mirrors the V102 logic precisely so we can chain mock data through it.
function v102StampCreateSale(data, fallbackBranchId) {
  // Simulate createBackendSale's stamping logic
  const resolved = (data && typeof data.branchId === 'string' && data.branchId.trim())
    ? data.branchId
    : (fallbackBranchId || null);
  return {
    saleId: 'INV-MOCK',
    branchId: resolved, // V102
    customerId: data.customerId,
    netTotal: data.billing?.netTotal,
  };
}

function v102StampUpdateSale(existingDoc, data) {
  const patch = { ...data, updatedAt: 'now' };
  // V102 defensive: only stamp branchId when explicit non-empty; otherwise
  // delete from patch so existing branchId is preserved (test F6 contract).
  if (data && typeof data.branchId === 'string' && data.branchId.trim()) {
    patch.branchId = data.branchId;
  } else {
    delete patch.branchId;
  }
  return { ...existingDoc, ...patch };
}

describe('V102.F — Stamp behavior simulator', () => {
  it('F1: caller passes branchId → it wins', () => {
    const out = v102StampCreateSale({ customerId: 'C1', branchId: 'BR-A', billing: { netTotal: 100 } }, 'BR-FALLBACK');
    expect(out.branchId).toBe('BR-A');
  });

  it('F2: caller omits branchId → fallback (BSA selectedBranch) wins', () => {
    const out = v102StampCreateSale({ customerId: 'C1', billing: { netTotal: 100 } }, 'BR-NAKHON');
    expect(out.branchId).toBe('BR-NAKHON');
  });

  it('F3: caller passes empty string → fallback wins (empty NOT considered explicit)', () => {
    const out = v102StampCreateSale({ customerId: 'C1', branchId: '', billing: { netTotal: 100 } }, 'BR-FALLBACK');
    expect(out.branchId).toBe('BR-FALLBACK');
  });

  it('F4: update preserves existing branchId when caller omits', () => {
    const existing = { saleId: 'INV-1', branchId: 'BR-OLD', netTotal: 50 };
    const out = v102StampUpdateSale(existing, { netTotal: 60 });
    expect(out.branchId).toBe('BR-OLD');
  });

  it('F5: update REPLACES branchId when caller explicitly passes new value', () => {
    const existing = { saleId: 'INV-1', branchId: 'BR-OLD', netTotal: 50 };
    const out = v102StampUpdateSale(existing, { branchId: 'BR-NEW', netTotal: 60 });
    expect(out.branchId).toBe('BR-NEW');
  });

  it('F6: update IGNORES empty-string branchId (preserves existing)', () => {
    const existing = { saleId: 'INV-1', branchId: 'BR-OLD', netTotal: 50 };
    const out = v102StampUpdateSale(existing, { branchId: '', netTotal: 60 });
    expect(out.branchId).toBe('BR-OLD');
  });
});

// ─── G. Backfill script source-grep ──────────────────────────────
describe('V102.G — Rule M backfill script invariants', () => {
  const SCRIPT_PATH = resolve(__dirname, '../scripts/v102-backfill-branchid-stamp.mjs');
  let scriptSrc = '';
  try { scriptSrc = readFileSync(SCRIPT_PATH, 'utf8'); } catch {}

  it('G1: script exists', () => {
    expect(scriptSrc).toBeTruthy();
  });

  it('G2: two-phase --apply gate', () => {
    expect(scriptSrc).toContain("includes('--apply')");
  });

  it('G3: forensic _v102BackfilledAt stamp + source attribution', () => {
    expect(scriptSrc).toContain('_v102BackfilledAt');
    expect(scriptSrc).toContain('_v102BackfilledSource');
  });

  it('G4: audit doc emission to be_admin_audit', () => {
    expect(scriptSrc).toContain('be_admin_audit');
    expect(scriptSrc).toMatch(/v102-backfill/);
  });

  it('G5: idempotency — skips docs with branchId already set', () => {
    expect(scriptSrc).toMatch(/hasField.*continue|if \(hasField\)/);
  });

  it('G6: nakhonratchasima fallback constant present', () => {
    expect(scriptSrc).toContain('NAKHON_FALLBACK_BRANCH');
    expect(scriptSrc).toContain('BR-1777873556815-26df6480');
  });
});
