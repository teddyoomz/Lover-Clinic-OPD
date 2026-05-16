import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, doc, setDoc, onSnapshot, query, orderBy, updateDoc, deleteDoc, getDocs, addDoc, limit as firestoreLimit } from 'firebase/firestore';
import {
  MessageCircle, Send, Settings, ArrowLeft, Check, X, Eye, EyeOff,
  Loader2, RefreshCw, ChevronLeft, Wifi, WifiOff, Image as ImageIcon,
  CheckCircle2, History, Clock, Bookmark, Bell, BellOff
} from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { app } from '../firebase.js';
import { countUnreadPeople } from '../lib/chatUnreadUtils.js';
import { useSelectedBranch, useEffectiveClinicSettings } from '../lib/BranchContext.jsx';
// V75 Item 3 (2026-05-16) — chat_conversations branch-scoped listener (BS-17).
// Layer 2 wrapper auto-injects resolveSelectedBranchId() when caller passes {};
// we call with allBranches:true here + apply client-side filter to preserve
// the legacy-fall-through behavior (un-stamped pre-backfill chats stay visible
// across branches during the V75 backfill transition).
// V76 (2026-05-16 EOD+1) — chat_history listener also goes through BSA Layer 2
// (sibling of listenToChatConversationsByBranch). V75 missed this reader →
// 3,281 legacy chat_history docs leaked across branches. Class-of-bug V12
// multi-reader-sweep. AV59 enforces handleResolve writer-side branchId stamp.
import { listenToChatConversationsByBranch, listenToChatHistoryByBranch } from '../lib/scopedDataLayer.js';
// V78 (2026-05-16 NIGHT — BUG-CHAT-4 fix): per-branch LINE+FB config readers
// for the filter pills + empty-state. Pre-V78 the pills lied because they
// read legacy single-tenant clinic_settings/chat_config.{line,facebook}.enabled.
import { listenToLineConfig } from '../lib/lineConfigClient.js';
import { listenToFbConfig } from '../lib/fbConfigClient.js';
// V75 Item 4 — Chat tab notification mute (per-device localStorage).
// AV58: ONLY ChatPanel.jsx imports this helper; staff-chat / appt / recall
// sound triggers stay independent.
import { isChatTabMuted, toggleChatTabMute } from '../lib/chatNotificationMute.js';

// ─── LINE / FB brand colors ────────────────────────────────────────────────
const LINE_COLOR = '#06C755';
const FB_COLOR = '#0084FF';

// ─── Chat API helpers ──────────────────────────────────────────────────────

async function chatApiFetch(endpoint, body, method = 'POST') {
  const auth = getAuth(app);
  const token = await auth.currentUser?.getIdToken();
  if (!token) return { success: false, error: 'Not logged in' };
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  };
  if (method === 'POST' && body) opts.body = JSON.stringify(body);
  const res = await fetch(`/api/webhook/${endpoint}`, opts);
  return res.json();
}

function sendMessage(platform, odriverId, text, conversationId) {
  return chatApiFetch('send', { platform, odriverId, text, conversationId });
}

// ─── Platform badge ────────────────────────────────────────────────────────

function PlatformBadge({ platform }) {
  if (platform === 'line') return <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: LINE_COLOR + '22', color: LINE_COLOR }}>LINE</span>;
  if (platform === 'facebook') return <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: FB_COLOR + '22', color: FB_COLOR }}>FB</span>;
  return null;
}

// ─── Double beep using Web Audio API ──────────────────────────────────────

// V75 Item 4 (2026-05-16) — Per-device chat-tab notification gate (AV58).
// Wraps playAlertSound so callers (AdminDashboard chat-alert sites) don't
// need to import chatNotificationMute directly — keeps the mute helper
// scope locked to this file per AV58.
export function playChatNotificationSound() {
  if (isChatTabMuted()) return;
  playAlertSound();
}

export function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    function tone(startTime, freq, duration) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      // Smooth fade in/out like a phone notification
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.35, startTime + 0.03);
      gain.gain.setValueAtTime(0.35, startTime + duration - 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
    }
    const now = ctx.currentTime;
    // Soft tri-tone: ascending like a smartphone noti
    tone(now, 784, 0.12);        // G5
    tone(now + 0.15, 988, 0.12); // B5
    tone(now + 0.30, 1175, 0.18); // D6 (hold slightly longer)
    // Repeat once after a short pause
    tone(now + 0.65, 784, 0.12);
    tone(now + 0.80, 988, 0.12);
    tone(now + 0.95, 1175, 0.18);
    setTimeout(() => ctx.close().catch(() => {}), 1400);
  } catch (e) {
    // AudioContext not available
  }
}

// ─── Connection Settings Sub-panel — REMOVED V77 (2026-05-16 EOD+1) ────────
// Legacy single-tenant chat_config UI. Admin now configures LINE+FB PER-BRANCH
// via Backend → ตั้งค่า LINE OA (LineSettingsTab) + ตั้งค่า FB Page
// (FbSettingsTab) tabs. Per user directive: "ถ้ามึงจะไปดึงข้อมูลจาก tab fb
// และ line ของแต่ละสาขา ใน backend แล้ว มึงก็ตัดหน้านี้ที่กุส่งให้ออกไป
// เพราะไม่จำเป็นแล้ว ไปดึงเอาใน Backend ที่เดียวเลย". Old function deleted
// (lines 104-262); ⚙ button + showSettings state swept below.
// Backwards-compat: clinic_settings/chat_config doc remains in Firestore for
// auto-seed migration into per-branch be_fb_configs/{nakhonratchasima} on first
// FbSettingsTab open (V75 fbConfigClient auto-seed contract preserved).

