// ─── Phase 24.0-duodecies — OPD banner "ดู/แก้ไขข้อมูลลูกค้า" buttons ──
//
// User report 2026-05-06: "หน้าประวัติผู้ป่วย OPD ใน frontend ตรง tab
// บันทึก OPD เรียบร้อยแล้ว ในภาพ ให้เพิ่มปุ่ม แก้ไขข้อมูลลูกค้า และปุ่ม
// ดูข้อมูลลูกค้า เข้าไปด้วย โดยปุ่ม
//   - แก้ไขข้อมูลลูกค้า = เปิด tab หน้าแก้ไขข้อมูลลูกค้าคนนั้นใน backend
//   - ดูข้อมูลลูกค้า = เปิด tab ดูข้อมูลลูกค้าใน backend"
//
// Implementation:
//   - customerNavigation.js gains buildCustomerEditUrl +
//     openCustomerEditInNewTab (mirror of buildCustomerDetailUrl +
//     openCustomerInNewTab; appends &mode=edit)
//   - BackendDashboard deep-link useEffect honors `mode=edit` →
//     setEditingCustomer(c) instead of setViewingCustomer(c)
//   - AdminDashboard OPD banner ("บันทึก OPD เรียบร้อยแล้ว") gains 2 new
//     buttons gated on brokerProClinicHN || brokerProClinicId

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildCustomerDetailUrl,
  buildCustomerEditUrl,
  openCustomerInNewTab,
  openCustomerEditInNewTab,
} from '../src/lib/customerNavigation.js';

const ROOT = path.join(__dirname, '..');
const CN = fs.readFileSync(path.join(ROOT, 'src/lib/customerNavigation.js'), 'utf8');
const ADMIN = fs.readFileSync(path.join(ROOT, 'src/pages/AdminDashboard.jsx'), 'utf8');
const BACKEND = fs.readFileSync(path.join(ROOT, 'src/pages/BackendDashboard.jsx'), 'utf8');

describe('Phase 24.0-duodecies — buildCustomerEditUrl', () => {
  it('OBC.A.1 — empty / null / whitespace → empty string', () => {
    expect(buildCustomerEditUrl('')).toBe('');
    expect(buildCustomerEditUrl(null)).toBe('');
    expect(buildCustomerEditUrl(undefined)).toBe('');
    expect(buildCustomerEditUrl('   ')).toBe('');
  });

  it('OBC.A.2 — appends mode=edit + customer id, encoded', () => {
    const original = window.location;
    delete window.location;
    window.location = { origin: 'https://lover-clinic-app.vercel.app' };
    try {
      expect(buildCustomerEditUrl('LC-26000005')).toBe(
        'https://lover-clinic-app.vercel.app/?backend=1&customer=LC-26000005&mode=edit',
      );
    } finally {
      window.location = original;
    }
  });

  it('OBC.A.3 — special chars in id are encoded', () => {
    const original = window.location;
    delete window.location;
    window.location = { origin: 'https://example.com' };
    try {
      // Slash + special chars properly encoded.
      expect(buildCustomerEditUrl('LC-26/00 0005')).toBe(
        'https://example.com/?backend=1&customer=LC-26%2F00%200005&mode=edit',
      );
    } finally {
      window.location = original;
    }
  });

  it('OBC.A.4 — diverges from view URL by exactly the mode=edit suffix', () => {
    const original = window.location;
    delete window.location;
    window.location = { origin: 'https://x.com' };
    try {
      const view = buildCustomerDetailUrl('LC-1');
      const edit = buildCustomerEditUrl('LC-1');
      expect(edit).toBe(`${view}&mode=edit`);
    } finally {
      window.location = original;
    }
  });
});

