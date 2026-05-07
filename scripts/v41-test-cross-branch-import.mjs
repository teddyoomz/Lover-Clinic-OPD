#!/usr/bin/env node
// ─── V41 Cross-Branch-Import test (Phase 17.1 verification) ────────────────
//
// Tests the existing "Copy จากสาขาอื่น" feature for the 6 master-data tabs:
//   product-units, medical-instruments, holidays, product-groups, products,
//   courses.
//
// Source: พระราม 3 (BR-1777885958735-38afbdeb, 488 docs)
// Target: นครราชสีมา (BR-1777873556815-26df6480, post-V40 fresh = 0 docs)
//
// Per copied doc, verifies:
//   (1) branchId === target (นครราชสีมา)
//   (2) canonicalIdField (productId/courseId/groupId/unitGroupId/instrumentId/
//       holidayId) === newDocId — V39 stamping pattern
//   (3) data.id === newDocId — V39 defensive stamp
//   (4) scopedRead(target) includes newDocId — branchId filter routes correctly
//   (5) scopedRead(source) EXCLUDES newDocId — no leak to other branch
//   (6) known business field preserved from source (e.g. productName, name)
//   (7) admin SDK can EDIT a copied doc (modify field, re-read, verify persist)
//   (8) admin SDK can DELETE a copied doc (remove, verify gone)
//
// Test order respects FK dependencies (standalone first, then dependent):
//   product-units → medical-instruments → holidays
//   → product-groups → products → courses
//
// Cleanup: every imported doc is deleted at end. Final state of นครราชสีมา
// returns to the pre-test baseline (0 branch-scoped docs).
//
// Authorization compliance:
//   - Rule M (data ops via local + admin SDK + pull env)
//   - feedback_no_real_action_in_preview_eval: scripts only, no UI clicks
//   - Two-phase: --dry-run (default) prints plan; --apply executes
//
// Usage:
//   node scripts/v41-test-cross-branch-import.mjs            # dry-run
//   node scripts/v41-test-cross-branch-import.mjs --apply    # execute

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { ADAPTERS, getAdapter } from '../src/lib/crossBranchImportAdapters/index.js';

// ═══ Constants ═══════════════════════════════════════════════════════════
const APP_ID = 'loverclinic-opd-4c39b';
const SOURCE = 'BR-1777885958735-38afbdeb';      // พระราม 3
const TARGET = 'BR-1777873556815-26df6480';      // นครราชสีมา
const SAMPLE = 3;                                 // items per entity type
const EXEC_BY = 'cli:v41-test-cross-branch-import';

const ORDER = [
  'product-units',          // standalone
  'medical-instruments',    // standalone
  'holidays',               // standalone
  'product-groups',         // FK: products[].productId (filter to empty products[])
  'products',               // FK: unitId, categoryId (filter to nulls or copy after units+groups)
  'courses',                // FK: items[].productId (filter to empty items[])
  // Phase 17.1 marketing extension (2026-05-07) — V41 marketing adapters
  'promotions',             // FK: courses[].id + products[].id (depends on both above)
  'coupons',                // standalone
  'vouchers',               // standalone
];

// Known business field per entity (used for source-preservation check)
const KNOWN_FIELD = {
  'product-units': 'name',
  'medical-instruments': 'name',
  'holidays': 'name',
  'product-groups': 'name',
  'products': 'productName',
  'courses': 'courseName',
  'promotions': 'promotion_name',
  'coupons': 'coupon_code',
  'vouchers': 'voucher_name',
};

// FK collection → entity type (mirrors endpoint).
// Phase 17.1 marketing extension (2026-05-07) — added 'be_courses' so
// promotions can resolve their courses[].id FK refs against be_courses
// at target. Pre-extension this was a 3-collection assumption — caused
// "ต้อง import ก่อน: (unknown)" symptom when promotions copy was tested
// without first extending this map. Mirrors api/admin/cross-branch-import.js
// FK_COLLECTION_TO_ENTITY exactly. M5.12 regression test enforces.
const FK_C2E = {
  'be_products': 'products',
  'be_product_groups': 'product-groups',
  'be_product_unit_groups': 'product-units',
  'be_courses': 'courses',
};

