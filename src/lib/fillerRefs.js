// fillerRefs.js — VERIFIED research citations behind the Filler Simulator math.
// SINGLE SOURCE for both (1) the in-app "งานวิจัยอ้างอิง" modal and (2) the PDF explainer,
// so the two can never drift. Every URL + full title was fetched + confirmed to resolve to
// the stated paper on 2026-06-21 (PMC full-text / Oxford abstract / ISO catalogue).
// Pure data — no firebase/OPD imports (safe for the standalone public bundle).
//
// Attribution corrections made at verification time (do NOT regress):
//   • PMC9809476 = ZHANG CL et al. 2022 (Asian J Androl) — earlier notes wrongly said "Wang".
//   • PMC8987147 = AHN ST et al. 2021 (World J Mens Health) — a GIRTH RCT, not "flaccid/anti-retraction".
//   • Glans meta (JSM 2024, 706 pts) reports glans circumference +14.8mm (earlier note said +10.96mm).
//
// `ref`/`refEn` = authors · journal · year (bilingual). `title` = the paper's real full title
// (English — the credible, citable name; shown verbatim in the app + PDF).
export const FILLER_REFERENCES = [
  {
    n: 1, cite: 'PMC7230452', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7230452/',
    ref: 'Yang DY และคณะ (2020) · J Clin Med', refEn: 'Yang DY et al. (2020) · J Clin Med',
    title: 'Comparison of Clinical Outcomes between Hyaluronic and Polylactic Acid Filler Injections for Penile Augmentation in Men Reporting a Small Penis: A Multicenter, Patient/Evaluator-Blinded, Non-Inferiority, Randomized Comparative Trial with 18 Months of Follow-up',
  },
  {
    n: 2, cite: 'PMC9809476', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9809476/',
    ref: 'Zhang CL และคณะ (2022) · Asian J Androl', refEn: 'Zhang CL et al. (2022) · Asian J Androl',
    title: 'Penile augmentation with injectable hyaluronic acid gel: an alternative choice for small penis syndrome',
  },
  {
    n: 3, cite: 'PMC8987147', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8987147/',
    ref: 'Ahn ST และคณะ (2021) · World J Mens Health', refEn: 'Ahn ST et al. (2021) · World J Mens Health',
    title: 'Efficacy and Safety of Penile Girth Enhancement Using Hyaluronic Acid Filler and the Clinical Impact on Ejaculation: A Multi-Center, Patient/Evaluator-Blinded, Randomized Active-Controlled Trial',
  },
  {
    n: 4, cite: 'J Sex Med 2024; 21(10):878', url: 'https://academic.oup.com/jsm/article-abstract/21/10/878/7730561',
    ref: 'Meta-analysis (2024) · J Sex Med', refEn: 'Systematic review / meta-analysis (2024) · J Sex Med',
    title: 'Clinical efficacy and safety of hyaluronic acid gel injection in the glans penis for treatment of premature ejaculation: a systematic review and meta-analysis (13 studies · 706 patients)',
  },
  {
    n: 5, cite: 'ISO 4074', url: 'https://www.iso.org/standard/80460.html',
    ref: 'ISO 4074 · มาตรฐานสากล', refEn: 'ISO 4074 · International Standard',
    title: 'Natural rubber latex male condoms — Requirements and test methods',
  },
  {
    // Glans (head) augmentation anchor — foundational + dose source for the cube-root glans model.
    // Verified 2026-06-21: first author Du Geon Moon, WJMH 2015;33(2):50-61. 2cc → glans circ
    // +16.58mm peak (6mo) → +14.10mm durable (5yr, 15% resorption). All glans studies used ≤3 mL.
    n: 6, cite: 'PMC4550597', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4550597/',
    ref: 'Moon DG และคณะ (2015) · World J Mens Health', refEn: 'Moon DG et al. (2015) · World J Mens Health',
    title: 'Glans Penis Augmentation Using Hyaluronic Acid Gel as an Injectable Filler',
  },
];

// Honest caveat for the glans model (SINGLE SOURCE — shown in the in-app references modal AND the PDF
// explainer). All published glans studies tested ≤3 mL; 3–15 cc is a volume-conservation extrapolation,
// cross-validated by 20 mL shaft trials that keep growing — NOT a directly-studied glans dose.
export const GLANS_CAVEAT = {
  th: 'งานวิจัยขยายส่วนหัว (glans) ทุกชิ้นทดสอบที่ ≤3 mL (หลักๆ 2 mL). ช่วง 3–15 cc เป็นการประมาณตามหลักการคงปริมาตร (ฟิลเลอร์ = ปริมาตรที่เพิ่มเข้าไป) สอดคล้องกับงานวิจัยลำตัวที่ฉีด ~20 mL แล้วยังโตต่อเนื่อง — ไม่ใช่ค่าจากงานวิจัยหัวโดยตรงเกิน 3 mL.',
  en: 'All glans-augmentation studies tested ≤3 mL (mostly 2 mL). The 3–15 cc range is a volume-conservation extrapolation (filler = added volume), consistent with shaft trials injecting ~20 mL that keep growing — not a directly-studied glans dose above 3 mL.',
};
