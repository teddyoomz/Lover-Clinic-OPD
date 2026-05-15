// src/components/staffchat/StaffChatComposer.jsx
// V73 (2026-05-16) — Textarea + send button. Enter to submit, Shift+Enter newline.
// V73 Feature B (2026-05-16) — @-mention dropdown + auto-extract mentions on send.
// V73 Feature C (2026-05-16) — Reply-to-message quote strip + replyTo passed in extras.
import React, { useState, useRef } from 'react';
import { Send } from 'lucide-react';
import { extractMentions } from '../../lib/staffChatClient.js';
import { StaffChatMentionDropdown } from './StaffChatMentionDropdown.jsx';

export function StaffChatComposer({ onSend, recentMentionCandidates = [], replyingTo, onClearReply }) {
  const [text, setText] = useState('');
  const [mentionTrigger, setMentionTrigger] = useState(null);
  const textareaRef = useRef(null);
  const trimmed = text.trim();
  const tooLong = trimmed.length > 500;
  const canSend = trimmed.length > 0 && !tooLong;

  const onChange = (e) => {
    const v = e.target.value;
    setText(v);
    const cursor = e.target.selectionStart ?? v.length;
    const beforeCursor = v.slice(0, cursor);
    const m = beforeCursor.match(/@([^\s@]*)$/);
    setMentionTrigger(m ? { partial: m[1], offset: m.index } : null);
  };

  const onMentionPick = (name) => {
    if (!mentionTrigger) return;
    const before = text.slice(0, mentionTrigger.offset);
    const after = text.slice(mentionTrigger.offset + 1 + mentionTrigger.partial.length);
    setText(`${before}@${name} ${after}`);
    setMentionTrigger(null);
    textareaRef.current?.focus();
  };

  const submit = () => {
    if (!canSend) return;
    const mentions = extractMentions(trimmed);
    const extras = {};
    if (mentions.length > 0) extras.mentions = mentions;
    if (replyingTo) extras.replyTo = replyingTo;
    onSend(trimmed, extras);
    setText('');
    setMentionTrigger(null);
    onClearReply?.();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const filteredCandidates = mentionTrigger
    ? recentMentionCandidates.filter(c => c.toLowerCase().startsWith(mentionTrigger.partial.toLowerCase()))
    : [];

  return (
    <div className="border-t border-[var(--bd)] bg-[var(--bg-surface)]">
      {replyingTo && (
        <div
          data-testid="staff-chat-composer-quote-strip"
          className="px-3 py-1.5 bg-rose-500/10 border-b border-rose-500/30 flex items-center gap-2 text-[10px]"
        >
          <span className="font-bold text-rose-300">↩ ตอบกลับ {replyingTo.displayName}:</span>
          <span className="flex-1 text-[var(--tx-muted)] italic truncate">{replyingTo.snippet}</span>
          <button
            type="button"
            onClick={onClearReply}
            data-testid="staff-chat-composer-quote-clear"
            className="w-5 h-5 rounded hover:bg-rose-500/20 flex items-center justify-center text-rose-400"
            aria-label="ยกเลิกการตอบกลับ"
          >
            ×
          </button>
        </div>
      )}
      <div className="px-2 py-2 flex items-end gap-2">
        <div className="relative flex-1">
          {mentionTrigger && filteredCandidates.length > 0 && (
            <StaffChatMentionDropdown candidates={filteredCandidates} onPick={onMentionPick} />
          )}
          <textarea
            ref={textareaRef}
            data-testid="staff-chat-composer-input"
            value={text}
            onChange={onChange}
            onKeyDown={onKeyDown}
            placeholder="พิมพ์ข้อความ... (Enter = ส่ง · Shift+Enter = ขึ้นบรรทัด)"
            rows={1}
            className="w-full resize-none px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-sm text-[var(--tx-primary)] focus:outline-none focus:border-rose-500 max-h-24"
          />
        </div>
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
    </div>
  );
}

export default StaffChatComposer;
