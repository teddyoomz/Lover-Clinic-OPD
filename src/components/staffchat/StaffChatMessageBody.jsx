// src/components/staffchat/StaffChatMessageBody.jsx
// V73 Features B + H (2026-05-16) — Render parsed segments with chips.
import React from 'react';
import { parseMessageBody } from '../../lib/staffChatClient.js';
import { StaffChatMentionChip } from './StaffChatMentionChip.jsx';

export function StaffChatMessageBody({ text }) {
  const segments = parseMessageBody(text);
  return (
    <>
      {segments.map((s, i) => {
        if (s.type === 'mention') return <StaffChatMentionChip key={i} name={s.content} />;
        if (s.type === 'url') return (
          // V137 (2026-05-31) — clickable http/https link → opens in a new tab.
          // sky-600/sky-400 = AA on light/dark theme bg (bubble = sender color
          // at 20% alpha over the theme bg). break-all so long URLs wrap inside
          // the bubble. stopPropagation so the click doesn't bubble to the row.
          <a key={i} href={s.href} target="_blank" rel="noopener noreferrer"
             onClick={(e) => e.stopPropagation()}
             data-testid="staff-chat-url-link"
             className="text-sky-600 dark:text-sky-400 underline underline-offset-2 hover:text-sky-500 break-all cursor-pointer">
            {s.content}
          </a>
        );
        if (s.type === 'customer') return (
          <a key={i} href={`/?backend=1&customer=${encodeURIComponent(s.refId)}`} target="_blank" rel="noopener noreferrer"
             onClick={(e) => e.stopPropagation()}
             data-testid={`staff-chat-customer-link-${s.refId}`}
             className="inline-block px-1.5 py-0.5 rounded font-bold bg-rose-100 text-rose-800 border border-rose-300 hover:bg-rose-200 cursor-pointer">
            {s.content}
          </a>
        );
        if (s.type === 'appt') return (
          <a key={i} href={`/?backend=1#appt-${encodeURIComponent(s.refId)}`} target="_blank" rel="noopener noreferrer"
             onClick={(e) => e.stopPropagation()}
             data-testid={`staff-chat-appt-link-${s.refId}`}
             className="inline-block px-1.5 py-0.5 rounded font-bold bg-sky-100 text-sky-800 border border-sky-300 hover:bg-sky-200 cursor-pointer">
            {s.content}
          </a>
        );
        return <span key={i}>{s.content}</span>;
      })}
    </>
  );
}

export default StaffChatMessageBody;
