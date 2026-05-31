// Task 1 (2026-06-01) — RTL unit for the redesigned SaleTab row parts.
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SaleSourceTag, SaleStatusPill } from '../src/components/backend/SaleRowParts.jsx';

describe('SaleSourceTag', () => {
  it('renders จาก OPD Card for treatment (dark)', () => {
    const { getByTestId } = render(<SaleSourceTag source="treatment" isDark={true} />);
    const el = getByTestId('sale-source-tag-treatment');
    expect(el.textContent).toContain('จาก OPD Card');
    expect(el.className).toMatch(/text-orange-400/);
    expect(el.className).toMatch(/whitespace-nowrap/);
  });
  it('exchange / share / addRemaining labels', () => {
    expect(render(<SaleSourceTag source="exchange" isDark />).getByTestId('sale-source-tag-exchange').textContent).toContain('เปลี่ยนสินค้า');
    expect(render(<SaleSourceTag source="share" isDark />).getByTestId('sale-source-tag-share').textContent).toContain('แชร์คอร์ส');
    expect(render(<SaleSourceTag source="addRemaining" isDark />).getByTestId('sale-source-tag-addRemaining').textContent).toContain('เพิ่มคงเหลือ');
  });
  it('light theme uses light classes', () => {
    expect(render(<SaleSourceTag source="treatment" isDark={false} />).getByTestId('sale-source-tag-treatment').className).toMatch(/text-orange-700/);
  });
  it('returns null for plain form sale / unknown', () => {
    expect(render(<SaleSourceTag source="" isDark />).container.firstChild).toBeNull();
    expect(render(<SaleSourceTag source="weird" isDark />).container.firstChild).toBeNull();
    expect(render(<SaleSourceTag source={undefined} isDark />).container.firstChild).toBeNull();
  });
});

describe('SaleStatusPill', () => {
  it('renders label + nowrap rounded pill + dot (dark)', () => {
    const { container, getByText } = render(<SaleStatusPill color="emerald" label="ชำระแล้ว" isDark />);
    expect(getByText('ชำระแล้ว')).toBeTruthy();
    const pill = container.firstChild;
    expect(pill.className).toMatch(/whitespace-nowrap/);
    expect(pill.className).toMatch(/rounded-full/);
    expect(pill.className).toMatch(/text-emerald-400/);
    expect(pill.querySelector('[aria-hidden]')).toBeTruthy(); // leading dot
  });
  it('6-color map (amber/red/gray/purple/sky) + light + fallback', () => {
    expect(render(<SaleStatusPill color="amber" label="ค้างชำระ" isDark />).container.firstChild.className).toMatch(/text-orange-400/);
    expect(render(<SaleStatusPill color="red" label="ยกเลิก" isDark />).container.firstChild.className).toMatch(/text-red-400/);
    expect(render(<SaleStatusPill color="gray" label="ร่าง" isDark />).container.firstChild.className).toMatch(/text-gray-400/);
    expect(render(<SaleStatusPill color="purple" label="x" isDark={false} />).container.firstChild.className).toMatch(/text-purple-700/);
    expect(render(<SaleStatusPill color="weird" label="x" isDark />).container.firstChild.className).toMatch(/text-sky-400/); // fallback
  });
});
