export const SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000;

export const DEFAULT_CLINIC_SETTINGS = {
  clinicName: 'Lover Clinic',
  clinicSubtitle: '',
  logoUrl: '',
  logoUrlLight: '',
  accentColor: '#dc2626',
  lineOfficialUrl: '',
  patientSyncCooldownMins: 0, // 0 = ไม่จำกัด, 1-99999 = นาที
  proClinicOrigin: 'https://trial.proclinicth.com',
};

export const PRESET_COLORS = [
  { hex: '#dc2626', name: 'แดง (Red)' },
  { hex: '#2563eb', name: 'น้ำเงิน (Blue)' },
  { hex: '#7c3aed', name: 'ม่วง (Purple)' },
  { hex: '#059669', name: 'เขียว (Green)' },
  { hex: '#d97706', name: 'ส้ม (Orange)' },
  { hex: '#db2777', name: 'ชมพู (Pink)' },
  { hex: '#0891b2', name: 'ฟ้า (Cyan)' },
  { hex: '#4f46e5', name: 'คราม (Indigo)' },
  { hex: '#ca8a04', name: 'ทอง (Gold)' },
  { hex: '#475569', name: 'เทา (Slate)' },
];
