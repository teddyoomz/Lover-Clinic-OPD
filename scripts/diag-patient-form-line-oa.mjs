// Rule R diag (READ-ONLY) — why the patient-form success screen shows NO "Add
// LINE OA" button. PatientForm gates the card on cs.lineOfficialUrl (global
// clinic_settings/main, App.jsx:216). The user expects the SESSION's BRANCH's
// LINE OA. This reports: the session's branchId, what LINE fields clinic_settings
// (global + per-branch) actually hold, and the per-branch be_line_configs
// (botBasicId) — so we know WHERE the LINE OA URL is (or should be sourced).
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function loadEnv() {
  const text = readFileSync('.env.local.prod', 'utf8');
  const env = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_0-9]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const SESSION_ID = process.argv[2] || 'BL-1779800803794-1493028b';

async function main() {
  const env = loadEnv();
  const key = env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n');
  initializeApp({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b', clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: key }) });
  const db = getFirestore();
  const APP_ID = 'loverclinic-opd-4c39b';
  const P = `artifacts/${APP_ID}/public/data`;

  // 1) the session
  const sess = await db.doc(`${P}/opd_sessions/${SESSION_ID}`).get();
  console.log('=== session', SESSION_ID, '===');
  if (!sess.exists) { console.log('  ❌ NOT FOUND'); }
  else {
    const s = sess.data();
    console.log('  branchId       =', s.branchId);
    console.log('  formType       =', s.formType, '· status =', s.status, '· isPermanent =', s.isPermanent);
    console.log('  createdFromBackendBooking =', s.createdFromBackendBooking, '· isHiddenFromQueue =', s.isHiddenFromQueue);
  }
  const branchId = sess.exists ? sess.data().branchId : null;

  // 2) global clinic_settings/main — which LINE field(s)?
  const main = await db.doc(`${P}/clinic_settings/main`).get();
  console.log('\n=== clinic_settings/main (GLOBAL — what PatientForm reads) ===');
  if (main.exists) {
    const m = main.data();
    console.log('  lineOfficialUrl =', JSON.stringify(m.lineOfficialUrl), '  ← PatientForm reads THIS (cs.lineOfficialUrl)');
    console.log('  lineOaUrl       =', JSON.stringify(m.lineOaUrl), '  ← ClinicSettingsPanel comment says this name');
    console.log('  clinicPhone     =', JSON.stringify(m.clinicPhone));
  } else console.log('  (no main doc)');

  // 3) per-branch clinic_settings/{branchId}
  if (branchId) {
    const bset = await db.doc(`${P}/clinic_settings/${branchId}`).get();
    console.log(`\n=== clinic_settings/${branchId} (per-branch settings, if any) ===`);
    if (bset.exists) {
      const b = bset.data();
      console.log('  lineOfficialUrl =', JSON.stringify(b.lineOfficialUrl));
      console.log('  lineOaUrl       =', JSON.stringify(b.lineOaUrl));
      console.log('  settings.lineOaUrl =', JSON.stringify(b.settings?.lineOaUrl));
    } else console.log('  (no per-branch settings doc)');
  }

  // 4) be_line_configs (per-branch LINE — botBasicId)
  const lc = await db.collection(`${P}/be_line_configs`).get();
  console.log('\n=== be_line_configs (per-branch LINE — V75) ===');
  if (lc.empty) console.log('  (none)');
  lc.forEach(d => {
    const c = d.data();
    console.log(`  [${d.id}] botBasicId=${JSON.stringify(c.botBasicId)} enabled=${c.enabled} branchId=${c.branchId || d.id}`);
    // any url-ish field?
    Object.keys(c).filter(k => /url|line|oa|friend|qr/i.test(k)).forEach(k => console.log(`     ${k} = ${JSON.stringify(c[k])}`));
  });

  // 5) branch names
  const br = await db.collection(`${P}/be_branches`).get();
  console.log('\n=== be_branches ===');
  br.forEach(d => { const x = d.data(); console.log(`  [${d.id}] ${x.name}${d.id === branchId ? '  ← session branch' : ''}\n     settings.lineOaUrl = ${JSON.stringify(x.settings?.lineOaUrl)}  ·  lineOaUrl=${JSON.stringify(x.lineOaUrl)}  ·  lineOfficialUrl=${JSON.stringify(x.lineOfficialUrl)}`); });

  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
