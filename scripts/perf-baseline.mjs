// perf-baseline.mjs — full-surface performance measurement runner (P0)
// Usage:
//   node scripts/perf-baseline.mjs --run baseline --target local-preview [--surface <id>]
//   node scripts/perf-baseline.mjs --run after-phase1 --target prod
// local-preview expects `npm run build && npx vite preview --port 4173` already running.
// Median of 3 runs per surface → docs/perf/<runId>-<target>/<surface>.json
import { mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import {
  SURFACES, resolveSurfaceUrl, injectStaffAuth, perfObserversInit,
  collectMetrics, aggregateRuns, waitForDomQuiet, loadLinks,
} from './perf-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };

async function main() {
  const { chromium } = await import('@playwright/test');
  const runId = arg('run', 'baseline');
  const target = arg('target', 'local-preview');
  const only = arg('surface', null);
  const RUNS = Number(arg('runs', '3'));
  const BASE = target === 'prod' ? 'https://lover-clinic-app.vercel.app' : 'http://localhost:4173';
  const links = loadLinks();

  const browser = await chromium.launch();
  const outDir = `docs/perf/${runId}-${target}`;
  mkdirSync(outDir, { recursive: true });

  for (const s of SURFACES.filter((x) => !only || x.id === only)) {
    const rel = resolveSurfaceUrl(s, links);
    if (rel === null) { console.log(`SKIP ${s.id} (missing link token — run scripts/perf-find-links.mjs)`); continue; }
    const url = BASE + rel;
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      try {
        if (s.auth) await injectStaffAuth(ctx);
        const page = await ctx.newPage();
        await page.addInitScript(perfObserversInit);
        await page.goto(url, { waitUntil: 'load', timeout: 60000 }).catch((e) => console.warn(`  goto warn ${s.id}: ${e.message.slice(0, 80)}`));
        await waitForDomQuiet(page);
        const m = await collectMetrics(page);
        if (s.interaction) {
          const t0 = Date.now();
          await page.locator(s.interaction.clickSel).first().click({ timeout: 10000 }).catch(() => {});
          m.interaction_ms = (await waitForDomQuiet(page)) + (Date.now() - t0 > 15000 ? 15000 : 0);
        }
        runs.push(m);
      } finally {
        await ctx.close();
      }
    }
    if (!runs.length) continue;
    const rec = { runId, target, surface: s.id, url: s.url, runs: RUNS, metrics: aggregateRuns(runs) };
    writeFileSync(`${outDir}/${s.id}.json`, JSON.stringify(rec, null, 2));
    console.log(`${s.id}: ${JSON.stringify(rec.metrics)}`);
  }
  await browser.close();
  console.log(`\nDone → ${outDir}/`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
