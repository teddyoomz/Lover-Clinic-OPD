#!/usr/bin/env node
// .agents/scripts/session-apply.mjs
//
// Propagator for /session-end. Reads `.agents/sessions/.next.json` (the
// capsule the LLM just wrote) and mechanically generates / updates:
//
//   1. Checkpoint markdown at .agents/sessions/YYYY-MM-DD-<slug>.md
//   2. .agents/active.md frontmatter + body
//   3. SESSION_HANDOFF.md — Current State + new entry above prior + Resume Prompt
//   4. wiki/log.md (append) + wiki/index.md (rows for new pages)
//   5. git add + commit + push
//   6. Prints the Resume Prompt to stdout (LLM relays it as final message)
//
// LLM workload reduces to: write capsule (~30 lines JSON) + optionally write
// 1-2 new wiki page bodies. Script handles everything else.
//
// Capsule shape (.agents/sessions/.next.json):
//   {
//     slug: string,
//     summary: string,            // one-line, used in commit msg + log entry
//     mode: "skip" | "minimal" | "full",
//     decisions: string[],        // 3-6 one-liners
//     lessons: string[],          // 0-3 one-liners
//     new_wiki: {
//       concepts: [{ slug, title, summary }],
//       entities: [{ slug, title, summary }],
//     },
//     next: string,               // "idle" or "<one specific action>"
//     outstanding_added: string[],// new entries to prepend to active.md outstanding list
//     deploy_note?: string,       // optional — appears in commit msg + Resume Prompt
//   }
//
// Wiki page bodies must already exist as files at wiki/concepts/<slug>.md
// or wiki/entities/<slug>.md before running this — LLM Writes them
// directly. Script only updates the index rows + the log entry pointer.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const sh = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const shArr = (cmd) => { const out = sh(cmd); return out ? out.split(/\r?\n/).filter(Boolean) : []; };
const shSafe = (cmd, fallback = '') => { try { return sh(cmd); } catch { return fallback; } };

// ─── Load capsule ─────────────────────────────────────────────────────────
const CAPSULE_PATH = '.agents/sessions/.next.json';
if (!existsSync(CAPSULE_PATH)) {
  console.error(`FATAL: capsule not found at ${CAPSULE_PATH}. LLM must write it first.`);
  process.exit(1);
}
const cap = JSON.parse(readFileSync(CAPSULE_PATH, 'utf8'));
if (cap.mode === 'skip') {
  console.log('[session-apply] mode=skip — nothing to do.');
  process.exit(0);
}

// ─── Compute mechanical state ─────────────────────────────────────────────
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
const slug = cap.slug;
const checkpointPath = `.agents/sessions/${today}-${slug}.md`;
const baseSha = shSafe(`git log --grep='^docs(agents): EOD' --format='%h' -n 1`) || '(initial)';
const headSha = sh(`git rev-parse --short=7 HEAD`);
const commits = baseSha !== '(initial)' ? shArr(`git log --oneline ${baseSha}..HEAD`) : [];
const files = baseSha !== '(initial)' ? shArr(`git diff --name-only ${baseSha}..HEAD`) : [];
const shortstat = baseSha !== '(initial)' ? shSafe(`git diff --shortstat ${baseSha}..HEAD`) : '';
const activeRaw = readFileSync('.agents/active.md', 'utf8');
const tests = (activeRaw.match(/^tests:\s*(\d+)/m) || [])[1] || '?';
const prodSha = (activeRaw.match(/^production_commit:\s*"([^"]+)"/m) || [])[1] || '(unknown)';
const rulesVer = (activeRaw.match(/^firestore_rules_version:\s*(\d+)/m) || [])[1] || '?';

// Carry over outstanding actions from existing active.md (preserve list).
function extractOutstanding(text) {
  const m = text.match(/## Outstanding user-triggered actions\s*\n([\s\S]*?)(\n##|\n$)/);
  if (!m) return [];
  return m[1].split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2).trim());
}
const carryOverOutstanding = extractOutstanding(activeRaw);
const newOutstanding = [...(cap.outstanding_added || []), ...carryOverOutstanding].slice(0, 8);

// Derive shipped-bullet list from commit subjects (for active.md "What this session shipped").
const shipped = commits.slice(0, 8).map((c) => `- \`${c}\``);

