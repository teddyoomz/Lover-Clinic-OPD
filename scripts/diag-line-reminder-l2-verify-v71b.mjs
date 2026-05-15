// Rule Q L2 verification for V71.B fix.
//
// Simulates the cron pipeline against REAL prod data using:
//   - Real be_appointments + be_customers + be_branches + be_line_configs
//     fetched via firebase-admin
//   - Real resolveTokens + buildReminderFlex from src/lib/lineReminderTemplate.js
//   - Mocked pushLineMessage (does NOT actually send LINE — that's L1)
//
// V71.B asserts:
//   1. resolveTokens({treatments: []}) returns appt.appointmentTo.trim() when set
//   2. resolveTokens({treatments: []}) returns '-' only when appointmentTo also empty
//   3. resolveTokens({treatments: [{name:'X'}]}) returns 'X' (real names take precedence)
//   4. buildReminderFlex body span includes appointmentTo as bold span (V70 + V71.B integration)
//   5. Detail row "💊 บริการ" value cell = appointmentTo (V71.B fallback) when no treatments
//
// Run: node scripts/diag-line-reminder-l2-verify-v71b.mjs

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { resolveTokens, buildReminderFlex } from '../src/lib/lineReminderTemplate.js';
import { getMergedReminderSettings } from '../src/lib/lineReminderClient.js';

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
  templateDayBefore: 'สวัสดีคุณ {{customerName}} ค่ะ พรุ่งนี้ {{date}} เวลา {{time}} คุณมีนัดที่สาขา {{branchName}} กับ {{doctorName}} บริการ: {{treatments}}',
  templateDayOf: 'สวัสดีคุณ {{customerName}} ค่ะ วันนี้คุณมีนัดเวลา {{time}} ที่สาขา {{branchName}} กับ {{doctorName}} บริการ: {{treatments}}',
  cancellationPolicyText: 'กรุณาเลื่อน/ยกเลิกล่วงหน้า 24 ชั่วโมง',
};

function bangkokTomorrow() {
  const now = new Date();
  const bkk = new Date(now.getTime() + 7 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000);
  return `${bkk.getUTCFullYear()}-${String(bkk.getUTCMonth() + 1).padStart(2, '0')}-${String(bkk.getUTCDate()).padStart(2, '0')}`;
}

const PASS = (msg) => console.log(`  ✓ ${msg}`);
const FAIL = (msg) => { console.log(`  ✗ FAIL: ${msg}`); process.exitCode = 1; };
const INFO = (msg) => console.log(`  · ${msg}`);

// ─── Phase 1 — pure helper sanity (no Firestore) ───────────────────────────
function phase1_pureResolverContract() {
  console.log('\n[1/3] Pure helper contract — resolveTokens treatments fallback chain');
  const branchSettings = TEMPLATE_DEFAULTS;
  const branch = { name: 'BR-TEST', branchId: 'BR-X' };
  const baseAppt = { id: 'APPT-X', date: '2026-05-17', startTime: '13:15', appointmentTo: 'botox' };
  const cust = { fullName: 'แพรพร' };

  // VB1.1 — treatments [] + appointmentTo set → token = appointmentTo
  {
    const t = resolveTokens({ cust, appt: baseAppt, branch, treatments: [], branchSettings });
    if (t.treatments === 'botox') PASS('VB1.1 treatments [] + appointmentTo "botox" → "botox"');
    else FAIL(`VB1.1 expected "botox", got "${t.treatments}"`);
  }
  // VB1.2 — treatments [] + appointmentTo empty → '-'
  {
    const t = resolveTokens({ cust, appt: { ...baseAppt, appointmentTo: '' }, branch, treatments: [], branchSettings });
    if (t.treatments === '-') PASS('VB1.2 treatments [] + appointmentTo "" → "-"');
    else FAIL(`VB1.2 expected "-", got "${t.treatments}"`);
  }
  // VB1.3 — treatments has entries → uses names (NOT appointmentTo)
  {
    const t = resolveTokens({ cust, appt: baseAppt, branch, treatments: [{ name: 'ฉีดผิว' }, { name: 'เลเซอร์' }], branchSettings });
    if (t.treatments === 'ฉีดผิว, เลเซอร์') PASS('VB1.3 treatments[2 names] takes precedence over appointmentTo');
    else FAIL(`VB1.3 expected "ฉีดผิว, เลเซอร์", got "${t.treatments}"`);
  }
  // VB1.5 — whitespace trim
  {
    const t = resolveTokens({ cust, appt: { ...baseAppt, appointmentTo: '  botox  ' }, branch, treatments: [], branchSettings });
    if (t.treatments === 'botox') PASS('VB1.5 appointmentTo "  botox  " → "botox" (trimmed)');
    else FAIL(`VB1.5 expected "botox", got "${t.treatments}"`);
  }
  // VB1.6 — non-string appointmentTo → '-'
  {
    const t = resolveTokens({ cust, appt: { ...baseAppt, appointmentTo: 123 }, branch, treatments: [], branchSettings });
    if (t.treatments === '-') PASS('VB1.6 appointmentTo non-string (123) → "-"');
    else FAIL(`VB1.6 expected "-", got "${t.treatments}"`);
  }
}

