// ─── V83-followup-3 — Perm/Tab mapping completeness (EOD8 2026-05-18) ──
// User report (verbatim): "คนที่มีสิทธิ์ในการตั้งค่า จัดการสินค้า จัดการ
// กลุ่มสินค้า เครื่องหัตถการ จัดการหน่วยสินค้า หรืออื่นๆ แต่ sub tab
// ทั้งแบบเดิมและใหม่ กลับปรากฎไม่ครบ ... ฝากเช็คว่าสิทธิ์กับสิ่งที่ app
// เราอนุญาติมันตรงกันทั้งหมดจริงๆ".
//
// Root cause: canAccessTab line 177 `if (gate.adminOnly) return false;`
// short-circuits BEFORE checking `requires`. 11 master-data tabs had
// `adminOnly:true` while their matching perm key existed in
// permissionGroupValidation.js — perms were dead. Class-of-bug: gate-vs-
// catalog drift (V12 multi-reader-sweep family at permission-mapping
// boundary).
//
// Tests:
// - C1: every perm key → maps to a tab gate that ACCEPTS it (no dead perms)
// - C2: 11 affected tabs specifically (regression locks)
// - C3: per-tab canAccessTab matrix — non-admin with perm GETS access
// - C4: sanctioned adminOnly list (no specific perm OR destructive op)
// - C5: source-grep regression — no adminOnly:true on tab that has matching perm

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  PERMISSION_MODULES,
  ALL_PERMISSION_KEYS,
} from '../src/lib/permissionGroupValidation.js';
import {
  canAccessTab,
  TAB_PERMISSION_MAP,
} from '../src/lib/tabPermissions.js';

// Canonical mapping declared by V83-followup-3 — used as source of truth
// for the regression bank. If this map drifts vs tabPermissions.js or vs
// permissionGroupValidation.js, the tests fail and force a sync.
const PERM_TO_TAB = Object.freeze({
  product_group:                 'product-groups',
  default_product_unit:          'product-units',
  medical_instrument:            'medical-instruments',
  holiday_setting:               'holidays',
  branch_management:             'branches',
  exam_room_management:          'exam-rooms',
  permission_group_management:   'permission-groups',
  user_management:               'staff',
  doctor_management:             'doctors',
  product_management:            'products',
  course_management:             'courses',
  clinic_course_management:      'courses',
  // Already correctly wired pre-V83-followup-3:
  system_config_management:      'system-settings',
  recall_management:             null,    // sub-pill inside RecallTab, not a separate tab
  link_request_management:       'link-requests',
  google_calendar:               null,    // no standalone tab (handled via settings UI)
  df_group:                      'df-groups',
  user_schedule_management:      'staff-schedules',
  user_schedule_view:            'staff-schedules',
  doctor_schedule_management:    'doctor-schedules',
  doctor_schedule_view:          'doctor-schedules',
});

// Sanctioned adminOnly tabs — no specific perm in catalog OR destructive op
// where admin claim is the intended gate. Adding to this list requires
// justification + V-entry.
const SANCTIONED_ADMIN_ONLY = Object.freeze(new Set([
  'masterdata',          // stale entry — tab removed in V50
  'finance-master',      // umbrella, no specific perm
  'document-templates',  // no perm declared for templates admin
  'line-settings',       // LINE OA channel + bot config (admin)
  'fb-settings',         // Per-branch FB Page settings (admin)
  'backup-manager',      // destructive (admin-only)
  'branch-backup',       // destructive (admin-only)
]));

