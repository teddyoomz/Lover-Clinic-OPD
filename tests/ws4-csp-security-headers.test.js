import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// vitest cwd = project root. (import.meta.url is an http:// URL under vite, so
// new URL('../x', import.meta.url) is NOT a file: URL — read from cwd instead.)
const root = process.cwd();

// ─── WS4 (2026-06-10) — Security headers + CSP hash-drift guard ───────────────
// The CSP script-src pins SHA-256 hashes of the 2 inline scripts in index.html
// (theme-flash + body.ready) instead of 'unsafe-inline' — real script-XSS
// protection. If anyone edits those inline scripts WITHOUT updating the hashes
// in vercel.json, the browser SILENTLY blocks them in prod (FOUC / app never
// flips to .ready). This test recomputes the hashes from index.html and asserts
// they're pinned in the CSP — drift fails the build, not prod.

function inlineScriptHashes(html) {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push('sha256-' + crypto.createHash('sha256').update(m[1], 'utf8').digest('base64'));
  return out;
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const headerBlock = (vercel.headers || []).find((h) => h.source === '/(.*)');
const headers = headerBlock?.headers || [];
const csp = headers.find((h) => h.key === 'Content-Security-Policy')?.value || '';

describe('WS4 — security headers + CSP', () => {
  it('vercel.json has a global headers block applied to all routes', () => {
    expect(headerBlock).toBeTruthy();
    expect(csp).toContain('default-src');
    expect(csp).toContain('script-src');
  });

  it('every inline <script> in index.html is hash-pinned in the CSP (no drift)', () => {
    const hashes = inlineScriptHashes(html);
    expect(hashes.length).toBeGreaterThanOrEqual(2);
    for (const h of hashes) expect(csp).toContain(`'${h}'`);
  });

  it('CSP keeps the hardening invariants (no unsafe-eval; script-src has no unsafe-inline; clickjacking + plugin locks)', () => {
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain("'unsafe-eval'");
    const scriptSrc = csp.match(/script-src([^;]*)/)?.[1] || '';
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it('CSP allows the Firebase origins the app actually uses (L1-verified non-breaking)', () => {
    expect(csp).toContain('https://*.googleapis.com');
    expect(csp).toContain('https://*.firebasestorage.app');
    expect(csp).toContain('https://*.cloudfunctions.net');
  });

  it('the 6 baseline security headers are present', () => {
    const keys = headers.map((h) => h.key);
    for (const k of [
      'Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options',
      'Referrer-Policy', 'Permissions-Policy', 'X-DNS-Prefetch-Control',
    ]) {
      expect(keys).toContain(k);
    }
    expect(headers.find((h) => h.key === 'X-Content-Type-Options')?.value).toBe('nosniff');
    expect(headers.find((h) => h.key === 'Permissions-Policy')?.value).toContain('camera=()');
  });
});
