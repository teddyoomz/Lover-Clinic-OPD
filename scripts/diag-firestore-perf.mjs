#!/usr/bin/env node
/**
 * Time Firestore operations from admin SDK to baseline performance.
 * If admin SDK is fast but client SDK is slow → not Firestore service problem.
 */
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

const test = async (label, fn) => {
  const t = Date.now();
  try {
    const r = await fn();
    console.log(`  ${label.padEnd(45)} ${(Date.now() - t).toString().padStart(5)}ms  size=${r}`);
  } catch (e) {
    console.log(`  ${label.padEnd(45)} ERROR: ${e.message}`);
  }
};

console.log('\n=== Firestore admin SDK perf baseline ===\n');

// Mimic AppointmentHubView loadAll queries
await test('getAllCustomers (full collection)', async () => {
  const snap = await db.collection(`${BASE}/be_customers`).get();
  return snap.size;
});
await test('getAllDeposits (branch-scoped, NAKHON)', async () => {
  const snap = await db.collection(`${BASE}/be_deposits`).where('branchId', '==', 'BR-1777873556815-26df6480').get();
  return snap.size;
});
await test('getAllSales (branch-scoped, NAKHON)', async () => {
  const snap = await db.collection(`${BASE}/be_sales`).where('branchId', '==', 'BR-1777873556815-26df6480').get();
  return snap.size;
});
await test('getAllMemberships', async () => {
  const snap = await db.collection(`${BASE}/be_memberships`).get();
  return snap.size;
});
await test('listStaffSchedules (NAKHON)', async () => {
  const snap = await db.collection(`${BASE}/be_staff_schedules`).where('branchId', '==', 'BR-1777873556815-26df6480').get();
  return snap.size;
});
await test('getAppointmentsByDateRange (60d, NAKHON)', async () => {
  const snap = await db.collection(`${BASE}/be_appointments`).where('branchId', '==', 'BR-1777873556815-26df6480').get();
  return snap.size;
});
await test('loadTreatmentsByDateRange (60d, allBranches)', async () => {
  const snap = await db.collection(`${BASE}/be_treatments`).get();
  return snap.size;
});

console.log('');

// All in parallel (mimic Promise.all)
console.log('=== Parallel Promise.all (mimic loadAll) ===\n');
const t0 = Date.now();
await Promise.all([
  db.collection(`${BASE}/be_customers`).get(),
  db.collection(`${BASE}/be_appointments`).where('branchId', '==', 'BR-1777873556815-26df6480').get(),
  db.collection(`${BASE}/be_deposits`).where('branchId', '==', 'BR-1777873556815-26df6480').get(),
  db.collection(`${BASE}/be_sales`).where('branchId', '==', 'BR-1777873556815-26df6480').get(),
  db.collection(`${BASE}/be_memberships`).get(),
  db.collection(`${BASE}/be_staff_schedules`).where('branchId', '==', 'BR-1777873556815-26df6480').get(),
  db.collection(`${BASE}/be_treatments`).get(),
]);
console.log(`  All 7 queries (parallel admin SDK): ${Date.now() - t0}ms`);
console.log('');
