export const hexToRgb = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
};

export const applyThemeColor = (hex) => {
  const rgb = hexToRgb(hex);
  document.documentElement.style.setProperty('--accent', hex);
  document.documentElement.style.setProperty('--accent-rgb', rgb);
};

export const THAI_MONTHS = [
  { value: '01', label: 'มกราคม' }, { value: '02', label: 'กุมภาพันธ์' }, { value: '03', label: 'มีนาคม' },
  { value: '04', label: 'เมษายน' }, { value: '05', label: 'พฤษภาคม' }, { value: '06', label: 'มิถุนายน' },
  { value: '07', label: 'กรกฎาคม' }, { value: '08', label: 'สิงหาคม' }, { value: '09', label: 'กันยายน' },
  { value: '10', label: 'ตุลาคม' }, { value: '11', label: 'พฤศจิกายน' }, { value: '12', label: 'ธันวาคม' }
];

export const EN_MONTHS = [
  { value: '01', label: 'January' }, { value: '02', label: 'February' }, { value: '03', label: 'March' },
  { value: '04', label: 'April' }, { value: '05', label: 'May' }, { value: '06', label: 'June' },
  { value: '07', label: 'July' }, { value: '08', label: 'August' }, { value: '09', label: 'September' },
  { value: '10', label: 'October' }, { value: '11', label: 'November' }, { value: '12', label: 'December' }
];

const currentYearCE = new Date().getFullYear();
export const YEARS_BE = Array.from({ length: 120 }, (_, i) => (currentYearCE + 543) - i);
export const YEARS_CE = Array.from({ length: 120 }, (_, i) => currentYearCE - i);

export const COUNTRY_CODES = [
  { code: '+66', label: 'Thailand' }, { code: '+1', label: 'USA/Canada' }, { code: '+44', label: 'United Kingdom' },
  { code: '+61', label: 'Australia' }, { code: '+81', label: 'Japan' }, { code: '+82', label: 'South Korea' },
  { code: '+86', label: 'China' }, { code: '+852', label: 'Hong Kong' }, { code: '+886', label: 'Taiwan' },
  { code: '+65', label: 'Singapore' }, { code: '+60', label: 'Malaysia' }, { code: '+62', label: 'Indonesia' },
  { code: '+63', label: 'Philippines' }, { code: '+84', label: 'Vietnam' }, { code: '+855', label: 'Cambodia' },
  { code: '+856', label: 'Laos' }, { code: '+95', label: 'Myanmar' }, { code: '+91', label: 'India' },
  { code: '+971', label: 'UAE' }, { code: '+49', label: 'Germany' }, { code: '+33', label: 'France' },
  { code: '+39', label: 'Italy' }, { code: '+34', label: 'Spain' }, { code: '+41', label: 'Switzerland' },
  { code: '+46', label: 'Sweden' }, { code: '+31', label: 'Netherlands' }, { code: '+7', label: 'Russia' },
  { code: '+966', label: 'Saudi Arabia' }, { code: '+27', label: 'South Africa' }, { code: '+64', label: 'New Zealand' },
  { code: '+55', label: 'Brazil' }, { code: '+47', label: 'Norway' }, { code: '+45', label: 'Denmark' },
  { code: '+358', label: 'Finland' }, { code: '+32', label: 'Belgium' }, { code: '+52', label: 'Mexico' },
  { code: '+54', label: 'Argentina' }, { code: '+20', label: 'Egypt' }, { code: '+90', label: 'Turkey' }
];

