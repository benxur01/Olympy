/** @type {import('tailwindcss').Config} */
// CDN o'rniga build paytida CSS generatsiya qilamiz: avval index.html ichida
// https://cdn.tailwindcss.com 1+ MB JS yuklardi va FOUC (style flash) ko'rinardi.
// Endi vite build paytida faqat ishlatilgan klasslar bundle'ga tushadi.
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './app.jsx',
    './shared.jsx',
    './pages/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: { sans: ['Plus Jakarta Sans', 'sans-serif'] },
      colors: {
        brand: {
          50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe',
          300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1',
          600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81',
        },
        surface: {
          900: '#050508', 800: '#0d0e12', 700: '#12141a',
          600: '#191b22', 500: '#20232b',
        },
        // Duolingo palitra — onboarding/splash/auth light yuzalari uchun.
        duo: {
          green: '#58CC02', greenDark: '#46A302', greenSoft: '#D7FFB8',
          yellow: '#FFD900', blue: '#1CB0F6', blueDark: '#1899D6',
          purple: '#CE82FF', red: '#FF4B4B', redDark: '#E63F3F',
          bg: '#FFFFFF', bgDark: '#131F24', card: '#F7F7F7',
          border: '#E5E5E5', text: '#3C3C3C', textSec: '#777777',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease forwards',
        'slide-up': 'slideUp 0.4s ease forwards',
        'pulse-slow': 'pulse 3s infinite',
        'float': 'float 6s ease-in-out infinite',
        'gradient': 'gradient 8s ease infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(20px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-12px)' } },
        gradient: { '0%,100%': { backgroundPosition: '0% 50%' }, '50%': { backgroundPosition: '100% 50%' } },
      },
    },
  },
  plugins: [],
};
