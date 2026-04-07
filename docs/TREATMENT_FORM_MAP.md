# Treatment Form Map

> Complete field-by-field mapping: UI -> Frontend -> API -> ProClinic
> Updated: 2026-04-08

---

## Architecture

```
TreatmentFormPage.jsx (UI)
  -> handleSubmit() builds payload object
    -> POST /api/proclinic/treatment { action: 'create', treatment: {...} }
      -> handleCreate() in treatment.js
        -> Step 1: extractFormFields(createHtml) -> copy ALL hidden defaults
        -> Step 2: Override with explicit values from treatment object
        -> POST /admin/treatment (URLSearchParams, x-www-form-urlencoded)
```

**Key insight**: Step 1 copies every hidden input from ProClinic's form page. This captures fields we never explicitly set (branch_id, etc.). Step 2 overrides specific fields. This means any field we don't touch retains ProClinic's default value.

---

## Field Mapping: Frontend -> API -> ProClinic

### A. Core Identifiers (always sent)

| Frontend Key | API Code | ProClinic Field | Notes |
|---|---|---|---|
| (from route) | `customerId` | `customer_id` | ProClinic customer ID |
| — | hardcoded `''` | `treatment_id` | Always empty for create |
| — | hardcoded `'customer'` | `sale_type` | Fixed value |
| — | `extractCSRF()` | `_token` | CSRF from meta tag |

### B. Doctor & Date

| Frontend Key | API Code | ProClinic Field | UI Element |
|---|---|---|---|
| `doctorId` | `treatment.doctorId` | `doctor_id` | `<select>` dropdown |
| `assistantIds[]` | `treatment.assistantIds` | `doctor_assistant_id[]` | Toggle buttons (max 5) |
| `treatmentDate` | `treatment.treatmentDate` | `treatment_date` | `<input type="date">` YYYY-MM-DD |

**Fallbacks**: `doctor_id` -> defaults from ProClinic page. `treatment_date` -> Bangkok timezone today.

### C. OPD Card (Text Fields)

| Frontend Key | ProClinic Field | UI Element |
|---|---|---|
| `opd.symptoms` | `symptoms` | `<textarea>` |
| `opd.physicalExam` | `physical_exam` | `<textarea>` |
| `opd.diagnosis` | `diagnosis` | `<textarea>` |
| `opd.treatmentInfo` | `treatment_information` | `<textarea>` |
| `opd.treatmentPlan` | `treatment_plan` | `<textarea>` |
| `opd.treatmentNote` | `treatment_note` | `<textarea>` |
| `opd.additionalNote` | `additional_note` | `<textarea>` |

All sent as-is (string). Empty string if not filled.

### D. Vital Signs

| Frontend Key | ProClinic Field | UI Element |
|---|---|---|
| `vitals.weight` | `ht_weight` | `<input>` |
| `vitals.height` | `ht_height` | `<input>` |
| `vitals.temperature` | `ht_body_temperature` | `<input>` |
| `vitals.pulseRate` | `ht_pulse_rate` | `<input>` |
| `vitals.respiratoryRate` | `ht_respiratory_rate` | `<input>` |
| `vitals.systolicBP` | `ht_systolic_blood_pressure` | `<input>` |
| `vitals.diastolicBP` | `ht_diastolic_blood_pressure` | `<input>` |
| `vitals.oxygenSaturation` | `ht_oxygen_saturation` | `<input>` |

All strings. Empty = not filled. BMI is calculated in frontend but NOT sent (ProClinic calculates server-side).

### E. Health Info

| Frontend Key | ProClinic Field | Notes |
|---|---|---|
| `bloodType` | `blood_type` | Select or free text |
| `congenitalDisease` | `congenital_disease` | Textarea |
| `drugAllergy` | `history_of_drug_allergy` | Textarea |
| `treatmentHistory` | `ht_treatment_history` | Textarea |

