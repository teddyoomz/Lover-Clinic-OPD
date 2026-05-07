import { useState, useRef } from 'react';
import { setDoc, doc } from 'firebase/firestore';
import { ArrowLeft, Settings, Type, ImageIcon, Upload, Link, Trash2, Palette, Check, Moon, Save } from 'lucide-react';
import { DEFAULT_CLINIC_SETTINGS, PRESET_COLORS } from '../constants.js';
import { hexToRgb, applyThemeColor } from '../utils.js';
import { THEMES } from '../hooks/useTheme.js';
// V50 (2026-05-08) — ProClinic strip. brokerClient import REMOVED.
// Sync UI sections (Practitioners + Rooms classify + Master Data Sync +
// ProClinic Integration credentials) deleted; admin manages those entities
// via dedicated be_* CRUD tabs (`?tab=doctors`, `?tab=staff`, `?tab=exam-rooms`).
//
// V51 (2026-05-08) — Per-branch settings migration. 7 chain-vs-branch
// settings sections moved from clinic_settings/main → be_branches[*].settings:
//   1. LINE Official Account URL → settings.lineOaUrl
//   2. Clinic Phone              → settings.phone
//   3. Document info (6 fields)  → settings.{licenseNo,taxId,address,addressEn,email}
//                                  + chain-level clinicName/clinicNameEn stay here
//   4. Patient Sync Cooldown     → settings.patientSyncCooldownMins
//   5. Open Hours                → settings.openHours.{monFri,satSun}
//   6. Chat Hours                → settings.chatHours.{alwaysOn,monFri,satSun}
//   7. Doctor Hours              → DEPRECATED (staff schedule replaces;
//                                  Phase 13 + future per-doctor schedule).
// Migration script: scripts/v51-migrate-clinic-settings-to-branch.mjs
// (Rule M two-phase). TimeSelect24 extracted to shared module
// `src/components/ui/TimeSelect24.jsx` (Rule of 3: BranchFormModal reuses).
//
// This panel now manages ONLY chain-level brand fields:
//   - clinicName / clinicSubtitle (chain identity)
//   - logoUrl + logoUrlLight (chain logos, Dark + Light theme)
//   - accentColor (chain theme color)
//   - theme toggle (Dark / Light / Auto)

export default function ClinicSettingsPanel({ db, appId, clinicSettings, onBack, theme, setTheme }) {
  const [settings, setSettings] = useState({ ...DEFAULT_CLINIC_SETTINGS, ...clinicSettings });
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
  // V51 (2026-05-08) — initialCooldownRef + per-branch settings state REMOVED
  // (sections moved to BranchFormModal). Legacy clinic_settings.* fields for
  // those sections preserved on disk via the migration script that copies
  // them to be_branches[*].settings before deleting from clinic_settings.

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
    try {
      // V51 — write only chain-level brand fields. All per-branch settings
      // moved to be_branches[*].settings (managed via BranchFormModal).
      // merge:true preserves any legacy fields still present on the doc
      // until the migration script wipes them.
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clinic_settings', 'main'), {
        clinicName: settings.clinicName.trim() || DEFAULT_CLINIC_SETTINGS.clinicName,
        clinicSubtitle: settings.clinicSubtitle.trim(),
        accentColor: settings.accentColor,
        logoUrl: settings.logoUrl,
        logoUrlLight: settings.logoUrlLight || '',
      }, { merge: true });
      setSaveMsg('บันทึกสำเร็จ!');
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

        {/* V51 (2026-05-08) — 7 per-branch settings sections MOVED to
          BranchFormModal (Spec #2 Phase 2 + 3):
            • LINE Official Account URL → settings.lineOaUrl
            • Clinic Phone → settings.phone
            • Document info (6 fields) → settings.{licenseNo,taxId,address,addressEn,email}
            • Patient Sync Cooldown → settings.patientSyncCooldownMins
            • Open Hours (จ-ศ + ส-อา) → settings.openHours.{monFri,satSun}
            • Chat Hours + alwaysOn → settings.chatHours.{alwaysOn,monFri,satSun}
            • Doctor Hours — DEPRECATED (staff schedule replaces).
          Migration script: scripts/v51-migrate-clinic-settings-to-branch.mjs.
          chain-level fields preserved here: clinicName, clinicSubtitle,
          accentColor, logoUrl, logoUrlLight (above). */}

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
