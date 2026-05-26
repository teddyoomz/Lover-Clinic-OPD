// push_config firestore rule (2026-05-26, AV138)
// The browser (clinic-staff) reads/writes push_config/{tokens,settings} when
// enabling push + the app-load self-heal. firestore.rules had NO match block for
// push_config → client fell through to the default-deny catch-all → "Missing or
// insufficient permissions" on enable-push. This locks the rule + the class-of-bug
// (every client-accessed collection must have a match block).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const RULES = readFileSync('firestore.rules', 'utf8');

describe('push_config rule (AV138 fix)', () => {
  it('A1 — match /push_config/{docId} block exists', () => {
    expect(RULES).toMatch(/match \/push_config\/\{docId\}/);
  });

  it('A2 — push_config allows clinic-staff read + write', () => {
    const m = RULES.match(/match \/push_config\/\{docId\}\s*\{[\s\S]{0,200}?\}/);
    expect(m).not.toBeNull();
    expect(m[0]).toMatch(/allow read,\s*write:\s*if isClinicStaff\(\)/);
  });

  it('A3 — AV138 invariant documented', () => {
    const av = readFileSync('.agents/skills/audit-anti-vibe-code/SKILL.md', 'utf8');
    expect(av).toMatch(/AV138/);
  });
});

describe('AV138 class-of-bug — no AdminDashboard client collection lacks a rule', () => {
  it('A4 — every collection AdminDashboard.jsx accesses via the canonical path has a firestore.rules match block', () => {
    const admin = readFileSync('src/pages/AdminDashboard.jsx', 'utf8');
    const cols = new Set(
      [...admin.matchAll(/'data',\s*'([a-zA-Z_0-9]+)'/g)].map(m => m[1])
    );
    expect(cols.size).toBeGreaterThan(0); // sanity: the regex found collections
    const missing = [...cols].filter(c => !new RegExp(`match /${c}/`).test(RULES));
    expect(missing).toEqual([]); // push_config (and all others) must have a rule
  });
});
