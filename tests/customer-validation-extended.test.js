// V33-customer-create — extended validator + normalizer tests
// Covers the new keys (gallery_upload, created_year), new validators
// (facebook_link regex, line_id regex, gallery shape), normalizer migrations
// (is_image_marketing_allowed → consent.imageMarketing, passport upper-case),
// and the 13 new FIELD_BOUNDS keys.

import { describe, it, expect } from 'vitest';
import {
  validateCustomer,
  normalizeCustomer,
  emptyCustomerForm,
  CONSENT_KEYS,
  GENDER_OPTIONS,
  RECEIPT_TYPE_OPTIONS,
} from '../src/lib/customerValidation.js';

describe('V33.A — emptyCustomerForm shape extensions', () => {
  it('A1 — gallery_upload defaults to empty array', () => {
    const f = emptyCustomerForm();
    expect(Array.isArray(f.gallery_upload)).toBe(true);
    expect(f.gallery_upload.length).toBe(0);
  });
  it('A2 — created_year defaults to null', () => {
    expect(emptyCustomerForm().created_year).toBeNull();
  });
  it('A3 — consent has 3 keys including imageMarketing', () => {
    const c = emptyCustomerForm().consent;
    expect(c).toMatchObject({ marketing: false, healthData: false, imageMarketing: false });
  });
  it('A4 — CONSENT_KEYS includes imageMarketing', () => {
    expect(CONSENT_KEYS).toContain('imageMarketing');
  });
  it('A5 — empty form passes non-strict validation', () => {
    expect(validateCustomer(emptyCustomerForm())).toBeNull();
  });
  it('A6 — empty form fails strict validation on firstname', () => {
    const fail = validateCustomer(emptyCustomerForm(), { strict: true });
    expect(fail?.[0]).toBe('firstname');
  });
});

describe('V33.B — FIELD_BOUNDS new keys', () => {
  const cases = [
    ['customer_type', 50],
    ['customer_type_2', 50],
    ['blood_type', 10],
    ['passport_id', 30],
    ['profile_image', 500],
    ['card_photo', 500],
    ['doctor_id', 50],
    ['contact_1_firstname', 100],
    ['contact_1_firstname_en', 100],
    ['contact_1_lastname', 100],
    ['contact_1_lastname_en', 100],
    ['contact_1_telephone_number', 30],
    ['contact_2_firstname', 100],
    ['contact_2_firstname_en', 100],
    ['contact_2_lastname', 100],
    ['contact_2_lastname_en', 100],
    ['contact_2_telephone_number', 30],
    ['prefix_en', 40],
  ];
  it('B1 — every new bound rejects oversize value', () => {
    for (const [key, limit] of cases) {
      const f = { ...emptyCustomerForm(), firstname: 'A', hn_no: '1', [key]: 'x'.repeat(limit + 1) };
      const fail = validateCustomer(f);
      expect(fail?.[0], `${key} should reject oversize`).toBe(key);
    }
  });
  it('B2 — every new bound accepts value at exact limit', () => {
    for (const [key, limit] of cases) {
      const f = { ...emptyCustomerForm(), [key]: 'x'.repeat(limit) };
      expect(validateCustomer(f), `${key} should accept ${limit} chars`).toBeNull();
    }
  });
});

describe('V33.C — facebook_link validator', () => {
  it('C1 — accepts https facebook.com URL', () => {
    const f = { ...emptyCustomerForm(), facebook_link: 'https://www.facebook.com/foo' };
    expect(validateCustomer(f)).toBeNull();
  });
  it('C2 — accepts http fb.com URL', () => {
    const f = { ...emptyCustomerForm(), facebook_link: 'http://fb.com/bar' };
    expect(validateCustomer(f)).toBeNull();
  });
  it('C3 — accepts protocol-relative //facebook.me/baz', () => {
    const f = { ...emptyCustomerForm(), facebook_link: '//facebook.me/baz' };
    expect(validateCustomer(f)).toBeNull();
  });
  it('C4 — rejects non-Facebook URL', () => {
    const f = { ...emptyCustomerForm(), facebook_link: 'https://twitter.com/foo' };
    expect(validateCustomer(f)?.[0]).toBe('facebook_link');
  });
  it('C5 — rejects plain text', () => {
    const f = { ...emptyCustomerForm(), facebook_link: 'just-text' };
    expect(validateCustomer(f)?.[0]).toBe('facebook_link');
  });
  it('C6 — empty facebook_link OK', () => {
    expect(validateCustomer({ ...emptyCustomerForm(), facebook_link: '' })).toBeNull();
  });
});

