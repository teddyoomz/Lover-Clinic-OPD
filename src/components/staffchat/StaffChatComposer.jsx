// src/components/staffchat/StaffChatComposer.jsx
// V73 (2026-05-16) — Textarea + send button. Enter to submit, Shift+Enter newline.
// V73 Feature B — @-mention dropdown + auto-extract mentions on send.
// V73 Feature C — Reply-to-message quote strip + replyTo passed in extras.
// V73 Feature F — Image paste / drag-drop / file-input + upload.
// (2026-05-22) Any-file: pick / paste / drag MULTIPLE (≤10) files of ANY type
//   (≤1GB; images ≤50MB) + preview strip (image thumb | icon+name) with per-file
//   upload progress + per-file CANCEL (task.cancel) + retry-on-failure. Uploads
//   via onPrepareAndUpload (hybrid thumb+original for images; original-only for
//   files) → threads { id: messageId, attachments } into onSend.
import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, X as XIcon } from 'lucide-react';
import { extractMentions } from '../../lib/staffChatClient.js';
import { StaffChatMentionDropdown } from './StaffChatMentionDropdown.jsx';
import {
  validateStaffChatFile,
  attachmentKindFor,
  STAFF_CHAT_MAX_ATTACHMENTS,
} from '../../lib/staffChatImageResize.js';

