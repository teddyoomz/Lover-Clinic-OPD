// Phase 24.0 — firestore.rules source-grep probe. Verifies the
// be_admin_audit/customer-delete-* narrow create exception is in place.
// (Live unauth probe is part of Rule B Probe-Deploy-Probe at user-triggered
// deploy time — covered by the rule-deploy runbook, not unit tests.)
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RULES = fs.readFileSync(
  path.join(process.cwd(), 'firestore.rules'),
  'utf-8',
);

describe('Phase 24.0 / R — firestore.rules customer-delete-* prefix exception', () => {
  it('R.1 be_admin_audit allow-create matches customer-delete-* prefix', () => {
    expect(RULES).toMatch(/be_admin_audit/);
    expect(RULES).toMatch(/customer-delete-/);
    // Lock the explicit prefix-matching pattern so future rule edits can't
    // silently drop the exception.
    expect(RULES).toMatch(/auditId\.matches\(\s*['"]\^customer-delete-\.\*['"]\s*\)/);
  });

  it('R.2 be_admin_audit allow-update + allow-delete remain false (immutable ledger)', () => {
    const block = RULES.match(/match\s+\/be_admin_audit[\s\S]*?\n\s{0,8}\}/);
    expect(block).toBeTruthy();
    expect(block[0]).toMatch(/allow update,?\s*delete:\s*if\s*false/);
  });

  it('R.3 customer-delete-* prefix gated by signed-in + admin/perm claim (not anon-allow)', () => {
    // Per V26 (claim-only auth), the canonical pattern is
    // `isSignedIn() && (admin == true || perm_<key> == true)` — NOT
    // `isClinicStaff()` (which is itself defined to require those claims).
    // Either pattern is acceptable; what's NOT acceptable is `if true` or
    // unauth-allow. Lock that semantic here.
    const block = RULES.match(/match\s+\/be_admin_audit[\s\S]*?allow create[\s\S]*?;/);
    expect(block).toBeTruthy();
    const txt = block[0];
    // Must require auth in some form.
    expect(/isClinicStaff\(\)|isSignedIn\(\)/.test(txt)).toBe(true);
    // Must check admin claim or perm_customer_delete claim.
    expect(/admin\s*==\s*true/.test(txt)).toBe(true);
    expect(/perm_customer_delete/.test(txt)).toBe(true);
    // Must NOT have an `if true` shortcut.
    expect(txt).not.toMatch(/if\s+true/);
  });
});
