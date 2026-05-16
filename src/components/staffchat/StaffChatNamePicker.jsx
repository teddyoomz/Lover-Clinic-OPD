// src/components/staffchat/StaffChatNamePicker.jsx
// V73 (2026-05-16) — First-send name picker modal.
// V73 name-edit (2026-05-18) — accepts `initialValue` to pre-fill in edit mode +
//   `title`/`description` overrides. Same modal handles first-send AND edit.
//   Past messages keep their stored displayName (Firestore immutable); only
//   future messages use the new name.
import React, { useState } from 'react';

export function StaffChatNamePicker({ onConfirm, onCancel, initialValue, title, description }) {
  const [name, setName] = useState(typeof initialValue === 'string' ? initialValue : '');
  const trimmed = name.trim();
  const valid = trimmed.length >= 2 && trimmed.length <= 50;
  const isEdit = !!(initialValue && initialValue.trim());

  return (
    <div
      data-testid="staff-chat-name-picker"
      data-mode={isEdit ? 'edit' : 'first-send'}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9500] p-4"
    >
      <div className="bg-[var(--bg-card)] border border-[var(--bd-strong)] rounded-xl shadow-2xl w-full max-w-[320px] p-5">
        <h3 className="text-lg font-bold text-[var(--tx-primary)] mb-1">
          {title || (isEdit ? 'แก้ชื่อในแชท' : 'ตั้งชื่อในแชท')}
        </h3>
        <p className="text-xs text-[var(--tx-muted)] mb-3">
          {description ||
            (isEdit
              ? 'เปลี่ยนชื่อที่จะปรากฏในแชทของสาขา (2-50 ตัวอักษร) — ข้อความเก่าจะยังเป็นชื่อเดิม'
              : 'พิมพ์ชื่อที่จะปรากฏในแชทของสาขา (2-50 ตัวอักษร) — ชื่อจะเก็บไว้ในเครื่องนี้')}
        </p>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
          autoFocus
          placeholder="เช่น ดร.วี / admin / พี่บี"
          data-testid="staff-chat-name-picker-input"
          className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-sm text-[var(--tx-primary)] focus:outline-none focus:border-rose-500"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            data-testid="staff-chat-name-picker-cancel"
            className="px-3 py-1.5 rounded-lg text-sm font-bold bg-[var(--bg-hover)] hover:bg-[var(--bg-elevated)] text-[var(--tx-muted)]"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={() => valid && onConfirm(trimmed)}
            disabled={!valid || (isEdit && trimmed === initialValue.trim())}
            data-testid="staff-chat-name-picker-save"
            className="px-3 py-1.5 rounded-lg text-sm font-bold bg-rose-600 hover:bg-rose-500 disabled:bg-[var(--bg-hover)] disabled:text-[var(--tx-muted)] text-white disabled:cursor-not-allowed"
          >
            {isEdit ? 'เปลี่ยนชื่อ' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default StaffChatNamePicker;
