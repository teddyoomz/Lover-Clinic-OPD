// src/components/staffchat/StaffChatImageLightbox.jsx
// V73 Feature F (2026-05-16) — Fullscreen image overlay for chat attachments.
// Esc to close, click-anywhere to close. z-9700 sits above modal z-100.
import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export function StaffChatImageLightbox({ src, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // audit-anti-vibe-code: AV78 lightbox-explicit-exception — fullscreen image viewer.
  // Click-anywhere-closes IS expected UX for fullscreen attachment viewers (Stripe/Linear convention).
  return (
    <div
      data-testid="staff-chat-image-lightbox"
      onClick={onClose}
      className="fixed inset-0 bg-black/90 flex items-center justify-center z-[9700] p-4 cursor-pointer"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
        aria-label="ปิด"
      >
        <X size={20} />
      </button>
      <img src={src} alt="Chat attachment" className="max-w-full max-h-full object-contain" />
    </div>
  );
}

export default StaffChatImageLightbox;
