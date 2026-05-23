#!/usr/bin/env node
// ─── V113 REVERT — undo V112-B admin-SDK backfill stamps ─────────────────
//
// V112-B was a Rule Q V66 / Q-vis violation: admin-SDK script stamped
// `receiptCourseName` + `customerName` directly onto sale docs to "fix
// the display", instead of changing the SYSTEM (renderer) to live-resolve
// from the master at render time. The cheat was caught by the user.
//
// This script REMOVES the V112-B artifacts so the renderer's live-resolve
// (V113-A/B) can do the work. Removes:
//
//   • items.courses[i].receiptCourseName (where _v112RunId stamped it)
//   • customerName stamp (where V112-B resolved it — re-empties INV-20260520-0010)
//   • Forensic markers: _v112BackfilledAt, _v112BackfilledFrom, _v112RunId
//
// After revert: the affected sale docs go back to pre-V112-B state. The
// V113 renderer will live-resolve at display time so the user sees the
// correct name WITHOUT needing the stamp.
//
// Source of truth: the V112-B audit doc lists the 14 sale IDs. Plus a
// runtime scan for any _v112RunId stamp to catch siblings.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const APPLY = process.argv.includes('--apply');
const RUN_ID = randomBytes(4).toString('hex');
const TS = Date.now();
const AUDIT_ID = `v113-revert-v112-backfill-${TS}-${RUN_ID}`;

function loadEnvLocal() {
  const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8');
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

function initFirestore() {
  if (getApps().length > 0) return getFirestore();
  const env = loadEnvLocal();
  const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n');
  initializeApp({ credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey,
  }) });
  return getFirestore();
}

function dataRef(db) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
}