// ─── Chat Detail View ──────────────────────────────────────────────────────

function ChatDetailView({ db, appId, conversation, onBack }) {
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [savedReplies, setSavedReplies] = useState([]);
  const [showSavedReplies, setShowSavedReplies] = useState(false);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const savedRepliesCache = useRef({ data: null, fetchedAt: 0 });

  // Listen to messages
  useEffect(() => {
    if (!conversation) return;
    const convId = conversation.id;
    const messagesRef = collection(db, `artifacts/${appId}/public/data/chat_conversations/${convId}/messages`);
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    return onSnapshot(q, snap => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const msgs = [];
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.timestamp && data.timestamp < sevenDaysAgo) {
          deleteDoc(d.ref).catch(() => {});
        } else {
          msgs.push({ id: d.id, ...data });
        }
      });
      setMessages(msgs);
    });
  }, [conversation, db, appId]);

  // Mark conversation as read whenever admin has it open and unread > 0.
  // Runs on open AND on every new inbound message that arrives while viewing.
  useEffect(() => {
    if (!conversation?.id) return;
    if (!((Number(conversation.unreadCount) || 0) > 0)) return;
    const convRef = doc(db, `artifacts/${appId}/public/data/chat_conversations`, conversation.id);
    updateDoc(convRef, { unreadCount: 0 }).catch(() => {});
  }, [conversation?.id, conversation?.unreadCount, db, appId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close saved replies dropdown on outside click
  useEffect(() => {
    if (!showSavedReplies) return;
    const handleClick = (e) => {
      if (!e.target.closest('.saved-replies-container')) setShowSavedReplies(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSavedReplies]);

  async function handleSend() {
    const text = newMsg.trim();
    if (!text || sending) return;
    setSending(true);
    const result = await sendMessage(conversation.platform, conversation.odriverId, text, conversation.id);
    if (result.success) {
      setNewMsg('');
      inputRef.current?.focus();
    } else {
      alert(`ส่งไม่สำเร็จ: ${result.error}`);
    }
    setSending(false);
  }

  async function fetchSavedReplies() {
    const now = Date.now();
    if (savedRepliesCache.current.data && now - savedRepliesCache.current.fetchedAt < 300000) {
      setSavedReplies(savedRepliesCache.current.data);
      return;
    }
    setLoadingReplies(true);
    const result = await chatApiFetch('saved-replies', null, 'GET');
    if (result.success) {
      setSavedReplies(result.replies || []);
      savedRepliesCache.current = { data: result.replies || [], fetchedAt: Date.now() };
    }
    setLoadingReplies(false);
  }

  function handleUseSavedReply(reply) {
    setNewMsg(reply.message);
    setShowSavedReplies(false);
    inputRef.current?.focus();
  }

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
  }

  const platformColor = conversation?.platform === 'line' ? LINE_COLOR : FB_COLOR;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b border-[var(--bd)]">
        <button onClick={onBack} aria-label="ย้อนกลับ" className="text-[var(--tx-muted)] hover:text-[var(--tx-heading)]"><ChevronLeft size={20} /></button>
        {conversation?.pictureUrl ? (
          <img src={conversation.pictureUrl} className="w-8 h-8 rounded-full object-cover" alt="" />
        ) : (
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: platformColor }}>
            {(conversation?.displayName || '?')[0]}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-[var(--tx-heading)] truncate">{conversation?.displayName}</div>
          <PlatformBadge platform={conversation?.platform} />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && <p className="text-center text-xs text-[var(--tx-muted)] py-8">ยังไม่มีข้อความ</p>}
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.isFromCustomer ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${m.isFromCustomer
              ? 'bg-[var(--bg-hover)] text-[var(--tx-heading)] rounded-bl-md'
              : 'text-white rounded-br-md'}`}
              style={!m.isFromCustomer ? { backgroundColor: platformColor } : {}}>
              {m.imageUrl && m.messageType === 'image' && (
                <img src={m.imageUrl} className="max-w-full rounded-lg mb-1" alt="attachment" />
              )}
              <p className="whitespace-pre-wrap break-words">{m.text}</p>
              <p className={`text-[11px] mt-1 ${m.isFromCustomer ? 'text-[var(--tx-muted)]' : 'text-white/60'}`}>{formatTime(m.timestamp)}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply input — Facebook only (LINE ไม่มี echo ดูไม่ได้ว่าคนอื่นตอบแล้ว) */}
      {conversation?.platform === 'facebook' ? (
        <div className="p-3 border-t border-[var(--bd)]">
          <div className="flex items-center gap-2">
            {/* Saved replies button */}
            <div className="relative saved-replies-container">
              <button onClick={() => { setShowSavedReplies(!showSavedReplies); if (!showSavedReplies) fetchSavedReplies(); }}
                title="ข้อความสำเร็จรูป"
                className="w-9 h-9 rounded-full flex items-center justify-center bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-[var(--tx-heading)] transition-colors flex-shrink-0">
                <Bookmark size={16} />
              </button>
              {showSavedReplies && (
                <div className="absolute bottom-12 left-0 w-72 max-h-60 overflow-y-auto bg-[var(--bg-card)] border border-[var(--bd)] rounded-xl shadow-2xl z-50 p-2">
                  {loadingReplies ? (
                    <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-[var(--tx-muted)]" /></div>
                  ) : savedReplies.length > 0 ? savedReplies.map(r => (
                    <button key={r.id} onClick={() => handleUseSavedReply(r)}
                      className="w-full text-left p-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors">
                      <p className="text-xs font-bold text-[var(--tx-heading)] truncate">{r.title}</p>
                      <p className="text-xs text-[var(--tx-muted)] line-clamp-2">{r.message}</p>
                    </button>
                  )) : (
                    <p className="text-xs text-[var(--tx-muted)] text-center py-3">ไม่มีข้อความสำเร็จรูป</p>
                  )}
                </div>
              )}
            </div>
            {/* Text input */}
            <input ref={inputRef} value={newMsg} onChange={e => setNewMsg(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="พิมพ์ข้อความ..."
              className="flex-1 bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-heading)] rounded-full px-4 py-2.5 outline-none text-sm transition-colors"
              style={{ borderColor: undefined }}
              onFocus={e => e.target.style.borderColor = platformColor}
              onBlur={e => e.target.style.borderColor = ''} />
            {/* Send button */}
            <button onClick={handleSend} disabled={!newMsg.trim() || sending}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white transition-all disabled:opacity-40 flex-shrink-0"
              style={{ backgroundColor: platformColor }}>
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3 border-t border-[var(--bd)]">
          <p className="text-xs text-center text-[var(--tx-muted)]">ตอบแชท LINE ผ่าน LINE OA Chat เท่านั้น</p>
        </div>
      )}
    </div>
  );
}

// ─── Main ChatPanel ────────────────────────────────────────────────────────

// ─── Off-hours helper ──────────────────────────────────────────────────────
// V77-quater (2026-05-16 EOD+1) — V12 multi-reader-sweep follow-up to V77-ter.
// V77-fix3 (S-2 + P2-8, 2026-05-16 NIGHT) — extracted to src/lib/chatHours.js.
// Was duplicated with AdminDashboard.isChatActive; the duplicate IS what
// caused V77-quater to be a separate fix after V77-ter (deferred Rule P
// Step 3 cross-file grep cost 2 user-rage rounds). Now both consume the
// same canonical helper — future V51-field schema drift only updates THERE.
// Also fixes P2-8 (Intl.DateTimeFormat replaces locale-string round-trip).
import { isWithinChatHours } from '../lib/chatHours.js';

export default function ChatPanel({ db, appId, user, clinicSettings }) {
  // Phase 20.0 follow-up (2026-05-06) — per-branch chat filter.
  const { branchId: selectedBranchId } = useSelectedBranch();
  // V77-quater (2026-05-16 EOD+1) — merge per-branch settings.chatHours into
  // clinicSettings shape so isWithinChatHours sees V51 cs.chatHoursMonFri/
  // SatSun/AlwaysOn (admin's BranchFormModal config) instead of pre-V51
  // top-level chatOpenTime/CloseTime fields which are undefined post-V51.
  const cs = useEffectiveClinicSettings(clinicSettings);
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  // V77 (2026-05-16 EOD+1) — showSettings state REMOVED. Legacy frontend
  // ConnectionSettings sub-panel deleted; admin configures LINE+FB per-branch
  // via Backend → ตั้งค่า LINE OA + ตั้งค่า FB Page tabs.
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyPage, setHistoryPage] = useState(0);
  const HISTORY_PER_PAGE = 20;
  const [historyDetail, setHistoryDetail] = useState(null); // selected history item to view messages
  const [historyMsgs, setHistoryMsgs] = useState([]);
  const [historyMsgsLoading, setHistoryMsgsLoading] = useState(false);
  const [chatConfig, setChatConfig] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all' | 'line' | 'facebook'
  const [resolvingId, setResolvingId] = useState(null);
  // V75 Item 4 — per-device chat-tab notification mute (localStorage; doctor
  // machine use case — chat sound off, other notis still ring).
  const [muted, setMuted] = useState(() => isChatTabMuted());

  // V78 (2026-05-16 NIGHT — BUG-CHAT-4 fix): listen to PER-BRANCH LINE + FB
  // configs instead of single-tenant clinic_settings/chat_config. Filter pills
  // + empty-state now reflect the SELECTED branch's enable flags. Pre-V78,
  // admin in พระราม 3 saw นครราชสีมา's pills + empty-state lied about which
  // platforms were configured for the current branch.
  //
  // Legacy single-tenant chat_config kept as fallback during V75 transition
  // (auto-seed for นครราชสีมา per V75 contract). After backfill admin re-
  // configures per-branch, this becomes a no-op fallback.
  const [lineConfig, setLineConfig] = useState(null);
  const [fbConfig, setFbConfig] = useState(null);
  useEffect(() => {
    if (!selectedBranchId) {
      setLineConfig(null);
      setFbConfig(null);
      return;
    }
    const unsubLine = listenToLineConfig(selectedBranchId, setLineConfig, () => setLineConfig(null));
    const unsubFb = listenToFbConfig(selectedBranchId, setFbConfig, () => setFbConfig(null));
    return () => { unsubLine?.(); unsubFb?.(); };
  }, [selectedBranchId]);

  // Legacy fallback — kept for envs where per-branch be_line_configs /
  // be_fb_configs hasn't been seeded yet. Used ONLY when selectedBranchId
  // has no per-branch config (returns null). Read once on mount.
  useEffect(() => {
    const configRef = doc(db, `artifacts/${appId}/public/data/clinic_settings`, 'chat_config');
    return onSnapshot(configRef, snap => {
      setChatConfig(snap.data() || null);
    });
  }, [db, appId]);

  // V75 Item 3 (2026-05-16) — chat_conversations listener through Layer 2
  // wrapper (BS-17). Uses allBranches:true + client-side filter so that
  // legacy un-stamped chats stay visible during the V75 backfill transition
  // (continuity for นครราชสีมา per user directive). Once Rule M backfill
  // script --apply runs (Task 9), all docs will have branchId stamped, and
  // the fall-through (!c.branchId) check becomes a no-op naturally.
  //
  // V77-fix3 (P2-6, 2026-05-16 NIGHT): subscribe ONCE with empty deps and
  // store the raw all-branches array; derive the per-branch filtered view via
  // a `useMemo` below. Pre-fix, deps:[selectedBranchId] tore down + re-
  // subscribed the SAME all-branches listener on every branch switch =
  // wasted Firestore reads (billable per resubscribe on some pricing tiers)
  // AND a brief empty-state flicker during the resubscribe gap.
  //
  // Sort: oldest first — admins respond top-to-bottom (existing UX contract).
  const [rawConversations, setRawConversations] = useState([]);
  useEffect(() => {
    return listenToChatConversationsByBranch({ allBranches: true }, (raw) => {
      // raw is sorted desc by lastMessageAt (helper default); reverse to asc
      setRawConversations([...raw].reverse());
    });
  }, []);
  useEffect(() => {
    const filtered = selectedBranchId
      ? rawConversations.filter(c => !c.branchId || String(c.branchId) === String(selectedBranchId))
      : rawConversations;
    setConversations(filtered);
  }, [rawConversations, selectedBranchId]);

  // V78 BUG-CHAT-6: on branch switch, drop currently-selected conv if it
  // doesn't belong to the new branch (un-stamped legacy conv kept — admin
  // can still respond during V75 transition window).
  useEffect(() => {
    if (!selectedConv) return;
    if (!selectedBranchId) return;
    const stillBelongs = !selectedConv.branchId
      || String(selectedConv.branchId) === String(selectedBranchId);
    if (!stillBelongs) setSelectedConv(null);
  }, [selectedBranchId, selectedConv]);

  // V76 (2026-05-16 EOD+1) — chat_history listener through BSA Layer 2 wrapper.
  // V75 missed this SIBLING reader; user reported cross-branch leak (3,281
  // legacy unstamped docs visible identical across branches).
  // Uses allBranches:true + client-side fall-through `!c.branchId` filter to
  // preserve legacy display during V76 backfill transition window (mirrors
  // V75 chat_conversations continuity contract; once Rule M backfill
  // --apply runs, the fall-through becomes a no-op naturally).
  // Auto-delete > 7 days preserved.
  useEffect(() => {
    if (!showHistory) return;
    setHistoryPage(0);
    return listenToChatHistoryByBranch({ allBranches: true, limitN: 200 }, (raw) => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const valid = [];
      raw.forEach(item => {
        // V76 client-side fall-through filter — mirrors line 506-508 pattern.
        const branchMatches = !selectedBranchId
          || !item.branchId
          || String(item.branchId) === String(selectedBranchId);
        if (!branchMatches) return;
        if (item.resolvedAt && item.resolvedAt < sevenDaysAgo) {
          // Auto-delete > 7 days
          deleteDoc(doc(db, `artifacts/${appId}/public/data/chat_history`, item.id)).catch(() => {});
        } else {
          valid.push(item);
        }
      });
      setHistory(valid);
    });
  }, [showHistory, selectedBranchId, db, appId]);

  // ─── Resolve handler (no confirm, immediate) ─────────────────────────
  const handleResolve = useCallback(async (conv, e) => {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    if (resolvingId) return;
    setResolvingId(conv.id);
    try {
      const convId = conv.id;
      const now = new Date().toISOString();
      const resolvedAt = new Date();

      const firstContactAt = conv.createdAt || conv.lastMessageAt;
      const lastCustomerMessageAt = conv.lastMessageAt || now;
      const responseTimeMs = lastCustomerMessageAt
        ? resolvedAt.getTime() - new Date(lastCustomerMessageAt).getTime()
        : null;

      // Read messages to calculate max gap between customer messages (this session only)
      const msgsRef = collection(db, `artifacts/${appId}/public/data/chat_conversations/${convId}/messages`);
      const msgsSnap = await getDocs(msgsRef);
      const sessionStart = firstContactAt ? new Date(firstContactAt).getTime() : 0;
      const customerTimestamps = msgsSnap.docs
        .map(d => d.data())
        .filter(m => m.isFromCustomer && m.timestamp && new Date(m.timestamp).getTime() >= sessionStart)
        .map(m => new Date(m.timestamp).getTime())
        .sort((a, b) => a - b);
      let maxCustomerGapMs = null;
      if (customerTimestamps.length >= 2) {
        maxCustomerGapMs = 0;
        for (let i = 1; i < customerTimestamps.length; i++) {
          const gap = customerTimestamps[i] - customerTimestamps[i - 1];
          if (gap > maxCustomerGapMs) maxCustomerGapMs = gap;
        }
      }

      // Check if first contact was outside business hours
      // V77-quater — use V51-merged cs (per-branch chatHours) instead of raw
      // clinicSettings prop. Pre-fix: pre-V51 fields undefined → defaulted to
      // 10:00-19:00 → user's 11:15-20:45 config ignored → docs stamped
      // offHours:true wrongly (visible as "ลูกค้าทักนอกเวลา" tag in history).
      const offHours = !isWithinChatHours(firstContactAt || now, cs);

      // Save minimal history record
      const historyRef = collection(db, `artifacts/${appId}/public/data/chat_history`);
      // V76 (2026-05-16 EOD+1) — AV59: stamp branchId on chat_history doc.
      // Inherit conv.branchId (from V75-stamped chat_conversations webhook write)
      // when present; fall back to selectedBranchId (admin's current branch at
      // resolve time); fall back to '' as last resort. branchIdSource records
      // which path was used for audit.
      const resolvedBranchId = String(conv.branchId || selectedBranchId || '');
      const branchIdSource = conv.branchId
        ? 'inherited-from-conv'
        : (selectedBranchId ? 'resolved-by-admin-branch' : 'unstamped');
      const historyData = {
        convId: convId,
        displayName: conv.displayName || 'ไม่ทราบชื่อ',
        platform: conv.platform || (conv.id?.startsWith('line_') ? 'line' : 'facebook'),
        lastMessage: conv.lastMessage || '',
        firstContactAt: firstContactAt || now,
        lastCustomerMessageAt: lastCustomerMessageAt,
        resolvedAt: now,
        resolvedBy: user?.email || user?.uid || 'unknown',
        responseTimeMs: offHours ? null : responseTimeMs,
        maxCustomerGapMs: offHours ? null : maxCustomerGapMs,
        // V76 AV59 — branch-scope discipline
        branchId: resolvedBranchId,
        branchIdSource,
      };
      if (offHours) historyData.offHours = true;
      await addDoc(historyRef, historyData);

      // Keep messages subcollection (don't delete) — old messages will show when customer returns
      // Auto-cleanup of messages older than 7 days happens in ChatDetailView

      // Delete the conversation document (removes from active list)
      await deleteDoc(doc(db, `artifacts/${appId}/public/data/chat_conversations`, convId));

      // Stay on conversation list (conversation disappears automatically via Firestore listener)
    } catch (err) {
      alert(`เกิดข้อผิดพลาด: ${err.message}`);
    } finally {
      setResolvingId(null);
    }
  }, [db, appId, user, resolvingId]);

  // Open history detail — load messages from preserved subcollection
  const openHistoryDetail = useCallback(async (h) => {
    if (!h.convId) return;
    setHistoryDetail(h);
    setHistoryMsgs([]);
    setHistoryMsgsLoading(true);
    try {
      const msgsRef = collection(db, `artifacts/${appId}/public/data/chat_conversations/${h.convId}/messages`);
      const q = query(msgsRef, orderBy('timestamp', 'asc'));
      const snap = await getDocs(q);
      const msgs = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      setHistoryMsgs(msgs);
    } catch (err) {
      console.error('Failed to load history messages:', err);
    } finally {
      setHistoryMsgsLoading(false);
    }
  }, [db, appId]);

  // Count number of PEOPLE with unread (not total messages)
  const { lineUnread, fbUnread } = countUnreadPeople(conversations);

  const filtered = filter === 'all' ? conversations : conversations.filter(c => c.platform === filter);

  // V78 BUG-CHAT-4: per-branch enable flags. Prefer per-branch config; fall
  // back to legacy single-tenant chat_config when per-branch absent (V75
  // transition compat). Same fallback contract as the resolveLineConfig /
  // resolveFbConfig admin-SDK helpers.
  const lineEnabled = !!(lineConfig?.enabled ?? chatConfig?.line?.enabled);
  const fbEnabled = !!(fbConfig?.enabled ?? chatConfig?.facebook?.enabled);
  const noPlatformConfigured = !lineEnabled && !fbEnabled;

  function formatContactTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
  }

  // ─── Settings view REMOVED V77 (2026-05-16 EOD+1) ──────────────────────
  // Admin configures LINE+FB per-branch via Backend → ตั้งค่า LINE OA +
  // ตั้งค่า FB Page tabs. clinic_settings/chat_config doc retained for
  // V75 fbConfigClient auto-seed migration but NO longer admin-editable
  // from frontend.

  // ─── Chat detail view ───────────────────────────────────────────────
  // Keep selectedConv in sync with realtime data
  // V78 (2026-05-16 NIGHT — BUG-CHAT-6 fix): drop the `|| selectedConv`
  // stale-fallback. When admin switches BranchSelector, `conversations` re-
  // filters → if currently-selected conv's branchId !== new selectedBranchId,
  // the conv falls out of the filtered list → find() returns undefined →
  // pre-V78 fallback kept rendering the stale conv detail with the WRONG
  // branch header at top. Now: when conv falls out, close the detail view.
  // Belt-and-suspenders: useEffect below also resets selectedConv on
  // selectedBranchId change.
  const liveSelectedConv = selectedConv ? (conversations.find(c => c.id === selectedConv.id) || null) : null;
  if (liveSelectedConv) {
    return (
      <div className="h-[calc(100vh-180px)] min-h-[400px]">
        <ChatDetailView db={db} appId={appId} conversation={liveSelectedConv} onBack={() => setSelectedConv(null)} />
      </div>
    );
  }

  // ─── Conversation list ─────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-[var(--tx-heading)]">แชท</h2>
          {/* Platform filter pills */}
          <div className="flex items-center gap-1">
            <button onClick={() => { setFilter('all'); setShowHistory(false); }}
              className={`text-xs font-bold px-2 py-1 rounded-full transition-all ${filter === 'all' && !showHistory ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-hover)] text-[var(--tx-muted)]'}`}>
              ทั้งหมด {lineUnread + fbUnread > 0 && <span className="ml-0.5 bg-red-500 text-white text-[8px] px-1 rounded-full">{lineUnread + fbUnread}</span>}
            </button>
            {lineEnabled && (
              <button onClick={() => { setFilter('line'); setShowHistory(false); }}
                className={`text-xs font-bold px-2 py-1 rounded-full transition-all ${filter === 'line' && !showHistory ? 'text-white' : 'text-[var(--tx-muted)]'}`}
                style={filter === 'line' && !showHistory ? { backgroundColor: LINE_COLOR } : { backgroundColor: 'var(--bg-hover)' }}>
                LINE {lineUnread > 0 && <span className="ml-0.5 bg-red-500 text-white text-[8px] px-1 rounded-full">{lineUnread}</span>}
              </button>
            )}
            {fbEnabled && (
              <button onClick={() => { setFilter('facebook'); setShowHistory(false); }}
                className={`text-xs font-bold px-2 py-1 rounded-full transition-all ${filter === 'facebook' && !showHistory ? 'text-white' : 'text-[var(--tx-muted)]'}`}
                style={filter === 'facebook' && !showHistory ? { backgroundColor: FB_COLOR } : { backgroundColor: 'var(--bg-hover)' }}>
                FB {fbUnread > 0 && <span className="ml-0.5 bg-red-500 text-white text-[8px] px-1 rounded-full">{fbUnread}</span>}
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {/* V75 Item 4 — per-device chat-tab noti mute toggle */}
          <button
            type="button"
            data-testid="chat-mute-toggle"
            aria-pressed={muted}
            aria-label={muted ? 'เปิดเสียงแจ้งเตือนแชท (เครื่องนี้)' : 'ปิดเสียงแจ้งเตือนแชท (เครื่องนี้)'}
            title={muted ? 'เปิดเสียงแจ้งเตือนแชท (เครื่องนี้)' : 'ปิดเสียงแจ้งเตือนแชท (เครื่องนี้)'}
            onClick={() => setMuted(toggleChatTabMute())}
            className={`p-2 rounded-lg border border-[var(--bd)] transition-colors ${muted ? 'bg-amber-950/30 text-amber-300' : 'bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-[var(--tx-heading)]'}`}>
            {muted ? <BellOff size={16} /> : <Bell size={16} />}
          </button>
          <button onClick={() => setShowHistory(!showHistory)}
            className={`p-2 rounded-lg border border-[var(--bd)] transition-colors ${showHistory ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-[var(--tx-heading)]'}`}
            title="ประวัติแชท">
            <History size={16} />
          </button>
          {/* V77 (2026-05-16 EOD+1) — ⚙ Settings button REMOVED. Admin configures
              LINE+FB per-branch via Backend → ตั้งค่า LINE OA / ตั้งค่า FB Page. */}
        </div>
      </div>
      {/* V75 Item 4 — Muted-state banner. Visible only when chat sound muted on this device. */}
      {muted && (
        <div data-testid="chat-mute-banner" className="text-xs text-amber-300 bg-amber-950/30 border border-amber-800/40 px-3 py-1.5 rounded-lg mx-2 mt-2">
          🔕 เครื่องนี้ปิดเสียงแชทอยู่ — แท็บอื่นยังดังปกติ
        </div>
      )}

      {/* History view */}
      {showHistory && (
        <div>
          {history.length === 0 ? (
            <div className="text-center py-12">
              <History size={28} className="text-[var(--tx-muted)] mx-auto mb-3" />
              <p className="text-sm text-[var(--tx-muted)]">ยังไม่มีประวัติ</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {history.slice(historyPage * HISTORY_PER_PAGE, (historyPage + 1) * HISTORY_PER_PAGE).map(h => {
                const responseMin = h.responseTimeMs ? Math.round(h.responseTimeMs / 60000) : null;
                const gapMin = h.maxCustomerGapMs ? Math.round(h.maxCustomerGapMs / 60000) : null;
                const pColor = h.platform === 'line' ? LINE_COLOR : FB_COLOR;
                const colorFor = (min) => min <= 5 ? 'text-green-500' : min <= 10 ? 'text-orange-500' : 'text-red-500';
                const fmtMin = (min) => min < 1 ? '< 1 นาที' : min < 60 ? `${min} นาที` : `${Math.floor(min / 60)} ชม. ${min % 60} นาที`;
                return (
                  <div key={h.id} onClick={() => h.convId && openHistoryDetail(h)}
                    className={`p-3 rounded-xl bg-[var(--bg-hover)] border border-[var(--bd)] ${h.convId ? 'cursor-pointer hover:border-[var(--accent)] transition-colors' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: pColor }}>
                          {(h.displayName || '?')[0]}
                        </div>
                        <span className="text-sm font-bold text-[var(--tx-heading)]">{h.displayName}</span>
                        <PlatformBadge platform={h.platform} />
                      </div>
                      <span className="text-[11px] text-[var(--tx-muted)]">
                        {h.resolvedAt ? new Date(h.resolvedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--tx-muted)] truncate mt-1.5 ml-9">{h.lastMessage}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 ml-9 text-xs text-[var(--tx-muted)]">
                      <span>ทักครั้งแรก: {h.firstContactAt ? new Date(h.firstContactAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : '-'}</span>
                      <span>ข้อความสุดท้าย: {h.lastCustomerMessageAt ? new Date(h.lastCustomerMessageAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : '-'}</span>
                      <span>ตอบโดย: {h.resolvedBy}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 ml-9 text-xs">
                      {h.offHours ? (
                        <span className="flex items-center gap-0.5 font-bold text-[var(--tx-muted)]">
                          <Clock size={10} /> ลูกค้าทักนอกเวลา
                        </span>
                      ) : (
                        <>
                          {responseMin !== null && (
                            <span className={`flex items-center gap-0.5 font-bold ${colorFor(responseMin)}`}>
                              <Clock size={10} /> ตอบล่าสุด: {fmtMin(responseMin)}
                            </span>
                          )}
                          {gapMin !== null && (
                            <span className={`flex items-center gap-0.5 font-bold ${colorFor(gapMin)}`}>
                              <Clock size={10} /> ช่วงห่างสูงสุด: {fmtMin(gapMin)}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              {/* Pagination */}
              {history.length > HISTORY_PER_PAGE && (
                <div className="flex items-center justify-center gap-3 pt-3">
                  <button onClick={() => setHistoryPage(p => Math.max(0, p - 1))} disabled={historyPage === 0}
                    className="text-xs px-3 py-1.5 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-[var(--tx-heading)] disabled:opacity-30 transition-colors">
                    ← ก่อนหน้า
                  </button>
                  <span className="text-xs text-[var(--tx-muted)]">
                    {historyPage + 1} / {Math.ceil(history.length / HISTORY_PER_PAGE)}
                  </span>
                  <button onClick={() => setHistoryPage(p => Math.min(Math.ceil(history.length / HISTORY_PER_PAGE) - 1, p + 1))}
                    disabled={historyPage >= Math.ceil(history.length / HISTORY_PER_PAGE) - 1}
                    className="text-xs px-3 py-1.5 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-[var(--tx-heading)] disabled:opacity-30 transition-colors">
                    ถัดไป →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* History detail — read-only message view */}
      {historyDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setHistoryDetail(null)}>
          <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--bd)] shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center gap-3 p-3 border-b border-[var(--bd)]">
              <button onClick={() => setHistoryDetail(null)} className="text-[var(--tx-muted)] hover:text-[var(--tx-heading)]"><ChevronLeft size={20} /></button>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: historyDetail.platform === 'line' ? LINE_COLOR : FB_COLOR }}>
                {(historyDetail.displayName || '?')[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-[var(--tx-heading)] truncate">{historyDetail.displayName}</div>
                <div className="flex items-center gap-1.5">
                  <PlatformBadge platform={historyDetail.platform} />
                  <span className="text-[11px] text-[var(--tx-muted)]">
                    ประวัติ — {historyDetail.resolvedAt ? new Date(historyDetail.resolvedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
              </div>
            </div>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {historyMsgsLoading ? (
                <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-[var(--tx-muted)]" /></div>
              ) : historyMsgs.length === 0 ? (
                <p className="text-center text-xs text-[var(--tx-muted)] py-8">ไม่มีข้อความ (อาจถูกลบตามกำหนด 7 วัน)</p>
              ) : historyMsgs.map(m => {
                const pColor = historyDetail.platform === 'line' ? LINE_COLOR : FB_COLOR;
                return (
                  <div key={m.id} className={`flex ${m.isFromCustomer ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${m.isFromCustomer
                      ? 'bg-[var(--bg-hover)] text-[var(--tx-heading)] rounded-bl-md'
                      : 'text-white rounded-br-md'}`}
                      style={!m.isFromCustomer ? { backgroundColor: pColor } : {}}>
                      {m.imageUrl && m.messageType === 'image' && (
                        <img src={m.imageUrl} className="max-w-full rounded-lg mb-1" alt="attachment" />
                      )}
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                      <p className={`text-[11px] mt-1 ${m.isFromCustomer ? 'text-[var(--tx-muted)]' : 'text-white/60'}`}>
                        {m.timestamp ? new Date(m.timestamp).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Footer — read only */}
            <div className="p-3 border-t border-[var(--bd)]">
              <p className="text-xs text-center text-[var(--tx-muted)]">ดูอย่างเดียว — ประวัติแชทที่จบแล้ว</p>
            </div>
          </div>
        </div>
      )}

      {/* Empty state / not configured */}
      {!showHistory && noPlatformConfigured && (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-full bg-[var(--bg-hover)] flex items-center justify-center mx-auto mb-4">
            <MessageCircle size={28} className="text-[var(--tx-muted)]" />
          </div>
          <h3 className="text-sm font-bold text-[var(--tx-heading)] mb-2">ยังไม่ได้เชื่อมต่อแพลตฟอร์มสำหรับสาขานี้</h3>
          <p className="text-xs text-[var(--tx-muted)] mb-4">
            กรุณาไปที่ <span className="font-bold text-[var(--accent)]">หลังบ้าน → ตั้งค่า LINE OA</span> หรือ
            <span className="font-bold text-[var(--accent)]"> ตั้งค่า FB Page</span> เพื่อตั้งค่าแชทสำหรับสาขานี้
          </p>
        </div>
      )}

      {!showHistory && !noPlatformConfigured && filtered.length === 0 && (
        <div className="text-center py-12" data-testid="chat-empty-state">
          <MessageCircle size={28} className="text-[var(--tx-muted)] mx-auto mb-3" />
          {/* V75 Item 3 — empty-state copy is branch-aware (chat list filters by branchId). */}
          <p className="text-sm text-[var(--tx-muted)]">ยังไม่มีการสนทนาในสาขานี้</p>
          <p className="text-xs text-[var(--tx-muted)] mt-1">ข้อความจากลูกค้าจะแสดงที่นี่</p>
        </div>
      )}

      {/* Conversation list */}
      {!showHistory && filtered.length > 0 && (
        <div className="space-y-1">
          {filtered.map(conv => {
            const pColor = conv.platform === 'line' ? LINE_COLOR : FB_COLOR;
            const hasUnread = conv.unreadCount > 0;
            const isResolving = resolvingId === conv.id;
            const contactTime = conv.createdAt || conv.lastMessageAt;
            return (
              <div key={conv.id}
                className={`flex items-center gap-3 p-3 rounded-xl transition-all hover:bg-[var(--bg-hover)] ${hasUnread ? 'bg-[var(--bg-hover)]' : ''}`}>
                {/* Avatar — clickable to open detail */}
                <button onClick={() => setSelectedConv(conv)} className="flex-shrink-0">
                  {conv.pictureUrl ? (
                    <img src={conv.pictureUrl} className="w-10 h-10 rounded-full object-cover" alt="" />
                  ) : (
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: pColor }}>
                      {(conv.displayName || '?')[0]}
                    </div>
                  )}
                </button>
                {/* Info — clickable to open detail */}
                <button onClick={() => setSelectedConv(conv)} className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-sm truncate ${hasUnread ? 'font-bold text-[var(--tx-heading)]' : 'text-[var(--tx-heading)]'}`}>{conv.displayName}</span>
                    <PlatformBadge platform={conv.platform} />
                    {hasUnread && (
                      <span className="min-w-[18px] h-[18px] rounded-full text-white text-[11px] font-black flex items-center justify-center px-1" style={{ backgroundColor: pColor }}>
                        {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                      </span>
                    )}
                  </div>
                  <p className={`text-xs truncate ${hasUnread ? 'font-semibold text-[var(--tx-heading)]' : 'text-[var(--tx-muted)]'}`}>{conv.lastMessage}</p>
                  <p className="text-[11px] text-[var(--tx-muted)] mt-0.5 flex items-center gap-1">
                    <Clock size={9} /> ทักมาเมื่อ {formatContactTime(contactTime)}
                  </p>
                </button>
                {/* Resolve button */}
                <button onClick={(e) => handleResolve(conv, e)} disabled={isResolving}
                  className="flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs sm:text-xs font-bold bg-green-600 hover:bg-green-500 text-white transition-all flex items-center gap-1 disabled:opacity-50 whitespace-nowrap">
                  {isResolving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                  <span className="hidden sm:inline">ตอบเรียบร้อยแล้ว</span>
                  <span className="sm:hidden">เสร็จ</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Export unread counts for tab badge ──────────────────────────────────────

// V78 (2026-05-16 NIGHT — BUG-CHAT-3 fix, root user complaint):
// Pre-V78 this hook subscribed to ALL chat_conversations (cross-branch).
// Admin in พระราม 3 saw badge "47" because นครราชสีมา had 47 unreads — pure
// cross-branch noise. Triggered cross-branch chime + chat-tab blink for
// messages destined to OTHER branches. The visceral "ไม่เห็นจะแยกกันเลย" came
// from THIS hook, not the listener V75 already shipped.
//
// V78 fix: accept selectedBranchId; mirror ChatPanel listener pattern:
//   - subscribe-once with allBranches:true raw data
//   - useMemo + countUnreadPeople with client-side fall-through filter
//     (preserves un-stamped legacy chats during V75/V76 transition window)
//   - selectedBranchId in derived useMemo deps → switch branch → counts
//     instantly recompute without re-subscribing
//
// Caller (AdminDashboard): `useChatUnread(db, appId, selectedBranchId)`.
export function useChatUnread(db, appId, selectedBranchId = '') {
  const [rawConvs, setRawConvs] = useState([]);

  useEffect(() => {
    const convsRef = collection(db, `artifacts/${appId}/public/data/chat_conversations`);
    return onSnapshot(convsRef, snap => {
      setRawConvs(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    });
  }, [db, appId]);

  // V78: per-branch derivation. Fall-through filter (!c.branchId) preserves
  // legacy un-stamped chats so the badge doesn't go silent during the
  // V75 backfill transition for นครราชสีมา.
  const branchScopedConvs = useMemo(() => {
    if (!selectedBranchId) return rawConvs;
    return rawConvs.filter(c => !c.branchId || String(c.branchId) === String(selectedBranchId));
  }, [rawConvs, selectedBranchId]);

  const { lineUnread, fbUnread, totalUnread } = useMemo(
    () => countUnreadPeople(branchScopedConvs),
    [branchScopedConvs]
  );

  return {
    lineUnread,
    fbUnread,
    totalUnread,
    totalConversations: branchScopedConvs.length,
  };
}
