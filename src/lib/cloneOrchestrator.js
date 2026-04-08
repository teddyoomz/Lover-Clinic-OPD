// ─── Clone Orchestrator ─────────────────────────────────────────────────────
// Orchestrates full customer clone from ProClinic → be_* Firestore collections.
// Runs entirely on frontend, calling existing broker API functions.
// Reports progress through a callback: onProgress({ step, label, percent, detail })

import * as broker from './brokerClient.js';
import { saveCustomer, updateCustomer, saveTreatment } from './backendClient.js';

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
      await updateCustomer(proClinicId, {
        courses: coursesResult.courses || [],
        expiredCourses: coursesResult.expiredCourses || [],
        appointments: coursesResult.appointments || [],
      });
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
