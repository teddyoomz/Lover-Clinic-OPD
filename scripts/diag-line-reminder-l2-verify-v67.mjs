// Rule Q L2 verification for V67 fix.
//
// Simulates the cron pipeline against REAL prod data using:
//   - Real be_appointments + be_customers + be_branches + be_line_configs
//     fetched via firebase-admin
//   - Real getCustomerLineUserIdAtBranch helper from src/lib/lineReminderClient.js
//   - Real buildReminderFlex from src/lib/lineReminderTemplate.js
//   - Mocked pushLineMessage that returns {statusCode: 200} (so we don't
//     actually send a LINE message — that's user's L1 step)
//
// Asserts:
//   1. Cron query (where('date', '==', target)) finds tomorrow's appointment
//   2. notifyChannel filter includes the appointment
//   3. Customer doc loads correctly via appt.customerId
//   4. lineUserId resolves via legacy V32-tris-ter backward-compat path
//   5. Flex message builds without errors
//   6. customerName/branchName tokens render correctly (V67 Bug C/D fix)
//
// Run: node scripts/diag-line-reminder-l2-verify-v67.mjs

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { getCustomerLineUserIdAtBranch, getMergedReminderSettings } from '../src/lib/lineReminderClient.js';
import { buildReminderFlex } from '../src/lib/lineReminderTemplate.js';

const envText = readFileSync('.env.local.prod', 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2$/);
  if (m) process.env[m[1]] = m[3];
}

const APP_ID = 'loverclinic-opd-4c39b';
const BASE = `artifacts/${APP_ID}/public/data`;

function getDb() {
  if (getApps().length === 0) {
    const key = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
    initializeApp({
      credential: cert({
        projectId: APP_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: key,
      }),
    });
  }
  return getFirestore();
}

const TEMPLATE_DEFAULTS = {
  templateDayBefore: 'สวัสดีคุณ {{customerName}} ค่ะ พรุ่งนี้ {{date}} เวลา {{time}} คุณมีนัดที่สาขา {{branchName}} กับ {{doctorName}}\nบริการ: {{treatments}}\n\n{{cancellationPolicyText}}',
  templateDayOf: 'สวัสดีคุณ {{customerName}} ค่ะ วันนี้คุณมีนัดเวลา {{time}} ที่สาขา {{branchName}} กับ {{doctorName}}\nบริการ: {{treatments}}',
  cancellationPolicyText: 'กรุณาเลื่อน/ยกเลิกล่วงหน้า 24 ชั่วโมง',
};

function bangkokToday() {
  const now = new Date();
  const bkk = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return `${bkk.getUTCFullYear()}-${String(bkk.getUTCMonth() + 1).padStart(2, '0')}-${String(bkk.getUTCDate()).padStart(2, '0')}`;
}
function bangkokTomorrow() {
  const now = new Date();
  const bkk = new Date(now.getTime() + 7 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000);
  return `${bkk.getUTCFullYear()}-${String(bkk.getUTCMonth() + 1).padStart(2, '0')}-${String(bkk.getUTCDate()).padStart(2, '0')}`;
}

const PASS = (msg) => console.log(`  ✓ ${msg}`);
const FAIL = (msg) => { console.log(`  ✗ FAIL: ${msg}`); process.exitCode = 1; };
const INFO = (msg) => console.log(`  · ${msg}`);

