// V137 (2026-05-31) — staff chat: http/https URLs render as clickable links
// (open in a new tab). Previously a URL fell into the default 'text' segment of
// parseMessageBody → rendered as a plain <span> (the user's screenshot).
//
// User: "ในช่อง staffchat ถ้าส่งลิ้งให้มันคลิ๊กได้ด้วย คลิ๊กแล้วเปิด tab ใหม่
// ตามลิ้ง ตอนนี้มันไม่ได้ขึ้นเป็นลิ้ง".
//
// Root cause: parseMessageBody regex matched @mention / LC-######## / BA-#####
// only — no URL branch. Fix: add a 'url' segment (http/https only) FIRST in the
// alternation (so a URL containing LC-/BA- is captured whole) + render it as an
// <a target=_blank rel=noopener noreferrer>. AV157.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { parseMessageBody } from '../src/lib/staffChatClient.js';

// ─── Unit: parseMessageBody URL segment ──────────────────────────────────────
describe('V137.U parseMessageBody — url segment', () => {
  it('U1: a standalone https URL → one url segment (content + href)', () => {
    const seg = parseMessageBody('https://lover-clinic-app.vercel.app/?backend=1&tab=reports-remaining-course');
    expect(seg).toHaveLength(1);
    expect(seg[0]).toEqual({
      type: 'url',
      content: 'https://lover-clinic-app.vercel.app/?backend=1&tab=reports-remaining-course',
      href: 'https://lover-clinic-app.vercel.app/?backend=1&tab=reports-remaining-course',
    });
  });
  it('U2: http (not just https) also matches', () => {
    const seg = parseMessageBody('http://example.com/x');
    expect(seg[0].type).toBe('url');
    expect(seg[0].href).toBe('http://example.com/x');
  });
  it('U3: text + URL + text → [text, url, text]', () => {
    const seg = parseMessageBody('ดูที่ https://x.com/a นะ');
    expect(seg.map(s => s.type)).toEqual(['text', 'url', 'text']);
    expect(seg[1].href).toBe('https://x.com/a');
    expect(seg[2].content).toBe(' นะ');
  });
  it('U4: trailing sentence punctuation is stripped off the link', () => {
    const seg = parseMessageBody('เปิด https://x.com/a.');
    expect(seg.map(s => s.type)).toEqual(['text', 'url', 'text']);
    expect(seg[1].href).toBe('https://x.com/a');   // no trailing dot in href
    expect(seg[2].content).toBe('.');
  });
  it('U5: a URL containing LC-######## is captured WHOLE (no customer-chip split)', () => {
    const seg = parseMessageBody('https://host/?backend=1&customer=LC-26000022');
    expect(seg).toHaveLength(1);
    expect(seg[0].type).toBe('url');
    expect(seg[0].href).toContain('LC-26000022');
    // anti-regression: must NOT have produced a separate customer segment
    expect(seg.some(s => s.type === 'customer')).toBe(false);
  });
  it('U6: a URL containing BA-##### is captured whole too', () => {
    const seg = parseMessageBody('https://host/x#appt-BA-1778868832454');
    expect(seg).toHaveLength(1);
    expect(seg[0].type).toBe('url');
    expect(seg.some(s => s.type === 'appt')).toBe(false);
  });
  it('U7: two URLs in one message → two url segments', () => {
    const seg = parseMessageBody('https://a.com และ https://b.com');
    const urls = seg.filter(s => s.type === 'url');
    expect(urls.map(u => u.href)).toEqual(['https://a.com', 'https://b.com']);
  });
  it('U8: NON-http schemes do NOT match (no XSS via href)', () => {
    for (const evil of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:msgbox', 'file:///etc']) {
      const seg = parseMessageBody(evil);
      expect(seg.some(s => s.type === 'url')).toBe(false);
    }
  });
  it('U9: existing segment types still work (regression) — mention/customer/appt/plain', () => {
    expect(parseMessageBody('@bob')[0]).toEqual({ type: 'mention', content: 'bob' });
    expect(parseMessageBody('LC-26000022')[0]).toMatchObject({ type: 'customer', refId: 'LC-26000022' });
    expect(parseMessageBody('BA-1778868832454')[0]).toMatchObject({ type: 'appt', refId: 'BA-1778868832454' });
    expect(parseMessageBody('สวัสดี')[0]).toEqual({ type: 'text', content: 'สวัสดี' });
  });
  it('U10: empty / non-string guard preserved', () => {
    expect(parseMessageBody('')).toEqual([{ type: 'text', content: '' }]);
    expect(parseMessageBody(null)).toEqual([{ type: 'text', content: '' }]);
  });
  it('U11: URL mixed with a real customer ref elsewhere → url whole + customer chip separate', () => {
    const seg = parseMessageBody('ลูกค้า LC-26000022 ดู https://x.com/a');
    expect(seg.some(s => s.type === 'customer' && s.refId === 'LC-26000022')).toBe(true);
    expect(seg.some(s => s.type === 'url' && s.href === 'https://x.com/a')).toBe(true);
  });
});

