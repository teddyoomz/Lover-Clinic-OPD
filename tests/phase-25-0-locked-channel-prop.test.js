// Phase 25.0c (2026-05-09) — AppointmentFormModal `lockedChannel` prop.
//
// Source-grep regression guards for the new prop:
//  1. prop declared with default null
//  2. safeLockedChannel validation (mirror of safeLockedType)
//  3. defaultFormData branches respect lockedChannel
//  4. payload save path: safeLockedChannel || formData.channel
//  5. UI render: locked → static read-only chip with 🔒 + data-testid
//  6. UI render: unlocked → existing <select> with all CHANNELS
//
// (Behavioral RTL mount tests are deferred — modal has heavy Firestore +
// branch context dependencies; source-grep + the Phase 25.0 flow-simulate
// test cover the contract.)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const SRC = readFileSync('src/components/backend/AppointmentFormModal.jsx', 'utf-8');

describe('Phase 25.0c — AppointmentFormModal lockedChannel prop', () => {
  it('P25.0c-L1 prop declared with default null', () => {
    expect(SRC).toMatch(/lockedChannel\s*=\s*null,/);
  });

  it('P25.0c-L2 safeLockedChannel validation against CHANNELS list', () => {
    expect(SRC).toMatch(/const safeLockedChannel = CHANNELS\.includes\(lockedChannel\)\s*\?\s*lockedChannel\s*:\s*null;/);
  });

  it('P25.0c-L3 edit-mode defaultFormData uses lockedChannel || appt.channel || \'\'', () => {
    expect(SRC).toMatch(/channel:\s*safeLockedChannel\s*\|\|\s*appt\.channel/);
  });

  it('P25.0c-L4 create-mode defaultFormData spread includes safeLockedChannel', () => {
    expect(SRC).toMatch(/safeLockedChannel\s*\?\s*\{\s*channel:\s*safeLockedChannel\s*\}/);
  });

  it('P25.0c-L5 save-payload uses safeLockedChannel || formData.channel', () => {
    expect(SRC).toMatch(/channel:\s*safeLockedChannel\s*\|\|\s*formData\.channel/);
  });

  it('P25.0c-L6 UI render: locked chip with 🔒 + data-testid="locked-channel-chip"', () => {
    expect(SRC).toMatch(/data-testid="locked-channel-chip"/);
    expect(SRC).toMatch(/data-locked-channel=\{safeLockedChannel\}/);
  });

  it('P25.0c-L7 UI render: unlocked path keeps the existing <select> + all CHANNELS', () => {
    // The select still exists for the unlocked branch.
    expect(SRC).toMatch(/CHANNELS\.map\(c\s*=>\s*<option key=\{c\} value=\{c\}>/);
  });

  it('P25.0c-L8 conditional render: ternary between locked chip + select', () => {
    expect(SRC).toMatch(/safeLockedChannel \? \(/);
  });

  it('P25.0c-L9 phase comment marker present (institutional memory)', () => {
    expect(SRC).toMatch(/Phase 25\.0c/);
  });
});
