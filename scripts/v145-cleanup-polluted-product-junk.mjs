#!/usr/bin/env node
// Rule M (TWO-PHASE) — clean the stock-aggregation junk that the pre-V145 edit
// bug wrote onto be_products docs AND restore the cat/unit/type the same bug
// blanked. DEFAULT = DRY-RUN (no writes). Pass --apply to commit.
//
// This op is PURELY NON-DESTRUCTIVE (updateDoc only — no deletes):
//   PHASE A — strip junk keys (batches/totalRemaining/totalCapacity/nextExpiry/
//             expired/unit/valueCost + stray `id`) via FieldValue.delete().
//   PHASE B — restore productType/categoryName/subCategoryName/mainUnitName for
//             the 35 corruption-signature docs:
//               • 28 with a clean copy (same-branch sib > cross-branch) → copy
//                 the 4 fields verbatim from that clean source.
//               • 7 with NO clean copy → MANUAL_RESTORE map (inferred values,
//                 user-reviewed). All 7 are IN USE (have stock batches).
//   Forensic stamps (_v145JunkStripped* / _v145Restored*) on every touched doc.
//
// DEDUP of the 3 true same-branch duplicate names is NOT done here — 1 of the 3
// (Neuramis 38764↔9B1DEFF7) needs a course/batch MERGE, so all dedup-deletes are
// deferred to the cascade-safe product-delete built in the orphan-stock debug.
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
const RESTORE_FIELDS = ['productType', 'categoryName', 'subCategoryName', 'mainUnitName'];

// 7 corruption-signature docs with NO clean copy anywhere (all IN USE — have
// stock batches). Values inferred from the product name + the branch's existing
// category set; subCategoryName='' (matches every clean sibling). USER-REVIEWED.
const MANUAL_RESTORE = {
  'PROD-mpp4dmws-d1b937d0da074884': { productType: 'ยา', categoryName: 'ยาทั่วไป', mainUnitName: 'เม็ด' },        // Buscopan (เม็ด)
  'PROD-mpw64wje-6e3e107618482ef3': { productType: 'ยา', categoryName: 'ยาทั่วไป', mainUnitName: 'เม็ด' },        // Dimenhydrinate (เม็ด)
  'PROD-mpw68hd7-eec4a9713cf51f8f': { productType: 'ยา', categoryName: 'ยาทั่วไป', mainUnitName: 'เม็ด' },        // Metroclopramide (เม็ด)
  'PRODUCTS_1778150429849_06E6F90E': { productType: 'ยา', categoryName: 'ยาทั่วไป', mainUnitName: 'ขวด' },        // 2% Lindocain without adrenaline (ยาชา)
  'PRODUCTS_1778150429849_41DC9B11': { productType: 'สินค้าสิ้นเปลือง', categoryName: 'อุปกรณ์ทั่วไป', mainUnitName: 'กล่อง' }, // เข็มทู่ เบอร์ 21 (70mm) 50ชิ้น/กล่อง
  'PRODUCTS_1778150429849_5FA24C67': { productType: 'สินค้าสิ้นเปลือง', categoryName: 'อุปกรณ์ทั่วไป', mainUnitName: 'กล่อง' }, // Syring 1 ml 100ชิ้น/กล่อง
  'PRODUCTS_1778150429849_63949276': { productType: 'สินค้าสิ้นเปลือง', categoryName: 'อุปกรณ์ทั่วไป', mainUnitName: 'กล่อง' }, // เข็มทู่ เบอร์ 18 (50mm) 50ชิ้น/กล่อง
};

const APPLY = process.argv.includes('--apply');
const norm = (s) => String(s || '').trim().toLowerCase();

