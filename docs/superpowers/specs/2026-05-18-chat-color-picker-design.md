# V73 Chat Color Picker — Design Spec

**Date**: 2026-05-18
**Status**: Approved by user, proceeding to implementation
**Origin**: User asked "เลือกสีชื่อ และสี bubble แชทของตัวเองได้ด้วย เพื่อความจำง่ายและเร็วขึ้นสำหรับผู้อ่าน" + redirected D1 to free-hex with UI picker.

## Goal

Each staff chat device picks its own color to identify itself. Other readers see the sender's chosen color on the sender name label + message bubble tint, making messages from different staff visually distinguishable at a glance — easier and faster cognitive parsing.

## Locked Design Decisions

### D1. Free hex color picker (native `<input type="color">`)

User specified free hex with UI picker. Use native HTML5 `<input type="color">` — gives the browser's built-in color picker UI on click, returns `#RRGGBB` hex string. Works in all evergreen browsers + Safari + mobile.

Storage: `localStorage.staffChatColor = '#FF5555'` (or default `'#E11D48'` = rose-600 to match prior own-message color on first install).

No client-side contrast clamp. User picks responsibly. (Trade-off accepted: user might pick black-on-black; they can re-pick.)

### D2. ONE color per device, applies to BOTH name + bubble

User picks one hex → both the sender-name label AND the message bubble tint use that color. Implementation:

- **Name label** (above bubble): `color: <hex>` — full saturation, bold
- **Bubble background**: `<hex>` at 20% alpha — `rgba(R, G, B, 0.20)` computed inline
- **Bubble border**: `<hex>` at 40% alpha — slightly stronger for definition

### D3. Color embedded in each outgoing message Firestore doc

Each `be_staff_chat_messages` doc gains optional `senderColor: '#RRGGBB'` field. Senders include their current localStorage color in every outgoing message. Receivers render with the sender's stored color regardless of their own picker. Past messages without `senderColor` field fall back to defaults:

- own message (matched deviceId) → rose `#E11D48`
- other message → sky `#0EA5E9`

Firestore rules `be_staff_chat_messages` already allows arbitrary additional fields (only validates branchId / displayName / deviceId / text-or-attachment). No rule deploy needed.

### D4. UI placement — color input inside existing NamePicker modal

`StaffChatNamePicker.jsx` already opens in two modes (first-send + edit per the 2026-05-18 name-edit feature). Add a color row above or below the name input:

```
┌──────────────────────────────┐
│ ตั้งชื่อในแชท                │
│                              │
│ พิมพ์ชื่อที่จะปรากฏ...        │
│                              │
│ [text input: name]           │
│                              │
│ สีของฉันในแชท                │
│ [color input swatch] #RRGGBB │
│                              │
│ [ยกเลิก]  [บันทึก]            │
└──────────────────────────────┘
```

In edit mode (`isEdit`), color input pre-fills with current localStorage value. Save action persists BOTH name + color to localStorage (single transaction at confirm-name-edit time).

For the FIRST-SEND case (no name yet), the color input defaults to rose `#E11D48`. User can change before clicking Save.

## Architecture

### Storage layer (`src/lib/staffChatIdentity.js`)

NEW exports:
- `getColor()` → returns `'#XXXXXX'` from localStorage, default `'#E11D48'` if unset
- `setColor(hex)` → validates `/^#[0-9a-fA-F]{6}$/`, persists to `localStorage.staffChatColor`, throws `STAFF_CHAT_COLOR_INVALID` on bad hex

### Message-build layer (`src/lib/staffChatClient.js`)

`buildMessageDoc` accepts new optional `senderColor` param. When present + matches `/^#[0-9a-fA-F]{6}$/`, includes in returned doc. Otherwise omits (Firestore-undefined-safe).

### Hook layer (`src/hooks/useStaffChat.js`)

