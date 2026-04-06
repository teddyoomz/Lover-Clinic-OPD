import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Loader2, Stethoscope, Heart, Thermometer, ClipboardList,
         Pill, ShoppingCart, DollarSign, Shield, CreditCard, Check, Plus, Trash2, Search } from 'lucide-react';
import * as broker from '../lib/brokerClient.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, isDark, accent, children }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={14} style={{ color: accent, filter: `drop-shadow(0 0 4px ${accent}60)` }} />
      <h4 className="text-[11px] font-black uppercase tracking-[0.12em]" style={{ color: accent }}>{title}</h4>
      {children}
    </div>
  );
}

function FormSection({ isDark, children, className = '' }) {
  return (
    <div className={`rounded-xl border p-4 ${isDark ? 'border-[#222] bg-[#0a0a0a]' : 'border-gray-200 bg-white'} ${className}`}>
      {children}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function TreatmentFormPage({ customerId, patientName, isDark, onClose, onCreated }) {
  const accent = isDark ? '#a78bfa' : '#7c3aed';
  const inputCls = `w-full rounded-lg px-3 py-2 text-xs outline-none border transition-all ${isDark ? 'bg-[#111] border-[#333] text-gray-200 focus:border-purple-500' : 'bg-white border-gray-200 text-gray-800 focus:border-purple-400'}`;
  const labelCls = 'text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-1 block';
  const selectCls = inputCls;

  // ── State ───────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Form options from API
  const [options, setOptions] = useState(null);

  // Doctor & Date
  const [doctorId, setDoctorId] = useState('');
  const [assistantIds, setAssistantIds] = useState([]);
  const [treatmentDate, setTreatmentDate] = useState(new Date().toISOString().slice(0, 10));

  // Health Info
  const [bloodType, setBloodType] = useState('');
  const [congenitalDisease, setCongenitalDisease] = useState('');
  const [drugAllergy, setDrugAllergy] = useState('');
  const [treatmentHistory, setTreatmentHistory] = useState('');

  // Vitals
  const [vitals, setVitals] = useState({
    weight: '', height: '', temperature: '', pulseRate: '',
    respiratoryRate: '', systolicBP: '', diastolicBP: '', oxygenSaturation: '',
  });

  // OPD Card
  const [opd, setOpd] = useState({
    symptoms: '', physicalExam: '', diagnosis: '',
    treatmentInfo: '', treatmentPlan: '', treatmentNote: '', additionalNote: '',
  });

  // Consent & Med Cert
  const [medCertActuallyCome, setMedCertActuallyCome] = useState(false);
  const [medCertIsRest, setMedCertIsRest] = useState(false);
  const [medCertPeriod, setMedCertPeriod] = useState('');
  const [medCertIsOther, setMedCertIsOther] = useState(false);
  const [medCertOtherDetail, setMedCertOtherDetail] = useState('');

  // Take-home medications
  const [medications, setMedications] = useState([]);
  const [medSearch, setMedSearch] = useState('');

  // Course items
  const [selectedCourseItems, setSelectedCourseItems] = useState(new Set());

  // Insurance
  const [benefitType, setBenefitType] = useState('');
  const [insuranceCompanyId, setInsuranceCompanyId] = useState('');

  // Payment
  const [paymentType, setPaymentType] = useState('pay_later');
  const [paymentChannelId, setPaymentChannelId] = useState('');
  const [saleNote, setSaleNote] = useState('');

  // ── BMI auto-calc ──
  const bmi = useMemo(() => {
    const w = parseFloat(vitals.weight);
    const h = parseFloat(vitals.height);
    if (w > 0 && h > 0) return (w / ((h / 100) ** 2)).toFixed(1);
    return '';
  }, [vitals.weight, vitals.height]);

  // ── Load form options ───────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const data = await broker.getTreatmentCreateForm(customerId);
        if (data.success && data.options) {
          setOptions(data.options);
          // Pre-fill defaults
          if (data.options.healthInfo?.doctorId) setDoctorId(data.options.healthInfo.doctorId);
          if (data.options.healthInfo?.bloodType) setBloodType(data.options.healthInfo.bloodType);
          if (data.options.healthInfo?.congenitalDisease) setCongenitalDisease(data.options.healthInfo.congenitalDisease);
          if (data.options.healthInfo?.drugAllergy) setDrugAllergy(data.options.healthInfo.drugAllergy);
          if (data.options.healthInfo?.treatmentHistory) setTreatmentHistory(data.options.healthInfo.treatmentHistory);
          if (data.options.vitalsDefaults?.weight) setVitals(v => ({ ...v, weight: data.options.vitalsDefaults.weight }));
          if (data.options.vitalsDefaults?.height) setVitals(v => ({ ...v, height: data.options.vitalsDefaults.height }));
        } else {
          setError(data.error || 'ไม่สามารถโหลดฟอร์มได้');
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [customerId]);

  // ── Toggle assistant ──
  const toggleAssistant = (id) => {
    setAssistantIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  };

  // ── Toggle course item ──
  const toggleCourseItem = (rowId) => {
    setSelectedCourseItems(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId); else next.add(rowId);
      return next;
    });
  };

  // ── Add medication row ──
  const addMedication = () => {
    setMedications(prev => [...prev, { name: '', dosage: '', qty: '', unitPrice: '' }]);
  };
  const updateMed = (i, field, value) => {
    setMedications(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: value } : m));
  };
  const removeMed = (i) => {
    setMedications(prev => prev.filter((_, idx) => idx !== i));
  };

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!doctorId) { setError('กรุณาเลือกแพทย์'); return; }
    setSaving(true);
    setError('');
    try {
      const data = await broker.createTreatment(customerId, {
        doctorId,
        assistantIds,
        treatmentDate,
        ...opd,
        vitals,
        bloodType,
        congenitalDisease,
        drugAllergy,
        treatmentHistory,
        medCertActuallyCome,
        medCertIsRest,
        medCertPeriod,
        medCertIsOther,
        medCertOtherDetail,
        courseItems: Array.from(selectedCourseItems).map(rowId => ({ rowId })),
        medications: medications.filter(m => m.name),
        benefitType,
        insuranceCompanyId,
        paymentType,
        paymentChannelId,
        saleNote,
        paymentDate: treatmentDate,
      });
      if (data.success) {
        setSuccess(true);
        setTimeout(() => { if (onCreated) onCreated(data.treatmentId); }, 1500);
      } else {
        setError(data.error || 'สร้างไม่สำเร็จ');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Loading state ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={`fixed inset-0 z-[80] flex items-center justify-center ${isDark ? 'bg-[#0a0a0a]' : 'bg-gray-50'}`}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={24} className="animate-spin" style={{ color: accent }} />
          <p className="text-xs text-gray-500">กำลังโหลดฟอร์มการรักษา...</p>
        </div>
      </div>
    );
  }

  // ── Success state ───────────────────────────────────────────────────────
  if (success) {
    return (
      <div className={`fixed inset-0 z-[80] flex items-center justify-center ${isDark ? 'bg-[#0a0a0a]' : 'bg-gray-50'}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
            <Check size={24} className="text-green-500" />
          </div>
          <p className="text-sm font-bold text-green-500">สร้างการรักษาสำเร็จ</p>
        </div>
      </div>
    );
  }

  const doctors = options?.doctors || [];
  const assistants = options?.assistants || [];
  const customerCourses = options?.customerCourses || [];
  const bloodTypeOptions = options?.bloodTypeOptions || [];
  const benefitTypes = options?.benefitTypes || [];
  const insuranceCompanies = options?.insuranceCompanies || [];
  const paymentChannels = options?.paymentChannels || [];

  return (
    <div className={`fixed inset-0 z-[80] overflow-y-auto ${isDark ? 'bg-[#0a0a0a] text-gray-200' : 'bg-gray-50 text-gray-800'}`}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className={`sticky top-0 z-10 border-b backdrop-blur-sm ${isDark ? 'bg-[#0a0a0a]/95 border-[#222]' : 'bg-white/95 border-gray-200'}`}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onClose} className={`p-1.5 rounded-lg transition-all ${isDark ? 'hover:bg-[#1a1a1a]' : 'hover:bg-gray-100'}`}>
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-black tracking-tight flex items-center gap-2" style={{ color: accent }}>
              <Stethoscope size={16} />
              สร้างการรักษาใหม่
            </h2>
            {patientName && <p className="text-[10px] text-gray-500 truncate">{patientName}</p>}
          </div>
          <button onClick={handleSubmit} disabled={saving}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50 transition-all flex items-center gap-1.5">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? 'กำลังบันทึก...' : 'ยืนยันการรักษา'}
          </button>
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="max-w-6xl mx-auto px-4 pt-3">
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-500 font-bold">{error}</div>
        </div>
      )}

      {/* ── Two-Column Layout ──────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ════ LEFT PANEL ════ */}
          <div className="space-y-4">

            {/* Doctor / Assistants / Date */}
            <FormSection isDark={isDark}>
              <SectionHeader icon={Stethoscope} title="ข้อมูลการรักษา" isDark={isDark} accent={accent} />
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>แพทย์ *</label>
                  <select value={doctorId} onChange={e => setDoctorId(e.target.value)} className={selectCls}>
                    <option value="">เลือกแพทย์</option>
                    {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>ผู้ช่วยแพทย์ (สูงสุด 5 คน)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {assistants.map(a => {
                      const sel = assistantIds.includes(a.id);
                      return (
                        <button key={a.id} onClick={() => toggleAssistant(a.id)}
                          className={`text-[10px] px-2 py-1 rounded-lg border transition-all ${sel
                            ? 'bg-purple-600/20 border-purple-500/50 text-purple-400 font-bold'
                            : isDark ? 'border-[#333] text-gray-500 hover:border-[#555]' : 'border-gray-200 text-gray-500 hover:border-gray-400'
                          }`}>
                          {a.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>วันที่รักษา</label>
                  <input type="date" value={treatmentDate} onChange={e => setTreatmentDate(e.target.value)} className={inputCls} />
                </div>
              </div>
            </FormSection>

            {/* Health Info */}
            <FormSection isDark={isDark}>
              <SectionHeader icon={Heart} title="ข้อมูลสุขภาพลูกค้า" isDark={isDark} accent="#ef4444" />
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>กรุ๊ปเลือด</label>
                  {bloodTypeOptions.length > 0 ? (
                    <select value={bloodType} onChange={e => setBloodType(e.target.value)} className={selectCls}>
                      <option value="">-</option>
                      {bloodTypeOptions.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  ) : (
                    <input value={bloodType} onChange={e => setBloodType(e.target.value)} className={inputCls} placeholder="กรุ๊ปเลือด" />
                  )}
                </div>
                <div>
                  <label className={labelCls}>โรคประจำตัว</label>
                  <textarea value={congenitalDisease} onChange={e => setCongenitalDisease(e.target.value)}
                    rows={2} className={`${inputCls} resize-none`} placeholder="โรคประจำตัว" />
                </div>
                <div>
                  <label className={labelCls}>ประวัติแพ้ยา</label>
                  <textarea value={drugAllergy} onChange={e => setDrugAllergy(e.target.value)}
                    rows={2} className={`${inputCls} resize-none`} placeholder="ประวัติแพ้ยา" />
                </div>
                <div>
                  <label className={labelCls}>ประวัติการรักษาอื่นๆ</label>
                  <textarea value={treatmentHistory} onChange={e => setTreatmentHistory(e.target.value)}
                    rows={2} className={`${inputCls} resize-none`} placeholder="ประวัติการรักษาอื่นๆ" />
                </div>
              </div>
            </FormSection>

            {/* Vital Signs */}
            <FormSection isDark={isDark}>
              <SectionHeader icon={Thermometer} title="ข้อมูลซักประวัติ (Vital Signs)" isDark={isDark} accent="#f59e0b" />
              <div className="grid grid-cols-3 gap-2">
                {[
                  ['weight', 'น้ำหนัก (kg)'], ['height', 'ส่วนสูง (cm)'],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className={labelCls}>{label}</label>
                    <input value={vitals[key]} onChange={e => setVitals(prev => ({ ...prev, [key]: e.target.value }))}
                      className={`${inputCls} text-center`} placeholder="-" />
                  </div>
                ))}
                <div>
                  <label className={labelCls}>BMI</label>
                  <input value={bmi} readOnly className={`${inputCls} text-center opacity-60`} placeholder="-" />
                </div>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-2">
                {[
                  ['temperature', 'BT (°C)'], ['pulseRate', 'PR (bpm)'], ['respiratoryRate', 'RR'],
                  ['systolicBP', 'SBP (mmHg)'], ['diastolicBP', 'DBP (mmHg)'],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className={labelCls}>{label}</label>
                    <input value={vitals[key]} onChange={e => setVitals(prev => ({ ...prev, [key]: e.target.value }))}
                      className={`${inputCls} text-center`} placeholder="-" />
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <label className={labelCls}>O₂ Sat (%)</label>
                <input value={vitals.oxygenSaturation} onChange={e => setVitals(prev => ({ ...prev, oxygenSaturation: e.target.value }))}
                  className={`${inputCls} text-center w-24`} placeholder="-" />
              </div>
            </FormSection>

            {/* Consent & Med Cert */}
            <FormSection isDark={isDark}>
              <SectionHeader icon={ClipboardList} title="ใบรับรองแพทย์" isDark={isDark} accent="#06b6d4" />
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={medCertActuallyCome} onChange={e => setMedCertActuallyCome(e.target.checked)}
                    className="rounded border-gray-400" />
                  ผู้ป่วยมารักษาวันนี้จริง
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={medCertIsRest} onChange={e => setMedCertIsRest(e.target.checked)}
                    className="rounded border-gray-400" />
                  ให้หยุดพัก
                </label>
                {medCertIsRest && (
                  <div className="ml-6">
                    <label className={labelCls}>ระยะเวลาหยุดพัก</label>
                    <input value={medCertPeriod} onChange={e => setMedCertPeriod(e.target.value)}
                      className={inputCls} placeholder="เช่น 3 วัน" />
                  </div>
                )}
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={medCertIsOther} onChange={e => setMedCertIsOther(e.target.checked)}
                    className="rounded border-gray-400" />
                  อื่นๆ
                </label>
                {medCertIsOther && (
                  <div className="ml-6">
                    <textarea value={medCertOtherDetail} onChange={e => setMedCertOtherDetail(e.target.value)}
                      rows={2} className={`${inputCls} resize-none`} placeholder="รายละเอียด" />
                  </div>
                )}
              </div>
            </FormSection>
          </div>

          {/* ════ RIGHT PANEL — OPD Card ════ */}
          <div className="space-y-4">
            <FormSection isDark={isDark}>
              <SectionHeader icon={ClipboardList} title="OPD Card" isDark={isDark} accent={accent} />
              <div className="space-y-3">
                {[
                  ['symptoms', 'CC — อาการ (Chief Complaint)', 3],
                  ['physicalExam', 'PE — ตรวจร่างกาย (Physical Exam)', 3],
                  ['diagnosis', 'DX — วินิจฉัยโรค (Diagnosis)', 3],
                  ['treatmentInfo', 'Tx — รักษา / Dr. Note', 3],
                  ['treatmentPlan', 'Plan — แผนการรักษา', 2],
                  ['treatmentNote', 'Note — หมายเหตุการรักษา', 2],
                  ['additionalNote', 'หมายเหตุเพิ่มเติม', 2],
                ].map(([key, label, rows]) => (
                  <div key={key}>
                    <label className={labelCls}>{label}</label>
                    <textarea value={opd[key]} onChange={e => setOpd(prev => ({ ...prev, [key]: e.target.value }))}
                      rows={rows} className={`${inputCls} resize-none`} />
                  </div>
                ))}
              </div>
            </FormSection>
          </div>
        </div>

        {/* ════ FULL-WIDTH BOTTOM SECTIONS ════ */}
        <div className="space-y-4 mt-4">

          {/* Take-Home Medications */}
          <FormSection isDark={isDark}>
            <SectionHeader icon={Pill} title="สั่งยากลับบ้าน" isDark={isDark} accent="#10b981">
              <button onClick={addMedication}
                className="ml-auto text-[10px] font-bold px-2 py-1 rounded-lg border transition-all flex items-center gap-1"
                style={{ color: '#10b981', borderColor: 'rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.05)' }}>
                <Plus size={10} /> เพิ่มยา
              </button>
            </SectionHeader>
            {medications.length === 0 ? (
              <p className="text-[10px] text-gray-500 text-center py-4">ยังไม่มีรายการยากลับบ้าน — กด "เพิ่มยา" เพื่อเริ่มต้น</p>
            ) : (
              <div className="space-y-2">
                {/* Header row */}
                <div className="grid grid-cols-12 gap-2 text-[9px] font-bold uppercase tracking-widest text-gray-500 px-1">
                  <div className="col-span-4">ชื่อยา</div>
                  <div className="col-span-3">วิธีรับประทาน</div>
                  <div className="col-span-2">จำนวน</div>
                  <div className="col-span-2">ราคา/หน่วย</div>
                  <div className="col-span-1"></div>
                </div>
                {medications.map((med, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <input value={med.name} onChange={e => updateMed(i, 'name', e.target.value)}
                      className={`${inputCls} col-span-4`} placeholder="ชื่อยา" />
                    <input value={med.dosage} onChange={e => updateMed(i, 'dosage', e.target.value)}
                      className={`${inputCls} col-span-3`} placeholder="วิธีรับประทาน" />
                    <input value={med.qty} onChange={e => updateMed(i, 'qty', e.target.value)}
                      className={`${inputCls} col-span-2 text-center`} placeholder="0" />
                    <input value={med.unitPrice} onChange={e => updateMed(i, 'unitPrice', e.target.value)}
                      className={`${inputCls} col-span-2 text-center`} placeholder="0" />
                    <button onClick={() => removeMed(i)}
                      className="col-span-1 flex items-center justify-center text-red-400 hover:text-red-300 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </FormSection>

          {/* Course Usage */}
          <FormSection isDark={isDark}>
            <SectionHeader icon={ShoppingCart} title="ข้อมูลการใช้คอร์ส" isDark={isDark} accent="#f97316" />
            {customerCourses.length === 0 ? (
              <p className="text-[10px] text-gray-500 text-center py-4">ลูกค้าไม่มีคอร์สที่ใช้งานอยู่</p>
            ) : (
              <div className="space-y-3">
                {customerCourses.map(course => (
                  <div key={course.courseId} className={`rounded-lg border p-3 ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-100 bg-gray-50'}`}>
                    <p className="text-[11px] font-bold mb-2" style={{ color: '#f97316' }}>{course.courseName}</p>
                    <div className="space-y-1.5">
                      {course.products.map(product => {
                        const isSelected = selectedCourseItems.has(product.rowId);
                        return (
                          <label key={product.rowId}
                            className={`flex items-center gap-2 text-xs cursor-pointer px-2 py-1.5 rounded-lg transition-all ${
                              isSelected
                                ? isDark ? 'bg-orange-500/10 border border-orange-500/30' : 'bg-orange-50 border border-orange-200'
                                : isDark ? 'hover:bg-[#1a1a1a]' : 'hover:bg-gray-100'
                            }`}>
                            <input type="checkbox" checked={isSelected} onChange={() => toggleCourseItem(product.rowId)}
                              className="rounded border-gray-400 text-orange-500 focus:ring-orange-500" />
                            <span className={isSelected ? 'font-bold' : ''}>{product.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {selectedCourseItems.size > 0 && (
                  <p className="text-[10px] font-bold text-orange-500">เลือก {selectedCourseItems.size} รายการ</p>
                )}
              </div>
            )}
          </FormSection>

          {/* Insurance Claims */}
          <FormSection isDark={isDark}>
            <SectionHeader icon={Shield} title="เบิกประกัน" isDark={isDark} accent="#8b5cf6" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>ประเภทสิทธิ</label>
                <select value={benefitType} onChange={e => setBenefitType(e.target.value)} className={selectCls}>
                  <option value="">ไม่เบิก</option>
                  {benefitTypes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              {benefitType && (
                <div>
                  <label className={labelCls}>บริษัทประกัน</label>
                  <select value={insuranceCompanyId} onChange={e => setInsuranceCompanyId(e.target.value)} className={selectCls}>
                    <option value="">เลือกบริษัทประกัน</option>
                    {insuranceCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          </FormSection>

          {/* Payment */}
          <FormSection isDark={isDark}>
            <SectionHeader icon={CreditCard} title="การชำระเงิน" isDark={isDark} accent="#ec4899" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>รูปแบบชำระ</label>
                <select value={paymentType} onChange={e => setPaymentType(e.target.value)} className={selectCls}>
                  <option value="pay_later">ชำระภายหลัง</option>
                  <option value="full">ชำระเต็มจำนวน</option>
                  <option value="installment">แบ่งชำระ</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>ช่องทางชำระ</label>
                <select value={paymentChannelId} onChange={e => setPaymentChannelId(e.target.value)} className={selectCls}>
                  <option value="">-</option>
                  {paymentChannels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>วันที่ขาย</label>
                <input type="date" value={treatmentDate} readOnly className={`${inputCls} opacity-60`} />
              </div>
            </div>
            <div className="mt-3">
              <label className={labelCls}>หมายเหตุการขาย</label>
              <textarea value={saleNote} onChange={e => setSaleNote(e.target.value)}
                rows={2} className={`${inputCls} resize-none`} placeholder="หมายเหตุ" />
            </div>
          </FormSection>

          {/* Submit Button (bottom) */}
          <div className="flex justify-end gap-3 pt-2 pb-8">
            <button onClick={onClose} disabled={saving}
              className={`px-6 py-2.5 rounded-xl text-xs font-bold border transition-all ${isDark ? 'border-[#333] text-gray-400 hover:bg-[#1a1a1a]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              ยกเลิก
            </button>
            <button onClick={handleSubmit} disabled={saving}
              className="px-8 py-2.5 rounded-xl text-sm font-black bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50 transition-all flex items-center gap-2 shadow-lg shadow-purple-600/20">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {saving ? 'กำลังบันทึก...' : 'ยืนยันการรักษา'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
