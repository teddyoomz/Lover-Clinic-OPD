// Number-input wheel guard (2026-07-19, user directive) — money fields must
// IGNORE mouse-wheel (accidental scroll = wrong amount keyed, money-critical);
// data-wheelable qty fields step by EXACTLY ±1 (never 0.001/0.01/0.1).
//
// Architecture: ONE global capture-phase listener (src/lib/wheelGuard.js,
// installed in App.jsx) — SAFE-BY-DEFAULT (V54 lesson): an UNTAGGED
// <input type="number"> blurs on wheel (value untouched, page scrolls), so
// every money field — current AND future — is protected with zero wiring.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import React, { useState } from 'react';
import {
  nextWheelableValue,
  handleNumberInputWheel,
  installNumberInputWheelGuard,
} from '../src/lib/wheelGuard.js';

const wheel = (el, deltaY) => el.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));

describe('U — nextWheelableValue pure math', () => {
  it('U1 wheel-up = +1, wheel-down = -1 (never the step attr)', () => {
    expect(nextWheelableValue({ value: '5', deltaY: -100 })).toBe(6);
    expect(nextWheelableValue({ value: '5', deltaY: 100 })).toBe(4);
  });
  it('U2 clamps to min/max when present', () => {
    expect(nextWheelableValue({ value: '0', deltaY: 100, min: '0' })).toBe(0);
    expect(nextWheelableValue({ value: '99', deltaY: -100, max: '99' })).toBe(99);
    expect(nextWheelableValue({ value: '0', deltaY: 100, min: '0.01' })).toBe(0.01);
  });
  it('U3 empty/garbage value bases at 0; typed decimals adjust by exactly 1', () => {
    expect(nextWheelableValue({ value: '', deltaY: -100 })).toBe(1);
    expect(nextWheelableValue({ value: 'abc', deltaY: 100 })).toBe(-1);
    expect(nextWheelableValue({ value: '2.5', deltaY: -100 })).toBe(3.5);
  });
});

describe('E — guard execution on real DOM (jsdom)', () => {
  let uninstall = null;
  afterEach(() => { uninstall?.(); uninstall = null; document.body.innerHTML = ''; });

  const mount = (attrs = {}) => {
    const el = document.createElement('input');
    el.type = 'number';
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    document.body.appendChild(el);
    return el;
  };

  it('E1 DEFAULT (money-safe): focused untagged input BLURS on wheel, value untouched', () => {
    uninstall = installNumberInputWheelGuard(document);
    const el = mount({ value: '1500' });
    el.value = '1500';
    el.focus();
    expect(document.activeElement).toBe(el);
    wheel(el, -100);
    expect(el.value).toBe('1500');
    expect(document.activeElement).not.toBe(el); // blurred → browser can never spin it
  });

  it('E2 data-wheelable: wheel-up/down steps EXACTLY ±1 + fires bubbling input event', () => {
    uninstall = installNumberInputWheelGuard(document);
    const el = mount({ 'data-wheelable': 'true', step: '0.01' });
    el.value = '5';
    el.focus();
    const seen = vi.fn();
    document.addEventListener('input', seen, { once: true });
    wheel(el, -100);
    expect(el.value).toBe('6'); // ±1 even though step="0.01"
    expect(seen).toHaveBeenCalled();
    wheel(el, 100);
    expect(el.value).toBe('5');
  });

  it('E3 clamped at min; disabled/readOnly wheelable untouched; unfocused untouched', () => {
    uninstall = installNumberInputWheelGuard(document);
    const a = mount({ 'data-wheelable': 'true', min: '0' });
    a.value = '0'; a.focus();
    wheel(a, 100);
    expect(a.value).toBe('0');
    const b = mount({ 'data-wheelable': 'true' });
    b.value = '3'; b.focus(); b.disabled = true;
    wheel(b, -100);
    expect(b.value).toBe('3');
    const c = mount({});
    c.value = '9'; // NOT focused
    const blurSpy = vi.spyOn(c, 'blur');
    wheel(c, -100);
    expect(c.value).toBe('9');
    expect(blurSpy).not.toHaveBeenCalled(); // page scroll proceeds naturally
  });

  it('E4 non-number inputs + non-input targets are ignored', () => {
    uninstall = installNumberInputWheelGuard(document);
    const t = document.createElement('input');
    t.type = 'text'; t.value = 'hello';
    document.body.appendChild(t);
    t.focus();
    wheel(t, -100);
    expect(t.value).toBe('hello');
    expect(document.activeElement).toBe(t); // no blur on text inputs
  });
});

describe('R — React round-trip (controlled input sees the wheel step)', () => {
  afterEach(cleanup);

  it('R1 wheel on a focused data-wheelable controlled input updates React state by +1', () => {
    const uninstall = installNumberInputWheelGuard(document);
    let last = null;
    function Probe() {
      const [v, setV] = useState('7');
      last = v;
      return <input type="number" data-wheelable data-testid="p" value={v} onChange={(e) => setV(e.target.value)} />;
    }
    const { getByTestId } = render(<Probe />);
    const el = getByTestId('p');
    el.focus();
    wheel(el, -100);
    expect(last).toBe('8'); // native-setter + input event reached React onChange
    uninstall();
  });

  it('R2 wheel on a focused MONEY (untagged) controlled input leaves state untouched', () => {
    const uninstall = installNumberInputWheelGuard(document);
    let last = null;
    function Probe() {
      const [v, setV] = useState('1500');
      last = v;
      return <input type="number" data-testid="m" value={v} onChange={(e) => setV(e.target.value)} />;
    }
    const { getByTestId } = render(<Probe />);
    const el = getByTestId('m');
    el.focus();
    wheel(el, 100);
    expect(last).toBe('1500');
    uninstall();
  });
});