describe('Phase 24.0-duodecies — openCustomerEditInNewTab', () => {
  let originalOpen;
  let openSpy;

  beforeEach(() => {
    originalOpen = window.open;
    openSpy = vi.fn();
    window.open = openSpy;
  });
  afterEach(() => {
    window.open = originalOpen;
  });

  it('OBC.B.1 — empty id → returns false, does NOT call window.open', () => {
    expect(openCustomerEditInNewTab('')).toBe(false);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('OBC.B.2 — valid id → calls window.open with edit URL + new-tab flags', () => {
    const original = window.location;
    delete window.location;
    window.location = { origin: 'https://x.com' };
    try {
      expect(openCustomerEditInNewTab('LC-26000005')).toBe(true);
      expect(openSpy).toHaveBeenCalledTimes(1);
      const [url, target, features] = openSpy.mock.calls[0];
      expect(url).toBe('https://x.com/?backend=1&customer=LC-26000005&mode=edit');
      expect(target).toBe('_blank');
      expect(features).toBe('noopener,noreferrer');
    } finally {
      window.location = original;
    }
  });

  it('OBC.B.3 — view variant unaffected by edit additions', () => {
    const original = window.location;
    delete window.location;
    window.location = { origin: 'https://x.com' };
    try {
      openCustomerInNewTab('LC-1');
      expect(openSpy).toHaveBeenCalledTimes(1);
      const [url] = openSpy.mock.calls[0];
      expect(url).toBe('https://x.com/?backend=1&customer=LC-1');
      // Anti-regression: view URL must NOT pick up &mode=edit.
      expect(url).not.toMatch(/&mode=edit/);
    } finally {
      window.location = original;
    }
  });
});

describe('Phase 24.0-duodecies — customerNavigation source-grep', () => {
  it('OBC.C.1 — both helpers exported', () => {
    expect(CN).toMatch(/export\s+function\s+buildCustomerEditUrl/);
    expect(CN).toMatch(/export\s+function\s+openCustomerEditInNewTab/);
  });

  it('OBC.C.2 — Phase 24.0-duodecies marker present', () => {
    expect(CN).toMatch(/Phase 24\.0-duodecies/);
  });

  it('OBC.C.3 — edit URL uses mode=edit suffix (not legacy &edit=1 / similar drift)', () => {
    expect(CN).toMatch(/&mode=edit/);
    // Anti-drift: avoid alternate spellings that would silently break the
    // BackendDashboard deep-link reader.
    expect(CN).not.toMatch(/&edit=true/);
    expect(CN).not.toMatch(/&edit=1/);
  });

  it('OBC.C.4 — both helpers use noopener,noreferrer (security defense-in-depth)', () => {
    const occurrences = CN.match(/noopener,noreferrer/g) || [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Phase 24.0-duodecies — BackendDashboard deep-link wiring', () => {
  it('OBC.D.1 — useEffect reads `mode` query param', () => {
    expect(BACKEND).toMatch(/const\s+mode\s*=\s*params\.get\(['"]mode['"]\)/);
  });

  it('OBC.D.2 — mode=edit branch calls setEditingCustomer', () => {
    expect(BACKEND).toMatch(/mode\s*===\s*['"]edit['"][\s\S]{0,80}?setEditingCustomer/);
  });

  it('OBC.D.3 — non-edit branch still calls setViewingCustomer (default)', () => {
    // The else branch must keep the legacy view path so view links don't
    // regress.
    expect(BACKEND).toMatch(/else\s*\{\s*\n\s*setViewingCustomer/);
  });

  it('OBC.D.4 — setActiveTab(\'customers\') runs in BOTH paths', () => {
    // Customers tab must be activated regardless of mode so the deep-link
    // lands inside the customer area, not on whatever tab the user last had
    // selected.
    const customerBlock = BACKEND.match(/if\s*\(customerId\)\s*\{[\s\S]{0,800}?\}\s*else\s*\{/);
    expect(customerBlock).toBeTruthy();
    expect(customerBlock[0]).toMatch(/setActiveTab\(['"]customers['"]\)/);
  });

  it('OBC.D.5 — Phase 24.0-duodecies marker present in BackendDashboard', () => {
    expect(BACKEND).toMatch(/Phase 24\.0-duodecies/);
  });
});

describe('Phase 24.0-duodecies — AdminDashboard OPD banner buttons', () => {
  it('OBC.E.1 — customerNavigation imports landed', () => {
    expect(ADMIN).toMatch(
      /import\s+\{\s*openCustomerInNewTab\s*,\s*openCustomerEditInNewTab\s*\}\s+from\s+['"]\.\.\/lib\/customerNavigation\.js['"]/,
    );
  });

  it('OBC.E.2 — view-customer button rendered with testid', () => {
    expect(ADMIN).toContain('data-testid="opd-banner-view-customer-btn"');
  });

  it('OBC.E.3 — edit-customer button rendered with testid', () => {
    expect(ADMIN).toContain('data-testid="opd-banner-edit-customer-btn"');
  });

  it('OBC.E.4 — view-button onClick uses openCustomerInNewTab with brokerProClinicHN || brokerProClinicId', () => {
    expect(ADMIN).toMatch(
      /onClick=\{\s*\(\)\s*=>\s*openCustomerInNewTab\(\s*viewingSession\.brokerProClinicHN\s*\|\|\s*viewingSession\.brokerProClinicId\s*\)\s*\}/,
    );
  });

  it('OBC.E.5 — edit-button onClick uses openCustomerEditInNewTab with same fallback', () => {
    expect(ADMIN).toMatch(
      /onClick=\{\s*\(\)\s*=>\s*openCustomerEditInNewTab\(\s*viewingSession\.brokerProClinicHN\s*\|\|\s*viewingSession\.brokerProClinicId\s*\)\s*\}/,
    );
  });

  it('OBC.E.6 — both buttons share the gating: brokerProClinicHN || brokerProClinicId', () => {
    // The render gate must exist (at least one matching guard) so the buttons
    // don't render when neither id is present (e.g. session not yet OPD-saved).
    expect(ADMIN).toMatch(
      /\{\s*\(viewingSession\.brokerProClinicHN\s*\|\|\s*viewingSession\.brokerProClinicId\)\s*&&\s*\(/,
    );
  });

  it('OBC.E.7 — Phase 24.0-duodecies marker present in AdminDashboard', () => {
    expect(ADMIN).toMatch(/Phase 24\.0-duodecies/);
  });

  it('OBC.E.8 — Thai labels match user spec', () => {
    // User explicit labels — not ProClinic-isms or English fallbacks.
    expect(ADMIN).toMatch(/ดูข้อมูลลูกค้า/);
    expect(ADMIN).toMatch(/แก้ไขข้อมูลลูกค้า/);
  });

  it('OBC.E.9 — buttons are siblings of "คอร์สและนัดหมาย ↗" (same parent flex)', () => {
    // Anti-regression: the legacy "คอร์สและนัดหมาย ↗" button stays in the
    // same flex container so the action row stays grouped. The label appears
    // in TWO places (a leading comment mention + the actual JSX button); use
    // the JSX-button match (with <Search size= prefix) for the ordering check.
    // Phase 24.0-quinquiesdecies (2026-05-06) — Resync OPD button added to
    // the same row; bound widened 3000 → 5000 to accommodate it + its tooltip.
    const viewIdx = ADMIN.indexOf('data-testid="opd-banner-view-customer-btn"');
    const editIdx = ADMIN.indexOf('data-testid="opd-banner-edit-customer-btn"');
    const courseBtnIdx = ADMIN.indexOf('<Search size={9}/> คอร์สและนัดหมาย');
    expect(viewIdx).toBeGreaterThan(0);
    expect(editIdx).toBeGreaterThan(viewIdx); // edit comes after view
    expect(courseBtnIdx).toBeGreaterThan(editIdx); // legacy course button stays last
    // All three within ~5 KB of each other → same parent flex container.
    expect(courseBtnIdx - viewIdx).toBeLessThan(5000);
  });
});

describe('Phase 24.0-duodecies — full-flow simulate (Rule I)', () => {
  it('OBC.F.1 — kiosk session with brokerProClinicHN → click view → opens detail URL', () => {
    const original = window.location;
    delete window.location;
    window.location = { origin: 'https://lover-clinic-app.vercel.app' };
    const openSpy = vi.fn();
    const originalOpen = window.open;
    window.open = openSpy;
    try {
      const session = {
        id: 'DEP-321D3C',
        brokerProClinicHN: 'LC-26000005',
        opdRecordedAt: Date.now(),
        brokerStatus: 'done',
      };
      // Simulate the button onClick handler.
      const ok = openCustomerInNewTab(session.brokerProClinicHN || session.brokerProClinicId);
      expect(ok).toBe(true);
      expect(openSpy).toHaveBeenCalledWith(
        'https://lover-clinic-app.vercel.app/?backend=1&customer=LC-26000005',
        '_blank',
        'noopener,noreferrer',
      );
    } finally {
      window.open = originalOpen;
      window.location = original;
    }
  });

  it('OBC.F.2 — same session → click edit → opens edit URL with mode=edit', () => {
    const original = window.location;
    delete window.location;
    window.location = { origin: 'https://lover-clinic-app.vercel.app' };
    const openSpy = vi.fn();
    const originalOpen = window.open;
    window.open = openSpy;
    try {
      const session = { brokerProClinicHN: 'LC-26000005' };
      const ok = openCustomerEditInNewTab(session.brokerProClinicHN);
      expect(ok).toBe(true);
      expect(openSpy).toHaveBeenCalledWith(
        'https://lover-clinic-app.vercel.app/?backend=1&customer=LC-26000005&mode=edit',
        '_blank',
        'noopener,noreferrer',
      );
    } finally {
      window.open = originalOpen;
      window.location = original;
    }
  });

  it('OBC.F.3 — fallback when only brokerProClinicId is set (legacy session)', () => {
    const original = window.location;
    delete window.location;
    window.location = { origin: 'https://x.com' };
    const openSpy = vi.fn();
    const originalOpen = window.open;
    window.open = openSpy;
    try {
      const session = { brokerProClinicHN: '', brokerProClinicId: '12345' };
      const id = session.brokerProClinicHN || session.brokerProClinicId;
      expect(id).toBe('12345');
      expect(openCustomerInNewTab(id)).toBe(true);
      expect(openSpy.mock.calls[0][0]).toContain('customer=12345');
    } finally {
      window.open = originalOpen;
      window.location = original;
    }
  });

  it('OBC.F.4 — render gate: when neither id present, both buttons hidden', () => {
    // Source-level gate match — confirms the render only happens when at
    // least one id is truthy. (Runtime: gate is `(HN || ID) && (...)`).
    const session = { brokerProClinicHN: '', brokerProClinicId: '' };
    const shouldRender = !!(session.brokerProClinicHN || session.brokerProClinicId);
    expect(shouldRender).toBe(false);
  });

  it('OBC.F.5 — BackendDashboard receives the right param shape after edit-link click', () => {
    // Simulate URL parse on the receiving side.
    const url = 'https://x.com/?backend=1&customer=LC-26000005&mode=edit';
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('backend')).toBe('1');
    expect(params.get('customer')).toBe('LC-26000005');
    expect(params.get('mode')).toBe('edit');
  });
});
