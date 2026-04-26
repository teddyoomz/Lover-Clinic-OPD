// V33-customer-create — source-grep regression guards for firestore.rules
// + storage.rules. These tests lock in:
//   - be_customer_counter is open to clinic staff
//   - storage.rules uses claim-based isClinicStaff() (NOT email regex)
//   - be_customers storage path has explicit MIME + size gating
//   - branch-collection-coverage matrix knows about be_customer_counter

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

let firestoreRules = '';
let storageRules = '';

beforeAll(async () => {
  firestoreRules = await readFile('firestore.rules', 'utf-8');
  storageRules = await readFile('storage.rules', 'utf-8');
});

import { beforeAll } from 'vitest';

describe('V33.R — firestore.rules updates', () => {
  it('R1 — be_customer_counter rule block exists', () => {
    expect(firestoreRules).toMatch(/match \/be_customer_counter\/\{docId\}/);
  });
  it('R2 — be_customer_counter open to clinic staff (read+write)', () => {
    // Match the full block including the inner allow rule (greedy until matching `}`).
    const block = firestoreRules.match(/match \/be_customer_counter\/\{docId\}\s*\{[\s\S]*?\n\s*\}/);
    expect(block).toBeTruthy();
    expect(block[0]).toMatch(/allow read, write: if isClinicStaff\(\);/);
  });
  it('R3 — be_customers rule still uses isClinicStaff (unchanged)', () => {
    expect(firestoreRules).toMatch(/match \/be_customers\/\{customerId\}[\s\S]*?allow read, write: if isClinicStaff\(\);/);
  });
  it('R4 — V33 marker comment present', () => {
    expect(firestoreRules).toMatch(/V33-customer-create/);
  });
});

describe('V33.S — storage.rules V26 catch-up migration', () => {
  it('S1 — claim-based isClinicStaff() helper present', () => {
    expect(storageRules).toMatch(/function isClinicStaff\(\)/);
    expect(storageRules).toMatch(/request\.auth\.token\.isClinicStaff == true/);
    expect(storageRules).toMatch(/request\.auth\.token\.admin == true/);
  });
  it('S2 — old email regex GONE from active rules (comments allowed for V26 history)', () => {
    // Strip block comments + line comments so we only assert against active rule code.
    const stripped = storageRules
      .replace(/\/\/[^\n]*/g, '')      // single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, ''); // block comments
    expect(stripped).not.toMatch(/loverclinic\[\.\]com/);
    expect(stripped).not.toMatch(/loverclinic\.com/);
    expect(stripped).not.toMatch(/token\.email\.matches/);
  });
  it('S3 — be_customers explicit storage path present', () => {
    expect(storageRules).toMatch(/match \/uploads\/be_customers\/\{customerId\}\/\{file=\*\*\}/);
  });
  it('S4 — be_customers path enforces 10MB + image/pdf gate', () => {
    const block = storageRules.match(/match \/uploads\/be_customers[\s\S]*?\n    \}/);
    expect(block).toBeTruthy();
    expect(block[0]).toMatch(/request\.resource\.size < 10 \* 1024 \* 1024/);
    expect(block[0]).toMatch(/contentType\.matches\('image\/\.\*'\)/);
    expect(block[0]).toMatch(/contentType == 'application\/pdf'/);
  });
  it('S5 — generic /uploads/{collection}/ fallback also uses isClinicStaff()', () => {
    const block = storageRules.match(/match \/uploads\/\{collection\}[\s\S]*?\n    \}/);
    expect(block).toBeTruthy();
    expect(block[0]).toMatch(/allow create: if isClinicStaff\(\)/);
  });
  it('S6 — default-deny still in place', () => {
    expect(storageRules).toMatch(/match \/\{allPaths=\*\*\}[\s\S]*?allow read, write: if false;/);
  });
  it('S7 — V33 marker comment present in storage.rules', () => {
    expect(storageRules).toMatch(/V33-customer-create/);
  });
});