// จังหวัด — ลำดับตรงกับ ProClinic select (Unicode sort)
export const THAI_PROVINCES = [
  'กระบี่','กรุงเทพมหานคร','กาญจนบุรี','กาฬสินธุ์','กำแพงเพชร',
  'ขอนแก่น','จันทบุรี','ฉะเชิงเทรา','ชลบุรี','ชัยนาท',
  'ชัยภูมิ','ชุมพร','ตรัง','ตราด','ตาก',
  'นครนายก','นครปฐม','นครพนม','นครราชสีมา','นครศรีธรรมราช',
  'นครสวรรค์','นนทบุรี','นราธิวาส','น่าน','บึงกาฬ',
  'บุรีรัมย์','ปทุมธานี','ประจวบคีรีขันธ์','ปราจีนบุรี','ปัตตานี',
  'พระนครศรีอยุธยา','พะเยา','พังงา','พัทลุง','พิจิตร',
  'พิษณุโลก','ภูเก็ต','มหาสารคาม','มุกดาหาร','ยะลา',
  'ยโสธร','ระนอง','ระยอง','ราชบุรี','ร้อยเอ็ด',
  'ลพบุรี','ลำปาง','ลำพูน','ศรีสะเกษ','สกลนคร',
  'สงขลา','สตูล','สมุทรปราการ','สมุทรสงคราม','สมุทรสาคร',
  'สระบุรี','สระแก้ว','สิงห์บุรี','สุพรรณบุรี','สุราษฎร์ธานี',
  'สุรินทร์','สุโขทัย','หนองคาย','หนองบัวลำภู','อำนาจเจริญ',
  'อุดรธานี','อุตรดิตถ์','อุทัยธานี','อุบลราชธานี','อ่างทอง',
  'เชียงราย','เชียงใหม่','เพชรบุรี','เพชรบูรณ์','เลย',
  'แพร่','แม่ฮ่องสอน',
];