describe('V33.D — line_id validator', () => {
  it('D1 — accepts 2-100 char alphanumeric._-', () => {
    expect(validateCustomer({ ...emptyCustomerForm(), line_id: 'foo.bar_baz-1' })).toBeNull();
  });
  it('D2 — rejects single char (< 2)', () => {
    expect(validateCustomer({ ...emptyCustomerForm(), line_id: 'a' })?.[0]).toBe('line_id');
  });
  it('D3 — rejects URL', () => {
    expect(validateCustomer({ ...emptyCustomerForm(), line_id: 'https://line.me/x' })?.[0]).toBe('line_id');
  });
  it('D4 — rejects spaces', () => {
    expect(validateCustomer({ ...emptyCustomerForm(), line_id: 'foo bar' })?.[0]).toBe('line_id');
  });
  it('D5 — rejects Thai chars', () => {
    expect(validateCustomer({ ...emptyCustomerForm(), line_id: 'ไลน์' })?.[0]).toBe('line_id');
  });
  it('D6 — empty line_id OK', () => {
    expect(validateCustomer({ ...emptyCustomerForm(), line_id: '' })).toBeNull();
  });
});

describe('V33.E — created_year validator', () => {
  it('E1 — accepts integer 2026', () => {
    expect(validateCustomer({ ...emptyCustomerForm(), created_year: 2026 })).toBeNull();
  });
  it('E2 — accepts null', () => {
    expect(validateCustomer({ ...emptyCustomerForm(), created_year: null })).toBeNull();
  });
  it('E3 — rejects 1899 (too old)', () => {
    expect(validateCustomer({ ...emptyCustomerForm(), created_year: 1899 })?.[0]).toBe('created_year');
  });
  it('E4 — rejects 2101 (too far future)', () => {
    expect(validateCustomer({ ...emptyCustomerForm(), created_year: 2101 })?.[0]).toBe('created_year');
  });
  it('E5 — rejects non-integer 2026.5', () => {
    expect(validateCustomer({ ...emptyCustomerForm(), created_year: 2026.5 })?.[0]).toBe('created_year');
  });
  it('E6 — rejects string "abc"', () => {
    expect(validateCustomer({ ...emptyCustomerForm(), created_year: 'abc' })?.[0]).toBe('created_year');
  });
});

describe('V33.F — gallery_upload validator', () => {
  it('F1 — accepts empty array', () => {
    expect(validateCustomer({ ...emptyCustomerForm(), gallery_upload: [] })).toBeNull();
  });
  it('F2 — accepts up to 20 https URLs', () => {
    const arr = Array.from({ length: 20 }, (_, i) => `https://x.com/${i}`);
    expect(validateCustomer({ ...emptyCustomerForm(), gallery_upload: arr })).toBeNull();
  });
  it('F3 — rejects 21 items', () => {
    const arr = Array.from({ length: 21 }, (_, i) => `https://x.com/${i}`);
    expect(validateCustomer({ ...emptyCustomerForm(), gallery_upload: arr })?.[0]).toBe('gallery_upload');
  });
  it('F4 — rejects non-array', () => {
    expect(validateCustomer({ ...emptyCustomerForm(), gallery_upload: 'http://x' })?.[0]).toBe('gallery_upload');
  });
  it('F5 — rejects non-string item', () => {
    expect(validateCustomer({ ...emptyCustomerForm(), gallery_upload: [123] })?.[0]).toBe('gallery_upload');
  });
  it('F6 — rejects non-https item', () => {
    expect(validateCustomer({ ...emptyCustomerForm(), gallery_upload: ['ftp://x.com/a'] })?.[0]).toBe('gallery_upload');
  });
  it('F7 — rejects URL > 500 chars', () => {
    const long = 'https://x.com/' + 'a'.repeat(500);
    expect(validateCustomer({ ...emptyCustomerForm(), gallery_upload: [long] })?.[0]).toBe('gallery_upload');
  });
  it('F8 — accepts http (not just https)', () => {
    expect(validateCustomer({ ...emptyCustomerForm(), gallery_upload: ['http://x.com/a'] })).toBeNull();
  });
});

