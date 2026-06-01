// ─── useScheduledTaskStatus (2026-06-02) ──────────────────────────────────
// Real-time listener on the single denormalized status doc
// clinic_settings/scheduled_task_status. Returns a map { [taskId]: { lastRunAt,
// ok, summary, error, skipped } }; {} when the doc is missing or unreadable.
// Each Vercel cron merges its own slice at end-of-run (writeScheduledTaskStatus).
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, appId } from '../firebase.js';

export function useScheduledTaskStatus() {
  const [status, setStatus] = useState({});
  useEffect(() => {
    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'clinic_settings', 'scheduled_task_status');
    const unsub = onSnapshot(
      ref,
      (snap) => setStatus(snap.exists() ? (snap.data() || {}) : {}),
      () => setStatus({}), // permission/transient error → empty (UI shows "ยังไม่เคยรัน")
    );
    return unsub;
  }, []);
  return status;
}
