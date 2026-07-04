// 2026-07-05 — Recall full dates (Q1=B) + compact always-3-sections empty state
// (Q2=A). User report IMG_8920: bare "06/07" chips + a vanished "วันนี้" section
// made tomorrow's list read as today's.
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { formatThaiFullDate } from '../src/lib/recallResolvers.js';
import { RecallSectionHeader } from '../src/components/backend/recall/RecallSectionHeader.jsx';
import { RecallList } from '../src/components/backend/recall/RecallList.jsx';

vi.mock('../src/hooks/useTheme.js', () => ({
  useTheme: () => ({ theme: 'dark', isDark: true }),
  useResolvedTheme: () => 'dark',
}));
vi.mock('../src/lib/VipContext.jsx', () => ({
  useIsVip: () => false,
  VipProvider: ({ children }) => children,
}));

afterEach(() => cleanup());

const TODAY = '2026-07-05';

describe('D1 — formatThaiFullDate (Q1=B)', () => {
  it('D1.1 ปกติ: 2026-07-06 → "6 ก.ค. 2569" (พ.ศ. + เดือนไทย)', () => {
    expect(formatThaiFullDate('2026-07-06')).toBe('6 ก.ค. 2569');
  });
  it('D1.2 ขอบปี/เดือน: ม.ค. + ธ.ค. + วันเลขเดียวไม่มีศูนย์นำ', () => {
    expect(formatThaiFullDate('2026-01-01')).toBe('1 ม.ค. 2569');
    expect(formatThaiFullDate('2025-12-31')).toBe('31 ธ.ค. 2568');
  });
  it('D1.3 invalid → "" (ไม่ throw ไม่ NaN)', () => {
    expect(formatThaiFullDate('')).toBe('');
    expect(formatThaiFullDate(null)).toBe('');
    expect(formatThaiFullDate('garbage')).toBe('');
    expect(formatThaiFullDate('2026-13-40')).toBe(''); // month 13 → no Thai month → ''
  });
  it('D1.4 ISO with time suffix ยังอ่านได้', () => {
    expect(formatThaiFullDate('2026-07-06T00:00:00Z')).toBe('6 ก.ค. 2569');
  });
});