// ═══ Args parsing ═════════════════════════════════════════════════════════
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true];
}));
const APPLY = args.apply === true || args.apply === 'true';

// ═══ Env loading ═════════════════════════════════════════════════════════
const envFile = existsSync('.env.local.prod')
  ? '.env.local.prod'
  : (existsSync('.env.local') ? '.env.local' : null);
if (!envFile) {
  console.error('FATAL: no .env.local.prod or .env.local');
  process.exit(1);
}
for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (!m) continue;
  let val = m[2];
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  process.env[m[1]] = val;
}

// ═══ Firebase init ═══════════════════════════════════════════════════════
if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
    }),
  });
}
const db = getFirestore();
function dataCol(name) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);
}
function randHex(n = 8) { return randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n); }

// ═══ Logging ═════════════════════════════════════════════════════════════
const HR = '═'.repeat(72);
const log = (...a) => console.log(...a);
const banner = (title) => log(`\n${HR}\n  ${title}\n${HR}`);
const pass = (m) => log(`    ✓ PASS  ${m}`);
const fail = (m) => log(`    ✗ FAIL  ${m}`);
const info = (m) => log(`    ·       ${m}`);

// ═══ Endpoint mirror (replicates api/admin/cross-branch-import.js) ═══════
async function importMirror(entityType, itemIds) {
  const adapter = getAdapter(entityType);
  const colRef = dataCol(adapter.collection);

  // 1. Read source items
  const sourceItems = [];
  for (let i = 0; i < itemIds.length; i += 30) {
    const chunk = itemIds.slice(i, i + 30).map(String);
    const snap = await colRef
      .where('branchId', '==', SOURCE)
      .where('__name__', 'in', chunk)
      .get();
    snap.docs.forEach(d => sourceItems.push({ ...d.data(), id: d.id }));
  }

  // 2. Read target for dedup
  const targetSnap = await colRef.where('branchId', '==', TARGET).get();
  const targetItems = targetSnap.docs.map(d => ({ ...d.data(), id: d.id }));
  const targetDedupSet = new Set(targetItems.map(t => adapter.dedupKey(t)));

  // 3. FK lookups (target side + source side for dedupKey-based remap)
  const fkRefs = sourceItems.flatMap(item => adapter.fkRefs(item));
  const fkCollections = [...new Set(fkRefs.map(r => r.collection))];
  const resolveFkAdapter = (col) => {
    const ent = FK_C2E[col]; return ent ? getAdapter(ent) : null;
  };

  const fkTargetIdSets = {};
  const sourceFkLookup = {};
  for (const col of fkCollections) {
    const fkAdapter = resolveFkAdapter(col);
    const tSnap = await dataCol(col).where('branchId', '==', TARGET).get();
    fkTargetIdSets[col] = new Set(
      fkAdapter
        ? tSnap.docs.map(d => fkAdapter.dedupKey({ ...d.data(), id: d.id }))
        : tSnap.docs.map(d => d.id)
    );
    if (fkAdapter) {
      const sSnap = await dataCol(col).where('branchId', '==', SOURCE).get();
      const lookup = {};
      sSnap.docs.forEach(d => { lookup[d.id] = fkAdapter.dedupKey({ ...d.data(), id: d.id }); });
      sourceFkLookup[col] = lookup;
    }
  }

  // 4. Classify
  const imported = [];
  const skippedDup = [];
  const skippedFK = [];
  const itemsToImport = [];
  for (const item of sourceItems) {
    const dedupKey = adapter.dedupKey(item);
    if (targetDedupSet.has(dedupKey)) { skippedDup.push({ sourceId: item.id, dedupKey }); continue; }
    const refs = adapter.fkRefs(item);
    const missingFKs = [];
    for (const ref of refs) {
      for (const refId of ref.ids) {
        const sourceFkKey = sourceFkLookup[ref.collection]?.[refId];
        if (!sourceFkKey || !fkTargetIdSets[ref.collection]?.has(sourceFkKey)) {
          missingFKs.push({ collection: ref.collection, sourceId: refId });
        }
      }
    }
    if (missingFKs.length > 0) { skippedFK.push({ sourceId: item.id, missingFKs }); continue; }
    itemsToImport.push(item);
  }

  // 5. Atomic batch
  if (itemsToImport.length === 0) {
    return { imported, skippedDup, skippedFK };
  }
  const batch = db.batch();
  const ts = Date.now();
  for (const item of itemsToImport) {
    const newId = `${entityType.replace(/-/g, '_')}_${ts}_${randomBytes(4).toString('hex')}`.toUpperCase();
    const cloned = adapter.clone(item, TARGET, EXEC_BY);
    cloned.id = newId;
    if (adapter.canonicalIdField) cloned[adapter.canonicalIdField] = newId;
    batch.set(colRef.doc(newId), cloned);
    imported.push({ sourceId: item.id, newId });
  }
  await batch.commit();
  return { imported, skippedDup, skippedFK };
}

