// api/cron/money-reconciliation-sweep.js
//
// Nightly money reconciliation (2026-07-07) — V155/V157 residual closed.
// Scans YESTERDAY's sales (all branches) and verifies every money/course
// side-effect actually landed (deposit usageHistory / wallet net / points net /
// courses[].linkedSaleId / stock movements), via the SAME pure checker the
// Backend reports tab uses (src/lib/reconcileSaleCore.js — SSOT, no drift).
//
// READ-ONLY scan; the ONLY write is a summary doc at a DETERMINISTIC id
// be_admin_audit/recon-daily-YYYYMMDD (idempotent — re-run overwrites the same
// day's doc). The ReconciliationReportTab reads that doc by id (no composite
// index) and shows an amber banner when discrepancyCount > 0.
//
// Cron-only (CRON_SECRET-gated) · admin SDK · mirrors chat-history-retention-
// sweep.js skeleton. `?date=YYYY-MM-DD` overrides the scanned day (testing).

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { reconcileSales, summarizeResults } from '../../src/lib/reconcileSaleCore.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;

function initAdmin() {
  if (getApps().length) return;
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

// Yesterday in Asia/Bangkok as YYYY-MM-DD (sales carry saleDate as a Thai-day
// ISO string per thaiTodayISO — string equality is the exact query the UI uses).
function bangkokYesterdayISO(now = Date.now()) {
  const bkk = new Date(now + 7 * 60 * 60 * 1000); // shift to UTC+7, read as UTC
  bkk.setUTCDate(bkk.getUTCDate() - 1);
  return bkk.toISOString().slice(0, 10);
}

// Admin-SDK evidence fetchers — field-for-field twin of the client tab's
// CLIENT_FETCHERS (see ReconciliationReportTab.jsx).
function buildAdminFetchers(db) {
  return {
    getCustomer: async (cid) => {
      if (!cid) return null;
      const snap = await db.doc(`${PREFIX}/be_customers/${cid}`).get();
      return snap.exists ? snap.data() : null;
    },
    getDepositsByCustomer: async (cid) => {
      if (!cid) return [];
      const snap = await db.collection(`${PREFIX}/be_deposits`).where('customerId', '==', String(cid)).get();
      return snap.docs.map(d => ({ ...d.data(), id: d.id }));
    },
    getWalletTxByCustomer: async (cid) => {
      if (!cid) return [];
      const snap = await db.collection(`${PREFIX}/be_wallet_transactions`).where('customerId', '==', String(cid)).get();
      return snap.docs.map(d => d.data());
    },
    getPointTxByCustomer: async (cid) => {
      if (!cid) return [];
      const snap = await db.collection(`${PREFIX}/be_point_transactions`).where('customerId', '==', String(cid)).get();
      return snap.docs.map(d => d.data());
    },
    countSaleStockMovements: async (saleId) => {
      if (!saleId) return 0;
      const snap = await db.collection(`${PREFIX}/be_stock_movements`).where('linkedSaleId', '==', String(saleId)).get();
      // parity with listStockMovements includeReversed:false
      return snap.docs.filter(d => !d.data().reversedByMovementId).length;
    },
  };
}

// Shared sweep — exported for scripts/diag L2 verification (Rule of 3).
export async function sweepMoneyReconciliation({ db, dateISO }) {
  const salesSnap = await db.collection(`${PREFIX}/be_sales`).where('saleDate', '==', dateISO).get();
  const sales = salesSnap.docs.map(d => ({ ...d.data(), id: d.id }));
  const results = await reconcileSales(sales, buildAdminFetchers(db));
  const summary = summarizeResults(results);
  return { dateISO, sales: sales.length, summary, results };
}

export default async function handler(req, res) {
  const auth = req.headers?.authorization || '';
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    initAdmin();
    const db = getFirestore();
    const dateISO = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query?.date || ''))
      ? String(req.query.date)
      : bangkokYesterdayISO();

    const { summary } = await sweepMoneyReconciliation({ db, dateISO });

    // Deterministic doc id → idempotent (re-runs overwrite the same day).
    const docId = `recon-daily-${dateISO.replace(/-/g, '')}`;
    await db.doc(`${PREFIX}/be_admin_audit/${docId}`).set({
      type: 'recon-daily',
      dateISO,
      checked: summary.checked,
      ok: summary.ok,
      discrepancyCount: summary.discrepancyCount,
      cancelledChecked: summary.cancelledChecked,
      offendingSales: summary.offendingSales, // [{saleId, invoiceNo, customerId, discrepancies[]}]
      performedAt: new Date().toISOString(),
    });

    return res.status(200).json({ ok: true, dateISO, docId, ...summary });
  } catch (e) {
    console.error('[money-reconciliation-sweep] failed:', e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
