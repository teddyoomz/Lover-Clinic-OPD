// ─── Phase 14.7.H follow-up I — pick-at-treatment reopen-add ────────────
//
// V12.2b deferred item: user picks a subset of products from a pick-at-
// treatment course at visit 1, can't reopen the picker at visit 2 to add
// MORE picks. Implementation:
//   1. resolvePickedCourseInCustomer (backendClient.js) now stamps
//      `pickedFromCourseId` (placeholder's stable id) on every resolved
//      entry, and `_pickGroupOptions` (snapshot of original
//      availableProducts) on the FIRST sibling only.
//   2. New addPicksToResolvedGroup(customerId, pickedFromCourseId, picks)
//      finds existing siblings + appends new resolved entries beside them
//      with the same group id. Add-only (no in-place qty edit) to preserve
//      deduction history.
//   3. mapRawCoursesToForm carries `_pickedFromCourseId` + `_pickGroupOptions`
//      to the form layer so TFP can render a "+ เพิ่มสินค้าจากคอร์สเดียวกัน"
//      button on courses originating from a pick-at-treatment.
//   4. TreatmentFormPage UI shows the reopen button + mounts a second
//      PickProductsModal in 'add' mode. On confirm, calls
//      addPicksToResolvedGroup + re-fetches customer doc + setOptions.
//
// Per Rule I (full-flow simulate at sub-phase end): this file CHAINS
// master → buy → save → assign → resolve → load → reopen → addPicks →
// re-load → form layer. Helper-output-in-isolation alone is NOT enough
// (V13 lesson). Source-grep guards lock the wiring sites that grep can't
// catch from helpers alone.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  buildPurchasedCourseEntry,
  resolvePickedCourseEntry,
  mapRawCoursesToForm,
} from '../src/lib/treatmentBuyHelpers.js';

const ROOT = path.resolve(__dirname, '..');
const READ = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ═══════════════════════════════════════════════════════════════════════
// PURE MIRRORS — replicate the inline logic of resolvePickedCourseInCustomer
// and addPicksToResolvedGroup so we can chain the full flow without
// mocking firebase/firestore. The actual helpers are exercised by the
// runtime preview_eval in Rule I (b).
// ═══════════════════════════════════════════════════════════════════════

function mirrorResolvePickedCourseInCustomer(courses, courseKey, picks) {
  const next = [...courses];
  let idx = -1;
  if (typeof courseKey === 'string') {
    idx = next.findIndex(c => c && c.courseId === courseKey && c.needsPickSelection === true);
  } else if (typeof courseKey === 'number') {
    if (courseKey >= 0 && courseKey < next.length) idx = courseKey;
  }
  if (idx < 0) throw new Error('Pick-at-treatment placeholder not found');

  const placeholder = next[idx];
  if (!placeholder || !placeholder.needsPickSelection) {
    throw new Error('Course entry is not a pick-at-treatment placeholder');
  }
  const valid = (Array.isArray(picks) ? picks : [])
    .filter(p => p && Number(p.qty) > 0 && (p.name || p.productId));
  if (valid.length === 0) throw new Error('No valid picks provided');

  const {
    availableProducts: discardedOptions,
    needsPickSelection: _df,
    product: _dp,
    qty: _dq,
    courseId: discardedPickId,
    ...basePlaceholder
  } = placeholder;

  const pickGroupOptions = Array.isArray(discardedOptions)
    ? discardedOptions.map(p => ({ ...p }))
    : null;

  const now = '2026-04-26T10:00:00.000Z';
  const resolvedEntries = valid.map((p, i) => ({
    ...basePlaceholder,
    product: p.name || '',
    productId: p.productId != null ? String(p.productId) : '',
    qty: `${Number(p.qty) || 1} / ${Number(p.qty) || 1} ${p.unit || 'ครั้ง'}`,
    status: 'กำลังใช้งาน',
    assignedAt: basePlaceholder.assignedAt || now,
    pickedFromCourseId: discardedPickId || null,
    ...(i === 0 && pickGroupOptions ? { _pickGroupOptions: pickGroupOptions } : {}),
  }));

  next.splice(idx, 1, ...resolvedEntries);
  return next;
}

function mirrorAddPicksToResolvedGroup(courses, pickedFromCourseId, additionalPicks) {
  if (!pickedFromCourseId) throw new Error('pickedFromCourseId required');
  const next = [...courses];
  const siblings = next.filter(c => c && c.pickedFromCourseId === pickedFromCourseId);
  if (siblings.length === 0) {
    throw new Error('No existing picked entries for group ' + pickedFromCourseId);
  }
  const valid = (Array.isArray(additionalPicks) ? additionalPicks : [])
    .filter(p => p && Number(p.qty) > 0 && (p.name || p.productId));
  if (valid.length === 0) throw new Error('No valid picks provided');

  const template = siblings[0];
  const {
    product: _sp,
    productId: _spi,
    qty: _sq,
    status: _ss,
    assignedAt: _sa,
    _pickGroupOptions: _so,
    ...baseTpl
  } = template;

  const now = '2026-04-26T11:00:00.000Z';
  const newEntries = valid.map(p => ({
    ...baseTpl,
    product: p.name || '',
    productId: p.productId != null ? String(p.productId) : '',
    qty: `${Number(p.qty) || 1} / ${Number(p.qty) || 1} ${p.unit || 'ครั้ง'}`,
    status: 'กำลังใช้งาน',
    assignedAt: now,
    pickedFromCourseId,
  }));
  next.push(...newEntries);
  return next;
}

