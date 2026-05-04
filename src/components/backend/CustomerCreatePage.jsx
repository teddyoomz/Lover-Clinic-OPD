// V33-customer-create — full ProClinic-parity Customer CREATE PAGE.
// Mirrors `/admin/customer/create` 100%: every field, every upload,
// dependent-field cascades, conditional Thai/foreigner + receipt-type toggles.
// Writes to `be_customers/{LC-YY######}` via addCustomer orchestrator
// (counter + uploads + setDoc atomic).
//
// V33.2 (2026-04-27, user directive "ทำเป็นหน้าใหม่ทั้งหน้าไม่เอา modal"):
// converted from modal overlay to full-page takeover via BackendDashboard's
// `creatingCustomer` state — same pattern as `viewingCustomer` for
// CustomerDetailView. Date inputs migrated from native `<input type="date">`
// to canonical `<DateField locale="ce">` per rule 04-thai-ui (backend = ค.ศ.).
//
// Architecture:
//   - 6 sections, all rendered inline (one file = easier to keep in sync
//     with ProClinic field list; ~700 LOC is acceptable for a single-use page).
//   - State held once via useState(emptyCustomerForm()); plus profileFile +
//     galleryFiles + ui state (saving/error/success).
//   - Conditional visibility uses plain `&&` — NO IIFE-in-JSX (Vite OXC
//     parser bug, rule 03-stack §2).
//   - Submit chain: validate → build files → addCustomer → onSaved + back.

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  UserPlus, Save, ArrowLeft, Loader2, AlertCircle, CheckCircle2,
  User, Phone, MapPin, Receipt, HeartPulse, Camera, Image as ImageIcon, Trash2, Plus, X,
} from 'lucide-react';
import {
  emptyCustomerForm,
  GENDER_OPTIONS,
  RECEIPT_TYPE_OPTIONS,
} from '../../lib/customerValidation.js';
import { addCustomer, buildFormFromCustomer, updateCustomerFromForm } from '../../lib/scopedDataLayer.js';
import { scrollToFieldError } from '../../lib/scrollToFieldError.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import DateField from '../DateField.jsx';
import ThaiAddressSelect from './customer-form/ThaiAddressSelect.jsx';

const COUNTRIES = [
  '', 'ไทย', 'ลาว', 'กัมพูชา', 'พม่า', 'มาเลเซีย', 'สิงคโปร์', 'เวียดนาม', 'อินโดนีเซีย', 'ฟิลิปปินส์',
  'จีน', 'ฮ่องกง', 'ไต้หวัน', 'ญี่ปุ่น', 'เกาหลีใต้', 'อินเดีย',
  'สหรัฐอเมริกา', 'แคนาดา', 'เม็กซิโก', 'บราซิล', 'อาร์เจนตินา',
  'สหราชอาณาจักร', 'ฝรั่งเศส', 'เยอรมนี', 'อิตาลี', 'สเปน', 'เนเธอร์แลนด์', 'สวิตเซอร์แลนด์', 'รัสเซีย',
  'ออสเตรเลีย', 'นิวซีแลนด์',
  'ซาอุดีอาระเบีย', 'สหรัฐอาหรับเอมิเรตส์', 'อิสราเอล', 'แอฟริกาใต้',
  'อื่นๆ',
];

const PREFIX_OPTIONS = ['', 'นาย', 'นาง', 'นางสาว', 'เด็กชาย', 'เด็กหญิง', 'ดร.', 'นพ.', 'พญ.', 'ทพ.', 'ทพญ.', 'ภญ.', 'ภก.'];
// V33-customer-create user directive 2026-04-27: simplify blood types to
// 4 base groups + "ไม่ทราบ" (rh +/- not tracked at intake — admin can edit
// later if needed; matches Thai clinic practice).
const BLOOD_TYPES = ['', 'A', 'B', 'O', 'AB'];
const CUSTOMER_TYPE_2_OPTIONS = ['', 'ลูกค้าทั่วไป', 'ลูกค้ารีวิว', 'Influencer'];

// Phase 9 — referral source choices match ProClinic dropdown (#source select).
const SOURCE_OPTIONS = [
  '', 'Facebook', 'Instagram', 'Line OA', 'TikTok', 'Google', 'Website',
  'เพื่อน/ลูกค้าแนะนำ', 'พนักงาน/แพทย์', 'ป้ายโฆษณา', 'Influencer/Review', 'อื่น',
];
const INCOME_OPTIONS = [
  '', 'น้อยกว่า 15,000', '15,000 - 30,000', '30,000 - 50,000',
  '50,000 - 100,000', '100,000 - 200,000', 'มากกว่า 200,000',
];

function inputCls(extra = '') {
  return `w-full px-3 py-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-sm focus:outline-none focus:border-[var(--ac)] ${extra}`;
}

const sectionCls = 'p-4 rounded-xl border border-[var(--bd)] bg-[var(--bg-base)] space-y-3';
const sectionTitleCls = 'flex items-center gap-2 text-sm font-bold text-[var(--tx-heading)] mb-2';

