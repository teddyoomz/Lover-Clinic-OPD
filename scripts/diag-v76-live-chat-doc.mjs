#!/usr/bin/env node
// Quick inspect: dump the 1 active chat_conversations doc (Rule R diag)
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'node:fs';

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

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: 'loverclinic-opd-4c39b',
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }),
  });
}
const db = getFirestore();
const snap = await db.collection('artifacts/loverclinic-opd-4c39b/public/data/chat_conversations').get();
for (const d of snap.docs) {
  const data = d.data();
  console.log('id:', d.id);
  console.log('  unreadCount:', data.unreadCount, '(type:', typeof data.unreadCount + ')');
  console.log('  branchId:', JSON.stringify(data.branchId), '(empty?', !data.branchId, ')');
  console.log('  branchIdSource:', data.branchIdSource);
  console.log('  platform:', data.platform);
  console.log('  lastMessage:', data.lastMessage?.slice(0, 50));
}

console.log('\n=== LOVER_DEFAULT_BRANCH_ID env ===');
console.log(process.env.LOVER_DEFAULT_BRANCH_ID || '(NOT SET)');
