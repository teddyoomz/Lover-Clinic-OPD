// ─── Treatment API ─────────────────────────────────────────────────────────
// Actions: list, get, create, update, delete
// Manages treatment records in ProClinic via HTML scraping.

import { createSession, handleCors } from './_lib/session.js';
import {
  extractCSRF, extractTreatmentList, extractTreatmentPagination,
  extractTreatmentDetail, extractTreatmentCreateOptions,
  extractFormFields, extractValidationErrors,
} from './_lib/scraper.js';
import { verifyAuth } from './_lib/auth.js';

// ─── Action: list — Get treatment list for a customer ──────────────────────

async function handleList(req, res) {
  const { customerId, page = 1 } = req.body || {};
  if (!customerId) {
    return res.status(400).json({ success: false, error: 'Missing customerId' });
  }

  const session = await createSession();
  const base = session.origin;
  const url = `${base}/admin/customer/${customerId}${page > 1 ? `?treatment_page=${page}` : ''}`;
  const html = await session.fetchText(url);

  const treatments = extractTreatmentList(html);
  const { maxPage } = extractTreatmentPagination(html);

  return res.status(200).json({
    success: true,
    treatments,
    page: parseInt(page),
    totalPages: maxPage,
  });
}

// ─── Action: get — Get full treatment detail from edit page ────────────────

async function handleGet(req, res) {
  const { treatmentId } = req.body || {};
  if (!treatmentId) {
    return res.status(400).json({ success: false, error: 'Missing treatmentId' });
  }

  const session = await createSession();
  const base = session.origin;
  const html = await session.fetchText(`${base}/admin/treatment/${treatmentId}/edit`);

  // Verify it's actually the edit page
  if (!html.includes('_method') || !html.includes('treatment_date')) {
    const err = new Error(`Treatment ${treatmentId} ไม่พบใน ProClinic`);
    err.notFound = true;
    throw err;
  }

  const treatment = extractTreatmentDetail(html);
  treatment.id = treatmentId;

  return res.status(200).json({ success: true, treatment });
}

// ─── Action: getCreateForm — Get form options for creating treatment ───────

async function handleGetCreateForm(req, res) {
  const { customerId } = req.body || {};
  if (!customerId) {
    return res.status(400).json({ success: false, error: 'Missing customerId' });
  }

  const session = await createSession();
  const base = session.origin;
  const html = await session.fetchText(`${base}/admin/treatment/create?customer_id=${customerId}`);

  const options = extractTreatmentCreateOptions(html);

  return res.status(200).json({ success: true, options });
}

// ─── Action: create — Create new treatment ─────────────────────────────────

