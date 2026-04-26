// ─── Marketing UI utils — adversarial tests (AV10 extract) ─────────────────
// Covers generateMarketingId + scrollToField + resolveIsDark. All pure
// helpers — jsdom + crypto polyfill only.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateMarketingId,
  scrollToField,
  resolveIsDark,
} from '../src/lib/marketingUiUtils.js';

describe('generateMarketingId', () => {
  it('M1 prefix + ts + hex suffix with dashes', () => {
    const id = generateMarketingId('PROMO');
    expect(id).toMatch(/^PROMO-\d{10,}-[0-9a-f]{8}$/);
  });

  it('M2 uppercases prefix', () => {
    expect(generateMarketingId('promo')).toMatch(/^PROMO-/);
  });

  it('M3 defaults to ITEM when prefix empty / nil', () => {
    expect(generateMarketingId('')).toMatch(/^ITEM-/);
    expect(generateMarketingId(null)).toMatch(/^ITEM-/);
    expect(generateMarketingId(undefined)).toMatch(/^ITEM-/);
  });

  it('M4 non-string prefix coerced via String()', () => {
    expect(generateMarketingId(42)).toMatch(/^42-/);
    expect(generateMarketingId(true)).toMatch(/^TRUE-/);
  });

  it('M5 1000 IDs are all unique (crypto randomness)', () => {
    const ids = new Set();
    for (let i = 0; i < 1000; i++) ids.add(generateMarketingId('X'));
    expect(ids.size).toBe(1000);
  });

  it('M6 ts portion is monotonic across rapid calls', () => {
    const ids = Array.from({ length: 10 }, () => generateMarketingId('X'));
    const tss = ids.map(id => Number(id.split('-')[1]));
    for (let i = 1; i < tss.length; i++) {
      expect(tss[i]).toBeGreaterThanOrEqual(tss[i - 1]);
    }
  });

  it('M7 hex suffix has exactly 8 hex chars', () => {
    for (let i = 0; i < 50; i++) {
      const suffix = generateMarketingId('X').split('-').pop();
      expect(suffix).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it('M8 coupon / voucher / promotion prefixes stay distinct', () => {
    const p = generateMarketingId('PROMO');
    const c = generateMarketingId('COUP');
    const v = generateMarketingId('VOUC');
    expect(p.startsWith('PROMO-')).toBe(true);
    expect(c.startsWith('COUP-')).toBe(true);
    expect(v.startsWith('VOUC-')).toBe(true);
  });

  it('M9 no Math.random fingerprint (rule C2)', () => {
    // Indirect check: IDs should diverge even when Date.now is frozen.
    const origNow = Date.now;
    Date.now = () => 1700000000000;
    try {
      const a = generateMarketingId('X');
      const b = generateMarketingId('X');
      expect(a).not.toBe(b); // same ts but different crypto suffix
    } finally {
      Date.now = origNow;
    }
  });

  it('M10 ID fits ProClinic + Firestore key constraints (no /, no long)', () => {
    const id = generateMarketingId('PROMO');
    expect(id).not.toMatch(/[\/#?]/);
    expect(id.length).toBeLessThan(64);
  });
});

describe('scrollToField', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // jsdom doesn't implement scrollIntoView on Elements — stub it.
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = function() {};
    }
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('S1 no-op when DOM has no matching field', () => {
    // Should not throw when selector finds nothing.
    expect(() => scrollToField('missing')).not.toThrow();
  });

  it('S2 no-op on empty / nullish name', () => {
    expect(() => scrollToField('')).not.toThrow();
    expect(() => scrollToField(null)).not.toThrow();
    expect(() => scrollToField(undefined)).not.toThrow();
  });

  it('S3 focuses the first input inside the field wrapper', () => {
    document.body.innerHTML = `
      <div data-field="name"><label>x</label><input id="n" /></div>
    `;
    scrollToField('name');
    expect(document.activeElement?.id).toBe('n');
  });

  it('S4 falls back to textarea / select when no input', () => {
    document.body.innerHTML = `<div data-field="desc"><textarea id="d"></textarea></div>`;
    scrollToField('desc');
    expect(document.activeElement?.id).toBe('d');
  });

  it('S5 adds ring classes synchronously and removes after 3s', () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<div data-field="x"><input /></div>`;
    scrollToField('x');
    const el = document.querySelector('[data-field="x"]');
    expect(el.classList.contains('ring-2')).toBe(true);
    expect(el.classList.contains('ring-red-500')).toBe(true);
    vi.advanceTimersByTime(3001);
    expect(el.classList.contains('ring-2')).toBe(false);
    expect(el.classList.contains('ring-red-500')).toBe(false);
  });

  it('S6 calls scrollIntoView with smooth block:center', () => {
    document.body.innerHTML = `<div data-field="x"><input /></div>`;
    const el = document.querySelector('[data-field="x"]');
    el.scrollIntoView = vi.fn();
    scrollToField('x');
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });

  it('S7 special chars in field name do not crash (CSS selector escape)', () => {
    document.body.innerHTML = `<div data-field="a.b"><input /></div>`;
    // CSS selector `[data-field="a.b"]` is valid — should match
    expect(() => scrollToField('a.b')).not.toThrow();
  });

  it('S8 works even when wrapper has no inputs (still rings)', () => {
    document.body.innerHTML = `<div data-field="empty">text only</div>`;
    scrollToField('empty');
    const el = document.querySelector('[data-field="empty"]');
    expect(el.classList.contains('ring-red-500')).toBe(true);
  });
});

describe('resolveIsDark', () => {
  let originalMatchMedia;
  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
  });
  afterEach(() => {
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
    } else {
      delete window.matchMedia;
    }
  });

  it('D1 explicit "dark" → true', () => {
    expect(resolveIsDark('dark')).toBe(true);
  });

  it('D2 explicit "light" → false', () => {
    expect(resolveIsDark('light')).toBe(false);
  });

  it('D3 "auto" consults matchMedia', () => {
    window.matchMedia = () => ({ matches: true });
    expect(resolveIsDark('auto')).toBe(true);
  });

  it('D4 "auto" with light system → false', () => {
    window.matchMedia = () => ({ matches: false });
    expect(resolveIsDark('auto')).toBe(false);
  });

  it('D5 undefined / null → defaults to dark-leaning', () => {
    window.matchMedia = () => ({ matches: true });
    expect(resolveIsDark(undefined)).toBe(true);
    expect(resolveIsDark(null)).toBe(true);
  });

  it('D6 matchMedia throw → fallback to true (don\'t crash)', () => {
    window.matchMedia = () => { throw new Error('boom'); };
    expect(resolveIsDark('auto')).toBe(true);
  });

  it('D7 matchMedia missing from window entirely → true fallback', () => {
    delete window.matchMedia;
    expect(resolveIsDark('auto')).toBe(true);
  });
});
