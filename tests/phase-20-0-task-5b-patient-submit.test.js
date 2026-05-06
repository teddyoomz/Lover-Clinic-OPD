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
// Phase 24.0-septies (2026-05-06 evening) — line-comment strip MUST run
// BEFORE block-comment strip. Otherwise a line like
// `// api/proclinic/* legacy path` contains a literal `/*` that the
// block-comment regex interprets as block-start → it consumes everything
// until the next `*/` (potentially 10KB+ of real source code), making
// later assertions fail spuriously.
const STRIPPED = ADMIN_DASHBOARD
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');

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
  it('Y3.1 — addCustomer called with {strict:false, branchId} opts (Phase 23.0 evolved contract)', () => {
    // Phase 20.0 baseline: addCustomer(patient, { strict: false }).
    // Phase 23.0 (2026-05-06) tightened: every kiosk callsite ALSO passes
    // branchId explicitly to mirror CustomerCreatePage + close the
    // "สร้างรายการที่" race vs implicit resolveSelectedBranchId fallback.
    const matches = STRIPPED.match(
      /addCustomer\s*\(\s*patient\s*,\s*\{[^}]*strict:\s*false[^}]*branchId:\s*selectedBranchId/g,
    ) || [];
    // 3 callsites: handleOpdClick + handleOpdClick-retry + handleResync + confirmDepositSync
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it('Y3.2 — updateCustomerFromForm called via tryUpdateExistingCustomer helper (Phase 24.0-septies)', () => {
    // Phase 24.0-septies (2026-05-06 evening) — updateCustomerFromForm
    // calls now go through the shared tryUpdateExistingCustomer helper
    // (top-level in AdminDashboard.jsx) which detects "doc was deleted"
    // (Phase 24.0 cascade-delete) + signals notFound to caller's recovery
    // path. The helper still calls updateCustomerFromForm + getCustomer
    // internally — just centralized + try/catch wrapped.
    expect(STRIPPED).toMatch(/async function tryUpdateExistingCustomer/);
    expect(STRIPPED).toMatch(/updateCustomerFromForm\s*\(\s*customerId\s*,\s*patient\s*,\s*\{\s*\}\s*\)/);
    // Both handleOpdClick + handleResync delegate to the helper
    const helperCalls = (STRIPPED.match(/tryUpdateExistingCustomer\s*\(\s*session\.brokerProClinicId\s*,\s*patient\s*\)/g) || []).length;
    expect(helperCalls).toBeGreaterThanOrEqual(2);
  });

  it('Y3.3 — getCustomer called inside tryUpdateExistingCustomer helper (Phase 24.0-septies)', () => {
    // Helper does updateCustomerFromForm → getCustomer round-trip.
    expect(STRIPPED).toMatch(/await\s+updateCustomerFromForm[\s\S]{0,200}await\s+getCustomer\s*\(\s*customerId\s*\)/);
  });

  it('Y3.4 — result shape preserves backward-compat: {success, proClinicId, proClinicHN}', () => {
    // Source-grep that the create branch builds a result obj with
    // proClinicId stamped from the be_customers doc id (created.id);
    // the update path now uses upd.customerId from the helper return shape.
    expect(STRIPPED).toMatch(/proClinicId:\s*created\.id/);
    expect(STRIPPED).toMatch(/proClinicId:\s*upd\.customerId/);
  });
});

describe('Phase 20.0 Task 5b — Y4 cascade-delete relocated to BackendDashboard', () => {
  // Phase 20.0 final ProClinic strip (2026-05-06) — handleProClinicDelete
  // REMOVED from AdminDashboard. Customer cascade-delete now lives in
  // BackendDashboard's CustomerListTab (admin-gated via deleteCustomerCascade
  // directly). The kiosk session detail no longer offers a delete-customer
  // path — only session-only delete (deleteSession) remains.

  it('Y4.1 — handleProClinicDelete REMOVED from AdminDashboard', () => {
    expect(STRIPPED).not.toMatch(/const\s+handleProClinicDelete\s*=/);
  });

  it('Y4.2 — deleteCustomerCascade still imported (used by other paths if needed)', () => {
    // Import retained — Phase 5b kept the import in case other handlers use
    // it. Currently no AdminDashboard handler calls it (cascade-delete is
    // BackendDashboard's responsibility).
    expect(ADMIN_DASHBOARD).toMatch(
      /import\s*\{[^}]*deleteCustomerCascade[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/s,
    );
  });

  it('Y4.3 — strip comment marker present in raw source (audit lock)', () => {
    // Use raw ADMIN_DASHBOARD (not STRIPPED) — comment marker survives.
    expect(ADMIN_DASHBOARD).toMatch(/handleProClinicDelete[\s\S]{0,300}REMOVED/);
  });
});

describe('Phase 20.0 Task 5b — Y5 confirmDepositSync customer-create branch wired', () => {
  it('Y5.1 — addCustomer called with strict:false + explicit branchId in deposit-sync customer-create branch (Phase 23.0)', () => {
    // Phase 23.0 contract: branchId stamped explicitly from selectedBranchId.
    expect(STRIPPED).toMatch(
      /const\s+created\s*=\s*await\s+addCustomer\s*\(\s*patient\s*,\s*\{[^}]*strict:\s*false[^}]*branchId:\s*selectedBranchId[^}]*\}\s*\)/,
    );
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
