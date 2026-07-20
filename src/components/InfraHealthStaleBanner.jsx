// ─── InfraHealthStaleBanner (2026-07-21) — watcher-of-the-watcher, in-app ────
// The infra-health sweep announces every OTHER cron's death but its own death
// is silent (it is excluded from its own expectations by design). This slim
// fixed chip mounts on the two staff daily surfaces (AdminDashboard +
// BackendDashboard) and warns when be_admin_audit/infra-health-latest is
// missing or older than 36h — i.e. the watcher itself stopped running.
// Complements (not replaces) the external HEALTHCHECK_PING_URL dead-man's
// switch, which covers the case where the whole app/platform is down.
//
// Fail-safe by design: a read ERROR renders nothing (a transient offline /
// permission edge must not false-alarm every staff device) — the missing-doc
// and stale cases are the true signals. Re-checks every 6h because staff tabs
// stay open for days (a mount-once check would never fire mid-week).
import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { getAdminAuditDoc } from '../lib/scopedDataLayer.js';
import { evaluateSweepStaleness } from '../lib/infraHealthCore.js';

const RECHECK_MS = 6 * 60 * 60 * 1000; // 6h
const DISMISS_KEY = 'lover.infraStaleDismissedAt';
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000; // dismiss silences for 24h, then re-asserts

export default function InfraHealthStaleBanner() {
  const [state, setState] = useState(null); // null | {reason, ageHours}
  const [dismissedAt, setDismissedAt] = useState(() => {
    try { return Number(sessionStorage.getItem(DISMISS_KEY)) || 0; } catch { return 0; }
  });

  useEffect(() => {
    let dead = false;
    const check = async () => {
      try {
        const doc = await getAdminAuditDoc('infra-health-latest');
        const s = evaluateSweepStaleness({ performedAt: doc?.performedAt || null, nowMs: Date.now() });
        if (!dead) setState(s.stale ? s : null);
      } catch {
        // read error → no banner (transient offline/permission edge ≠ sweep death;
        // the external dead-man's switch covers total-outage)
        if (!dead) setState(null);
      }
    };
    check();
    const id = setInterval(check, RECHECK_MS);
    return () => { dead = true; clearInterval(id); };
  }, []);

  if (!state) return null;
  if (dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS) return null;

  const text = state.reason === 'never-ran'
    ? 'ระบบตรวจสุขภาพยังไม่เคยรัน — เช็ค cron ใน Vercel'
    : `ระบบตรวจสุขภาพไม่ได้รันมา ${Math.round(state.ageHours)} ชม. — เช็ค Vercel crons / การ์ดสุขภาพระบบ`;

  return (
    <div
      data-testid="infra-health-stale-banner"
      className="fixed bottom-2 left-2 z-[90] flex items-center gap-2 rounded-lg border border-amber-600/50 bg-amber-950/90 px-3 py-2 text-xs font-bold text-amber-300 shadow-lg backdrop-blur-sm"
    >
      <AlertTriangle size={14} className="shrink-0" />
      <span>{text}</span>
      <button
        type="button"
        aria-label="ปิดชั่วคราว 24 ชม."
        title="ปิดชั่วคราว 24 ชม."
        onClick={() => {
          const now = Date.now();
          try { sessionStorage.setItem(DISMISS_KEY, String(now)); } catch { /* private mode */ }
          setDismissedAt(now);
        }}
        className="ml-1 shrink-0 rounded p-0.5 text-amber-400/70 hover:text-amber-200"
      >
        <X size={12} />
      </button>
    </div>
  );
}
