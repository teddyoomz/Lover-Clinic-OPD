// src/components/staffchat/StaffChatMessageList.jsx
// V73 (2026-05-16) — Scrollable list of messages, auto-scroll to bottom on new msg.
// V73 Feature C (2026-05-16) — Forwards onReply to each message so hover Reply button fires.
// V82 (2026-05-17) — Bottom sentinel + IntersectionObserver fires onScrolledToBottom
//   when the user reaches the latest message. ChatPanel wires this to
//   useStaffChat.markScrolledToBottom → advances the persistent read cursor.
// (2026-05-26) Feature 1 — day separators. Feature 3 — onDelete unsend affordance.
// (2026-06-01) Jump-to-latest button — reuses the SAME bottom-sentinel observer to
//   drive an isAtBottom boolean; a floating ChevronDown button (Q1=C circle + rose
//   unreadCount badge "9+" cap, Q2=A appear-when-scrolled-up) smooth-scrolls endRef
//   to the latest message. V82 onScrolledToBottom timing is unchanged (still fires
//   only on intersect). Additive only — no change to send/receive/read-cursor flow.
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { StaffChatMessage } from './StaffChatMessage.jsx';
import { groupMessagesByDay } from '../../lib/staffChatDayGroups.js';

// (2026-06-01) Reliable scroll-to-bottom. The list previously auto-scrolled via a
// single endRef.scrollIntoView({behavior:'smooth'}) keyed on [lastMessageId]; on a
// COLD tab open that smooth animation was interrupted by mount re-renders (cursor
// hydration + IntersectionObserver + unread memo) and UNDERSHOT the true bottom —
// prod evidence: scrollTop settled 4538 of 5695 (~1158px short) and stuck there
// because the effect only re-fires on a NEW last-message id, so it never
// self-corrected (user: opened "scrolled up", had to press the jump button every
// time). Setting container.scrollTop = scrollHeight clamps to the true bottom
// instantly — no animation to interrupt. Verified on prod (→ distanceFromBottom 0).
export function scrollContainerToBottom(el) {
  if (el) el.scrollTop = el.scrollHeight;
}

