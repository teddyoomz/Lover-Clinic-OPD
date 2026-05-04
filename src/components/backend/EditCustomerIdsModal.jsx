// ─── Edit Customer IDs Modal — V32-tris-quater (2026-04-26) ────────────
// Focused modal for editing patientData.nationalId + patientData.passport.
// User directive (session 12): "ขอปุ่มแก้ไขข้อมูลลูกค้าหน่อย จะเข้าไป
// แก้ / เพิ่ม เลขที่บัตรประชาชน ของลูกค้าแต่ละคน".
//
// Why focused (not full patient-data editor):
//   1. Customer linking via "ผูก <ID>" needs nationalId/passport on
//      be_customers — current data was cloned from ProClinic but might
//      be empty for some customers
//   2. Full patient-data edit is a bigger feature (DateField + Thai
//      validation + emergency contact + etc.) — out of scope for v1
//   3. Admin can fix exactly what's needed for LINE linking, fast
//
// Validation:
//   - nationalId: 13 digits exactly (Thai citizen ID format) OR empty
//   - passport: 6-12 alphanumeric, must contain at least 1 letter + 1
//     digit OR empty
//   - At least ONE of nationalId / passport must be non-empty (no point
//     saving empty edits)
//
// Save: updateCustomer(proClinicId, { 'patientData.nationalId': X,
//       'patientData.passport': Y }) — Firestore dotted-path keeps other
// patientData fields intact.

import { useState, useEffect } from 'react';
import { Save, X, Loader2, AlertCircle, CheckCircle2, IdCard } from 'lucide-react';
import { updateCustomer } from '../../lib/scopedDataLayer.js';

function validateNationalId(v) {
  const cleaned = String(v || '').replace(/[\s\-.()]/g, '');
  if (!cleaned) return { ok: true, cleaned: '' };
  if (!/^\d{13}$/.test(cleaned)) return { ok: false, message: 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก' };
  return { ok: true, cleaned };
}

function validatePassport(v) {
  const cleaned = String(v || '').replace(/[\s\-.()]/g, '').toUpperCase();
  if (!cleaned) return { ok: true, cleaned: '' };
  if (!/^[A-Z0-9]{6,12}$/.test(cleaned)) return { ok: false, message: 'เลขพาสปอร์ตต้อง 6-12 ตัวอักษร/ตัวเลข' };
  if (!/[A-Z]/.test(cleaned) || !/\d/.test(cleaned)) return { ok: false, message: 'พาสปอร์ตต้องประกอบด้วยตัวอักษร + ตัวเลข' };
  return { ok: true, cleaned };
}

export default function EditCustomerIdsModal({ customer, onClose, onSaved }) {
  const initial = customer?.patientData || {};
  const [nationalId, setNationalId] = useState(initial.nationalId || '');
  const [passport, setPassport] = useState(initial.passport || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Reset state if customer prop changes (e.g. modal reused for another customer)
  useEffect(() => {
    setNationalId(initial.nationalId || '');
    setPassport(initial.passport || '');
    setError('');
    setSuccess('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id, customer?.customerId]);

  const customerId = customer?.customerId || customer?.id || '';

  const handleSave = async () => {
    setError('');
    setSuccess('');
    const idCheck = validateNationalId(nationalId);
    const passCheck = validatePassport(passport);
    if (!idCheck.ok) { setError(idCheck.message); return; }
    if (!passCheck.ok) { setError(passCheck.message); return; }
    if (!idCheck.cleaned && !passCheck.cleaned) {
      setError('ต้องกรอกเลขบัตรประชาชน หรือ พาสปอร์ต อย่างน้อยหนึ่งช่อง');
      return;
    }
    if (!customerId) { setError('ไม่พบรหัสลูกค้า'); return; }

    setSaving(true);
    try {
      await updateCustomer(customerId, {
        'patientData.nationalId': idCheck.cleaned,
        'patientData.passport': passCheck.cleaned,
      });
      setSuccess('บันทึกเรียบร้อย');
      // Notify caller so it can reload customer doc
      onSaved?.({ nationalId: idCheck.cleaned, passport: passCheck.cleaned });
      setTimeout(() => onClose?.(), 1200);
    } catch (e) {
      setError(e.message || 'บันทึกล้มเหลว');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-sm font-mono';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" data-testid="edit-customer-ids-modal">
      <div className="bg-[var(--bg-base)] rounded-xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between gap-2 p-4 border-b border-[var(--bd)]">
          <div className="flex items-center gap-2">
            <IdCard size={20} className="text-violet-400" />
            <h3 className="text-lg font-bold text-[var(--tx-heading)]">
              แก้ไขเลขบัตร / พาสปอร์ต
            </h3>
          </div>
          <button onClick={onClose} disabled={saving} className="p-1 rounded hover:bg-[var(--bg-hover)] disabled:opacity-50" aria-label="ปิด">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="px-3 py-2 rounded-lg bg-violet-900/20 border border-violet-700/40 text-violet-200 text-xs">
            ใช้สำหรับให้ลูกค้าผูกบัญชี LINE ผ่านการพิมพ์ "ผูก [เลขบัตร]" ใน Official Account
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-900/20 border border-red-700/40 text-red-300 text-xs flex items-start gap-2" data-testid="edit-customer-ids-error">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}
          {success && (
            <div className="px-3 py-2 rounded-lg bg-emerald-900/20 border border-emerald-700/40 text-emerald-200 text-xs flex items-start gap-2" data-testid="edit-customer-ids-success">
              <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
              <div>{success}</div>
            </div>
          )}

          <div>
            <label className="block text-xs text-[var(--tx-muted)] mb-1">เลขบัตรประชาชน (13 หลัก)</label>
            <input
              type="text"
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value)}
              placeholder="1234567890123"
              maxLength={20}
              data-field="nationalId"
              data-testid="edit-customer-nationalId"
              className={inputCls}
            />
            <div className="text-[10px] text-[var(--tx-muted)] mt-1">
              ตัวเลข 13 หลัก ระบบจะตัด - / . / เว้นวรรค ออกอัตโนมัติ
            </div>
          </div>

          <div>
            <label className="block text-xs text-[var(--tx-muted)] mb-1">เลขพาสปอร์ต</label>
            <input
              type="text"
              value={passport}
              onChange={(e) => setPassport(e.target.value)}
              placeholder="AA1234567"
              maxLength={20}
              data-field="passport"
              data-testid="edit-customer-passport"
              className={`${inputCls} uppercase`}
            />
            <div className="text-[10px] text-[var(--tx-muted)] mt-1">
              6-12 ตัวอักษร/ตัวเลข — ต้องมีอักษร + ตัวเลข อย่างน้อย 1 ตัวต่อกลุ่ม
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-3 border-t border-[var(--bd)]">
          <button onClick={onClose} disabled={saving} className="px-3 py-1.5 rounded text-xs bg-neutral-700 text-white disabled:opacity-50">
            ยกเลิก
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            data-testid="edit-customer-ids-save"
            className="px-3 py-1.5 rounded text-xs font-bold bg-emerald-700 text-white inline-flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}
