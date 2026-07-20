// ─── diag-webhook-signature-probe.mjs (2026-07-21) — Rule Q L2 probe ────────
// POSTs an UNSIGNED, side-effect-free payload (entry:[] / events:[]) to the
// LIVE webhook endpoints and reports the status code.
//
//   PRE-fix  (fail-open bug): FB returns 200 (processed without a signature)
//   POST-fix (fail-closed):   FB returns 401 · LINE has always returned 401
//
// Zero side-effects: an empty entry/events array processes nothing.
//   node scripts/diag-webhook-signature-probe.mjs [--base https://...]
const baseArg = process.argv.indexOf('--base');
const BASE = baseArg > -1 ? process.argv[baseArg + 1] : 'https://lover-clinic-app.vercel.app';

async function probe(label, path, body) {
  const resp = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = (await resp.text()).slice(0, 120);
  console.log(`${label}: HTTP ${resp.status} — ${text}`);
  return resp.status;
}

const fb = await probe('FB   unsigned POST', '/api/webhook/facebook', { object: 'page', entry: [] });
const line = await probe('LINE unsigned POST', '/api/webhook/line', { destination: 'x', events: [] });
console.log('');
console.log(fb === 401 ? '✓ FB fail-closed (fixed)' : `✗ FB FAIL-OPEN (status ${fb}) — unsigned requests are processed`);
console.log(line === 401 ? '✓ LINE fail-closed' : `✗ LINE unexpected status ${line}`);
process.exit(0);
