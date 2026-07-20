// Diag — run the REAL Followers-API backfill (handleListBackfill from
// /api/admin/line-friends) against a real branch's LINE OA, from local
// (Rule R env pull). Answers definitively:
//   - followersApi 'ok'  → the OA is verified/premium → full roster pulls work
//   - followersApi 'unavailable' → unverified OA (403) → picker relies on the
//     chat + follow-event legs only (by design, not an error)
// Writes = the feature's own production roster docs (be_line_friends,
// source:'followers-api', merge on unknown-only) — kept, not cleaned.
//
// Usage:
//   node scripts/diag-line-friends-backfill.mjs                 (Korat, 1 round)
//   node scripts/diag-line-friends-backfill.mjs --rounds 8      (loop until skipped=0 or N rounds)
//   node scripts/diag-line-friends-backfill.mjs --branch BR-xxx
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const KORAT = 'BR-1777873556815-26df6480'; // นครราชสีมา
const argBranch = process.argv.indexOf('--branch');
const BRANCH_ID = argBranch > -1 ? process.argv[argBranch + 1] : KORAT;
const argRounds = process.argv.indexOf('--rounds');
const ROUNDS = argRounds > -1 ? Math.max(1, Number(process.argv[argRounds + 1]) || 1) : 1;

const env = Object.fromEntries(readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8')
  .split(/\r?\n/).filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
process.env.FIREBASE_ADMIN_CLIENT_EMAIL = env.FIREBASE_ADMIN_CLIENT_EMAIL;
process.env.FIREBASE_ADMIN_PRIVATE_KEY = env.FIREBASE_ADMIN_PRIVATE_KEY;
process.env.FIREBASE_ADMIN_PROJECT_ID = APP_ID;

if (!adminApps().length) adminInit({ credential: cert({ projectId: APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n') }) });
const db = adminFirestore();

async function main() {
  const { handleListBackfill } = await import('../api/admin/line-friends.js');
  console.log(`\n═══ Followers-API backfill diag — branch ${BRANCH_ID} (${ROUNDS} round max) ═══`);
  let totalBackfilled = 0;
  for (let r = 1; r <= ROUNDS; r++) {
    // NOTE: the endpoint's 60s module cache is per-process — same-process loop
    // rounds would hit it, so we bust by deleting the cache entry via a fresh
    // dynamic import? No — simplest: the cache Map lives in the imported
    // module; rounds > 1 within 60s return cached. We therefore wait out the
    // TTL between rounds only when needed.
    const res = await handleListBackfill({ db, branchId: BRANCH_ID });
    console.log(`\n[round ${r}]`, JSON.stringify(res));
    if (res.followersApi !== 'ok') {
      console.log('\n→ OA นี้เรียก Followers API ไม่ได้ (unverified/no-token) — picker จะใช้ขาแชท+follow event ตามดีไซน์');
      break;
    }
    totalBackfilled += res.backfilled || 0;
    if (!res.cached && (res.skipped || 0) === 0) { console.log('\n→ ครบแล้ว — ไม่มี id ที่ยังไม่รู้จักเหลือ'); break; }
    if (r < ROUNDS) {
      console.log('    …waiting 61s for the module cache TTL before the next round');
      await new Promise((res2) => setTimeout(res2, 61_000));
    }
  }

  // Roster state + a tiny sample (names truncated)
  const snap = await db.collection(`artifacts/${APP_ID}/public/data/be_line_friends`).where('branchId', '==', BRANCH_ID).get();
  console.log(`\nbe_line_friends @${BRANCH_ID}: ${snap.size} docs (this run backfilled ${totalBackfilled})`);
  snap.docs.slice(0, 3).forEach((d) => {
    const x = d.data();
    console.log(`  · ${String(x.displayName || '').slice(0, 20)} — ${String(x.lineUserId || '').slice(0, 12)}… — source=${x.source} pic=${x.pictureUrl ? 'yes' : 'no'}`);
  });
  process.exit(0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
