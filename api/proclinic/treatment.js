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

const APP_ID = process.env.FIREBASE_APP_ID || 'loverclinic-opd-4c39b';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${APP_ID}/databases/(default)/documents`;

// ─── Firestore backup for customer inventory (courses) ─────────────────────

async function saveInventoryToFirestore(customerId, courses) {
  const docPath = `artifacts/${APP_ID}/public/data/pc_inventory/${customerId}`;
  const courseValues = courses.map(c => ({
    mapValue: {
      fields: {
        courseId: { stringValue: c.courseId || '' },
        customerCourseId: { integerValue: String(c.customerCourseId || 0) },
        courseName: { stringValue: c.courseName || '' },
        courseType: { stringValue: c.courseType || '' },
        qty: { stringValue: String(c.qty || '0') },
        promotionId: c.promotionId ? { integerValue: String(c.promotionId) } : { nullValue: null },
        products: {
          arrayValue: {
            values: c.products.map(p => ({
              mapValue: {
                fields: {
                  rowId: { stringValue: p.rowId || '' },
                  productId: { integerValue: String(p.productId || 0) },
                  name: { stringValue: p.name || '' },
                  unit: { stringValue: p.unit || '' },
                  remaining: { stringValue: String(p.remaining || '0') },
                  qty: { stringValue: String(p.qty || '0') },
                  used: { stringValue: String(p.used || '0') },
                },
              },
            })),
          },
        },
      },
    },
  }));

  const fields = {
    customerId: { stringValue: String(customerId) },
    courses: { arrayValue: { values: courseValues.length ? courseValues : [] } },
    syncedAt: { stringValue: new Date().toISOString() },
    totalCourses: { integerValue: String(courses.length) },
  };
  const mask = Object.keys(fields).map(f => `updateMask.fieldPaths=${f}`).join('&');
  await fetch(`${FIRESTORE_BASE}/${docPath}?${mask}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  console.log(`[treatment] inventory saved to Firestore for customer ${customerId} — ${courses.length} courses`);
}

