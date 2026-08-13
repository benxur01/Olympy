// app.jsx — Main router & state (store-driven)

const { useState, useEffect } = React;

// Page <-> URL mapping. Brauzer manzil satrida sahifa o'zgarishini ko'rsatish
// va orqaga/oldinga tugmalari ishlashi uchun ishlatiladi.
//
// Eslatma: `results` sahifasi URL o'zgartirmaydi — u runtime state
// (testResult) bilan boshqariladi (test natijasi detal sahifasi). `test` esa
// endi URL'ga bog'langan (/test/<id>) va F5'dan keyin sessiya localStorage'dan
// tiklanadi.
//
// MUHIM: `olympiads` va `results` ilgari shu yerda `/dashboard/olympiads` va
// `/dashboard/results` ga ko'rsatardi. Endi bu sub-path'lar StudentDashboard
// ichki navigatsiyasiga (page state) tegishli — shuning uchun ular bu
// mapping'dan olib tashlandi. `/dashboard/*` barcha sub-path'lari `student`
// (StudentDashboard) sahifasiga yo'naltiriladi, qolgani esa dashboard ichida
// hal qilinadi. `teacher`, `questions` boshqa rollarga tegishli
// bo'lib qoladi.
const PAGE_URLS = {
  landing: '/',
  login: '/login',
  register: '/register',
  student: '/dashboard',
  teacher: '/dashboard/teacher',
  manager: '/dashboard/manager',
  owner: '/dashboard/owner',
  admin: '/dashboard/admin',
  questions: '/dashboard/questions',
  leaderboard: '/leaderboard',
  profile: '/profile',
  pending: '/pending',
  'pending-home': '/pending',
  analytics: '/analytics',
  pricing: '/pricing',
};

// Rol dashboardlarining URL namespace'i ↔ app-level `page`. Har bir dashboard
// o'z ichki tab'ini `/dashboard/<role>/<tab>` sub-path'ida boshqaradi (qaysi
// tab — dashboard komponenti window.location'dan o'zi aniqlaydi). Bu yerda
// faqat sub-path'ni to'g'ri rol sahifasiga (`page`) yo'naltiramiz.
// `student` ataylab YO'Q — u barcha qolgan `/dashboard/*` sub-path'larini
// catch-all sifatida oladi (pastdagi pageFromPath'ga qarang).
const DASHBOARD_ROLE_BASES = {
  '/dashboard/owner': 'owner',
  '/dashboard/manager': 'manager',
  '/dashboard/admin': 'admin',
  '/dashboard/teacher': 'teacher',
};

// Faol test sahifasidagi olimpiada ID'sini saqlash kaliti. F5 (sahifa
// yangilash) yoki kraxdan keyin test sessiyasini shu ID orqali tiklaymiz.
const ACTIVE_TEST_KEY = 'olympy:activeTestOlympiad';

const readActiveTestId = () => {
  try { return localStorage.getItem(ACTIVE_TEST_KEY) || null; } catch { return null; }
};
const writeActiveTestId = (id) => {
  try {
    if (id == null) localStorage.removeItem(ACTIVE_TEST_KEY);
    else localStorage.setItem(ACTIVE_TEST_KEY, String(id));
  } catch {}
};

// URL'dan test olimpiada ID'sini ajratish: /test yoki /test/<id>.
const testIdFromPath = () => {
  try {
    const raw = window.location.pathname || '/';
    const m = raw.match(/^\/test(?:\/([^/]+))?\/?$/);
    if (!m) return undefined; // test sahifasi emas
    return m[1] || null; // ID bo'lmasa null (localStorage fallback ishlatiladi)
  } catch { return undefined; }
};

// URL → page (teskari mapping). Bir nechta page bitta URL ga ko'rsatsa,
// birinchi uchragani ishlaydi (Object.fromEntries oxirgisini saqlaydi,
// shuning uchun pending-home oldinroq turibdi va u pending'ni override
// qilmasligi kerak — `pending-home` faqat fallback sifatida ishlatiladi).
const URL_PAGES = (() => {
  const map = {};
  for (const [page, url] of Object.entries(PAGE_URLS)) {
    if (!(url in map)) map[url] = page;
  }
  return map;
})();

// Auth talab qiladigan sahifalar. Component tashqarisida `const` sifatida —
// har render'da qayta yaratilmasligi va useEffect bog'liqliklarini bekorga
// o'zgartirmasligi uchun.
const NEEDS_AUTH_PAGES = ['student','manager','admin','teacher','owner','test','mock-test','results','leaderboard','profile','pending','pending-home','analytics','questions'];

// Light mavzu tayyor bo'lgan yuzalar. Qolgan hamma joyda ekran majburiy dark
// bo'ladi (`OlympyTheme.setLocked`) — test (`OlympiadTest`), savol yaratuvchi,
// natijalar, profil va analitika hali `text-white` / `bg-white/5` /
// `border-white/10` klassiga tayanadi; ular faqat qora fon uchun yozilgan va
// light rejimda o'qib bo'lmaydi. Majburiy dark foydalanuvchining SAQLANGAN
// TANLOVINI o'chirmaydi: u theme-ready sahifaga qaytishi bilan light tiklanadi.
//
// DIQQAT: bu ro'yxat `public/theme-init.js` dagi URL tekshiruvi bilan mos
// turishi kerak — o'sha skript React yuklanishidan oldin xuddi shu qarorni
// URL bo'yicha qabul qiladi (FOUC oldini olish uchun). Biri o'zgarsa,
// ikkinchisi ham yangilansin.
//
// `pending` va `pending-home` IKKALASI ham shu yerda: ular bitta `/pending`
// manziliga ko'rsatadi (PAGE_URLS), lekin `page` state'i ikki xil yo'ldan
// keladi — URL'dan (`pending`) va `roleHomePage`dan (`pending-home`). Faqat
// bittasi ro'yxatda bo'lsa, ekran qaysi yo'l bilan ochilganiga qarab
// mavzuni almashtirar edi.
//
// `leaderboard` — `pages/Leaderboard.jsx` to'liq token asosida qayta yozilgan,
// shuning uchun u ham ro'yxatda. `/leaderboard` oson taxmin qilinadigan va
// ulashiladigan manzil: light tanlagan foydalanuvchi uni to'g'ridan-to'g'ri
// ochganda qorong'i sahifa ko'rmasligi kerak.
//
// Rol dashboardlari (`admin`, `owner`, `manager`, `teacher`) — 2-bosqichda
// tokenlarga ko'chirildi: `text-white` va xom `indigo/purple/cyan` klasslari
// olib tashlandi, gradient/glow/rangli soya yo'q. Ular ham ikkala mavzuda
// ishlaydi.
const THEME_READY_PAGES = new Set([
  'landing', 'pricing', 'login', 'register', 'student', 'pending', 'pending-home',
  'leaderboard',
  'admin', 'owner', 'manager', 'teacher',
]);