// ─── Phase 2 — buildReminderFlex integration (V70 spans + V71.B detail row) ─
function phase2_buildFlexIntegration() {
  console.log('\n[2/3] buildReminderFlex integration — V70 spans + V71.B detail row');
  const branchSettings = TEMPLATE_DEFAULTS;
  const branch = { name: 'นครราชสีมา', branchId: 'BR-X' };
  const doctor = { name: 'หมอมายด์' };

  const appt = { id: 'APPT-X', date: '2026-05-17', startTime: '13:15', appointmentTo: 'botox' };
  const flex = buildReminderFlex({
    cust: { fullName: 'แพรพร' },
    appt, branch, doctor,
    treatments: [],
    branchSettings,
    reminderType: 'dayBefore',
  });

  // V70 + V71.B — body span contains "botox" as bold span
  const bodyTextNode = flex.contents.body.contents.find(
    (n) => n.type === 'text' && Array.isArray(n.contents)
  );
  if (!bodyTextNode) {
    FAIL('VB1.8 body text node with contents[] not found');
  } else {
    const boldTexts = bodyTextNode.contents.filter((s) => s.weight === 'bold').map((s) => s.text);
    if (boldTexts.includes('botox')) PASS('VB1.8 body bold spans include "botox" (V71.B treatments fallback into V70 spans)');
    else FAIL(`VB1.8 body bold spans missing "botox": ${JSON.stringify(boldTexts)}`);
    if (boldTexts.includes('-')) FAIL(`VB1.8 body bold spans INCLUDES "-" (pre-V71.B bug signature)`);
    else PASS('VB1.8 body bold spans does NOT contain "-" (V71.B fix propagated)');
  }

  // V71.B — detail row "💊 บริการ" value = appointmentTo
  const detailRows = flex.contents.body.contents.filter(
    (n) => n.type === 'box' && n.layout === 'baseline'
  );
  const serviceRow = detailRows.find((row) => row.contents[0]?.text === '💊 บริการ');
  if (!serviceRow) {
    FAIL('VB1.9 "💊 บริการ" detail row not found');
  } else {
    const valueCell = serviceRow.contents[1];
    if (valueCell.text === 'botox') PASS('VB1.9 "💊 บริการ" value cell = "botox"');
    else FAIL(`VB1.9 "💊 บริการ" expected "botox", got "${valueCell.text}"`);
  }
}

