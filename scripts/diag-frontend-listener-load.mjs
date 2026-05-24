#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local.prod');
const content = readFileSync(envPath, 'utf8');
const env = {};
for (const line of content.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
  if (m) env[m[1]] = m[2];
}
const privateKey = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b',
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey,
  }),
});
const db = getFirestore();
const APP_ID = 'loverclinic-opd-4c39b';
const BASE = `artifacts/${APP_ID}/public/data`;

console.log('\n=== AdminDashboard Frontend listener load ===\n');

// Each of these is subscribed via onSnapshot in AdminDashboard on mount
const collections = [
  'opd_sessions',        // line 2249 listener (ALL docs, no filter)
  'chat_conversations',  // ChatPanel
  'chat_history',        // ChatPanel
  'form_templates',      // line 2243 listener
  'be_appointments',     // listenToAppointmentsByMonth
  'be_recalls',          // RecallFrontendView listener
  'clinic_settings',     // line 1099 settings listener
  'be_staff_chat_messages', // staff chat
  'be_chart_edit_sessions',  // tablet chart
  'be_chart_tablet_presence',
  'be_chart_templates',
];

const results = await Promise.all(collections.map(async (c) => {
  const t = Date.now();
  try {
    const snap = await db.collection(`${BASE}/${c}`).count().get();
    return { c, count: snap.data().count, ms: Date.now() - t };
  } catch (e) {
    return { c, error: e.message };
  }
}));

for (const r of results) {
  if (r.error) {
    console.log(`  ${r.c.padEnd(30)} ERROR: ${r.error}`);
  } else {
    const flag = r.count > 1000 ? '🔥 LARGE' : r.count > 200 ? '⚠ ' : '  ';
    console.log(`  ${flag} ${r.c.padEnd(28)} ${String(r.count).padStart(7)} docs  (${r.ms}ms)`);
  }
}

// Estimate total bytes processed per snapshot fire (rough)
console.log('\n=== Bytes-on-wire estimate ===\n');
for (const r of results) {
  if (!r.error && r.count > 0) {
    // Avg doc ~1-3KB; estimate 2KB avg
    const estBytes = r.count * 2048;
    const mb = (estBytes / 1024 / 1024).toFixed(2);
    if (r.count > 200) {
      console.log(`  ${r.c.padEnd(30)} ~${mb} MB per full snapshot`);
    }
  }
}

console.log('');

// Check if opd_sessions has growing archived backlog (cleanup hasn't removed)
console.log('=== opd_sessions breakdown ===\n');
const opdSnap = await db.collection(`${BASE}/opd_sessions`).get();
const stats = { archived: 0, active: 0, hiddenFromQueue: 0, permanent: 0, hasPatientData: 0, withCreatedAt: 0, oldArchived30d: 0 };
const now = Date.now();
const D30 = 30 * 24 * 3600 * 1000;
for (const d of opdSnap.docs) {
  const data = d.data();
  if (data.isArchived) stats.archived++; else stats.active++;
  if (data.isHiddenFromQueue) stats.hiddenFromQueue++;
  if (data.isPermanent) stats.permanent++;
  if (data.patientData) stats.hasPatientData++;
  if (data.createdAt) stats.withCreatedAt++;
  if (data.isArchived && data.archivedAt?.toMillis?.() && (now - data.archivedAt.toMillis()) > D30) stats.oldArchived30d++;
}
console.log(`  Total: ${opdSnap.size}`);
console.log(`  Active (not archived): ${stats.active}`);
console.log(`  Archived: ${stats.archived}`);
console.log(`  Hidden from queue: ${stats.hiddenFromQueue}`);
console.log(`  Permanent: ${stats.permanent}`);
console.log(`  Has patientData: ${stats.hasPatientData}`);
console.log(`  Old archived >30d: ${stats.oldArchived30d}`);
console.log('');
