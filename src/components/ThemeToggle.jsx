import { THEMES } from '../hooks/useTheme.js';
import { Moon } from 'lucide-react';

export default function ThemeToggle({ theme, setTheme, compact = false }) {
  if (compact) {
    const order = ['dark', 'light'];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    const Icon = THEMES.find(t => t.value === theme)?.icon || Moon;
    return (
      <button
        onClick={() => setTheme(next)}
        className="p-2.5 bg-[var(--bg-input)] hover:bg-[var(--bg-hover2)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-[var(--tx-heading)] rounded-lg transition-all"
        title={`Theme: ${theme} (click to change)`}
      >
        <Icon size={16} />
      </button>
    );
  }

  return (
    <div className="flex bg-[#141414] border border-[#333] rounded-lg overflow-hidden">
      {THEMES.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold transition-all ${
            theme === value
              ? 'bg-[var(--accent,#dc2626)] text-white'
              : 'text-gray-400 hover:text-white hover:bg-[#222]'
          }`}
          title={label}
        >
          <Icon size={13} />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
