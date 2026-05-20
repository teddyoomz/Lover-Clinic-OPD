// tests/v108-sale-customer-name-chokepoint.test.js
// V108 AV100 — regression locks: sale customerName/HN resolved at the
// createBackendSale WRITE CHOKEPOINT (root) + SaleTab list resolver fed by an
// eager customers load (display). Root cause: INV-20260520-0010 had empty
// customerName though be_customers/LC-26000074 resolved fine; the V105 list
// fallback was dead because `customers` only loaded on form-open.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const bc = readFileSync('src/lib/backendClient.js', 'utf8');
const saleTab = readFileSync('src/components/backend/SaleTab.jsx', 'utf8');
const skill = readFileSync('.agents/skills/audit-anti-vibe-code/SKILL.md', 'utf8');

const helperStart = bc.indexOf('async function _resolveSaleCustomerIdentity');
const helper = bc.slice(helperStart, helperStart + 900);
const createStart = bc.indexOf('export async function createBackendSale');
const createFn = bc.slice(createStart, createStart + 800);
const loadOptStart = saleTab.indexOf('const loadOptions = useCallback');
const loadOptFn = saleTab.slice(loadOptStart, loadOptStart + 1300);

describe('V108 AV100 — createBackendSale write chokepoint', () => {
  it('A1 backendClient imports the canonical customer-name resolvers', () => {
    expect(bc).toMatch(/import\s*\{[^}]*resolveCustomerDisplayName[^}]*resolveCustomerHN[^}]*\}\s*from\s*'\.\/customerDisplayName\.js'/);
  });
  it('A2 _resolveSaleCustomerIdentity reads the authoritative be_customers doc', () => {
    expect(helperStart).toBeGreaterThan(0);
    expect(helper).toContain('getDoc(customerDoc(cid))');
    expect(helper).toContain('resolveCustomerDisplayName(c)');
    expect(helper).toContain('resolveCustomerHN(c)');
  });
  it('A3 resolves ONLY when caller value empty (guard)', () => {
    expect(helper).toContain('if (cid && (!customerName || !customerHN))');
  });
  it('A4 createBackendSale calls the chokepoint + stamps resolved name AFTER the spread', () => {
    expect(createStart).toBeGreaterThan(0);
    expect(createFn).toContain('_resolveSaleCustomerIdentity(data)');
    const spreadIdx = createFn.indexOf('..._normalizeSaleData(data)');
    const nameIdx = createFn.indexOf('customerName: _ident.customerName');
    expect(spreadIdx).toBeGreaterThan(0);
    expect(nameIdx).toBeGreaterThan(spreadIdx); // resolved value wins over the spread
    expect(createFn).toContain('customerHN: _ident.customerHN');
  });
});

describe('V108 AV100 — SaleTab list resolver fed (display)', () => {
  it('B1 eager-loads customers on mount', () => {
    expect(saleTab).toMatch(/eager-load customers on mount|eager getAllCustomers/);
    expect(saleTab).toMatch(/getAllCustomers\(\)[\s\S]{0,140}setCustomers\(list\)/);
  });
  it('B2 loadOptions is load-only-missing (no longer guards customers+sellers alone)', () => {
    expect(loadOptStart).toBeGreaterThan(0);
    expect(loadOptFn).not.toContain('if (customers.length && sellers.length) return;');
    expect(loadOptFn).toContain('needCustomers');
    expect(loadOptFn).toContain('needProducts');
    expect(loadOptFn).toContain('medProducts.length'); // deps now include medProducts
  });
  it('B3 V105 list fallback + dash fallback preserved', () => {
    expect(saleTab).toContain('resolveCustomerDisplayName');
    expect(saleTab).toContain("|| '-'");
  });
});

describe('V108 AV100 — codified', () => {
  it('C1 AV100 invariant in audit skill', () => {
    expect(skill).toContain('AV100');
    expect(skill).toContain('write chokepoint');
    expect(skill).toContain('_resolveSaleCustomerIdentity');
  });
});
