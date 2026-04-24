// ─── Sale Insurance Claim Form Modal — Phase 12.3 ─────────────────────────
// Create + edit modal for be_sale_insurance_claims. Wraps MarketingFormShell
// so the modal chrome (backdrop, close X, footer) stays consistent with the
// other marketing/finance modals.
//
// Fields (per ProClinic intel 2026-04-24):
//   saleId* · insuranceCompany · policyNumber · claimAmount* · claimDate* ·
//   paymentMethod · paymentTime · claimFileUrl · note · status
//
// The saleId dropdown auto-fills customerId / customerHN / customerName
// from the picked sale. Validator rejects empty customerId so the auto-fill
// is load-bearing for save-success.

import { useState, useCallback, useMemo } from 'react';
import DateField from '../DateField.jsx';
import MarketingFormShell from './MarketingFormShell.jsx';
import { saveSaleInsuranceClaim } from '../../lib/backendClient.js';
import {
  validateSaleInsuranceClaim,
  emptySaleInsuranceClaimForm,
  generateSaleInsuranceClaimId,
  STATUS_OPTIONS,
} from '../../lib/saleInsuranceClaimValidation.js';

const STATUS_LABEL = {
  pending: 'รออนุมัติ',
  approved: 'อนุมัติ',
  paid: 'ชำระแล้ว',
  rejected: 'ปฏิเสธ',
};

function saleLabel(s) {
  if (!s) return '';
  const sid = s.saleId || s.id || '';
  const date = s.saleDate || '';
  const hn = s.customerHN || '';
  const name = s.customerName || '';
  const net = Number(s?.billing?.netTotal) || 0;
  const netStr = net > 0 ? `฿${net.toLocaleString('th-TH')}` : '';
  return [sid, date, [hn, name].filter(Boolean).join(' '), netStr].filter(Boolean).join(' · ');
}

export default function SaleInsuranceClaimFormModal({
  claim,
  sales,
  bankAccounts,
  onClose,
  onSaved,
  clinicSettings,
}) {
  const isEdit = !!claim;
  const [form, setForm] = useState(() => ({
    ...emptySaleInsuranceClaimForm(),
    ...(claim || {}),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = useCallback((patch) => setForm(prev => ({ ...prev, ...patch })), []);

  const handleSaleChange = (saleId) => {
    const s = sales.find(x => (x.saleId || x.id) === saleId);
    if (!s) {
      update({ saleId, customerId: '', customerHN: '', customerName: '', claimAmount: 0 });
      return;
    }
    update({
      saleId,
      customerId: s.customerId || '',
      customerHN: s.customerHN || '',
      customerName: s.customerName || '',
      claimAmount: Number(form.claimAmount) > 0 ? form.claimAmount : Number(s?.billing?.netTotal) || 0,
      claimDate: form.claimDate || s.saleDate || '',
    });
  };

  const handleSave = async () => {
    setError('');
    const fail = validateSaleInsuranceClaim(form, { strict: true });
    if (fail) { setError(fail[1]); return; }
    setSaving(true);
    try {
      const id = isEdit ? (claim.claimId || claim.id) : generateSaleInsuranceClaimId();
      await saveSaleInsuranceClaim(id, form, { strict: true });
      onSaved?.();
      onClose?.();
    } catch (e) {
      setError(e.message || 'บันทึกล้มเหลว');
    } finally {
      setSaving(false);
    }
  };

  const limitedSales = useMemo(() => sales.slice(0, 500), [sales]);

  return (
    <MarketingFormShell
      isEdit={isEdit}
      titleCreate="เพิ่มรายการเบิกประกัน"
      titleEdit="แก้ไขรายการเบิกประกัน"
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      error={error}
      maxWidth="2xl"
      bodySpacing={4}
      clinicSettings={clinicSettings}
    >
      <div className="space-y-2">
        <label className="block text-xs text-[var(--tx-muted)]">ใบเสร็จ *</label>
        <select
          required
          value={form.saleId}
          onChange={(e) => handleSaleChange(e.target.value)}
          className="w-full px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
          data-field="saleId"
          disabled={isEdit}
        >
          <option value="">— เลือกใบเสร็จ —</option>
          {limitedSales.map(s => {
            const sid = s.saleId || s.id;
            return <option key={sid} value={sid}>{saleLabel(s)}</option>;
          })}
        </select>
        {form.customerName && (
          <p className="text-xs text-[var(--tx-muted)]">
            ลูกค้า: <span className="font-bold text-[var(--tx-primary)]">{form.customerName}</span>
            {form.customerHN && <> · {form.customerHN}</>}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="block text-xs text-[var(--tx-muted)]">บริษัทประกัน</label>
          <input
            type="text"
            value={form.insuranceCompany || ''}
            onChange={(e) => update({ insuranceCompany: e.target.value })}
            placeholder="เช่น บริษัท เอไอเอ จำกัด"
            className="w-full px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
            data-field="insuranceCompany"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-xs text-[var(--tx-muted)]">เลขเคลม / กรมธรรม์</label>
          <input
            type="text"
            value={form.policyNumber || ''}
            onChange={(e) => update({ policyNumber: e.target.value })}
            className="w-full px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
            data-field="policyNumber"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="block text-xs text-[var(--tx-muted)]">ยอดเคลม *</label>
          <input
            type="number"
            required
            step="0.01"
            min="0.01"
            value={form.claimAmount ?? ''}
            onChange={(e) => update({ claimAmount: e.target.value })}
            className="w-full px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
            data-field="claimAmount"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-xs text-[var(--tx-muted)]">วันที่เบิก *</label>
          <DateField
            value={form.claimDate}
            onChange={(v) => update({ claimDate: v })}
            fieldClassName="w-full px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
          />
        </div>
      </div>

      {isEdit && (
        <div className="space-y-2">
          <label className="block text-xs text-[var(--tx-muted)]">สถานะ</label>
          <select
            value={form.status || 'pending'}
            onChange={(e) => update({ status: e.target.value })}
            className="w-full px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
            data-field="status"
            disabled
          >
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <p className="text-[10px] text-[var(--tx-muted)]">
            สถานะเปลี่ยนผ่านปุ่ม "อนุมัติ" / "ชำระเงิน" / "ปฏิเสธ" ในหน้ารายการ
          </p>
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-xs text-[var(--tx-muted)]">หมายเหตุ</label>
        <textarea
          rows={2}
          value={form.note || ''}
          onChange={(e) => update({ note: e.target.value })}
          maxLength={1000}
          className="w-full px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
        />
      </div>
    </MarketingFormShell>
  );
}
