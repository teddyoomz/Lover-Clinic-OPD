#!/usr/bin/env node
// scripts/diag-customer-branchid-distribution.mjs
//
// Rule R diag — user-reported "หน้าข้อมูลลูกค้าขึ้นสาขามั่ว" 2026-05-17 EOD+2 LATE.
// Investigate be_customers branchId distribution vs be_branches existence
// to see if customer-to-branch references are correct or scrambled.

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const APP_ID = 'loverclinic-opd-4c39b';

function loadEnv() {
  for (const name of ['.env.local.prod', '.env.local', '.env']) {
    try {
      const path = resolve(REPO_ROOT, name);
      const txt = readFileSync(path, 'utf8');
      for (const line of txt.split('\n')) {
        const m = line.match(/^([A-Z_]+)=(.*)$/);
        if (!m) continue;
        const [, k, v] = m;
        if (!process.env[k]) process.env[k] = v.replace(/^"|"$/g, '');
      }
      return;
    } catch { /* try next */ }
  }
}

function initAdmin() {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }),
    storageBucket: `${APP_ID}.firebasestorage.app`,
  });
}

const PREFIX = `artifacts/${APP_ID}/public/data`;

async function main() {
  loadEnv();
  initAdmin();
  const db = getFirestore();

  console.log('\n=== be_branches ===');
  const branchSnap = await db.collection(`${PREFIX}/be_branches`).get();
  const branches = new Map();
  for (const d of branchSnap.docs) {
    const data = d.data();
    branches.set(d.id, { id: d.id, name: data.name || '(no name)', isDefault: data.isDefault || false });
    console.log(`  ${d.id.padEnd(32)} | name="${data.name || '?'}" | isDefault=${data.isDefault || false}`);
  }
  console.log(`Total: ${branches.size} branches`);

  console.log('\n=== be_customers branchId distribution ===');
  const custSnap = await db.collection(`${PREFIX}/be_customers`).get();
  const dist = new Map();
  const noBranch = [];
  const sample = [];
  for (const d of custSnap.docs) {
    const data = d.data();
    const bid = data.branchId || '(empty)';
    if (!dist.has(bid)) dist.set(bid, 0);
    dist.set(bid, dist.get(bid) + 1);
    if (!data.branchId) noBranch.push({ id: d.id, hn: data.customerHN || data.hn || '?' });
    if (sample.length < 12) {
      sample.push({
        id: d.id,
        hn: data.customerHN || data.hn || '?',
        firstname: data.firstname || data.firstnameTh || '?',
        lastname: data.lastname || data.lastnameTh || '?',
        branchId: data.branchId || '(empty)',
        branchIdSource: data.branchIdSource || '(none)',
        _v81fix4: data._v81fix4 || null,
        _v76: data._v76 || null,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || '(no createdAt)',
      });
    }
  }
  console.log(`Total customers: ${custSnap.size}`);
  console.log(`Distribution:`);
  for (const [bid, count] of [...dist.entries()].sort((a, b) => b[1] - a[1])) {
    const branchInfo = branches.get(bid);
    const branchName = branchInfo ? branchInfo.name : (bid === '(empty)' ? '(unstamped)' : 'ORPHAN — branch does not exist');
    console.log(`  ${bid.padEnd(32)} | ${String(count).padStart(4)} customers | ${branchName}`);
  }

  console.log(`\nUnstamped (branchId empty/missing): ${noBranch.length}`);
  if (noBranch.length > 0) {
    console.log('  First 5:', noBranch.slice(0, 5));
  }

  console.log('\n=== Sample customer records (first 12) ===');
  for (const s of sample) {
    console.log(`  ${s.hn} | ${s.firstname} ${s.lastname} | branchId=${s.branchId} | source=${s.branchIdSource} | createdAt=${s.createdAt}`);
  }

  console.log('\n=== Conclusion ===');
  const nakhon = 'BR-1777873556815-26df6480';
  const nakhonCount = dist.get(nakhon) || 0;
  const pctNakhon = ((nakhonCount / custSnap.size) * 100).toFixed(1);
  console.log(`Nakhon (${nakhon}): ${nakhonCount}/${custSnap.size} customers (${pctNakhon}%)`);
  console.log(`Other branches: ${custSnap.size - nakhonCount} customers`);
  if (pctNakhon === '100.0') {
    console.log('⚠ ALL customers point to NAKHON — either: (a) preexisting legacy state, OR (b) restore scrambled branchIds.');
    console.log('  → Check backup/restore code for branchId preservation; or check customer-create wiring for branch stamping.');
  } else {
    console.log('✓ Customers distributed across multiple branches — branchId stamping working.');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
