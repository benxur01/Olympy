// pages/OwnerDashboard.jsx — Center director panel scoped to one center

const ownerFormatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric' });
};

const OwnerStatusPill = ({ status, children }) => {
  const map = {
    approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    pending: 'bg-amber-50 text-amber-700 ring-amber-200',
    rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
    active: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
    draft: 'bg-slate-100 text-slate-600 ring-slate-200',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold ring-1 ${map[status] || map.draft}`}>
      {children || statusLabel(status)}
    </span>
  );
};

const OwnerMetric = ({ label, value, hint, icon, tone = 'emerald' }) => {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700',
    cyan: 'bg-cyan-50 text-cyan-700',
    amber: 'bg-amber-50 text-amber-700',
    indigo: 'bg-indigo-50 text-indigo-700',
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="text-[12px] font-extrabold text-slate-500">{label}</div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone] || tones.emerald}`}>{icon}</div>
      </div>
      <div className="text-2xl font-black tracking-tight text-slate-900">{value}</div>
      {hint && <div className="mt-2 text-[11px] font-semibold text-slate-500">{hint}</div>}
    </div>
  );
};

const OwnerSidebarItem = ({ item, active, onClick }) => (
  <button
    onClick={onClick}
    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-bold transition ${
      active ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-950/20' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
    }`}
  >
    <Icon name={item.icon} size={16} />
    <span className="flex-1">{item.label}</span>
    {item.badge && (
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${active ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'}`}>
        {item.badge}
      </span>
    )}
  </button>
);

