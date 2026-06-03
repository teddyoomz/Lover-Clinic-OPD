// src/components/staffchat/StaffChatStickerPicker.jsx
// (2026-05-26) Feature 4 — tabbed picker above the composer:
//   😀 Emoji  → inserts a unicode emoji into the text box (no Firebase)
//   🏷️ ชุดแถม → bundled Fluent-Emoji (MIT) sent by ID (0 Storage)
//   ➕ ของฉัน  → per-device IndexedDB custom stickers (+ add file / URL)
import React, { useEffect, useState } from 'react';
import { BUNDLED_STICKERS, bundledStickerSrc } from '../../lib/staffChatStickers.js';
import {
  listStickers, addSticker, addStickerFromUrl, removeSticker,
} from '../../lib/stickerLibrary.js';

const EMOJIS = [
  '😀', '😂', '😍', '😴', '👍', '🙏', '🎉', '😅', '😭', '🤔', '😡', '👋',
  '❤️', '✅', '🔥', '💯', '👏', '😎', '🥹', '🤝', '🙌', '😇', '😊', '🫡',
  '💪', '🤒', '🩺', '💊',
];

export function StaffChatStickerPicker({ onPickEmoji, onSendBundled, onSendCustom, onClose }) {
  const [tab, setTab] = useState('emoji');
  const [mine, setMine] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // (2026-06-03 EOD+4) object-URL lifecycle for custom stickers. Previously the
  // render called stickerObjectUrl(rec) INLINE in mine.map → URL.createObjectURL
  // per render with no revoke → the blobs stayed alive for the page lifetime
  // (a bounded leak that grew on every re-render of the custom tab). Build one
  // URL per rec when `mine` changes + revoke the prior set on change/unmount.
  const [mineUrls, setMineUrls] = useState({});

  const reload = () => listStickers().then(setMine).catch(() => setMine([]));
  useEffect(() => { if (tab === 'custom') reload(); }, [tab]);
  useEffect(() => {
    const urls = {};
    for (const rec of mine) {
      if (rec && rec.blob) urls[rec.id] = URL.createObjectURL(rec.blob);
    }
    setMineUrls(urls);
    return () => {
      for (const u of Object.values(urls)) { try { URL.revokeObjectURL(u); } catch { /* ignore */ } }
    };
  }, [mine]);

  async function onFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setBusy(true); setErr('');
    try { await addSticker(f); await reload(); }
    catch (x) { setErr('เพิ่มไม่ได้: ' + (x?.message || x)); }
    finally { setBusy(false); e.target.value = ''; }
  }
  async function onUrl() {
    const url = window.prompt('วาง URL รูปสติกเกอร์ (png/gif/jpg):');
    if (!url) return;
    setBusy(true); setErr('');
    try { await addStickerFromUrl(url); await reload(); }
    catch { setErr('ดึงจาก URL ไม่ได้ (อาจติด CORS) — ลองดาวน์โหลดไฟล์แล้วอัปแทน'); }
    finally { setBusy(false); }
  }

  return (
    <div
      data-testid="staff-chat-sticker-picker"
      className="bg-[var(--bg-card)] border border-[var(--bd-soft)] rounded-xl p-2 w-[260px] shadow-2xl"
    >
      <div className="flex gap-1 mb-2 text-xs">
        {[['emoji', '😀 Emoji'], ['bundled', '🏷️ ชุดแถม'], ['custom', '➕ ของฉัน']].map(([k, l]) => (
          <button
            key={k}
            type="button"
            data-testid={`sticker-tab-${k}`}
            onClick={() => setTab(k)}
            className={`px-2 py-1 rounded ${tab === k ? 'bg-rose-700 text-white' : 'bg-black/20 text-[var(--tx-muted)]'}`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'emoji' && (
        <div className="grid grid-cols-8 gap-1 text-2xl max-h-40 overflow-y-auto">
          {EMOJIS.map((e) => (
            <button key={e} type="button" data-testid="sticker-emoji" onClick={() => onPickEmoji && onPickEmoji(e)}>
              {e}
            </button>
          ))}
        </div>
      )}

      {tab === 'bundled' && (
        <div className="grid grid-cols-4 gap-2 max-h-44 overflow-y-auto">
          {BUNDLED_STICKERS.map((s) => (
            <button
              key={s.id}
              type="button"
              data-testid="sticker-bundled"
              title={s.label}
              onClick={() => { onSendBundled && onSendBundled(s.id); onClose && onClose(); }}
            >
              <img src={bundledStickerSrc(s.id)} alt={s.label} className="w-12 h-12" />
            </button>
          ))}
        </div>
      )}

      {tab === 'custom' && (
        <div>
          <div className="flex gap-2 mb-2 text-xs">
            <label className="px-2 py-1 rounded bg-black/20 cursor-pointer">
              อัปไฟล์
              <input type="file" accept="image/*" className="hidden" onChange={onFile} data-testid="sticker-file-input" />
            </label>
            <button type="button" className="px-2 py-1 rounded bg-black/20" onClick={onUrl}>จาก URL</button>
          </div>
          {err && <div className="text-[11px] text-rose-400 mb-1">{err}</div>}
          <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
            {mine.map((rec) => (
              <div key={rec.id} className="relative">
                <button
                  type="button"
                  data-testid="sticker-custom"
                  onClick={() => { onSendCustom && onSendCustom(rec); onClose && onClose(); }}
                >
                  <img src={mineUrls[rec.id] || ''} alt="" className="w-12 h-12 object-contain" />
                </button>
                <button
                  type="button"
                  aria-label="ลบสติกเกอร์"
                  onClick={() => removeSticker(rec.id).then(reload)}
                  className="absolute -top-1 -right-1 bg-black/70 text-white rounded-full w-4 h-4 text-[10px] leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {busy && <div className="text-[11px] text-[var(--tx-muted)] mt-1">กำลังเพิ่ม…</div>}
          {!busy && mine.length === 0 && (
            <div className="text-[11px] text-[var(--tx-muted)] mt-1">ยังไม่มีสติกเกอร์ — เพิ่มจากไฟล์หรือ URL (เก็บในเครื่องนี้)</div>
          )}
        </div>
      )}
    </div>
  );
}

export default StaffChatStickerPicker;
