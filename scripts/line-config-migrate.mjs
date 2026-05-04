// ─── LINE Config Migration — Phase BS V3 (2026-05-04) ───────────────────
// User directive 2026-05-04: "ตั้งค่า line OA กับ คำของผูก Line ก็แยกข้อมูล
//   กันนะ ใช้คนละ line กัน".
//
// What this script does:
//   - Reads existing single-config at clinic_settings/chat_config.line
//   - Writes copy to be_line_configs/{NAKHON_ID} (default branch)
//   - Calls LINE /v2/bot/info using the stored channelAccessToken
//     to populate `destination` (the bot's userId) — required for
//     webhook routing (event.destination → branchId resolution).
//   - Writes audit doc be_admin_audit/line-config-migrate-<ts>
//   - DOES NOT delete clinic_settings/chat_config.line (kept as fallback
//     during transition; all admin endpoints + webhook still degrade
//     gracefully to it).
//
// Usage:
//   node scripts/line-config-migrate.mjs
//
// Pre-flight:
//   - .env.local.prod must contain FIREBASE_ADMIN_CLIENT_EMAIL +
//     FIREBASE_ADMIN_PRIVATE_KEY (same env Phase BS scripts use)

import { readFileSync, existsSync } from 'fs';
const envFile = existsSync('.env.local.prod') ? '.env.local.prod' : '.env.local';
const envText = readFileSync(envFile, 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let val = m[2];
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  process.env[m[1]] = val;
}

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const NAKHON_ID = 'BR-1777873556815-26df6480'; // นครราชสีมา (default branch)

const app = initializeApp({
  credential: cert({
    projectId: APP_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});
const db = getFirestore(app);
const data = db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

async function fetchBotInfo(channelAccessToken) {
  if (!channelAccessToken) return null;
  try {
    const res = await fetch('https://api.line.me/v2/bot/info', {
      headers: { Authorization: `Bearer ${channelAccessToken}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('  /v2/bot/info call failed:', err.message);
    return null;
  }
}

async function main() {
  const ts = new Date().toISOString();
  console.log(`=== LINE Config Migration — Phase BS V3 ===`);
  console.log(`Source:  clinic_settings/chat_config.line`);
  console.log(`Target:  be_line_configs/${NAKHON_ID}  (นครราชสีมา)`);
  console.log(`Time:    ${ts}`);
  console.log('');

  const summary = { source: null, copied: null, destination: null };

  // 1) Read source
  const chatCfgRef = data.collection('clinic_settings').doc('chat_config');
  const chatCfgSnap = await chatCfgRef.get();
  if (!chatCfgSnap.exists) {
    console.log('No clinic_settings/chat_config doc — nothing to migrate.');
    summary.source = 'missing';
    process.exit(0);
  }
  const chatData = chatCfgSnap.data() || {};
  const line = chatData.line || null;
  if (!line || !line.channelAccessToken) {
    console.log('clinic_settings/chat_config.line missing or has no channelAccessToken — nothing to migrate.');
    summary.source = 'empty';
    process.exit(0);
  }
  summary.source = 'present';
  console.log('  Source has line.channelAccessToken: YES');
  console.log(`  Source enabled: ${line.enabled === true}`);
  console.log(`  Source botBasicId: ${line.botBasicId || '(empty)'}`);
  console.log('');

  // 2) Probe LINE bot info to populate `destination`
  const botInfo = await fetchBotInfo(line.channelAccessToken);
  const destination = botInfo?.userId || '';
  summary.destination = destination || null;
  if (destination) {
    console.log(`  /v2/bot/info userId: ${destination}`);
    console.log(`  /v2/bot/info displayName: ${botInfo.displayName || '(empty)'}`);
  } else {
    console.log('  /v2/bot/info call did not return userId; webhook routing will fall back to legacy chat_config until destination is populated via test-connection.');
  }
  console.log('');

  // 3) Compose target shape (mirror lineConfigClient.normalizeLineConfigForWrite)
  const target = {
    branchId: NAKHON_ID,
    channelId: String(line.channelId || '').trim(),
    channelSecret: String(line.channelSecret || '').trim(),
    channelAccessToken: String(line.channelAccessToken || '').trim(),
    botBasicId: String(line.botBasicId || '').trim(),
    destination,
    enabled: !!line.enabled,
    botEnabled: line.botEnabled === undefined ? true : !!line.botEnabled,
    coursesKeywords: Array.isArray(line.coursesKeywords) && line.coursesKeywords.length
      ? line.coursesKeywords.map((s) => String(s).trim()).filter(Boolean)
      : ['คอร์ส', 'courses', 'course', 'เหลือ', 'remaining'],
    appointmentsKeywords: Array.isArray(line.appointmentsKeywords) && line.appointmentsKeywords.length
      ? line.appointmentsKeywords.map((s) => String(s).trim()).filter(Boolean)
      : ['นัด', 'appointment', 'appt', 'วันนัด'],
    maxCoursesInReply: Math.max(1, Math.min(100, Number(line.maxCoursesInReply) || 20)),
    maxAppointmentsInReply: Math.max(1, Math.min(100, Number(line.maxAppointmentsInReply) || 10)),
    helpMessage: String(line.helpMessage || ''),
    welcomeMessage: String(line.welcomeMessage || ''),
    notLinkedMessage: String(line.notLinkedMessage || ''),
    tokenTtlMinutes: Math.max(1, Math.min(60 * 24 * 7, Number(line.tokenTtlMinutes) || 1440)),
    alreadyLinkedRule: ['block', 'replace'].includes(line.alreadyLinkedRule) ? line.alreadyLinkedRule : 'block',
    updatedAt: ts,
    _migratedAt: ts,
    _migratedBy: 'admin-script-2026-05-04-phase-bs-v3',
    _migratedFrom: 'clinic_settings/chat_config.line',
  };

  // 4) Write target (idempotent merge)
  const targetRef = data.collection('be_line_configs').doc(NAKHON_ID);
  await targetRef.set(target, { merge: true });
  console.log(`  Wrote be_line_configs/${NAKHON_ID}: OK`);
  summary.copied = NAKHON_ID;

  // Verify
  const verifySnap = await targetRef.get();
  const v = verifySnap.data() || {};
  const ok = !!(v.channelAccessToken && v.channelSecret && v.branchId === NAKHON_ID);
  console.log(`  Verify: branchId=${v.branchId}  hasToken=${!!v.channelAccessToken}  hasSecret=${!!v.channelSecret}  destination=${v.destination || '(empty)'}  enabled=${v.enabled}`);
  console.log('');

  // 5) Audit doc
  const auditId = `line-config-migrate-${Date.now()}`;
  await data.collection('be_admin_audit').doc(auditId).set({
    type: 'line-config-migrate',
    sourcePath: 'clinic_settings/chat_config.line',
    targetCollection: 'be_line_configs',
    targetBranchId: NAKHON_ID,
    destination: destination || null,
    enabled: target.enabled,
    summary,
    callerEmail: 'admin-script-2026-05-04',
    callerUid: 'admin-script',
    createdAt: ts,
  });
  console.log(`  Audit: be_admin_audit/${auditId}`);
  console.log('');

  console.log(`=== Done. ok=${ok} ===`);
  if (!ok) {
    console.error('WARNING: post-write verify did not satisfy minimum invariants.');
    process.exit(2);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
