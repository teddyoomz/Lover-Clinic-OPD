// OPD Note Templates (2026-07-05) — pure helpers for the CC template dropdown
// in TFP. Spec: docs/superpowers/specs/2026-07-05-opd-note-templates-design.html
// Built-in mandatory template is a hardcoded constant (precedent:
// DEFAULT_RECALL_TEMPLATES) — always present in every branch, never editable,
// never deletable, never seeded to Firestore. Branch-created templates live in
// be_opd_note_templates (branch-scoped; see backendClient.js).

export const MANDATORY_OPD_NOTE_TEMPLATES = Object.freeze([
  Object.freeze({
    id: 'builtin-sexual-performance',
    name: 'สมรรถภาพทางเพศ',
    builtin: true,
    // Verbatim from the user's .docx (2026-07-05) — tabs preserved for column feel.
    content: 'สมรรถภาพทางเพศ\n' +
      '1.ประวัติทางเพศ\n' +
      '-อาการนำ / ระยะเวลาที่เริ่มมีอาการ\t:\n' +
      '- ความแข็งตัว\t\t : ____%\n' +
      '-Morning erection\t : ____วัน/สัปดาห์\n' +
      '- อารมณ์ทางเพศ\t\t : ปกติ/ลดลง/ไม่มี\n' +
      '-หลั่งไว \t\t\t:  ไม่มี / มี __ นาที\n' +
      '2.อาการทางฮอร์โมน\n' +
      '-นอนหลับ  \t\t: __ ชม.\n' +
      '-หยุดหายใจขณะนอนหลับ : ไม่มี/มี\n' +
      '-อารมณ์ ปกติ/สวิง/หงุดหงิดงาย/แปรปรวน : ไม่มี/มี\n' +
      '- เบื่อหนาย ไม่มีแรง \t:ไม่มี/มี\n' +
      '-น้ำหนักเพิ่ม \t\t: ไม่มี/มี\n' +
      '-ออกกำลังกาย \t\t: เท่าเดิม/ลดลง/ไม่เคยออก\n' +
      '3.ประวัติส่วนตัว\n' +
      '-ดื่มแอลกอฮอล์\t\t:ไม่ดื่ม/ดื่ม\n' +
      '-บุหรี่/กัญชา\t\t:ไม่สูบ/สูบ\n' +
      '-ประวัติผ่าตัด โรคประจำตัว /ยาที่ทานประจำ :',
  }),
]);

/**
 * Validate a template (name + content both required, non-whitespace).
 * @returns {[field: string, msg: string] | null} null = valid
 */
export function validateOpdNoteTemplate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['data', 'ข้อมูล template ไม่ถูกต้อง'];
  if (!String(data.name || '').trim()) return ['name', 'กรุณากรอกชื่อ template'];
  if (!String(data.content || '').trim()) return ['content', 'กรุณากรอกเนื้อหา template'];
  return null;
}

/**
 * Normalize for persist. V14 lock: output has NO undefined leaves.
 * CRLF → LF; strips leading blank lines + trailing whitespace; internal
 * tabs/spacing preserved (templates use tab columns from Word).
 */
export function normalizeOpdNoteTemplate(data = {}) {
  return {
    name: String(data.name || '').trim(),
    content: String(data.content || '').replace(/\r\n/g, '\n').replace(/^\n+/, '').replace(/\s+$/, ''),
  };
}

/**
 * Q2=A — append template content after the existing CC text with a blank-line
 * separator. Empty/whitespace-only CC → template replaces it outright.
 * Trailing whitespace on the existing text collapses into the separator.
 */
export function appendTemplateToCc(existing, content) {
  const cur = String(existing || '');
  const add = String(content || '');
  if (!add) return cur;
  if (!cur.trim()) return add;
  return cur.replace(/\s+$/, '') + '\n\n' + add;
}

/** Rule C2 — crypto-random id (NOT Math.random). Shape: OPDT-{ts}-{16 hex}. */
export function mintOpdNoteTemplateId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `OPDT-${Date.now()}-${hex}`;
}
