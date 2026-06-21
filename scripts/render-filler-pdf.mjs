// Build + render a branded PDF explaining the filler size math.
// Uses the REAL estimate() from fillerMath.js (worked example matches the live app) +
// the shared verified citations from fillerRefs.js. Renders via Playwright.
// Order (user 2026-06-21): know the VARIABLES + their sources FIRST → then teach the
// formulas → then the worked example. Output: docs/filler-math-explainer.pdf
import fs from 'node:fs';
import { chromium } from 'playwright';
import { estimate, diameterFromGirth, K_DURABLE, K_PEAK, GLANS_VISUAL_MAX_DELTA, GLANS_VISUAL_HALF_CC, GLANS_DIAM_PER_CC, GLANS_SATURATION_CC, FLACCID_LEN_HALF_CC, FLACCID_LEN_MAX_DURABLE, FLACCID_LEN_MAX_PEAK } from '../src/lib/fillerMath.js';
import { FILLER_REFERENCES } from '../src/lib/fillerRefs.js';

const b64 = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
const logoDark = b64('public/lover-clinic-logo-dark.png');
const logoLight = b64('public/lover-clinic-logo-light.png');

const refUrl = (n) => (FILLER_REFERENCES.find((r) => r.n === n) || {}).url || '#';
const refLink = (...ns) => ns.map((n) => `<a href="${refUrl(n)}" class="reflink">[${n}]</a>`).join('');

const SHAFT = 15, HEAD = 5;
const C0 = 52 / 5, L = 5 * 2.54;
const dg0base = 1.0 * diameterFromGirth(C0);
const e = estimate({ lengthCm: L, baseGirthCm: C0, shaftCc: SHAFT, glansCc: HEAD, baseGlansDiameterCm: dg0base });
const gGeom = (e.c1Low - C0) / K_DURABLE;
const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2);

function curvePath(half, w, h, xmax) {
  const pts = [];
  for (let i = 0; i <= 60; i++) { const x = (i / 60) * xmax; const y = 1 - Math.exp(-x / half); pts.push([(x / xmax) * w, h - y * h]); }
  return 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L');
}
const CURVE = curvePath(GLANS_VISUAL_HALF_CC, 230, 96, 24);
const halfX = (GLANS_VISUAL_HALF_CC / 24) * 230;

