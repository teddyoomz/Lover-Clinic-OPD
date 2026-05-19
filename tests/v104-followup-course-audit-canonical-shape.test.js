/**
 * V104-followup (2026-05-19 LATE+3 NIGHT+1) — be_course_changes canonical shape
 * regression bank.
 *
 * Root cause: `scripts/v101-backfill-treatment-course-link.mjs` wrote a FLAT
 * non-canonical audit shape `{customerId, treatmentId, courseName, productName,
 * qty, unit, performedAtIso, ...}` that bypassed canonical
 * `buildChangeAuditEntry` (src/lib/courseExchange.js:246) output shape.
 *
 * Display reader `CourseHistoryTab.jsx:66` reads `entry.fromCourse?.name ||
 * '(ไม่ระบุคอร์ส)'` → 11 garbage entries on LC-26000078 rendered as
 * "(ไม่ระบุคอร์ส) -". User report 2026-05-19 NIGHT+1 with image of TFP
 * "ประวัติการใช้คอร์ส" tab showing 9 visible "(ไม่ระบุคอร์ส) -" entries.
 *
 * Fix:
 *   A. Patched `v101-backfill-treatment-course-link.mjs` to use new
 *      `buildCanonicalUseAudit` helper (mirror of buildChangeAuditEntry).
 *   B. NEW `v104-migrate-broken-course-change-audits.mjs` repairs the 11
 *      legacy garbage entries to canonical shape.
 *   C. AV92 invariant — all writers to be_course_changes MUST use canonical
 *      shape (via buildChangeAuditEntry or its mirror).
 *
 * Real-prod verify (2026-05-19 NIGHT+1):
 *   pre-migration:  109 docs, 11 garbage (LC-26000078, _v101Backfill:true)
 *   post-migration: 109 docs, 0 garbage. All canonical fromCourse.name + qtyDelta.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildChangeAuditEntry } from '../src/lib/courseExchange.js';

const V101_BACKFILL_PATH = 'scripts/v101-backfill-treatment-course-link.mjs';
const V104_MIGRATE_PATH = 'scripts/v104-migrate-broken-course-change-audits.mjs';
const AV_SKILL_PATH = '.claude/skills/audit-anti-vibe-code/SKILL.md';
const COURSE_HISTORY_PATH = 'src/components/backend/CourseHistoryTab.jsx';

const V101_BACKFILL = readFileSync(V101_BACKFILL_PATH, 'utf8');
const V104_MIGRATE = readFileSync(V104_MIGRATE_PATH, 'utf8');
const AV_SKILL = readFileSync(AV_SKILL_PATH, 'utf8');
const COURSE_HISTORY = readFileSync(COURSE_HISTORY_PATH, 'utf8');

describe('V104-followup.SG — source-grep lockdown for canonical audit shape', () => {
  it('SG1: V101 backfill script declares buildCanonicalUseAudit helper', () => {
    expect(V101_BACKFILL).toMatch(/function buildCanonicalUseAudit\b/);
  });

  it('SG2: V101 backfill script NO LONGER writes flat non-canonical shape', () => {
    // Pre-V104-followup the changeEmitOut.push had top-level courseName/qty/etc.
    // Post-V104-followup it pushes canonicalAudit (from buildCanonicalUseAudit).
    expect(V101_BACKFILL).not.toMatch(/changeEmitOut\.push\(\{\s*customerId,\s*treatmentId/);
    expect(V101_BACKFILL).toMatch(/changeEmitOut\.push\(\{\s*\.\.\.canonicalAudit/);
  });

  it('SG3: V101 backfill canonical output stamps fromCourse.name not top-level courseName', () => {
    // The helper builds the canonical shape with fromCourse nested object.
    expect(V101_BACKFILL).toMatch(/fromCourse:\s*\{\s*courseId:\s*null,\s*name:/);
    // qtyDelta MUST be signed (negative for use)
    expect(V101_BACKFILL).toMatch(/qtyDelta:\s*-deductQty/);
  });

  it('SG4: V104 migration script exists + reads garbage shape + writes canonical', () => {
    expect(V104_MIGRATE).toMatch(/buildCanonicalUseAuditFromLegacy/);
    expect(V104_MIGRATE).toMatch(/_v104Migrated/);
    expect(V104_MIGRATE).toMatch(/_v104MigratedFrom/);
    // Idempotency check
    expect(V104_MIGRATE).toMatch(/if \(d\._v104Migrated\)/);
  });

  it('SG5: AV92 invariant present in audit-anti-vibe-code SKILL.md', () => {
    expect(AV_SKILL).toMatch(/AV92/);
    expect(AV_SKILL).toMatch(/be_course_changes/);
    expect(AV_SKILL).toMatch(/buildChangeAuditEntry/);
  });

  it('SG6: CourseHistoryTab display reader still reads canonical fromCourse.name', () => {
    // Locks the contract — display reads `entry.fromCourse?.name`. If a future
    // refactor flattens this back, the test catches it.
    expect(COURSE_HISTORY).toMatch(/entry\.fromCourse\?\.\s*name/);
    expect(COURSE_HISTORY).toMatch(/ไม่ระบุคอร์ส/);
  });

  it('SG7: V104-followup marker comment present in V101 backfill script', () => {
    expect(V101_BACKFILL).toMatch(/V104-followup/);
  });
});

describe('V104-followup.U — buildCanonicalUseAudit parity with canonical buildChangeAuditEntry', () => {
  it('U1: canonical shape contains all required keys', () => {
    const canonical = buildChangeAuditEntry({
      customerId: 'TEST-V104-CUST',
      kind: 'use',
      fromCourse: { name: 'Test Course', status: 'กำลังใช้งาน', value: '0 บาท' },
      qtyDelta: -3,
      qtyBefore: '12/12 ครั้ง',
      qtyAfter: '9/12 ครั้ง',
      productName: 'Test Product',
      productQty: 3,
      productUnit: 'ครั้ง',
      linkedTreatmentId: 'TEST-V104-TX',
      reason: 'test',
    });
    const REQUIRED_KEYS = [
      'changeId', 'customerId', 'kind', 'fromCourse', 'toCourse',
      'refundAmount', 'reason', 'actor', 'staffId', 'staffName',
      'qtyDelta', 'qtyBefore', 'qtyAfter', 'toCustomerId', 'toCustomerName',
      'linkedTreatmentId', 'productName', 'productQty', 'productUnit', 'createdAt',
    ];
    for (const key of REQUIRED_KEYS) {
      expect(canonical, `missing canonical key: ${key}`).toHaveProperty(key);
    }
    expect(canonical.fromCourse).toHaveProperty('name', 'Test Course');
    expect(canonical.qtyDelta).toBe(-3);
  });

  it('U2: V104 migration helper output structure matches canonical key set', () => {
    // We can't easily import the helper from the .mjs script in vitest, but we
    // can source-grep that the helper writes ALL required canonical fields.
    const REQUIRED_KEYS = [
      'changeId', 'customerId', 'kind', 'fromCourse', 'toCourse',
      'refundAmount', 'reason', 'actor', 'staffId', 'staffName',
      'qtyDelta', 'qtyBefore', 'qtyAfter', 'toCustomerId', 'toCustomerName',
      'linkedTreatmentId', 'productName', 'productQty', 'productUnit', 'createdAt',
    ];
    for (const key of REQUIRED_KEYS) {
      const re = new RegExp(`\\b${key}\\s*:`, 'g');
      const v104Hits = V104_MIGRATE.match(re) || [];
      const v101Hits = V101_BACKFILL.match(re) || [];
      expect(v104Hits.length, `V104 migrate script missing key: ${key}`).toBeGreaterThan(0);
      expect(v101Hits.length, `V101 backfill script (post-fix) missing key: ${key}`).toBeGreaterThan(0);
    }
  });
});
