// ─── Branch validation — Phase 11.6 pure helpers ──────────────────────────
// Triangle (Rule F, 2026-04-20): `opd.js forms /admin/branch` revealed ~18+
// fields including 7-day opening-hours matrix. Phase 11.6 ships the CORE
// identification/contact/address/map fields (13) + our `status` extension.
// The weekly schedule (is_<dow>_open + <dow>_opening_time +
// <dow>_closing_time × 7 days) is deferred to Phase 13 where it pairs with
// staff schedules and the AppointmentTab booking flow.
//
// Phase 17.2 (2026-05-05): isDefault stripped — all branches are equal
// peers. Newest-created branch is the implicit landing default (resolved
// in BranchContext.jsx). No mutual-exclusion flag, no "primary" branch.

export const STATUS_OPTIONS = Object.freeze(['ใช้งาน', 'พักใช้งาน']);

export const NAME_MAX_LENGTH = 120;
export const ADDRESS_MAX_LENGTH = 500;
export const NOTE_MAX_LENGTH = 200;

// Thai landline/mobile: 0 followed by 8..10 digits (mirrors ProClinic regex).
const PHONE_RE = /^0[0-9]{8,10}$/;
const URL_RE = /^https?:\/\/.+/i;
// V51 (2026-05-08) — per-branch settings validation regexes
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HTTPS_URL_RE = /^https:\/\/.+/i;
const HHMM_15_RE = /^(?:[01][0-9]|2[0-3]):(?:00|15|30|45)$/;
// 15-minute steps locked to match TimeSelect24 component MINUTES = ['00','15','30','45']
const COOLDOWN_MIN = 0;
const COOLDOWN_MAX = 99999;

export function validateBranch(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    return ['form', 'missing form'];
  }

  // name — required
  if (typeof form.name !== 'string') return ['name', 'กรุณากรอกชื่อสาขา'];
  const nm = form.name.trim();
  if (!nm) return ['name', 'กรุณากรอกชื่อสาขา'];
  if (nm.length > NAME_MAX_LENGTH) return ['name', `ชื่อสาขาไม่เกิน ${NAME_MAX_LENGTH} ตัวอักษร`];

  // phone — required (per ProClinic). V51 Phase 3 cleanup: settings.phone only.
  // Legacy top-level form.phone fallback removed post-migration.
  const phoneRaw = (form.settings && typeof form.settings.phone === 'string')
    ? form.settings.phone : '';
  if (!phoneRaw || !phoneRaw.trim()) {
    return ['settings.phone', 'กรุณากรอกเบอร์ติดต่อ'];
  }
  const ph = phoneRaw.replace(/[\s-]/g, '');
  if (!PHONE_RE.test(ph)) {
    return ['settings.phone', 'เบอร์ติดต่อต้องเป็น 0 ตามด้วยตัวเลข 8-10 ตัว'];
  }

  // Optional fields.
  if (form.website && !URL_RE.test(String(form.website))) {
    return ['website', 'เว็บไซต์ต้องขึ้นต้นด้วย http:// หรือ https://'];
  }
  if (form.googleMapUrl && !URL_RE.test(String(form.googleMapUrl))) {
    return ['googleMapUrl', 'ลิงก์แผนที่ต้องขึ้นต้นด้วย http:// หรือ https://'];
  }

  // Latitude / longitude — optional numbers in range
  if (form.latitude != null && form.latitude !== '') {
    const lat = Number(form.latitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return ['latitude', 'ละติจูดต้องอยู่ในช่วง -90 ถึง 90'];
    }
  }
  if (form.longitude != null && form.longitude !== '') {
    const lng = Number(form.longitude);
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      return ['longitude', 'ลองจิจูดต้องอยู่ในช่วง -180 ถึง 180'];
    }
  }

  // Length bounds on free-text. V51 Phase 3 cleanup: address/addressEn moved to settings.
  const sAddress = form.settings?.address;
  if (sAddress && String(sAddress).length > ADDRESS_MAX_LENGTH) {
    return ['settings.address', `ที่อยู่เกิน ${ADDRESS_MAX_LENGTH} ตัวอักษร`];
  }
  const sAddressEn = form.settings?.addressEn;
  if (sAddressEn && String(sAddressEn).length > ADDRESS_MAX_LENGTH) {
    return ['settings.addressEn', `ที่อยู่ (EN) เกิน ${ADDRESS_MAX_LENGTH} ตัวอักษร`];
  }
  if (form.note && String(form.note).length > NOTE_MAX_LENGTH) {
    return ['note', `note เกิน ${NOTE_MAX_LENGTH} ตัวอักษร`];
  }

  // status enum
  if (form.status != null && !STATUS_OPTIONS.includes(form.status)) {
    return ['status', 'สถานะไม่ถูกต้อง'];
  }

  // V51 (2026-05-08) — per-branch settings sub-object validation
  if (form.settings != null) {
    if (typeof form.settings !== 'object' || Array.isArray(form.settings)) {
      return ['settings', 'settings ไม่ถูกต้อง'];
    }
    const s = form.settings;

    // Email — must match RE if present
    if (s.email && typeof s.email === 'string' && s.email.trim()) {
      if (!EMAIL_RE.test(s.email.trim())) {
        return ['settings.email', 'อีเมลไม่ถูกต้อง'];
      }
    }

    // LINE OA URL — must start with https:// if present
    if (s.lineOaUrl && typeof s.lineOaUrl === 'string' && s.lineOaUrl.trim()) {
      if (!HTTPS_URL_RE.test(s.lineOaUrl.trim())) {
        return ['settings.lineOaUrl', 'ลิงก์ LINE OA ต้องขึ้นต้นด้วย https://'];
      }
    }

    // Cooldown — range [0, 99999]
    if (s.patientSyncCooldownMins != null && s.patientSyncCooldownMins !== '') {
      const c = Number(s.patientSyncCooldownMins);
      if (!Number.isFinite(c) || c < COOLDOWN_MIN || c > COOLDOWN_MAX) {
        return ['settings.patientSyncCooldownMins', `เวลา cooldown ต้องอยู่ในช่วง ${COOLDOWN_MIN}-${COOLDOWN_MAX} นาที`];
      }
    }

    // openHours — HH:MM at 15-min step
    if (s.openHours && typeof s.openHours === 'object') {
      for (const day of ['monFri', 'satSun']) {
        const dayCfg = s.openHours[day];
        if (dayCfg && typeof dayCfg === 'object') {
          if (dayCfg.open && !HHMM_15_RE.test(String(dayCfg.open))) {
            return [`settings.openHours.${day}.open`, 'รูปแบบเวลาต้องเป็น HH:MM (ขั้น 15 นาที)'];
          }
          if (dayCfg.close && !HHMM_15_RE.test(String(dayCfg.close))) {
            return [`settings.openHours.${day}.close`, 'รูปแบบเวลาต้องเป็น HH:MM (ขั้น 15 นาที)'];
          }
        }
      }
    }

    // chatHours — HH:MM at 15-min step (alwaysOn boolean — no validation)
    if (s.chatHours && typeof s.chatHours === 'object') {
      for (const day of ['monFri', 'satSun']) {
        const dayCfg = s.chatHours[day];
        if (dayCfg && typeof dayCfg === 'object') {
          if (dayCfg.open && !HHMM_15_RE.test(String(dayCfg.open))) {
            return [`settings.chatHours.${day}.open`, 'รูปแบบเวลาต้องเป็น HH:MM (ขั้น 15 นาที)'];
          }
          if (dayCfg.close && !HHMM_15_RE.test(String(dayCfg.close))) {
            return [`settings.chatHours.${day}.close`, 'รูปแบบเวลาต้องเป็น HH:MM (ขั้น 15 นาที)'];
          }
        }
      }
    }
  }

  return null;
}

