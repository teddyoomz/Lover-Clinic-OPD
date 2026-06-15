// Task 3 source-grep — R1 confirmInfo on session + R3 supersede (Firestore behavior proven by Task 8 L2 e2e)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const bc = readFileSync('src/lib/backendClient.js', 'utf8');
const sdl = readFileSync('src/lib/scopedDataLayer.js', 'utf8');

describe('R1 confirmInfo + R3 supersede source contract', () => {
  it('createAssessmentSession accepts confirmInfo param', () => {
    expect(bc).toMatch(/createAssessmentSession\(\{[^}]*confirmInfo/);
  });
  it('createAssessmentSession stores confirmInfo || null on the session doc', () => {
    expect(bc).toMatch(/confirmInfo:\s*confirmInfo\s*\|\|\s*null/);
  });
  it('supersedePendingFollowups exists', () => {
    expect(bc).toMatch(/export async function supersedePendingFollowups/);
  });
  it('supersede deletes the linked pending round then the session', () => {
    expect(bc).toMatch(/deleteAssessmentRound\(s\.linkedAssessmentRoundId\)/);
    expect(bc).toMatch(/deleteDoc\(d\.ref\)/);
  });
  it('supersede queries by single-field linkedCustomerId (no composite index)', () => {
    expect(bc).toMatch(/where\('linkedCustomerId',\s*'==',\s*cid\)/);
  });
  it('supersede uses the shouldSupersedeSession predicate (branch/status/formType client-filter)', () => {
    expect(bc).toMatch(/if\s*\(!shouldSupersedeSession\(s,\s*cid,\s*branchId\)\)\s*continue/);
  });
  it('scopedDataLayer re-exports supersedePendingFollowups as pass-through', () => {
    expect(sdl).toMatch(/supersedePendingFollowups\s*=\s*\(\.\.\.args\)\s*=>\s*raw\.supersedePendingFollowups/);
  });
});
