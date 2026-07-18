// ─── patient-view warmup cron (2026-07-19) ───────────────────────────────────
// Perf punchlist residual (2026-07-06 P3 / AV204 note): the /api/patient-view
// serverless COLD start costs ~3.5s (admin init + first Firestore RTT) — the
// remaining LCP floor for customer ?patient= links after the AV204 early-fetch
// fix. Vercel lambdas are per-function, so warming must go THROUGH the real
// endpoint: this cron fetches /api/patient-view?ping=1 every 5 minutes, which
// runs getDb() + a bounded 1-doc read inside THAT function's container.
//
// Canonical cron skeleton (opd-session-cleanup-sweep pattern): inline
// CRON_SECRET gate (Bearer or x-cron-secret). No Firestore writes, no audit
// doc (read-only warm; nothing to audit).
export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || '';
  const provided = authHeader.replace(/^Bearer\s+/i, '') || req.headers['x-cron-secret'];
  if (!cronSecret || provided !== cronSecret) {
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
  }

  const base = process.env.PATIENT_VIEW_WARMUP_ORIGIN || 'https://lover-clinic-app.vercel.app';
  const started = Date.now();
  try {
    const r = await fetch(`${base}/api/patient-view?ping=1`, { method: 'GET' });
    const body = await r.json().catch(() => null);
    return res.status(200).json({
      ok: true, status: r.status, warmed: body?.ping === true, ms: Date.now() - started,
    });
  } catch (e) {
    // Non-fatal — a failed warm just means the next customer hit is cold
    // (pre-cron behavior). Report, don't throw.
    return res.status(200).json({ ok: false, error: String(e?.message || e), ms: Date.now() - started });
  }
}