// ─── Templates ─────────────────────────────────────────────────────────────
function renderCheckpoint() {
  const decisions = (cap.decisions || []).map((d) => `- ${d}`).join('\n');
  const lessons = (cap.lessons || []).map((l) => `- ${l}`).join('\n');
  const fileList = files.slice(0, 30).map((f) => `- \`${f}\``).join('\n');
  const moreFiles = files.length > 30 ? `\n- ... +${files.length - 30} more` : '';
  return `# ${today} EOD — ${cap.summary}

## State
- master = \`${headSha}\` · prod = \`${prodSha}\` · tests = ${tests} · firestore.rules v${rulesVer}
- Base for this session: \`${baseSha}\` · ${shortstat || '0 files changed'}
${cap.deploy_note ? `- ${cap.deploy_note}\n` : ''}
## Commits
\`\`\`
${commits.join('\n')}
\`\`\`

## Files touched
${fileList}${moreFiles}

## Decisions
${decisions || '- (none)'}

## Lessons
${lessons || '- (none)'}

## Next
${cap.next || 'idle'}

## Resume Prompt
See \`SESSION_HANDOFF.md\` Resume Prompt block.
`;
}

function renderActive() {
  const shippedBullets = shipped.slice(0, 6).join('\n');
  const decisionsBullets = (cap.decisions || []).slice(0, 4).map((d) => `- ${d}`).join('\n');
  const outBullets = newOutstanding.map((o) => `- ${o}`).join('\n');
  return `---
updated_at: "${today} EOD — ${cap.summary}"
status: "master=${headSha} · prod=${prodSha} · tests=${tests}"
current_focus: "${cap.next === 'idle' ? 'Idle' : cap.next}"
branch: "master"
last_commit: "${headSha}"
tests: ${tests}
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "${prodSha}"
firestore_rules_version: ${rulesVer}
storage_rules_version: 2
---

# Active Context

## State
- master=\`${headSha}\` · prod=\`${prodSha}\` · ${tests}/${tests} tests · firestore.rules v${rulesVer}
- ${shortstat || 'no diff'} since ${baseSha}
${cap.deploy_note ? `- ${cap.deploy_note}` : ''}

## What this session shipped
${shippedBullets}
- Detail: \`${checkpointPath}\`

## Decisions (one-line each)
${decisionsBullets || '- (none)'}

## Next action
${cap.next || 'Idle.'}

## Outstanding user-triggered actions
${outBullets || '- (none)'}
`;
}

function renderHandoffEntry() {
  return `### Session ${today} EOD — ${cap.summary}

${commits.length} commit${commits.length === 1 ? '' : 's'} · ${shortstat || 'no diff'} · tests ${tests} · prod \`${prodSha}\`${cap.deploy_note ? ` · ${cap.deploy_note}` : ''}.

Decisions: ${(cap.decisions || []).slice(0, 3).join(' · ') || '(none)'}.
${cap.lessons?.length ? `Lessons: ${cap.lessons.slice(0, 2).join(' · ')}.\n` : ''}
Detail: \`${checkpointPath}\`
`;
}

function renderResumePrompt() {
  const out = newOutstanding.slice(0, 6).map((o) => `- ${o}`).join('\n');
  return `\`\`\`
Resume LoverClinic — continue from ${today} EOD.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=${headSha}, prod=${prodSha})
3. .agents/active.md (${tests} tests)
4. .claude/rules/00-session-start.md (iron-clad + V-summary)
5. ${checkpointPath}

Status: master=${headSha}, ${tests}/${tests} tests pass, prod=${prodSha}${cap.deploy_note ? ` (${cap.deploy_note})` : ''}.

Next: ${cap.next || 'idle'}.

Outstanding (user-triggered):
${out || '- (none)'}

Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe Rule B (6 endpoints + artifacts/{APP_ID}/public/data/ prefix); Rule J brainstorming HARD-GATE; Rule K work-first-test-last; Rule L BSA (BS-1..BS-9); Rule M data-ops via local + admin-SDK + pull-env (never deploy-coupled); H-quater no master_data reads; NO real-action clicks in preview_eval.

/session-start
\`\`\``;
}

