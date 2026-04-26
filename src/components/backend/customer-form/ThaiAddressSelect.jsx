// V33-customer-create — Thai address 4-level cascade.
// Province → District → Sub-district → Postal-code (auto-fill).
// Wraps the in-process thaiAddressDB so the modal doesn't need to know
// the nested shape. Rule of 3 — used by CustomerFormModal + future
// EditCustomerForm + (eventually) PatientForm refactor.

import {
  getProvinces,
  getDistricts,
  getSubDistricts,
  cascadeOnProvinceChange,
  cascadeOnDistrictChange,
  cascadeOnSubDistrictChange,
} from '../../../lib/thaiAddressData.js';

export default function ThaiAddressSelect({
  province,
  district,
  subDistrict,
  postalCode,
  onChange,         // (patch: {province, district, sub_district, postal_code}) => void
  inputCls = 'w-full px-3 py-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-sm',
  required = false,
  disabled = false,
}) {
  const provinces = getProvinces();
  const districts = getDistricts(province);
  const subDistricts = getSubDistricts(province, district);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {/* Province */}
      <div>
        <label className="block text-xs text-[var(--tx-muted)] mb-1">
          จังหวัด {required && <span className="text-red-400">*</span>}
        </label>
        <select
          value={province || ''}
          onChange={(e) => onChange?.(cascadeOnProvinceChange(e.target.value))}
          disabled={disabled}
          data-field="province"
          data-testid="customer-form-province"
          className={inputCls}
        >
          <option value="">— เลือกจังหวัด —</option>
          {provinces.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {/* District */}
      <div>
        <label className="block text-xs text-[var(--tx-muted)] mb-1">
          อำเภอ/เขต {required && <span className="text-red-400">*</span>}
        </label>
        <select
          value={district || ''}
          onChange={(e) => onChange?.(cascadeOnDistrictChange(province, e.target.value))}
          disabled={disabled || !province}
          data-field="district"
          data-testid="customer-form-district"
          className={inputCls}
        >
          <option value="">— เลือกอำเภอ —</option>
          {districts.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      {/* Sub-district */}
      <div>
        <label className="block text-xs text-[var(--tx-muted)] mb-1">
          ตำบล/แขวง {required && <span className="text-red-400">*</span>}
        </label>
        <select
          value={subDistrict || ''}
          onChange={(e) => onChange?.(cascadeOnSubDistrictChange(province, district, e.target.value))}
          disabled={disabled || !district}
          data-field="sub_district"
          data-testid="customer-form-sub-district"
          className={inputCls}
        >
          <option value="">— เลือกตำบล —</option>
          {subDistricts.map((sd) => (
            <option key={sd} value={sd}>{sd}</option>
          ))}
        </select>
      </div>

      {/* Postal code (auto-filled from sub-district pick; editable for edge cases) */}
      <div>
        <label className="block text-xs text-[var(--tx-muted)] mb-1">รหัสไปรษณีย์</label>
        <input
          type="text"
          value={postalCode || ''}
          onChange={(e) => onChange?.({
            province, district, sub_district: subDistrict,
            postal_code: e.target.value.replace(/\D/g, '').slice(0, 5),
          })}
          maxLength={5}
          data-field="postal_code"
          data-testid="customer-form-postal-code"
          placeholder="เลือกตำบลแล้วระบบจะกรอกอัตโนมัติ"
          disabled={disabled}
          className={inputCls}
        />
      </div>
    </div>
  );
}
