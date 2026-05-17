// src/components/staffchat/StaffChatRoleBadge.jsx
// V82 (2026-05-17) — Role badge for staff chat sender identity.
// Renders a gradient circle with a Lucide icon mapped from the per-device
// role stored in localStorage via staffChatIdentity.ROLE_KEYS.
//
// Two sizes:
//   - 'lg' (40px outer / 22px icon) — used in NamePicker role-picker grid
//   - 'sm' (16px outer / 10px icon) — used inline next to display name in
//     message bubbles (StaffChatMessage)
//
// Returns null for absent/invalid roles so legacy V73 messages (pre-V82,
// no role field) render cleanly without a hollow placeholder.
//
// Rule of 3 / AV76: single source of truth for role → icon + gradient
// mapping. Both consumers (NamePicker grid + Message bubble) MUST import
// from this component — no inline duplication elsewhere.
import React from 'react';
import { Stethoscope, HandHeart, Headset, Crown } from 'lucide-react';
import { ROLE_KEYS } from '../../lib/staffChatIdentity.js';

const ROLE_GRADIENTS = Object.freeze({
  doctor: 'linear-gradient(135deg, #3b82f6, #2563eb)',
  assistant: 'linear-gradient(135deg, #14b8a6, #0d9488)',
  staff: 'linear-gradient(135deg, #f59e0b, #d97706)',
  manager: 'linear-gradient(135deg, #ef4444, #b91c1c)',
});

const ROLE_ICONS = Object.freeze({
  doctor: Stethoscope,
  assistant: HandHeart,
  staff: Headset,
  manager: Crown,
});

const SIZE_MAP = Object.freeze({
  lg: { outer: 40, icon: 22 },
  sm: { outer: 16, icon: 10 },
});

export function StaffChatRoleBadge({ role, size = 'sm' }) {
  if (!role || typeof role !== 'string' || !ROLE_KEYS.includes(role)) {
    return null;
  }
  const sizeKey = size === 'lg' ? 'lg' : 'sm';
  const { outer, icon: iconPx } = SIZE_MAP[sizeKey];
  const Icon = ROLE_ICONS[role];
  const gradient = ROLE_GRADIENTS[role];
  return (
    <span
      data-testid={`staff-chat-role-badge-${sizeKey}-${role}`}
      data-role={role}
      data-size={sizeKey}
      title={role}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${outer}px`,
        height: `${outer}px`,
        borderRadius: '9999px',
        background: gradient,
        color: '#ffffff',
        flexShrink: 0,
      }}
    >
      <Icon size={iconPx} strokeWidth={2.2} />
    </span>
  );
}

export default StaffChatRoleBadge;
