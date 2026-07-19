// ─── /api/client-error — anon beacon sink (2026-07-19) ─────────────────────
// Receives sanitized error payloads from src/lib/errorBeacon.js (all pages —
// staff app AND customer links, which have no auth). Writes to
// client_error_log via admin SDK; the collection is DEFAULT-DENY in
// firestore.rules on purpose (no rule added) — the client SDK can neither
// read nor write it. Admin viewing goes through /api/admin/client-errors-list.
//
// Spam/cost ceiling (no shared rate-limiter exists in this repo — the guards
// ARE the design, see spec Risks): strict field allowlist + re-truncation
// (validateClientErrorBody), body size cap, and a transactional daily cap of
// CLIENT_ERROR_LIMITS.dailyCap docs on client_error_log_meta/daily (a single
// counter doc for the whole collection). Over-cap valid posts return
// 200 {dropped:true} — never an error, so a broken client can't retry-storm.
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { validateClientErrorBody, CLIENT_ERROR_LIMITS } from '../src/lib/clientErrorCore.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;

let cachedDb = null;
function getDb() {
  if (cachedDb) return cachedDb;
  let app;
  if (getApps().length > 0) app = getApp();
  else {
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    if (!clientEmail || !rawKey) throw new Error('firebase-admin not configured');
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

const bangkokDateKey = (nowMs = Date.now()) =>
  new Date(nowMs + 7 * 3600000).toISOString().slice(0, 10).replace(/-/g, '');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  try {
    // Body size cap BEFORE any Firestore work (sendBeacon posts JSON; Vercel
    // has parsed req.body already — measure the serialized size).
    let body = req.body;
    if (typeof body === 'string') {
      if (body.length > CLIENT_ERROR_LIMITS.bodyBytes) return res.status(413).json({ ok: false, error: 'TOO_LARGE' });
      try { body = JSON.parse(body); } catch { return res.status(400).json({ ok: false, error: 'BAD_BODY' }); }
    } else if (body && JSON.stringify(body).length > CLIENT_ERROR_LIMITS.bodyBytes) {
      return res.status(413).json({ ok: false, error: 'TOO_LARGE' });
    }

    const v = validateClientErrorBody(body);
    if (!v.ok) return res.status(400).json({ ok: false, error: v.reason });

    const db = getDb();
    const nowMs = Date.now();
    const dateKey = bangkokDateKey(nowMs);
    const metaRef = db.doc(`${PREFIX}/client_error_log_meta/daily`);

    // One counter doc for the whole collection; Bangkok-day rollover resets it.
    const allowed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(metaRef);
      const data = snap.exists ? snap.data() : null;
      const count = data && data.dateKey === dateKey ? Number(data.count) || 0 : 0;
      if (count >= CLIENT_ERROR_LIMITS.dailyCap) return false;
      tx.set(metaRef, { dateKey, count: count + 1 });
      return true;
    });
    if (!allowed) return res.status(200).json({ ok: true, dropped: true });

    const id = `CE-${nowMs}-${crypto.randomBytes(4).toString('hex')}`;
    await db.doc(`${PREFIX}/client_error_log/${id}`).set({
      ...v.doc,
      id,
      createdAtMs: nowMs,
      createdAt: new Date(nowMs).toISOString(),
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[client-error] failed:', e?.message || e);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' }); // never leak internals
  }
}