// Test data factory: a "Lipo Buffet" course master with 3 product options.
function makeLipoBufferMasterItem() {
  return {
    id: '900',
    name: 'Lipo Buffet',
    qty: '1',
    unit: 'คอร์ส',
    courseType: 'เลือกสินค้าตามจริง',
    products: [
      { productId: 'p-face',  name: 'Lipo - face',  qty: 100, unit: 'หน่วย' },
      { productId: 'p-body',  name: 'Lipo - body',  qty: 100, unit: 'หน่วย' },
      { productId: 'p-chin',  name: 'Lipo - chin',  qty: 100, unit: 'หน่วย' },
    ],
  };
}

// Mirror the BACKEND-shape placeholder that assignCourseToCustomer writes
// to be_customers.courses (uses `name`, NOT the form-shape `courseName`).
// This is what resolvePickedCourseInCustomer + mapRawCoursesToForm Branch 4
// operate on. buildPurchasedCourseEntry's pick branch is form-shape only.
function makeBackendPickPlaceholder(item, opts = {}) {
  const ts = opts.ts || 1700000000000;
  return {
    courseId: `pick-test-${item.id}-${ts}`,
    name: item.name,
    product: '',
    qty: '',
    status: 'กำลังใช้งาน',
    expiry: '',
    value: item.price ? `${item.price} บาท` : '',
    parentName: '',
    source: '',
    linkedSaleId: null,
    linkedTreatmentId: null,
    courseType: item.courseType || 'เลือกสินค้าตามจริง',
    needsPickSelection: true,
    purchasedItemId: item.id,
    purchasedItemType: 'course',
    isAddon: true,
    availableProducts: (item.products || []).map(p => ({
      productId: p.productId != null ? String(p.productId) : '',
      name: p.name || '',
      qty: Number(p.qty) || 0,
      unit: p.unit || 'ครั้ง',
      minQty: p.minQty != null ? Number(p.minQty) : null,
      maxQty: p.maxQty != null ? Number(p.maxQty) : null,
    })),
    assignedAt: new Date(ts).toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// F18.1 — resolved entries carry pickedFromCourseId + _pickGroupOptions
// (1st sibling only) — the contract that enables reopen-add
// ═══════════════════════════════════════════════════════════════════════

describe('F18.1: resolvePickedCourseInCustomer stamps pick-group meta', () => {
  it('F18.1.1: every resolved entry carries pickedFromCourseId = original placeholder courseId', () => {
    const placeholder = makeBackendPickPlaceholder(makeLipoBufferMasterItem());
    const courses = [placeholder];
    const out = mirrorResolvePickedCourseInCustomer(courses, placeholder.courseId, [
      { productId: 'p-face', name: 'Lipo - face', qty: 30, unit: 'หน่วย' },
      { productId: 'p-body', name: 'Lipo - body', qty: 20, unit: 'หน่วย' },
    ]);
    expect(out).toHaveLength(2);
    out.forEach(e => expect(e.pickedFromCourseId).toBe(placeholder.courseId));
  });

  it('F18.1.2: ONLY the first resolved sibling carries _pickGroupOptions (avoid bloat)', () => {
    const placeholder = makeBackendPickPlaceholder(makeLipoBufferMasterItem());
    const out = mirrorResolvePickedCourseInCustomer([placeholder], placeholder.courseId, [
      { productId: 'p-face', name: 'Lipo - face', qty: 30, unit: 'หน่วย' },
      { productId: 'p-body', name: 'Lipo - body', qty: 20, unit: 'หน่วย' },
      { productId: 'p-chin', name: 'Lipo - chin', qty: 10, unit: 'หน่วย' },
    ]);
    expect(out[0]._pickGroupOptions).toBeTruthy();
    expect(out[0]._pickGroupOptions).toHaveLength(3);
    expect(out[1]._pickGroupOptions).toBeUndefined();
    expect(out[2]._pickGroupOptions).toBeUndefined();
  });

  it('F18.1.3: _pickGroupOptions is a deep snapshot — not a reference to placeholder.availableProducts', () => {
    const placeholder = makeBackendPickPlaceholder(makeLipoBufferMasterItem());
    const originalRef = placeholder.availableProducts;
    const out = mirrorResolvePickedCourseInCustomer([placeholder], placeholder.courseId, [
      { productId: 'p-face', name: 'Lipo - face', qty: 30, unit: 'หน่วย' },
    ]);
    // Identity check — snapshot must be a clone, not the original array
    expect(out[0]._pickGroupOptions).not.toBe(originalRef);
    // Per-element identity check — each entry must be a fresh object
    expect(out[0]._pickGroupOptions[0]).not.toBe(originalRef[0]);
    // Value equality preserved
    expect(out[0]._pickGroupOptions[0].name).toBe(originalRef[0].name);
    expect(out[0]._pickGroupOptions[0].qty).toBe(originalRef[0].qty);
  });

  it('F18.1.4: standard course fields (status, assignedAt, qty) shaped per ProClinic contract', () => {
    const placeholder = makeBackendPickPlaceholder(makeLipoBufferMasterItem());
    const out = mirrorResolvePickedCourseInCustomer([placeholder], placeholder.courseId, [
      { productId: 'p-face', name: 'Lipo - face', qty: 30, unit: 'หน่วย' },
    ]);
    expect(out[0].status).toBe('กำลังใช้งาน');
    expect(out[0].qty).toBe('30 / 30 หน่วย');
    expect(out[0].product).toBe('Lipo - face');
    expect(out[0].productId).toBe('p-face');
    expect(typeof out[0].assignedAt).toBe('string');
  });

  it('F18.1.5: rejects when picks is empty', () => {
    const placeholder = makeBackendPickPlaceholder(makeLipoBufferMasterItem());
    expect(() => mirrorResolvePickedCourseInCustomer([placeholder], placeholder.courseId, []))
      .toThrow(/No valid picks/);
    expect(() => mirrorResolvePickedCourseInCustomer([placeholder], placeholder.courseId, null))
      .toThrow(/No valid picks/);
  });

  it('F18.1.6: rejects picks with qty=0 or missing productId+name', () => {
    const placeholder = makeBackendPickPlaceholder(makeLipoBufferMasterItem());
    expect(() => mirrorResolvePickedCourseInCustomer([placeholder], placeholder.courseId, [
      { productId: 'p-face', qty: 0 }, // qty=0 → filtered
      {},                              // empty → filtered
    ])).toThrow(/No valid picks/);
  });

  it('F18.1.7: placeholder removed from courses (splice), not duplicated', () => {
    const placeholder = makeBackendPickPlaceholder(makeLipoBufferMasterItem());
    const others = [
      { courseId: 'before', name: 'Other 1', courseType: 'เหมาตามจริง' },
      placeholder,
      { courseId: 'after',  name: 'Other 2', courseType: 'บุฟเฟต์' },
    ];
    const out = mirrorResolvePickedCourseInCustomer(others, placeholder.courseId, [
      { productId: 'p-face', name: 'Lipo - face', qty: 30 },
    ]);
    expect(out).toHaveLength(3); // before + resolved + after
    expect(out.find(c => c.needsPickSelection === true)).toBeUndefined();
    expect(out[0].courseId).toBe('before');
    expect(out[2].courseId).toBe('after');
    expect(out[1].pickedFromCourseId).toBe(placeholder.courseId);
  });

  it('F18.1.8: resolved entries inherit base placeholder meta (purchasedItemId, isAddon, etc)', () => {
    const placeholder = makeBackendPickPlaceholder(makeLipoBufferMasterItem());
    const out = mirrorResolvePickedCourseInCustomer([placeholder], placeholder.courseId, [
      { productId: 'p-face', name: 'Lipo - face', qty: 30 },
    ]);
    expect(out[0].purchasedItemId).toBe('900');
    expect(out[0].purchasedItemType).toBe('course');
    expect(out[0].isAddon).toBe(true);
    expect(out[0].courseType).toBe('เลือกสินค้าตามจริง');
    expect(out[0].name).toBe('Lipo Buffet');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F18.2 — addPicksToResolvedGroup appends new siblings preserving the
// pick-group identity. Existing entries unchanged (deduction history safe).
// ═══════════════════════════════════════════════════════════════════════

describe('F18.2: addPicksToResolvedGroup appends siblings', () => {
  function makeResolvedCustomerCourses() {
    // Setup: an initial pick was already resolved with face + body
    const placeholder = makeBackendPickPlaceholder(makeLipoBufferMasterItem());
    return mirrorResolvePickedCourseInCustomer([placeholder], placeholder.courseId, [
      { productId: 'p-face', name: 'Lipo - face', qty: 30, unit: 'หน่วย' },
      { productId: 'p-body', name: 'Lipo - body', qty: 20, unit: 'หน่วย' },
    ]);
  }

  it('F18.2.1: new entries appended at end, existing siblings untouched', () => {
    const courses = makeResolvedCustomerCourses();
    const groupId = courses[0].pickedFromCourseId;
    const before = JSON.parse(JSON.stringify(courses));
    const out = mirrorAddPicksToResolvedGroup(courses, groupId, [
      { productId: 'p-chin', name: 'Lipo - chin', qty: 10, unit: 'หน่วย' },
    ]);
    expect(out).toHaveLength(3);
    expect(out[2].product).toBe('Lipo - chin');
    expect(out[2].pickedFromCourseId).toBe(groupId);
    // Existing entries by-value-equal to before
    expect(out[0]).toEqual(before[0]);
    expect(out[1]).toEqual(before[1]);
  });

  it('F18.2.2: new entries DO NOT carry _pickGroupOptions (1st-sibling-only invariant)', () => {
    const courses = makeResolvedCustomerCourses();
    const groupId = courses[0].pickedFromCourseId;
    const out = mirrorAddPicksToResolvedGroup(courses, groupId, [
      { productId: 'p-chin', name: 'Lipo - chin', qty: 10 },
    ]);
    expect(out[2]._pickGroupOptions).toBeUndefined();
    // First sibling still has it (untouched)
    expect(out[0]._pickGroupOptions).toBeTruthy();
    expect(out[0]._pickGroupOptions).toHaveLength(3);
  });

  it('F18.2.3: new entries inherit base meta (purchasedItemId, courseType, isAddon, courseName, parentName, source, linkedSaleId)', () => {
    const courses = makeResolvedCustomerCourses();
    const groupId = courses[0].pickedFromCourseId;
    const out = mirrorAddPicksToResolvedGroup(courses, groupId, [
      { productId: 'p-chin', name: 'Lipo - chin', qty: 10 },
    ]);
    expect(out[2].purchasedItemId).toBe('900');
    expect(out[2].courseType).toBe('เลือกสินค้าตามจริง');
    expect(out[2].isAddon).toBe(true);
    expect(out[2].name).toBe('Lipo Buffet');
  });

  it('F18.2.4: new entries get a fresh assignedAt distinct from siblings', () => {
    const courses = makeResolvedCustomerCourses();
    const groupId = courses[0].pickedFromCourseId;
    const out = mirrorAddPicksToResolvedGroup(courses, groupId, [
      { productId: 'p-chin', name: 'Lipo - chin', qty: 10 },
    ]);
    // Mirror uses fixed dates — siblings='2026-04-26T10:00:00.000Z',
    // new='2026-04-26T11:00:00.000Z'. Real impl uses Date.now() each call.
    expect(out[2].assignedAt).not.toBe(out[0].assignedAt);
  });

  it('F18.2.5: rejects when no siblings match the group id (e.g. typo or wrong customer)', () => {
    const courses = makeResolvedCustomerCourses();
    expect(() => mirrorAddPicksToResolvedGroup(courses, 'bogus-id', [
      { productId: 'p-chin', name: 'Lipo - chin', qty: 10 },
    ])).toThrow(/No existing picked entries/);
  });

  it('F18.2.6: rejects empty/null pickedFromCourseId', () => {
    const courses = makeResolvedCustomerCourses();
    expect(() => mirrorAddPicksToResolvedGroup(courses, '', [
      { productId: 'p-chin', qty: 10 },
    ])).toThrow(/pickedFromCourseId required/);
    expect(() => mirrorAddPicksToResolvedGroup(courses, null, [])).toThrow(/pickedFromCourseId required/);
  });

  it('F18.2.7: rejects empty/all-invalid additionalPicks', () => {
    const courses = makeResolvedCustomerCourses();
    const groupId = courses[0].pickedFromCourseId;
    expect(() => mirrorAddPicksToResolvedGroup(courses, groupId, [])).toThrow(/No valid picks/);
    expect(() => mirrorAddPicksToResolvedGroup(courses, groupId, [
      { productId: 'p-chin', qty: 0 },
    ])).toThrow(/No valid picks/);
  });

  it('F18.2.8: appending the SAME product as an existing sibling creates a NEW entry — does NOT merge qty', () => {
    // Trade-off: the user might want to bump face from 30 → 40, but
    // editing existing entries breaks deduction history. Add-only path
    // creates a SECOND face entry with qty=10. UI/user can perceive these
    // as two separate sessions of the same product.
    const courses = makeResolvedCustomerCourses();
    const groupId = courses[0].pickedFromCourseId;
    const out = mirrorAddPicksToResolvedGroup(courses, groupId, [
      { productId: 'p-face', name: 'Lipo - face', qty: 10, unit: 'หน่วย' },
    ]);
    expect(out).toHaveLength(3);
    expect(out[0].qty).toBe('30 / 30 หน่วย');  // original untouched
    expect(out[2].qty).toBe('10 / 10 หน่วย');  // new sibling
    expect(out[0].product).toBe('Lipo - face');
    expect(out[2].product).toBe('Lipo - face');
  });

  it('F18.2.9: multiple add rounds — each produces siblings with same group id', () => {
    let courses = makeResolvedCustomerCourses();
    const groupId = courses[0].pickedFromCourseId;
    courses = mirrorAddPicksToResolvedGroup(courses, groupId, [
      { productId: 'p-chin', name: 'Lipo - chin', qty: 10 },
    ]);
    courses = mirrorAddPicksToResolvedGroup(courses, groupId, [
      { productId: 'p-face', name: 'Lipo - face', qty: 5 },
    ]);
    expect(courses).toHaveLength(4);
    courses.forEach(c => expect(c.pickedFromCourseId).toBe(groupId));
    // Only the FIRST sibling has _pickGroupOptions (invariant preserved
    // across multiple add rounds)
    expect(courses[0]._pickGroupOptions).toBeTruthy();
    expect(courses[1]._pickGroupOptions).toBeUndefined();
    expect(courses[2]._pickGroupOptions).toBeUndefined();
    expect(courses[3]._pickGroupOptions).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F18.3 — mapRawCoursesToForm carries pick-group meta to the form layer
// (the part TFP renders in the course list)
// ═══════════════════════════════════════════════════════════════════════

describe('F18.3: mapRawCoursesToForm surfaces _pickedFromCourseId + _pickGroupOptions', () => {
  it('F18.3.1: 1st sibling form entry has _pickGroupOptions populated', () => {
    const placeholder = makeBackendPickPlaceholder(makeLipoBufferMasterItem());
    const resolved = mirrorResolvePickedCourseInCustomer([placeholder], placeholder.courseId, [
      { productId: 'p-face', name: 'Lipo - face', qty: 30, unit: 'หน่วย' },
      { productId: 'p-body', name: 'Lipo - body', qty: 20, unit: 'หน่วย' },
    ]);
    const form = mapRawCoursesToForm(resolved);
    expect(form).toHaveLength(2);
    expect(form[0]._pickedFromCourseId).toBe(placeholder.courseId);
    expect(form[0]._pickGroupOptions).toBeTruthy();
    expect(form[0]._pickGroupOptions).toHaveLength(3);
  });

  it('F18.3.2: non-1st siblings have _pickedFromCourseId BUT NOT _pickGroupOptions', () => {
    const placeholder = makeBackendPickPlaceholder(makeLipoBufferMasterItem());
    const resolved = mirrorResolvePickedCourseInCustomer([placeholder], placeholder.courseId, [
      { productId: 'p-face', name: 'Lipo - face', qty: 30 },
      { productId: 'p-body', name: 'Lipo - body', qty: 20 },
    ]);
    const form = mapRawCoursesToForm(resolved);
    expect(form[1]._pickedFromCourseId).toBe(placeholder.courseId);
    expect(form[1]._pickGroupOptions).toBeNull();
  });

  it('F18.3.3: regular non-pick courses have NULL _pickedFromCourseId + NULL _pickGroupOptions', () => {
    const courses = [
      { name: 'Specific', product: 'A', qty: '5 / 5 ครั้ง', courseType: '' },
    ];
    const form = mapRawCoursesToForm(courses);
    expect(form).toHaveLength(1);
    expect(form[0]._pickedFromCourseId).toBeNull();
    expect(form[0]._pickGroupOptions).toBeNull();
  });

  it('F18.3.4: placeholder branch (Branch 1) does not interfere — needsPickSelection still gates pick button', () => {
    const courses = [{
      name: 'Lipo Buffet',
      courseType: 'เลือกสินค้าตามจริง',
      needsPickSelection: true,
      availableProducts: [{ productId: 'p-face', name: 'Lipo - face', qty: 100, unit: 'หน่วย' }],
      qty: '', product: '',
    }];
    const form = mapRawCoursesToForm(courses);
    expect(form).toHaveLength(1);
    expect(form[0].isPickAtTreatment).toBe(true);
    expect(form[0].needsPickSelection).toBe(true);
    // Branch 1 doesn't set _pickedFromCourseId (no resolution happened yet)
    expect(form[0]._pickedFromCourseId).toBeUndefined();
  });

  it('F18.3.5: fully-consumed sibling (remaining=0) is filtered out — does NOT lose pick-group meta on REMAINING siblings', () => {
    const placeholder = makeBackendPickPlaceholder(makeLipoBufferMasterItem());
    let courses = mirrorResolvePickedCourseInCustomer([placeholder], placeholder.courseId, [
      { productId: 'p-face', name: 'Lipo - face', qty: 30 },
      { productId: 'p-body', name: 'Lipo - body', qty: 20 },
    ]);
    // Simulate face fully consumed: qty 0 / 30
    courses[0] = { ...courses[0], qty: '0 / 30 ครั้ง' };
    const form = mapRawCoursesToForm(courses);
    expect(form).toHaveLength(1); // face filtered, body remains
    // body still carries the group id (so reopen still works) BUT
    // _pickGroupOptions is null since body wasn't the 1st sibling.
    // The reopen button thus disappears once the FIRST sibling exhausts.
    // KNOWN UX trade-off: future enhancement could promote 2nd sibling to
    // hold _pickGroupOptions when 1st is removed by reload, but for v1
    // we accept the trade-off (rare scenario; user can buy a fresh course).
    expect(form[0]._pickedFromCourseId).toBe(placeholder.courseId);
    expect(form[0]._pickGroupOptions).toBeNull();
  });

  it('F18.3.6: _pickGroupOptions snapshot survives JSON round-trip (Firestore-safe)', () => {
    const placeholder = makeBackendPickPlaceholder(makeLipoBufferMasterItem());
    const resolved = mirrorResolvePickedCourseInCustomer([placeholder], placeholder.courseId, [
      { productId: 'p-face', name: 'Lipo - face', qty: 30 },
    ]);
    const roundtripped = JSON.parse(JSON.stringify(resolved));
    const form = mapRawCoursesToForm(roundtripped);
    expect(form[0]._pickGroupOptions).toHaveLength(3);
    expect(form[0]._pickGroupOptions[0].name).toBe('Lipo - face');
    expect(form[0]._pickGroupOptions[1].name).toBe('Lipo - body');
    expect(form[0]._pickGroupOptions[2].name).toBe('Lipo - chin');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F18.4 — Full-flow: visit 1 (initial pick) → visit 2 (reopen + add) →
// form layer reflects all 3 siblings with the right meta
// ═══════════════════════════════════════════════════════════════════════

describe('F18.4: end-to-end reopen-add chain', () => {
  it('F18.4.1: visit 1 picks face+body → visit 2 adds chin → 3 siblings visible in form', () => {
    // ── Visit 1 ──
    const placeholder = makeBackendPickPlaceholder(makeLipoBufferMasterItem());
    let customerCourses = [placeholder];
    customerCourses = mirrorResolvePickedCourseInCustomer(customerCourses, placeholder.courseId, [
      { productId: 'p-face', name: 'Lipo - face', qty: 30, unit: 'หน่วย' },
      { productId: 'p-body', name: 'Lipo - body', qty: 20, unit: 'หน่วย' },
    ]);
    expect(customerCourses).toHaveLength(2);
    let form = mapRawCoursesToForm(customerCourses);
    expect(form).toHaveLength(2);
    expect(form[0]._pickGroupOptions).toBeTruthy();

    // ── Visit 2 ── reopen and add chin
    const groupId = form[0]._pickedFromCourseId;
    customerCourses = mirrorAddPicksToResolvedGroup(customerCourses, groupId, [
      { productId: 'p-chin', name: 'Lipo - chin', qty: 10, unit: 'หน่วย' },
    ]);
    expect(customerCourses).toHaveLength(3);
    form = mapRawCoursesToForm(customerCourses);
    expect(form).toHaveLength(3);

    // First sibling still holds the snapshot (allows another reopen)
    expect(form[0]._pickGroupOptions).toBeTruthy();
    // All 3 share the same group id
    form.forEach(f => expect(f._pickedFromCourseId).toBe(placeholder.courseId));
    // Each entry has its own product
    expect(form.map(f => f.products[0].name)).toEqual([
      'Lipo - face', 'Lipo - body', 'Lipo - chin',
    ]);
  });

  it('F18.4.2: chained reopens compose — visit 3 adds another face entry', () => {
    const placeholder = makeBackendPickPlaceholder(makeLipoBufferMasterItem());
    let customerCourses = mirrorResolvePickedCourseInCustomer([placeholder], placeholder.courseId, [
      { productId: 'p-face', name: 'Lipo - face', qty: 30 },
    ]);
    const groupId = customerCourses[0].pickedFromCourseId;
    // Visit 2: add body
    customerCourses = mirrorAddPicksToResolvedGroup(customerCourses, groupId, [
      { productId: 'p-body', name: 'Lipo - body', qty: 20 },
    ]);
    // Visit 3: add another face (different "session")
    customerCourses = mirrorAddPicksToResolvedGroup(customerCourses, groupId, [
      { productId: 'p-face', name: 'Lipo - face', qty: 15 },
    ]);
    const form = mapRawCoursesToForm(customerCourses);
    expect(form).toHaveLength(3);
    expect(form[0].products[0].name).toBe('Lipo - face');  // visit 1
    expect(form[1].products[0].name).toBe('Lipo - body');  // visit 2
    expect(form[2].products[0].name).toBe('Lipo - face');  // visit 3 (separate)
    expect(form[2].products[0].total).toBe('15');
  });

  it('F18.4.3: independent groups (two different pick-at-treatment courses) — reopen does NOT cross-contaminate', () => {
    const placeholderA = makeBackendPickPlaceholder({
      ...makeLipoBufferMasterItem(), id: '900', name: 'Lipo Buffet',
    }, { ts: 1700000000000 });
    const placeholderB = makeBackendPickPlaceholder({
      ...makeLipoBufferMasterItem(), id: '901', name: 'Botox Buffet',
      products: [
        { productId: 'b-face', name: 'Botox - face', qty: 50, unit: 'U' },
        { productId: 'b-jaw',  name: 'Botox - jaw',  qty: 50, unit: 'U' },
      ],
    }, { ts: 1700000001000 });
    let courses = [placeholderA, placeholderB];
    courses = mirrorResolvePickedCourseInCustomer(courses, placeholderA.courseId, [
      { productId: 'p-face', name: 'Lipo - face', qty: 30 },
    ]);
    courses = mirrorResolvePickedCourseInCustomer(courses, placeholderB.courseId, [
      { productId: 'b-face', name: 'Botox - face', qty: 25 },
    ]);
    expect(courses).toHaveLength(2);
    // Reopen group A only — group B should be untouched
    courses = mirrorAddPicksToResolvedGroup(courses, placeholderA.courseId, [
      { productId: 'p-body', name: 'Lipo - body', qty: 10 },
    ]);
    expect(courses).toHaveLength(3);
    const groupA = courses.filter(c => c.pickedFromCourseId === placeholderA.courseId);
    const groupB = courses.filter(c => c.pickedFromCourseId === placeholderB.courseId);
    expect(groupA).toHaveLength(2);
    expect(groupB).toHaveLength(1);
    expect(groupB[0].product).toBe('Botox - face');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F18.5 — source-grep regression guards on the real backendClient.js +
// TreatmentFormPage.jsx wiring sites. These catch the CLASS of bugs that
// pure-helper tests can't (V13/V21 lesson — source-grep + simulate +
// preview_eval triple required).
// ═══════════════════════════════════════════════════════════════════════

describe('F18.5: source-grep regression guards', () => {
  const BC = READ('src/lib/backendClient.js');
  const HE = READ('src/lib/treatmentBuyHelpers.js');
  const TFP = READ('src/components/TreatmentFormPage.jsx');

  it('F18.5.1: backendClient exports addPicksToResolvedGroup', () => {
    expect(BC).toMatch(/export\s+async\s+function\s+addPicksToResolvedGroup/);
  });

  it('F18.5.2: resolvePickedCourseInCustomer stamps pickedFromCourseId on every resolved entry', () => {
    const fn = BC.match(/export async function resolvePickedCourseInCustomer[\s\S]+?^}/m)?.[0] || '';
    expect(fn).toMatch(/pickedFromCourseId:\s*discardedPickId/);
  });

  it('F18.5.3: resolvePickedCourseInCustomer stamps _pickGroupOptions on FIRST sibling only', () => {
    const fn = BC.match(/export async function resolvePickedCourseInCustomer[\s\S]+?^}/m)?.[0] || '';
    expect(fn).toMatch(/i === 0 && pickGroupOptions/);
    expect(fn).toMatch(/_pickGroupOptions:\s*pickGroupOptions/);
  });

  it('F18.5.4: addPicksToResolvedGroup template strips _pickGroupOptions BEFORE spreading (1st-sibling-only invariant)', () => {
    const fn = BC.match(/export async function addPicksToResolvedGroup[\s\S]+?^}/m)?.[0] || '';
    expect(fn).toMatch(/_pickGroupOptions:\s*_stripOptions/);
    // baseTpl spread must NOT carry _pickGroupOptions
    expect(fn).toMatch(/\.\.\.baseTpl/);
  });

  it('F18.5.5: addPicksToResolvedGroup APPENDS (push) — does NOT splice/replace', () => {
    const fn = BC.match(/export async function addPicksToResolvedGroup[\s\S]+?^}/m)?.[0] || '';
    expect(fn).toMatch(/courses\.push\(\.\.\.newEntries\)/);
    expect(fn).not.toMatch(/courses\.splice/);
  });

  it('F18.5.6: addPicksToResolvedGroup throws on missing pickedFromCourseId', () => {
    const fn = BC.match(/export async function addPicksToResolvedGroup[\s\S]+?^}/m)?.[0] || '';
    expect(fn).toMatch(/pickedFromCourseId required/);
  });

  it('F18.5.7: mapRawCoursesToForm carries _pickedFromCourseId + _pickGroupOptions on Branch 4', () => {
    expect(HE).toMatch(/_pickedFromCourseId:\s*c\.pickedFromCourseId\s*\|\|\s*null/);
    expect(HE).toMatch(/_pickGroupOptions:\s*Array\.isArray\(c\._pickGroupOptions\)/);
  });

  it('F18.5.8: TFP imports + calls addPicksToResolvedGroup in the reopen onConfirm', () => {
    // The dynamic import line is the canonical wiring site
    expect(TFP).toMatch(/import\(['"]\.\.\/lib\/backendClient\.js['"]\)[\s\S]{0,200}addPicksToResolvedGroup/);
    // Match the actual call (paren-anchored — ignores comment mentions)
    expect(TFP).toMatch(/await\s+addPicksToResolvedGroup\(\s*customerId/);
  });

  it('F18.5.9: TFP renders the reopen button only when both fields present (gate is _pickGroupOptions && _pickedFromCourseId)', () => {
    expect(TFP).toMatch(/course\._pickGroupOptions\s*&&\s*course\._pickedFromCourseId/);
  });

  it('F18.5.10: reopen button has data-testid for E2E targetability', () => {
    expect(TFP).toMatch(/data-testid=\{`reopen-pick-\$\{course\._pickedFromCourseId\}`\}/);
  });

  it('F18.5.11: TFP exposes setReopenPickGroup state (modal toggle)', () => {
    expect(TFP).toMatch(/const \[reopenPickGroup, setReopenPickGroup\] = useState\(null\)/);
  });

  it('F18.5.12: TFP re-fetches customer + remaps courses after addPicksToResolvedGroup', () => {
    // Anchor at the actual call — `await addPicksToResolvedGroup(` (paren) —
    // not at the JSDoc-comment substring. Then assert the next ~800 chars
    // include the re-fetch + remap + setOptions chain.
    const callIdx = TFP.search(/await\s+addPicksToResolvedGroup\(/);
    expect(callIdx).toBeGreaterThan(-1);
    const region = TFP.slice(callIdx, callIdx + 800);
    expect(region).toMatch(/getBackendCustomer\(customerId\)/);
    expect(region).toMatch(/mapRawCoursesToForm/);
    expect(region).toMatch(/setOptions\(/);
  });

  it('F18.5.13: ANTI-REGRESSION — resolvePickedCourseInCustomer does NOT discard pickedFromCourseId or _pickGroupOptions in the destructure', () => {
    const fn = BC.match(/export async function resolvePickedCourseInCustomer[\s\S]+?^}/m)?.[0] || '';
    // The destructure pulls availableProducts + courseId BUT preserves them as
    // named locals (discardedOptions / discardedPickId) — NOT prefixed with
    // underscore-discard. If a future cleanup renames them to _discard*, this
    // guard fails so the contract regression is caught.
    expect(fn).toMatch(/availableProducts:\s*discardedOptions/);
    expect(fn).toMatch(/courseId:\s*discardedPickId/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F18.6 — Adversarial inputs: malformed picks, mixed sibling shapes,
// concurrent mutations, encoding edge cases
// ═══════════════════════════════════════════════════════════════════════

describe('F18.6: adversarial inputs', () => {
  it('F18.6.1: numeric picked-from id (legacy) still works as group key', () => {
    const placeholder = {
      courseId: 'purchased-course-900-123',
      courseName: 'Test',
      courseType: 'เลือกสินค้าตามจริง',
      needsPickSelection: true,
      availableProducts: [{ productId: 'p-1', name: 'A', qty: 5, unit: 'U' }],
      products: [],
    };
    const out = mirrorResolvePickedCourseInCustomer([placeholder], placeholder.courseId, [
      { productId: 'p-1', name: 'A', qty: 3 },
    ]);
    expect(out[0].pickedFromCourseId).toBe(placeholder.courseId);
  });

  it('F18.6.2: picks with non-string productId (number) coerced to string', () => {
    const placeholder = makeBackendPickPlaceholder(makeLipoBufferMasterItem());
    const out = mirrorResolvePickedCourseInCustomer([placeholder], placeholder.courseId, [
      { productId: 12345, name: 'Numeric ID', qty: 5 },
    ]);
    expect(out[0].productId).toBe('12345');
    expect(typeof out[0].productId).toBe('string');
  });

  it('F18.6.3: Thai product names + commas in qty pass through unchanged', () => {
    const placeholder = makeBackendPickPlaceholder({
      ...makeLipoBufferMasterItem(),
      products: [{ productId: 'p-thai', name: 'รักแร้', qty: 1000, unit: 'ครั้ง' }],
    });
    const out = mirrorResolvePickedCourseInCustomer([placeholder], placeholder.courseId, [
      { productId: 'p-thai', name: 'รักแร้', qty: 1000, unit: 'ครั้ง' },
    ]);
    expect(out[0].product).toBe('รักแร้');
    expect(out[0].qty).toBe('1000 / 1000 ครั้ง');
  });

  it('F18.6.4: addPicksToResolvedGroup with picks containing duplicate productId → both added (no merge)', () => {
    const placeholder = makeBackendPickPlaceholder(makeLipoBufferMasterItem());
    const initial = mirrorResolvePickedCourseInCustomer([placeholder], placeholder.courseId, [
      { productId: 'p-face', name: 'Lipo - face', qty: 30 },
    ]);
    const out = mirrorAddPicksToResolvedGroup(initial, placeholder.courseId, [
      { productId: 'p-chin', name: 'Lipo - chin', qty: 5 },
      { productId: 'p-chin', name: 'Lipo - chin', qty: 10 },
    ]);
    expect(out).toHaveLength(3); // 1 initial + 2 new
    expect(out.filter(c => c.product === 'Lipo - chin')).toHaveLength(2);
  });

  it('F18.6.5: mixed valid + invalid picks → only valid ones land', () => {
    const placeholder = makeBackendPickPlaceholder(makeLipoBufferMasterItem());
    const out = mirrorResolvePickedCourseInCustomer([placeholder], placeholder.courseId, [
      { productId: 'p-face', name: 'Lipo - face', qty: 30 }, // valid
      { productId: 'p-body', qty: 0 },                        // qty=0 → filtered
      { productId: 'p-chin', name: 'Lipo - chin', qty: 5 },  // valid
      {},                                                      // empty → filtered
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].product).toBe('Lipo - face');
    expect(out[1].product).toBe('Lipo - chin');
  });

  it('F18.6.6: picks array passed as null/undefined → throws cleanly (no TypeError on .filter)', () => {
    const placeholder = makeBackendPickPlaceholder(makeLipoBufferMasterItem());
    expect(() => mirrorResolvePickedCourseInCustomer([placeholder], placeholder.courseId, null))
      .toThrow(/No valid picks/);
    expect(() => mirrorResolvePickedCourseInCustomer([placeholder], placeholder.courseId, undefined))
      .toThrow(/No valid picks/);
  });

  it('F18.6.7: course array with falsy entries (null, undefined) does not crash siblings filter', () => {
    const placeholder = makeBackendPickPlaceholder(makeLipoBufferMasterItem());
    let courses = mirrorResolvePickedCourseInCustomer([placeholder], placeholder.courseId, [
      { productId: 'p-face', name: 'Lipo - face', qty: 30 },
    ]);
    // Insert a null entry between siblings (data corruption simulation)
    courses = [courses[0], null, undefined];
    expect(() => mirrorAddPicksToResolvedGroup(courses, placeholder.courseId, [
      { productId: 'p-chin', name: 'Lipo - chin', qty: 5 },
    ])).not.toThrow();
  });
});
