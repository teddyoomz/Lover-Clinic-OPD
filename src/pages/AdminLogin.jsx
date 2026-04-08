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
    <div className="min-h-screen bg-[var(--bg-base,#050505)] flex items-center justify-center p-4 relative">
      {/* Theme toggle — top right */}
      {theme && setTheme && (
        <div className="absolute top-4 right-4">
          <ThemeToggle theme={theme} setTheme={setTheme} />
        </div>
      )}
      <div className="bg-[var(--bg-surface,#0a0a0a)] max-w-md w-full rounded-2xl border border-[var(--bd,#222)] p-8">
        <div className="flex justify-center mb-4"><ClinicLogo center clinicSettings={cs} theme={theme} /></div>
        <p className="text-center text-gray-500 mb-8 text-xs font-medium border-b border-[var(--bd,#222)] pb-6">สำหรับเจ้าหน้าที่เท่านั้น</p>
        {error && <div className="bg-red-950/30 text-red-500 p-3 rounded-lg text-sm font-medium mb-6 text-center border border-red-900/50">{error}</div>}
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">อีเมลระบบ</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-[var(--bg-input,#141414)] border border-[var(--bd,#333)] text-[var(--tx-primary,#fff)] rounded-lg px-4 py-3 outline-none transition-all placeholder-gray-700 text-[16px] focus:border-[color:var(--accent)]" placeholder="admin@example.com" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">รหัสผ่าน</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-[var(--bg-input,#141414)] border border-[var(--bd,#333)] text-[var(--tx-primary,#fff)] rounded-lg px-4 py-3 outline-none transition-all placeholder-gray-700 text-[16px] focus:border-[color:var(--accent)]" placeholder="••••••••" />
          </div>
          <button type="submit" disabled={isLoading} className="w-full text-white py-3.5 rounded-lg font-bold text-sm active:scale-[0.98] transition-all disabled:opacity-70 mt-6 flex justify-center items-center gap-2 hover:opacity-90" style={{backgroundColor: ac}}>
            {isLoading ? 'กำลังตรวจสอบ...' : <><Lock size={16} /> เข้าสู่ระบบ</>}
          </button>
        </form>
      </div>
    </div>
  );
}
