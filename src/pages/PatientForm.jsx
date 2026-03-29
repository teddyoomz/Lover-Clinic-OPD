import { useState, useEffect, useRef } from 'react';
import { doc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import {
  ArrowLeft, Activity, AlertCircle, CheckCircle2, Clock, Edit3,
  TimerOff, User, Phone, MapPin, HeartPulse, Pill, CheckSquare, Flame, Globe, Lock
} from 'lucide-react';
import { DEFAULT_CLINIC_SETTINGS, SESSION_TIMEOUT_MS } from '../constants.js';
import {
  hexToRgb, THAI_MONTHS, EN_MONTHS, YEARS_BE, YEARS_CE,
  COUNTRY_CODES, NATIONALITY_COUNTRIES, defaultFormData
} from '../utils.js';
import ThemeToggle from '../components/ThemeToggle.jsx';
import ClinicLogo from '../components/ClinicLogo.jsx';
import thaiAddressDB from '../data/thai-address-db.js';

export default function PatientForm({ db, appId, user, sessionId, isSimulation, suppressNotif, onBack, clinicSettings = {}, theme, setTheme }) {
  const cs = { ...DEFAULT_CLINIC_SETTINGS, ...clinicSettings };
  const ac = cs.accentColor;
  const acRgb = hexToRgb(ac);
  const [formData, setFormData] = useState(defaultFormData);
  const [language, setLanguageRaw] = useState('th');
  const setLanguage = (lang) => {
    setLanguageRaw(lang);
    // Clear name fields only on new forms — preserve existing data when editing
    if (!isEditing) {
      setFormData(prev => ({ ...prev, firstName: '', lastName: '' }));
    }
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sessionExists, setSessionExists] = useState(true);
  const [isExpired, setIsExpired] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isEditing, setIsEditing] = useState(false); 
  const [sessionType, setSessionType] = useState('intake');
  const [customTemplate, setCustomTemplate] = useState(null);
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [countryFilter, setCountryFilter] = useState('');
  const countryDropdownRef = useRef(null);
  const originalDataRef = useRef(null); // เก็บ snapshot ข้อมูลก่อนแก้ไข สำหรับ diff notification

  useEffect(() => {
    setFormData(prev => {
      if (!prev.dobYear) return prev;
      let year = parseInt(prev.dobYear);
      if (language === 'en' && year > 2400) return { ...prev, dobYear: (year - 543).toString() };
      else if (language === 'th' && year < 2400) return { ...prev, dobYear: (year + 543).toString() };
      return prev;
    });
  }, [language]);

  useEffect(() => {
    if (!sessionId) return;
    const unsubscribe = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId), (snapshot) => {
      if (!snapshot.exists()) { setSessionExists(false); return; }
      const data = snapshot.data();
      const currentFormType = data.formType || 'intake';
      setSessionType(currentFormType);
      
      if (currentFormType === 'custom' && data.customTemplate) {
        setCustomTemplate(data.customTemplate);
      }

      if (data.isArchived) { setIsClosed(true); return; }

      if (data.createdAt && !data.isPermanent) {
        if (Date.now() - data.createdAt.toMillis() > SESSION_TIMEOUT_MS) { setIsExpired(true); return; }
      }
      
      if (data.status === 'completed' && data.patientData) {
        let pd = { ...data.patientData };
        if (pd.visitReason && !pd.visitReasons) pd.visitReasons = [pd.visitReason];
        if (!pd.visitReasons) pd.visitReasons = [];
        if (pd.hrtGoal && !pd.hrtGoals) pd.hrtGoals = [pd.hrtGoal];
        if (!pd.hrtGoals) pd.hrtGoals = [];
        
        if (pd.dobYear) {
          let year = parseInt(pd.dobYear);
          if (language === 'en' && year > 2400) pd.dobYear = (year - 543).toString();
          if (language === 'th' && year < 2400) pd.dobYear = (year + 543).toString();
        }

        setFormData(pd);
        if (!originalDataRef.current && !isEditing) originalDataRef.current = { ...pd };
        if (!isEditing) setIsSuccess(true);
      }
    });
    return () => unsubscribe();
  }, [db, appId, user, sessionId, isEditing]);

  // Close country dropdown on click outside
  useEffect(() => {
    const handler = (e) => {
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(e.target)) {
        setCountryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    let finalValue = type === 'checkbox' ? checked : value;

    if ((name === 'phone' && !formData.isInternationalPhone) || (name === 'emergencyPhone' && !formData.isInternationalEmergencyPhone)) {
      finalValue = typeof finalValue === 'string' ? finalValue.replace(/\D/g, '') : finalValue;
    } else if ((name === 'phone' && formData.isInternationalPhone) || (name === 'emergencyPhone' && formData.isInternationalEmergencyPhone)) {
      finalValue = typeof finalValue === 'string' ? finalValue.replace(/\D/g, '') : finalValue;
    }

    // Enforce language-specific input for name fields
    if (name === 'firstName' || name === 'lastName') {
      if (typeof finalValue === 'string') {
        if (language === 'th') {
          // Thai mode: allow only Thai characters, spaces, hyphens
          finalValue = finalValue.replace(/[^\u0E00-\u0E7F\s\-]/g, '');
        } else {
          // English mode: allow only English letters, spaces, hyphens
          finalValue = finalValue.replace(/[^a-zA-Z\s\-]/g, '');
        }
      }
    }

    // ── Cascading address reset (only reset downstream if value actually changed) ──
    if (name === 'province') {
      setFormData(prev => {
        if (prev.province === finalValue) return prev;
        return { ...prev, province: finalValue, district: '', subDistrict: '', postalCode: '' };
      });
      return;
    }
    if (name === 'district') {
      setFormData(prev => {
        if (prev.district === finalValue) return prev;
        return { ...prev, district: finalValue, subDistrict: '', postalCode: '' };
      });
      return;
    }
    if (name === 'subDistrict') {
      setFormData(prev => {
        if (prev.subDistrict === finalValue) return prev;
        const zip = thaiAddressDB[prev.province]?.[prev.district]?.[finalValue];
        return { ...prev, subDistrict: finalValue, postalCode: zip ? String(zip) : '' };
      });
      return;
    }

    setFormData(prev => ({ ...prev, [name]: finalValue }));
  };

  const handleCustomCheckboxChange = (qId, option) => {
    setFormData(prev => {
      const current = Array.isArray(prev[qId]) ? prev[qId] : [];
      const updated = current.includes(option) ? current.filter(o => o !== option) : [...current, option];
      return { ...prev, [qId]: updated };
    });
  };

  const handleReasonToggle = (reason) => {
    setFormData(prev => {
      const current = prev.visitReasons || [];
      return { ...prev, visitReasons: current.includes(reason) ? current.filter(r => r !== reason) : [...current, reason] };
    });
  };

  const handleHowFoundUsToggle = (channel) => {
    setFormData(prev => {
      const current = prev.howFoundUs || [];
      return { ...prev, howFoundUs: current.includes(channel) ? current.filter(c => c !== channel) : [...current, channel] };
    });
  };

  const handleGoalToggle = (goal) => {
    setFormData(prev => {
      const current = prev.hrtGoals || [];
      return { ...prev, hrtGoals: current.includes(goal) ? current.filter(g => g !== goal) : [...current, goal] };
    });
  };

  const handleDobChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const newData = { ...prev, [name]: value };
      if (newData.dobDay && newData.dobMonth && newData.dobYear) {
        const today = new Date();
        let birthYearAD = parseInt(newData.dobYear);
        if (birthYearAD > 2400) birthYearAD -= 543; 
        const birthMonth = parseInt(newData.dobMonth) - 1; 
        const birthDate = parseInt(newData.dobDay);
        let calculatedAge = today.getFullYear() - birthYearAD;
        if (today.getMonth() < birthMonth || (today.getMonth() === birthMonth && today.getDate() < birthDate)) {
          calculatedAge--;
        }
        newData.age = calculatedAge >= 0 ? calculatedAge.toString() : '0';
      }
      return newData;
    });
  };

  const getChangedSections = (oldData, newData) => {
    const sections = [];
    const diff = (fields) => fields.some(f => {
      const a = Array.isArray(oldData[f]) ? JSON.stringify(oldData[f]) : String(oldData[f] ?? '');
      const b = Array.isArray(newData[f]) ? JSON.stringify(newData[f]) : String(newData[f] ?? '');
      return a !== b;
    });
    if (diff(['prefix','firstName','lastName','gender','dobDay','dobMonth','dobYear','age','address','province','district','subDistrict','postalCode','nationality','nationalityCountry'])) sections.push('ข้อมูลส่วนตัว');
    if (diff(['phone','phoneCountryCode','isInternationalPhone','emergencyName','emergencyPhone','emergencyRelation','emergencyPhoneCountryCode'])) sections.push('ข้อมูลติดต่อ');
    if (diff(['visitReasons','visitReasonOther','hrtGoals','hrtTransType','hrtOtherDetail'])) sections.push('สาเหตุที่มา');
    const healthFields = ['hasAllergies','allergiesDetail','hasUnderlying','currentMedication','pregnancy','ud_hypertension','ud_diabetes','ud_lung','ud_kidney','ud_heart','ud_blood','ud_other','ud_otherDetail'];
    if (diff(healthFields)) sections.push('ประวัติสุขภาพ');
    const scoreFields = Object.keys({...oldData,...newData}).filter(k => k.startsWith('adam_') || k.startsWith('iief_') || k.startsWith('mrs_') || k === 'symp_pe');
    if (diff(scoreFields)) sections.push('แบบประเมิน');
    if (diff(['howFoundUs'])) sections.push('ช่องทางที่รู้จัก');
    return sections;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!sessionId || isExpired) return;

    // Validate name matches selected language
    const thaiNameRegex = /^[\u0E00-\u0E7F\s\-]+$/;
    const engNameRegex = /^[a-zA-Z\s\-]+$/;
    if (language === 'th') {
      if (formData.firstName && !thaiNameRegex.test(formData.firstName)) {
        alert('กรุณากรอกชื่อเป็นภาษาไทยเท่านั้น');
        return;
      }
      if (formData.lastName && !thaiNameRegex.test(formData.lastName)) {
        alert('กรุณากรอกนามสกุลเป็นภาษาไทยเท่านั้น');
        return;
      }
    } else {
      if (formData.firstName && !engNameRegex.test(formData.firstName)) {
        alert('Please enter first name in English only.');
        return;
      }
      if (formData.lastName && !engNameRegex.test(formData.lastName)) {
        alert('Please enter last name in English only.');
        return;
      }
    }

    if (!formData.province) {
      alert(language === 'en' ? "Please select a province." : "กรุณาเลือกจังหวัด");
      return;
    }
    if (formData.nationality === 'ต่างชาติ' && !formData.nationalityCountry) {
      alert(language === 'en' ? "Please select a country." : "กรุณาเลือกประเทศ");
      return;
    }

    if (isIntake) {
      if (!formData.howFoundUs || formData.howFoundUs.length === 0) {
        alert(language === 'en' ? "Please select how you found our clinic." : "กรุณาเลือกช่องทางที่ท่านรู้จักคลินิกอย่างน้อย 1 ช่องทาง");
        return;
      }
      if (!formData.visitReasons || formData.visitReasons.length === 0) {
        alert(language === 'en' ? "Please select at least one visit reason." : "กรุณาเลือกสาเหตุที่มาพบแพทย์อย่างน้อย 1 ข้อ");
        return;
      }
      if (formData.visitReasons.includes('เสริมฮอร์โมน') && formData.hrtGoals.length === 0) {
        alert(language === 'en' ? "Please select at least one goal for HRT." : "กรุณาเลือกเป้าหมายของการเสริมฮอร์โมนอย่างน้อย 1 ข้อ");
        return;
      }
    }

    const thaiPhoneRegex = /^0\d{9}$/;
    if (sessionType === 'intake' || sessionType === 'deposit') {
        if (!formData.isInternationalPhone && !thaiPhoneRegex.test(formData.phone)) {
            alert(language === 'en' ? "Please enter a valid Thai 10-digit phone number starting with 0." : "กรุณากรอกเบอร์โทรศัพท์ของท่านให้ถูกต้อง (เบอร์ไทยต้องเป็นตัวเลข 10 หลัก และขึ้นต้นด้วย 0)");
            return;
        }
        if (!formData.isInternationalEmergencyPhone && formData.emergencyPhone && !thaiPhoneRegex.test(formData.emergencyPhone)) {
            alert(language === 'en' ? "Please enter a valid Thai 10-digit emergency phone number." : "กรุณากรอกเบอร์โทรติดต่อฉุกเฉินให้ถูกต้อง");
            return;
        }
    }

    if ((sessionType === 'intake' || sessionType === 'deposit' || sessionType === 'custom') && formData.dobDay && formData.dobMonth && formData.dobYear && formData.age) {
        const today = new Date();
        let birthYearAD = parseInt(formData.dobYear);
        if (birthYearAD > 2400) birthYearAD -= 543;
        const birthMonth = parseInt(formData.dobMonth) - 1; 
        const birthDate = parseInt(formData.dobDay);
        let calculatedAge = today.getFullYear() - birthYearAD;
        if (today.getMonth() < birthMonth || (today.getMonth() === birthMonth && today.getDate() < birthDate)) { calculatedAge--; }
        if (parseInt(formData.age) !== calculatedAge) {
            alert(language === 'en' ? `Age mismatch: Calculated age is ${calculatedAge} years. Please correct.` : `ข้อมูลอายุไม่ตรงกับปีเกิด (อายุจริงคือ ${calculatedAge} ปี) กรุณาตรวจสอบ`);
            return;
        }
    }

    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'opd_sessions', sessionId), {
        status: 'completed', patientData: formData, [isEditing ? 'updatedAt' : 'submittedAt']: serverTimestamp(), isUnread: !suppressNotif
      });
      // แจ้งเตือน push — fire and forget (ไม่ await เพื่อไม่ block UI)
      const changedSections = isEditing && originalDataRef.current
        ? getChangedSections(originalDataRef.current, formData)
        : [];
      fetch('https://us-central1-loverclinic-opd-4c39b.cloudfunctions.net/sendPushOnSubmit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, changedSections })
      }).catch(() => {});
      setIsSuccess(true); setIsEditing(false); window.scrollTo(0, 0); 
    } catch (error) {
      alert(language === 'en' ? "System Error: Cannot submit data." : "เกิดข้อผิดพลาดของระบบ");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDark = theme === 'dark' || (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  const LanguageToggle = () => (
    <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
      {theme && setTheme && <ThemeToggle theme={theme} setTheme={setTheme} compact />}
      <div style={{ display: 'flex', background: isDark ? 'rgba(220,38,38,0.08)' : 'rgba(236,72,153,0.08)', border: `1px solid ${isDark ? 'rgba(220,38,38,0.2)' : 'rgba(236,72,153,0.2)'}`, borderRadius: '8px', overflow: 'hidden' }}>
        <button type="button" onClick={() => setLanguage('th')} className={`px-3 py-2 text-xs font-bold transition-colors ${language === 'th' ? 'text-white' : isDark ? 'text-red-300/50 hover:text-white' : 'text-pink-400/50 hover:text-pink-800'}`} style={language === 'th' ? {backgroundColor: isDark ? '#dc2626' : '#ec4899', color: '#fff'} : {}}>TH</button>
        <button type="button" onClick={() => setLanguage('en')} className={`px-3 py-2 text-xs font-bold transition-colors ${language === 'en' ? 'text-white' : isDark ? 'text-red-300/50 hover:text-white' : 'text-pink-400/50 hover:text-pink-800'}`} style={language === 'en' ? {backgroundColor: isDark ? '#dc2626' : '#ec4899', color: '#fff'} : {}}>EN</button>
      </div>
    </div>
  );

  if (!sessionId || !sessionExists) {
    return (
      <div className="w-full max-w-xl mx-auto p-6 pt-24 text-center relative" style={{ minHeight: '100vh', background: isDark ? 'linear-gradient(180deg, #1a0000 0%, #050505 50%, #0d0500 100%)' : 'linear-gradient(180deg, #fdf2f8 0%, #ffffff 50%, #fff5f7 100%)' }}>
        <LanguageToggle />
        <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8" style={{ background: isDark ? 'linear-gradient(135deg, #1a0000, #0a0a0a)' : 'linear-gradient(135deg, #fdf2f8, #ffffff)', border: `1px solid ${isDark ? 'rgba(90,16,16,0.4)' : 'rgba(236,72,153,0.15)'}`, color: isDark ? '#4a1a1a' : '#f9a8d4' }}><AlertCircle size={40} /></div>
        <h2 className="text-2xl font-black uppercase tracking-widest mb-4" style={{ color: isDark ? '#ffffff' : '#0f172a' }}>{language === 'en' ? 'Invalid Link' : 'ลิงก์ไม่ถูกต้อง'}</h2>
        <p className="mb-8 text-base tracking-wider" style={{ color: isDark ? '#9ca3af' : '#64748b' }}>{language === 'en' ? 'This QR Code or link is invalid or has been removed.' : 'QR Code หรือลิงก์นี้ไม่ถูกต้อง หรือถูกลบออกจากระบบแล้ว'}</p>
        {isSimulation && <button onClick={onBack} className="font-bold text-base uppercase tracking-widest flex items-center justify-center gap-2 mx-auto transition-colors" style={{ color: isDark ? '#ef4444' : '#ec4899' }}><ArrowLeft size={20} /> {language === 'en' ? 'Return' : 'กลับหน้าหลัก'}</button>}
      </div>
    );
  }

  if (isClosed) {
    return (
      <div className="w-full max-w-xl mx-auto p-6 pt-12 text-center relative" style={{ minHeight: '100vh', background: isDark ? 'linear-gradient(180deg, #1a0000 0%, #050505 50%, #0d0500 100%)' : 'linear-gradient(180deg, #fdf2f8 0%, #ffffff 50%, #fff5f7 100%)' }}>
        <LanguageToggle />
        <div className="p-8 sm:p-10 rounded-3xl" style={{ background: isDark ? 'linear-gradient(135deg, #1a0000, #0a0a0a, #200000)' : 'linear-gradient(135deg, #fff5f7, #ffffff, #fdf2f8)', border: `1px solid ${isDark ? 'rgba(90,16,16,0.3)' : 'rgba(236,72,153,0.15)'}`, boxShadow: isDark ? '0 0 40px rgba(0,0,0,0.6), 0 0 80px rgba(220,38,38,0.05)' : '0 8px 32px rgba(236,72,153,0.08)' }}>
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: isDark ? 'rgba(74,26,10,0.2)' : 'rgba(236,72,153,0.06)', border: `1px solid ${isDark ? 'rgba(74,26,10,0.4)' : 'rgba(236,72,153,0.15)'}`, color: isDark ? '#6b5050' : '#f9a8d4' }}><Lock size={32} /></div>
          <h2 className="text-2xl font-black uppercase tracking-widest mb-4" style={{ color: isDark ? '#ffffff' : '#0f172a' }}>{language === 'en' ? 'Session Closed' : 'คิวถูกปิดแล้ว'}</h2>
          <p className="mb-10 text-base leading-relaxed" style={{ color: isDark ? '#9ca3af' : '#64748b' }}>{language === 'en' ? 'This session has been closed by the clinic. Please contact the clinic for a new QR Code.' : 'คลินิกได้ปิดคิวนี้แล้ว กรุณาติดต่อคลินิกเพื่อขอ QR Code ใหม่'}</p>
          {isSimulation && <button onClick={onBack} className="text-sm uppercase font-bold tracking-widest flex items-center justify-center gap-2 mx-auto transition-colors" style={{ color: isDark ? '#9ca3af' : '#64748b' }}><ArrowLeft size={16} /> {language === 'en' ? 'Exit Simulation' : 'ออกจากการจำลอง'}</button>}
        </div>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className="w-full max-w-xl mx-auto p-6 pt-12 text-center relative" style={{ minHeight: '100vh', background: isDark ? 'linear-gradient(180deg, #1a0000 0%, #050505 50%, #0d0500 100%)' : 'linear-gradient(180deg, #fdf2f8 0%, #ffffff 50%, #fff5f7 100%)' }}>
        <LanguageToggle />
        <div className="p-8 sm:p-10 rounded-3xl" style={{ background: isDark ? 'linear-gradient(135deg, #1a0000, #0a0a0a, #200000)' : 'linear-gradient(135deg, #fff5f7, #ffffff, #fdf2f8)', border: `1px solid ${isDark ? 'rgba(220,38,38,0.2)' : 'rgba(236,72,153,0.15)'}`, boxShadow: isDark ? '0 0 40px rgba(0,0,0,0.6), 0 0 80px rgba(220,38,38,0.08)' : '0 8px 32px rgba(236,72,153,0.08)' }}>
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: isDark ? 'rgba(220,38,38,0.08)' : 'rgba(239,68,68,0.06)', border: `1px solid ${isDark ? 'rgba(220,38,38,0.25)' : 'rgba(239,68,68,0.15)'}`, color: isDark ? '#ef4444' : '#dc2626', boxShadow: isDark ? '0 0 20px rgba(220,38,38,0.15)' : '0 0 20px rgba(239,68,68,0.08)' }}><TimerOff size={32} /></div>
          <h2 className="text-2xl font-black uppercase tracking-widest mb-4" style={{ color: isDark ? '#ffffff' : '#0f172a' }}>{language === 'en' ? 'Session Expired' : 'คิวหมดอายุ'}</h2>
          <p className="mb-10 text-base leading-relaxed" style={{ color: isDark ? '#9ca3af' : '#64748b' }}>{language === 'en' ? 'For security reasons, sessions expire after 2 hours.' : 'ระบบจำกัดเวลาของคิวไว้ที่ 2 ชั่วโมง กรุณาขอ QR Code ใหม่'}</p>
          {isSimulation && <button onClick={onBack} className="text-sm uppercase font-bold tracking-widest flex items-center justify-center gap-2 mx-auto transition-colors" style={{ color: isDark ? '#9ca3af' : '#64748b' }}><ArrowLeft size={16} /> {language === 'en' ? 'Exit Simulation' : 'ออกจากการจำลอง'}</button>}
        </div>
      </div>
    );
  }

  if (isSuccess && !isEditing) {
    const lineUrl = cs.lineOfficialUrl?.trim();
    const accentR = isDark ? '#dc2626' : '#e11d48';
    const accentO = isDark ? '#f97316' : '#ea580c';
    return (
      <div className="w-full max-w-xl mx-auto p-4 pt-8 text-center relative" style={{ minHeight: '100vh', background: isDark ? 'linear-gradient(180deg, #200000 0%, #0a0a0a 35%, #0a0a0a 100%)' : 'linear-gradient(180deg, #fdf2f8 0%, #fff5f7 30%, #ffffff 100%)' }}>
        <LanguageToggle />

        {/* ── Success Card ── */}
        <div className="rounded-2xl relative overflow-hidden mb-4" style={{ background: isDark ? 'rgba(15,8,5,0.85)' : 'rgba(255,255,255,0.9)', backdropFilter: 'blur(16px)', border: `1px solid ${isDark ? 'rgba(220,38,38,0.12)' : 'rgba(236,72,153,0.15)'}`, boxShadow: isDark ? '0 0 60px rgba(0,0,0,0.6), 0 0 30px rgba(220,38,38,0.03)' : '0 8px 40px rgba(236,72,153,0.08)' }}>
          {/* Top accent bar */}
          <div className="absolute top-0 left-0 w-full h-1" style={{ background: isDark ? `linear-gradient(90deg, ${accentR}, ${accentO}, ${accentR})` : 'linear-gradient(90deg, #ec4899, #f472b6, #ec4899)' }}></div>

          <div className="px-8 pt-12 pb-10">
            {/* Checkmark icon */}
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: isDark ? 'rgba(34,197,94,0.06)' : 'rgba(34,197,94,0.08)', border: `2px solid ${isDark ? 'rgba(34,197,94,0.2)' : 'rgba(34,197,94,0.25)'}`, color: isDark ? '#34d399' : '#059669', boxShadow: isDark ? '0 0 25px rgba(34,197,94,0.08)' : '0 0 20px rgba(34,197,94,0.1)' }}>
              <CheckCircle2 size={36} />
            </div>
            <h2 className="text-xl font-black uppercase tracking-widest mb-3" style={{ color: isDark ? '#ffffff' : '#0f172a' }}>
              {language === 'en' ? 'Submission Successful' : 'ส่งข้อมูลสำเร็จ'}
            </h2>
            <p className="text-sm leading-relaxed max-w-xs mx-auto" style={{ color: isDark ? '#6b7280' : '#64748b' }}>
              {language === 'en'
                ? 'Your information has been submitted. Please wait to be called by our staff.'
                : 'ข้อมูลของท่านถูกส่งเรียบร้อยแล้ว กรุณารอเจ้าหน้าที่เรียกชื่อเพื่อพบแพทย์'}
            </p>
          </div>
        </div>

        {/* ── LINE CTA Card ── */}
        {lineUrl && (
          <div className="rounded-2xl relative overflow-hidden mb-4" style={{ background: isDark ? 'rgba(15,8,5,0.85)' : 'rgba(255,255,255,0.9)', backdropFilter: 'blur(16px)', border: `1px solid ${isDark ? 'rgba(220,38,38,0.12)' : 'rgba(236,72,153,0.15)'}`, boxShadow: isDark ? '0 0 60px rgba(0,0,0,0.4)' : '0 8px 40px rgba(236,72,153,0.06)' }}>
            <div className="p-5">
              {/* Header with LINE icon */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: '#06C755', boxShadow: '0 0 15px rgba(6,199,85,0.25)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                    <path d="M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                  </svg>
                </div>
                <div className="text-left">
                  <p className="text-sm font-black" style={{ color: isDark ? '#ffffff' : '#0f172a' }}>
                    {language === 'en' ? 'Add LINE Official' : 'เพิ่มเพื่อน LINE Official'}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: isDark ? accentO : '#ea580c' }}>
                    {language === 'en' ? '🔔 Important Step' : '🔔 ขั้นตอนสำคัญ'}
                  </p>
                </div>
              </div>

              {/* Highlighted description */}
              <div className="rounded-xl p-4 mb-4 text-left relative overflow-hidden" style={{ background: isDark ? 'rgba(220,38,38,0.08)' : 'rgba(220,38,38,0.06)', border: `1px solid ${isDark ? 'rgba(220,38,38,0.25)' : 'rgba(220,38,38,0.2)'}` }}>
                <div className="absolute top-0 left-0 w-1 h-full" style={{ background: '#dc2626' }}></div>
                <p className="text-[15px] leading-[1.7] font-bold pl-2.5" style={{ color: isDark ? '#f5f5f4' : '#1e293b' }}>
                  {language === 'en'
                    ? '⚠️ To receive appointment confirmations, prescriptions, treatment updates, and direct communication from our medical team — please add our LINE Official Account now! ⚠️'
                    : '⚠️ เพื่อรับการยืนยันนัดหมาย ใบสั่งยา ผลการรักษา และการติดต่อจากทีมแพทย์โดยตรง — กรุณาเพิ่มเพื่อนกับเราไว้ล่วงหน้า ⚠️'}
                </p>
              </div>

              {/* LINE Button */}
              <a
                href={lineUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-white font-black text-sm tracking-wider transition-all active:scale-95"
                style={{ backgroundColor: '#06C755', boxShadow: '0 4px 20px rgba(6,199,85,0.35)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                  <path d="M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                </svg>
                {language === 'en' ? 'Add LINE Official Account' : 'เพิ่มเพื่อน LINE Official'}
              </a>
            </div>
          </div>
        )}

        {/* ── Action buttons ── */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => { setIsSuccess(false); setIsEditing(true); }}
            className="w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
            style={{ background: isDark ? 'rgba(15,8,5,0.7)' : 'rgba(255,255,255,0.8)', backdropFilter: 'blur(12px)', border: `1px solid ${isDark ? 'rgba(220,38,38,0.1)' : 'rgba(236,72,153,0.12)'}`, color: isDark ? '#9ca3af' : '#475569' }}
          >
            <Edit3 size={15} /> {language === 'en' ? 'Update Information' : 'แก้ไขข้อมูล'}
          </button>
          {isSimulation && (
            <button onClick={onBack} className="py-3 text-sm font-bold flex items-center justify-center gap-2 mx-auto transition-colors" style={{ color: isDark ? '#4b5563' : '#94a3b8' }}>
              <ArrowLeft size={15} /> {language === 'en' ? 'Exit Simulation' : 'ออกจากการจำลอง'}
            </button>
          )}
        </div>
      </div>
    );
  }

  const selectedReasons = formData.visitReasons || [];
  const selectedGoals = formData.hrtGoals || [];
  
  const isIntake = sessionType === 'intake' || sessionType === 'deposit';
  const isFollowUp = sessionType.startsWith('followup_');
  const isCustom = sessionType === 'custom';
  
  const isPerfMode = isIntake ? selectedReasons.includes('สมรรถภาพทางเพศ') : sessionType === 'followup_ed';
  const isHrtMode = isIntake ? selectedReasons.includes('เสริมฮอร์โมน') : (sessionType === 'followup_adam' || sessionType === 'followup_mrs');
  const showAdam = (isIntake && (isPerfMode || selectedGoals.includes('อาการฮอร์โมนตก/วัยทอง (ผู้ชาย)'))) || sessionType === 'followup_adam';
  const showMrs = (isIntake && selectedGoals.includes('อาการฮอร์โมนตก/วัยทอง (ผู้หญิง)')) || sessionType === 'followup_mrs';

  const getHeaderTitle = () => {
    if (isEditing) return language === 'en' ? 'Update Patient Data' : 'แก้ไขประวัติผู้ป่วย (Update)';
    if (isCustom) return customTemplate?.title || 'Custom Form';
    if (isFollowUp) return language === 'en' ? 'Follow-Up Assessment' : 'ติดตามการรักษา';
    return language === 'en' ? 'New Patient Form' : 'แบบฟอร์มผู้ป่วยใหม่ (Intake)';
  };

  const inputClass = "pf-input";
  const labelClass = "pf-label";
  const sectionHeaderClass = "pf-section-title";

  // Hero text colors — adapt to theme (hero bg is light in light mode)
  const isLightHero = theme === 'light' || (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches);
  const heroText    = isLightHero ? '#0f172a'             : '#ffffff';
  const heroMuted   = isLightHero ? '#64748b'             : 'rgba(255,255,255,0.5)';
  const heroFaint   = isLightHero ? '#94a3b8'             : 'rgba(255,255,255,0.4)';
  const heroGlass   = isLightHero ? 'rgba(0,0,0,0.05)'   : 'rgba(255,255,255,0.06)';
  const heroGlassBd = isLightHero ? 'rgba(0,0,0,0.10)'   : 'rgba(255,255,255,0.10)';

  const visitReasonOptions = [
    { value: 'สมรรถภาพทางเพศ', th: 'สมรรถภาพทางเพศ', en: 'Erectile Dysfunction / Sexual Health' },
    { value: 'โรคระบบทางเดินปัสสาวะ', th: 'โรคระบบทางเดินปัสสาวะ', en: 'Urology / Urinary Tract Issues' },
    { value: 'ดูแลสุขภาพองค์รวม', th: 'ดูแลสุขภาพองค์รวม', en: 'General Health / Wellness' },
    { value: 'เสริมฮอร์โมน', th: 'เสริมฮอร์โมน', en: 'Hormone Replacement Therapy (HRT)' },
    { value: 'โรคติดต่อทางเพศสัมพันธ์', th: 'โรคติดต่อทางเพศสัมพันธ์', en: 'STD / STI Testing & Treatment' },
    { value: 'ขลิบ', th: 'ขลิบ', en: 'Circumcision' },
    { value: 'ทำหมัน', th: 'ทำหมัน', en: 'Vasectomy' },
    { value: 'เลาะสารเหลว', th: 'เลาะสารเหลว', en: 'Foreign Body Removal (Genital)' },
    { value: 'อื่นๆ', th: 'อื่นๆ', en: 'Others' }
  ];

  const hrtGoalOptions = [
    { value: 'ออกกำลังกาย', th: 'ออกกำลังกาย', en: 'Fitness / Bodybuilding' },
    { value: 'อาการฮอร์โมนตก/วัยทอง (ผู้ชาย)', th: 'อาการฮอร์โมนตก/วัยทอง (ผู้ชาย)', en: 'Male Hormone Deficiency / Andropause' },
    { value: 'อาการฮอร์โมนตก/วัยทอง (ผู้หญิง)', th: 'อาการฮอร์โมนตก/วัยทอง (ผู้หญิง)', en: 'Female Menopause' },
    { value: 'ฮอร์โมนเพื่อการข้ามเพศ', th: 'ฮอร์โมนเพื่อการข้ามเพศ', en: 'Transgender HRT' },
    { value: 'อื่นๆ', th: 'อื่นๆ', en: 'Others' }
  ];

  return (
    <div className="pf-outer">
      <div className="pf-card">

        {/* ── Hero Header — always dark ── */}
        <div className="pf-hero">
          {/* Lang + theme toggles */}
          <div className="pf-lang-toggle">
            {theme && setTheme && <ThemeToggle theme={theme} setTheme={setTheme} compact />}
            <div style={{ display: 'flex', background: heroGlass, border: `1px solid ${heroGlassBd}`, borderRadius: '8px', overflow: 'hidden' }}>
              <button type="button" onClick={() => setLanguage('th')}
                style={{ padding: '6px 14px', fontSize: '12px', fontWeight: '700', color: language === 'th' ? '#fff' : heroFaint, backgroundColor: language === 'th' ? ac : 'transparent', transition: 'all 0.15s', border: 'none', cursor: 'pointer' }}>
                TH
              </button>
              <button type="button" onClick={() => setLanguage('en')}
                style={{ padding: '6px 14px', fontSize: '12px', fontWeight: '700', color: language === 'en' ? '#fff' : heroFaint, backgroundColor: language === 'en' ? ac : 'transparent', transition: 'all 0.15s', border: 'none', cursor: 'pointer' }}>
                EN
              </button>
            </div>
          </div>

          {/* Back button (simulation mode) */}
          {isSimulation && (
            <button onClick={onBack}
              style={{ position: 'absolute', top: 16, left: 16, padding: '8px', background: heroGlass, border: `1px solid ${heroGlassBd}`, borderRadius: '8px', color: heroMuted, cursor: 'pointer', transition: 'all 0.15s', zIndex: 20 }}
              title="ออกจากการจำลอง">
              <ArrowLeft size={18} />
            </button>
          )}

          {/* Logo — centered */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
            <ClinicLogo className="h-20 sm:h-24" forceLight={false} clinicSettings={cs} center={true} theme={theme} />
          </div>

          {/* Form title */}
          <h1 style={{ fontSize: '22px', fontWeight: 900, color: heroText, letterSpacing: '0.01em', lineHeight: 1.3, margin: '0 0 4px', textShadow: isLightHero ? 'none' : '0 2px 20px rgba(0,0,0,0.5)' }}>
            {getHeaderTitle()}
          </h1>
          {isCustom && customTemplate?.description && (
            <p style={{ color: isLightHero ? '#3b82f6' : 'rgba(147,197,253,0.9)', fontSize: '13px', marginTop: '8px', maxWidth: '80%', margin: '8px auto 0' }}>{customTemplate.description}</p>
          )}

          {/* Session pill */}
          {!isCustom && (
            <div className="pf-session-pill">
              <span className="pf-session-dot" />
              <span className="pf-session-id">{sessionId}</span>
            </div>
          )}
        </div>

        {/* ── Form body ── */}
        <form onSubmit={handleSubmit} className="pf-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <section className={`pf-section ${isCustom ? 'blue' : 'accent'}`}>
            <div className={sectionHeaderClass}>
              <User size={16} style={{color: isCustom ? '#3b82f6' : ac, flexShrink: 0}}/>
              {language === 'en' ? 'Patient Information' : 'ข้อมูลผู้ป่วย'}
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:'16px'}}>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="w-full sm:w-1/3">
                  <label className={labelClass}>{language === 'en' ? 'Title' : 'คำนำหน้า'} <span className="text-red-600">*</span></label>
                  <select name="prefix" value={formData.prefix || ''} onChange={handleInputChange} required className={inputClass}>
                    <option value="นาย">{language === 'en' ? 'Mr.' : 'นาย'}</option>
                    <option value="นาง">{language === 'en' ? 'Mrs.' : 'นาง'}</option>
                    <option value="นางสาว">{language === 'en' ? 'Ms.' : 'นางสาว'}</option>
                    <option value="ด.ช.">{language === 'en' ? 'Master (ด.ช.)' : 'ด.ช. (เด็กชาย)'}</option>
                    <option value="ด.ญ.">{language === 'en' ? 'Miss (ด.ญ.)' : 'ด.ญ. (เด็กหญิง)'}</option>
                    <option value="ไม่ระบุ">{language === 'en' ? 'Prefer not to say' : 'ไม่ระบุ'}</option>
                  </select>
                </div>
                <div className="w-full sm:w-2/3">
                  <label className={labelClass}>{language === 'en' ? 'First Name' : 'ชื่อจริง'} <span className="text-red-600">*</span></label>
                  <input type="text" name="firstName" value={formData.firstName || ''} onChange={handleInputChange} required placeholder={language === 'en' ? 'First Name (English only)' : 'ชื่อจริง (ภาษาไทยเท่านั้น)'} className={inputClass}/>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4">
                {(!isFollowUp && !isCustom) && (
                  <div className="w-full sm:w-1/2">
                    <label className={labelClass}>{language === 'en' ? 'Last Name' : 'นามสกุล'} <span className="text-red-600">*</span></label>
                    <input type="text" name="lastName" value={formData.lastName || ''} onChange={handleInputChange} required placeholder={language === 'en' ? 'Last Name (English only)' : 'นามสกุล (ภาษาไทยเท่านั้น)'} className={inputClass}/>
                  </div>
                )}
                
                {(isFollowUp || isCustom) && (
                  <div className="w-full sm:w-1/2">
                    <label className={labelClass}>{language === 'en' ? 'Age' : 'อายุ'} <span className="text-red-600">*</span></label>
                    <input type="number" name="age" value={formData.age || ''} onChange={handleInputChange} required placeholder={language === 'en' ? 'Years' : 'ปี'} className={`${inputClass} bg-blue-950/20 border-blue-900/50 text-blue-400 font-bold text-center text-xl`} />
                  </div>
                )}
                
                {(isFollowUp || isCustom) && (
                   <div className="w-full sm:w-1/2">
                    <label className={labelClass}>{language === 'en' ? 'Date' : 'วันที่บันทึก'} <span className="text-red-600">*</span></label>
                    <input type="date" name="assessmentDate" value={formData.assessmentDate || ''} onChange={handleInputChange} required className={inputClass}/>
                   </div>
                )}

                {(!isFollowUp && !isCustom) && (
                  <div className="w-full sm:w-1/2">
                    <label className={labelClass}>{language === 'en' ? 'Gender' : 'เพศ'} <span className="text-red-600">*</span></label>
                    <select name="gender" value={formData.gender || ''} onChange={handleInputChange} required className={inputClass}>
                      <option value="" disabled>-- {language === 'en' ? 'Select' : 'เลือก'} --</option>
                      <option value="ชาย">{language === 'en' ? 'Male' : 'ชาย'}</option>
                      <option value="หญิง">{language === 'en' ? 'Female' : 'หญิง'}</option>
                      <option value="LGBTQ+">LGBTQ+</option>
                    </select>
                  </div>
                )}
              </div>

              {(!isFollowUp && !isCustom) && (
                <>
                  <div className="flex flex-col gap-4">
                    <div className="w-full">
                      <label className={labelClass}>{language === 'en' ? 'Date of Birth (CE)' : 'วันเกิด (พ.ศ.)'} <span className="text-red-600">*</span></label>
                      <div className="flex flex-wrap sm:flex-nowrap gap-3">
                        <select name="dobDay" value={formData.dobDay || ''} onChange={handleDobChange} required className={`${inputClass} flex-1 sm:w-1/3 min-w-[80px] text-center px-2`}>
                          <option value="" disabled>{language === 'en' ? 'Day' : 'วัน'}</option>
                          {[...Array(31)].map((_, i) => <option key={i+1} value={(i+1).toString().padStart(2, '0')}>{i+1}</option>)}
                        </select>
                        <select name="dobMonth" value={formData.dobMonth || ''} onChange={handleDobChange} required className={`${inputClass} flex-1 sm:w-1/3 min-w-[120px] text-center px-2`}>
                          <option value="" disabled>{language === 'en' ? 'Month' : 'เดือน'}</option>
                          {(language === 'en' ? EN_MONTHS : THAI_MONTHS).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                        <select name="dobYear" value={formData.dobYear || ''} onChange={handleDobChange} required className={`${inputClass} flex-1 sm:w-1/3 min-w-[90px] text-center px-2`}>
                          <option value="" disabled>{language === 'en' ? 'Year' : 'ปี พ.ศ.'}</option>
                          {(language === 'en' ? YEARS_CE : YEARS_BE).map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="w-full">
                      <label className={labelClass}>{language === 'en' ? 'Age' : 'อายุ'} <span className="text-red-600">*</span></label>
                      <input type="number" name="age" value={formData.age || ''} onChange={handleInputChange} required placeholder={language === 'en' ? 'Years' : 'ระบุเป็นตัวเลข'} className={`${inputClass} bg-red-950/20 border-red-900/50 text-red-500 font-bold text-center text-xl`} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>{language === 'en' ? 'Address' : 'ที่อยู่'}</label>
                    <textarea name="address" value={formData.address || ''} onChange={handleInputChange} rows="2" placeholder={language === 'en' ? 'House No, Street, Soi, Road' : 'บ้านเลขที่, ซอย, ถนน'} className={inputClass + " resize-none transition-shadow"}></textarea>
                  </div>
                  <div>
                    <label className={labelClass}>{language === 'en' ? 'Province' : 'จังหวัด'} <span className="text-red-600">*</span></label>
                    <select name="province" value={formData.province || ''} onChange={handleInputChange} required className={inputClass}>
                      <option value="" disabled>{language === 'en' ? '-- Select Province --' : '-- เลือกจังหวัด --'}</option>
                      {Object.keys(thaiAddressDB).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>{language === 'en' ? 'District' : 'อำเภอ/เขต'} <span className="text-red-600">*</span></label>
                    <select name="district" value={formData.district || ''} onChange={handleInputChange} required className={inputClass} disabled={!formData.province}>
                      <option value="" disabled>{language === 'en' ? '-- Select District --' : '-- เลือกอำเภอ/เขต --'}</option>
                      {formData.province && thaiAddressDB[formData.province] && Object.keys(thaiAddressDB[formData.province]).map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>{language === 'en' ? 'Sub-district' : 'ตำบล/แขวง'} <span className="text-red-600">*</span></label>
                    <select name="subDistrict" value={formData.subDistrict || ''} onChange={handleInputChange} required className={inputClass} disabled={!formData.district}>
                      <option value="" disabled>{language === 'en' ? '-- Select Sub-district --' : '-- เลือกตำบล/แขวง --'}</option>
                      {formData.province && formData.district && thaiAddressDB[formData.province]?.[formData.district] && Object.keys(thaiAddressDB[formData.province][formData.district]).map(sd => <option key={sd} value={sd}>{sd}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>{language === 'en' ? 'Postal Code' : 'รหัสไปรษณีย์'}</label>
                    <input type="text" name="postalCode" value={formData.postalCode || ''} readOnly className={inputClass + " bg-opacity-50"} placeholder={language === 'en' ? 'Auto-filled' : 'อัตโนมัติจากตำบล'} />
                  </div>
                  <div>
                    <label className={labelClass}>{language === 'en' ? 'Nationality' : 'สัญชาติ'}</label>
                    <div className="flex gap-3 mb-2">
                      <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--tx-normal)' }}>
                        <input type="radio" name="nationality" value="ไทย" checked={formData.nationality !== 'ต่างชาติ'} onChange={handleInputChange} className="w-4 h-4 text-red-600 bg-black border-[#444]" />
                        {language === 'en' ? 'Thai' : 'ไทย'}
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--tx-normal)' }}>
                        <input type="radio" name="nationality" value="ต่างชาติ" checked={formData.nationality === 'ต่างชาติ'} onChange={handleInputChange} className="w-4 h-4 text-red-600 bg-black border-[#444]" />
                        {language === 'en' ? 'Foreigner' : 'ต่างชาติ'}
                      </label>
                    </div>
                    {formData.nationality === 'ต่างชาติ' && (
                      <div className="relative" ref={countryDropdownRef}>
                        <input type="hidden" name="nationalityCountry" value={formData.nationalityCountry || ''} required />
                        <button type="button" onClick={() => { setCountryDropdownOpen(!countryDropdownOpen); setCountryFilter(''); }}
                          className={`${inputClass} w-full text-left flex items-center justify-between`}>
                          <span className={formData.nationalityCountry ? '' : 'opacity-50'}>
                            {formData.nationalityCountry || (language === 'en' ? '-- Select Country --' : '-- เลือกประเทศ --')}
                          </span>
                          <span className="ml-2 text-xs">▼</span>
                        </button>
                        {countryDropdownOpen && (
                          <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60" onClick={() => setCountryDropdownOpen(false)}>
                            <div className="w-full sm:w-[90%] sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-[#333] shadow-2xl flex flex-col" style={{ background: 'var(--bg-card, #1a1a1a)', maxHeight: '70vh' }} onClick={e => e.stopPropagation()}>
                              <div className="p-3 border-b border-[#333] flex items-center gap-2">
                                <input type="text" autoFocus value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
                                  placeholder={language === 'en' ? 'Search country...' : 'ค้นหาประเทศ...'}
                                  className="w-full px-3 py-2.5 rounded-lg border border-[#444] text-sm outline-none" style={{ background: 'var(--bg-input, #111)', color: 'var(--tx-normal, #fff)' }} />
                                <button type="button" onClick={() => setCountryDropdownOpen(false)} className="text-gray-400 hover:text-white text-xl px-2">✕</button>
                              </div>
                              <div className="overflow-y-auto flex-1 overscroll-contain">
                                {NATIONALITY_COUNTRIES.filter(c => !countryFilter || c.toLowerCase().includes(countryFilter.toLowerCase())).map(c => (
                                  <button key={c} type="button"
                                    onClick={() => { setFormData(prev => ({ ...prev, nationalityCountry: c })); setCountryDropdownOpen(false); }}
                                    className={`w-full text-left px-4 py-3 text-sm border-b border-[#222] hover:bg-red-900/30 transition-colors ${formData.nationalityCountry === c ? 'bg-red-900/40 font-semibold' : ''}`}
                                    style={{ color: 'var(--tx-normal, #fff)' }}>
                                    {c}
                                  </button>
                                ))}
                                {NATIONALITY_COUNTRIES.filter(c => !countryFilter || c.toLowerCase().includes(countryFilter.toLowerCase())).length === 0 && (
                                  <div className="px-3 py-6 text-center text-sm opacity-50" style={{ color: 'var(--tx-normal, #fff)' }}>
                                    {language === 'en' ? 'No results' : 'ไม่พบผลลัพธ์'}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className={labelClass}>{language === 'en' ? 'Phone Number' : 'เบอร์โทรศัพท์'} <span className="text-red-600">*</span></label>
                      <label className="flex items-center gap-2 cursor-pointer text-xs sm:text-sm text-gray-400 hover:text-white transition-colors">
                        <input type="checkbox" name="isInternationalPhone" checked={!!formData.isInternationalPhone} onChange={handleInputChange} className="w-4 h-4 rounded text-blue-600 bg-black border-[#444] focus:ring-blue-500" />
                        {language === 'en' ? 'Intl. Number' : 'เบอร์ชาวต่างชาติ'}
                      </label>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                      {formData.isInternationalPhone && (
                        <select name="phoneCountryCode" value={formData.phoneCountryCode || '+66'} onChange={handleInputChange} className={`${inputClass} w-full sm:w-1/3 px-3 py-3 sm:py-4 text-sm sm:text-base`}>
                          {COUNTRY_CODES.map(c => <option key={`p-${c.code}-${c.label}`} value={c.code}>{c.label} ({c.code})</option>)}
                        </select>
                      )}
                      <input type="tel" name="phone" value={formData.phone || ''} onChange={handleInputChange} required placeholder={formData.isInternationalPhone ? "Phone Number" : "08X-XXX-XXXX"} maxLength={formData.isInternationalPhone ? "15" : "10"} className={`${inputClass} w-full sm:flex-1`}/>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          {(!isFollowUp && !isCustom) && (
            <section className="pf-section orange">
              <div className={sectionHeaderClass} style={{color: '#f97316'}}>
                <AlertCircle size={16} style={{color:'#f97316', flexShrink:0}}/>
                {language === 'en' ? 'Emergency Contact' : 'บุคคลติดต่อฉุกเฉิน'}
              </div>
              <div style={{display:'flex', flexDirection:'column', gap:'14px'}}>
                <div>
                  <label className="block text-sm font-bold text-orange-500 tracking-wide mb-2">{language === 'en' ? 'Contact Name' : 'ชื่อผู้ติดต่อ'} <span className="text-red-600">*</span></label>
                  <input type="text" name="emergencyName" value={formData.emergencyName || ''} onChange={handleInputChange} required placeholder={language === 'en' ? 'Full Name' : 'ชื่อ-สกุล'} className={`${inputClass} bg-[#1a0f0f] border-orange-900/40 text-orange-100 focus:border-orange-600 placeholder-orange-900/50`}/>
                </div>
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="w-full sm:w-1/2">
                    <label className="block text-sm font-bold text-orange-500 tracking-wide mb-2">{language === 'en' ? 'Relationship' : 'ความสัมพันธ์'} <span className="text-red-600">*</span></label>
                    <input type="text" name="emergencyRelation" value={formData.emergencyRelation || ''} onChange={handleInputChange} required placeholder={language === 'en' ? 'e.g., Father, Spouse' : 'เช่น บิดา, คู่สมรส'} className={`${inputClass} bg-[#1a0f0f] border-orange-900/40 text-orange-100 focus:border-orange-600 placeholder-orange-900/50`}/>
                  </div>
                  <div className="w-full sm:w-1/2">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-bold text-orange-500 tracking-wide">{language === 'en' ? 'Phone Number' : 'เบอร์โทร'} <span className="text-red-600">*</span></label>
                      <label className="flex items-center gap-2 cursor-pointer text-xs sm:text-sm text-orange-600/50 hover:text-orange-400 transition-colors">
                        <input type="checkbox" name="isInternationalEmergencyPhone" checked={!!formData.isInternationalEmergencyPhone} onChange={handleInputChange} className="w-4 h-4 rounded text-orange-600 bg-black border-[#444] focus:ring-orange-500" />
                        {language === 'en' ? 'Intl.' : 'เบอร์ต่างชาติ'}
                      </label>
                    </div>
                    <div className="flex flex-col gap-2">
                      {formData.isInternationalEmergencyPhone && (
                        <select name="emergencyPhoneCountryCode" value={formData.emergencyPhoneCountryCode || '+66'} onChange={handleInputChange} className={`${inputClass} bg-[#1a0f0f] border-orange-900/40 text-orange-100 focus:border-orange-600 w-full px-3 py-3 sm:py-4 text-sm sm:text-base`}>
                          {COUNTRY_CODES.map(c => <option key={`e-${c.code}-${c.label}`} value={c.code}>{c.label} ({c.code})</option>)}
                        </select>
                      )}
                      <input type="tel" name="emergencyPhone" value={formData.emergencyPhone || ''} onChange={handleInputChange} required placeholder={formData.isInternationalEmergencyPhone ? "Phone Number" : "เบอร์ติดต่อ 10 หลัก"} maxLength={formData.isInternationalEmergencyPhone ? "15" : "10"} className={`${inputClass} bg-[#1a0f0f] border-orange-900/40 text-orange-100 focus:border-orange-600 placeholder-orange-900/50 w-full`}/>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* DYNAMIC CUSTOM FORM RENDERER */}
          {isCustom && customTemplate && (
            <div className="space-y-6 p-5 sm:p-8 rounded-2xl" style={{ background: isDark ? 'linear-gradient(135deg, rgba(10,17,40,0.6), rgba(10,10,10,0.95))' : 'linear-gradient(135deg, rgba(239,246,255,0.8), rgba(255,255,255,0.95))', border: `1px solid ${isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.12)'}` }}>
              <h3 className="text-lg sm:text-xl font-black text-blue-400 tracking-wide border-b border-blue-900/30 pb-4 mb-6">
                ตอบแบบสอบถาม (Questionnaire)
              </h3>
              {customTemplate.questions.map((q, idx) => (
                <div key={q.id} className="p-5 rounded-xl" style={{ background: isDark ? 'rgba(10,8,5,0.5)' : 'rgba(255,255,255,0.7)', border: `1px solid ${isDark ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.08)'}` }}>
                   <label className="block text-base sm:text-lg font-bold text-gray-200 mb-4 leading-relaxed">
                     <span className="text-blue-500 mr-2">{idx+1}.</span>{q.label}
                   </label>
                   
                   {q.type === 'text' && (
                     <input type="text" name={q.id} value={formData[q.id] || ''} onChange={handleInputChange} required={q.required} placeholder="คำตอบของคุณ..." className={inputClass} />
                   )}
                   
                   {q.type === 'textarea' && (
                     <textarea name={q.id} value={formData[q.id] || ''} onChange={handleInputChange} required={q.required} rows="4" placeholder="คำตอบของคุณ..." className={inputClass + " resize-none"} />
                   )}

                   {q.type === 'radio' && (
                     <div className="space-y-3">
                       {q.options.map(opt => (
                         <label key={opt} className="flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-colors" style={{ background: formData[q.id] === opt ? (isDark ? 'rgba(37,99,235,0.08)' : 'rgba(59,130,246,0.04)') : (isDark ? 'rgba(10,8,5,0.5)' : 'rgba(255,255,255,0.5)'), borderColor: formData[q.id] === opt ? (isDark ? '#2563eb' : '#3b82f6') : (isDark ? 'rgba(74,26,10,0.2)' : 'rgba(0,0,0,0.06)') }}>
                           <input type="radio" name={q.id} value={opt} checked={formData[q.id] === opt} onChange={handleInputChange} required={q.required} className="mt-0.5 w-5 h-5 text-blue-600 bg-black border-[#444] focus:ring-blue-600 shrink-0"/>
                           <span className={`text-base font-medium break-words leading-tight ${formData[q.id] === opt ? 'text-blue-400 font-bold' : 'text-gray-300'}`}>{opt}</span>
                         </label>
                       ))}
                     </div>
                   )}

                   {q.type === 'checkbox' && (
                     <div className="space-y-3">
                       {q.options.map(opt => {
                         const isSelected = Array.isArray(formData[q.id]) && formData[q.id].includes(opt);
                         return (
                           <label key={opt} className="flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-colors" style={{ background: isSelected ? (isDark ? 'rgba(37,99,235,0.08)' : 'rgba(59,130,246,0.04)') : (isDark ? 'rgba(10,8,5,0.5)' : 'rgba(255,255,255,0.5)'), borderColor: isSelected ? (isDark ? '#2563eb' : '#3b82f6') : (isDark ? 'rgba(74,26,10,0.2)' : 'rgba(0,0,0,0.06)') }}>
                             <input type="checkbox" checked={isSelected} onChange={() => handleCustomCheckboxChange(q.id, opt)} className="mt-0.5 w-5 h-5 text-blue-600 bg-black border-[#444] rounded focus:ring-blue-600 shrink-0"/>
                             <span className={`text-base font-medium break-words leading-tight ${isSelected ? 'text-blue-400 font-bold' : 'text-gray-300'}`}>{opt}</span>
                           </label>
                         );
                       })}
                     </div>
                   )}
                </div>
              ))}
            </div>
          )}

          {/* STANDARD INTAKE FORMS RENDERER (HIDES IF CUSTOM) */}
          {isIntake && !isCustom && (
            <>
              <section className="pf-section accent">
                <div className={sectionHeaderClass}>
                  <Activity size={16} style={{color: ac, flexShrink:0}}/>
                  {language === 'en' ? 'Chief Complaint / Visit Reason' : 'สาเหตุที่มาพบแพทย์'}
                  <span style={{color: '#ef4444', marginLeft: 2}}>*</span>
                </div>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px'}}>
                  {visitReasonOptions.map(reason => {
                    const isSelected = selectedReasons.includes(reason.value);
                    return (
                      <label key={reason.value} className={`pf-reason-card${isSelected ? ' selected' : ''}`} style={{}}>
                        <input type="checkbox" checked={isSelected} onChange={() => handleReasonToggle(reason.value)} style={{display:'none'}} />
                        <div className="pf-reason-check" style={{}}>
                          {isSelected && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                        <span className="pf-reason-text">{language === 'en' ? reason.en : reason.th}</span>
                      </label>
                    );
                  })}
                </div>
                {selectedReasons.includes('อื่นๆ') && (
                  <input type="text" name="visitReasonOther" value={formData.visitReasonOther || ''} onChange={handleInputChange} required placeholder={language === 'en' ? "Please specify..." : "โปรดระบุรายละเอียดเพิ่มเติม..."} className={inputClass + " animate-in fade-in mt-4"}/>
                )}

                {isHrtMode && (
                  <div className="pf-section orange animate-fade-up" style={{marginTop:'12px'}}>
                    <div className={sectionHeaderClass} style={{color:'#f97316', marginBottom:'14px'}}>
                      <span style={{width:3,height:12,background:'#f97316',borderRadius:2,flexShrink:0}}/>
                      {language === 'en' ? 'HRT Goals' : 'เป้าหมายการเสริมฮอร์โมน'}
                      <span style={{color:'#ef4444',marginLeft:2}}>*</span>
                    </div>
                    <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
                      {hrtGoalOptions.map(goal => {
                        const isGoalSelected = selectedGoals.includes(goal.value);
                        return (
                          <div key={goal.value} className="group">
                            <label className={`pf-reason-card${isGoalSelected ? ' selected' : ''}`} style={{}}>
                              <input type="checkbox" checked={isGoalSelected} onChange={() => handleGoalToggle(goal.value)} style={{display:'none'}} />
                              <div className="pf-reason-check" style={isGoalSelected ? {background:'#f97316',borderColor:'#f97316'} : {}}>
                                {isGoalSelected && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                              </div>
                              <span className="pf-reason-text">{language === 'en' ? goal.en : goal.th}</span>
                            </label>
                            
                            {goal.value === 'ฮอร์โมนเพื่อการข้ามเพศ' && isGoalSelected && (
                               <div className="mt-3 ml-4 pl-4 sm:ml-5 sm:pl-5 border-l-2 border-[#333] space-y-3 animate-in fade-in">
                                 <label className="flex items-center gap-3 cursor-pointer p-2">
                                   <input type="radio" name="hrtTransType" value="ทรานส์เมน / เสริมฮอร์โมนเพศชาย" required checked={formData.hrtTransType === 'ทรานส์เมน / เสริมฮอร์โมนเพศชาย'} onChange={handleInputChange} className="w-5 h-5 text-blue-500 bg-black border-[#444] shrink-0" />
                                   <span className="text-sm sm:text-base font-bold text-gray-300 break-words leading-tight">{language === 'en' ? 'Trans Man / Masculinizing HRT' : 'ทรานส์เมน / เสริมฮอร์โมนเพศชาย'}</span>
                                 </label>
                                 <label className="flex items-center gap-3 cursor-pointer p-2">
                                   <input type="radio" name="hrtTransType" value="ทรานส์วูแมน / เสริมฮอร์โมนเพศหญิง" required checked={formData.hrtTransType === 'ทรานส์วูแมน / เสริมฮอร์โมนเพศหญิง'} onChange={handleInputChange} className="w-5 h-5 text-pink-500 bg-black border-[#444] shrink-0" />
                                   <span className="text-sm sm:text-base font-bold text-gray-300 break-words leading-tight">{language === 'en' ? 'Trans Woman / Feminizing HRT' : 'ทรานส์วูแมน / เสริมฮอร์โมนเพศหญิง'}</span>
                                 </label>
                               </div>
                            )}

                            {goal.value === 'อื่นๆ' && isGoalSelected && (
                               <div className="mt-3 ml-10 animate-in fade-in">
                                  <input type="text" name="hrtOtherDetail" value={formData.hrtOtherDetail || ''} onChange={handleInputChange} required placeholder={language === 'en' ? "Please specify..." : "โปรดระบุเป้าหมาย..."} className={inputClass + " border-orange-900/50 focus:border-orange-500 focus:ring-orange-500"} />
                               </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>

              <section className="pf-section red">
                <div className={sectionHeaderClass}>
                  <HeartPulse size={16} style={{color:'#ef4444', flexShrink:0}}/>
                  {language === 'en' ? 'Medical History' : 'ประวัติทางการแพทย์'}
                </div>
                <div style={{display:'flex', flexDirection:'column', gap:'20px'}}>
                  <div>
                    <label className={labelClass}>{language === 'en' ? 'Drug / Food Allergies' : 'ประวัติการแพ้ยา และ อาหาร'} <span style={{color:'#ef4444'}}>*</span></label>
                    <div style={{display:'flex', gap:'10px', marginBottom:'10px'}}>
                      <label className={`pf-radio-card${formData.hasAllergies === 'ไม่มี' ? ' selected-no' : ''}`}>
                        <input type="radio" name="hasAllergies" value="ไม่มี" checked={formData.hasAllergies === 'ไม่มี'} onChange={handleInputChange} style={{display:'none'}} required/>
                        <span>{language === 'en' ? '✓ None (NKDA)' : '✓ ไม่มีประวัติแพ้'}</span>
                      </label>
                      <label className={`pf-radio-card${formData.hasAllergies === 'มี' ? ' selected-yes' : ''}`}>
                        <input type="radio" name="hasAllergies" value="มี" checked={formData.hasAllergies === 'มี'} onChange={handleInputChange} style={{display:'none'}}/>
                        <span>{language === 'en' ? '⚠ Yes, I have' : '⚠ มีประวัติแพ้'}</span>
                      </label>
                    </div>
                    {formData.hasAllergies === 'มี' && (
                      <input type="text" name="allergiesDetail" value={formData.allergiesDetail || ''} onChange={handleInputChange} required placeholder={language === 'en' ? "Please specify what you are allergic to" : "โปรดระบุสิ่งที่ท่านแพ้ (ยา, อาหาร, ฯลฯ)"} className={inputClass + " animate-fade-in"} style={{borderColor:'#fca5a5'}}/>
                    )}
                  </div>

                  <div>
                    <label className={labelClass}>{language === 'en' ? 'Underlying Diseases' : 'โรคประจำตัว'} <span style={{color:'#ef4444'}}>*</span></label>
                    <div style={{display:'flex', gap:'10px', marginBottom:'10px'}}>
                      <label className={`pf-radio-card${formData.hasUnderlying === 'ไม่มี' ? ' selected-no' : ''}`}>
                        <input type="radio" name="hasUnderlying" value="ไม่มี" checked={formData.hasUnderlying === 'ไม่มี'} onChange={handleInputChange} style={{display:'none'}} required/>
                        <span>{language === 'en' ? '✓ None' : '✓ ไม่มีโรคประจำตัว'}</span>
                      </label>
                      <label className={`pf-radio-card${formData.hasUnderlying === 'มี' ? ' selected-yes' : ''}`}>
                        <input type="radio" name="hasUnderlying" value="มี" checked={formData.hasUnderlying === 'มี'} onChange={handleInputChange} style={{display:'none'}}/>
                        <span>{language === 'en' ? '⚠ Yes, I have' : '⚠ มีโรคประจำตัว'}</span>
                      </label>
                    </div>
                    
                    {formData.hasUnderlying === 'มี' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl animate-in fade-in" style={{ background: isDark ? 'rgba(10,8,5,0.5)' : 'rgba(255,247,237,0.5)', border: `1px solid ${isDark ? 'rgba(249,115,22,0.15)' : 'rgba(249,115,22,0.12)'}` }}>
                        {[
                          { n: 'ud_hypertension', th: 'ความดันโลหิตสูง', en: 'Hypertension' },
                          { n: 'ud_diabetes', th: 'เบาหวาน', en: 'Diabetes' },
                          { n: 'ud_lung', th: 'โรคปอด', en: 'Lung Disease' },
                          { n: 'ud_kidney', th: 'โรคไต', en: 'Kidney Disease' },
                          { n: 'ud_heart', th: 'โรคหัวใจ', en: 'Heart Disease' },
                          { n: 'ud_blood', th: 'โรคโลหิต', en: 'Blood Disease' }
                        ].map(ud => (
                          <label key={ud.n} className="flex items-center gap-3 cursor-pointer group">
                            <input type="checkbox" name={ud.n} checked={!!formData[ud.n]} onChange={handleInputChange} className="w-5 h-5 rounded text-orange-500 bg-[#111] border-[#333] focus:ring-orange-500 shrink-0"/>
                            <span className="text-gray-300 font-bold text-sm group-hover:text-white transition-colors">{language === 'en' ? ud.en : ud.th}</span>
                          </label>
                        ))}
                        <label className="flex items-center gap-3 cursor-pointer group col-span-1 sm:col-span-2 mt-2">
                          <input type="checkbox" name="ud_other" checked={!!formData.ud_other} onChange={handleInputChange} className="w-5 h-5 rounded text-orange-500 bg-[#111] border-[#333] focus:ring-orange-500 shrink-0"/>
                          <span className="text-gray-300 font-bold text-sm group-hover:text-white transition-colors">{language === 'en' ? 'Other' : 'โรคอื่นๆ'}</span>
                        </label>
                        {formData.ud_other && (
                          <input type="text" name="ud_otherDetail" value={formData.ud_otherDetail || ''} onChange={handleInputChange} required placeholder={language === 'en' ? "Please specify" : "โปรดระบุชื่อโรค..."} className={`${inputClass} col-span-1 sm:col-span-2 mt-2 border-orange-900/50 py-3`}/>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-bold text-gray-300 tracking-wide mb-2 flex items-center gap-2"><Pill size={16}/> {language === 'en' ? 'Current Medications' : 'ยาที่ใช้ประจำในปัจจุบัน'}</label>
                    <textarea name="currentMedication" value={formData.currentMedication || ''} onChange={handleInputChange} rows="3" placeholder={language === 'en' ? "Please list all current medications, or leave blank if none" : "ระบุชื่อยาที่กำลังรับประทาน หรือ เว้นว่างไว้หากไม่มี"} className={inputClass + " resize-none"}></textarea>
                  </div>
                </div>
              </section>
            </>
          )}

          {(!isCustom && (isPerfMode || showAdam || showMrs)) && (
            <div className="animate-in fade-in slide-in-from-top-4 duration-500 space-y-8 sm:space-y-10 p-4 sm:p-8 rounded-2xl w-full" style={{ background: isDark ? 'linear-gradient(135deg, rgba(26,0,0,0.5), rgba(10,10,10,0.95), rgba(42,0,0,0.3))' : 'linear-gradient(135deg, rgba(254,242,242,0.6), rgba(255,255,255,0.95), rgba(253,242,248,0.5))', border: `1px solid ${isDark ? 'rgba(220,38,38,0.15)' : 'rgba(239,68,68,0.1)'}`, boxShadow: isDark ? '0 4px 30px rgba(0,0,0,0.3), inset 0 1px 0 rgba(220,38,38,0.05)' : '0 4px 20px rgba(239,68,68,0.04)' }}>
              
              {!isFollowUp && (
                <div className="rounded-2xl p-5 sm:p-6 flex gap-4 items-start" style={{ background: isDark ? 'rgba(220,38,38,0.06)' : 'rgba(239,68,68,0.04)', border: `1px solid ${isDark ? 'rgba(220,38,38,0.2)' : 'rgba(239,68,68,0.12)'}` }}>
                  <AlertCircle className="text-red-500 shrink-0 mt-1" size={28} />
                  <div>
                    <h4 className="text-red-500 font-black text-sm sm:text-base tracking-wide mb-2">{language === 'en' ? 'Patient Notice' : 'คำแนะนำสำหรับผู้ป่วย'}</h4>
                    <p className="text-gray-300 text-sm sm:text-base leading-relaxed font-medium">
                      {language === 'en' ? 'The following questionnaires are clinical screening tools to assist the physician.' : 'แบบทดสอบต่อไปนี้เป็น "เครื่องมือคัดกรองทางคลินิก" เพื่อช่วยแพทย์ในการประเมินเบื้องต้น'} <br className="hidden sm:block"/>
                      <span className="text-red-400 font-bold">{language === 'en' ? 'Results are not a definitive diagnosis.' : 'ผลคะแนนไม่ใช่การวินิจฉัยขั้นสุดท้าย'}</span> {language === 'en' ? 'The physician will make the final evaluation.' : 'แพทย์จะเป็นผู้พิจารณาและวินิจฉัยอีกครั้ง'}
                    </p>
                  </div>
                </div>
              )}

              {isPerfMode && isIntake && (
                <section className="p-5 sm:p-6 rounded-2xl mb-6" style={{ background: isDark ? 'rgba(10,8,5,0.6)' : 'rgba(255,255,255,0.8)', border: `1px solid ${isDark ? 'rgba(74,26,10,0.25)' : 'rgba(239,68,68,0.1)'}` }}>
                  <div className="mb-4 border-b border-[#222] pb-4">
                    <h3 className="text-base sm:text-lg font-black text-gray-200 tracking-wide flex items-center gap-3"><span className="w-2 h-2 bg-red-600 rounded-full shrink-0"></span> {language === 'en' ? 'Part 1: Primary Symptoms' : 'ส่วนที่ 1: การประเมินอาการเบื้องต้น'}</h3>
                  </div>
                  <label className="flex items-center gap-4 p-4 sm:p-5 rounded-xl border cursor-pointer transition-colors" style={{ background: formData.symp_pe ? (isDark ? 'rgba(220,38,38,0.06)' : 'rgba(239,68,68,0.04)') : (isDark ? 'rgba(10,8,5,0.5)' : 'rgba(255,255,255,0.6)'), borderColor: formData.symp_pe ? (isDark ? 'rgba(220,38,38,0.25)' : 'rgba(239,68,68,0.15)') : (isDark ? 'rgba(74,26,10,0.2)' : 'rgba(0,0,0,0.06)') }}>
                    <input type="checkbox" name="symp_pe" checked={!!formData.symp_pe} onChange={handleInputChange} className="w-6 h-6 rounded text-red-600 bg-black border-[#444] focus:ring-red-600 focus:ring-offset-black shrink-0"/>
                    <span className="text-base sm:text-lg font-bold tracking-wide break-words leading-snug" style={{ color: formData.symp_pe ? (isDark ? '#f87171' : '#dc2626') : (isDark ? '#d1d5db' : '#374151') }}>{language === 'en' ? 'Experiencing Premature Ejaculation (PE)' : 'ข้าพเจ้ามีอาการหลั่งเร็ว / หลั่งไวร่วมด้วย'}</span>
                  </label>
                </section>
              )}

              {showAdam && (
                <section className="p-5 sm:p-6 rounded-2xl" style={{ background: isDark ? 'rgba(10,8,5,0.6)' : 'rgba(255,255,255,0.8)', border: `1px solid ${isDark ? 'rgba(74,26,10,0.25)' : 'rgba(239,68,68,0.1)'}` }}>
                  <div className="mb-5 border-b border-[#222] pb-4">
                    <h3 className="text-base sm:text-lg font-black text-gray-200 tracking-wide flex items-start gap-3 leading-snug">
                      <span className="w-2 h-2 bg-red-600 rounded-full shrink-0 mt-2"></span> 
                      <span>{isFollowUp ? (language === 'en' ? 'Follow-Up Assessment' : 'แบบประเมินติดตามอาการ') : (language === 'en' ? `Part ${isPerfMode ? '2' : '1'}` : `ส่วนที่ ${isPerfMode ? '2' : '1'}`)}: {language === 'en' ? 'Androgen Deficiency in Aging Males (ADAM)' : 'พร่องฮอร์โมนเพศชาย (ADAM)'}</span>
                    </h3>
                    <p className="text-sm sm:text-base text-gray-400 mt-2 ml-5 font-medium">{language === 'en' ? 'Select all symptoms that you are experiencing' : 'กรุณาเลือกในทุกหัวข้อที่ท่านกำลังมีอาการ'}</p>
                  </div>
                  <div className="space-y-3">
                    {[
                      { n: 'adam_1', th: 'ความต้องการทางเพศลดลง', en: 'Decreased libido (sex drive)' },
                      { n: 'adam_2', th: 'รู้สึกขาดพลังงาน', en: 'Lack of energy' },
                      { n: 'adam_3', th: 'ความแข็งแรงหรือความทนทานลดลง', en: 'Decrease in strength or endurance' },
                      { n: 'adam_4', th: 'ส่วนสูงลดลง', en: 'Lost height' },
                      { n: 'adam_5', th: 'ซึมเศร้า ความสุขในชีวิตลดลง', en: 'Decreased enjoyment of life / feeling sad' },
                      { n: 'adam_6', th: 'อารมณ์แปรปรวน หงุดหงิดง่าย', en: 'Mood swings / easily annoyed' },
                      { n: 'adam_7', th: 'การแข็งตัวของอวัยวะเพศลดลง', en: 'Erections are less strong' },
                      { n: 'adam_8', th: 'ความสามารถในการเล่นกีฬาหรือออกกำลังกายลดลง', en: 'Deterioration in ability to play sports' },
                      { n: 'adam_9', th: 'ง่วงนอนหลังทานอาหารเย็น', en: 'Falling asleep after dinner' },
                      { n: 'adam_10', th: 'ประสิทธิภาพการทำงานลดลง', en: 'Decreased work performance' }
                    ].map((item, idx) => (
                      <label key={item.n} className={`flex items-start gap-4 p-4 sm:p-5 rounded-xl border cursor-pointer transition-colors`} style={{ background: formData[item.n] ? (isDark ? 'rgba(220,38,38,0.06)' : 'rgba(239,68,68,0.04)') : (isDark ? 'rgba(10,8,5,0.5)' : 'rgba(255,255,255,0.6)'), borderColor: formData[item.n] ? (isDark ? 'rgba(220,38,38,0.25)' : 'rgba(239,68,68,0.15)') : (isDark ? 'rgba(74,26,10,0.2)' : 'rgba(0,0,0,0.06)') }}>
                        <input type="checkbox" name={item.n} checked={!!formData[item.n]} onChange={handleInputChange} className="mt-0.5 w-6 h-6 rounded text-red-600 bg-black border-[#444] focus:ring-red-600 focus:ring-offset-black shrink-0"/>
                        <span className={`text-base sm:text-lg font-bold tracking-wide break-words leading-relaxed`} style={{ color: formData[item.n] ? (isDark ? '#f87171' : '#dc2626') : (isDark ? '#9ca3af' : '#6b7280') }}>{idx+1}. {language === 'en' ? item.en : item.th}</span>
                      </label>
                    ))}
                  </div>
                </section>
              )}

              {showMrs && (
                <section className="p-5 sm:p-8 rounded-2xl relative overflow-hidden" style={{ background: isDark ? 'linear-gradient(135deg, rgba(26,5,21,0.6), rgba(10,10,10,0.95))' : 'linear-gradient(135deg, rgba(253,242,248,0.8), rgba(255,255,255,0.95))', border: `1px solid ${isDark ? 'rgba(236,72,153,0.2)' : 'rgba(236,72,153,0.12)'}` }}>
                  <div className="absolute top-0 right-0 bg-pink-900 text-white px-4 py-2 rounded-bl-2xl font-black text-xs tracking-widest shadow-lg">MRS</div>
                  <div className="mb-6 border-b border-pink-900/30 pb-4 relative z-10 pr-8">
                    <h3 className="text-base sm:text-lg font-black text-white tracking-wide flex items-start gap-3 leading-snug">
                      <Activity size={20} className="text-pink-500 shrink-0 mt-0.5"/> 
                      <span>{isFollowUp ? (language === 'en' ? 'Follow-Up Assessment' : 'แบบประเมินติดตามอาการ') : (language === 'en' ? 'Part 1' : 'ส่วนที่ 1')}: {language === 'en' ? 'Menopause Rating Scale (MRS)' : 'อาการวัยทอง (MRS)'}</span>
                    </h3>
                    <p className="text-sm sm:text-base text-gray-300 mt-2 ml-8">{language === 'en' ? 'Please select the severity of the following symptoms' : 'กรุณาเลือกระดับความรุนแรงของอาการต่อไปนี้'}</p>
                  </div>
                  
                  <div className="space-y-4 relative z-10">
                    {[
                      { n: 'mrs_1', th: '1. อาการร้อนวูบวาบ เหงื่อออก', en: '1. Hot flushes, sweating' },
                      { n: 'mrs_2', th: '2. อาการทางหัวใจ (ใจสั่น หัวใจเต้นเร็ว)', en: '2. Heart discomfort (unusual beating, skipping, racing)' },
                      { n: 'mrs_3', th: '3. ปัญหาการนอนหลับ (นอนไม่หลับ ตื่นกลางดึก)', en: '3. Sleep problems (difficulty falling asleep/staying asleep)' },
                      { n: 'mrs_4', th: '4. อารมณ์ซึมเศร้า (เศร้าหมอง หดหู่)', en: '4. Depressive mood (feeling down, sad, lacking drive)' },
                      { n: 'mrs_5', th: '5. อารมณ์หงุดหงิดง่าย', en: '5. Irritability (feeling nervous, inner tension, aggressive)' },
                      { n: 'mrs_6', th: '6. วิตกกังวล กระวนกระวาย', en: '6. Anxiety (inner restlessness, feeling panicky)' },
                      { n: 'mrs_7', th: '7. อ่อนเพลียทั้งร่างกายและจิตใจ (ไม่มีแรง)', en: '7. Physical and mental exhaustion' },
                      { n: 'mrs_8', th: '8. ปัญหาทางเพศ (ความต้องการลดลง)', en: '8. Sexual problems (change in sexual desire/activity)' },
                      { n: 'mrs_9', th: '9. ปัญหาทางเดินปัสสาวะ (ปัสสาวะบ่อย/แสบขัด)', en: '9. Bladder problems (difficulty in urinating, increased need)' },
                      { n: 'mrs_10', th: '10. อาการช่องคลอดแห้ง', en: '10. Dryness of vagina' },
                      { n: 'mrs_11', th: '11. อาการปวดข้อและกล้ามเนื้อ', en: '11. Joint and muscular discomfort' }
                    ].map((item) => (
                      <div key={item.n} className="p-4 sm:p-5 rounded-xl" style={{ background: isDark ? 'rgba(10,8,5,0.5)' : 'rgba(255,255,255,0.6)', border: `1px solid ${isDark ? 'rgba(236,72,153,0.12)' : 'rgba(236,72,153,0.08)'}` }}>
                        <label className="block text-base sm:text-lg font-bold mb-3 sm:mb-4 leading-snug" style={{ color: isDark ? '#e5e7eb' : '#1f2937' }}>{language === 'en' ? item.en : item.th}</label>
                        <select name={item.n} value={formData[item.n] || ''} onChange={handleInputChange} required className={`${inputClass} text-pink-500 font-bold px-4 py-4 sm:py-4 focus:border-pink-600 focus:ring-pink-600 cursor-pointer`} style={{ borderColor: isDark ? 'rgba(236,72,153,0.2)' : 'rgba(236,72,153,0.15)' }}>
                          <option value="" disabled className="text-gray-600">-- {language === 'en' ? 'Select Severity' : 'เลือกระดับความรุนแรง'} --</option>
                          <option value="0" className="text-white">{language === 'en' ? 'None (0)' : 'ไม่มีอาการ (0)'}</option>
                          <option value="1" className="text-white">{language === 'en' ? 'Mild (1)' : 'เล็กน้อย (1)'}</option>
                          <option value="2" className="text-white">{language === 'en' ? 'Moderate (2)' : 'ปานกลาง (2)'}</option>
                          <option value="3" className="text-white">{language === 'en' ? 'Severe (3)' : 'รุนแรง (3)'}</option>
                          <option value="4" className="text-white">{language === 'en' ? 'Very Severe (4)' : 'รุนแรงมากที่สุด (4)'}</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {isPerfMode && (
                <section className="p-5 sm:p-8 rounded-2xl relative overflow-hidden" style={{ background: isDark ? 'linear-gradient(135deg, rgba(26,5,5,0.6), rgba(10,10,10,0.95))' : 'linear-gradient(135deg, rgba(254,242,242,0.8), rgba(255,255,255,0.95))', border: `1px solid ${isDark ? 'rgba(220,38,38,0.2)' : 'rgba(239,68,68,0.12)'}` }}>
                  <div className="absolute top-0 right-0 bg-red-900 text-white px-4 py-2 rounded-bl-2xl font-black text-xs tracking-widest shadow-[0_0_15px_rgba(220,38,38,0.5)]">IIEF-5</div>
                  <div className="mb-6 border-b border-red-900/30 pb-4 relative z-10 pr-8">
                    <h3 className="text-base sm:text-lg font-black text-white tracking-wide flex items-start gap-3 leading-snug">
                      <Flame size={20} className="text-red-500 shrink-0 mt-0.5"/> 
                      <span>{isFollowUp ? (language === 'en' ? 'Follow-Up Assessment' : 'แบบประเมินติดตามอาการ') : (language === 'en' ? 'Part 3' : 'ส่วนที่ 3')}: {language === 'en' ? 'Erectile Dysfunction (IIEF-5)' : 'ความเสื่อมสมรรถภาพทางเพศ (IIEF-5)'}</span>
                    </h3>
                    <p className="text-sm sm:text-base text-gray-300 mt-2 ml-8 leading-relaxed">{language === 'en' ? 'Please select the answer that best describes your situation' : 'กรุณาเลือกคำตอบที่ตรงกับตัวท่านมากที่สุด'} <br className="hidden sm:block"/><span className="text-red-500 font-black">{language === 'en' ? '(over the past 4 weeks)' : '(ในช่วง 4 สัปดาห์ที่ผ่านมา)'}</span></p>
                  </div>
                  
                  <div className="space-y-5 relative z-10">
                    {[
                      { 
                        n: 'iief_1', 
                        th: '1. ท่านมีความมั่นใจว่าสามารถมีอวัยวะเพศแข็งตัวและสอดใส่ได้ มากน้อยเพียงใด?', 
                        en: '1. How do you rate your confidence that you could get and keep an erection?',
                        oth: ['น้อยมาก / ไม่มีเลย (1)', 'น้อย (2)', 'ปานกลาง (3)', 'สูง (4)', 'สูงมาก (5)'],
                        oen: ['Very low (1)', 'Low (2)', 'Moderate (3)', 'High (4)', 'Very high (5)']
                      },
                      { 
                        n: 'iief_2', 
                        th: '2. เมื่อมีการกระตุ้นทางเพศ อวัยวะเพศท่านแข็งตัวพอที่จะสอดใส่ได้บ่อยแค่ไหน?', 
                        en: '2. When you had erections with sexual stimulation, how often were your erections hard enough for penetration?',
                        oth: ['แทบไม่เคย / ไม่เคยเลย (1)', 'น้อยครั้ง (น้อยกว่าครึ่ง) (2)', 'บางครั้ง (ประมาณครึ่งหนึ่ง) (3)', 'บ่อยครั้ง (มากกว่าครึ่ง) (4)', 'เกือบทุกครั้ง / ทุกครั้ง (5)'],
                        oen: ['Almost never/never (1)', 'A few times (2)', 'Sometimes (3)', 'Most times (4)', 'Almost always/always (5)']
                      },
                      { 
                        n: 'iief_3', 
                        th: '3. เมื่อสอดใส่อวัยวะเพศเข้าไปแล้ว ท่านสามารถคงความแข็งตัวได้บ่อยเพียงใด?', 
                        en: '3. During sexual intercourse, how often were you able to maintain your erection after you had penetrated your partner?',
                        oth: ['แทบไม่เคย / ไม่เคยเลย (1)', 'น้อยครั้ง (น้อยกว่าครึ่ง) (2)', 'บางครั้ง (ประมาณครึ่งหนึ่ง) (3)', 'บ่อยครั้ง (มากกว่าครึ่ง) (4)', 'เกือบทุกครั้ง / ทุกครั้ง (5)'],
                        oen: ['Almost never/never (1)', 'A few times (2)', 'Sometimes (3)', 'Most times (4)', 'Almost always/always (5)']
                      },
                      { 
                        n: 'iief_4', 
                        th: '4. ระหว่างการมีเพศสัมพันธ์ การคงความแข็งตัวจนเสร็จกิจ ยากมากน้อยแค่ไหน?', 
                        en: '4. During sexual intercourse, how difficult was it to maintain your erection to completion of intercourse?',
                        oth: ['ยากมากที่สุด (1)', 'ยากมาก (2)', 'ยาก (3)', 'ค่อนข้างยาก (4)', 'ไม่ยากเลย (5)'],
                        oen: ['Extremely difficult (1)', 'Very difficult (2)', 'Difficult (3)', 'Slightly difficult (4)', 'Not difficult (5)']
                      },
                      { 
                        n: 'iief_5', 
                        th: '5. ท่านพึงพอใจกับการมีเพศสัมพันธ์บ่อยแค่ไหน?', 
                        en: '5. When you attempted sexual intercourse, how often was it satisfactory for you?',
                        oth: ['แทบไม่เคย / ไม่เคยเลย (1)', 'น้อยครั้ง (น้อยกว่าครึ่ง) (2)', 'บางครั้ง (ประมาณครึ่งหนึ่ง) (3)', 'บ่อยครั้ง (มากกว่าครึ่ง) (4)', 'เกือบทุกครั้ง / ทุกครั้ง (5)'],
                        oen: ['Almost never/never (1)', 'A few times (2)', 'Sometimes (3)', 'Most times (4)', 'Almost always/always (5)']
                      }
                    ].map((item) => (
                      <div key={item.n} className="p-4 sm:p-5 rounded-xl" style={{ background: isDark ? 'rgba(10,8,5,0.5)' : 'rgba(255,255,255,0.6)', border: `1px solid ${isDark ? 'rgba(220,38,38,0.12)' : 'rgba(239,68,68,0.08)'}` }}>
                        <label className="block text-base sm:text-lg font-bold mb-3 sm:mb-4 leading-relaxed" style={{ color: isDark ? '#e5e7eb' : '#1f2937' }}>{language === 'en' ? item.en : item.th}</label>
                        <select name={item.n} value={formData[item.n] || ''} onChange={handleInputChange} required className={`${inputClass} text-red-500 font-bold px-4 py-4 sm:py-4 focus:border-red-600 focus:ring-red-600 max-w-full break-words cursor-pointer`} style={{ borderColor: isDark ? 'rgba(220,38,38,0.2)' : 'rgba(239,68,68,0.15)' }}>
                          <option value="" disabled className="text-gray-600">-- {language === 'en' ? 'Select Answer' : 'เลือกคำตอบ'} --</option>
                          {(language === 'en' ? item.oen : item.oth).map((opt, i) => <option key={i} value={i+1} className="text-white">{opt}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ── How Found Us (intake only) ── */}
          {isIntake && !isCustom && (
            <section className="pf-section accent">
              <div className={sectionHeaderClass}>
                <Globe size={16} style={{color: ac, flexShrink:0}}/>
                {language === 'en' ? 'How Did You Find Us?' : 'ท่านรู้จักคลินิกได้อย่างไร?'}
                <span style={{color:'#ef4444', marginLeft:2}}>*</span>
              </div>
              <p style={{fontSize:'12px', color:'var(--tx-muted)', marginBottom:'14px'}}>{language === 'en' ? 'Select all that apply' : 'เลือกได้มากกว่า 1 ช่องทาง'}</p>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px'}}>
                {[
                  { value: 'Facebook', th: 'Facebook', en: 'Facebook' },
                  { value: 'Google', th: 'Google', en: 'Google' },
                  { value: 'Line', th: 'Line', en: 'Line' },
                  { value: 'AI', th: 'AI (ChatGPT / Claude ฯลฯ)', en: 'AI (ChatGPT / Claude etc.)' },
                  { value: 'ป้ายตามที่ต่างๆ', th: 'ป้ายตามที่ต่างๆ', en: 'Billboard / Signage' },
                  { value: 'รู้จักจากคนรู้จัก', th: 'รู้จักจากคนรู้จัก', en: 'Word of Mouth' },
                ].map(ch => {
                  const isSelected = (formData.howFoundUs || []).includes(ch.value);
                  return (
                    <label key={ch.value} className={`pf-reason-card${isSelected ? ' selected' : ''}`} style={{}}>
                      <input type="checkbox" checked={isSelected} onChange={() => handleHowFoundUsToggle(ch.value)} style={{display:'none'}} />
                      <div className="pf-reason-check" style={{}}>
                        {isSelected && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <span className="pf-reason-text">{language === 'en' ? ch.en : ch.th}</span>
                    </label>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Submit CTA ── */}
          <div style={{display:'flex', flexDirection:'column', gap:'10px', paddingTop:'8px'}}>
            <button type="submit" disabled={isSubmitting} className="pf-submit"
              style={{background: isEditing ? '#2563eb' : ac, boxShadow: isEditing ? '0 4px 20px rgba(37,99,235,0.35)' : `0 4px 20px rgba(${acRgb},0.35)`}}>
              {isSubmitting
                ? <><div className="spinner" style={{borderTopColor:'#fff', borderColor:'rgba(255,255,255,0.2)'}}/> {language === 'en' ? 'Submitting...' : 'กำลังบันทึก...'}</>
                : <><CheckCircle2 size={20}/> {isEditing ? (language === 'en' ? 'Confirm Update' : 'ยืนยันการแก้ไขข้อมูล') : (language === 'en' ? 'Submit' : 'ส่งข้อมูล')}</>}
            </button>
            {isEditing && (
              <button type="button" onClick={() => { setIsEditing(false); setIsSuccess(true); window.scrollTo(0, 0); }}
                style={{width:'100%', padding:'12px', borderRadius:'10px', fontSize:'14px', fontWeight:'600', color:'var(--tx-muted)', background:'var(--bg-surface)', border:'1.5px solid var(--bd-strong)', cursor:'pointer', transition:'all 0.15s'}}>
                {language === 'en' ? 'Cancel' : 'ยกเลิก'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
