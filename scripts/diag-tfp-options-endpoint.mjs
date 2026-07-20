// ─── diag-tfp-options-endpoint.mjs (2026-07-20, AV212 rule 9) — Rule Q L2 ───
// Verifies the DEPLOYED /api/tfp-options endpoint with a REAL staff login:
//   1. anon request  → 401 (auth gate)
//   2. staff request → 200 + all 4 lister-shaped lists + timing
//   3. shape parity  → productItems[0] carries productName/id; courses carry
//      courseName/id (the applyFormData contract)
//   4. repeat call   → warm (module cache) faster / cached flag
// Run AFTER deploy:  node scripts/diag-tfp-options-endpoint.mjs [baseUrl]
import { readFileSync } from 'fs';

const BASE = process.argv[2] || 'https://lover-clinic-app.vercel.app';
const FIREBASE_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';
const NAKHON = 'BR-1777873556815-26df6480';

function loadEnv() {
  try {
    const raw = readFileSync(new URL('../.env.local.prod', import.meta.url), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)="?([\s\S]*?)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch { /* env optional — staff login uses REST */ }
}

async function staffToken() {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'loverclinic@loverclinic.com', password: 'Lover2024', returnSecureToken: true }),
  });
  const data = await res.json();
  if (!data.idToken) throw new Error(`staff login failed: ${data.error?.message}`);
  return data.idToken;
}

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
};

async function main() {
  loadEnv();
  const url = `${BASE}/api/tfp-options?branchId=${encodeURIComponent(NAKHON)}`;
  console.log(`🔬 tfp-options L2 vs ${BASE}\n`);

  // 1 — anon → 401
  const anon = await fetch(url);
  ok('anon rejected 401', anon.status === 401, `status=${anon.status}`);

  // 2 — staff → 200 + lists + timing
  const token = await staffToken();
  const t0 = Date.now();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const ms = Date.now() - t0;
  ok('staff 200', res.status === 200, `status=${res.status} in ${ms}ms`);
  const body = await res.json().catch(() => null);
  ok('ok:true + v:1', body?.ok === true && body?.v === 1);
  for (const k of ['productItems', 'courseItems', 'dfGroupItems', 'dfStaffRatesItems']) {
    ok(`${k} is array`, Array.isArray(body?.[k]), `len=${body?.[k]?.length}`);
  }

  // 3 — lister-shape parity (applyFormData contract)
  const p = body?.productItems?.[0];
  ok('product shape {id, productName}', !!p && typeof p.id === 'string' && 'productName' in p);
  const c = body?.courseItems?.[0];
  ok('course shape {id, courseName}', !!c && typeof c.id === 'string' && 'courseName' in c);

  // 4 — warm repeat (module cache)
  const t1 = Date.now();
  const res2 = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const ms2 = Date.now() - t1;
  const body2 = await res2.json().catch(() => null);
  ok('warm repeat 200', res2.status === 200, `in ${ms2}ms cached=${body2?.cached === true}`);

  // 5 — missing branch → 400
  const nb = await fetch(`${BASE}/api/tfp-options`, { headers: { Authorization: `Bearer ${token}` } });
  ok('missing branchId → 400', nb.status === 400, `status=${nb.status}`);

  console.log(`\n${fail === 0 ? '🟢' : '🔴'} PASS ${pass} / FAIL ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