async function main() {
  console.log(`▶ V145 product cleanup (strip junk + restore cat/unit/type) — ${APPLY ? 'APPLY (writing)' : 'DRY-RUN (no writes)'}\n`);
  const db = getAdmin();
  const snap = await C(db, 'be_products').get();
  console.log(`be_products total: ${snap.size}\n`);

  const allDocs = snap.docs.map(d => ({ docId: d.id, data: d.data() }));
  const nameGroups = new Map();        // `${branchId}|${name}` -> [{docId, blank, junk}]
  for (const { docId, data } of allDocs) {
    const nm = norm(data.productName || data.name);
    if (nm) {
      const key = `${data.branchId || '?'}|${nm}`;
      if (!nameGroups.has(key)) nameGroups.set(key, []);
      nameGroups.get(key).push({ docId, blank: !String(data.categoryName || '').trim() || !String(data.mainUnitName || '').trim(), junk: JUNK_KEYS.some(k => k in data) });
    }
  }

  // clean-copy lookup: same name, non-blank cat+unit, no junk
  const isClean = (o, p) => o.docId !== p.docId
    && norm(o.data.productName || o.data.name) === norm(p.name)
    && String(o.data.categoryName || '').trim() && String(o.data.mainUnitName || '').trim()
    && !JUNK_KEYS.some(k => k in o.data);

  // build the per-doc plan for every polluted doc
  const plan = [];   // { docId, name, branchId, junk, strayId, restore:{src, fields} | null, corruption }
  for (const { docId, data } of allDocs) {
    const junk = JUNK_KEYS.filter(k => k in data);
    const strayId = ('id' in data) && String(data.id) !== docId;
    if (junk.length === 0 && !strayId) continue;
    const name = data.productName || data.name || '(no name)';
    const blankCat = !String(data.categoryName || '').trim();
    const blankUnit = !String(data.mainUnitName || '').trim();
    const corruption = junk.length > 0 && blankCat && blankUnit;

    let restore = null;
    if (corruption) {
      const sib = allDocs.find(o => String(o.data.branchId) === String(data.branchId) && isClean(o, { docId, name }));
      const cross = !sib && allDocs.find(o => String(o.data.branchId) !== String(data.branchId) && isClean(o, { docId, name }));
      const src = sib || cross;
      if (src) {
        const fields = {}; for (const f of RESTORE_FIELDS) fields[f] = src.data[f] ?? '';
        restore = { src: `${sib ? 'same-branch' : 'cross-branch'} ${src.docId}`, fields };
      } else if (MANUAL_RESTORE[docId]) {
        restore = { src: 'manual', fields: { ...MANUAL_RESTORE[docId], subCategoryName: '' } };
      } else {
        restore = { src: 'NONE — no clean copy + not in MANUAL_RESTORE', fields: null };
      }
    }
    plan.push({ docId, name, branchId: data.branchId, junk, strayId, restore, corruption, priorType: data.productType });
  }

  // ── report ──
  console.log(`── ${plan.length} polluted docs (PHASE A junk-strip + PHASE B restore) ──`);
  let restored = 0, manualCount = 0, noSource = 0;
  for (const p of plan) {
    const stripStr = `strip=[${[...p.junk, ...(p.strayId ? ['id'] : [])].join(',')}]`;
    let restoreStr = '';
    if (p.restore && p.restore.fields) {
      const f = p.restore.fields;
      restoreStr = `  RESTORE←${p.restore.src}: type="${f.productType}" cat="${f.categoryName}" unit="${f.mainUnitName}"`;
      if (p.restore.src === 'manual') manualCount++; else restored++;
    } else if (p.restore && !p.restore.fields) {
      restoreStr = `  ⚠ ${p.restore.src}`; noSource++;
    }
    console.log(`  ${p.docId} "${p.name}" ${stripStr}${restoreStr}`);
  }
  console.log(`\n  → restore: from-clean-copy=${restored}, manual=${manualCount}, NO-SOURCE(strip only)=${noSource}`);

  // ── dedup report (NOT touched here — deferred to cascade-safe delete) ──
  const dups = [...nameGroups.entries()].filter(([, arr]) => arr.length > 1);
  console.log(`\n── TRUE same-branch duplicate names: ${dups.length} (NOT deduped here — deferred to cascade-safe delete) ──`);
  for (const [key, arr] of dups) console.log(`  ${key} → ${arr.map(a => a.docId + (a.junk ? '⚠junk' : '') + (a.blank ? '∅blank' : '')).join(', ')}`);

  if (!APPLY) {
    console.log(`\nDRY-RUN complete. --apply would: strip junk from ${plan.length} docs + restore cat/unit/type on ${restored + manualCount} (${restored} clean-copy + ${manualCount} manual). NO deletes, NO dedup.`);
    process.exit(0);
  }

  // ── APPLY ──
  console.log(`\n▶ APPLYING…`);
  let written = 0;
  for (const p of plan) {
    const patch = {};
    for (const k of p.junk) patch[k] = FieldValue.delete();
    if (p.strayId) patch.id = FieldValue.delete();
    patch._v145JunkStrippedAt = FieldValue.serverTimestamp();
    patch._v145JunkStrippedKeys = [...p.junk, ...(p.strayId ? ['id'] : [])].join(',');
    if (p.restore && p.restore.fields) {
      for (const [f, v] of Object.entries(p.restore.fields)) patch[f] = v;
      patch._v145RestoredFrom = p.restore.src;
      patch._v145RestoredLegacyType = p.priorType ?? '';
      patch._v145RestoredAt = FieldValue.serverTimestamp();
    }
    await C(db, 'be_products').doc(p.docId).update(patch);
    written++;
  }
  const auditId = `v145-product-cleanup-${randomBytes(6).toString('hex')}`;
  await C(db, 'be_admin_audit').doc(auditId).set({
    op: 'v145-product-cleanup', scanned: snap.size, touched: written,
    restoredFromCleanCopy: restored, restoredManual: manualCount, stripOnlyNoSource: noSource,
    duplicateNameGroups: dups.length, appliedAt: FieldValue.serverTimestamp(),
  });
  console.log(`✓ APPLIED — touched ${written} docs (restored ${restored + manualCount}). audit: ${auditId}`);
  console.log(`  NOTE: ${dups.length} duplicate-name groups NOT deduped (deferred to cascade-safe delete).`);
  process.exit(0);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