describe('V33.G — normalizeCustomer extensions', () => {
  it('G1 — passport_id trimmed + uppercased', () => {
    const out = normalizeCustomer({ ...emptyCustomerForm(), passport_id: '  aa1234567  ' });
    expect(out.passport_id).toBe('AA1234567');
  });
  it('G2 — created_year coerced from string', () => {
    const out = normalizeCustomer({ ...emptyCustomerForm(), created_year: '2026' });
    expect(out.created_year).toBe(2026);
  });
  it('G3 — created_year invalid string → null', () => {
    const out = normalizeCustomer({ ...emptyCustomerForm(), created_year: 'abc' });
    expect(out.created_year).toBeNull();
  });
  it('G4 — created_year empty string → null', () => {
    const out = normalizeCustomer({ ...emptyCustomerForm(), created_year: '' });
    expect(out.created_year).toBeNull();
  });
  it('G5 — gallery_upload deduped + trimmed + cap 20', () => {
    const arr = ['  https://x.com/a  ', 'https://x.com/a', 'https://x.com/b', '', null, 'https://x.com/c'];
    const out = normalizeCustomer({ ...emptyCustomerForm(), gallery_upload: arr });
    expect(out.gallery_upload).toEqual(['https://x.com/a', 'https://x.com/b', 'https://x.com/c']);
  });
  it('G6 — gallery_upload non-array → empty array', () => {
    const out = normalizeCustomer({ ...emptyCustomerForm(), gallery_upload: 'oops' });
    expect(out.gallery_upload).toEqual([]);
  });
  it('G7 — gallery_upload caps at 20', () => {
    const arr = Array.from({ length: 30 }, (_, i) => `https://x.com/${i}`);
    const out = normalizeCustomer({ ...emptyCustomerForm(), gallery_upload: arr });
    expect(out.gallery_upload.length).toBe(20);
  });
});

