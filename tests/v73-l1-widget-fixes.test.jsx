// tests/v73-l1-widget-fixes.test.jsx
// V73 L1 hands-on bug-report regression bank (2026-05-18 — V66-class trust collapse repeat).
//
// User-reported bugs after V73 was deployed LIVE on prod:
//   Bug A — สาขาตรงหัวแชทไม่ขึ้น (branch name "—" in chat header)
//   Bug B — verbose placeholder hint in composer
//   Bug C — ชื่อของคนส่งไม่แสดงในแชท (sender name doesn't display)
//   Bug D — แชทไม่ส่งถึงกัน (chats not reaching each other; silent listener errors)
//
// All 4 bugs slipped through:
//   - vitest helper units (96 PASS)
//   - vitest RTL component tests (240+ PASS)
//   - source-grep regressions (35 PASS)
//   - Rule I flow-simulate (15 PASS)
//   - multi-surface real-time (15 PASS)
//   - adversarial property-based (39 PASS)
//   - admin-SDK Rule Q L2 (PASS)
//   - pre + post-deploy probes (4/4 each PASS)
//
// Same V66 trust-collapse pattern: code-shape coverage ≠ real-prod L1 behavior.
// AV51 (NEW): every widget must self-resolve context-dependent display data;
// silent listener errors must surface to UI (banner + console.warn).
//
// This file locks the post-fix shape — future drift fails build.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const widget = SRC('src/components/staffchat/StaffChatWidget.jsx');
const panel = SRC('src/components/staffchat/StaffChatPanel.jsx');
const composer = SRC('src/components/staffchat/StaffChatComposer.jsx');
const message = SRC('src/components/staffchat/StaffChatMessage.jsx');
const hook = SRC('src/hooks/useStaffChat.js');

describe('V73.L1 — Bug A: widget self-resolves branchName from useSelectedBranch.branches', () => {
  it('A.1 widget destructures `branches` from useSelectedBranch', () => {
    expect(widget).toMatch(/branchId:\s*selectedBranchId,\s*branches\s*\}\s*=\s*useSelectedBranch/);
  });

  it('A.2 widget computes resolvedBranchName with prop-first fallback', () => {
    expect(widget).toMatch(/resolvedBranchName\s*=/);
    expect(widget).toMatch(/propBranchName/);
    expect(widget).toMatch(/branches\.find\(b\s*=>\s*b\.id\s*===\s*selectedBranchId\)\?\.name/);
  });

  it('A.3 widget defends against undefined branches (test-mock safety)', () => {
    expect(widget).toMatch(/Array\.isArray\(branches\)/);
  });

  it('A.4 widget passes resolvedBranchName (not raw prop) to StaffChatPanel', () => {
    expect(widget).toMatch(/branchName=\{resolvedBranchName\}/);
  });
});

describe('V73.L1 — Bug B: composer placeholder is short, no verbose hint', () => {
  it('B.1 placeholder is exactly "พิมพ์ข้อความ..."', () => {
    expect(composer).toMatch(/placeholder="พิมพ์ข้อความ\.\.\."/);
  });

  it('B.2 placeholder does NOT contain "Shift+Enter" or "Enter = "', () => {
    expect(composer).not.toMatch(/placeholder="[^"]*Shift\+Enter/);
    expect(composer).not.toMatch(/placeholder="[^"]*Enter\s*=\s*ส่ง/);
  });
});

describe('V73.L1 — Bug C: sender name displays on ALL messages (incl. own)', () => {
  it('C.1 StaffChatMessage renders displayName WITHOUT !isOwn gate', () => {
    // Pre-fix: `{!isOwn && <div>{message.displayName}</div>}`
    // Post-fix: `{message.displayName && <div ...>{message.displayName}</div>}`
    expect(message).not.toMatch(/\{!isOwn\s*&&\s*\(?\s*<div[^>]*>\s*\{message\.displayName\}/);
    expect(message).toMatch(/\{message\.displayName\s*&&\s*\(\s*<div/);
  });

  it('C.2 displayName div has data-testid for L1 verification', () => {
    expect(message).toMatch(/data-testid=\{?`?staff-chat-message-name-\$\{message\.id\}`?\}?/);
  });

  it('C.3 own + other styled distinctly (rose vs sky)', () => {
    expect(message).toMatch(/isOwn[\s\S]*text-rose-700[\s\S]*text-sky-700/);
  });
});

describe('V73.L1 — Bug D: silent listener errors surface to UI banner + console.warn', () => {
  it('D.1 useStaffChat exports `loading` in return shape', () => {
    expect(hook).toMatch(/const\s*\[loading,\s*setLoading\]\s*=\s*useState/);
    expect(hook).toMatch(/error,\s*loading,/);  // in return statement
  });

  it('D.2 listener onError logs to console.warn (not silent)', () => {
    expect(hook).toMatch(/console\.warn\(\[?'?\[staff-chat\]/);
  });

  it('D.3 listener onSnapshot sets loading=false on first snapshot', () => {
    expect(hook).toMatch(/setLoading\(false\);[\s\S]{0,200}setMessages\(docs\)/);
  });

  it('D.4 listener onError sets loading=false too', () => {
    // Loading false on error so banner shows instead of spinner spinning forever.
    // Anchor on console.warn[staff-chat] then look for setLoading(false) within 400 chars.
    expect(hook).toMatch(/console\.warn\(['"`]\[staff-chat\][\s\S]{0,400}setLoading\(false\)/);
  });

  it('D.5 listener clears prior error on resubscribe (branch switch)', () => {
    expect(hook).toMatch(/setError\(null\)\s*;?\s*\/\/.*resubscribe/);
  });

  it('D.6 Panel renders error banner when error truthy', () => {
    expect(panel).toMatch(/staff-chat-error-banner/);
    expect(panel).toMatch(/ไม่สามารถโหลดข้อความได้/);
  });

  it('D.7 Panel renders loading banner when loading and no error', () => {
    expect(panel).toMatch(/staff-chat-loading-banner/);
    expect(panel).toMatch(/กำลังโหลดข้อความ/);
  });

  it('D.8 Widget threads error + loading from hook to Panel', () => {
    expect(widget).toMatch(/error=\{chat\.error\}/);
    expect(widget).toMatch(/loading=\{chat\.loading\}/);
  });
});

describe('V73.L1 — AV51 invariant: widget self-resolves + surfaces errors', () => {
  // AV51 (NEW): Every widget mounted globally must:
  //   1. Self-resolve display data from React Context (not rely on parent prop).
  //   2. Surface listener errors to UI (banner) + console.warn (debug).
  // V73 widget is the canonical AV51 example post-L1 fix.
  it('AV51.1 widget self-resolves branch identity (Bug A class)', () => {
    expect(widget).toMatch(/Array\.isArray\(branches\)/);
  });

  it('AV51.2 widget surfaces listener errors to Panel banner (Bug D class)', () => {
    expect(widget).toMatch(/error=\{chat\.error\}/);
    expect(panel).toMatch(/staff-chat-error-banner/);
  });

  it('AV51.3 hook logs listener errors to console.warn (debug visibility)', () => {
    expect(hook).toMatch(/console\.warn\(/);
  });

  it('AV51.4 hook clears stale error on resubscribe (post-branch-switch UX)', () => {
    expect(hook).toMatch(/setError\(null\)/);
  });
});