const html = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap');
@page { size: A4; margin: 0; }
* { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
:root { --ink:#1a1714; --muted:#7a716a; --fire:#e23744; --ember:#b3121f; --cream:#faf6f2; --hair:#ece4dc; --soft:#fbeeea; --charcoal:#141217; }
body { font-family:'Sarabun','Leelawadee UI','Tahoma',sans-serif; color:var(--ink); background:var(--cream); font-size:13px; line-height:1.55; }
.page { width:210mm; min-height:297mm; padding:0 0 14mm; position:relative; }
.page + .page { page-break-before:always; }
.mono { font-family:'JetBrains Mono',ui-monospace,monospace; }
a { color:inherit; }
.reflink { color:var(--ember); font-weight:700; text-decoration:none; border-bottom:1.5px solid var(--fire); padding:0 1px; }
.hero { background:linear-gradient(120deg,#141217 0%,#241015 55%,#3a0d12 100%); color:#fff; padding:14mm 16mm 8mm; position:relative; overflow:hidden; }
.hero::after { content:''; position:absolute; left:16mm; bottom:5mm; width:46mm; height:3px; background:linear-gradient(90deg,var(--fire),transparent); border-radius:2px; }
.hero img { height:25px; opacity:.96; margin-bottom:11px; }
.hero h1 { font-size:23px; font-weight:800; letter-spacing:-.4px; line-height:1.15; }
.hero h1 .accent { color:#ff5b66; }
.hero p { margin-top:6px; font-size:12px; color:#e8cdcd; font-weight:300; max-width:150mm; }
.kicker { font-size:11px; letter-spacing:3px; text-transform:uppercase; color:#ff97a0; font-weight:700; margin-bottom:7px; }
.body { padding:7mm 16mm 0; }
.lead { font-size:12.5px; color:#564c45; margin-bottom:11px; }
.lead b { color:var(--ember); font-weight:700; }
.chips { display:flex; gap:8px; margin:0 0 13px; }
.chip { flex:1; background:#fff; border:1px solid var(--hair); border-radius:11px; padding:8px 11px; border-top:3px solid var(--fire); }
.chip .n { font-size:10px; color:var(--fire); font-weight:800; }
.chip .t { font-size:12px; font-weight:700; margin-top:2px; }
.chip .s { font-size:10px; color:var(--muted); }
.sec { background:#fff; border:1px solid var(--hair); border-left:4px solid var(--fire); border-radius:0 12px 12px 0; padding:12px 16px; margin-bottom:11px; }
.sec h2 { font-size:15px; font-weight:800; color:var(--charcoal); display:flex; align-items:center; gap:9px; }
.sec h2 .num { background:var(--fire); color:#fff; width:22px; height:22px; border-radius:7px; font-size:13px; display:inline-flex; align-items:center; justify-content:center; flex:none; }
.sec .desc { color:#5d534c; font-size:12px; margin:6px 0 0; }
.formula { font-family:'JetBrains Mono',monospace; background:#1c1a20; color:#ffd7da; border-radius:9px; padding:10px 14px; margin:8px 0; font-size:12.5px; font-weight:500; }
.formula .var { color:#7fd6ff; } .formula .op { color:#ff8a93; }
.note { font-size:11.5px; color:var(--muted); margin-top:4px; } .note b { color:var(--ember); }
.split { display:flex; gap:13px; align-items:center; } .split .txt { flex:1; } .diagram { flex:none; }
.tag { display:inline-block; font-size:10px; font-weight:700; padding:2px 8px; border-radius:20px; }
.tag.med { background:#e7f3ee; color:#0f7a52; } .tag.vis { background:var(--soft); color:var(--ember); }
table { width:100%; border-collapse:collapse; font-size:12px; margin-top:4px; border-radius:10px; overflow:hidden; }
th { background:linear-gradient(90deg,var(--ember),var(--fire)); color:#fff; text-align:left; padding:8px 11px; font-weight:700; font-size:11.5px; }
td { padding:5px 11px; border-bottom:1px solid var(--hair); vertical-align:top; }
tr:nth-child(even) td { background:#fcf8f5; }
td.r { text-align:right; font-family:'JetBrains Mono',monospace; } td b { color:var(--ember); }
.refs { font-size:9.5px; line-height:1.36; color:#4f463f; }
.refs li { margin-bottom:3px; padding-left:3px; }
.refs .ti { font-style:italic; color:#5d534c; }
.refs .pmc { font-family:'JetBrains Mono',monospace; font-size:10px; }
.footer { margin:13px 16mm 0; padding-top:10px; border-top:1px solid var(--hair); display:flex; justify-content:space-between; align-items:center; color:var(--muted); font-size:10.5px; }
.footer img { height:16px; opacity:.55; }
.disc { background:var(--soft); border-radius:10px; padding:10px 14px; font-size:11px; color:#8a4a44; margin:11px 16mm 0; }
.svglabel { font-family:'Sarabun',sans-serif; font-size:9.5px; fill:var(--muted); }
</style></head><body>

<!-- PAGE 1 — รู้จักตัวแปร + ที่มางานวิจัย ก่อน -->
<div class="page">
  <div class="hero">
    <div class="kicker">Lover Clinic · Filler Simulator</div>
    <img src="${logoDark}" alt="Lover Clinic">
    <h1>วิธีคำนวณ<span class="accent">ขนาด</span>จากการฉีดฟิลเลอร์</h1>
    <p>โมเดลคณิตศาสตร์เบื้องหลังเครื่องจำลอง — รอบวง · ขนาดถุงยาง · ส่วนหัว · ความยาว ทุกค่าอ้างอิงงานวิจัยจริง</p>
  </div>
  <div class="body">
    <p class="lead">เริ่มจาก <b>รู้จักตัวแปรแต่ละตัว + ที่มางานวิจัย</b> ก่อน (ตารางด้านล่าง) แล้วจึงดูวิธีนำมาคำนวณทีละค่าในหน้า 2–3 · กดเลข [n] หรือชื่องานวิจัยเพื่อเปิดต้นฉบับ</p>
    <div class="chips">
      <div class="chip"><div class="n">01</div><div class="t">รอบวงลำตัว</div><div class="s">girth → Ø</div></div>
      <div class="chip"><div class="n">02</div><div class="t">ขนาดถุงยาง</div><div class="s">ISO 4074</div></div>
      <div class="chip"><div class="n">03</div><div class="t">ส่วนหัว</div><div class="s">glans</div></div>
      <div class="chip"><div class="n">04</div><div class="t">ความยาว</div><div class="s">flaccid</div></div>
    </div>
    <div class="sec">
      <h2><span class="num">📚</span> ที่มาของแต่ละตัวแปร</h2>
      <table style="margin-top:8px">
        <tr><th style="width:27%">ตัวแปร / โมเดล</th><th style="width:22%">ค่าที่ใช้</th><th>ที่มา</th></tr>
        <tr><td>โมเดลรอบวง (cylinder-shell)</td><td class="mono" style="font-size:11px">√(C₀²+4πV/L)</td><td>เรขาคณิต first-principles (พื้นที่หน้าตัด A=C²/4π) — ไม่ใช่ค่าจากวิจัย</td></tr>
        <tr><td>ตัวปรับ k (คงตัว / พีค)</td><td class="mono" style="font-size:11px">1.22 / 1.90</td><td>คาลิเบรตจาก RCT การฉีดเพิ่มรอบวง ${refLink(1, 3)} (12 เดือน k≈1.22, ~1 เดือน k≈1.90)</td></tr>
        <tr><td>ΔØ ส่วนหัว (แพทย์)</td><td class="mono" style="font-size:11px">0.13–0.24 cm/cc<br>อิ่มตัว 2 mL</td><td>meta-analysis ขยายส่วนหัว 706 ราย ${refLink(4)} (+14.8 mm รอบวงหัว → ΔØ ~0.47 cm ที่ plateau)</td></tr>
        <tr><td>ความยาวตอนอ่อน</td><td class="mono" style="font-size:11px">+2.0 / +3.0 cm<br>half 10 cc</td><td>cohort วัดความยาวตอนอ่อน ${refLink(2)} (+2.55cm พีค → +1.65cm คงตัว ที่ ~15–21 mL)</td></tr>
        <tr><td>ความกว้างถุงยาง</td><td class="mono" style="font-size:11px">รอบวง × 5</td><td>มาตรฐาน ISO 4074 ${refLink(5)} (nominal width = ครึ่งรอบวง)</td></tr>
        <tr><td>ภาพส่วนหัว (visual)</td><td class="mono" style="font-size:11px">1−e^(−cc/6)</td><td>เส้นโค้งอิ่มตัว <b>เชิงภาพ (marketing)</b> — ไม่อ้างวิจัย; ตัวเลขแพทย์แยกต่างหากด้านบน</td></tr>
      </table>
      <ol class="refs" style="margin:11px 0 0 17px">
        ${FILLER_REFERENCES.map((r) => `<li>${r.refEn} <a href="${r.url}" class="reflink pmc">${r.cite} ↗</a><br><span class="ti">“${r.title}”</span></li>`).join('\n        ')}
      </ol>
      <p class="note" style="margin-top:8px">🔎 งานวิจัยถูกตรวจสอบที่มาแล้ว (2026) — กดลิงก์เปิดต้นฉบับ (PMC = PubMed Central, เปิดอ่านฟรี)</p>
    </div>
  </div>
</div>

<!-- PAGE 2 — สอนคำนวณ §1 §2 -->
<div class="page">
  <div class="body" style="padding-top:14mm">
    <div class="sec">
      <h2><span class="num">1</span> รอบวงลำตัว (girth)</h2>
      <div class="split">
        <div class="txt">
          <p class="desc"><b>ขั้น A · เรขาคณิต</b> — ทรงกระบอกรอบวง C มีพื้นที่หน้าตัด A = C²/4π. ฉีดปริมาตร V กระจายตามยาว L ทำให้พื้นที่เพิ่ม ΔA = V/L → รอบวงใหม่:</p>
          <div class="formula">g <span class="op">=</span> √(<span class="var">C₀</span>² <span class="op">+</span> 4π·<span class="var">V</span>/<span class="var">L</span>) <span class="op">−</span> <span class="var">C₀</span></div>
          <p class="desc"><b>ขั้น B · คูณตัวปรับ k</b> (เนื้อเยื่อจริงขยายมากกว่าเรขาคณิตล้วน) → ได้เป็น <b>ช่วง</b> คงตัว→พีค:</p>
          <div class="formula">Δรอบวง <span class="op">=</span> k · g &nbsp;&nbsp;<span style="color:#9b9098">( k = ${f2(K_DURABLE)} คงตัว · ${f2(K_PEAK)} พีค )</span></div>
          <p class="note">💡 <b>insight:</b> เพราะมี V/L → ลำตัว <b>สั้น</b> (L น้อย) ฉีด cc เท่ากัน รอบวงขึ้น <b>เยอะกว่า</b> · k คาลิเบรตจาก RCT ${refLink(1, 3)}</p>
        </div>
        <svg class="diagram" width="118" height="118" viewBox="0 0 118 118">
          <circle cx="59" cy="59" r="44" fill="none" stroke="#e23744" stroke-width="2" stroke-dasharray="5 4"/>
          <circle cx="59" cy="59" r="34" fill="#fbeeea" stroke="#b3121f" stroke-width="2"/>
          <text x="59" y="56" text-anchor="middle" class="svglabel" style="font-size:11px;fill:#b3121f;font-weight:700">A=C²/4π</text>
          <text x="59" y="70" text-anchor="middle" class="svglabel">หน้าตัด</text>
          <text x="59" y="14" text-anchor="middle" class="svglabel" style="fill:#e23744;font-weight:700">+ΔA = V/L</text>
        </svg>
      </div>
    </div>
    <div class="sec">
      <h2><span class="num">2</span> เส้นผ่านศูนย์กลาง + ขนาดถุงยาง</h2>
      <div class="formula"><span class="var">Ø</span> <span class="op">=</span> รอบวง / π &nbsp;&nbsp;·&nbsp;&nbsp; ความกว้างถุงยาง (mm) <span class="op">=</span> รอบวง(cm) <span class="op">×</span> 5</div>
      <p class="note">มาตรฐาน ISO 4074 ${refLink(5)}: nominal width = ครึ่งรอบวง · ผลลัพธ์โชว์ mm ดิบ (ปัดเศษ) แล้ว snap แบบ <b>floor</b> = ไซส์ใหญ่สุดที่ยังกระชับ (กันหลุด)</p>
    </div>
    <div class="sec">
      <h2><span class="num">3</span> ส่วนหัว (glans) — มี 2 ตัวเลขแยกกัน</h2>
      <div class="split">
        <div class="txt">
          <p class="desc"><span class="tag med">ทางการแพทย์</span> ΔØ = ${GLANS_DIAM_PER_CC.low}–${GLANS_DIAM_PER_CC.high} cm/cc แต่ <b>อิ่มตัวที่ ${GLANS_SATURATION_CC}cc</b> (วิจัย: หัวพีคที่ ~2mL ฉีดเกินไม่โตเพิ่ม ${refLink(4)}) · ไม่กระทบรอบวง/ถุงยาง</p>
          <p class="desc" style="margin-top:8px"><span class="tag vis">ภาพที่วาด</span> โตตาม cc จริงแบบต่อเนื่อง + ค่อยๆ อิ่มตัว (เพื่อให้เห็นหัวตอบสนอง slider):</p>
          <div class="formula">Ø หัว <span class="op">=</span> Ø₀ <span class="op">+</span> max·(1 <span class="op">−</span> e^(<span class="op">−</span><span class="var">cc</span>/${GLANS_VISUAL_HALF_CC}))<br><span style="color:#9b9098;font-size:11px">max = ${f1(GLANS_VISUAL_MAX_DELTA.low)} cm (ต่ำ) · ${f1(GLANS_VISUAL_MAX_DELTA.high)} cm (สูง) · half = ${GLANS_VISUAL_HALF_CC}cc</span></div>
        </div>
        <svg class="diagram" width="250" height="128" viewBox="0 0 250 128">
          <line x1="14" y1="106" x2="244" y2="106" stroke="#cdbfb4" stroke-width="1"/>
          <line x1="14" y1="10" x2="14" y2="106" stroke="#cdbfb4" stroke-width="1"/>
          <path d="${CURVE}" transform="translate(14,10)" fill="none" stroke="#e23744" stroke-width="2.4"/>
          <line x1="${14 + halfX}" y1="10" x2="${14 + halfX}" y2="106" stroke="#b3121f" stroke-width="1" stroke-dasharray="3 3" opacity=".6"/>
          <text x="${14 + halfX}" y="120" text-anchor="middle" class="svglabel">half=${GLANS_VISUAL_HALF_CC}cc</text>
          <text x="244" y="120" text-anchor="end" class="svglabel">cc ส่วนหัว →</text>
          <text x="20" y="20" class="svglabel" style="fill:#e23744;font-weight:700">ΔØ หัว (เส้นโค้งอิ่มตัว)</text>
        </svg>
      </div>
    </div>
  </div>
</div>

<!-- PAGE 3 — §4 + ตัวอย่างจริง -->
<div class="page">
  <div class="body" style="padding-top:14mm">
    <div class="sec">
      <h2><span class="num">4</span> ความยาวตอนอ่อน (flaccid) — ผลพลอยได้</h2>
      <div class="formula">เพิ่ม <span class="op">=</span> MAX·(1 <span class="op">−</span> e^(<span class="op">−</span><span class="var">cc ลำตัว</span>/${FLACCID_LEN_HALF_CC}))&nbsp;&nbsp;<span style="color:#9b9098">MAX = ${f1(FLACCID_LEN_MAX_DURABLE)} / ${f1(FLACCID_LEN_MAX_PEAK)} cm</span></div>
      <p class="note">เป็น <b>splint กันหดเข้า</b> (anti-retraction) ไม่ใช่การยืดจริงตอนแข็งตัว · เฉพาะ cc ลำตัว (ส่วนหัวไม่ช่วย splint) ${refLink(2)}</p>
    </div>
    <h2 style="font-size:15px;font-weight:800;color:#141217;margin:6px 0 8px;padding-left:2px">📊 ตัวอย่างจริง <span style="font-weight:400;color:#7a716a;font-size:12px">— ถุงยาง 52 มม. · ยาว 5 นิ้ว · ฟิลเลอร์รวม 20cc (ลำตัว ${SHAFT} + ส่วนหัว ${HEAD})</span></h2>
    <table>
      <tr><th style="width:30%">ค่า</th><th>วิธีคำนวณ</th><th style="text-align:right">ผลลัพธ์</th></tr>
      <tr><td>รอบวงเดิม (C₀)</td><td class="mono" style="font-size:11px">52 ÷ 5</td><td class="r"><b>${f1(C0)} cm</b></td></tr>
      <tr><td>g (เรขาคณิต)</td><td class="mono" style="font-size:11px">√(10.4² + 4π·${SHAFT}/12.7) − 10.4</td><td class="r">${f2(gGeom)} cm</td></tr>
      <tr><td>รอบวงใหม่</td><td class="mono" style="font-size:11px">C₀ + (1.22 / 1.90)·g</td><td class="r"><b>${f1(e.c1Low)} – ${f1(e.c1High)} cm</b></td></tr>
      <tr><td>ขนาดถุงยาง</td><td class="mono" style="font-size:11px">รอบวง × 5</td><td class="r"><b>${e.condomWidthLow} – ${e.condomWidthHigh} mm</b> <span style="color:#7a716a">(จาก 52)</span></td></tr>
      <tr><td>ความยาวตอนอ่อน</td><td class="mono" style="font-size:11px">2.0 / 3.0 ·(1−e^(−${SHAFT}/10))</td><td class="r"><b>+${f1(e.lengthGainLow)} – ${f1(e.lengthGainHigh)} cm</b></td></tr>
      <tr><td>ส่วนหัว — แพทย์</td><td class="mono" style="font-size:11px">min(${HEAD},2) → +0.13–0.24×2</td><td class="r">+${f2(e.glans.dgLow - e.glans.dg0)} – ${f2(e.glans.dgHigh - e.glans.dg0)} cm <span style="color:#7a716a">(อิ่มตัว)</span></td></tr>
      <tr><td>ส่วนหัว — ภาพที่วาด</td><td class="mono" style="font-size:11px">${f2(e.glans.dg0)} + 1.6·(1−e^(−${HEAD}/6))</td><td class="r"><b>${f2(e.glans.dg0)} → ${f2(e.glans.visualLow)} cm</b></td></tr>
    </table>
    <div class="disc">⚠️ ทุกค่าเป็น <b>การประมาณ ±~1 cm</b> เพื่อการสื่อสาร/จำลองเท่านั้น · ฟิลเลอร์อยู่ ~12–18 เดือนแล้วค่อยๆ สลาย · "ส่วนหัว" ในภาพปรับเพื่อการมองเห็น ไม่กระทบรอบวง/ถุงยาง · ผลจริงขึ้นกับสรีระแต่ละบุคคล</div>
    <div class="footer">
      <span>© Lover Clinic · เอกสารอธิบายโมเดลคำนวณ Filler Simulator</span>
      <img src="${logoLight}" alt="">
    </div>
  </div>
</div>
</body></html>`;

fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/filler-math-explainer.html', html);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.emulateMedia({ media: 'print' });
await page.pdf({ path: 'docs/filler-math-explainer.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log('PDF written (variables-first). refs:', FILLER_REFERENCES.map((r) => `[${r.n}] ${r.cite}`).join(' '));
