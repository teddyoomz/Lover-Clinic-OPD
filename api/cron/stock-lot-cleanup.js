// api/cron/stock-lot-cleanup.js
// V143-quater (2026-05-31) — Daily stock LOT cleanup. Fires 03:45 BKK (= 20:45 UTC).
// Per (product × location): keep every live lot (remaining !== 0) + AT MOST ONE
// zero-remaining lot (placeholder so a fully-drained product still shows at 0,
// V143/AV166); delete the redundant zero lots so depleted lots can't accumulate
// ("ล้น"). DELETE-ONLY — never touches a lot holding stock/debt; cancelled/expired
// untouched. Cron-only · idempotent · system-wide (all branches + warehouses). AV168.
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import { planLotCleanup } from '../../src/lib/stockLotCleanupCore.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const BATCHES_COL = `${PREFIX}/be_stock_batches`;
const AUDIT_COL = `${PREFIX}/be_admin_audit`;

function initAdmin() {
  if (getApps().length) return;
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

export default async function handler(req, res) {
  // CRON_SECRET gate (mirror stock-movement-retention / whole-system-backup-daily).
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || '';
  const provided = authHeader.replace(/^Bearer\s+/i, '') || req.headers['x-cron-secret'];
  if (!cronSecret || provided !== cronSecret) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'CRON_SECRET mismatch' });
  }

  initAdmin();
  const db = getFirestore();
  try {
    const snap = await db.collection(BATCHES_COL).get();
    const batches = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    const { deleteIds, perGroup, keptPlaceholders } = planLotCleanup(batches);

    let deleted = 0, inBatch = 0;
    let batch = db.batch();
    for (const id of deleteIds) {
      batch.delete(db.collection(BATCHES_COL).doc(id));
      deleted++; inBatch++;
      if (inBatch >= 450) { await batch.commit(); batch = db.batch(); inBatch = 0; }
    }
    if (inBatch > 0) await batch.commit();

    const auditId = `stock-lot-cleanup-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await db.collection(AUDIT_COL).doc(auditId).set({
      op: 'stock-lot-cleanup',
      scanned: batches.length,
      groupsCleaned: Object.keys(perGroup).length,
      lotsDeleted: deleted,
      keptPlaceholders,
      ranAt: new Date().toISOString(),
    });

    return res.status(200).json({ scanned: batches.length, groupsCleaned: Object.keys(perGroup).length, lotsDeleted: deleted, keptPlaceholders });
  } catch (e) {
    return res.status(500).json({ error: 'LOT_CLEANUP_FAILED', message: e.message });
  }
}
