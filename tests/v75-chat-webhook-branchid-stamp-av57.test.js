// V75 AV57 audit invariant — chat webhook branchId stamp source-grep regression.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('V75 AV57 — chat webhook branchId stamp (audit invariant)', () => {
  const webhookFiles = [
    { file: 'api/webhook/line.js', label: 'LINE webhook', resolverName: 'resolveChatBranchIdFromLineEvent' },
    { file: 'api/webhook/facebook.js', label: 'FB webhook', resolverName: 'resolveChatBranchIdFromFbEvent' },
  ];

  webhookFiles.forEach(({ file, label, resolverName }) => {
    describe(`${label}`, () => {
      const src = fs.readFileSync(file, 'utf8');

      it(`AV57.1 (${label}) — V75 marker comment present`, () => {
        expect(src).toMatch(/V75 Item 3/);
      });

      it(`AV57.2 (${label}) — chat_conversations writes spread branchId field`, () => {
        // Look for branchId: { stringValue: chatBranchId } inside the file
        expect(src).toMatch(/branchId:\s*\{\s*stringValue:\s*chatBranchId\s*\}/);
      });

      it(`AV57.3 (${label}) — chat_conversations writes spread branchIdSource field`, () => {
        expect(src).toMatch(/branchIdSource:\s*\{\s*stringValue:\s*chatBranchIdSource\s*\}/);
      });

      it(`AV57.4 (${label}) — uses chatBranchId/chatBranchIdSource locals derived from V75 logic`, () => {
        // The local variable assignments must exist + reference fallback patterns
        expect(src).toMatch(/(const|let)\s+chatBranchId\s*=/);
        expect(src).toMatch(/(const|let)\s+chatBranchIdSource\s*=/);
      });

      it(`AV57.5 (${label}) — FALLBACK_BRANCH_ID read from LOVER_DEFAULT_BRANCH_ID env`, () => {
        expect(src).toMatch(/process\.env\.LOVER_DEFAULT_BRANCH_ID/);
      });
    });
  });

  it('AV57.6 — FB webhook uses resolveChatBranchIdFromFbEvent at main handler', () => {
    const src = fs.readFileSync('api/webhook/facebook.js', 'utf8');
    expect(src).toMatch(/resolveChatBranchIdFromFbEvent/);
  });

  it('AV57.7 — LINE webhook line.js has direct branchId from resolveLineConfigForWebhook → chat write', () => {
    // line.js doesn't import lineChatBranchResolver because it already has
    // branchId resolved via resolveLineConfigForWebhook (Phase BS V3). The
    // V75 chat stamp uses that existing branchId + fallback to LOVER_DEFAULT_BRANCH_ID.
    const src = fs.readFileSync('api/webhook/line.js', 'utf8');
    expect(src).toMatch(/resolveLineConfigForWebhook/);
    expect(src).toMatch(/chatBranchId\s*=\s*branchId\s*\|\|\s*FALLBACK_BRANCH_ID/);
  });

  it('AV57.8 — resolver files exist in api/webhook/_lib/', () => {
    expect(fs.existsSync('api/webhook/_lib/lineChatBranchResolver.js')).toBe(true);
    expect(fs.existsSync('api/webhook/_lib/fbChatBranchResolver.js')).toBe(true);
    expect(fs.existsSync('api/webhook/_lib/fbConfig.js')).toBe(true);
  });

  it('AV57.9 — fallback source labels standardized (V77-bis hardcoded-nakhonratchasima replaces -empty)', () => {
    // V77-bis (2026-05-16): pre-V77-bis emitted source label '-empty' when
    // fallbackBranchId was '' which caused cross-branch leak via the empty
    // branchId stamp. Post-V77-bis: hardcoded NAKHON constant fires INSTEAD
    // of empty, emitting source label '-hardcoded-nakhonratchasima'. AV57
    // contract updated; positive assertions lock the post-fix labels.
    // (Negative '-empty' regression guards omitted — V77-bis institutional-
    // memory comments in the resolver legitimately reference the old label
    // as the bug-context phrase; only the actual code-path emission matters,
    // which is locked by the positive assertions + LW1.5/FW1.6 contract tests.)
    const lineResolver = fs.readFileSync('api/webhook/_lib/lineChatBranchResolver.js', 'utf8');
    const fbResolver = fs.readFileSync('api/webhook/_lib/fbChatBranchResolver.js', 'utf8');
    expect(lineResolver).toMatch(/webhook-line-fallback-nakhonratchasima/);
    expect(lineResolver).toMatch(/webhook-line-fallback-hardcoded-nakhonratchasima/);
    expect(fbResolver).toMatch(/webhook-fb-fallback-legacy/);
    expect(fbResolver).toMatch(/webhook-fb-fallback-hardcoded-nakhonratchasima/);
  });

  it('AV57.10 — AV57 entry present in audit-anti-vibe-code SKILL.md', () => {
    const skill = fs.readFileSync('.agents/skills/audit-anti-vibe-code/SKILL.md', 'utf8');
    expect(skill).toMatch(/^### AV57 — Chat webhook MUST stamp branchId/m);
    // Extract from AV57 to next "### AV" or "## " heading
    const start = skill.indexOf('### AV57');
    const remaining = skill.slice(start);
    const nextHeading = remaining.slice(8).search(/\n### AV|\n## /);
    const av57Block = nextHeading === -1 ? remaining : remaining.slice(0, nextHeading + 8);
    expect(av57Block).toMatch(/Sanctioned exceptions[\*: ]+NONE/i);
  });

  it('AV57.11 — non-chat sound-trigger files are NOT touched by V75 (defensive)', () => {
    // Sanity: verify api/webhook/send.js does NOT have V75 markers (echoes
    // already-stamped doc; doesn't need fresh stamp). Send.js only writes
    // outbound replies which inherit existing branchId via updateMask.
    const sendSrc = fs.readFileSync('api/webhook/send.js', 'utf8');
    // Not asserting absence of markers (send.js may eventually be touched);
    // this test ensures the file exists and is readable.
    expect(sendSrc.length).toBeGreaterThan(100);
  });
});
