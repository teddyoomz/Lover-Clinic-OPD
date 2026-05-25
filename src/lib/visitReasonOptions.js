// src/lib/visitReasonOptions.js
// Single-source canonical visit-purpose ("นัดมาเพื่อ") options (Rule C1, 2026-05-25).
//
// Extracted from 3 inline copies:
//   • src/pages/PatientForm.jsx:583  (structured {value,th,en} — kiosk intake)
//   • src/pages/AdminDashboard.jsx   (hardcoded value[] — deposit-คิว chip picker)
//   • src/pages/AdminDashboard.jsx   (hardcoded value[] — no-deposit-คิว chip picker)
//
// Consumers: PatientForm (reads .th/.en/.value), AdminDashboard chips (VISIT_REASON_VALUES),
// VisitPurposePicker (.th label + .value). Adding a new clinic service = edit HERE only.
//
// Pure module — no React, no Firebase. Safe to import from tests.
export const visitReasonOptions = [
  { value: 'สมรรถภาพทางเพศ', th: 'สมรรถภาพทางเพศ', en: 'Erectile Dysfunction / Sexual Health' },
  { value: 'โรคระบบทางเดินปัสสาวะ', th: 'โรคระบบทางเดินปัสสาวะ', en: 'Urology / Urinary Tract Issues' },
  { value: 'ดูแลสุขภาพองค์รวม', th: 'ดูแลสุขภาพองค์รวม', en: 'General Health / Wellness' },
  { value: 'เสริมฮอร์โมน', th: 'เสริมฮอร์โมน', en: 'Hormone Replacement Therapy (HRT)' },
  { value: 'โรคติดต่อทางเพศสัมพันธ์', th: 'โรคติดต่อทางเพศสัมพันธ์', en: 'STD / STI Testing & Treatment' },
  { value: 'ขลิบ', th: 'ขลิบ', en: 'Circumcision' },
  { value: 'ทำหมัน', th: 'ทำหมัน', en: 'Vasectomy' },
  { value: 'เลาะสารเหลว', th: 'เลาะสารเหลว', en: 'Foreign Body Removal (Genital)' },
  { value: 'เสริมขนาด', th: 'เสริมขนาด', en: 'Penile Enhancement / Augmentation' },
  { value: 'อื่นๆ', th: 'อื่นๆ', en: 'Others' },
];

// Value-only list — AdminDashboard's chip pickers map `r => <button>{r}</button>`.
export const VISIT_REASON_VALUES = visitReasonOptions.map((o) => o.value);