Fallback: ProClinic defaults from page (customer's saved health info).

### F. Medical Certificate

| Frontend Key | ProClinic Field | Type |
|---|---|---|
| `medCertActuallyCome` | `med_cert_is_actually_come` | `'1'` / `'0'` (from boolean) |
| `medCertIsRest` | `med_cert_is_rest` | `'1'` / `'0'` |
| `medCertPeriod` | `med_cert_period` | Free text |
| `medCertIsOther` | `med_cert_is_other` | `'1'` / `'0'` |
| `medCertOtherDetail` | `med_cert_other_detail` | Free text |

### G. Course Items (checked courses to deduct)

Frontend `courseItems` = array of `{ rowId, qty }` from checked products in course/promotion columns.

| ProClinic Field | Method | Source |
|---|---|---|
| `rowId[]` | `.append()` per item | `item.rowId` from courseItems |
| `rowId_{rowId}_qty` | `.set()` per item | `item.qty` (default '1') |

**Important**: Existing defaults for `rowId[]` and `rowId_*_qty` are **deleted** before appending.

### H. Doctor Fees (df_ hidden fields)

Doctor list = `[doctorId, ...assistantIds]`. For each doctor + each checked rowId:

| ProClinic Field | Method | Source |
|---|---|---|
| `df_doctor_id[]` | `.append()` | Doctor/assistant ID |
| `df_group_id[]` | `.append()` | From `doctorFees[].groupId` |
| `df_rowId_{rowId}[]` | `.append()` | From `doctorFees[].fee` or `'0'` |
| `df_suggestion_rowId_{rowId}[]` | `.append()` | Same as fee |
| `df_is_checked_rowId_{rowId}[]` | `.append()` | Always `'1'` |

**Note**: `df_doctor_id[]` and `df_group_id[]` are appended once per doctor. `df_rowId_*` fields are appended once per doctor per rowId (cross product).

### I. Purchased Items (new purchases)

| ProClinic Field | Source | Format |
|---|---|---|
| `courses` | purchasedItems where itemType = 'course' or 'promotion' | JSON string: `[{id, name, qty, price, unit}]` |
| `products` | purchasedItems where itemType = 'product' or 'retail' | JSON string: `[{id, name, qty, price, unit}]` |

Empty string if none.

### J. Take-Home Medications

Array fields (`.append()` per medication):

| ProClinic Field | Source |
|---|---|
| `takeaway_product_name[]` | `med.name` |
| `takeaway_product_dosage[]` | `med.dosage` |
| `takeaway_product_qty[]` | `med.qty` |
| `takeaway_product_unit_price[]` | `med.unitPrice` |

Existing defaults **deleted** before appending.

### K. Consumables

Array fields (`.append()` per consumable):

| ProClinic Field | Source |
|---|---|
| `consumable_product_name[]` | `c.name` |
| `consumable_product_qty[]` | `c.qty` |

### L. Insurance

Only sent when `treatment.isInsuranceClaimed` is truthy:

| Frontend Key | ProClinic Field |
|---|---|
| (hardcoded `'1'`) | `is_insurance_claimed` |
| `benefitType` | `benefit_type` |
| `insuranceCompanyId` | `insurance_company_id` |
| `insuranceClaimAmount` | `total_claim_amount` |

**Known gap**: `claim_type` and `customer_insurance_benefit_id` exist in API but are never sent from frontend (always empty/default).

### M. Billing & Discount

Only sent when `hasSale` is true (user toggled sale section):

| Frontend Key | ProClinic Field | Notes |
|---|---|---|
| `saleDate` | `sale_date` | YYYY-MM-DD |
| `billing.medDiscPct` | `medicine_discount_percent` | Auto-calculated percentage |
| `billDiscount` | `discount` | Raw user input (not pre-calculated) |
| `billDiscountType` -> `'บาท'`/`'%'` | `discount_type` | Mapped from internal `'amount'`/`'percent'` |
| `couponCode` | `coupon_code` | Free text |
| `saleNote` | `sale_note` | Free text |

### N. Payment Status

| Frontend Key | ProClinic Field | Values |
|---|---|---|
| `paymentStatus` | `status` | `'0'`=ชำระภายหลัง, `'2'`=ชำระเต็มจำนวน, `'4'`=แบ่งชำระ |

**Critical**: When `paymentStatus` is empty/null, `status` is **deleted** from form data. ProClinic then defaults to "สำเร็จ" (completed). Sending `status=0` creates draft.

### O. Payment Methods (up to 3)

| Frontend | ProClinic (method 1) | ProClinic (method 2) | ProClinic (method 3) |
|---|---|---|---|
| `pmChannels[0].method` | `payment_method` | — | — |
| `pmChannels[0].amount` | `paid_amount` | — | — |
| `pmChannels[1].method` | — | `payment_method_2` | — |
| `pmChannels[1].amount` | — | `paid_amount_2` | — |
| `pmChannels[2].method` | — | — | `payment_method_3` |
| `pmChannels[2].amount` | — | — | `paid_amount_3` |

Each pair has a `hasPaymentMethod{N}` flag set to `'1'` when that channel is active.

### P. Payment Dates

| Frontend Key | ProClinic Field | Notes |
|---|---|---|
| `paymentDate` | `payment_date` | YYYY-MM-DD, fallback: saleDate |
| `paymentTime` | `payment_time` | HH:mm, fallback: current Bangkok time |
| `refNo` | `ref_no` | Reference number text |
| `note` | `note` | Payment note |

### Q. Deposit & Wallet

| Frontend Key | ProClinic Field | Notes |
|---|---|---|
| `useDeposit` | `usingDeposit` | `'1'` only when checked, `'0'` otherwise |
| `depositAmount` | `deposit` | Amount, `'0'` if not using |
| `walletId` | `customer_wallet_id` | Wallet ID from select |
| `useWallet` | `usingWallet` | `'1'` only when checked, `'0'` otherwise |
| `walletAmount` | `credit` | Amount, `'0'` if not using |

### R. Sellers (Sales Commission, up to 5)

`hasSeller1` is always `'1'` (ProClinic requires it). For seller 2-5, only sent when selected.

| Frontend (per seller i) | ProClinic Field |
|---|---|
| `pmSellers[i].id` | `seller_{i+1}_id` |
| `pmSellers[i].percent` | `sale_percent_{i+1}` |
| `pmSellers[i].total` | `sale_total_{i+1}` |

Seller 1 defaults `sale_percent_1 = '100'`. Others default to `''`.

---

## ProClinic Form Behavior & Gotchas

### 1. Content-Type
Our API sends `application/x-www-form-urlencoded`. ProClinic's native form uses `multipart/form-data`. Basic fields work with both, but course items (rowId[], df_*) may behave differently. **This is the suspected root cause of course items not appearing in treatment detail**.

### 2. Vue.js Dynamic Fields
ProClinic's treatment create page uses Vue.js to render the course/promotion section. Hidden fields (`rowId[]`, `df_*`) are generated by JavaScript at submit time, not present in static HTML. Our API replicates this by building the fields manually.

### 3. Status Field Behavior
- **Absent** (not in form data) = ProClinic creates as "สำเร็จ" (completed)
- `status=0` = "แบบร่าง" (draft) - hidden from default treatment list!
- `status=2` = "ชำระเต็มจำนวน" (paid in full)
- `status=4` = "แบ่งชำระ" (partial payment)

### 4. hasSale Toggle
Frontend has a `hasSale` toggle. When false, ALL billing/payment fields are omitted from the payload. This means ProClinic gets only the medical record (OPD card) without a sale.

### 5. Redirect Patterns
- `302 -> /admin/customer/{id}` = success (no treatment ID in URL, verify via list comparison)
- `302 -> /admin/treatment/{id}/edit` = success (treatment ID in URL)
- `302 -> /admin/treatment/create` = validation failure
- `302 -> /login` = session expired
- `200` = form re-rendered with validation errors

### 6. Default Fields (Step 1)
`extractFormFields()` copies ALL hidden inputs from ProClinic's create page. This includes:
- `branch_id` (clinic branch)
- `claim_drug_discount_percent` (medicine discount percentage)
- Various IDs and tokens
- These survive into the submission unless explicitly overridden.

### 7. Array Field Encoding
`URLSearchParams.append('rowId[]', 'abc')` encodes as `rowId%5B%5D=abc`. PHP's `parse_str()` URL-decodes field names, so `rowId%5B%5D` becomes `rowId[]` and PHP correctly builds `$_POST['rowId'] = ['abc']`.

### 8. Timezone
All dates use Bangkok timezone (GMT+7):
- Frontend: `new Date()` local date methods (user's browser timezone)
- API: `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' })` for date
- API: `toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })` for time

---

## Bugs Fixed (2026-04-08)

| Bug | Before | After |
|---|---|---|
| discountType mismatch | Sent `'amount'`/`'percent'` | Now sends `'บาท'`/`'%'` (ProClinic format) |
| discount double-computation | Sent pre-computed amount with percent type | Now sends raw user input |
| usingDeposit/usingWallet default | Fallback to `'1'` even when unchecked | Now `'0'` when unchecked |
| med cert ignored in edit | hardcoded existing values | Now uses frontend values with existing fallback |

## Known Limitations

1. **Course items not appearing**: Treatment creates successfully but course deductions may not register. Suspected: missing Vue.js-injected fields or `multipart/form-data` requirement for course items.
2. **No file upload**: `treatment_file_1`, `treatment_file_2` are not supported (would need multipart/form-data).
3. **Insurance fields incomplete**: `claim_type` and `customer_insurance_benefit_id` are never set from frontend.
4. **Appointment link**: `appointment_id` is always empty (no UI to select appointment).
5. **Consumable pricing**: Consumables have no unit price in UI, so they don't contribute to billing.
