// Phase 20.0 Task 5b — patient submit lifecycle on be_customers.
//
// Strips:
//   - broker.fillProClinic (3 callsites: handleOpdClick + handleResync +
//     confirmDepositSync customer-create branch)
//   - broker.updateProClinic (3 callsites: handleOpdClick + handleResync +
//     confirmDepositSync re-sync branch)
//   - broker.deleteProClinic (1 callsite: handleDelete)
//
// Replacements:
//   - fillProClinic   → addCustomer(patient, {strict:false})
//                       returns {id, hn} → stamped on session.brokerProClinicId/HN
//                       (field name preserved for backward compat with existing
//                       opd_sessions docs; semantics now = be_customers id)
//   - updateProClinic → updateCustomerFromForm(beCustomerId, patient, {})
//                       (no return value of interest — re-read via getCustomer
//                       if needed)
//   - deleteProClinic → deleteCustomerCascade(beCustomerId, {confirm:true})
//                       (cascade-deletes treatments/sales/deposits/wallets/
//                       memberships/appointments tied to customerId)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ADMIN_DASHBOARD = fs.readFileSync(
  path.join(ROOT, 'src/pages/AdminDashboard.jsx'),
  'utf8',
);
const STRIPPED = ADMIN_DASHBOARD
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('Phase 20.0 Task 5b — Y1 broker patient lifecycle calls all removed', () => {
  it('Y1.1 — broker.fillProClinic NOT called', () => {
    expect(STRIPPED).not.toMatch(/broker\.fillProClinic\s*\(/);
  });

  it('Y1.2 — broker.updateProClinic NOT called', () => {
    expect(STRIPPED).not.toMatch(/broker\.updateProClinic\s*\(/);
  });

  it('Y1.3 — broker.deleteProClinic NOT called', () => {
    expect(STRIPPED).not.toMatch(/broker\.deleteProClinic\s*\(/);
  });
});

describe('Phase 20.0 Task 5b — Y2 be_customers writers wired', () => {
  it('Y2.1 — addCustomer imported from scopedDataLayer', () => {
    expect(ADMIN_DASHBOARD).toMatch(
      /import\s*\{[^}]*addCustomer[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/s,
    );
  });

  it('Y2.2 — updateCustomerFromForm imported from scopedDataLayer', () => {
    expect(ADMIN_DASHBOARD).toMatch(
      /import\s*\{[^}]*updateCustomerFromForm[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/s,
    );
  });

  it('Y2.3 — deleteCustomerCascade imported from scopedDataLayer', () => {
    expect(ADMIN_DASHBOARD).toMatch(
      /import\s*\{[^}]*deleteCustomerCascade[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/s,
    );
  });
});

describe('Phase 20.0 Task 5b — Y3 patient-submit (handleOpdClick + handleResync) wired', () => {
  it('Y3.1 — addCustomer called with {strict:false} opt (legacy patients may have minimal data)', () => {
    const matches = STRIPPED.match(/addCustomer\s*\(\s*patient\s*,\s*\{\s*strict:\s*false\s*\}/g) || [];
    // 3 callsites: handleOpdClick + handleOpdClick-retry + handleResync + confirmDepositSync
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it('Y3.2 — updateCustomerFromForm called with (brokerProClinicId, patient, {})', () => {
    expect(STRIPPED).toMatch(/updateCustomerFromForm\s*\(\s*[^,]+,\s*patient\s*,\s*\{\s*\}\s*\)/);
  });

  it('Y3.3 — getCustomer called to re-read after update for proClinicId/HN response shape', () => {
    expect(STRIPPED).toMatch(/getCustomer\s*\(\s*session\.brokerProClinicId\s*\)/);
  });

  it('Y3.4 — result shape preserves backward-compat: {success, proClinicId, proClinicHN}', () => {
    // Source-grep that the create+update branches build a result obj with
    // proClinicId stamped from the be_customers doc id (created.id / updated.id).
    expect(STRIPPED).toMatch(/proClinicId:\s*created\.id/);
    expect(STRIPPED).toMatch(/proClinicId:\s*updated\.id/);
  });
});

describe('Phase 20.0 Task 5b — Y4 deleteCustomerCascade wired with confirm flag', () => {
  it('Y4.1 — deleteCustomerCascade called with {confirm:true}', () => {
    expect(STRIPPED).toMatch(/deleteCustomerCascade\s*\(\s*proClinicId\s*,\s*\{\s*confirm:\s*true\s*\}/);
  });

  it('Y4.2 — handleDelete strips session HN/OPD on success', () => {
    // Locate the post-cascade updateDoc that nulls out brokerProClinicId etc.
    expect(STRIPPED).toMatch(/brokerProClinicId:\s*null,\s*brokerProClinicHN:\s*null/);
  });

  it('Y4.3 — handleDelete catches not-found gracefully', () => {
    // The catch block tolerates "not found" / "NotFound" cascade errors so
    // session HN/OPD still strip even when the be_customers doc was already
    // deleted out-of-band.
    expect(STRIPPED).toMatch(/not found/);
  });
});

describe('Phase 20.0 Task 5b — Y5 confirmDepositSync customer-create branch wired', () => {
  it('Y5.1 — addCustomer called with strict:false in deposit-sync customer-create branch', () => {
    expect(STRIPPED).toMatch(/const\s+created\s*=\s*await\s+addCustomer\s*\(\s*patient\s*,\s*\{\s*strict:\s*false\s*\}\s*\)/);
  });

  it('Y5.2 — proClinicId stamped from created.id', () => {
    expect(STRIPPED).toMatch(/proClinicId\s*=\s*created\.id/);
  });

  it('Y5.3 — proClinicHN stamped from created.hn fallback to empty string', () => {
    expect(STRIPPED).toMatch(/proClinicHN\s*=\s*created\.hn\s*\|\|\s*['"]['"]?/);
  });
});

describe('Phase 20.0 Task 5b — Y6 broker.getProClinicCredentials cookie-relay sync removed', () => {
  it('Y6.1 — no LC_COOKIE_RELAY_READY message handler in AdminDashboard', () => {
    expect(STRIPPED).not.toMatch(/LC_COOKIE_RELAY_READY/);
  });

  it('Y6.2 — no broker.getProClinicCredentials reference', () => {
    expect(STRIPPED).not.toMatch(/broker\.getProClinicCredentials/);
  });
});

describe('Phase 20.0 Task 5b — Y7 result shape compat: code that consumes proClinicId/HN still works', () => {
  // After Phase 5b, the result object from the patient-create/update branches
  // mirrors the legacy broker shape:
  //   { success: true, proClinicId: <be_customers id>, proClinicHN: <hn> }
  //   { success: false, notFound: true, error: '...' } (update-on-missing)
  //
  // This keeps the existing branchy code (success / notFound / failed
  // branches) functional without rewrite. Once Phase 5c is complete + the
  // dust settles, the `proClinicId` field name can be renamed to
  // `beCustomerId` in a separate cosmetic refactor.

  it('Y7.1 — success branch preserved (result?.success)', () => {
    expect(STRIPPED).toMatch(/result\?\.success/);
  });

  it('Y7.2 — notFound branch preserved (result?.notFound)', () => {
    expect(STRIPPED).toMatch(/result\?\.notFound/);
  });

  it('Y7.3 — opd_sessions stamps brokerProClinicId from result.proClinicId', () => {
    expect(STRIPPED).toMatch(/brokerProClinicId:\s*result\.proClinicId/);
  });
});
