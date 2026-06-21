// fillerRefs.js — VERIFIED research citations behind the Filler Simulator math.
// SINGLE SOURCE for both (1) the in-app "งานวิจัยอ้างอิง" modal and (2) the PDF explainer,
// so the two can never drift. Every URL was fetched + confirmed to resolve to the stated
// paper on 2026-06-21 (PMC full-text / Oxford abstract / ISO catalogue).
// Pure data — no firebase/OPD imports (safe for the standalone public bundle).
//
// Attribution corrections made at verification time (do NOT regress):
//   • PMC9809476 = ZHANG CL et al. 2022 (Asian J Androl) — earlier notes wrongly said "Wang".
//   • PMC8987147 = AHN ST et al. 2021 (World J Mens Health) — a GIRTH RCT, not "flaccid/anti-retraction".
//   • Glans meta (JSM 2024, 706 pts) reports glans circumference +14.8mm (earlier note said +10.96mm).
export const FILLER_REFERENCES = [
  {
    n: 1, cite: 'PMC7230452', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7230452/',
    ref: 'Yang DY และคณะ (2020) · J Clin Med', refEn: 'Yang DY et al. (2020) · J Clin Med',
    desc: 'RCT เปรียบเทียบฟิลเลอร์ HA กับ PLA เพิ่มขนาดอวัยวะเพศ ติดตาม 18 เดือน (รอบวง +1.9 ซม. ที่ 6 เดือน)',
    descEn: 'RCT — HA vs PLA penile augmentation, 18-month follow-up (girth +1.9cm at 6mo)',
    usedTh: 'รอบวง · ตัวปรับ k', usedEn: 'girth · k factor',
  },
  {
    n: 2, cite: 'PMC9809476', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9809476/',
    ref: 'Zhang CL และคณะ (2022) · Asian J Androl', refEn: 'Zhang CL et al. (2022) · Asian J Androl',
    desc: 'ฉีด HA เพิ่มขนาด — วัดรอบวง + ความยาวตอนอ่อน (+2.55 ซม. ที่ 1 เดือน → +1.65 ซม. ที่ 12 เดือน)',
    descEn: 'HA augmentation — flaccid girth + length (+2.55cm@1mo → +1.65cm@12mo)',
    usedTh: 'ความยาวตอนอ่อน', usedEn: 'flaccid length',
  },
  {
    n: 3, cite: 'PMC8987147', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8987147/',
    ref: 'Ahn ST และคณะ (2021) · World J Mens Health', refEn: 'Ahn ST et al. (2021) · World J Mens Health',
    desc: 'RCT ฉีด HA เพิ่มรอบวง + ประเมินผลต่อการหลั่ง (HA เทียบ PLA)',
    descEn: 'RCT — HA penile girth enhancement + ejaculation outcomes',
    usedTh: 'รอบวง', usedEn: 'girth',
  },
  {
    n: 4, cite: 'J Sex Med 2024; 21(10):878', url: 'https://academic.oup.com/jsm/article-abstract/21/10/878/7730561',
    ref: 'Systematic review / meta-analysis (2024) · J Sex Med', refEn: 'Systematic review / meta-analysis (2024) · J Sex Med',
    desc: 'รวม 13 งานวิจัย · 706 ผู้ป่วย — ฉีด HA ส่วนหัว เพิ่มรอบวงส่วนหัวเฉลี่ย +14.8 มม.',
    descEn: '13 studies · 706 patients — glans HA augmentation, glans circumference +14.8mm',
    usedTh: 'ขนาดส่วนหัว', usedEn: 'glans size',
  },
  {
    n: 5, cite: 'ISO 4074', url: 'https://www.iso.org/standard/80460.html',
    ref: 'ISO 4074 · มาตรฐานสากล', refEn: 'ISO 4074 · International Standard',
    desc: 'มาตรฐานถุงยางอนามัยลาเท็กซ์ — กำหนด “nominal width” (= ครึ่งเส้นรอบวง)',
    descEn: 'Latex male-condom standard — defines “nominal width” (= half the circumference)',
    usedTh: 'ขนาดถุงยาง', usedEn: 'condom size',
  },
];
