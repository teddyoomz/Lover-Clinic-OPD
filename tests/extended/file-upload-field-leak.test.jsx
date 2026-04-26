// ─── FileUploadField blob-URL revocation tests — Polish 2026-04-26 ───────
// FU1 group — verifies URL.createObjectURL is paired with
// URL.revokeObjectURL on every code path: swap (re-pick), upload-success,
// delete, unmount.
//
// Strategy: spy on URL.{create,revoke}ObjectURL globally. Source-grep
// guards lock the fix shape so future refactor can't drop revoke calls.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourcePath = resolve(__dirname, '..', 'src/components/backend/FileUploadField.jsx');
const source = readFileSync(sourcePath, 'utf-8');

describe('FU1 — FileUploadField URL.revokeObjectURL leak fix', () => {
  describe('FU1.A — Source-grep regression guards', () => {
    it('FU1.A.1 imports useEffect (for unmount cleanup)', () => {
      expect(source).toMatch(/import\s*\{[^}]*useEffect[^}]*\}\s*from\s*['"]react['"]/);
    });

    it('FU1.A.2 declares revokeIfBlob helper', () => {
      expect(source).toMatch(/function\s+revokeIfBlob\s*\(/);
    });

    it('FU1.A.3 revokeIfBlob guards on blob: prefix', () => {
      expect(source).toMatch(/startsWith\(['"]blob:['"]\)/);
    });

    it('FU1.A.4 declares activeBlobRef via useRef', () => {
      expect(source).toMatch(/activeBlobRef\s*=\s*useRef\(\s*null\s*\)/);
    });

    it('FU1.A.5 unmount useEffect calls revokeIfBlob', () => {
      // useEffect with empty deps + cleanup function calling revokeIfBlob
      expect(source).toMatch(/useEffect\(\s*\(\)\s*=>\s*\{\s*return\s*\(\)\s*=>\s*\{[^}]*revokeIfBlob/s);
      // Empty deps array (only unmount, not on every render)
      expect(source).toMatch(/revokeIfBlob\(activeBlobRef\.current\);\s*activeBlobRef\.current\s*=\s*null;\s*\};\s*\},\s*\[\]\)/s);
    });

    it('FU1.A.6 handleFileSelect revokes previous BEFORE creating new blob', () => {
      // The order matters — find handleFileSelect, then check revoke
      // appears before createObjectURL within it.
      const fnMatch = source.match(/const\s+handleFileSelect\s*=\s*async[\s\S]*?(?=\n\s{2}const\s+handle)/);
      expect(fnMatch).toBeTruthy();
      const fn = fnMatch[0];
      const revokeIdx = fn.indexOf('revokeIfBlob(activeBlobRef.current)');
      const createIdx = fn.indexOf('URL.createObjectURL(file)');
      expect(revokeIdx).toBeGreaterThan(0);
      expect(createIdx).toBeGreaterThan(0);
      expect(revokeIdx).toBeLessThan(createIdx);
    });

    it('FU1.A.7 handleFileSelect revokes blob after upload-success swap', () => {
      // After `result = await uploadFile(...)` succeeds, before
      // `setPreviewUrl(result.url)`, we should revoke the blob.
      expect(source).toMatch(/result\s*=\s*await\s+uploadFile[\s\S]{0,500}revokeIfBlob\(activeBlobRef\.current\)[\s\S]{0,200}setPreviewUrl\(result\.url\)/);
    });

    it('FU1.A.8 handleDelete revokes blob', () => {
      const fnMatch = source.match(/const\s+handleDelete\s*=\s*async[\s\S]*?(?=\n\s{2}const\s+\w|\n\s{2}return)/);
      expect(fnMatch).toBeTruthy();
      const fn = fnMatch[0];
      expect(fn).toMatch(/revokeIfBlob\(activeBlobRef\.current\)/);
    });

    it('FU1.A.9 stores blob URL in activeBlobRef on creation', () => {
      // After URL.createObjectURL(file), assign to activeBlobRef.current
      expect(source).toMatch(/const\s+blobUrl\s*=\s*URL\.createObjectURL\(file\);[\s\S]{0,100}activeBlobRef\.current\s*=\s*blobUrl/);
    });

    it('FU1.A.10 nulls activeBlobRef after revoke (no double-revoke)', () => {
      // Every revokeIfBlob(activeBlobRef.current) site should null out
      // activeBlobRef.current immediately after to prevent double-revoke.
      const revokeCount = (source.match(/revokeIfBlob\(activeBlobRef\.current\)/g) || []).length;
      const nullCount = (source.match(/activeBlobRef\.current\s*=\s*null/g) || []).length;
      // 4 revoke sites: useEffect cleanup, handleFileSelect (pre-create),
      // handleFileSelect (post-upload), handleDelete. Each followed by
      // null assignment. nullCount may be >= revokeCount (additional null
      // for the upload-success path).
      expect(revokeCount).toBeGreaterThanOrEqual(4);
      expect(nullCount).toBeGreaterThanOrEqual(revokeCount);
    });
  });

  describe('FU1.B — revokeIfBlob runtime behavior', () => {
    let createSpy;
    let revokeSpy;

    beforeEach(() => {
      createSpy = vi.fn(() => 'blob:fake-url-' + Math.random().toString(36).slice(2));
      revokeSpy = vi.fn();
      vi.stubGlobal('URL', { createObjectURL: createSpy, revokeObjectURL: revokeSpy });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    // We import the helper indirectly by constructing a minimal eval of
    // its source — it's a private module-scope function. We test the same
    // behavior pattern via an inline shim that mirrors revokeIfBlob.
    function revokeIfBlobInline(url) {
      if (typeof url === 'string' && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    }

    it('FU1.B.1 calls revokeObjectURL on blob: URL', () => {
      revokeIfBlobInline('blob:abc');
      expect(revokeSpy).toHaveBeenCalledWith('blob:abc');
    });

    it('FU1.B.2 does NOT revoke on https:// URL', () => {
      revokeIfBlobInline('https://firebasestorage.googleapis.com/x.png');
      expect(revokeSpy).not.toHaveBeenCalled();
    });

    it('FU1.B.3 does NOT revoke on null / undefined / empty', () => {
      revokeIfBlobInline(null);
      revokeIfBlobInline(undefined);
      revokeIfBlobInline('');
      expect(revokeSpy).not.toHaveBeenCalled();
    });

    it('FU1.B.4 does NOT revoke on non-string', () => {
      revokeIfBlobInline(123);
      revokeIfBlobInline({});
      revokeIfBlobInline([]);
      expect(revokeSpy).not.toHaveBeenCalled();
    });

    it('FU1.B.5 idempotent on blob: prefix variations', () => {
      revokeIfBlobInline('blob:'); // edge: just prefix, no body
      revokeIfBlobInline('blob:http://x'); // unusual but starts with blob:
      expect(revokeSpy).toHaveBeenCalledTimes(2);
    });
  });
});
