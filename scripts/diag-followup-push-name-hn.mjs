// Rule R diag (READ-ONLY) — verify the follow-up push name+HN works on REAL prod data.
// Reads real FW-ED follow-up opd_sessions + their linkedCustomerId be_customers docs,
// runs the ACTUAL production CJS resolvers + buildNotificationContent, prints the body.
// No writes. Usage: node scripts/diag-followup-push-name-hn.mjs
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const require = createRequire(import.meta.url);
const { buildNotificationContent } = require('../functions/notificationContent.js');
const { resolveCustomerName, resolveCustomerHN } = require('../functions/customerDisplay.js');

// load .env.local.prod
const env = {};
for (const line of readFileSync('.env.local.prod', 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const APP_ID = 'loverclinic-opd-4c39b';
const BASE = `artifacts/${APP_ID}/public/data`;

initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
  }),
});
const db = getFirestore();

async function main() {
  const snap = await db.collection(`${BASE}/opd_sessions`)
    .where('formType', '==', 'followup_assessment').limit(8).get();
  console.log(`follow-up opd_sessions found: ${snap.size}\n`);
  if (snap.empty) { console.log('none — try scanning FW-ED- prefix if formType missing on old links'); }

  let ok = 0, missingCust = 0, missingHN = 0;
  for (const d of snap.docs) {
    const session = d.data();
    const sessionId = d.id;
    let customer = null;
    if (session.linkedCustomerId) {
      const c = await db.doc(`${BASE}/be_customers/${session.linkedCustomerId}`).get();
      if (c.exists) customer = c.data();
    }
    const name = resolveCustomerName(customer);
    const hn = resolveCustomerHN(customer);
    const { title, body } = buildNotificationContent({ session, sessionId, customer, changedSections: [] });
    if (!customer) missingCust++;
    if (customer && !hn) missingHN++;
    if (customer && (name || session.confirmInfo?.name)) ok++;
    console.log(`— ${sessionId} (status=${session.status}, updatedAt=${!!session.updatedAt})`);
    console.log(`   linkedCustomerId: ${session.linkedCustomerId || '(none)'}  customerDocFound: ${!!customer}`);
    console.log(`   resolvedName: "${name}"  confirmInfo.name: "${session.confirmInfo?.name || ''}"`);
    console.log(`   resolvedHN: "${hn}"  (fallback→linkedCustomerId if empty)`);
    console.log(`   → title: "${title}"`);
    console.log(`   → body : "${body}"\n`);
  }
  console.log(`SUMMARY: ${ok}/${snap.size} resolved a name · ${missingCust} missing customer doc · ${missingHN} customer-but-no-hn (→ uses LC id)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
