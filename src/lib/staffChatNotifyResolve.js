// src/lib/staffChatNotifyResolve.js — resolve the customer behind a staff-chat
// System notification card AT RENDER TIME (V113 live-resolve; never a stale
// stored snapshot for the link target). AV198.
//
//   • follow-up card → system.customerId is known at write time → use it.
//   • intake card    → no be_customer at write time. The walk-in is registered
//     through ONE of two flows; the card resolves the moment EITHER fires:
//       (a) kiosk / queue flow → handleOpdClick stamps
//           opd_session.brokerProClinicId on the SURVIVING session.
//       (b) booking / appointment card-flow (V118–V125) → handleOpdClick stamps
//           be_appointments.customerId (keyed by linkedOpdSessionId === sessionId)
//           AND HARD-DELETES the opd_session (AdminDashboard:3730). So the
//           session is GONE + never carries brokerProClinicId — watching only the
//           session leaves the card stuck "รอลงทะเบียน" forever (the prod bug:
//           นาย ปรัชญา มนเทียรอาสน์ / LC-26000176, 2026-06-21). The durable
//           signal is the linked appointment, so we ALSO watch it.
//     Either path flips the card to a clickable name + HN — live, for every
//     viewer ("เห็นพร้อมกันทุกที่").
//
// Once a customerId is known, name + HN are live-resolved from be_customers so
// the card always shows the canonical registered name (not the kiosk-typed one).
import { useEffect, useState } from 'react';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { db, appId } from '../firebase.js';
import { getCustomer } from './scopedDataLayer.js';
import { resolveCustomerDisplayName, resolveCustomerHN } from './customerDisplayName.js';

const BASE = `artifacts/${appId}/public/data`;

// Pure: given a card + the (possibly null) opd_session data + the (possibly null)
// linked be_appointments data, return the resolved customerId or null. Tested in
// isolation. NEVER throws.
//   priority: explicit system.customerId (follow-up) → appointment.customerId
//   (booking-flow) → session.brokerProClinicId (kiosk/queue-flow).
export function pickSystemCardCustomerId(card, sessionData, apptData) {
  const sys = card && card.system;
  if (!sys) return null;
  if (sys.customerId) return String(sys.customerId);
  if (apptData && apptData.customerId) return String(apptData.customerId);
  if (sessionData && sessionData.brokerProClinicId) return String(sessionData.brokerProClinicId);
  return null;
}

// Live hook. Returns { pending, customerId, name, hn }. Intake-unresolved cards
// subscribe to BOTH their opd_session (kiosk-flow brokerProClinicId) AND the
// linked appointment (booking-flow customerId) so the flip is immediate for
// either registration path; resolved/follow-up cards skip both listeners.
export function useSystemCardCustomer(card) {
  const sys = (card && card.system) || {};
  const directId = sys.customerId ? String(sys.customerId) : '';
  const sessionId = sys.sessionId ? String(sys.sessionId) : '';
  const [sessionCid, setSessionCid] = useState(''); // from opd_session.brokerProClinicId (kiosk/queue)
  const [apptCid, setApptCid] = useState('');        // from be_appointments.customerId (booking-flow)
  const [resolved, setResolved] = useState(null);    // { name, hn } from live be_customers
  const [missing, setMissing] = useState(false);     // customerId known but the be_customers doc is GONE (deleted)

  // directId (follow-up) wins; else whichever registration signal resolved first.
  const customerId = directId || apptCid || sessionCid;

  // 1a) intake (no direct customerId) → watch the opd_session until the
  //     kiosk/queue flow stamps brokerProClinicId. Symmetric with the picker:
  //     set it when brokerProClinicId appears, reset to '' if cleared (a one-way
  //     latch would drift from the picker — bug-hunt round 7). For booking-flow
  //     the session is hard-deleted on save (snap.exists() false → '') — that's
  //     exactly why path (b) below exists.
  useEffect(() => {
    if (directId) return;
    if (!sessionId) return;
    const ref = doc(db, BASE, 'opd_sessions', sessionId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const cid = (snap.exists() && snap.data().brokerProClinicId) ? String(snap.data().brokerProClinicId) : '';
        setSessionCid(cid);
      },
      (err) => { try { console.warn('[staff-chat] system-card session listener:', (err && err.message) || err); } catch { /* noop */ } },
    );
    return () => unsub();
  }, [directId, sessionId]);

  // 1b) intake (no direct customerId) → watch the linked appointment until the
  //     booking-flow stamps customerId. linkedOpdSessionId is the (globally
  //     unique) opd_session doc-id, so this is a branch-AGNOSTIC equality query —
  //     NOT branch-scoped: the card is already branch-routed and the viewer's
  //     selected branch must not hide the resolve. One appointment per session.
  useEffect(() => {
    if (directId) return;
    if (!sessionId) return;
    const q = query(collection(db, BASE, 'be_appointments'), where('linkedOpdSessionId', '==', sessionId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        let cid = '';
        for (const d of snap.docs) { const c = d.data().customerId; if (c) { cid = String(c); break; } }
        setApptCid(cid);
      },
      (err) => { try { console.warn('[staff-chat] system-card appointment listener:', (err && err.message) || err); } catch { /* noop */ } },
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