describe('V33.H — consent.imageMarketing migration (legacy flat → consent)', () => {
  // Migration semantics: when consent.imageMarketing is EXPLICITLY present in the
  // input (i.e. a key on the consent object), it wins. When the consent object is
  // missing imageMarketing (legacy doc), we read the flat is_image_marketing_allowed
  // field. The mirror field is always kept in sync with consent.imageMarketing on
  // the way out so legacy readers don't break.
  it('H1 — legacy doc (no consent.imageMarketing key) + flat=true → consent.imageMarketing=true', () => {
    // Simulate a pre-V33 doc: consent has only marketing/healthData (no imageMarketing key).
    const out = normalizeCustomer({
      firstname: 'A',
      is_image_marketing_allowed: true,
      consent: { marketing: false, healthData: false },
    });
    expect(out.consent.imageMarketing).toBe(true);
    expect(out.is_image_marketing_allowed).toBe(true);  // mirror preserved
  });
  it('H2 — legacy doc + flat=false → consent.imageMarketing=false', () => {
    const out = normalizeCustomer({
      firstname: 'A',
      is_image_marketing_allowed: false,
      consent: { marketing: false, healthData: false },
    });
    expect(out.consent.imageMarketing).toBe(false);
  });
  it('H3 — explicit consent.imageMarketing=true wins over flat=false', () => {
    const out = normalizeCustomer({
      firstname: 'A',
      is_image_marketing_allowed: false,
      consent: { marketing: false, healthData: false, imageMarketing: true },
    });
    expect(out.consent.imageMarketing).toBe(true);
    expect(out.is_image_marketing_allowed).toBe(true);  // mirror updated
  });
  it('H4 — explicit consent.imageMarketing=false wins over flat=true (V33 doc)', () => {
    const out = normalizeCustomer({
      firstname: 'A',
      is_image_marketing_allowed: true,
      consent: { marketing: false, healthData: false, imageMarketing: false },
    });
    expect(out.consent.imageMarketing).toBe(false);
    expect(out.is_image_marketing_allowed).toBe(false);  // mirror updated
  });
  it('H5 — neither set + no consent → false default', () => {
    const out = normalizeCustomer({ firstname: 'A' });
    expect(out.consent.imageMarketing).toBe(false);
  });
  it('H6 — empty form (with default imageMarketing=false) + flat=true → consent wins (false)', () => {
    // V33 forms ALWAYS include consent.imageMarketing (default false). The flat
    // field is only authoritative for LEGACY docs that lack the key entirely.
    const out = normalizeCustomer({ ...emptyCustomerForm(), is_image_marketing_allowed: true });
    expect(out.consent.imageMarketing).toBe(false);  // V33 default consent wins
    expect(out.is_image_marketing_allowed).toBe(false);  // mirror updated
  });
  it('H7 — emptyCustomerForm normalizes to imageMarketing=false', () => {
    const out = normalizeCustomer(emptyCustomerForm());
    expect(out.consent.imageMarketing).toBe(false);
  });
});

describe('V33.I — consent validator extension', () => {
  it('I1 — consent.imageMarketing=true is valid', () => {
    const f = { ...emptyCustomerForm(), consent: { marketing: false, healthData: false, imageMarketing: true } };
    expect(validateCustomer(f)).toBeNull();
  });
  it('I2 — consent.imageMarketing="yes" rejected', () => {
    const f = { ...emptyCustomerForm(), consent: { marketing: false, healthData: false, imageMarketing: 'yes' } };
    expect(validateCustomer(f)?.[0]).toBe('consent');
  });
});

describe('V33.J — round-trip integrity (Rule I — output never has undefined)', () => {
  it('J1 — normalize→validate empty form passes non-strict', () => {
    const out = normalizeCustomer(emptyCustomerForm());
    expect(validateCustomer(out)).toBeNull();
  });
  it('J2 — no undefined leaves in normalized output (V14 regression guard)', () => {
    function walk(obj, path = '') {
      if (obj === undefined) throw new Error(`undefined at ${path}`);
      if (obj && typeof obj === 'object') {
        for (const k of Object.keys(obj)) walk(obj[k], `${path}.${k}`);
      }
    }
    expect(() => walk(normalizeCustomer(emptyCustomerForm()))).not.toThrow();
  });
  it('J3 — full ProClinic-shaped form normalizes cleanly (V33 doc, imageMarketing explicit true)', () => {
    const form = {
      ...emptyCustomerForm(),
      hn_no: 'LC-26000001',
      firstname: 'จอห์น',
      lastname: 'โด',
      gender: 'm',
      passport_id: '  aa1234567  ',
      created_year: '2026',
      gallery_upload: ['https://x.com/a', 'https://x.com/a'],  // dedupe
      consent: { marketing: false, healthData: false, imageMarketing: true },
      birthdate: '1990-01-01',
    };
    const out = normalizeCustomer(form);
    expect(out.gender).toBe('M');
    expect(out.passport_id).toBe('AA1234567');
    expect(out.created_year).toBe(2026);
    expect(out.gallery_upload).toEqual(['https://x.com/a']);
    expect(out.consent.imageMarketing).toBe(true);
    expect(out.is_image_marketing_allowed).toBe(true);  // mirror in sync
    expect(validateCustomer(out, { strict: true })).toBeNull();
  });
});
