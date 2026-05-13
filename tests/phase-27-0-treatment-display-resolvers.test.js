// V27.0 unit — treatmentDisplayResolvers
// Tests: 4 helpers × fallback chain × adversarial inputs

import { describe, it, expect } from 'vitest';
import {
  resolveDoctorDisplayName,
  resolveAssistantDisplayName,
  resolveBranchDisplayName,
  resolveAssistantsDisplay,
} from '../src/lib/treatmentDisplayResolvers.js';

describe('R1 — resolveDoctorDisplayName', () => {
  it('R1.1 returns live name when doctorMap has id', () => {
    const map = new Map([['DOC-1', { name: 'Dr. Foo' }]]);
    expect(resolveDoctorDisplayName('DOC-1', map, 'cached')).toBe('Dr. Foo');
  });
  it('R1.2 falls back to cachedName when map missing entry', () => {
    const map = new Map();
    expect(resolveDoctorDisplayName('DOC-1', map, 'cached')).toBe('cached');
  });
  it('R1.3 falls back to cachedName when map is null', () => {
    expect(resolveDoctorDisplayName('DOC-1', null, 'cached')).toBe('cached');
  });
  it('R1.4 returns empty when map missing AND cachedName empty', () => {
    expect(resolveDoctorDisplayName('DOC-1', new Map(), '')).toBe('');
  });
  it('R1.5 NEVER returns the raw doctorId (Rule O class mirror)', () => {
    expect(resolveDoctorDisplayName('DOC-mov2p9c0', new Map(), '')).not.toContain('DOC-');
    expect(resolveDoctorDisplayName('DOC-mov2p9c0', new Map(), '')).toBe('');
  });
  it('R1.6 trims live name + cached name', () => {
    const map = new Map([['DOC-1', { name: '  Dr. Foo  ' }]]);
    expect(resolveDoctorDisplayName('DOC-1', map, '')).toBe('Dr. Foo');
    expect(resolveDoctorDisplayName('DOC-2', new Map(), '  cached  ')).toBe('cached');
  });
  it('R1.7 handles whitespace-only live name → falls through to cached', () => {
    const map = new Map([['DOC-1', { name: '   ' }]]);
    expect(resolveDoctorDisplayName('DOC-1', map, 'cached-fallback')).toBe('cached-fallback');
  });
  it('R1.8 handles non-string cached name → returns empty', () => {
    expect(resolveDoctorDisplayName('DOC-1', new Map(), 123)).toBe('');
    expect(resolveDoctorDisplayName('DOC-1', new Map(), null)).toBe('');
    expect(resolveDoctorDisplayName('DOC-1', new Map(), { name: 'x' })).toBe('');
  });
});

describe('R2 — resolveAssistantDisplayName', () => {
  it('R2.1 resolves entry={id} via doctorMap first', () => {
    const doctorMap = new Map([['DOC-1', { name: 'Dr. Foo' }]]);
    const staffMap = new Map([['DOC-1', { name: 'WRONG' }]]);
    expect(resolveAssistantDisplayName({ id: 'DOC-1' }, doctorMap, staffMap)).toBe('Dr. Foo');
  });
  it('R2.2 falls back to staffMap when doctorMap missing', () => {
    const staffMap = new Map([['STAFF-1', { name: 'Asst. Bar' }]]);
    expect(resolveAssistantDisplayName({ id: 'STAFF-1' }, new Map(), staffMap)).toBe('Asst. Bar');
  });
  it('R2.3 falls back to entry.name cache when both maps miss', () => {
    expect(resolveAssistantDisplayName({ id: 'X', name: 'cached' }, new Map(), new Map())).toBe('cached');
  });
  it('R2.4 returns empty when entry is just a string id with no map hit', () => {
    expect(resolveAssistantDisplayName('STAFF-1', new Map(), new Map())).toBe('');
  });
  it('R2.5 returns empty for null/undefined entry', () => {
    expect(resolveAssistantDisplayName(null, new Map(), new Map())).toBe('');
    expect(resolveAssistantDisplayName(undefined, new Map(), new Map())).toBe('');
  });
  it('R2.6 NEVER returns raw id string', () => {
    expect(resolveAssistantDisplayName({ id: 'STAFF-XYZ' }, new Map(), new Map())).not.toContain('STAFF-');
    expect(resolveAssistantDisplayName({ id: 'STAFF-XYZ' }, new Map(), new Map())).toBe('');
  });
});

describe('R3 — resolveBranchDisplayName', () => {
  it('R3.1 returns live name from branchMap', () => {
    const map = new Map([['BR-1', { name: 'นครราชสีมา' }]]);
    expect(resolveBranchDisplayName('BR-1', map, 'cache')).toBe('นครราชสีมา');
  });
  it('R3.2 falls back to cached name', () => {
    expect(resolveBranchDisplayName('BR-1', new Map(), 'cache')).toBe('cache');
  });
  it('R3.3 returns empty when nothing resolves', () => {
    expect(resolveBranchDisplayName('BR-1', new Map(), '')).toBe('');
  });
  it('R3.4 NEVER returns raw branchId', () => {
    expect(resolveBranchDisplayName('BR-1777873556815-26df6480', new Map(), '')).not.toContain('BR-');
  });
});

describe('R4 — resolveAssistantsDisplay (composer)', () => {
  it('R4.1 joins resolved names with ", "', () => {
    const dm = new Map([['DOC-1', { name: 'A' }], ['DOC-2', { name: 'B' }]]);
    expect(resolveAssistantsDisplay([{ id: 'DOC-1' }, { id: 'DOC-2' }], dm, new Map())).toBe('A, B');
  });
  it('R4.2 filters out empty resolution results', () => {
    const dm = new Map([['DOC-1', { name: 'A' }]]);
    expect(resolveAssistantsDisplay([{ id: 'DOC-1' }, { id: 'X' }], dm, new Map())).toBe('A');
  });
  it('R4.3 returns empty string for empty / null array', () => {
    expect(resolveAssistantsDisplay([], new Map(), new Map())).toBe('');
    expect(resolveAssistantsDisplay(null, new Map(), new Map())).toBe('');
    expect(resolveAssistantsDisplay(undefined, new Map(), new Map())).toBe('');
  });
});
