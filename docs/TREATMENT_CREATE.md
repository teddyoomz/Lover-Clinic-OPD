# ProClinic Treatment Create — Complete Field Map

> Updated: 2026-04-07 | Source: Reverse-engineered from `trial.proclinicth.com/admin/treatment/create`
> ใช้เป็น reference ทุกครั้งที่แก้ treatment.js หรือ TreatmentFormPage.jsx

---

## 🔗 URLs

| Action | URL | Method |
|--------|-----|--------|
| Create page | `/admin/treatment/create?customer_id={id}` | GET |
| Submit create | `/admin/treatment` | POST (form-urlencoded) |
| Edit page | `/admin/treatment/{id}/edit` | GET |
| Submit edit | `/admin/treatment/{id}` | POST + `_method=PUT` |
| Cancel | `/admin/treatment/cancel` | POST (`treatment_id` + `cancel_detail`) |
| Treatment list | `/admin/treatment?customer_id={id}` | GET |
| Customer courses | `/admin/api/customer/{id}/inventory` | GET (JSON) |
| Medication groups | `/admin/api/product-group?product_type=ยากลับบ้าน` | GET (JSON) |

---

## 📋 Form Fields — Complete Reference

### Section 1: Hidden Core Fields
เหล่านี้อยู่ใน HTML เป็น `<input type="hidden">` — ต้องส่งกลับไปทุกตัว

| Field Name | Type | Default | หมายเหตุ |
|------------|------|---------|----------|
| `_token` | hidden | (CSRF) | ดึงจาก `<meta name="csrf-token">` |
| `sale_type` | hidden | `customer` | คงที่ |
| `appointment_id` | hidden | `` | ใส่เมื่อสร้างจากนัดหมาย |
| `customer_id` | hidden | `{id}` | customer ID |
| `courses` | hidden | `` | JSON string ของคอร์สที่ซื้อใหม่ |
| `products` | hidden | `` | JSON string ของสินค้าหน้าร้านที่ซื้อ |
| `treatment_id` | hidden | `` | ว่างตอน create |
| `claim_drug_discount_percent` | hidden | `10` | % ส่วนลดยาเคลม — มาจาก clinic settings |
| `customer_doctor_id` | hidden | `{doctor_id}` | แพทย์ประจำตัวลูกค้า |

### Section 2: Health Info (ข้อมูลสุขภาพ)
Hidden fields ที่ pre-fill จากข้อมูลลูกค้า

| Field Name | Type | ตัวอย่าง |
|------------|------|----------|
| `blood_type` | hidden | `A`, `B`, `O`, `AB` |
| `congenital_disease` | hidden | โรคประจำตัว |
| `history_of_drug_allergy` | hidden | ประวัติแพ้ยา |

### Section 3: Vital Signs (สัญญาณชีพ)
Hidden fields — ต้อง set ค่าเมื่อมีข้อมูล, ว่างได้

| Field Name | หน่วย |
|------------|-------|
| `ht_weight` | kg |
| `ht_height` | cm |
| `ht_body_temperature` | °C |
| `ht_pulse_rate` | bpm |
| `ht_respiratory_rate` | /min |
| `ht_systolic_blood_pressure` | mmHg |
| `ht_diastolic_blood_pressure` | mmHg |
| `ht_oxygen_saturation` | % |
| `ht_treatment_history` | text |

### Section 4: Medical Certificate (ใบรับรองแพทย์)

| Field Name | Type | Values |
|------------|------|--------|
| `med_cert_is_actually_come` | hidden | `0` / `1` |
| `med_cert_is_rest` | hidden | `0` / `1` |
| `med_cert_period` | hidden | จำนวนวัน |
| `med_cert_is_other` | hidden | `0` / `1` |
| `med_cert_other_detail` | hidden | รายละเอียด |

### Section 5: Doctor & Date (แพทย์/ผู้ช่วย)

