#!/usr/bin/env node
// One-shot diag: นครราชสีมา supposedly wiped (V40 confirmed 0) but V41
// dry-run sees 303 products. Verify the data + figure out what's going on.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const NAKHON = 'BR-1777873556815-26df6480';
const PRAM3 = 'BR-1777885958735-38afbdeb';

const envFile = existsSync('.env.local.prod') ? '.env.local.prod' : '.env.local';
for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (!m) continue;
  let val = m[2]; if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  process.env[m[1]] = val;
}

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
    }),
  });
}
const db = getFirestore();
function dataCol(name) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);
}

async function main() {
  console.log('═══ Nakhon products mystery diag ═══');
  console.log(`NAKHON: ${NAKHON}`);
  console.log(`PRAM3:  ${PRAM3}`);

  // 1. Count via count()
  const nakSnapCount = await dataCol('be_products').where('branchId', '==', NAKHON).count().get();
  const pramSnapCount = await dataCol('be_products').where('branchId', '==', PRAM3).count().get();
  console.log(`\nCount() results:`);
  console.log(`  นครราชสีมา products: ${nakSnapCount.data().count}`);
  console.log(`  พระราม 3 products:   ${pramSnapCount.data().count}`);

  // 2. Get full data via .get() and verify branchId
  const nakSnap = await dataCol('be_products').where('branchId', '==', NAKHON).limit(10).get();
  console.log(`\nGet() first 10 at นครราชสีมา (limit 10):`);
  console.log(`  size: ${nakSnap.size}`);
  for (const d of nakSnap.docs) {
    const data = d.data();
    console.log(`  - docId=${d.id}  branchId=${data.branchId}  productName=${data.productName || '(none)'}  productId=${data.productId || '(none)'}  createdAt=${data.createdAt || '(none)'}  updatedAt=${data.updatedAt || '(none)'}`);
  }

  const pramSnap = await dataCol('be_products').where('branchId', '==', PRAM3).limit(10).get();
  console.log(`\nGet() first 10 at พระราม 3 (limit 10):`);
  console.log(`  size: ${pramSnap.size}`);
  for (const d of pramSnap.docs) {
    const data = d.data();
    console.log(`  - docId=${d.id}  branchId=${data.branchId}  productName=${data.productName || '(none)'}`);
  }

  // 3. Are nakhon docIds the same as pram3 docIds (same docs)?
  const nakIds = new Set(nakSnap.docs.map(d => d.id));
  const pramIds = new Set(pramSnap.docs.map(d => d.id));
  const intersection = [...nakIds].filter(id => pramIds.has(id));
  console.log(`\nDocId intersection between first-10-นครราชสีมา and first-10-พระราม 3: ${intersection.length} (expected 0 — branches should have separate docs)`);
  if (intersection.length > 0) {
    console.log(`  intersecting IDs: ${intersection.join(', ')}`);
  }

  // 4. Check if any product has multiple branchIds (impossible unless data corruption)
  console.log(`\nFull-table sample: check first 50 products at นครราชสีมา for duplicate productNames vs พระราม 3`);
  const nakAll = await dataCol('be_products').where('branchId', '==', NAKHON).limit(50).get();
  const pramAll = await dataCol('be_products').where('branchId', '==', PRAM3).limit(50).get();
  const nakNames = new Set(nakAll.docs.map(d => d.data().productName).filter(Boolean));
  const pramNames = new Set(pramAll.docs.map(d => d.data().productName).filter(Boolean));
  const sharedNames = [...nakNames].filter(n => pramNames.has(n));
  console.log(`  นครราชสีมา distinct productNames (from first 50): ${nakNames.size}`);
  console.log(`  พระราม 3 distinct productNames (from first 50):   ${pramNames.size}`);
  console.log(`  shared productNames: ${sharedNames.length}`);
  if (sharedNames.length > 0) {
    console.log(`  first 10 shared: ${sharedNames.slice(0, 10).join(', ')}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('FATAL:', e); process.exit(99); });
}
