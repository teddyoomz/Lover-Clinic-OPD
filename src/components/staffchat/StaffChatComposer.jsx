// src/components/staffchat/StaffChatComposer.jsx
// V73 (2026-05-16) — Textarea + send button. Enter to submit, Shift+Enter newline.
import React, { useState } from 'react';
import { Send } from 'lucide-react';

export function StaffChatComposer({ onSend }) {
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const tooLong = trimmed.length > 500;
  const canSend = trimmed.length > 0 && !tooLong;

  const submit = () => {
    if (!canSend) return;
    onSend(trimmed, {});
    setText('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-[var(--bd)] px-2 py-2 flex items-end gap-2 bg-[var(--bg-surface)]">
      <textarea
        data-testid="staff-chat-composer-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="พิมพ์ข้อความ... (Enter = ส่ง · Shift+Enter = ขึ้นบรรทัด)"
        rows={1}
        className="flex-1 resize-none px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-sm text-[var(--tx-primary)] focus:outline-none focus:border-rose-500 max-h-24"
      />
      <div className="flex flex-col items-end gap-1">
        {trimmed.length >= 400 && (
          <span
            data-testid="staff-chat-composer-counter"
            className={`text-[9px] font-mono ${tooLong ? 'text-rose-500' : 'text-[var(--tx-muted)]'}`}
          >
            {trimmed.length} / 500
          </span>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          data-testid="staff-chat-composer-send"
          className="w-9 h-9 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:bg-[var(--bg-hover)] disabled:text-[var(--tx-muted)] text-white flex items-center justify-center disabled:cursor-not-allowed transition-colors"
          aria-label="ส่ง"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

export default StaffChatComposer;