// สัญชาติ — 194 ประเทศตรงกับ ProClinic country select (ค่าเป็น value ตรงๆ)
export const NATIONALITY_COUNTRIES = [
  'อัฟกานิสถาน (Afghanistan)','อัลเบเนีย (Albania)','แอลจีเรีย (Algeria)','อันดอร์รา (Andorra)',
  'แองโกลา (Angola)','แอนติกาและบาร์บูดา (Antigua and Barbuda)','อาร์เจนตินา (Argentina)','อาร์เมเนีย (Armenia)',
  'ออสเตรเลีย (Australia)','ออสเตรีย (Austria)','อาเซอร์ไบจาน (Azerbaijan)','บาฮามาส (Bahamas)',
  'บาห์เรน (Bahrain)','บังกลาเทศ (Bangladesh)','บาร์เบโดส (Barbados)','เบลารุส (Belarus)',
  'เบลเยียม (Belgium)','เบลีซ (Belize)','เบนิน (Benin)','ภูฏาน (Bhutan)',
  'โบลิเวีย (Bolivia)','บอสเนียและเฮอร์เซโกวีนา (Bosnia and Herzegovina)','บอตสวานา (Botswana)','บราซิล (Brazil)',
  'บรูไน (Brunei)','บัลแกเรีย (Bulgaria)','บูร์กินาฟาโซ (Burkina Faso)','บุรุนดี (Burundi)',
  'เคปเวิร์ด (Cabo Verde)','กัมพูชา (Cambodia)','แคเมอรูน (Cameroon)','แคนาดา (Canada)',
  'สาธารณรัฐแอฟริกากลาง (Central African Republic)','ชาด (Chad)','ชิลี (Chile)','จีน (China)',
  'โคลอมเบีย (Colombia)','คอโมรอส (Comoros)','คองโก (สาธารณรัฐ) (Congo Republic)','คองโก (สาธารณรัฐประชาธิปไตย) (Congo Democratic Republic)',
  'คอสตาริกา (Costa Rica)','โครเอเชีย (Croatia)','คิวบา (Cuba)','ไซปรัส (Cyprus)',
  'สาธารณรัฐเช็ก (Czechia)','เดนมาร์ก (Denmark)','จิบูตี (Djibouti)','โดมินิกา (Dominica)',
  'สาธารณรัฐโดมินิกัน (Dominican Republic)','เอกวาดอร์ (Ecuador)','อียิปต์ (Egypt)','เอลซัลวาดอร์ (El Salvador)',
  'อิเควทอเรียลกินี (Equatorial Guinea)','เอริเทรีย (Eritrea)','เอสโตเนีย (Estonia)','เอสวาตินี (Eswatini)',
  'เอธิโอเปีย (Ethiopia)','ฟิจิ (Fiji)','ฟินแลนด์ (Finland)','ฝรั่งเศส (France)',
  'กาบอน (Gabon)','แกมเบีย (Gambia)','จอร์เจีย (Georgia)','เยอรมนี (Germany)',
  'กานา (Ghana)','กรีซ (Greece)','เกรเนดา (Grenada)','กัวเตมาลา (Guatemala)',
  'กินี (Guinea)','กินี-บิสเซา (Guinea-Bissau)','กายานา (Guyana)','ไฮติ (Haiti)',
  'ฮอนดูรัส (Honduras)','ฮังการี (Hungary)','ไอซ์แลนด์ (Iceland)','อินเดีย (India)',
  'อินโดนีเซีย (Indonesia)','อิหร่าน (Iran)','อิรัก (Iraq)','ไอร์แลนด์ (Ireland)',
  'อิสราเอล (Israel)','อิตาลี (Italy)','จาเมกา (Jamaica)','ญี่ปุ่น (Japan)',
  'จอร์แดน (Jordan)','คาซัคสถาน (Kazakhstan)','เคนยา (Kenya)','คิริบาตี (Kiribati)',
  'เกาหลีเหนือ (North Korea)','เกาหลีใต้ (South Korea)','โคโซโว (Kosovo)','คูเวต (Kuwait)',
  'คีร์กีซสถาน (Kyrgyzstan)','ลาว (Laos)','ลัตเวีย (Latvia)','เลบานอน (Lebanon)',
  'เลโซโท (Lesotho)','ไลบีเรีย (Liberia)','ลิเบีย (Libya)','ลิกเตนสไตน์ (Liechtenstein)',
  'ลิทัวเนีย (Lithuania)','ลักเซมเบิร์ก (Luxembourg)','มาดากัสการ์ (Madagascar)','มาลาวี (Malawi)',
  'มาเลเซีย (Malaysia)','มัลดีฟส์ (Maldives)','มาลี (Mali)','มัลตา (Malta)',
  'หมู่เกาะมาร์แชล (Marshall Islands)','มอริเตเนีย (Mauritania)','มอริเชียส (Mauritius)','เม็กซิโก (Mexico)',
  'ไมโครนีเซีย (Micronesia)','มอลโดวา (Moldova)','โมนาโก (Monaco)','มองโกเลีย (Mongolia)',
  'มอนเตเนโกร (Montenegro)','โมร็อกโก (Morocco)','มอซัมบิก (Mozambique)','เมียนมาร์ (Myanmar)',
  'นามิเบีย (Namibia)','นาอูรู (Nauru)','เนปาล (Nepal)','เนเธอร์แลนด์ (Netherlands)',
  'นิวซีแลนด์ (New Zealand)','นิการากัว (Nicaragua)','ไนเจอร์ (Niger)','ไนจีเรีย (Nigeria)',
  'มาซิโดเนียเหนือ (North Macedonia)','นอร์เวย์ (Norway)','โอมาน (Oman)','ปากีสถาน (Pakistan)',
  'ปาเลา (Palau)','ปานามา (Panama)','ปาปัวนิวกินี (Papua New Guinea)','ปารากวัย (Paraguay)',
  'เปรู (Peru)','ฟิลิปปินส์ (Philippines)','โปแลนด์ (Poland)','โปรตุเกส (Portugal)',
  'กาตาร์ (Qatar)','โรมาเนีย (Romania)','รัสเซีย (Russia)','รวันดา (Rwanda)',
  'เซนต์คิตส์และเนวิส (Saint Kitts and Nevis)','เซนต์ลูเซีย (Saint Lucia)',
  'เซนต์วิ้นเซนต์และเกรนาดีนส์ (Saint Vincent and the Grenadines)','ซามัว (Samoa)',
  'ซานมาริโน (San Marino)','เซาตูเมและปรินซิปี (São Tomé and Príncipe)','ซาอุดีอาระเบีย (Saudi Arabia)','เซเนกัล (Senegal)',
  'เซอร์เบีย (Serbia)','เซเชลส์ (Seychelles)','เซียร์ราลีโอน (Sierra Leone)','สิงคโปร์ (Singapore)',
  'สโลวัก (Slovakia)','สโลวีเนีย (Slovenia)','หมู่เกาะโซโลมอน (Solomon Islands)','โซมาเลีย (Somalia)',
  'แอฟริกาใต้ (South Africa)','ซูดานใต้ (South Sudan)','สเปน (Spain)','ศรีลังกา (Sri Lanka)',
  'ซูดาน (Sudan)','ซูรินาม (Suriname)','สวีเดน (Sweden)','สวิตเซอร์แลนด์ (Switzerland)',
  'ซีเรีย (Syria)','ทาจิกิสถาน (Tajikistan)','แทนซาเนีย (Tanzania)','ไทย (Thailand)',
  'ติมอร์ตะวันออก (Timor-Leste)','โทโก (Togo)','ตองกา (Tonga)','ตรินิแดดและโตเบโก (Trinidad and Tobago)',
  'ตูนิเซีย (Tunisia)','ตุรกี (Turkey)','เติร์กเมนิสถาน (Turkmenistan)','ทูวาลู (Tuvalu)',
  'ยูกันดา (Uganda)','ยูเครน (Ukraine)','สหรัฐอาหรับเอมิเรตส์ (United Arab Emirates)','สหราชอาณาจักร (United Kingdom)',
  'สหรัฐอเมริกา (United States)','อุรุกวัย (Uruguay)','อุซเบกิสถาน (Uzbekistan)','วานูอาตู (Vanuatu)',
  'วาติกัน (Vatican City)','เวเนซุเอลา (Venezuela)','เวียดนาม (Vietnam)','เยเมน (Yemen)',
  'แซมเบีย (Zambia)','ซิมบับเว (Zimbabwe)',
];