// Pending-chip icon for non-image files (image kind shows a real thumbnail).
const KIND_ICON = { pdf: '📄', video: '🎬', audio: '🎵', file: '📎' };
function pendingIcon(p) {
  const k = attachmentKindFor(p.file && p.file.type);
  if (k === 'file') {
    const ext = (String(p.name || '').match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '🗜️';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
    if (['doc', 'docx', 'txt', 'rtf', 'md'].includes(ext)) return '📝';
    if (['ppt', 'pptx', 'key'].includes(ext)) return '📽️';
  }
  return KIND_ICON[k] || '📎';
}

export function StaffChatComposer({ onSend, recentMentionCandidates = [], replyingTo, onClearReply, onPrepareAndUpload }) {
  const [text, setText] = useState('');
  const [mentionTrigger, setMentionTrigger] = useState(null);
  // pendingFiles: [{ id, file, previewUrl|null, kind, name, progress, cancelled }]
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const idRef = useRef(0);
  const localId = () => `att-${++idRef.current}`;
  // (2026-05-22) per-file resumable task refs (index→task) + cancelled-index set,
  // so a chip's ✕ during upload can task.cancel() and the pipeline skips it.
  const taskRefs = useRef({});
  const cancelRef = useRef(new Set());

  // Revoke object URLs on unmount (memory hygiene) — track via ref so the
  // cleanup sees the latest list, not a stale closure.
  const pendingRef = useRef([]);
  useEffect(() => { pendingRef.current = pendingFiles; }, [pendingFiles]);
  useEffect(() => () => {
    pendingRef.current.forEach(p => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
  }, []);

  const trimmed = text.trim();
  const tooLong = trimmed.length > 500;
  const canSend = (trimmed.length > 0 || pendingFiles.length > 0) && !tooLong && !uploading;

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

  // (2026-05-22) Accept N files of ANY type (paste/drop/file-input). Validate
  // each (allow-all type + split caps); reject with Thai message; cap total at
  // STAFF_CHAT_MAX_ATTACHMENTS.
  const acceptFiles = (fileList) => {
    if (uploading) return;
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setPendingFiles((prev) => {
      const next = [...prev];
      for (const f of files) {
        if (next.length >= STAFF_CHAT_MAX_ATTACHMENTS) {
          window.alert(`ส่งได้สูงสุด ${STAFF_CHAT_MAX_ATTACHMENTS} ไฟล์ต่อข้อความ`);
          break;
        }
        const v = validateStaffChatFile(f);
        if (!v.ok) { window.alert(v.message); continue; }
        const kind = attachmentKindFor(f.type);
        next.push({
          id: localId(),
          file: f,
          previewUrl: kind === 'image' ? URL.createObjectURL(f) : null,
          kind,
          name: f.name || 'file',
          progress: 0,
          cancelled: false,
        });
      }
      return next;
    });
  };

  // Pre-upload: remove a pending chip. During upload: cancel that file's task +
  // mark it cancelled (index-stable — never splice while the upload loop runs,
  // or progress callbacks would target the wrong chip).
  const removeOrCancel = (id, index) => {
    if (uploading) {
      cancelRef.current.add(index);
      try { taskRefs.current[index]?.cancel(); } catch { /* already settled */ }
      setPendingFiles((prev) => prev.map((p, i) => (i === index ? { ...p, cancelled: true } : p)));
      return;
    }
    setPendingFiles((prev) => {
      const target = prev.find(p => p.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter(p => p.id !== id);
    });
  };

  const clearAllFiles = () => {
    pendingFiles.forEach(p => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
    setPendingFiles([]);
    taskRefs.current = {};
    cancelRef.current = new Set();
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

    if (pendingFiles.length > 0 && onPrepareAndUpload) {
      // Reset per-attempt cancel/task state + progress (also covers retry: the
      // user keeps the strip after a failure and clicks Send again).
      taskRefs.current = {};
      cancelRef.current = new Set();
      setPendingFiles(prev => prev.map(p => ({ ...p, progress: 0, cancelled: false })));
      setUploading(true);
      let result;
      try {
        const files = pendingFiles.map(p => p.file);
        result = await onPrepareAndUpload(
          files,
          (i, frac) => setPendingFiles(prev => prev.map((p, idx) => (idx === i ? { ...p, progress: frac } : p))),
          (i, task) => { taskRefs.current[i] = task; },
          cancelRef,
        );
      } catch (e) {
        window.alert('อัพโหลดไฟล์ไม่สำเร็จ: ' + (e?.message || e));
        setUploading(false);
        return;
      }
      setUploading(false);
      const { messageId, attachments, failed } = result || {};
      if (Array.isArray(failed) && failed.length > 0) {
        // Keep the strip so the user can click Send again to retry the failures.
        window.alert(`อัพโหลด ${failed.length} ไฟล์ไม่สำเร็จ — กดส่งอีกครั้งเพื่อลองใหม่`);
        return;
      }
      if (Array.isArray(attachments) && attachments.length > 0) {
        extras.id = messageId;
        extras.attachments = attachments;
      } else if (!trimmed) {
        // All files cancelled + no text → nothing to send.
        clearAllFiles();
        return;
      }
    }

    onSend(trimmed, extras);
    setText('');
    setMentionTrigger(null);
    clearAllFiles();
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
      {pendingFiles.length > 0 && (
        <div data-testid="staff-chat-composer-image-preview" className="px-3 py-2 flex items-start gap-2 flex-wrap">
          {pendingFiles.map((p, index) => (
            <div key={p.id} className={`w-16 ${p.cancelled ? 'opacity-40' : ''}`} data-testid="staff-chat-composer-image-thumb">
              {/* The 64px thumb box is the ONLY positioning context for the ✕ +
                  progress bar — the filename label below MUST sit outside it, or
                  the absolute bottom-1 bar overlaps the name (2026-05-22 fix). */}
              <div className="relative w-16 h-16">
                {p.kind === 'image' && p.previewUrl ? (
                  <img src={p.previewUrl} className="w-16 h-16 object-cover rounded-md border border-[var(--bd)]" alt="" />
                ) : (
                  <div className="w-16 h-16 rounded-md border border-[var(--bd)] bg-[var(--bg-hover)] flex items-center justify-center text-2xl" aria-hidden="true">
                    {pendingIcon(p)}
                  </div>
                )}
                {!p.cancelled && (
                  <button
                    type="button"
                    onClick={() => removeOrCancel(p.id, index)}
                    data-testid="staff-chat-composer-image-clear"
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/80 text-white flex items-center justify-center"
                    aria-label={uploading ? 'ยกเลิก' : 'ลบไฟล์'}
                  >
                    <XIcon size={12} />
                  </button>
                )}
                {uploading && !p.cancelled && (
                  <div className="absolute left-1 right-1 bottom-1 h-1 rounded bg-white/40 overflow-hidden">
                    <div className="h-full bg-emerald-400 transition-all" style={{ width: `${Math.round((p.progress || 0) * 100)}%` }} />
                  </div>
                )}
              </div>
              <div className="text-[9px] text-[var(--tx-muted)] mt-0.5 w-16 truncate" title={p.name}>{p.name}</div>
            </div>
          ))}
          <span className="text-[10px] text-[var(--tx-muted)] self-center">
            {uploading ? 'กำลังอัพโหลด...' : `${pendingFiles.length}/${STAFF_CHAT_MAX_ATTACHMENTS} ไฟล์`}
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
          aria-label="แนบไฟล์"
        >
          <Paperclip size={16} />
        </button>
        <input
          type="file"
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
