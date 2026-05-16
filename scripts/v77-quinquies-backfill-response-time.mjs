#!/usr/bin/env node
// V77-quinquies (2026-05-16 EOD+1) — Recompute responseTimeMs on chat_history
// docs where it was stamped null because V77-ter bug had offHours=true at
// write time. V77-quater flipped offHours→false but didn't restore the
// numeric response time → display "ตอบล่าสุด" badge missing.
//
// Recompute: resolvedAt - lastCustomerMessageAt (ms). Same formula as
// handleResolve at write time. maxCustomerGapMs NOT recomputed (needs
// messages subcoll which is per-conversation cleanup-eligible after 7d).

import { fileURLToPath } from 'node:url';

async function main() {
  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  const { randomBytes } = await import('node:crypto');
  const { readFileSync, existsSync } = await import('node:fs');

  if (existsSync('.env.local.prod')) {
    for (const line of readFileSync('.env.local.prod', 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      if (!(k in process.env)) process.env[k] = v;
    }
  }

  const APP_ID = 'loverclinic-opd-4c39b';
  const APPLY = process.argv.includes('--apply');

  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: APP_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
      }),
    });
  }
  const db = getFirestore();

  const histCol = db.collection(`artifacts/${APP_ID}/public/data/chat_history`);
  const snap = await histCol.get();
  const result = {
    scanned: snap.size,
    nullResponseTime: 0,
    recomputable: 0,
    unrecomputable: 0,
    written: 0,
    samples: [],
  };

  for (const docRef of snap.docs) {
    const d = docRef.data() || {};
    if (d.responseTimeMs !== null && d.responseTimeMs !== undefined) continue;
    result.nullResponseTime++;
    // Compute from lastCustomerMessageAt → resolvedAt
    const lastCust = d.lastCustomerMessageAt;
    const resolved = d.resolvedAt;
    if (!lastCust || !resolved) {
      result.unrecomputable++;
      continue;
    }
    const lastT = new Date(lastCust).getTime();
    const resT = new Date(resolved).getTime();
    if (!Number.isFinite(lastT) || !Number.isFinite(resT) || resT < lastT) {
      result.unrecomputable++;
      continue;
    }
    const responseTimeMs = resT - lastT;
    result.recomputable++;
    if (result.samples.length < 10)
      result.samples.push({
        id: docRef.id,
        displayName: d.displayName,
        responseTimeMs,
        responseMin: Math.round(responseTimeMs / 60000),
      });
    if (APPLY) {
      await docRef.ref.update({
        responseTimeMs,
        _v77quinquiesResponseTimeBackfilled: true,
        _v77quinquiesBackfilledAt: FieldValue.serverTimestamp(),
      });
      result.written++;
    }
  }

  if (APPLY) {
    const auditId = `v77-quinquies-response-time-backfill-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await db
      .collection(`artifacts/${APP_ID}/public/data/be_admin_audit`)
      .doc(auditId)
      .set({
        kind: 'v77-quinquies-response-time-backfill',
        result,
        appliedAt: FieldValue.serverTimestamp(),
        callerScript: 'scripts/v77-quinquies-backfill-response-time.mjs',
      });
    console.log(`Audit doc: be_admin_audit/${auditId}`);
  }
  console.log('Result:', JSON.stringify(result, null, 2));
  console.log(APPLY ? `APPLIED ${result.written} writes` : 'DRY-RUN COMPLETE');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
