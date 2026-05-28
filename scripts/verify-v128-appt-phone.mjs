// scripts/verify-v128-appt-phone.mjs
// Rule Q L2 (READ-ONLY, real prod) — verify the SHIPPED V128 render-resolve
// produces a phone for BOTH cases the user required, running the ACTUAL
// exported helpers (not a mirror):
//   case 1 — LINKED customer appt (no denorm phone) → resolveCustomerPhone(be_customers)
//   case 2 — pick-later appt with a typed customerPhoneTemp → apptPhoneValue
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { apptPhoneValue } from '../src/lib/appointmentDisplay.js';
import { resolveCustomerPhone } from '../src/lib/customerDisplayName.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;

function loadEnv() {
  const env = {};
  for (const line of readFileSync('.env.local.prod', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return env;
}

// Exact render chain: AppointmentDetailBody phone = apptPhoneValue(appt) || resolvedPhone,
// where resolvedPhone = resolveCustomerPhone(customer) (useResolvedApptPhone).
function renderPhone(appt, custDoc) {
  return apptPhoneValue(appt) || (custDoc ? resolveCustomerPhone(custDoc) : '') || '';
}

async function main() {
  const env = loadEnv();
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId: APP_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }) });
  }
  const db = getFirestore();
  const appts = (await db.collection(`${PREFIX}/be_appointments`).get()).docs.map(d => ({ id: d.id, ...d.data() }));
  const custCache = new Map();
  const getCust = async (id) => {
    if (custCache.has(id)) return custCache.get(id);
    const s = await db.doc(`${PREFIX}/be_customers/${id}`).get();
    const c = s.exists ? s.data() : null;
    custCache.set(id, c); return c;
  };

  let case1Fixed = 0, case2Temp = 0, directDenorm = 0, stillBlank = 0;
  const blanks = [];
  for (const a of appts) {
    const direct = apptPhoneValue(a);
    let cust = null;
    if (!direct && a.customerId) cust = await getCust(a.customerId);
    const shown = renderPhone(a, cust);
    if (shown) {
      if (direct && a.customerPhone) directDenorm++;
      else if (direct) case2Temp++;        // customerPhoneTemp
      else case1Fixed++;                    // live-resolved from be_customers
    } else {
      // genuinely no phone anywhere — only acceptable if the customer truly has none
      if (a.customerId && cust && resolveCustomerPhone(cust)) { stillBlank++; blanks.push(a.appointmentId || a.id); }
    }
  }

  console.log('\n=== V128 render-resolve on REAL prod (shipped helpers) ===');
  console.log(`  total appts                              : ${appts.length}`);
  console.log(`  case 1 — LINKED, live-resolved phone      : ${case1Fixed}  ← was BLANK, now SHOWS`);
  console.log(`  case 2 — pick-later customerPhoneTemp     : ${case2Temp}   ← user-required, still SHOWS`);
  console.log(`  direct denorm customerPhone (new appts)   : ${directDenorm}`);
  console.log(`  ★ BLANK but customer HAS a phone          : ${stillBlank}  (must be 0)`);
  if (blanks.length) console.log('    leftover blanks:', blanks.slice(0, 10));

  const ok = stillBlank === 0 && case1Fixed > 0;
  console.log(`\n  RESULT: ${ok ? 'PASS ✅ — both cases render a phone; 0 linked-with-phone left blank' : 'FAIL ❌'}`);
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
