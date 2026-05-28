// V131-bis (2026-05-28) — APP CURSOR. The browser showed the text I-beam mouse
// cursor over every selectable text node (default cursor:auto) → the whole UI
// looked like an input field (user: "Text cursor ... ขึ้นได้ทุกที่ ไม่สวย").
// Fix: body { cursor: default } baseline (arrow), real inputs keep text I-beam,
// buttons/links keep pointer. CRITICAL: user-select untouched → text stays
// copyable (cursor SHAPE and selection are independent). Real-browser verified:
// body/h2 cursor → default, button → pointer, user-select → auto. AV152.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/index.css', 'utf8');
const av = readFileSync('.agents/skills/audit-anti-vibe-code/SKILL.md', 'utf8');

describe('V131-bis app cursor (arrow not I-beam) + copy preserved', () => {
  it('C1: body baseline cursor is default (arrow), not the text I-beam', () => {
    expect(css).toMatch(/body\s*\{\s*cursor:\s*default;\s*\}/);
  });
  it('C2: real text-input fields keep the text I-beam', () => {
    expect(css).toMatch(/input,\s*textarea,\s*\[contenteditable="true"\][^{]*\{\s*cursor:\s*text;/);
  });
  it('C3: toggle/picker inputs + select keep the pointer', () => {
    expect(css).toMatch(/input\[type="checkbox"\][\s\S]*select\s*\{\s*cursor:\s*pointer;\s*\}/);
  });
  it('C4: copy preserved — NO global user-select:none on body/html (text stays selectable)', () => {
    expect(css).not.toMatch(/(?:^|\s)(?:body|html)\s*\{[^}]*user-select:\s*none/m);
  });
  it('C6: caret browsing — html hides the insertion caret app-wide (caret-color transparent)', () => {
    expect(css).toMatch(/html\s*\{\s*caret-color:\s*transparent;\s*\}/);
  });
  it('C7: real text-input fields restore a visible caret (caret-color auto)', () => {
    expect(css).toMatch(/input,\s*textarea,\s*\[contenteditable="true"\][^{]*\{\s*caret-color:\s*auto;/);
  });
  it('C5: AV152 documented (cursor + caret)', () => {
    expect(av).toMatch(/### AV152 —/);
    expect(av).toMatch(/cursor: default/);
    expect(av).toMatch(/caret-color/);
  });
});
