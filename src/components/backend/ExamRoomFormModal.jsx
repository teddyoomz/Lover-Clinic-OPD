// ─── Exam Room Form Modal — Phase 18.0 ──────────────────────────────────
// Branch-scoped master CRUD modal. Shape mirrors BranchFormModal.

import { useState, useCallback } from 'react';
import MarketingFormShell from './MarketingFormShell.jsx';
import RequiredAsterisk from '../ui/RequiredAsterisk.jsx';
import { saveExamRoom } from '../../lib/scopedDataLayer.js';
import {
  STATUS_OPTIONS,
  NAME_MAX_LENGTH,
  NOTE_MAX_LENGTH,
  validateExamRoom,
  emptyExamRoomForm,
} from '../../lib/examRoomValidation.js';
import { generateMarketingId, scrollToField } from '../../lib/marketingUiUtils.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';

export default function ExamRoomFormModal({ room, onClose, onSaved, clinicSettings }) {
  const isEdit = !!room;
  const { branchId } = useSelectedBranch();
  const [form, setForm] = useState(() => room ? { ...emptyExamRoomForm(), ...room } : emptyExamRoomForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = useCallback((patch) => setForm(prev => ({ ...prev, ...patch })), []);

  const handleSave = async () => {
    setError('');
    const fail = validateExamRoom(form);
    if (fail) {
      const [field, msg] = fail;
      setError(msg);
      scrollToField(field);
      return;
    }
    setSaving(true);
    try {
      const id = room?.examRoomId || room?.id || generateMarketingId('EXR');
      await saveExamRoom(id, form, { branchId });
      await onSaved?.();
    } catch (e) {
      setError(e.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <MarketingFormShell
      isEdit={isEdit}
      titleCreate="เพิ่มห้องตรวจ"
      titleEdit="แก้ไขห้องตรวจ"
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      error={error}
      maxWidth="2xl"
      bodySpacing={4}
      clinicSettings={clinicSettings}
    >
      <div data-field="name">
        <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">
          ชื่อห้อง <RequiredAsterisk />
        </label>
        <input
          type="text"
          maxLength={NAME_MAX_LENGTH}
          value={form.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="เช่น ห้องดริป"
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
        />
      </div>

      <div data-field="nameEn">
        <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ชื่อห้อง (EN)</label>
        <input
          type="text"
          maxLength={NAME_MAX_LENGTH}
          value={form.nameEn}
          onChange={(e) => update({ nameEn: e.target.value })}
          placeholder="Drip room"
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
        />
      </div>

      <div data-field="note">
        <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">หมายเหตุ</label>
        <textarea
          rows={2}
          maxLength={NOTE_MAX_LENGTH}
          value={form.note}
          onChange={(e) => update({ note: e.target.value })}
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)] resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div data-field="status">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">สถานะ</label>
          <select
            value={form.status}
            onChange={(e) => update({ status: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]"
          >
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div data-field="sortOrder">
          <label className="block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider">ลำดับการแสดง</label>
          <input
            type="number"
            min={0}
            step={1}
            value={form.sortOrder ?? 0}
            onChange={(e) => update({ sortOrder: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>
    </MarketingFormShell>
  );
}
