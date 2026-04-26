// ─── Phase 9 HTML scraper — 30 adversarial scenarios ─────────────────────
// Tests extractCouponLikeRows against realistic ProClinic-style HTML.

import { describe, it, expect } from 'vitest';
import { extractCouponLikeRows } from '../api/proclinic/master.js';

const wrapTable = (rowsHtml) => `
  <table>
    <thead><tr><th>ชื่อ</th><th>โค้ด</th><th>ส่วนลด</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
`;

describe('extractCouponLikeRows — coupon entity (15 scenarios)', () => {
  it('S1 empty HTML → []', () => {
    expect(extractCouponLikeRows('', 'coupon')).toEqual([]);
  });

  it('S2 HTML without any coupon links → []', () => {
    const h = '<p>No coupons here</p>';
    expect(extractCouponLikeRows(h, 'coupon')).toEqual([]);
  });

  it('S3 single row with data-url', () => {
    const h = wrapTable(`
      <tr><td>คูปองปีใหม่</td><td>NEW2026</td>
        <td><button class="btn-delete" data-url="/admin/coupon/123">Del</button></td>
      </tr>
    `);
    const r = extractCouponLikeRows(h, 'coupon');
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('123');
    expect(r[0]._rowText).toContain('คูปองปีใหม่');
  });

  it('S4 multiple rows unique ids', () => {
    const h = wrapTable([1, 2, 3].map(i =>
      `<tr><td>C${i}</td><td><button data-url="/admin/coupon/${i * 10}">x</button></td></tr>`
    ).join(''));
    const r = extractCouponLikeRows(h, 'coupon');
    expect(r.map(x => x.id)).toEqual(['10', '20', '30']);
  });

  it('S5 deduplicates same id appearing in both delete + edit btn', () => {
    const h = `
      <tr>
        <td>C1</td>
        <td><button data-delete-url="/admin/coupon/7">Del</button></td>
        <td><button data-edit-url="/admin/coupon/7">Edit</button></td>
        <td><a href="/admin/coupon/7/edit">link</a></td>
      </tr>
    `;
    const r = extractCouponLikeRows(h, 'coupon');
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('7');
  });

  it('S6 ignores non-coupon /admin/ urls', () => {
    const h = `
      <tr>
        <td><a href="/admin/customer/5">cust</a></td>
        <td><button data-url="/admin/promotion/5">promo</button></td>
        <td><button data-url="/admin/coupon/42">coup</button></td>
      </tr>
    `;
    const r = extractCouponLikeRows(h, 'coupon');
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('42');
  });

  it('S7 href-based anchor link picked up', () => {
    const h = `<div><a href="/admin/coupon/99/edit">แก้ไข</a></div>`;
    const r = extractCouponLikeRows(h, 'coupon');
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('99');
  });

  it('S8 rowText captures sibling text', () => {
    const h = wrapTable(`
      <tr>
        <td>Clinic Gold 30%</td>
        <td>GOLD30</td>
        <td><button data-url="/admin/coupon/42">x</button></td>
      </tr>
    `);
    const r = extractCouponLikeRows(h, 'coupon');
    expect(r[0]._rowText).toMatch(/Clinic Gold 30%/);
    expect(r[0]._rowText).toMatch(/GOLD30/);
  });

  it('S9 ignores malformed url (no id)', () => {
    const h = `<button data-url="/admin/coupon/abc">x</button>`;
    const r = extractCouponLikeRows(h, 'coupon');
    expect(r).toHaveLength(0);
  });

  it('S10 id at end of path', () => {
    const h = `<button data-url="/admin/coupon/777">x</button>`;
    expect(extractCouponLikeRows(h, 'coupon')[0].id).toBe('777');
  });

  it('S11 id with trailing slash', () => {
    const h = `<a href="/admin/coupon/55/">x</a>`;
    expect(extractCouponLikeRows(h, 'coupon')[0].id).toBe('55');
  });

  it('S12 handles 100 rows without issue', () => {
    const rows = Array.from({ length: 100 }, (_, i) =>
      `<tr><td>C${i}</td><td><button data-url="/admin/coupon/${i + 1}">x</button></td></tr>`
    ).join('');
    const r = extractCouponLikeRows(wrapTable(rows), 'coupon');
    expect(r).toHaveLength(100);
  });

  it('S13 rows without any url attr → skipped', () => {
    const h = `<tr><td>C1</td><td>no button</td></tr>`;
    const r = extractCouponLikeRows(h, 'coupon');
    expect(r).toHaveLength(0);
  });

  it('S14 numeric id with leading zeros preserved (regex captures raw)', () => {
    const h = `<button data-url="/admin/coupon/0042">x</button>`;
    expect(extractCouponLikeRows(h, 'coupon')[0].id).toBe('0042');
  });

  it('S15 empty attr values ignored', () => {
    const h = `<button data-url="" href="">x</button>`;
    expect(extractCouponLikeRows(h, 'coupon')).toEqual([]);
  });
});