export default function CustomerCreatePage({
  onSaved,
  onCancel,
  // Phase BS (2026-05-06) — `branchId` prop kept for explicit override
  // (tests / storybook). Production callers in BackendDashboard don't
  // pass it; we resolve from BranchContext via useSelectedBranch hook
  // below so the customer's "สาขาที่สร้างรายการ" tag matches whichever
  // branch the admin currently has selected.
  branchId: branchIdProp = null,
  createdBy = null,
  // V33.3 — dual-mode: 'create' (default, addCustomer + counter) or 'edit'
  // (updateCustomerFromForm + preserve hn_no). When mode='edit', pass
  // `initialCustomer` (the customer doc) to prefill the form.
  mode = 'create',
  initialCustomer = null,
}) {
  // Phase BS — current selected branch from context (defaults to FALLBACK_ID
  // 'main' when no provider mounted). Prop wins when explicitly passed.
  const { branchId: branchIdFromContext } = useSelectedBranch();
  const branchId = branchIdProp || branchIdFromContext;
  const isEdit = mode === 'edit' && initialCustomer;
  const customerIdForEdit = isEdit ? (initialCustomer.id || initialCustomer.proClinicId || initialCustomer.customerId) : null;
  const [form, setForm] = useState(() => isEdit ? (buildFormFromCustomer(initialCustomer) || emptyCustomerForm()) : emptyCustomerForm());
  const [profileFile, setProfileFile] = useState(null);
  const [profilePreview, setProfilePreview] = useState('');
  const [galleryFiles, setGalleryFiles] = useState([]);   // File[]
  const [galleryPreviews, setGalleryPreviews] = useState([]);   // string[]
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  // a11y polish (audit UC5 fix, 2026-05-04): per-field error map. Populated by
  // handleSubmit when the validator throws with err.field; cleared via setField.
  // Keys match data-field attrs so aria-describedby IDs stay deterministic.
  const [fieldErrors, setFieldErrors] = useState({});
  const profileInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  /** Read aria-* props for an input bound to a single field. Spreads onto JSX. */
  const ariaErrProps = (fieldName) => {
    const has = !!fieldErrors[fieldName];
    return {
      'aria-invalid': has || undefined,
      'aria-describedby': has ? `err-${fieldName}` : undefined,
    };
  };
  /** Render a hidden-when-empty error message for a single field. */
  const FieldError = ({ field }) => {
    const msg = fieldErrors[field];
    if (!msg) return null;
    return (
      <p
        id={`err-${field}`}
        role="alert"
        className="text-rose-500 text-xs mt-1"
        data-testid={`field-error-${field}`}
      >
        {msg}
      </p>
    );
  };

  // Reset state on mount (page is unmounted/remounted by BackendDashboard
  // takeover when creatingCustomer / editingCustomer toggles).
  useEffect(() => {
    setForm(isEdit ? (buildFormFromCustomer(initialCustomer) || emptyCustomerForm()) : emptyCustomerForm());
    setProfileFile(null);
    setProfilePreview(isEdit && initialCustomer?.patientData?.profileImage ? initialCustomer.patientData.profileImage : '');
    setGalleryFiles([]);
    setGalleryPreviews([]);
    setSaving(false);
    setError('');
    setSuccess('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup blob URLs on unmount or when previews change.
  useEffect(() => {
    return () => {
      if (profilePreview && profilePreview.startsWith('blob:')) URL.revokeObjectURL(profilePreview);
      galleryPreviews.forEach((u) => { if (u.startsWith('blob:')) URL.revokeObjectURL(u); });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // F-bis cascades: clear stale fields when toggling customer_type / receipt_type / source.
  const isForeigner = form.customer_type === 'foreigner';
  const isThai = form.customer_type === 'thai' || form.customer_type === '';
  const showSourceDetail = form.source === 'อื่น';

  const setField = (key, value) => {
    setForm((p) => ({ ...p, [key]: value }));
    // a11y: clear stale error for this field as user edits (1.3.1 + 4.1.3).
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };
  const patchForm = (patch) => setForm((p) => ({ ...p, ...patch }));

  const handleCustomerTypeChange = (next) => {
    if (next === 'foreigner') {
      patchForm({ customer_type: next, citizen_id: '' });
    } else {
      patchForm({ customer_type: next, passport_id: '', country: '' });
    }
  };

  const handleReceiptTypeChange = (next) => {
    if (next === 'personal') {
      patchForm({
        receipt_type: 'personal',
        company_receipt_name: '', company_receipt_address: '',
        company_receipt_phonenumber: '', company_receipt_tax_id: '',
      });
    } else if (next === 'company') {
      patchForm({
        receipt_type: 'company',
        personal_receipt_name: '', personal_receipt_address: '',
        personal_receipt_phonenumber: '', personal_receipt_tax_id: '',
      });
    } else {
      patchForm({
        receipt_type: '',
        personal_receipt_name: '', personal_receipt_address: '',
        personal_receipt_phonenumber: '', personal_receipt_tax_id: '',
        company_receipt_name: '', company_receipt_address: '',
        company_receipt_phonenumber: '', company_receipt_tax_id: '',
      });
    }
  };

  const handleSourceChange = (next) => {
    if (next === 'อื่น') {
      setField('source', next);
    } else {
      patchForm({ source: next, source_detail: '' });
    }
  };

  const handleProfilePick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (profilePreview && profilePreview.startsWith('blob:')) URL.revokeObjectURL(profilePreview);
    setProfileFile(file);
    setProfilePreview(URL.createObjectURL(file));
  };

  const handleProfileRemove = () => {
    if (profilePreview && profilePreview.startsWith('blob:')) URL.revokeObjectURL(profilePreview);
    setProfileFile(null);
    setProfilePreview('');
    if (profileInputRef.current) profileInputRef.current.value = '';
  };

  const handleGalleryAdd = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const room = 20 - galleryFiles.length;
    const accepted = files.slice(0, room);
    const newPreviews = accepted.map((f) => URL.createObjectURL(f));
    setGalleryFiles((prev) => [...prev, ...accepted]);
    setGalleryPreviews((prev) => [...prev, ...newPreviews]);
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  const handleGalleryRemove = (idx) => {
    const url = galleryPreviews[idx];
    if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
    setGalleryFiles((prev) => prev.filter((_, i) => i !== idx));
    setGalleryPreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      let result;
      if (isEdit) {
        // Phase BS — DO NOT pass branchId on update (immutable after create).
        result = await updateCustomerFromForm(customerIdForEdit, form, {
          updatedBy: createdBy,
          files: { profile: profileFile, gallery: galleryFiles },
        });
        setSuccess(`บันทึกการแก้ไขเรียบร้อย — HN: ${form.hn_no || customerIdForEdit}`);
      } else {
        // Phase BS — branchId from BranchContext stamps the new customer
        // with the currently-selected branch as their "สาขาที่สร้าง".
        result = await addCustomer(form, {
          branchId,
          createdBy,
          files: { profile: profileFile, gallery: galleryFiles },
        });
        setSuccess(`บันทึกเรียบร้อย — HN: ${result.hn}`);
      }
      onSaved?.(result);
      // Brief delay so user sees the success message before BackendDashboard
      // tears down the page (creatingCustomer / editingCustomer = false).
      setTimeout(() => { onCancel?.(); }, 800);
    } catch (err) {
      const field = err.field || 'firstname';
      const msg = err.message || 'บันทึกล้มเหลว';
      setError(msg);
      // a11y: surface per-field message so the input gains aria-invalid +
      // aria-describedby pointing at #err-<field>. Cleared on next setField.
      setFieldErrors((prev) => ({ ...prev, [field]: msg }));
      scrollToFieldError(field, msg, { useAlert: false });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="customer-create-page">
      {/* Page header — back button + title */}
      <div className="bg-[var(--bg-surface)] rounded-2xl p-4 shadow-lg flex items-center justify-between gap-3 border border-[var(--bd)]">
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            disabled={saving}
            data-testid="customer-create-back"
            className="p-2 rounded-lg hover:bg-[var(--bg-hover)] disabled:opacity-50 transition-colors"
            aria-label="กลับ"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2">
            <UserPlus size={22} className="text-emerald-400" />
            <h2 className="text-xl font-black text-[var(--tx-heading)]">
              {isEdit ? `แก้ไขข้อมูลลูกค้า ${form.hn_no || ''}` : 'เพิ่มลูกค้าใหม่'}
            </h2>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm bg-neutral-700 text-white disabled:opacity-50 hidden md:inline-flex"
        >
          ยกเลิก
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
          {/* ── Section 1: รูปโปรไฟล์ + Customer type ───────────────── */}
          <div className={sectionCls}>
            <div className={sectionTitleCls}><Camera size={16} /> ข้อมูลส่วนตัว / ประเภทลูกค้า</div>

            {/* Profile image */}
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                {profilePreview ? (
                  <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-[var(--ac)]">
                    <img src={profilePreview} alt="profile preview" className="w-full h-full object-cover" data-testid="profile-preview" />
                    <button type="button" onClick={handleProfileRemove} className="absolute top-0 right-0 p-1 bg-red-600 rounded-full text-white" aria-label="ลบรูป">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-full bg-[var(--bg-hover)] border-2 border-dashed border-[var(--bd)] flex items-center justify-center">
                    <ImageIcon size={28} className="text-[var(--tx-muted)]" />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <label className="block text-xs text-[var(--tx-muted)] mb-1">รูปโปรไฟล์ (≤1MB)</label>
                <input
                  ref={profileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleProfilePick}
                  data-testid="profile-image-input"
                  className="text-xs"
                />
                <div className="text-[10px] text-[var(--tx-muted)] mt-1">JPG/PNG/WebP, ระบบบีบอัด max 1920px อัตโนมัติ</div>
              </div>
            </div>

            {/* Customer type radios */}
            <div>
              <label className="block text-xs text-[var(--tx-muted)] mb-1">สัญชาติ</label>
              <div className="flex gap-3">
                <label className="inline-flex items-center gap-1 text-sm">
                  <input type="radio" name="customer_type" value="thai" checked={isThai} onChange={() => handleCustomerTypeChange('thai')} data-testid="customer-type-thai" />
                  คนไทย
                </label>
                <label className="inline-flex items-center gap-1 text-sm">
                  <input type="radio" name="customer_type" value="foreigner" checked={isForeigner} onChange={() => handleCustomerTypeChange('foreigner')} data-testid="customer-type-foreigner" />
                  ชาวต่างชาติ
                </label>
              </div>
            </div>

            {/* Country (only when foreigner) */}
            {isForeigner && (
              <div>
                <label className="block text-xs text-[var(--tx-muted)] mb-1">ประเทศ</label>
                <select
                  value={form.country || ''}
                  onChange={(e) => setField('country', e.target.value)}
                  data-field="country"
                  data-testid="customer-form-country"
                  className={inputCls()}
                >
                  {COUNTRIES.map((c) => <option key={c} value={c}>{c || '— เลือกประเทศ —'}</option>)}
                </select>
              </div>
            )}

            {/* Customer category */}
            <div>
              <label className="block text-xs text-[var(--tx-muted)] mb-1">ประเภทลูกค้า</label>
              <select
                value={form.customer_type_2 || ''}
                onChange={(e) => setField('customer_type_2', e.target.value)}
                data-field="customer_type_2"
                data-testid="customer-form-customer-type-2"
                className={inputCls()}
              >
                {CUSTOMER_TYPE_2_OPTIONS.map((c) => <option key={c} value={c}>{c || '— ไม่ระบุ —'}</option>)}
              </select>
            </div>

            {/* HN + old HN */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[var(--tx-muted)] mb-1">รหัสลูกค้าเก่า (old HN)</label>
                <input type="text" value={form.old_hn_id || ''} onChange={(e) => setField('old_hn_id', e.target.value)} maxLength={30} data-field="old_hn_id" data-testid="customer-form-old-hn" className={inputCls()} />
              </div>
              <div>
                <label className="block text-xs text-[var(--tx-muted)] mb-1">{isEdit ? 'รหัสลูกค้า (HN)' : 'หมายเหตุ HN ใหม่'}</label>
                {isEdit ? (
                  <div className="px-3 py-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-sm font-mono">
                    {form.hn_no || customerIdForEdit || '—'}
                  </div>
                ) : (
                  <div className="px-3 py-2 rounded-lg bg-emerald-900/20 border border-emerald-700/40 text-emerald-200 text-xs">
                    ระบบจะสร้าง HN อัตโนมัติเมื่อบันทึก (รูปแบบ LC-YY######)
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Section 2: ชื่อ + เพศ + identity ─────────────────────── */}
          <div className={sectionCls}>
            <div className={sectionTitleCls}><User size={16} /> ชื่อ-นามสกุล / เลขบัตร</div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-[var(--tx-muted)] mb-1">คำนำหน้า</label>
                <select value={form.prefix || ''} onChange={(e) => setField('prefix', e.target.value)} data-field="prefix" data-testid="customer-form-prefix" className={inputCls()}>
                  {PREFIX_OPTIONS.map((p) => <option key={p} value={p}>{p || '— ไม่ระบุ —'}</option>)}
                </select>
              </div>
              <div className="col-span-2 md:col-span-1">
                <label htmlFor="customer-form-firstname-input" className="block text-xs text-[var(--tx-muted)] mb-1">ชื่อ <span className="text-red-400">*</span></label>
                <input id="customer-form-firstname-input" type="text" value={form.firstname || ''} onChange={(e) => setField('firstname', e.target.value)} maxLength={100} required data-field="firstname" data-testid="customer-form-firstname" className={inputCls()} {...ariaErrProps('firstname')} />
                <FieldError field="firstname" />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label htmlFor="customer-form-lastname-input" className="block text-xs text-[var(--tx-muted)] mb-1">นามสกุล</label>
                <input id="customer-form-lastname-input" type="text" value={form.lastname || ''} onChange={(e) => setField('lastname', e.target.value)} maxLength={100} data-field="lastname" data-testid="customer-form-lastname" className={inputCls()} {...ariaErrProps('lastname')} />
                <FieldError field="lastname" />
              </div>
              <div>
                <label htmlFor="customer-form-nickname-input" className="block text-xs text-[var(--tx-muted)] mb-1">ชื่อเล่น</label>
                <input id="customer-form-nickname-input" type="text" value={form.nickname || ''} onChange={(e) => setField('nickname', e.target.value)} maxLength={50} data-field="nickname" data-testid="customer-form-nickname" className={inputCls()} {...ariaErrProps('nickname')} />
                <FieldError field="nickname" />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-[var(--tx-muted)] mb-1">เพศ</label>
                <select value={form.gender || ''} onChange={(e) => setField('gender', e.target.value)} data-field="gender" data-testid="customer-form-gender" className={inputCls()}>
                  <option value="">— ไม่ระบุ —</option>
                  <option value="M">ชาย</option>
                  <option value="F">หญิง</option>
                </select>
              </div>
              <div data-field="birthdate" data-testid="customer-form-birthdate">
                <label className="block text-xs text-[var(--tx-muted)] mb-1">วันเกิด</label>
                {/* Rule 04-thai-ui: backend uses DateField locale='ce' (ค.ศ.), dd/mm/yyyy display */}
                <DateField
                  value={form.birthdate || ''}
                  onChange={(v) => setField('birthdate', v)}
                  locale="ce"
                  fieldClassName={inputCls()}
                  max={new Date().toISOString().slice(0, 10)}
                />
              </div>
              <div>
                <label htmlFor="customer-form-weight-input" className="block text-xs text-[var(--tx-muted)] mb-1">น้ำหนัก (kg)</label>
                <input id="customer-form-weight-input" type="number" min={1} max={500} value={form.weight ?? ''} onChange={(e) => setField('weight', e.target.value)} data-field="weight" data-testid="customer-form-weight" className={inputCls()} {...ariaErrProps('weight')} />
                <FieldError field="weight" />
              </div>
              <div>
                <label htmlFor="customer-form-height-input" className="block text-xs text-[var(--tx-muted)] mb-1">ส่วนสูง (cm)</label>
                <input id="customer-form-height-input" type="number" min={30} max={280} value={form.height ?? ''} onChange={(e) => setField('height', e.target.value)} data-field="height" data-testid="customer-form-height" className={inputCls()} {...ariaErrProps('height')} />
                <FieldError field="height" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {isThai && (
                <div>
                  <label htmlFor="customer-form-citizen-id-input" className="block text-xs text-[var(--tx-muted)] mb-1">เลขบัตรประชาชน</label>
                  <input id="customer-form-citizen-id-input" type="text" value={form.citizen_id || ''} onChange={(e) => setField('citizen_id', e.target.value)} placeholder="1234567890123" maxLength={20} data-field="citizen_id" data-testid="customer-form-citizen-id" className={inputCls('font-mono')} {...ariaErrProps('citizen_id')} />
                  <FieldError field="citizen_id" />
                </div>
              )}
              {isForeigner && (
                <div>
                  <label htmlFor="customer-form-passport-id-input" className="block text-xs text-[var(--tx-muted)] mb-1">เลขพาสปอร์ต</label>
                  <input id="customer-form-passport-id-input" type="text" value={form.passport_id || ''} onChange={(e) => setField('passport_id', e.target.value)} placeholder="AA1234567" maxLength={30} data-field="passport_id" data-testid="customer-form-passport-id" className={inputCls('font-mono uppercase')} {...ariaErrProps('passport_id')} />
                  <FieldError field="passport_id" />
                </div>
              )}
              <div>
                <label className="block text-xs text-[var(--tx-muted)] mb-1">กรุ๊ปเลือด</label>
                <select value={form.blood_type || ''} onChange={(e) => setField('blood_type', e.target.value)} data-field="blood_type" data-testid="customer-form-blood-type" className={inputCls()}>
                  {BLOOD_TYPES.map((b) => <option key={b} value={b}>{b || '— ไม่ระบุ —'}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!form.pregnanted} onChange={(e) => setField('pregnanted', e.target.checked)} data-field="pregnanted" data-testid="customer-form-pregnanted" />
                  ตั้งครรภ์
                </label>
              </div>
            </div>
          </div>

          {/* ── Section 3: Contact ─────────────────────────────────── */}
          <div className={sectionCls}>
            <div className={sectionTitleCls}><Phone size={16} /> ข้อมูลติดต่อ</div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label htmlFor="customer-form-phone-input" className="block text-xs text-[var(--tx-muted)] mb-1">เบอร์โทร</label>
                <input id="customer-form-phone-input" type="tel" value={form.telephone_number || ''} onChange={(e) => setField('telephone_number', e.target.value)} placeholder="0812345678" maxLength={30} data-field="telephone_number" data-testid="customer-form-phone" className={inputCls()} {...ariaErrProps('telephone_number')} />
                <FieldError field="telephone_number" />
              </div>
              <div>
                <label htmlFor="customer-form-email-input" className="block text-xs text-[var(--tx-muted)] mb-1">อีเมล</label>
                <input id="customer-form-email-input" type="email" value={form.email || ''} onChange={(e) => setField('email', e.target.value)} maxLength={100} data-field="email" data-testid="customer-form-email" className={inputCls()} {...ariaErrProps('email')} />
                <FieldError field="email" />
              </div>
              <div>
                <label className="block text-xs text-[var(--tx-muted)] mb-1">LINE ID</label>
                <input type="text" value={form.line_id || ''} onChange={(e) => setField('line_id', e.target.value)} maxLength={100} data-field="line_id" data-testid="customer-form-line-id" className={inputCls()} />
              </div>
              <div>
                <label className="block text-xs text-[var(--tx-muted)] mb-1">Facebook URL</label>
                <input type="text" value={form.facebook_link || ''} onChange={(e) => setField('facebook_link', e.target.value)} placeholder="https://facebook.com/..." maxLength={300} data-field="facebook_link" data-testid="customer-form-facebook" className={inputCls()} />
              </div>
            </div>
          </div>

          {/* ── Section 4: Address (cascade) ─────────────────────────── */}
          <div className={sectionCls}>
            <div className={sectionTitleCls}><MapPin size={16} /> ที่อยู่</div>

            <ThaiAddressSelect
              province={form.province}
              district={form.district}
              subDistrict={form.sub_district}
              postalCode={form.postal_code}
              onChange={patchForm}
              inputCls={inputCls()}
            />

            <div>
              <label className="block text-xs text-[var(--tx-muted)] mb-1">ที่อยู่ (บ้าน/ซอย/ถนน)</label>
              <textarea value={form.address || ''} onChange={(e) => setField('address', e.target.value)} rows={2} maxLength={500} data-field="address" data-testid="customer-form-address" className={inputCls()} />
            </div>
          </div>

          {/* ── Section 5: Source / Occupation / Notes / Gallery ──── */}
          <div className={sectionCls}>
            <div className={sectionTitleCls}><Camera size={16} /> อาชีพ / แหล่งที่มา / หมายเหตุ / รูปภาพเพิ่มเติม</div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-[var(--tx-muted)] mb-1">อาชีพ</label>
                <input type="text" value={form.occupation || ''} onChange={(e) => setField('occupation', e.target.value)} maxLength={100} data-field="occupation" data-testid="customer-form-occupation" className={inputCls()} />
              </div>
              <div>
                <label className="block text-xs text-[var(--tx-muted)] mb-1">รายได้</label>
                <select value={form.income ?? ''} onChange={(e) => setField('income', e.target.value)} data-field="income" data-testid="customer-form-income" className={inputCls()}>
                  {INCOME_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt || '— ไม่ระบุ —'}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--tx-muted)] mb-1">แหล่งที่มา</label>
                <select value={form.source || ''} onChange={(e) => handleSourceChange(e.target.value)} data-field="source" data-testid="customer-form-source" className={inputCls()}>
                  {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s || '— เลือกแหล่งที่มา —'}</option>)}
                </select>
              </div>
            </div>

            {showSourceDetail && (
              <div>
                <label className="block text-xs text-[var(--tx-muted)] mb-1">ระบุแหล่งที่มา (เลือกอื่น)</label>
                <input type="text" value={form.source_detail || ''} onChange={(e) => setField('source_detail', e.target.value)} maxLength={300} data-field="source_detail" data-testid="customer-form-source-detail" className={inputCls()} />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[var(--tx-muted)] mb-1">รายละเอียดโฆษณา</label>
                <textarea value={form.ad_description || ''} onChange={(e) => setField('ad_description', e.target.value)} rows={2} maxLength={500} data-field="ad_description" data-testid="customer-form-ad-description" className={inputCls()} />
              </div>
              <div>
                <label className="block text-xs text-[var(--tx-muted)] mb-1">หมายเหตุทั่วไป</label>
                <textarea value={form.note || ''} onChange={(e) => setField('note', e.target.value)} rows={2} maxLength={2000} data-field="note" data-testid="customer-form-note" className={inputCls()} />
              </div>
              <div>
                <label className="block text-xs text-[var(--tx-muted)] mb-1">สิ่งที่ลูกค้าชอบ</label>
                <textarea value={form.like_note || ''} onChange={(e) => setField('like_note', e.target.value)} rows={2} maxLength={2000} data-field="like_note" data-testid="customer-form-like-note" className={inputCls()} />
              </div>
              <div>
                <label className="block text-xs text-[var(--tx-muted)] mb-1">สิ่งที่ลูกค้าไม่ชอบ</label>
                <textarea value={form.dislike_note || ''} onChange={(e) => setField('dislike_note', e.target.value)} rows={2} maxLength={2000} data-field="dislike_note" data-testid="customer-form-dislike-note" className={inputCls()} />
              </div>
            </div>

            {/* Gallery upload */}
            <div>
              <label className="block text-xs text-[var(--tx-muted)] mb-1">
                คลังรูปภาพ ({galleryFiles.length}/20)
              </label>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                {galleryPreviews.map((url, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-[var(--bd)]" data-testid={`gallery-preview-${i}`}>
                    <img src={url} alt={`gallery ${i + 1}`} className="w-full h-full object-cover" />
                    <button type="button" onClick={() => handleGalleryRemove(i)} className="absolute top-1 right-1 p-1 bg-red-600 rounded-full text-white" aria-label={`ลบรูป ${i + 1}`}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                {galleryFiles.length < 20 && (
                  <label className="aspect-square rounded-lg border-2 border-dashed border-[var(--bd)] flex items-center justify-center cursor-pointer hover:border-[var(--ac)] transition-colors" data-testid="gallery-add-button">
                    <input
                      ref={galleryInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      onChange={handleGalleryAdd}
                      className="hidden"
                      data-testid="gallery-input"
                    />
                    <Plus size={28} className="text-[var(--tx-muted)]" />
                  </label>
                )}
              </div>
            </div>
          </div>

          {/* ── Section 6: Health + Emergency contacts + Receipt ──── */}
          <div className={sectionCls}>
            <div className={sectionTitleCls}><HeartPulse size={16} /> ข้อมูลสุขภาพ / ผู้ติดต่อฉุกเฉิน</div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[var(--tx-muted)] mb-1">อาการ/อาการสำคัญ</label>
                <textarea value={form.symptoms || ''} onChange={(e) => setField('symptoms', e.target.value)} rows={2} maxLength={2000} data-field="symptoms" className={inputCls()} />
              </div>
              <div>
                <label className="block text-xs text-[var(--tx-muted)] mb-1">การรักษาก่อนหน้า</label>
                <textarea value={form.before_treatment || ''} onChange={(e) => setField('before_treatment', e.target.value)} rows={2} maxLength={2000} data-field="before_treatment" className={inputCls()} />
              </div>
              <div>
                <label className="block text-xs text-[var(--tx-muted)] mb-1">โรคประจำตัว</label>
                <textarea value={form.congenital_disease || ''} onChange={(e) => setField('congenital_disease', e.target.value)} rows={2} maxLength={2000} data-field="congenital_disease" className={inputCls()} />
              </div>
              <div>
                <label className="block text-xs text-[var(--tx-muted)] mb-1">แพ้ยา</label>
                <textarea value={form.history_of_drug_allergy || ''} onChange={(e) => setField('history_of_drug_allergy', e.target.value)} rows={2} maxLength={2000} data-field="history_of_drug_allergy" className={inputCls()} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-[var(--tx-muted)] mb-1">แพ้อาหาร</label>
                <textarea value={form.history_of_food_allergy || ''} onChange={(e) => setField('history_of_food_allergy', e.target.value)} rows={2} maxLength={2000} data-field="history_of_food_allergy" className={inputCls()} />
              </div>
            </div>

            {/* Emergency contact 1 */}
            <div>
              <div className="text-xs font-bold text-[var(--tx-heading)] mb-2 mt-3">ผู้ติดต่อฉุกเฉิน 1</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-[var(--tx-muted)] mb-1">ชื่อ</label>
                  <input type="text" value={form.contact_1_firstname || ''} onChange={(e) => setField('contact_1_firstname', e.target.value)} maxLength={100} data-field="contact_1_firstname" data-testid="customer-form-contact-1-firstname" className={inputCls()} />
                </div>
                <div>
                  <label className="block text-xs text-[var(--tx-muted)] mb-1">นามสกุล</label>
                  <input type="text" value={form.contact_1_lastname || ''} onChange={(e) => setField('contact_1_lastname', e.target.value)} maxLength={100} data-field="contact_1_lastname" className={inputCls()} />
                </div>
                <div>
                  <label className="block text-xs text-[var(--tx-muted)] mb-1">เบอร์โทร</label>
                  <input type="tel" value={form.contact_1_telephone_number || ''} onChange={(e) => setField('contact_1_telephone_number', e.target.value)} maxLength={30} data-field="contact_1_telephone_number" className={inputCls()} />
                </div>
              </div>
            </div>

            {/* Emergency contact 2 */}
            <div>
              <div className="text-xs font-bold text-[var(--tx-heading)] mb-2">ผู้ติดต่อฉุกเฉิน 2</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-[var(--tx-muted)] mb-1">ชื่อ</label>
                  <input type="text" value={form.contact_2_firstname || ''} onChange={(e) => setField('contact_2_firstname', e.target.value)} maxLength={100} data-field="contact_2_firstname" className={inputCls()} />
                </div>
                <div>
                  <label className="block text-xs text-[var(--tx-muted)] mb-1">นามสกุล</label>
                  <input type="text" value={form.contact_2_lastname || ''} onChange={(e) => setField('contact_2_lastname', e.target.value)} maxLength={100} data-field="contact_2_lastname" className={inputCls()} />
                </div>
                <div>
                  <label className="block text-xs text-[var(--tx-muted)] mb-1">เบอร์โทร</label>
                  <input type="tel" value={form.contact_2_telephone_number || ''} onChange={(e) => setField('contact_2_telephone_number', e.target.value)} maxLength={30} data-field="contact_2_telephone_number" className={inputCls()} />
                </div>
              </div>
            </div>

            {/* Image marketing consent */}
            <div className="pt-2 border-t border-[var(--bd)]">
              <label className="inline-flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.consent?.imageMarketing}
                  onChange={(e) => setField('consent', { ...form.consent, imageMarketing: e.target.checked })}
                  data-field="consent.imageMarketing"
                  data-testid="customer-form-consent-image"
                  className="mt-0.5"
                />
                <span className="text-[var(--tx-muted)]">
                  ลูกค้ายินยอมให้ใช้รูปภาพเพื่อการตลาด/รีวิว
                </span>
              </label>
            </div>
          </div>

          {/* ── Section 7: Receipt info ────────────────────────────── */}
          <div className={sectionCls}>
            <div className={sectionTitleCls}><Receipt size={16} /> ข้อมูลใบเสร็จ</div>

            <div>
              <label className="block text-xs text-[var(--tx-muted)] mb-1">ประเภทใบเสร็จ</label>
              <div className="flex gap-3">
                {[
                  ['', 'ตามข้อมูลส่วนตัว'],
                  ['personal', 'บุคคล'],
                  ['company', 'นิติบุคคล'],
                ].map(([val, label]) => (
                  <label key={val || 'inherit'} className="inline-flex items-center gap-1 text-sm">
                    <input
                      type="radio"
                      name="receipt_type"
                      value={val}
                      checked={form.receipt_type === val}
                      onChange={() => handleReceiptTypeChange(val)}
                      data-testid={`customer-form-receipt-type-${val || 'inherit'}`}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {form.receipt_type === 'personal' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[var(--tx-muted)] mb-1">ชื่อ-นามสกุล</label>
                  <input type="text" value={form.personal_receipt_name || ''} onChange={(e) => setField('personal_receipt_name', e.target.value)} maxLength={200} data-field="personal_receipt_name" className={inputCls()} />
                </div>
                <div>
                  <label className="block text-xs text-[var(--tx-muted)] mb-1">เลขประจำตัวผู้เสียภาษี</label>
                  <input type="text" value={form.personal_receipt_tax_id || ''} onChange={(e) => setField('personal_receipt_tax_id', e.target.value)} maxLength={30} data-field="personal_receipt_tax_id" className={inputCls()} />
                </div>
                <div>
                  <label className="block text-xs text-[var(--tx-muted)] mb-1">เบอร์โทร</label>
                  <input type="tel" value={form.personal_receipt_phonenumber || ''} onChange={(e) => setField('personal_receipt_phonenumber', e.target.value)} maxLength={30} data-field="personal_receipt_phonenumber" className={inputCls()} />
                </div>
                <div>
                  <label className="block text-xs text-[var(--tx-muted)] mb-1">ที่อยู่</label>
                  <textarea value={form.personal_receipt_address || ''} onChange={(e) => setField('personal_receipt_address', e.target.value)} rows={2} maxLength={500} data-field="personal_receipt_address" className={inputCls()} />
                </div>
              </div>
            )}

            {form.receipt_type === 'company' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[var(--tx-muted)] mb-1">ชื่อนิติบุคคล</label>
                  <input type="text" value={form.company_receipt_name || ''} onChange={(e) => setField('company_receipt_name', e.target.value)} maxLength={200} data-field="company_receipt_name" className={inputCls()} />
                </div>
                <div>
                  <label className="block text-xs text-[var(--tx-muted)] mb-1">เลขประจำตัวผู้เสียภาษี</label>
                  <input type="text" value={form.company_receipt_tax_id || ''} onChange={(e) => setField('company_receipt_tax_id', e.target.value)} maxLength={30} data-field="company_receipt_tax_id" className={inputCls()} />
                </div>
                <div>
                  <label className="block text-xs text-[var(--tx-muted)] mb-1">เบอร์โทร</label>
                  <input type="tel" value={form.company_receipt_phonenumber || ''} onChange={(e) => setField('company_receipt_phonenumber', e.target.value)} maxLength={30} data-field="company_receipt_phonenumber" className={inputCls()} />
                </div>
                <div>
                  <label className="block text-xs text-[var(--tx-muted)] mb-1">ที่อยู่นิติบุคคล</label>
                  <textarea value={form.company_receipt_address || ''} onChange={(e) => setField('company_receipt_address', e.target.value)} rows={2} maxLength={500} data-field="company_receipt_address" className={inputCls()} />
                </div>
              </div>
            )}
          </div>

          {/* Status messages */}
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-900/20 border border-red-700/40 text-red-300 text-sm flex items-start gap-2" data-testid="customer-form-error">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}
          {success && (
            <div className="px-3 py-2 rounded-lg bg-emerald-900/20 border border-emerald-700/40 text-emerald-200 text-sm flex items-start gap-2" data-testid="customer-form-success">
              <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
              <div>{success}</div>
            </div>
          )}

          {/* Sticky footer with Save / Cancel buttons */}
          <div className="sticky bottom-0 bg-[var(--bg-base)] border border-[var(--bd)] rounded-2xl p-3 shadow-2xl flex items-center justify-end gap-2 z-10">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm bg-neutral-700 text-white disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              data-testid="customer-form-save"
              className="px-5 py-2 rounded-lg text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'กำลังบันทึก...' : (isEdit ? 'บันทึกการแก้ไข' : 'บันทึกลูกค้าใหม่')}
            </button>
          </div>
        </form>
    </div>
  );
}
