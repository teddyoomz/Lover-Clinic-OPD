/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Animations used by Radix Dialog (mobile drawer) + cmdk palette.
      // Radix writes data-[state=open|closed] attributes, so we use Tailwind's
      // arbitrary-value `data-[state=...]:animate-<name>` in JSX. Keep these
      // durations short (150-250ms) for a snappy feel on mobile.
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        slideInLeft: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        slideOutLeft: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-100%)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 150ms ease-out',
        fadeOut: 'fadeOut 120ms ease-in',
        slideInLeft: 'slideInLeft 220ms cubic-bezier(0.4, 0, 0.2, 1)',
        slideOutLeft: 'slideOutLeft 180ms cubic-bezier(0.4, 0, 0.2, 1)',
        scaleIn: 'scaleIn 150ms cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
}