async function saveDoctorDataToFirestore(doctors, assistants) {
  const docPath = `artifacts/${APP_ID}/public/data/pc_doctors/all`;
  const toMap = (arr) => arr.map(d => ({
    mapValue: {
      fields: {
        id: { stringValue: String(d.id || '') },
        name: { stringValue: d.name || '' },
        dfGroupId: { stringValue: String(d.dfGroupId || '') },
      },
    },
  }));
  const fields = {
    doctors: { arrayValue: { values: toMap(doctors) } },
    assistants: { arrayValue: { values: toMap(assistants) } },
    syncedAt: { stringValue: new Date().toISOString() },
  };
  const mask = Object.keys(fields).map(f => `updateMask.fieldPaths=${f}`).join('&');
  await fetch(`${FIRESTORE_BASE}/${docPath}?${mask}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

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

  // Fetch treatment create page (for form options) AND inventory API (for courses) in parallel
  const [html, inventoryData] = await Promise.all([
    session.fetchText(`${base}/admin/treatment/create?customer_id=${customerId}`),
    (async () => {
      try {
        const invResp = await session.fetch(`${base}/admin/api/customer/${customerId}/inventory`, {
          headers: { 'Accept': 'application/json' },
        });
        if (!invResp.ok) {
          console.warn(`[treatment] inventory API HTTP ${invResp.status}`);
          return null;
        }
        return await invResp.json();
      } catch (err) {
        console.warn('[treatment] inventory API error:', err.message);
        return null;
      }
    })(),
  ]);

  const options = extractTreatmentCreateOptions(html);

  // Use inventory API data for courses (JS-rendered, not in static HTML)
  if (inventoryData) {
    const courses = (inventoryData.customer_courses || []).map(c => ({
      courseId: c.rowId,
      customerCourseId: c.id,
      courseName: c.course?.course_name || '',
      courseType: c.course?.course_type || '',
      qty: c.qty,
      promotionId: c.customer_promotion_id || null,
      products: (c.available_customer_products || []).map(p => ({
        rowId: p.rowId,
        productId: p.product_id,
        name: p.product?.product_name || '',
        unit: p.product?.unit_name || '',
        remaining: p.remaining_qty || '0',
        qty: p.qty || '0',
        used: p.used_qty || '0',
        isMainProduct: p.is_main_product || 0,
      })),
    }));
    options.customerCourses = courses;
    options.customerProducts = inventoryData.customer_products || [];
    console.log(`[treatment] inventory API — ${courses.length} courses, ${courses.reduce((s, c) => s + c.products.length, 0)} products`);

    // Save inventory to Firestore as backup (async, don't block response)
    saveInventoryToFirestore(customerId, courses).catch(err =>
      console.warn('[treatment] Firestore inventory backup failed:', err.message)
    );
  }

  // Save doctor/assistant dfGroupId data to Firestore backup (async)
  if (options.doctors?.length || options.assistants?.length) {
    saveDoctorDataToFirestore(options.doctors || [], options.assistants || []).catch(err =>
      console.warn('[treatment] Firestore doctor backup failed:', err.message)
    );
  }

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

  // Get existing form defaults — ALL hidden fields, pre-filled values, etc.
  const defaults = extractFormFields(createHtml);

  // ─── Build form data ────────────────────────────────────────────────────
  // CRITICAL: Start with ALL defaults from the create page. ProClinic has
  // hidden required fields (branch_id, form tokens, etc.) that we must preserve.
  // Then override with our specific values.
  const formData = new URLSearchParams();

  // Step 1: Copy ALL defaults (preserves hidden fields we don't know about)
  for (const [key, val] of Object.entries(defaults)) {
    // Skip array fields (they use [] suffix) — we handle those explicitly
    if (key.endsWith('[]')) continue;
    formData.set(key, val);
  }

  // Step 2: Override with CSRF + required identifiers
  formData.set('_token', csrf);
  formData.set('sale_type', 'customer');
  formData.set('customer_id', customerId);

  // Doctor & assistants
  formData.set('doctor_id', treatment.doctorId || defaults.doctor_id || '');
  // Delete any default assistant value and append our array
  formData.delete('doctor_assistant_id[]');
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

  // Course items — array of { rowId, qty } selected from customer courses
  formData.delete('rowId[]');
  // Also clean any existing rowId_*_qty fields from defaults
  for (const key of [...formData.keys()]) {
    if (key.startsWith('rowId_') && key.endsWith('_qty')) formData.delete(key);
  }
  if (treatment.courseItems?.length) {
    treatment.courseItems.forEach(item => {
      formData.append('rowId[]', item.rowId);
      // ProClinic requires qty field for each checked course item
      formData.set(`rowId_${item.rowId}_qty`, String(item.qty || 1));
    });
  }

  // Doctor fees (ค่ามือแพทย์) — df_ hidden fields required by ProClinic
  const dfDoctors = [treatment.doctorId, ...(treatment.assistantIds || [])].filter(Boolean);
  const checkedRowIds = (treatment.courseItems || []).map(item => item.rowId);
  const doctorFees = treatment.doctorFees || [];
  // Clean any existing df_ fields from defaults
  for (const key of [...formData.keys()]) {
    if (key.startsWith('df_')) formData.delete(key);
  }
  if (dfDoctors.length > 0) {
    dfDoctors.forEach(docId => {
      const feeEntry = doctorFees.find(f => String(f.doctorId) === String(docId));
      formData.append('df_doctor_id[]', docId);
      formData.append('df_group_id[]', feeEntry?.groupId || '');
      // For each checked course product, set fee amount
      checkedRowIds.forEach(rowId => {
        formData.append(`df_rowId_${rowId}[]`, String(feeEntry?.fee || '0'));
        formData.append(`df_suggestion_rowId_${rowId}[]`, String(feeEntry?.fee || '0'));
        formData.append(`df_is_checked_rowId_${rowId}[]`, '1');
      });
    });
    console.log(`[treatment] create — df_ fields: ${dfDoctors.length} doctors x ${checkedRowIds.length} rowIds`);
  }

  // Purchased items → courses/products JSON
  // ProClinic expects JSON strings: courses (คอร์ส+โปรโมชัน), products (สินค้าหน้าร้าน)
  const purchasedCourses = (treatment.purchasedItems || []).filter(p => p.itemType === 'course' || p.itemType === 'promotion');
  const purchasedProducts = (treatment.purchasedItems || []).filter(p => p.itemType === 'retail' || p.itemType === 'product');
  formData.set('courses', purchasedCourses.length ? JSON.stringify(purchasedCourses.map(p => ({
    id: p.id, name: p.name, qty: String(p.qty || 1), price: String(p.unitPrice || 0), unit: p.unit || '',
  }))) : '');
  formData.set('products', purchasedProducts.length ? JSON.stringify(purchasedProducts.map(p => ({
    id: p.id, name: p.name, qty: String(p.qty || 1), price: String(p.unitPrice || 0), unit: p.unit || '',
  }))) : '');
  formData.set('appointment_id', treatment.appointmentId || '');
  formData.set('treatment_id', '');

  // Take-home medications (dynamic rows)
  formData.delete('takeaway_product_name[]');
  formData.delete('takeaway_product_dosage[]');
  formData.delete('takeaway_product_qty[]');
  formData.delete('takeaway_product_unit_price[]');
  if (treatment.medications?.length) {
    treatment.medications.forEach((med) => {
      formData.append('takeaway_product_name[]', med.name || '');
      formData.append('takeaway_product_dosage[]', med.dosage || '');
      formData.append('takeaway_product_qty[]', String(med.qty || ''));
      formData.append('takeaway_product_unit_price[]', String(med.unitPrice || ''));
    });
  }

  // Consumables (สินค้าสิ้นเปลือง)
  formData.delete('consumable_product_name[]');
  formData.delete('consumable_product_qty[]');
  if (treatment.consumables?.length) {
    treatment.consumables.forEach((c) => {
      formData.append('consumable_product_name[]', c.name || '');
      formData.append('consumable_product_qty[]', String(c.qty || 1));
    });
  }

  // Insurance
  formData.set('is_insurance_claimed', treatment.isInsuranceClaimed ? '1' : '0');
  formData.set('claim_type', treatment.claimType || '');
  formData.set('benefit_type', treatment.benefitType || '');
  formData.set('insurance_company_id', treatment.insuranceCompanyId || '');
  formData.set('customer_insurance_benefit_id', treatment.customerInsuranceBenefitId || '');
  formData.set('total_claim_amount', treatment.totalClaimAmount || '');

  // Sale/payment
  const saleDate = treatment.saleDate || treatment.treatmentDate || defaults.sale_date || new Date().toISOString().slice(0, 10);
  formData.set('sale_date', saleDate);
  formData.set('coupon_code', treatment.couponCode || '');
  formData.set('sale_note', treatment.saleNote || '');

  // Payment status — ProClinic uses: 0=ชำระภายหลัง, 2=ชำระเต็มจำนวน, 4=แบ่งชำระ
  formData.set('status', treatment.paymentStatus ?? '0');
  formData.set('payment_date', treatment.paymentDate || saleDate);
  // ProClinic always sends payment_time (HH:mm) — default to current time
  const now = new Date();
  const defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  formData.set('payment_time', treatment.paymentTime || defaultTime);

  // Payment methods (up to 3) — each has enable flag + channel + amount
  if (treatment.paymentMethod) {
    formData.set('hasPaymentMethod1', '1');
    formData.set('payment_method', treatment.paymentMethod);
    formData.set('paid_amount', treatment.paidAmount || '');
  }
  if (treatment.paymentMethod2) {
    formData.set('hasPaymentMethod2', '1');
    formData.set('payment_method_2', treatment.paymentMethod2);
    formData.set('paid_amount_2', treatment.paidAmount2 || '');
  }
  if (treatment.paymentMethod3) {
    formData.set('hasPaymentMethod3', '1');
    formData.set('payment_method_3', treatment.paymentMethod3);
    formData.set('paid_amount_3', treatment.paidAmount3 || '');
  }

  // Reference number & note
  formData.set('ref_no', treatment.refNo || '');
  formData.set('note', treatment.note || '');

  // Discount
  formData.set('discount', treatment.discount || '');
  formData.set('discount_type', treatment.discountType || defaults.discount_type || 'บาท');
  formData.set('medicine_discount_percent', treatment.medicineDiscountPercent || '');

  // Deposit & Wallet — ProClinic always sends these fields (default 0)
  formData.set('usingDeposit', treatment.useDeposit ? '1' : (defaults.usingDeposit || '1'));
  formData.set('deposit', treatment.depositAmount || '0');
  formData.set('customer_wallet_id', treatment.walletId || defaults.customer_wallet_id || '');
  formData.set('usingWallet', treatment.useWallet ? '1' : (defaults.usingWallet || '1'));
  formData.set('credit', treatment.walletAmount || '0');

  // Sellers (sales staff commission) — ProClinic always sends hasSeller1
  formData.set('hasSeller1', '1');
  for (let i = 1; i <= 5; i++) {
    const sId = treatment[`seller${i}Id`] || '';
    if (sId) {
      formData.set(`hasSeller${i}`, '1');
      formData.set(`seller_${i}_id`, sId);
      formData.set(`sale_percent_${i}`, treatment[`sellerPercent${i}`] || (i === 1 ? '100' : ''));
      formData.set(`sale_total_${i}`, treatment[`sellerTotal${i}`] || '');
    }
  }

  // Log all fields for debugging
  const allEntries = [...formData.entries()];
  console.log(`[treatment] create — submitting ${allEntries.length} fields for customer ${customerId}`);
  // Log df_ fields specifically
  const dfEntries = allEntries.filter(([k]) => k.startsWith('df_'));
  console.log(`[treatment] create — df_ fields (${dfEntries.length}):`, dfEntries.map(([k, v]) => `${k}=${v}`).join(', '));
  // Log key fields
  console.log(`[treatment] create — doctor_id=${formData.get('doctor_id')}, rowId[]=${formData.getAll('rowId[]').join(',')}, courseItems=${treatment.courseItems?.length || 0}`);

  // Submit — ProClinic redirects (302) on success, returns 200 with form on failure
  const submitRes = await session.fetch(`${base}/admin/treatment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-TOKEN': csrf,
      'Referer': `${base}/admin/treatment/create?customer_id=${customerId}`,
    },
    body: formData.toString(),
    redirect: 'manual',
  });

  const httpStatus = submitRes.status;
  const location = submitRes.headers?.get?.('location') || '';

  // Redirect handling — verify it's a real success, not a redirect to login or back to create form
  if (httpStatus >= 300 && httpStatus < 400) {
    // Redirect to login = session expired
    if (location.includes('/login')) {
      console.warn(`[treatment] create FAILED — redirected to login: ${location}`);
      throw new Error('Session หมดอายุ — กรุณาลองใหม่');
    }
    // Redirect back to create form = validation failed — follow to extract actual errors
    if (location.includes('/treatment/create')) {
      console.warn(`[treatment] create FAILED — redirected back to create form: ${location}`);
      try {
        const errorPageHtml = await session.fetchText(location.startsWith('http') ? location : `${base}${location}`);
        const validationErrors = extractValidationErrors(errorPageHtml);
        if (validationErrors) {
          console.warn(`[treatment] create validation errors: ${validationErrors}`);
          throw new Error(`ProClinic validation: ${validationErrors}`);
        }
        // Also check for session flash error messages (Laravel puts them in .alert-danger)
        const $ = (await import('cheerio')).load(errorPageHtml);
        const flashErrors = [];
        $('ul.alert-danger li, .alert-danger').each((_, el) => {
          const t = $(el).text().trim();
          if (t) flashErrors.push(t);
        });
        if (flashErrors.length) {
          const msg = flashErrors.join('; ').substring(0, 300);
          console.warn(`[treatment] create flash errors: ${msg}`);
          throw new Error(`ProClinic: ${msg}`);
        }
      } catch (followErr) {
        if (followErr.message.startsWith('ProClinic')) throw followErr;
        console.warn(`[treatment] create — could not follow redirect: ${followErr.message}`);
      }
      throw new Error('ProClinic ไม่รับข้อมูล — redirect กลับหน้า create (ไม่พบ error message เฉพาะ)');
    }
    // Valid success: redirect to treatment/{id}/edit or customer/{id}
    const m = location.match(/treatment\/(\d+)/);
    const newTreatmentId = m ? m[1] : null;
    // Follow redirect to verify the treatment actually exists
    if (!newTreatmentId && location.includes('/customer/')) {
      // Redirected to customer page — treatment may or may not have been created
      // Follow to check for success flash message or new treatment
      console.log(`[treatment] create — redirect to customer page: ${location} (verifying...)`);
      try {
        const verifyHtml = await session.fetchText(location);
        // ProClinic shows alert-success div on successful save
        if (verifyHtml.includes('alert-success') || verifyHtml.includes('บันทึกเรียบร้อย')) {
          console.log('[treatment] create SUCCESS — verified via customer page');
          return res.status(200).json({ success: true, treatmentId: null });
        }
        console.warn('[treatment] create — no success indicator on customer page');
        throw new Error('ไม่พบข้อมูลการรักษาใหม่ใน ProClinic — อาจบันทึกไม่สำเร็จ');
      } catch (verifyErr) {
        if (verifyErr.message.includes('ไม่พบ')) throw verifyErr;
        // Network error on verify — report the redirect as success with warning
        console.warn('[treatment] create — verify failed, assuming success from redirect:', verifyErr.message);
        return res.status(200).json({ success: true, treatmentId: null, warning: 'ไม่สามารถตรวจสอบผลลัพธ์ได้ — กรุณาเช็คใน ProClinic' });
      }
    }
    console.log(`[treatment] create SUCCESS — redirect to ${location}, treatmentId=${newTreatmentId}`);
    return res.status(200).json({ success: true, treatmentId: newTreatmentId });
  }

  // Status 200 = form re-rendered = submission FAILED (validation error or missing fields)
  const bodyHtml = await submitRes.text();

  // Try to extract specific validation errors
  const errors = extractValidationErrors(bodyHtml);
  if (errors) {
    console.warn(`[treatment] create FAILED — validation: ${errors}`);
    throw new Error(`ProClinic validation: ${errors}`);
  }

  // No specific error found — log body snippet for debugging
  const bodySnippet = bodyHtml.substring(0, 500).replace(/\s+/g, ' ');
  console.warn(`[treatment] create FAILED — status=${httpStatus}, no redirect, body snippet: ${bodySnippet}`);
  throw new Error(`สร้าง treatment ไม่สำเร็จ — ProClinic ไม่ redirect (status=${httpStatus}). อาจขาด field ที่จำเป็น`);
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

  // Build form data — start with ALL existing fields (preserves hidden required fields)
  const formData = new URLSearchParams();
  for (const [key, val] of Object.entries(existing)) {
    if (key.endsWith('[]')) continue;
    formData.set(key, val);
  }

  // Override CSRF + method
  formData.set('_token', csrf);
  formData.set('_method', 'PUT');

  // Doctor & assistants
  formData.set('doctor_id', treatment.doctorId ?? existing.doctor_id ?? '');
  formData.delete('doctor_assistant_id[]');
  if (treatment.assistantIds?.length) {
    treatment.assistantIds.forEach(id => formData.append('doctor_assistant_id[]', id));
  } else if (existing['doctor_assistant_id[]']) {
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

  // Insurance (preserve existing or use provided)
  formData.set('is_insurance_claimed', treatment.isInsuranceClaimed ? '1' : (existing.is_insurance_claimed || '0'));
  formData.set('claim_type', treatment.claimType ?? existing.claim_type ?? '');
  formData.set('benefit_type', treatment.benefitType ?? existing.benefit_type ?? '');
  formData.set('insurance_company_id', treatment.insuranceCompanyId ?? existing.insurance_company_id ?? '');
  formData.set('customer_insurance_benefit_id', treatment.customerInsuranceBenefitId ?? existing.customer_insurance_benefit_id ?? '');

  // Payment status — preserve existing or use provided
  formData.set('status', treatment.paymentStatus ?? existing.status ?? '0');
  formData.set('sale_date', existing.sale_date || treatment.treatmentDate || '');
  formData.set('payment_date', treatment.paymentDate ?? existing.payment_date ?? '');
  formData.set('payment_time', treatment.paymentTime ?? existing.payment_time ?? '');

  // Payment methods (preserve existing)
  if (treatment.paymentMethod || existing.payment_method) {
    formData.set('hasPaymentMethod1', '1');
    formData.set('payment_method', treatment.paymentMethod ?? existing.payment_method ?? '');
    formData.set('paid_amount', treatment.paidAmount ?? existing.paid_amount ?? '');
  }

  formData.set('ref_no', treatment.refNo ?? existing.ref_no ?? '');
  formData.set('note', treatment.note ?? existing.note ?? '');
  formData.set('sale_note', treatment.saleNote ?? existing.sale_note ?? '');
  formData.set('discount', treatment.discount ?? existing.discount ?? '');
  formData.set('discount_type', treatment.discountType ?? existing.discount_type ?? '');
  formData.set('medicine_discount_percent', treatment.medicineDiscountPercent ?? existing.medicine_discount_percent ?? '');

  // Deposit & Wallet (preserve existing)
  if (treatment.useDeposit || existing.usingDeposit) {
    formData.set('usingDeposit', '1');
    formData.set('*deposit', treatment.depositAmount ?? existing['*deposit'] ?? '');
  }
  if (treatment.useWallet || existing.usingWallet) {
    formData.set('usingWallet', '1');
    formData.set('customer_wallet_id', treatment.walletId ?? existing.customer_wallet_id ?? '');
    formData.set('*credit', treatment.walletAmount ?? existing['*credit'] ?? '');
  }

  // Sellers (preserve existing)
  for (let i = 1; i <= 5; i++) {
    const sId = treatment[`seller${i}Id`] || existing[`seller_${i}_id`] || '';
    if (sId) {
      formData.set(`hasSeller${i}`, '1');
      formData.set(`seller_${i}_id`, sId);
      formData.set(`sale_percent_${i}`, treatment[`sellerPercent${i}`] || existing[`sale_percent_${i}`] || (i === 1 ? '100' : ''));
      formData.set(`sale_total_${i}`, treatment[`sellerTotal${i}`] || existing[`sale_total_${i}`] || '');
    }
  }

  // Consent (preserve)
  if (existing.consent_image) formData.set('consent_image', existing.consent_image);

  // Submit
  const updateRes = await session.fetch(`${base}/admin/treatment/${treatmentId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-TOKEN': csrf,
      'Referer': `${base}/admin/treatment/${treatmentId}/edit`,
    },
    body: formData.toString(),
    redirect: 'manual',
  });

  const updateStatus = updateRes.status;
  const updateLocation = updateRes.headers?.get?.('location') || '';
  if (updateStatus >= 300 && updateStatus < 400) {
    if (updateLocation.includes('/login')) {
      throw new Error('Session หมดอายุ — กรุณาลองใหม่');
    }
    console.log(`[treatment] update SUCCESS — treatmentId=${treatmentId}, redirect to ${updateLocation}`);
    return res.status(200).json({ success: true });
  }

  const bodyHtml = await updateRes.text();
  const errors = extractValidationErrors(bodyHtml);
  if (errors) {
    console.warn(`[treatment] update FAILED — validation: ${errors}`);
    throw new Error(`ProClinic validation: ${errors}`);
  }

  const bodySnippet = bodyHtml.substring(0, 500).replace(/\s+/g, ' ');
  console.warn(`[treatment] update FAILED — status=${updateStatus}, body snippet: ${bodySnippet}`);
  throw new Error(`แก้ไข treatment ไม่สำเร็จ — status=${updateStatus}`);
}

// ─── Action: delete — Cancel/delete treatment ──────────────────────────────

async function handleDelete(req, res) {
  const { treatmentId, cancelDetail } = req.body || {};
  if (!treatmentId) {
    return res.status(400).json({ success: false, error: 'Missing treatmentId' });
  }

  const session = await createSession();
  const base = session.origin;

  // GET edit page for CSRF token
  const editHtml = await session.fetchText(`${base}/admin/treatment/${treatmentId}/edit`);
  const csrf = extractCSRF(editHtml);
  if (!csrf) throw new Error('ไม่พบ CSRF token');

  // ProClinic uses POST /admin/treatment/cancel with treatment_id + cancel_detail
  const cancelRes = await session.fetch(`${base}/admin/treatment/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-TOKEN': csrf,
      'Referer': `${base}/admin/treatment/${treatmentId}/edit`,
    },
    body: new URLSearchParams({
      _token: csrf,
      treatment_id: treatmentId,
      cancel_detail: cancelDetail || '',
    }).toString(),
    redirect: 'manual',
  });

  const status = cancelRes.status;
  // Success = redirect (302) to customer page or treatment page
  if (status >= 300 && status < 400) {
    const location = cancelRes.headers?.get?.('location') || '';
    if (location.includes('/login')) {
      throw new Error('Session หมดอายุ — กรุณาลองใหม่');
    }
    console.log(`[treatment] cancel SUCCESS — redirect to ${location}`);
    return res.status(200).json({ success: true });
  }

  // Check for errors in response
  if (status === 200) {
    const body = await cancelRes.text();
    const errors = extractValidationErrors(body);
    if (errors) throw new Error(`ProClinic: ${errors}`);
  }

  throw new Error(`ยกเลิกการรักษาไม่สำเร็จ — status ${status}`);
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
