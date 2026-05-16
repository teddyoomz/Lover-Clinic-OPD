#!/usr/bin/env node
// V81 DIAGNOSTIC: Verify Timestamp serialization round-trip behavior.
// READ-ONLY against prod — no writes, no deletes.
//
// Goal: prove or disprove the concern that V81 backup→restore degrades
// Firestore Timestamp fields to plain {seconds, nanoseconds} Maps.
//
// What this does:
//   1. Read a sample of real prod docs from collections likely to have Timestamps
//   2. Apply the EXACT same JSON.stringify the V81 backup executor uses
//   3. Apply the EXACT same JSON.parse the V81 restore executor uses
//   4. Compare original Timestamp objects vs round-tripped shape
//   5. Report findings
//
// USAGE: vercel env pull .env.local.prod --environment=production
//        node scripts/diag-v81-timestamp-roundtrip.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;

function loadEnv() {
  const envPath = path.resolve('.env.local.prod');
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function detectTimestampFields(obj, prefix = '') {
  const found = [];
  if (obj === null || obj === undefined) return found;
  if (obj instanceof Timestamp) {
    return [{ path: prefix || '<root>', type: 'Timestamp', value: `${obj.seconds}.${obj.nanoseconds}` }];
  }
  if (typeof obj !== 'object') return found;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      found.push(...detectTimestampFields(obj[i], `${prefix}[${i}]`));
    }
    return found;
  }
  for (const [k, v] of Object.entries(obj)) {
    found.push(...detectTimestampFields(v, prefix ? `${prefix}.${k}` : k));
  }
  return found;
}

function detectMapLikeTimestamp(obj, prefix = '') {
  // After round-trip, Timestamps become plain Maps with {seconds, nanoseconds} or {_seconds, _nanoseconds}
  const found = [];
  if (obj === null || obj === undefined) return found;
  if (typeof obj !== 'object') return found;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      found.push(...detectMapLikeTimestamp(obj[i], `${prefix}[${i}]`));
    }
    return found;
  }
  const keys = Object.keys(obj);
  const hasSecondsForm = keys.includes('seconds') && keys.includes('nanoseconds') && keys.length === 2;
  const hasUnderscoreForm = keys.includes('_seconds') && keys.includes('_nanoseconds') && keys.length === 2;
  if (hasSecondsForm || hasUnderscoreForm) {
    return [{ path: prefix || '<root>', shape: hasSecondsForm ? 'seconds/nanoseconds' : '_seconds/_nanoseconds', value: `${obj.seconds ?? obj._seconds}.${obj.nanoseconds ?? obj._nanoseconds}` }];
  }
  for (const [k, v] of Object.entries(obj)) {
    found.push(...detectMapLikeTimestamp(v, prefix ? `${prefix}.${k}` : k));
  }
  return found;
}

async function main() {
  const env = loadEnv();
  const privateKey = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
        clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey,
      }),
      storageBucket: `${APP_ID}.firebasestorage.app`,
    });
  }
  const db = getFirestore();

  console.log('=== V81 Timestamp Round-Trip Diagnostic ===\n');

  // Sample 5 docs each from collections likely to have Timestamps
  const sampleCollections = [
    'chat_conversations',
    'chat_history',
    'be_admin_audit',
    'be_appointments',
    'be_recalls',
    'be_customers',
    'be_sales',
  ];

  const findings = {
    docsScanned: 0,
    docsWithTimestampFields: 0,
    timestampFieldPaths: new Set(),
    sampleRoundTripResults: [],
  };

  for (const colName of sampleCollections) {
    try {
      const snap = await db.collection(`${PREFIX}/${colName}`).limit(3).get();
      console.log(`\nCollection: ${colName} (sampled ${snap.size} docs)`);
      for (const d of snap.docs) {
        findings.docsScanned += 1;
        const data = d.data();
        const tsFields = detectTimestampFields(data);
        if (tsFields.length > 0) {
          findings.docsWithTimestampFields += 1;
          for (const f of tsFields) findings.timestampFieldPaths.add(`${colName}.${f.path}`);

          // Now apply V81 backup serialization
          const docForBackup = { ...data, id: d.id };
          const json = JSON.stringify(docForBackup, null, 2);

          // Now apply V81 restore parsing
          const parsed = JSON.parse(json);
          const { id, ...restoredData } = parsed;

          // Detect Map-like Timestamps in the restored shape
          const mapLikeTs = detectMapLikeTimestamp(restoredData);

          findings.sampleRoundTripResults.push({
            collection: colName,
            docId: d.id,
            originalTimestampCount: tsFields.length,
            restoredAsMapCount: mapLikeTs.length,
            originalFields: tsFields.slice(0, 3).map(f => f.path),
            restoredFields: mapLikeTs.slice(0, 3).map(f => `${f.path} → ${f.shape}`),
          });

          // First doc — show details
          if (findings.sampleRoundTripResults.length <= 2) {
            console.log(`  Doc: ${d.id}`);
            console.log(`    Original Timestamp fields: ${tsFields.length}`);
            tsFields.slice(0, 5).forEach(f => console.log(`      - ${f.path}: Timestamp(${f.value})`));
            console.log(`    After backup-JSON → restore-parse, Map-shaped: ${mapLikeTs.length}`);
            mapLikeTs.slice(0, 5).forEach(f => console.log(`      - ${f.path}: ${f.shape}`));
          }
        }
      }
    } catch (e) {
      console.log(`  ERROR on ${colName}: ${e.message}`);
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Total docs scanned: ${findings.docsScanned}`);
  console.log(`Docs with Timestamp fields: ${findings.docsWithTimestampFields}`);
  console.log(`Unique Timestamp field paths found: ${findings.timestampFieldPaths.size}`);
  findings.timestampFieldPaths.forEach(p => console.log(`  - ${p}`));

  console.log('\n=== ROUND-TRIP ASSESSMENT ===');
  const sampleResult = findings.sampleRoundTripResults[0];
  if (!sampleResult) {
    console.log('No samples to assess.');
  } else {
    const allDegrade = findings.sampleRoundTripResults.every(r => r.originalTimestampCount === r.restoredAsMapCount && r.originalTimestampCount > 0);
    const noneDegrade = findings.sampleRoundTripResults.every(r => r.restoredAsMapCount === 0);
    if (allDegrade) {
      console.log('🚨 BUG CONFIRMED: Every Timestamp field in source docs becomes a Map after backup-restore round-trip.');
      console.log('   This means V81 restore would DEGRADE all Timestamps to plain Maps in restored prod.');
      console.log('   Affected fields:');
      Array.from(findings.timestampFieldPaths).forEach(p => console.log(`     - ${p}`));
      console.log('\n   FIX REQUIRED: backup must serialize Timestamps with a marker; restore must re-hydrate to Timestamp.');
      process.exit(2);
    } else if (noneDegrade) {
      console.log('✓ No degradation detected. V81 round-trip preserves Timestamps.');
      process.exit(0);
    } else {
      console.log('⚠ Partial degradation. Some docs degrade, some don\'t. Investigation needed.');
      console.log(JSON.stringify(findings.sampleRoundTripResults, null, 2));
      process.exit(2);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1); });
}
