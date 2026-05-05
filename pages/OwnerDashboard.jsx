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

const OwnerDashboard = ({ user, onNavigate, onLogout, onOpenSwitcher, onUserUpdate }) => {
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
  const emptyCenterForm = {
    name: '',
    organizationType: "O'quv markaz",
    customOrganizationType: '',
    country: "O'zbekiston",
    region: '',
    district: '',
    subjects: [],
  };
  const [centerModal, setCenterModal] = React.useState(false);
  const [centerSaving, setCenterSaving] = React.useState(false);
  const [centerForm, setCenterForm] = React.useState(emptyCenterForm);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const ownerRole = user.roles?.owner;
  const ownerRoleCenters = Array.isArray(ownerRole?.centers) ? ownerRole.centers : [];
  const selectedCenterStorageKey = `olympy_owner_center_${user?.id || 'guest'}`;
  const defaultOwnerCenterId = ownerRole?.centerId || ownerRoleCenters.find(c => c.status === 'approved')?.centerId || ownerRoleCenters[0]?.centerId || null;
  const [selectedOwnerCenterId, setSelectedOwnerCenterId] = React.useState(() => {
    try { return localStorage.getItem(selectedCenterStorageKey) || defaultOwnerCenterId; } catch { return defaultOwnerCenterId; }
  });
  const ownerCenterId = selectedOwnerCenterId || defaultOwnerCenterId;
  const centerOrganizationTypes = typeof ORGANIZATION_TYPES !== 'undefined'
    ? ORGANIZATION_TYPES
    : ["O'quv markaz", 'Maktab', 'Universitet/Kollej', 'Tashkilot', 'Online academy', 'Boshqa'];
  const centerRegions = typeof UZBEKISTAN_REGIONS !== 'undefined' ? UZBEKISTAN_REGIONS : [];
  const centerDistricts = typeof UZBEKISTAN_DISTRICTS !== 'undefined' ? UZBEKISTAN_DISTRICTS : {};
  const centerDistrictOptions = centerDistricts[centerForm.region] || [];
  const selectedCenterType = centerForm.organizationType === 'Boshqa'
    ? centerForm.customOrganizationType.trim()
    : centerForm.organizationType;

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
    const refresh = () => loadPendingStaff().catch(err => {
      if (!cancelled) {
        console.warn('getPendingMemberships failed:', err);
        setPendingTeachers([]);
        setPendingManagers([]);
      }
    });
    refresh();
    // Avval owner pending arizalarni faqat sahifa qayta ochilganda olardi.
    // Endi ManagerDashboard kabi har 15 soniyada poll qilamiz, shunda yangi
    // o'qituvchi/manager arizalari real vaqtda chiqadi.
    const intervalId = (isApi && ownerCenterId) ? setInterval(refresh, 15000) : null;
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [loadPendingStaff, isApi, ownerCenterId]);

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
    () => isApi ? OlympyApi.getMyCenters(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  const apiOlympiadsRes = useApiData(
    () => isApi ? OlympyApi.getOlympiads(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  const apiCenters = isApi && Array.isArray(apiCentersRes.data) ? apiCentersRes.data.map(mapApiCenter) : null;
  const apiOlympiads = isApi && Array.isArray(apiOlympiadsRes.data) ? apiOlympiadsRes.data.map(mapApiOlympiad) : null;
  const roleOwnerCentersAsCenters = ownerRoleCenters.filter(c => c.centerId != null).map(c => ({
    id: String(c.centerId),
    backendId: c.centerId,
    name: c.centerName,
    organizationType: c.organizationType || "O'quv markaz",
    country: c.country || "O'zbekiston",
    region: c.region || '',
    district: c.district || '',
    city: c.city || c.district || c.region || '',
    status: c.status || 'pending',
    subjects: [],
    rating: 0,
    students: 0,
    olympiads: 0,
    createdAt: c.createdAt || '',
    _api: true,
  }));
  const baseCenters = isApi
    ? (apiCenters || roleOwnerCentersAsCenters)
    : store.centers.filter(c => c.ownerId === user.id || String(c.id) === String(defaultOwnerCenterId));
  const ownerCenters = baseCenters.slice().sort((a, b) => {
    const priority = { approved: 3, pending: 2, rejected: 1 };
    return (priority[b.status] || 0) - (priority[a.status] || 0) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
  const center = ownerCenterId ? baseCenters.find(c => String(c.id) === String(ownerCenterId)) : null;

  React.useEffect(() => {
    if (!ownerCenters.length) return;
    const exists = ownerCenterId && ownerCenters.some(c => String(c.id) === String(ownerCenterId));
    if (exists) return;
    const next = ownerCenters.find(c => c.status === 'approved') || ownerCenters[0];
    if (!next) return;
    setSelectedOwnerCenterId(String(next.id));
  }, [ownerCenters.map(c => `${c.id}:${c.status}`).join('|'), ownerCenterId]);

  React.useEffect(() => {
    if (!ownerCenterId) return;
    try { localStorage.setItem(selectedCenterStorageKey, String(ownerCenterId)); } catch {}
  }, [ownerCenterId, selectedCenterStorageKey]);

  if (!center || center.status !== 'approved') {
    const approvedFallback = ownerCenters.find(c => c.status === 'approved');
    return (
      <PendingAccessCard
        title={center?.status === 'rejected' ? 'Tashkilot arizasi rad etildi' : 'Tashkilot tasdig\'i kutilmoqda'}
        status={center?.status || 'pending'}
        message={
          center?.status === 'rejected'
            ? "Tashkilot ro'yxatdan o'tkazish arizangiz Platform Admin tomonidan rad etildi. Yangi ariza yuborish uchun support bilan bog'laning."
            : "Direktor paneliga kirish uchun Platform Admin tashkilotingizni tasdiqlashi kerak. Tasdiqlangach direktor paneli ochiladi."
        }
        extra={(
          <div className="space-y-3">
            {center && (
              <div className="glass rounded-2xl p-4 inline-flex items-center gap-3">
                <div className="w-10 h-10 gradient-bg rounded-xl flex items-center justify-center text-white font-bold">{center.name[0]}</div>
                <div className="text-left">
                  <div className="text-sm font-semibold text-white">{center.name}</div>
                  <div className="text-xs text-white/40">{center.organizationType || "O'quv markaz"} · {formatCenterLocation(center)}</div>
                </div>
                <span className={`chip ${center.status === 'rejected' ? 'badge-rejected' : 'badge-pending'}`}>
                  {statusLabel(center.status)}
                </span>
              </div>
            )}
            {ownerCenters.length > 1 && (
              <select value={ownerCenterId || ''} onChange={e => setSelectedOwnerCenterId(e.target.value)} className="input-field max-w-sm">
                {ownerCenters.map(c => <option key={c.id} value={c.id}>{c.name} — {statusLabel(c.status)}</option>)}
              </select>
            )}
            {approvedFallback && (
              <button onClick={() => setSelectedOwnerCenterId(String(approvedFallback.id))} className="btn-ghost px-4 py-2.5 rounded-xl text-sm font-bold">
                Tasdiqlangan tashkilotga qaytish
              </button>
            )}
          </div>
        )}
        onBack={() => {
          if (approvedFallback) setSelectedOwnerCenterId(String(approvedFallback.id));
          else onNavigate('landing');
        }}
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
  const centerOlympiads = isApi
    ? (apiOlympiads || []).filter(o => String(o.centerId) === String(center.id))
    : olympiadsForCenter(store, center.id);
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

  const openCenterModal = () => {
    setCenterForm(emptyCenterForm);
    setCenterModal(true);
  };

  const closeCenterModal = () => {
    if (centerSaving) return;
    setCenterModal(false);
    setCenterForm(emptyCenterForm);
  };

  const updateCenterForm = (key, value) => {
    setCenterForm(prev => ({ ...prev, [key]: value }));
  };

  const submitCenter = (event) => {
    event.preventDefault();
    const payload = {
      name: centerForm.name.trim(),
      organization_type: selectedCenterType || "O'quv markaz",
      country: centerForm.country || "O'zbekiston",
      region: centerForm.region,
      district: centerForm.district,
      city: centerForm.district || centerForm.region,
      subjects: centerForm.subjects || [],
    };
    if (!payload.name || !payload.region || !payload.district || !payload.organization_type) {
      showToast('Turi, manzil va nomini to‘liq kiriting');
      return;
    }
    if (isApi) {
      const token = OlympyApi.getToken();
      setCenterSaving(true);
      OlympyApi.registerCenter(payload, token)
        .then(() => {
          apiCentersRes.reload();
          return OlympyApi.getMe(token).then(me => {
            const mapped = OlympyApi.mapBackendUser(me);
            onUserUpdate?.(mapped);
          }).catch(() => null);
        })
        .then(() => {
          setCenterModal(false);
          setCenterForm(emptyCenterForm);
          showToast('Yangi tashkilot arizasi adminga yuborildi');
        })
        .catch(err => {
          console.warn('registerCenter failed:', err);
          showToast(OlympyApi.toUserMessage(err));
        })
        .finally(() => setCenterSaving(false));
      return;
    }
    try {
      const created = OlympyStore.createCenter({
        name: payload.name,
        organizationType: payload.organization_type,
        country: payload.country,
        region: payload.region,
        district: payload.district,
        city: payload.city,
        subjects: payload.subjects,
        ownerId: user.id,
      });
      OlympyStore.createRequest({ type: 'center', userId: user.id, centerId: created.id });
      setSelectedOwnerCenterId(created.id);
      setCenterModal(false);
      setCenterForm(emptyCenterForm);
      showToast('Yangi tashkilot arizasi adminga yuborildi');
    } catch (err) {
      showToast(err?.message || "Tashkilot yaratib bo'lmadi");
    }
  };

  const navItems = [
    { key: 'home', icon: 'home', label: 'Overview' },
    { key: 'requests', icon: 'bell', label: 'Arizalar', badge: pendingCount || undefined },
    { key: 'staff', icon: 'users', label: 'Xodimlar' },
    { key: 'olympiads', icon: 'trophy', label: 'Tadbirlar' },
    { key: 'center', icon: 'building', label: 'Profil' },
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
            <div className="truncate text-xs font-semibold text-slate-500">{center.organizationType || "O'quv markaz"} · Direktor paneli</div>
          </div>
        </button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map(item => (
          <OwnerSidebarItem key={item.key} item={item} active={page === item.key} onClick={() => { setPage(item.key); setMobileMenu(false); }} />
        ))}
      </nav>
      <div className="border-t border-slate-200 p-4">
        {ownerCenters.length > 1 && (
          <label className="mb-3 block">
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-400">Tashkilot</span>
            <select
              value={ownerCenterId || ''}
              onChange={e => { setSelectedOwnerCenterId(e.target.value); setPage('home'); }}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
            >
              {ownerCenters.map(c => (
                <option key={c.id} value={c.id}>{c.name} · {statusLabel(c.status)}</option>
              ))}
            </select>
          </label>
        )}
        <button onClick={openCenterModal} className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700">
          <Icon name="plus" size={14} /> Yangi tashkilot
        </button>
        <div className="mb-4 rounded-lg bg-emerald-50 p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-black text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Tashkilot faol
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
          <div className="text-xs font-semibold text-slate-500">{center.organizationType || "O'quv markaz"} · {formatCenterLocation(center)} · {ownerFormatDate(center.createdAt)}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {ownerCenters.length > 1 && (
          <select
            value={ownerCenterId || ''}
            onChange={e => { setSelectedOwnerCenterId(e.target.value); setPage('home'); }}
            className="hidden h-9 max-w-[220px] rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 outline-none hover:bg-slate-50 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 md:block"
          >
            {ownerCenters.map(c => (
              <option key={c.id} value={c.id}>{c.name} · {statusLabel(c.status)}</option>
            ))}
          </select>
        )}
        <button onClick={openCenterModal} className="hidden rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700 md:inline-flex">
          Yangi tashkilot
        </button>
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
              <OwnerStatusPill status="approved">Tasdiqlangan tashkilot</OwnerStatusPill>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-extrabold text-slate-500">{center.region || center.city}</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-extrabold text-slate-500">{center.organizationType || "O'quv markaz"}</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">{center.name}</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">
              Direktor paneli faqat shu tashkilotga tegishli xodimlar, arizalar va ko'rsatkichlarni boshqaradi.
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
                <span className="text-sm font-bold text-slate-700">Faol tadbirlar</span>
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
        <OwnerMetric label="Tadbirlar" value={centerOlympiads.length} hint={`${activeOlympiads.length} ta faol`} icon={<Icon name="trophy" size={18} />} tone="cyan" />
        <OwnerMetric label="Reyting" value={center.rating || '—'} hint="Tashkilot profili ko'rsatkichi" icon={<Icon name="star" size={18} />} tone="indigo" />
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
            <h2 className="text-base font-black text-slate-900">Tashkilot holati</h2>
            <OwnerStatusPill status={center.status} />
          </div>
          <div className="space-y-4">
            {[
              ['Profil', 100, '#10b981'],
              ['Xodimlar', Math.min(100, myStaff.length * 25), '#06b6d4'],
              ['Fanlar', Math.min(100, (center.subjects || []).length * 18), '#6366f1'],
              ['Olimpiadalar', Math.min(100, (centerOlympiads.length) * 20), '#f59e0b'],
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
          <p className="mt-1 text-sm font-semibold text-slate-500">Bu ro'yxat faqat {center.name} uchun.</p>
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
        <h1 className="text-2xl font-black tracking-tight text-slate-900">Tadbirlar</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">Direktor uchun tashkilotdagi olimpiada va musobaqalar ko'rinishi.</p>
      </div>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="bg-slate-50">
              <tr className="text-xs font-black uppercase text-slate-400">
                {['Nomi', 'Turi', 'Fan', 'Sana', 'Ishtirokchilar', 'Holat'].map(h => <th key={h} className="px-5 py-3">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {centerOlympiads.map(o => (
                <tr key={o.id} className="text-sm">
                  <td className="px-5 py-4 font-black text-slate-900">{o.title}</td>
                  <td className="px-5 py-4"><span className={`rounded-md px-2 py-1 text-xs font-black ${o.eventType === 'olympiad' ? 'bg-cyan-50 text-cyan-700' : 'bg-amber-50 text-amber-700'}`}>{eventTypeLabel(o.eventType || 'competition')}</span></td>
                  <td className="px-5 py-4"><span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700">{o.subject}</span></td>
                  <td className="px-5 py-4 text-slate-500">{o.startDate || '—'}</td>
                  <td className="px-5 py-4 font-bold text-slate-700">{o.participants || 0}</td>
                  <td className="px-5 py-4"><OwnerStatusPill status={o.status} /></td>
                </tr>
              ))}
              {centerOlympiads.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-sm font-bold text-slate-500">Hali tadbirlar yo'q</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  const renderCenter = () => (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">Tashkilot profili</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">O'z tashkilotingiz bo'yicha asosiy ma'lumotlar.</p>
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-2xl font-black text-white">{center.name[0]}</div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-black text-slate-900">{center.name}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{center.organizationType || "O'quv markaz"} · {formatCenterLocation(center)} · {ownerFormatDate(center.createdAt)}</p>
          </div>
          <OwnerStatusPill status={center.status} />
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <OwnerMetric label="O'quvchi" value={center.students || 0} icon={<Icon name="users" size={17} />} tone="emerald" />
          <OwnerMetric label="Tadbir" value={centerOlympiads.length} icon={<Icon name="trophy" size={17} />} tone="cyan" />
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
            <div className="mt-2 text-sm font-medium text-slate-500">Direktor faqat o'z tashkiloti ma'lumotlarini ko'radi.</div>
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
      {centerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4">
          <form onSubmit={submitCenter} className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">Yangi tashkilot qo'shish</h2>
                <div className="mt-1 text-xs font-bold text-slate-500">Ariza Platform Admin tasdig'iga yuboriladi</div>
              </div>
              <button type="button" onClick={closeCenterModal} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase text-slate-400">Tashkilot turi</span>
                <select
                  value={centerForm.organizationType}
                  onChange={e => setCenterForm(prev => ({
                    ...prev,
                    organizationType: e.target.value,
                    customOrganizationType: e.target.value === 'Boshqa' ? prev.customOrganizationType : '',
                  }))}
                  className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                >
                  {centerOrganizationTypes.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              {centerForm.organizationType === 'Boshqa' && (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase text-slate-400">Tashkilot turini yozing</span>
                  <input
                    value={centerForm.customOrganizationType}
                    onChange={e => updateCenterForm('customOrganizationType', e.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                    placeholder="Masalan, Respublika markazi"
                  />
                </label>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase text-slate-400">Davlat</span>
                  <select
                    value={centerForm.country}
                    onChange={e => updateCenterForm('country', e.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                  >
                    <option value="O'zbekiston">O'zbekiston</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase text-slate-400">Viloyat</span>
                  <select
                    value={centerForm.region}
                    onChange={e => setCenterForm(prev => ({ ...prev, region: e.target.value, district: '' }))}
                    className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                  >
                    <option value="">Viloyatni tanlang</option>
                    {centerRegions.map(region => <option key={region} value={region}>{region}</option>)}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase text-slate-400">Tuman/Shahar</span>
                <select
                  value={centerForm.district}
                  disabled={!centerForm.region}
                  onChange={e => updateCenterForm('district', e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">{centerForm.region ? 'Tumanni tanlang' : 'Avval viloyatni tanlang'}</option>
                  {centerDistrictOptions.map(district => <option key={district} value={district}>{district}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase text-slate-400">Tashkilot nomi</span>
                <input
                  value={centerForm.name}
                  onChange={e => updateCenterForm('name', e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                  placeholder="Masalan, ProSkill Language"
                  autoFocus
                />
              </label>
              <div>
                <span className="mb-2 block text-xs font-black uppercase text-slate-400">Yo'naltirilgan fanlar</span>
                <div className="flex flex-wrap gap-2">
                  {store.subjects.map(subject => {
                    const active = centerForm.subjects.includes(subject);
                    return (
                      <button
                        key={subject}
                        type="button"
                        onClick={() => setCenterForm(prev => ({
                          ...prev,
                          subjects: active ? prev.subjects.filter(s => s !== subject) : [...prev.subjects, subject],
                        }))}
                        className={`rounded-lg px-3 py-1.5 text-xs font-black ring-1 transition ${active ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-slate-50 text-slate-600 ring-slate-200 hover:bg-slate-100'}`}
                      >
                        {subject}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={closeCenterModal} className="flex-1 rounded-lg border border-slate-200 px-4 py-3 text-sm font-black text-slate-600 hover:bg-slate-50">
                Bekor qilish
              </button>
              <button disabled={centerSaving} className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
                {centerSaving ? 'Yuborilmoqda...' : 'Arizani yuborish'}
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
