// Phase 20.0 Task 5a — easy broker strip:
// - broker.getProClinicCredentials (test-connection auto-sync to extension)
// - broker.searchCustomers (2 callsites: handleApptSearch + handleImportSearch)
// - broker.getCourses (3 callsites: auto-courses-trigger + handleViewCourses + handleImportSelect)
// - broker.fetchPatientFromProClinic (1 callsite: handleImportSelect)
//
// Replacements:
// - getProClinicCredentials → DELETED (cookie-relay credential auto-sync removed)
// - searchCustomers → searchBackendCustomers (NEW helper in backendClient + scopedDataLayer)
// - getCourses → getCustomer (read be_customers doc + extract courses[])
// - fetchPatientFromProClinic → getCustomer (single read covers both)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ADMIN_DASHBOARD = fs.readFileSync(
  path.join(ROOT, 'src/pages/AdminDashboard.jsx'),
  'utf8',
);
const BACKEND_CLIENT = fs.readFileSync(
  path.join(ROOT, 'src/lib/backendClient.js'),
  'utf8',
);
const SCOPED_DATA_LAYER = fs.readFileSync(
  path.join(ROOT, 'src/lib/scopedDataLayer.js'),
  'utf8',
);
const STRIPPED = ADMIN_DASHBOARD
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('Phase 20.0 Task 5a — X1 broker strip', () => {
  it('X1.1 — broker.getProClinicCredentials NOT called', () => {
    expect(STRIPPED).not.toMatch(/broker\.getProClinicCredentials\s*\(/);
  });

  it('X1.2 — broker.searchCustomers NOT called', () => {
    expect(STRIPPED).not.toMatch(/broker\.searchCustomers\s*\(/);
  });

  it('X1.3 — broker.getCourses NOT called', () => {
    expect(STRIPPED).not.toMatch(/broker\.getCourses\s*\(/);
  });

  it('X1.4 — broker.fetchPatientFromProClinic NOT called', () => {
    expect(STRIPPED).not.toMatch(/broker\.fetchPatientFromProClinic\s*\(/);
  });
});

describe('Phase 20.0 Task 5a — X2 replacement helpers wired', () => {
  it('X2.1 — searchBackendCustomers imported from scopedDataLayer', () => {
    expect(ADMIN_DASHBOARD).toMatch(
      /import\s*\{[^}]*searchBackendCustomers[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/s,
    );
  });

  it('X2.2 — getCustomer imported from scopedDataLayer', () => {
    expect(ADMIN_DASHBOARD).toMatch(
      /import\s*\{[^}]*getCustomer[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/s,
    );
  });

  it('X2.3 — backendClient exports searchBackendCustomers', () => {
    expect(BACKEND_CLIENT).toMatch(/^export\s+async\s+function\s+searchBackendCustomers\b/m);
  });

  it('X2.4 — scopedDataLayer re-exports searchBackendCustomers', () => {
    expect(SCOPED_DATA_LAYER).toMatch(
      /export\s+const\s+searchBackendCustomers\s*=\s*\(/,
    );
  });
});

describe('Phase 20.0 Task 5a — X3 search call sites use be_* helper', () => {
  it('X3.1 — handleApptSearch calls searchBackendCustomers', () => {
    expect(STRIPPED).toMatch(/handleApptSearch[\s\S]{0,400}searchBackendCustomers\s*\(/);
  });

  it('X3.2 — handleImportSearch REMOVED (Phase 20.0 final ProClinic strip)', () => {
    // The "นำเข้าจาก ProClinic" UI flow was deleted in Phase 20.0 final
    // strip. Admins manage customers via BackendDashboard's CustomerListTab
    // (full be_* CRUD). handleImportSearch / handleImportSelect /
    // handleImportConfirm + the JSX section all REMOVED.
    expect(STRIPPED).not.toMatch(/const\s+handleImportSearch\s*=/);
    expect(STRIPPED).not.toMatch(/const\s+handleImportSelect\s*=/);
    expect(STRIPPED).not.toMatch(/const\s+handleImportConfirm\s*=/);
    expect(STRIPPED).not.toMatch(/นำเข้าจาก ProClinic/);
  });
});

describe('Phase 20.0 Task 5a — X4-prime courses path via getCustomer (post-import-strip)', () => {
  it('X4-prime.1 — at least 2 getCustomer call sites remain (auto-courses-trigger + handleGetCourses)', () => {
    // Phase 20.0 final ProClinic strip (2026-05-06) — handleImportSelect
    // removed (was the 3rd getCustomer site). 2 sites remain.
    const matches = STRIPPED.match(/getCustomer\s*\(/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Phase 20.0 Task 5a — X4 courses load via getCustomer', () => {
  it('X4.1 — at least 2 getCustomer call sites in AdminDashboard (post-import-strip)', () => {
    // Phase 20.0 final ProClinic strip removed handleImportSelect (3rd site).
    // 2 sites remain: auto-courses-trigger effect + handleGetCourses.
    const matches = STRIPPED.match(/getCustomer\s*\(/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('X4.2 — courses data sourced from customer.courses array', () => {
    expect(STRIPPED).toMatch(/customer\.courses/);
  });

  it('X4.3 — patientName composed from customer.firstname + lastname (or fullName fallback)', () => {
    expect(STRIPPED).toMatch(/customer\.firstname/);
    expect(STRIPPED).toMatch(/customer\.lastname/);
  });
});

describe('Phase 20.0 Task 5a — X5 searchBackendCustomers helper unit invariants', () => {
  // Pure simulate of the filter logic.
  function simulateSearch(query, customers) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    return customers
      .filter(c => {
        const fn = String(c.firstname || c.firstName || c.patientData?.firstName || '').toLowerCase();
        const ln = String(c.lastname || c.lastName || c.patientData?.lastName || '').toLowerCase();
        const hn = String(c.hn_no || c.hn || c.patientData?.hn || '').toLowerCase();
        const phone = String(c.phone || c.patientData?.phone || '').toLowerCase();
        const natId = String(c.nationalId || c.patientData?.nationalId || '').toLowerCase();
        return (
          fn.includes(q) || ln.includes(q) || hn.includes(q) ||
          phone.includes(q) || natId.includes(q)
        );
      })
      .slice(0, 50);
  }

  const customers = [
    { id: '1', firstname: 'อนุพงษ์', lastname: 'ตรีปัญญา', hn_no: 'HN-001', phone: '0812345678' },
    { id: '2', firstname: 'นภาพร', lastname: 'อยู่ดีมีสุข', hn_no: 'HN-002', phone: '0823456789', nationalId: '1234567890123' },
    { id: '3', patientData: { firstName: 'Bob', lastName: 'Smith', hn: 'HN-003', phone: '0834567890' } },
  ];

  it('X5.1 — search by firstname matches', () => {
    const results = simulateSearch('อนุพงษ์', customers);
    expect(results.map(r => r.id)).toEqual(['1']);
  });

  it('X5.2 — search by HN matches', () => {
    const results = simulateSearch('HN-002', customers);
    expect(results.map(r => r.id)).toEqual(['2']);
  });

  it('X5.3 — search by phone matches', () => {
    const results = simulateSearch('0812345678', customers);
    expect(results.map(r => r.id)).toEqual(['1']);
  });

  it('X5.4 — search by nationalId matches', () => {
    const results = simulateSearch('1234567890123', customers);
    expect(results.map(r => r.id)).toEqual(['2']);
  });

  it('X5.5 — search hits patientData fallback', () => {
    const results = simulateSearch('Bob', customers);
    expect(results.map(r => r.id)).toEqual(['3']);
  });

  it('X5.6 — empty query returns empty array', () => {
    expect(simulateSearch('', customers)).toEqual([]);
    expect(simulateSearch('   ', customers)).toEqual([]);
  });

  it('X5.7 — no match returns empty array', () => {
    expect(simulateSearch('xyz9999', customers)).toEqual([]);
  });

  it('X5.8 — case-insensitive match', () => {
    const results = simulateSearch('bob', customers);
    expect(results.map(r => r.id)).toEqual(['3']);
  });

  it('X5.9 — partial substring match', () => {
    const results = simulateSearch('HN', customers);
    expect(results.length).toBeGreaterThanOrEqual(3);
  });

  it('X5.10 — result cap at 50', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      firstname: `Test${i}`,
      hn_no: `HN-${i}`,
    }));
    const results = simulateSearch('Test', many);
    expect(results.length).toBe(50);
  });
});
