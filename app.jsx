// app.jsx — Main router & state (store-driven)

const { useState, useEffect } = React;

// Page <-> URL mapping. Brauzer manzil satrida sahifa o'zgarishini ko'rsatish
// va orqaga/oldinga tugmalari ishlashi uchun ishlatiladi.
//
// Eslatma: `results` sahifasi URL o'zgartirmaydi — u runtime state
// (testResult) bilan boshqariladi. `test` esa endi URL'ga bog'langan
// (/test/<id>) va F5'dan keyin sessiya localStorage'dan tiklanadi.
const PAGE_URLS = {
  landing: '/',
  login: '/login',
  register: '/register',
  student: '/dashboard',
  teacher: '/dashboard/teacher',
  manager: '/manager',
  owner: '/owner',
  admin: '/admin',
  questions: '/dashboard/questions',
  olympiads: '/dashboard/olympiads',
  results: '/dashboard/results',
  leaderboard: '/leaderboard',
  profile: '/profile',
  pending: '/pending',
  'pending-home': '/pending',
  analytics: '/analytics',
  parent: '/dashboard/parent',
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
const NEEDS_AUTH_PAGES = ['student','manager','admin','teacher','owner','test','results','leaderboard','profile','pending','pending-home','analytics','parent','questions','olympiads'];

const pageFromPath = () => {
  try {
    const raw = window.location.pathname || '/';
    const path = raw === '/' ? '/' : raw.replace(/\/+$/, '');
    // /test va /test/<id> — test sahifasi (dinamik segment URL_PAGES'da yo'q).
    if (/^\/test(\/.*)?$/.test(path)) return 'test';
    if (URL_PAGES[path]) return URL_PAGES[path];
    if (path === '/' || path === '') return 'landing';
  } catch {}
  return null;
};

const App = () => {
  const [page, setPage] = React.useState(() => pageFromPath() || 'landing');
  const [testResult, setTestResult] = React.useState(null);
  const [activeOlympiad, setActiveOlympiad] = React.useState(null);
  const [switcherOpen, setSwitcherOpen] = React.useState(false);
  const [apiUser, setApiUser] = React.useState(null);
  // restore tugamasidan oldin landing flicker'i ko'rinmasligi uchun bootstrap
  // bayrog'i: true bo'lsa, butun ekran loaderda turadi va shundan so'nggina
  // haqiqiy sahifa render bo'ladi.
  const [bootstrapping, setBootstrapping] = React.useState(true);
  // Splash + Duolingo onboarding (faqat birinchi marta, localStorage flag).
  // Boshlang'ich qiymat URL '/' (landing) va onboarding tugatilmaganida true.
  // Deep-link (masalan /login, /dashboard) yoki takroriy kirishda ko'rinmaydi.
  const [showSplash, setShowSplash] = React.useState(() => {
    try {
      const onLanding = (window.location.pathname || '/') === '/';
      const seen = (typeof isOnboardingDone === 'function') ? isOnboardingDone() : true;
      return onLanding && !seen;
    } catch { return false; }
  });

  // `booting-light` (index.html'dagi mount-oldi oq fon) — splash/onboarding
  // ko'rsatilib turganда saqlanadi (orqada to'q body ko'rinmasligi uchun).
  // Splash tugaгач (showSplash=false) olib tashlaymiz: keyin fonni
  // komponentlarning o'zi beradi (duo-screen — light; dark sahifalar —
  // body.dark).
  React.useEffect(() => {
    if (showSplash) return;
    try { document.documentElement.classList.remove('booting-light'); } catch {}
  }, [showSplash]);

  const user = apiUser;

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
      if (auth?.user) {
        try {
          const freshUser = await globalThis.OlympyApi?.getMe?.(null);
          if (!freshUser || cancelled) throw new Error('Stale session');
          const mappedUser = globalThis.OlympyApi.mapBackendUser(freshUser);
          globalThis.OlympyApi.saveAuth({ user: mappedUser, cookieAuth: true });
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
      }
      try {
        const freshUser = await globalThis.OlympyApi?.getMe?.(null);
        if (!freshUser || cancelled) throw new Error('No cookie session');
        const mappedUser = globalThis.OlympyApi.mapBackendUser(freshUser);
        globalThis.OlympyApi.saveAuth({ user: mappedUser, cookieAuth: true });
        setApiUser(mappedUser);
        if (requestedPage === 'test') {
          const restored = await tryRestoreActiveTest(mappedUser, urlTestId);
          if (cancelled) return;
          if (!restored) setPage(roleHomePage(mappedUser));
          return;
        }
        const publicPages2 = ['login', 'register', 'landing'];
        const dest2 = (!requestedPage || publicPages2.includes(requestedPage))
          ? roleHomePage(mappedUser) : requestedPage;
        setPage(dest2);
        tryResumePendingOlympiad(mappedUser);
        return;
      } catch {}
      // Autentifikatsiyasiz /test ochilsa — auth guard login'ga yo'naltiradi.
      if (!cancelled && requestedPage && requestedPage !== 'test') setPage(requestedPage);
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

  // Auth guard
  useEffect(() => {
    if (NEEDS_AUTH_PAGES.includes(page) && !user) setPage('login');
  }, [page, user]);

  // ─── Role-gated dashboard renderer ────────────────────────────────────────
  const renderDashboard = (role) => {
    if (!user) return null;
    const status = getRoleStatus(user, role);
    const meta = ROLE_META[role];
    const data = user.roles?.[role];

    if (role === 'student' && status) {
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

    if (status === 'approved') {
      const props = {
        user, onNavigate: navigate, onLogout: handleLogout,
        onOpenSwitcher: () => setSwitcherOpen(true),
        onUserUpdate: updateCurrentUser,
      };
      if (role === 'student') return <StudentDashboard {...props} />;
      if (role === 'manager') return <ManagerDashboard {...props} />;
      if (role === 'teacher') return <TeacherDashboard {...props} />;
      if (role === 'owner')   return <OwnerDashboard {...props} />;
      if (role === 'admin')   return <AdminDashboard {...props} />;
    }

    if (status === 'pending') {
      const center = null;
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
          extra={center && (
            <div className="glass rounded-2xl p-4 inline-flex items-center gap-3">
              <div className="w-10 h-10 gradient-bg rounded-xl flex items-center justify-center text-white font-bold">{center.name[0]}</div>
              <div className="text-left">
                <div className="text-sm font-semibold text-white">{center.name}</div>
                <div className="text-xs text-white/40">{center.city}</div>
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
      case 'landing':       return <LandingPage onNavigate={navigate} user={user} />;
      case 'login':         return <LoginPage onNavigate={navigate} onLogin={handleLogin} />;
      case 'register':      return <RegisterPage onNavigate={navigate} onLogin={handleLogin} />;
      case 'pending-home':  return <PendingHome user={user} onLogout={handleLogout} onNavigate={navigate} />;
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
      case 'leaderboard': return (
        <div className="min-h-screen" style={{ background: '#050508' }}>
          <div className="glass border-b border-white/5 px-6 py-3 flex items-center gap-3">
            <button type="button" className="cursor-pointer border-0 bg-transparent p-0" onClick={() => navigate(roleHomePage(user))} aria-label="Dashboardga qaytish">
              <BrandLogo size="sm" />
            </button>
            <button onClick={() => navigate(roleHomePage(user))} className="ml-auto btn-ghost text-xs px-4 py-2 rounded-xl flex items-center gap-1.5">
              <Icon name="arrowLeft" size={13} /> Orqaga
            </button>
          </div>
          <LeaderboardPage onNavigate={navigate} user={user} />
        </div>
      );
      case 'profile': return (
        <div className="min-h-screen" style={{ background: '#050508' }}>
          <div className="glass border-b border-white/5 px-6 py-3 flex items-center gap-3">
            <button type="button" className="cursor-pointer border-0 bg-transparent p-0" onClick={() => navigate(roleHomePage(user))} aria-label="Dashboardga qaytish">
              <BrandLogo size="sm" />
            </button>
            <button onClick={() => navigate(roleHomePage(user))} className="ml-auto btn-ghost text-xs px-4 py-2 rounded-xl flex items-center gap-1.5">
              <Icon name="arrowLeft" size={13} /> Orqaga
            </button>
          </div>
          <ProfilePage user={user} onUserUpdate={updateCurrentUser} onNavigate={navigate} />
        </div>
      );
      // /dashboard/questions, /dashboard/olympiads, /dashboard/results deep
      // linklari ilgari renderPage switch'iga tushmasdi va LandingPage
      // ko'rinardi. Endi role home dashboard'iga yo'naltiramiz — u dashboard
      // ichidagi sub-tab orqali kerakli sahifani ochishi mumkin.
      case 'questions':
      case 'olympiads':
      case 'results':
        if (page === 'results' && testResult) {
          return (
            <div className="min-h-screen" style={{ background: '#050508' }}>
              <div className="glass border-b border-white/5 px-6 py-3 flex items-center gap-3">
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
        return <PendingHome user={user} onLogout={handleLogout} onNavigate={navigate} />;
      case 'analytics':
        return <AnalyticsPage user={apiUser || user} onNavigate={navigate} />;
      case 'parent':
        return <ParentDashboard user={apiUser || user} onNavigate={navigate} onLogout={handleLogout} />;
      default: return <LandingPage onNavigate={navigate} user={user} />;
    }
  };

  if (bootstrapping) {
    // Avval restore tugamaguncha "landing" sahifasi ko'rinib, keyin esa
    // foydalanuvchi dashboardiga sakrar va flicker hosil bo'lardi. Endi
    // bootstrap davomida loading skeleton ko'rsatamiz.
    //
    // Birinchi tashrif (showSplash) — light Duolingo splash bilan uzluksiz
    // bo'lishi uchun loader ham light. Aks holda (takroriy/deep-link) eski
    // dark loader saqlanadi.
    if (showSplash) {
      return (
        <div className="duo-splash">
          <div className="duo-splash-mark flex flex-col items-center gap-5">
            <BrandLogo size="xl" variant="wordmark" />
            <div className="w-10 h-10 rounded-full animate-spin"
              style={{ border: '3px solid var(--duo-border)', borderTopColor: 'var(--duo-green)' }} />
          </div>
        </div>
      );
    }
    return (
      <div className="dark min-h-screen flex items-center justify-center" style={{ background: '#050508' }}>
        <div className="flex flex-col items-center gap-4 text-white/70">
          <BrandLogo size="lg" />
          <div className="w-12 h-12 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          <div className="text-sm font-semibold tracking-wide">Olympy yuklanmoqda...</div>
        </div>
      </div>
    );
  }

  // Splash + Duolingo marketing onboarding (birinchi tashrif). Faqat
  // autentifikatsiyasiz foydalanuvchi uchun va flag o'rnatilmaganida.
  // Wizard ichida tugatilгач `login`/`register` ga o'tadi.
  if (showSplash && !user) {
    return (
      <SplashOnboarding
        onFinish={(dest) => {
          setShowSplash(false);
          navigate(dest === 'register' ? 'register' : 'login');
        }}
      />
    );
  }

  // OB1: Onboarding sehrgar — faqat tizimga kirgan o'quvchi uchun va
  // onboarding tugatilmagan bo'lsa. Test/auth sahifalarida ko'rsatmaymiz
  // (test jarayonini buzmaslik uchun). Wizard butun ekranni egallaydi.
  const studentStatus = user?.roles?.student?.status;
  const showOnboarding = (
    !!user &&
    user.onboardingCompleted === false &&
    !!studentStatus &&
    !['test', 'login', 'register', 'landing'].includes(page)
  );

  return (
    <div key={page} className="dark">
      {renderPage()}
      {showOnboarding && (
        <OnboardingWizard
          user={user}
          onUserUpdate={updateCurrentUser}
          onComplete={() => {
            // user obyekti onUserUpdate orqali allaqachon yangilangan
            // (onboardingCompleted=true) — wizard avtomatik yopiladi.
            // Qo'shimcha kafolat: backend'dan yangi user'ni tortib olamiz.
            const auth = globalThis.OlympyApi?.loadAuth?.();
            if (globalThis.OlympyApi?.getMe) {
              globalThis.OlympyApi.getMe(auth?.token)
                .then(fresh => updateCurrentUser(globalThis.OlympyApi.mapBackendUser(fresh)))
                .catch(() => {});
            }
          }}
        />
      )}
      <RoleSwitcherModal
        open={switcherOpen}
        user={user}
        onClose={() => setSwitcherOpen(false)}
        onSwitch={switchRole}
        onLogout={handleLogout}
        onNavigate={navigate}
      />
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