// ═══ Pick source sample, prefer no-FK first ══════════════════════════════
async function pickSample(entityType) {
  const adapter = getAdapter(entityType);
  const colRef = dataCol(adapter.collection);
  const snap = await colRef.where('branchId', '==', SOURCE).limit(100).get();
  const items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  if (items.length === 0) return [];
  const noFk = items.filter(item => adapter.fkRefs(item).length === 0);
  if (noFk.length >= SAMPLE) return noFk.slice(0, SAMPLE);
  if (noFk.length > 0) {
    const withFk = items.filter(s => adapter.fkRefs(s).length > 0);
    return [...noFk, ...withFk.slice(0, SAMPLE - noFk.length)];
  }
  return items.slice(0, SAMPLE);
}

// ═══ Test one entity type ════════════════════════════════════════════════
async function testOne(entityType, sourceIdx) {
  banner(`[${sourceIdx + 1}/${ORDER.length}] ${entityType}`);
  const adapter = getAdapter(entityType);
  const colRef = dataCol(adapter.collection);

  // Pick sample
  log(`  Picking source sample (target=${SAMPLE})...`);
  const sample = await pickSample(entityType);
  if (sample.length === 0) {
    info('No source items at พระราม 3 — skipping');
    return { entityType, status: 'skip-no-source' };
  }
  const noFkCount = sample.filter(s => adapter.fkRefs(s).length === 0).length;
  log(`  Picked ${sample.length} items (${noFkCount} no-FK, ${sample.length - noFkCount} with-FK)`);
  for (const s of sample) {
    info(`source: ${s.id}  ${KNOWN_FIELD[entityType] ? '['+KNOWN_FIELD[entityType]+'='+(s[KNOWN_FIELD[entityType]] || 'null')+']' : ''}`);
  }

  if (!APPLY) {
    info('WOULD: importMirror() → verify branchId/canonical/id/scope/known-field');
    info('WOULD: edit one + verify persist');
    info('WOULD: delete one + verify gone');
    info('WOULD: cleanup remaining');
    return { entityType, status: 'dry-run', sampleSize: sample.length };
  }

  // Import
  const t0 = Date.now();
  log('  Importing via cross-branch-import mirror...');
  const result = await importMirror(entityType, sample.map(s => s.id));
  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
  log(`  Result: imported=${result.imported.length}, skippedDup=${result.skippedDup.length}, skippedFK=${result.skippedFK.length} (${elapsed}s)`);

  if (result.skippedDup.length > 0) {
    info(`skippedDup details: ${result.skippedDup.map(s => s.dedupKey).slice(0, 3).join(', ')}${result.skippedDup.length > 3 ? '...' : ''}`);
  }
  if (result.skippedFK.length > 0) {
    info(`skippedFK details: ${result.skippedFK.map(s => `${s.sourceId}(missing=${s.missingFKs.length})`).slice(0, 3).join(', ')}`);
  }

  if (result.imported.length === 0) {
    info('No items imported — likely all dup or FK-missing. Test passes vacuously.');
    return { entityType, status: 'no-import', skippedDup: result.skippedDup.length, skippedFK: result.skippedFK.length };
  }

  // ─── Verify each imported doc ───
  log('  Verifying imported docs...');

  // Pre-fetch scoped views for cross-leak check
  const targetScopedSnap = await colRef.where('branchId', '==', TARGET).get();
  const targetScopedIds = new Set(targetScopedSnap.docs.map(d => d.id));
  const sourceScopedSnap = await colRef.where('branchId', '==', SOURCE).get();
  const sourceScopedIds = new Set(sourceScopedSnap.docs.map(d => d.id));

  const verifications = [];
  for (const { newId, sourceId } of result.imported) {
    const newDocSnap = await colRef.doc(newId).get();
    if (!newDocSnap.exists) {
      fail(`docId ${newId}: missing from Firestore`);
      verifications.push({ newId, sourceId, ok: false });
      continue;
    }
    const data = newDocSnap.data();
    const sourceItem = sample.find(s => s.id === sourceId);
    const knownField = KNOWN_FIELD[entityType];

    const v = {
      newId,
      sourceId,
      branchIdOk: data.branchId === TARGET,
      canonicalOk: !adapter.canonicalIdField || data[adapter.canonicalIdField] === newId,
      stampedIdOk: data.id === newId,
      scopedReadTargetOk: targetScopedIds.has(newId),
      noLeakSourceOk: !sourceScopedIds.has(newId),
      knownFieldOk: !knownField || (data[knownField] !== undefined && data[knownField] === sourceItem?.[knownField]),
    };
    v.ok = v.branchIdOk && v.canonicalOk && v.stampedIdOk && v.scopedReadTargetOk && v.noLeakSourceOk && v.knownFieldOk;
    verifications.push(v);

    if (v.ok) {
      pass(`${newId}: branchId✓ ${adapter.canonicalIdField}=docId✓ id=docId✓ scoped✓ no-leak✓ ${knownField}-preserved✓`);
    } else {
      fail(`${newId}: branchId=${v.branchIdOk?'✓':'✗('+data.branchId+')'} canonical=${v.canonicalOk?'✓':'✗('+data[adapter.canonicalIdField]+')'} id=${v.stampedIdOk?'✓':'✗('+data.id+')'} scope=${v.scopedReadTargetOk?'✓':'✗'} leak=${v.noLeakSourceOk?'✓':'✗LEAK'} known=${v.knownFieldOk?'✓':'✗('+data[knownField]+' vs '+sourceItem?.[knownField]+')'}`);
    }
  }

  // ─── Edit test ───
  log('  Edit test (admin SDK update on first imported doc)...');
  const editTarget = result.imported[0];
  const editField = '_testEditMarker';
  const editValue = `EDIT-V41-${Date.now()}-${randHex(4)}`;
  await colRef.doc(editTarget.newId).update({ [editField]: editValue });
  const reReadEdit = await colRef.doc(editTarget.newId).get();
  const editOk = reReadEdit.data()?.[editField] === editValue;
  if (editOk) pass(`edit on ${editTarget.newId}: ${editField} persisted`);
  else fail(`edit on ${editTarget.newId}: persisted value = ${reReadEdit.data()?.[editField]} (expected ${editValue})`);

  // ─── Delete test ───
  log('  Delete test (admin SDK delete on second imported doc)...');
  const deleteIdx = Math.min(1, result.imported.length - 1);
  const deleteTarget = result.imported[deleteIdx];
  await colRef.doc(deleteTarget.newId).delete();
  const reReadDelete = await colRef.doc(deleteTarget.newId).get();
  const deleteOk = !reReadDelete.exists;
  if (deleteOk) pass(`delete on ${deleteTarget.newId}: gone from Firestore`);
  else fail(`delete on ${deleteTarget.newId}: still exists`);

  // ─── Cleanup remaining ───
  log('  Cleanup remaining imports...');
  let cleaned = 0;
  for (const { newId } of result.imported) {
    if (newId === deleteTarget.newId) continue;  // already deleted
    await colRef.doc(newId).delete();
    cleaned++;
  }
  info(`Cleaned ${cleaned} docs (plus 1 from delete test = ${cleaned + 1} total)`);

  return {
    entityType,
    status: 'done',
    imported: result.imported.length,
    skippedDup: result.skippedDup.length,
    skippedFK: result.skippedFK.length,
    verifications,
    editOk,
    deleteOk,
    pass: verifications.every(v => v.ok) && editOk && deleteOk,
  };
}

