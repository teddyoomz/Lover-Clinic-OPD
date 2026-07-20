// ─── LineFriendPickerModal — LINE Friend Picker (2026-07-20) ────────────────
// Shared real-time picker used by BOTH surfaces (กัน V12 sibling-drift):
//   1. InfraHealthSection — mode='pick': fill a lineTargets row (การ์ดสุขภาพ)
//   2. LinkLineInstructionsModal — mode='bind': link a customer (confirm-first;
//      the PARENT executes the actual /api/admin/line-friends bind call)
//
// Real-time contract (user directive): "แอดปุ๊ป หรือทักปุ๊ป แสดงชื่อปั๊บในลิส
// แบบไม่ต้อง refresh อะไรเลย ... แม้เปิดเมนูลิสต์รายชื่อค้างไว้" — two live
// onSnapshot listeners (be_line_friends + chat_conversations, branch-scoped)
// merged via mergeFriendRoster; the Followers-API backfill endpoint is fired
// once per open+branch and feeds the SAME listener path (single data source).
// AV78 explicit-close · useModalScrollLock (AV205) · no red on names (04-thai-ui).
import { useState, useEffect, useMemo, useRef } from 'react';
import { X, Search, Users, Loader2, MessageCircle, UserPlus, ListChecks } from 'lucide-react';
import {
  listenToLineFriendsByBranch,
  listenToChatConversationsByBranch,
  listBranches,
} from '../../lib/scopedDataLayer.js';
import { resolveSelectedBranchId } from '../../lib/branchSelection.js';
import { mergeFriendRoster, searchRoster } from '../../lib/lineFriendRoster.js';
import { auth } from '../../firebase.js';
import { useModalScrollLock } from '../../lib/useModalScrollLock.js';

const SOURCE_BADGE = {
  chat: { label: 'เคยทัก', cls: 'bg-emerald-900/25 text-emerald-300 border-emerald-700/50', Icon: MessageCircle },
  follow: { label: 'เพื่อนใหม่', cls: 'bg-purple-900/25 text-purple-300 border-purple-700/50', Icon: UserPlus },
  'followers-api': { label: 'ผู้ติดตาม', cls: 'bg-sky-900/25 text-sky-300 border-sky-700/50', Icon: ListChecks },
};

function Avatar({ row }) {
  if (row.pictureUrl) {
    return <img src={row.pictureUrl} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" referrerPolicy="no-referrer" />;
  }
  const initial = String(row.displayName || row.lineUserId || '?').trim().charAt(0) || '?';
  return (
    <div className="w-9 h-9 rounded-full bg-amber-900/40 text-amber-200 flex items-center justify-center text-sm font-bold flex-shrink-0">
      {initial}
    </div>
  );
}

