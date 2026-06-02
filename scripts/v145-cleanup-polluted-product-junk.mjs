#!/usr/bin/env node
// Rule M (TWO-PHASE) — clean stock-aggregation junk that the pre-V145 edit bug
// wrote onto be_products docs (batches/totalRemaining/totalCapacity/nextExpiry/
// expired/unit/valueCost + stray `id`). DEFAULT = DRY-RUN (no writes). Pass
// --apply to commit. Strips ONLY the junk keys via FieldValue.delete() — every
// real field (productType/categoryName/mainUnitName/stockConfig/forensic/…) is
// left untouched (updateDoc, NOT setDoc).
//
// SEPARATELY FLAGS (does NOT auto-touch): docs whose junk-pollution also wiped
// their type/category/unit (corruption signature) + duplicate productNames —
// those need an explicit user decision (delete dup vs restore fields).
//
//   node scripts/v145-cleanup-polluted-product-junk.mjs            # dry-run
//   node scripts/v145-cleanup-polluted-product-junk.mjs --apply    # commit

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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
const C = (db, name) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);

// the stock-aggregation junk keys (NEVER legit on a be_products doc)
const JUNK_KEYS = ['batches', 'totalRemaining', 'totalCapacity', 'nextExpiry', 'expired', 'unit', 'valueCost'];
const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(`▶ V145 product-junk cleanup — ${APPLY ? 'APPLY (writing)' : 'DRY-RUN (no writes)'}\n`);
  const db = getAdmin();
  const snap = await C(db, 'be_products').get();
  console.log(`be_products total: ${snap.size}\n`);

  const polluted = [];          // { docId, name, junk:[keys], strayId, branchId, corruptionFlag }
  // be_products is BRANCH-SCOPED → group by branchId+name so per-branch copies
  // are NOT counted as duplicates (only same-branch same-name = a true dup).
  const nameGroups = new Map();  // `${branchId}|${name}` -> [{docId, blank, junk}]
  const allDocs = [];            // for clean-sibling lookup

  for (const d of snap.docs) {
    const data = d.data();
    allDocs.push({ docId: d.id, data });
    const nm = String(data.productName || data.name || '').trim().toLowerCase();
    const blank = !String(data.categoryName || '').trim() || !String(data.mainUnitName || '').trim();
    const hasJunk = JUNK_KEYS.some(k => k in data);
    if (nm) {
      const key = `${data.branchId || '?'}|${nm}`;
      if (!nameGroups.has(key)) nameGroups.set(key, []);
      nameGroups.get(key).push({ docId: d.id, blank, junk: hasJunk });
    }

    const junk = JUNK_KEYS.filter(k => k in data);
    const strayId = ('id' in data) && String(data.id) !== d.id; // stray data `id` ≠ doc id
    if (junk.length === 0 && !strayId) continue;

    // corruption signature: junk-polluted AND blank category AND blank unit
    // (the pre-V145 wipe set type→default + blanked cat/unit + added junk)
    const blankCat = !String(data.categoryName || '').trim();
    const blankUnit = !String(data.mainUnitName || '').trim();
    polluted.push({
      docId: d.id, name: data.productName || data.name || '(no name)',
      junk, strayId, branchId: data.branchId,
      corruptionFlag: junk.length > 0 && blankCat && blankUnit,
      type: data.productType, cat: data.categoryName, unit: data.mainUnitName,
    });
  }

  // ── report: junk-strip candidates ──
  console.log(`── JUNK-POLLUTED docs (will be cleaned by --apply): ${polluted.length} ──`);
  const junkKeyCount = {};
  for (const p of polluted) {
    for (const k of p.junk) junkKeyCount[k] = (junkKeyCount[k] || 0) + 1;
    if (p.strayId) junkKeyCount['id(stray)'] = (junkKeyCount['id(stray)'] || 0) + 1;
  }
  console.log('  junk-key frequency:', JSON.stringify(junkKeyCount));
  for (const p of polluted.slice(0, 40)) {
    console.log(`  ${p.docId} "${p.name}" branch=${p.branchId} strip=[${[...p.junk, ...(p.strayId ? ['id'] : [])].join(',')}]${p.corruptionFlag ? '  ⚠CORRUPTION-SIGNATURE (type/cat/unit wiped)' : ''}`);
  }
  if (polluted.length > 40) console.log(`  …and ${polluted.length - 40} more`);

  // ── report: corruption-signature + clean-same-branch-sibling check (DECISION) ──
  const norm = (s) => String(s || '').trim().toLowerCase();
  const corrupt = polluted.filter(p => p.corruptionFlag);
  console.log(`\n── ⚠ CORRUPTION-SIGNATURE docs (type/cat/unit wiped — junk-strip alone won't restore them): ${corrupt.length} ──`);
  const isClean = (o, p) => o.docId !== p.docId
    && norm(o.data.productName || o.data.name) === norm(p.name)
    && String(o.data.categoryName || '').trim() && String(o.data.mainUnitName || '').trim()
    && !JUNK_KEYS.some(k => k in o.data);
  let withSibling = 0, withCross = 0, noSource = 0;
  for (const p of corrupt) {
    const sib = allDocs.find(o => String(o.data.branchId) === String(p.branchId) && isClean(o, p));
    const cross = !sib && allDocs.find(o => String(o.data.branchId) !== String(p.branchId) && isClean(o, p));
    if (sib) withSibling++; else if (cross) withCross++; else noSource++;
    const restore = sib ? `same-branch ${sib.docId}` : cross ? `CROSS-branch ${cross.docId} (cat="${cross.data.categoryName}" unit="${cross.data.mainUnitName}" type=${cross.data.productType})` : 'NO clean copy anywhere — manual/ProClinic';
    console.log(`  ${p.docId} "${p.name}" → restore source: ${restore}`);
  }
  console.log(`  → restore sources: same-branch=${withSibling}, cross-branch=${withCross}, NONE=${noSource} (of ${corrupt.length})`);

  // ── report: TRUE same-branch duplicate names (be_products is branch-scoped) ──
  const dups = [...nameGroups.entries()].filter(([, arr]) => arr.length > 1);
  console.log(`\n── TRUE same-branch duplicate names (branchId+name): ${dups.length} ──`);
  for (const [key, arr] of dups.slice(0, 25)) console.log(`  ${key} → ${arr.length} docs: ${arr.map(a => a.docId + (a.junk ? '⚠junk' : '') + (a.blank ? '∅blank' : '')).join(', ')}`);
  if (dups.length > 25) console.log(`  …and ${dups.length - 25} more`);

  // ── APPLY (strip junk only) ──
  if (!APPLY) {
    console.log(`\nDRY-RUN complete. --apply would STRIP junk from ${polluted.length} docs (real fields untouched). NO corruption-restore, NO dedup (those stay manual).`);
    process.exit(0);
  }

  console.log(`\n▶ APPLYING junk-strip to ${polluted.length} docs…`);
  let written = 0;
  for (const p of polluted) {
    const patch = {};
    for (const k of p.junk) patch[k] = FieldValue.delete();
    if (p.strayId) patch.id = FieldValue.delete();
    patch._v145JunkStrippedAt = FieldValue.serverTimestamp();
    patch._v145JunkStrippedKeys = [...p.junk, ...(p.strayId ? ['id'] : [])].join(',');
    await C(db, 'be_products').doc(p.docId).update(patch);
    written++;
  }
  const auditId = `v145-product-junk-cleanup-${randomBytes(6).toString('hex')}`;
  await C(db, 'be_admin_audit').doc(auditId).set({
    op: 'v145-product-junk-cleanup', scanned: snap.size, cleaned: written,
    junkKeyFrequency: junkKeyCount, corruptionSignatureCount: corrupt.length,
    duplicateNameCount: dups.length, appliedAt: FieldValue.serverTimestamp(),
  });
  console.log(`✓ APPLIED — cleaned ${written} docs. audit: ${auditId}`);
  console.log(`  NOTE: ${corrupt.length} corruption-signature docs + ${dups.length} duplicate names were NOT auto-restored/deduped (manual decision).`);
  process.exit(0);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
