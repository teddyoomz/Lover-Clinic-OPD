// tests/phase-27-0-treatment-branch-flow-simulate.test.js
//
// Phase 27.0 Task 7 (2026-05-14) — Rule I full-flow simulate
// Chains real resolver helpers across realistic treatment data shapes.
// Mirrors the Rule O / V46 flow-simulate pattern (tests/v46-rule-o-live-product-name.test.js).

import { describe, it, expect } from 'vitest';
import {
  resolveDoctorDisplayName,
  resolveAssistantsDisplay,
  resolveBranchDisplayName,
} from '../src/lib/treatmentDisplayResolvers.js';

describe('Phase 27.0 — treatment display resolver flow-simulate', () => {
  // FB1: User fixture — empty cached doctorName + live map has doctor
  it('FB1 live doctorMap hit overrides empty cached name', () => {
    const doctorMap = new Map([
      ['DOC-001', { name: 'นพ.สมชาย ใจดี' }],
    ]);
    const detail = { doctorId: 'DOC-001', doctorName: '' };
    const result = resolveDoctorDisplayName(detail.doctorId, doctorMap, detail.doctorName);
    expect(result).toBe('นพ.สมชาย ใจดี');
    // NEVER returns a raw doc ID
    expect(result).not.toMatch(/^DOC-/);
  });

  // FB2: Post-migration — branchId stamped, live map empty (deleted branch)
  it('FB2 live branchMap miss falls back to cached branchName', () => {
    const branchMap = new Map(); // deleted/missing branch
    const detail = { branchId: 'BR-OLD-999', branchName: 'สาขาสุขุมวิท (เก่า)' };
    const result = resolveBranchDisplayName(detail.branchId, branchMap, detail.branchName);
    expect(result).toBe('สาขาสุขุมวิท (เก่า)');
    // NEVER returns a raw doc ID
    expect(result).not.toMatch(/^BR-/);
  });

  // FB3: Worst-case — both map empty + cached empty → empty string
  it('FB3 both live map and cached empty → empty string not raw ID', () => {
    const doctorMap = new Map();
    const branchMap = new Map();
    const detail = { doctorId: 'DOC-GONE', doctorName: '', branchId: 'BR-GONE', branchName: '' };

    const doctor = resolveDoctorDisplayName(detail.doctorId, doctorMap, detail.doctorName);
    const branch = resolveBranchDisplayName(detail.branchId, branchMap, detail.branchName);

    expect(doctor).toBe('');
    expect(branch).toBe('');
    // Caller renders '—' or placeholder — resolver itself returns ''
    expect(doctor).not.toMatch(/^DOC-/);
    expect(branch).not.toMatch(/^BR-/);
  });

  // FB4: Multi-assistant cross-collection mix (doctorMap + staffMap + UNKNOWN)
  it('FB4 resolveAssistantsDisplay handles doctor + staff + unknown entries', () => {
    const doctorMap = new Map([
      ['DOC-002', { name: 'พญ.วิภา รักษ์สุข' }],
    ]);
    const staffMap = new Map([
      ['STAFF-010', { name: 'คุณ มาลี วงศ์ศรี' }],
    ]);
    const assistants = [
      { id: 'DOC-002', name: 'cached-doctor-name' }, // live doctorMap wins
      { id: 'STAFF-010', name: '' },                  // live staffMap wins
      { id: 'UNKNOWN-999', name: 'ช่างเทคนิค' },      // falls back to cached .name
      { id: 'GONE-000', name: '' },                    // no map + no cached → filtered
    ];
    const result = resolveAssistantsDisplay(assistants, doctorMap, staffMap);
    // Should include live-resolved names + cached fallback
    expect(result).toContain('พญ.วิภา รักษ์สุข');
    expect(result).toContain('คุณ มาลี วงศ์ศรี');
    expect(result).toContain('ช่างเทคนิค');
    // Raw IDs must NOT appear in output
    expect(result).not.toMatch(/DOC-002/);
    expect(result).not.toMatch(/STAFF-010/);
    expect(result).not.toMatch(/UNKNOWN-999/);
    expect(result).not.toMatch(/GONE-000/);
    // Empty entries filtered out
    const parts = result.split(', ').filter(Boolean);
    expect(parts).toHaveLength(3);
  });

  // FB5: Cached overrides empty live name (renamed-but-blank doctor)
  it('FB5 live map entry with blank name falls through to cached name', () => {
    const doctorMap = new Map([
      ['DOC-003', { name: '   ' }], // whitespace-only live entry
    ]);
    const detail = { doctorId: 'DOC-003', doctorName: 'นพ.อดีต ชื่อเดิม' };
    const result = resolveDoctorDisplayName(detail.doctorId, doctorMap, detail.doctorName);
    // _trimmedString('   ') === '' → falls through to cached
    expect(result).toBe('นพ.อดีต ชื่อเดิม');
    expect(result).not.toMatch(/^DOC-/);
  });
});
