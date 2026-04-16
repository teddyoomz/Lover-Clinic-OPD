// ─── FileUploadField — Reusable single-file upload with preview ──────────────
// Uploads to Firebase Storage on file select. Returns URL for parent form.
// Supports: image (jpg/png/webp) + PDF. Dark/light theme.

import { useState, useRef } from 'react';
import { Upload, X, FileText, Loader2, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { uploadFile, deleteFile, buildStoragePath } from '../../lib/storageClient.js';

export default function FileUploadField({
  storagePath,        // base path: "uploads/be_sales/INV-001"
  fieldName,          // "paymentEvidence", "cancelEvidence"
  onUploadComplete,   // ({ url, storagePath }) => void
  onDelete,           // () => void
  value,              // existing URL (edit mode)
  isDark = false,
  label,              // "แนบหลักฐานชำระเงิน"
  accept = 'image/jpeg,image/png,image/webp,application/pdf',
  maxSizeMB = 10,
  disabled = false,
}) {
  const [state, setState] = useState(value ? 'uploaded' : 'empty'); // empty | uploading | uploaded | error
  const [previewUrl, setPreviewUrl] = useState(value || null);
  const [fileName, setFileName] = useState(value ? decodeURIComponent((value || '').split('/').pop()?.split('?')[0] || '') : '');
  const [errorMsg, setErrorMsg] = useState('');
  const [currentPath, setCurrentPath] = useState('');
  const [isImage, setIsImage] = useState(value ? !value.includes('.pdf') : false);
  const inputRef = useRef(null);
  const uploadIdRef = useRef(0);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const thisUpload = ++uploadIdRef.current;

    // Preview
    const fileIsImage = file.type.startsWith('image/');
    setIsImage(fileIsImage);
    setFileName(file.name);
    if (fileIsImage) setPreviewUrl(URL.createObjectURL(file));
    else setPreviewUrl(null);

    setState('uploading');
    setErrorMsg('');

    try {
      const path = buildStoragePath(
        storagePath.split('/').slice(1, 2).join('/') || 'general',
        storagePath.split('/').slice(2).join('/') || 'unknown',
        fieldName,
        file.name
      );
      // Use full storagePath as prefix if it looks like a full path already
      const fullPath = storagePath.includes('/') ? `${storagePath}/${fieldName}_${Date.now()}.${file.name.split('.').pop()?.toLowerCase() || 'bin'}` : path;

      const result = await uploadFile(file, fullPath, { maxSizeMB });
      if (thisUpload !== uploadIdRef.current) return; // stale

      setCurrentPath(result.storagePath);
      if (fileIsImage) setPreviewUrl(result.url);
      else setPreviewUrl(null);
      setState('uploaded');
      onUploadComplete?.(result);
    } catch (err) {
      if (thisUpload !== uploadIdRef.current) return;
      setState('error');
      setErrorMsg(err.message || 'อัปโหลดไม่สำเร็จ');
    }
  };

  const handleDelete = async () => {
    if (currentPath) {
      try { await deleteFile(currentPath); } catch {}
    }
    setState('empty');
    setPreviewUrl(null);
    setFileName('');
    setCurrentPath('');
    setErrorMsg('');
    onDelete?.();
  };

  const labelCls = 'text-[11px] font-bold uppercase tracking-widest text-[var(--tx-muted)] mb-1 block';
  const borderCls = isDark ? 'border-[var(--bd)]' : 'border-gray-200';

  return (
    <div>
      {label && <label className={labelCls}>{label}</label>}

      {/* Empty state — drop zone */}
      {state === 'empty' && (
        <button type="button" onClick={() => !disabled && inputRef.current?.click()} disabled={disabled}
          className={`w-full py-4 px-3 rounded-lg border-2 border-dashed transition-all flex flex-col items-center gap-1.5 ${borderCls} ${
            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-sky-500/50'
          } ${isDark ? 'bg-[var(--bg-input)]' : 'bg-gray-50'}`}>
          <Upload size={18} className="text-[var(--tx-muted)]" />
          <span className="text-xs text-[var(--tx-muted)]">คลิกเพื่อเลือกไฟล์</span>
          <span className="text-[10px] text-[var(--tx-muted)] opacity-60">JPG, PNG, PDF (ไม่เกิน {maxSizeMB}MB)</span>
        </button>
      )}

      {/* Uploading */}
      {state === 'uploading' && (
        <div className={`w-full py-4 px-3 rounded-lg border ${borderCls} flex items-center justify-center gap-2 ${isDark ? 'bg-[var(--bg-input)]' : 'bg-gray-50'}`}>
          <Loader2 size={16} className="animate-spin text-sky-400" />
          <span className="text-xs text-[var(--tx-muted)]">กำลังอัปโหลด...</span>
        </div>
      )}

      {/* Uploaded — preview */}
      {state === 'uploaded' && (
        <div className={`w-full py-2 px-3 rounded-lg border ${borderCls} flex items-center gap-3 ${isDark ? 'bg-[var(--bg-input)]' : 'bg-gray-50'}`}>
          {isImage && previewUrl ? (
            <img src={previewUrl} alt="preview" className="w-12 h-12 rounded object-cover flex-shrink-0" />
          ) : (
            <div className={`w-12 h-12 rounded flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-sky-900/30' : 'bg-sky-50'}`}>
              <FileText size={20} className={isDark ? 'text-sky-400' : 'text-sky-600'} />
            </div>
          )}
          <span className="text-xs text-[var(--tx-secondary)] truncate flex-1">{fileName || 'ไฟล์ที่แนบ'}</span>
          {!disabled && (
            <button type="button" onClick={handleDelete} className="text-[var(--tx-muted)] hover:text-red-400 flex-shrink-0" aria-label="ลบไฟล์">
              <X size={16} />
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {state === 'error' && (
        <div className={`w-full py-3 px-3 rounded-lg border ${isDark ? 'border-red-700/40 bg-red-900/20' : 'border-red-200 bg-red-50'} flex items-center gap-2`}>
          <AlertCircle size={14} className={isDark ? 'text-red-400' : 'text-red-600'} />
          <span className={`text-xs flex-1 ${isDark ? 'text-red-400' : 'text-red-700'}`}>{errorMsg}</span>
          <button type="button" onClick={() => { setState('empty'); setErrorMsg(''); }} className="text-xs text-sky-400 hover:underline flex-shrink-0">ลองอีกครั้ง</button>
        </div>
      )}

      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleFileSelect} />
    </div>
  );
}
