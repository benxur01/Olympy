// app.jsx — Main router & state (store-driven)

const { useState, useEffect } = React;

// Page <-> URL mapping. Brauzer manzil satrida sahifa o'zgarishini ko'rsatish
// va orqaga/oldinga tugmalari ishlashi uchun ishlatiladi.
//
// Eslatma: `test` va `results` sahifalari URL o'zgartirmaydi — ular runtime
// state (testResult, activeOlympiad) bilan boshqariladi va to'g'ridan link
// ochilsa qayta tiklab bo'lmaydi.
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

const pageFromPath = () => {
  try {
    const raw = window.location.pathname || '/';
    const path = raw === '/' ? '/' : raw.replace(/\/+$/, '');
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

  const user = apiUser;

  // Persist backend JWT session only.
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      const requestedPage = pageFromPath();
      const auth = globalThis.OlympyApi?.loadAuth?.();
      // localStorage'dagi user obyektiga ko'r-ko'rona ishonmaslik —
      // token eskirgan bo'lsa dashboard 401 olib bounce loop yaratadi.
      // Avval getMe bilan validate qilamiz.
      if (auth?.user && auth?.token) {
        try {
          const freshUser = await globalThis.OlympyApi?.getMe?.(auth.token);
          if (!freshUser || cancelled) throw new Error('Stale token');
          const mappedUser = globalThis.OlympyApi.mapBackendUser(freshUser);
          globalThis.OlympyApi.saveAuth({ token: auth.token, refresh: auth.refresh, user: mappedUser });
          setApiUser(mappedUser);
          const publicPages = ['login', 'register', 'landing'];
          const dest1 = (!requestedPage || publicPages.includes(requestedPage))
            ? roleHomePage(mappedUser) : requestedPage;
          setPage(dest1);
          setBootstrapping(false);
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
        const publicPages2 = ['login', 'register', 'landing'];
        const dest2 = (!requestedPage || publicPages2.includes(requestedPage))
          ? roleHomePage(mappedUser) : requestedPage;
        setPage(dest2);
        return;
      } catch {}
      if (!cancelled && requestedPage) setPage(requestedPage);
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
  };

  const handleLogout = () => {
    setApiUser(null);
    setTestResult(null);
    setActiveOlympiad(null);
    setSwitcherOpen(false);
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
    if (dest === 'test' && data) { setActiveOlympiad(data); setPage('test'); return; }
    if (dest === 'results' && data) { setTestResult(data); setPage('results'); return; }
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
    setTestResult(result);
    setPage('results');
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
  const needsAuth = ['student','manager','admin','teacher','owner','test','results','leaderboard','profile','pending-home'];
  useEffect(() => {
    if (needsAuth.includes(page) && !user) setPage('login');
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
      case 'landing':       return <LandingPage onNavigate={navigate} />;
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
        const startsAt = olympiadStartMoment(activeOlympiad);
        if (startsAt && startsAt.getTime() > Date.now()) {
          return (
            <PendingAccessCard
              title={`${eventLabel} hali boshlanmagan`}
              status="pending"
              message={`${eventLabel} ${startsAt.toLocaleString('uz-UZ')} dan boshlanadi. Iltimos, kuting.`}
              onBack={() => setPage(roleHomePage(user))}
            />
          );
        }
        return <OlympiadTestPage olympiad={activeOlympiad} user={user} onFinish={handleTestFinish} onNavigate={navigate} />;
      }
      case 'results': return (
        <div className="min-h-screen" style={{ background: '#060818' }}>
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
      case 'leaderboard': return (
        <div className="min-h-screen" style={{ background: '#060818' }}>
          <div className="glass border-b border-white/5 px-6 py-3 flex items-center gap-3">
            <button type="button" className="cursor-pointer border-0 bg-transparent p-0" onClick={() => navigate(roleHomePage(user))} aria-label="Dashboardga qaytish">
              <BrandLogo size="sm" />
            </button>
            <button onClick={() => navigate(roleHomePage(user))} className="ml-auto btn-ghost text-xs px-4 py-2 rounded-xl flex items-center gap-1.5">
              <Icon name="arrowLeft" size={13} /> Orqaga
            </button>
          </div>
          <LeaderboardPage onNavigate={navigate} />
        </div>
      );
      default: return <LandingPage onNavigate={navigate} />;
    }
  };

  if (bootstrapping) {
    // Avval restore tugamaguncha "landing" sahifasi ko'rinib, keyin esa
    // foydalanuvchi dashboardiga sakrar va flicker hosil bo'lardi. Endi
    // bootstrap davomida loading skeleton ko'rsatamiz.
    return (
      <div className="dark min-h-screen flex items-center justify-center" style={{ background: '#060818' }}>
        <div className="flex flex-col items-center gap-4 text-white/70">
          <BrandLogo size="lg" />
          <div className="w-12 h-12 rounded-full border-2 border-white/20 border-t-indigo-400 animate-spin" />
          <div className="text-sm font-semibold tracking-wide">Olympy yuklanmoqda...</div>
        </div>
      </div>
    );
  }

  return (
    <div key={page} className="dark">
      {renderPage()}
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
