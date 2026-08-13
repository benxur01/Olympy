/** @type {import('tailwindcss').Config} */
// CDN o'rniga build paytida CSS generatsiya qilamiz: avval index.html ichida
// https://cdn.tailwindcss.com 1+ MB JS yuklardi va FOUC (style flash) ko'rinardi.
// Endi vite build paytida faqat ishlatilgan klasslar bundle'ga tushadi.

// ─── "Imtihon byulleteni" rang tizimi ──────────────────────────────────────
// Yo'nalish: bosma imtihon varaqasi intizomi. Gradient, glass va glow yo'q —
// faqat qog'oz (paper), siyoh (ink), shtamp qizili (stamp) va qalam ko'ki
// (pencil).
//
// Ikki qatlam bor:
//
//  1) Mavzuga bog'liq (semantik) tokenlar — `ground`, `surface-1/2`, `edge`,
//     `edge-strong`, `text-primary`, `text-secondary`, `accent`, `accent-2`,
//     `success`, `warning`, `error`. Bular `src/index.css` dagi CSS
//     o'zgaruvchilariga qarab ishlaydi va `data-theme` almashganda avtomatik
//     yangilanadi. `rgb(var(--color-x) / <alpha-value>)` formati tufayli
//     `bg-ground/50`, `border-edge/40` kabi opacity variantlari ham ishlaydi.
//
//  2) Statik shkalalar — `ink`, `paper`, `stamp`, `pencil`, `graphite`. Bular
//     mavzudan qat'i nazar o'zgarmaydi (masalan chop etiladigan sertifikat,
//     yoki atayin bir xil qolishi kerak bo'lgan yuzalar uchun).
//
// ─── DIQQAT: indigo / fuchsia / purple / violet / cyan qayta belgilangan ───
// Tailwind'ning shu besh oilasi ATAYIN o'z ranglaridan mahrum qilinib,
// stamp/pencil shkalalariga ulandi. Sabab: hali redizayn qilinmagan
// dashboardlarda 2000+ xom `bg-indigo-500`, `text-purple-300`, `border-cyan-400`
// kabi klass bor — ular "AI-klaster" ko'rinishini (binafsha/siyohrang gradient)
// beradi. Har birini qo'lda almashtirish 38k qator JSX ni tahrirlashni talab
// qiladi, shuning uchun nomlar saqlanib, faqat ranglar almashtirildi.
//
//   indigo, fuchsia        →  stamp (shtamp qizili)
//   purple, violet, cyan   →  pencil (qalam ko'ki)
//
// Bu VAQTINCHALIK yechim. Keyingi bosqichda JSX dagi shu klasslar semantik
// nomlarga (`bg-accent`, `text-text-secondary`, `border-edge`) ko'chiriladi va
// bu qayta belgilash blokini o'chirish kerak bo'ladi.
//
// slate / gray / emerald / amber / red / blue / sky va boshqa default
// oilalarga TEGILMAGAN — ular AI-klaster belgisi emas va status-badge
// semantikasi (tasdiqlangan / kutilmoqda / rad etilgan) aynan ular ustida
// qurilgan.

// Shtamp qizili — muhr bosilgan qog'oz his-tuyg'usi.
const stamp = {
  50: '#FBF3F2', 100: '#F6E3E1', 200: '#ECC3C0', 300: '#E19F9A', 400: '#D26E67',
  500: '#C0362C', 600: '#A52E26', 700: '#86261F', 800: '#681D18', 900: '#4D1612', 950: '#320E0B',
};

// Qalam ko'ki — imtihon varaqasidagi ikkilamchi belgi.
const pencil = {
  50: '#F3F5F8', 100: '#E2E8EF', 200: '#C1CEDC', 300: '#9BB1C8', 400: '#698AAC',
  500: '#2F5D8C', 600: '#285078', 700: '#214162', 800: '#19324C', 900: '#132538', 950: '#0C1824',
};

