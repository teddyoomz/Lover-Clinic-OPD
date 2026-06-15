// assessmentMaterialize.js — PURE (CommonJS, no firebase imports) so it's
// unit-testable. Builds the be_assessments round patch from a customer-filled
// follow-up opd_session. Scores are NOT computed here — the display side
// (assessmentRoundsCore + edScoreDisplay) derives them from rawAnswers, so the
// CF only needs to snapshot the raw answers (durable; survives session cleanup).

const PERF_RE = /^(adam_|iief_|mrs_)/;

function isMeaningful(v) {
  return v === true || (typeof v === 'string' && v !== '') || (typeof v === 'number' && Number.isFinite(v));
}

// Extract only the meaningful ED assessment answers from a patientData object.
function pickPerf(pd) {
  const out = {};
  const src = pd || {};
  for (const k of Object.keys(src)) {
    if ((PERF_RE.test(k) || k === 'symp_pe') && isMeaningful(src[k])) out[k] = src[k];
  }
  return out;
}

// Build the merge-patch for the linked be_assessments round, or null if the
// session has no meaningful ED answers (don't mark a blank submit completed).
function buildAssessmentRoundPatch(session, nowISO) {
  const pd = (session && session.patientData) || {};
  const raw = pickPerf(pd);
  if (Object.keys(raw).length === 0) return null;
  return {
    status: 'completed',
    rawAnswers: raw,
    assessmentDate: pd.assessmentDate || nowISO || '',
  };
}

// Should this session materialize into a be_assessments round?
function isMaterializableAssessment(session) {
  return !!(session
    && String(session.formType || '').startsWith('followup')
    && session.linkedAssessmentRoundId
    && session.patientData);
}

module.exports = { pickPerf, buildAssessmentRoundPatch, isMaterializableAssessment };