describe('extractCouponLikeRows — voucher entity (10 scenarios)', () => {
  it('V1 voucher pattern works', () => {
    const h = `<a href="/admin/voucher/8">v</a>`;
    const r = extractCouponLikeRows(h, 'voucher');
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('8');
  });

  it('V2 voucher ignores coupon urls', () => {
    const h = `
      <a href="/admin/coupon/5">c</a>
      <a href="/admin/voucher/9">v</a>
    `;
    const r = extractCouponLikeRows(h, 'voucher');
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('9');
  });

  it('V3 data-url voucher', () => {
    const h = `<button data-url="/admin/voucher/100/edit">x</button>`;
    expect(extractCouponLikeRows(h, 'voucher')[0].id).toBe('100');
  });

  it('V4 rowText for voucher', () => {
    const h = wrapTable(`
      <tr>
        <td>HDmall 500</td>
        <td>1500 บาท</td>
        <td><button data-url="/admin/voucher/77">x</button></td>
      </tr>
    `);
    const r = extractCouponLikeRows(h, 'voucher');
    expect(r[0]._rowText).toMatch(/HDmall/);
    expect(r[0]._rowText).toMatch(/1500 บาท/);
  });

  it('V5 voucher dedup', () => {
    const h = `
      <button data-url="/admin/voucher/10">d</button>
      <a href="/admin/voucher/10/edit">e</a>
    `;
    const r = extractCouponLikeRows(h, 'voucher');
    expect(r).toHaveLength(1);
  });

  it('V6 voucher 1000-row stress', () => {
    const rows = Array.from({ length: 1000 }, (_, i) =>
      `<a href="/admin/voucher/${i}">v${i}</a>`
    ).join('');
    const r = extractCouponLikeRows(rows, 'voucher');
    // Note: id 0 is in the list too
    expect(r.length).toBeGreaterThanOrEqual(999);
  });

  it('V7 returns empty for unrelated HTML', () => {
    expect(extractCouponLikeRows('<p>no vouchers</p>', 'voucher')).toEqual([]);
  });

  it('V8 handles ProClinic logout link without picking up', () => {
    const h = `<a href="/admin/logout">out</a>`;
    expect(extractCouponLikeRows(h, 'voucher')).toEqual([]);
  });

  it('V9 entity substring not matched', () => {
    // '/admin/voucher-types/5' should NOT match entity='voucher' — it should only match '/admin/voucher/<digits>'
    const h = `<a href="/admin/voucher-types/5">x</a>`;
    expect(extractCouponLikeRows(h, 'voucher')).toEqual([]);
  });

  it('V10 coupon entity ignores voucher url', () => {
    const h = `<a href="/admin/voucher/10">v</a>`;
    expect(extractCouponLikeRows(h, 'coupon')).toEqual([]);
  });
});

describe('extractCouponLikeRows — resilience (5 scenarios)', () => {
  it('R1 malformed HTML (unclosed tags) doesn\'t crash', () => {
    const h = `<div><button data-url="/admin/coupon/1"><span>unclosed`;
    expect(() => extractCouponLikeRows(h, 'coupon')).not.toThrow();
  });

  it('R2 deeply nested structures', () => {
    let h = '<div>'.repeat(50) + '<a href="/admin/coupon/5">x</a>' + '</div>'.repeat(50);
    const r = extractCouponLikeRows(h, 'coupon');
    expect(r).toHaveLength(1);
  });

  it('R3 Thai + special chars in rowText', () => {
    const h = wrapTable(`
      <tr>
        <td>โปรโมชัน 🎉 "quoted" &amp; &#064; สัญลักษณ์</td>
        <td><button data-url="/admin/coupon/1">x</button></td>
      </tr>
    `);
    const r = extractCouponLikeRows(h, 'coupon');
    expect(r[0]._rowText).toMatch(/โปรโมชัน/);
  });

  it('R4 null/undefined html → no throw (cheerio handles)', () => {
    expect(() => extractCouponLikeRows(null, 'coupon')).not.toThrow();
    expect(() => extractCouponLikeRows(undefined, 'coupon')).not.toThrow();
  });

  it('R5 same id across different buttons counted once (dedup across scanners)', () => {
    const h = `
      <button data-url="/admin/coupon/1">a</button>
      <button data-delete-url="/admin/coupon/1">b</button>
      <a href="/admin/coupon/1">c</a>
      <a href="/admin/coupon/1/edit">d</a>
    `;
    const r = extractCouponLikeRows(h, 'coupon');
    expect(r).toHaveLength(1);
  });
});
