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

// ─── Action: getMedicationGroups — Fetch medication groups with products ─────

async function handleGetMedicationGroups(req, res) {
  const { productType } = req.body || {};
  const session = await createSession();
  const base = session.origin;

  const type = productType || 'ยากลับบ้าน';
  const apiUrl = `${base}/admin/api/product-group?product_type=${encodeURIComponent(type)}`;
  const resp = await session.fetch(apiUrl, {
    headers: { 'Accept': 'application/json' },
  });

  if (!resp.ok) throw new Error(`ProClinic product-group API error: ${resp.status}`);
  const data = await resp.json();

  // Normalize groups + embedded products
  const groups = (data.data || []).map(g => ({
    id: g.id,
    name: g.group_name,
    productType: g.product_type,
    products: (g.products || []).map(p => ({
      id: p.id,
      name: p.product_name,
      unit: p.unit_name,
      price: p.price || '0',
      qty: p.pivot?.qty || '1',
      isVatIncluded: p.is_vat_included || 0,
      category: p.product_category?.category_name || '',
      label: p.product_label ? {
        genericName: p.product_label.generic_name || '',
        dosageAmount: p.product_label.dosage_amount || '',
        dosageUnit: p.product_label.dosage_unit || '',
        timesPerDay: p.product_label.times_per_day || '',
        administrationMethod: p.product_label.administration_method || '',
        administrationTimes: p.product_label.administration_times || '',
        instructions: p.product_label.instructions || '',
      } : null,
    })),
  }));

  return res.status(200).json({ success: true, groups });
}

// ─── Action: searchProducts — Search ProClinic products via JSON API ───────

async function handleSearchProducts(req, res) {
  const { productType, query, isTakeaway, perPage } = req.body || {};
  const session = await createSession();
  const base = session.origin;

  const params = new URLSearchParams();
  if (productType) params.set('product_type', productType);
  if (query) params.set('q', query);
  if (isTakeaway) params.set('is_takeaway_product', '1');
  if (perPage) params.set('per_page', String(perPage));

  const apiUrl = `${base}/admin/api/v2/product?${params.toString()}`;
  const resp = await session.fetch(apiUrl, {
    headers: { 'Accept': 'application/json' },
  });

  if (!resp.ok) throw new Error(`ProClinic product API error: ${resp.status}`);
  const data = await resp.json();

  // Normalize products
  const products = (data.data || []).map(p => ({
    id: p.id,
    name: p.product_name,
    unit: p.unit_name,
    price: p.price || '0',
    type: p.product_type,
    category: p.product_category?.category_name || '',
    isVatIncluded: p.is_vat_included || 0,
    label: p.product_label ? {
      genericName: p.product_label.generic_name || '',
      dosageAmount: p.product_label.dosage_amount || '',
      dosageUnit: p.product_label.dosage_unit || '',
      timesPerDay: p.product_label.times_per_day || '',
      administrationMethod: p.product_label.administration_method || '',
      administrationTimes: p.product_label.administration_times || '',
      instructions: p.product_label.instructions || '',
      indications: p.product_label.indications || '',
    } : null,
  }));

  return res.status(200).json({ success: true, products, total: data.total || products.length });
}

