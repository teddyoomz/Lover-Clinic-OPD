import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const read = (rel) => readFileSync(path.resolve(process.cwd(), rel), 'utf8');
const backendClient = read('src/lib/backendClient.js');
const scoped = read('src/lib/scopedDataLayer.js');
const rules = read('firestore.rules');

describe('be_assessments — Layer 1 (backendClient)', () => {
  it('exports listenToAssessments / createAssessmentRound / deleteAssessmentRound', () => {
    expect(backendClient).toMatch(/export function listenToAssessments\(/);
    expect(backendClient).toMatch(/export async function createAssessmentRound\(/);
    expect(backendClient).toMatch(/export async function deleteAssessmentRound\(/);
  });
  it('listener is marked __universal__ (no branch injection by useBranchAwareListener)', () => {
    expect(backendClient).toMatch(/listenToAssessments\.__universal__\s*=\s*true/);
  });
  it('listener queries by customerId + V38-safe spread (docId wins)', () => {
    expect(backendClient).toMatch(/where\('customerId',\s*'==',\s*String\(customerId\)\)/);
    expect(backendClient).toMatch(/\.\.\.d\.data\(\),\s*id:\s*d\.id/); // V38 spread order
  });
  it('round id uses crypto (Rule C2), not Math.random', () => {
    const block = backendClient.slice(backendClient.indexOf('createAssessmentRound'), backendClient.indexOf('deleteAssessmentRound'));
    expect(block).toMatch(/crypto\.getRandomValues/);
    expect(block).not.toMatch(/Math\.random\(/); // a CALL (the "no Math.random" comment has no paren)
    expect(block).toMatch(/status:\s*'pending'/);
  });
});

describe('be_assessments — Layer 2 (scopedDataLayer)', () => {
  it('listener re-exported as universal', () => {
    expect(scoped).toMatch(/export const listenToAssessments = _makeUniversalListener\('listenToAssessments'\)/);
  });
  it('writers pass-through to raw', () => {
    expect(scoped).toMatch(/export const createAssessmentRound = \(\.\.\.args\) => raw\.createAssessmentRound\(\.\.\.args\)/);
    expect(scoped).toMatch(/export const deleteAssessmentRound = \(\.\.\.args\) => raw\.deleteAssessmentRound\(\.\.\.args\)/);
  });
});

describe('be_assessments — firestore.rules (deletable, unlike append-only ledgers)', () => {
  it('has a be_assessments match block', () => {
    expect(rules).toMatch(/match \/be_assessments\/\{assessmentId\}/);
  });
  it('delete is allowed for clinic staff (NOT "if false")', () => {
    const block = rules.slice(rules.indexOf('match /be_assessments'), rules.indexOf('match /be_assessments') + 400);
    expect(block).toMatch(/allow delete:\s*if isClinicStaff\(\)/);
    expect(block).not.toMatch(/allow update, delete:\s*if false/);
    expect(block).toMatch(/allow read:\s*if isClinicStaff\(\)/);
    expect(block).toMatch(/allow create:\s*if isClinicStaff\(\)/);
  });
});
