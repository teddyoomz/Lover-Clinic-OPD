// ─── BS-C — Customer schema + write contract ─────────────────────────
// Pure helper unit tests for customerValidation.js + source-grep guards
// for backendClient.js (addCustomer stamp on CREATE; updateCustomerFromForm
// IMMUTABILITY) + cloneOrchestrator.js (preserve-on-resync semantic).
//
// V12 multi-reader-sweep guard: every customer-doc CREATE path stamps
// branchId; every UPDATE path strips branchId. Audit grep below catches
// future regressions where someone reintroduces branchId in the patch
// shape of updateCustomerFromForm.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  emptyCustomerForm,
  normalizeCustomer,
  validateCustomer,
} from '../src/lib/customerValidation.js';

const backendClientSrc = readFileSync(
  resolve(__dirname, '../src/lib/backendClient.js'),
  'utf-8',
);
const cloneSrc = readFileSync(
  resolve(__dirname, '../src/lib/cloneOrchestrator.js'),
  'utf-8',
);
const customerCreatePageSrc = readFileSync(
  resolve(__dirname, '../src/components/backend/CustomerCreatePage.jsx'),
  'utf-8',
);

describe('BS-C.1 — customerValidation schema declares branchId', () => {
  it('emptyCustomerForm has branchId: ""', () => {
    const form = emptyCustomerForm();
    expect(form).toHaveProperty('branchId');
    expect(form.branchId).toBe('');
  });

  it('normalizeCustomer trims branchId when string', () => {
    const out = normalizeCustomer({ firstname: 'A', branchId: '  BR-TEST  ' });
    expect(out.branchId).toBe('BR-TEST');
  });

  it('normalizeCustomer preserves empty branchId', () => {
    const out = normalizeCustomer({ firstname: 'A', branchId: '' });
    expect(out.branchId).toBe('');
  });

  it('validateCustomer accepts branchId ≤ 100 chars', () => {
    const fail = validateCustomer({ firstname: 'A', hn_no: 'LC-1', branchId: 'BR-A' });
    expect(fail).toBeNull();
  });

  it('validateCustomer rejects branchId > 100 chars', () => {
    const long = 'X'.repeat(101);
    const fail = validateCustomer({ firstname: 'A', hn_no: 'LC-1', branchId: long });
    expect(fail).not.toBeNull();
    expect(fail[0]).toBe('branchId');
  });
});

describe('BS-C.2 — addCustomer stamps branchId on CREATE', () => {
  it('addCustomer accepts branchId opt with fallback chain', () => {
    expect(backendClientSrc).toMatch(/export async function addCustomer/);
    // Fallback chain: opts.branchId > resolveSelectedBranchId() > null
    expect(backendClientSrc).toMatch(/resolveSelectedBranchId/);
  });

  it('addCustomer doc payload contains branchId field', () => {
    // Slice from addCustomer fn definition to next "export async function"
    const addStart = backendClientSrc.indexOf('export async function addCustomer');
    expect(addStart).toBeGreaterThan(0);
    const addBlock = backendClientSrc.slice(addStart, addStart + 5000);
    expect(addBlock).toMatch(/branchId\s*:\s*resolvedBranchId/);
  });

  it('imports resolveSelectedBranchId from branchSelection (pure JS, no React leak)', () => {
    // Phase BS — V36.G.51 audit forbids backendClient.js from importing
    // BranchContext.jsx. The pure JS module branchSelection.js exports
    // resolveSelectedBranchId for non-React callers.
    expect(backendClientSrc).toMatch(
      /import\s+\{\s*resolveSelectedBranchId\s*\}\s+from\s+['"][^'"]*branchSelection/,
    );
  });
});

describe('BS-C.3 — updateCustomerFromForm enforces branchId IMMUTABILITY', () => {
  it('updateCustomerFromForm does NOT destructure branchId from opts', () => {
    const updStart = backendClientSrc.indexOf('export async function updateCustomerFromForm');
    expect(updStart).toBeGreaterThan(0);
    const updBlock = backendClientSrc.slice(updStart, updStart + 3000);
    // The destructure line must omit branchId
    expect(updBlock).toMatch(/const\s+\{\s*updatedBy[^}]*\}\s*=\s*opts/);
    expect(updBlock).not.toMatch(/const\s+\{[^}]*\bbranchId\b[^}]*\}\s*=\s*opts/);
  });

  it('updateCustomerFromForm strips branchId from form before normalize', () => {
    const updStart = backendClientSrc.indexOf('export async function updateCustomerFromForm');
    const updBlock = backendClientSrc.slice(updStart, updStart + 3000);
    expect(updBlock).toMatch(/delete\s+safe\.branchId/);
  });

  it('updateCustomerFromForm strips branchId from final patch (defensive)', () => {
    // Slice large enough to cover the full function body (~60 lines).
    const updStart = backendClientSrc.indexOf('export async function updateCustomerFromForm');
    const updBlock = backendClientSrc.slice(updStart, updStart + 5000);
    expect(updBlock).toMatch(/delete\s+patch\.branchId/);
  });

  it('updateCustomerFromForm contains an immutability comment marker', () => {
    // The IMMUTABILITY contract is documented in the JSDoc ABOVE the export.
    // Include the preceding ~1500 chars so the slice covers both the doc
    // block and the function body.
    const updStart = backendClientSrc.indexOf('export async function updateCustomerFromForm');
    const sliceStart = Math.max(0, updStart - 1500);
    const updBlock = backendClientSrc.slice(sliceStart, updStart + 5000);
    expect(updBlock).toMatch(/IMMUTABILITY|immutable|immutability/i);
  });
});

