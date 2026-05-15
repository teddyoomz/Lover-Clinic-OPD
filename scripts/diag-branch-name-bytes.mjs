// Quick Rule R diag — verify stored branch.name byte content for Bug C
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local.prod', 'utf-8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2$/);
  if (m) process.env[m[1]] = m[3];
}
const key = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
if (getApps().length === 0) {
  initializeApp({ credential: cert({ projectId: 'loverclinic-opd-4c39b', clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: key }) });
}
const db = getFirestore();

const userTyped = 'นครราชสีมา';
const snap = await db.doc('artifacts/loverclinic-opd-4c39b/public/data/be_branches/BR-1777873556815-26df6480').get();
const stored = snap.data().name;

console.log('STORED:', JSON.stringify(stored), 'length:', stored.length);
console.log('USER TYPED:', JSON.stringify(userTyped), 'length:', userTyped.length);
console.log('STRICT EQ:', stored === userTyped);
console.log('TRIM EQ:', stored.trim() === userTyped.trim());
console.log('NFC EQ:', stored.normalize('NFC') === userTyped.normalize('NFC'));
console.log('STORED codepoints:', [...stored].map(c => c.codePointAt(0).toString(16)).join(' '));
console.log('USER codepoints:  ', [...userTyped].map(c => c.codePointAt(0).toString(16)).join(' '));
process.exit(0);
