// Phase 25.0b (2026-05-09) — Frontend tab rename "คิว" → "คิว Walk-IN".
// Phase 29.23-bis (2026-05-14) — rename "คิว Walk-IN" → "คิวหน้า Clinic".
// (2026-05-26) — TAB REMOVED. The คิวหน้า Clinic (adminMode='dashboard') tab,
// along with จองไม่มัดจำ / จองมัดจำ / ประวัติ, was removed and unified into the
// นัดหมาย (AppointmentHubView) surface. User: "ถอด Tab คิวหน้าคลินิก,จองมัดจำ,
// จองไม่มัดจำ ออกจากระบบ ... สร้างคิวนัดและดูได้ใน Tab นัดหมายหมดแล้ว".
//
// V21 fixup discipline: the rename contract is superseded by REMOVAL. This file
// now locks that the tab (desktop + mobile dock) is GONE, and preserves the
// older anti-regression guards for the prior labels (still absent).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const SRC = readFileSync('src/pages/AdminDashboard.jsx', 'utf-8');

describe('Phase 25.0b → 29.23-bis → (2026-05-26) คิวหน้า Clinic tab REMOVED', () => {
  it('T1 desktop คิวหน้า Clinic tab label REMOVED', () => {
    expect(SRC).not.toMatch(/<span>คิวหน้า Clinic<\/span>/);
  });

  it('T2 Activity+คิวหน้า Clinic tab pairing REMOVED', () => {
    expect(SRC).not.toMatch(/<Activity size=\{\d+\}\s*\/>\s*<span>คิวหน้า Clinic<\/span>/);
  });

  it('T3 legacy bare "คิว" object-pattern label NOT present', () => {
    expect(SRC).not.toMatch(/mode:\s*'dashboard'[\s\S]*?label:\s*'คิว',\s*badge:/);
  });

  it('T4 legacy "หน้าคิว" desktop label NOT present', () => {
    expect(SRC).not.toMatch(/<Activity[^>]*>\s*หน้าคิว/);
  });

  it('T5 no live setAdminMode(\'dashboard\') (mode removed; guard redirects)', () => {
    expect(SRC).not.toMatch(/setAdminMode\('dashboard'\)/);
  });

  it('T6 prior "คิว Walk-IN" label NOT present', () => {
    expect(SRC).not.toMatch(/<Activity[^>]*>\s*คิว Walk-IN/);
    expect(SRC).not.toMatch(/<span>คิว Walk-IN<\/span>/);
    expect(SRC).not.toMatch(/mode:\s*'dashboard'[\s\S]*?label:\s*'คิว Walk-IN'/);
  });

  it('T7 mobile bottom-dock dashboard (คิว) tab REMOVED', () => {
    expect(SRC).not.toMatch(/data-tab="dashboard"/);
  });
});