describe('BS-C.4 — cloneOrchestrator stamps branchId on FIRST clone, preserves on resync', () => {
  it('imports resolveSelectedBranchId from branchSelection (pure JS, no React leak)', () => {
    // Phase BS — same V36.G.51 audit applies: lib code can't import .jsx.
    expect(cloneSrc).toMatch(
      /import\s+\{\s*resolveSelectedBranchId\s*\}\s+from\s+['"][^'"]*branchSelection/,
    );
  });

  it('reads existing customer doc to preserve branchId on resync', () => {
    expect(cloneSrc).toMatch(/preservedBranchId/);
    expect(cloneSrc).toMatch(/getCustomer\(proClinicId\)/);
  });

  it('initial customerData payload includes branchId field', () => {
    expect(cloneSrc).toMatch(/branchId\s*:\s*branchIdForClone/);
  });

  it('falls back to resolveSelectedBranchId when no existing branchId', () => {
    expect(cloneSrc).toMatch(/preservedBranchId\s*\|\|\s*resolveSelectedBranchId\(\)/);
  });
});

describe('BS-C.5 — CustomerCreatePage hooks branchId from BranchContext', () => {
  it('imports useSelectedBranch', () => {
    expect(customerCreatePageSrc).toMatch(
      /import\s+\{\s*useSelectedBranch\s*\}\s+from\s+['"][^'"]*BranchContext/,
    );
  });

  it('exposes branchId prop as override (default null) but resolves from context', () => {
    expect(customerCreatePageSrc).toMatch(/branchId:\s*branchIdProp\s*=\s*null/);
    expect(customerCreatePageSrc).toMatch(/useSelectedBranch\(\)/);
    expect(customerCreatePageSrc).toMatch(/branchIdProp\s*\|\|\s*branchIdFromContext/);
  });

  it('passes branchId to addCustomer (CREATE path)', () => {
    // Search the handleSubmit area for addCustomer({...branchId...})
    const addCustomerCall = customerCreatePageSrc.match(/addCustomer\(form,\s*\{[^}]*\}/);
    expect(addCustomerCall).not.toBeNull();
    expect(addCustomerCall[0]).toMatch(/branchId/);
  });

  it('does NOT pass branchId to updateCustomerFromForm (immutability)', () => {
    const updCall = customerCreatePageSrc.match(/updateCustomerFromForm\([^)]+,\s*form,\s*\{[^}]*\}/);
    expect(updCall).not.toBeNull();
    expect(updCall[0]).not.toMatch(/\bbranchId\b/);
  });
});
