/* Olympy — mavzu (theme) bootstrap'i.
 *
 * Bu skript React yuklanishidan OLDIN, <body> chizilishidan oldin ishlaydi:
 * <head> ichida `defer`/`async`siz ulangan, ya'ni bloklovchi. Aks holda
 * sahifa avval `data-theme="dark"` (Olympy.html dagi statik qiymat) bilan
 * chiziladi va bundle tushgach light'ga sakraydi — FOUC.
 *
 * ┌─ Nega inline <script> emas ──────────────────────────────────────────┐
 * │ Production CSP `script-src` da 'unsafe-inline' YO'Q                  │
 * │ (nginx/security-headers.conf + render.yaml). Inline blok brauzerda   │
 * │ bloklanardi — xuddi Google OAuth client ID bilan bo'lgani kabi       │
 * │ (Olympy.html dagi izohga qarang). `script-src 'self'` esa shu        │
 * │ faylni bemalol o'tkazadi.                                            │
 * │                                                                      │
 * │ Bundle ichiga (entry modulning eng boshiga) qo'yish ham yaramaydi:   │
 * │ `<script type="module">` doim defer, ustiga butun bundle yuklanishi  │
 * │ kutiladi — aynan oldini olmoqchi bo'lgan sakrash o'sha yerda sodir   │
 * │ bo'lardi.                                                            │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * ES5 sintaksisi ataylab: `public/` fayllari Vite tomonidan transpilyatsiya
 * qilinmaydi, ular bundle'dan tashqarida ko'chiriladi.
 */
(function () {
  var STORAGE_KEY = 'olympy:theme';
  var META_COLORS = { dark: '#14161C', light: '#E7E4DC' };

  // Light mavzu hozircha faqat bir qism yuzalarda tayyor. Bu tekshiruv
  // app.jsx dagi `THEME_READY_PAGES` bilan MOS turishi kerak — u yerda
  // qaror `page` state'i bo'yicha, bu yerda esa (React hali yo'q) URL
  // bo'yicha qabul qilinadi. Ro'yxat o'zgarsa, ikkalasi ham yangilansin.
  //
  // Tayyor: `/` (landing), `/pricing`, `/login`, `/register`, `/pending`
  // (tasdiq kutish ekrani), `/leaderboard` (reyting jadvali) va
  // `/dashboard[/...]` (o'quvchi dashboardi va uning ichki sahifalari).
  // Tayyor emas: rol dashboardlari — ular `/dashboard/<rol>` namespace'ida.
  //
  // Aniq mos keladigan manzillar. `/dashboard` esa prefiks bo'yicha
  // tekshiriladi (pastdagi funksiyaga qarang) — uning ichki sahifalari ko'p.
  var READY_PATHS = ['/', '/pricing', '/login', '/register', '/pending', '/leaderboard'];

  var LOCKED_DASHBOARD_BASES = [
    '/dashboard/owner',
    '/dashboard/manager',
    '/dashboard/admin',
    '/dashboard/teacher',
    '/dashboard/questions',
  ];

  function isThemeReady(path) {
    for (var r = 0; r < READY_PATHS.length; r++) {
      if (path === READY_PATHS[r]) return true;
    }
    if (path !== '/dashboard' && path.indexOf('/dashboard/') !== 0) return false;
    for (var i = 0; i < LOCKED_DASHBOARD_BASES.length; i++) {
      var base = LOCKED_DASHBOARD_BASES[i];
      if (path === base || path.indexOf(base + '/') === 0) return false;
    }
    return true;
  }

  // Default — dark (hozirgi holat). Saqlangan tanlov faqat theme-ready
  // sahifalarda qo'llanadi; qolganida tanlov O'CHIRILMAYDI, shunchaki
  // vaqtincha e'tiborga olinmaydi (app.jsx dagi `setLocked` bilan bir xil).
  var theme = 'dark';
  try {
    // Oxiridagi '/' ni olib tashlaymiz (app.jsx dagi `pageFromPath` kabi).
    var path = (window.location.pathname || '/').replace(/(.)\/+$/, '$1');
    var stored = localStorage.getItem(STORAGE_KEY);
    if ((stored === 'light' || stored === 'dark') && isThemeReady(path)) {
      theme = stored;
    }
  } catch (e) {
    // localStorage o'chirilgan (private rejim, cookie bloklangan) — dark.
  }

  document.documentElement.setAttribute('data-theme', theme);
  // Brauzer chrome rangi sahifa fonidan farq qilmasin.
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', META_COLORS[theme]);
})();
