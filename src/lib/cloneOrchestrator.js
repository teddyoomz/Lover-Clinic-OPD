// ─── Clone Orchestrator ─────────────────────────────────────────────────────
// Orchestrates full customer clone from ProClinic → be_* Firestore collections.
// Runs entirely on frontend, calling existing broker API functions.
// Reports progress through a callback: onProgress({ step, label, percent, detail })

import * as broker from './brokerClient.js';
import { saveCustomer, updateCustomer, saveTreatment, createBackendAppointment, getCustomer, customerExists, getTreatment as getBackendTreatment } from './backendClient.js';

// ─── Parse Thai date "8 เมษายน 2026" → "2026-04-08" ────────────────────────
const TH_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
function parseThaiDate(str) {
  if (!str) return null;
  // Try ISO format first "2026-04-08"
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // Try "8 เมษายน 2026"
  const m = str.match(/(\d{1,2})\s+(\S+)\s+(\d{4})/);
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const monthIdx = TH_MONTHS.indexOf(m[2]);
  if (monthIdx < 0) return null;
  const month = String(monthIdx + 1).padStart(2, '0');
  const year = parseInt(m[3]) > 2400 ? m[3] - 543 : m[3]; // handle BE year
  return `${year}-${month}-${day}`;
}

// ─── Promise pool — batched concurrent requests ─────────────────────────────
async function promisePool(items, concurrency, fn, onItemDone) {
  let completed = 0;
  const executing = new Set();
  const results = [];

  for (const item of items) {
    const p = (async () => {
      try {
        const result = await fn(item);
        return { item, result, error: null };
      } catch (err) {
        return { item, result: null, error: err.message || String(err) };
      }
    })();

    const tracked = p.then(r => {
      completed++;
      executing.delete(tracked);
      if (onItemDone) onItemDone(completed, items.length, r);
      results.push(r);
    });

    executing.add(tracked);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

// ─── Main clone function ────────────────────────────────────────────────────

/**
 * Clone all customer data from ProClinic to be_* Firestore.
 * @param {string} proClinicId - ProClinic customer ID
 * @param {function} onProgress - Callback: ({ step, label, percent, detail }) => void
 * @param {AbortSignal} [signal] - Optional abort signal to cancel
 * @returns {{ success: boolean, error?: string, partial?: boolean }}
 */
export async function cloneCustomer(proClinicId, onProgress, signal) {
  const errors = [];
  const progress = { profile: false, courses: false, treatmentList: false, treatmentDetails: '0/0' };
  const now = new Date().toISOString();

  const report = (step, label, percent, detail = '') => {
    if (onProgress) onProgress({ step, label, percent, detail });
  };

  // ── Step 1: PROFILE ─────────────────────────────────────────────────────
  report(1, 'กำลังดึงข้อมูลส่วนตัว...', 5);

  let profileResult;
  try {
    profileResult = await broker.fetchPatientFromProClinic(proClinicId);
    if (!profileResult?.success) throw new Error(profileResult?.error || 'ดึงข้อมูลลูกค้าไม่สำเร็จ');
  } catch (err) {
    // Step 1 is critical — abort entirely
    return { success: false, error: `[Step 1] ${err.message}` };
  }

  if (signal?.aborted) return { success: false, error: 'Cancelled' };

  // Write initial doc
  const customerData = {
    proClinicId: String(proClinicId),
    proClinicHN: profileResult.proClinicHN || '',
    patientData: profileResult.patient || {},
    courses: [],
    expiredCourses: [],
    appointments: [],
    treatmentSummary: [],
    treatmentCount: 0,
    clonedAt: now,
    lastSyncedAt: now,
    cloneStatus: 'in_progress',
    cloneProgress: progress,
  };

  try {
    await saveCustomer(proClinicId, customerData);
    progress.profile = true;
  } catch (err) {
    return { success: false, error: `[Firestore] ${err.message}` };
  }

  report(1, 'ดึงข้อมูลส่วนตัวสำเร็จ', 15);

  // ── Step 2: COURSES + APPOINTMENTS ──────────────────────────────────────
  if (signal?.aborted) return { success: false, error: 'Cancelled' };
  report(2, 'กำลังดึงคอร์สและนัดหมาย...', 20);

  try {
    const coursesResult = await broker.getCourses(proClinicId);
    if (coursesResult?.success) {
      const appts = coursesResult.appointments || [];
      await updateCustomer(proClinicId, {
        courses: coursesResult.courses || [],
        expiredCourses: coursesResult.expiredCourses || [],
        appointments: appts,
      });
      // Also save appointments to be_appointments collection for calendar view.
      // CL8: track per-appointment outcome so a mid-loop crash doesn't leave
      // orphaned records silently. We collect errors into the `errors` array
      // (already returned to the caller) so the orchestrator surface can
      // detect partial-clone state.
      let apptOk = 0, apptFail = 0;
      for (const appt of appts) {
        try {
          // Parse time "10:30 - 11:00" → startTime + endTime
          const timeParts = (appt.time || '').split('-').map(s => s.trim());
          const startTime = timeParts[0] || '';
          const endTime = timeParts[1] || '';
          // Parse Thai date "8 เมษายน 2026" → "2026-04-08"
          const dateISO = parseThaiDate(appt.date);
          if (dateISO) {
            await createBackendAppointment(JSON.parse(JSON.stringify({
              customerId: String(proClinicId),
              customerName: profileResult.patient?.firstName ? `${profileResult.patient.prefix || ''} ${profileResult.patient.firstName} ${profileResult.patient.lastName || ''}`.trim() : '',
              customerHN: profileResult.proClinicHN || '',
              date: dateISO,
              startTime, endTime,
              doctorName: appt.doctor || '',
              roomName: appt.room || '',
              notes: appt.notes || '',
              branch: appt.branch || '',
              status: 'confirmed',
              source: 'cloned',
            })));
            apptOk++;
          }
        } catch (e) {
          apptFail++;
          errors.push(`[Step 2 appt ${appt?.date || '?'} ${appt?.time || '?'}] ${e?.message || e}`);
        }
      }
      if (apptFail > 0) {
        console.error(`[cloneOrchestrator] ${apptFail}/${apptOk + apptFail} appointments failed for customer ${proClinicId}`);
      }
      progress.courses = true;
    } else {
      errors.push(`[Step 2] ${coursesResult?.error || 'ดึงคอร์สไม่สำเร็จ'}`);
    }
  } catch (err) {
    errors.push(`[Step 2] ${err.message}`);
  }

  report(2, 'ดึงคอร์สสำเร็จ', 30);

  // ── Step 3: TREATMENT LIST (all pages) ──────────────────────────────────
  if (signal?.aborted) return { success: false, error: 'Cancelled' };
  report(3, 'กำลังดึงรายการ Treatment...', 35);

  let allTreatments = [];
  try {
    // Fetch first page to get totalPages
    const firstPage = await broker.listTreatments(proClinicId, 1);
    if (!firstPage?.success) throw new Error(firstPage?.error || 'ดึง Treatment list ไม่สำเร็จ');

    allTreatments = [...(firstPage.treatments || [])];
    const totalPages = firstPage.totalPages || 1;

    // Fetch remaining pages sequentially
    for (let p = 2; p <= totalPages; p++) {
      if (signal?.aborted) return { success: false, error: 'Cancelled' };
      report(3, `กำลังดึงรายการ Treatment... หน้า ${p}/${totalPages}`, 35 + (p / totalPages) * 15);

      const pageResult = await broker.listTreatments(proClinicId, p);
      if (pageResult?.success && pageResult.treatments) {
        allTreatments.push(...pageResult.treatments);
      }
    }

    // Save treatment summary to customer doc
    const treatmentSummary = allTreatments.map(t => ({
      id: t.id,
      date: t.date || '',
      doctor: t.doctor || '',
      assistants: t.assistants || [],
      branch: t.branch || '',
      cc: t.cc || '',
      dx: t.dx || '',
    }));

    await updateCustomer(proClinicId, {
      treatmentSummary,
      treatmentCount: allTreatments.length,
    });
    progress.treatmentList = true;
  } catch (err) {
    errors.push(`[Step 3] ${err.message}`);
  }

  report(3, `ดึงรายการ Treatment ${allTreatments.length} รายการ`, 50);

  // ── Step 4: TREATMENT DETAILS (batched) ─────────────────────────────────
  if (signal?.aborted) return { success: false, error: 'Cancelled' };

  const treatmentIds = allTreatments.filter(t => t.id).map(t => t.id);
  const totalDetails = treatmentIds.length;
  let detailErrors = 0;

  if (totalDetails > 0) {
    report(4, `กำลังดึง Treatment Detail... 0/${totalDetails}`, 55);

    const detailResults = await promisePool(
      treatmentIds,
      3, // concurrency
      async (treatmentId) => {
        if (signal?.aborted) throw new Error('Cancelled');
        const result = await broker.getTreatment(treatmentId);
        if (!result?.success) throw new Error(result?.error || 'Failed');

        // Save to be_treatments
        await saveTreatment(treatmentId, {
          treatmentId: String(treatmentId),
          customerId: String(proClinicId),
          detail: result.treatment || {},
          clonedAt: now,
        });

        return result.treatment;
      },
      (completed, total, result) => {
        if (result.error) detailErrors++;
        const pct = 55 + (completed / total) * 35; // 55% → 90%
        progress.treatmentDetails = `${completed}/${total}`;
        report(4, `กำลังดึง Treatment Detail... ${completed}/${total}`, Math.round(pct));
      }
    );

    if (detailErrors > 0) {
      errors.push(`[Step 4] ${detailErrors}/${totalDetails} treatments failed to fetch`);
    }
  }

  progress.treatmentDetails = `${totalDetails - detailErrors}/${totalDetails}`;

  // ── Step 5: FINALIZE ────────────────────────────────────────────────────
  const isPartial = errors.length > 0;
  const finalStatus = isPartial ? 'partial_error' : 'complete';

  try {
    await updateCustomer(proClinicId, {
      cloneStatus: finalStatus,
      cloneProgress: progress,
      lastSyncedAt: now,
      ...(isPartial ? { cloneError: errors.join('\n') } : { cloneError: null }),
    });
  } catch (err) {
    // Non-fatal — status update failed but data is saved
    console.warn('[cloneOrchestrator] Failed to update final status:', err);
  }

  report(5, isPartial ? 'Clone สำเร็จบางส่วน' : 'Clone สำเร็จ', 100);

  return {
    success: true,
    partial: isPartial,
    error: isPartial ? errors.join('\n') : undefined,
    stats: {
      profile: progress.profile,
      courses: progress.courses,
      treatments: totalDetails,
      treatmentsFailed: detailErrors,
    },
  };
}

// ─── Smart Sync — detect changes before cloning ────────────────────────────

const delay = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Detect what changed for a customer since last clone.
 * Returns { action: 'skip'|'full'|'incremental'|'resume', reason, newTreatmentIds? }
 */
export async function detectChanges(proClinicId) {
  const stored = await getCustomer(proClinicId);
  if (!stored) return { action: 'full', reason: 'ยังไม่เคย clone' };

  // Check resume state
  if (stored.syncState?.status === 'in_progress' || stored.syncState?.status === 'failed') {
    return { action: 'resume', reason: `ค้างจาก step ${stored.syncState?.lastStep || '?'}` };
  }

  // Fetch treatment list page 1 to compare count
  let liveTreatments = [];
  let liveTotalPages = 1;
  try {
    const listResult = await broker.listTreatments(proClinicId, 1);
    if (listResult?.success) {
      liveTreatments = listResult.treatments || [];
      liveTotalPages = listResult.totalPages || 1;
    }
  } catch {}

  // Compare treatment count (quick check)
  const storedIds = new Set((stored.treatmentSummary || []).map(t => String(t.id)));
  const newTreatmentIds = liveTreatments.filter(t => !storedIds.has(String(t.id))).map(t => t.id);

  // If page 1 has new treatments, there might be more on other pages
  // But we only check page 1 for speed — full incremental will scan all
  if (newTreatmentIds.length > 0) {
    return { action: 'incremental', reason: `พบ ${newTreatmentIds.length}+ treatment ใหม่`, newTreatmentIds };
  }

  // Check courses qty changes
  let courseChanged = false;
  try {
    const coursesResult = await broker.getCourses(proClinicId);
    if (coursesResult?.success) {
      const liveCourses = coursesResult.courses || [];
      const storedCourses = stored.courses || [];
      // Compare course count
      if (liveCourses.length !== storedCourses.length) {
        courseChanged = true;
      } else {
        // Compare each course qty
        for (const lc of liveCourses) {
          const sc = storedCourses.find(s => s.name === lc.name);
          if (!sc || sc.qty !== lc.qty) { courseChanged = true; break; }
        }
      }
    }
  } catch {}

  if (courseChanged) {
    return { action: 'full', reason: 'คอร์สมีการเปลี่ยนแปลง' };
  }

  return { action: 'skip', reason: 'ข้อมูลเป็นปัจจุบัน' };
}

/**
 * Smart clone — detect changes and act accordingly.
 * Same interface as cloneCustomer but smarter.
 */
export async function smartClone(proClinicId, onProgress, signal) {
  const report = (step, label, percent, detail = '') => {
    if (onProgress) onProgress({ step, label, percent, detail });
  };

  report(0, 'กำลังตรวจสอบข้อมูล...', 2);
  const changes = await detectChanges(proClinicId);

  if (changes.action === 'skip') {
    report(5, 'ข้อมูลเป็นปัจจุบัน', 100, changes.reason);
    return { success: true, skipped: true, reason: changes.reason };
  }

  if (changes.action === 'incremental') {
    return await incrementalSync(proClinicId, onProgress, signal);
  }

  // full or resume — do full clone (resume is handled by re-cloning from scratch for simplicity)
  report(0, changes.reason, 3);
  return await cloneCustomer(proClinicId, onProgress, signal);
}

/**
 * Incremental sync — only fetch NEW treatments + update courses.
 */
async function incrementalSync(proClinicId, onProgress, signal) {
  const errors = [];
  const now = new Date().toISOString();
  const report = (step, label, percent, detail = '') => {
    if (onProgress) onProgress({ step, label, percent, detail });
  };

  report(1, 'กำลังอัพเดทข้อมูลส่วนตัว...', 10);
  const stored = await getCustomer(proClinicId);

  // Step 1: Update profile
  try {
    const profileResult = await broker.fetchPatientFromProClinic(proClinicId);
    if (profileResult?.success) {
      await updateCustomer(proClinicId, {
        patientData: profileResult.patient || stored.patientData,
        proClinicHN: profileResult.proClinicHN || stored.proClinicHN,
      });
    }
  } catch (err) { errors.push(`[Profile] ${err.message}`); }

  if (signal?.aborted) return { success: false, error: 'Cancelled' };

  // Step 2: Update courses + appointments
  report(2, 'กำลังอัพเดทคอร์ส...', 25);
  try {
    const coursesResult = await broker.getCourses(proClinicId);
    if (coursesResult?.success) {
      await updateCustomer(proClinicId, {
        courses: coursesResult.courses || [],
        expiredCourses: coursesResult.expiredCourses || [],
        appointments: coursesResult.appointments || [],
      });
    }
  } catch (err) { errors.push(`[Courses] ${err.message}`); }

  if (signal?.aborted) return { success: false, error: 'Cancelled' };

  // Step 3: Find ALL new treatments (scan all pages)
  report(3, 'กำลังหา treatment ใหม่...', 40);
  const storedIds = new Set((stored.treatmentSummary || []).map(t => String(t.id)));
  let newTreatments = [];

  try {
    const firstPage = await broker.listTreatments(proClinicId, 1);
    if (firstPage?.success) {
      const totalPages = firstPage.totalPages || 1;
      let allLive = [...(firstPage.treatments || [])];
      for (let p = 2; p <= totalPages; p++) {
        if (signal?.aborted) return { success: false, error: 'Cancelled' };
        const page = await broker.listTreatments(proClinicId, p);
        if (page?.success) allLive.push(...(page.treatments || []));
      }
      newTreatments = allLive.filter(t => !storedIds.has(String(t.id)));

      // Update treatment summary with ALL (old + new)
      const newSummary = allLive.map(t => ({
        id: t.id, date: t.date || '', doctor: t.doctor || '',
        assistants: t.assistants || [], branch: t.branch || '',
        cc: t.cc || '', dx: t.dx || '',
      }));
      await updateCustomer(proClinicId, {
        treatmentSummary: newSummary,
        treatmentCount: allLive.length,
      });
    }
  } catch (err) { errors.push(`[TreatmentList] ${err.message}`); }

  if (signal?.aborted) return { success: false, error: 'Cancelled' };

  // Step 4: Fetch details for NEW treatments only
  const newIds = newTreatments.filter(t => t.id).map(t => t.id);
  let detailErrors = 0;

  if (newIds.length > 0) {
    report(4, `กำลังดูด ${newIds.length} treatment ใหม่... 0/${newIds.length}`, 50);
    await promisePool(newIds, 3, async (treatmentId) => {
      if (signal?.aborted) throw new Error('Cancelled');
      const result = await broker.getTreatment(treatmentId);
      if (!result?.success) throw new Error(result?.error || 'Failed');
      await saveTreatment(treatmentId, {
        treatmentId: String(treatmentId),
        customerId: String(proClinicId),
        detail: result.treatment || {},
        clonedAt: now,
      });
      return result.treatment;
    }, (completed, total, result) => {
      if (result.error) detailErrors++;
      report(4, `กำลังดูด treatment ใหม่... ${completed}/${total}`, 50 + (completed / total) * 40);
    });
  } else {
    report(4, 'ไม่มี treatment ใหม่', 90);
  }

  // Finalize
  await updateCustomer(proClinicId, {
    cloneStatus: errors.length > 0 ? 'partial_error' : 'complete',
    lastSyncedAt: now,
    ...(errors.length > 0 ? { cloneError: errors.join('\n') } : { cloneError: null }),
  });

  report(5, `อัพเดทสำเร็จ — ${newIds.length} treatment ใหม่`, 100);

  return {
    success: true,
    incremental: true,
    newTreatments: newIds.length,
    detailErrors,
    partial: errors.length > 0,
  };
}

// ─── Bulk Clone All Customers ──────────────────────────────────────────────

/**
 * Clone ALL customers from ProClinic, intelligently:
 * - Skips unchanged customers
 * - Incremental sync for customers with only new treatments
 * - Full clone for new/changed customers
 * - Resume failed clones
 * - Pause/cancel support
 *
 * @param {function} onProgress - Progress callback
 * @param {AbortSignal} signal - Abort signal
 * @returns {{ promise, pause(), resume() }}
 */
export function cloneAllCustomers(onProgress, signal) {
  let _paused = false;
  let _resumeResolve = null;

  const control = {
    pause: () => { _paused = true; },
    resume: () => { _paused = false; if (_resumeResolve) { _resumeResolve(); _resumeResolve = null; } },
  };

  const promise = (async () => {
    const log = [];
    const state = {
      phase: 'listing', totalCustomers: 0,
      skipCount: 0, fullCloneCount: 0, incrementalCount: 0, resumeCount: 0,
      currentIndex: 0, currentName: '', currentId: '', currentAction: '',
      completedCount: 0, failedCount: 0,
      percent: 0, estimatedSecondsLeft: 0, log,
    };
    const report = () => { if (onProgress) onProgress({ ...state }); };

    // ── Phase 1: LIST all customers ──
    state.phase = 'listing';
    report();

    let allCustomers = [];
    try {
      const page1 = await broker.listAllCustomers(1);
      if (!page1?.success) throw new Error(page1?.error || 'ดึงรายชื่อลูกค้าไม่สำเร็จ');
      allCustomers = [...(page1.customers || [])];
      const maxPage = page1.maxPage || 1;

      for (let p = 2; p <= maxPage; p++) {
        if (signal?.aborted) return { success: false, cancelled: true, log };
        state.percent = (p / maxPage) * 15;
        state.currentName = `หน้า ${p}/${maxPage}`;
        report();
        await delay(1000);
        const pageResult = await broker.listAllCustomers(p);
        if (pageResult?.success) allCustomers.push(...(pageResult.customers || []));
      }
    } catch (err) {
      state.phase = 'error';
      report();
      return { success: false, error: err.message, log };
    }

    // Deduplicate by ID
    const seen = new Set();
    allCustomers = allCustomers.filter(c => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });

    state.totalCustomers = allCustomers.length;
    state.percent = 15;
    report();

    if (allCustomers.length === 0) {
      state.phase = 'done';
      state.percent = 100;
      report();
      return { success: true, log };
    }

    // ── Phase 2: SMART CHECK each customer ──
    state.phase = 'checking';
    report();

    const queue = []; // { customer, action, reason }
    for (let i = 0; i < allCustomers.length; i++) {
      if (signal?.aborted) return { success: false, cancelled: true, log };
      const c = allCustomers[i];
      state.currentIndex = i + 1;
      state.currentName = c.name || c.id;
      state.percent = 15 + (i / allCustomers.length) * 15;
      report();

      try {
        const exists = await customerExists(c.id);
        if (!exists) {
          queue.push({ customer: c, action: 'full', reason: 'ยังไม่เคย clone' });
          state.fullCloneCount++;
        } else {
          const changes = await detectChanges(c.id);
          queue.push({ customer: c, action: changes.action, reason: changes.reason, newTreatmentIds: changes.newTreatmentIds });
          if (changes.action === 'skip') state.skipCount++;
          else if (changes.action === 'incremental') state.incrementalCount++;
          else if (changes.action === 'resume') state.resumeCount++;
          else state.fullCloneCount++;
        }
      } catch {
        queue.push({ customer: c, action: 'full', reason: 'ตรวจสอบไม่ได้' });
        state.fullCloneCount++;
      }
    }

    state.percent = 30;
    report();

    // ── Phase 3: EXECUTE queue ──
    state.phase = 'cloning';
    const startTime = Date.now();
    const actionItems = queue.filter(q => q.action !== 'skip');
    const totalActions = actionItems.length;
    let doneCount = 0;

    // Log skipped items
    queue.filter(q => q.action === 'skip').forEach(q => {
      log.push({ id: q.customer.id, name: q.customer.name || q.customer.id, action: 'skip', status: 'ok', message: q.reason });
    });

    for (const item of actionItems) {
      if (signal?.aborted) break;

      // Pause support
      if (_paused) {
        state.phase = 'paused';
        report();
        await new Promise(resolve => { _resumeResolve = resolve; });
        state.phase = 'cloning';
      }

      state.currentIndex = doneCount + 1;
      state.currentName = item.customer.name || item.customer.id;
      state.currentId = item.customer.id;
      state.currentAction = item.action;
      state.percent = 30 + (doneCount / Math.max(totalActions, 1)) * 65;

      // ETA calculation
      if (doneCount > 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = doneCount / elapsed;
        state.estimatedSecondsLeft = rate > 0 ? Math.round((totalActions - doneCount) / rate) : 0;
      }
      report();

      const itemStart = Date.now();
      let result;
      try {
        if (item.action === 'incremental') {
          result = await incrementalSync(item.customer.id, null, signal);
        } else {
          result = await cloneCustomer(item.customer.id, null, signal);
        }

        // Retry on rate limit
        if (!result.success && result.error && /429|too many|rate limit/i.test(result.error)) {
          state.currentName = `${item.customer.name || item.customer.id} (rate limited, รอ 10s...)`;
          report();
          await delay(10000);
          result = item.action === 'incremental'
            ? await incrementalSync(item.customer.id, null, signal)
            : await cloneCustomer(item.customer.id, null, signal);
        }

        const dur = Math.round((Date.now() - itemStart) / 1000);
        if (result.success) {
          state.completedCount++;
          const msg = result.skipped ? result.reason :
            result.incremental ? `อัพเดท ${result.newTreatments} treatment ใหม่` :
            `Clone สำเร็จ (${dur}s)`;
          log.push({ id: item.customer.id, name: item.customer.name, action: item.action, status: 'ok', message: msg, duration: dur });
        } else {
          state.failedCount++;
          log.push({ id: item.customer.id, name: item.customer.name, action: item.action, status: 'error', message: result.error || 'Unknown error', duration: dur });
        }
      } catch (err) {
        state.failedCount++;
        log.push({ id: item.customer.id, name: item.customer.name, action: item.action, status: 'error', message: err.message });
      }

      doneCount++;
      report();

      // Pacing delay between customers
      if (doneCount < totalActions && !signal?.aborted) {
        await delay(3000);
      }
    }

    // ── Phase 4: DONE ──
    state.phase = signal?.aborted ? 'cancelled' : 'done';
    state.percent = 100;
    state.estimatedSecondsLeft = 0;
    report();

    return {
      success: true,
      cancelled: !!signal?.aborted,
      completedCount: state.completedCount,
      failedCount: state.failedCount,
      skipCount: state.skipCount,
      totalCustomers: state.totalCustomers,
      log,
    };
  })();

  return { promise, pause: control.pause, resume: control.resume };
}