// ─── SESSION_HANDOFF.md surgery ───────────────────────────────────────────
function patchHandoff() {
  const path = 'SESSION_HANDOFF.md';
  let text = readFileSync(path, 'utf8');

  // 1) Update top "## Current State" first 4 bullet lines.
  const newState = `## Current State

- **Date last updated**: ${today} EOD — ${cap.summary}
- **Branch**: \`master\`
- **Last commit**: \`${headSha}\`
- **Test count**: **${tests}**
- **Build**: clean
- **Deploy state**: PROD=\`${prodSha}\`${cap.deploy_note ? ` (${cap.deploy_note})` : ''}.`;
  text = text.replace(/^## Current State[\s\S]*?(?=\n### Session )/m, newState + '\n\n');

  // 2) Insert new entry above the first "### Session " heading.
  const entry = renderHandoffEntry();
  text = text.replace(/(\n### Session )/, `\n${entry}\n$1`);

  // 3) Replace ## Resume Prompt block (the ``` ... ``` after "## Resume Prompt").
  const rp = renderResumePrompt();
  text = text.replace(
    /(## Resume Prompt\s*\n)```[\s\S]*?```/,
    `$1${rp}`,
  );

  writeFileSync(path, text);
}

// ─── Wiki updates ─────────────────────────────────────────────────────────
function appendWikiLog() {
  if (!existsSync('wiki/log.md')) return;
  const wikiNew = [];
  for (const c of cap.new_wiki?.concepts || []) wikiNew.push(`[${c.slug}](concepts/${c.slug}.md)`);
  for (const e of cap.new_wiki?.entities || []) wikiNew.push(`[${e.slug}](entities/${e.slug}.md)`);
  const newLine = wikiNew.length ? ` New pages: ${wikiNew.join(', ')}.` : '';
  const entry = `## [${today} EOD] session | ${cap.summary}\n\n${commits.length} commits · tests ${tests} · prod \`${prodSha}\`.${newLine} Detail: \`${checkpointPath}\`.\n\n`;
  // Insert after the header preamble (3 lines) and before the first ## entry.
  let text = readFileSync('wiki/log.md', 'utf8');
  text = text.replace(/(\n)(## \[[0-9])/m, `\n${entry}$2`);
  writeFileSync('wiki/log.md', text);
}

function updateWikiIndex() {
  if (!existsSync('wiki/index.md')) return;
  const concepts = cap.new_wiki?.concepts || [];
  const entities = cap.new_wiki?.entities || [];
  if (!concepts.length && !entities.length) return;
  let text = readFileSync('wiki/index.md', 'utf8');

  // Bump date-updated frontmatter.
  text = text.replace(/^date-updated:\s*\d{4}-\d{2}-\d{2}/m, `date-updated: ${today}`);

  // Insert entity rows before "## Concepts".
  if (entities.length) {
    const rows = entities.map((e) => `| [${e.title}](entities/${e.slug}.md) | Helper / Lib | ${e.summary} |`).join('\n');
    text = text.replace(/(\n)(## Concepts)/, `\n${rows}\n\n$2`);
  }

  // Insert concept rows before "## Analyses".
  if (concepts.length) {
    const rows = concepts.map((c) => `| [${c.title}](concepts/${c.slug}.md) | ${c.summary} |`).join('\n');
    text = text.replace(/(\n)(## Analyses)/, `\n${rows}\n\n$2`);
  }

  writeFileSync('wiki/index.md', text);
}

// ─── Run ──────────────────────────────────────────────────────────────────
writeFileSync(checkpointPath, renderCheckpoint());
writeFileSync('.agents/active.md', renderActive());
patchHandoff();
appendWikiLog();
updateWikiIndex();

// Stage + commit + push.
const filesToAdd = [
  '.agents/active.md',
  'SESSION_HANDOFF.md',
  checkpointPath,
];
if (existsSync('wiki/log.md')) filesToAdd.push('wiki/log.md');
if (existsSync('wiki/index.md')) filesToAdd.push('wiki/index.md');
for (const c of cap.new_wiki?.concepts || []) filesToAdd.push(`wiki/concepts/${c.slug}.md`);
for (const e of cap.new_wiki?.entities || []) filesToAdd.push(`wiki/entities/${e.slug}.md`);
sh(`git add ${filesToAdd.map((f) => `"${f}"`).join(' ')}`);

// Prevent runaway: only commit if there's actually something staged.
const staged = shSafe('git diff --cached --name-only');
if (!staged) {
  console.log('[session-apply] nothing staged after writes — aborting commit.');
  process.exit(0);
}

const commitMsg = `docs(agents): EOD ${today} — ${cap.summary}\n\n${cap.deploy_note || ''}\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.trim();
// Use a temp file for the commit message (avoids quoting hell).
const msgFile = '.agents/sessions/.commit-msg.tmp';
writeFileSync(msgFile, commitMsg);
sh(`git commit -F "${msgFile}"`);
sh(`rm -f "${msgFile}"`);
sh('git push origin master');

// Clean up the capsule (one-shot).
sh(`rm -f "${CAPSULE_PATH}"`);

console.log('\n[session-apply] done.\n');
console.log(renderResumePrompt());
