// Phase 16.1 (2026-04-30) — full-flow simulate per Rule I
//
// Chains: load fixtures → indexSalesByCustomer → evaluateRule → assert
// matchedIds + total + CSV column shape. Pure-helper-only (no React mount,
// no Firestore I/O) — verifies the contract end-to-end.
//
// Plus source-grep regression guards for Rule E + Rule J + Rule K markers
// that lock the fix shape into the codebase.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  evaluateRule,
  indexSalesByCustomer,
  PREDICATE_TYPES,
} from '../src/lib/audienceRules.js';
import {
  validateAudienceRule,
  emptyAudienceRule,
} from '../src/lib/audienceValidation.js';
import { buildAudienceCsvRows } from '../src/components/backend/SmartAudienceTab.jsx';

const TODAY = new Date(Date.UTC(2026, 3, 30));

// Fixture: 5 customers, mix of demographics + spend behaviour.
const customers = [
  { id: 'c1', hn_no: 'HN1', firstname: 'อริส',  lastname: 'A', gender: 'F', birthdate: '1985-01-01', branchId: 'BR-A', source: 'Facebook', courses: [] },
  { id: 'c2', hn_no: 'HN2', firstname: 'บัว',   lastname: 'B', gender: 'F', birthdate: '1992-06-01', branchId: 'BR-A', source: 'LINE',     courses: [{ name: 'X', qty: '5/10', status: 'ใช้งาน' }] },
  { id: 'c3', hn_no: 'HN3', firstname: 'แชมป์', lastname: 'C', gender: 'M', birthdate: '1980-03-15', branchId: 'BR-B', source: 'Walk-in',  courses: [] },
  { id: 'c4', hn_no: 'HN4', firstname: 'ดารา',  lastname: 'D', gender: 'F', birthdate: '2005-04-15', branchId: 'BR-A', source: 'Facebook', courses: [] },
  { id: 'c5', hn_no: 'HN5', firstname: 'เอก',   lastname: 'E', gender: 'M', birthdate: '1975-04-15', branchId: 'BR-A', source: 'Facebook', courses: [] },
];
const sales = [
  // c1 — F, 41, Facebook, big spender (15000)
  { customerId: 'c1', saleDate: '2026-03-15', status: 'completed', billing: { netTotal: 8000 }, items: [{ productId: 'P-1', qty: 1 }] },
  { customerId: 'c1', saleDate: '2026-04-20', status: 'completed', billing: { netTotal: 7000 }, items: [{ courseId: 'C-1', qty: 1 }] },
  // c2 — F, 33, LINE, moderate spender (3000)
  { customerId: 'c2', saleDate: '2026-04-25', status: 'completed', billing: { netTotal: 3000 }, items: [{ productId: 'P-1', qty: 1 }] },
  // c3 — M, 46, Walk-in, low spender (500)
  { customerId: 'c3', saleDate: '2026-04-29', status: 'completed', billing: { netTotal: 500 }, items: [{ productId: 'P-2', qty: 1 }] },
  // c4 — F, 21, Facebook, no purchases
  // c5 — M, 51, Facebook, refunded big spender (treated as 0 because refunded excluded)
  { customerId: 'c5', saleDate: '2026-04-15', status: 'refunded', billing: { netTotal: 20000 }, items: [{ productId: 'P-1', qty: 1 }] },
];

// ─── F1 baseline canonical rule ────────────────────────────────────────────
describe('F1 baseline canonical rule — F, 30-50, spend > 5000 in 6 months', () => {
  const rule = {
    kind: 'group',
    op: 'AND',
    children: [
      { kind: 'predicate', type: 'gender', params: { value: 'F' } },
      { kind: 'predicate', type: 'age-range', params: { min: 30, max: 50 } },
      { kind: 'predicate', type: 'spend-bracket', params: { min: 5000, max: null } },
    ],
  };

  test('F1.1 rule shape passes validator', () => {
    expect(validateAudienceRule(rule)).toBe(null);
  });

  test('F1.2 evaluateRule matches c1 only', () => {
    const idx = indexSalesByCustomer(sales);
    const result = evaluateRule(customers, idx, rule, TODAY);
    expect(result.matchedIds).toEqual(['c1']);
    expect(result.total).toBe(1);
  });

  test('F1.3 CSV row shape includes age + lastVisit + totalSpend', () => {
    const idx = indexSalesByCustomer(sales);
    const result = evaluateRule(customers, idx, rule, TODAY);
    const customerById = new Map(customers.map((c) => [c.id, c]));
    const rows = buildAudienceCsvRows(result.matchedIds, customerById, idx, TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0].hn).toBe('HN1');
    expect(rows[0].firstname).toBe('อริส');
    expect(rows[0].age).toBe(41);
    expect(rows[0].lastVisit).toBe('2026-04-20');
    expect(rows[0].totalSpend).toBe(15000);
    expect(rows[0].source).toBe('Facebook');
  });
});

