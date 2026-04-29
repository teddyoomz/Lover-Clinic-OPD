// V36-tris — /api/admin/wipe-master-data endpoint regression bank.
//
// User directive (2026-04-29): "ห้ามใช้ master_data ใน backend ไม่ว่าจะใช้
// ทำอะไร ห้ามใช้ master_data ประมวลผลเด็ดขาด ต้องใช้ be_database เท่านั้น
// ป้องกันโดยลบ masterdata ดิบที่ sync มาทั้งหมดในโปรแกรม".
//
// Test classes:
//   W.1-5  — handler structure (OPTIONS / POST / admin gate / two-phase)
//   W.6-10 — pure helpers (isValidMasterDataType + collection paths)
//   W.11-15 — destructive-op safety (confirm gate + audit trail)
//   W.16-20 — security (admin claim required, defensive type validation)

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isValidMasterDataType } from '../api/admin/wipe-master-data.js';

const ENDPOINT_SRC = readFileSync(
  resolve(__dirname, '../api/admin/wipe-master-data.js'),
  'utf-8'
);

describe('V36-tris W.1-5 — handler structure', () => {
  test('W.1 — exports default handler', () => {
    expect(ENDPOINT_SRC).toMatch(/export default async function handler/);
  });

  test('W.2 — handles OPTIONS preflight (204)', () => {
    expect(ENDPOINT_SRC).toMatch(/req\.method === ['"]OPTIONS['"]\s*\)\s*\{[\s\S]+?status\(204\)/);
  });

  test('W.3 — rejects non-POST with 405', () => {
    expect(ENDPOINT_SRC).toMatch(/req\.method !== ['"]POST['"]\)\s*\{[\s\S]+?status\(405\)/);
  });

  test('W.4 — calls verifyAdminToken (admin claim required)', () => {
    expect(ENDPOINT_SRC).toMatch(/import \{ verifyAdminToken \}/);
    expect(ENDPOINT_SRC).toMatch(/await verifyAdminToken\(req, res\)/);
  });

  test('W.5 — three actions: list, delete, delete-type', () => {
    expect(ENDPOINT_SRC).toMatch(/action === ['"]list['"]/);
    expect(ENDPOINT_SRC).toMatch(/action === ['"]delete['"]/);
    expect(ENDPOINT_SRC).toMatch(/action === ['"]delete-type['"]/);
  });
});

describe('V36-tris W.6-10 — pure helpers', () => {
  test('W.6 — isValidMasterDataType accepts simple alphanumeric names', () => {
    expect(isValidMasterDataType('products')).toBe(true);
    expect(isValidMasterDataType('courses')).toBe(true);
    expect(isValidMasterDataType('df_groups')).toBe(true);
    expect(isValidMasterDataType('product-units')).toBe(true);
  });

  test('W.7 — isValidMasterDataType rejects invalid shapes', () => {
    expect(isValidMasterDataType('')).toBe(false);
    expect(isValidMasterDataType(null)).toBe(false);
    expect(isValidMasterDataType(undefined)).toBe(false);
    expect(isValidMasterDataType('../etc/passwd')).toBe(false);
    expect(isValidMasterDataType('products/items')).toBe(false);
    expect(isValidMasterDataType('products items')).toBe(false);
    expect(isValidMasterDataType('1products')).toBe(false); // must start with letter
  });

  test('W.8 — type names with hyphens + underscores allowed', () => {
    expect(isValidMasterDataType('master-data-test')).toBe(true);
    expect(isValidMasterDataType('staff_schedules')).toBe(true);
  });

  test('W.9 — endpoint targets master_data subcollection root', () => {
    expect(ENDPOINT_SRC).toMatch(/collection\(['"]master_data['"]\)/);
  });

  test('W.10 — discoverMasterDataTypes uses listDocuments (subcollection scan)', () => {
    expect(ENDPOINT_SRC).toMatch(/listDocuments\(\)/);
  });
});

describe('V36-tris W.11-15 — destructive-op safety', () => {
  test('W.11 — delete action requires confirm:true', () => {
    expect(ENDPOINT_SRC).toMatch(/action === ['"]delete['"][\s\S]{0,300}!confirm[\s\S]{0,200}status\(400\)/);
  });

  test('W.12 — delete-type action requires confirm:true', () => {
    expect(ENDPOINT_SRC).toMatch(/action === ['"]delete-type['"][\s\S]{0,800}!confirm[\s\S]{0,200}status\(400\)/);
  });

  test('W.13 — wipeMasterDataType uses chunked writeBatch (500-op limit safety)', () => {
    expect(ENDPOINT_SRC).toMatch(/CHUNK\s*=\s*\d+/);
    expect(ENDPOINT_SRC).toMatch(/db\.batch\(\)/);
    expect(ENDPOINT_SRC).toMatch(/batch\.delete/);
    expect(ENDPOINT_SRC).toMatch(/batch\.commit\(\)/);
  });

  test('W.14 — every delete writes audit trail to be_admin_audit', () => {
    expect(ENDPOINT_SRC).toMatch(/be_admin_audit/);
    expect(ENDPOINT_SRC).toMatch(/auditId/);
    expect(ENDPOINT_SRC).toMatch(/executedBy:/);
    expect(ENDPOINT_SRC).toMatch(/executedAt:/);
  });

  test('W.15 — list action returns counts before any delete', () => {
    expect(ENDPOINT_SRC).toMatch(/action: ['"]list['"][\s\S]{0,500}counts,/);
    expect(ENDPOINT_SRC).toMatch(/totalItems:/);
  });
});

describe('V36-tris W.16-20 — security', () => {
  test('W.16 — admin gate fires BEFORE any read/delete', () => {
    const handlerStart = ENDPOINT_SRC.indexOf('export default async function handler');
    const adminGateIdx = ENDPOINT_SRC.indexOf('verifyAdminToken', handlerStart);
    const actionParseIdx = ENDPOINT_SRC.indexOf('action = String', handlerStart);
    expect(adminGateIdx).toBeGreaterThan(0);
    expect(actionParseIdx).toBeGreaterThan(0);
    expect(adminGateIdx).toBeLessThan(actionParseIdx);
  });

  test('W.17 — early-return when caller fails admin verification', () => {
    expect(ENDPOINT_SRC).toMatch(/if \(!caller\) return/);
  });

  test('W.18 — defensive type validation (regex pattern)', () => {
    expect(ENDPOINT_SRC).toMatch(/\/\^\[a-zA-Z\]\[a-zA-Z0-9_-\]/);
  });

  test('W.19 — V36-tris marker comment in header', () => {
    expect(ENDPOINT_SRC).toMatch(/V36-tris \(2026-04-29\)/);
  });

  test('W.20 — user-directive Thai quote referenced in header', () => {
    // Comment-block line wrap: "master_data ใน\n// backend"
    expect(ENDPOINT_SRC).toMatch(/ห้ามใช้ master_data ใน[\s\S]{0,30}backend/);
  });
});
