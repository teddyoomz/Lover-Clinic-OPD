// Task A2 — source-grep regression locks on the addCustomer atomic-claim wiring.
// The BEHAVIORAL proof (real concurrency, race-safety) is the Rule Q L2 e2e
// scripts/e2e-dup-customer-and-recall.mjs — a mock of runTransaction here would
// shadow reality (V66). This file locks the structure so it can't silently drift.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(__dir, '../src/lib/backendClient.js'), 'utf8');
// Isolate addCustomer body for tighter assertions.
const start = SRC.indexOf('export async function addCustomer(');
const next = SRC.indexOf('export async function findCustomersByField(');
const FN = SRC.slice(start, next);

describe('A2 addCustomer atomic claim — wiring', () => {
  it('derives the claim key from canonical identity fields', () => {
    expect(FN).toMatch(/deriveClaimKey\(\s*preNormalized\.citizen_id\s*,\s*preNormalized\.passport_id\s*\)/);
  });
  it('pre-checks the claim BEFORE uploads (fail-fast, no orphan)', () => {
    const preIdx = FN.indexOf('getDoc(identityClaimDoc(claimKey))');
    const uploadIdx = FN.indexOf("await import('./storageClient.js')");
    expect(preIdx).toBeGreaterThan(-1);
    expect(uploadIdx).toBeGreaterThan(-1);
    expect(preIdx).toBeLessThan(uploadIdx);
  });
  it('throws DuplicateIdentityError on the pre-check', () => {
    expect(FN).toMatch(/throw new DuplicateIdentityError\(preSnap\.data\(\)\.customerId, claimKey\)/);
  });
  it('claims + writes the customer doc inside ONE runTransaction', () => {
    expect(FN).toMatch(/await runTransaction\(db, async \(tx\) => \{/);
    expect(FN).toMatch(/resolveClaimAction\(\{/);
    expect(FN).toMatch(/tx\.set\(customerDoc\(customerId\), docPayload\)/);
  });
  it('override appends to linkedCustomerIds + stamps the duplicate flags', () => {
    expect(FN).toMatch(/decision\.action === 'append'/);
    expect(FN).toMatch(/linkedCustomerIds:\s*\[\.\.\.linked, customerId\]/);
    expect(FN).toMatch(/_duplicateOfCustomerId = claimData\.customerId/);
  });
  it('denormalizes _identityClaimKey on the customer doc', () => {
    expect(FN).toMatch(/_identityClaimKey:\s*claimKey/);
  });
  it('walk-in (null key) → plain setDoc, no claim', () => {
    expect(FN).toMatch(/\}\s*else\s*\{\s*\n\s*await setDoc\(customerDoc\(customerId\), docPayload, \{ merge: false \}\)/);
  });
  it('cleans up orphaned uploads on a tx-failure (race-dup)', () => {
    expect(FN).toMatch(/Promise\.allSettled\(uploadedPaths\.map\(p => deleteFile\(p\)\)\)/);
  });
  it('accepts the overrideDuplicate opt', () => {
    expect(FN).toMatch(/overrideDuplicate = false/);
  });
});