| Field Name | Type | หมายเหตุ |
|------------|------|----------|
| `doctor_id` | select | **required** — ID ของแพทย์ |
| `doctor_assistant_id[]` | select-multiple | ID ผู้ช่วยแพทย์ (หลายคนได้) |
| `treatment_date` | hidden | `YYYY-MM-DD` |

### Section 6: OPD Card (บันทึกการรักษา)
Textarea fields — ว่างได้ทั้งหมด

| Field Name | Label |
|------------|-------|
| `symptoms` | อาการ |
| `physical_exam` | การตรวจร่างกาย |
| `diagnosis` | การวินิจฉัย |
| `treatment_information` | รายละเอียดการรักษา |
| `treatment_plan` | แผนการรักษา |
| `treatment_note` | หมายเหตุ |
| `additional_note` | หมายเหตุเพิ่มเติม |

### Section 7: Treatment Files (ภาพประกอบ)

| Field Name | Type | หมายเหตุ |
|------------|------|----------|
| `treatment_file_1` | file | ภาพที่ 1 (ไม่ส่งจาก API) |
| `treatment_file_1_id` | hidden | ID ภาพที่ 1 |
| `treatment_file_2` | file | ภาพที่ 2 (ไม่ส่งจาก API) |
| `treatment_file_2_id` | hidden | ID ภาพที่ 2 |

### Section 8: Course Items (ตัดคอร์ส) ⚡ CRITICAL

| Field Name | Type | หมายเหตุ |
|------------|------|----------|
| `rowId[]` | checkbox | แต่ละ course product มี rowId เฉพาะ (เช่น `nf9pnvelj4jbc615-0`) |
| `rowId_{id}_qty` | hidden | **ต้องมี!** จำนวนที่ตัด — ปกติ `1` |

> ⚠️ **ข้อควรระวัง**: `rowId[]` เป็น checkbox — ส่งเฉพาะที่ checked
> ⚠️ **ข้อควรระวัง**: `rowId_{id}_qty` ต้องส่งคู่กับทุก `rowId[]` ที่ checked — ถ้าขาด ProClinic อาจ reject

**Course data source**: `/admin/api/customer/{id}/inventory` → `customer_courses[].available_customer_products[].rowId`
- NOT จาก HTML (courses render ด้วย Vue.js ไม่อยู่ใน static HTML)

---

## 🩺 Section 9: Doctor Fees (ค่ามือแพทย์) ⚡ CRITICAL

Vue.js renders ส่วนนี้ทั้งหมด — hidden fields ถูกสร้างแบบ dynamic

**Pattern**: สำหรับแต่ละแพทย์/ผู้ช่วย × แต่ละ checked course rowId:

| Field Name | ตัวอย่าง | หมายเหตุ |
|------------|----------|----------|
| `df_doctor_id[]` | `85` | ID แพทย์/ผู้ช่วย |
| `df_group_id[]` | `16` | กลุ่มค่ามือ (dfGroupId) — ดึงจาก HTML |
| `df_rowId_{rowId}[]` | `180` | จำนวนเงินค่ามือต่อรายการ |
| `df_suggestion_rowId_{rowId}[]` | `180` | ค่าแนะนำ (ปกติ = ค่ามือ) |
| `df_is_checked_rowId_{rowId}[]` | `1` | checkbox ว่ามีค่ามือหรือไม่ |

**ลำดับ**: แพทย์ → ผู้ช่วย 1 → ผู้ช่วย 2 (เรียงตาม df_doctor_id[])

**ตัวอย่าง** (แพทย์ id=85 + ผู้ช่วย id=95, id=97, course rowId=`nf9...`):
```
df_doctor_id[]=85
df_group_id[]=16
df_rowId_nf9pnvelj4jbc615-0[]=180
df_suggestion_rowId_nf9pnvelj4jbc615-0[]=180
df_is_checked_rowId_nf9pnvelj4jbc615-0[]=1
df_doctor_id[]=95
df_group_id[]=18
df_rowId_nf9pnvelj4jbc615-0[]=100
df_suggestion_rowId_nf9pnvelj4jbc615-0[]=100
df_is_checked_rowId_nf9pnvelj4jbc615-0[]=1
df_doctor_id[]=97
df_group_id[]=
df_rowId_nf9pnvelj4jbc615-0[]=0
df_suggestion_rowId_nf9pnvelj4jbc615-0[]=0
df_is_checked_rowId_nf9pnvelj4jbc615-0[]=1
```

