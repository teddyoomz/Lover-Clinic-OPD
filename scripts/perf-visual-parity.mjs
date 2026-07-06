// perf-visual-parity.mjs — pixel-parity gate: proves "สวยเหมือนเดิม" (P0)
// Usage:
//   node scripts/perf-visual-parity.mjs --capture <setName> [--surface <id>]   (against local preview :4173)
//   node scripts/perf-visual-parity.mjs --diff <setA> <setB>
// Captures every SURFACE × {dark, light} with animations frozen → docs/perf/shots/<set>/ (gitignored).
// Diff: sharp raw-pixel compare, per-channel tolerance 24, FAIL if > 0.5% pixels differ on any pair.
// Dynamic-data caveat: same preview + same Firestore data minutes apart → drift small; any surface
// over threshold emits the pair paths for HUMAN eyeball (Rule Q-vis: the screenshot wins).
import { mkdirSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';

/** Pure diff math (vitest-covered): fraction of pixels whose any-RGB-channel Δ > tol. */
export function diffRatio(bufA, bufB, width, height, channels, tol) {
  let diff = 0;
  for (let p = 0; p < width * height; p++) {
    const i = p * channels;
    if (Math.abs(bufA[i] - bufB[i]) > tol
      || Math.abs(bufA[i + 1] - bufB[i + 1]) > tol
      || Math.abs(bufA[i + 2] - bufB[i + 2]) > tol) diff++;
  }
  return diff / (width * height);
}

const THRESHOLD = 0.005; // 0.5%
const FREEZE_CSS = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';

async function capture(setName, only) {
  const { chromium } = await import('@playwright/test');
  const { SURFACES, resolveSurfaceUrl, injectStaffAuth, injectTheme, waitForContentSettle, loadLinks } = await import('./perf-lib.mjs');
  const bi = process.argv.indexOf('--base');
  const BASE = bi > -1 ? process.argv[bi + 1] : 'http://localhost:4173';
  const links = loadLinks();
  const dir = `docs/perf/shots/${setName}`;
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  for (const s of SURFACES.filter((x) => !only || x.id === only)) {
    const rel = resolveSurfaceUrl(s, links);
    if (rel === null) { console.log(`SKIP ${s.id} (no link token)`); continue; }
    for (const theme of ['dark', 'light']) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
      try {
        if (s.auth) await injectStaffAuth(ctx);
        await injectTheme(ctx, theme);
        const page = await ctx.newPage();
        await page.goto(BASE + rel, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
        await page.addStyleTag({ content: FREEZE_CSS }).catch(() => {});
        await waitForContentSettle(page);
        if (s.interaction?.clickSel) {
          await page.locator(s.interaction.clickSel).first().click({ timeout: 10000 }).catch(() => {});
          await waitForContentSettle(page);
        }
        await page.screenshot({ path: `${dir}/${s.id}--${theme}.png` });
        console.log(`shot ${s.id}--${theme}`);
      } finally {
        await ctx.close();
      }
    }
  }
  await browser.close();
  console.log(`\nCaptured → ${dir}/`);
}

async function diff(setA, setB) {
  const sharp = (await import('sharp')).default;
  const dirA = `docs/perf/shots/${setA}`, dirB = `docs/perf/shots/${setB}`;
  if (!existsSync(dirA) || !existsSync(dirB)) throw new Error(`missing shot set: ${dirA} / ${dirB}`);
  const files = readdirSync(dirA).filter((f) => f.endsWith('.png') && existsSync(`${dirB}/${f}`));
  let failed = 0;
  for (const f of files) {
    const [ia, ib] = await Promise.all([
      sharp(`${dirA}/${f}`).raw().toBuffer({ resolveWithObject: true }),
      sharp(`${dirB}/${f}`).raw().toBuffer({ resolveWithObject: true }),
    ]);
    let ratio;
    if (ia.info.width !== ib.info.width || ia.info.height !== ib.info.height) {
      ratio = 1;
    } else {
      ratio = diffRatio(ia.data, ib.data, ia.info.width, ia.info.height, ia.info.channels, 24);
    }
    const pct = (ratio * 100).toFixed(3);
    const ok = ratio <= THRESHOLD;
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${f} — ${pct}% differing${ok ? '' : `  → EYEBALL: ${dirA}/${f} vs ${dirB}/${f}`}`);
  }
  console.log(`\n${files.length - failed}/${files.length} within ${THRESHOLD * 100}% — ${failed ? 'FLAGGED PAIRS NEED HUMAN EYEBALL (Q-vis)' : 'ALL PARITY OK'}`);
  process.exit(failed ? 1 : 0);
}

async function main() {
  const argv = process.argv;
  if (argv.includes('--capture')) {
    const setName = argv[argv.indexOf('--capture') + 1];
    const only = argv.includes('--surface') ? argv[argv.indexOf('--surface') + 1] : null;
    await capture(setName, only);
  } else if (argv.includes('--diff')) {
    const i = argv.indexOf('--diff');
    await diff(argv[i + 1], argv[i + 2]);
  } else {
    console.log('usage: --capture <set> [--surface id] | --diff <setA> <setB>');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
