#!/usr/bin/env node
// scripts/diag-v75-chat-state.mjs — Rule R diagnostic
// READ-ONLY admin-SDK probe of chat_conversations real-prod state.
// Verifies (a) collection path, (b) doc count, (c) presence of branchId,
// (d) sample of un-stamped docs (would-be backfill candidates).

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function loadEnv() {
  if (!existsSync('.env.local.prod')) return;
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
loadEnv();

const APP_ID = 'loverclinic-opd-4c39b';

function initApp() {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }),
  });
}

async function main() {
  const app = initApp();
  const db = getFirestore(app);

  console.log('=== Path 1: artifacts/{APP_ID}/public/data/chat_conversations ===');
  const path1 = db.collection(`artifacts/${APP_ID}/public/data/chat_conversations`);
  const snap1 = await path1.limit(500).get();
  console.log(`  Total docs (first 500): ${snap1.size}`);
  let withBranch = 0, withoutBranch = 0;
  const samples = { withBranch: [], withoutBranch: [] };
  for (const d of snap1.docs) {
    const data = d.data() || {};
    if (data.branchId) {
      withBranch++;
      if (samples.withBranch.length < 3) {
        samples.withBranch.push({ id: d.id, branchId: data.branchId, branchIdSource: data.branchIdSource, fields: Object.keys(data).slice(0, 8) });
      }
    } else {
      withoutBranch++;
      if (samples.withoutBranch.length < 3) {
        samples.withoutBranch.push({ id: d.id, fields: Object.keys(data).slice(0, 8), lastMessage: data.lastMessage, platform: data.platform });
      }
    }
  }
  console.log(`  withBranchId: ${withBranch}`);
  console.log(`  withoutBranchId: ${withoutBranch}`);
  console.log('  samples:', JSON.stringify(samples, null, 2));

  console.log('\n=== Path 2: /chat_conversations (root, no artifacts prefix) ===');
  try {
    const path2 = db.collection('chat_conversations');
    const snap2 = await path2.limit(10).get();
    console.log(`  Total docs (first 10): ${snap2.size}`);
    if (snap2.size > 0) {
      console.log('  FIRST DOC:', JSON.stringify(snap2.docs[0].data(), null, 2).slice(0, 500));
    }
  } catch (e) {
    console.log(`  Read failed: ${e.message}`);
  }

  // Get ALL docs (no limit) at canonical path
  console.log('\n=== Path 1 FULL count (no limit) ===');
  const fullSnap = await path1.get();
  console.log(`  TOTAL docs at canonical path: ${fullSnap.size}`);
  if (fullSnap.size > 0) {
    console.log('  First doc id:', fullSnap.docs[0].id);
    console.log('  First doc fields:', Object.keys(fullSnap.docs[0].data() || {}));
    console.log('  First doc data preview:', JSON.stringify(fullSnap.docs[0].data(), null, 2).slice(0, 800));
  }

  // chat_history (FULL scan + branchId field analysis)
  console.log('\n=== chat_history collection — FULL scan ===');
  const histPath = db.collection(`artifacts/${APP_ID}/public/data/chat_history`);
  const histSnap = await histPath.get();
  console.log(`  TOTAL docs: ${histSnap.size}`);
  let histWithBranch = 0, histWithoutBranch = 0;
  for (const d of histSnap.docs) {
    if (d.data()?.branchId) histWithBranch++;
    else histWithoutBranch++;
  }
  console.log(`  withBranchId: ${histWithBranch}`);
  console.log(`  withoutBranchId: ${histWithoutBranch}`);
  if (histSnap.size > 0) {
    console.log('  First history doc fields:', Object.keys(histSnap.docs[0].data() || {}));
    console.log('  First history doc:', JSON.stringify(histSnap.docs[0].data(), null, 2).slice(0, 500));
  }

  // List ALL collections at artifacts/{APP_ID}/public/data
  console.log('\n=== List collections under artifacts/{APP_ID}/public/data ===');
  const parentDoc = db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
  try {
    const subcollections = await parentDoc.listCollections();
    for (const c of subcollections) {
      if (c.id.includes('chat') || c.id.includes('conv')) {
        console.log(`  → ${c.id}`);
      }
    }
  } catch (e) {
    console.log(`  listCollections failed: ${e.message}`);
  }

  console.log('\n=== be_branches (for branch name lookup) ===');
  const brSnap = await db.collection(`artifacts/${APP_ID}/public/data/be_branches`).get();
  for (const b of brSnap.docs) {
    console.log(`  ${b.id}: ${b.data()?.name || '(no name)'}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error('FATAL:', e);
    process.exit(99);
  });
}
