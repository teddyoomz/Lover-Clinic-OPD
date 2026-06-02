#!/usr/bin/env node
// Rule R diag (READ-ONLY) — adversarial hunt for delete-cascade gaps the user
// "smells": (#2) be_products where productId field ≠ doc.id (cascade queries
// `where productId == doc.id` → would MISS batches/refs keyed on the field
// value); (#3) PENDING inbound stock ops (order/transfer/withdrawal/central)
// referencing a product → deleting it makes the receive throw _assertProductExists
// forever. No writes.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function loadDotEnv(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (!m) continue;
    let [, k, v] = m; if (process.env[k] !== undefined) continue;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
loadDotEnv(path.resolve(process.cwd(), '.env.local.prod'));
if (!process.env.FIREBASE_ADMIN_CLIENT_EMAIL) loadDotEnv(path.resolve(process.cwd(), '.env.local'));
const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b';
function getAdmin() {
  if (getApps().length > 0) return getFirestore(getApp());
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  return getFirestore(initializeApp({ credential: cert({ projectId: APP_ID, clientEmail, privateKey: rawKey.split('\\n').join('\n') }) }));
}
const db = getAdmin();
const C = (name) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);

const TERMINAL = new Set(['received', 'cancelled', 'canceled', 'rejected', 'completed', 'done', 'voided', 'closed']);
const OP_COLS = ['be_stock_orders', 'be_stock_transfers', 'be_stock_withdrawals', 'be_central_stock_orders'];

function itemProductIds(data) {
  const out = new Set();
  for (const v of Object.values(data || {})) {
    if (Array.isArray(v)) for (const el of v) if (el && typeof el === 'object' && el.productId) out.add(String(el.productId));
  }
  if (data?.productId) out.add(String(data.productId));
  return out;
}

async function main() {
  console.log('▶ Rule R diag — deeper delete-cascade risks (#2 id-mismatch, #3 pending ops)\n');
  const prodSnap = await C('be_products').get();
  const prodDocIds = new Set(prodSnap.docs.map(d => d.id));

  // ── #2 — productId field ≠ doc.id ──
  console.log('── #2 — be_products where productId field ≠ doc.id (cascade query would miss field-keyed refs) ──');
  const mism = prodSnap.docs.filter(d => d.data().productId && String(d.data().productId) !== d.id);
  console.log(`  ${mism.length} of ${prodSnap.size} docs have productId field ≠ doc.id`);
  for (const d of mism.slice(0, 12)) console.log(`    doc.id=${d.id}  productId-field=${d.data().productId}  "${d.data().productName || ''}"`);
  // do any batches reference the FIELD value (not doc.id)?
  if (mism.length) {
    const batchSnap = await C('be_stock_batches').get();
    let fieldKeyed = 0;
    const fieldVals = new Set(mism.map(d => String(d.data().productId)));
    const docIdVals = new Set(mism.map(d => d.id));
    for (const b of batchSnap.docs) {
      const pid = String(b.data().productId || '');
      if (fieldVals.has(pid) && !docIdVals.has(pid)) fieldKeyed++;
    }
    console.log(`  batches keyed by the FIELD value (NOT doc.id) → cascade-query MISS risk: ${fieldKeyed}`);
  }

  // ── #3 — pending inbound ops referencing a product ──
  console.log('\n── #3 — PENDING stock ops (non-terminal) referencing a product (delete → receive throws forever) ──');
  let totalPendingRefs = 0;
  for (const col of OP_COLS) {
    let snap;
    try { snap = await C(col).get(); } catch { console.log(`  ${col}: (read error)`); continue; }
    const pending = snap.docs.filter(d => !TERMINAL.has(String(d.data().status || '').toLowerCase()));
    const refs = new Set();
    const statusBreakdown = {};
    for (const d of snap.docs) { const s = String(d.data().status || '(none)').toLowerCase(); statusBreakdown[s] = (statusBreakdown[s] || 0) + 1; }
    for (const d of pending) for (const pid of itemProductIds(d.data())) if (prodDocIds.has(pid)) refs.add(pid);
    totalPendingRefs += refs.size;
    console.log(`  ${col}: ${snap.size} docs, status=${JSON.stringify(statusBreakdown)} → ${pending.length} pending, referencing ${refs.size} live products`);
    if (refs.size) console.log(`    pending-referenced productIds: ${[...refs].slice(0, 10).join(', ')}`);
  }
  console.log(`\n  → ${totalPendingRefs} live products are referenced by a PENDING op (deleting any of them = broken receive). The GUARD must block these.`);

  console.log('\n✓ Diag complete (read-only)');
}
main().catch(e => { console.error(e); process.exit(1); });
