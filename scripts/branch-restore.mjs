#!/usr/bin/env node
// CLI mirror of /api/admin/branch-restore. See spec §10.
// Run: node scripts/branch-restore.mjs --file=<path> --mode=overwrite|clone --target=BR-...

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { TIER_MAP, BACKUP_TIER_T1, T1_FK_SPEC, buildFkRemapTable, applyFkRemap } from '../src/lib/branchBackupCore.js';
import { validateBackupFile } from '../src/lib/branchBackupSchema.js';

const envFile = existsSync('.env.local.prod') ? '.env.local.prod' : '.env.local';
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2]; if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[m[1]] = val;
  }
}

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;
const BATCH_LIMIT = 400;

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true];
}));
if (!args.file || !args.mode || !args.target) {
  console.error('Usage: --file=<storagePath-or-localPath> --mode=overwrite|clone --target=<branchId>');
  process.exit(1);
}
if (!['overwrite', 'clone'].includes(args.mode)) {
  console.error('Invalid mode (use overwrite or clone)'); process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
    }),
    storageBucket: BUCKET,
  });
}
const db = getFirestore();
const bucket = getStorage().bucket();
function dataCol(name) { return db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name); }
function randHex(n = 8) { return randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n); }

async function main() {
  // Load file (Storage path OR local path)
  let json;
  if (args.file.startsWith('backups/')) {
    const [data] = await bucket.file(args.file).download();
    json = data.toString('utf8');
  } else {
    json = readFileSync(args.file, 'utf8');
  }

  const file = JSON.parse(json);
  validateBackupFile(file);

  if (args.mode === 'overwrite' && file.meta.sourceBranchId !== args.target) {
    console.error('MODE_MISMATCH: overwrite requires source === target'); process.exit(1);
  }
  if (args.mode === 'clone' && file.meta.sourceBranchId === args.target) {
    console.error('CLONE_TO_SAME_BRANCH'); process.exit(1);
  }

  const writtenCollections = Object.keys(file.collections);
  if (args.mode === 'clone') {
    const t1set = new Set(TIER_MAP[BACKUP_TIER_T1]);
    for (const col of writtenCollections) {
      if (!t1set.has(col)) {
        console.error(`CLONE_NON_T1_COLLECTION: ${col}`); process.exit(1);
      }
    }
  }

  const result = { mode: args.mode, perCollection: {}, fkRemap: { unmapped: [] } };

  if (args.mode === 'overwrite') {
    for (const col of writtenCollections) {
      const docs = file.collections[col] || [];
      if (col.startsWith('be_customers/')) {
        const parts = col.split('/');
        const customerId = parts[1];
        const sub = parts[2];
        let written = 0;
        for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
          const slice = docs.slice(i, i + BATCH_LIMIT);
          const batch = db.batch();
          for (const d of slice) {
            const id = String(d.id || d.docId || randHex(12));
            const { id: _omit, ...rest } = d;
            batch.set(dataCol('be_customers').doc(customerId).collection(sub).doc(id), { ...rest, branchId: args.target }, { merge: false });
          }
          await batch.commit();
          written += slice.length;
        }
        result.perCollection[col] = { written };
      } else {
        let written = 0;
        for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
          const slice = docs.slice(i, i + BATCH_LIMIT);
          const batch = db.batch();
          for (const d of slice) {
            const id = String(d.id || d.docId);
            const { id: _omit, ...rest } = d;
            batch.set(dataCol(col).doc(id), { ...rest, branchId: args.target }, { merge: false });
          }
          await batch.commit();
          written += slice.length;
        }
        result.perCollection[col] = { written };
      }
    }
  } else {
    // CLONE — re-mint IDs + FK remap
    const ts = Date.now();
    const remapTables = {};
    const sourcesPerCol = {};
    for (const col of writtenCollections) {
      const docs = file.collections[col] || [];
      sourcesPerCol[col] = docs;
      const newIds = docs.map((_, i) => `${col.replace(/^be_/, '').toUpperCase()}_${ts}_${randHex(4).toUpperCase()}_${i}`);
      remapTables[col] = buildFkRemapTable(docs, newIds);
    }
    const auditCtx = { unmapped: [] };
    for (const col of writtenCollections) {
      const docs = sourcesPerCol[col];
      const fkSpec = T1_FK_SPEC[col] || {};
      const newIdsArr = [...remapTables[col].values()];
      let written = 0;
      for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
        const slice = docs.slice(i, i + BATCH_LIMIT);
        const batch = db.batch();
        for (let j = 0; j < slice.length; j++) {
          const newId = newIdsArr[i + j];
          const { id: _omit, ...rest } = slice[j];
          const remapped = applyFkRemap(rest, fkSpec, remapTables, auditCtx);
          const canonicalIdField = ({
            be_products: 'productId',
            be_courses: 'courseId',
            be_product_groups: 'groupId',
            be_product_units: 'unitId',
            be_product_unit_groups: 'unitGroupId',
            be_medical_instruments: 'instrumentId',
            be_holidays: 'holidayId',
            be_df_groups: 'groupId',
            be_promotions: 'promotionId',
            be_coupons: 'couponId',
            be_vouchers: 'voucherId',
          })[col] || null;
          const finalDoc = { ...remapped, branchId: args.target };
          if (canonicalIdField) finalDoc[canonicalIdField] = newId;
          batch.set(dataCol(col).doc(newId), finalDoc, { merge: false });
        }
        await batch.commit();
        written += slice.length;
      }
      result.perCollection[col] = { written };
    }
    result.fkRemap.unmapped = auditCtx.unmapped;
  }

  console.log(`✓ Restore complete (${args.mode})`);
  console.log('perCollection:', result.perCollection);
  if (args.mode === 'clone') console.log('unmapped FKs:', result.fkRemap.unmapped.length);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('FATAL:', e); process.exit(1); });
}
