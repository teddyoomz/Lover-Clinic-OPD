import { useState, useEffect, useRef } from 'react';
import { collection, doc, setDoc, onSnapshot, query, orderBy, updateDoc, deleteDoc, getDocs, addDoc, limit as firestoreLimit } from 'firebase/firestore';
import {
  MessageCircle, Send, Settings, ArrowLeft, Check, X, Eye, EyeOff,
  Loader2, RefreshCw, ChevronLeft, Wifi, WifiOff, Image as ImageIcon,
  CheckCircle2, History, Clock
} from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { app } from '../firebase.js';

// ─── LINE / FB brand colors ────────────────────────────────────────────────
const LINE_COLOR = '#06C755';
const FB_COLOR = '#0084FF';

// ─── Chat API helpers ──────────────────────────────────────────────────────

async function chatApiFetch(endpoint, body) {
  const auth = getAuth(app);
  const token = await auth.currentUser?.getIdToken();
  if (!token) return { success: false, error: 'Not logged in' };
  const res = await fetch(`/api/webhook/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return res.json();
}

function sendMessage(platform, odriverId, text, conversationId) {
  return chatApiFetch('send', { platform, odriverId, text, conversationId });
}

// ─── Platform badge ────────────────────────────────────────────────────────

function PlatformBadge({ platform }) {
  if (platform === 'line') return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: LINE_COLOR + '22', color: LINE_COLOR }}>LINE</span>;
  if (platform === 'facebook') return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: FB_COLOR + '22', color: FB_COLOR }}>FB</span>;
  return null;
}

// ─── Connection Settings Sub-panel ─────────────────────────────────────────

function ConnectionSettings({ db, appId, chatConfig, onBack }) {
  const [line, setLine] = useState({
    channelAccessToken: chatConfig?.line?.channelAccessToken || '',
    channelSecret: chatConfig?.line?.channelSecret || '',
    enabled: chatConfig?.line?.enabled ?? false,
  });
  const [fb, setFb] = useState({
    pageAccessToken: chatConfig?.facebook?.pageAccessToken || '',
    appSecret: chatConfig?.facebook?.appSecret || '',
    verifyToken: chatConfig?.facebook?.verifyToken || '',
    pageId: chatConfig?.facebook?.pageId || '',
    enabled: chatConfig?.facebook?.enabled ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [showLineToken, setShowLineToken] = useState(false);
  const [showLineSecret, setShowLineSecret] = useState(false);
  const [showFbToken, setShowFbToken] = useState(false);
  const [showFbSecret, setShowFbSecret] = useState(false);

  const webhookBase = typeof window !== 'undefined' ? window.location.origin : '';

  async function handleSave() {
    setSaving(true);
    setMsg('');
    try {
      // Auto-enable if credentials are filled
      const lineSave = { ...line };
      if (lineSave.channelAccessToken && lineSave.channelSecret) lineSave.enabled = true;
      const fbSave = { ...fb };
      if (fbSave.pageAccessToken && fbSave.appSecret && fbSave.pageId) fbSave.enabled = true;

      await setDoc(doc(db, `artifacts/${appId}/public/data/clinic_settings`, 'chat_config'), {
        line: lineSave,
        facebook: fbSave,
        updatedAt: new Date().toISOString(),
      });
      setLine(lineSave);
      setFb(fbSave);
      setMsg('✓ บันทึกสำเร็จ');
    } catch (err) {
      setMsg(`✗ ${err.message}`);
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(''), 5000);
    }
  }

  const inputCls = 'w-full bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-heading)] rounded-lg px-3 py-2.5 outline-none transition-all text-sm focus:border-[var(--accent)] font-mono';
  const labelCls = 'block text-xs font-bold text-[var(--tx-muted)] mb-1 uppercase tracking-wider';
  const sectionCls = 'p-4 rounded-xl border border-[var(--bd)] bg-[var(--bg-card)]';

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-[var(--tx-muted)] hover:text-[var(--tx-heading)] transition-colors mb-2">
        <ArrowLeft size={14} /> กลับ
      </button>

      {/* LINE OA */}
      <div className={sectionCls}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: LINE_COLOR }}>
              <MessageCircle size={13} className="text-white" />
            </div>
            <h3 className="text-sm font-bold text-[var(--tx-heading)]">LINE Official Account</h3>
          </div>
          <button onClick={() => setLine(p => ({ ...p, enabled: !p.enabled }))}
            className={`text-xs font-bold px-2.5 py-1 rounded-full transition-all ${line.enabled ? 'text-white' : 'bg-gray-800 text-gray-500'}`}
            style={line.enabled ? { backgroundColor: LINE_COLOR } : {}}>
            {line.enabled ? 'เปิด' : 'ปิด'}
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Channel Access Token</label>
            <div className="relative">
              <input type={showLineToken ? 'text' : 'password'} value={line.channelAccessToken} onChange={e => setLine(p => ({ ...p, channelAccessToken: e.target.value }))} className={inputCls} placeholder="ใส่ Channel Access Token" />
              <button onClick={() => setShowLineToken(!showLineToken)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--tx-muted)]">{showLineToken ? <EyeOff size={14}/> : <Eye size={14}/>}</button>
            </div>
          </div>
          <div>
            <label className={labelCls}>Channel Secret</label>
            <div className="relative">
              <input type={showLineSecret ? 'text' : 'password'} value={line.channelSecret} onChange={e => setLine(p => ({ ...p, channelSecret: e.target.value }))} className={inputCls} placeholder="ใส่ Channel Secret" />
              <button onClick={() => setShowLineSecret(!showLineSecret)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--tx-muted)]">{showLineSecret ? <EyeOff size={14}/> : <Eye size={14}/>}</button>
            </div>
          </div>
          <div>
            <label className={labelCls}>Webhook URL (ใส่ใน LINE Developer Console)</label>
            <div className="flex items-center gap-2">
              <input readOnly value={`${webhookBase}/api/webhook/line`} className={`${inputCls} text-xs opacity-70`} />
              <button onClick={() => navigator.clipboard.writeText(`${webhookBase}/api/webhook/line`)} className="text-[10px] font-bold px-2 py-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-[var(--tx-heading)] whitespace-nowrap">Copy</button>
            </div>
          </div>
        </div>
      </div>

      {/* Facebook */}
      <div className={sectionCls}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: FB_COLOR }}>
              <MessageCircle size={13} className="text-white" />
            </div>
            <h3 className="text-sm font-bold text-[var(--tx-heading)]">Facebook Messenger</h3>
          </div>
          <button onClick={() => setFb(p => ({ ...p, enabled: !p.enabled }))}
            className={`text-xs font-bold px-2.5 py-1 rounded-full transition-all ${fb.enabled ? 'text-white' : 'bg-gray-800 text-gray-500'}`}
            style={fb.enabled ? { backgroundColor: FB_COLOR } : {}}>
            {fb.enabled ? 'เปิด' : 'ปิด'}
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Page Access Token</label>
            <div className="relative">
              <input type={showFbToken ? 'text' : 'password'} value={fb.pageAccessToken} onChange={e => setFb(p => ({ ...p, pageAccessToken: e.target.value }))} className={inputCls} placeholder="ใส่ Page Access Token" />
              <button onClick={() => setShowFbToken(!showFbToken)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--tx-muted)]">{showFbToken ? <EyeOff size={14}/> : <Eye size={14}/>}</button>
            </div>
          </div>
          <div>
            <label className={labelCls}>App Secret</label>
            <div className="relative">
              <input type={showFbSecret ? 'text' : 'password'} value={fb.appSecret} onChange={e => setFb(p => ({ ...p, appSecret: e.target.value }))} className={inputCls} placeholder="ใส่ App Secret" />
              <button onClick={() => setShowFbSecret(!showFbSecret)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--tx-muted)]">{showFbSecret ? <EyeOff size={14}/> : <Eye size={14}/>}</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Page ID</label>
              <input value={fb.pageId} onChange={e => setFb(p => ({ ...p, pageId: e.target.value }))} className={inputCls} placeholder="Page ID" />
            </div>
            <div>
              <label className={labelCls}>Verify Token</label>
              <input value={fb.verifyToken} onChange={e => setFb(p => ({ ...p, verifyToken: e.target.value }))} className={inputCls} placeholder="ตั้งเอง (อะไรก็ได้)" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Webhook URL (ใส่ใน Facebook App Dashboard)</label>
            <div className="flex items-center gap-2">
              <input readOnly value={`${webhookBase}/api/webhook/facebook`} className={`${inputCls} text-xs opacity-70`} />
              <button onClick={() => navigator.clipboard.writeText(`${webhookBase}/api/webhook/facebook`)} className="text-[10px] font-bold px-2 py-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-[var(--tx-heading)] whitespace-nowrap">Copy</button>
            </div>
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all flex items-center gap-2 bg-[var(--accent)] text-white hover:brightness-110 disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
        {msg && <span className={`text-sm font-bold ${msg.startsWith('✓') ? 'text-green-500' : 'text-red-500'}`}>{msg}</span>}
      </div>
    </div>
  );
}

// ─── Chat Detail View ──────────────────────────────────────────────────────

function ChatDetailView({ db, appId, conversation, onBack, user }) {
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Listen to messages
  useEffect(() => {
    if (!conversation) return;
    const convId = `${conversation.platform === 'line' ? 'line' : 'fb'}_${conversation.odriverId}`;
    const messagesRef = collection(db, `artifacts/${appId}/public/data/chat_conversations/${convId}/messages`);
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    return onSnapshot(q, snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(msgs);
    });
  }, [conversation, db, appId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Mark as read — writes to Firestore so ALL admins see unread cleared (via onSnapshot)
  useEffect(() => {
    if (!conversation?.id) return;
    const convRef = doc(db, `artifacts/${appId}/public/data/chat_conversations`, conversation.id);
    updateDoc(convRef, { unreadCount: 0 }).catch(() => {});
  }, [conversation?.id, db, appId]);

  // Also mark as read when new messages arrive while viewing
  useEffect(() => {
    if (!conversation?.id || messages.length === 0) return;
    const convRef = doc(db, `artifacts/${appId}/public/data/chat_conversations`, conversation.id);
    updateDoc(convRef, { unreadCount: 0 }).catch(() => {});
  }, [messages.length, conversation?.id, db, appId]);

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

  async function handleResolve() {
    if (resolving) return;
    if (!confirm('ยืนยันว่าตอบเรียบร้อยแล้ว? แชทนี้จะถูกย้ายไปประวัติ')) return;
    setResolving(true);
    try {
      const convId = conversation.id;
      const now = new Date().toISOString();
      const resolvedAt = new Date();

      // Calculate response time from createdAt (or fallback to earliest message)
      const firstContactAt = conversation.createdAt || conversation.lastMessageAt;
      const responseTimeMs = firstContactAt
        ? resolvedAt.getTime() - new Date(firstContactAt).getTime()
        : null;

      // 1. Save minimal history record
      const historyRef = collection(db, `artifacts/${appId}/public/data/chat_history`);
      await addDoc(historyRef, {
        displayName: conversation.displayName || 'ไม่ทราบชื่อ',
        platform: conversation.platform,
        lastMessage: conversation.lastMessage || '',
        firstContactAt: firstContactAt || now,
        resolvedAt: now,
        resolvedBy: user?.email || user?.uid || 'unknown',
        responseTimeMs: responseTimeMs,
      });

      // 2. Delete all messages in subcollection
      const msgsRef = collection(db, `artifacts/${appId}/public/data/chat_conversations/${convId}/messages`);
      const msgsSnap = await getDocs(msgsRef);
      await Promise.all(msgsSnap.docs.map(d => deleteDoc(d.ref)));

      // 3. Delete the conversation document
      await deleteDoc(doc(db, `artifacts/${appId}/public/data/chat_conversations`, convId));

      // 4. Navigate back to list
      onBack();
    } catch (err) {
      alert(`เกิดข้อผิดพลาด: ${err.message}`);
    } finally {
      setResolving(false);
    }
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
        <button onClick={onBack} className="text-[var(--tx-muted)] hover:text-[var(--tx-heading)]"><ChevronLeft size={20} /></button>
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
        <button onClick={handleResolve} disabled={resolving}
          className="ml-auto px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold bg-green-600 hover:bg-green-500 text-white transition-all flex items-center gap-1 disabled:opacity-50 whitespace-nowrap">
          {resolving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
          <span className="hidden sm:inline">ตอบเรียบร้อยแล้ว</span>
          <span className="sm:hidden">เสร็จ</span>
        </button>
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
              <p className={`text-[9px] mt-1 ${m.isFromCustomer ? 'text-[var(--tx-muted)]' : 'text-white/60'}`}>{formatTime(m.timestamp)}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-[var(--bd)]">
        <div className="flex items-center gap-2">
          <input ref={inputRef} value={newMsg} onChange={e => setNewMsg(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="พิมพ์ข้อความ..." className="flex-1 bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-heading)] rounded-full px-4 py-2.5 outline-none text-sm focus:border-[var(--accent)]" />
          <button onClick={handleSend} disabled={!newMsg.trim() || sending}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white transition-all disabled:opacity-40"
            style={{ backgroundColor: platformColor }}>
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ChatPanel ────────────────────────────────────────────────────────

export default function ChatPanel({ db, appId, user }) {
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [chatConfig, setChatConfig] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all' | 'line' | 'facebook'

  // Listen to chat config
  useEffect(() => {
    const configRef = doc(db, `artifacts/${appId}/public/data/clinic_settings`, 'chat_config');
    return onSnapshot(configRef, snap => {
      setChatConfig(snap.data() || null);
    });
  }, [db, appId]);

  // Listen to conversations
  useEffect(() => {
    const convsRef = collection(db, `artifacts/${appId}/public/data/chat_conversations`);
    const q = query(convsRef, orderBy('lastMessageAt', 'desc'));
    return onSnapshot(q, snap => {
      const convs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setConversations(convs);
    });
  }, [db, appId]);

  // Listen to chat history (only when viewing)
  useEffect(() => {
    if (!showHistory) return;
    const histRef = collection(db, `artifacts/${appId}/public/data/chat_history`);
    const q = query(histRef, orderBy('resolvedAt', 'desc'), firestoreLimit(200));
    return onSnapshot(q, snap => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [showHistory, db, appId]);

  const lineUnread = conversations.filter(c => c.platform === 'line' && c.unreadCount > 0).reduce((s, c) => s + (c.unreadCount || 0), 0);
  const fbUnread = conversations.filter(c => c.platform === 'facebook' && c.unreadCount > 0).reduce((s, c) => s + (c.unreadCount || 0), 0);

  const filtered = filter === 'all' ? conversations : conversations.filter(c => c.platform === filter);

  const lineEnabled = chatConfig?.line?.enabled;
  const fbEnabled = chatConfig?.facebook?.enabled;
  const noPlatformConfigured = !lineEnabled && !fbEnabled;

  // ─── Settings view ─────────────────────────────────────────────────────
  if (showSettings) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <ConnectionSettings db={db} appId={appId} chatConfig={chatConfig} onBack={() => setShowSettings(false)} />
      </div>
    );
  }

  // ─── Chat detail view ─────────────────────────────────────────────────
  if (selectedConv) {
    return (
      <div className="h-[calc(100vh-180px)] min-h-[400px]">
        <ChatDetailView db={db} appId={appId} conversation={selectedConv} onBack={() => setSelectedConv(null)} user={user} />
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
            <button onClick={() => setFilter('all')}
              className={`text-[10px] font-bold px-2 py-1 rounded-full transition-all ${filter === 'all' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-hover)] text-[var(--tx-muted)]'}`}>
              ทั้งหมด {lineUnread + fbUnread > 0 && <span className="ml-0.5 bg-red-500 text-white text-[8px] px-1 rounded-full">{lineUnread + fbUnread}</span>}
            </button>
            {lineEnabled && (
              <button onClick={() => setFilter('line')}
                className={`text-[10px] font-bold px-2 py-1 rounded-full transition-all ${filter === 'line' ? 'text-white' : 'text-[var(--tx-muted)]'}`}
                style={filter === 'line' ? { backgroundColor: LINE_COLOR } : { backgroundColor: 'var(--bg-hover)' }}>
                LINE {lineUnread > 0 && <span className="ml-0.5 bg-red-500 text-white text-[8px] px-1 rounded-full">{lineUnread}</span>}
              </button>
            )}
            {fbEnabled && (
              <button onClick={() => setFilter('facebook')}
                className={`text-[10px] font-bold px-2 py-1 rounded-full transition-all ${filter === 'facebook' ? 'text-white' : 'text-[var(--tx-muted)]'}`}
                style={filter === 'facebook' ? { backgroundColor: FB_COLOR } : { backgroundColor: 'var(--bg-hover)' }}>
                FB {fbUnread > 0 && <span className="ml-0.5 bg-red-500 text-white text-[8px] px-1 rounded-full">{fbUnread}</span>}
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowHistory(!showHistory)}
            className={`p-2 rounded-lg border border-[var(--bd)] transition-colors ${showHistory ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-[var(--tx-heading)]'}`}
            title="ประวัติแชท">
            <History size={16} />
          </button>
          <button onClick={() => setShowSettings(true)}
            className="p-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-[var(--tx-heading)] transition-colors" title="ตั้งค่าการเชื่อมต่อ">
            <Settings size={16} />
          </button>
        </div>
      </div>

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
              {history.map(h => {
                const responseMin = h.responseTimeMs ? Math.round(h.responseTimeMs / 60000) : null;
                const platformColor = h.platform === 'line' ? LINE_COLOR : FB_COLOR;
                return (
                  <div key={h.id} className="p-3 rounded-xl bg-[var(--bg-hover)] border border-[var(--bd)]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: platformColor }}>
                          {(h.displayName || '?')[0]}
                        </div>
                        <span className="text-sm font-bold text-[var(--tx-heading)]">{h.displayName}</span>
                        <PlatformBadge platform={h.platform} />
                      </div>
                      <span className="text-[9px] text-[var(--tx-muted)]">
                        {h.resolvedAt ? new Date(h.resolvedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--tx-muted)] truncate mt-1.5 ml-9">{h.lastMessage}</p>
                    <div className="flex items-center gap-3 mt-1.5 ml-9 text-[10px] text-[var(--tx-muted)]">
                      <span>ตอบโดย: {h.resolvedBy}</span>
                      {responseMin !== null && (
                        <span className={`flex items-center gap-0.5 font-bold ${responseMin <= 5 ? 'text-green-500' : responseMin <= 30 ? 'text-yellow-500' : 'text-red-500'}`}>
                          <Clock size={10} />
                          {responseMin < 1 ? '< 1 นาที' : responseMin < 60 ? `${responseMin} นาที` : `${Math.floor(responseMin / 60)} ชม. ${responseMin % 60} นาที`}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Empty state / not configured */}
      {!showHistory && noPlatformConfigured && (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-full bg-[var(--bg-hover)] flex items-center justify-center mx-auto mb-4">
            <MessageCircle size={28} className="text-[var(--tx-muted)]" />
          </div>
          <h3 className="text-sm font-bold text-[var(--tx-heading)] mb-2">ยังไม่ได้เชื่อมต่อแพลตฟอร์ม</h3>
          <p className="text-xs text-[var(--tx-muted)] mb-4">เชื่อมต่อ LINE OA หรือ Facebook Page เพื่อรับแชทในที่เดียว</p>
          <button onClick={() => setShowSettings(true)}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-[var(--accent)] text-white hover:brightness-110 transition-all">
            <Settings size={14} className="inline mr-1" /> ตั้งค่าการเชื่อมต่อ
          </button>
        </div>
      )}

      {!showHistory && !noPlatformConfigured && filtered.length === 0 && (
        <div className="text-center py-12">
          <MessageCircle size={28} className="text-[var(--tx-muted)] mx-auto mb-3" />
          <p className="text-sm text-[var(--tx-muted)]">ยังไม่มีแชท</p>
          <p className="text-xs text-[var(--tx-muted)] mt-1">ข้อความจากลูกค้าจะแสดงที่นี่</p>
        </div>
      )}

      {/* Conversation list */}
      {!showHistory && filtered.length > 0 && (
        <div className="space-y-1">
          {filtered.map(conv => {
            const platformColor = conv.platform === 'line' ? LINE_COLOR : FB_COLOR;
            const hasUnread = conv.unreadCount > 0;
            return (
              <button key={conv.id} onClick={() => setSelectedConv(conv)}
                className={`w-full text-left flex items-center gap-3 p-3 rounded-xl transition-all hover:bg-[var(--bg-hover)] ${hasUnread ? 'bg-[var(--bg-hover)]' : ''}`}>
                {/* Avatar */}
                {conv.pictureUrl ? (
                  <img src={conv.pictureUrl} className="w-10 h-10 rounded-full object-cover flex-shrink-0" alt="" />
                ) : (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ backgroundColor: platformColor }}>
                    {(conv.displayName || '?')[0]}
                  </div>
                )}
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-sm truncate ${hasUnread ? 'font-bold text-[var(--tx-heading)]' : 'text-[var(--tx-heading)]'}`}>{conv.displayName}</span>
                    <PlatformBadge platform={conv.platform} />
                  </div>
                  <p className={`text-xs truncate ${hasUnread ? 'font-semibold text-[var(--tx-heading)]' : 'text-[var(--tx-muted)]'}`}>{conv.lastMessage}</p>
                </div>
                {/* Unread + time */}
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-[9px] text-[var(--tx-muted)]">
                    {conv.lastMessageAt ? new Date(conv.lastMessageAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                  {hasUnread && (
                    <span className="min-w-[18px] h-[18px] rounded-full text-white text-[9px] font-black flex items-center justify-center px-1" style={{ backgroundColor: platformColor }}>
                      {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Export unread counts for tab badge ──────────────────────────────────────

export function useChatUnread(db, appId) {
  const [lineUnread, setLineUnread] = useState(0);
  const [fbUnread, setFbUnread] = useState(0);

  useEffect(() => {
    const convsRef = collection(db, `artifacts/${appId}/public/data/chat_conversations`);
    return onSnapshot(convsRef, snap => {
      let lu = 0, fu = 0;
      snap.docs.forEach(d => {
        const data = d.data();
        const count = data.unreadCount || 0;
        if (count > 0) {
          if (data.platform === 'line') lu += count;
          else if (data.platform === 'facebook') fu += count;
        }
      });
      setLineUnread(lu);
      setFbUnread(fu);
    });
  }, [db, appId]);

  return { lineUnread, fbUnread, totalUnread: lineUnread + fbUnread };
}
