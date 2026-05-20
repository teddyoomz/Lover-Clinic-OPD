import fs from 'node:fs';
import { describe, it, expect } from 'vitest';

describe('tablet-chart rules + index (T9)', () => {
  const r = fs.readFileSync('firestore.rules', 'utf8');
  it('R1 both collections gated by isClinicStaff', () => {
    expect(r).toMatch(/match \/be_chart_tablet_presence\/\{deviceId\} \{\s*allow read, write: if isClinicStaff\(\);/);
    expect(r).toMatch(/match \/be_chart_edit_sessions\/\{sessionId\} \{\s*allow read, write: if isClinicStaff\(\);/);
  });
  it('R2 composite index declared (branchId + tabletDeviceId + status)', () => {
    const idx = JSON.parse(fs.readFileSync('firestore.indexes.json', 'utf8'));
    const ix = idx.indexes.find(i => i.collectionGroup === 'be_chart_edit_sessions');
    expect(ix).toBeTruthy();
    expect(ix.fields.map(f => f.fieldPath)).toEqual(['branchId', 'tabletDeviceId', 'status']);
  });
  it('R3 both collections classified in the branch-coverage matrix', () => {
    const cov = fs.readFileSync('tests/branch-collection-coverage.test.js', 'utf8');
    expect(cov).toMatch(/'be_chart_tablet_presence':/);
    expect(cov).toMatch(/'be_chart_edit_sessions':/);
  });
});
