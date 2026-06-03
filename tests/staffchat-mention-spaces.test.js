// tests/staffchat-mention-spaces.test.js
// (2026-06-03 EOD+4) — Bug hunt (Rule P loop), mention #1. The @-mention dropdown
// inserts the FULL picked displayName (which can contain spaces — the NamePicker
// allows any 2-50 char name), but extractMentions used /@([^\s@]+)/ which stops at
// the FIRST space → "@พี่ บี" captured only "พี่". The recipient match
// `mentions.includes(myName)` then failed for "พี่ บี" → the distinct mention sound
// + full @-highlight never fired for any spaced displayName.
//
// Fix: candidate-aware extraction — at each '@', match the LONGEST known recent
// displayName that follows (handles spaces), falling back to the single non-space
// token when no candidate matches (single-word names not in the recent list +
// backward-compat when no candidates are passed).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { extractMentions } from '../src/lib/staffChatClient.js';

describe('MS — @mention extraction handles displayNames with spaces (candidate-aware)', () => {
  it('M1 a spaced candidate name is captured WHOLE (was truncated at the first space)', () => {
    expect(extractMentions('@พี่ บี ช่วยดูเคสนี้หน่อย', ['พี่ บี', 'หมอ เอ'])).toEqual(['พี่ บี']);
  });
  it('M2 longest candidate wins (พี่ บี over พี่)', () => {
    expect(extractMentions('@พี่ บี มาแล้ว', ['พี่', 'พี่ บี'])).toEqual(['พี่ บี']);
  });
  it('M3 two spaced mentions, in order', () => {
    expect(extractMentions('@พี่ บี และ @หมอ เอ', ['พี่ บี', 'หมอ เอ'])).toEqual(['พี่ บี', 'หมอ เอ']);
  });
  it('M4 fallback: a single-word name NOT in candidates still extracts', () => {
    expect(extractMentions('@bee hi', ['พี่ บี'])).toEqual(['bee']);
  });
  it('M5 no candidates → original single-token behavior (backward-compat)', () => {
    expect(extractMentions('@พี่ บี hi')).toEqual(['พี่']);   // unchanged when called without candidates
    expect(extractMentions('@bee @cee hi')).toEqual(['bee', 'cee']);
  });
  it('M6 caps at 5 unique', () => {
    const cands = ['a a', 'b b', 'c c', 'd d', 'e e', 'f f'];
    const txt = cands.map((c) => '@' + c).join(' ');
    expect(extractMentions(txt, cands).length).toBe(5);
  });
  it('M7 dedups a repeated spaced mention', () => {
    expect(extractMentions('@พี่ บี @พี่ บี', ['พี่ บี'])).toEqual(['พี่ บี']);
  });
  it('M8 empty / non-string safe', () => {
    expect(extractMentions('', ['x'])).toEqual([]);
    expect(extractMentions(null, ['x'])).toEqual([]);
  });
});

describe('MS-SG — composer threads the recent-candidate list into extractMentions', () => {
  it('SG1 the composer submit calls extractMentions WITH recentMentionCandidates', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/components/staffchat/StaffChatComposer.jsx'), 'utf8');
    expect(src).toMatch(/extractMentions\(trimmed,\s*recentMentionCandidates\)/);
  });
});