async function handleCreate(req, res) {
  const { customerId, treatment } = req.body || {};
  if (!customerId || !treatment) {
    return res.status(400).json({ success: false, error: 'Missing customerId or treatment data' });
  }

  const session = await createSession();
  const base = session.origin;

  // GET create page for CSRF + defaults
  const createHtml = await session.fetchText(`${base}/admin/treatment/create?customer_id=${customerId}`);
  const csrf = extractCSRF(createHtml);
  if (!csrf) throw new Error('ไม่พบ CSRF token ในหน้า treatment create');

  // Get existing form defaults
  const defaults = extractFormFields(createHtml);

  // Build form data — merge defaults with provided treatment data
  const formData = new URLSearchParams();
  formData.set('_token', csrf);
  formData.set('sale_type', 'customer');
  formData.set('customer_id', customerId);

  // Doctor & assistants
  formData.set('doctor_id', treatment.doctorId || defaults.doctor_id || '');
  if (treatment.assistantIds?.length) {
    treatment.assistantIds.forEach(id => formData.append('doctor_assistant_id[]', id));
  }

  // Date
  formData.set('treatment_date', treatment.treatmentDate || defaults.treatment_date || new Date().toISOString().slice(0, 10));

  // OPD Card fields
  formData.set('symptoms', treatment.symptoms || '');
  formData.set('physical_exam', treatment.physicalExam || '');
  formData.set('diagnosis', treatment.diagnosis || '');
  formData.set('treatment_information', treatment.treatmentInfo || '');
  formData.set('treatment_plan', treatment.treatmentPlan || '');
  formData.set('treatment_note', treatment.treatmentNote || '');
  formData.set('additional_note', treatment.additionalNote || '');

  // Vital signs
  const v = treatment.vitals || {};
  formData.set('ht_weight', v.weight || '');
  formData.set('ht_height', v.height || '');
  formData.set('ht_body_temperature', v.temperature || '');
  formData.set('ht_pulse_rate', v.pulseRate || '');
  formData.set('ht_respiratory_rate', v.respiratoryRate || '');
  formData.set('ht_systolic_blood_pressure', v.systolicBP || '');
  formData.set('ht_diastolic_blood_pressure', v.diastolicBP || '');
  formData.set('ht_oxygen_saturation', v.oxygenSaturation || '');

  // Health info (pass through from defaults)
  formData.set('customer_doctor_id', defaults.customer_doctor_id || '');
  formData.set('blood_type', treatment.bloodType || defaults.blood_type || '');
  formData.set('congenital_disease', treatment.congenitalDisease || defaults.congenital_disease || '');
  formData.set('history_of_drug_allergy', treatment.drugAllergy || defaults.history_of_drug_allergy || '');
  formData.set('ht_treatment_history', treatment.treatmentHistory || defaults.ht_treatment_history || '');

  // Medical cert defaults
  formData.set('med_cert_is_actually_come', '0');
  formData.set('med_cert_is_rest', '0');
  formData.set('med_cert_period', '');
  formData.set('med_cert_is_other', '0');
  formData.set('med_cert_other_detail', '');

  // Empty defaults for complex sections (courses, products, payment)
  formData.set('courses', '');
  formData.set('products', '');
  formData.set('appointment_id', treatment.appointmentId || '');
  formData.set('treatment_id', '');
  formData.set('sale_date', treatment.treatmentDate || defaults.sale_date || new Date().toISOString().slice(0, 10));
  formData.set('coupon_code', '');

  // Payment — default to "pay later" (ชำระภายหลัง)
  formData.set('payment_type', treatment.paymentType || 'pay_later');
  formData.set('payment_date', treatment.treatmentDate || new Date().toISOString().slice(0, 10));
  formData.set('payment_time', treatment.paymentTime || '');
  formData.set('payment_channel_id', treatment.paymentChannelId || '');

  // Submit
  const submitRes = await session.fetch(`${base}/admin/treatment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-TOKEN': csrf,
    },
    body: formData.toString(),
    redirect: 'manual',
  });

  const status = submitRes.status;
  const location = submitRes.headers?.get?.('location') || '';

  // Success = redirect to customer page or treatment page
  if (status >= 300 && status < 400) {
    // Extract treatment ID from redirect URL if possible
    const m = location.match(/treatment\/(\d+)/);
    const treatmentId = m ? m[1] : null;
    return res.status(200).json({ success: true, treatmentId });
  }

  // Check for validation errors
  const bodyHtml = await submitRes.text();
  const errors = extractValidationErrors(bodyHtml);
  if (errors) throw new Error(errors);

  // May still succeed (200 with redirect in body)
  const m = bodyHtml.match(/treatment\/(\d+)/);
  if (m) return res.status(200).json({ success: true, treatmentId: m[1] });

  throw new Error(`สร้าง treatment ไม่สำเร็จ — status=${status}`);
}

// ─── Action: update — Update existing treatment ────────────────────────────

async function handleUpdate(req, res) {
  const { treatmentId, treatment } = req.body || {};
  if (!treatmentId || !treatment) {
    return res.status(400).json({ success: false, error: 'Missing treatmentId or treatment data' });
  }

  const session = await createSession();
  const base = session.origin;

  // GET edit page for CSRF + existing values
  const editHtml = await session.fetchText(`${base}/admin/treatment/${treatmentId}/edit`);
  if (!editHtml.includes('_method')) {
    const err = new Error(`Treatment ${treatmentId} ไม่พบใน ProClinic`);
    err.notFound = true;
    throw err;
  }

  const csrf = extractCSRF(editHtml);
  if (!csrf) throw new Error('ไม่พบ CSRF token ในหน้า treatment edit');

  const existing = extractFormFields(editHtml);

  // Build form data — overlay provided fields on existing
  const formData = new URLSearchParams();
  formData.set('_token', csrf);
  formData.set('_method', 'PUT');
  formData.set('customer_id', existing.customer_id || '');

  // Doctor & assistants
  formData.set('doctor_id', treatment.doctorId ?? existing.doctor_id ?? '');
  if (treatment.assistantIds?.length) {
    treatment.assistantIds.forEach(id => formData.append('doctor_assistant_id[]', id));
  } else if (existing['doctor_assistant_id[]']) {
    // Preserve existing
    const val = existing['doctor_assistant_id[]'];
    (Array.isArray(val) ? val : [val]).forEach(id => {
      if (id) formData.append('doctor_assistant_id[]', id);
    });
  }

  // Date
  formData.set('treatment_date', treatment.treatmentDate ?? existing.treatment_date ?? '');

  // OPD Card
  formData.set('symptoms', treatment.symptoms ?? existing.symptoms ?? '');
  formData.set('physical_exam', treatment.physicalExam ?? existing.physical_exam ?? '');
  formData.set('diagnosis', treatment.diagnosis ?? existing.diagnosis ?? '');
  formData.set('treatment_information', treatment.treatmentInfo ?? existing.treatment_information ?? '');
  formData.set('treatment_plan', treatment.treatmentPlan ?? existing.treatment_plan ?? '');
  formData.set('treatment_note', treatment.treatmentNote ?? existing.treatment_note ?? '');
  formData.set('additional_note', treatment.additionalNote ?? existing.additional_note ?? '');

  // Vitals
  const v = treatment.vitals || {};
  formData.set('ht_weight', v.weight ?? existing.ht_weight ?? '');
  formData.set('ht_height', v.height ?? existing.ht_height ?? '');
  formData.set('ht_body_temperature', v.temperature ?? existing.ht_body_temperature ?? '');
  formData.set('ht_pulse_rate', v.pulseRate ?? existing.ht_pulse_rate ?? '');
  formData.set('ht_respiratory_rate', v.respiratoryRate ?? existing.ht_respiratory_rate ?? '');
  formData.set('ht_systolic_blood_pressure', v.systolicBP ?? existing.ht_systolic_blood_pressure ?? '');
  formData.set('ht_diastolic_blood_pressure', v.diastolicBP ?? existing.ht_diastolic_blood_pressure ?? '');
  formData.set('ht_oxygen_saturation', v.oxygenSaturation ?? existing.ht_oxygen_saturation ?? '');

  // Health info
  formData.set('customer_doctor_id', existing.customer_doctor_id || '');
  formData.set('blood_type', treatment.bloodType ?? existing.blood_type ?? '');
  formData.set('congenital_disease', treatment.congenitalDisease ?? existing.congenital_disease ?? '');
  formData.set('history_of_drug_allergy', treatment.drugAllergy ?? existing.history_of_drug_allergy ?? '');
  formData.set('ht_treatment_history', treatment.treatmentHistory ?? existing.ht_treatment_history ?? '');

  // Med cert (preserve existing)
  formData.set('med_cert_is_actually_come', existing.med_cert_is_actually_come || '0');
  formData.set('med_cert_is_rest', existing.med_cert_is_rest || '0');
  formData.set('med_cert_period', existing.med_cert_period || '');
  formData.set('med_cert_is_other', existing.med_cert_is_other || '0');
  formData.set('med_cert_other_detail', existing.med_cert_other_detail || '');

  // Consent (preserve)
  if (existing.consent_image) formData.set('consent_image', existing.consent_image);

  // Submit
  const updateRes = await session.fetch(`${base}/admin/treatment/${treatmentId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-TOKEN': csrf,
    },
    body: formData.toString(),
    redirect: 'manual',
  });

  const status = updateRes.status;
  if (status >= 300 && status < 400) {
    return res.status(200).json({ success: true });
  }

  const bodyHtml = await updateRes.text();
  const errors = extractValidationErrors(bodyHtml);
  if (errors) throw new Error(errors);

  return res.status(200).json({ success: true });
}