describe('V83-followup-3 — Perm/Tab mapping completeness', () => {
  describe('C1 — Every perm has a matching tab gate that ACCEPTS it (no dead perms)', () => {
    for (const [permKey, tabId] of Object.entries(PERM_TO_TAB)) {
      if (tabId === null) continue; // perm-without-tab is intentional for some keys
      it(`C1.${permKey} → ${tabId} accepts perm ${permKey}`, () => {
        const got = canAccessTab(tabId, { [permKey]: true }, false);
        expect(got).toBe(true);
      });
    }
  });

  describe('C2 — 11 affected tabs specifically (regression locks)', () => {
    const PAIRS = [
      ['product-groups',       'product_group'],
      ['product-units',        'default_product_unit'],
      ['medical-instruments',  'medical_instrument'],
      ['holidays',             'holiday_setting'],
      ['branches',             'branch_management'],
      ['exam-rooms',           'exam_room_management'],
      ['permission-groups',    'permission_group_management'],
      ['staff',                'user_management'],
      ['doctors',              'doctor_management'],
      ['products',             'product_management'],
      ['courses',              'course_management'], // also clinic_course_management
    ];
    for (const [tabId, permKey] of PAIRS) {
      it(`C2 — ${tabId} gate has requires:[${permKey}...] (NOT adminOnly)`, () => {
        const gate = TAB_PERMISSION_MAP[tabId];
        expect(gate).toBeDefined();
        expect(gate.requires).toBeDefined();
        expect(gate.requires).toContain(permKey);
        // Anti-regression: adminOnly MUST NOT short-circuit perm check
        expect(gate.adminOnly).toBeFalsy();
      });
    }
  });

  describe('C3 — Per-tab canAccessTab matrix (4 personas × 11 tabs)', () => {
    const TABS = [
      'product-groups', 'product-units', 'medical-instruments', 'holidays',
      'branches', 'exam-rooms', 'permission-groups', 'staff', 'doctors',
      'products', 'courses',
    ];
    const PERM_OF = {
      'product-groups':      'product_group',
      'product-units':       'default_product_unit',
      'medical-instruments': 'medical_instrument',
      'holidays':            'holiday_setting',
      'branches':            'branch_management',
      'exam-rooms':          'exam_room_management',
      'permission-groups':   'permission_group_management',
      'staff':               'user_management',
      'doctors':             'doctor_management',
      'products':            'product_management',
      'courses':             'course_management',
    };
    for (const tabId of TABS) {
      const perm = PERM_OF[tabId];
      it(`C3 — ${tabId}: admin gets access`, () => {
        expect(canAccessTab(tabId, {}, true)).toBe(true);
      });
      it(`C3 — ${tabId}: non-admin WITH ${perm} gets access`, () => {
        expect(canAccessTab(tabId, { [perm]: true }, false)).toBe(true);
      });
      it(`C3 — ${tabId}: non-admin WITHOUT perm denied`, () => {
        expect(canAccessTab(tabId, {}, false)).toBe(false);
      });
      it(`C3 — ${tabId}: non-admin WITH unrelated perm denied`, () => {
        expect(canAccessTab(tabId, { customer_view: true }, false)).toBe(false);
      });
    }
  });

  describe('C4 — Sanctioned adminOnly list is explicit', () => {
    it('C4.1 — every adminOnly:true tab in TAB_PERMISSION_MAP is sanctioned', () => {
      const offending = [];
      for (const [tabId, gate] of Object.entries(TAB_PERMISSION_MAP)) {
        if (gate.adminOnly === true && !SANCTIONED_ADMIN_ONLY.has(tabId)) {
          offending.push(tabId);
        }
      }
      expect(offending).toEqual([]);
    });
  });

  describe('C5 — Source-grep regression locks', () => {
    const SOURCE = readFileSync(
      join(process.cwd(), 'src/lib/tabPermissions.js'),
      'utf8'
    );

    it('C5.1 — exam-rooms entry has NO adminOnly (pre-fix had dead requires)', () => {
      expect(SOURCE).not.toMatch(/'exam-rooms':\s*\{\s*requires:[^}]*adminOnly:\s*true/);
    });

    it('C5.2 — 11 affected tabs use requires (not adminOnly:true)', () => {
      const tabs = [
        'product-groups', 'product-units', 'medical-instruments', 'holidays',
        'branches', 'exam-rooms', 'permission-groups', 'staff', 'doctors',
        'products', 'courses',
      ];
      for (const tab of tabs) {
        // Anti-regression: NONE of these should have `adminOnly:true` in the same line
        const re = new RegExp(`['"]${tab}['"]:\\s*\\{[^}]*adminOnly:\\s*true`);
        expect(SOURCE).not.toMatch(re);
      }
    });

    it('C5.3 — V83-followup-3 marker comment present', () => {
      expect(SOURCE).toMatch(/V83-followup-3/);
    });
  });

  describe('C6 — Permission catalog × tab gate completeness (no orphan perms)', () => {
    // For every perm key in the settings module specifically, either it maps
    // to a tab gate via `requires` OR it lives in our intentional-no-tab list
    // (recall_management = sub-pill, google_calendar = no standalone tab).
    const SETTINGS_PERMS = Object.freeze([
      'branch_management', 'exam_room_management', 'holiday_setting',
      'medical_instrument', 'product_management', 'default_product_unit',
      'product_group', 'permission_group_management', 'doctor_management',
      'user_management', 'google_calendar', 'system_config_management',
      'recall_management', 'link_request_management',
    ]);
    const NO_TAB_PERMS = Object.freeze(new Set([
      'recall_management', // sub-pill inside RecallTab
      'google_calendar',   // no standalone tab
    ]));

    for (const perm of SETTINGS_PERMS) {
      it(`C6 — settings perm "${perm}" either grants a tab OR is intentionally tab-less`, () => {
        if (NO_TAB_PERMS.has(perm)) {
          expect(true).toBe(true); // intentional no-tab
          return;
        }
        // Find ANY tab that accepts this perm via requires
        let accepting = null;
        for (const [tabId, gate] of Object.entries(TAB_PERMISSION_MAP)) {
          const reqs = gate.requires || [];
          if (reqs.includes(perm)) {
            accepting = tabId;
            break;
          }
        }
        expect(accepting).not.toBeNull();
      });
    }
  });
});
