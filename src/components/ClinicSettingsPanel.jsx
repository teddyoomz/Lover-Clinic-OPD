import { useState, useRef } from 'react';
import { setDoc, doc, serverTimestamp, collection, getDocs, writeBatch } from 'firebase/firestore';
import { ArrowLeft, Settings, Type, ImageIcon, Upload, Link, Trash2, Palette, Check, Moon, Save, MessageCircle, Phone, Timer, Cable, Wifi, Lock, RefreshCw } from 'lucide-react';
import { DEFAULT_CLINIC_SETTINGS, PRESET_COLORS } from '../constants.js';
import { hexToRgb, applyThemeColor } from '../utils.js';
import { THEMES } from '../hooks/useTheme.js';
import { clearProClinicSession, testLogin } from '../lib/brokerClient.js';

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
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState('');
  const [clearingSession, setClearingSession] = useState(false);
  const [clearResult, setClearResult] = useState('');
  // showPassword removed — credentials no longer in settings UI

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
        clinicSubtitle: settings.clinicSubtitle.trim(),
        logoUrl: settings.logoUrl,
        logoUrlLight: settings.logoUrlLight || '',
        accentColor: settings.accentColor,
        lineOfficialUrl: settings.lineOfficialUrl?.trim() || '',
        clinicPhone: settings.clinicPhone?.trim() || '',
        patientSyncCooldownMins: newCooldown,
        // Credentials stored in Vercel Environment Variables (not in Firestore)
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

  return (
    <div className="w-full max-w-3xl mx-auto animate-in fade-in duration-300">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2.5 bg-[#141414] hover:bg-[#222] border border-[#333] text-gray-400 hover:text-white rounded-lg transition-colors"><ArrowLeft size={18}/></button>
        <div>
          <h2 className="text-lg font-black text-white uppercase tracking-widest flex items-center gap-2"><Settings size={20} style={{color: ac}}/> ตั้งค่าระบบ</h2>
          <p className="text-xs text-gray-500 tracking-wider">Clinic Branding & Customization</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Clinic Name */}
        <div className="bg-[#0a0a0a] p-6 rounded-2xl border border-[#222]">
          <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Type size={14} style={{color: ac}}/> ชื่อองค์กร</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">ชื่อองค์กร (Organization Name)</label>
              <input type="text" value={settings.clinicName} onChange={e => setSettings(prev => ({...prev, clinicName: e.target.value}))} placeholder="เช่น Lover Clinic" className="w-full bg-[#141414] border border-[#333] text-white rounded-lg px-4 py-3 outline-none focus:border-[var(--accent)] transition-all text-lg font-bold" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">คำอธิบายเพิ่มเติม (Subtitle - optional)</label>
              <input type="text" value={settings.clinicSubtitle} onChange={e => setSettings(prev => ({...prev, clinicSubtitle: e.target.value}))} placeholder="เช่น Men's Health Center" className="w-full bg-[#141414] border border-[#333] text-white rounded-lg px-4 py-3 outline-none focus:border-[var(--accent)] transition-all text-sm" />
            </div>
          </div>
        </div>

        {/* Logo — Dark Theme */}
        <div className="bg-[#0a0a0a] p-6 rounded-2xl border border-[#222]">
          <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-2"><ImageIcon size={14} style={{color: ac}}/> โลโก้ธีมมืด (Dark Theme Logo)</h3>
          <p className="text-[11px] text-gray-600 mb-4">ใช้เวอร์ชัน <span className="text-white font-bold">ตัวอักษรสีขาว / โปร่งใส</span> — แสดงบนพื้นหลังสีเข้ม</p>

          <div className="flex gap-2 mb-4">
            <button onClick={() => setLogoTab('upload')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${logoTab === 'upload' ? 'text-white' : 'bg-[#141414] border border-[#333] text-gray-500 hover:text-white'}`} style={logoTab === 'upload' ? {backgroundColor: ac, color: '#fff'} : {}}>
              <span className="flex items-center gap-1.5"><Upload size={12}/> อัพโหลดไฟล์</span>
            </button>
            <button onClick={() => setLogoTab('url')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${logoTab === 'url' ? 'text-white' : 'bg-[#141414] border border-[#333] text-gray-500 hover:text-white'}`} style={logoTab === 'url' ? {backgroundColor: ac, color: '#fff'} : {}}>
              <span className="flex items-center gap-1.5"><Link size={12}/> ใส่ URL</span>
            </button>
          </div>
          {logoTab === 'upload' ? (
            <div>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={handleLogoFile} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} className="w-full bg-[#141414] hover:bg-[#1a1a1a] border-2 border-dashed border-[#333] hover:border-[var(--accent)] text-gray-400 hover:text-white py-8 rounded-xl transition-all flex flex-col items-center gap-2">
                <Upload size={24}/><span className="text-xs font-bold uppercase tracking-wider">คลิกเพื่อเลือกไฟล์ (PNG, JPG, SVG, max 500KB)</span>
              </button>
            </div>
          ) : (
            <input type="text" value={settings.logoUrl.startsWith('data:') ? '' : settings.logoUrl} onChange={e => handleLogoUrlChange(e.target.value)} placeholder="https://example.com/logo-dark.png" className="w-full bg-[#141414] border border-[#333] text-white rounded-lg px-4 py-3 outline-none focus:border-[var(--accent)] transition-all text-sm font-mono" />
          )}
          {logoPreview && (
            <div className="mt-4 flex items-center gap-4">
              <div className="bg-[#141414] p-4 rounded-xl border border-[#333] flex items-center justify-center" style={{minWidth: '120px', minHeight: '80px'}}>
                <img src={logoPreview} alt="Preview Dark" className="max-h-20 max-w-[200px] object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
              </div>
              <button onClick={handleRemoveLogo} className="p-2 bg-red-950/30 hover:bg-red-900/50 text-red-500 rounded-lg border border-red-900/50 transition-colors" title="ลบโลโก้"><Trash2 size={16}/></button>
            </div>
          )}
        </div>

        {/* Logo — Light Theme */}
        <div className="bg-[#0a0a0a] p-6 rounded-2xl border border-[#222]">
          <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-2"><ImageIcon size={14} style={{color:'#f59e0b'}}/> โลโก้ธีมสว่าง (Light Theme Logo)</h3>
          <p className="text-[11px] text-gray-600 mb-4">ใช้เวอร์ชัน <span className="text-white font-bold">ตัวอักษรสีดำ</span> — แสดงบนพื้นหลังสีขาว / สว่าง (ถ้าไม่มีจะใช้โลโก้ธีมมืดแทนพร้อม filter อัตโนมัติ)</p>

          <div className="flex gap-2 mb-4">
            <button onClick={() => setLogoTabLight('upload')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${logoTabLight === 'upload' ? 'text-white' : 'bg-[#141414] border border-[#333] text-gray-500 hover:text-white'}`} style={logoTabLight === 'upload' ? {backgroundColor: '#f59e0b', color: '#000'} : {}}>
              <span className="flex items-center gap-1.5"><Upload size={12}/> อัพโหลดไฟล์</span>
            </button>
            <button onClick={() => setLogoTabLight('url')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${logoTabLight === 'url' ? 'text-white' : 'bg-[#141414] border border-[#333] text-gray-500 hover:text-white'}`} style={logoTabLight === 'url' ? {backgroundColor: '#f59e0b', color: '#000'} : {}}>
              <span className="flex items-center gap-1.5"><Link size={12}/> ใส่ URL</span>
            </button>
          </div>
          {logoTabLight === 'upload' ? (
            <div>
              <input ref={fileInputRefLight} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={handleLogoFileLight} className="hidden" />
              <button onClick={() => fileInputRefLight.current?.click()} className="w-full bg-[#141414] hover:bg-[#1a1a1a] border-2 border-dashed border-[#444] hover:border-yellow-600 text-gray-400 hover:text-white py-8 rounded-xl transition-all flex flex-col items-center gap-2">
                <Upload size={24}/><span className="text-xs font-bold uppercase tracking-wider">คลิกเพื่อเลือกไฟล์ (PNG, JPG, SVG, max 500KB)</span>
              </button>
            </div>
          ) : (
            <input type="text" value={(settings.logoUrlLight || '').startsWith('data:') ? '' : (settings.logoUrlLight || '')} onChange={e => handleLogoUrlLightChange(e.target.value)} placeholder="https://example.com/logo-light.png" className="w-full bg-[#141414] border border-[#333] text-white rounded-lg px-4 py-3 outline-none focus:border-yellow-600 transition-all text-sm font-mono" />
          )}
          {logoPreviewLight && (
            <div className="mt-4 flex items-center gap-4">
              <div className="bg-white p-4 rounded-xl border border-[#333] flex items-center justify-center" style={{minWidth: '120px', minHeight: '80px'}}>
                <img src={logoPreviewLight} alt="Preview Light" className="max-h-20 max-w-[200px] object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
              </div>
              <button onClick={handleRemoveLogoLight} className="p-2 bg-red-950/30 hover:bg-red-900/50 text-red-500 rounded-lg border border-red-900/50 transition-colors" title="ลบโลโก้"><Trash2 size={16}/></button>
            </div>
          )}
        </div>

        {/* Theme Color */}
        <div className="bg-[#0a0a0a] p-6 rounded-2xl border border-[#222]">
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
            <input type="color" value={settings.accentColor} onChange={e => handleColorChange(e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border border-[#333]" />
            <input type="text" value={settings.accentColor} onChange={e => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) handleColorChange(e.target.value); setSettings(prev => ({...prev, accentColor: e.target.value})); }} className="w-28 bg-[#141414] border border-[#333] text-white rounded-lg px-3 py-2 outline-none font-mono text-sm" placeholder="#dc2626" />
          </div>

          {/* Preview */}
          <div className="mt-6 p-4 bg-[#111] rounded-xl border border-[#222]">
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-3 font-bold">ตัวอย่าง (Preview)</p>
            <div className="flex flex-wrap items-center gap-3">
              <button className="px-4 py-2 rounded-lg text-white font-bold text-sm" style={{backgroundColor: ac, color: '#fff'}}>ปุ่มหลัก</button>
              <button className="px-4 py-2 rounded-lg font-bold text-sm border" style={{borderColor: ac, color: ac, backgroundColor: `rgba(${acRgb},0.1)`}}>ปุ่มรอง</button>
              <span className="font-bold text-sm" style={{color: ac}}>{settings.clinicName || 'ชื่อองค์กร'}</span>
              <div className="w-3 h-3 rounded-full" style={{backgroundColor: ac, boxShadow: `0 0 10px rgba(${acRgb},0.6)`}}></div>
            </div>
          </div>
        </div>

        {/* Dark / Light / Auto Theme */}
        <div className="bg-[#0a0a0a] p-6 rounded-2xl border border-[#222]">
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
                    : 'border-[#333] bg-[#141414] hover:border-[#444]'
                }`}
                style={theme === value ? {borderColor: ac, backgroundColor: `rgba(${acRgb},0.08)`} : {}}
              >
                <Icon size={24} style={theme === value ? {color: ac} : {}} className={theme !== value ? 'text-gray-500' : ''} />
                <span className={`text-xs font-black uppercase tracking-widest ${theme === value ? '' : 'text-gray-500'}`} style={theme === value ? {color: ac} : {}}>{label}</span>
                <span className="text-[10px] text-gray-600 text-center leading-relaxed">
                  {value === 'dark' && 'เข้ม (ค่าเริ่มต้น)'}
                  {value === 'light' && 'สว่าง สบายตา'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* LINE Official Account */}
        <div className="bg-[#0a0a0a] p-6 rounded-2xl border border-[#222]">
          <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-2">
            <MessageCircle size={14} style={{color:'#06C755'}}/> LINE Official Account
          </h3>
          <p className="text-[11px] text-gray-600 mb-4">ลิ้งค์ที่จะแสดงให้ผู้ป่วยกด Add Friend หลังกรอกข้อมูลสำเร็จ</p>
          <input
            type="text"
            value={settings.lineOfficialUrl || ''}
            onChange={e => setSettings(prev => ({ ...prev, lineOfficialUrl: e.target.value }))}
            placeholder="https://lin.ee/xxxxxxx"
            className="w-full bg-[#141414] border border-[#333] text-white rounded-lg px-4 py-3 outline-none focus:border-[#06C755] transition-all text-sm font-mono"
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
        <div className="bg-[#0a0a0a] p-6 rounded-2xl border border-[#222]">
          <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-2">
            <Phone size={14} style={{color: ac}}/> เบอร์โทรคลินิก (Clinic Phone)
          </h3>
          <p className="text-[11px] text-gray-600 mb-4">เบอร์โทรที่จะแสดงให้ผู้ป่วยกดโทรได้จากหน้าข้อมูลผู้ป่วย</p>
          <input
            type="tel"
            value={settings.clinicPhone || ''}
            onChange={e => setSettings(prev => ({ ...prev, clinicPhone: e.target.value }))}
            placeholder="02-xxx-xxxx หรือ 08x-xxx-xxxx"
            className="w-full bg-[#141414] border border-[#333] text-white rounded-lg px-4 py-3 outline-none focus:border-[var(--accent)] transition-all text-sm font-mono"
          />
        </div>

        {/* Patient Sync Cooldown */}
        <div className="bg-[#0a0a0a] p-6 rounded-2xl border border-[#222]">
          <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-2">
            <Timer size={14} style={{color: ac}}/> Patient Sync Cooldown
          </h3>
          <p className="text-[11px] text-gray-600 mb-4">
            จำกัดให้ลูกค้า sync ข้อมูลคอร์สได้กี่ครั้งต่อชั่วโมง —&nbsp;
            <span className="text-white font-bold">0 = ไม่จำกัด</span>,&nbsp;
            1–99999 = นาทีต่อครั้ง (เช่น 60 = ชั่วโมงละครั้ง)<br/>
            <span className="text-yellow-600">การเปลี่ยนค่านี้จะรีเซ็ต cooldown ของทุก session ทันที</span>
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="0"
              max="99999"
              step="1"
              value={settings.patientSyncCooldownMins ?? 60}
              onChange={e => setSettings(prev => ({ ...prev, patientSyncCooldownMins: Math.max(0, Math.min(99999, parseInt(e.target.value, 10) || 0)) }))}
              className="w-32 bg-[#141414] border border-[#333] text-white rounded-lg px-4 py-3 outline-none focus:border-[var(--accent)] transition-all text-lg font-mono font-bold text-center"
            />
            <span className="text-sm text-gray-500">นาที</span>
            <span className="text-xs text-gray-600">
              {(settings.patientSyncCooldownMins ?? 60) === 0
                ? '(ไม่จำกัด)'
                : `(${settings.patientSyncCooldownMins ?? 60} นาทีต่อครั้ง)`}
            </span>
          </div>
        </div>

        {/* ProClinic Integration */}
        <div className="bg-[#0a0a0a] p-6 rounded-2xl border border-[#222]">
          <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-2">
            <Cable size={14} style={{color: '#06b6d4'}}/> ProClinic Integration
          </h3>
          <p className="text-[11px] text-gray-600 mb-4">เชื่อมต่อระบบ ProClinic สำหรับส่ง/ดึงข้อมูลผู้ป่วยอัตโนมัติ ผ่าน Server API</p>

          {/* ProClinic Credentials Info */}
          <div className="rounded-xl border border-cyan-900/30 bg-cyan-950/10 p-4">
            <div className="flex items-center gap-2 text-cyan-400 text-sm font-bold mb-2">
              <Lock size={14} /> Credentials เก็บอย่างปลอดภัย
            </div>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              ProClinic URL, Email, Password เก็บใน Vercel Environment Variables
              — ไม่อัพไป GitHub, ไม่เก็บใน Firestore
            </p>
            <p className="text-[10px] text-gray-600 mt-1.5">
              แก้ไขที่: Vercel Dashboard → Project Settings → Environment Variables
            </p>
          </div>

          {/* Test Connection + Clear Session Buttons */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={async () => {
                setTestingConnection(true);
                setTestResult('');
                try {
                  const data = await testLogin();
                  if (data.debug) console.log('[testLogin debug]', data.debug);
                  setTestResult(data.success ? '✓ เชื่อมต่อสำเร็จ' : `✗ ${data.error}${data.debug ? '\n' + JSON.stringify(data.debug, null, 2) : ''}`);
                } catch (err) {
                  setTestResult(`✗ ${err.message}`);
                } finally {
                  setTestingConnection(false);
                  setTimeout(() => setTestResult(''), 8000);
                }
              }}
              disabled={testingConnection}
              className="px-4 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all flex items-center gap-2 bg-cyan-950/30 border border-cyan-800 text-cyan-400 hover:bg-cyan-900/40 disabled:opacity-50"
            >
              {testingConnection ? <><Wifi size={14} className="animate-pulse"/> กำลังทดสอบ...</> : <><Wifi size={14}/> ทดสอบการเชื่อมต่อ</>}
            </button>
            <button
              onClick={async () => {
                setClearingSession(true);
                setClearResult('');
                try {
                  const data = await clearProClinicSession();
                  setClearResult(data.success ? '✓ ล้าง session แล้ว — จะ login ใหม่อัตโนมัติ' : `✗ ${data.error}`);
                } catch (err) {
                  setClearResult(`✗ ${err.message}`);
                } finally {
                  setClearingSession(false);
                  setTimeout(() => setClearResult(''), 8000);
                }
              }}
              disabled={clearingSession}
              className="px-4 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all flex items-center gap-2 bg-amber-950/30 border border-amber-800 text-amber-400 hover:bg-amber-900/40 disabled:opacity-50"
            >
              {clearingSession ? <><RefreshCw size={14} className="animate-spin"/> กำลังล้าง...</> : <><RefreshCw size={14}/> โหลด Credentials ใหม่</>}
            </button>
            {(testResult || clearResult) && (
              <span className={`text-sm font-bold ${(testResult || clearResult).startsWith('✓') ? 'text-green-500' : 'text-red-500'}`}>
                {testResult || clearResult}
              </span>
            )}
          </div>
          <p className="mt-2 text-[10px] text-gray-600">
            เปลี่ยน URL/Email/Password ใน Vercel แล้วกด "โหลด Credentials ใหม่" — ไม่ต้อง redeploy
          </p>
        </div>

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