describe('SG — source-grep classifier locks', () => {
  const SRC_DIR = path.resolve(process.cwd(), 'src');
  const walk = (dir, out = []) => {
    for (const f of readdirSync(dir)) {
      const p = path.join(dir, f);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(jsx?|tsx?)$/.test(f)) out.push(p);
    }
    return out;
  };
  const FILES = walk(SRC_DIR);
  const MONEY_RE = /price|cost|discount|amount|wallet|deposit|topup|refund|paid|claim|เงิน|ราคา|ส่วนลด/i;
  // Count only CODE occurrences — the guard lib + App.jsx mention the attr in comments.
  const codeLines = (src) => src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

  it('SG1 App.jsx installs the guard once', () => {
    const app = readFileSync(path.resolve(SRC_DIR, 'App.jsx'), 'utf8');
    expect(app).toContain("import { installNumberInputWheelGuard } from './lib/wheelGuard.js'");
    expect(app).toContain('useEffect(() => installNumberInputWheelGuard(document), [])');
  });

  it('SG2 CLASSIFIER: no data-wheelable input binds a money-keyword value (money is NEVER wheelable)', () => {
    const offenders = [];
    for (const f of FILES) {
      const src = codeLines(readFileSync(f, 'utf8'));
      let i = src.indexOf('data-wheelable');
      while (i !== -1) {
        const tagEnd = src.indexOf('>', i);
        const tagStart = src.lastIndexOf('<input', i);
        const tag = src.slice(tagStart, tagEnd + 1);
        const valueBind = (tag.match(/value=\{([^}]+)\}/) || [])[1] || '';
        if (MONEY_RE.test(valueBind)) offenders.push(`${path.relative(SRC_DIR, f)}: ${valueBind.trim()}`);
        i = src.indexOf('data-wheelable', tagEnd);
      }
    }
    expect(offenders, `money-bound inputs must not be wheelable:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('SG3 closed tag inventory — 22 wheelable qty inputs across 12 files (additions reviewed here)', () => {
    const counts = {};
    let total = 0;
    for (const f of FILES) {
      const n = (codeLines(readFileSync(f, 'utf8')).match(/data-wheelable/g) || []).length;
      if (n > 0) { counts[path.basename(f)] = n; total += n; }
    }
    expect(counts).toEqual({
      'TfpBuyModal.jsx': 1,
      'TfpItemModals.jsx': 3,
      'QuotationFormModal.jsx': 2,
      'CourseFormModal.jsx': 7,
      'StockAdjustPanel.jsx': 1,
      'StockSeedPanel.jsx': 1,
      'StockTransferPanel.jsx': 1,
      'StockWithdrawalPanel.jsx': 1,
      'OrderPanel.jsx': 2,
      'CentralStockOrderPanel.jsx': 1,
      'VendorSalesTab.jsx': 1,
      'PickProductsModal.jsx': 1,
    });
    expect(total).toBe(22);
  });

  it('SG4 money spot-locks: key money inputs stay UNTAGGED (blur-on-wheel default)', () => {
    const spots = [
      ['components/backend/SaleTab.jsx', /LocalInput type="number" value=\{billDiscount\}(?![^>]*data-wheelable)/],
      ['components/treatment-form/TfpItemModals.jsx', /<input type="number" step="0\.01" min="0" value=\{labModalPrice\}(?![^>]*data-wheelable)/],
      ['components/treatment-form/TfpBuyModal.jsx', /<input type="number" value=\{buyDiscMap\[item\.id\] \|\| ''\} min="0"(?![^>]*data-wheelable)/],
      ['components/backend/ProductFormModal.jsx', /<input type="number" step="0\.01" min="0" value=\{form\.price \?\? ''\}(?![^>]*data-wheelable)/],
      ['components/backend/SalePaymentModal.jsx', /<input type="number" min="0" step="0\.01" value=\{amount\}(?![^>]*data-wheelable)/],
    ];
    for (const [rel, re] of spots) {
      const src = readFileSync(path.resolve(SRC_DIR, rel), 'utf8');
      expect(re.test(src), `${rel} money input must stay untagged`).toBe(true);
    }
  });

  it('SG5 TFP: EVERY number input stays untagged (user 2026-07-19: "ช่องกรอกราคาในหน้า TFP ... ช่องกรอกลดราคา หรืออะไรที่เป็นราคาทั้งหมด")', () => {
    const tfp = readFileSync(path.resolve(SRC_DIR, 'components/TreatmentFormPage.jsx'), 'utf8');
    expect(codeLines(tfp)).not.toContain('data-wheelable'); // TFP = zero wheelable inputs
    // The named money surfaces must exist as type="number" (LocalInput spreads
    // ...rest onto a REAL <input> — LocalField.jsx — so the global guard covers
    // them; blur additionally COMMITS the typed value via useLocalField):
    for (const bind of ['medDiscountOverride', 'billDiscount', 'insuranceClaimAmount', 'depositAmount', 'walletAmount']) {
      expect(tfp, `TFP ${bind} LocalInput`).toMatch(new RegExp(`LocalInput type="number" value=\\{${bind}\\}`));
    }
    expect(tfp).toMatch(/<input type="number" value=\{ch\.amount\}/);   // payment channel ยอดชำระ
    expect(tfp).toMatch(/<input type="number" value=\{sl\.percent\}/);  // seller %
    // LocalInput must keep spreading rest onto a real input (guard reaches the DOM)
    const lf = readFileSync(path.resolve(SRC_DIR, 'components/form/LocalField.jsx'), 'utf8');
    expect(lf).toMatch(/<input[\s\S]{0,200}\{\.\.\.rest\}/);
  });
});
