import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Loader2, Stethoscope, Heart, Thermometer, ClipboardList,
         Pill, ShoppingCart, DollarSign, Shield, CreditCard, Check, Plus, Trash2,
         Search, Package, Edit3, RotateCcw } from 'lucide-react';
import { doc, setDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import * as broker from '../lib/brokerClient.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, isDark, accent, children }) {
  return (
    <div className="flex items-center flex-wrap gap-2 mb-3">
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

function ActionBtn({ children, color, isDark, onClick, className = '' }) {
  return (
    <button onClick={onClick}
      className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-all flex items-center gap-1 ${className}`}
      style={{ color, borderColor: `${color}40`, background: `${color}0a` }}>
      {children}
    </button>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function TreatmentFormPage({ mode = 'create', customerId, treatmentId, patientName, isDark, db, appId, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const accent = isDark ? '#a78bfa' : '#7c3aed';
  const inputCls = `w-full rounded-lg px-3 py-2 text-xs outline-none border transition-all ${isDark ? 'bg-[#111] border-[#333] text-gray-200 focus:border-purple-500' : 'bg-white border-gray-200 text-gray-800 focus:border-purple-400'}`;
  const labelCls = 'text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-1 block';
  const selectCls = inputCls;

  // ── Core state ──────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
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
  const [medModalOpen, setMedModalOpen] = useState(false);
  const [medModalQuery, setMedModalQuery] = useState('');
  const [medAllProducts, setMedAllProducts] = useState([]); // all meds loaded on open
  const [medModalLoading, setMedModalLoading] = useState(false);
  const [medModalSelected, setMedModalSelected] = useState(null); // selected product in modal
  const [medModalQty, setMedModalQty] = useState('');
  const [medModalPrice, setMedModalPrice] = useState('');
  const [medModalDiscount, setMedModalDiscount] = useState('');
  const [medModalDiscountType, setMedModalDiscountType] = useState('amount'); // amount | percent
  const [medModalVat, setMedModalVat] = useState(false);
  const [medModalPremium, setMedModalPremium] = useState(false);
  const [medModalLabelOpen, setMedModalLabelOpen] = useState(false);
  const [medGroupModalOpen, setMedGroupModalOpen] = useState(false);
  const [medGroupData, setMedGroupData] = useState([]); // all groups from API
  const [medGroupSelectedId, setMedGroupSelectedId] = useState('');
  const [medGroupChecked, setMedGroupChecked] = useState(new Set()); // checked product indices
  const [medGroupLoading, setMedGroupLoading] = useState(false);
  const [remedModalOpen, setRemedModalOpen] = useState(false);

  // Course items — selected rowIds
  const [selectedCourseItems, setSelectedCourseItems] = useState(new Set());

  // Treatment items — items shown in รายการรักษา panel (from courses or manual)
  const [treatmentItems, setTreatmentItems] = useState([]);

  // Consumables
  const [consumables, setConsumables] = useState([]);
  const [consModalOpen, setConsModalOpen] = useState(false);
  const [consModalQuery, setConsModalQuery] = useState('');
  const [consAllProducts, setConsAllProducts] = useState([]);
  const [consModalLoading, setConsModalLoading] = useState(false);
  const [consModalSelected, setConsModalSelected] = useState(null);
  const [consModalQty, setConsModalQty] = useState('');
  const [consGroupModalOpen, setConsGroupModalOpen] = useState(false);
  const [consGroupData, setConsGroupData] = useState([]);
  const [consGroupSelectedId, setConsGroupSelectedId] = useState('');
  const [consGroupChecked, setConsGroupChecked] = useState(new Set());
  const [consGroupLoading, setConsGroupLoading] = useState(false);

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

  // ── Load form data ──────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        // Always load form options (doctors, courses, etc.)
        const formData = await broker.getTreatmentCreateForm(customerId);
        if (!formData.success || !formData.options) {
          setError(formData.error || 'ไม่สามารถโหลดฟอร์มได้');
          setLoading(false);
          return;
        }
        setOptions(formData.options);

        if (isEdit && treatmentId) {
          // Load existing treatment data for edit
          const detail = await broker.getTreatment(treatmentId);
          if (detail.success && detail.treatment) {
            const t = detail.treatment;
            if (t.doctorId) setDoctorId(t.doctorId);
            if (t.assistants?.length) setAssistantIds(t.assistants.map(a => a.id || a).filter(Boolean));
            if (t.treatmentDate) setTreatmentDate(t.treatmentDate);
            // Health info
            if (t.healthInfo?.bloodType) setBloodType(t.healthInfo.bloodType);
            if (t.healthInfo?.congenitalDisease) setCongenitalDisease(t.healthInfo.congenitalDisease);
            if (t.healthInfo?.drugAllergy) setDrugAllergy(t.healthInfo.drugAllergy);
            // Vitals
            if (t.vitals) setVitals(v => ({ ...v, ...t.vitals }));
            // OPD
            setOpd({
              symptoms: t.symptoms || '',
              physicalExam: t.physicalExam || '',
              diagnosis: t.diagnosis || '',
              treatmentInfo: t.treatmentInfo || '',
              treatmentPlan: t.treatmentPlan || '',
              treatmentNote: t.treatmentNote || '',
              additionalNote: t.additionalNote || '',
            });
            // Treatment items from existing
            if (t.treatmentItems?.length) {
              setTreatmentItems(t.treatmentItems.map((item, i) => ({
                id: `existing-${i}`,
                name: item.name || item.product || '',
                qty: item.qty || '1',
                unit: item.unit || '',
                price: item.price || '',
              })));
            }
          }
        } else {
          // Create mode — pre-fill defaults
          const hi = formData.options.healthInfo || {};
          if (hi.doctorId) setDoctorId(hi.doctorId);
          if (hi.bloodType) setBloodType(hi.bloodType);
          if (hi.congenitalDisease) setCongenitalDisease(hi.congenitalDisease);
          if (hi.drugAllergy) setDrugAllergy(hi.drugAllergy);
          if (hi.treatmentHistory) setTreatmentHistory(hi.treatmentHistory);
          const vd = formData.options.vitalsDefaults || {};
          if (vd.weight) setVitals(v => ({ ...v, weight: vd.weight }));
          if (vd.height) setVitals(v => ({ ...v, height: vd.height }));
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [customerId, treatmentId, isEdit]);

  // ── Toggle assistant ──
  const toggleAssistant = (id) => {
    setAssistantIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  };

  // ── Course item toggle — also update treatment items ──
  const toggleCourseItem = (product) => {
    setSelectedCourseItems(prev => {
      const next = new Set(prev);
      if (next.has(product.rowId)) {
        next.delete(product.rowId);
        // Remove from treatment items
        setTreatmentItems(ti => ti.filter(t => t.id !== product.rowId));
      } else {
        next.add(product.rowId);
        // Add to treatment items
        setTreatmentItems(ti => [...ti, {
          id: product.rowId,
          name: product.name,
          qty: '1',
          unit: product.unit || '',
          price: '',
        }]);
      }
      return next;
    });
  };

  // ── Treatment items CRUD ──
  const updateTreatmentItem = (id, field, value) => {
    setTreatmentItems(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };
  const removeTreatmentItem = (id) => {
    setTreatmentItems(prev => prev.filter(t => t.id !== id));
    setSelectedCourseItems(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  // ── Medication modal (เพิ่มยากลับบ้าน — matching ProClinic) ──
  const openMedModal = async () => {
    setMedModalOpen(true);
    setMedModalQuery('');
    setMedModalSelected(null);
    setMedModalQty('');
    setMedModalPrice('');
    setMedModalDiscount('');
    setMedModalDiscountType('amount');
    setMedModalVat(false);
    setMedModalPremium(false);
    setMedModalLabelOpen(false);
    if (medAllProducts.length > 0) return;
    setMedModalLoading(true);
    try {
      const data = await broker.searchProducts({ productType: 'ยา', isTakeaway: true, perPage: 200 });
      if (data.success) {
        setMedAllProducts(data.products || []);
        // Backup to Firestore
        if (db && appId && data.products?.length) {
          try {
            const items = data.products;
            for (let i = 0; i < items.length; i += 400) {
              const batch = writeBatch(db);
              items.slice(i, i + 400).forEach(p => {
                const ref = doc(db, 'artifacts', appId, 'public', 'data', 'master_data', 'takeaway_products', 'items', String(p.id));
                batch.set(ref, { ...p, fetchedAt: new Date().toISOString() }, { merge: true });
              });
              await batch.commit();
            }
          } catch (_e) { console.warn('[TreatmentForm] Failed to backup takeaway products', _e); }
        }
      }
    } catch (_) {}
    setMedModalLoading(false);
  };
  const medFilteredProducts = useMemo(() => {
    if (!medModalQuery) return medAllProducts;
    const q = medModalQuery.toLowerCase();
    return medAllProducts.filter(p => p.name.toLowerCase().includes(q));
  }, [medAllProducts, medModalQuery]);
  const selectMedProduct = (p) => {
    setMedModalSelected(p);
    setMedModalQty(p.label?.dosageAmount || '1');
    setMedModalPrice(p.price || '0');
    setMedModalVat(!!p.isVatIncluded);
    setMedModalDiscount('');
    setMedModalDiscountType('amount');
    setMedModalPremium(false);
  };
  const confirmMedModal = () => {
    if (!medModalSelected) return;
    const p = medModalSelected;
    const dosageText = p.label
      ? [p.label.administrationTimes, p.label.administrationMethod].filter(Boolean).join(', ')
      : '';
    const price = parseFloat(medModalPrice) || 0;
    const disc = parseFloat(medModalDiscount) || 0;
    const discounted = medModalDiscountType === 'percent' ? price * (1 - disc / 100) : price - disc;
    const vatAmount = medModalVat ? discounted * 0.07 : 0;
    const netPrice = medModalPremium ? 0 : Math.max(0, discounted + vatAmount);
    setMedications(prev => [...prev, {
      id: p.id,
      name: p.name,
      dosage: dosageText,
      qty: medModalQty || '1',
      unitPrice: netPrice.toFixed(2),
      unit: p.unit || p.label?.dosageUnit || '',
      isPremium: medModalPremium,
    }]);
    setMedModalOpen(false);
  };
  const openMedGroupModal = async () => {
    setMedGroupModalOpen(true);
    setMedGroupChecked(new Set());
    setMedGroupSelectedId('');
    if (medGroupData.length > 0) return; // already loaded
    setMedGroupLoading(true);
    try {
      const data = await broker.getMedicationGroups('ยากลับบ้าน');
      if (data.success && data.groups?.length) {
        setMedGroupData(data.groups);
        setMedGroupSelectedId(String(data.groups[0].id));
        setMedGroupChecked(new Set(data.groups[0].products.map((_, i) => i)));
        // Backup to Firestore
        if (db && appId) {
          try {
            const batch = writeBatch(db);
            for (const g of data.groups) {
              const ref = doc(db, 'artifacts', appId, 'public', 'data', 'master_data', 'medication_groups', 'items', String(g.id));
              batch.set(ref, { ...g, fetchedAt: new Date().toISOString() }, { merge: true });
            }
            await batch.commit();
          } catch (_e) { console.warn('[TreatmentForm] Failed to backup medication groups', _e); }
        }
      }
    } catch (_) {}
    setMedGroupLoading(false);
  };
  const selectedGroupProducts = useMemo(() => {
    const g = medGroupData.find(g => String(g.id) === medGroupSelectedId);
    return g?.products || [];
  }, [medGroupData, medGroupSelectedId]);
  const toggleMedGroupCheck = (idx) => {
    setMedGroupChecked(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };
  const confirmMedGroup = () => {
    selectedGroupProducts.forEach((p, i) => {
      if (!medGroupChecked.has(i)) return;
      const dosageText = p.label
        ? [p.label.administrationTimes, p.label.administrationMethod].filter(Boolean).join(', ')
        : '';
      setMedications(prev => [...prev, {
        id: p.id,
        name: p.name,
        dosage: dosageText,
        qty: p.qty || p.label?.dosageAmount || '1',
        unitPrice: p.price || '0',
        unit: p.unit || p.label?.dosageUnit || '',
      }]);
    });
    setMedGroupModalOpen(false);
  };
  const updateMed = (i, field, value) => {
    setMedications(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: value } : m));
  };
  const removeMed = (i) => {
    setMedications(prev => prev.filter((_, idx) => idx !== i));
  };

  // ── Consumable modal (เพิ่มสินค้าสิ้นเปลือง — matching ProClinic) ──
  const openConsModal = async () => {
    setConsModalOpen(true);
    setConsModalQuery('');
    setConsModalSelected(null);
    setConsModalQty('');
    if (consAllProducts.length > 0) return;
    setConsModalLoading(true);
    try {
      const data = await broker.searchProducts({ productType: 'สินค้าสิ้นเปลือง', perPage: 200 });
      if (data.success) {
        setConsAllProducts(data.products || []);
        if (db && appId && data.products?.length) {
          try {
            const batch = writeBatch(db);
            data.products.forEach(p => {
              const ref = doc(db, 'artifacts', appId, 'public', 'data', 'master_data', 'consumable_products', 'items', String(p.id));
              batch.set(ref, { ...p, fetchedAt: new Date().toISOString() }, { merge: true });
            });
            await batch.commit();
          } catch (_e) { console.warn('[TreatmentForm] Failed to backup consumable products', _e); }
        }
      }
    } catch (_) {}
    setConsModalLoading(false);
  };
  const consFilteredProducts = useMemo(() => {
    if (!consModalQuery) return consAllProducts;
    const q = consModalQuery.toLowerCase();
    return consAllProducts.filter(p => p.name.toLowerCase().includes(q));
  }, [consAllProducts, consModalQuery]);
  const confirmConsModal = () => {
    if (!consModalSelected) return;
    setConsumables(prev => [...prev, {
      id: consModalSelected.id,
      name: consModalSelected.name,
      qty: consModalQty || '1',
      unit: consModalSelected.unit || '',
    }]);
    setConsModalOpen(false);
  };
  const updateConsumable = (i, field, value) => {
    setConsumables(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  };
  const removeConsumable = (i) => {
    setConsumables(prev => prev.filter((_, idx) => idx !== i));
  };

  // ── Consumable group modal ──
  const openConsGroupModal = async () => {
    setConsGroupModalOpen(true);
    setConsGroupChecked(new Set());
    setConsGroupSelectedId('');
    if (consGroupData.length > 0) return;
    setConsGroupLoading(true);
    try {
      const data = await broker.getMedicationGroups('สินค้าสิ้นเปลือง');
      if (data.success && data.groups?.length) {
        setConsGroupData(data.groups);
        setConsGroupSelectedId(String(data.groups[0].id));
        setConsGroupChecked(new Set(data.groups[0].products.map((_, i) => i)));
        // Backup to Firestore
        if (db && appId) {
          try {
            const batch = writeBatch(db);
            for (const g of data.groups) {
              const ref = doc(db, 'artifacts', appId, 'public', 'data', 'master_data', 'consumable_groups', 'items', String(g.id));
              batch.set(ref, { ...g, fetchedAt: new Date().toISOString() }, { merge: true });
            }
            await batch.commit();
          } catch (_e) { console.warn('[TreatmentForm] Failed to backup consumable groups', _e); }
        }
      }
    } catch (_) {}
    setConsGroupLoading(false);
  };
  const selectedConsGroupProducts = useMemo(() => {
    const g = consGroupData.find(g => String(g.id) === consGroupSelectedId);
    return g?.products || [];
  }, [consGroupData, consGroupSelectedId]);
  const toggleConsGroupCheck = (idx) => {
    setConsGroupChecked(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };
  const confirmConsGroup = () => {
    selectedConsGroupProducts.forEach((p, i) => {
      if (!consGroupChecked.has(i)) return;
      setConsumables(prev => [...prev, {
        id: p.id,
        name: p.name,
        qty: p.qty || '1',
        unit: p.unit || '',
      }]);
    });
    setConsGroupModalOpen(false);
  };

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!doctorId) { setError('กรุณาเลือกแพทย์'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
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
        consumables: consumables.filter(c => c.name),
        treatmentItems,
        benefitType,
        insuranceCompanyId,
        paymentType,
        paymentChannelId,
        saleNote,
        paymentDate: treatmentDate,
      };

      const data = isEdit
        ? await broker.updateTreatment(treatmentId, payload)
        : await broker.createTreatment(customerId, payload);

      if (data.success) {
        // Save raw treatment data to our Firestore (backup — viewable even if ProClinic is down)
        if (db && appId) {
          try {
            const localId = data.treatmentId || treatmentId || `local-${Date.now()}`;
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'treatments', String(localId));
            await setDoc(docRef, {
              proClinicId: localId,
              customerId,
              patientName: patientName || '',
              mode: isEdit ? 'edit' : 'create',
              doctorId,
              doctorName: (options?.doctors || []).find(d => String(d.id) === String(doctorId))?.name || '',
              assistantIds,
              treatmentDate,
              opd: { ...opd },
              vitals: { ...vitals, bmi: bmi || '' },
              healthInfo: { bloodType, congenitalDisease, drugAllergy, treatmentHistory },
              medications: medications.filter(m => m.name).map(m => ({ id: m.id, name: m.name, dosage: m.dosage, qty: m.qty, unitPrice: m.unitPrice, unit: m.unit })),
              consumables: consumables.filter(c => c.name).map(c => ({ id: c.id, name: c.name, qty: c.qty, unit: c.unit })),
              courseItems: Array.from(selectedCourseItems),
              treatmentItems: treatmentItems.map(t => ({ id: t.id, name: t.name, qty: t.qty, unit: t.unit })),
              insurance: { benefitType, insuranceCompanyId },
              payment: { paymentType, paymentChannelId, saleNote },
              medCert: { medCertActuallyCome, medCertIsRest, medCertPeriod, medCertIsOther, medCertOtherDetail },
              syncedToProClinic: true,
              savedAt: serverTimestamp(),
            }, { merge: true });
          } catch (e) {
            console.warn('[TreatmentForm] Failed to save local backup:', e);
          }
        }
        setSuccess(true);
        setTimeout(() => { if (onSaved) onSaved(); }, 1200);
      } else {
        setError(data.error || (isEdit ? 'บันทึกไม่สำเร็จ' : 'สร้างไม่สำเร็จ'));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Loading / Success states ────────────────────────────────────────────
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

  if (success) {
    return (
      <div className={`fixed inset-0 z-[80] flex items-center justify-center ${isDark ? 'bg-[#0a0a0a]' : 'bg-gray-50'}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
            <Check size={24} className="text-green-500" />
          </div>
          <p className="text-sm font-bold text-green-500">{isEdit ? 'บันทึกสำเร็จ' : 'สร้างการรักษาสำเร็จ'}</p>
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
  const medicationGroups = options?.medicationGroups || [];
  const consumableGroups = options?.consumableGroups || [];

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
              {isEdit ? <Edit3 size={16} /> : <Stethoscope size={16} />}
              {isEdit ? 'แก้ไขการรักษา' : 'สร้างการรักษาใหม่'}
            </h2>
            {patientName && <p className="text-[10px] text-gray-500 truncate">{patientName}</p>}
          </div>
          <button onClick={handleSubmit} disabled={saving}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50 transition-all flex items-center gap-1.5">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? 'กำลังบันทึก...' : isEdit ? 'บันทึก' : 'ยืนยันการรักษา'}
          </button>
        </div>
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="max-w-6xl mx-auto px-4 pt-3">
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-500 font-bold">{error}</div>
        </div>
      )}

      {/* ── Two-Column Layout ─────────────────────────────────────────────── */}
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
                  {bloodTypeOptions.length > 0
                    ? <select value={bloodType} onChange={e => setBloodType(e.target.value)} className={selectCls}>
                        <option value="">-</option>
                        {bloodTypeOptions.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    : <input value={bloodType} onChange={e => setBloodType(e.target.value)} className={inputCls} placeholder="กรุ๊ปเลือด" />
                  }
                </div>
                {[
                  ['congenitalDisease', 'โรคประจำตัว', congenitalDisease, setCongenitalDisease],
                  ['drugAllergy', 'ประวัติแพ้ยา', drugAllergy, setDrugAllergy],
                  ['treatmentHistory', 'ประวัติการรักษาอื่นๆ', treatmentHistory, setTreatmentHistory],
                ].map(([key, label, val, setter]) => (
                  <div key={key}>
                    <label className={labelCls}>{label}</label>
                    <textarea value={val} onChange={e => setter(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder={label} />
                  </div>
                ))}
              </div>
            </FormSection>

            {/* Vital Signs */}
            <FormSection isDark={isDark}>
              <SectionHeader icon={Thermometer} title="ข้อมูลซักประวัติ (Vital Signs)" isDark={isDark} accent="#f59e0b" />
              <div className="grid grid-cols-3 gap-2">
                {[['weight', 'น้ำหนัก (kg)'], ['height', 'ส่วนสูง (cm)']].map(([key, label]) => (
                  <div key={key}>
                    <label className={labelCls}>{label}</label>
                    <input value={vitals[key]} onChange={e => setVitals(v => ({ ...v, [key]: e.target.value }))} className={`${inputCls} text-center`} placeholder="-" />
                  </div>
                ))}
                <div>
                  <label className={labelCls}>BMI</label>
                  <input value={bmi} readOnly className={`${inputCls} text-center opacity-60`} placeholder="-" />
                </div>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-2">
                {[['temperature', 'BT (°C)'], ['pulseRate', 'PR (bpm)'], ['respiratoryRate', 'RR'],
                  ['systolicBP', 'SBP (mmHg)'], ['diastolicBP', 'DBP (mmHg)']].map(([key, label]) => (
                  <div key={key}>
                    <label className={labelCls}>{label}</label>
                    <input value={vitals[key]} onChange={e => setVitals(v => ({ ...v, [key]: e.target.value }))} className={`${inputCls} text-center`} placeholder="-" />
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <label className={labelCls}>O₂ Sat (%)</label>
                <input value={vitals.oxygenSaturation} onChange={e => setVitals(v => ({ ...v, oxygenSaturation: e.target.value }))} className={`${inputCls} text-center w-24`} placeholder="-" />
              </div>
            </FormSection>

            {/* Consent & Med Cert */}
            <FormSection isDark={isDark}>
              <SectionHeader icon={ClipboardList} title="ใบรับรองแพทย์" isDark={isDark} accent="#06b6d4" />
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={medCertActuallyCome} onChange={e => setMedCertActuallyCome(e.target.checked)} className="rounded border-gray-400" />
                  ผู้ป่วยมารักษาวันนี้จริง
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={medCertIsRest} onChange={e => setMedCertIsRest(e.target.checked)} className="rounded border-gray-400" />
                  ให้หยุดพัก
                </label>
                {medCertIsRest && (
                  <div className="ml-6">
                    <label className={labelCls}>ระยะเวลาหยุดพัก</label>
                    <input value={medCertPeriod} onChange={e => setMedCertPeriod(e.target.value)} className={inputCls} placeholder="เช่น 3 วัน" />
                  </div>
                )}
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={medCertIsOther} onChange={e => setMedCertIsOther(e.target.checked)} className="rounded border-gray-400" />
                  อื่นๆ
                </label>
                {medCertIsOther && (
                  <div className="ml-6">
                    <textarea value={medCertOtherDetail} onChange={e => setMedCertOtherDetail(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="รายละเอียด" />
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
                    <textarea value={opd[key]} onChange={e => setOpd(prev => ({ ...prev, [key]: e.target.value }))} rows={rows} className={`${inputCls} resize-none`} />
                  </div>
                ))}
              </div>
            </FormSection>
          </div>
        </div>

        {/* ════ FULL-WIDTH BOTTOM SECTIONS ════ */}
        <div className="space-y-4 mt-4">

          {/* ── Take-Home Medications ──────────────────────────────────────── */}
          <FormSection isDark={isDark}>
            <SectionHeader icon={Pill} title="สั่งยากลับบ้าน" isDark={isDark} accent="#10b981">
              <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                <ActionBtn color="#3b82f6" isDark={isDark} onClick={openMedGroupModal}>
                  <Plus size={10} /> กลุ่มยากลับบ้าน
                </ActionBtn>
                <ActionBtn color="#10b981" isDark={isDark} onClick={openMedModal}>
                  <Plus size={10} /> ยากลับบ้าน
                </ActionBtn>
                <ActionBtn color="#38bdf8" isDark={isDark} onClick={() => setRemedModalOpen(true)}>
                  <RotateCcw size={10} /> Remed
                </ActionBtn>
              </div>
            </SectionHeader>

            {/* เพิ่มยากลับบ้าน modal — matching ProClinic */}
            {medModalOpen && (
              <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50" onClick={() => setMedModalOpen(false)}>
                <div className={`w-full max-w-xl mx-4 rounded-xl shadow-2xl overflow-hidden ${isDark ? 'bg-[#0e0e0e] border border-[#222]' : 'bg-white'}`}
                  onClick={e => e.stopPropagation()}>
                  <div className={`px-5 py-3 border-b ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <h3 className="text-sm font-black" style={{ color: '#10b981' }}>เพิ่มยากลับบ้าน</h3>
                  </div>
                  <div className="px-5 py-4 space-y-3 max-h-[80vh] overflow-y-auto">
                    {/* Product select with search */}
                    <div>
                      <label className={labelCls}>ยากลับบ้าน *</label>
                      <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 z-10" />
                        <input value={medModalSelected ? medModalSelected.name : medModalQuery}
                          onChange={e => { setMedModalQuery(e.target.value); setMedModalSelected(null); }}
                          onFocus={() => { if (medModalSelected) { setMedModalQuery(medModalSelected.name); setMedModalSelected(null); } }}
                          className={`${inputCls} !pl-8`} placeholder="เลือกยากลับบ้าน" autoFocus />
                      </div>
                      {!medModalSelected && (
                        <div className={`rounded-lg border mt-1 max-h-40 overflow-y-auto ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-200 bg-white'}`}>
                          {medModalLoading ? (
                            <div className="flex items-center justify-center gap-2 py-4"><Loader2 size={14} className="animate-spin text-emerald-400" /><span className="text-xs text-gray-500">กำลังโหลด...</span></div>
                          ) : medFilteredProducts.length === 0 ? (
                            <p className="text-[10px] text-gray-500 text-center py-3">ไม่พบรายการ</p>
                          ) : medFilteredProducts.map(p => (
                            <button key={p.id} onClick={() => selectMedProduct(p)}
                              className={`w-full text-left px-3 py-2 text-xs border-b transition-all flex justify-between items-center ${isDark ? 'border-[#1a1a1a] hover:bg-[#1a1a1a]' : 'border-gray-100 hover:bg-gray-50'}`}>
                              <div>
                                <span className="font-bold">{p.name}</span>
                                {p.category && <span className="text-[10px] text-gray-500 ml-2">[{p.category}]</span>}
                              </div>
                              <span className="text-[10px] text-gray-500 whitespace-nowrap ml-2">฿{p.price} / {p.unit}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Qty + Unit + Price */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelCls}>จำนวน *</label>
                        <div className="flex">
                          <input type="number" value={medModalQty} onChange={e => setMedModalQty(e.target.value)}
                            className={`${inputCls} rounded-r-none`} placeholder="กรอกจำนวน" />
                          <span className={`flex items-center px-2 text-[10px] border border-l-0 rounded-r-lg ${isDark ? 'border-[#333] bg-[#1a1a1a] text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
                            {medModalSelected?.unit || 'หน่วย'}
                          </span>
                        </div>
                      </div>
                      <div>
                        <label className={labelCls}>ราคาต่อหน่วย *</label>
                        <input type="number" value={medModalPrice} onChange={e => setMedModalPrice(e.target.value)}
                          className={inputCls} placeholder="กรอกราคาต่อหน่วย" />
                      </div>
                      <div className="flex items-end pb-2">
                        <label className="flex items-center gap-1.5 text-[10px] text-gray-400 cursor-pointer">
                          <input type="checkbox" checked={medModalPremium} onChange={e => setMedModalPremium(e.target.checked)}
                            className="w-3.5 h-3.5 rounded accent-emerald-500" />
                          สินค้าของแถม
                        </label>
                      </div>
                    </div>
                    {/* Price summary */}
                    <div className={`rounded-lg border p-3 space-y-2 ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-200 bg-gray-50'}`}>
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">สรุปราคาต่อหน่วย</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 w-24 shrink-0">ส่วนลดต่อหน่วย</span>
                        <input type="number" value={medModalDiscount} onChange={e => setMedModalDiscount(e.target.value)}
                          className={`${inputCls} !w-24`} placeholder="0" />
                        <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
                          <input type="radio" name="medDiscType" checked={medModalDiscountType === 'amount'} onChange={() => setMedModalDiscountType('amount')} className="w-3 h-3" /> บาท
                        </label>
                        <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
                          <input type="radio" name="medDiscType" checked={medModalDiscountType === 'percent'} onChange={() => setMedModalDiscountType('percent')} className="w-3 h-3" /> %
                        </label>
                      </div>
                      {(() => {
                        const price = parseFloat(medModalPrice) || 0;
                        const disc = parseFloat(medModalDiscount) || 0;
                        const afterDisc = medModalDiscountType === 'percent' ? price * (1 - disc / 100) : price - disc;
                        const vat = medModalVat ? afterDisc * 0.07 : 0;
                        const net = medModalPremium ? 0 : Math.max(0, afterDisc + vat);
                        return (
                          <div className="space-y-1 text-[10px]">
                            <div className="flex justify-between text-gray-500"><span>ราคาหลังหักส่วนลด</span><span>{afterDisc.toFixed(2)} บาท</span></div>
                            <div className="flex items-center justify-between text-gray-500">
                              <label className="flex items-center gap-1 cursor-pointer">
                                <input type="checkbox" checked={medModalVat} onChange={e => setMedModalVat(e.target.checked)} className="w-3 h-3 rounded accent-emerald-500" />
                                คำนวนค่าสินค้าเพิ่ม (VAT 7%)
                              </label>
                              <span>{vat.toFixed(2)} บาท</span>
                            </div>
                            <div className="flex justify-between font-bold text-gray-300 pt-1 border-t border-dashed" style={{ borderColor: isDark ? '#333' : '#ddd' }}>
                              <span>ราคาสุทธิ์ต่อหน่วย</span><span>{net.toFixed(2)} บาท</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    {/* Label info (expandable) */}
                    <div>
                      <button onClick={() => setMedModalLabelOpen(!medModalLabelOpen)}
                        className={`flex items-center gap-1.5 text-[10px] font-bold text-gray-500 hover:text-gray-400 transition-colors`}>
                        <span className={`transition-transform ${medModalLabelOpen ? 'rotate-90' : ''}`}>▶</span>
                        ข้อมูลฉลากยา
                      </button>
                      {medModalLabelOpen && medModalSelected?.label && (
                        <div className={`mt-2 rounded-lg border p-3 space-y-2 text-xs ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-200 bg-gray-50'}`}>
                          <div><span className="text-[10px] font-bold text-gray-500">ชื่อสามัญ:</span> <span className="text-gray-400">{medModalSelected.label.genericName || '-'}</span></div>
                          <div><span className="text-[10px] font-bold text-gray-500">ข้อบ่งใช้:</span> <span className="text-gray-400">{medModalSelected.label.indications || '-'}</span></div>
                          <div><span className="text-[10px] font-bold text-gray-500">รับประทานครั้งละ:</span> <span className="text-gray-400">{medModalSelected.label.dosageAmount || '-'} {medModalSelected.label.dosageUnit || ''}</span></div>
                          <div><span className="text-[10px] font-bold text-gray-500">วันละ:</span> <span className="text-gray-400">{medModalSelected.label.timesPerDay || '-'} ครั้ง</span></div>
                          <div><span className="text-[10px] font-bold text-gray-500">วิธีรับประทาน:</span> <span className="text-gray-400">{medModalSelected.label.administrationMethod || '-'}</span></div>
                          <div><span className="text-[10px] font-bold text-gray-500">ช่วงเวลา:</span> <span className="text-gray-400">{medModalSelected.label.administrationTimes || '-'}</span></div>
                          <div><span className="text-[10px] font-bold text-gray-500">คำแนะนำ:</span> <span className="text-gray-400">{medModalSelected.label.instructions || '-'}</span></div>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Footer */}
                  <div className={`flex items-center justify-center gap-3 px-5 py-3 border-t ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <button onClick={() => setMedModalOpen(false)}
                      className={`px-6 py-2 rounded-lg text-xs font-bold border transition-all ${isDark ? 'border-[#333] text-gray-400 hover:bg-[#1a1a1a]' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
                      ยกเลิก
                    </button>
                    <button onClick={confirmMedModal} disabled={!medModalSelected}
                      className="px-6 py-2 rounded-lg text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                      ยืนยัน
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Medication group modal — full overlay matching ProClinic */}
            {medGroupModalOpen && (
              <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50" onClick={() => setMedGroupModalOpen(false)}>
                <div className={`w-full max-w-2xl mx-4 rounded-xl shadow-2xl overflow-hidden ${isDark ? 'bg-[#0e0e0e] border border-[#222]' : 'bg-white'}`}
                  onClick={e => e.stopPropagation()}>
                  {/* Header */}
                  <div className={`flex items-center justify-between px-5 py-3 border-b ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <h3 className="text-sm font-black" style={{ color: '#10b981' }}>เพิ่มยากลับบ้าน</h3>
                    <select value={medGroupSelectedId}
                      onChange={e => {
                        setMedGroupSelectedId(e.target.value);
                        const g = medGroupData.find(g => String(g.id) === e.target.value);
                        setMedGroupChecked(new Set((g?.products || []).map((_, i) => i)));
                      }}
                      className={`${selectCls} !w-auto !text-xs min-w-[180px]`}>
                      {medGroupData.map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
                    </select>
                  </div>
                  {/* Table */}
                  <div className="px-5 py-3 max-h-[50vh] overflow-y-auto">
                    {medGroupLoading ? (
                      <div className="flex items-center justify-center gap-2 py-8"><Loader2 size={16} className="animate-spin text-emerald-400" /><span className="text-xs text-gray-500">กำลังโหลดกลุ่มยา...</span></div>
                    ) : selectedGroupProducts.length === 0 ? (
                      <p className="text-xs text-gray-500 text-center py-8">กรุณาเลือกกลุ่มยากลับบ้าน</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                            <th className="text-left py-1.5 pr-2 w-8"></th>
                            <th className="text-left py-1.5">รายการยากลับบ้าน ({selectedGroupProducts.length} รายการ)</th>
                            <th className="text-center py-1.5 w-16">จำนวน</th>
                            <th className="text-center py-1.5 w-12">หน่วย</th>
                            <th className="text-center py-1.5 w-20">ราคาต่อหน่วย</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedGroupProducts.map((p, i) => (
                            <tr key={p.id} className={`border-t ${isDark ? 'border-[#1a1a1a]' : 'border-gray-100'}`}>
                              <td className="py-2 pr-2">
                                <input type="checkbox" checked={medGroupChecked.has(i)} onChange={() => toggleMedGroupCheck(i)}
                                  className="w-3.5 h-3.5 rounded accent-emerald-500" />
                              </td>
                              <td className="py-2 font-medium">{p.name}</td>
                              <td className="py-2 text-center">{parseFloat(p.qty) || 1}</td>
                              <td className="py-2 text-center text-gray-500">{p.unit}</td>
                              <td className="py-2 text-center">{parseFloat(p.price).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  {/* Selected items chips */}
                  {medGroupChecked.size > 0 && (
                    <div className={`px-5 py-2 border-t ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-100 bg-gray-50'}`}>
                      <p className="text-[10px] font-bold text-gray-500 mb-1.5">รายการที่เลือก ({medGroupChecked.size} รายการ)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedGroupProducts.map((p, i) => medGroupChecked.has(i) && (
                          <span key={i} className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                            {p.name} ({parseFloat(p.qty)} {p.unit})
                            <button onClick={() => toggleMedGroupCheck(i)} className="hover:text-red-400 ml-0.5">&times;</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Footer buttons */}
                  <div className={`flex items-center justify-center gap-3 px-5 py-3 border-t ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <button onClick={() => setMedGroupModalOpen(false)}
                      className={`px-6 py-2 rounded-lg text-xs font-bold border transition-all ${isDark ? 'border-[#333] text-gray-400 hover:bg-[#1a1a1a]' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
                      ยกเลิก
                    </button>
                    <button onClick={confirmMedGroup} disabled={medGroupChecked.size === 0}
                      className="px-6 py-2 rounded-lg text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                      ยืนยัน
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Remed modal — past medications from treatment history */}
            {remedModalOpen && (
              <div className={`rounded-lg border p-3 mb-3 ${isDark ? 'border-sky-900/30 bg-[#0a0c14]' : 'border-sky-200 bg-sky-50/30'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[10px] font-bold text-sky-400 uppercase tracking-widest">ประวัติการสั่งยา (Remed)</p>
                  <button onClick={() => setRemedModalOpen(false)} className="ml-auto text-gray-400 hover:text-gray-300 p-1"><Trash2 size={12} /></button>
                </div>
                {(options?.remedItems || []).length === 0 ? (
                  <p className="text-[10px] text-gray-500 text-center py-4">ไม่พบประวัติการสั่งยาของผู้ป่วยรายนี้</p>
                ) : (
                  <div className={`rounded-lg border max-h-48 overflow-y-auto ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-200 bg-white'}`}>
                    {options.remedItems.map((item, idx) => (
                      <button key={idx} onClick={() => {
                        setMedications(prev => [...prev, {
                          id: item.productId || `remed-${idx}`,
                          name: item.name,
                          dosage: '',
                          qty: item.qty || '1',
                          unitPrice: item.price || '0',
                          unit: '',
                        }]);
                      }}
                        className={`w-full text-left px-3 py-2 text-xs border-b transition-all flex justify-between items-center ${isDark ? 'border-[#1a1a1a] hover:bg-[#1a1a1a]' : 'border-gray-100 hover:bg-gray-50'}`}>
                        <span className="font-bold">{item.name}</span>
                        <span className="text-[10px] text-gray-500">
                          x{item.qty} {item.price !== '0' && item.price !== '0.00' ? `฿${item.price}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Medication table */}
            {medications.length === 0 ? (
              <p className="text-[10px] text-gray-500 text-center py-4">ยังไม่มีรายการยากลับบ้าน — กด "ยากลับบ้าน" เพื่อค้นหาและเพิ่ม</p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-[9px] font-bold uppercase tracking-widest text-gray-500 px-1">
                  <div className="col-span-4">รายการ</div>
                  <div className="col-span-3">วิธีรับประทาน</div>
                  <div className="col-span-2">จำนวน</div>
                  <div className="col-span-2">ราคาต่อหน่วย</div>
                  <div className="col-span-1"></div>
                </div>
                {medications.map((med, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4 text-xs font-bold truncate px-1">{med.name}</div>
                    <input value={med.dosage} onChange={e => updateMed(i, 'dosage', e.target.value)} className={`${inputCls} col-span-3`} placeholder="วิธีรับประทาน" />
                    <input value={med.qty} onChange={e => updateMed(i, 'qty', e.target.value)} className={`${inputCls} col-span-2 text-center`} placeholder="0" />
                    <input value={med.unitPrice} onChange={e => updateMed(i, 'unitPrice', e.target.value)} className={`${inputCls} col-span-2 text-center`} placeholder="0" />
                    <button onClick={() => removeMed(i)} className="col-span-1 flex items-center justify-center text-red-400 hover:text-red-300 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </FormSection>

          {/* ── Course Usage + Treatment Items ────────────────────────────── */}
          <FormSection isDark={isDark}>
            <SectionHeader icon={ShoppingCart} title="ข้อมูลการใช้คอร์ส" isDark={isDark} accent="#f97316" />

            {customerCourses.length === 0 ? (
              <p className="text-[10px] text-gray-500 text-center py-4">ลูกค้าไม่มีคอร์สที่ใช้งานอยู่</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* LEFT: Course list with checkboxes */}
                <div className="lg:col-span-3">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-2">คอร์ส/สินค้า</p>
                  <div className={`rounded-lg border max-h-[400px] overflow-y-auto ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-100 bg-gray-50'}`}>
                    {/* Header */}
                    <div className={`grid grid-cols-12 gap-1 px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest border-b ${isDark ? 'text-gray-500 border-[#222]' : 'text-gray-500 border-gray-200'}`}>
                      <div className="col-span-1"></div>
                      <div className="col-span-7">คอร์ส</div>
                      <div className="col-span-4 text-right">จำนวน</div>
                    </div>
                    {customerCourses.map(course => (
                      <div key={course.courseId}>
                        {/* Course header */}
                        <div className={`grid grid-cols-12 gap-1 px-3 py-2 border-b ${isDark ? 'border-[#1a1a1a] bg-[#0d0d0d]' : 'border-gray-100 bg-gray-50/50'}`}>
                          <div className="col-span-1"></div>
                          <div className="col-span-7">
                            <span className="text-[11px] font-bold" style={{ color: '#f97316' }}>{course.courseName}</span>
                          </div>
                          <div className="col-span-4"></div>
                        </div>
                        {/* Products */}
                        {course.products.map(product => {
                          const isSelected = selectedCourseItems.has(product.rowId);
                          return (
                            <label key={product.rowId}
                              className={`grid grid-cols-12 gap-1 px-3 py-1.5 items-center cursor-pointer border-b transition-all ${
                                isSelected
                                  ? isDark ? 'bg-orange-500/10 border-orange-500/20' : 'bg-orange-50 border-orange-100'
                                  : isDark ? 'border-[#1a1a1a] hover:bg-[#151515]' : 'border-gray-50 hover:bg-gray-100/50'
                              }`}>
                              <div className="col-span-1 flex items-center">
                                <input type="checkbox" checked={isSelected} onChange={() => toggleCourseItem(product)}
                                  className="rounded border-gray-400 text-orange-500 focus:ring-orange-500" />
                              </div>
                              <div className="col-span-7">
                                <span className={`text-xs ${isSelected ? 'font-bold text-orange-400' : ''}`}>{product.name}</span>
                              </div>
                              <div className="col-span-4 text-right">
                                {product.remaining && (
                                  <span className="text-[10px] text-gray-500">{product.remaining} {product.unit}</span>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                {/* RIGHT: Treatment items panel (selected items) */}
                <div className="lg:col-span-2">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-2">รายการรักษา</p>
                  <div className={`rounded-lg border min-h-[120px] ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-100 bg-gray-50'}`}>
                    {/* Header */}
                    <div className={`grid grid-cols-12 gap-1 px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest border-b ${isDark ? 'text-gray-500 border-[#222]' : 'text-gray-500 border-gray-200'}`}>
                      <div className="col-span-6">รายการ</div>
                      <div className="col-span-3">จำนวน</div>
                      <div className="col-span-2">หน่วย</div>
                      <div className="col-span-1"></div>
                    </div>
                    {treatmentItems.length === 0 ? (
                      <p className="text-[10px] text-gray-500 text-center py-6">เลือกคอร์สด้านซ้ายเพื่อเพิ่มรายการ</p>
                    ) : (
                      treatmentItems.map(item => (
                        <div key={item.id} className={`grid grid-cols-12 gap-1 px-3 py-1.5 items-center border-b ${isDark ? 'border-[#1a1a1a]' : 'border-gray-50'}`}>
                          <div className="col-span-6 text-xs truncate">{item.name}</div>
                          <div className="col-span-3">
                            <input value={item.qty} onChange={e => updateTreatmentItem(item.id, 'qty', e.target.value)}
                              className={`${inputCls} text-center !py-1 !text-[10px]`} />
                          </div>
                          <div className="col-span-2 text-[10px] text-gray-500">{item.unit}</div>
                          <div className="col-span-1">
                            <button onClick={() => removeTreatmentItem(item.id)} className="text-red-400 hover:text-red-300">
                              <Trash2 size={10} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </FormSection>

          {/* ── Consumables (สินค้าสิ้นเปลือง) ────────────────────────────── */}
          <FormSection isDark={isDark}>
            <SectionHeader icon={Package} title="สินค้าสิ้นเปลือง" isDark={isDark} accent="#eab308">
              <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                <ActionBtn color="#3b82f6" isDark={isDark} onClick={openConsGroupModal}>
                  <Plus size={10} /> กลุ่มสินค้าสิ้นเปลือง
                </ActionBtn>
                <ActionBtn color="#eab308" isDark={isDark} onClick={openConsModal}>
                  <Plus size={10} /> สินค้าสิ้นเปลือง
                </ActionBtn>
              </div>
            </SectionHeader>

            {/* เพิ่มสินค้าสิ้นเปลือง modal — matching ProClinic */}
            {consModalOpen && (
              <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50" onClick={() => setConsModalOpen(false)}>
                <div className={`w-full max-w-md mx-4 rounded-xl shadow-2xl overflow-hidden ${isDark ? 'bg-[#0e0e0e] border border-[#222]' : 'bg-white'}`}
                  onClick={e => e.stopPropagation()}>
                  <div className={`px-5 py-3 border-b ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <h3 className="text-sm font-black" style={{ color: '#eab308' }}>เพิ่มสินค้าสิ้นเปลือง</h3>
                  </div>
                  <div className="px-5 py-4 space-y-3">
                    <div>
                      <label className={labelCls}>สินค้าสิ้นเปลือง *</label>
                      <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 z-10" />
                        <input value={consModalSelected ? consModalSelected.name : consModalQuery}
                          onChange={e => { setConsModalQuery(e.target.value); setConsModalSelected(null); }}
                          onFocus={() => { if (consModalSelected) { setConsModalQuery(consModalSelected.name); setConsModalSelected(null); } }}
                          className={`${inputCls} !pl-8`} placeholder="เลือกสินค้าสิ้นเปลือง" autoFocus />
                      </div>
                      {!consModalSelected && (
                        <div className={`rounded-lg border mt-1 max-h-40 overflow-y-auto ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-200 bg-white'}`}>
                          {consModalLoading ? (
                            <div className="flex items-center justify-center gap-2 py-4"><Loader2 size={14} className="animate-spin text-yellow-400" /><span className="text-xs text-gray-500">กำลังโหลด...</span></div>
                          ) : consFilteredProducts.length === 0 ? (
                            <p className="text-[10px] text-gray-500 text-center py-3">ไม่พบรายการ</p>
                          ) : consFilteredProducts.map(p => (
                            <button key={p.id} onClick={() => { setConsModalSelected(p); setConsModalQty('1'); }}
                              className={`w-full text-left px-3 py-2 text-xs border-b transition-all flex justify-between items-center ${isDark ? 'border-[#1a1a1a] hover:bg-[#1a1a1a]' : 'border-gray-100 hover:bg-gray-50'}`}>
                              <span className="font-bold">{p.name}</span>
                              <span className="text-[10px] text-gray-500">{p.unit}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className={labelCls}>จำนวน *</label>
                      <input type="number" value={consModalQty} onChange={e => setConsModalQty(e.target.value)}
                        className={inputCls} placeholder="กรอกจำนวน" />
                    </div>
                  </div>
                  <div className={`flex items-center justify-center gap-3 px-5 py-3 border-t ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <button onClick={() => setConsModalOpen(false)}
                      className={`px-6 py-2 rounded-lg text-xs font-bold border transition-all ${isDark ? 'border-[#333] text-gray-400 hover:bg-[#1a1a1a]' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
                      ยกเลิก
                    </button>
                    <button onClick={confirmConsModal} disabled={!consModalSelected}
                      className="px-6 py-2 rounded-lg text-xs font-bold text-white bg-yellow-500 hover:bg-yellow-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                      ยืนยัน
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Consumable group modal — full overlay matching ProClinic */}
            {consGroupModalOpen && (
              <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50" onClick={() => setConsGroupModalOpen(false)}>
                <div className={`w-full max-w-2xl mx-4 rounded-xl shadow-2xl overflow-hidden ${isDark ? 'bg-[#0e0e0e] border border-[#222]' : 'bg-white'}`}
                  onClick={e => e.stopPropagation()}>
                  {/* Header */}
                  <div className={`flex items-center justify-between px-5 py-3 border-b ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <h3 className="text-sm font-black" style={{ color: '#eab308' }}>เพิ่มสินค้าสิ้นเปลือง</h3>
                    <select value={consGroupSelectedId}
                      onChange={e => {
                        setConsGroupSelectedId(e.target.value);
                        const g = consGroupData.find(g => String(g.id) === e.target.value);
                        setConsGroupChecked(new Set((g?.products || []).map((_, i) => i)));
                      }}
                      className={`${selectCls} !w-auto !text-xs min-w-[180px]`}>
                      {consGroupData.map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
                    </select>
                  </div>
                  {/* Table */}
                  <div className="px-5 py-3 max-h-[50vh] overflow-y-auto">
                    {consGroupLoading ? (
                      <div className="flex items-center justify-center gap-2 py-8"><Loader2 size={16} className="animate-spin text-yellow-400" /><span className="text-xs text-gray-500">กำลังโหลดกลุ่มสินค้า...</span></div>
                    ) : selectedConsGroupProducts.length === 0 ? (
                      <p className="text-xs text-gray-500 text-center py-8">กรุณาเลือกกลุ่มสินค้าสิ้นเปลือง</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                            <th className="text-left py-1.5 pr-2 w-8"></th>
                            <th className="text-left py-1.5">รายการ ({selectedConsGroupProducts.length} รายการ)</th>
                            <th className="text-center py-1.5 w-16">จำนวน</th>
                            <th className="text-center py-1.5 w-12">หน่วย</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedConsGroupProducts.map((p, i) => (
                            <tr key={p.id} className={`border-t ${isDark ? 'border-[#1a1a1a]' : 'border-gray-100'}`}>
                              <td className="py-2 pr-2">
                                <input type="checkbox" checked={consGroupChecked.has(i)} onChange={() => toggleConsGroupCheck(i)}
                                  className="w-3.5 h-3.5 rounded accent-yellow-500" />
                              </td>
                              <td className="py-2 font-medium">{p.name}</td>
                              <td className="py-2 text-center">{parseFloat(p.qty) || 1}</td>
                              <td className="py-2 text-center text-gray-500">{p.unit}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  {/* Selected items chips */}
                  {consGroupChecked.size > 0 && (
                    <div className={`px-5 py-2 border-t ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-100 bg-gray-50'}`}>
                      <p className="text-[10px] font-bold text-gray-500 mb-1.5">รายการที่เลือก ({consGroupChecked.size} รายการ)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedConsGroupProducts.map((p, i) => consGroupChecked.has(i) && (
                          <span key={i} className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">
                            {p.name} ({parseFloat(p.qty)} {p.unit})
                            <button onClick={() => toggleConsGroupCheck(i)} className="hover:text-red-400 ml-0.5">&times;</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Footer buttons */}
                  <div className={`flex items-center justify-center gap-3 px-5 py-3 border-t ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <button onClick={() => setConsGroupModalOpen(false)}
                      className={`px-6 py-2 rounded-lg text-xs font-bold border transition-all ${isDark ? 'border-[#333] text-gray-400 hover:bg-[#1a1a1a]' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
                      ยกเลิก
                    </button>
                    <button onClick={confirmConsGroup} disabled={consGroupChecked.size === 0}
                      className="px-6 py-2 rounded-lg text-xs font-bold text-white bg-yellow-500 hover:bg-yellow-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                      ยืนยัน
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Consumable table */}
            {consumables.length === 0 ? (
              <p className="text-[10px] text-gray-500 text-center py-4">ยังไม่มีรายการสินค้าสิ้นเปลือง — กด "สินค้าสิ้นเปลือง" เพื่อค้นหาและเพิ่ม</p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-[9px] font-bold uppercase tracking-widest text-gray-500 px-1">
                  <div className="col-span-6">รายการ</div>
                  <div className="col-span-3">จำนวน</div>
                  <div className="col-span-2">หน่วย</div>
                  <div className="col-span-1"></div>
                </div>
                {consumables.map((item, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-6 text-xs font-bold truncate px-1">{item.name}</div>
                    <input value={item.qty} onChange={e => updateConsumable(i, 'qty', e.target.value)} className={`${inputCls} col-span-3 text-center`} placeholder="1" />
                    <div className="col-span-2 text-[10px] text-gray-500 px-1">{item.unit}</div>
                    <button onClick={() => removeConsumable(i)} className="col-span-1 flex items-center justify-center text-red-400 hover:text-red-300 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </FormSection>

          {/* ── Insurance Claims ───────────────────────────────────────────── */}
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

          {/* ── Payment ────────────────────────────────────────────────────── */}
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
              <textarea value={saleNote} onChange={e => setSaleNote(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="หมายเหตุ" />
            </div>
          </FormSection>

          {/* Submit (bottom) */}
          <div className="flex justify-end gap-3 pt-2 pb-8">
            <button onClick={onClose} disabled={saving}
              className={`px-6 py-2.5 rounded-xl text-xs font-bold border transition-all ${isDark ? 'border-[#333] text-gray-400 hover:bg-[#1a1a1a]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              ยกเลิก
            </button>
            <button onClick={handleSubmit} disabled={saving}
              className="px-8 py-2.5 rounded-xl text-sm font-black bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50 transition-all flex items-center gap-2 shadow-lg shadow-purple-600/20">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {saving ? 'กำลังบันทึก...' : isEdit ? 'บันทึกการแก้ไข' : 'ยืนยันการรักษา'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
