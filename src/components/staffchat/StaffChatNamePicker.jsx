// src/components/staffchat/StaffChatNamePicker.jsx
// V73 (2026-05-16) — First-send name picker modal.
// V73 name-edit (2026-05-18) — accepts `initialValue` to pre-fill in edit mode +
//   `title`/`description` overrides. Same modal handles first-send AND edit.
//   Past messages keep their stored displayName (Firestore immutable); only
//   future messages use the new name.
// V73 color-picker (2026-05-18) — accepts `initialColor` (hex), native HTML5
//   color picker UI, returns color via onConfirm(name, color). Free hex
//   (no palette clamp) per user directive.
import React, { useState } from 'react';

const DEFAULT_COLOR = '#E11D48';  // rose-600

export function StaffChatNamePicker({ onConfirm, onCancel, initialValue, initialColor, title, description }) {
  const [name, setName] = useState(typeof initialValue === 'string' ? initialValue : '');
  const [color, setColorState] = useState(
    typeof initialColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(initialColor)
      ? initialColor
      : DEFAULT_COLOR
  );
  const trimmed = name.trim();
  const valid = trimmed.length >= 2 && trimmed.length <= 50;
  const isEdit = !!(initialValue && initialValue.trim());
  const nameChanged = isEdit ? trimmed !== initialValue.trim() : true;
  const colorChanged = isEdit ? color.toLowerCase() !== (initialColor || DEFAULT_COLOR).toLowerCase() : true;
  const canSave = valid && (nameChanged || colorChanged);

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
        {/* V73 color-picker (2026-05-18) — native color input + hex preview.
            Free hex per user directive — no contrast clamp; trust user. */}
        <div className="flex items-center gap-2 mt-3">
          <label className="text-xs text-[var(--tx-muted)]">สีของฉันในแชท</label>
          <input
            type="color"
            value={color}
            onChange={(e) => setColorState(e.target.value)}
            data-testid="staff-chat-name-picker-color"
            className="w-10 h-7 rounded cursor-pointer border border-[var(--bd)] bg-transparent"
            aria-label="เลือกสีของฉันในแชท"
          />
          <span
            className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border border-[var(--bd)]"
            style={{ color, borderColor: color }}
            data-testid="staff-chat-name-picker-color-hex"
          >
            {color}
          </span>
          <span
            className="ml-auto text-[10px] px-2 py-1 rounded-md"
            style={{ backgroundColor: color, color: '#fff' }}
            data-testid="staff-chat-name-picker-color-preview"
          >
            {trimmed || 'ตัวอย่าง'}
          </span>
        </div>
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
            onClick={() => canSave && onConfirm(trimmed, color)}
            disabled={!canSave}
            data-testid="staff-chat-name-picker-save"
            className="px-3 py-1.5 rounded-lg text-sm font-bold bg-rose-600 hover:bg-rose-500 disabled:bg-[var(--bg-hover)] disabled:text-[var(--tx-muted)] text-white disabled:cursor-not-allowed"
          >
            {isEdit ? 'บันทึก' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default StaffChatNamePicker;
