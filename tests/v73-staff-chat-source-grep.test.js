// tests/v73-staff-chat-source-grep.test.js
// V73 (2026-05-16) — Source-grep regression locks for App.jsx mount of StaffChatWidget.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const APP = readFileSync('src/App.jsx', 'utf-8');

describe('V73.SG1 StaffChatWidget mount source-grep', () => {
  it('SG1.1 App.jsx imports StaffChatWidget (lazy)', () => {
    expect(APP).toMatch(/StaffChatWidget.*lazy\(/);
  });

  it('SG1.2 widget rendered with user + needsPublicAuth props', () => {
    expect(APP).toMatch(/<StaffChatWidget[\s\S]{0,200}user=\{user\}/);
    expect(APP).toMatch(/<StaffChatWidget[\s\S]{0,200}needsPublicAuth=\{needsPublicAuth\}/);
  });

  it('SG1.3 widget wrapped in Suspense (lazy fallback)', () => {
    // Either explicit Suspense wrap OR a LazyFallback-like guard near the widget
    expect(APP).toMatch(/Suspense[\s\S]{0,200}<StaffChatWidget|<StaffChatWidget[\s\S]{0,400}<\/Suspense>/);
  });
});
