// edScoreDisplay.js — PURE display helpers for the ED Score box + TFP note.
// Reuses the REAL score calculators (utils.js) — no re-implementation.
import {
  calculateADAM, calculateIIEFScore, calculateMRS, getIIEFInterpretation,
} from '../utils.js';
import { resolveCustomerDisplayName, resolveCustomerPhone } from './customerDisplayName.js';

export const ED_TYPE_META = {
  adam: { key: 'adam', label: 'ADAM', full: 'พร่องฮอร์โมนเพศชาย', max: 10, accent: '#f97316' },
  iief: { key: 'iief', label: 'IIEF-5', full: 'สมรรถภาพทางเพศ', max: 25, accent: '#eab308' },
  mrs: { key: 'mrs', label: 'MRS', full: 'อาการวัยทอง', max: 44, accent: '#ec4899' },
  pe: { key: 'pe', label: 'PE', full: 'หลั่งเร็ว', boolean: true, accent: '#94a3b8' },
};

// type + raw answers → { value, max, text, positive? } | { boolean, present, text }
export function scoreForType(type, raw) {
  const d = raw || {};
  if (type === 'adam') { const r = calculateADAM(d); return { value: r.total, max: 10, positive: r.positive, text: r.text }; }
  if (type === 'iief') { const s = calculateIIEFScore(d); return { value: s, max: 25, text: getIIEFInterpretation(s).text }; }
  if (type === 'mrs') { const r = calculateMRS(d); return { value: r.score, max: 44, text: r.text }; }
  if (type === 'pe') { return { boolean: true, present: !!d.symp_pe, text: d.symp_pe ? 'มีอาการ' : 'ไม่มีอาการ' }; }
  return null;
}

// Removes the auto-generated "ผลการคัดกรองอาการ / Clinical Screening Results" block
// from a stored note (generateClinicalSummary screening section, utils.js:402-485).
// Real format: a `───` separator (sep = '───', U+2500) line, then the header line,
// then indented "  …" item lines, until the next separator OR EOF. The preceding
// separator is removed too. Everything else (CC, PMH, allergies, meds, plan) is kept.
const SCREEN_HEADERS = ['ผลการคัดกรองอาการ', 'Clinical Screening Results'];
const isSep = (ln) => {
  const t = String(ln).trim();
  return t.length >= 2 && /^[─—―\-=_]+$/.test(t);
};
export function stripScreeningSection(note) {
  if (!note || typeof note !== 'string') return note || '';
  const lines = note.split(/\r?\n/);
  const out = [];
  let skipping = false;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    // EXACT match (not startsWith) — generateClinicalSummary emits the header on
    // its OWN line (utils.js:407). startsWith would falsely strip a note whose
    // CONTENT merely mentions the word (e.g. "CC: ผลการคัดกรองอาการปกติ").
    if (!skipping && SCREEN_HEADERS.some((h) => ln.trim() === h)) {
      skipping = true;
      if (out.length && isSep(out[out.length - 1])) out.pop(); // drop the preceding ─── divider
      continue;
    }
    if (skipping) {
      if (isSep(ln)) { skipping = false; continue; } // closing divider → consume, resume
      // blank line followed by a NON-indented new section → stop skipping, keep the blank
      if (ln.trim() === '' && i + 1 < lines.length && lines[i + 1] && !/^\s/.test(lines[i + 1])) {
        skipping = false; out.push(ln);
      }
      continue; // otherwise (indented item line) → drop
    }
    out.push(ln);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ─── ED follow-up v2 (2026-06-15) — confirm-card + round-date helpers ───

// Mask the middle of a phone for the public follow-up confirm card (R1).
// '0812345678' → '081-•••-5678'. Graceful: short/intl/empty returned as-is/''.
export function maskPhone(phone) {
  const s = String(phone ?? '').replace(/[\s-]/g, '');
  if (!s) return '';
  if (s.length < 7) return s; // too short to mask meaningfully
  return `${s.slice(0, 3)}-•••-${s.slice(-4)}`;
}

// Read-only identity snapshot for the follow-up confirm card (R1). Snapshotted
// into the opd_session at generation so the anon link can render it WITHOUT
// reading be_customers (staff-only). Name via the canonical resolver; phone masked.
export function buildConfirmInfo(customer) {
  const c = customer || {};
  const pd = c.patientData || {};
  const name = resolveCustomerDisplayName(c) || '';
  const age = (pd.age != null && String(pd.age).trim() !== '')
    ? String(pd.age)
    : (c.age != null && String(c.age).trim() !== '' ? String(c.age) : '');
  const phoneMasked = maskPhone(resolveCustomerPhone(c) || pd.phone || c.phone || '');
  return { name, age, phoneMasked };
}

// Round assessmentDate (ISO 'YYYY-MM-DD' or full ISO) + todayISO →
// { text: 'dd/mm/yyyy พ.ศ.', isToday } for the TFP ED-Score strip (R4).
export function formatRoundDate(assessmentDate, todayISO) {
  const raw = String(assessmentDate || '').trim();
  const today = String(todayISO || '').slice(0, 10);
  if (!raw) return { text: '', isToday: false };
  const datePart = raw.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!m) return { text: raw, isToday: datePart === today };
  return { text: `${m[3]}/${m[2]}/${Number(m[1]) + 543}`, isToday: datePart === today };
}