// ─── RTL: render contract (reuse the V73 widget harness) ─────────────────────
vi.mock('../src/hooks/useStaffChat.js', () => ({ useStaffChat: vi.fn() }));
vi.mock('../src/lib/BranchContext.jsx', () => ({ useSelectedBranch: () => ({ branchId: 'BR-T' }) }));
vi.mock('../src/firebase.js', () => ({ auth: { currentUser: { uid: 'U1' } }, appId: 'TEST-APP' }));

import { StaffChatWidget } from '../src/components/staffchat/StaffChatWidget.jsx';
import { useStaffChat } from '../src/hooks/useStaffChat.js';

function stateWithMessage(text) {
  return {
    messages: [
      { id: 'CHAT-URL1', branchId: 'BR-T', displayName: 'admin', text,
        deviceId: 'other', createdAt: { toMillis: () => Date.now() } },
    ],
    minimized: false, unreadCount: 0, deviceId: 'dev-me',
    error: null, namePickerOpen: false, setNamePickerOpen: vi.fn(),
    send: vi.fn(), confirmName: vi.fn(), expand: vi.fn(), minimize: vi.fn(),
    recentMentionCandidates: [],
    replyingTo: null, setReplyingTo: vi.fn(),
  };
}

describe('V137.R url render contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('R1: the screenshot URL renders as <a> with target=_blank + rel=noopener + correct href', () => {
    const url = 'https://lover-clinic-app.vercel.app/?backend=1&tab=reports-remaining-course';
    useStaffChat.mockReturnValue(stateWithMessage(url));
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    const link = screen.getByTestId('staff-chat-url-link');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', url);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link.textContent).toBe(url);
  });

  it('R2: plain text without a URL renders NO url link (regression)', () => {
    useStaffChat.mockReturnValue(stateWithMessage('สวัสดีครับ ไม่มีลิ้ง'));
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    expect(screen.queryByTestId('staff-chat-url-link')).toBeNull();
  });

  it('R3: customer chip still renders alongside a URL (regression)', () => {
    useStaffChat.mockReturnValue(stateWithMessage('LC-26000022 ดู https://x.com/a'));
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-customer-link-LC-26000022')).toBeInTheDocument();
    expect(screen.getByTestId('staff-chat-url-link')).toBeInTheDocument();
  });

  it('R4: link color is sky (NEVER red — Thai-culture safe + standard link affordance)', () => {
    useStaffChat.mockReturnValue(stateWithMessage('https://x.com/a'));
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    const link = screen.getByTestId('staff-chat-url-link');
    expect(link.className).toMatch(/text-sky-/);
    expect(link.className).not.toMatch(/text-red-/);
  });
});

// ─── Source-grep (lock the wiring) ───────────────────────────────────────────
describe('V137.SG source-grep', () => {
  const CLIENT = readFileSync('src/lib/staffChatClient.js', 'utf8');
  const BODY = readFileSync('src/components/staffchat/StaffChatMessageBody.jsx', 'utf8');

  it('SG1: parser regex has the http/https URL branch FIRST', () => {
    expect(CLIENT).toMatch(/const re = \/\(https\?:\\\/\\\/\[\^\\s\]\+\)\|/);
  });
  it('SG2: parser emits a url segment with content + href', () => {
    expect(CLIENT).toMatch(/out\.push\(\{ type: 'url', content: url, href: url \}\)/);
  });
  it('SG3: indices shifted — mention=m[2], customer=m[3], appt=m[4]', () => {
    expect(CLIENT).toMatch(/else if \(m\[2\]\) out\.push\(\{ type: 'mention'/);
    expect(CLIENT).toMatch(/else if \(m\[3\]\) out\.push\(\{ type: 'customer'/);
    expect(CLIENT).toMatch(/else if \(m\[4\]\) out\.push\(\{ type: 'appt'/);
  });
  it('SG4: renderer has a url branch with target=_blank + rel + sky color', () => {
    expect(BODY).toMatch(/s\.type === 'url'/);
    expect(BODY).toMatch(/href=\{s\.href\}/);
    expect(BODY).toMatch(/target="_blank"/);
    expect(BODY).toMatch(/rel="noopener noreferrer"/);
    expect(BODY).toMatch(/text-sky-600 dark:text-sky-400/);
    expect(BODY).toMatch(/data-testid="staff-chat-url-link"/);
  });
  it('SG5: V137 marker present (institutional memory)', () => {
    expect(CLIENT).toMatch(/V137/);
    expect(BODY).toMatch(/V137/);
  });
});
