// AV49 (V71, 2026-05-15) — AppointmentLineBadge MUST NOT be wrapped in an
// absolute-positioned div in admin appt-list code. Inline placement only.
// Sanctioned exception: calendar grid micro-cells in AdminDashboard.jsx
// (badge is already inline; no absolute wrapper exists there).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const read = (p) => readFileSync(path.join(ROOT, p), 'utf-8');

const VIOLATION = /<div[^>]*className=["'][^"']*\babsolute\b[^"']*["'][^>]*>[\s\S]{0,200}<AppointmentLineBadge/;

describe('AV49 inline LINE badge discipline', () => {
  it('AV49.1 AppointmentHubView.jsx has NO absolute wrapper around AppointmentLineBadge', () => {
    const src = read('src/components/admin/AppointmentHubView.jsx');
    expect(VIOLATION.test(src)).toBe(false);
  });

  it('AV49.2 AppointmentHubRowCard.jsx has NO absolute wrapper around AppointmentLineBadge', () => {
    const src = read('src/components/admin/AppointmentHubRowCard.jsx');
    expect(VIOLATION.test(src)).toBe(false);
  });

  it('AV49.3 AdminDashboard.jsx calendar micro-cells inline LINE badge (sanctioned-exception narrow)', () => {
    const src = read('src/pages/AdminDashboard.jsx');
    // Allow `absolute` to exist near AppointmentLineBadge IF it's a different
    // element (e.g. a chip floating in a calendar cell). Just assert no
    // absolute DIV directly wraps the badge within 200 chars.
    expect(VIOLATION.test(src)).toBe(false);
  });
});
