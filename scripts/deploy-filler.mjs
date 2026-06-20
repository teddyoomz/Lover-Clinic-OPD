// Dual-deploy: OPD project + standalone filler project, in one command.
// The standalone is deployed as a PREBUILT STATIC directory (dist-filler) with a
// dedicated config (vercel.filler.json — no functions/crons) so ONLY the built
// files upload and NO OPD serverless function ever reaches the public project.
// Needs: vercel CLI authed; VERCEL_ORG_ID + VERCEL_FILLER_PROJECT_ID (+ optional
// VERCEL_SCOPE) loaded from .env.filler-deploy (gitignored). Run: `npm run deploy:filler`.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const run = (cmd, env) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });

// Parse .env.filler-deploy into a LOCAL map. Do NOT mutate process.env — the OPD
// deploy (step 2) must NOT inherit VERCEL_ORG_ID/PROJECT_ID, or vercel would try to
// override the OPD `.vercel` link (and a lone VERCEL_ORG_ID errors outright:
// "You specified VERCEL_ORG_ID but you forgot VERCEL_PROJECT_ID").
const fillerEnv = {};
try {
  for (const line of readFileSync('.env.filler-deploy', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
    if (m) fillerEnv[m[1]] = m[2];
  }
} catch { /* no env file yet */ }

console.log('▶ 1/3  verify public bundle (builds dist-filler, no firebase/OPD, 3D present)…');
run('node scripts/verify-filler-bundle.mjs');

console.log('▶ 2/3  deploy OPD project (lover-clinic-app) via its .vercel link…');
// Strip any inherited VERCEL_ORG_ID/PROJECT_ID so vercel uses .vercel/project.json.
const opdEnv = { ...process.env };
delete opdEnv.VERCEL_ORG_ID;
delete opdEnv.VERCEL_PROJECT_ID;
execSync('vercel --prod --yes', { stdio: 'inherit', env: opdEnv });

console.log('▶ 3/3  deploy standalone (loverclinic) — prebuilt static dist-filler only…');
const { VERCEL_ORG_ID, VERCEL_FILLER_PROJECT_ID, VERCEL_SCOPE } = fillerEnv;
if (!VERCEL_ORG_ID || !VERCEL_FILLER_PROJECT_ID) {
  console.error('Set VERCEL_ORG_ID + VERCEL_FILLER_PROJECT_ID in .env.filler-deploy before deploying the standalone.');
  process.exit(1);
}
// `vercel deploy <dir>` uploads <dir> but reads vercel.json from the CWD (the OPD
// one, with its functions block) → must override with --local-config so the static
// config (no functions) is used. Env vars target the loverclinic project.
const scope = VERCEL_SCOPE ? ` --scope ${VERCEL_SCOPE}` : '';
run(`vercel deploy dist-filler --prod --yes --local-config vercel.filler.json${scope}`,
    { VERCEL_ORG_ID, VERCEL_PROJECT_ID: VERCEL_FILLER_PROJECT_ID });
console.log('✅ both deployed.');
