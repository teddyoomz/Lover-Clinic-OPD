// ─── /api/admin/customer-branch-baseline — Phase BS (2026-05-06) ────────
//
// One-shot migration endpoint: backfill `branchId` on every legacy
// be_customers doc that lacks it. Required after Phase BS ships so that
// the new soft-gate (CustomerDetailView "สาขาที่สร้างรายการ" tag +
// downstream branch-aware reports) has a complete dataset to display.
//
// Usage:
//   POST {action:'list'} → DRY-RUN. Returns
//     { untagged: [{customerId, hn, name, branchId, _displayName}], total }
//     for every be_customers doc whose `branchId` field is missing or empty.
//   POST {action:'apply', targetBranchId, confirmCustomerIds[]}
//     → validates targetBranchId exists in be_branches, then writeBatch
//       updates each confirmed customer doc with `branchId: targetBranchId`.
//       Each batch ≤ 500 ops; multi-batch when input exceeds.
//       Writes audit doc to be_admin_audit/customer-branch-baseline-{ts}.
//
// Security:
//   - verifyAdminToken (admin: true claim required, mirrors V25/V26
//     cleanup-orphan-stock pattern).
//   - Two-phase: list first, apply only confirmed IDs (no surprise mass
//     mutation; admin reviews the dry-run before approving).
//
// Pure helper exported for tests:
//   - findUntaggedCustomers(customers) — splits the customer list into
//     untagged + tagged. Empty/missing branchId field counts as untagged.

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyAdminToken } from './_lib/adminAuth.js';

const APP_ID = 'loverclinic-opd-4c39b';

let cachedDb = null;
function getAdminFirestore() {
  if (cachedDb) return cachedDb;
  let app;
  if (getApps().length > 0) {
    app = getApp();
  } else {
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    if (!clientEmail || !rawKey) {
      throw new Error('firebase-admin not configured');
    }
    app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
        clientEmail,
        privateKey: rawKey.replace(/\\n/g, '\n'),
      }),
    });
  }
  cachedDb = getFirestore(app);
  return cachedDb;
}

function dataPath(db) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
}

/**
 * Pure helper: identify customers without a `branchId` tag.
 *
 * @param {Array<object>} customers — be_customers docs (with `id` set)
 * @returns {{ untagged: Array, tagged: Array, total: number }}
 *   untagged: customers with empty/missing `branchId`
 *   tagged:   customers with non-empty `branchId`
 *   total:    customers.length
 */
export function findUntaggedCustomers(customers) {
  const list = Array.isArray(customers) ? customers : [];
  const untagged = [];
  const tagged = [];
  for (const c of list) {
    if (!c) continue;
    const bid = typeof c.branchId === 'string' ? c.branchId.trim() : '';
    if (!bid) {
      untagged.push(c);
    } else {
      tagged.push(c);
    }
  }
  return { untagged, tagged, total: list.length };
}

/**
 * Build a compact summary doc for the dry-run UI.
 * Picks display fields without leaking PII beyond what the admin already
 * sees in CustomerListTab (hn + name).
 */
function summarizeCustomerForDryRun(c) {
  const pd = c.patientData || {};
  const firstName = pd.firstName || c.firstname || '';
  const lastName = pd.lastName || c.lastname || '';
  const prefix = pd.prefix || c.prefix || '';
  const displayName = `${prefix} ${firstName} ${lastName}`.trim() || '(ไม่ระบุชื่อ)';
  return {
    customerId: String(c.id || c.customerId || c.proClinicId || ''),
    hn: String(c.proClinicHN || c.hn_no || c.hn || ''),
    name: displayName,
    branchId: typeof c.branchId === 'string' ? c.branchId : '',
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'method not allowed' });
    return;
  }

  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const action = String(req.body?.action || 'list');
  const targetBranchId = String(req.body?.targetBranchId || '').trim();
  const confirmCustomerIds = Array.isArray(req.body?.confirmCustomerIds)
    ? req.body.confirmCustomerIds.map(String)
    : [];

  try {
    const db = getAdminFirestore();
    const data = dataPath(db);

    if (action === 'list') {
      const customerSnap = await data.collection('be_customers').get();
      const customers = customerSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const { untagged, total } = findUntaggedCustomers(customers);
      const summary = untagged.map(summarizeCustomerForDryRun);
      // Newest first (preserves CustomerListTab sort) so the admin sees recent
      // create activity at the top of the migration preview.
      summary.sort((a, b) => String(b.customerId).localeCompare(String(a.customerId)));
      return res.status(200).json({
        success: true,
        data: {
          dryRun: true,
          untagged: summary,
          total: summary.length,
          totalCustomers: total,
          callerEmail: caller.email,
        },
      });
    }

    if (action === 'apply') {
      if (!targetBranchId) {
        return res.status(400).json({
          success: false,
          error: 'targetBranchId required for apply action',
        });
      }
      if (confirmCustomerIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'confirmCustomerIds[] required for apply action — run action:list first',
        });
      }

      // Validate target branch exists in be_branches (defends against typos
      // / stale UI sending a since-deleted branchId).
      const branchSnap = await data.collection('be_branches').get();
      const branchIds = new Set();
      for (const d of branchSnap.docs) {
        branchIds.add(d.id);
        const bid = d.data()?.branchId;
        if (bid) branchIds.add(String(bid));
      }
      if (!branchIds.has(targetBranchId)) {
        return res.status(400).json({
          success: false,
          error: `targetBranchId "${targetBranchId}" not found in be_branches`,
        });
      }

      // Apply in 500-op chunks (Firestore writeBatch limit).
      const updated = [];
      let batchOp = db.batch();
      let inBatch = 0;
      const ts = new Date().toISOString();
      for (const id of confirmCustomerIds) {
        const ref = data.collection('be_customers').doc(id);
        batchOp.update(ref, {
          branchId: targetBranchId,
          // Mark migration so audits can distinguish baseline-set from
          // create-time-set later (purely informational; immutability
          // contract still holds via updateCustomerFromForm).
          _branchBaselineMigratedAt: ts,
          _branchBaselineMigratedBy: caller.uid || '',
        });
        updated.push(id);
        inBatch += 1;
        if (inBatch >= 500) {
          await batchOp.commit();
          batchOp = db.batch();
          inBatch = 0;
        }
      }
      if (inBatch > 0) await batchOp.commit();

      // Audit doc.
      const auditId = `customer-branch-baseline-${Date.now()}`;
      await data.collection('be_admin_audit').doc(auditId).set({
        type: 'customer-branch-baseline',
        targetBranchId,
        updatedCount: updated.length,
        updatedCustomerIds: updated,
        callerEmail: caller.email,
        callerUid: caller.uid,
        createdAt: ts,
      });

      return res.status(200).json({
        success: true,
        data: {
          dryRun: false,
          targetBranchId,
          updatedCount: updated.length,
          updated,
          auditId,
          callerEmail: caller.email,
        },
      });
    }

    return res.status(400).json({
      success: false,
      error: `unknown action: ${action} (expected 'list' or 'apply')`,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'customer-branch-baseline failed',
    });
  }
}