export function emptyBranchForm() {
  return {
    name: '',
    nameEn: '',
    website: '',
    googleMapUrl: '',
    latitude: '',
    longitude: '',
    note: '',
    status: 'ใช้งาน',
    // V51 (2026-05-08) — per-branch settings sub-object.
    // Phase 3 cleanup (post-migration --apply): legacy top-level phone/licenseNo/
    // taxId/address/addressEn REMOVED — those fields live in settings only now.
    settings: {
      phone: '',
      licenseNo: '',
      taxId: '',
      address: '',
      addressEn: '',
      email: '',
      lineOaUrl: '',
      patientSyncCooldownMins: 10,
      openHours: {
        monFri: { open: '10:00', close: '20:30' },
        satSun: { open: '10:00', close: '19:30' },
      },
      chatHours: {
        alwaysOn: false,
        monFri: { open: '10:00', close: '20:45' },
        satSun: { open: '10:00', close: '19:45' },
      },
    },
  };
}

export function normalizeBranch(form) {
  const trim = (v) => typeof v === 'string' ? v.trim() : '';
  const coerceNum = (v) => (v === '' || v == null) ? null : Number(v);
  // V51 — normalize per-branch settings sub-object alongside legacy top-level
  let settings = form.settings;
  if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
    const s = settings;
    settings = {
      ...s,
      phone: trim(s.phone).replace(/[\s-]/g, ''),
      licenseNo: trim(s.licenseNo),
      taxId: trim(s.taxId),
      address: trim(s.address),
      addressEn: trim(s.addressEn),
      email: trim(s.email),
      lineOaUrl: trim(s.lineOaUrl),
      patientSyncCooldownMins: (() => {
        if (s.patientSyncCooldownMins == null || s.patientSyncCooldownMins === '') return 10;
        const n = Number(s.patientSyncCooldownMins);
        return Number.isFinite(n) ? n : 10;
      })(),
    };
  }
  return {
    ...form,
    name: trim(form.name),
    nameEn: trim(form.nameEn),
    website: trim(form.website),
    googleMapUrl: trim(form.googleMapUrl),
    latitude: coerceNum(form.latitude),
    longitude: coerceNum(form.longitude),
    note: trim(form.note),
    status: form.status || 'ใช้งาน',
    ...(settings ? { settings } : {}),
    // V51 Phase 3 cleanup — top-level phone/licenseNo/taxId/address/addressEn
    // REMOVED. Those fields live in settings sub-object only.
  };
}