**dfGroupId extraction**: อยู่ใน HTML เป็น HTML-encoded JSON
```js
const dfGroupRegex = /&quot;id&quot;:(\d+).*?&quot;df_group_id&quot;:(\d+)/g;
// → Map: doctorId → dfGroupId
```

> ⚠️ **พฤติกรรม ProClinic**: ถ้า user กดลบ df_ rows หมดใน UI → ProClinic ยอมรับ (ไม่บังคับ)
> แต่ถ้าส่ง df_ แบบผิด format → อาจ reject

---

## 💰 Section 10: Billing & Payment

### Insurance (ประกัน)

| Field Name | Type | หมายเหตุ |
|------------|------|----------|
| `is_insurance_claimed` | checkbox | **ไม่ checked = ไม่ส่ง** (ห้ามส่ง `0`) |
| `claim_type` | radio | ไม่ checked = ไม่ส่ง |
| `benefit_type` | text | ว่างได้ |
| `insurance_company_id` | text | ว่างได้ |
| `customer_insurance_benefit_id` | text | ว่างได้ |
| `company_name` | text | ว่างได้ |
| `company_tax_id` | text | ว่างได้ |
| `company_address` | text | ว่างได้ |
| `company_telephone_number` | text | ว่างได้ |
| `claim_number` | text | ว่างได้ |

### Discount & Coupon

| Field Name | Type | Default |
|------------|------|---------|
| `coupon_code` | text | `` |
| `discount` | text | `` |
| `discount_type` | select | `บาท` |
| `drug_discount_amount` | hidden | (auto-calc) |

### Deposit & Wallet (มัดจำ/เครดิต)

| Field Name | Type | Default | หมายเหตุ |
|------------|------|---------|----------|
| `usingDeposit` | hidden | `1` | **ส่งเสมอ** (ProClinic default) |
| `deposit` | hidden | `0` | จำนวนเงินมัดจำที่ใช้ |
| `customer_wallet_id` | hidden | `` | |
| `usingWallet` | hidden | `1` | **ส่งเสมอ** (ProClinic default) |
| `credit` | hidden | `0` | จำนวนเครดิตที่ใช้ |

> ⚠️ Field name คือ `deposit` / `credit` — ไม่ใช่ `*deposit` / `*credit`

### Sale & Payment

| Field Name | Type | Default | หมายเหตุ |
|------------|------|---------|----------|
| `sale_note` | text | `` | |
| `sale_date` | hidden | `YYYY-MM-DD` | |
| `payment_date` | hidden | `YYYY-MM-DD` | |
| `payment_time` | hidden | `HH:mm` | **ต้องมี** — ใช้เวลาปัจจุบัน |

### Payment Status ⚡ CRITICAL

| Field Name | Type | Values | หมายเหตุ |
|------------|------|--------|----------|
| `status` | **radio** | `4`=แบ่งชำระ, `2`=ชำระเต็มจำนวน, `0`=ชำระภายหลัง | **None checked by default** |

> ⚠️ **CRITICAL**: `status` เป็น radio button — ไม่มีอันไหน checked = **FormData ไม่ส่ง `status`**
> - ไม่ส่ง `status` → ProClinic สร้างเป็น **"สำเร็จ"** (default)
> - ส่ง `status=0` → สร้างเป็น **"แบบร่าง/ชำระภายหลัง"** (ถูก filter ในหน้ารายการ!)
> - ส่ง `status=2` → สร้างเป็น **"สำเร็จ"** + ชำระแล้ว
>
> **กฎ**: ตัดคอร์สอย่างเดียว (ไม่มี sale) → **ห้ามส่ง `status`**

### Payment Methods