const OwnerDashboard = ({ user, onNavigate, onLogout, onOpenSwitcher }) => {
  const store = useStore();
  const isApi = !!user?._api;
  const [page, setPage] = React.useState('home');
  const [mobileMenu, setMobileMenu] = React.useState(false);
  const [toast, setToast] = React.useState('');
  const [pendingTeachers, setPendingTeachers] = React.useState([]);
  const [pendingManagers, setPendingManagers] = React.useState([]);
  const [apiStaff, setApiStaff] = React.useState([]);
  const [createdStaff, setCreatedStaff] = React.useState([]);
  const [staffModal, setStaffModal] = React.useState(false);
  const [staffRole, setStaffRole] = React.useState('manager');
  const [staffSaving, setStaffSaving] = React.useState(false);
  const emptyStaffForm = { full_name: '', phone: '+998', password: '', subject: '' };
  const [staffForm, setStaffForm] = React.useState(emptyStaffForm);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const ownerRole = user.roles?.owner;
  const ownerCenterId = ownerRole?.centerId || null;

  const loadPendingStaff = React.useCallback(() => {
    if (!isApi || !ownerCenterId) {
      setPendingTeachers([]);
      setPendingManagers([]);
      return Promise.resolve();
    }
    const token = OlympyApi.getToken();
    return Promise.all([
      OlympyApi.getPendingMemberships(ownerCenterId, 'teacher', token),
      OlympyApi.getPendingMemberships(ownerCenterId, 'manager', token),
    ]).then(([teachers, managers]) => {
      setPendingTeachers(Array.isArray(teachers) ? teachers : []);
      setPendingManagers(Array.isArray(managers) ? managers : []);
    });
  }, [isApi, ownerCenterId]);

  React.useEffect(() => {
    let cancelled = false;
    loadPendingStaff().catch(err => {
      if (!cancelled) {
        console.warn('getPendingMemberships failed:', err);
        setPendingTeachers([]);
        setPendingManagers([]);
      }
    });
    return () => { cancelled = true; };
  }, [loadPendingStaff]);

  const loadApiStaff = React.useCallback(() => {
    if (!isApi || !ownerCenterId) {
      setApiStaff([]);
      return Promise.resolve();
    }
    const token = OlympyApi.getToken();
    return OlympyApi.getStaffMemberships(ownerCenterId, null, token)
      .then(rows => setApiStaff(Array.isArray(rows) ? rows : []));
  }, [isApi, ownerCenterId]);

  React.useEffect(() => {
    let cancelled = false;
    loadApiStaff().catch(err => {
      if (!cancelled) {
        console.warn('getStaffMemberships failed:', err);
        setApiStaff([]);
      }
    });
    return () => { cancelled = true; };
  }, [loadApiStaff]);

  const apiCentersRes = useApiData(
    () => isApi ? OlympyApi.getCenters() : Promise.resolve(null),
    [isApi],
  );
  const apiCenters = isApi && Array.isArray(apiCentersRes.data) ? apiCentersRes.data.map(mapApiCenter) : null;
  const baseCenters = isApi ? (apiCenters || []) : store.centers;
  const center = ownerCenterId ? baseCenters.find(c => String(c.id) === String(ownerCenterId)) : null;

  if (!center || center.status !== 'approved') {
    return (
      <PendingAccessCard
        title={center?.status === 'rejected' ? 'Markaz arizasi rad etildi' : 'Markaz tasdig\'i kutilmoqda'}
        status={center?.status || 'pending'}
        message={
          center?.status === 'rejected'
            ? "Markaz ro'yxatdan o'tkazish arizangiz Platform Admin tomonidan rad etildi. Yangi ariza yuborish uchun support bilan bog'laning."
            : "Direktor paneliga kirish uchun Platform Admin markazingizni tasdiqlashi kerak. Tasdiqlangach direktor paneli ochiladi."
        }
        extra={center && (
          <div className="glass rounded-2xl p-4 inline-flex items-center gap-3">
            <div className="w-10 h-10 gradient-bg rounded-xl flex items-center justify-center text-white font-bold">{center.name[0]}</div>
            <div className="text-left">
              <div className="text-sm font-semibold text-white">{center.name}</div>
              <div className="text-xs text-white/40">{center.city}</div>
            </div>
            <span className={`chip ${center.status === 'rejected' ? 'badge-rejected' : 'badge-pending'}`}>
              {statusLabel(center.status)}
            </span>
          </div>
        )}
        onBack={() => onNavigate('landing')}
      />
    );
  }

  const apiStaffRequests = [
    ...pendingManagers.map(m => ({
      id: `api:manager:${m.membership_id}`,
      type: 'manager',
      status: 'pending',
      date: (m.created_at || '').slice(0, 10),
      membership_id: m.membership_id,
      user: m.user,
      _api: true,
    })),
    ...pendingTeachers.map(m => ({
      id: `api:teacher:${m.membership_id}`,
      type: 'teacher',
      status: 'pending',
      subject: m.subject,
      date: (m.created_at || '').slice(0, 10),
      membership_id: m.membership_id,
      user: m.user,
      _api: true,
    })),
  ];
  const centerRequests = isApi ? apiStaffRequests : store.requests.filter(r => r.centerId === center.id);
  const pendingManagerReqs = centerRequests.filter(r => r.type === 'manager' && r.status === 'pending');
  const pendingTeacherReqs = centerRequests.filter(r => r.type === 'teacher' && r.status === 'pending');
  const pendingCount = pendingManagerReqs.length + pendingTeacherReqs.length;

  const apiStaffRows = apiStaff.map(m => ({
    id: `api:${m.role}:${m.membership_id}`,
    centerId: String(center.id),
    name: m.user?.full_name || m.user?.name || '—',
    phone: m.user?.normalized_phone || m.user?.phone || '—',
    role: m.role,
    subject: m.subject || '',
    status: m.status || 'approved',
    _api: true,
  }));
  const localApiStaff = createdStaff.filter(m => String(m.centerId) === String(center.id));
  const mockStaffRows = store.users
    .filter(u =>
      (u.roles?.manager?.status === 'approved' && u.roles.manager.centerId === center.id) ||
      (u.roles?.teacher?.status === 'approved' && u.roles.teacher.centerId === center.id)
    )
    .map(u => {
      const isManager = u.roles?.manager?.status === 'approved' && u.roles.manager.centerId === center.id;
      return {
        id: u.id,
        centerId: center.id,
        name: u.name,
        phone: u.phone,
        role: isManager ? 'manager' : 'teacher',
        subject: u.roles?.teacher?.subject || '',
        status: 'approved',
      };
    });
  const myStaff = isApi
    ? [
        ...apiStaffRows,
        ...localApiStaff.filter(m => !apiStaffRows.some(row => row.phone === m.phone)),
      ]
    : mockStaffRows;
  const centerOlympiads = isApi ? [] : olympiadsForCenter(store, center.id);
  const activeOlympiads = centerOlympiads.filter(o => o.status === 'active');

  const requestUser = (req) => req?._api
    ? {
        name: req.user?.full_name || req.user?.name || '—',
        phone: req.user?.normalized_phone || req.user?.phone || '—',
      }
    : store.users.find(x => x.id === req.userId);

  const callApiApproval = (req, decision) => {
    const token = OlympyApi.getToken();
    const backendCenterId = center?.backendId ?? center?.id;
    const membershipId = req?.membership_id ?? req?.membershipId ?? req?.backendId;
    if (!membershipId || !backendCenterId) return Promise.reject(new Error('membership_id missing'));
    const fn = req.type === 'manager' ? OlympyApi.approveManager : OlympyApi.approveTeacher;
    return fn(backendCenterId, { membership_id: membershipId, decision }, token);
  };

  const approve = (id) => {
    if (isApi) {
      const req = centerRequests.find(r => r.id === id);
      if (!req) { showToast('Ariza topilmadi'); return; }
      callApiApproval(req, 'approved')
        .then(() => loadPendingStaff())
        .then(() => showToast('Ariza tasdiqlandi'))
        .catch(err => { console.warn('approve failed:', err); showToast("Tasdiqlab bo'lmadi"); });
      return;
    }
    OlympyStore.approveRequest(id);
    showToast('Ariza tasdiqlandi');
  };

  const reject = (id) => {
    if (isApi) {
      const req = centerRequests.find(r => r.id === id);
      if (!req) { showToast('Ariza topilmadi'); return; }
      callApiApproval(req, 'rejected')
        .then(() => loadPendingStaff())
        .then(() => showToast('Ariza rad etildi'))
        .catch(err => { console.warn('reject failed:', err); showToast("Rad etib bo'lmadi"); });
      return;
    }
    OlympyStore.rejectRequest(id);
    showToast('Ariza rad etildi');
  };

  const openStaffModal = (role = 'manager') => {
    setStaffRole(role);
    setStaffForm(emptyStaffForm);
    setStaffModal(true);
  };

  const closeStaffModal = () => {
    if (staffSaving) return;
    setStaffModal(false);
    setStaffForm(emptyStaffForm);
  };

  const updateStaffForm = (key, value) => {
    setStaffForm(prev => ({ ...prev, [key]: value }));
  };

  const submitStaff = (event) => {
    event.preventDefault();
    const payload = {
      full_name: staffForm.full_name.trim(),
      phone: staffForm.phone.trim(),
      password: staffForm.password,
      subject: staffForm.subject.trim(),
    };
    const normalizedPhone = OlympyStore.normalizePhone(payload.phone);
    if (!payload.full_name || !normalizedPhone || payload.password.length < 6) {
      showToast("Ism, telefon va kamida 6 belgili parol kiriting");
      return;
    }
    payload.phone = normalizedPhone;
    if (isApi) {
      const token = OlympyApi.getToken();
      const backendCenterId = center?.backendId ?? center?.id;
      const createFn = staffRole === 'teacher' ? OlympyApi.createTeacher : OlympyApi.createManager;
      setStaffSaving(true);
      createFn(backendCenterId, payload, token)
        .then(res => {
          const apiUser = res?.user || {};
          setCreatedStaff(prev => [{
            id: `api:${staffRole}:${res?.membership?.id || apiUser.id || Date.now()}`,
            centerId: String(center.id),
            name: apiUser.full_name || payload.full_name,
            phone: apiUser.normalized_phone || apiUser.phone || payload.phone,
            role: staffRole,
            subject: staffRole === 'teacher' ? payload.subject : '',
            status: 'approved',
            _api: true,
          }, ...prev]);
          loadApiStaff().catch(err => console.warn('refresh staff failed:', err));
          setStaffModal(false);
          setStaffForm(emptyStaffForm);
          showToast(staffRole === 'teacher' ? 'Ustoz login/paroli yaratildi' : 'Menejer login/paroli yaratildi');
        })
        .catch(err => {
          console.warn('create staff failed:', err);
          showToast(OlympyApi.toUserMessage(err));
        })
        .finally(() => setStaffSaving(false));
      return;
    }
    try {
      const created = OlympyStore.createUser({
        name: payload.full_name,
        phone: payload.phone,
        password: payload.password,
      });
      OlympyStore.setRole(created.id, staffRole, {
        status: 'approved',
        centerId: center.id,
        ...(staffRole === 'teacher' ? { subject: payload.subject } : {}),
      });
      OlympyStore.setActiveRole(created.id, staffRole);
      setStaffModal(false);
      setStaffForm(emptyStaffForm);
      showToast(staffRole === 'teacher' ? 'Ustoz login/paroli yaratildi' : 'Menejer login/paroli yaratildi');
    } catch (err) {
      showToast(err?.message || "Xodim yaratib bo'lmadi");
    }
  };

  const navItems = [
    { key: 'home', icon: 'home', label: 'Overview' },
    { key: 'requests', icon: 'bell', label: 'Arizalar', badge: pendingCount || undefined },
    { key: 'staff', icon: 'users', label: 'Xodimlar' },
    { key: 'olympiads', icon: 'trophy', label: 'Olimpiadalar' },
    { key: 'center', icon: 'building', label: 'Markaz profili' },
    { key: 'settings', icon: 'settings', label: 'Sozlamalar' },
  ];

  const requestRows = centerRequests.filter(r => r.type === 'manager' || r.type === 'teacher');
  const recentRequests = requestRows.filter(r => r.status === 'pending').slice(0, 4);

  const Sidebar = () => (
    <aside className={`${mobileMenu ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-slate-200 bg-white shadow-2xl transition-transform duration-200 lg:static lg:translate-x-0 lg:shadow-none`}>
      <div className="border-b border-slate-200 px-5 py-5">
        <button onClick={() => onNavigate('landing')} className="flex items-center gap-3 text-left">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-lg font-black text-white">{center.name[0]}</div>
          <div className="min-w-0">
            <div className="truncate text-sm font-black text-slate-900">{center.name}</div>
            <div className="truncate text-xs font-semibold text-slate-500">Direktor paneli</div>
          </div>
        </button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map(item => (
          <OwnerSidebarItem key={item.key} item={item} active={page === item.key} onClick={() => { setPage(item.key); setMobileMenu(false); }} />
        ))}
      </nav>
      <div className="border-t border-slate-200 p-4">
        <div className="mb-4 rounded-lg bg-emerald-50 p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-black text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Markaz faol
          </div>
          <div className="text-[11px] font-semibold leading-relaxed text-emerald-700/70">
            Faqat {center.name} ma'lumotlari ko'rsatiladi.
          </div>
        </div>
        <button onClick={onLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-900">
          <Icon name="logout" size={16} /> Chiqish
        </button>
      </div>
    </aside>
  );

  const Topbar = () => (
    <header className="sticky top-0 z-30 flex h-[62px] items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:px-6">
      <div className="flex items-center gap-3">
        <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setMobileMenu(true)}>
          <Icon name="menu" size={20} />
        </button>
        <div>
          <div className="text-base font-black text-slate-900">{navItems.find(n => n.key === page)?.label || 'Overview'}</div>
          <div className="text-xs font-semibold text-slate-500">{center.city} · {ownerFormatDate(center.createdAt)}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {onOpenSwitcher && (
          <button onClick={onOpenSwitcher} className="hidden rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 md:inline-flex">
            Rolni almashtirish
          </button>
        )}
        <button onClick={() => setPage('requests')} className="relative rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
          <Icon name="bell" size={18} />
          {pendingCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-black text-white">{pendingCount}</span>
          )}
        </button>
        <div className="ml-2 flex items-center gap-2">
          <Avatar name={user?.name || 'Director'} size={32} gradient="from-emerald-600 to-cyan-600" />
          <div className="hidden text-right sm:block">
            <div className="text-xs font-black text-slate-900">{user?.name || 'Direktor'}</div>
            <div className="text-[11px] font-semibold text-slate-500">Direktor</div>
          </div>
        </div>
      </div>
    </header>
  );

  const RequestCard = ({ req }) => {
    const u = requestUser(req);
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <Avatar name={u?.name || '?'} size={38} gradient={req.type === 'manager' ? 'from-indigo-600 to-cyan-600' : 'from-emerald-600 to-teal-600'} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate text-sm font-black text-slate-900">{u?.name || 'Noma\'lum'}</div>
              <OwnerStatusPill status={req.status} />
            </div>
            <div className="mt-1 text-xs font-semibold text-slate-500">
              {req.type === 'manager' ? 'Manager arizasi' : `O'qituvchi arizasi${req.subject ? ` · ${req.subject}` : ''}`}
            </div>
            <div className="mt-1 text-[11px] font-medium text-slate-400">{u?.phone || '—'} · {ownerFormatDate(req.date)}</div>
          </div>
          {req.status === 'pending' && (
            <div className="flex shrink-0 gap-2">
              <button onClick={() => approve(req.id)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700">Qabul</button>
              <button onClick={() => reject(req.id)} className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100">Rad</button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderHome = () => (
    <div className="space-y-5 p-4 lg:p-6">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[1.25fr_.75fr]">
          <div className="p-6">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <OwnerStatusPill status="approved">Tasdiqlangan markaz</OwnerStatusPill>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-extrabold text-slate-500">{center.city}</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">{center.name}</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">
              Direktor paneli faqat shu markazga tegishli xodimlar, arizalar va ko'rsatkichlarni boshqaradi.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {(center.subjects || []).slice(0, 6).map(s => (
                <span key={s} className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700 ring-1 ring-emerald-100">{s}</span>
              ))}
              {(!center.subjects || center.subjects.length === 0) && <span className="text-xs font-semibold text-slate-400">Fanlar kiritilmagan</span>}
            </div>
          </div>
          <div className="border-t border-slate-200 bg-slate-50 p-6 lg:border-l lg:border-t-0">
            <div className="text-xs font-black uppercase tracking-wide text-slate-400">Bugungi vazifalar</div>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-white p-3 ring-1 ring-slate-200">
                <span className="text-sm font-bold text-slate-700">Xodim arizalari</span>
                <span className="text-lg font-black text-amber-600">{pendingCount}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white p-3 ring-1 ring-slate-200">
                <span className="text-sm font-bold text-slate-700">Faol olimpiadalar</span>
                <span className="text-lg font-black text-cyan-700">{activeOlympiads.length}</span>
              </div>
              <button onClick={() => setPage('requests')} className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700">
                Arizalarni ko'rish
              </button>
              <div className="grid gap-2 sm:grid-cols-2">
                <button onClick={() => openStaffModal('manager')} className="rounded-lg border border-emerald-200 bg-white px-4 py-3 text-sm font-black text-emerald-700 hover:bg-emerald-50">
                  Menejer yaratish
                </button>
                <button onClick={() => openStaffModal('teacher')} className="rounded-lg border border-cyan-200 bg-white px-4 py-3 text-sm font-black text-cyan-700 hover:bg-cyan-50">
                  Ustoz yaratish
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OwnerMetric label="Xodimlar" value={myStaff.length} hint="Tasdiqlangan manager/o'qituvchi" icon={<Icon name="users" size={18} />} tone="emerald" />
        <OwnerMetric label="Kutilayotgan arizalar" value={pendingCount} hint={pendingCount ? 'Qaror kutilmoqda' : 'Navbat bo\'sh'} icon={<Icon name="bell" size={18} />} tone="amber" />
        <OwnerMetric label="Olimpiadalar" value={center.olympiads || centerOlympiads.length} hint={`${activeOlympiads.length} ta faol`} icon={<Icon name="trophy" size={18} />} tone="cyan" />
        <OwnerMetric label="Reyting" value={center.rating || '—'} hint="Markaz profili ko'rsatkichi" icon={<Icon name="star" size={18} />} tone="indigo" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-slate-900">Kutilayotgan xodim arizalari</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">Manager va o'qituvchi arizalarini shu yerdan tasdiqlang.</p>
            </div>
            <button onClick={() => setPage('requests')} className="text-xs font-black text-emerald-700">Barchasi</button>
          </div>
          <div className="space-y-3">
            {recentRequests.map(r => <RequestCard key={r.id} req={r} />)}
            {recentRequests.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center">
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <Icon name="check" size={20} />
                </div>
                <div className="text-sm font-black text-slate-700">Hozircha yangi ariza yo'q</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">Yangi xodim arizalari kelganda shu yerda chiqadi.</div>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-black text-slate-900">Markaz holati</h2>
            <OwnerStatusPill status={center.status} />
          </div>
          <div className="space-y-4">
            {[
              ['Profil', 100, '#10b981'],
              ['Xodimlar', Math.min(100, myStaff.length * 25), '#06b6d4'],
              ['Fanlar', Math.min(100, (center.subjects || []).length * 18), '#6366f1'],
              ['Olimpiadalar', Math.min(100, (center.olympiads || centerOlympiads.length) * 20), '#f59e0b'],
            ].map(row => (
              <div key={row[0]}>
                <div className="mb-1 flex justify-between text-xs font-bold">
                  <span className="text-slate-500">{row[0]}</span>
                  <span style={{ color: row[2] }}>{row[1]}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${row[1]}%`, background: row[2] }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );

  const renderRequests = () => (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Xodim arizalari</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">Bu ro'yxat faqat {center.name} markazi uchun.</p>
        </div>
        <OwnerStatusPill status="pending">{pendingCount} ta kutilmoqda</OwnerStatusPill>
      </div>
      <div className="grid gap-3">
        {requestRows.map(r => <RequestCard key={r.id} req={r} />)}
        {requestRows.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-16 text-center text-sm font-bold text-slate-500 shadow-sm">
            Arizalar yo'q
          </div>
        )}
      </div>
    </div>
  );

  const renderStaff = () => (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Xodimlar</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">Tasdiqlangan manager va o'qituvchilar.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button onClick={() => openStaffModal('manager')} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-emerald-700">
            <Icon name="plus" size={16} /> Menejer yaratish
          </button>
          <button onClick={() => openStaffModal('teacher')} className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-cyan-700">
            <Icon name="plus" size={16} /> Ustoz yaratish
          </button>
        </div>
      </div>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-slate-50">
              <tr className="text-xs font-black uppercase text-slate-400">
                {['Ism', 'Telefon', 'Rol', 'Fan', 'Holat'].map(h => <th key={h} className="px-5 py-3">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {myStaff.map(row => (
                <tr key={row.id} className="text-sm">
                  <td className="px-5 py-4"><div className="flex items-center gap-3"><Avatar name={row.name} size={34} /><span className="font-black text-slate-900">{row.name}</span></div></td>
                  <td className="px-5 py-4 font-mono text-xs text-slate-500">{String(row.phone || '').replace(/(\+998\d{2})\d{3}(\d{4})/, '$1***$2')}</td>
                  <td className="px-5 py-4"><span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">{row.role === 'manager' ? 'Manager' : "O'qituvchi"}</span></td>
                  <td className="px-5 py-4 text-slate-500">{row.subject || '—'}</td>
                  <td className="px-5 py-4"><OwnerStatusPill status={row.status || 'approved'} /></td>
                </tr>
              ))}
              {myStaff.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-sm font-bold text-slate-500">Hali tasdiqlangan xodimlar yo'q</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  const renderOlympiads = () => (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">Olimpiadalar</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">Direktor uchun markazdagi olimpiadalar ko'rinishi.</p>
      </div>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="bg-slate-50">
              <tr className="text-xs font-black uppercase text-slate-400">
                {['Nomi', 'Fan', 'Sana', 'Ishtirokchilar', 'Holat'].map(h => <th key={h} className="px-5 py-3">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {centerOlympiads.map(o => (
                <tr key={o.id} className="text-sm">
                  <td className="px-5 py-4 font-black text-slate-900">{o.title}</td>
                  <td className="px-5 py-4"><span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700">{o.subject}</span></td>
                  <td className="px-5 py-4 text-slate-500">{o.startDate || '—'}</td>
                  <td className="px-5 py-4 font-bold text-slate-700">{o.participants || 0}</td>
                  <td className="px-5 py-4"><OwnerStatusPill status={o.status} /></td>
                </tr>
              ))}
              {centerOlympiads.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-sm font-bold text-slate-500">Hali olimpiadalar yo'q</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  const renderCenter = () => (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">Markaz profili</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">O'z markazingiz bo'yicha asosiy ma'lumotlar.</p>
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-2xl font-black text-white">{center.name[0]}</div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-black text-slate-900">{center.name}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{center.city} · {ownerFormatDate(center.createdAt)}</p>
          </div>
          <OwnerStatusPill status={center.status} />
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <OwnerMetric label="O'quvchi" value={center.students || 0} icon={<Icon name="users" size={17} />} tone="emerald" />
          <OwnerMetric label="Olimpiada" value={center.olympiads || centerOlympiads.length} icon={<Icon name="trophy" size={17} />} tone="cyan" />
          <OwnerMetric label="Xodim" value={myStaff.length} icon={<Icon name="shield" size={17} />} tone="indigo" />
          <OwnerMetric label="Reyting" value={center.rating || '—'} icon={<Icon name="star" size={17} />} tone="amber" />
        </div>
        <div className="mt-6">
          <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Yo'naltirilgan fanlar</div>
          <div className="flex flex-wrap gap-2">
            {(center.subjects || []).map(s => <span key={s} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">{s}</span>)}
            {(!center.subjects || center.subjects.length === 0) && <span className="text-sm font-semibold text-slate-400">Fanlar kiritilmagan</span>}
          </div>
        </div>
      </section>
    </div>
  );

  const renderSettings = () => (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">Sozlamalar</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">Direktor paneli sozlamalari.</p>
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="text-sm font-black text-slate-900">Scope</div>
            <div className="mt-2 text-sm font-medium text-slate-500">Direktor faqat o'z markazi ma'lumotlarini ko'radi.</div>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="text-sm font-black text-slate-900">Xodim tasdig'i</div>
            <div className="mt-2 text-sm font-medium text-slate-500">Manager va o'qituvchi arizalari direktor qarori bilan yakunlanadi.</div>
          </div>
        </div>
      </section>
    </div>
  );

  const pagesMap = {
    home: renderHome,
    requests: renderRequests,
    staff: renderStaff,
    olympiads: renderOlympiads,
    center: renderCenter,
    settings: renderSettings,
  };

  return (
    <div className="h-screen overflow-hidden bg-[#eef3f8] text-slate-900">
      {mobileMenu && <div className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" onClick={() => setMobileMenu(false)} />}
      <div className="flex h-full">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 overflow-y-auto">
            {(pagesMap[page] || renderHome)()}
          </main>
        </div>
      </div>
      {staffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <form onSubmit={submitStaff} className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">{staffRole === 'teacher' ? 'Ustoz yaratish' : 'Menejer yaratish'}</h2>
                <div className="mt-1 text-xs font-bold text-slate-500">{center.name}</div>
              </div>
              <button type="button" onClick={closeStaffModal} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase text-slate-400">Ism familiya</span>
                <input
                  value={staffForm.full_name}
                  onChange={e => updateStaffForm('full_name', e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                  placeholder="Masalan, Aziz Karimov"
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase text-slate-400">Telefon login</span>
                <input
                  value={staffForm.phone}
                  onChange={e => updateStaffForm('phone', formatUzPhoneInput(e.target.value))}
                  onFocus={e => updateStaffForm('phone', formatUzPhoneInput(e.target.value))}
                  className="h-11 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm font-semibold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                  placeholder="+998901112233"
                  inputMode="numeric"
                  maxLength={13}
                  type="tel"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase text-slate-400">Parol</span>
                <input
                  value={staffForm.password}
                  onChange={e => updateStaffForm('password', e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                  placeholder="Kamida 6 belgi"
                  type="text"
                />
              </label>
              {staffRole === 'teacher' && (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase text-slate-400">Fan</span>
                  <select
                    value={staffForm.subject}
                    onChange={e => updateStaffForm('subject', e.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                  >
                    <option value="">Fan tanlanmagan</option>
                    {store.subjects.map(subject => <option key={subject} value={subject}>{subject}</option>)}
                  </select>
                </label>
              )}
            </div>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={closeStaffModal} className="flex-1 rounded-lg border border-slate-200 px-4 py-3 text-sm font-black text-slate-600 hover:bg-slate-50">
                Bekor qilish
              </button>
              <button disabled={staffSaving} className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
                {staffSaving ? 'Yaratilmoqda...' : 'Yaratish'}
              </button>
            </div>
          </form>
        </div>
      )}
      {toast && <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-xl">{toast}</div>}
    </div>
  );
};

Object.assign(window, { OwnerDashboard });