describe('D2 — RecallRow date chips (source-grep: no bare dd/mm remains)', () => {
  const rowSrc = fs.readFileSync(path.resolve('src/components/backend/recall/RecallRow.jsx'), 'utf8');
  it('D2.1 dateDisplay ใช้ formatThaiFullDate (ไม่ใช่ dd/mm เปล่า)', () => {
    expect(rowSrc).toMatch(/const dateDisplay = formatThaiFullDate\(recall\.recallDate\) \|\| '--';/);
    expect(rowSrc).not.toMatch(/\$\{m\[3\]\}\/\$\{m\[2\]\}`/); // pre-fix bare dd/mm gone
  });
  it('D2.2 recallDateChip ใช้ formatThaiFullDate (เลิก dd/mm/yyyy+543 คนละ format)', () => {
    expect(rowSrc).toMatch(/const text = formatThaiFullDate\(until\);/);
    expect(rowSrc).not.toMatch(/\$\{m\[3\]\}\/\$\{m\[2\]\}\/\$\{Number\(m\[1\]\) \+ 543\}/);
  });
  it('D2.3 desktop date column ขยายรับวันที่เต็ม (92px)', () => {
    expect(rowSrc).toContain('md:grid-cols-[92px_1fr_auto]');
  });
});

describe('D3 — RecallSectionHeader date suffix + render-at-0', () => {
  it('D3.1 วันนี้ + dateISO → มี " · 5 ก.ค. 2569"', () => {
    render(<RecallSectionHeader bucketKey="today" count={2} dateISO={TODAY} />);
    expect(screen.getByTestId('recall-bucket-date-today').textContent).toContain('5 ก.ค. 2569');
  });
  it('D3.2 count=0 + alwaysRender → render พร้อม "0 รายการ"; count=0 เฉยๆ → null', () => {
    render(<RecallSectionHeader bucketKey="today" count={0} dateISO={TODAY} alwaysRender />);
    expect(screen.getByTestId('recall-section-today').textContent).toContain('0 รายการ');
    cleanup();
    render(<RecallSectionHeader bucketKey="today" count={0} dateISO={TODAY} />);
    expect(screen.queryByTestId('recall-section-today')).toBeNull();
  });
  it('D3.3 bucket ที่เป็นช่วง (overdue) ไม่มี date suffix', () => {
    render(<RecallSectionHeader bucketKey="overdue" count={1} />);
    expect(screen.queryByTestId('recall-bucket-date-overdue')).toBeNull();
  });
});

// Minimal recall fixture for list rendering
const rec = (id, recallDate, extra = {}) => ({
  id, recallDate, customerId: `C-${id}`, customerName: `ลูกค้า ${id}`,
  reason: 'สอบถามดริป', status: 'pending', branchId: 'BR-A', ...extra,
});

describe('D4 — RecallList compact: 3 sections เสมอ + ✓ empty boxes (Q2=A)', () => {
  it('D4.1 ว่างหมด → เห็นครบ 3 หัวข้อ + กล่อง ✓ ครบ 3 (สถานการณ์ IMG_8920 หายขาด)', () => {
    render(<RecallList recalls={[]} todayISO={TODAY} mode="compact" />);
    expect(screen.getByTestId('recall-section-today')).toBeTruthy();
    expect(screen.getByTestId('recall-section-overdue')).toBeTruthy();
    expect(screen.getByTestId('recall-section-tomorrow')).toBeTruthy();
    expect(screen.getByTestId('recall-bucket-empty-today').textContent).toBe('✓ ไม่มี Recall วันนี้');
    expect(screen.getByTestId('recall-bucket-empty-overdue').textContent).toBe('✓ ไม่มีรายการค้าง');
    expect(screen.getByTestId('recall-bucket-empty-tomorrow').textContent).toBe('✓ ไม่มี Recall พรุ่งนี้');
  });

  it('D4.2 มีแต่พรุ่งนี้ (เคสในรูป) → วันนี้/ค้าง ขึ้นกล่อง ✓ + พรุ่งนี้มีของ + date suffix ถูกวัน', () => {
    render(<RecallList recalls={[rec('r1', '2026-07-06')]} todayISO={TODAY} mode="compact" />);
    expect(screen.getByTestId('recall-bucket-empty-today')).toBeTruthy();
    expect(screen.getByTestId('recall-bucket-empty-overdue')).toBeTruthy();
    expect(screen.queryByTestId('recall-bucket-empty-tomorrow')).toBeNull(); // มีของ → ไม่มีกล่องว่าง
    expect(screen.getByTestId('recall-bucket-date-today').textContent).toContain('5 ก.ค. 2569');
    expect(screen.getByTestId('recall-bucket-date-tomorrow').textContent).toContain('6 ก.ค. 2569');
  });

  it('D4.3 มีของวันนี้ → กล่อง ✓ วันนี้หาย + แถวการ์ดโชว์วันที่เต็ม', () => {
    render(<RecallList recalls={[rec('r2', TODAY)]} todayISO={TODAY} mode="compact" />);
    expect(screen.queryByTestId('recall-bucket-empty-today')).toBeNull();
    expect(screen.getByTestId('recall-date-chip-r2').textContent).toBe('5 ก.ค. 2569');
  });

  it('D4.4 ข้ามเดือน/ปี: todayISO 31 ธ.ค. → พรุ่งนี้ = 1 ม.ค. ปีถัดไป (พ.ศ. ขยับ)', () => {
    render(<RecallList recalls={[]} todayISO="2026-12-31" mode="compact" />);
    expect(screen.getByTestId('recall-bucket-date-today').textContent).toContain('31 ธ.ค. 2569');
    expect(screen.getByTestId('recall-bucket-date-tomorrow').textContent).toContain('1 ม.ค. 2570');
  });
});

describe('D5 — full mode ไม่เปลี่ยนพฤติกรรม (skip ว่าง + EmptyState รวม)', () => {
  it('D5.1 ว่างหมด → RecallEmptyState เดิม (ไม่มี per-section boxes)', () => {
    render(<RecallList recalls={[]} todayISO={TODAY} mode="full" />);
    expect(screen.getByTestId('recall-empty-state')).toBeTruthy();
    expect(screen.queryByTestId('recall-bucket-empty-today')).toBeNull();
  });
  it('D5.2 มีแค่พรุ่งนี้ → วันนี้/ค้าง ไม่ render (skip เดิม) แต่หัวข้อพรุ่งนี้มี date suffix', () => {
    render(<RecallList recalls={[rec('r3', '2026-07-06')]} todayISO={TODAY} mode="full" />);
    expect(screen.queryByTestId('recall-section-today')).toBeNull();
    expect(screen.queryByTestId('recall-bucket-empty-today')).toBeNull();
    expect(screen.getByTestId('recall-bucket-date-tomorrow').textContent).toContain('6 ก.ค. 2569');
  });
});

describe('D6 — source-grep: ไม่มีวันที่ไร้ปีเหลือใน recall surfaces', () => {
  it('D6.1 recallResolvers: _formatThaiShortDate delegate ไป formatThaiFullDate', () => {
    const src = fs.readFileSync(path.resolve('src/lib/recallResolvers.js'), 'utf8');
    expect(src).toMatch(/function _formatThaiShortDate\(iso\) \{\s*\n\s*return formatThaiFullDate\(iso\);/);
    expect(src).toMatch(/export function formatThaiFullDate/);
  });
});
