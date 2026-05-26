// Per-branch LINE OA on patient-form success screen + button rename (2026-05-26, AV139)
// Item 1: the success-screen "Add LINE OA" card was gated on the global
// clinic_settings.lineOfficialUrl (empty/legacy) → vanished. Fix: source the
// SESSION's branch LINE add-URL (be_branches.settings.lineOaUrl, staff-only) via
// the public /api/branch-line-oa endpoint (anon-safe; admin SDK; returns only the URL).
// Item 2: rename the appointment-card view button "ดูข้อมูล OPD" → "ดูข้อมูลรับเข้า"
// (cosmetic-shell — label only; testid + handler unchanged).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const ENDPOINT = readFileSync('api/branch-line-oa.js', 'utf8');
const PF = readFileSync('src/pages/PatientForm.jsx', 'utf8');
const OLR = readFileSync('src/components/admin/OpdLifecycleRow.jsx', 'utf8');

describe('Item 1 — /api/branch-line-oa endpoint (secure per-branch source)', () => {
  it('A1 reads be_branches settings.lineOaUrl', () => {
    expect(ENDPOINT).toMatch(/be_branches/);
    expect(ENDPOINT).toMatch(/settings\?\.lineOaUrl/);
  });
  it('A2 anon-safe: documents AV139 + returns ONLY lineAddUrl (no whole-doc spread)', () => {
    expect(ENDPOINT).toMatch(/AV139/);
    expect(ENDPOINT).toMatch(/lineAddUrl/);
    expect(ENDPOINT).not.toMatch(/\.\.\.snap\.data\(\)/);
    expect(ENDPOINT).not.toMatch(/\.\.\.data\b/);
  });
  it('A3 validates branchId + emits only https URLs', () => {
    expect(ENDPOINT).toMatch(/BAD_BRANCH_ID/);
    expect(ENDPOINT).toMatch(/\^https:/);
  });
  it('A4 GET-only + admin SDK (mirror api/patient-view secure path)', () => {
    expect(ENDPOINT).toMatch(/METHOD_NOT_ALLOWED/);
    expect(ENDPOINT).toMatch(/firebase-admin\/firestore/);
  });
});

describe('Item 1 — PatientForm consumes the endpoint per-branch', () => {
  it('A5 captures session branchId + fetches /api/branch-line-oa', () => {
    expect(PF).toMatch(/setSessionBranchId\(data\.branchId/);
    expect(PF).toMatch(/\/api\/branch-line-oa\?branchId=/);
  });
  it('A6 LINE card gate prefers branchLineUrl (per-branch) over global clinic setting', () => {
    expect(PF).toMatch(/branchLineUrl \|\| cs\.lineOfficialUrl/);
  });
});

describe('Item 2 — rename ดูข้อมูล OPD → ดูข้อมูลรับเข้า (cosmetic-shell)', () => {
  it('A7 button renamed; old label fully gone', () => {
    expect(OLR).toMatch(/ดูข้อมูลรับเข้า/);
    expect(OLR).not.toMatch(/ดูข้อมูล OPD/);
  });
  it('A8 testid + handler unchanged (cosmetic-shell — label only)', () => {
    expect(OLR).toMatch(/data-testid="opd-view-btn"/);
    expect(OLR).toMatch(/onClick=\{onViewOpd\}/);
  });
});

describe('AV139 — invariant registered', () => {
  it('A9 audit-anti-vibe-code SKILL.md documents AV139', () => {
    const av = readFileSync('.agents/skills/audit-anti-vibe-code/SKILL.md', 'utf8');
    expect(av).toMatch(/AV139/);
  });
});
