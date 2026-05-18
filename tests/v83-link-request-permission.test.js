// ─── V83 — link_request_management permission gate (EOD8 2026-05-18) ──
// User: "เพิ่มสิทธิ์ในการควบคุมหน้า tab=link-requests ไปใน list สิทธิ์
// ที่เรามีด้วยนะ ... ฝากแก้ตรงสิทธิ์ จัดการเคส Recall (29.22) และ
// ตั้งค่าระบบ (16.3) ให้เอาตัวเลข (29.22) กับ (16.3) ออกไป เราทำเสร็จแล้ว".
//
// Test pyramid:
// - P1: permission key catalog presence + label
// - P2: tabPermissions wiring
// - P3: canAccessTab semantics (4 personas)
// - P4: anti-regression — no (29.22) or (16.3) labels remain
// - P5: source-grep regression — tabPermissions.js has new shape

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

describe('V83 — link_request_management permission gate', () => {
  describe('P1 — Permission key catalog', () => {
    it('P1.1 — link_request_management is in ALL_PERMISSION_KEYS', () => {
      expect(ALL_PERMISSION_KEYS).toContain('link_request_management');
    });

    it('P1.2 — link_request_management lives in settings module', () => {
      const settings = PERMISSION_MODULES.find(m => m.id === 'settings');
      expect(settings).toBeDefined();
      const keys = settings.items.map(i => i.key);
      expect(keys).toContain('link_request_management');
    });

    it('P1.3 — link_request_management has Thai label "จัดการคำขอผูก LINE"', () => {
      const settings = PERMISSION_MODULES.find(m => m.id === 'settings');
      const item = settings.items.find(i => i.key === 'link_request_management');
      expect(item).toBeDefined();
      expect(item.label).toBe('จัดการคำขอผูก LINE');
    });

    it('P1.4 — (16.3) phase tag stripped from system_config_management label', () => {
      const settings = PERMISSION_MODULES.find(m => m.id === 'settings');
      const item = settings.items.find(i => i.key === 'system_config_management');
      expect(item).toBeDefined();
      expect(item.label).toBe('ตั้งค่าระบบ');
      expect(item.label).not.toContain('(16.3)');
    });

    it('P1.5 — (29.22) phase tag stripped from recall_management label', () => {
      const settings = PERMISSION_MODULES.find(m => m.id === 'settings');
      const item = settings.items.find(i => i.key === 'recall_management');
      expect(item).toBeDefined();
      expect(item.label).toBe('จัดการเคส Recall');
      expect(item.label).not.toContain('(29.22)');
    });
  });

  describe('P2 — tabPermissions wiring', () => {
    it('P2.1 — link-requests gate uses requires (not adminOnly)', () => {
      const gate = TAB_PERMISSION_MAP['link-requests'];
      expect(gate).toBeDefined();
      expect(gate.requires).toEqual(['link_request_management']);
      expect(gate.adminOnly).toBeFalsy();
    });
  });

  describe('P3 — canAccessTab semantics for link-requests', () => {
    it('P3.1 — admin gets access (bypass)', () => {
      expect(canAccessTab('link-requests', {}, true)).toBe(true);
    });

    it('P3.2 — non-admin WITH link_request_management gets access', () => {
      expect(canAccessTab('link-requests', { link_request_management: true }, false)).toBe(true);
    });

    it('P3.3 — non-admin WITHOUT permission denied', () => {
      expect(canAccessTab('link-requests', {}, false)).toBe(false);
    });

    it('P3.4 — non-admin WITH unrelated permission denied', () => {
      expect(canAccessTab('link-requests', { customer_view: true }, false)).toBe(false);
    });

    it('P3.5 — non-admin WITH link_request_management:false denied', () => {
      expect(canAccessTab('link-requests', { link_request_management: false }, false)).toBe(false);
    });

    it('P3.6 — admin overrides absent permission (bypass priority)', () => {
      expect(canAccessTab('link-requests', { link_request_management: false }, true)).toBe(true);
    });
  });

  describe('P4 — Anti-regression: no (16.3) or (29.22) in ANY label', () => {
    it('P4.1 — no permission label contains "(16.3)" or "(29.22)"', () => {
      const offending = [];
      for (const mod of PERMISSION_MODULES) {
        for (const item of mod.items) {
          if (item.label.includes('(16.3)') || item.label.includes('(29.22)')) {
            offending.push(`${mod.id}/${item.key}: ${item.label}`);
          }
        }
      }
      expect(offending).toEqual([]);
    });
  });

  describe('P5 — Source-grep regression', () => {
    it('P5.1 — tabPermissions.js link-requests has new shape', () => {
      const content = readFileSync(
        join(process.cwd(), 'src/lib/tabPermissions.js'),
        'utf8'
      );
      expect(content).toMatch(/'link-requests':\s*\{\s*requires:\s*\['link_request_management'\]/);
      // Anti-regression: prior adminOnly form removed for link-requests
      expect(content).not.toMatch(/'link-requests':\s*\{\s*adminOnly:\s*true/);
    });

    it('P5.2 — permissionGroupValidation.js has link_request_management key entry', () => {
      const content = readFileSync(
        join(process.cwd(), 'src/lib/permissionGroupValidation.js'),
        'utf8'
      );
      expect(content).toMatch(/key:\s*'link_request_management'\s*,\s*label:\s*'จัดการคำขอผูก LINE'/);
    });

    it('P5.3 — no (16.3) or (29.22) strings remain in permissionGroupValidation.js labels', () => {
      const content = readFileSync(
        join(process.cwd(), 'src/lib/permissionGroupValidation.js'),
        'utf8'
      );
      // These should not appear in any label string (comments OK)
      expect(content).not.toMatch(/label:\s*'[^']*\(16\.3\)[^']*'/);
      expect(content).not.toMatch(/label:\s*'[^']*\(29\.22\)[^']*'/);
    });
  });
});