async function main() {
  const db = getDb();
  const tomorrow = bangkokTomorrow();
  const today = bangkokToday();
  console.log('================================================');
  console.log(`Rule Q L2 verify V67 — pipeline ↔ real prod`);
  console.log(`Today (Bangkok): ${today}, Tomorrow: ${tomorrow}`);
  console.log('================================================');

  // ─── 1. Query tomorrow's appointments per branch (V67 Bug A — `date` field) ──
  console.log('\n[1/6] Cron query: where(branchId) + where(date == tomorrow)');
  const cfgsSnap = await db.collection(`${BASE}/be_line_configs`).get();
  const enabledBranches = cfgsSnap.docs.filter(d => {
    const c = d.data();
    return c.enabled === true && c.channelAccessToken && c.lineReminder?.enabled === true;
  });
  INFO(`enabled-with-reminder branches: ${enabledBranches.length}`);
  if (enabledBranches.length === 0) {
    FAIL('No branches have lineReminder.enabled=true — cron would no-op. User must toggle ON in line-settings tab.');
    return;
  }

  let totalCandidates = 0;
  const candidatesByBranch = new Map();
  for (const cfgDoc of enabledBranches) {
    const branchId = cfgDoc.id;
    // V67-canonical query
    const apptsSnap = await db.collection(`${BASE}/be_appointments`)
      .where('branchId', '==', branchId)
      .where('date', '==', tomorrow)
      .get();
    INFO(`branch ${branchId}: ${apptsSnap.size} appts on date=${tomorrow}`);
    candidatesByBranch.set(branchId, apptsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    totalCandidates += apptsSnap.size;
  }
  if (totalCandidates === 0) {
    FAIL('Query returns 0 appointments tomorrow. Either no appt for tomorrow OR field name still wrong.');
    return;
  }
  PASS(`Query found ${totalCandidates} candidates across enabled branches`);

  // ─── 2. notifyChannel filter ──────────────────────────────────────────────
  console.log('\n[2/6] Filter: notifyChannel includes "line"');
  let lineCandidates = 0;
  for (const [branchId, appts] of candidatesByBranch) {
    for (const a of appts) {
      if (Array.isArray(a.notifyChannel) && a.notifyChannel.includes('line')) {
        lineCandidates++;
        INFO(`branch=${branchId} appt=${a.id} customerId=${a.customerId} notifyChannel=${JSON.stringify(a.notifyChannel)} customerHN=${a.customerHN || '(unset)'}`);
      }
    }
  }
  if (lineCandidates === 0) {
    FAIL('Zero appts have notifyChannel=["line"]. Fix appointment notify-channel selection.');
    return;
  }
  PASS(`${lineCandidates} appt(s) opted into LINE channel`);

  // ─── 3-6: For each line-eligible appt, run pipeline simulation ────────────
  let simulatedSent = 0, simulatedSkipped = 0, simulatedFailed = 0;
  for (const [branchId, appts] of candidatesByBranch) {
    const branchSnap = await db.doc(`${BASE}/be_branches/${branchId}`).get();
    const branch = branchSnap.exists ? { branchId: branchSnap.id, ...branchSnap.data() } : { branchId };
    const cfg = enabledBranches.find(d => d.id === branchId).data();
    const merged = getMergedReminderSettings({ lineReminder: cfg.lineReminder }, TEMPLATE_DEFAULTS);

    for (const appt of appts) {
      if (!Array.isArray(appt.notifyChannel) || !appt.notifyChannel.includes('line')) continue;
      console.log(`\n[3-6/6] Pipeline simulate appt=${appt.id} branch=${branchId}`);

      // [3] Customer load
      const custSnap = await db.doc(`${BASE}/be_customers/${appt.customerId}`).get();
      if (!custSnap.exists) {
        FAIL(`Customer ${appt.customerId} not found at be_customers/${appt.customerId}`);
        simulatedSkipped++;
        continue;
      }
      const cust = { id: custSnap.id, ...custSnap.data() };
      PASS(`[3/6] Customer doc loaded — id=${cust.id} branchId=${cust.branchId}`);

      // [4] lineUserId resolution (V32-tris-ter backward-compat path)
      const lineUserId = getCustomerLineUserIdAtBranch(cust, appt.branchId);
      if (!lineUserId) {
        FAIL(`getCustomerLineUserIdAtBranch returned null. cust.branchId="${cust.branchId}" vs appt.branchId="${appt.branchId}". Legacy customer.lineUserId="${cust.lineUserId || '(unset)'}".`);
        simulatedSkipped++;
        continue;
      }
      PASS(`[4/6] lineUserId resolved: ${lineUserId.slice(0, 12)}... (via ${cust.lineUserId_byBranch?.[appt.branchId] ? 'lineUserId_byBranch' : 'legacy V32-tris-ter'})`);

      // [5] notifyOptOut check
      if (cust.notifyOptOut === true) {
        INFO(`[5/6] Customer opted out — skipped (notifyOptOut=true)`);
        simulatedSkipped++;
        continue;
      }
      PASS(`[5/6] Customer not opted out`);

      // [6] Build flex (V67 Bug A — appt.date / Bug C — branch.name / Bug D — customerName chain)
      let flex;
      try {
        flex = buildReminderFlex({
          cust, appt, branch, doctor: null,
          treatments: appt.treatments || [],
          branchSettings: merged,
          reminderType: 'dayBefore',
        });
      } catch (e) {
        FAIL(`buildReminderFlex threw: ${e.message}`);
        simulatedFailed++;
        continue;
      }
      // Walk the flex to find body text — verify V67 fixes propagated
      const bodyText = flex?.contents?.body?.contents?.find(c => c.type === 'text')?.text || '';
      const detailRows = flex?.contents?.body?.contents?.filter(c => c.type === 'box') || [];
      const branchRow = detailRows.find(b => b.contents?.[0]?.text?.includes('สาขา'));
      const branchValue = branchRow?.contents?.[1]?.text;
      const dateRow = detailRows.find(b => b.contents?.[0]?.text?.includes('วันที่'));
      const dateValue = dateRow?.contents?.[1]?.text;

      INFO(`Body text preview: ${bodyText.slice(0, 80)}...`);
      INFO(`Branch token rendered: "${branchValue}" (expected: "${branch.name}")`);
      INFO(`Date token rendered: "${dateValue}"`);

      if (branchValue && !branchValue.includes('undefined') && branchValue.length > 0) {
        PASS(`[6/6 Bug C] {{branchName}} renders branch.name correctly`);
      } else {
        FAIL(`[6/6 Bug C] {{branchName}} renders empty/undefined (V67 Bug C fix did not propagate)`);
      }
      if (dateValue && /\d{2}\/\d{2}\/\d{4}/.test(dateValue)) {
        PASS(`[6/6 Bug A] {{date}} renders Thai dd/mm/yyyy from appt.date`);
      } else {
        FAIL(`[6/6 Bug A] {{date}} doesn't render dd/mm/yyyy — got "${dateValue}" (V67 Bug A fix did not propagate)`);
      }
      if (bodyText && !bodyText.includes('{{customerName}}') && !bodyText.includes('undefined')) {
        PASS(`[6/6 Bug D] {{customerName}} substituted (no {{token}} leak in body)`);
      } else {
        FAIL(`[6/6 Bug D] {{customerName}} not substituted: "${bodyText.slice(0, 100)}"`);
      }
      simulatedSent++;
    }
  }

  console.log('\n================================================');
  console.log('SUMMARY (simulated — pushFn was NOT called)');
  console.log('================================================');
  console.log(`  Would-send: ${simulatedSent}`);
  console.log(`  Skipped:    ${simulatedSkipped}`);
  console.log(`  Failed:     ${simulatedFailed}`);
  console.log('');
  if (simulatedSent > 0 && process.exitCode !== 1) {
    console.log('✅ V67 fix verified at L2 — pipeline reaches push step with valid flex on real prod data');
  } else {
    console.log('⚠️  V67 verify did not reach push step — see ✗ messages above');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
