/**
 * formatPhoneForTel — normalize a phone-number string to a `tel:` URI for mobile dial-out.
 *
 * Returns:
 *   - `tel:0812345678` (Thai mobile, 10 digits)
 *   - `tel:+66812345678` (international with leading +)
 *   - null when input is empty / non-string / has fewer than 9 digits (invalid phone)
 *
 * Rules:
 *   - Preserve a leading `+` if present (international dial)
 *   - Strip every other non-digit (spaces, dashes, parentheses, dots)
 *   - Minimum 9 digits required (Thai landlines = 9; mobile = 10; international ≥ 9)
 *
 * Why a helper: keeps every PhoneLink call-site honest about what counts as a real
 * phone number, and lets tests lock the contract once.
 */
export function formatPhoneForTel(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^0-9]/g, '');
  if (digits.length < 9) return null;
  return `tel:${hasPlus ? '+' : ''}${digits}`;
}
