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

  // Bu tekshiruv `app.jsx` dagi `THEME_READY_PAGES` bilan MOS turishi kerak —
  // u yerda qaror `page` state'i bo'yicha, bu yerda esa (React hali yo'q) URL
  // bo'yicha qabul qilinadi. Ro'yxat o'zgarsa, ikkalasi ham yangilansin.
  //
  // 3-bosqichdan keyin ilovaning BARCHA sahifalari ikkala mavzuda ishlaydi.
  // Ro'yxat baribir aniq saqlanadi: yangi URL avtomatik theme-ready deb
  // hisoblanmasin — ko'chirilmagan sahifa light rejimda o'qib bo'lmaydigan
  // holda chiqib qolmasligi uchun.
  var READY_PATHS = [
    '/', '/pricing', '/login', '/register', '/pending',
    '/leaderboard', '/profile', '/analytics',
  ];

  // Prefiks bo'yicha tekshiriladigan yo'llar — dinamik segmenti bor, ya'ni
  // aniq tenglik ishlamaydi:
  //   /dashboard[/...]             — o'quvchi va rol dashboardlari
  //   /test[/<id>]                 — imtihon topshirish
  //   /certificates/verify/<uuid>  — public sertifikat tekshiruvi
  //   /portfolio/verify/<uuid>     — public portfolio tekshiruvi
  //
  // Oxirgi ikkitasi `<App>` dan TASHQARIDA render qilinadi (app.jsx top-level
  // router), shuning uchun ular `THEME_READY_PAGES` da yo'q va faqat shu
  // yerdagi tekshiruvga tayanadi.
  // Har biri "aynan shu yo'l" YOKI "shu yo'l + `/`" bilan mos keladi —
  // `path.indexOf(pre) === 0` yolg'iz o'zi yetarli emas: u `/test` ni
  // `/testing` ga ham moslab yuborardi.
  var READY_PREFIXES = [
    '/dashboard',
    '/test',
    '/certificates/verify',
    '/portfolio/verify',
  ];

  function isThemeReady(path) {
    for (var r = 0; r < READY_PATHS.length; r++) {
      if (path === READY_PATHS[r]) return true;
    }
    for (var p = 0; p < READY_PREFIXES.length; p++) {
      var pre = READY_PREFIXES[p];
      if (path === pre || path.indexOf(pre + '/') === 0) return true;
    }
    return false;
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