const pageFromPath = () => {
  try {
    const raw = window.location.pathname || '/';
    const path = raw === '/' ? '/' : raw.replace(/\/+$/, '');
    // /test va /test/<id> — test sahifasi (dinamik segment URL_PAGES'da yo'q).
    if (/^\/test(\/.*)?$/.test(path)) return 'test';
    // Aniq mos kelgan URL (masalan /dashboard/teacher, /dashboard/manager,
    // /dashboard/owner, /dashboard/admin, /dashboard/questions
    // tegishli rollarga; /dashboard StudentDashboard'ga).
    if (URL_PAGES[path]) return URL_PAGES[path];
    // /dashboard/<role>/<tab> — rol dashboardlarining ichki sub-sahifalari
    // (masalan /dashboard/owner/staff, /dashboard/manager/requests). Tegishli
    // rol sahifasiga (`page`) yo'naltiramiz; qaysi tab ochilishini dashboard
    // komponenti window.location'dan o'zi aniqlaydi. Student catch-all'dan
    // OLDIN turishi shart — aks holda bu sub-path'lar `student`ga ketib qolardi.
    for (const [base, rolePage] of Object.entries(DASHBOARD_ROLE_BASES)) {
      if (path === base || path.startsWith(`${base}/`)) return rolePage;
    }
    // /dashboard/<sub> — StudentDashboard ichki sahifalari (olympiads,
    // results, centers, analytics, mistakes, premium, practice, store,
    // notifications, settings va h.k.). Bular `student` sahifasiga
    // yo'naltiriladi; qaysi sub-tab ochilishini StudentDashboard o'zi
    // window.location.pathname'dan aniqlaydi.
    if (/^\/dashboard(\/.*)?$/.test(path)) return 'student';
    if (path === '/' || path === '') return 'landing';
  } catch {}
  return null;
};

