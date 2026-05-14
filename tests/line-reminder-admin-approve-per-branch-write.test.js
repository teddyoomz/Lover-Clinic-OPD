import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

describe('LR-3 — admin approval writes per-branch + legacy linkage', () => {
  it('LR3.W1 link-requests.js handleApprove writes lineUserId_byBranch[branchId]', () => {
    const text = fs.readFileSync(path.join(ROOT, 'api/admin/link-requests.js'), 'utf8');
    expect(text, 'must contain lineUserId_byBranch dotted-path update').toMatch(/`lineUserId_byBranch\.\$\{[^}]+\}`/);
  });

  it('LR3.W2 link-requests.js preserves legacy lineUserId field write', () => {
    const text = fs.readFileSync(path.join(ROOT, 'api/admin/link-requests.js'), 'utf8');
    expect(text).toMatch(/lineUserId:/);
    expect(text).toMatch(/lineDisplayName/);
  });

  it('LR3.W3 per-branch object shape includes lineUserId / lineDisplayName / linkedAt / _lineStale', () => {
    const text = fs.readFileSync(path.join(ROOT, 'api/admin/link-requests.js'), 'utf8');
    // Verify the per-branch update block has the canonical shape
    expect(text).toMatch(/_lineStale:\s*false/);
    expect(text).toMatch(/linkedAt:/);
  });
});
