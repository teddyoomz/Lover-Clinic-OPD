// ─── AV195 — no browser client-SDK read of clinic_settings/chat_config ───────
// 2026-06-13 cleanup. WS1-C2-bis (2026-06-10) rule-locked
// clinic_settings/chat_config (it holds the LINE/FB channel SECRETS) so its
// READ is denied to ALL client-SDK callers — only the firebase-admin SDK
// (server api/**) may read it. Two legacy CLIENT reads survived the security
// work and now silently fail + log permission-denied:
//   • src/lib/fbConfigClient.js  getFbConfig auto-seed → getDoc(chat_config)
//   • src/components/ChatPanel.jsx legacy fallback   → onSnapshot(chat_config)
// Both were removed (the per-branch be_line_configs / be_fb_configs are the
// primary path; chat_config holds the OLD secrets being rotated). This guard
// keeps a future dev from re-introducing a client-side read of the secret doc.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const read = (p) => readFileSync(path.resolve(process.cwd(), p), 'utf8');

// Strip // line comments and /* */ block comments so we only test live code.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

describe('AV195.A — the two removed legacy client reads stay removed', () => {
  it('A1 fbConfigClient.getFbConfig no longer reads chat_config / branchDocRef / legacyChatConfigRef', () => {
    const code = stripComments(read('src/lib/fbConfigClient.js'));
    // removed code identifiers (these never appear in the explanatory comments)
    expect(code).not.toMatch(/legacyChatConfigRef/);
    expect(code).not.toMatch(/branchDocRef/);
    expect(code).not.toMatch(/_autoSeeded/);
    // no quoted chat_config doc-ref (the live read) — comments may still explain it
    expect(code).not.toMatch(/['"]chat_config['"]/);
  });
  it('A2 ChatPanel no longer reads chat_config nor keeps the dead chatConfig state', () => {
    const code = stripComments(read('src/components/ChatPanel.jsx'));
    expect(code).not.toMatch(/chat_config/);
    expect(code).not.toMatch(/setChatConfig/);
    expect(code).not.toMatch(/chatConfig/);
    expect(code).not.toMatch(/allowLegacyFallback/);
    // enable flags now derive solely from per-branch config
    expect(code).toMatch(/lineEnabled\s*=\s*!!lineConfig\?\.enabled/);
    expect(code).toMatch(/fbEnabled\s*=\s*!!fbConfig\?\.enabled/);
  });
});

describe('AV195.B — project-wide classifier: no client-SDK chat_config read anywhere in src/', () => {
  it('B1 no live (non-comment) clinic_settings/chat_config doc-read in src/', () => {
    const offenders = [];
    const walk = (dir) => {
      for (const f of readdirSync(dir)) {
        const full = path.join(dir, f);
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!/\.(jsx?|tsx?)$/.test(f)) continue;
        const code = stripComments(readFileSync(full, 'utf8'));
        // a live reference to the chat_config doc id in client code is forbidden
        if (/['"]chat_config['"]/.test(code)) offenders.push(path.relative(process.cwd(), full));
      }
    };
    walk(path.resolve(process.cwd(), 'src'));
    expect(offenders).toEqual([]);
  });
});
