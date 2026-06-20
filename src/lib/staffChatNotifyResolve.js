// src/lib/staffChatNotifyResolve.js — resolve the customer behind a staff-chat
// System notification card AT RENDER TIME (V113 live-resolve; never a stale
// stored snapshot for the link target). AV198.
//
//   • follow-up card → system.customerId is known at write time → use it.
//   • intake card    → no be_customer at write time. Subscribe to the
//     opd_session; the instant an admin registers the walk-in
//     (handleOpdClick stamps opd_session.brokerProClinicId), the card flips to
//     a clickable name + HN — live, for every viewer ("เห็นพร้อมกันทุกที่").
//
// Once a customerId is known, name + HN are live-resolved from be_customers so
// the card always shows the canonical registered name (not the kiosk-typed one).
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, appId } from '../firebase.js';
import { getCustomer } from './scopedDataLayer.js';
import { resolveCustomerDisplayName, resolveCustomerHN } from './customerDisplayName.js';

const BASE = `artifacts/${appId}/public/data`;

// Pure: given a card + the (possibly null) opd_session data, return the resolved
// customerId or null. Tested in isolation. NEVER throws.
export function pickSystemCardCustomerId(card, sessionData) {
  const sys = card && card.system;
  if (!sys) return null;
  if (sys.customerId) return String(sys.customerId);
  if (sessionData && sessionData.brokerProClinicId) return String(sessionData.brokerProClinicId);
  return null;
}

// Live hook. Returns { pending, customerId, name, hn }. Intake-unresolved cards
// subscribe to their opd_session so the flip is immediate; resolved/follow-up
// cards skip the session listener.
export function useSystemCardCustomer(card) {
  const sys = (card && card.system) || {};
  const directId = sys.customerId ? String(sys.customerId) : '';
  const sessionId = sys.sessionId ? String(sys.sessionId) : '';
  const [customerId, setCustomerId] = useState(directId);
  const [resolved, setResolved] = useState(null); // { name, hn } from live be_customers
  const [missing, setMissing] = useState(false);   // customerId known but the be_customers doc is GONE (deleted)

  // 1) intake (no direct customerId) → watch the opd_session until it is
  //    registered (brokerProClinicId appears). Cleans up on unmount/resolve.
  useEffect(() => {
    if (directId) { setCustomerId(directId); return; }
    if (!sessionId) return;
    const ref = doc(db, BASE, 'opd_sessions', sessionId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const cid = snap.exists() ? snap.data().brokerProClinicId : '';
        if (cid) setCustomerId(String(cid));
      },
      () => {}, // non-fatal: a denied/missing session just leaves the card pending
    );
    return () => unsub();
  }, [directId, sessionId]);

  // 2) once a customerId is known → live name + HN from be_customers. Optimistic:
  //    the link renders as soon as customerId is known (missing starts false). If
  //    getCustomer RESOLVES to null the customer was DELETED → downgrade the link
  //    to plain text (no 404 link). A THROW (network / transient) is NOT treated
  //    as deletion — keep the optimistic link (its target re-fetches on click).
  useEffect(() => {
    if (!customerId) { setResolved(null); setMissing(false); return; }
    let alive = true;
    setMissing(false); // re-arm on customerId change — assume it exists until proven gone
    getCustomer(customerId)
      .then((c) => {
        if (!alive) return;
        if (c) setResolved({ name: resolveCustomerDisplayName(c), hn: resolveCustomerHN(c) });
        else setMissing(true); // definitively not found → deleted
      })
      .catch(() => {}); // transient — keep the optimistic link + snapshot fallback
    return () => { alive = false; };
  }, [customerId]);

  const pending = !customerId;
  return {
    pending,
    missing,
    customerId,
    name: (resolved && resolved.name) || sys.nameSnapshot || '',
    hn: (resolved && resolved.hn) || sys.hnSnapshot || '',
  };
}