export default function LineFriendPickerModal({
  open = false, branchId = '', mode = 'pick', customer = null, onPick, onClose,
}) {
  useModalScrollLock(open);
  const [selectedBranch, setSelectedBranch] = useState(() => branchId || resolveSelectedBranchId() || '');
  const [branches, setBranches] = useState([]);
  const [friends, setFriends] = useState(null);   // null = loading
  const [convs, setConvs] = useState(null);
  const [q, setQ] = useState('');
  const [confirmRow, setConfirmRow] = useState(null);
  const backfilledRef = useRef(new Set()); // branchIds already backfilled this open

  // Re-arm when opened (fresh branch default + clear search/confirm)
  useEffect(() => {
    if (!open) return;
    setSelectedBranch(branchId || resolveSelectedBranchId() || '');
    setQ('');
    setConfirmRow(null);
    backfilledRef.current = new Set();
  }, [open, branchId]);

  // Branch dropdown options (universal read)
  useEffect(() => {
    if (!open) return;
    let dead = false;
    listBranches().then(list => { if (!dead) setBranches(Array.isArray(list) ? list : []); }).catch(() => {});
    return () => { dead = true; };
  }, [open]);

  // Two real-time listeners — the ONLY render data path (backfill feeds them)
  useEffect(() => {
    if (!open || !selectedBranch) return undefined;
    setFriends(null);
    setConvs(null);
    const unsubFriends = listenToLineFriendsByBranch(
      { branchId: selectedBranch },
      (list) => setFriends(list),
      () => setFriends([]),
    );
    const unsubConvs = listenToChatConversationsByBranch(
      { branchId: selectedBranch },
      (list) => setConvs(list),
      () => setConvs([]),
    );
    return () => { unsubFriends?.(); unsubConvs?.(); };
  }, [open, selectedBranch]);

  // Followers-API backfill — once per open+branch, best-effort (result arrives
  // through the be_line_friends listener; a 403/unverified OA is silent).
  useEffect(() => {
    if (!open || !selectedBranch) return;
    if (backfilledRef.current.has(selectedBranch)) return;
    backfilledRef.current.add(selectedBranch);
    (async () => {
      try {
        const idToken = await auth.currentUser?.getIdToken?.();
        await fetch('/api/admin/line-friends', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken || ''}` },
          body: JSON.stringify({ action: 'list', branchId: selectedBranch }),
        });
      } catch { /* best-effort — live sources still render */ }
    })();
  }, [open, selectedBranch]);

  const rows = useMemo(
    () => searchRoster(mergeFriendRoster({ friends: friends || [], conversations: convs || [] }), q),
    [friends, convs, q],
  );
  const loading = friends === null && convs === null;

  if (!open) return null;

  const handleSelect = (row) => {
    if (mode === 'bind') { setConfirmRow(row); return; }
    onPick?.(row);
    onClose?.();
  };

  const branchName = branches.find(b => b.id === selectedBranch)?.name || selectedBranch;

  return (
    // AV78 (2026-07-20): backdrop click does NOT close — explicit close only (X / ยกเลิก)
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-start justify-center p-4 overflow-y-auto overscroll-contain" data-testid="line-friend-picker-modal">
      <div className="bg-[var(--bg-base)] rounded-xl shadow-2xl w-full max-w-md my-4 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between gap-2 p-4 border-b border-[var(--bd)]">
          <div className="flex items-center gap-2 min-w-0">
            <Users size={18} style={{ color: 'var(--accent-line, #06C755)' }} className="flex-shrink-0" />
            <h3 className="text-base font-bold text-[var(--tx-heading)] truncate">
              เลือกจากรายชื่อเพื่อน LINE{branchName ? ` — ${branchName}` : ''}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--bg-hover)]" aria-label="ปิด">
            <X size={18} />
          </button>
        </div>

        <div className="p-3 flex gap-2 border-b border-[var(--bd)]">
          <div className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)]">
            <Search size={13} className="text-[var(--tx-muted)] flex-shrink-0" />
            <input
              data-testid="lf-search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="ค้นหาชื่อ หรือ User ID…"
              className="flex-1 bg-transparent text-sm text-[var(--tx-primary)] outline-none min-w-0"
            />
          </div>
          <select
            data-testid="lf-branch-select"
            value={selectedBranch}
            onChange={e => setSelectedBranch(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] max-w-[140px]"
          >
            {!branches.some(b => b.id === selectedBranch) && selectedBranch ? (
              <option value={selectedBranch}>{selectedBranch}</option>
            ) : null}
            {branches.map(b => <option key={b.id} value={b.id}>{b.name || b.id}</option>)}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-[var(--tx-muted)] text-sm" data-testid="lf-loading">
              <Loader2 size={16} className="animate-spin" /> กำลังโหลดรายชื่อ…
            </div>
          )}
          {!loading && rows.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-[var(--tx-muted)] leading-relaxed" data-testid="lf-empty">
              ยังไม่มีรายชื่อ — ให้ลูกค้า<b>แอดเพื่อน</b>หรือ<b>ทักแชท</b> LINE OA ของสาขานี้
              แล้วชื่อจะโผล่ที่นี่ทันทีโดยไม่ต้องรีเฟรช
            </div>
          )}
          {rows.map(row => {
            const badge = SOURCE_BADGE[row.source] || SOURCE_BADGE.follow;
            return (
              <div
                key={row.lineUserId}
                data-testid={`lf-row-${row.lineUserId}`}
                className={`flex items-center gap-2.5 p-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] ${row.unfollowed ? 'opacity-50' : ''}`}
              >
                <Avatar row={row} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[var(--tx-primary)] truncate">{row.displayName || row.lineUserId}</div>
                  <div className="text-[10px] text-[var(--tx-muted)] font-mono truncate">{row.lineUserId}</div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 inline-flex items-center gap-1 ${badge.cls}`}>
                  <badge.Icon size={10} /> {badge.label}
                </span>
                {row.unfollowed && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--bd)] text-[var(--tx-muted)] flex-shrink-0">
                    เลิกติดตาม
                  </span>
                )}
                <button
                  data-testid={`lf-pick-${row.lineUserId}`}
                  onClick={() => handleSelect(row)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex-shrink-0 active:scale-95"
                  style={{ backgroundColor: '#dc2626' }}
                >
                  เลือก
                </button>
              </div>
            );
          })}
        </div>

        <div className="px-4 py-2 border-t border-[var(--bd)] text-[10px] text-[var(--tx-muted)]">
          แหล่ง: แชทที่เคยทัก (สด) + คนแอดใหม่ (สด) + รายชื่อผู้ติดตามทั้งหมด (เฉพาะ OA แบบ verified)
        </div>
      </div>

      {confirmRow && (
        // AV78: confirm backdrop no-close
        <div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4 overflow-y-auto overscroll-contain" data-testid="lf-confirm-bind">
          <div className="bg-[var(--bg-base)] rounded-xl shadow-2xl w-full max-w-sm p-4">
            <h4 className="text-base font-bold text-[var(--tx-heading)] mb-2">ยืนยันผูกบัญชี LINE</h4>
            <p className="text-sm text-[var(--tx-primary)] mb-1">
              ผูก <b className="text-emerald-300">{confirmRow.displayName || confirmRow.lineUserId}</b>
              <span className="font-mono text-xs text-[var(--tx-muted)]"> ({confirmRow.lineUserId.slice(0, 10)}…)</span>
            </p>
            <p className="text-sm text-[var(--tx-primary)] mb-4">
              กับลูกค้า <b className="text-amber-200">{customer?.customerName || customer?.name || '-'}
              {customer?.customerHN ? ` · HN ${customer.customerHN}` : ''}</b> ?
            </p>
            <div className="flex justify-end gap-2">
              <button
                data-testid="lf-confirm-cancel-btn"
                onClick={() => setConfirmRow(null)}
                className="px-3 py-1.5 rounded-lg text-xs bg-neutral-700 text-white"
              >
                ยกเลิก
              </button>
              <button
                data-testid="lf-confirm-bind-btn"
                onClick={() => { const row = confirmRow; setConfirmRow(null); onPick?.(row); }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                style={{ backgroundColor: '#dc2626' }}
              >
                ยืนยันผูก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
