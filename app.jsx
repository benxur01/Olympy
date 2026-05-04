// app.jsx — Main router & state (store-driven)

const { useState, useEffect } = React;

const pageFromPath = () => {
  try {
    const path = window.location.pathname.replace(/\/+$/, '');
    if (path === '/admin') return 'admin';
  } catch {}
  return null;
};

const App = () => {
  const [page, setPage] = React.useState('landing');
  const [testResult, setTestResult] = React.useState(null);
  const [activeOlympiad, setActiveOlympiad] = React.useState(null);
  const [switcherOpen, setSwitcherOpen] = React.useState(false);
  const [apiUser, setApiUser] = React.useState(null);

  const user = apiUser;

  // Persist backend JWT session only.
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      const requestedPage = pageFromPath();
      const auth = globalThis.OlympyApi?.loadAuth?.();
      if (auth?.user) {
        if (cancelled) return;
        setApiUser(auth.user);
        setPage(requestedPage || roleHomePage(auth.user));
        return;
      }
      try {
        const freshUser = await globalThis.OlympyApi?.getMe?.(null);
        if (!freshUser || cancelled) throw new Error('No cookie session');
        const mappedUser = globalThis.OlympyApi.mapBackendUser(freshUser);
        globalThis.OlympyApi.saveAuth({ user: mappedUser, cookieAuth: true });
        setApiUser(mappedUser);
        setPage(requestedPage || roleHomePage(mappedUser));
        return;
      } catch {}
      if (!cancelled && requestedPage) setPage(requestedPage);
    };
    try { restore(); } catch {}
    return () => { cancelled = true; };
  }, []);

  const handleLogin = (u) => {
    if (!u?._api) return;
    const requestedPage = pageFromPath();
    setApiUser(u);
    setPage(requestedPage || roleHomePage(u));
  };

  const handleLogout = () => {
    setApiUser(null);
    setTestResult(null);
    setActiveOlympiad(null);
    setSwitcherOpen(false);
    try { globalThis.OlympyApi?.clearAuth?.(); } catch {}
    setPage('landing');
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
        />
      );
    }

    if (status === 'approved') {
      const props = {
        user, onNavigate: navigate, onLogout: handleLogout,
        onOpenSwitcher: () => setSwitcherOpen(true),
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
        // Olympiad start guard: student must be approved at the olympiad's center
        const studentRole = user?.roles?.student;
        if (!studentRole || studentRole.status !== 'approved' || !studentRole.centerId) {
          return (
            <PendingAccessCard
              title="Olimpiadaga kirish cheklangan"
              status={studentRole?.status === 'rejected' ? 'rejected' : 'pending'}
              message="Olimpiadaga qatnashish uchun o'quv markaz tasdig'i kerak."
              onBack={() => setPage(roleHomePage(user))}
            />
          );
        }
        const startsAt = olympiadStartMoment(activeOlympiad);
        if (startsAt && startsAt.getTime() > Date.now()) {
          return (
            <PendingAccessCard
              title="Olimpiada hali boshlanmagan"
              status="pending"
              message={`Olimpiada ${startsAt.toLocaleString('uz-UZ')} dan boshlanadi. Iltimos, kuting.`}
              onBack={() => setPage(roleHomePage(user))}
            />
          );
        }
        return <OlympiadTestPage olympiad={activeOlympiad} user={user} onFinish={handleTestFinish} onNavigate={navigate} />;
      }
      case 'results': return (
        <div className="min-h-screen" style={{ background: '#060818' }}>
          <div className="glass border-b border-white/5 px-6 py-3 flex items-center gap-3">
            <div className="gradient-bg w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer" onClick={() => navigate(roleHomePage(user))}>
              <span className="text-white font-black text-xs">O</span>
            </div>
            <span className="gradient-text font-black">Olympy</span>
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
            <div className="gradient-bg w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer" onClick={() => navigate(roleHomePage(user))}>
              <span className="text-white font-black text-xs">O</span>
            </div>
            <span className="gradient-text font-black">Olympy</span>
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
