// perf-compare.mjs — merge all perf runs → docs/perf/report.html (P0)
// Reads docs/perf/<runId>-<target>/*.json + docs/perf/bundle-*.json.
// One table per target: rows = surface × metric, columns = runs (baseline first,
// then after-phase1/2/3), Δ% = last run vs baseline (green ≤ −5%, red ≥ +5% — all
// metrics here are lower-is-better). Bundle section: per-chunk gzip first vs last.
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { fileURLToPath } from 'url';

const RUN_ORDER = ['baseline', 'after-phase1', 'after-phase2', 'after-phase3'];
const orderKey = (r) => { const i = RUN_ORDER.indexOf(r); return i === -1 ? 99 : i; };

function collectRuns() {
  const runs = []; // { runId, target, dir }
  for (const d of readdirSync('docs/perf')) {
    const full = `docs/perf/${d}`;
    if (!statSync(full).isDirectory() || d === 'shots') continue;
    const m = d.match(/^(.+)-(local-preview|prod)$/);
    if (m) runs.push({ runId: m[1], target: m[2], dir: full });
  }
  runs.sort((a, b) => orderKey(a.runId) - orderKey(b.runId));
  return runs;
}

function loadSurfaces(dir) {
  const out = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
    out[j.surface] = j.metrics;
  }
  return out;
}

function pctCell(base, last) {
  if (!base || last === undefined || last === null) return '<td>—</td>';
  if (base === 0) return '<td>—</td>';
  const pct = ((last - base) / base) * 100;
  const color = pct <= -5 ? '#15803d' : pct >= 5 ? '#b91c1c' : '#666';
  return `<td style="color:${color};font-weight:700">${pct > 0 ? '+' : ''}${pct.toFixed(0)}%</td>`;
}

function main() {
  const runs = collectRuns();
  const targets = [...new Set(runs.map((r) => r.target))];
  let html = `<!doctype html><html><head><meta charset="utf-8"><title>LoverClinic Perf Report</title>
<style>body{font-family:-apple-system,'Segoe UI',sans-serif;max-width:1100px;margin:2em auto;padding:1em;color:#222}
h1{border-bottom:2px solid #dc2626;padding-bottom:.3em}h2{border-bottom:1px solid #e5e5e5;margin-top:2em}
table{border-collapse:collapse;width:100%;margin:1em 0;font-size:.85em}th,td{border:1px solid #e5e5e5;padding:.35em .6em;text-align:left}
th{background:#f0f4f8;position:sticky;top:0}tr.surface-head td{background:#fafafa;font-weight:700}</style></head><body>
<h1>LoverClinic — Performance Report</h1><p>Generated ${new Date().toISOString()} · all metrics lower-is-better · Δ = last run vs baseline</p>`;

  for (const target of targets) {
    const tRuns = runs.filter((r) => r.target === target);
    const data = tRuns.map((r) => ({ ...r, surfaces: loadSurfaces(r.dir) }));
    const surfaceIds = [...new Set(data.flatMap((d) => Object.keys(d.surfaces)))];
    html += `<h2>Target: ${target}</h2><table><tr><th>Surface</th><th>Metric</th>${data.map((d) => `<th>${d.runId}</th>`).join('')}<th>Δ</th></tr>`;
    for (const sid of surfaceIds) {
      const metricNames = [...new Set(data.flatMap((d) => Object.keys(d.surfaces[sid] || {})))];
      let first = true;
      for (const mn of metricNames) {
        const vals = data.map((d) => d.surfaces[sid]?.[mn]);
        const base = vals[0]; const last = [...vals].reverse().find((v) => v !== undefined);
        html += `<tr>${first ? `<td rowspan="${metricNames.length}"><b>${sid}</b></td>` : ''}<td>${mn}</td>${vals.map((v) => `<td>${v ?? '—'}</td>`).join('')}${pctCell(base, last)}</tr>`;
        first = false;
      }
    }
    html += '</table>';
  }

  // Bundle section
  const bundles = readdirSync('docs/perf').filter((f) => /^bundle-.+\.json$/.test(f))
    .map((f) => ({ runId: f.replace(/^bundle-|\.json$/g, ''), rows: JSON.parse(readFileSync(`docs/perf/${f}`, 'utf8')) }))
    .sort((a, b) => orderKey(a.runId) - orderKey(b.runId));
  if (bundles.length) {
    const first = bundles[0], last = bundles[bundles.length - 1];
    const lastMap = Object.fromEntries(last.rows.map((r) => [r.file.replace(/-[A-Za-z0-9_]+\.(js|css)$/, '.$1'), r]));
    html += `<h2>Bundle (gzip KB) — ${first.runId} → ${last.runId}</h2><table><tr><th>Chunk (hash-normalized)</th><th>${first.runId}</th><th>${last.runId}</th><th>Δ</th></tr>`;
    for (const r of first.rows) {
      const key = r.file.replace(/-[A-Za-z0-9_]+\.(js|css)$/, '.$1');
      const after = lastMap[key];
      html += `<tr><td>${key}</td><td>${r.gzip_KB}</td><td>${after ? after.gzip_KB : '(gone)'}</td>${after ? pctCell(r.gzip_KB, after.gzip_KB) : '<td>—</td>'}</tr>`;
      delete lastMap[key];
    }
    for (const [key, r] of Object.entries(lastMap)) html += `<tr><td>${key}</td><td>(new)</td><td>${r.gzip_KB}</td><td>—</td></tr>`;
    const tFirst = first.rows.reduce((a, r) => a + r.gzip_KB, 0), tLast = last.rows.reduce((a, r) => a + r.gzip_KB, 0);
    html += `<tr class="surface-head"><td><b>TOTAL</b></td><td><b>${tFirst.toFixed(0)}</b></td><td><b>${tLast.toFixed(0)}</b></td>${pctCell(tFirst, tLast)}</tr></table>`;
  }

  html += '</body></html>';
  writeFileSync('docs/perf/report.html', html);
  console.log('→ docs/perf/report.html');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