export const defaultFormData = {
  prefix: 'นาย', firstName: '', lastName: '', gender: 'ชาย',
  dobDay: '', dobMonth: '', dobYear: '', age: '',
  province: '', district: '', subDistrict: '', postalCode: '',
  nationality: 'ไทย', nationalityCountry: '', idCard: '',
  address: '', phone: '', isInternationalPhone: false, phoneCountryCode: '+66',
  emergencyName: '', emergencyRelation: '', emergencyPhone: '', isInternationalEmergencyPhone: false, emergencyPhoneCountryCode: '+66',
  visitReasons: [], visitReasonOther: '',
  hrtGoals: [], hrtTransType: '', hrtOtherDetail: '', 
  hasAllergies: 'ไม่มี', allergiesDetail: '',
  hasUnderlying: 'ไม่มี',
  ud_hypertension: false, ud_diabetes: false, ud_lung: false,
  ud_kidney: false, ud_heart: false, ud_blood: false, ud_other: false, ud_otherDetail: '',
  currentMedication: '', pregnancy: 'ไม่เกี่ยวข้อง/ไม่ได้ตั้งครรภ์',
  howFoundUs: [],
  symp_pe: false, 
  adam_1: false, adam_2: false, adam_3: false, adam_4: false, 
  adam_5: false, adam_6: false, adam_7: false, adam_8: false, adam_9: false, adam_10: false,
  iief_1: '', iief_2: '', iief_3: '', iief_4: '', iief_5: '',
  mrs_1: '', mrs_2: '', mrs_3: '', mrs_4: '', mrs_5: '', mrs_6: '', mrs_7: '', mrs_8: '', mrs_9: '', mrs_10: '', mrs_11: '',
  assessmentDate: new Date().toISOString().split('T')[0]
};

export const formatBangkokTime = (timestamp) => {
  if (!timestamp) return null;
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
};

export const formatPhoneNumberDisplay = (phone, isInt, code) => {
  if (!phone) return '-';
  return isInt ? `${code} ${phone}` : phone;
};

