// Generate public-filler/og-image.png (1200x630) for the public filler site.
// REAL clinic logo (public/lover-clinic-logo-dark.png) on the brand-dark bg +
// Thai title. No AI, no fake photo. One-time build artifact, committed.
// Uses Playwright (already a devDep) so Thai text + the logo render correctly.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const logo = readFileSync('public/lover-clinic-logo-dark.png').toString('base64');
const html = `<!doctype html><meta charset="utf8"><style>
  html,body{margin:0} *{box-sizing:border-box;font-family:system-ui,'Segoe UI',sans-serif}
  .card{width:1200px;height:630px;display:flex;flex-direction:column;align-items:center;
    justify-content:center;gap:26px;color:#ededed;
    background:radial-gradient(120% 100% at 50% 0%,#1a0d0c 0%,#050505 62%)}
  .logo{height:150px}
  .t{font-size:46px;font-weight:800}
  .s{font-size:24px;color:#cbd5e1}
  .k{font-size:17px;color:#8b9099;letter-spacing:.02em}
</style><div class="card">
  <img class="logo" src="data:image/png;base64,${logo}" alt="Lover Clinic"/>
  <div class="t">จำลองผลการฉีดเพิ่มขนาด</div>
  <div class="s">ประเมินรอบวง · ขนาดถุงยาง · ภาพจำลองเสมือนจริง</div>
  <div class="k">โดย Lover Clinic</div>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.locator('.card').screenshot({ path: 'public-filler/og-image.png' });
await browser.close();
console.log('✅ public-filler/og-image.png written (1200x630, real logo).');