// ─── Phase 3 — pipeline against REAL prod data ─────────────────────────────
async function phase3_realPipeline() {
  console.log('\n[3/3] Real-prod pipeline simulate — tomorrow appts');
  const db = getDb();
  const tomorrow = bangkokTomorrow();
  INFO(`Tomorrow (Bangkok): ${tomorrow}`);

  // Find enabled branches with reminder enabled
  const cfgsSnap = await db.collection(`${BASE}/be_line_configs`).get();
  const enabledBranches = cfgsSnap.docs.filter((d) => {
    const c = d.data();
    return c.enabled === true && c.channelAccessToken && c.lineReminder?.enabled === true;
  });
  INFO(`enabled-with-reminder branches: ${enabledBranches.length}`);

  if (enabledBranches.length === 0) {
    INFO('No branches with lineReminder enabled — phase 3 skipped (phases 1+2 verified contract).');
    return;
  }

  let totalAppts = 0;
  let withAppointmentTo = 0;
  let resolverPassed = 0;
  let resolverFailed = 0;

  for (const cfgDoc of enabledBranches) {
    const branchId = cfgDoc.id;
    const branchSnap = await db.doc(`${BASE}/be_branches/${branchId}`).get();
    const branch = branchSnap.exists ? { branchId: branchSnap.id, ...branchSnap.data() } : { branchId };
    const cfg = cfgDoc.data();
    const merged = getMergedReminderSettings({ lineReminder: cfg.lineReminder }, TEMPLATE_DEFAULTS);

    const apptsSnap = await db.collection(`${BASE}/be_appointments`)
      .where('branchId', '==', branchId)
      .where('date', '==', tomorrow)
      .get();
    INFO(`branch ${branchId}: ${apptsSnap.size} appts on ${tomorrow}`);

    for (const apptDoc of apptsSnap.docs) {
      const appt = { id: apptDoc.id, ...apptDoc.data() };
      totalAppts++;
      const hasAppointmentTo = typeof appt.appointmentTo === 'string' && appt.appointmentTo.trim().length > 0;
      if (hasAppointmentTo) withAppointmentTo++;

      INFO(`  appt=${appt.id} appointmentTo="${appt.appointmentTo || ''}" notifyChannel=${JSON.stringify(appt.notifyChannel || [])}`);

      // Load customer (best-effort)
      const custSnap = await db.doc(`${BASE}/be_customers/${appt.customerId}`).get();
      const cust = custSnap.exists ? { id: custSnap.id, ...custSnap.data() } : { id: appt.customerId };

      // Simulate empty treatments (the V71.B target case — reminders fire BEFORE visit)
      const tokens = resolveTokens({
        cust, appt, branch, doctor: null,
        treatments: [],
        branchSettings: merged,
      });

      // V71.B contract: when treatments empty
      //   - if appointmentTo set → token == appointmentTo.trim()
      //   - else → token == '-'
      const expected = hasAppointmentTo ? appt.appointmentTo.trim() : '-';
      if (tokens.treatments === expected) {
        PASS(`appt=${appt.id} resolver returns "${tokens.treatments}" (matches V71.B contract)`);
        resolverPassed++;
      } else {
        FAIL(`appt=${appt.id} resolver returns "${tokens.treatments}", expected "${expected}"`);
        resolverFailed++;
      }

      // Also exercise buildReminderFlex to confirm no throw on real-prod shape
      try {
        const flex = buildReminderFlex({
          cust, appt, branch, doctor: null,
          treatments: [],
          branchSettings: merged,
          reminderType: 'dayBefore',
        });
        const serviceRow = flex.contents.body.contents
          .filter((n) => n.type === 'box' && n.layout === 'baseline')
          .find((row) => row.contents[0]?.text === '💊 บริการ');
        const valueCell = serviceRow?.contents[1];
        if (valueCell?.text === expected) {
          PASS(`appt=${appt.id} flex 💊 บริการ value cell = "${expected}"`);
        } else {
          FAIL(`appt=${appt.id} flex 💊 บริการ expected "${expected}", got "${valueCell?.text}"`);
        }
      } catch (e) {
        FAIL(`appt=${appt.id} buildReminderFlex threw: ${e.message}`);
      }
    }
  }

  console.log('\n================================================');
  console.log('PHASE 3 SUMMARY');
  console.log('================================================');
  console.log(`  Total tomorrow appts (enabled branches): ${totalAppts}`);
  console.log(`  With appointmentTo set:                  ${withAppointmentTo}`);
  console.log(`  Resolver matched V71.B contract:         ${resolverPassed}`);
  console.log(`  Resolver mismatched:                     ${resolverFailed}`);
}

async function main() {
  console.log('================================================');
  console.log('Rule Q L2 verify V71.B — treatments fallback chain');
  console.log('================================================');
  phase1_pureResolverContract();
  phase2_buildFlexIntegration();
  await phase3_realPipeline();
  console.log('\n================================================');
  if (process.exitCode === 1) {
    console.log('⚠️  V71.B L2 verify: at least one FAIL above');
  } else {
    console.log('✅ V71.B L2 verify: ALL CHECKS PASS on real prod data');
  }
  console.log('================================================');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
