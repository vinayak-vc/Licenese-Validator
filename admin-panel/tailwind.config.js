/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          950: '#020617', // Primary Background
          900: '#0f172a', // Card Surfaces
          800: '#1e293b', // Border/Stroke
        },
        cyan: {
          500: '#06b6d4',
        },
        emerald: {
          500: '#10b981',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'system-ui'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular'],
      },
    },
  },
  plugins: [],
}
