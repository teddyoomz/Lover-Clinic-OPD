import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

// ─── Task 1: api/patient-view.js — endpoint contract (source-grep) ───
describe('api/patient-view.js — endpoint contract', () => {
  const SRC = readFileSync('api/patient-view.js', 'utf8');

  it('E1: admin SDK init (getApps guard + PEM newline conversion)', () => {
    expect(SRC).toMatch(/getApps\(\)/);
    expect(SRC).toMatch(/FIREBASE_ADMIN_PRIVATE_KEY/);
    expect(SRC).toMatch(/split\('\\\\n'\)\.join\('\\n'\)|replace\(\/\\\\n\/g/);
  });
  it('E2: canonical data path artifacts/{APP_ID}/public/data', () => {
    expect(SRC).toMatch(/\.collection\('artifacts'\)\.doc\(APP_ID\)\.collection\('public'\)\.doc\('data'\)/);
  });
  it('E3: unified resolve — be_customers AND opd_sessions by patientLinkToken', () => {
    expect(SRC).toMatch(/be_customers/);
    expect(SRC).toMatch(/opd_sessions/);
    expect(SRC).toMatch(/patientLinkToken/);
  });
  it('E4: gates on patientLinkEnabled', () => {
    expect(SRC).toMatch(/patientLinkEnabled\s*!==\s*true/);
  });
  it('E5: reads be_appointments + resolves branch name from be_branches', () => {
    expect(SRC).toMatch(/be_appointments/);
    expect(SRC).toMatch(/be_branches/);
  });
  it('E6: formats appt date with full month (fmtThaiDate monthStyle full)', () => {
    expect(SRC).toMatch(/fmtThaiDate/);
    expect(SRC).toMatch(/monthStyle:\s*'full'/);
  });
  it('E6b: maps appointment time from startTime (real field, not legacy `time` only)', () => {
    expect(SRC).toMatch(/a\.startTime/);
  });
  it('E7: field-minimized — NO nationalId / idCard / citizenId leaked', () => {
    expect(SRC).not.toMatch(/nationalId|idCard|citizenId/i);
  });
  it('E8: NOT admin-gated (public anon) — no verifyAdminToken', () => {
    expect(SRC).not.toMatch(/verifyAdminToken/);
  });
  it('E9: 404 path for not-found / disabled', () => {
    expect(SRC).toMatch(/404/);
    expect(SRC).toMatch(/NOT_FOUND/);
    expect(SRC).toMatch(/DISABLED/);
  });
  it('E10: future-only + excludes cancelled appointments', () => {
    expect(SRC).toMatch(/>=\s*today|>= today/);
    expect(SRC).toMatch(/status\s*!==\s*'cancelled'/);
  });
});

// ─── Task 2: backendClient + scopedDataLayer helpers (source-grep) ───
describe('backendClient — customer patient-link helpers', () => {
  const BC = readFileSync('src/lib/backendClient.js', 'utf8');
  const SDL = readFileSync('src/lib/scopedDataLayer.js', 'utf8');

  it('H1: 3 helpers exported from backendClient', () => {
    expect(BC).toMatch(/export async function generateCustomerPatientLink/);
    expect(BC).toMatch(/export async function setCustomerPatientLinkEnabled/);
    expect(BC).toMatch(/export async function revokeCustomerPatientLink/);
  });
  it('H2: token via crypto.getRandomValues (Rule C2 — not Math.random)', () => {
    const i = BC.indexOf('generateCustomerPatientLink');
    const block = BC.slice(i, i + 600);
    expect(block).toMatch(/crypto\.getRandomValues/);
    expect(block).not.toMatch(/Math\.random/);
  });
  it('H3: writes patientLinkToken + patientLinkEnabled on be_customers (customerDoc)', () => {
    const i = BC.indexOf('generateCustomerPatientLink');
    const block = BC.slice(i, i + 900);
    expect(block).toMatch(/patientLinkToken/);
    expect(block).toMatch(/patientLinkEnabled/);
    expect(block).toMatch(/customerDoc/);
  });
  it('H4: scopedDataLayer re-exports all 3 (universal pass-through)', () => {
    expect(SDL).toMatch(/generateCustomerPatientLink/);
    expect(SDL).toMatch(/setCustomerPatientLinkEnabled/);
    expect(SDL).toMatch(/revokeCustomerPatientLink/);
  });
});
