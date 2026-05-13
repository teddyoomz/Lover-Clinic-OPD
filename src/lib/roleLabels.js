// src/lib/roleLabels.js
//
// Phase 28 (2026-05-14) — extracted from CustomerDetailView.jsx for shared
// consumption by treatment-history components (Rule C1 — Rule of 3).
//
// Original Phase 26.1c (V26.1, 2026-05-13) — editor-attribution role labels
// (Thai). Maps editedByRole values from EditAttributionModal back to display
// text. Used in row meta "· แก้ไขโดย: <name> (<role>)".
//
// Pure JS · branch-blind · no React/Firestore deps.

export const ROLE_LABEL_TH = {
  doctor: 'แพทย์',
  assistant: 'ผู้ช่วย',
  staff: 'พนักงาน',
};
