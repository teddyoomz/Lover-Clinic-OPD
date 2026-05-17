import React from 'react';
import { formatPhoneForTel } from '../lib/phoneLink.js';

/**
 * PhoneLink — tappable phone-number link for one-tap dial-out on mobile.
 *
 * Wraps the rendered phone string in `<a href="tel:...">` when the value
 * parses as a valid phone (≥ 9 digits after stripping non-numerics, leading
 * `+` preserved). Falls back to a plain `<span>` when the value is invalid
 * or a placeholder like `'-'`, so display text is preserved exactly.
 *
 * Usage:
 *   <PhoneLink value={c.phone} className="font-mono" />
 *   <PhoneLink value={fullText} className="...">{fullText}</PhoneLink>
 *
 * `value` drives the `tel:` href. `children` (or `value` if no children)
 * is what gets rendered. They can differ: a callsite that has a
 * country-code-formatted display like `+66 081-234-5678` passes that
 * string as both — the helper still derives the dial-string correctly.
 *
 * The link inherits parent color/styling so it blends with existing layouts
 * (no forced blue underline). Mobile browsers auto-launch the dialer on tap;
 * desktop browsers open the configured handler (FaceTime / Phone Link / etc.).
 */
export default function PhoneLink({ value, children, className = '', ariaLabel, ...rest }) {
  const tel = formatPhoneForTel(value);
  const display = children !== undefined ? children : value;
  if (!tel) {
    return <span className={className} {...rest}>{display}</span>;
  }
  return (
    <a
      href={tel}
      className={`${className} hover:underline cursor-pointer`.trim()}
      aria-label={ariaLabel || `โทรหา ${value}`}
      data-testid="phone-link"
      onClick={(e) => e.stopPropagation()}
      {...rest}
    >
      {display}
    </a>
  );
}
