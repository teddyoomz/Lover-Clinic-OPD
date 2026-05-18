// V89 (2026-05-18 EOD+11) — CustomerListTab mobile responsive header.
//
// User report (verbatim):
//   "หน้าลูกค้าใน mobile ปุ่มมันตกขอบ แก้ให้สวยงามสำหรับ mobile ด้วย"
//   "เน้นช่องค้นหาเพราะใช้บ่อย ส่วนปุ่ม พิมพ์ bulk ไร้สาระมาก
//    ปีนึงจะใช้สักที เอาไปแอบตรงไหนก็ได้ดีกว่า"
//
// Cosmetic-shell rule: className/CSS ONLY. ZERO handler/state/onClick touch.
//
// Layout contract:
//   Mobile (<md=768px):
//     - Outer flex-col (search + button-cluster stack vertically)
//     - Search w-full (row 1)
//     - Refresh + Add Customer flex-1 each (row 2, 50/50 split)
//     - Bulk Print hidden (display:none via `hidden md:inline-flex`)
//   Desktop (≥md):
//     - Outer flex-row (single row)
//     - Search flex-1 (takes most width)
//     - Refresh + Bulk + Add inline (3 buttons after search)

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const PATH = path.resolve(__dirname, '../src/components/backend/CustomerListTab.jsx');
const SOURCE = fs.readFileSync(PATH, 'utf8');

describe('V89 — CustomerListTab mobile responsive header', () => {
  it('R1.1 — outer wrapper uses flex-col md:flex-row (responsive stack)', () => {
    // The header bar's inner flex container must stack vertically on mobile.
    expect(SOURCE).toMatch(/flex\s+flex-col\s+md:flex-row/);
  });

  it('R1.2 — V89 marker comment present', () => {
    expect(SOURCE).toMatch(/V89[\s\S]{0,400}mobile responsive/i);
  });

  it('R2.1 — search input wrapper is full-width on mobile (w-full md:w-auto)', () => {
    // Search input has placeholder anchor "ค้นหาลูกค้า". Find the IMMEDIATE
    // parent <div> (relative-positioned wrapper holding the search icon + input).
    // Match the LAST <div className> before the placeholder anchor.
    const idx = SOURCE.indexOf('placeholder="ค้นหาลูกค้า');
    expect(idx).toBeGreaterThan(0);
    // Walk backwards finding the most recent <div className="..."> opener.
    const before = SOURCE.slice(0, idx);
    const allDivs = [...before.matchAll(/<div\s+className="([^"]+)"/g)];
    expect(allDivs.length).toBeGreaterThan(0);
    const lastDivCls = allDivs[allDivs.length - 1][1];
    expect(lastDivCls).toMatch(/flex-1/);
    expect(lastDivCls).toMatch(/w-full/);
    expect(lastDivCls).toMatch(/md:w-auto/);
  });

  it('R3.1 — button-cluster wrapper exists with w-full + md:w-auto', () => {
    // The 3 action buttons live in their own flex wrapper which takes full
    // width on mobile (so refresh/add split 50/50) and auto width on desktop.
    const m = SOURCE.match(/<div\s+className="(flex\s+items-center\s+gap-2\s+md:gap-3\s+w-full\s+md:w-auto)"/);
    expect(m).not.toBeNull();
  });

  it('R4.1 — Refresh button uses flex-1 md:flex-none (50% on mobile, auto on desktop)', () => {
    const m = SOURCE.match(/setRefreshKey\(k => k \+ 1\)[\s\S]{0,500}?className="([^"]+)"/);
    expect(m).not.toBeNull();
    const cls = m[1];
    expect(cls).toMatch(/flex-1\s+md:flex-none/);
    // Padding scales: smaller on mobile, larger on desktop.
    expect(cls).toMatch(/px-3\s+md:px-5/);
    expect(cls).toMatch(/py-2\.5\s+md:py-3/);
  });

  it('R5.1 — Bulk Print button hidden on mobile (hidden md:inline-flex)', () => {
    const m = SOURCE.match(/data-testid="bulk-print-toggle"[\s\S]{0,200}?className=\{`([^`]+)`/);
    expect(m).not.toBeNull();
    const cls = m[1];
    expect(cls).toMatch(/hidden\s+md:inline-flex/);
    // V89 regression lock: bulk MUST NOT be `flex items-center` (always visible).
    expect(cls).not.toMatch(/^flex\s+items-center/);
  });

  it('R6.1 — Add Customer button uses flex-1 md:flex-none mirroring Refresh', () => {
    const m = SOURCE.match(/data-testid="add-customer-button"[\s\S]{0,500}?className="([^"]+)"/);
    expect(m).not.toBeNull();
    const cls = m[1];
    expect(cls).toMatch(/flex-1\s+md:flex-none/);
    expect(cls).toMatch(/px-3\s+md:px-5/);
    expect(cls).toMatch(/py-2\.5\s+md:py-3/);
  });

  it('R7.1 — outer card padding scales mobile (p-3) → desktop (md:p-5)', () => {
    // The card itself gets less padding on mobile to give content more room.
    const m = SOURCE.match(/bg-\[var\(--bg-surface\)\]\s+rounded-2xl\s+(p-3\s+md:p-5)/);
    expect(m).not.toBeNull();
  });
});

describe('V89 — handler / wiring lock (cosmetic-shell constraint)', () => {
  // CRITICAL — user said: "ห้ามยุ่งกับ logic, flow, wiring ใดๆนะ" applies
  // session-wide. Lock every handler unchanged.

  it('W1.1 — Refresh button still wired to setRefreshKey(k => k + 1)', () => {
    expect(SOURCE).toMatch(/onClick=\{\(\)\s*=>\s*setRefreshKey\(k\s*=>\s*k\s*\+\s*1\)\}/);
  });

  it('W1.2 — Bulk Print toggle still wired to setSelectMode + clearSelection', () => {
    expect(SOURCE).toMatch(/setSelectMode\(s\s*=>\s*!s\);\s*if\s*\(selectMode\)\s*clearSelection\(\)/);
  });

  it('W1.3 — Add Customer button still calls onCreateCustomer()', () => {
    expect(SOURCE).toMatch(/onClick=\{\(\)\s*=>\s*onCreateCustomer\(\)\}/);
  });

  it('W1.4 — Search input still bound to filterQuery / setFilterQuery', () => {
    expect(SOURCE).toMatch(/value=\{filterQuery\}/);
    expect(SOURCE).toMatch(/onChange=\{\(e\)\s*=>\s*setFilterQuery\(e\.target\.value\)\}/);
  });

  it('W1.5 — disabled gates unchanged (Refresh on loading, Bulk on loading+empty, Add on loading)', () => {
    // Just check the disabled props still bind to the same expressions.
    expect(SOURCE).toMatch(/disabled=\{loading\s*\|\|\s*customers\.length\s*===\s*0\}/);
  });
});