export function StaffChatMessageList({ messages, ownDeviceId, onReply, onDelete, onScrolledToBottom, unreadCount = 0 }) {
  const endRef = useRef(null);
  const bottomSentinelRef = useRef(null);
  const listRef = useRef(null);
  // (2026-06-01) true when the bottom sentinel is in view. Default true so the
  // button is hidden on first mount (the auto-scroll effect pins to the bottom).
  const [isAtBottom, setIsAtBottom] = useState(true);

  // (2026-06-02, AV174) Click-a-reply-quote → scroll to the original message +
  // bounce it. nodeRefs maps message-id → its DOM node (registered by each
  // StaffChatMessage). highlightId drives the one-shot bounce class on the target.
  const nodeRefs = useRef(new Map());
  const [highlightId, setHighlightId] = useState(null);
  const highlightTimer = useRef(null);
  const registerNode = useCallback((id, el) => {
    if (!id) return;
    if (el) nodeRefs.current.set(id, el);
    else nodeRefs.current.delete(id);
  }, []);
  const scrollToMessage = useCallback((msgId) => {
    if (!msgId) return;
    const node = nodeRefs.current.get(msgId);
    // Off-window (older than the 50-message listener cap) → graceful no-op.
    if (!node) return;
    // scroll first (jsdom lacks scrollIntoView → guard), THEN highlight so the
    // bounce still fires even if the scroll call throws.
    try { node.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* jsdom noop */ }
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    setHighlightId(msgId);
    highlightTimer.current = setTimeout(() => setHighlightId(null), 1600);
  }, []);
  useEffect(() => () => { if (highlightTimer.current) clearTimeout(highlightTimer.current); }, []);

  // V140 (2026-05-31) — auto-scroll keyed on the latest-message identity (the
  // listener caps at 50, so messages.length stops changing past the cap).
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;

  // (2026-06-01) Auto-scroll to the TRUE bottom on open + on every new last
  // message. Instant container scroll (immediate + one rAF to catch a 1-frame-late
  // layout) — replaces the undershoot-prone smooth scrollIntoView. Still keyed on
  // [lastMessageId] so a same-snapshot re-fire never yanks a user who scrolled up
  // (V140 contract preserved).
  useEffect(() => {
    scrollContainerToBottom(listRef.current);
    if (typeof requestAnimationFrame !== 'function') return undefined;
    const id = requestAnimationFrame(() => scrollContainerToBottom(listRef.current));
    return () => cancelAnimationFrame(id);
  }, [lastMessageId]);

  // V82 observer — fires onScrolledToBottom on intersect (read cursor).
  // (2026-06-01) ALSO drives isAtBottom both directions for the jump button.
  // Guard relaxed (no longer early-returns when onScrolledToBottom is absent) so
  // the boolean tracks regardless; onScrolledToBottom still fires ONLY on intersect.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const node = bottomSentinelRef.current;
    if (!node) return undefined;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setIsAtBottom(entry.isIntersecting);
          if (entry.isIntersecting && typeof onScrolledToBottom === 'function') {
            try {
              onScrolledToBottom();
            } catch {
              // swallow — cursor write failures must not crash the list
            }
          }
        }
      },
      { threshold: 0.5 }
    );
    obs.observe(node);
    return () => {
      obs.disconnect();
    };
  }, [onScrolledToBottom, lastMessageId]);

  const scrollToLatest = () => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  if (messages.length === 0) {
    return (
      <div data-testid="staff-chat-empty" className="flex-1 flex items-center justify-center text-[var(--tx-muted)] text-sm p-4">
        ยังไม่มีข้อความ — เริ่มแชทกับเพื่อนร่วมงานได้เลย
      </div>
    );
  }

  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      <div
        ref={listRef}
        data-testid="staff-chat-message-list"
        className="flex-1 overflow-y-auto overscroll-contain px-3 py-2 space-y-2"
        style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
      >
        {groupMessagesByDay(messages).map(group => (
          <React.Fragment key={group.dayKey}>
            {group.label && (
              <div className="flex justify-center my-2" data-testid="staff-chat-day-divider">
                <span className="text-[11px] text-[var(--tx-muted)] bg-black/30 px-3 py-0.5 rounded-full">
                  {group.label}
                </span>
              </div>
            )}
            {group.items.map(m => (
              <StaffChatMessage
                key={m.id}
                message={m}
                isOwn={m.deviceId === ownDeviceId}
                onReply={onReply}
                onDelete={onDelete}
                onQuoteClick={scrollToMessage}
                isHighlighted={m.id === highlightId}
                registerNode={registerNode}
              />
            ))}
          </React.Fragment>
        ))}
        <div ref={endRef} />
        {/* V82 — bottom sentinel watched by IntersectionObserver. */}
        <div ref={bottomSentinelRef} data-testid="staff-chat-bottom-sentinel" style={{ height: '1px' }} />
      </div>
      {/* (2026-06-01) jump-to-latest — appears whenever scrolled up from bottom
          (Q2=A). Circle + ChevronDown; rose count badge when unreadCount>0 (Q1=C,
          caps "9+"). Tap → smooth-scroll to endRef → observer intersects →
          markScrolledToBottom advances the cursor → unreadCount=0 → button hides. */}
      {!isAtBottom && (
        <button
          type="button"
          onClick={scrollToLatest}
          data-testid="staff-chat-jump-latest"
          aria-label="ลงไปข้อความล่าสุด"
          title="ลงไปข้อความล่าสุด"
          className="absolute bottom-3 right-3 z-[5] w-9 h-9 rounded-full bg-[var(--bg-hover)] border border-[var(--bd-strong)] text-[var(--tx-primary)] shadow-lg flex items-center justify-center hover:bg-[var(--bg-card)] transition-colors"
        >
          <ChevronDown size={18} />
          {unreadCount > 0 && (
            <span
              data-testid="staff-chat-jump-latest-count"
              className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[11px] font-bold flex items-center justify-center border-2 border-[var(--bg-card)]"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

export default StaffChatMessageList;
