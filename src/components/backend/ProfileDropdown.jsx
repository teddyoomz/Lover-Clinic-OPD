// ─── ProfileDropdown — top-right backend toolbar (2026-05-04) ───────────────
// User directive: "Tab login มีแค่รูป profile กดมาแล้วเป็น dropdown ให้เลือก
// ออกจากระบบอย่างเดียวพอ" (profile picture only; click → dropdown with only
// "Logout"). Sits next to ThemeToggle in BackendDashboard top-right.
//
// Behaviour:
//   - Avatar circle: Firebase user.photoURL → fallback gradient + initial
//     letter from email/displayName.
//   - Click → open dropdown anchored bottom-right of avatar.
//   - Single menu item: "ออกจากระบบ" — fires firebase/auth `signOut(auth)`.
//   - Click outside / Esc → close.
//   - Defensive: if no auth user (anon / signed-out), render nothing.
//
// Iron-clad refs:
//   - Rule of 3 (C1): dropdown pattern reused from CmdPalette / nav menus
//   - V31 silent-swallow lock: signOut errors surface via setError state
//   - Thai cultural rule (04-thai-ui): no red on user name; rose only on
//     hover for the logout action (action-color, not identity-color)

import { useEffect, useRef, useState, useCallback } from 'react';
import { LogOut } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase.js';
import { useUserPermission } from '../../contexts/UserPermissionContext.jsx';

/** Pick the best display label for the avatar tooltip. */
function pickDisplayLabel(user) {
  if (!user) return '';
  return user.displayName || user.email || user.uid || '';
}

/** Pick a single uppercase initial for the fallback avatar. */
function pickInitial(user) {
  const label = pickDisplayLabel(user);
  if (!label) return '?';
  // First non-whitespace letter, uppercased.
  const first = label.trim().charAt(0);
  return first ? first.toUpperCase() : '?';
}

export default function ProfileDropdown() {
  const { user, groupName } = useUserPermission();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');
  const wrapRef = useRef(null);

  // Click-outside + Esc to close.
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleLogout = useCallback(async () => {
    setError('');
    setSigningOut(true);
    try {
      await signOut(auth);
      // App-level auth listener will redirect to login screen automatically.
      setOpen(false);
    } catch (e) {
      // V31: surface error explicitly — no silent swallow.
      setError(e?.message || 'ออกจากระบบไม่สำเร็จ');
    } finally {
      setSigningOut(false);
    }
  }, []);

  // No user (anon / signed-out / loading) → render nothing.
  if (!user) return null;

  const displayLabel = pickDisplayLabel(user);
  const initial = pickInitial(user);
  const photoURL = user.photoURL || '';

  return (
    <div ref={wrapRef} className="relative" data-testid="profile-dropdown">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center w-8 h-8 rounded-full overflow-hidden border border-[var(--bd)] bg-[var(--bg-hover)] hover:border-[var(--tx-heading)] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition-colors"
        title={displayLabel}
        aria-label={`เมนูผู้ใช้ ${displayLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="profile-dropdown-trigger"
      >
        {photoURL ? (
          <img
            src={photoURL}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <span
            className="w-full h-full flex items-center justify-center text-xs font-bold text-white bg-gradient-to-br from-emerald-600 to-sky-700"
            aria-hidden
          >
            {initial}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 z-50 min-w-[180px] rounded-lg border border-[var(--bd)] bg-[var(--bg-card)] shadow-xl py-1"
          role="menu"
          aria-label="เมนูผู้ใช้"
          data-testid="profile-dropdown-menu"
        >
          {/* Header: identity (read-only) — name/group not red per Thai rule */}
          <div className="px-3 py-2 border-b border-[var(--bd)] text-xs">
            <div className="font-medium text-[var(--tx-heading)] truncate" title={displayLabel}>
              {displayLabel}
            </div>
            {groupName && (
              <div className="text-[var(--tx-secondary)] truncate text-[10px] mt-0.5">
                {groupName}
              </div>
            )}
          </div>
          {/* Logout — single action per directive */}
          <button
            type="button"
            onClick={handleLogout}
            disabled={signingOut}
            className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 text-[var(--tx-primary)] hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-50 disabled:cursor-not-allowed"
            role="menuitem"
            data-testid="profile-dropdown-logout"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden />
            <span>{signingOut ? 'กำลังออกจากระบบ…' : 'ออกจากระบบ'}</span>
          </button>
          {error && (
            <div
              className="px-3 py-1.5 text-[10px] text-rose-500"
              role="alert"
              data-testid="profile-dropdown-error"
            >
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
