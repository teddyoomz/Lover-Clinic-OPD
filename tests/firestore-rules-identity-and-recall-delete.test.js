// Task A5 — source-grep locks on the firestore.rules changes (Part A).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const RULES = readFileSync(resolve(__dir, '../firestore.rules'), 'utf8');
const IRON = readFileSync(resolve(__dir, '../.claude/rules/01-iron-clad.md'), 'utf8');

describe('A5 firestore.rules — be_customer_identity', () => {
  it('has a be_customer_identity match block', () => {
    expect(RULES).toMatch(/match \/be_customer_identity\/\{claimKey\}/);
  });
  it('get is staff-gated; list is denied (PII, no enumeration)', () => {
    const block = RULES.slice(RULES.indexOf('match /be_customer_identity'), RULES.indexOf('match /be_customer_identity') + 260);
    expect(block).toMatch(/allow get: if isClinicStaff\(\)/);
    expect(block).toMatch(/allow list: if false/);
    expect(block).toMatch(/allow create, update, delete: if isClinicStaff\(\)/);
  });
  it('does NOT use create-only-immutable (delete/update needed for cascade/edit)', () => {
    const block = RULES.slice(RULES.indexOf('match /be_customer_identity'), RULES.indexOf('match /be_customer_identity') + 260);
    expect(block).not.toMatch(/allow update: if false/);
    expect(block).not.toMatch(/allow delete: if false/);
  });
});

describe('A5 firestore.rules — be_recall_cases hard-delete narrowed', () => {
  it('delete is now isClinicStaff (was `if false`)', () => {
    const i = RULES.indexOf('match /be_recall_cases');
    const block = RULES.slice(i, i + 700);
    expect(block).toMatch(/allow delete: if isClinicStaff\(\)/);
    expect(block).not.toMatch(/allow delete: if false/);
  });
});

describe('A5 Rule B probe list updated', () => {
  it('iron-clad probe list includes be_customer_identity anon-deny + be_recall_cases', () => {
    expect(IRON).toMatch(/be_customer_identity.*403|403.*be_customer_identity/s);
    expect(IRON).toMatch(/be_recall_cases\/anything/);
    expect(IRON).toMatch(/1, 5, 6, 7, 8, 9, 12, 15, 16, 17/);
  });
});
