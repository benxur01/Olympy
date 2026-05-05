// pages/TeacherDashboard.jsx — Teacher panel: olympiads + question creation only

const TeacherDashboard = ({ user, onNavigate, onLogout, onOpenSwitcher }) => {
  const store = useStore();
  const isApi = !!user?._api;
  const [page, setPage] = React.useState('home');
  const [mobileMenu, setMobileMenu] = React.useState(false);
  const [createModal, setCreateModal] = React.useState(false);
  const [toast, setToast] = React.useState('');
  const [newOlympiad, setNewOlympiad] = React.useState({
    title: '',
    subject: store.subjects[0] || 'Matematika',
    startDate: '',
    startTime: '10:00',
    duration: 60,
    maxScore: 100,
  });

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const teacherRole = user?.roles?.teacher;
  const centerId = teacherRole?.centerId || null;

  const apiCentersRes = useApiData(
    () => isApi ? OlympyApi.getCenters() : Promise.resolve(null),
    [isApi],
  );
  const apiOlympiadsRes = useApiData(
    () => isApi ? OlympyApi.getOlympiads(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  const apiQuestionsRes = useApiData(
    () => (isApi && centerId)
      ? OlympyApi.getQuestions(centerId, OlympyApi.getToken())
      : Promise.resolve(null),
    [isApi, centerId],
  );

  const apiCenters = isApi && Array.isArray(apiCentersRes.data) ? apiCentersRes.data.map(mapApiCenter) : null;
  const apiOlympiads = isApi && Array.isArray(apiOlympiadsRes.data) ? apiOlympiadsRes.data.map(mapApiOlympiad) : null;
  const apiQuestions = isApi && Array.isArray(apiQuestionsRes.data) ? apiQuestionsRes.data.map(mapApiQuestion) : null;
  const baseCenters = isApi ? (apiCenters || []) : store.centers;
  const center = centerId ? baseCenters.find(c => String(c.id) === String(centerId)) : null;
  const centerName = center?.name || 'Tashkilot';
  const centerType = center?.organizationType || "O'quv markaz";
  const olympiads = (isApi ? (apiOlympiads || []) : store.olympiads).filter(o => String(o.centerId) === String(centerId));
  const questions = (isApi ? (apiQuestions || []) : store.questions).filter(q => String(q.centerId) === String(centerId));
  const activeOlympiads = olympiads.filter(o => o.status === 'active');

  if (!center) {
    return (
      <PendingAccessCard
        title="Ustoz paneli ochilmadi"
        status="pending"
        message="Ustoz paneliga kirish uchun direktor sizni tasdiqlangan tashkilotga biriktirishi kerak."
        onBack={() => onNavigate('landing')}
      />
    );
  }

  const navItems = [
    { key: 'home', icon: 'home', label: 'Asosiy' },
    { key: 'olympiads', icon: 'trophy', label: 'Olimpiadalar' },
    { key: 'questions', icon: 'book', label: 'Savollar' },
  ];

  const resetOlympiadForm = () => {
    setNewOlympiad({
      title: '',
      subject: store.subjects[0] || 'Matematika',
      startDate: '',
      startTime: '10:00',
      duration: 60,
      maxScore: 100,
    });
  };

  const createOlympiad = () => {
    if (!newOlympiad.title.trim() || !newOlympiad.startDate) {
      showToast('Nomi va sanani kiriting');
      return;
    }
    if (isApi) {
      const backendCenterId = center?.backendId ?? centerId;
      const startIso = `${newOlympiad.startDate}T${newOlympiad.startTime || '00:00'}:00`;
      OlympyApi.createOlympiad({
        center: backendCenterId,
        title: newOlympiad.title.trim(),
        subject: newOlympiad.subject,
        start_datetime: startIso,
        duration_minutes: newOlympiad.duration,
        max_score: newOlympiad.maxScore,
      }, OlympyApi.getToken())
        .then(() => {
          apiOlympiadsRes.reload();
          setCreateModal(false);
          resetOlympiadForm();
          showToast('Olimpiada yaratildi');
        })
        .catch(err => {
          console.warn('teacher createOlympiad failed:', err);
          showToast("Olimpiada yaratib bo'lmadi");
        });
      return;
    }
    OlympyStore.createOlympiad({
      centerId,
      title: newOlympiad.title.trim(),
      subject: newOlympiad.subject,
      startDate: newOlympiad.startDate,
      startTime: newOlympiad.startTime,
      duration: newOlympiad.duration,
      maxScore: newOlympiad.maxScore,
      status: 'draft',
      createdBy: user.id,
    });
    setCreateModal(false);
    resetOlympiadForm();
    showToast('Olimpiada yaratildi');
  };

  const renderHome = () => (
    <div className="p-6 space-y-6 animate-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-black text-white">{centerName}</h2>
          <p className="text-white/40 text-sm">{centerType} · Ustoz paneli · olimpiada va savollar</p>
        </div>
        <button onClick={() => setCreateModal(true)} className="btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2">
          <Icon name="plus" size={16} /> Olimpiada yaratish
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Olimpiadalar" value={olympiads.length} icon={<Icon name="trophy" size={20} />} color="from-amber-500 to-orange-500" />
        <StatCard label="Faol olimpiadalar" value={activeOlympiads.length} icon={<Icon name="bolt" size={20} />} color="from-emerald-500 to-teal-600" />
        <StatCard label="Savollar" value={questions.length} icon={<Icon name="book" size={20} />} color="from-indigo-500 to-purple-600" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="glass rounded-2xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold text-white">Oxirgi olimpiadalar</h3>
            <button onClick={() => setPage('olympiads')} className="text-xs text-indigo-400">Ko'rish</button>
          </div>
          <div className="space-y-3">
            {olympiads.slice(0, 4).map(o => (
              <div key={o.id} className="flex items-center gap-3 rounded-xl glass p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300"><Icon name="trophy" size={16} /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">{o.title}</div>
                  <div className="text-xs text-white/40">{o.subject}{o.testLevel ? ` · ${o.testLevel}` : ''}{o.testType ? ` · ${testTypeLabel(o.testType)}` : ''} · {o.startDate || 'Sana yoq'}</div>
                </div>
                <Badge status={statusLabel(o.status)} />
              </div>
            ))}
            {olympiads.length === 0 && <div className="text-sm text-white/40">Hali olimpiada yo'q</div>}
          </div>
        </div>
        <div className="glass rounded-2xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold text-white">Savollar bazasi</h3>
            <button onClick={() => setPage('questions')} className="text-xs text-indigo-400">Savol yaratish</button>
          </div>
          <div className="space-y-3">
            {questions.slice(0, 4).map(q => (
              <div key={q.id} className="rounded-xl glass p-3">
                <div className="line-clamp-2 text-sm text-white/80">{q.text}</div>
                <div className="mt-2 flex items-center gap-2 text-xs text-white/40">
                  <SubjectBadge subject={q.subject} />
                  <span>{q.score || 0} ball</span>
                </div>
              </div>
            ))}
            {questions.length === 0 && <div className="text-sm text-white/40">Hali savol yo'q</div>}
          </div>
        </div>
      </div>
    </div>
  );

  const renderOlympiads = () => (
    <div className="p-6 space-y-6 animate-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-black text-white">Tadbirlar</h2>
          <p className="text-white/40 text-sm">{centerName} · {centerType}</p>
        </div>
        <button onClick={() => setCreateModal(true)} className="btn-primary px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2">
          <Icon name="plus" size={15} /> Yangi tadbir
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {olympiads.map(o => (
          <div key={o.id} className="glass rounded-2xl p-5 flex items-center gap-4 flex-wrap">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-300">
              <Icon name="trophy" size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-white">{o.title}</div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-white/40">
                <SubjectBadge subject={o.subject} />
                {o.testLevel && <span className="rounded-lg bg-violet-500/15 px-2 py-1 font-bold text-violet-300">Daraja: {o.testLevel}</span>}
                {o.testType && <span className="rounded-lg bg-sky-500/15 px-2 py-1 font-bold text-sky-300">Tur: {testTypeLabel(o.testType)}</span>}
                <span>{o.startDate || 'Sana yoq'}</span>
                <span>{o.duration || 60} min</span>
                <span>{(o.questionIds || []).length} ta savol</span>
              </div>
            </div>
            <Badge status={statusLabel(o.status)} />
          </div>
        ))}
        {olympiads.length === 0 && (
          <EmptyState
            icon="trophy"
            title="Olimpiadalar yo'q"
            desc="Birinchi olimpiadangizni yarating"
            action={<button onClick={() => setCreateModal(true)} className="btn-primary px-4 py-2 rounded-xl text-sm">Yaratish</button>}
          />
        )}
      </div>
    </div>
  );

  const pagesMap = {
    home: renderHome,
    olympiads: renderOlympiads,
    questions: () => <QuestionCreatorPage embedded user={user} />,
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        items={navItems}
        activePage={page}
        setPage={setPage}
        user={{ ...user, role: "O'qituvchi" }}
        onLogout={onLogout}
        logoClick={() => onNavigate('landing')}
        mobileOpen={mobileMenu}
        onMobileClose={() => setMobileMenu(false)}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar
          title={navItems.find(n => n.key === page)?.label || 'Ustoz paneli'}
          subtitle={`${centerName} · ${centerType}`}
          user={user}
          onMenuClick={() => setMobileMenu(true)}
          actions={
            <div className="flex items-center gap-2">
              {onOpenSwitcher && (
                <button onClick={onOpenSwitcher} className="btn-ghost text-xs px-3 py-2 rounded-xl hidden md:flex items-center gap-1.5">
                  <Icon name="users" size={13} /> Rolni almashtirish
                </button>
              )}
              <button onClick={() => setCreateModal(true)} className="btn-primary text-xs px-4 py-2 rounded-xl font-semibold hidden md:flex items-center gap-1">
                <Icon name="plus" size={14} /> Olimpiada
              </button>
            </div>
          }
        />
        <main className="flex-1 overflow-y-auto">
          {(pagesMap[page] || renderHome)()}
        </main>
        <MobileBottomNav items={navItems} activePage={page} setPage={setPage} />
      </div>

      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Olimpiada yaratish" width="max-w-xl">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-white/50 mb-1.5 font-medium">Olimpiada nomi</label>
            <input className="input-field" placeholder="Matematika olimpiadasi" value={newOlympiad.title} onChange={e => setNewOlympiad({ ...newOlympiad, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">Fan</label>
              <select className="input-field" value={newOlympiad.subject} onChange={e => setNewOlympiad({ ...newOlympiad, subject: e.target.value })}>
                {store.subjects.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">Davomiyligi</label>
              <input type="number" className="input-field" value={newOlympiad.duration} onChange={e => setNewOlympiad({ ...newOlympiad, duration: +e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">Boshlanish sanasi</label>
              <input type="date" className="input-field" value={newOlympiad.startDate} onChange={e => setNewOlympiad({ ...newOlympiad, startDate: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">Boshlanish vaqti</label>
              <input type="time" className="input-field" value={newOlympiad.startTime} onChange={e => setNewOlympiad({ ...newOlympiad, startTime: e.target.value })} />
            </div>
          </div>
          <div className="glass rounded-xl p-3 border border-indigo-500/15 text-xs text-indigo-200">
            <Icon name="info" size={12} className="inline" /> Maksimal ball olimpiadaga biriktirilgan savollar yig'indisidan avtomatik hisoblanadi.
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setCreateModal(false)} className="btn-ghost flex-1 py-3 rounded-xl">Bekor qilish</button>
            <button onClick={createOlympiad} className="btn-primary flex-1 py-3 rounded-xl font-semibold">Saqlash</button>
          </div>
        </div>
      </Modal>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 glass-strong rounded-2xl px-5 py-3.5 border border-indigo-500/30 animate-in text-sm font-medium text-white">{toast}</div>
      )}
    </div>
  );
};

Object.assign(window, { TeacherDashboard });
