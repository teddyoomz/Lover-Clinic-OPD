// Rule M — backfill be_customers.patientData.assessmentDate (intake/รับเข้า date)
// for existing customers (0/40 sampled had it — the pre-fix projection dropped it).
// Source priority: (1) the linked intake session's patientData.assessmentDate
// (when `_perfBackfilledFromSession` resolves — exact form-fill day), else
// (2) the customer's createdAt → Bangkok YYYY-MM-DD (= the creation/intake day).
// Two-phase: DRY-RUN by default; writes only with --apply. Idempotent (skips docs
// that already have assessmentDate). Forensic + audit doc. Dotted-path update
// preserves sibling patientData fields (V32-tris-quater).
// Usage: node scripts/backfill-customer-intake-assessment-date.mjs [--apply]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const APPLY = process.argv.includes('--apply');
const env = Object.fromEntries(readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
if (!getApps().length) initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n') }) });
const db = getFirestore();
const data = () => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

const bkkDate = (v) => { // ISO string OR Firestore Timestamp OR ms → Bangkok YYYY-MM-DD
  let ms = 0;
  if (!v) return '';
  if (typeof v === 'string') ms = Date.parse(v);
  else if (v.toMillis) ms = v.toMillis();
  else if (typeof v === 'number') ms = v;
  if (!ms || Number.isNaN(ms)) return '';
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
};
const isISODate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s);

async function main() {
  console.log(`═══ backfill intake assessmentDate — ${APPLY ? 'APPLY' : 'DRY-RUN'} ═══`);
  const snap = await data().collection('be_customers').get();
  let scanned = 0, already = 0, fromSession = 0, fromCreated = 0, noSource = 0, written = 0;
  const sessionCache = new Map();
  const sample = [];
  for (const docSnap of snap.docs) {
    scanned++;
    const c = docSnap.data();
    const pd = c.patientData || {};
    if (isISODate(pd.assessmentDate)) { already++; continue; }
    // source
    let val = '', src = '';
    const sref = c._perfBackfilledFromSession;
    if (sref) {
      if (!sessionCache.has(sref)) { const s = await data().collection('opd_sessions').doc(String(sref)).get(); sessionCache.set(sref, s.exists ? (s.data().patientData || {}).assessmentDate : null); }
      const sd = sessionCache.get(sref);
      if (isISODate(sd)) { val = sd.slice(0, 10); src = 'intake-session'; }
    }
    if (!val) { const cd = bkkDate(c.createdAt) || bkkDate(c.clonedAt); if (cd) { val = cd; src = 'createdAt'; } }
    if (!val) { noSource++; continue; }
    if (src === 'intake-session') fromSession++; else fromCreated++;
    if (sample.length < 6) sample.push(`${docSnap.id} → ${val} (${src})`);
    if (APPLY) {
      await docSnap.ref.update({
        'patientData.assessmentDate': val,
        'patientData._assessmentDateBackfilledAt': FieldValue.serverTimestamp(),
        'patientData._assessmentDateBackfilledFrom': src,
      });
      written++;
    }
  }
  console.log(`scanned ${scanned} | already-set ${already} | would-stamp-from-session ${fromSession} | would-stamp-from-createdAt ${fromCreated} | no-source ${noSource} | written ${written}`);
  console.log('sample:'); sample.forEach((s) => console.log('  ', s));
  if (APPLY) {
    const auditId = `backfill-assessmentdate-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await data().collection('be_admin_audit').doc(auditId).set({ op: 'backfill-customer-intake-assessment-date', scanned, already, fromSession, fromCreated, noSource, written, appliedAt: FieldValue.serverTimestamp() });
    console.log('audit:', 'be_admin_audit/' + auditId);
  } else {
    console.log('(dry-run — re-run with --apply to write)');
  }
  process.exit(0);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
