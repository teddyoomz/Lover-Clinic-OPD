// src/components/staffchat/StaffChatComposer.jsx
// V73 (2026-05-16) — Textarea + send button. Enter to submit, Shift+Enter newline.
// V73 Feature B — @-mention dropdown + auto-extract mentions on send.
// V73 Feature C — Reply-to-message quote strip + replyTo passed in extras.
// V73 Feature F — Image paste / drag-drop / file-input + upload.
// (2026-05-22) Multi-image: pick/paste/drag MULTIPLE (≤10) + preview strip with
//   per-image remove + per-image upload progress. Uploads via onPrepareAndUpload
//   (hybrid thumb+original) → threads { id: messageId, attachments } into onSend.
import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, X as XIcon } from 'lucide-react';
import { extractMentions } from '../../lib/staffChatClient.js';
import { StaffChatMentionDropdown } from './StaffChatMentionDropdown.jsx';
import {
  validateStaffChatImage,
  STAFF_CHAT_MAX_IMAGES,
} from '../../lib/staffChatImageResize.js';

export function StaffChatComposer({ onSend, recentMentionCandidates = [], replyingTo, onClearReply, onPrepareAndUpload }) {
  const [text, setText] = useState('');
  const [mentionTrigger, setMentionTrigger] = useState(null);
  // pendingImages: [{ id, file, previewUrl, progress }]
  const [pendingImages, setPendingImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const idRef = useRef(0);
  const localId = () => `img-${++idRef.current}`;

  // Revoke object URLs on unmount (memory hygiene) — track via ref so the
  // cleanup sees the latest list, not a stale closure.
  const pendingRef = useRef([]);
  useEffect(() => { pendingRef.current = pendingImages; }, [pendingImages]);
  useEffect(() => () => {
    pendingRef.current.forEach(p => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
  }, []);

  const trimmed = text.trim();
  const tooLong = trimmed.length > 500;
  const canSend = (trimmed.length > 0 || pendingImages.length > 0) && !tooLong && !uploading;

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

  // (2026-05-22) Accept N files (paste/drop/file-input). Validate each (type +
  // ≤50MB); reject with Thai message; cap total at STAFF_CHAT_MAX_IMAGES.
  const acceptFiles = (fileList) => {
    if (uploading) return;
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setPendingImages((prev) => {
      const next = [...prev];
      for (const f of files) {
        if (next.length >= STAFF_CHAT_MAX_IMAGES) {
          window.alert(`ส่งได้สูงสุด ${STAFF_CHAT_MAX_IMAGES} รูปต่อข้อความ`);
          break;
        }
        const v = validateStaffChatImage(f);
        if (!v.ok) { window.alert(v.message); continue; }
        next.push({ id: localId(), file: f, previewUrl: URL.createObjectURL(f), progress: 0 });
      }
      return next;
    });
  };

  const removeImage = (id) => {
    if (uploading) return;
    setPendingImages((prev) => {
      const target = prev.find(p => p.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter(p => p.id !== id);
    });
  };

  const clearAllImages = () => {
    pendingImages.forEach(p => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
    setPendingImages([]);
  };

  const onPaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (const it of items) {
      if (it.kind === 'file') { const f = it.getAsFile(); if (f) files.push(f); }
    }
    if (files.length) acceptFiles(files);
  };

  const onDrop = (e) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (files?.length) acceptFiles(files);
  };

  const onFileSelect = (e) => {
    acceptFiles(e.target.files);
    e.target.value = '';
  };

  const submit = async () => {
    if (!canSend) return;
    const extras = {};
    const mentions = extractMentions(trimmed);
    if (mentions.length > 0) extras.mentions = mentions;
    if (replyingTo) extras.replyTo = replyingTo;

    if (pendingImages.length > 0 && onPrepareAndUpload) {
      setUploading(true);
      try {
        const files = pendingImages.map(p => p.file);
        const { messageId, attachments } = await onPrepareAndUpload(files, (i, frac) => {
          setPendingImages(prev => prev.map((p, idx) => idx === i ? { ...p, progress: frac } : p));
        });
        extras.id = messageId;
        extras.attachments = attachments;
      } catch (e) {
        window.alert('อัพโหลดรูปไม่สำเร็จ: ' + (e?.message || e));
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    onSend(trimmed, extras);
    setText('');
    setMentionTrigger(null);
    clearAllImages();
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
    <div
      className="border-t border-[var(--bd)] bg-[var(--bg-surface)]"
      onPaste={onPaste}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
    >
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
      {pendingImages.length > 0 && (
        <div data-testid="staff-chat-composer-image-preview" className="px-3 py-2 flex items-center gap-2 flex-wrap">
          {pendingImages.map((p) => (
            <div key={p.id} className="relative w-16 h-16" data-testid="staff-chat-composer-image-thumb">
              <img src={p.previewUrl} className="w-16 h-16 object-cover rounded-md border border-[var(--bd)]" alt="" />
              {!uploading && (
                <button
                  type="button"
                  onClick={() => removeImage(p.id)}
                  data-testid="staff-chat-composer-image-clear"
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/80 text-white flex items-center justify-center"
                  aria-label="ลบรูป"
                >
                  <XIcon size={12} />
                </button>
              )}
              {uploading && (
                <div className="absolute left-1 right-1 bottom-1 h-1 rounded bg-white/40 overflow-hidden">
                  <div className="h-full bg-emerald-400 transition-all" style={{ width: `${Math.round((p.progress || 0) * 100)}%` }} />
                </div>
              )}
            </div>
          ))}
          <span className="text-[10px] text-[var(--tx-muted)]">
            {uploading ? 'กำลังอัพโหลด...' : `${pendingImages.length}/${STAFF_CHAT_MAX_IMAGES} รูป`}
          </span>
        </div>
      )}
      <div className="px-2 py-2 flex items-end gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          data-testid="staff-chat-composer-attach"
          className="w-9 h-9 rounded-lg hover:bg-rose-500/10 flex items-center justify-center text-[var(--tx-muted)] hover:text-rose-500 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="แนบรูป"
        >
          <Paperclip size={16} />
        </button>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          ref={fileInputRef}
          onChange={onFileSelect}
          hidden
        />
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
            placeholder="พิมพ์ข้อความ..."
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