export const getReasons = (d) => {
  if (!d) return [];
  if (Array.isArray(d.visitReasons)) return d.visitReasons;
  if (d.visitReason) return [d.visitReason];
  return [];
};

export const getHrtGoals = (d) => {
  if (!d) return [];
  if (Array.isArray(d.hrtGoals)) return d.hrtGoals;
  if (d.hrtGoal) return [d.hrtGoal];
  return [];
};

export const calculateADAM = (d) => {
  const adamKeys = ['adam_1', 'adam_2', 'adam_3', 'adam_4', 'adam_5', 'adam_6', 'adam_7', 'adam_8', 'adam_9', 'adam_10'];
  const totalTrue = adamKeys.filter(k => d[k]).length;
  const isPositive = d.adam_1 || d.adam_7 || totalTrue >= 3;
  return {
    positive: isPositive,
    total: totalTrue,
    text: isPositive ? 'เข้าข่ายภาวะพร่องฮอร์โมนเพศชาย' : 'ไม่พบภาวะพร่องฮอร์โมนที่ชัดเจน',
    color: isPositive ? 'text-orange-500' : 'text-green-500',
    bg: isPositive ? 'bg-orange-950/30 border-orange-900/50' : 'bg-green-950/30 border-green-900/50'
  };
};

export const calculateIIEFScore = (d) => {
  return (parseInt(d.iief_1)||0) + (parseInt(d.iief_2)||0) + (parseInt(d.iief_3)||0) + (parseInt(d.iief_4)||0) + (parseInt(d.iief_5)||0);
};

export const getIIEFInterpretation = (score) => {
  if (score === 0) return { text: 'ข้อมูลไม่ครบถ้วน', color: 'text-gray-500', bg: 'bg-[#222] border-[#333]' };
  if (score >= 22) return { text: 'ปกติ (ไม่มีภาวะเสื่อม)', color: 'text-green-500', bg: 'bg-green-950/30 border-green-900/50' };
  if (score >= 17) return { text: 'เสื่อมระดับเล็กน้อย', color: 'text-yellow-500', bg: 'bg-yellow-950/30 border-yellow-900/50' };
  if (score >= 12) return { text: 'เสื่อมระดับเล็กน้อยถึงปานกลาง', color: 'text-orange-500', bg: 'bg-orange-950/30 border-orange-900/50' };
  if (score >= 8) return { text: 'เสื่อมระดับปานกลาง', color: 'text-red-500', bg: 'bg-red-950/30 border-red-900/50' };
  return { text: 'เสื่อมระดับรุนแรง', color: 'text-red-600 font-bold', bg: 'bg-red-950/50 border-red-600/50 shadow-[0_0_10px_rgba(220,38,38,0.3)]' };
};

export const calculateMRS = (d) => {
  let score = 0;
  for(let i=1; i<=11; i++) score += parseInt(d[`mrs_${i}`] || 0);
  if (score <= 4) return { score, text: 'ไม่มีอาการ / เล็กน้อยมาก', color: 'text-green-500', bg: 'bg-green-950/30 border-green-900/50' };
  if (score <= 8) return { score, text: 'ระดับเล็กน้อย', color: 'text-yellow-500', bg: 'bg-yellow-950/30 border-yellow-900/50' };
  if (score <= 15) return { score, text: 'ระดับปานกลาง', color: 'text-orange-500', bg: 'bg-orange-950/30 border-orange-900/50' };
  return { score, text: 'ระดับรุนแรง', color: 'text-red-600 font-bold', bg: 'bg-red-950/50 border-red-600/50 shadow-[0_0_10px_rgba(220,38,38,0.3)]' };
};

