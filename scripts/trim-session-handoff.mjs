// Trim SESSION_HANDOFF.md to the newest 10 `### Session` blocks + 10 `## Current State`
// one-line bullets; move the overflow to .agents/sessions/session-handoff-archive.md
// (prepend a dated batch at the TOP). IDEMPOTENT — no-op when already <= 10+10.
// Run as the LAST step of /session-end (after inserting today's block + bullet):
//   node scripts/trim-session-handoff.mjs            (default today's date)
//   node scripts/trim-session-handoff.mjs 2026-06-16 (override batch date)
// Detail per session lives in .agents/sessions/*.md checkpoints + v-log-archive.md,
// so trimming loses nothing. Count cap (10+10), NOT a byte cap. (Origin: 2026-06-16,
// "ให้มันเหลือแค่ 10 session ... จะได้ไม่ต้องมานั่งเปลือง token อ่านไฟล์ใหญ่ๆ".)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SH = 'SESSION_HANDOFF.md';
const AR = '.agents/sessions/session-handoff-archive.md';
const KEEP = 10;
const TODAY = process.argv[2] || new Date().toISOString().slice(0, 10);
const EM = '—'; // em dash

const lines = readFileSync(SH, 'utf8').split('\n');
const csIdx = lines.findIndex((l) => l.startsWith('## Current State'));
const sess = lines.map((l, i) => [l, i]).filter(([l]) => l.startsWith('### Session ')).map(([, i]) => i);
if (csIdx < 0 || sess.length === 0) { console.error('trim: structure not found — aborting'); process.exit(1); }

// Current State one-line bullets (NEW or legacy Date), between heading and first session block.
const bullets = [];
for (let i = csIdx + 1; i < sess[0]; i++) {
  if (lines[i].startsWith('- **NEW (') || lines[i].startsWith('- **Date (')) bullets.push(i);
}

if (bullets.length <= KEEP && sess.length <= KEEP) {
  console.log(`trim: already within cap (${sess.length} sessions, ${bullets.length} bullets) — no-op`);
  process.exit(0);
}

const sdate = (idx) => lines[idx].slice(12).split(EM)[0].trim();
const firstArch = sdate(sess[KEEP] ?? sess[sess.length - 1]);
const lastArch = sdate(sess[sess.length - 1]);

// --- kept slices ---
const csKeep = bullets.length > KEEP ? lines.slice(bullets[0], bullets[KEEP - 1] + 1) : lines.slice(bullets[0], bullets[bullets.length - 1] + 1);
const csDrop = bullets.length > KEEP ? lines.slice(bullets[KEEP], bullets[bullets.length - 1] + 1) : [];

let sessKeep, sessDrop;
if (sess.length > KEEP) {
  sessKeep = lines.slice(sess[0], sess[KEEP]);
  sessDrop = lines.slice(sess[KEEP]);
} else {
  sessKeep = lines.slice(sess[0]);
  sessDrop = [];
}
const trimBlank = (a) => { while (a.length && a[0].trim() === '') a.shift(); while (a.length && a[a.length - 1].trim() === '') a.pop(); return a; };
trimBlank(sessKeep); trimBlank(sessDrop); trimBlank(csDrop);

const footer = ['', '---', '',
  `\u{1F4C2} **Older sessions (\`${firstArch}\` and earlier) + older Current-State index entries ` +
  '→ `.agents/sessions/session-handoff-archive.md`** (cold storage, NOT read at boot).', ''];
const out = [...lines.slice(0, csIdx + 1), '', ...csKeep, '', ...sessKeep, ...footer];
writeFileSync(SH, out.join('\n'), 'utf8');

// --- prepend overflow to archive (newest batch at TOP) ---
if ((sessDrop.length || csDrop.length) && existsSync(AR)) {
  const ar = readFileSync(AR, 'utf8').split('\n');
  let ins = ar.findIndex((l) => l.startsWith('## Archived '));
  if (ins < 0) ins = ar.length;
  const batch = [
    `## Archived ${TODAY} — SESSION_HANDOFF overflow: sessions \`${firstArch}\` → \`${lastArch}\` + Current-State index`,
    '',
  ];
  if (sessDrop.length) batch.push(`### Session blocks (${sessDrop.filter((l) => l.startsWith('### Session ')).length})`, '', ...sessDrop, '');
  if (csDrop.length) batch.push('### Current State index entries', '', ...csDrop, '');
  batch.push('---', '');
  ar.splice(ins, 0, ...batch);
  writeFileSync(AR, ar.join('\n'), 'utf8');
}

console.log(`trim: kept ${KEEP} sessions + ${Math.min(KEEP, bullets.length)} bullets; archived ${sessDrop.filter((l) => l.startsWith('### Session ')).length} session blocks + ${csDrop.filter((l) => l.trim()).length} bullets`);

// self-check
const after = readFileSync(SH, 'utf8').split('\n');
const nSess = after.filter((l) => l.startsWith('### Session ')).length;
const nBul = after.filter((l) => l.startsWith('- **NEW (') || l.startsWith('- **Date (')).length;
if (nSess > KEEP || nBul > KEEP) { console.error(`trim SELF-CHECK FAILED: ${nSess} sessions / ${nBul} bullets remain`); process.exit(1); }
console.log(`trim: ok — ${nSess} sessions / ${nBul} bullets, ~${Math.round(Buffer.byteLength(after.join('\n')) / 4)} tokens`);
