#!/usr/bin/env node
// V77-quater (2026-05-16 EOD+1) — Re-evaluate offHours on chat_history docs
// that were tagged WHILE V77-ter/quater bug was live (isWithinChatHours
// reading pre-V51 field names → defaulted 10:00-19:00 → docs after 19:00
// stamped offHours:true wrongly).
//
// Scope: docs with offHours === true. Re-check via the V51-merged shape.
// Default fallback to นครราชสีมา branch.settings.chatHours (currently 11:15-
// 20:45 monFri / 10:15-19:45 satSun).
//
// Usage:
//   node scripts/v77-quater-backfill-offhours-tag.mjs          # dry-run
//   node scripts/v77-quater-backfill-offhours-tag.mjs --apply  # commit

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
  const NAKHON_BR_ID = 'BR-1777873556815-26df6480';
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

  // Read นครราชสีมา branch settings.chatHours
  const brSnap = await db
    .doc(`artifacts/${APP_ID}/public/data/be_branches/${NAKHON_BR_ID}`)
    .get();
  const branch = brSnap.data() || {};
  const ch = branch.settings?.chatHours || {};
  const alwaysOn = !!ch.alwaysOn;
  const monFri = ch.monFri || { open: '10:00', close: '19:00' };
  const satSun = ch.satSun || { open: '10:00', close: '19:00' };
  console.log(`V77-quater offHours backfill — ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Branch ${NAKHON_BR_ID} chatHours:`, JSON.stringify({ alwaysOn, monFri, satSun }));

  function isWithin(ts) {
    if (alwaysOn) return true;
    const d = new Date(ts);
    const bkk = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const day = bkk.getDay();
    const isWeekend = day === 0 || day === 6;
    const hhmm = `${String(bkk.getHours()).padStart(2, '0')}:${String(bkk.getMinutes()).padStart(2, '0')}`;
    const open = isWeekend ? satSun.open : monFri.open;
    const close = isWeekend ? satSun.close : monFri.close;
    return hhmm >= open && hhmm < close;
  }

  const histCol = db.collection(`artifacts/${APP_ID}/public/data/chat_history`);
  // Read ALL chat_history (3,281). Filter to offHours === true in-memory
  // (Firestore "where offHours == true" needs an index; small enough to scan).
  const snap = await histCol.get();
  const result = {
    scanned: snap.size,
    offHoursDocs: 0,
    wronglyTagged: 0,
    correctlyTagged: 0,
    untagged: 0,
    written: 0,
    samples: [],
  };
  for (const docRef of snap.docs) {
    const data = docRef.data() || {};
    if (data.offHours !== true) {
      result.untagged++;
      continue;
    }
    result.offHoursDocs++;
    const ts = data.firstContactAt || data.lastCustomerMessageAt || data.resolvedAt;
    if (!ts) continue;
    const isWithinHours = isWithin(ts);
    if (isWithinHours) {
      result.wronglyTagged++;
      if (result.samples.length < 10)
        result.samples.push({ id: docRef.id, firstContactAt: ts, displayName: data.displayName });
      if (APPLY) {
        await docRef.ref.update({
          offHours: false,
          _v77quaterOffHoursCorrected: true,
          _v77quaterCorrectedAt: FieldValue.serverTimestamp(),
        });
        result.written++;
      }
    } else {
      result.correctlyTagged++;
    }
  }

  if (APPLY) {
    const auditId = `v77-quater-offhours-backfill-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await db
      .collection(`artifacts/${APP_ID}/public/data/be_admin_audit`)
      .doc(auditId)
      .set({
        kind: 'v77-quater-offhours-backfill',
        branchId: NAKHON_BR_ID,
        chatHours: { alwaysOn, monFri, satSun },
        result,
        appliedAt: FieldValue.serverTimestamp(),
        callerScript: 'scripts/v77-quater-backfill-offhours-tag.mjs',
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
