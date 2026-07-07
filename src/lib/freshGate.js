// freshGate — customer-facing surfaces render SERVER-CONFIRMED data ONLY.
//
// A2 (2026-07-07 instant cold-start, spec Q1=A). Since persistentLocalCache
// landed (src/firebase.js A1), EVERY onSnapshot fires a cache snapshot first
// (stale-while-revalidate). That is wanted for STAFF surfaces; it is FORBIDDEN
// for customer-facing pages — a customer must never see a stale course balance
// or appointment time (fresh-always contract from Mobile-Load 2026-06-16 Q1).
// This wrapper drops fromCache snapshots so the consumer's first render is
// server truth, byte-identical timing to the pre-persistence behavior.
//
// Consumers (AV206.a closed list — classifier-locked):
//   - src/pages/PatientForm.jsx    (?session= opd_sessions doc)
//   - src/pages/ClinicSchedule.jsx (?schedule= clinic_schedules doc)
//   (?patient= reads /api/patient-view — a server API, fresh by construction.)
//
// NOTE: includeMetadataChanges is REQUIRED — without it, when the server doc is
// byte-identical to the cached doc the SDK would not fire a second (fromCache:
// false) content event, and the consumer would hang until its resilient-load
// timeout. With it, the server-confirm event always arrives.
import { onSnapshot } from 'firebase/firestore';

export function onSnapshotFresh(refOrQuery, onData, onError) {
  return onSnapshot(refOrQuery, { includeMetadataChanges: true }, (snap) => {
    if (snap.metadata.fromCache) return; // stale-while-revalidate is NOT for customers
    onData(snap);
  }, onError);
}
