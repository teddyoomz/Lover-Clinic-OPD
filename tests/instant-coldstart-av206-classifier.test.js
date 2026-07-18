// AV206 classifier (2026-07-07 instant cold-start) — SWR / fresh-gate
// discipline, enforced dynamically (AV205-style):
//   AV206.a — customer-facing pages render server-truth ONLY (freshGate).
//   AV206.b — staff surfaces classified in docs/perf/swr-inventory.md:
//             ADOPT files import swrList/swrRun; the inventory is the closed
//             sanctioned list for everything else.
//   AV206.c — {source:'cache'} never feeds a read→decide→WRITE flow.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

const read = (p) => readFileSync(path.join(process.cwd(), p), 'utf8');

// ── AV206.a — customer fresh-gate (closed list) ─────────────────────────────
const CUSTOMER_FRESH_GATED = ['src/pages/PatientForm.jsx', 'src/pages/ClinicSchedule.jsx'];
// ?patient= (PatientDashboard) reads /api/patient-view — a server API, fresh by
// construction; it must have NO client Firestore reads at all.

describe('AV206.a — customer pages render server-truth only', () => {
  for (const f of CUSTOMER_FRESH_GATED) {
    it(`${f} uses onSnapshotFresh and has NO bare onSnapshot( call`, () => {
      const src = read(f);
      expect(src).toMatch(/onSnapshotFresh\(/);
      const bareCalls = src.split('\n').filter(
        (l) => /(?<!\w)onSnapshot\(/.test(l) && !l.trim().startsWith('import') && !l.trim().startsWith('//'),
      );
      expect(bareCalls, `bare onSnapshot in ${f}: ${bareCalls.join(' | ')}`).toEqual([]);
    });
  }

  it('PatientDashboard has no client Firestore read (server-API page)', () => {
    const src = read('src/pages/PatientDashboard.jsx');
    expect(src).not.toMatch(/(?<!\w)(getDocs|getDoc|onSnapshot)\(/);
  });
});

// ── AV206.b — ADOPT files actually adopted ──────────────────────────────────
const ADOPTED = [
  'src/components/admin/AppointmentHubView.jsx',
  'src/components/backend/SaleTab.jsx',
  'src/components/backend/CustomerListTab.jsx',
  'src/components/backend/ProductsTab.jsx',
  'src/components/backend/CoursesTab.jsx',
  'src/components/backend/MembershipPanel.jsx',
  'src/components/backend/DepositPanel.jsx',
  'src/components/backend/WalletPanel.jsx',
  'src/components/backend/PointsPanel.jsx',
  'src/components/backend/MovementLogPanel.jsx',
  'src/components/backend/DoctorSchedulesTab.jsx',
  'src/components/backend/EmployeeSchedulesTab.jsx',
  // AV208 (2026-07-18) — TFP entry SWR: swrRun 2-pass, hydration-once,
  // save-gate. Contract locks: tests/tfp-entry-swr-contract.test.js.
  'src/components/TreatmentFormPage.jsx',
];

describe('AV206.b — SWR adoption matches the inventory', () => {
  const inventory = read('docs/perf/swr-inventory.md');

  for (const f of ADOPTED) {
    it(`${f} imports swrRead + is listed in the inventory ADOPT table`, () => {
      const src = read(f);
      expect(src).toMatch(/from '[./]*\.\.?\/(lib\/)?(\.\.\/)?(lib\/)?swrRead\.js'|swrRead\.js/);
      expect(src).toMatch(/swrList\(|swrRun\(/);
      expect(inventory).toContain(f.replace(/\\/g, '/'));
    });
  }

  it('every ADOPT-table row in the inventory is covered by this classifier (no silent additions)', () => {
    const rows = [...inventory.matchAll(/`(src\/[^`]+\.jsx?)`/g)].map((m) => m[1]);
    const adoptSection = inventory.split('## ADOPT')[1].split('## SANCTIONED')[0];
    const adoptRows = [...adoptSection.matchAll(/`(src\/[^`]+\.jsx?)`/g)].map((m) => m[1]);
    for (const row of adoptRows) {
      expect(ADOPTED, `inventory ADOPT row ${row} missing from classifier`).toContain(row);
    }
    expect(rows.length).toBeGreaterThan(0);
  });
});

// ── AV206.c — no decision-write from cache ──────────────────────────────────
describe("AV206.c — {source:'cache'} never reaches a write path", () => {
  it("every src/ file containing source: 'cache' or fetch('cache') is a known display-read site", () => {
    const walk = (dir, acc = []) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, acc);
        else if (/\.(jsx?|mjs)$/.test(e.name)) acc.push(p);
      }
      return acc;
    };
    const KNOWN = new Set([
      'src/lib/swrRead.js',
      // data-layer source routers (_getDocsBySource) — they IMPLEMENT the opt
      'src/lib/backendClient.js',
      'src/lib/reportsLoaders.js',
      ...ADOPTED,
    ].map((p) => path.normalize(p)));
    const offenders = [];
    for (const f of walk('src')) {
      const src = readFileSync(f, 'utf8');
      if (/source:\s*'cache'|fetchCore\('cache'\)|fetchEnrich\('cache'\)|fetchBoth\('cache'\)|fetchBySource\('cache'\)/.test(src)) {
        const rel = path.normalize(path.relative(process.cwd(), f));
        if (!KNOWN.has(rel)) offenders.push(rel);
      }
    }
    expect(offenders, `unclassified source:'cache' consumer(s): ${offenders.join(', ')} — add to docs/perf/swr-inventory.md + this classifier`).toEqual([]);
  });

  it('swrRead.js documents the AV206.c contract (no decision-writes from cache)', () => {
    expect(read('src/lib/swrRead.js')).toMatch(/AV206\.c/);
  });
});

// ── AV208 — FULL-SCAN: no unclassified mount-blocking list loads ────────────
// (2026-07-18, TFP entry SWR fix.) TFP escaped the original AV206 sweep
// because the classifier only checked files ALREADY in the ADOPT list — a
// network-gated page could hide by simply not being listed. This scan walks
// ALL of src/components + src/pages: any file with an `await Promise.all([
// list*...])` mount-load shape MUST be classified in swr-inventory.md
// (ADOPT or SANCTIONED — matched by basename). First run caught 9
// unclassified surfaces: TFP (→ ADOPT) + 5 form modals + OnlineSalesTab/
// VendorSalesTab/SmartAudienceTab (→ SANCTIONED).
describe('AV208 — full-scan: every mount-blocking Promise.all list-load is classified', () => {
  it('src/components + src/pages have zero unclassified list-load surfaces', () => {
    const walk = (dir, acc = []) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, acc);
        else if (/\.jsx?$/.test(e.name)) acc.push(p);
      }
      return acc;
    };
    const re = /await Promise\.all\(\[[^\]]*?list(Products|Courses|Staff|Doctors|DfGroups|DfStaffRates|OnlineSales|VendorSales|AllSellers)/s;
    const inventory = read('docs/perf/swr-inventory.md');
    const offenders = [];
    for (const f of [...walk('src/components'), ...walk('src/pages')]) {
      const src = readFileSync(f, 'utf8');
      if (!re.test(src)) continue;
      const base = path.basename(f).replace(/\.jsx?$/, '');
      if (!inventory.includes(base)) offenders.push(f);
    }
    expect(offenders, `unclassified mount-load surface(s): ${offenders.join(', ')} — classify in docs/perf/swr-inventory.md (ADOPT with swrRun, or SANCTIONED with a reason)`).toEqual([]);
  });
});
