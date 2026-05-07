import { useState, useRef } from 'react';
import { setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { ArrowLeft, Settings, Type, ImageIcon, Upload, Link, Trash2, Palette, Check, Moon, Save, MessageCircle, Phone, Timer, Stethoscope, FileText } from 'lucide-react';
import { DEFAULT_CLINIC_SETTINGS, PRESET_COLORS } from '../constants.js';
import { hexToRgb, applyThemeColor } from '../utils.js';
import { THEMES } from '../hooks/useTheme.js';
// V50 (2026-05-08) — ProClinic strip. brokerClient import REMOVED.
// Sync UI sections (Practitioners + Rooms classify + Master Data Sync +
// ProClinic Integration credentials) deleted; admin manages those entities
// via dedicated be_* CRUD tabs (`?tab=doctors`, `?tab=staff`, `?tab=exam-rooms`).

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

function TimeSelect24({ value, onChange, focusColor }) {
  const [hh, mm] = (value || '10:00').split(':');
  const selCls = `bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-heading)] rounded-lg px-2 py-2.5 outline-none transition-all text-sm font-mono cursor-pointer ${focusColor || 'focus:border-[var(--accent)]'}`;
  return (
    <div className="flex items-center gap-0.5">
      <select value={hh} onChange={e => onChange(`${e.target.value}:${mm}`)} className={`${selCls} w-[60px] text-center rounded-r-none`}>
        {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="text-gray-500 font-mono text-sm font-bold">:</span>
      <select value={MINUTES.includes(mm) ? mm : '00'} onChange={e => onChange(`${hh}:${e.target.value}`)} className={`${selCls} w-[56px] text-center rounded-l-none`}>
        {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
    </div>
  );
}

export default function ClinicSettingsPanel({ db, appId, clinicSettings, onBack, theme, setTheme }) {
  const [settings, setSettings] = useState({ ...DEFAULT_CLINIC_SETTINGS, ...clinicSettings });
  const initialCooldownRef = useRef(clinicSettings?.patientSyncCooldownMins ?? DEFAULT_CLINIC_SETTINGS.patientSyncCooldownMins);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [logoPreview, setLogoPreview] = useState(settings.logoUrl || '');
  const [logoTab, setLogoTab] = useState('upload');
  const [logoPreviewLight, setLogoPreviewLight] = useState(settings.logoUrlLight || '');
  const [logoTabLight, setLogoTabLight] = useState('upload');
  const fileInputRef = useRef(null);
  const fileInputRefLight = useRef(null);
  // V50 (2026-05-08) — testingConnection / clearingSession / practitioners /
  // rooms / syncStatus / syncResults state REMOVED (sections deleted).
  // practitioners + rooms data was historical classification of ProClinic
  // users/rooms; consumers now read be_doctors.position + be_exam_rooms.kind
  // (Phase 18.0) directly. Legacy `clinic_settings.practitioners` +
  // `clinic_settings.rooms` fields preserved on disk for back-compat but
  // never written by V50+.

  const handleColorChange = (hex) => {
    setSettings(prev => ({ ...prev, accentColor: hex }));
    applyThemeColor(hex);
  };

  const handleLogoFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      alert('ไฟล์ใหญ่เกินไป กรุณาเลือกไฟล์ขนาดไม่เกิน 500KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target.result;
      setLogoPreview(base64);
      setSettings(prev => ({ ...prev, logoUrl: base64 }));
    };
    reader.readAsDataURL(file);
  };

  const handleLogoUrlChange = (url) => {
    setLogoPreview(url);
    setSettings(prev => ({ ...prev, logoUrl: url }));
  };

  const handleRemoveLogo = () => {
    setLogoPreview('');
    setSettings(prev => ({ ...prev, logoUrl: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleLogoFileLight = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) { alert('ไฟล์ใหญ่เกินไป กรุณาเลือกไฟล์ขนาดไม่เกิน 500KB'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setLogoPreviewLight(ev.target.result);
      setSettings(prev => ({ ...prev, logoUrlLight: ev.target.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleLogoUrlLightChange = (url) => {
    setLogoPreviewLight(url);
    setSettings(prev => ({ ...prev, logoUrlLight: url }));
  };

  const handleRemoveLogoLight = () => {
    setLogoPreviewLight('');
    setSettings(prev => ({ ...prev, logoUrlLight: '' }));
    if (fileInputRefLight.current) fileInputRefLight.current.value = '';
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMsg('');
    const newCooldown = Math.max(0, Math.min(99999, parseInt(settings.patientSyncCooldownMins, 10) || 0));
    const cooldownChanged = newCooldown !== initialCooldownRef.current;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clinic_settings', 'main'), {
        clinicName: settings.clinicName.trim() || DEFAULT_CLINIC_SETTINGS.clinicName,
        // Phase 14.2 — clinic info for document templates
        clinicNameEn: settings.clinicNameEn?.trim() || '',
        clinicAddress: settings.clinicAddress?.trim() || '',
        clinicAddressEn: settings.clinicAddressEn?.trim() || '',
        clinicLicenseNo: settings.clinicLicenseNo?.trim() || '',
        clinicTaxId: settings.clinicTaxId?.trim() || '',
        clinicEmail: settings.clinicEmail?.trim() || '',
        clinicSubtitle: settings.clinicSubtitle.trim(),
        logoUrl: settings.logoUrl,
        logoUrlLight: settings.logoUrlLight || '',
        accentColor: settings.accentColor,
        lineOfficialUrl: settings.lineOfficialUrl?.trim() || '',
        clinicPhone: settings.clinicPhone?.trim() || '',
        patientSyncCooldownMins: newCooldown,
        clinicOpenTime: settings.clinicOpenTime || DEFAULT_CLINIC_SETTINGS.clinicOpenTime,
        clinicCloseTime: settings.clinicCloseTime || DEFAULT_CLINIC_SETTINGS.clinicCloseTime,
        clinicOpenTimeWeekend: settings.clinicOpenTimeWeekend || DEFAULT_CLINIC_SETTINGS.clinicOpenTimeWeekend,
        clinicCloseTimeWeekend: settings.clinicCloseTimeWeekend || DEFAULT_CLINIC_SETTINGS.clinicCloseTimeWeekend,
        doctorStartTime: settings.doctorStartTime || DEFAULT_CLINIC_SETTINGS.doctorStartTime,
        doctorEndTime: settings.doctorEndTime || DEFAULT_CLINIC_SETTINGS.doctorEndTime,
        doctorStartTimeWeekend: settings.doctorStartTimeWeekend || DEFAULT_CLINIC_SETTINGS.doctorStartTimeWeekend,
        doctorEndTimeWeekend: settings.doctorEndTimeWeekend || DEFAULT_CLINIC_SETTINGS.doctorEndTimeWeekend,
        chatAlwaysOn: !!settings.chatAlwaysOn,
        chatOpenTime: settings.chatOpenTime || DEFAULT_CLINIC_SETTINGS.chatOpenTime,
        chatCloseTime: settings.chatCloseTime || DEFAULT_CLINIC_SETTINGS.chatCloseTime,
        chatOpenTimeWeekend: settings.chatOpenTimeWeekend || DEFAULT_CLINIC_SETTINGS.chatOpenTimeWeekend,
        chatCloseTimeWeekend: settings.chatCloseTimeWeekend || DEFAULT_CLINIC_SETTINGS.chatCloseTimeWeekend,
        // V50 (2026-05-08) — practitioners + rooms removed (sections deleted).
        // Existing field values preserved on disk for back-compat; new
        // saves no longer overwrite them.
        updatedAt: serverTimestamp(),
      });
      // cooldown เปลี่ยน → clear lastCoursesAutoFetch จากทุก session เพื่อรีเซ็ตนับเวลาใหม่
      if (cooldownChanged) {
        const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'opd_sessions'));
        const batches = [];
        let batch = writeBatch(db);
        let count = 0;
        snap.forEach(d => {
          if (d.data().lastCoursesAutoFetch) {
            batch.update(d.ref, { lastCoursesAutoFetch: null });
            count++;
            if (count % 400 === 0) { batches.push(batch); batch = writeBatch(db); }
          }
        });
        if (count % 400 !== 0) batches.push(batch);
        await Promise.all(batches.map(b => b.commit()));
        initialCooldownRef.current = newCooldown;
      }
      setSaveMsg('บันทึกสำเร็จ!' + (cooldownChanged ? ' รีเซ็ต cooldown ทุก session แล้ว' : ''));
      setTimeout(() => setSaveMsg(''), 4000);
    } catch (err) {
      console.error(err);
      setSaveMsg('เกิดข้อผิดพลาด ไม่สามารถบันทึกได้');
    } finally {
      setIsSaving(false);
    }
  };

  const ac = settings.accentColor || '#dc2626';
  const acRgb = hexToRgb(ac);

  // V50 (2026-05-08) — masterDataSyncCard IIFE removed (entire ProClinic
  // sync UI block deleted). All master data is now CRUD'd via dedicated
  // be_* tabs (`?tab=products`, `?tab=courses`, `?tab=doctors`, `?tab=staff`,
  // etc.) — Rule H: be_* canonical, no ProClinic mirror needed.

  return (
    <div className="w-full max-w-3xl mx-auto animate-in fade-in duration-300">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} aria-label="ย้อนกลับ" className="p-2.5 bg-[var(--bg-hover)] hover:bg-[var(--bg-base)] border border-[var(--bd-strong)] text-[var(--tx-muted)] hover:text-[var(--tx-heading)] rounded-lg transition-colors"><ArrowLeft size={18}/></button>
        <div>
          <h2 className="text-base sm:text-lg font-black text-[var(--tx-heading)] uppercase tracking-widest flex items-center gap-2"><Settings size={20} style={{color: ac}}/> ตั้งค่าระบบ</h2>
          <p className="text-xs text-gray-500 tracking-wider">Clinic Branding & Customization</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Clinic Name */}
        <div className="bg-[var(--bg-card)] p-4 sm:p-6 rounded-2xl border border-[var(--bd)]">
          <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Type size={14} style={{color: ac}}/> ชื่อองค์กร</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">ชื่อองค์กร (Organization Name)</label>
              <input type="text" value={settings.clinicName} onChange={e => setSettings(prev => ({...prev, clinicName: e.target.value}))} placeholder="เช่น Lover Clinic" className="w-full bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-heading)] rounded-lg px-4 py-3 outline-none focus:border-[var(--accent)] transition-all text-lg font-bold" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">คำอธิบายเพิ่มเติม (Subtitle - optional)</label>
              <input type="text" value={settings.clinicSubtitle} onChange={e => setSettings(prev => ({...prev, clinicSubtitle: e.target.value}))} placeholder="เช่น Men's Health Center" className="w-full bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-heading)] rounded-lg px-4 py-3 outline-none focus:border-[var(--accent)] transition-all text-sm" />
            </div>
          </div>
        </div>

        {/* Logo — Dark Theme */}
        <div className="bg-[var(--bg-card)] p-4 sm:p-6 rounded-2xl border border-[var(--bd)]">
          <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-2"><ImageIcon size={14} style={{color: ac}}/> โลโก้ธีมมืด (Dark Theme Logo)</h3>
          <p className="text-[11px] text-gray-600 mb-4">ใช้เวอร์ชัน <span className="text-[var(--tx-heading)] font-bold">ตัวอักษรสีขาว / โปร่งใส</span> — แสดงบนพื้นหลังสีเข้ม</p>

          <div className="flex gap-2 mb-4">
            <button onClick={() => setLogoTab('upload')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${logoTab === 'upload' ? 'text-white' : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-gray-500 hover:text-[var(--tx-heading)]'}`} style={logoTab === 'upload' ? {backgroundColor: ac, color: '#fff'} : {}}>
              <span className="flex items-center gap-1.5"><Upload size={12}/> อัพโหลดไฟล์</span>
            </button>
            <button onClick={() => setLogoTab('url')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${logoTab === 'url' ? 'text-white' : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-gray-500 hover:text-[var(--tx-heading)]'}`} style={logoTab === 'url' ? {backgroundColor: ac, color: '#fff'} : {}}>
              <span className="flex items-center gap-1.5"><Link size={12}/> ใส่ URL</span>
            </button>
          </div>
          {logoTab === 'upload' ? (
            <div>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={handleLogoFile} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} className="w-full bg-[var(--bg-hover)] hover:bg-[var(--bg-base)] border-2 border-dashed border-[var(--bd-strong)] hover:border-[var(--accent)] text-[var(--tx-muted)] hover:text-[var(--tx-heading)] py-8 rounded-xl transition-all flex flex-col items-center gap-2">
                <Upload size={24}/><span className="text-xs font-bold uppercase tracking-wider">คลิกเพื่อเลือกไฟล์ (PNG, JPG, SVG, max 500KB)</span>
              </button>
            </div>
          ) : (
            <input type="text" value={settings.logoUrl.startsWith('data:') ? '' : settings.logoUrl} onChange={e => handleLogoUrlChange(e.target.value)} placeholder="https://example.com/logo-dark.png" className="w-full bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-heading)] rounded-lg px-4 py-3 outline-none focus:border-[var(--accent)] transition-all text-sm font-mono" />
          )}
          {logoPreview && (
            <div className="mt-4 flex items-center gap-4">
              <div className="bg-[var(--bg-hover)] p-4 rounded-xl border border-[var(--bd-strong)] flex items-center justify-center" style={{minWidth: '120px', minHeight: '80px'}}>
                <img src={logoPreview} alt="Preview Dark" className="max-h-20 max-w-[200px] object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
              </div>
              <button onClick={handleRemoveLogo} className="p-2 bg-red-950/30 hover:bg-red-900/50 text-red-500 rounded-lg border border-red-900/50 transition-colors" title="ลบโลโก้"><Trash2 size={16}/></button>
            </div>
          )}
        </div>

        {/* Logo — Light Theme */}
        <div className="bg-[var(--bg-card)] p-4 sm:p-6 rounded-2xl border border-[var(--bd)]">
          <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-2"><ImageIcon size={14} style={{color:'#f59e0b'}}/> โลโก้ธีมสว่าง (Light Theme Logo)</h3>
          <p className="text-[11px] text-gray-600 mb-4">ใช้เวอร์ชัน <span className="text-[var(--tx-heading)] font-bold">ตัวอักษรสีดำ</span> — แสดงบนพื้นหลังสีขาว / สว่าง (ถ้าไม่มีจะใช้โลโก้ธีมมืดแทนพร้อม filter อัตโนมัติ)</p>

          <div className="flex gap-2 mb-4">
            <button onClick={() => setLogoTabLight('upload')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${logoTabLight === 'upload' ? 'text-white' : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-gray-500 hover:text-[var(--tx-heading)]'}`} style={logoTabLight === 'upload' ? {backgroundColor: '#f59e0b', color: '#000'} : {}}>
              <span className="flex items-center gap-1.5"><Upload size={12}/> อัพโหลดไฟล์</span>
            </button>
            <button onClick={() => setLogoTabLight('url')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${logoTabLight === 'url' ? 'text-white' : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-gray-500 hover:text-[var(--tx-heading)]'}`} style={logoTabLight === 'url' ? {backgroundColor: '#f59e0b', color: '#000'} : {}}>
              <span className="flex items-center gap-1.5"><Link size={12}/> ใส่ URL</span>
            </button>
          </div>
          {logoTabLight === 'upload' ? (
            <div>
              <input ref={fileInputRefLight} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={handleLogoFileLight} className="hidden" />
              <button onClick={() => fileInputRefLight.current?.click()} className="w-full bg-[var(--bg-hover)] hover:bg-[var(--bg-base)] border-2 border-dashed border-[var(--bd-strong)] hover:border-orange-600 text-[var(--tx-muted)] hover:text-[var(--tx-heading)] py-8 rounded-xl transition-all flex flex-col items-center gap-2">
                <Upload size={24}/><span className="text-xs font-bold uppercase tracking-wider">คลิกเพื่อเลือกไฟล์ (PNG, JPG, SVG, max 500KB)</span>
              </button>
            </div>
          ) : (
            <input type="text" value={(settings.logoUrlLight || '').startsWith('data:') ? '' : (settings.logoUrlLight || '')} onChange={e => handleLogoUrlLightChange(e.target.value)} placeholder="https://example.com/logo-light.png" className="w-full bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-heading)] rounded-lg px-4 py-3 outline-none focus:border-orange-600 transition-all text-sm font-mono" />
          )}
          {logoPreviewLight && (
            <div className="mt-4 flex items-center gap-4">
              <div className="bg-white p-4 rounded-xl border border-[var(--bd-strong)] flex items-center justify-center" style={{minWidth: '120px', minHeight: '80px'}}>
                <img src={logoPreviewLight} alt="Preview Light" className="max-h-20 max-w-[200px] object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
              </div>
              <button onClick={handleRemoveLogoLight} className="p-2 bg-red-950/30 hover:bg-red-900/50 text-red-500 rounded-lg border border-red-900/50 transition-colors" title="ลบโลโก้"><Trash2 size={16}/></button>
            </div>
          )}
        </div>

        {/* Theme Color */}
        <div className="bg-[var(--bg-card)] p-4 sm:p-6 rounded-2xl border border-[var(--bd)]">
          <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Palette size={14} style={{color: ac}}/> สีธีมหลัก (Accent Color)</h3>

          <div className="grid grid-cols-5 sm:grid-cols-10 gap-3 mb-4">
            {PRESET_COLORS.map(c => (
              <button key={c.hex} onClick={() => handleColorChange(c.hex)} className={`w-10 h-10 rounded-xl border-2 transition-all hover:scale-110 flex items-center justify-center ${settings.accentColor === c.hex ? 'border-white shadow-lg scale-110' : 'border-transparent'}`} style={{backgroundColor: c.hex}} title={c.name}>
                {settings.accentColor === c.hex && <Check size={16} className="text-white drop-shadow-md"/>}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider shrink-0">กำหนดเอง:</label>
            <input type="color" value={settings.accentColor} onChange={e => handleColorChange(e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border border-[var(--bd-strong)]" />
            <input type="text" value={settings.accentColor} onChange={e => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) handleColorChange(e.target.value); setSettings(prev => ({...prev, accentColor: e.target.value})); }} className="w-28 bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-heading)] rounded-lg px-3 py-2 outline-none font-mono text-sm" placeholder="#dc2626" />
          </div>

          {/* Preview */}
          <div className="mt-6 p-4 bg-[var(--bg-hover)] rounded-xl border border-[var(--bd)]">
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-3 font-bold">ตัวอย่าง (Preview)</p>
            <div className="flex flex-wrap items-center gap-3">
              <button className="px-4 py-2 rounded-lg text-white font-bold text-sm" style={{backgroundColor: ac, color: '#fff'}}>ปุ่มหลัก</button>
              <button className="px-4 py-2 rounded-lg font-bold text-sm border" style={{borderColor: ac, color: ac, backgroundColor: `rgba(${acRgb},0.1)`}}>ปุ่มรอง</button>
              <span className="font-bold text-sm" style={{color: ac}}>{settings.clinicName || 'ชื่อองค์กร'}</span>
              <div className="w-3 h-3 rounded-full" style={{backgroundColor: ac, boxShadow: `0 0 10px rgba(${acRgb},0.6)`}}></div>
            </div>
          </div>
        </div>

        {/* Dark / Light / Auto Theme */}
        <div className="bg-[var(--bg-card)] p-4 sm:p-6 rounded-2xl border border-[var(--bd)]">
          <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Moon size={14} style={{color: ac}}/> โหมดแสดงผล (Display Theme)
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {THEMES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTheme && setTheme(value)}
                className={`flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all ${
                  theme === value
                    ? 'border-[var(--accent,#dc2626)]'
                    : 'border-[var(--bd-strong)] bg-[var(--bg-hover)] hover:border-[var(--bd)]'
                }`}
                style={theme === value ? {borderColor: ac, backgroundColor: `rgba(${acRgb},0.08)`} : {}}
              >
                <Icon size={24} style={theme === value ? {color: ac} : {}} className={theme !== value ? 'text-gray-500' : ''} />
                <span className={`text-xs font-black uppercase tracking-widest ${theme === value ? '' : 'text-gray-500'}`} style={theme === value ? {color: ac} : {}}>{label}</span>
                <span className="text-xs text-gray-600 text-center leading-relaxed">
                  {value === 'dark' && 'เข้ม (ค่าเริ่มต้น)'}
                  {value === 'light' && 'สว่าง สบายตา'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* LINE Official Account */}
        <div className="bg-[var(--bg-card)] p-4 sm:p-6 rounded-2xl border border-[var(--bd)]">
          <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-2">
            <MessageCircle size={14} style={{color:'#06C755'}}/> LINE Official Account
          </h3>
          <p className="text-[11px] text-gray-600 mb-4">ลิ้งค์ที่จะแสดงให้ผู้ป่วยกด Add Friend หลังกรอกข้อมูลสำเร็จ</p>
          <input
            type="text"
            value={settings.lineOfficialUrl || ''}
            onChange={e => setSettings(prev => ({ ...prev, lineOfficialUrl: e.target.value }))}
            placeholder="https://lin.ee/xxxxxxx"
            className="w-full bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-heading)] rounded-lg px-4 py-3 outline-none focus:border-[#06C755] transition-all text-sm font-mono"
          />
          {settings.lineOfficialUrl && (
            <a href={settings.lineOfficialUrl} target="_blank" rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-[#06C755] hover:underline">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#06C755"><path d="M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/></svg>
              ทดสอบลิ้งค์
            </a>
          )}
        </div>

        {/* Clinic Phone */}
        <div className="bg-[var(--bg-card)] p-4 sm:p-6 rounded-2xl border border-[var(--bd)]">
          <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-2">
            <Phone size={14} style={{color: ac}}/> เบอร์โทรคลินิก (Clinic Phone)
          </h3>
          <p className="text-[11px] text-gray-600 mb-4">เบอร์โทรที่จะแสดงให้ผู้ป่วยกดโทรได้จากหน้าข้อมูลผู้ป่วย</p>
          <input
            type="tel"
            value={settings.clinicPhone || ''}
            onChange={e => setSettings(prev => ({ ...prev, clinicPhone: e.target.value }))}
            placeholder="02-xxx-xxxx หรือ 08x-xxx-xxxx"
            className="w-full bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-heading)] rounded-lg px-4 py-3 outline-none focus:border-[var(--accent)] transition-all text-sm font-mono"
          />
        </div>

        {/* Phase 14.2 — Clinic info for document templates (medical-cert / fit-to-fly / referral / etc.) */}
        <div className="bg-[var(--bg-card)] p-4 sm:p-6 rounded-2xl border border-[var(--bd)]">
          <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-2">
            <FileText size={14} style={{color: ac}}/> ข้อมูลคลินิก (สำหรับใบรับรองแพทย์/เอกสาร)
          </h3>
          <p className="text-[11px] text-gray-600 mb-4">
            ข้อมูลเหล่านี้ปรากฏบนเอกสารที่พิมพ์ออกมา (ใบรับรองแพทย์ / ฉลากยา / Fit-to-fly / ใบส่งตัว ฯลฯ).
            ฟิลด์ภาษาอังกฤษใช้กับเอกสารแบบ bilingual.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-gray-600 mb-1">ชื่อคลินิกภาษาอังกฤษ (Clinic Name EN)</label>
              <input type="text"
                value={settings.clinicNameEn || ''}
                onChange={e => setSettings(prev => ({ ...prev, clinicNameEn: e.target.value }))}
                placeholder="e.g. Lover Clinic"
                className="w-full bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-heading)] rounded-lg px-4 py-3 outline-none focus:border-[var(--accent)] transition-all text-sm" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-600 mb-1">เลขที่ใบอนุญาตประกอบกิจการสถานพยาบาล</label>
              <input type="text"
                value={settings.clinicLicenseNo || ''}
                onChange={e => setSettings(prev => ({ ...prev, clinicLicenseNo: e.target.value }))}
                placeholder="เช่น 11102000xxx"
                className="w-full bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-heading)] rounded-lg px-4 py-3 outline-none focus:border-[var(--accent)] transition-all text-sm font-mono" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-600 mb-1">เลขประจำตัวผู้เสียภาษี</label>
              <input type="text"
                value={settings.clinicTaxId || ''}
                onChange={e => setSettings(prev => ({ ...prev, clinicTaxId: e.target.value }))}
                placeholder="เช่น 0xxxxxxxxxxxxx"
                className="w-full bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-heading)] rounded-lg px-4 py-3 outline-none focus:border-[var(--accent)] transition-all text-sm font-mono" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] text-gray-600 mb-1">ที่อยู่คลินิก (Address TH)</label>
              <textarea
                value={settings.clinicAddress || ''}
                onChange={e => setSettings(prev => ({ ...prev, clinicAddress: e.target.value }))}
                placeholder="เลขที่ ซอย ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด รหัสไปรษณีย์"
                rows={2}
                className="w-full bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-heading)] rounded-lg px-4 py-3 outline-none focus:border-[var(--accent)] transition-all text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] text-gray-600 mb-1">Address (English)</label>
              <textarea
                value={settings.clinicAddressEn || ''}
                onChange={e => setSettings(prev => ({ ...prev, clinicAddressEn: e.target.value }))}
                placeholder="No., Soi, Road, Sub-district, District, Province, Postal code"
                rows={2}
                className="w-full bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-heading)] rounded-lg px-4 py-3 outline-none focus:border-[var(--accent)] transition-all text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] text-gray-600 mb-1">อีเมลคลินิก (Clinic Email — สำหรับเอกสารและการติดต่อ)</label>
              <input type="email"
                value={settings.clinicEmail || ''}
                onChange={e => setSettings(prev => ({ ...prev, clinicEmail: e.target.value }))}
                placeholder="info@clinic.com"
                className="w-full bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-heading)] rounded-lg px-4 py-3 outline-none focus:border-[var(--accent)] transition-all text-sm font-mono" />
            </div>
          </div>
        </div>

        {/* Patient Sync Cooldown */}
        <div className="bg-[var(--bg-card)] p-4 sm:p-6 rounded-2xl border border-[var(--bd)]">
          <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-2">
            <Timer size={14} style={{color: ac}}/> Patient Sync Cooldown
          </h3>
          <p className="text-[11px] text-gray-600 mb-4">
            จำกัดให้ลูกค้า sync ข้อมูลคอร์สได้กี่ครั้งต่อชั่วโมง —&nbsp;
            <span className="text-[var(--tx-heading)] font-bold">0 = ไม่จำกัด</span>,&nbsp;
            1–99999 = นาทีต่อครั้ง (เช่น 60 = ชั่วโมงละครั้ง)<br/>
            <span className="text-orange-600">การเปลี่ยนค่านี้จะรีเซ็ต cooldown ของทุก session ทันที</span>
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="0"
              max="99999"
              step="1"
              value={settings.patientSyncCooldownMins ?? 60}
              onChange={e => setSettings(prev => ({ ...prev, patientSyncCooldownMins: Math.max(0, Math.min(99999, parseInt(e.target.value, 10) || 0)) }))}
              className="w-32 bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-heading)] rounded-lg px-4 py-3 outline-none focus:border-[var(--accent)] transition-all text-lg font-mono font-bold text-center"
            />
            <span className="text-sm text-gray-500">นาที</span>
            <span className="text-xs text-gray-600">
              {(settings.patientSyncCooldownMins ?? 60) === 0
                ? '(ไม่จำกัด)'
                : `(${settings.patientSyncCooldownMins ?? 60} นาทีต่อครั้ง)`}
            </span>
          </div>
        </div>

        {/* Clinic Hours */}
        <div className="bg-[var(--bg-card)] p-4 sm:p-6 rounded-2xl border border-[var(--bd)]">
          <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-2">
            <Timer size={14} style={{color: ac}}/> เวลาเปิด-ปิดคลินิก
          </h3>
          <p className="text-[11px] text-gray-600 mb-4">
            ใช้สำหรับคำนวณช่องเวลาว่างในตารางนัดหมายสาธารณะ (ระบบ 24 ชม.)
          </p>
          <div className="space-y-3" lang="en-GB">
            <div>
              <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">จ–ศ (วันธรรมดา)</span>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">เปิด</span>
                  <TimeSelect24 value={settings.clinicOpenTime} onChange={v => setSettings(prev => ({ ...prev, clinicOpenTime: v }))} />
                </div>
                <span className="text-gray-600">—</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">ปิด</span>
                  <TimeSelect24 value={settings.clinicCloseTime} onChange={v => setSettings(prev => ({ ...prev, clinicCloseTime: v }))} />
                </div>
              </div>
            </div>
            <div>
              <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">ส–อา (เสาร์-อาทิตย์)</span>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">เปิด</span>
                  <TimeSelect24 value={settings.clinicOpenTimeWeekend} onChange={v => setSettings(prev => ({ ...prev, clinicOpenTimeWeekend: v }))} />
                </div>
                <span className="text-gray-600">—</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">ปิด</span>
                  <TimeSelect24 value={settings.clinicCloseTimeWeekend} onChange={v => setSettings(prev => ({ ...prev, clinicCloseTimeWeekend: v }))} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Chat System Schedule */}
        <div className="bg-[var(--bg-card)] p-4 sm:p-6 rounded-2xl border border-[var(--bd)]">
          <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-2">
            <MessageCircle size={14} style={{color: '#3b82f6'}}/> เวลาทำการระบบแชท
          </h3>
          <p className="text-[11px] text-gray-600 mb-4">
            นอกเวลาทำการ ระบบแชทจะหยุดรับข้อความและไม่มีเสียงเตือน
          </p>
          <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
            <input type="checkbox" checked={!!settings.chatAlwaysOn} onChange={e => setSettings(prev => ({ ...prev, chatAlwaysOn: e.target.checked }))}
              className="w-4 h-4 rounded accent-blue-500" />
            <span className="text-xs font-bold text-[var(--tx-heading)]">เปิดตลอด 24 ชม. (Always On)</span>
          </label>
          {!settings.chatAlwaysOn && (
            <div className="space-y-3" lang="en-GB">
              <div>
                <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">จ–ศ (วันธรรมดา)</span>
                <div className="flex items-center gap-3 mt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">เปิด</span>
                    <TimeSelect24 value={settings.chatOpenTime} onChange={v => setSettings(prev => ({ ...prev, chatOpenTime: v }))} focusColor="focus:border-blue-500" />
                  </div>
                  <span className="text-gray-600">—</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">ปิด</span>
                    <TimeSelect24 value={settings.chatCloseTime} onChange={v => setSettings(prev => ({ ...prev, chatCloseTime: v }))} focusColor="focus:border-blue-500" />
                  </div>
                </div>
              </div>
              <div>
                <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">ส–อา (เสาร์-อาทิตย์)</span>
                <div className="flex items-center gap-3 mt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">เปิด</span>
                    <TimeSelect24 value={settings.chatOpenTimeWeekend} onChange={v => setSettings(prev => ({ ...prev, chatOpenTimeWeekend: v }))} focusColor="focus:border-blue-500" />
                  </div>
                  <span className="text-gray-600">—</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">ปิด</span>
                    <TimeSelect24 value={settings.chatCloseTimeWeekend} onChange={v => setSettings(prev => ({ ...prev, chatCloseTimeWeekend: v }))} focusColor="focus:border-blue-500" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Doctor Hours */}
        <div className="bg-[var(--bg-card)] p-4 sm:p-6 rounded-2xl border border-[var(--bd)]">
          <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-2">
            <Stethoscope size={14} style={{color: '#38bdf8'}}/> เวลาแพทย์เข้า
          </h3>
          <p className="text-[11px] text-gray-600 mb-4">
            เวลาที่แพทย์เข้าตรวจ — ผูกกับวันที่กำหนดให้หมอเข้า ลิงก์แบบ "พบแพทย์" จะแสดงเฉพาะช่วงเวลานี้เป็นว่าง
          </p>
          <div className="space-y-3" lang="en-GB">
            <div>
              <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">จ–ศ (วันธรรมดา)</span>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">เริ่ม</span>
                  <TimeSelect24 value={settings.doctorStartTime} onChange={v => setSettings(prev => ({ ...prev, doctorStartTime: v }))} focusColor="focus:border-sky-500" />
                </div>
                <span className="text-gray-600">—</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">สิ้นสุด</span>
                  <TimeSelect24 value={settings.doctorEndTime} onChange={v => setSettings(prev => ({ ...prev, doctorEndTime: v }))} focusColor="focus:border-sky-500" />
                </div>
              </div>
            </div>
            <div>
              <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">ส–อา (เสาร์-อาทิตย์)</span>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">เริ่ม</span>
                  <TimeSelect24 value={settings.doctorStartTimeWeekend} onChange={v => setSettings(prev => ({ ...prev, doctorStartTimeWeekend: v }))} focusColor="focus:border-sky-500" />
                </div>
                <span className="text-gray-600">—</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">สิ้นสุด</span>
                  <TimeSelect24 value={settings.doctorEndTimeWeekend} onChange={v => setSettings(prev => ({ ...prev, doctorEndTimeWeekend: v }))} focusColor="focus:border-sky-500" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* V50 (2026-05-08) — 3 ProClinic-coupled sections REMOVED:
          (1) "แพทย์ / ผู้ช่วยแพทย์" classification (was: pull from ProClinic
              + assign role) — admin manages doctors/staff via
              `?tab=doctors` + `?tab=staff` (be_doctors / be_staff CRUD).
          (2) "ห้องตรวจ / ห้องหัตถการ" classification (was: pull from ProClinic
              + assign role) — admin manages exam rooms via
              `?tab=exam-rooms` (be_exam_rooms CRUD, Phase 18.0).
          (3) "Master Data Sync" + "ProClinic Integration" (credentials test
              + reload) — entire ProClinic strip per Rule H-bis EXECUTED.
          The classification data lived in be_settings.practitioners +
          be_settings.rooms; consumers now read be_doctors.position +
          be_exam_rooms.kind directly. */}

        {/* Save Button */}
        <div className="flex items-center gap-4">
          <button onClick={handleSave} disabled={isSaving} className="px-8 py-4 rounded-xl text-white font-black uppercase tracking-widest text-sm transition-all disabled:opacity-70 flex items-center gap-2" style={{backgroundColor: ac, boxShadow: `0 0 20px rgba(${acRgb},0.4)`}}>
            <Save size={18}/> {isSaving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
          </button>
          {saveMsg && <span className={`text-sm font-bold ${saveMsg.includes('สำเร็จ') ? 'text-green-500' : 'text-red-500'}`}>{saveMsg}</span>}
        </div>
      </div>
    </div>
  );
}