// Neytral ramp: 100 = paper, 950 = ink. Oraliq qiymatlar chegara va ikkilamchi
// matn tokenlariga to'g'ri keladi.
const graphite = {
  50: '#F2F0EB', 100: '#E7E4DC', 200: '#C7C3B8', 300: '#A8A396', 400: '#81848C',
  500: '#62656F', 600: '#4A4D57', 700: '#3A3D48', 800: '#2C2F39', 900: '#1B1E26', 950: '#14161C',
};

// CSS o'zgaruvchisiga ulangan token — opacity variantlari bilan.
const v = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

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
      // Uch rol:
      //   sans    — asosiy matn (body)
      //   display — siqilgan sarlavhalar (PT Sans Narrow)
      //   .font-data — raqamli ustunlar uchun (pastdagi plugin)
      //
      // U+02BB (ʻ) endi PT Sans'ning O'ZIDAN keladi: `public/fonts/*-latin.woff2`
      // yamalgan — `scripts/patch-font-uzbek-glyph.py` cmap'ga U+02BB →
      // `quoteleft` yozuvini qo'shadi (ParaType'ning U+02BC → `quoteright`
      // naqshi bo'yicha). Zanjirdagi `system-ui` shu sababdan endi o'sha belgi
      // uchun ishga tushmaydi, lekin zaxira sifatida qoldirildi — masalan
      // yamalmagan shrift keshdan kelib qolsa.
      // Batafsil: `src/index.css` boshidagi izoh.
      fontFamily: {
        sans: ['PT Sans', 'system-ui', 'sans-serif'],
        display: ['PT Sans Narrow', 'PT Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        // ── Mavzuga bog'liq semantik tokenlar ──────────────────────────────
        ground: v('ground'),
        surface: { 1: v('surface-1'), 2: v('surface-2') },
        edge: v('edge'),
        'edge-strong': v('edge-strong'),
        'text-primary': v('text-primary'),
        'text-secondary': v('text-secondary'),
        // `accent` — fon ustiga chiziladigan belgi (matn, ikonka, chegara).
        // `accent-fill` — fonni almashtiradigan qattiq yuza; ustidagi matn
        // HAR DOIM `on-accent` bo'ladi (juftlik ikkala mavzuda 5.05:1).
        // Xom `bg-accent` ustiga och matn qo'yish — xato: dark mavzuda `accent`
        // belgi roli uchun yorug'lashadi va matn 4.5:1 dan tushib ketadi.
        accent: v('accent'),
        'accent-fill': v('accent-fill'),
        'on-accent': v('on-accent'),
        'accent-2': v('accent-2'),

        // Holat ranglari — akcentdan ATAYIN alohida. Stamp qizili allaqachon
        // brend urg'usini egallagan, shuning uchun `error` qizil emas, balki
        // kuydirilgan to'q sariq (rust, hue ~20° vs stamp ~4°) — foydalanuvchi
        // "xato" va "urg'u" ni bir-biriga qorishtirmasligi uchun.
        // Bular ham mavzu bilan almashadi (light/dark uchun alohida qiymat).
        success: v('success'),
        warning: v('warning'),
        error: v('error'),

        // ── Statik shkalalar ──────────────────────────────────────────────
        ink: '#14161C',
        paper: '#E7E4DC',
        stamp: { DEFAULT: stamp[500], ...stamp },
        pencil: { DEFAULT: pencil[500], ...pencil },
        graphite: { DEFAULT: graphite[500], ...graphite },

        // ── Qayta belgilangan default oilalar (yuqoridagi izohga qarang) ───
        indigo: stamp,
        fuchsia: stamp,
        purple: pencil,
        violet: pencil,
        cyan: pencil,

        // Eskirgan `brand` — hech qayerda ishlatilmaydi, lekin config'da
        // #6366f1 qolib ketmasligi uchun stamp'ga ulandi.
        brand: stamp,
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease forwards',
        'slide-up': 'slideUp 0.4s ease forwards',
        'pulse-slow': 'pulse 3s infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(20px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [
    // `.font-data` — raqamlar bir xil kenglikda tursin: ball, reyting, taymer
    // va jadval ustunlarida raqam almashganda ustun "sakramaydi".
    ({ addUtilities }) => {
      addUtilities({
        '.font-data': { fontVariantNumeric: 'tabular-nums' },
      });
    },
  ],
};
