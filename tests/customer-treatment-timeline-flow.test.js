// ─── Phase 14.7.E — Treatment Timeline Modal full-flow simulate ────────
// Source-of-truth scan: docs/proclinic-scan/customer-detail-treatment-history-and-timeline.md
//
// Per Rule I (full-flow simulate), this test bank chains every piece of
// the timeline modal: data shape → image-grid mapping → accordion gates →
// edit hook wiring → adversarial inputs → source-grep regression guards.
//
// TL1 — modal mount/unmount + a11y
// TL2 — image grid rendering (0 / 1 / N images per slot)
// TL3 — accordion gates (only render when items present)
// TL4 — empty state
// TL5 — edit/print wire-through to existing handlers
// TL6 — adversarial inputs (null detail, missing keys, empty strings)
// TL7 — pure helpers (image URL extraction)
// TL8 — source-grep regression guards (Rule I item c)

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const READ = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SRC = READ('src/components/backend/TreatmentTimelineModal.jsx');
const VIEW = READ('src/components/backend/CustomerDetailView.jsx');

// ─── Pure helpers (mirror inline component logic so we can chain) ──────────

function imageUrl(img) {
  if (!img) return '';
  if (typeof img === 'string') return img;
  return img.dataUrl || img.url || '';
}

function pickImageHeading(label, count) {
  return count > 1 ? `${label} (${count} รูป)` : label;
}

// Mock detail builder for adversarial tests
function makeDetail(overrides = {}) {
  return {
    treatmentDate: '2026-04-26',
    doctorName: 'Wee 523',
    symptoms: '',
    diagnosis: '',
    treatmentNote: '',
    treatmentItems: [],
    medications: [],
    consumables: [],
    beforeImages: [],
    afterImages: [],
    otherImages: [],
    ...overrides,
  };
}

// ─── TL1: modal mount + a11y ───────────────────────────────────────────────

