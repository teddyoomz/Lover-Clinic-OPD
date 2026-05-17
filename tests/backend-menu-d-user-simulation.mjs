#!/usr/bin/env node
// Tier 6 — Random-click user simulation. Runs against running dev server.
// 100 random click sequences; 100% pass rate required (zero console errors,
// zero thrown exceptions).
//
// Usage:
//   npm run dev &
//   node tests/backend-menu-d-user-simulation.mjs

import { chromium } from 'playwright';

const BASE = process.env.PW_BASE_URL || 'http://localhost:5173';
const ITERATIONS = Number(process.env.PW_ITER || 100);
const SEED = Number(process.env.PW_SEED || 42);

const SELECTORS = [
  '[data-testid="duo-pill-chat"]',
  '[data-testid="duo-pill-menu"]',
  '[data-testid="topbar-frontend-desktop"]',
  '[data-testid="topbar-shortcut-desktop"]',
  '[data-testid="mode-toggle-new"]',
  '[data-testid="mode-toggle-classic"]',
  // Bloom orbs (only resolve after duo-pill-menu opens the bloom; otherwise skipped)
  '[data-testid="bloom-orb-customers"]',
  '[data-testid="bloom-orb-sales"]',
  '[data-testid="bloom-orb-reports"]',
  '[data-testid="bloom-orb-master"]',
  '[data-testid="bloom-orb-marketing"]',
  '[data-testid="bloom-orb-stock"]',
  // Sub-tab picker mini-orbs (only resolve when picker is open after a multi-item orb click)
  '[data-testid="subtab-cell-reports-pnl"]',
  '[data-testid="subtab-cell-reports-sale"]',
  '[data-testid="subtab-cell-staff"]',
  '[data-testid="subtab-cell-doctors"]',
  '[data-testid="subtab-cell-promotions"]',
  '[data-testid="subtab-overlay"]',  // backdrop click to close picker
];

function lcg(seed) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });

  try {
    await page.goto(`${BASE}/?backend=1`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="backend-topbar-new"], [data-testid="backend-classic-sidebar"]', { timeout: 10000 });

    const rng = lcg(SEED);
    let clicked = 0;
    for (let i = 0; i < ITERATIONS; i++) {
      const sel = SELECTORS[Math.floor(rng() * SELECTORS.length)];
      const el = await page.$(sel);
      if (el) {
        try {
          await el.click({ timeout: 1000 });
          clicked++;
        } catch { /* element may have unmounted (e.g. mode swap); fine */ }
      }
      // 200ms settle
      await page.waitForTimeout(200);
      // Close any open overlay before next iter
      await page.keyboard.press('Escape').catch(() => {});
    }

    console.log(`Iterations: ${ITERATIONS} · clicks-landed: ${clicked} · errors: ${errors.length}`);
    if (errors.length > 0) {
      console.error('FAILED — errors:');
      errors.forEach((e) => console.error('  -', e));
      process.exit(1);
    }
    console.log('PASS — 100% clean (no console errors, no exceptions)');
  } finally {
    await browser.close();
  }
})();
