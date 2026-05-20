// scripts/e2e-stock-movement-retention.mjs
// Rule Q V66 L2 — exercises the retention logic against REAL prod Firestore +
// Storage using TEST-prefixed, branch-isolated old-dated movement fixtures
// (V33.11 stock-test prefix). Seeds -> runs the same archive-before-delete loop
// the cron runs (scoped to the TEST branch) -> verifies archived to Storage +
// deleted from Firestore + recent preserved + idempotent -> cleanup (zero orphans).
// Branch-isolated: never touches real prod movements. Read Rule R (env pull OK for test).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { randomBytes } from 'node:crypto';
import {
  computeCutoffISO, archiveStoragePath, groupByBranchMonth, groupKeyForMovement,
  mergeArchive, buildArchiveFileBody, normalizeCreatedAtForCompare,
} from '../src/lib/stockMovementRetentionCore.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;

function loadEnv() {
  const txt = readFileSync('.env.local.prod', 'utf8');
  const env = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return env;
}

async function main() {
  const env = loadEnv();
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: APP_ID,
        clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
      }),
      storageBucket: `${APP_ID}.firebasestorage.app`,
    });
  }
  const db = getFirestore();
  const storage = getStorage().bucket();
  const col = db.collection(`${PREFIX}/be_stock_movements`);

  const tag = `TEST-V106-${Date.now()}`;
  const branchId = `TEST-BR-${randomBytes(3).toString('hex')}`;
  const oldISO = '2026-01-05T00:00:00.000Z';   // certainly > 90d before now
  const recentISO = new Date().toISOString();   // < 90d
  const seedIds = [];
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

  try {
    // 1. seed 2 old + 1 recent TEST movements (branch-isolated)
    for (const [suffix, createdAt] of [['old-a', oldISO], ['old-b', oldISO], ['recent', recentISO]]) {
      const id = `${tag}-${suffix}`;
      await col.doc(id).set({ movementId: id, branchId, productId: 'TEST-P', productName: 'TEST', qty: -1, before: 5, after: 4, type: 2, createdAt, note: tag });
      seedIds.push(id);
    }
    console.log('Seeded 3 fixtures under', branchId, '(cutoff =', computeCutoffISO() + ')');

    // 2. run the retention loop (mirror of cron) scoped to the TEST branch
    const cutoffISO = computeCutoffISO();
    const snap = await col.where('branchId', '==', branchId).get();
    const eligible = [];
    for (const d of snap.docs) {
      const data = { ...d.data(), movementId: d.id };
      const a = normalizeCreatedAtForCompare(data.createdAt);
      if (a && a < cutoffISO) eligible.push({ ref: d.ref, data });
    }
    const groups = groupByBranchMonth(eligible.map(e => e.data));
    const archivedKeys = new Set(); const archiveRefs = [];
    for (const [key, ms] of Object.entries(groups)) {
      const [bid, month] = key.split('|');
      const path = archiveStoragePath(bid, month);
      const file = storage.file(path);
      const [exists] = await file.exists();
      const existing = exists ? (JSON.parse((await file.download())[0].toString('utf8')).movements || []) : [];
      await file.save(JSON.stringify(buildArchiveFileBody({ branchId: bid, month, movements: mergeArchive(existing, ms) })), { contentType: 'application/json' });
      archivedKeys.add(key); archiveRefs.push(path);
    }
    let deleted = 0;
    for (const e of eligible) { if (archivedKeys.has(groupKeyForMovement(e.data))) { await e.ref.delete(); deleted++; } }

    // 3. assertions
    ok(deleted === 2, `deleted 2 old (got ${deleted})`);
    ok((await col.doc(`${tag}-recent`).get()).exists, 'recent fixture preserved in Firestore');
    ok(!(await col.doc(`${tag}-old-a`).get()).exists, 'old-a deleted from Firestore');
    ok(!(await col.doc(`${tag}-old-b`).get()).exists, 'old-b deleted from Firestore');
    const archPath = archiveStoragePath(branchId, '2026-01');
    const [archExists] = await storage.file(archPath).exists();
    ok(archExists, `archive file written to Storage: ${archPath}`);
    if (archExists) {
      const body = JSON.parse((await storage.file(archPath).download())[0].toString('utf8'));
      ok(body.movements.length === 2 && body.schemaVersion === 1, `archive has 2 movements + schemaVersion 1 (got ${body.movements.length}/${body.schemaVersion})`);
      const remerged = mergeArchive(body.movements, body.movements);
      ok(remerged.length === 2, 'mergeArchive idempotent on the real archive file');
    }
  } finally {
    // 4. cleanup — delete remaining TEST docs + archive file (zero orphans)
    for (const id of seedIds) await db.doc(`${PREFIX}/be_stock_movements/${id}`).delete().catch(() => {});
    await storage.file(archiveStoragePath(branchId, '2026-01')).delete().catch(() => {});
    console.log('Cleanup done (TEST docs + archive removed).');
  }
  console.log(`\nRESULT: PASS ${pass} / FAIL ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