async function main() {
  const mode = APPLY ? 'APPLY' : 'DRY-RUN';
  console.log(`\n╔═══════════════════════════════════════════════════════════════════╗`);
  console.log(`║  V113 REVERT — remove V112-B admin-SDK backfill stamps           ║`);
  console.log(`║  Mode: ${mode.padEnd(8)}    RUN_ID: ${RUN_ID}                                ║`);
  console.log(`╚═══════════════════════════════════════════════════════════════════╝\n`);

  const db = initFirestore();
  const root = dataRef(db);

  // Find every doc carrying a V112 stamp. Reuses the same canonical path
  // V112-B wrote to.
  console.log('── Phase 1: Scan be_sales for V112 stamps ──');
  const salesAll = await root.collection('be_sales').get();
  const reverts = [];

  for (const doc of salesAll.docs) {
    const s = doc.data();
    if (!s._v112RunId && !s._v112BackfilledAt && !s._v112BackfilledFrom) continue;

    const legacy = s._v112BackfilledFrom || {};
    const patch = {};

    // Restore customerName / customerHN if V112 had stamped them
    if (typeof legacy.customerName === 'string') {
      patch.customerName = legacy.customerName; // back to original (likely "")
    }
    if (typeof legacy.customerHN === 'string') {
      patch.customerHN = legacy.customerHN;
    }

    // Restore items.courses[].receiptCourseName: unset the per-line stamp
    // entry-by-entry. Only the lines V112 actually stamped (per legacy.courseLines).
    const courseLineLegacy = Array.isArray(legacy.courseLines) ? legacy.courseLines : [];
    const courses = Array.isArray(s.items?.courses) ? [...s.items.courses] : [];
    let coursesTouched = false;
    for (const ll of courseLineLegacy) {
      const idx = typeof ll.idx === 'number' ? ll.idx : -1;
      if (idx < 0 || idx >= courses.length) continue;
      const cur = courses[idx];
      // Only touch lines whose current receiptCourseName matches what V112
      // stamped (`ll.to`). If something else stamped over it since, leave alone.
      if (String(cur.receiptCourseName || '') !== String(ll.to || '')) continue;
      const prior = String(ll.from || '');
      if (prior === '(empty/missing)' || prior === '') {
        // The pre-V112 state had no field at all → use FieldValue.delete()
        const { receiptCourseName, ...rest } = cur;
        courses[idx] = rest;
      } else {
        courses[idx] = { ...cur, receiptCourseName: prior };
      }
      coursesTouched = true;
    }
    if (coursesTouched) {
      patch['items.courses'] = courses;
    }

    // Drop the forensic markers
    patch._v112RunId = FieldValue.delete();
    patch._v112BackfilledAt = FieldValue.delete();
    patch._v112BackfilledFrom = FieldValue.delete();

    reverts.push({ docId: doc.id, patch, coursesTouched, courseLineLegacy });
  }

  console.log(`  scanned be_sales         : ${salesAll.size}`);
  console.log(`  sales with V112 stamps   : ${reverts.length}`);

  // be_quotations: V112-B also could have stamped these (none existed at apply time)
  console.log('\n── Phase 2: Scan be_quotations for V112 stamps ──');
  const quotesAll = await root.collection('be_quotations').get();
  const quoteReverts = [];
  for (const doc of quotesAll.docs) {
    const q = doc.data();
    if (!q._v112RunId && !q._v112BackfilledAt && !q._v112BackfilledFrom) continue;
    const legacy = q._v112BackfilledFrom || {};
    const lines = Array.isArray(q.courses) ? [...q.courses] : [];
    const lineLegacy = Array.isArray(legacy.courseLines) ? legacy.courseLines : [];
    let touched = false;
    for (const ll of lineLegacy) {
      const idx = typeof ll.idx === 'number' ? ll.idx : -1;
      if (idx < 0 || idx >= lines.length) continue;
      const cur = lines[idx];
      if (String(cur.receiptCourseName || '') !== String(ll.to || '')) continue;
      const prior = String(ll.from || '');
      if (prior === '(empty/missing)' || prior === '') {
        const { receiptCourseName, ...rest } = cur;
        lines[idx] = rest;
      } else {
        lines[idx] = { ...cur, receiptCourseName: prior };
      }
      touched = true;
    }
    if (!touched) continue;
    quoteReverts.push({
      docId: doc.id,
      patch: {
        courses: lines,
        _v112RunId: FieldValue.delete(),
        _v112BackfilledAt: FieldValue.delete(),
        _v112BackfilledFrom: FieldValue.delete(),
      },
    });
  }
  console.log(`  scanned be_quotations    : ${quotesAll.size}`);
  console.log(`  quotes with V112 stamps  : ${quoteReverts.length}`);

  // Print plan
  console.log(`\n── Phase 3: Revert plan ──`);
  for (const r of reverts) {
    console.log(`  • be_sales/${r.docId}`);
    if ('customerName' in r.patch) console.log(`      customerName → "${r.patch.customerName}"`);
    if ('customerHN' in r.patch) console.log(`      customerHN → "${r.patch.customerHN}"`);
    if (r.coursesTouched) console.log(`      courses[]: ${r.courseLineLegacy.length} lines reverted`);
    console.log(`      drop: _v112RunId, _v112BackfilledAt, _v112BackfilledFrom`);
  }
  for (const r of quoteReverts) {
    console.log(`  • be_quotations/${r.docId}`);
    console.log(`      courses[] reverted`);
  }

  if (!APPLY) {
    console.log(`\n── DRY-RUN — no writes. Re-run with --apply.\n`);
    return;
  }

  console.log(`\n── Phase 4: APPLY ──`);
  let writtenSales = 0, writtenQuotes = 0;
  for (const r of reverts) {
    try {
      await root.collection('be_sales').doc(r.docId).update(r.patch);
      writtenSales++;
      console.log(`  ✓ ${r.docId}`);
    } catch (e) {
      console.log(`  ✗ ${r.docId}: ${e.message}`);
    }
  }
  for (const r of quoteReverts) {
    try {
      await root.collection('be_quotations').doc(r.docId).update(r.patch);
      writtenQuotes++;
      console.log(`  ✓ ${r.docId}`);
    } catch (e) {
      console.log(`  ✗ ${r.docId}: ${e.message}`);
    }
  }

  // Audit doc
  await root.collection('be_admin_audit').doc(AUDIT_ID).set({
    auditId: AUDIT_ID,
    op: 'v113-revert-v112-backfill',
    runId: RUN_ID,
    performedAt: FieldValue.serverTimestamp(),
    reason: 'V112-B was Rule Q V66 / Q-vis violation (admin-SDK backfill to fix display). V113 implements live-resolve at render time as the SYSTEM fix.',
    salesReverted: writtenSales,
    quotesReverted: writtenQuotes,
    saleDocIds: reverts.map(r => r.docId),
    quoteDocIds: quoteReverts.map(r => r.docId),
  });
  console.log(`\n  audit doc: be_admin_audit/${AUDIT_ID}`);
  console.log(`  sales reverted: ${writtenSales} · quotes reverted: ${writtenQuotes}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
