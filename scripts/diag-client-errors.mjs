// ─── diag-client-errors.mjs (2026-07-23) — Rule R READ-ONLY ─────────────────
// Dumps the REAL client_error_log docs from prod (full message + stack + url +
// ua + surface + kind), grouped by hash signature, so we can see WHICH SDK code
// path / page / device / when triggered each error. Zero writes.
//
//   node scripts/diag-client-errors.mjs [hours]     (default 72)
//
// Env: .env.local.prod (vercel env pull) — FIREBASE_ADMIN_* keys.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;

function loadEnv() {
  if (process.env.FIREBASE_ADMIN_PRIVATE_KEY) return;
  const raw = readFileSync(new URL('../.env.local.prod', import.meta.url), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="?([\s\S]*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const shortUA = (ua = '') => {
  const s = String(ua);
  const os = /iPhone|iPad/.test(s) ? 'iOS' : /Android/.test(s) ? 'Android' : /Windows/.test(s) ? 'Win' : /Mac/.test(s) ? 'Mac' : '?';
  const ver = (s.match(/OS (\d+[_\d]*)/) || s.match(/Version\/(\d+)/) || [])[1] || '';
  const br = /CriOS|Chrome/.test(s) ? 'Chrome' : /Firefox/.test(s) ? 'FF' : /Safari/.test(s) ? 'Safari' : '?';
  return `${os}${ver ? ' ' + ver.replace(/_/g, '.') : ''}/${br}`;
};

async function main() {
  loadEnv();
  const hours = Number(process.argv[2]) || 72;
  if (!getApps().length) {
    const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
    initializeApp({ credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }) });
  }
  const db = getFirestore();
  const cutoff = Date.now() - hours * 3600000;
  const snap = await db.collection(`${PREFIX}/client_error_log`)
    .orderBy('createdAtMs', 'desc').limit(500).get();

  const rows = snap.docs.map(d => d.data() || {}).filter(x => (Number(x.createdAtMs) || 0) >= cutoff);
  const errors = rows.filter(x => x.kind !== 'telemetry');
  const telemetry = rows.filter(x => x.kind === 'telemetry');

  console.log(`\n📋 client_error_log — last ${hours}h (${new Date(cutoff).toISOString()} →)`);
  console.log(`   total docs in window: ${rows.length}  ·  errors: ${errors.length}  ·  telemetry: ${telemetry.length}\n`);

  const groups = new Map();
  for (const r of errors) {
    const key = String(r.hash || r.message || '?');
    const g = groups.get(key) || { key, count: 0, first: Infinity, last: 0, urls: new Set(), uas: new Set(), surfaces: new Set(), sample: r };
    g.count += 1;
    const ms = Number(r.createdAtMs) || 0;
    g.first = Math.min(g.first, ms); g.last = Math.max(g.last, ms);
    if (ms >= g.last) g.sample = r;
    if (r.url) g.urls.add(r.url);
    if (r.ua) g.uas.add(shortUA(r.ua));
    g.surfaces.add(r.surface || '?');
    groups.set(key, g);
  }
  const sorted = [...groups.values()].sort((a, b) => b.count - a.count);

  console.log('════════════════ ERROR GROUPS (by signature) ════════════════');
  for (const g of sorted) {
    console.log(`\n▶ ×${g.count}  [${[...g.surfaces].join(',')}]  hash=${g.key}`);
    console.log(`  first: ${new Date(g.first).toISOString()}   last: ${new Date(g.last).toISOString()}`);
    console.log(`  devices(UA): ${[...g.uas].join(' | ') || '?'}`);
    console.log(`  pages(URL) : ${[...g.urls].slice(0, 6).join('  ') || '?'}`);
    console.log(`  MESSAGE: ${g.sample.message || ''}`);
    const stack = String(g.sample.stack || '').split('\n').slice(0, 12).join('\n           ');
    if (stack.trim()) console.log(`  STACK  : ${stack}`);
  }

  if (telemetry.length) {
    console.log('\n════════════════ TELEMETRY (excluded from count) ════════════════');
    const tg = new Map();
    for (const t of telemetry) tg.set(t.message, (tg.get(t.message) || 0) + 1);
    for (const [m, c] of [...tg.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ×${c}  ${m}`);
  }
  console.log('');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e); process.exit(1); });
}