// ─── Action: delete — Cancel/delete treatment ──────────────────────────────

async function handleDelete(req, res) {
  const { treatmentId } = req.body || {};
  if (!treatmentId) {
    return res.status(400).json({ success: false, error: 'Missing treatmentId' });
  }

  const session = await createSession();
  const base = session.origin;

  // GET any page for CSRF
  const editHtml = await session.fetchText(`${base}/admin/treatment/${treatmentId}/edit`);
  const csrf = extractCSRF(editHtml);
  if (!csrf) throw new Error('ไม่พบ CSRF token');

  const deleteRes = await session.fetch(`${base}/admin/treatment/${treatmentId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-TOKEN': csrf,
    },
    body: `_method=DELETE&_token=${encodeURIComponent(csrf)}`,
    redirect: 'manual',
  });

  if (deleteRes.status >= 200 && deleteRes.status < 400) {
    return res.status(200).json({ success: true });
  }

  throw new Error(`Server ตอบกลับ status ${deleteRes.status}`);
}

// ─── Route handler ─────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await verifyAuth(req, res);
  if (!user) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { action } = req.body || {};

  try {
    switch (action) {
      case 'list':          return await handleList(req, res);
      case 'get':           return await handleGet(req, res);
      case 'getCreateForm': return await handleGetCreateForm(req, res);
      case 'create':        return await handleCreate(req, res);
      case 'update':        return await handleUpdate(req, res);
      case 'delete':        return await handleDelete(req, res);
      default:
        return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
    }
  } catch (err) {
    const resp = { success: false, error: err.message || 'Unknown error' };
    if (err.sessionExpired) resp.sessionExpired = true;
    if (err.extensionNeeded) resp.extensionNeeded = true;
    if (err.notFound) resp.notFound = true;
    return res.status(200).json(resp);
  }
}
