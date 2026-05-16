#!/usr/bin/env node
// Rule R diag — V80 chat_conversations branchId state (mirror of
// diag-v76-chat-history-branchid-state.mjs). User reported chat_history leak;
// Rule P Step 3 cross-collection grep mandates checking the SIBLING collection
// (chat_conversations) which shares the same fall-through filter pattern in
// ChatPanel.jsx + useChatUnread.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const NAKHON_BR_ID = 'BR-1777873556815-26df6480';

function loadEnv() {
  const envPath = path.resolve('.env.local.prod');
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
  if (!getApps().length) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  const db = getFirestore();

  const snap = await db.collection(`${PREFIX}/chat_conversations`).get();
  console.log(`Total chat_conversations docs: ${snap.size}\n`);

  const byBranch = {};
  const missingOrEmpty = [];
  snap.forEach(d => {
    const data = d.data();
    const bid = data.branchId;
    const key = bid === undefined || bid === null
      ? '__MISSING__'
      : (bid === '' ? '__EMPTY__' : String(bid));
    byBranch[key] = (byBranch[key] || 0) + 1;
    if ((key === '__MISSING__' || key === '__EMPTY__') && missingOrEmpty.length < 20) {
      missingOrEmpty.push({
        docId: d.id, displayName: data.displayName, platform: data.platform,
        lastMessage: (data.lastMessage || '').slice(0, 60),
        lastMessageAt: data.lastMessageAt, createdAt: data.createdAt,
        branchIdSource: data.branchIdSource,
      });
    }
  });

  console.log('Distribution by branchId field state:');
  for (const [k, v] of Object.entries(byBranch).sort((a, b) => b[1] - a[1])) {
    const label = k === NAKHON_BR_ID ? `${k} (นครราชสีมา)` : k;
    console.log(`  ${label}: ${v}`);
  }
  if (missingOrEmpty.length) {
    console.log(`\nMISSING/EMPTY branchId convs (first ${missingOrEmpty.length}):`);
    for (const s of missingOrEmpty) console.log('  ' + JSON.stringify(s));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1); });
}