| Field Name | Type | หมายเหตุ |
|------------|------|----------|
| `hasPaymentMethod1` | hidden | `1` เมื่อเปิดช่องทาง 1 |
| `payment_method` | select | ช่องทาง 1 (เงินสด, โอน, etc.) |
| `paid_amount` | text | จำนวนเงินช่อง 1 |
| `hasPaymentMethod2` | hidden | `1` เมื่อเปิดช่องทาง 2 |
| `payment_method_2` | select | ช่องทาง 2 |
| `paid_amount_2` | text | จำนวนเงินช่อง 2 |
| `hasPaymentMethod3` | hidden | `1` เมื่อเปิดช่องทาง 3 |
| `payment_method_3` | select | ช่องทาง 3 |
| `paid_amount_3` | text | จำนวนเงินช่อง 3 |
| `ref_no` | text | เลขที่อ้างอิง |
| `note` | text | หมายเหตุการชำระ |

### Sellers (พนักงานขาย)

| Field Name | Type | Default | หมายเหตุ |
|------------|------|---------|----------|
| `hasSeller1` | hidden | `1` | **ส่งเสมอ** (ProClinic default) |
| `seller_1_id` | select | `` | เฉพาะเมื่อมี sale |
| `sale_percent_1` | text | `100` | |
| `sale_total_1` | text | `` | |
| `hasSeller2`-`5` | hidden | `` | ช่อง 2-5 |

---

## 🔄 Submit & Redirect Behavior

### Create Flow
```
POST /admin/treatment (form-urlencoded, redirect: manual)
├── 302 → /admin/treatment/{id}/edit    → SUCCESS (มี treatment ID)
├── 302 → /admin/customer/{id}          → ต้อง VERIFY (อาจสำเร็จหรือไม่)
├── 302 → /admin/treatment/create       → FAIL (validation error)
├── 302 → /login                        → Session หมดอายุ
└── 200                                 → FAIL (form re-rendered with errors)
```

### Verification Strategy
1. **Pre-submit**: ดึง treatment list → จำ IDs ทั้งหมดที่มีอยู่
2. **Post-submit**: ดึง treatment list อีกครั้ง → หา entry ใหม่ที่ไม่เคยมี
3. **Date format**: ProClinic ใช้ `DD/MM/YYYY` ในตาราง (ไม่ใช่ `YYYY-MM-DD`)

### Treatment List Table Columns
```
เลขที่รักษา | ลูกค้า | แพทย์/ผู้ช่วย | รายการรักษา | สินค้าสิ้นเปลือง | รายละเอียด | หมายเหตุ | ค่ามือ | ต้นทุน | วันที่รักษา | สถานะ
```
- สถานะ: สำเร็จ / แบบร่าง / ยกเลิก
- Filter default อาจแสดงเฉพาะ "สำเร็จ"

### Error Messages
- ProClinic ใช้ **toastr** (JS toast) แสดงข้อความ — ไม่ใช่ HTML `.alert-success`
- Validation errors อาจอยู่ใน `.invalid-feedback`, `.alert-danger`, `.has-error .help-block`
- Flash errors จาก redirect อาจไม่เห็นใน static HTML

---

## ⚡ Medications (ยากลับบ้าน)

Array fields — ส่งทีละ row:

| Field Name | ตัวอย่าง |
|------------|----------|
| `takeaway_product_name[]` | ชื่อยา |
| `takeaway_product_dosage[]` | วิธีใช้ |
| `takeaway_product_qty[]` | จำนวน |
| `takeaway_product_unit_price[]` | ราคาต่อหน่วย |

## 📦 Consumables (สินค้าสิ้นเปลือง)

| Field Name | ตัวอย่าง |
|------------|----------|
| `consumable_product_name[]` | ชื่อสินค้า |
| `consumable_product_qty[]` | จำนวน |

---

## 🗂️ Data Sources — ข้อมูลที่ดึงมาจาก API

### Customer Courses
- **URL**: `/admin/api/customer/{id}/inventory`
- **Response**: `{ customer_courses: [{ course: {...}, available_customer_products: [{rowId, productId, name, unit, remaining, qty, used}] }] }`
- **Saved to Firebase**: `pc_inventory/{customerId}`