// ── List purchasable items (courses/promotions/retail products) ──────────────
async function handleListItems(req, res) {
  const { itemType, query, page } = req.body || {};
  const session = await createSession();
  const base = session.origin;

  // itemType: 'course' | 'promotion' | 'product'
  const type = itemType || 'course';
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  params.set('page', String(page || 1));

  // Fetch all pages to get complete data
  const allItems = [];
  let totalItems = 0;
  for (let p = 1; ; p++) {
    params.set('page', String(p));
    const apiUrl = `${base}/admin/api/item/${type}?${params.toString()}`;
    const resp = await session.fetch(apiUrl, { headers: { 'Accept': 'application/json' } });
    if (!resp.ok) throw new Error(`ProClinic item API error: ${resp.status}`);
    const data = await resp.json();
    totalItems = data.total || 0;
    const items = data.data || [];
    allItems.push(...items);
    if (p >= (data.last_page || 1)) break;
    if (p >= 20) break; // safety limit
  }

  // Normalize based on type
  const normalized = allItems.map(item => {
    if (type === 'course') {
      return {
        id: item.id,
        name: item.course_name,
        price: item.sale_price || item.full_price || '0',
        unit: 'คอร์ส',
        category: item.course_category_name || '',
        isVatIncluded: item.is_including_vat || 0,
        isDf: item.is_df || 0,
        itemType: 'course',
      };
    } else if (type === 'promotion') {
      return {
        id: item.id,
        name: item.promotion_name,
        price: item.sale_price || '0',
        unit: 'โปรโมชัน',
        category: '',
        isVatIncluded: 0,
        itemType: 'promotion',
      };
    } else {
      return {
        id: item.id,
        name: item.product_name,
        price: item.price || '0',
        unit: item.unit_name || '',
        category: item.product_category_name || '',
        isVatIncluded: item.is_including_vat || 0,
        isDf: item.is_df || 0,
        itemType: 'product',
      };
    }
  });

  // Extract unique categories for sidebar
  const categories = [...new Set(normalized.map(i => i.category).filter(Boolean))];

  return res.status(200).json({ success: true, items: normalized, total: totalItems, categories });
}

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

  // Medical cert
  formData.set('med_cert_is_actually_come', treatment.medCertActuallyCome ? '1' : '0');
  formData.set('med_cert_is_rest', treatment.medCertIsRest ? '1' : '0');
  formData.set('med_cert_period', treatment.medCertPeriod || '');
  formData.set('med_cert_is_other', treatment.medCertIsOther ? '1' : '0');
  formData.set('med_cert_other_detail', treatment.medCertOtherDetail || '');

  // Course items — array of { rowId } selected from customer courses
  if (treatment.courseItems?.length) {
    treatment.courseItems.forEach(item => {
      formData.append('rowId[]', item.rowId);
    });
  }

  // Courses & products JSON (ProClinic expects these as JSON strings)
  formData.set('courses', treatment.coursesJson || '');
  formData.set('products', treatment.productsJson || '');
  formData.set('appointment_id', treatment.appointmentId || '');
  formData.set('treatment_id', '');

  // Take-home medications (dynamic rows)
  if (treatment.medications?.length) {
    treatment.medications.forEach((med, i) => {
      formData.append('takeaway_product_name[]', med.name || '');
      formData.append('takeaway_product_dosage[]', med.dosage || '');
      formData.append('takeaway_product_qty[]', med.qty || '');
      formData.append('takeaway_product_unit_price[]', med.unitPrice || '');
    });
  }

  // Insurance
  formData.set('benefit_type', treatment.benefitType || '');
  formData.set('insurance_company_id', treatment.insuranceCompanyId || '');
  formData.set('customer_insurance_benefit_id', treatment.customerInsuranceBenefitId || '');

  // Sale/payment
  const saleDate = treatment.treatmentDate || defaults.sale_date || new Date().toISOString().slice(0, 10);
  formData.set('sale_date', saleDate);
  formData.set('coupon_code', treatment.couponCode || '');
  formData.set('sale_note', treatment.saleNote || '');

  // Payment — default to "pay later" (ชำระภายหลัง)
  formData.set('payment_type', treatment.paymentType || 'pay_later');
  formData.set('payment_date', treatment.paymentDate || saleDate);
  formData.set('payment_time', treatment.paymentTime || '');
  formData.set('payment_channel_id', treatment.paymentChannelId || '');

  // Sellers (sales staff commission)
  for (let i = 1; i <= 5; i++) {
    formData.set(`seller_${i}_id`, treatment[`seller${i}Id`] || '');
    formData.set(`seller_${i}_rate`, treatment[`seller${i}Rate`] || '');
  }

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
      case 'searchProducts': return await handleSearchProducts(req, res);
      case 'getMedicationGroups': return await handleGetMedicationGroups(req, res);
      case 'listItems':          return await handleListItems(req, res);
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
