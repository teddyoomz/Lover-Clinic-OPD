#!/usr/bin/env node
// Rule R diagnostic — V80 (2026-05-16 NIGHT+4) for chat_history cross-branch
// leak user reported NIGHT+4: "พระราม 3 และ ทดลอง 1 มีประวัติแชทเก่าของนครราชสีมา".
//
// V76 backfill audit doc claims 3,281 docs stamped → NAKHON. If true, ChatPanel
// client-side filter `!item.branchId || item.branchId === selectedBranchId`
// should exclude NAKHON items from non-NAKHON branch views.
//
// User still sees 6 leaked entries. Possibilities:
//   A. Backfill didn't run on those 6 specific docs (only 3,275 of 3,281 actually written)
//   B. NEW chat_history writes post-backfill lack branchId stamp (handleResolve bug)
//   C. Client filter has bug (e.g. case-sensitivity mismatch on branchId)
//
// This script reads ALL chat_history docs from real prod via admin SDK and
// groups by branchId field state. Read-only.
//
// USAGE: node scripts/diag-v76-chat-history-branchid-state.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;

// Known branchIds (from V77-bis + V76 audit doc + earlier context)
const NAKHON_BR_ID = 'BR-1777873556815-26df6480';

function loadEnv() {
  const envPath = path.resolve('.env.local.prod');
  if (!fs.existsSync(envPath)) throw new Error('.env.local.prod missing — run `vercel env pull .env.local.prod --environment=production` first');
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const projectId = env.FIREBASE_ADMIN_PROJECT_ID || APP_ID;
  const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!clientEmail || !privateKey) throw new Error('FIREBASE_ADMIN_* env vars missing');

  if (!getApps().length) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  const db = getFirestore();
  const col = db.collection(`${PREFIX}/chat_history`);
  const snap = await col.get();
  console.log(`Total chat_history docs: ${snap.size}\n`);

  const byBranch = {};
  const missingOrEmpty = [];
  const samples = [];

  snap.forEach(d => {
    const data = d.data();
    const bid = data.branchId;
    const key = bid === undefined || bid === null
      ? '__MISSING__'
      : (bid === '' ? '__EMPTY__' : String(bid));
    byBranch[key] = (byBranch[key] || 0) + 1;
    if (key === '__MISSING__' || key === '__EMPTY__') {
      if (missingOrEmpty.length < 10) {
        missingOrEmpty.push({
          docId: d.id,
          displayName: data.displayName,
          platform: data.platform,
          lastMessage: (data.lastMessage || '').slice(0, 60),
          resolvedAt: data.resolvedAt,
          firstContactAt: data.firstContactAt,
          branchIdSource: data.branchIdSource,
          hasV76Backfill: !!data._v76BranchBackfilledAt,
        });
      }
    }
  });

  console.log('Distribution by branchId field state:');
  const sorted = Object.entries(byBranch).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of sorted) {
    const label = k === NAKHON_BR_ID
      ? `${k} (นครราชสีมา)`
      : k;
    console.log(`  ${label}: ${v}`);
  }
  console.log(`\nTotal NON-NAKHON with branchId stamped: ${
    sorted.filter(([k]) => k !== NAKHON_BR_ID && k !== '__MISSING__' && k !== '__EMPTY__')
      .reduce((a, [, v]) => a + v, 0)
  }`);

  if (missingOrEmpty.length) {
    console.log(`\nSample MISSING/EMPTY branchId docs (first ${missingOrEmpty.length}):`);
    for (const s of missingOrEmpty) {
      console.log('  ' + JSON.stringify(s));
    }
  }

  // Sample 5 most-recent docs (any branch)
  console.log('\n5 most-recent chat_history docs (any branch):');
  const all = [];
  snap.forEach(d => all.push({ id: d.id, data: d.data() }));
  all.sort((a, b) => {
    const ra = a.data.resolvedAt ? new Date(a.data.resolvedAt).getTime() : 0;
    const rb = b.data.resolvedAt ? new Date(b.data.resolvedAt).getTime() : 0;
    return rb - ra;
  });
  for (const { id, data } of all.slice(0, 5)) {
    console.log(`  ${id}: branchId=${data.branchId || '(empty)'}, branchIdSource=${data.branchIdSource || '(none)'}, resolvedAt=${data.resolvedAt}, lastMessage="${(data.lastMessage || '').slice(0, 50)}"`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1); });
}
