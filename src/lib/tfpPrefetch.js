// tfpPrefetch — AV208 layer 3 (Q3=A, 2026-07-18). Warms the TFP master-data
// cache after a staff shell paints, so a machine whose Firestore cache is
// cold / LRU-evicted becomes WARM before the first TFP open of the day.
// Server-source on purpose: the pull populates IndexedDB + resume tokens →
// the TFP entry's cache pass paints instantly and its server pass is a
// tiny delta. Fire-and-forget; never surfaces errors; once per session.
// Mounted by BackendDashboard + AdminDashboard (staff-authed shells ONLY —
// customer-facing routes never import this).
let fired = false;

export function warmTfpMasterData({ delayMs = 4000 } = {}) {
  if (fired) return;
  fired = true;
  setTimeout(async () => {
    try {
      // R2-B#5 hardening: doctors + staff included so a partially-evicted
      // cache can't paint TFP with empty แพทย์/ผู้ช่วย pickers (both are tiny
      // universal lists; the TFP cache-MISS gate also requires doctors).
      const { listProducts, listCourses, listDfGroups, listDfStaffRates, listDoctors, listStaff } = await import('./scopedDataLayer.js');
      await Promise.allSettled([
        listProducts(), listCourses(), listDfGroups(), listDfStaffRates(),
        listDoctors({ includeHidden: true }), listStaff({ includeHidden: true }),
      ]);
    } catch { /* best-effort warm — never surfaces */ }
  }, delayMs);
}

export function _resetTfpPrefetchForTests() { fired = false; }