### Doctor/Assistant + dfGroupId
- **URL**: `/admin/treatment/create?customer_id={id}` (HTML page)
- **Extract**: `<select name="doctor_id">` options + dfGroupId from HTML-encoded JSON
- **Saved to Firebase**: `pc_doctors/all`

### Medication Groups
- **URL**: `/admin/api/product-group?product_type=ยากลับบ้าน`
- **Response**: Array of groups with products

---

## 🐛 Bugs & Gotchas ที่เจอมาแล้ว

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| คอร์สถูกตัดแต่ไม่มีประวัติ | ส่ง `status=0` → "แบบร่าง" | ไม่ส่ง `status` เมื่อไม่มี sale |
| ขึ้นสำเร็จแต่ไม่มีจริง | Verification เจอ treatment เก่าวันเดียวกัน | Pre/post list comparison |
| ProClinic ไม่รับข้อมูล | ขาด `rowId_{id}_qty` | ส่ง qty คู่กับทุก rowId |
| redirect กลับ create form | ขาด df_ fields | ส่ง df_doctor_id + df_group_id + df_rowId per doctor per course |
| Cancel ไม่ทำงาน | ใช้ DELETE แทน POST /cancel | POST `/admin/treatment/cancel` |
| Field `*deposit` ผิดชื่อ | ProClinic ใช้ `deposit` ไม่ใช่ `*deposit` | แก้ชื่อ field |

---

## 📐 Field Mapping: Our App → ProClinic

| Our Payload Key | ProClinic Field | Transform |
|----------------|-----------------|-----------|
| `doctorId` | `doctor_id` | direct |
| `assistantIds[]` | `doctor_assistant_id[]` | array |
| `treatmentDate` | `treatment_date` | YYYY-MM-DD |
| `opd.symptoms` | `symptoms` | direct |
| `opd.physicalExam` | `physical_exam` | direct |
| `opd.diagnosis` | `diagnosis` | direct |
| `opd.treatmentInfo` | `treatment_information` | direct |
| `opd.treatmentPlan` | `treatment_plan` | direct |
| `opd.treatmentNote` | `treatment_note` | direct |
| `opd.additionalNote` | `additional_note` | direct |
| `vitals.weight` | `ht_weight` | direct |
| `vitals.height` | `ht_height` | direct |
| `vitals.temperature` | `ht_body_temperature` | direct |
| `vitals.pulseRate` | `ht_pulse_rate` | direct |
| `vitals.respiratoryRate` | `ht_respiratory_rate` | direct |
| `vitals.systolicBP` | `ht_systolic_blood_pressure` | direct |
| `vitals.diastolicBP` | `ht_diastolic_blood_pressure` | direct |
| `vitals.oxygenSaturation` | `ht_oxygen_saturation` | direct |
| `courseItems[].rowId` | `rowId[]` | array |
| `courseItems[].qty` | `rowId_{id}_qty` | dynamic field name |
| `doctorFees[].doctorId` | `df_doctor_id[]` | per doctor × per rowId |
| `doctorFees[].groupId` | `df_group_id[]` | per doctor |
| `doctorFees[].fee` | `df_rowId_{rowId}[]` | per doctor × per rowId |
| `medications[].name` | `takeaway_product_name[]` | array |
| `medications[].dosage` | `takeaway_product_dosage[]` | array |
| `medications[].qty` | `takeaway_product_qty[]` | array |
| `medications[].unitPrice` | `takeaway_product_unit_price[]` | array |
| `consumables[].name` | `consumable_product_name[]` | array |
| `consumables[].qty` | `consumable_product_qty[]` | array |
| `paymentStatus` | `status` | **only when hasSale** |
| `paymentMethod` | `payment_method` | only when enabled |
| `paidAmount` | `paid_amount` | only when enabled |
| `depositAmount` | `deposit` | ไม่ใช่ `*deposit` |
| `walletAmount` | `credit` | ไม่ใช่ `*credit` |
