// perf-bundle-manifest.mjs — per-chunk raw+gzip sizes from a real build (P0)
// Usage: npm run build && node scripts/perf-bundle-manifest.mjs --run baseline
// → docs/perf/bundle-<runId>.json (sorted desc by raw size) + console table.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { gzipSync } from 'zlib';
import { fileURLToPath } from 'url';

function main() {
  const i = process.argv.indexOf('--run');
  const runId = i > -1 ? process.argv[i + 1] : 'baseline';
  const rows = [];
  for (const f of readdirSync('dist/assets')) {
    if (!/\.(js|css)$/.test(f)) continue;
    const buf = readFileSync(`dist/assets/${f}`);
    rows.push({
      file: `assets/${f}`,
      raw_KB: +(buf.length / 1024).toFixed(1),
      gzip_KB: +(gzipSync(buf).length / 1024).toFixed(1),
    });
  }
  rows.sort((a, b) => b.raw_KB - a.raw_KB);
  mkdirSync('docs/perf', { recursive: true });
  writeFileSync(`docs/perf/bundle-${runId}.json`, JSON.stringify(rows, null, 2));
  console.table(rows.slice(0, 20));
  console.log('chunks:', rows.length,
    '| TOTAL raw KB:', rows.reduce((a, r) => a + r.raw_KB, 0).toFixed(0),
    '| TOTAL gzip KB:', rows.reduce((a, r) => a + r.gzip_KB, 0).toFixed(0));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
