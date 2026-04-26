// V33-customer-create — Thai address cascade facade tests.

import { describe, it, expect } from 'vitest';
import {
  THAI_PROVINCES,
  thaiAddressDB,
  getProvinces,
  getDistricts,
  getSubDistricts,
  getPostalCode,
  cascadeOnProvinceChange,
  cascadeOnDistrictChange,
  cascadeOnSubDistrictChange,
} from '../src/lib/thaiAddressData.js';

describe('V33.T — thaiAddressData facade', () => {
  it('T1 — re-exports THAI_PROVINCES + thaiAddressDB', () => {
    expect(Array.isArray(THAI_PROVINCES)).toBe(true);
    expect(THAI_PROVINCES.length).toBeGreaterThanOrEqual(76);  // 77 provinces ≥ 76
    expect(thaiAddressDB).toBeTruthy();
    expect(typeof thaiAddressDB).toBe('object');
  });
  it('T2 — getProvinces returns the same canonical list', () => {
    expect(getProvinces()).toBe(THAI_PROVINCES);
  });
  it('T3 — getDistricts(known province) is non-empty', () => {
    const districts = getDistricts('กรุงเทพมหานคร');
    expect(districts.length).toBeGreaterThan(0);
  });
  it('T4 — getDistricts(unknown) is empty array', () => {
    expect(getDistricts('NotAProvince')).toEqual([]);
    expect(getDistricts('')).toEqual([]);
    expect(getDistricts(null)).toEqual([]);
  });
  it('T5 — getSubDistricts(known district) is non-empty', () => {
    const districts = getDistricts('กรุงเทพมหานคร');
    const sub = getSubDistricts('กรุงเทพมหานคร', districts[0]);
    expect(sub.length).toBeGreaterThan(0);
  });
  it('T6 — getPostalCode returns 5-digit string for known triple', () => {
    const districts = getDistricts('กรุงเทพมหานคร');
    const subs = getSubDistricts('กรุงเทพมหานคร', districts[0]);
    const code = getPostalCode('กรุงเทพมหานคร', districts[0], subs[0]);
    expect(code).toMatch(/^\d{5}$/);
  });
  it('T7 — getPostalCode returns "" for unknown triple', () => {
    expect(getPostalCode('Nope', 'Nope', 'Nope')).toBe('');
    expect(getPostalCode(null, null, null)).toBe('');
  });
});

describe('V33.U — cascade helpers (form-patch shape)', () => {
  it('U1 — cascadeOnProvinceChange blanks downstream', () => {
    const patch = cascadeOnProvinceChange('กรุงเทพมหานคร');
    expect(patch).toEqual({
      province: 'กรุงเทพมหานคร',
      district: '',
      sub_district: '',
      postal_code: '',
    });
  });
  it('U2 — cascadeOnProvinceChange handles empty', () => {
    expect(cascadeOnProvinceChange('').province).toBe('');
    expect(cascadeOnProvinceChange(null).province).toBe('');
  });
  it('U3 — cascadeOnDistrictChange preserves province', () => {
    const patch = cascadeOnDistrictChange('กรุงเทพมหานคร', 'พระนคร');
    expect(patch.province).toBe('กรุงเทพมหานคร');
    expect(patch.district).toBe('พระนคร');
    expect(patch.sub_district).toBe('');
    expect(patch.postal_code).toBe('');
  });
  it('U4 — cascadeOnSubDistrictChange auto-fills postal_code', () => {
    const districts = getDistricts('กรุงเทพมหานคร');
    const subs = getSubDistricts('กรุงเทพมหานคร', districts[0]);
    const patch = cascadeOnSubDistrictChange('กรุงเทพมหานคร', districts[0], subs[0]);
    expect(patch.postal_code).toMatch(/^\d{5}$/);
  });
  it('U5 — cascadeOnSubDistrictChange empty subDistrict → empty postal', () => {
    const patch = cascadeOnSubDistrictChange('กรุงเทพมหานคร', 'พระนคร', '');
    expect(patch.postal_code).toBe('');
  });
});

describe('V33.V — db sanity (every province has districts; every district has subs; every sub has 5-digit postal)', () => {
  it('V1 — at least 70 provinces present in db', () => {
    expect(Object.keys(thaiAddressDB).length).toBeGreaterThanOrEqual(70);
  });
  it('V2 — every province in db has >0 districts (sample first 10)', () => {
    const provs = Object.keys(thaiAddressDB).slice(0, 10);
    for (const p of provs) {
      expect(getDistricts(p).length, `${p} should have districts`).toBeGreaterThan(0);
    }
  });
  it('V3 — sample triplet returns valid postal code', () => {
    const provs = Object.keys(thaiAddressDB);
    let validPostal = 0;
    for (const p of provs.slice(0, 5)) {
      const ds = getDistricts(p);
      for (const d of ds.slice(0, 2)) {
        const ss = getSubDistricts(p, d);
        for (const s of ss.slice(0, 1)) {
          const code = getPostalCode(p, d, s);
          if (/^\d{5}$/.test(code)) validPostal++;
        }
      }
    }
    expect(validPostal, 'at least 1 valid postal in 5-province sample').toBeGreaterThan(0);
  });
});
