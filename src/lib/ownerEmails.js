// ─── OWNER_EMAILS — pre-approved owner accounts (V27-bis, 2026-04-26) ─────
//
// Hardcoded allowlist of clinic OWNER email addresses. These accounts get:
//
//   1. SOFT-GATE bootstrap (UserPermissionContext): isAdmin = true even
//      without a be_staff doc OR @loverclinic.com email — enables the
//      backend sidebar to render their tabs.
//
//   2. HARD-GATE bootstrap (api/admin/bootstrap-self): can call genesis
//      admin grant WITHOUT the "no other admin exists" check. Owners are
//      pre-approved — multi-owner clinics need this.
//
// Use cases:
//   - Owner uses Google Sign-In with personal email (not @loverclinic.com)
//   - Multi-owner clinics where each partner has their own email
//
// Maintenance:
//   - Update this list when ownership changes
//   - The matching list in api/admin/bootstrap-self.js (OWNER_EMAILS const)
//     MUST be kept in sync — Vercel serverless can't easily import from
//     src/ across the build boundary, so we duplicate. Audit grep:
//     `grep -n "OWNER_EMAILS" src/lib/ownerEmails.js api/admin/bootstrap-self.js`
//
// NOTE: Adding an email here grants powerful admin access. It is BY
// DESIGN a code-change-required action — moving to env var would
// reduce friction but also reduce the audit trail.

export const OWNER_EMAILS = [
  'oomz.peerapat@gmail.com',
];

// Lowercased lookup helper — emails are case-insensitive per RFC 5321
export function isOwnerEmail(email) {
  if (!email) return false;
  return OWNER_EMAILS.includes(String(email).toLowerCase());
}
