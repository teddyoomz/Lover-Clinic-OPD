// assessmentRoundsCore.js — PURE. No Firestore, no React.
// ED follow-up assessment rounds: round number is DERIVED (date-rank), never a
// stored field → deleting a round renumbers automatically (mis-fill recovery, Q4).
// Round 1 = a VIRTUAL record read live from be_customers.patientData (the intake
// perf fields) → works immediately for current customers, zero migration.
//
// intakePerf: pickKioskAssessmentFields(customer.patientData) — {} if none.
// beAssessments: array of be_assessments docs (only status==='completed' counts).

export const ED_TYPES = ['adam', 'iief', 'mrs', 'pe'];

const isMeaningful = (v) =>
  v === true || (typeof v === 'string' && v !== '') || (typeof v === 'number' && Number.isFinite(v));

function hasPerf(raw) {
  if (!raw || typeof raw !== 'object') return false;
  return Object.keys(raw).some(
    (k) => (/^(adam_|iief_|mrs_)/.test(k) || k === 'symp_pe') && isMeaningful(raw[k]),
  );
}

// Which assessment types a raw answer-set actually contains.
function typesInRaw(raw) {
  const r = raw || {};
  const t = [];
  if (Object.keys(r).some((k) => k.startsWith('adam_') && r[k] === true)) t.push('adam');
  if (Object.keys(r).some((k) => k.startsWith('iief_') && isMeaningful(r[k]))) t.push('iief');
  if (Object.keys(r).some((k) => k.startsWith('mrs_') && isMeaningful(r[k]))) t.push('mrs');
  if (r.symp_pe) t.push('pe');
  return t;
}

// Build the sorted round list (date asc) with derived round# (1-based).
export function deriveRounds(intakePerf, beAssessments) {
  const list = [];
  if (hasPerf(intakePerf)) {
    list.push({
      id: '__intake__', source: 'intake', deletable: false,
      assessmentDate: intakePerf.assessmentDate || '', raw: intakePerf,
      types: typesInRaw(intakePerf),
    });
  }
  for (const a of beAssessments || []) {
    if (a && a.status && a.status !== 'completed') continue; // pending link not yet filled → not a round
    const raw = (a && a.rawAnswers) || {};
    list.push({
      id: a.id, source: 'followup', deletable: true,
      assessmentDate: (a && a.assessmentDate) || '', raw,
      types: a && Array.isArray(a.types) && a.types.length ? a.types : typesInRaw(raw),
      scores: a && a.scores, createdBy: a && a.createdBy,
    });
  }
  // sort by date asc (stable for blank/equal dates → insertion order preserved)
  list.sort((x, y) => String(x.assessmentDate).localeCompare(String(y.assessmentDate)));
  return list.map((r, i) => ({ ...r, round: i + 1 }));
}

// Next round number = current count + 1 (delete renumbers because it's derived).
export function nextRoundNumber(intakePerf, beAssessments) {
  return deriveRounds(intakePerf, beAssessments).length + 1;
}

// Each type → the most-recent round (by date) that measured it, or null.
export function latestPerType(intakePerf, beAssessments) {
  const rounds = deriveRounds(intakePerf, beAssessments);
  const out = { adam: null, iief: null, mrs: null, pe: null };
  for (const r of rounds) for (const t of r.types) out[t] = r; // later (newer) overwrites
  return out;
}

// Latest N rounds, newest first (for compact displays — TFP latest-2).
export function latestRounds(intakePerf, beAssessments, n = 2) {
  const rounds = deriveRounds(intakePerf, beAssessments);
  return rounds.slice(-n).reverse();
}
