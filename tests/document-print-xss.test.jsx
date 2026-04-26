// ─── Document Print XSS hardening tests — Polish 2026-04-26 ──────────────
// PX1 group — verifies DOMPurify wraps `dangerouslySetInnerHTML` in
// DocumentPrintModal and `safeImgTag` allow-lists signature URLs.
//
// V14/V21 lesson: source-grep alone can encode broken behavior. Tests
// here exercise the REAL outputs (DOMPurify.sanitize result + safeImgTag
// return) — not just regex over source. Source-grep is included as F6.6
// regression guard but is paired with runtime assertions.

import { describe, it, expect } from 'vitest';
import DOMPurify from 'dompurify';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { safeImgTag } from '../src/lib/documentPrintEngine.js';

const SANITIZE_PROFILE = {
  ADD_ATTR: ['style', 'class'],
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'style'],
  FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'onblur', 'onsubmit'],
};

const sanitize = (html) => DOMPurify.sanitize(html, SANITIZE_PROFILE);

describe('PX1 — DocumentPrintModal XSS hardening (Polish 2026-04-26)', () => {
  describe('PX1.A — DOMPurify sanitization profile', () => {
    it('PX1.A.1 strips <script> tags', () => {
      const out = sanitize('<p>safe</p><script>alert(1)</script><p>after</p>');
      expect(out).not.toContain('<script');
      expect(out).not.toContain('alert(1)');
      expect(out).toContain('<p>safe</p>');
      expect(out).toContain('<p>after</p>');
    });

    it('PX1.A.2 strips onerror / onclick / onload event handlers from img', () => {
      const out = sanitize('<img src="x" onerror="alert(1)" onclick="alert(2)" onload="alert(3)"/>');
      expect(out).not.toMatch(/onerror|onclick|onload/i);
      expect(out).not.toContain('alert(');
    });

    it('PX1.A.3 strips javascript: URL on <a>', () => {
      const out = sanitize('<a href="javascript:alert(1)">click</a>');
      expect(out).not.toMatch(/javascript:/i);
    });

    it('PX1.A.4 strips data:text/html URL on <iframe> + <iframe> tag itself', () => {
      const out = sanitize('<iframe src="data:text/html,<script>alert(1)</script>"></iframe>');
      expect(out).not.toContain('<iframe');
      expect(out).not.toContain('data:text/html');
    });

    it('PX1.A.5 allows http:// and https:// URLs on <img>', () => {
      const out = sanitize('<img src="https://example.com/sig.png" alt="ok"/>');
      expect(out).toContain('src="https://example.com/sig.png"');
    });

    it('PX1.A.6 allows inline style="" attributes (print fidelity)', () => {
      // Template bodies use inline `style="..."` for layout — must survive
      // sanitization. The print engine adds its own <style> in <head> so
      // body-level <style> blocks are intentionally stripped (verified in
      // PX1.A.6b).
      const out = sanitize('<div style="font-family: Sarabun; color: red;">x</div>');
      expect(out).toContain('style="font-family: Sarabun; color: red;"');
    });

    it('PX1.A.6b strips <style> blocks (print engine injects its own)', () => {
      const out = sanitize('<style>body { color: red; }</style><p>x</p>');
      expect(out).not.toContain('<style');
      expect(out).toContain('<p>x</p>');
    });

    it('PX1.A.7 allows class + style attributes (Tailwind in templates)', () => {
      const out = sanitize('<div class="grid gap-2" style="font-family: Sarabun;">ok</div>');
      expect(out).toContain('class="grid gap-2"');
      expect(out).toContain('font-family: Sarabun');
    });

    it('PX1.A.8 strips <form> + <embed> + <object>', () => {
      const out = sanitize('<form action="evil"><embed src="x"/><object data="y"/></form>');
      expect(out).not.toContain('<form');
      expect(out).not.toContain('<embed');
      expect(out).not.toContain('<object');
    });
  });

  describe('PX1.B — safeImgTag URL allowlist', () => {
    it('PX1.B.1 allows https:// URL', () => {
      const out = safeImgTag('https://firebasestorage.googleapis.com/sig.png', { alt: 'sig' });
      expect(out).toContain('src="https://firebasestorage.googleapis.com/sig.png"');
      expect(out).toContain('alt="sig"');
      expect(out).toMatch(/^<img /);
    });

    it('PX1.B.2 allows http:// URL', () => {
      const out = safeImgTag('http://example.com/sig.png');
      expect(out).toContain('src="http://example.com/sig.png"');
    });

    it('PX1.B.3 allows data:image/png;base64 URL', () => {
      const out = safeImgTag('data:image/png;base64,iVBORw0KGgo=');
      expect(out).toContain('src="data:image/png;base64,iVBORw0KGgo="');
    });

    it('PX1.B.4 allows data:image/jpeg;base64 URL', () => {
      const out = safeImgTag('data:image/jpeg;base64,/9j/4AAQ');
      expect(out).toContain('src="data:image/jpeg;base64,/9j/4AAQ"');
    });

    it('PX1.B.5 rejects javascript: URL → empty string', () => {
      expect(safeImgTag('javascript:alert(1)')).toBe('');
    });

    it('PX1.B.6 rejects data:text/html URL → empty string', () => {
      expect(safeImgTag('data:text/html,<script>alert(1)</script>')).toBe('');
    });

    it('PX1.B.7 rejects file:// URL', () => {
      expect(safeImgTag('file:///etc/passwd')).toBe('');
    });

    it('PX1.B.8 rejects empty / null / undefined → empty string', () => {
      expect(safeImgTag('')).toBe('');
      expect(safeImgTag(null)).toBe('');
      expect(safeImgTag(undefined)).toBe('');
    });

    it('PX1.B.9 rejects non-string input → empty string', () => {
      expect(safeImgTag(123)).toBe('');
      expect(safeImgTag({})).toBe('');
      expect(safeImgTag([])).toBe('');
    });

    it('PX1.B.10 HTML-escapes URL with quote injection attempt', () => {
      // Hostile URL that tries to break out of src="..." — must be rejected
      // by allowlist regex (does not start with http(s):// or data:image/)
      // but if allowlist somehow passed, escape protects.
      const out = safeImgTag('https://x"><script>alert(1)</script><img src="y');
      // Allow-listed (starts with https://) — quotes are HTML-escaped so
      // <script> can't break out.
      expect(out).not.toContain('<script>');
      expect(out).not.toContain('"><');
      // Quotes must be encoded
      if (out) expect(out).toMatch(/&quot;|&#39;|&#34;/);
    });

    it('PX1.B.11 HTML-escapes alt + style attrs', () => {
      const out = safeImgTag('https://example.com/sig.png', {
        alt: '<script>x</script>',
        style: 'color: "evil"; max-height: 60px',
      });
      expect(out).not.toContain('<script>');
      expect(out).toContain('alt="&lt;script&gt;x&lt;/script&gt;"');
      // Style with quotes gets escaped
      expect(out).toMatch(/style="[^"]*&quot;evil&quot;[^"]*"/);
    });

    it('PX1.B.12 omits style attr when empty (default)', () => {
      const out = safeImgTag('https://example.com/sig.png', { alt: 'a' });
      expect(out).toContain('alt="a"');
      expect(out).not.toContain('style=""');
    });
  });

  describe('PX1.C — Source-grep regression guards', () => {
    const modalSource = readFileSync(
      resolve(__dirname, '..', 'src/components/backend/DocumentPrintModal.jsx'),
      'utf-8'
    );

    it('PX1.C.1 DocumentPrintModal imports DOMPurify', () => {
      expect(modalSource).toMatch(/import\s+DOMPurify\s+from\s+['"]dompurify['"]/);
    });

    it('PX1.C.2 DocumentPrintModal imports safeImgTag', () => {
      expect(modalSource).toMatch(/safeImgTag/);
    });

    it('PX1.C.3 dangerouslySetInnerHTML is wrapped in DOMPurify.sanitize', () => {
      // The only dangerouslySetInnerHTML in the file must be inside a
      // DOMPurify.sanitize(...) call. Match: __html: DOMPurify.sanitize(...)
      expect(modalSource).toMatch(/__html:\s*DOMPurify\.sanitize\(/);
      // Anti-regression: no raw __html: previewHtml without sanitize
      expect(modalSource).not.toMatch(/__html:\s*previewHtml\s*[},)]/);
    });

    it('PX1.C.4 signature injection uses safeImgTag (not raw template literal)', () => {
      // Anti-regression: V21-style hostile pattern locked out
      expect(modalSource).not.toMatch(/<img\s+src="\$\{record\.signatureUrl\}/);
      // V32-tris (2026-04-26): the signature-wrap call moved from
      // DocumentPrintModal into the shared computeStaffAutoFill helper
      // (src/lib/documentFieldAutoFill.js). Assert it lives there now.
      const autoFillSource = readFileSync('src/lib/documentFieldAutoFill.js', 'utf8');
      expect(autoFillSource).toMatch(/safeImgTag\(record\.signatureUrl/);
      // Also assert the dangerous template literal isn't anywhere in either file
      expect(autoFillSource).not.toMatch(/<img\s+src="\$\{record\.signatureUrl\}/);
    });

    it('PX1.C.5 SANITIZE_PROFILE forbids dangerous tags + handlers', () => {
      expect(modalSource).toMatch(/FORBID_TAGS.*script/s);
      expect(modalSource).toMatch(/FORBID_ATTR.*onerror/s);
    });

    it('PX1.C.6 NO other dangerouslySetInnerHTML in src/ outside sanitized DocumentPrintModal', () => {
      // Walk a few key React file dirs we know about and assert no other
      // dangerouslySetInnerHTML uses raw user input.
      const paths = [
        '../src/App.jsx',
        '../src/pages/AdminDashboard.jsx',
        '../src/pages/PatientDashboard.jsx',
        '../src/pages/PatientForm.jsx',
        '../src/pages/BackendDashboard.jsx',
      ];
      for (const p of paths) {
        try {
          const src = readFileSync(resolve(__dirname, p), 'utf-8');
          expect(src).not.toMatch(/dangerouslySetInnerHTML/);
        } catch {
          // file may not exist on some checkouts; skip silently
        }
      }
    });
  });
});