// ═══ Count branch-scoped docs (per entity in ORDER) ══════════════════════
async function countByEntity(branchId) {
  const out = {};
  let total = 0;
  for (const e of ORDER) {
    const adapter = getAdapter(e);
    const snap = await dataCol(adapter.collection).where('branchId', '==', branchId).count().get();
    out[e] = snap.data().count;
    total += snap.data().count;
  }
  return { perEntity: out, total };
}

// ═══ Main ════════════════════════════════════════════════════════════════
async function main() {
  banner(`V41 Cross-Branch-Import Test  [${APPLY ? 'APPLY' : 'DRY-RUN'}]`);
  log(`  Source: ${SOURCE} (พระราม 3)`);
  log(`  Target: ${TARGET} (นครราชสีมา)`);
  log(`  Sample: ${SAMPLE} per entity, in dependency order`);
  log(`  Order:  ${ORDER.join(' → ')}`);

  // Pre-state
  banner('Pre-state — TARGET (นครราชสีมา)');
  const pre = await countByEntity(TARGET);
  for (const e of ORDER) log(`  ${e.padEnd(22)}  ${pre.perEntity[e]}`);
  log(`  ${'TOTAL'.padEnd(22)}  ${pre.total}`);

  banner('Pre-state — SOURCE (พระราม 3)');
  const preSrc = await countByEntity(SOURCE);
  for (const e of ORDER) log(`  ${e.padEnd(22)}  ${preSrc.perEntity[e]}`);
  log(`  ${'TOTAL'.padEnd(22)}  ${preSrc.total}`);

  // Run per entity
  const results = [];
  for (let i = 0; i < ORDER.length; i++) {
    const r = await testOne(ORDER[i], i);
    results.push(r);
  }

  // Post-state
  banner('Post-state — TARGET (นครราชสีมา)');
  const post = await countByEntity(TARGET);
  for (const e of ORDER) {
    const delta = post.perEntity[e] - pre.perEntity[e];
    const tag = delta === 0 ? '   ' : (delta > 0 ? `+${delta}` : `${delta}`);
    log(`  ${e.padEnd(22)}  ${post.perEntity[e]}  ${tag}`);
  }
  log(`  ${'TOTAL'.padEnd(22)}  ${post.total}  ${post.total - pre.total === 0 ? '(unchanged ✓)' : '(diff: ' + (post.total - pre.total) + ')'}`);

  // Summary
  banner('Test Summary');
  let allPass = true;
  for (const r of results) {
    if (r.status === 'skip-no-source') log(`  ⊘ SKIP  ${r.entityType.padEnd(22)}  no source items`);
    else if (r.status === 'no-import') log(`  ⊘ N/A   ${r.entityType.padEnd(22)}  no items imported (dup=${r.skippedDup} fk=${r.skippedFK})`);
    else if (r.status === 'dry-run') log(`  ⊙ DRY   ${r.entityType.padEnd(22)}  sample=${r.sampleSize}`);
    else {
      const status = r.pass ? '✓ PASS' : '✗ FAIL';
      log(`  ${status}  ${r.entityType.padEnd(22)}  imported=${r.imported}  edit=${r.editOk?'✓':'✗'}  delete=${r.deleteOk?'✓':'✗'}  shapeOk=${r.verifications?.filter(v=>v.ok).length}/${r.verifications?.length}`);
      if (!r.pass) allPass = false;
    }
  }

  if (APPLY) {
    if (post.total !== pre.total) {
      log(`\n  ⚠ WARN: target total changed ${pre.total} → ${post.total}; cleanup may have missed something`);
    } else {
      log(`\n  ✓ Target total unchanged: ${post.total} (clean state preserved)`);
    }
    log(`\n  ${allPass ? '✓ ALL TESTS PASS' : '✗ SOME TESTS FAILED — see above'}`);
    process.exit(allPass ? 0 : 1);
  } else {
    log(`\n  Re-run with --apply to execute.`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => {
    console.error('\n✗ FATAL:', e);
    console.error(e.stack);
    process.exit(99);
  });
}