// ErrorBoundary — render paytida ushlanmagan xato butun sahifani oq ekranga
// tushirmasligi uchun. Bitta komponent yiqilsa, foydalanuvchiga tushunarli
// xabar va "sahifani yangilash" tugmasi ko'rinadi. React'da xatoni faqat class
// komponent (getDerivedStateFromError / componentDidCatch) ushlaydi.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Konsolga (va mavjud bo'lsa Sentry'ga) log qilamiz — diagnostika uchun.
    try {
      console.error('Render xatosi (ErrorBoundary):', error, info);
      if (globalThis.Sentry?.captureException) {
        globalThis.Sentry.captureException(error);
      }
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="dark min-h-screen flex items-center justify-center px-6" style={{ background: 'rgb(var(--color-ground))' }}>
          <div className="glass rounded-2xl p-8 max-w-md w-full text-center flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-2xl gradient-bg flex items-center justify-center text-accent text-2xl font-bold">!</div>
            <div className="text-lg font-semibold text-text-primary">Xatolik yuz berdi</div>
            <div className="text-sm text-text-secondary">
              Kutilmagan xatolik sodir bo'ldi. Iltimos, sahifani yangilang. Muammo takrorlansa, birozdan so'ng qayta urinib ko'ring.
            </div>
            <button
              type="button"
              onClick={() => { try { window.location.reload(); } catch {} }}
              className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold mt-1"
            >
              Sahifani yangilash
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const App = () => {
  const [page, setPage] = React.useState(() => pageFromPath() || 'landing');
  const [testResult, setTestResult] = React.useState(null);
  const [activeOlympiad, setActiveOlympiad] = React.useState(null);
  // Mashq (mock) testi — o'tib ketgan olimpiadani mashq rejimida ochish uchun.
  // {mockId, title, subject, duration}. Runtime-only (URL'ga bog'lanmaydi):
  // F5'da yo'qolsa ham mashq backend'da idempotent, qayta ochiladi.
  const [activeMock, setActiveMock] = React.useState(null);
  const [switcherOpen, setSwitcherOpen] = React.useState(false);
  const [apiUser, setApiUser] = React.useState(null);
  // restore tugamasidan oldin landing flicker'i ko'rinmasligi uchun bootstrap
  // bayrog'i: true bo'lsa, butun ekran loaderda turadi va shundan so'nggina
  // haqiqiy sahifa render bo'ladi.
  const [bootstrapping, setBootstrapping] = React.useState(true);
  const [showPushPrompt, setShowPushPrompt] = React.useState(false);
  // Support rejimi: admin "Foydalanuvchi sifatida ko'rish"ni yoqqan bo'lsa
  // {userId, name}. Butun ilova o'sha foydalanuvchining tokeni bilan ishlaydi
  // (api.js), shu sababli ekranning tepasida doimiy banner turishi SHART —
  // admin qaysi hisobda ekanini bir qarashda ko'rishi kerak.
  const [impersonation, setImpersonation] = React.useState(
    () => globalThis.OlympyApi?.getImpersonation?.() || null,
  );
  const [endingImpersonation, setEndingImpersonation] = React.useState(false);

  const user = apiUser;

  const subscribeUserToPush = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      // Backend'da bu kalit env orqali boshqariladi (VAPID_PUBLIC_KEY /
      // VAPID_PRIVATE_KEY). Frontend ham build paytida o'sha qiymatni olsin,
      // aks holda kalit rotatsiya qilinganda obuna muvaffaqiyatli
      // ro'yxatdan o'tadi-yu, push yetkazilmaydi. Fallback — hozirgi kalit
      // (VITE_GOOGLE_CLIENT_ID naqshi kabi).
      const publicVapidKey = import.meta.env?.VITE_VAPID_PUBLIC_KEY
        || 'BD9_OMAXcl4b5FYa6vk8WXkRGxZiiELY3wdujM8UJ7iwEuClqeaVtum5zIfga-IwqenvnRKn7-CyxwXWlZIe3zY';
      
      const padding = '='.repeat((4 - publicVapidKey.length % 4) % 4);
      const base64 = (publicVapidKey + padding).replace(/\-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: outputArray
      });

      const token = globalThis.OlympyApi?.getToken?.() || globalThis.OlympyApi?.loadAuth?.()?.token;
      await globalThis.OlympyApi?.subscribePush?.(subscription, token);
      console.log('Web Push subscribed successfully');
    } catch (e) {
      console.error('Failed to subscribe to Web Push:', e);
    }
  };

  const handlePushAccept = async () => {
    setShowPushPrompt(false);
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await subscribeUserToPush();
    } else {
      sessionStorage.setItem('push_prompt_dismissed', 'true');
    }
  };

  const handlePushDecline = () => {
    setShowPushPrompt(false);
    sessionStorage.setItem('push_prompt_dismissed', 'true');
  };

  React.useEffect(() => {
    // Olimpiada/musobaqa testi (`page === 'test'`) davomida bildirishnoma
    // so'rovi ko'rsatilmasin — test ustiga chiqib e'tiborni chalg'itmasin.
    // Foydalanuvchi testdan chiqishi bilan (`page` o'zgarishi bilan effekt
    // qayta ishga tushadi) so'rov odatdagidek 3s'dan keyin ko'rsatiladi.
    if (page === 'test') return;
    if (user && 'serviceWorker' in navigator && 'PushManager' in window) {
      if (Notification.permission === 'granted') {
        subscribeUserToPush();
      } else if (Notification.permission === 'default') {
        const timer = setTimeout(() => {
          const dismissed = sessionStorage.getItem('push_prompt_dismissed');
          if (!dismissed) {
            setShowPushPrompt(true);
          }
        }, 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [user, page]);


  // Referral havola: foydalanuvchi `?ref=CODE` bilan kelsa, kodni saqlab
  // qo'yamiz va ro'yxatdan o'tishda backend'ga uzatamiz. URL'dan param'ni
  // tozalab qo'yamiz (history.replaceState) — F5/qayta yuklashda takror
  // o'qilmasligi va manzil chiroyli qolishi uchun.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const ref = (params.get('ref') || '').trim();
      if (ref) {
        localStorage.setItem('olympy:pendingReferral', ref);
        params.delete('ref');
        const qs = params.toString();
        const newUrl = window.location.pathname + (qs ? `?${qs}` : '') + (window.location.hash || '');
        window.history.replaceState({}, '', newUrl);
      }
    } catch {}
  }, []);

  // K5: Submit paytida 401 olib token muddati tugagan bo'lsa, foydalanuvchi
  // saqlangan olimpiada test sahifasiga avtomatik qaytishi kerak. Aks
  // holda javoblar localStorage'da qoladi-yu, lekin foydalanuvchi
  // dashboard'ga otib ketadi va qayta submit qilolmaydi.
  const tryResumePendingOlympiad = (u) => {
    if (!u?._api) return;
    try {
      const pendingId = localStorage.getItem('olympy:pendingOlympiadReturn');
      if (!pendingId || !globalThis.OlympyApi?.getOlympiads) return;
      const token = globalThis.OlympyApi?.getToken?.()
        ?? globalThis.OlympyApi?.loadAuth?.()?.token;
      globalThis.OlympyApi.getOlympiads(token).then((list) => {
        const target = (list || []).find(o => String(o.id) === String(pendingId));
        if (!target) {
          localStorage.removeItem('olympy:pendingOlympiadReturn');
          return;
        }
        const mapped = mapApiOlympiad(target);
        if (mapped?.status === 'active') {
          setActiveOlympiad(mapped);
          setPage('test');
        }
        localStorage.removeItem('olympy:pendingOlympiadReturn');
      }).catch(() => {
        // Tarmoq xatosi — pending'ni saqlab qoldiramiz, foydalanuvchi
        // qayta urinib ko'rishi mumkin.
      });
    } catch {}
  };

  // K17: F5 (sahifa yangilash) yoki to'g'ridan-to'g'ri /test/<id> link bilan
  // kirilganda test sessiyasini tiklash. URL'dagi ID yoki localStorage'dagi
  // faol test ID'si orqali olimpiadani topamiz. Faqat hali active bo'lgan
  // (vaqti tugamagan) olimpiada tiklanadi — javoblar localStorage'dagi
  // `olympy_answers_<id>` kalitidan OlympiadTest komponenti tomonidan
  // avtomatik o'qiladi. Promise qaytaradi: true => tiklash boshlandi.
  const tryRestoreActiveTest = (u, urlTestId) => {
    if (!u?._api || !globalThis.OlympyApi?.getOlympiads) return Promise.resolve(false);
    const targetId = (urlTestId != null && urlTestId !== '')
      ? urlTestId
      : readActiveTestId();
    if (!targetId) return Promise.resolve(false);
    const token = globalThis.OlympyApi?.getToken?.()
      ?? globalThis.OlympyApi?.loadAuth?.()?.token;
    return globalThis.OlympyApi.getOlympiads(token).then((list) => {
      const target = (list || []).find(o => String(o.id) === String(targetId));
      if (!target) { writeActiveTestId(null); return false; }
      const mapped = mapApiOlympiad(target);
      // Faqat active olimpiada tiklanadi. Yakunlangan/o'chirilgan bo'lsa
      // saqlangan ID'ni tozalaymiz va dashboard'da qoldiramiz.
      if (mapped?.status !== 'active') { writeActiveTestId(null); return false; }
      setActiveOlympiad(mapped);
      setPage('test');
      return true;
    }).catch(() => false);
  };

  // Cookie orqali tiklangan sessiyada (auth.user cache'da yo'q — masalan tab
  // qayta ochilganda sessionStorage tozalangan holatda) storage'da Bearer
  // token bo'lmaydi va sahifa butunlay HttpOnly cookie'ga qaram bo'lib qoladi.
  // Bu ayniqsa uzoq davom etadigan olimpiada sessiyalarida xavfli: Telegram
  // WebApp yoki iOS Safari'da cross-site cookie fon so'rovlarida (masalan
  // 15 soniyalik ping yoki savol yuklash) doim ishonchli yetib bormasligi
  // mumkin — natijada access token muddati tugaganda silent refresh cookie
  // orqali muvaffaqiyatsiz bo'lib, foydalanuvchi musobaqa o'rtasida hisobdan
  // chiqarib yuboriladi (58a1fbe / e474486'da qisman tuzatilgan muammoning
  // davomi). Shu sababli bootstrap paytida — cookie ishlayotganini bilgach —
  // darhol haqiqiy Bearer token+refresh juftligini olib storage'ga yozamiz,
  // shunda shu tab keyingi barcha so'rovlarni Authorization header orqali
  // yuboradi va cross-site cookie ishonchliligiga qaram bo'lmaydi. Best-effort:
  // muvaffaqiyatsiz bo'lsa jimgina eski cookie-only rejimda davom etadi.
  const hydrateBearerTokenIfMissing = async () => {
    try {
      if (globalThis.OlympyApi?.getToken?.()) return; // allaqachon bor
      const resp = await globalThis.OlympyApi?.refreshToken?.();
      const token = resp?.access || resp?.token;
      if (token) {
        globalThis.OlympyApi.saveAuth({ token, refresh: resp?.refresh });
      }
    } catch {
      // Cookie ham ishlamasa — jimgina davom etamiz, getMe() muvaffaqiyati
      // shu tab hozircha cookie orqali ishlayotganini bildiradi.
    }
  };

  // Persist backend JWT session only.
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      const requestedPage = pageFromPath();
      const auth = globalThis.OlympyApi?.loadAuth?.();
      // localStorage'dagi user obyektiga ko'r-ko'rona ishonmaslik —
      // token eskirgan bo'lsa dashboard 401 olib bounce loop yaratadi.
      // Avval getMe bilan validate qilamiz.
      const urlTestId = testIdFromPath();

      // Cookie-only sessiyani tekshirish: storage'da user cache'i bo'lmasa ham
      // HttpOnly cookie hali tirik bo'lishi mumkin. true => sessiya topildi va
      // sahifa o'rnatildi. Hech qachon reject qilmaydi — fonda ham chaqiriladi.
      //
      // `speculative` — FON rejimi (pastdagi "cache umuman yo'q" tarmog'i):
      // 401 "sessiya yo'q" degani, majburiy logout emas. Aks holda sekin
      // tarmoqda kech kelgan javob foydalanuvchi shu orada kirgan yangi
      // sessiyani o'chirib yuborardi (api.js'dagi izohga qarang).
      const restoreFromCookieSession = async ({ speculative = false } = {}) => {
        try {
          const freshUser = await globalThis.OlympyApi?.getMe?.(null, { speculative });
          if (!freshUser || cancelled) return false;
          const mappedUser = globalThis.OlympyApi.mapBackendUser(freshUser);
          globalThis.OlympyApi.saveAuth({ user: mappedUser, cookieAuth: true });
          hydrateBearerTokenIfMissing();
          setApiUser(mappedUser);
          if (requestedPage === 'test') {
            const restored = await tryRestoreActiveTest(mappedUser, urlTestId);
            if (cancelled) return true;
            if (!restored) setPage(roleHomePage(mappedUser));
            return true;
          }
          const publicPages2 = ['login', 'register', 'landing'];
          const dest2 = (!requestedPage || publicPages2.includes(requestedPage))
            ? roleHomePage(mappedUser) : requestedPage;
          setPage(dest2);
          tryResumePendingOlympiad(mappedUser);
          return true;
        } catch { return false; }
      };

      // Sessiya topilmadi — so'ralgan sahifada qolamiz.
      // Autentifikatsiyasiz /test ochilsa — auth guard login'ga yo'naltiradi.
      const keepRequestedPage = () => {
        if (!cancelled && requestedPage && requestedPage !== 'test') setPage(requestedPage);
      };

      if (auth?.user) {
        try {
          const freshUser = await globalThis.OlympyApi?.getMe?.(null);
          if (!freshUser || cancelled) throw new Error('Stale session');
          const mappedUser = globalThis.OlympyApi.mapBackendUser(freshUser);
          globalThis.OlympyApi.saveAuth({ user: mappedUser, cookieAuth: true });
          // Bearer hidratsiyasi ATAYIN await QILINMAYDI: u best-effort fon
          // vazifasi (yuqoridagi izohga qarang), lekin yana bitta tarmoq
          // so'rovi — await qilinsa sekin mobil tarmoqda butun ilova shuncha
          // vaqt "Olympy yuklanmoqda..." loaderida turib qolardi.
          hydrateBearerTokenIfMissing();
          setApiUser(mappedUser);
          // F5'dan keyin test sahifasida bo'lsak — sessiyani tiklaymiz.
          if (requestedPage === 'test') {
            const restored = await tryRestoreActiveTest(mappedUser, urlTestId);
            if (cancelled) return;
            if (!restored) setPage(roleHomePage(mappedUser));
            setBootstrapping(false);
            return;
          }
          const publicPages = ['login', 'register', 'landing'];
          const dest1 = (!requestedPage || publicPages.includes(requestedPage))
            ? roleHomePage(mappedUser) : requestedPage;
          setPage(dest1);
          setBootstrapping(false);
          tryResumePendingOlympiad(mappedUser);
          return;
        } catch {
          // Token stale — tozalab cookie session sinab ko'ramiz
          try { globalThis.OlympyApi?.clearAuth?.(); } catch {}
        }
        // Cache bor edi-yu eskirgan: cookie sessiyasini BLOKLAB sinaymiz —
        // sessiya tirik bo'lsa login ekrani miltillab o'tmasin.
        if (await restoreFromCookieSession()) return;
        keepRequestedPage();
        return;
      }
      // Umuman cache yo'q — birinchi marta kirgan mehmon, eng ko'p uchraydigan
      // holat. Bu yerdagi getMe SPEKULYATIV: storage tozalangan-u cookie hali
      // tirik bo'lish ehtimoli uchun. Shu ehtimol uchun butun ilovani tarmoq
      // so'roviga bog'lab qo'ymaymiz (sekin mobil tarmoqda bu bir necha soniya
      // "Olympy yuklanmoqda..." degani) — so'ralgan sahifani DARHOL ko'rsatamiz
      // va tekshiruvni fonda davom ettiramiz. Cookie sessiyasi topilsa,
      // foydalanuvchi javob kelishi bilan dashboard'ga o'tkaziladi (landing bir
      // lahza ko'rinib ketishi — shu noyob holat uchun maqbul narx).
      // Test sahifasi tiklanishi ham buzilmaydi: `urlTestId` yuqorida, hech
      // qanday await'dan oldin URL'dan o'qib olingan.
      keepRequestedPage();
      setBootstrapping(false);
      restoreFromCookieSession({ speculative: true });
    };
    try {
      restore().finally(() => { if (!cancelled) setBootstrapping(false); });
    } catch {
      if (!cancelled) setBootstrapping(false);
    }
    return () => { cancelled = true; };
  }, []);

  const handleLogin = (u) => {
    if (!u?._api) return;
    const requestedPage = pageFromPath();
    setApiUser(u);
    const publicPages = ['login', 'register', 'landing'];
    const dest = (!requestedPage || publicPages.includes(requestedPage))
      ? roleHomePage(u)
      : requestedPage;
    setPage(dest);
    tryResumePendingOlympiad(u);
  };

  const handleLogout = () => {
    setApiUser(null);
    setTestResult(null);
    setActiveOlympiad(null);
    setSwitcherOpen(false);
    // Logout'da faol test ID'sini ham tozalaymiz — boshqa foydalanuvchi
    // shu brauzerda kirsa eski testga tiklanib qolmasligi uchun.
    writeActiveTestId(null);
    try { globalThis.OlympyApi?.clearAuth?.(); } catch {}
    // Race-condition'ni oldini olish: agar foydalanuvchi allaqachon public
    // sahifada bo'lsa (login/register/landing), sahifani o'zgartirmaymiz.
    // Aks holda: foydalanuvchi "Kirish"ni bosib login'ga o'tadi, fonda eski
    // stale token bilan API 401 qaytaradi, 'olympy:logout' fires, va
    // login'dan landing'ga otib yuboriladi.
    setPage(currentPage =>
      ['landing', 'login', 'register'].includes(currentPage) ? currentPage : 'landing'
    );
  };

  // 401 javobi kelganda api.js auth state'ni tozalab 'olympy:logout' yuboradi.
  useEffect(() => {
    const onForcedLogout = () => handleLogout();
    window.addEventListener('olympy:logout', onForcedLogout);
    return () => window.removeEventListener('olympy:logout', onForcedLogout);
  }, []);

  // "Foydalanuvchi sifatida ko'rish" seansini yakunlash. To'liq qayta yuklash
  // ATAYIN: impersonatsiya ostida yig'ilgan barcha React holati (ro'yxatlar,
  // ochiq modallar, komponent keshlari) tashlab yuboriladi va ilova admin
  // sifatida toza boshlanadi.
  const handleEndImpersonation = async () => {
    if (endingImpersonation) return;
    setEndingImpersonation(true);
    try { await globalThis.OlympyApi?.endImpersonation?.(); } catch {}
    setImpersonation(null);
    try { window.location.assign(PAGE_URLS.admin); } catch { setEndingImpersonation(false); }
  };

  // Impersonatsiya tokeni tugagan/bekor qilingan bo'lsa api.js shu hodisani
  // yuboradi (u yerda lokal holat allaqachon tozalangan) — admin o'z paneliga
  // qaytariladi.
  useEffect(() => {
    const onImpersonationEnded = () => {
      setImpersonation(null);
      try { window.location.assign(PAGE_URLS.admin); } catch {}
    };
    window.addEventListener('olympy:impersonation_ended', onImpersonationEnded);
    return () => window.removeEventListener('olympy:impersonation_ended', onImpersonationEnded);
  }, []);

  const navigate = (dest, data) => {
    if (dest === 'test' && data) {
      setActiveOlympiad(data);
      // K17: test sessiyasini F5'dan keyin tiklash uchun olimpiada ID'sini
      // saqlaymiz va URL'ni /test/<id> ga o'tkazamiz.
      const testId = data.backendId ?? data.id ?? null;
      writeActiveTestId(testId);
      try {
        const url = testId != null ? `/test/${testId}` : '/test';
        if (window.location.pathname !== url) {
          window.history.pushState({ page: 'test' }, '', url);
        }
      } catch {}
      setPage('test');
      return;
    }
    if (dest === 'mock-test' && data) {
      // Mashq rejimi — faol olimpiada testi emas, alohida holat. Saqlangan
      // test ID'sini tozalaymiz (mashq proktoringsiz, F5 tiklash kerak emas).
      writeActiveTestId(null);
      setActiveMock(data);
      setPage('mock-test');
      return;
    }
    if (dest === 'results' && data) {
      // Testdan natijaga o'tildi — faol test endi yo'q, saqlangan ID'ni tozalaymiz.
      writeActiveTestId(null);
      setTestResult(data);
      setPage('results');
      return;
    }
    // Boshqa har qanday sahifaga navigatsiya — faol test holatidan chiqadi.
    if (dest !== 'test') writeActiveTestId(null);
    setPage(dest);
  };

  // `page` o'zgarganda URL ni mos sinxronlash. PAGE_URLS da bor sahifalargina
  // pushState chaqiradi; `test` kabi runtime-only sahifalar URL o'zgartirmaydi.
  // Boshlang'ich render paytida URL allaqachon to'g'ri bo'lishi mumkin (deep
  // link) — bu holda pushState chaqirilmaydi.
  useEffect(() => {
    try {
      const url = PAGE_URLS[page];
      if (!url) return;
      if (window.location.pathname === url) return;
      // Dashboard sub-path deep-link'ini buzmaymiz (masalan /dashboard/olympiads
      // → student, /dashboard/owner/staff → owner). Agar URL allaqachon shu
      // `page`ga tegishli bo'lsa (pageFromPath === page), URL'ni base manzilga
      // qaytarib yozmaymiz — ichki sub-tab'ni dashboard komponenti o'zi boshqaradi.
      if (pageFromPath() === page) return;
      window.history.pushState({ page }, '', url);
    } catch {}
  }, [page]);

  // Brauzer orqaga/oldinga tugmalari uchun popstate listener.
  useEffect(() => {
    const handler = (e) => {
      const pg = e.state?.page || pageFromPath();
      if (pg) setPage(pg);
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  const handleTestFinish = (result) => {
    // Test yakunlandi (submit yoki diskvalifikatsiya) — faol test ID'sini
    // tozalaymiz, aks holda F5'da tugagan testga qaytarib yuborardi.
    writeActiveTestId(null);
    setTestResult(result);
    setPage('results');
    const auth = globalThis.OlympyApi?.loadAuth?.();
    if (auth?.token && globalThis.OlympyApi?.getMe) {
      globalThis.OlympyApi.getMe(auth.token)
        .then(fresh => {
          const mapped = globalThis.OlympyApi.mapBackendUser(fresh);
          updateCurrentUser(mapped);
        })
        .catch(() => {});
    }
  };

  // Oflayn outbox: submit paytida tarmoq uzilib navbatga qo'yilgan javoblar
  // ilova yuklanganda va aloqa tiklanganda ('online') avtomatik yuboriladi.
  // Bu asosan tab oflayn paytda yopilib, keyin onlayn qayta ochilgan holat
  // uchun (OlympiadTest komponenti mount bo'lmasa ham). Faol imtihon paytida
  // OlympiadTest o'zi drain qiladi; modul-darajali qulf ikki marta
  // yuborishning oldini oladi. Yangi (200) submitda natijalar sahifasiga
  // o'tkazamiz; "allaqachon topshirilgan" holatda esa jimgina o'chiriladi
  // (natija allaqachon saqlangan, foydalanuvchini majburan ko'chirmaymiz).
  useEffect(() => {
    const queue = globalThis.OlympyOfflineQueue;
    if (!queue) return undefined;
    const drain = () => {
      queue.drainOutbox({
        onSubmitted: (item, resp) => {
          handleTestFinish({
            attemptId: resp?.id,
            correct: resp?.correct_count ?? 0,
            wrong: resp?.wrong_count ?? 0,
            score: resp?.score ?? 0,
            total: resp?.total_questions ?? 0,
            rank: resp?.rank ?? resp?.position ?? null,
            time: resp?.time_spent ?? item?.payload?.time_spent ?? null,
            maxScore: resp?.max_score,
            _api: true,
          });
        },
      });
    };
    drain();
    window.addEventListener('online', drain);
    return () => window.removeEventListener('online', drain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchRole = (role) => {
    if (!user) return;
    const nextUser = { ...user, activeRole: role };
    setApiUser(nextUser);
    try {
      const auth = globalThis.OlympyApi?.loadAuth?.();
      if (auth?.user) globalThis.OlympyApi.saveAuth({ token: auth.token, refresh: auth.refresh, user: nextUser });
    } catch {}
    setSwitcherOpen(false);
    setPage(ROLE_META[role]?.dest || 'student');
  };

  const updateCurrentUser = (nextUser) => {
    if (!nextUser?._api) return;
    setApiUser(nextUser);
    try {
      const auth = globalThis.OlympyApi?.loadAuth?.();
      globalThis.OlympyApi.saveAuth({ token: auth?.token, refresh: auth?.refresh, user: nextUser });
    } catch {}
  };

  // PendingHome pollingi tasdiqlangan/rad etilgan yangi user'ni qaytarganda:
  // state'ni yangilab, roleHomePage orqali mos sahifaga o'tamiz. Hali pending
  // bo'lsa roleHomePage 'pending-home' qaytaradi — sahifa o'zgarmaydi.
  const handlePendingUserRefresh = (nextUser) => {
    updateCurrentUser(nextUser);
    setPage(roleHomePage(nextUser));
  };

  // Auth guard
  useEffect(() => {
    if (NEEDS_AUTH_PAGES.includes(page) && !user) setPage('login');
  }, [page, user]);

  // Mavzu qulfi: theme-ready bo'lmagan sahifada majburiy dark (yuqoridagi
  // THEME_READY_PAGES izohiga qarang). Tanlov o'chirilmaydi — qulf olinishi
  // bilan foydalanuvchining light tanlovi qaytadi.
  useEffect(() => {
    OlympyTheme.setLocked(!THEME_READY_PAGES.has(page));
  }, [page]);

  // ─── Role-gated dashboard renderer ────────────────────────────────────────
  const renderDashboard = (role) => {
    if (!user) return null;
    const status = getRoleStatus(user, role);
    const meta = ROLE_META[role];
    const data = user.roles?.[role];

    if (role === 'student' && status === 'approved') {
      return (
        <StudentDashboard
          user={user}
          onNavigate={navigate}
          onLogout={handleLogout}
          onOpenSwitcher={() => setSwitcherOpen(true)}
          onUserUpdate={updateCurrentUser}
        />
      );
    }

    if (status === 'approved' || (status === 'pending' && role === 'owner')) {
      const props = {
        user, onNavigate: navigate, onLogout: handleLogout,
        onOpenSwitcher: () => setSwitcherOpen(true),
        onUserUpdate: updateCurrentUser,
      };
      // 'student' bu yerda YO'Q — tasdiqlangan o'quvchi yuqorida erta
      // qaytariladi, `pending && owner` sharti esa o'quvchiga tegishli emas.
      if (role === 'manager') return <ManagerDashboard {...props} />;
      if (role === 'teacher') return <TeacherDashboard {...props} />;
      if (role === 'owner')   return <OwnerDashboard {...props} />;
      if (role === 'admin')   return <AdminDashboard {...props} />;
    }

    if (status === 'pending') {
      // Pending foydalanuvchi qaysi markazni kutayotganini ko'rsatamiz. Markaz
      // ma'lumoti user state'idan keladi (mapBackendUser: roles[role].centers[]
      // yoki centerName). Hardcoded emas — mavjud bo'lmasa null qoladi va
      // pastdagi `extra` bloki ko'rsatilmaydi.
      const pendingCenter = data?.centers?.[0] || null;
      const center = pendingCenter
        ? {
            name: pendingCenter.centerName || pendingCenter.name || data?.centerName || '',
            city: pendingCenter.city || pendingCenter.region || '',
          }
        : (data?.centerName
            ? { name: data.centerName, city: '' }
            : null);
      const messages = {
        manager: "Manager paneliga kirish uchun arizangiz tasdiqlanishi kerak. Ariza direktorga yuborildi.",
        teacher: "Savol yaratish uchun o'qituvchi arizangiz tasdiqlanishi kerak. Ariza direktorga yuborildi.",
        owner:   "Direktor paneliga kirish uchun markaz arizangiz Platform Admin tomonidan tasdiqlanishi kerak.",
        student: "Bu ekranga kirish uchun arizangiz tasdiqlanishi kerak.",
      };
      return (
        <PendingAccessCard
          title={`${meta?.label || ''} arizasi kutilmoqda`}
          status="pending"
          message={messages[role] || ''}
          // Bu karta theme-ready `student` sahifasida ham chiziladi (tasdiq
          // kutayotgan o'quvchi `/dashboard`da shu ekranni ko'radi), shuning
          // uchun `glass` + `text-white` emas, tokenlar: karta foni surface-1,
          // demak ichki blok surface-2. Markaz harfi — ustida matn bo'lgan
          // to'ldirilgan yuza, ya'ni `accent-fill` + `on-accent`.
          extra={center?.name && (
            <div className="bg-surface-2 border border-edge rounded-2xl p-4 inline-flex items-center gap-3">
              <div className="w-10 h-10 bg-accent-fill rounded-xl flex items-center justify-center text-on-accent font-bold">{center.name[0]}</div>
              <div className="text-left">
                <div className="text-sm font-semibold text-text-primary">{center.name}</div>
                {center.city && <div className="text-xs text-text-secondary">{center.city}</div>}
              </div>
            </div>
          )}
          onBack={() => setPage(roleHomePage(user))}
        />
      );
    }

    if (status === 'rejected') {
      return (
        <PendingAccessCard
          title={`${meta?.label || ''} arizasi rad etildi`}
          status="rejected"
          message="Arizangiz qabul qilinmadi. Boshqa markaz tanlash yoki support bilan bog'lanish mumkin."
          onBack={() => setPage(roleHomePage(user))}
        />
      );
    }

    // No such role at all
    return (
      <PendingAccessCard
        title="Kirish ruxsat etilmagan"
        status="pending"
        message={`Sizda ${meta?.label || 'bu'} roli mavjud emas. Profil yoki Rolni almashtirish orqali boshqa rolga o'ting.`}
        onBack={() => setPage(roleHomePage(user))}
      />
    );
  };

  // ─── Page renderer ────────────────────────────────────────────────────────
  const renderPage = () => {
    switch (page) {
      case 'landing':       return <LandingPage onNavigate={navigate} user={user} onUserUpdate={updateCurrentUser} />;
      case 'pricing':       return <PricingPage onNavigate={navigate} user={user} onUserUpdate={updateCurrentUser} />;
      case 'login':         return <LoginPage onNavigate={navigate} onLogin={handleLogin} />;
      case 'register':      return <RegisterPage onNavigate={navigate} onLogin={handleLogin} />;
      case 'pending-home':  return <PendingHome user={user} onLogout={handleLogout} onNavigate={navigate} onUserRefresh={handlePendingUserRefresh} />;
      case 'student':       return renderDashboard('student');
      case 'manager':       return renderDashboard('manager');
      case 'teacher':       return renderDashboard('teacher');
      case 'owner':         return renderDashboard('owner');
      case 'admin':         return renderDashboard('admin');
      case 'test': {
        const eventLabel = eventTypeLabel(activeOlympiad?.eventType || 'competition');
        if (activeOlympiad?.status !== 'active') {
          return (
            <PendingAccessCard
              title={`${eventLabel} faol emas`}
              status="pending"
              message={`${eventLabel} faollashtirilgandan keyin kirish mumkin.`}
              onBack={() => setPage(roleHomePage(user))}
            />
          );
        }
        // Public olympiads are open to every authenticated user. Center
        // competitions require approved student membership in the event center.
        const studentRole = user?.roles?.student;
        const isPublicOlympiad = (activeOlympiad?.eventType || 'competition') === 'olympiad';
        const canEnterCompetition = studentRole?.status === 'approved' &&
          studentRole.centerId &&
          String(studentRole.centerId) === String(activeOlympiad?.centerId);
        if (!isPublicOlympiad && !canEnterCompetition) {
          return (
            <PendingAccessCard
              title="Musobaqaga kirish cheklangan"
              status={studentRole?.status === 'rejected' ? 'rejected' : 'pending'}
              message="Musobaqaga qatnashish uchun shu o'quv markaz tasdig'i kerak."
              onBack={() => setPage(roleHomePage(user))}
            />
          );
        }
        return <OlympiadTestPage olympiad={activeOlympiad} user={user} onFinish={handleTestFinish} onNavigate={navigate} />;
      }
      case 'mock-test': {
        // Mashq rejimi (o'tib ketgan olimpiada). activeMock yo'q bo'lsa
        // (masalan F5 bilan to'g'ridan-to'g'ri kirilgan) — dashboardga qaytaramiz.
        if (!activeMock) {
          return (
            <PendingAccessCard
              title="Mashq topilmadi"
              status="pending"
              message="Mashqni qaytadan o'tib ketgan olimpiada kartasidan oching."
              onBack={() => setPage(roleHomePage(user))}
            />
          );
        }
        return <MockTestPage mock={activeMock} user={user} onFinish={handleTestFinish} onNavigate={navigate} />;
      }
      // Reyting theme-ready (THEME_READY_PAGES) — o'rov chizmasi ham token
      // qatlamida bo'lishi shart, aks holda light mavzuda hoshiya ko'rinmaydi.
      // `ThemeToggle` shu qatorda: sahifa o'zining sarlavha qismiga ega emas,
      // boshqa theme-ready ekranlarda esa tugma doim shu joyda turadi.
      //
      // ┌─ Nega `.glass` EMAS (uchala sarlavha qatorida ham) ─────────────────┐
      // │ `.glass` hoshiyani `box-shadow: inset 0 0 0 1px` bilan chizadi, ya'ni│
      // │ TO'RT tomondan halqa. Ustiga qo'yilgan `border-b` esa BOSHQA CSS    │
      // │ xossasi — ikkalasi ham render bo'ladi va pastda bitta intizomli     │
      // │ hairline o'rniga ikkita chiziq chiqadi.                             │
      // │ To'liq kenglikdagi sarlavha qatori uchun to'g'ri naqsh — Landing    │
      // │ navbar'i va Pricing header'idagi kabi: yuza + FAQAT pastki chegara. │
      // └─────────────────────────────────────────────────────────────────────┘
      case 'leaderboard': return (
        <div className="min-h-screen" style={{ background: 'rgb(var(--color-ground))' }}>
          <div className="bg-surface-1 border-b border-edge px-6 py-3 flex items-center gap-3">
            <button type="button" className="cursor-pointer border-0 bg-transparent p-0" onClick={() => navigate(roleHomePage(user))} aria-label="Dashboardga qaytish">
              <BrandLogo size="sm" />
            </button>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              <button onClick={() => navigate(roleHomePage(user))} className="btn-ghost text-xs px-4 py-2 rounded-xl flex items-center gap-1.5">
                <Icon name="arrowLeft" size={13} /> Orqaga
              </button>
            </div>
          </div>
          <LeaderboardPage onNavigate={navigate} user={user} />
        </div>
      );
      case 'profile': return (
        <div className="min-h-screen" style={{ background: 'rgb(var(--color-ground))' }}>
          <div className="bg-surface-1 border-b border-edge px-6 py-3 flex items-center gap-3">
            <button type="button" className="cursor-pointer border-0 bg-transparent p-0" onClick={() => navigate(roleHomePage(user))} aria-label="Dashboardga qaytish">
              <BrandLogo size="sm" />
            </button>
            <button onClick={() => navigate(roleHomePage(user))} className="ml-auto btn-ghost text-xs px-4 py-2 rounded-xl flex items-center gap-1.5">
              <Icon name="arrowLeft" size={13} /> Orqaga
            </button>
          </div>
          <ProfilePage user={user} onUserUpdate={updateCurrentUser} onNavigate={navigate} onLogout={handleLogout} />
        </div>
      );
      // `/dashboard/questions` deep-link'i ilgari renderPage switch'iga
      // tushmasdi va LandingPage ko'rinardi. Endi role home dashboard'iga
      // yo'naltiramiz — u dashboard ichidagi sub-tab orqali kerakli sahifani
      // ochishi mumkin. `results` esa runtime-only sahifa: test natijasi
      // detali (`navigate('results', attempt)`) — `testResult` bo'lsa alohida
      // ResultsPage ko'rsatiladi. (`/dashboard/olympiads`,
      // `/dashboard/results` URL'lari endi `student` sahifasiga
      // yo'naltiriladi va StudentDashboard ichida hal qilinadi.)
      case 'questions':
      case 'results':
        if (page === 'results' && testResult) {
          return (
            <div className="min-h-screen" style={{ background: 'rgb(var(--color-ground))' }}>
              <div className="bg-surface-1 border-b border-edge px-6 py-3 flex items-center gap-3">
                <button type="button" className="cursor-pointer border-0 bg-transparent p-0" onClick={() => navigate(roleHomePage(user))} aria-label="Dashboardga qaytish">
                  <BrandLogo size="sm" />
                </button>
                <button onClick={() => navigate(roleHomePage(user))} className="ml-auto btn-ghost text-xs px-4 py-2 rounded-xl flex items-center gap-1.5">
                  <Icon name="arrowLeft" size={13} /> Dashboardga qaytish
                </button>
              </div>
              <ResultsPage result={testResult} user={user} onNavigate={navigate} />
            </div>
          );
        }
        return renderDashboard(user?.activeRole || (user?.roles ? Object.keys(user.roles)[0] : 'student') || 'student');
      case 'pending':
        return <PendingHome user={user} onLogout={handleLogout} onNavigate={navigate} onUserRefresh={handlePendingUserRefresh} />;
      case 'analytics':
        return <AnalyticsPage user={apiUser || user} onNavigate={navigate} />;
      default: return <LandingPage onNavigate={navigate} user={user} onUserUpdate={updateCurrentUser} />;
    }
  };

  if (bootstrapping) {
    // Avval restore tugamaguncha "landing" sahifasi ko'rinib, keyin esa
    // foydalanuvchi dashboardiga sakrar va flicker hosil bo'lardi. Endi
    // bootstrap davomida loading skeleton ko'rsatamiz.
    return (
      <div className="dark min-h-screen flex items-center justify-center" style={{ background: 'rgb(var(--color-ground))' }}>
        <div className="flex flex-col items-center gap-4 text-text-secondary">
          <BrandLogo size="lg" />
          <div className="w-12 h-12 rounded-full border-2 border-edge border-t-accent animate-spin" />
          <div className="text-sm font-semibold tracking-wide">Olympy yuklanmoqda...</div>
        </div>
      </div>
    );
  }

  return (
    // Impersonatsiya banneri sahifa ustida turadi (fixed), shuning uchun
    // kontentni shuncha pastga suramiz — tepadagi element banner ostida
    // yashirinib qolmasin.
    <div className="dark" style={impersonation ? { paddingTop: 44 } : undefined}>
      {impersonation && (
        <div
          className="fixed top-0 left-0 right-0 z-[10000] flex h-11 items-center justify-between gap-3 border-b border-amber-300 bg-amber-400 px-3 md:px-5 text-[#1a1200]"
          role="status"
        >
          <div className="min-w-0 text-[11px] md:text-xs font-extrabold truncate">
            <span className="hidden sm:inline">Support rejimi · </span>
            Siz <span className="underline underline-offset-2">{impersonation.name || 'foydalanuvchi'}</span> sifatida ko'ryapsiz
            <span className="hidden md:inline"> — bu seans audit jurnaliga yozilgan</span>
          </div>
          <button
            type="button"
            onClick={handleEndImpersonation}
            disabled={endingImpersonation}
            className="shrink-0 rounded-lg bg-[#1a1200] px-3 py-1.5 text-[11px] font-extrabold text-amber-300 hover:bg-black disabled:opacity-60 transition"
          >
            {endingImpersonation ? 'Qaytilmoqda...' : 'Admin panelga qaytish'}
          </button>
        </div>
      )}
      {renderPage()}
      <RoleSwitcherModal
        open={switcherOpen}
        user={user}
        onClose={() => setSwitcherOpen(false)}
        onSwitch={switchRole}
        onLogout={handleLogout}
        onNavigate={navigate}
      />
      <AISupportWidget user={user} />
      {/* Mavzu tugmasi bu yerda EMAS. Ilgari u suzuvchi boshqaruv sifatida shu
          joydan chizilardi (header'larda hali joy yo'q edi), lekin endi har bir
          theme-ready ekran uni O'Z sarlavha qismida ko'rsatadi: Landing navbar,
          Auth o'ng ustun sarlavhasi, StudentDashboard Topbar'i, Pricing header'i
          va PendingAccess kartalari. Suzuvchi variant ular bilan ikkilanardi,
          ustiga Auth'dagi havolani va AI widjeti (z-999) uni yopardi. */}
      {/* Push so'rovi App qobig'ida SHARTSIZ turadi, ya'ni theme-ready
          sahifalar (landing, login, /dashboard, /leaderboard) ustida ham
          suzadi — shuning uchun u qattiq yozilgan qora paneldan token
          qatlamiga ko'chirildi. `backdrop-blur`, gradient va rangli soya yo'q;
          suzuvchi panel fondan `edge-strong` hoshiya bilan ajraladi. */}
      {showPushPrompt && page !== 'test' && (
        <div
          className="fixed bottom-4 left-4 right-4 md:left-auto md:bottom-6 md:right-6 z-[9999] max-w-sm md:w-[384px] p-5 rounded-2xl bg-surface-1 border border-edge-strong"
          style={{ animation: 'slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)' }}
          role="dialog"
          aria-label="Bildirishnomalarni yoqish"
        >
          <div className="flex gap-4">
            {/* Belgi matn ko'tarmaydi — to'ldirilgan akcent yuza emas, neytral
                plastinka + `accent` ikonka. */}
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-surface-2 border border-edge text-accent">
              <Icon name="bell" size={22} />
            </div>
            <div className="flex-1">
              <h4 className="font-extrabold text-sm mb-1 text-text-primary tracking-tight">Bildirishnomalarni yoqasizmi?</h4>
              <p className="text-xs text-text-secondary leading-relaxed mb-4">
                Yangi olimpiadalar, musobaqalar va natijalaringiz haqidagi xabarlarni sayt yopiq bo'lsa ham birinchilardan bo'lib bilib olasiz.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={handlePushDecline}
                  className="btn-ghost px-3.5 py-1.5 rounded-xl text-xs font-semibold"
                >
                  Keyinroq
                </button>
                <button
                  type="button"
                  onClick={handlePushAccept}
                  className="btn-primary px-4 py-1.5 rounded-xl text-xs font-bold"
                >
                  Ha, yoqish
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};


// Public sertifikat tekshirish sahifasi (Feature #5) — App'dan TASHQARIDA
// ishlaydi, shuning uchun JWT restore/auth guard umuman ishga tushmaydi
// (login talab qilinmaydi). /certificates/verify/<uuid>[/] URL'ini ushlaymiz.
const certVerifyUuid = (() => {
  try {
    const raw = (window.location.pathname || '').replace(/\/+$/, '');
    const m = raw.match(/^\/certificates\/verify\/([^/]+)$/);
    return m ? m[1] : null;
  } catch { return null; }
})();

// Public yutuqlar portfoliosi tekshirish sahifasi (Feature #5, Pro) — App'dan
// TASHQARIDA ishlaydi (login talab qilinmaydi). /portfolio/verify/<uuid>[/].
const portfolioVerifyUuid = (() => {
  try {
    const raw = (window.location.pathname || '').replace(/\/+$/, '');
    const m = raw.match(/^\/portfolio\/verify\/([^/]+)$/);
    return m ? m[1] : null;
  } catch { return null; }
})();

const root = ReactDOM.createRoot(document.getElementById('root'));
if (certVerifyUuid) {
  root.render(<ErrorBoundary><CertificateVerifyPage uuid={certVerifyUuid} /></ErrorBoundary>);
} else if (portfolioVerifyUuid) {
  root.render(<ErrorBoundary><PortfolioVerifyPage uuid={portfolioVerifyUuid} /></ErrorBoundary>);
} else {
  root.render(<ErrorBoundary><App /></ErrorBoundary>);
}