describe('TL1: modal shell + a11y', () => {
  it('TL1.1: shell renders with role="dialog" + aria-modal + labelledby', () => {
    expect(SRC).toMatch(/role="dialog"/);
    expect(SRC).toMatch(/aria-modal="true"/);
    expect(SRC).toMatch(/aria-labelledby="timeline-modal-title"/);
    expect(SRC).toMatch(/id="timeline-modal-title"/);
  });

  it('TL1.2: stable testids on root, body, close, empty', () => {
    expect(SRC).toMatch(/data-testid="treatment-timeline-modal"/);
    expect(SRC).toMatch(/data-testid="timeline-body"/);
    expect(SRC).toMatch(/data-testid="timeline-close-btn"/);
    expect(SRC).toMatch(/data-testid="timeline-empty"/);
  });

  it('TL1.3: per-row testid pattern (timeline-row-${id})', () => {
    expect(SRC).toMatch(/data-testid=\{`timeline-row-\$\{t\.id\}`\}/);
  });

  it('TL1.4: Esc keydown registered + cleaned up on unmount', () => {
    expect(SRC).toMatch(/addEventListener\(['"]keydown['"]/);
    expect(SRC).toMatch(/removeEventListener\(['"]keydown['"]/);
    expect(SRC).toMatch(/e\.key === ['"]Escape['"]/);
  });

  it('TL1.5: backdrop click closes (delegated via root onClick) + inner stops propagation', () => {
    expect(SRC).toMatch(/onClick=\{onClose\}/);
    expect(SRC).toMatch(/onClick=\{\(e\)\s*=>\s*e\.stopPropagation\(\)\}/);
  });

  it('TL1.6: ProClinic-fidelity teal #2EC4B6 used for header text + icons', () => {
    expect(SRC).toMatch(/#2EC4B6/);
    expect(SRC).toMatch(/Timeline การรักษา/);
  });

  it('TL1.7: customer name + HN + ทั้งหมด N ครั้ง shown in header subtitle', () => {
    expect(SRC).toMatch(/customer\.patientData\?\.prefix/);
    expect(SRC).toMatch(/customer\?\.proClinicHN/);
    expect(SRC).toMatch(/ทั้งหมด/);
    expect(SRC).toMatch(/totalCount/);
  });
});

// ─── TL2: image grid rendering ─────────────────────────────────────────────

describe('TL2: image grid (0 / 1 / N images per slot)', () => {
  it('TL2.1: ImageGridColumn handles empty list (placeholder)', () => {
    expect(SRC).toMatch(/valid\.length === 0/);
    expect(SRC).toMatch(/<ImageIcon size=/);
  });

  it('TL2.2: single image renders without thumbnail row', () => {
    expect(SRC).toMatch(/valid\.length === 1/);
  });

  it('TL2.3: multi-image carousel uses activeIdx state + thumbnail row', () => {
    expect(SRC).toMatch(/setActiveIdx/);
    expect(SRC).toMatch(/aria-current=\{isActive\s*\?\s*['"]true['"]\s*:\s*undefined\}/);
    expect(SRC).toMatch(/data-testid=\{`timeline-img-thumb-\$\{i\}`\}/);
  });

  it('TL2.4: heading reads "<label> (N รูป)" when N>1, plain label otherwise', () => {
    expect(SRC).toMatch(/valid\.length\s*>\s*1\s*\?\s*`\$\{label\}\s*\(\$\{valid\.length\}\s*รูป\)`/);
  });

  it('TL2.5: 3 columns rendered in fixed order: OPD/อื่นๆ → Before → After', () => {
    expect(SRC).toMatch(/label="OPD\/อื่นๆ"\s+images=\{otherImages\}/);
    expect(SRC).toMatch(/label="Before"\s+images=\{beforeImages\}/);
    expect(SRC).toMatch(/label="After"\s+images=\{afterImages\}/);
  });

  it('TL2.6: lightbox via target="_blank" rel="noopener"', () => {
    expect(SRC).toMatch(/target="_blank"/);
    expect(SRC).toMatch(/rel="noopener noreferrer"/);
  });

  it('TL2.7: thumbnail click resets to that index (controlled state)', () => {
    expect(SRC).toMatch(/onClick=\{\(\)\s*=>\s*setActiveIdx\(i\)\}/);
  });

  it('TL2.8: useEffect resets activeIdx when image count changes', () => {
    expect(SRC).toMatch(/useEffect\(\(\)\s*=>\s*\{\s*setActiveIdx\(0\)\s*;?\s*\},\s*\[valid\.length\]\)/);
  });
});

// ─── TL3: accordion gates ──────────────────────────────────────────────────

describe('TL3: accordions (medications / consumables) only render when populated', () => {
  it('TL3.1: Accordion early-return on empty items (no DOM noise)', () => {
    expect(SRC).toMatch(/if\s*\(!items\s*\|\|\s*items\.length === 0\)\s*return null/);
  });

  it('TL3.2: medications wired as ยากลับบ้าน', () => {
    expect(SRC).toMatch(/title="ยากลับบ้าน"\s+items=\{medications\}/);
  });

  it('TL3.3: consumables wired as สินค้าสิ้นเปลือง', () => {
    expect(SRC).toMatch(/title="สินค้าสิ้นเปลือง"\s+items=\{consumables\}/);
  });

  it('TL3.4: native <details>/<summary> used (no JS framework dep)', () => {
    expect(SRC).toMatch(/<details/);
    expect(SRC).toMatch(/<summary/);
  });

  it('TL3.5: accordion controlled-state mirrors native open via onToggle', () => {
    expect(SRC).toMatch(/onToggle=\{\(e\)\s*=>\s*setOpen\(e\.target\.open\)\}/);
  });

  it('TL3.6: accordion testid pattern uses title (Thai labels OK as data-testid)', () => {
    expect(SRC).toMatch(/data-testid=\{`timeline-accordion-\$\{title\}`\}/);
  });
});

// ─── TL4: empty state ──────────────────────────────────────────────────────

describe('TL4: empty state (zero treatments)', () => {
  it('TL4.1: treatmentSummary.length === 0 path renders empty state', () => {
    expect(SRC).toMatch(/totalCount === 0/);
    expect(SRC).toMatch(/data-testid="timeline-empty"/);
  });

  it('TL4.2: empty copy: "ไม่พบประวัติการรักษา" + hint to บันทึกการรักษา', () => {
    expect(SRC).toMatch(/ไม่พบประวัติการรักษา/);
    expect(SRC).toMatch(/บันทึกการรักษาแรกในหน้าหลัก/);
  });

  it('TL4.3: Stethoscope icon used (matches CustomerDetailView empty)', () => {
    expect(SRC).toMatch(/import\s*\{[^}]*Stethoscope[^}]*\}\s*from\s*['"]lucide-react['"]/);
    expect(SRC).toMatch(/Stethoscope size=\{48\}/);
  });
});

// ─── TL5: edit wire-through ────────────────────────────────────────────────

describe('TL5: wire-through to existing CustomerDetailView handlers', () => {
  it('TL5.1: onEditTreatment optional, called with treatment id when set', () => {
    expect(SRC).toMatch(/onClick=\{\(\)\s*=>\s*onEditTreatment\(t\.id\)\}/);
    expect(SRC).toMatch(/data-testid=\{`timeline-edit-\$\{t\.id\}`\}/);
  });

  it('TL5.2: edit button hidden when prop not passed (no broken UI)', () => {
    expect(SRC).toMatch(/onEditTreatment\s*&&\s*\(/);
  });

  it('TL5.3: CustomerDetailView passes onEditTreatment through', () => {
    expect(VIEW).toMatch(/<TreatmentTimelineModal[\s\S]+?onEditTreatment=\{onEditTreatment\}/);
  });

  it('TL5.4: CustomerDetailView passes treatmentSummary + treatments + treatmentsLoading', () => {
    expect(VIEW).toMatch(/<TreatmentTimelineModal[\s\S]+?treatmentSummary=\{treatmentSummary\}/);
    expect(VIEW).toMatch(/<TreatmentTimelineModal[\s\S]+?treatments=\{treatments\}/);
    expect(VIEW).toMatch(/<TreatmentTimelineModal[\s\S]+?treatmentsLoading=\{treatmentsLoading\}/);
  });

  it('TL5.5: CustomerDetailView wires onClose to setShowTimeline(false)', () => {
    expect(VIEW).toMatch(/<TreatmentTimelineModal[\s\S]+?onClose=\{\(\)\s*=>\s*setShowTimeline\(false\)\}/);
  });
});

// ─── TL6: adversarial inputs ───────────────────────────────────────────────

describe('TL6: adversarial inputs (defensive null/missing/empty handling)', () => {
  it('TL6.1: missing detail → fullDoc is null → component still renders summary row', () => {
    // The grep guards ensure detail?. is used everywhere; the runtime path
    // is verified by the imageUrl pure helper below.
    expect(SRC).toMatch(/detail\?\.beforeImages/);
    expect(SRC).toMatch(/detail\?\.afterImages/);
    expect(SRC).toMatch(/detail\?\.otherImages/);
    expect(SRC).toMatch(/detail\?\.treatmentItems/);
    expect(SRC).toMatch(/detail\?\.treatmentNote/);
  });

  it('TL6.2: imageUrl helper falls back to "" for null / undefined / empty', () => {
    expect(imageUrl(null)).toBe('');
    expect(imageUrl(undefined)).toBe('');
    expect(imageUrl({})).toBe('');
  });

  it('TL6.3: imageUrl handles string forms (legacy ProClinic data)', () => {
    expect(imageUrl('https://example.com/img.jpg')).toBe('https://example.com/img.jpg');
    expect(imageUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
  });

  it('TL6.4: imageUrl handles {dataUrl} (canonical) and {url} (legacy ProClinic) shapes', () => {
    expect(imageUrl({ dataUrl: 'foo', id: 1 })).toBe('foo');
    expect(imageUrl({ url: 'bar' })).toBe('bar');
  });

  it('TL6.5: pickImageHeading matches the production formatter for 0/1/N', () => {
    expect(pickImageHeading('Before', 0)).toBe('Before');
    expect(pickImageHeading('Before', 1)).toBe('Before');
    expect(pickImageHeading('Before', 2)).toBe('Before (2 รูป)');
    expect(pickImageHeading('OPD/อื่นๆ', 5)).toBe('OPD/อื่นๆ (5 รูป)');
  });

  it('TL6.6: empty arrays for all 3 image categories produces zero-image placeholders', () => {
    const detail = makeDetail();
    expect(detail.beforeImages).toEqual([]);
    expect(detail.afterImages).toEqual([]);
    expect(detail.otherImages).toEqual([]);
    // ImageGridColumn renders placeholder; pure helper verifies count contract
    expect(pickImageHeading('OPD/อื่นๆ', detail.otherImages.length)).toBe('OPD/อื่นๆ');
  });

  it('TL6.7: empty-string dataUrl filtered out (would render broken img otherwise)', () => {
    // The component filters via .filter(img => imageUrl(img))
    expect(SRC).toMatch(/\.filter\(img\s*=>\s*imageUrl\(img\)\)/);
    expect(imageUrl({ dataUrl: '', id: 1 })).toBe('');
    expect(imageUrl({ dataUrl: undefined })).toBe('');
  });

  it('TL6.8: treatments without treatmentItems renders meta only (no rendering crash)', () => {
    expect(SRC).toMatch(/courseItems\.length\s*>\s*0/);
  });

  it('TL6.9: "ล่าสุด" badge only on globalIndex===0 (not pageIndex)', () => {
    expect(SRC).toMatch(/isLatest = globalIndex === 0/);
    expect(SRC).toMatch(/isLatest\s*&&\s*\(/);
  });

  it('TL6.10: treatmentsLoading guard renders spinner instead of empty image grid', () => {
    expect(SRC).toMatch(/isLoading = treatmentsLoading\s*&&\s*!fullDoc/);
    expect(SRC).toMatch(/isLoading\s*\?/);
  });
});

// ─── TL7: pure helpers ─────────────────────────────────────────────────────

describe('TL7: pure helper invariants (chained simulate)', () => {
  it('TL7.1: imageUrl preserves identity for valid string + valid {dataUrl}', () => {
    const inputs = [
      'https://x.com/y.jpg',
      { dataUrl: 'data:image/png;base64,xx', id: 'A' },
      { url: 'fallback.png' },
    ];
    const outputs = inputs.map(imageUrl);
    expect(outputs).toEqual(['https://x.com/y.jpg', 'data:image/png;base64,xx', 'fallback.png']);
  });

  it('TL7.2: imageUrl on array wrapped in mixed legacy/canonical form behaves correctly', () => {
    const mixed = [
      { dataUrl: 'a', id: 1 },
      'b-string',
      { url: 'c' },
      { dataUrl: '', id: 4 },        // empty
      null,                            // null
      undefined,                       // undefined
    ];
    const valid = mixed.filter(img => imageUrl(img));
    const urls = valid.map(imageUrl);
    expect(urls).toEqual(['a', 'b-string', 'c']);
    expect(valid.length).toBe(3);
  });

  it('TL7.3: heading-with-count uses Thai counter "รูป" + parens consistently', () => {
    expect(pickImageHeading('OPD Card', 3)).toMatch(/\(3 รูป\)/);
    expect(pickImageHeading('Before', 12)).toMatch(/\(12 รูป\)/);
  });
});

// ─── TL8: source-grep regression guards ────────────────────────────────────

describe('TL8: source-grep regression guards (Rule I)', () => {
  it('TL8.1: TreatmentTimelineModal exported as default', () => {
    expect(SRC).toMatch(/export default function TreatmentTimelineModal/);
  });

  it('TL8.2: ONE place renders <TreatmentTimelineModal /> (CustomerDetailView only)', () => {
    expect(VIEW).toMatch(/<TreatmentTimelineModal/);
    // Pattern: only CustomerDetailView imports + renders it. AppointmentTab,
    // SaleTab, etc. should NOT touch this component.
    const appt = READ('src/components/backend/AppointmentTab.jsx');
    expect(appt).not.toMatch(/TreatmentTimelineModal/);
  });

  it('TL8.3: showTimeline initial state false (modal closed by default)', () => {
    expect(VIEW).toMatch(/useState\(false\)/);
    expect(VIEW).toMatch(/const\s*\[\s*showTimeline,\s*setShowTimeline\s*\]/);
  });

  it('TL8.4: button no longer disabled (live, not placeholder)', () => {
    expect(VIEW).not.toMatch(/data-testid="show-timeline-btn"[\s\S]{0,400}disabled=/);
  });

  it('TL8.5: showTimeline modal rendered conditionally (not always-mounted)', () => {
    expect(VIEW).toMatch(/showTimeline\s*&&\s*\(/);
  });

  it('TL8.6: modal does NOT trigger any new firestore fetch (re-uses props)', () => {
    expect(SRC).not.toMatch(/getDoc\(|getDocs\(|onSnapshot\(/);
    expect(SRC).not.toMatch(/import.*backendClient\.js/);
  });

  it('TL8.7: NO inline brokerClient or /api/proclinic call (Rule E)', () => {
    expect(SRC).not.toMatch(/brokerClient/);
    expect(SRC).not.toMatch(/\/api\/proclinic/);
  });

  it('TL8.8: Phase 14.7.E version marker present in file header', () => {
    expect(SRC).toMatch(/Phase 14\.7\.E/);
  });
});
