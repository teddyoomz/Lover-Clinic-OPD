#!/usr/bin/env node
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
const snap = await db
  .doc('artifacts/loverclinic-opd-4c39b/public/data/clinic_settings/main')
  .get();
if (!snap.exists) {
  console.log('main doc missing');
  process.exit(0);
}
const d = snap.data();
console.log('chatAlwaysOn:', d.chatAlwaysOn);
console.log('chatOpenTime:', d.chatOpenTime, '/ close:', d.chatCloseTime);
console.log('chatOpenTimeWeekend:', d.chatOpenTimeWeekend, '/ close:', d.chatCloseTimeWeekend);
const bkk = new Date(Date.now() + 7 * 3600 * 1000);
console.log('Bangkok time now:', bkk.toISOString());
