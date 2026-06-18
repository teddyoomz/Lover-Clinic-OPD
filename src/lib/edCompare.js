// edCompare.js — PURE compare helpers for the ED 2-panel detail modal. No React.
// Consumer: EDDetailModal (side-by-side round compare). Tested in tests/ed-compare.test.js.

const dkey = (r) => String(r?.assessmentDate || '').slice(0, 10);

// nearest PRIOR round (by assessmentDate) that measured `type`; fallback nearest LATER; else null.
// Excludes the primary round itself. Returns the round object (or null).
export function autoPickCompareRound(rounds, primaryRound, type) {
  if (!Array.isArray(rounds) || !primaryRound) return null;
  const pd = dkey(primaryRound);
  const others = rounds.filter(
    (r) => r && r.id !== primaryRound.id && Array.isArray(r.types) && r.types.includes(type)
  );
  if (!others.length) return null;
  const byDate = (a, b) => dkey(a).localeCompare(dkey(b));
  const prior = others.filter((r) => dkey(r) < pd).sort(byDate);
  if (prior.length) return prior[prior.length - 1]; // closest before
  const later = others.filter((r) => dkey(r) >= pd).sort(byDate);
  return later.length ? later[0] : null; // earliest after
}

// align two answer-row arrays by `n`; flag rows whose rendered answer differs (BOTH present).
// changed = both sides have a real answer (not '—') AND the labels differ. Returns
// { primary:[{...row, changed}], compare:[{...row, changed}] } — each side keeps its own rows.
export function markChangedRows(rowsPrimary, rowsCompare) {
  const a = Array.isArray(rowsPrimary) ? rowsPrimary : [];
  const b = Array.isArray(rowsCompare) ? rowsCompare : [];
  const byN = (rows) => new Map(rows.map((r) => [r.n, r]));
  const mapB = byN(b);
  const mapA = byN(a);
  const mark = (rows, other) =>
    rows.map((r) => {
      const o = other.get(r.n);
      const changed = !!o && r.answer !== o.answer && r.answer !== '—' && o.answer !== '—';
      return { ...r, changed };
    });
  return { primary: mark(a, mapB), compare: mark(b, mapA) };
}