export const generateClinicalSummary = (d, formType = 'intake', customTemplate = null, lang = 'en') => {
  const parts = [];
  const sep = '─────────────────────────────────';
  const isTh = lang === 'th';

  // ── IIEF interpretation in English ──
  const iiefInterpEn = (score) => {
    if (score === 0) return 'Incomplete data';
    if (score >= 22) return 'Normal (No dysfunction)';
    if (score >= 17) return 'Mild dysfunction';
    if (score >= 12) return 'Mild to moderate dysfunction';
    if (score >= 8)  return 'Moderate dysfunction';
    return 'Severe dysfunction';
  };

  // ── MRS interpretation in English ──
  const mrsInterpEn = (score) => {
    if (score <= 4)  return 'None / Very mild';
    if (score <= 8)  return 'Mild';
    if (score <= 15) return 'Moderate';
    return 'Severe';
  };

  // ── ADAM interpretation in English ──
  const adamInterpEn = (adam) => adam.positive
    ? 'Positive (Androgen deficiency suspected)'
    : 'Negative (No clear androgen deficiency)';

  if (formType.startsWith('followup_')) {
    if (isTh) {
      parts.push(`ประเภท             : ติดตามผลการรักษา`);
      parts.push(`วันที่ประเมิน       : ${d.assessmentDate || '-'}`);
      parts.push(sep);
      if (formType === 'followup_ed') {
        const iief = calculateIIEFScore(d);
        const interp = getIIEFInterpretation(iief);
        parts.push(`ผลการประเมินสมรรถภาพทางเพศ (IIEF-5 Scale)`);
        parts.push(`  คะแนนรวม        : ${iief} / 25`);
        parts.push(`  ระดับความรุนแรง  : ${interp.text}`);
      } else if (formType === 'followup_adam') {
        const adam = calculateADAM(d);
        parts.push(`ผลการประเมินภาวะพร่องฮอร์โมนเพศชาย (ADAM Scale)`);
        parts.push(`  คะแนนรวม        : ${adam.total} / 10`);
        parts.push(`  ผลการแปลค่า     : ${adam.text}`);
      } else if (formType === 'followup_mrs') {
        const mrs = calculateMRS(d);
        parts.push(`ผลการประเมินอาการวัยทอง (Menopause Rating Scale)`);
        parts.push(`  คะแนนรวม        : ${mrs.score} / 44`);
        parts.push(`  ระดับความรุนแรง  : ${mrs.text}`);
      }
    } else {
      parts.push(`Type               : Follow-Up Assessment`);
      parts.push(`Date of Assessment : ${d.assessmentDate || '-'}`);
      parts.push(sep);
      if (formType === 'followup_ed') {
        const iief = calculateIIEFScore(d);
        parts.push(`Erectile Function Assessment (IIEF-5 Scale)`);
        parts.push(`  Total Score      : ${iief} / 25`);
        parts.push(`  Severity Level   : ${iiefInterpEn(iief)}`);
      } else if (formType === 'followup_adam') {
        const adam = calculateADAM(d);
        parts.push(`Androgen Deficiency Assessment (ADAM Scale)`);
        parts.push(`  Total Score      : ${adam.total} / 10`);
        parts.push(`  Interpretation   : ${adamInterpEn(adam)}`);
      } else if (formType === 'followup_mrs') {
        const mrs = calculateMRS(d);
        parts.push(`Menopause Symptoms Assessment (Menopause Rating Scale)`);
        parts.push(`  Total Score      : ${mrs.score} / 44`);
        parts.push(`  Severity Level   : ${mrsInterpEn(mrs.score)}`);
      }
    }
    return parts.join('\n');
  }

  const reasons = getReasons(d);
  const goals = getHrtGoals(d);

  if (isTh) {
    // ── ภาษาไทย ──
    let ccList = reasons.map(r => {
      if (r === 'อื่นๆ') return `อื่นๆ (${d.visitReasonOther || '-'})`;
      if (r === 'เสริมฮอร์โมน' && goals.length > 0) {
        let gl = goals.map(g => {
          if (g === 'ฮอร์โมนเพื่อการข้ามเพศ') return `ข้ามเพศ (${d.hrtTransType?.split(' / ')[0] || '-'})`;
          if (g === 'อื่นๆ') return `อื่นๆ (${d.hrtOtherDetail || '-'})`;
          return g;
        });
        return `เสริมฮอร์โมน [${gl.join(', ')}]`;
      }
      return r;
    });
    parts.push(`อาการสำคัญ         : ${ccList.join(', ')}`);
    parts.push(sep);

    let pmh = [];
    if (d.hasUnderlying === 'มี') {
      if (d.ud_hypertension) pmh.push('ความดันโลหิตสูง');
      if (d.ud_diabetes) pmh.push('เบาหวาน');
      if (d.ud_lung) pmh.push('โรคปอด');
      if (d.ud_kidney) pmh.push('โรคไต');
      if (d.ud_heart) pmh.push('โรคหัวใจ');
      if (d.ud_blood) pmh.push('โรคโลหิต');
      if (d.ud_other && d.ud_otherDetail) pmh.push(d.ud_otherDetail);
    }
    parts.push(`ประวัติโรคประจำตัว  : ${pmh.length > 0 ? pmh.join(', ') : 'ปฏิเสธโรคประจำตัว'}`);
    parts.push(`ประวัติการแพ้ยา/อาหาร : ${d.hasAllergies === 'มี' ? `แพ้ ${d.allergiesDetail}` : 'ปฏิเสธประวัติการแพ้ยาและอาหาร'}`);
    parts.push(`ยาที่ใช้ประจำ       : ${d.currentMedication || 'ไม่มี'}`);

    const hasScreening = reasons.includes('สมรรถภาพทางเพศ')
      || goals.includes('อาการฮอร์โมนตก/วัยทอง (ผู้ชาย)')
      || goals.includes('อาการฮอร์โมนตก/วัยทอง (ผู้หญิง)');
    if (hasScreening) {
      parts.push(sep);
      parts.push(`ผลการคัดกรองอาการ`);
      if (reasons.includes('สมรรถภาพทางเพศ')) {
        parts.push(`  อาการหลั่งเร็ว                       : ${d.symp_pe ? 'มีอาการ' : 'ไม่มีอาการ'}`);
        const adam = calculateADAM(d);
        parts.push(`  ภาวะพร่องฮอร์โมนเพศชาย (ADAM Scale) : ${adam.total}/10 — ${adam.text}`);
        const iief = calculateIIEFScore(d);
        const interp = getIIEFInterpretation(iief);
        parts.push(`  สมรรถภาพทางเพศ (IIEF-5 Scale)       : ${iief}/25 — ${interp.text}`);
      }
      if (goals.includes('อาการฮอร์โมนตก/วัยทอง (ผู้ชาย)') && !reasons.includes('สมรรถภาพทางเพศ')) {
        const adam = calculateADAM(d);
        parts.push(`  ภาวะพร่องฮอร์โมนเพศชาย (ADAM Scale) : ${adam.total}/10 — ${adam.text}`);
      }
      if (goals.includes('อาการฮอร์โมนตก/วัยทอง (ผู้หญิง)')) {
        const mrs = calculateMRS(d);
        parts.push(`  อาการวัยทอง (Menopause Rating Scale) : ${mrs.score}/44 — ${mrs.text}`);
      }
    }
  } else {
    // ── English ──
    const reasonMap = {
      'สมรรถภาพทางเพศ': 'Erectile Dysfunction / Sexual Health',
      'โรคระบบทางเดินปัสสาวะ': 'Urology / Urinary Tract',
      'ดูแลสุขภาพองค์รวม': 'General Health and Wellness',
      'โรคติดต่อทางเพศสัมพันธ์': 'Sexually Transmitted Infection',
      'ขลิบ': 'Circumcision',
      'ทำหมัน': 'Vasectomy',
      'เลาะสารเหลว': 'Foreign Body Removal (Genital)',
    };
    const goalMap = {
      'ออกกำลังกาย': 'Fitness / Bodybuilding',
      'อาการฮอร์โมนตก/วัยทอง (ผู้ชาย)': 'Male Andropause',
      'อาการฮอร์โมนตก/วัยทอง (ผู้หญิง)': 'Female Menopause',
    };

    let ccList = reasons.map(r => {
      if (r === 'อื่นๆ') return `Other (${d.visitReasonOther || '-'})`;
      if (r === 'เสริมฮอร์โมน' && goals.length > 0) {
        let gl = goals.map(g => {
          if (g === 'ฮอร์โมนเพื่อการข้ามเพศ') return `Transgender Hormone Therapy (${d.hrtTransType?.split(' / ')[1] || '-'})`;
          if (g === 'อื่นๆ') return `Other (${d.hrtOtherDetail || '-'})`;
          return goalMap[g] || g;
        });
        return `Hormone Replacement Therapy [${gl.join(', ')}]`;
      }
      return reasonMap[r] || r;
    });
    parts.push(`Chief Complaint     : ${ccList.join(', ')}`);
    parts.push(sep);

    let pmh = [];
    if (d.hasUnderlying === 'มี') {
      if (d.ud_hypertension) pmh.push('Hypertension');
      if (d.ud_diabetes) pmh.push('Diabetes Mellitus');
      if (d.ud_lung) pmh.push('Lung Disease');
      if (d.ud_kidney) pmh.push('Chronic Kidney Disease');
      if (d.ud_heart) pmh.push('Heart Disease');
      if (d.ud_blood) pmh.push('Hematological Disease');
      if (d.ud_other && d.ud_otherDetail) pmh.push(d.ud_otherDetail);
    }
    parts.push(`Past Medical History: ${pmh.length > 0 ? pmh.join(', ') : 'No known underlying diseases'}`);
    parts.push(`Drug and Food Allergy: ${d.hasAllergies === 'มี' ? `Allergy to ${d.allergiesDetail}` : 'No known drug or food allergies'}`);
    parts.push(`Current Medications : ${d.currentMedication || 'None'}`);

    const hasScreening = reasons.includes('สมรรถภาพทางเพศ')
      || goals.includes('อาการฮอร์โมนตก/วัยทอง (ผู้ชาย)')
      || goals.includes('อาการฮอร์โมนตก/วัยทอง (ผู้หญิง)');
    if (hasScreening) {
      parts.push(sep);
      parts.push(`Clinical Screening Results`);
      if (reasons.includes('สมรรถภาพทางเพศ')) {
        parts.push(`  Premature Ejaculation                   : ${d.symp_pe ? 'Present' : 'Absent'}`);
        const adam = calculateADAM(d);
        parts.push(`  Androgen Deficiency (ADAM Scale)        : ${adam.total}/10 — ${adamInterpEn(adam)}`);
        const iief = calculateIIEFScore(d);
        parts.push(`  Erectile Function (IIEF-5 Scale)        : ${iief}/25 — ${iiefInterpEn(iief)}`);
      }
      if (goals.includes('อาการฮอร์โมนตก/วัยทอง (ผู้ชาย)') && !reasons.includes('สมรรถภาพทางเพศ')) {
        const adam = calculateADAM(d);
        parts.push(`  Androgen Deficiency (ADAM Scale)        : ${adam.total}/10 — ${adamInterpEn(adam)}`);
      }
      if (goals.includes('อาการฮอร์โมนตก/วัยทอง (ผู้หญิง)')) {
        const mrs = calculateMRS(d);
        parts.push(`  Menopause Symptoms (Menopause Rating Scale) : ${mrs.score}/44 — ${mrsInterpEn(mrs.score)}`);
      }
    }
  }

  return parts.join('\n');
};

export const renderDobFormat = (d) => {
  if (d.dobDay && d.dobMonth && d.dobYear) {
    const mLabel = THAI_MONTHS.find(m => m.value === d.dobMonth)?.label || '';
    let year = parseInt(d.dobYear);
    if (year < 2400) year += 543; 
    return `${parseInt(d.dobDay)} ${mLabel} ${year}`;
  }
  return '-';
};

export const playNotificationSound = (volume) => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const playNote = (freq, startTime, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };
    playNote(880, ctx.currentTime, 0.2);
    playNote(1108.73, ctx.currentTime + 0.1, 0.4); 
  } catch (e) {
    console.warn("Audio generation failed:", e);
  }
};