// 2026-06-29 — guard against the audit-anti-vibe-code SKILL.md DRIFT landmine.
// The skill has two on-disk copies (.agents/skills + .claude/skills). They had
// silently diverged into COMPLEMENTARY AV sets (AV80-96 + AV190-199 only in
// .claude; AV16-79 + AV97-189 + AV198 only in .agents) — different AV-content
// tests read different copies, so a new AV added to the wrong copy (or a cp that
// overwrites one with the other) breaks tests that read the other path. Reconciled
// into ONE union (AV1-199), written identically to both. This test keeps them
// identical forever: a new AV added to only one copy fails SY1.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('audit-anti-vibe-code SKILL.md — two copies stay in sync', () => {
  const agents = read('.agents/skills/audit-anti-vibe-code/SKILL.md');
  const claude = read('.claude/skills/audit-anti-vibe-code/SKILL.md');

  it('SY1 .agents and .claude copies are byte-identical', () => {
    expect(claude).toBe(agents);
  });

  it('SY2 the unified file covers AVs from BOTH former halves', () => {
    for (const av of ['AV28', 'AV85', 'AV96', 'AV108', 'AV189', 'AV190', 'AV197', 'AV198', 'AV199']) {
      expect(agents).toMatch(new RegExp(`### ${av} `));
    }
  });
});
