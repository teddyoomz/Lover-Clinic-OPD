import { useState, useEffect } from 'react';
import { getCustomer } from '../lib/scopedDataLayer.js';
import { apptPhoneValue } from '../lib/appointmentDisplay.js';
import { resolveCustomerPhone } from '../lib/customerDisplayName.js';

// V128 (2026-05-28) — module-level cache: customerId → resolved phone
// ('' = looked up, customer has none). Shared across the peek + popover and
// survives re-renders, so re-hovering the same customer is instant + a given
// customer is fetched at most once per session. getCustomer is branch-safe
// (scopedDataLayer). Tiny — one entry per hovered/clicked customer.
const _phoneCache = new Map();

// Test-only: reset the cache between tests so a stale entry can't leak.
export function __resetApptPhoneCache() { _phoneCache.clear(); }

/**
 * useResolvedApptPhone(appt) — the phone to display for ONE appointment.
 *
 *   1. apptPhoneValue(appt) — customerPhone (denorm) OR customerPhoneTemp
 *      (pick-later) — wins immediately, NO fetch. Covers new/edited appts
 *      (write-chokepoint stamps customerPhone) + pick-later appts where a
 *      phone was typed (the case the user explicitly required).
 *   2. else if appt.customerId — lazy getCustomer (cached) + resolveCustomerPhone.
 *   3. else '' — graceful (appt shows no phone).
 *
 * Live-resolve fallback for the LEGACY linked appts that predate the V128
 * write-chokepoint (their doc has no customerPhone). V113-aligned: fix at the
 * RENDERER, never backfill the data to "fix display".
 *
 * @param {object|null} appt
 * @returns {string} phone or ''
 */
export default function useResolvedApptPhone(appt) {
  const direct = apptPhoneValue(appt);
  const cid = (!direct && appt && appt.customerId) ? String(appt.customerId) : '';
  const [resolved, setResolved] = useState(() => (cid && _phoneCache.has(cid) ? _phoneCache.get(cid) : ''));

  useEffect(() => {
    if (!cid) { setResolved(''); return undefined; }
    if (_phoneCache.has(cid)) { setResolved(_phoneCache.get(cid)); return undefined; }
    let alive = true;
    (async () => {
      let phone = '';
      try {
        const c = await getCustomer(cid);
        phone = resolveCustomerPhone(c);
      } catch { /* non-fatal — leave blank */ }
      _phoneCache.set(cid, phone);
      if (alive) setResolved(phone);
    })();
    return () => { alive = false; };
  }, [cid]);

  return direct || resolved || '';
}
