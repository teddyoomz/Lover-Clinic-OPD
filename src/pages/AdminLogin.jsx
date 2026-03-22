import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Lock } from 'lucide-react';
import { DEFAULT_CLINIC_SETTINGS } from '../constants.js';
import { hexToRgb } from '../utils.js';
import ThemeToggle from '../components/ThemeToggle.jsx';
import ClinicLogo from '../components/ClinicLogo.jsx';

export default function AdminLogin({ auth, clinicSettings = {}, theme, setTheme }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const cs = { ...DEFAULT_CLINIC_SETTINGS, ...clinicSettings };
  const ac = cs.accentColor;
  const acRgb = hexToRgb(ac);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true); setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือไม่ได้รับอนุญาตให้เข้าถึงระบบ');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4 relative" style={{background: `radial-gradient(ellipse at top, rgba(${acRgb},0.08), var(--bg-base,#050505) 70%)`}}>
      {/* Theme toggle — top right */}
      {theme && setTheme && (
        <div className="absolute top-4 right-4">
          <ThemeToggle theme={theme} setTheme={setTheme} />
        </div>
      )}
      <div className="bg-[#0a0a0a] max-w-md w-full rounded-2xl border border-[#222] p-8" style={{boxShadow: `0 0 40px rgba(${acRgb},0.1)`}}>
        <div className="flex justify-center mb-4"><ClinicLogo center clinicSettings={cs} theme={theme} /></div>
        <p className="text-center text-gray-500 mb-8 text-xs tracking-widest uppercase border-b border-[#222] pb-6">สำหรับเจ้าหน้าที่เท่านั้น</p>
        {error && <div className="bg-red-950/30 text-red-500 p-3 rounded-lg text-sm font-medium mb-6 text-center border border-red-900/50">{error}</div>}
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1 tracking-wider uppercase">อีเมลระบบ</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-[#141414] border border-[#333] text-white rounded-lg px-4 py-3 outline-none transition-all placeholder-gray-700 text-[16px]" style={{'--tw-ring-color': ac}} placeholder="admin@example.com" onFocus={e => { e.target.style.borderColor = ac; }} onBlur={e => { e.target.style.borderColor = '#333'; }} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1 tracking-wider uppercase">รหัสผ่าน</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-[#141414] border border-[#333] text-white rounded-lg px-4 py-3 outline-none transition-all placeholder-gray-700 text-[16px]" placeholder="••••••••" onFocus={e => { e.target.style.borderColor = ac; }} onBlur={e => { e.target.style.borderColor = '#333'; }} />
          </div>
          <button type="submit" disabled={isLoading} className="w-full text-white py-3.5 rounded-lg font-bold text-sm uppercase tracking-wider active:scale-95 transition-all disabled:opacity-70 mt-6 flex justify-center items-center gap-2" style={{backgroundColor: ac, color: '#fff', boxShadow: `0 0 15px rgba(${acRgb},0.4)`}}>
            {isLoading ? 'กำลังตรวจสอบ...' : <><Lock size={16} /> เข้าสู่ระบบ</>}
          </button>
        </form>
      </div>
    </div>
  );
}