- `send()` includes current `getColor()` in the payload passed to `buildMessageDoc`
- `confirmName(name, color?)` — extended to accept optional `color` param; persists both via setDisplayName + setColor in single sync write
- Hook returns `currentColor` (reactive state) to widget for prop-down to NamePicker

### Display layer (`src/components/staffchat/StaffChatMessage.jsx`)

```jsx
const senderColor = message.senderColor || (isOwn ? '#E11D48' : '#0EA5E9');
const nameStyle = { color: senderColor };
const bubbleStyle = {
  backgroundColor: hexToRgba(senderColor, 0.20),
  borderColor: hexToRgba(senderColor, 0.40),
  color: senderColor,
};
```

`hexToRgba(hex, alpha)` — pure helper in `src/lib/staffChatColor.js`. Parses `#RRGGBB` → `rgba(R, G, B, alpha)`. Returns transparent black on parse failure (defensive).

### UI layer (`src/components/staffchat/StaffChatNamePicker.jsx`)

```jsx
const [color, setColor] = useState(initialColor || '#E11D48');
// ... existing name state ...
<input
  type="color"
  value={color}
  onChange={(e) => setColor(e.target.value)}
  data-testid="staff-chat-name-picker-color"
/>
<span className="text-xs font-mono">{color.toUpperCase()}</span>
// onConfirm now passes (name, color)
```

## Data Flow

1. User clicks `👤 <name> ✏️` chip in chat header → `chat.openNameEdit()` → reads current `getColor()` → passes to NamePicker as `initialColor` prop
2. Modal renders with native color picker pre-filled
3. User changes color → clicks Save → `onConfirm(name, color)` → hook's `confirmName(name, color)` → `setDisplayName(name) + setColor(color)` → localStorage updated → hook state `currentColor` updated → re-render
4. User sends a message → `send(text)` → reads `getColor()` → `buildMessageDoc({..., senderColor: color})` → Firestore write
5. All connected devices' onSnapshot fires → `StaffChatMessage` renders bubble with `style.backgroundColor = hexToRgba(message.senderColor || default, 0.20)` + name with `style.color = message.senderColor || default`

## Testing

### Pure helper tests (`tests/v73-color-picker.test.js`)

- `hexToRgba` parses valid hex correctly (3-byte → rgba)
- `hexToRgba` returns transparent black on invalid input
- `getColor` / `setColor` localStorage round-trip
- `setColor` throws on invalid hex format
- `buildMessageDoc` includes senderColor when valid, omits when invalid

### Source-grep regression (in same test file)

- NamePicker renders `<input type="color">`
- StaffChatMessage applies senderColor to both name + bubble style
- useStaffChat.send threads senderColor through buildMessageDoc

### RTL tests (`tests/v73-color-picker-rtl.test.jsx`)

- Color input renders + accepts hex change
- Save persists both name + color to localStorage
- Past message (no senderColor) renders with default rose/sky fallback
- New message with senderColor renders with custom color in bubble style

## Iron-clad rule compliance

- **Rule C2** (security): no Math.random for ids — color field is user input, no security implication
- **Rule J** (brainstorming HARD-GATE): design approved by user before any code
- **Rule I** (full-flow simulate): RTL test chains pick → send → other device renders → matches expected color
- **Rule N** (test scope): targeted-test-only for this small feature; full vitest at end-of-batch
- **Rule Q** (real-adversarial): Rule Q L1 live preview verification before claiming verified — set color in localStorage, send message, verify on Firestore + UI

## Out of scope (deferred)

- Separate name color vs bubble color (user explicitly merged)
- Contrast clamp / WCAG warning (user accepted free hex risk)
- Migration of past messages to add senderColor (immutable per V73 rules; defaults are sufficient)
- Color-blind-friendly mode

## Verification gate before claiming done (Rule Q)

1. Vitest helper + RTL tests 100% pass
2. Full vitest suite green
3. Build clean
4. Live preview: open chat → edit name → pick non-default color → save → send message → message bubble + name render in chosen color → reload → still rendered with chosen color (Firestore round-trip verified) → SECOND device sees the same color