// ─── F2 LINE OR Facebook source group ─────────────────────────────────────
describe('F2 OR group — source LINE or Facebook + has unfinished course', () => {
  const rule = {
    kind: 'group',
    op: 'AND',
    children: [
      {
        kind: 'group',
        op: 'OR',
        children: [
          { kind: 'predicate', type: 'source', params: { values: ['LINE'] } },
          { kind: 'predicate', type: 'source', params: { values: ['Facebook'] } },
        ],
      },
      { kind: 'predicate', type: 'has-unfinished-course', params: { value: true } },
    ],
  };

  test('F2.1 validator passes', () => {
    expect(validateAudienceRule(rule)).toBe(null);
  });

  test('F2.2 only c2 has unfinished course AND source LINE-or-Facebook', () => {
    const idx = indexSalesByCustomer(sales);
    const result = evaluateRule(customers, idx, rule, TODAY);
    expect(result.matchedIds).toEqual(['c2']);
  });
});

// ─── F3 last-visit-days >= 60 (lapsed customers) ──────────────────────────
describe('F3 lapsed customer rule — no visit in 60 days', () => {
  const rule = {
    kind: 'group',
    op: 'AND',
    children: [
      { kind: 'predicate', type: 'last-visit-days', params: { op: '>=', days: 60 } },
    ],
  };

  test('F3.1 validator passes', () => {
    expect(validateAudienceRule(rule)).toBe(null);
  });

  test('F3.2 c4 (no visits) + c5 (refund only excluded) qualify', () => {
    const idx = indexSalesByCustomer(sales);
    const result = evaluateRule(customers, idx, rule, TODAY);
    expect(result.matchedIds).toEqual(['c4', 'c5']);
  });
});

// ─── F4 empty rule (no predicates) returns ALL ────────────────────────────
describe('F4 empty rule = all customers', () => {
  test('F4.1 emptyAudienceRule returns valid rule', () => {
    expect(validateAudienceRule(emptyAudienceRule())).toBe(null);
  });
  test('F4.2 evaluateRule with empty rule returns all customer ids ASC', () => {
    const idx = indexSalesByCustomer(sales);
    const result = evaluateRule(customers, idx, emptyAudienceRule(), TODAY);
    expect(result.matchedIds).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
    expect(result.total).toBe(5);
  });
});

// ─── F5 source-grep regression guards (Rule E / J / K markers) ────────────
describe('F5 source-grep regression guards', () => {
  const repoRoot = resolve(process.cwd());
  const read = (rel) => readFileSync(resolve(repoRoot, rel), 'utf8');

  test('F5.1 audienceRules.js exports 8 predicate types', () => {
    expect(PREDICATE_TYPES.length).toBe(8);
    expect(Object.isFrozen(PREDICATE_TYPES)).toBe(true);
  });

  test('F5.2 audienceRules.js does not import master_data (Rule H-quater)', () => {
    const src = read('src/lib/audienceRules.js');
    expect(src).not.toMatch(/master_data/);
  });

  test('F5.3 SmartAudienceTab does not import master_data (Rule H-quater)', () => {
    const src = read('src/components/backend/SmartAudienceTab.jsx');
    expect(src).not.toMatch(/master_data/);
  });

  test('F5.4 SmartAudienceTab does not import brokerClient (Rule E)', () => {
    const src = read('src/components/backend/SmartAudienceTab.jsx');
    expect(src).not.toMatch(/brokerClient/);
  });

  test('F5.5 SmartAudienceTab does not call /api/proclinic (Rule E)', () => {
    const src = read('src/components/backend/SmartAudienceTab.jsx');
    expect(src).not.toMatch(/\/api\/proclinic/);
  });

  test('F5.6 backendClient.js exports 4 audience CRUD helpers + ID minter', () => {
    const src = read('src/lib/backendClient.js');
    expect(src).toMatch(/export function newAudienceId/);
    expect(src).toMatch(/export async function listAudiences/);
    expect(src).toMatch(/export function listenToAudiences/);
    expect(src).toMatch(/export async function saveAudience/);
    expect(src).toMatch(/export async function deleteAudience/);
  });

  test('F5.7 firestore.rules has be_audiences match block', () => {
    const src = read('firestore.rules');
    expect(src).toMatch(/match \/be_audiences\/\{audienceId\}/);
    expect(src).toMatch(/allow read, write: if isClinicStaff\(\)/);
  });

  test('F5.8 tabPermissions.js gates smart-audience by smart_audience perm key', () => {
    const src = read('src/lib/tabPermissions.js');
    expect(src).toMatch(/'smart-audience':\s*\{ requires: \['smart_audience'\] \}/);
  });

  test('F5.9 navConfig.js registers smart-audience nav entry under reports section', () => {
    const src = read('src/components/backend/nav/navConfig.js');
    expect(src).toMatch(/id: 'smart-audience'/);
  });

  test('F5.10 BackendDashboard.jsx lazy-imports + renders SmartAudienceTab', () => {
    const src = read('src/pages/BackendDashboard.jsx');
    expect(src).toMatch(/const SmartAudienceTab\s*=\s*lazy\(\(\) => import\('\.\.\/components\/backend\/SmartAudienceTab\.jsx'\)\)/);
    expect(src).toMatch(/activeTab === 'smart-audience'/);
  });
});
